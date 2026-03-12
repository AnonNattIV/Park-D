import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import { verifyToken } from '@/lib/auth';
import getPool from '@/lib/db/mysql';
import { ensureUserWallet, ensureWalletTables } from '@/lib/wallet';
import {
  createNotification,
  ensureNotificationTables,
} from '@/lib/notifications';

export const dynamic = 'force-dynamic';

type TokenPayload = {
  userId?: string;
  role?: string;
};

interface BookingCancelRow extends RowDataPacket {
  b_id: number;
  user_id: number;
  owner_user_id: number;
  b_status: string;
  pay_id: number | null;
  pay_status: string | null;
  pay_amount: number | string | null;
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

function parseBookingId(rawId: string): number | null {
  const parsedId = Number(rawId);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    return null;
  }

  return parsedId;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requester = readRequester(request);
  if (!requester) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (requester.role !== 'owner' && requester.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const bookingId = parseBookingId(params.id);
  if (!bookingId) {
    return NextResponse.json({ error: 'Invalid booking id' }, { status: 400 });
  }

  const pool = getPool();

  try {
    const [rows] = await pool.query<BookingCancelRow[]>(
      `SELECT
        b.b_id,
        b.user_id,
        b.b_status,
        pl.owner_user_id,
        p.pay_id,
        p.pay_status,
        p.pay_amount
      FROM bookings b
      INNER JOIN parking_lots pl ON pl.lot_id = b.lot_id
      LEFT JOIN payments p ON p.b_id = b.b_id
      WHERE b.b_id = ?
      LIMIT 1`,
      [bookingId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const booking = rows[0];
    const isOwnerOfBooking = Number(booking.owner_user_id) === requester.userId;
    const isAdmin = requester.role === 'admin';

    if (!isOwnerOfBooking && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (booking.b_status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'Booking is already cancelled' },
        { status: 409 }
      );
    }

    if (booking.b_status === 'CHECKOUT_APPROVED') {
      return NextResponse.json(
        { error: 'Completed booking cannot be cancelled' },
        { status: 409 }
      );
    }

    await ensureWalletTables(pool);

    const connection = await pool.getConnection();
    let refundedAmount = 0;
    let walletBalanceAfter: number | null = null;

    try {
      await connection.beginTransaction();

      const normalizedPaymentStatus = (booking.pay_status || '').toUpperCase();
      const shouldRefundImmediately =
        booking.pay_id !== null &&
        Number(booking.pay_amount || 0) > 0 &&
        normalizedPaymentStatus === 'PAID';
      const pendingPaymentNeedsAdminReview =
        booking.pay_id !== null &&
        Number(booking.pay_amount || 0) > 0 &&
        normalizedPaymentStatus === 'PENDING';

      if (shouldRefundImmediately && booking.pay_id !== null) {
        refundedAmount = Number(booking.pay_amount || 0);

        await ensureUserWallet(connection, Number(booking.user_id));

        const [walletRows] = await connection.query<WalletLockRow[]>(
          `SELECT wallet_id, balance
          FROM wallets
          WHERE user_id = ?
          LIMIT 1
          FOR UPDATE`,
          [booking.user_id]
        );

        if (walletRows.length === 0) {
          throw new Error('Unable to lock wallet for refund');
        }

        const wallet = walletRows[0];
        const balanceBefore = Number(wallet.balance || 0);
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
            booking.user_id,
            booking.b_id,
            booking.pay_id,
            refundedAmount,
            balanceBefore,
            walletBalanceAfter,
            'Owner cancelled booking. Auto refund.',
          ]
        );

        await connection.query(
          `UPDATE payments
          SET pay_status = 'REFUNDED',
              updated_at = NOW()
          WHERE pay_id = ?`,
          [booking.pay_id]
        );
      }

      await connection.query(
        `UPDATE bookings
        SET b_status = 'CANCELLED',
            updated_at = NOW()
        WHERE b_id = ?`,
        [bookingId]
      );

      await connection.commit();

      try {
        await ensureNotificationTables(pool);
        await createNotification(pool, {
          userId: Number(booking.user_id),
          type: 'BOOKING_CANCELLED',
          title: 'Booking cancelled by owner',
          message:
            refundedAmount > 0
              ? `Booking #${bookingId} was cancelled by owner and refunded to your wallet.`
              : pendingPaymentNeedsAdminReview
                ? `Booking #${bookingId} was cancelled by owner. Payment is pending admin review.`
                : `Booking #${bookingId} was cancelled by owner.`,
          actionUrl: `/booking-history/${bookingId}`,
        });
      } catch (notificationError) {
        console.error('Unable to create owner cancellation notification:', notificationError);
      }

      return NextResponse.json({
        success: true,
        message:
          refundedAmount > 0
            ? 'Booking cancelled and payment refunded to renter wallet'
            : pendingPaymentNeedsAdminReview
              ? 'Booking cancelled. Payment is pending admin review; refund will happen only if admin approves.'
            : 'Booking cancelled',
        booking: {
          id: bookingId,
          status: 'CANCELLED',
        },
        refund: {
          amount: refundedAmount,
          walletBalanceAfter,
        },
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Unable to cancel owner booking:', error);
    return NextResponse.json(
      { error: 'Unable to cancel booking right now' },
      { status: 500 }
    );
  }
}
