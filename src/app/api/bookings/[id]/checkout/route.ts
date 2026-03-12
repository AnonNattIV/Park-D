import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { verifyToken } from '@/lib/auth';
import getPool from '@/lib/db/mysql';
import { runBookingCheckoutAutomation } from '@/lib/booking-checkout';
import {
  createNotification,
  ensureNotificationTables,
} from '@/lib/notifications';

export const dynamic = 'force-dynamic';

type TokenPayload = {
  userId?: string;
};

interface BookingCheckoutRow extends RowDataPacket {
  b_id: number;
  user_id: number;
  owner_user_id: number;
  b_status: string;
  checkin_datetime: Date | string | null;
  checkin_proof: string | null;
  checkout_datetime: Date | string | null;
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
  try {
    const requesterUserId = readRequesterUserId(request);
    if (!requesterUserId) {
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
    const [rows] = await pool.query<BookingCheckoutRow[]>(
      `SELECT
        b.b_id,
        b.user_id,
        pl.owner_user_id,
        b.b_status,
        b.checkin_datetime,
        b.checkin_proof,
        b.checkout_datetime
      FROM bookings b
      INNER JOIN parking_lots pl ON pl.lot_id = b.lot_id
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

    if (booking.b_status === 'CHECKING_OUT' || booking.b_status === 'CHECKOUT_APPROVED') {
      return NextResponse.json(
        { error: 'This booking is already checked out' },
        { status: 409 }
      );
    }

    const allowedStatuses = ['CHECKING_IN', 'CHECKIN_APPROVED'];
    if (!allowedStatuses.includes(booking.b_status)) {
      return NextResponse.json(
        { error: 'This booking is not available for checkout' },
        { status: 409 }
      );
    }

    if (!booking.checkin_proof) {
      return NextResponse.json(
        { error: 'Check-in is required before checkout' },
        { status: 409 }
      );
    }

    const [updateResult] = await pool.query<ResultSetHeader>(
      `UPDATE bookings
      SET b_status = 'CHECKING_OUT',
          updated_at = NOW()
      WHERE b_id = ?
        AND user_id = ?
        AND b_status IN (${allowedStatuses.map(() => '?').join(', ')})
        AND checkin_proof IS NOT NULL
        AND checkin_datetime IS NOT NULL
        AND checkout_datetime IS NOT NULL`,
      [bookingId, requesterUserId, ...allowedStatuses]
    );

    if (updateResult.affectedRows === 0) {
      return NextResponse.json(
        { error: 'Unable to submit checkout request right now' },
        { status: 409 }
      );
    }

    try {
      await ensureNotificationTables(pool);
      await createNotification(pool, {
        userId: Number(booking.owner_user_id),
        type: 'CHECKOUT_REQUESTED',
        title: 'Checkout request received',
        message: `Renter submitted checkout request for booking #${bookingId}.`,
        actionUrl: '/owner/home',
      });
    } catch (notificationError) {
      console.error('Unable to create checkout request notification:', notificationError);
    }

    return NextResponse.json({
      success: true,
      message: 'Checkout request sent to owner',
      booking: {
        id: bookingId,
        status: 'CHECKING_OUT',
      },
    });
  } catch (error) {
    console.error('Unable to submit checkout:', error);
    return NextResponse.json(
      { error: 'Unable to submit checkout right now' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const requesterUserId = readRequesterUserId(request);
    if (!requesterUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const bookingId = parseBookingId(params.id);
    if (!bookingId) {
      return NextResponse.json({ error: 'Invalid booking id' }, { status: 400 });
    }

    const pool = getPool();
    const [rows] = await pool.query<BookingCheckoutRow[]>(
      `SELECT
        b.b_id,
        b.user_id,
        pl.owner_user_id,
        b.b_status,
        b.checkin_datetime,
        b.checkin_proof,
        b.checkout_datetime
      FROM bookings b
      INNER JOIN parking_lots pl ON pl.lot_id = b.lot_id
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

    if (booking.b_status !== 'CHECKING_OUT' && booking.b_status !== 'CHECKOUT_REJECTED') {
      return NextResponse.json(
        { error: 'This booking has no checkout request to cancel' },
        { status: 409 }
      );
    }

    const [updateResult] = await pool.query<ResultSetHeader>(
      `UPDATE bookings
      SET b_status = 'CHECKIN_APPROVED',
          updated_at = NOW()
      WHERE b_id = ?
        AND user_id = ?
        AND b_status IN ('CHECKING_OUT', 'CHECKOUT_REJECTED')`,
      [bookingId, requesterUserId]
    );

    if (updateResult.affectedRows === 0) {
      return NextResponse.json(
        { error: 'Unable to cancel checkout request right now' },
        { status: 409 }
      );
    }

    try {
      await ensureNotificationTables(pool);
      await createNotification(pool, {
        userId: Number(booking.owner_user_id),
        type: 'CHECKOUT_CANCELLED',
        title: 'Checkout request cancelled',
        message: `Renter cancelled checkout request for booking #${bookingId}.`,
        actionUrl: '/owner/home',
      });
    } catch (notificationError) {
      console.error('Unable to create checkout cancellation notification:', notificationError);
    }

    return NextResponse.json({
      success: true,
      message: 'Checkout request cancelled',
      booking: {
        id: bookingId,
        status: 'CHECKIN_APPROVED',
      },
    });
  } catch (error) {
    console.error('Unable to cancel checkout:', error);
    return NextResponse.json(
      { error: 'Unable to cancel checkout right now' },
      { status: 500 }
    );
  }
}
