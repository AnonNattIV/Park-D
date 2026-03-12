import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import { verifyToken } from '@/lib/auth';
import getPool from '@/lib/db/mysql';
import { runBookingCheckoutAutomation } from '@/lib/booking-checkout';

export const dynamic = 'force-dynamic';

type TokenPayload = {
  userId?: string;
  role?: string;
};

interface BookingDetailRow extends RowDataPacket {
  b_id: number;
  user_id: number;
  owner_user_id: number;
  lot_id: number;
  lot_name: string | null;
  location: string;
  price: number | string;
  plate_id: string;
  booking_time: Date | string;
  checkin_datetime: Date | string | null;
  checkin_proof: string | null;
  checkout_datetime: Date | string | null;
  b_status: string;
  total_time_minutes: number | null;
  pay_id: number | null;
  pay_status: string | null;
  pay_method: string | null;
  pay_amount: number | string | null;
  paid_at: Date | string | null;
  proof_image_url: string | null;
  is_checkin_window: number | string;
  is_checkout_window: number | string;
  has_checkin_proof: number | string;
  is_cancel_window: number | string;
  is_payment_grace_cancel_window: number | string;
}

function parseBookingId(rawId: string): number | null {
  const parsedId = Number(rawId);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    return null;
  }

  return parsedId;
}

function readRequester(request: NextRequest): { userId: number; role: string } | null {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();
  if (!token) {
    return null;
  }

  const payload = verifyToken(token) as TokenPayload | null;
  const userId = Number(payload?.userId);
  const role = payload?.role?.toLowerCase() || '';

  if (!payload || !Number.isInteger(userId) || userId <= 0) {
    return null;
  }

  return { userId, role };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const requester = readRequester(request);
    if (!requester) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const bookingId = parseBookingId(params.id);
    if (!bookingId) {
      return NextResponse.json({ error: 'Invalid booking id' }, { status: 400 });
    }

    try {
      await runBookingCheckoutAutomation();
    } catch (automationError) {
      console.error('Unable to run booking checkout automation:', automationError);
    }

    const pool = getPool();
    await pool.query(
      `CREATE TABLE IF NOT EXISTS payment_proofs (
        pay_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
        proof_image_url VARCHAR(1024) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_payment_proofs_payment
          FOREIGN KEY (pay_id) REFERENCES payments(pay_id)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );

    const [rows] = await pool.query<BookingDetailRow[]>(
      `SELECT
        b.b_id,
        b.user_id,
        pl.owner_user_id,
        b.lot_id,
        pl.lot_name,
        pl.location,
        pl.price,
        b.plate_id,
        b.booking_time,
        b.checkin_datetime,
        b.checkin_proof,
        b.checkout_datetime,
        b.b_status,
        b.total_time_minutes,
        p.pay_id,
        p.pay_status,
        p.pay_method,
        p.pay_amount,
        p.paid_at,
        pp.proof_image_url,
        CASE
          WHEN b.checkin_datetime IS NOT NULL
           AND b.checkout_datetime IS NOT NULL
           AND CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00') >= b.checkin_datetime
           AND CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00') < b.checkout_datetime
          THEN 1 ELSE 0
        END AS is_checkin_window,
        CASE
          WHEN b.checkout_datetime IS NOT NULL
           AND CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00') >= b.checkout_datetime
          THEN 1 ELSE 0
        END AS is_checkout_window,
        CASE WHEN b.checkin_proof IS NULL THEN 0 ELSE 1 END AS has_checkin_proof,
        CASE
          WHEN b.b_status NOT IN ('CANCELLED', 'CHECKOUT_APPROVED')
           AND b.checkin_datetime IS NOT NULL
           AND b.checkin_proof IS NULL
           AND CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00') <= DATE_SUB(b.checkin_datetime, INTERVAL 1 DAY)
          THEN 1 ELSE 0
        END AS is_cancel_window,
        CASE
          WHEN b.b_status NOT IN ('CANCELLED', 'CHECKOUT_APPROVED')
           AND b.checkin_proof IS NULL
           AND p.pay_status = 'PAID'
           AND p.paid_at IS NOT NULL
           AND CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00') <= DATE_ADD(p.paid_at, INTERVAL 10 MINUTE)
          THEN 1 ELSE 0
        END AS is_payment_grace_cancel_window
      FROM bookings b
      INNER JOIN parking_lots pl ON pl.lot_id = b.lot_id
      LEFT JOIN payments p ON p.b_id = b.b_id
      LEFT JOIN payment_proofs pp ON pp.pay_id = p.pay_id
      WHERE b.b_id = ?
      LIMIT 1`,
      [bookingId]
    );

    const [reviewRows] = await pool.query<RowDataPacket[]>(
      `SELECT score, comment, created_at, TIMESTAMPDIFF(MINUTE, created_at, NOW()) as diff_minutes 
       FROM reviews WHERE b_id = ? LIMIT 1`,
      [bookingId] // หรือตัวแปร id ของการจองที่คุณใช้
    );

    const reviewData = reviewRows.length > 0 ? {
      score: reviewRows[0].score,
      comment: reviewRows[0].comment,
      createdAt: reviewRows[0].created_at,
      diffMinutes: reviewRows[0].diff_minutes
    } : null;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const row = rows[0];
    const isRenter = Number(row.user_id) === requester.userId;
    const isOwner = Number(row.owner_user_id) === requester.userId;
    const isAdmin = requester.role === 'admin';

    if (!isRenter && !isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const estimatedRent =
      row.total_time_minutes === null
        ? null
        : Number((((row.total_time_minutes || 0) / 60) * Number(row.price || 0)).toFixed(2));

    return NextResponse.json({
      success: true,
      booking: {
        id: row.b_id,
        lot: {
          id: row.lot_id,
          name: row.lot_name?.trim() || row.location,
          location: row.location,
          price: Number(row.price || 0),
        },
        plateId: row.plate_id,
        bookingTime: row.booking_time,
        checkinTime: row.checkin_datetime,
        checkoutTime: row.checkout_datetime,
        checkinProof: row.checkin_proof,
        status: row.b_status,
        totalMinutes: row.total_time_minutes,
        estimatedRent,
        timeFlags: {
          isCheckinWindow: Number(row.is_checkin_window) === 1,
          isCheckoutWindow: Number(row.is_checkout_window) === 1,
          hasCheckinProof: Number(row.has_checkin_proof) === 1,
          canCancelBeforeReservation: Number(row.is_cancel_window) === 1,
          canCancelAfterPaymentSuccess: Number(row.is_payment_grace_cancel_window) === 1,
        },
        payment: row.pay_id
          ? {
              id: row.pay_id,
              status: row.pay_status,
              method: row.pay_method,
              amount: row.pay_amount === null ? 0 : Number(row.pay_amount),
              paidAt: row.paid_at,
              proofUrl: row.proof_image_url,
            }
          : null,
        review: reviewData,
      },
    });
  } catch (error) {
    console.error('Unable to load booking detail:', error);
    return NextResponse.json(
      { error: 'Unable to load booking detail right now' },
      { status: 500 }
    );
  }
}
