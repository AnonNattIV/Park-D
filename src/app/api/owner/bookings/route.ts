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

interface OwnerBookingRow extends RowDataPacket {
  b_id: number;
  lot_id: number;
  lot_name: string | null;
  location: string;
  renter_user_id: number;
  renter_username: string;
  renter_name: string | null;
  booking_time: Date | string;
  checkin_datetime: Date | string | null;
  checkin_proof: string | null;
  checkout_datetime: Date | string | null;
  b_status: string;
  pay_id: number | null;
  pay_status: string | null;
  pay_amount: number | string | null;
  pay_method: string | null;
  proof_image_url: string | null;
  settlement_reason: string | null;
  rent_amount: number | string | null;
  owner_share: number | string | null;
  platform_share: number | string | null;
  renter_refund: number | string | null;
  owner_bonus: number | string | null;
  settled_at: Date | string | null;
  is_checkout_review_window: number | string;
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

export async function GET(request: NextRequest) {
  try {
    const requester = readRequester(request);
    if (!requester) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (requester.role !== 'owner' && requester.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
    await pool.query(
      `CREATE TABLE IF NOT EXISTS booking_checkout_settlements (
        b_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
        owner_user_id BIGINT UNSIGNED NOT NULL,
        renter_user_id BIGINT UNSIGNED NOT NULL,
        pay_id BIGINT UNSIGNED NULL,
        pay_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        rent_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        owner_share DECIMAL(12,2) NOT NULL DEFAULT 0,
        platform_share DECIMAL(12,2) NOT NULL DEFAULT 0,
        renter_refund DECIMAL(12,2) NOT NULL DEFAULT 0,
        owner_bonus DECIMAL(12,2) NOT NULL DEFAULT 0,
        settlement_reason ENUM('OWNER_APPROVED', 'AUTO_APPROVED_7H', 'AUTO_CHECKOUT_NO_CHECKIN') NOT NULL,
        settled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_booking_checkout_settlements_booking
          FOREIGN KEY (b_id) REFERENCES bookings(b_id)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );

    const whereClause =
      requester.role === 'admin' ? '' : 'WHERE pl.owner_user_id = ?';
    const params = requester.role === 'admin' ? [] : [requester.userId];

    const [rows] = await pool.query<OwnerBookingRow[]>(
      `SELECT
        b.b_id,
        b.lot_id,
        pl.lot_name,
        pl.location,
        b.user_id AS renter_user_id,
        u.username AS renter_username,
        u.name AS renter_name,
        b.booking_time,
        b.checkin_datetime,
        b.checkin_proof,
        b.checkout_datetime,
        b.b_status,
        p.pay_id,
        p.pay_status,
        p.pay_amount,
        p.pay_method,
        pp.proof_image_url,
        bcs.settlement_reason,
        bcs.rent_amount,
        bcs.owner_share,
        bcs.platform_share,
        bcs.renter_refund,
        bcs.owner_bonus,
        bcs.settled_at,
        CASE
          WHEN b.b_status = 'CHECKING_OUT'
           AND b.checkout_datetime IS NOT NULL
           AND CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00') >= b.checkout_datetime
          THEN 1 ELSE 0
        END AS is_checkout_review_window
      FROM bookings b
      INNER JOIN parking_lots pl ON pl.lot_id = b.lot_id
      INNER JOIN users u ON u.user_id = b.user_id
      LEFT JOIN payments p ON p.b_id = b.b_id
      LEFT JOIN payment_proofs pp ON pp.pay_id = p.pay_id
      LEFT JOIN booking_checkout_settlements bcs ON bcs.b_id = b.b_id
      ${whereClause}
      ORDER BY b.booking_time DESC`,
      params
    );

    return NextResponse.json({
      success: true,
      bookings: rows.map((row) => ({
        id: row.b_id,
        lotId: row.lot_id,
        lotName: row.lot_name?.trim() || row.location,
        renter: {
          id: row.renter_user_id,
          username: row.renter_username,
          name: row.renter_name,
        },
        bookingTime: row.booking_time,
        checkinTime: row.checkin_datetime,
        checkinProofUrl: row.checkin_proof,
        checkoutTime: row.checkout_datetime,
        bookingStatus: row.b_status,
        canReviewCheckout: Number(row.is_checkout_review_window) === 1,
        payment: row.pay_id
          ? {
              id: row.pay_id,
              status: row.pay_status,
              amount: row.pay_amount === null ? 0 : Number(row.pay_amount),
              method: row.pay_method,
              proofUrl: row.proof_image_url,
            }
          : null,
        settlement: row.settlement_reason
          ? {
              reason: row.settlement_reason,
              rentAmount: row.rent_amount === null ? 0 : Number(row.rent_amount),
              ownerShare: row.owner_share === null ? 0 : Number(row.owner_share),
              platformShare: row.platform_share === null ? 0 : Number(row.platform_share),
              renterRefund: row.renter_refund === null ? 0 : Number(row.renter_refund),
              ownerBonus: row.owner_bonus === null ? 0 : Number(row.owner_bonus),
              settledAt: row.settled_at,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error('Unable to load owner bookings:', error);
    return NextResponse.json(
      { error: 'Unable to load owner booking details right now' },
      { status: 500 }
    );
  }
}
