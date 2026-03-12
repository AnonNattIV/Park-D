import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { verifyToken } from '@/lib/auth';
import getPool from '@/lib/db/mysql';
import { ensureUserWallet, ensureWalletTables } from '@/lib/wallet';
import {
  createNotifications,
  ensureNotificationTables,
} from '@/lib/notifications';

export const dynamic = 'force-dynamic';

type TokenPayload = {
  userId?: string;
  role?: string;
};

type ReviewAction = 'APPROVE' | 'DENY';

interface PaymentReviewRow extends RowDataPacket {
  pay_id: number;
  b_id: number;
  user_id: number;
  pay_status: string;
  pay_amount: number | string | null;
  b_status: string;
  owner_user_id: number;
}

interface WalletLockRow extends RowDataPacket {
  wallet_id: number;
  balance: number | string;
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
        b.user_id,
        p.pay_status,
        p.pay_amount,
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

      const bookingAlreadyCancelled = payment.b_status === 'CANCELLED';
      let nextPaymentStatus: 'PAID' | 'FAILED' | 'REFUNDED' =
        action === 'APPROVE' ? 'PAID' : 'FAILED';
      let nextBookingStatus: 'PAYMENT_CONFIRMED' | 'CANCELLED' =
        action === 'APPROVE' ? 'PAYMENT_CONFIRMED' : 'CANCELLED';
      let refundedAmount = 0;
      let walletBalanceAfter: number | null = null;

      if (action === 'APPROVE' && bookingAlreadyCancelled) {
        nextPaymentStatus = 'REFUNDED';
        nextBookingStatus = 'CANCELLED';
      }

      const [paymentUpdate] = await connection.query<ResultSetHeader>(
        `UPDATE payments
        SET pay_status = ?,
            paid_at = CASE WHEN ? IN ('PAID', 'REFUNDED') THEN NOW() ELSE NULL END,
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

      if (nextPaymentStatus === 'REFUNDED') {
        const payAmount = Number(payment.pay_amount || 0);
        if (payAmount > 0) {
          await ensureWalletTables(connection);
          await ensureUserWallet(connection, Number(payment.user_id));

          const [walletRows] = await connection.query<WalletLockRow[]>(
            `SELECT wallet_id, balance
            FROM wallets
            WHERE user_id = ?
            LIMIT 1
            FOR UPDATE`,
            [payment.user_id]
          );

          if (walletRows.length === 0) {
            throw new Error('Unable to lock wallet for refund');
          }

          const wallet = walletRows[0];
          const balanceBefore = Number(wallet.balance || 0);
          refundedAmount = payAmount;
          walletBalanceAfter = Number((balanceBefore + refundedAmount).toFixed(2));

          await connection.query(
            `UPDATE wallets
            SET balance = ?,
                updated_at = NOW()
            WHERE wallet_id = ?`,
            [walletBalanceAfter, wallet.wallet_id]
          );

          await connection.query(
            `INSERT INTO wallet_transactions (
              wallet_id,
              user_id,
              booking_id,
              payment_id,
              tx_type,
              amount,
              balance_before,
              balance_after,
              note,
              created_at
            )
            VALUES (?, ?, ?, ?, 'REFUND', ?, ?, ?, ?, NOW())`,
            [
              wallet.wallet_id,
              payment.user_id,
              payment.b_id,
              payment.pay_id,
              refundedAmount,
              balanceBefore,
              walletBalanceAfter,
              'Booking was cancelled by owner while payment was pending. Refund after admin approval.',
            ]
          );
        }
      }

      await connection.query(
        `UPDATE bookings
        SET b_status = ?,
            updated_at = NOW()
        WHERE b_id = ?`,
        [nextBookingStatus, payment.b_id]
      );

      await connection.commit();

      try {
        await ensureNotificationTables(pool);

        const renterMessage =
          action === 'APPROVE'
            ? bookingAlreadyCancelled
              ? 'Payment approved after cancellation. Refund was sent to your wallet.'
              : 'Payment approved. Your booking is confirmed.'
            : bookingAlreadyCancelled
              ? 'Payment denied. Booking remains cancelled.'
              : 'Payment denied. Booking has been cancelled.';

        const ownerMessage =
          action === 'APPROVE'
            ? bookingAlreadyCancelled
              ? 'Payment was approved after owner cancellation and refunded to renter.'
              : 'Payment approved. Booking is now confirmed.'
            : 'Payment was denied by admin.';

        await createNotifications(pool, [
          {
            userId: Number(payment.user_id),
            type: 'PAYMENT_REVIEWED',
            title: action === 'APPROVE' ? 'Payment approved' : 'Payment denied',
            message: renterMessage,
            actionUrl: `/booking-history/${payment.b_id}`,
          },
          {
            userId: Number(payment.owner_user_id),
            type: 'PAYMENT_REVIEWED',
            title: action === 'APPROVE' ? 'Booking payment approved' : 'Booking payment denied',
            message: ownerMessage,
            actionUrl: '/owner/home',
          },
        ]);
      } catch (notificationError) {
        console.error('Unable to create payment review notifications:', notificationError);
      }

      return NextResponse.json({
        success: true,
        message:
          action === 'APPROVE'
            ? bookingAlreadyCancelled
              ? 'Payment approved and refunded because booking was already cancelled'
              : 'Payment approved successfully'
            : bookingAlreadyCancelled
              ? 'Payment denied. Booking remains cancelled.'
              : 'Payment denied. Booking cancelled automatically.',
        payment: {
          id: paymentId,
          status: nextPaymentStatus,
        },
        booking: {
          id: payment.b_id,
          status: nextBookingStatus,
        },
        refund:
          nextPaymentStatus === 'REFUNDED'
            ? {
                amount: refundedAmount,
                walletBalanceAfter,
              }
            : null,
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
