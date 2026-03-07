import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { verifyToken } from '@/lib/auth';
import getPool from '@/lib/db/mysql';
import { runBookingCheckoutAutomation } from '@/lib/booking-checkout';

export const dynamic = 'force-dynamic';

type TokenPayload = {
  userId?: string;
};

interface BookingCheckoutRow extends RowDataPacket {
  b_id: number;
  user_id: number;
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
        b_id,
        user_id,
        b_status,
        checkin_datetime,
        checkin_proof,
        checkout_datetime
      FROM bookings
      WHERE b_id = ?
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
        AND checkout_datetime IS NOT NULL
        AND CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00') >= checkout_datetime`,
      [bookingId, requesterUserId, ...allowedStatuses]
    );

    if (updateResult.affectedRows === 0) {
      return NextResponse.json(
        { error: 'Checkout is available only after booking end time' },
        { status: 409 }
      );
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
