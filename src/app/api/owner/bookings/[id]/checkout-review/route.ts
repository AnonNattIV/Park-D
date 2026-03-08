import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import { verifyToken } from '@/lib/auth';
import getPool from '@/lib/db/mysql';
import {
  finalizeCheckoutWithSettlement,
  runBookingCheckoutAutomation,
} from '@/lib/booking-checkout';

export const dynamic = 'force-dynamic';

type TokenPayload = {
  userId?: string;
  role?: string;
};

type CheckoutReviewAction = 'APPROVE' | 'DENY';

interface OwnerCheckoutReviewRow extends RowDataPacket {
  b_id: number;
  b_status: string;
  owner_user_id: number;
  checkin_proof: string | null;
  checkout_datetime: Date | string | null;
  late_minutes: number | string;
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

function parseBookingId(rawId: string): number | null {
  const parsedId = Number(rawId);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    return null;
  }

  return parsedId;
}

function parseAction(value: unknown): CheckoutReviewAction | null {
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

  const body = await request.json();
  const action = parseAction(body?.action);
  if (!action) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  try {
    try {
      await runBookingCheckoutAutomation();
    } catch (automationError) {
      console.error('Unable to run booking checkout automation:', automationError);
    }

    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [rows] = await connection.query<OwnerCheckoutReviewRow[]>(
        `SELECT
          b.b_id,
          b.b_status,
          pl.owner_user_id,
          b.checkin_proof,
          b.checkout_datetime,
          GREATEST(
            TIMESTAMPDIFF(
              MINUTE,
              b.checkout_datetime,
              b.updated_at
            ),
            0
          ) AS late_minutes,
          CASE
            WHEN b.checkout_datetime IS NOT NULL
             AND CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00') >= b.checkout_datetime
            THEN 1 ELSE 0
          END AS is_checkout_review_window
        FROM bookings b
        INNER JOIN parking_lots pl ON pl.lot_id = b.lot_id
        WHERE b.b_id = ?
        LIMIT 1
        FOR UPDATE`,
        [bookingId]
      );

      if (rows.length === 0) {
        await connection.rollback();
        return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
      }

      const booking = rows[0];
      const isAdmin = requester.role === 'admin';
      const isOwner = Number(booking.owner_user_id) === requester.userId;

      if (!isAdmin && !isOwner) {
        await connection.rollback();
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      if (action === 'DENY') {
        if (booking.b_status !== 'CHECKING_OUT') {
          await connection.rollback();
          return NextResponse.json(
            { error: 'Only checkout requests can be denied' },
            { status: 409 }
          );
        }
        if (Number(booking.is_checkout_review_window) !== 1) {
          await connection.rollback();
          return NextResponse.json(
            { error: 'Checkout review is available after booking end time' },
            { status: 409 }
          );
        }

        const settlement = await finalizeCheckoutWithSettlement(
          connection,
          bookingId,
          'OWNER_APPROVED',
          {
            forceForfeitHalf: true,
            finalStatus: 'CHECKOUT_REJECTED',
          }
        );

        await connection.commit();
        return NextResponse.json({
          success: true,
          message: settlement.didSettle
            ? 'Checkout proof denied and renter forfeits full deposit'
            : 'Checkout already finalized',
          booking: {
            id: bookingId,
            status: 'CHECKOUT_REJECTED',
          },
        });
      }

      if (booking.b_status !== 'CHECKING_OUT' && booking.b_status !== 'CHECKOUT_APPROVED') {
        await connection.rollback();
        return NextResponse.json(
          { error: 'This booking is not waiting for checkout approval' },
          { status: 409 }
        );
      }
      if (Number(booking.is_checkout_review_window) !== 1) {
        await connection.rollback();
        return NextResponse.json(
          { error: 'Checkout review is available after booking end time' },
          { status: 409 }
        );
      }

      const settlement = await finalizeCheckoutWithSettlement(
        connection,
        bookingId,
        'OWNER_APPROVED',
        {
          lateMinutes: Number(booking.late_minutes || 0),
          forceForfeitHalf: false,
          finalStatus: 'CHECKOUT_APPROVED',
        }
      );

      await connection.commit();

      return NextResponse.json({
        success: true,
        message: settlement.didSettle
          ? 'Checkout approved and settlement completed'
          : 'Checkout already approved',
        booking: {
          id: bookingId,
          status: 'CHECKOUT_APPROVED',
        },
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Unable to review checkout by owner:', error);
    return NextResponse.json(
      { error: 'Unable to review checkout right now' },
      { status: 500 }
    );
  }
}
