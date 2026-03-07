import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { verifyToken } from '@/lib/auth';
import getPool from '@/lib/db/mysql';
import { deleteCheckinProofByUrl, uploadCheckinProof } from '@/lib/storage';

export const dynamic = 'force-dynamic';

type TokenPayload = {
  userId?: string;
};

interface BookingCheckinRow extends RowDataPacket {
  b_id: number;
  user_id: number;
  b_status: string;
  checkin_datetime: Date | string | null;
  checkout_datetime: Date | string | null;
  checkin_proof: string | null;
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

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  let uploadedProofUrl: string | null = null;

  try {
    const requesterUserId = readRequesterUserId(request);
    if (!requesterUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const bookingId = parseBookingId(params.id);
    if (!bookingId) {
      return NextResponse.json({ error: 'Invalid booking id' }, { status: 400 });
    }

    const formData = await request.formData();
    const proofFile = formData.get('proof');

    if (!(proofFile instanceof File)) {
      return NextResponse.json({ error: 'Check-in proof image is required' }, { status: 400 });
    }

    if (!proofFile.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed for check-in proof' }, { status: 400 });
    }

    if (proofFile.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Check-in proof image must be 5 MB or smaller' }, { status: 400 });
    }

    const pool = getPool();
    const [rows] = await pool.query<BookingCheckinRow[]>(
      `SELECT
        b_id,
        user_id,
        b_status,
        checkin_datetime,
        checkout_datetime,
        checkin_proof
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

    const allowedStatuses = ['PAYMENT_CONFIRMED', 'CHECKIN_REJECTED', 'CHECKING_IN'];
    if (!allowedStatuses.includes(booking.b_status)) {
      return NextResponse.json(
        { error: 'This booking is not available for check-in' },
        { status: 409 }
      );
    }

    uploadedProofUrl = await uploadCheckinProof(proofFile, requesterUserId, bookingId);

    const [updateResult] = await pool.query<ResultSetHeader>(
      `UPDATE bookings
      SET checkin_proof = ?,
          b_status = 'CHECKING_IN',
          updated_at = NOW()
      WHERE b_id = ?
        AND user_id = ?
        AND b_status IN (${allowedStatuses.map(() => '?').join(', ')})
        AND checkin_datetime IS NOT NULL
        AND checkout_datetime IS NOT NULL
        AND CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00') >= checkin_datetime
        AND CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00') < checkout_datetime`,
      [uploadedProofUrl, bookingId, requesterUserId, ...allowedStatuses]
    );

    if (updateResult.affectedRows === 0) {
      if (uploadedProofUrl) {
        await deleteCheckinProofByUrl(uploadedProofUrl);
        uploadedProofUrl = null;
      }

      return NextResponse.json(
        { error: 'Check-in is not available at this time' },
        { status: 409 }
      );
    }

    if (booking.checkin_proof && booking.checkin_proof !== uploadedProofUrl) {
      try {
        await deleteCheckinProofByUrl(booking.checkin_proof);
      } catch (error) {
        console.error('Unable to delete previous check-in proof:', error);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Check-in proof submitted successfully',
      booking: {
        id: bookingId,
        status: 'CHECKING_IN',
        checkinProof: uploadedProofUrl,
      },
    });
  } catch (error) {
    console.error('Unable to submit check-in proof:', error);

    if (uploadedProofUrl) {
      try {
        await deleteCheckinProofByUrl(uploadedProofUrl);
      } catch (deleteError) {
        console.error('Unable to rollback uploaded check-in proof:', deleteError);
      }
    }

    return NextResponse.json(
      { error: 'Unable to submit check-in proof right now' },
      { status: 500 }
    );
  }
}
