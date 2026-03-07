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
        pp.proof_image_url
      FROM bookings b
      INNER JOIN parking_lots pl ON pl.lot_id = b.lot_id
      INNER JOIN users u ON u.user_id = b.user_id
      LEFT JOIN payments p ON p.b_id = b.b_id
      LEFT JOIN payment_proofs pp ON pp.pay_id = p.pay_id
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
        payment: row.pay_id
          ? {
              id: row.pay_id,
              status: row.pay_status,
              amount: row.pay_amount === null ? 0 : Number(row.pay_amount),
              method: row.pay_method,
              proofUrl: row.proof_image_url,
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
