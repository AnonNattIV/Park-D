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
};

interface BookingCancelRow extends RowDataPacket {
  b_id: number;
  user_id: number;
  owner_user_id: number;
  b_status: string;
  checkin_datetime: Date | string | null;
  pay_id: number | null;
  pay_status: string | null;
  pay_amount: number | string | null;
  paid_at: Date | string | null;
  is_before_checkin: number | string;
  is_payment_grace_window: number | string;
}

interface WalletLockRow extends RowDataPacket {
  wallet_id: number;
  balance: number | string;
}

function parseBookingId(rawId: string): number | null {
  const parsed = Number(rawId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function readRequesterUserId(request: NextRequest): number | null {
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

  if (!payload || !Number.isInteger(userId) || userId <= 0) {
    return null;
  }

  return userId;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requesterUserId = readRequesterUserId(request);
  if (!requesterUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
        pl.owner_user_id,
        b.b_status,
        b.checkin_datetime,
        p.pay_id,
        p.pay_status,
        p.pay_amount,
        p.paid_at,
        CASE
          WHEN b.checkin_datetime IS NOT NULL
           AND CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00') <= DATE_SUB(b.checkin_datetime, INTERVAL 1 DAY)
          THEN 1 ELSE 0
        END AS is_before_checkin,
        CASE
          WHEN p.pay_status = 'PAID'
           AND p.paid_at IS NOT NULL
           AND b.checkin_proof IS NULL
           AND CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00') <= DATE_ADD(p.paid_at, INTERVAL 10 MINUTE)
          THEN 1 ELSE 0
        END AS is_payment_grace_window
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
    if (Number(booking.user_id) !== requesterUserId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (booking.b_status === 'CANCELLED') {
      return NextResponse.json({ error: 'Booking is already cancelled' }, { status: 409 });
    }

    if (booking.b_status === 'CHECKOUT_APPROVED') {
      return NextResponse.json(
        { error: 'Completed booking cannot be cancelled' },
        { status: 409 }
      );
    }

    const canCancelBeforeReservation = Number(booking.is_before_checkin) === 1;
    const canCancelInPaymentGraceWindow = Number(booking.is_payment_grace_window) === 1;
    const canCancelBeforePaymentConfirmation = booking.b_status === 'WAITING_FOR_PAYMENT';

    if (
      !canCancelBeforePaymentConfirmation &&
      !canCancelBeforeReservation &&
      !canCancelInPaymentGraceWindow
    ) {
      return NextResponse.json(
        {
          error:
            'Booking can be cancelled anytime before payment confirmation, or at least 1 day before reservation time, or within 10 minutes after payment success',
        },
        { status: 409 }
      );
    }

    await ensureWalletTables(pool);

    const connection = await pool.getConnection();
    let refundedAmount = 0;
    let walletBalanceAfter: number | null = null;

    try {
      await connection.beginTransaction();

      const shouldRefund =
        booking.pay_id !== null &&
        Number(booking.pay_amount || 0) > 0 &&
        booking.pay_status !== 'REFUNDED' &&
        booking.pay_status !== 'CANCELLED' &&
        booking.pay_status !== 'FAILED';

      if (shouldRefund && booking.pay_id !== null) {
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
            canCancelInPaymentGraceWindow
              ? 'Renter cancelled booking within 10 minutes after payment success. Auto refund.'
              : 'Renter cancelled booking at least 1 day before reservation. Auto refund.',
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
        WHERE b_id = ?
          AND user_id = ?`,
        [bookingId, requesterUserId]
      );

      await connection.commit();

      try {
        await ensureNotificationTables(pool);
        await createNotification(pool, {
          userId: Number(booking.owner_user_id),
          type: 'BOOKING_CANCELLED',
          title: 'Booking cancelled by renter',
          message:
            refundedAmount > 0
              ? `Booking #${bookingId} was cancelled and refunded.`
              : `Booking #${bookingId} was cancelled by the renter.`,
          actionUrl: '/owner/home',
        });
      } catch (notificationError) {
        console.error('Unable to create renter cancellation notification:', notificationError);
      }

      return NextResponse.json({
        success: true,
        message:
          refundedAmount > 0
            ? 'Booking cancelled and payment refunded to your wallet'
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
    console.error('Unable to cancel user booking:', error);
    return NextResponse.json(
      { error: 'Unable to cancel booking right now' },
      { status: 500 }
    );
  }
}
