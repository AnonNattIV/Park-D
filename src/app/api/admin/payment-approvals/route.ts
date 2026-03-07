import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import { verifyToken } from '@/lib/auth';
import getPool from '@/lib/db/mysql';

export const dynamic = 'force-dynamic';

type TokenPayload = {
  userId?: string;
  role?: string;
};

interface PaymentApprovalRow extends RowDataPacket {
  pay_id: number;
  b_id: number;
  pay_status: string;
  pay_method: string;
  pay_amount: number | string;
  paid_at: Date | string | null;
  payment_created_at: Date | string;
  proof_image_url: string | null;
  lot_id: number;
  lot_name: string | null;
  location: string;
  owner_user_id: number;
  owner_username: string;
  owner_name: string | null;
  renter_user_id: number;
  renter_username: string;
  renter_name: string | null;
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

    if (requester.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

    const [rows] = await pool.query<PaymentApprovalRow[]>(
      `SELECT
        p.pay_id,
        p.b_id,
        p.pay_status,
        p.pay_method,
        p.pay_amount,
        p.paid_at,
        p.created_at AS payment_created_at,
        pp.proof_image_url,
        pl.lot_id,
        pl.lot_name,
        pl.location,
        pl.owner_user_id,
        owner_user.username AS owner_username,
        owner_user.name AS owner_name,
        renter_user.user_id AS renter_user_id,
        renter_user.username AS renter_username,
        renter_user.name AS renter_name
      FROM payments p
      INNER JOIN bookings b ON b.b_id = p.b_id
      INNER JOIN parking_lots pl ON pl.lot_id = b.lot_id
      INNER JOIN users owner_user ON owner_user.user_id = pl.owner_user_id
      INNER JOIN users renter_user ON renter_user.user_id = b.user_id
      LEFT JOIN payment_proofs pp ON pp.pay_id = p.pay_id
      ORDER BY
        CASE WHEN p.pay_status = 'PENDING' THEN 0 ELSE 1 END,
        p.created_at DESC`
    );

    return NextResponse.json({
      success: true,
      approvals: rows.map((row) => ({
        payment: {
          id: row.pay_id,
          bookingId: row.b_id,
          status: row.pay_status,
          method: row.pay_method,
          amount: Number(row.pay_amount || 0),
          paidAt: row.paid_at,
          submittedAt: row.payment_created_at,
          proofUrl: row.proof_image_url,
        },
        lot: {
          id: row.lot_id,
          name: row.lot_name?.trim() || row.location,
          location: row.location,
        },
        owner: {
          id: row.owner_user_id,
          username: row.owner_username,
          name: row.owner_name,
        },
        renter: {
          id: row.renter_user_id,
          username: row.renter_username,
          name: row.renter_name,
        },
      })),
    });
  } catch (error) {
    console.error('Unable to load payment approvals:', error);
    return NextResponse.json(
      { error: 'Unable to load payment approvals right now' },
      { status: 500 }
    );
  }
}
