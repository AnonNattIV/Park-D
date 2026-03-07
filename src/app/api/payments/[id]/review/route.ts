import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { verifyToken } from '@/lib/auth';
import getPool from '@/lib/db/mysql';

export const dynamic = 'force-dynamic';

type TokenPayload = {
  userId?: string;
  role?: string;
};

type ReviewAction = 'APPROVE' | 'DENY';

interface PaymentReviewRow extends RowDataPacket {
  pay_id: number;
  b_id: number;
  pay_status: string;
  b_status: string;
  owner_user_id: number;
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

function parsePaymentId(rawId: string): number | null {
  const parsedId = Number(rawId);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    return null;
  }

  return parsedId;
}

function parseAction(value: unknown): ReviewAction | null {
  if (typeof value !== 'string') {
    return null;
  }

  const action = value.trim().toUpperCase();
  if (action === 'APPROVE' || action === 'DENY') {
    return action;
  }

  return null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const requester = readRequester(request);
    if (!requester) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (requester.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const paymentId = parsePaymentId(params.id);
    if (!paymentId) {
      return NextResponse.json({ error: 'Invalid payment id' }, { status: 400 });
    }

    const body = await request.json();
    const action = parseAction(body?.action);
    if (!action) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const pool = getPool();

    const [rows] = await pool.query<PaymentReviewRow[]>(
      `SELECT
        p.pay_id,
        p.b_id,
        p.pay_status,
        b.b_status,
        pl.owner_user_id
      FROM payments p
      INNER JOIN bookings b ON b.b_id = p.b_id
      INNER JOIN parking_lots pl ON pl.lot_id = b.lot_id
      WHERE p.pay_id = ?
      LIMIT 1`,
      [paymentId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    const payment = rows[0];
    if (payment.pay_status !== 'PENDING') {
      return NextResponse.json(
        { error: 'This payment is already reviewed' },
        { status: 409 }
      );
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const nextPaymentStatus = action === 'APPROVE' ? 'PAID' : 'FAILED';
      const nextBookingStatus = action === 'APPROVE' ? 'PAYMENT_CONFIRMED' : 'WAITING_FOR_PAYMENT';

      const [paymentUpdate] = await connection.query<ResultSetHeader>(
        `UPDATE payments
        SET pay_status = ?,
            paid_at = CASE WHEN ? = 'PAID' THEN NOW() ELSE NULL END,
            updated_at = NOW()
        WHERE pay_id = ?
          AND pay_status = 'PENDING'`,
        [nextPaymentStatus, nextPaymentStatus, paymentId]
      );

      if (paymentUpdate.affectedRows === 0) {
        await connection.rollback();
        return NextResponse.json(
          { error: 'This payment is already reviewed' },
          { status: 409 }
        );
      }

      await connection.query(
        `UPDATE bookings
        SET b_status = ?,
            updated_at = NOW()
        WHERE b_id = ?`,
        [nextBookingStatus, payment.b_id]
      );

      await connection.commit();

      return NextResponse.json({
        success: true,
        message:
          action === 'APPROVE'
            ? 'Payment approved successfully'
            : 'Payment denied successfully',
        payment: {
          id: paymentId,
          status: nextPaymentStatus,
        },
        booking: {
          id: payment.b_id,
          status: nextBookingStatus,
        },
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Unable to review payment:', error);
    return NextResponse.json(
      { error: 'Unable to review payment right now' },
      { status: 500 }
    );
  }
}
