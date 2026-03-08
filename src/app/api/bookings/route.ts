import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { verifyToken } from '@/lib/auth';
import getPool from '@/lib/db/mysql';
import { parseBangkokDateTimeInput } from '@/lib/time-bangkok';
import { runBookingCheckoutAutomation } from '@/lib/booking-checkout';

interface TokenPayload {
  userId?: string;
  role?: string;
}

interface ParkingLotBookingRow extends RowDataPacket {
  lot_id: number;
  owner_user_id: number;
  lot_name: string | null;
  location: string;
  total_slot: number | string;
  price: number | string;
}

interface ActiveBookingsRow extends RowDataPacket {
  active_bookings: number | string;
}

const occupiedBookingStatuses = [
  'PENDING',
  'APPROVED_BY_OWNER',
  'WAITING_FOR_PAYMENT',
  'PAYMENT_CONFIRMED',
  'CHECKING_IN',
  'CHECKIN_APPROVED',
  'CHECKIN_REJECTED',
  'CHECKING_OUT',
  'CHECKOUT_REJECTED',
] as const;

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

  if (!payload || !Number.isFinite(userId) || userId <= 0) {
    return null;
  }

  return { userId, role };
}

export async function POST(request: NextRequest) {
  try {
    const requester = readRequester(request);
    if (!requester) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      await runBookingCheckoutAutomation();
    } catch (automationError) {
      console.error('Unable to run booking checkout automation:', automationError);
    }

    const body = await request.json();
    const lotId = Number(body?.lotId);
    const plateId = typeof body?.plateId === 'string' ? body.plateId.trim() : '';
    const vehicleBrand = typeof body?.vehicleBrand === 'string' ? body.vehicleBrand.trim() : '';
    const vehicleModel = typeof body?.vehicleModel === 'string' ? body.vehicleModel.trim() : '';
    const checkinDateTime = parseBangkokDateTimeInput(body?.checkinDatetime);
    const checkoutDateTime = parseBangkokDateTimeInput(body?.checkoutDatetime);

    if (!Number.isInteger(lotId) || lotId <= 0) {
      return NextResponse.json({ error: 'Invalid parking lot id' }, { status: 400 });
    }

    if (!plateId) {
      return NextResponse.json({ error: 'Plate number is required' }, { status: 400 });
    }

    if (plateId.length > 20) {
      return NextResponse.json(
        { error: 'Plate number must not exceed 20 characters' },
        { status: 400 }
      );
    }

    if (vehicleBrand.length > 100 || vehicleModel.length > 100) {
      return NextResponse.json(
        { error: 'Vehicle brand/model must not exceed 100 characters' },
        { status: 400 }
      );
    }

    if (!checkinDateTime || !checkoutDateTime) {
      return NextResponse.json(
        { error: 'Check-in and check-out date/time are required' },
        { status: 400 }
      );
    }

    if (checkoutDateTime.comparableTime <= checkinDateTime.comparableTime) {
      return NextResponse.json(
        { error: 'Check-out must be later than check-in' },
        { status: 400 }
      );
    }

    const pool = getPool();

    const [lotRows] = await pool.query<ParkingLotBookingRow[]>(
      `SELECT
        lot_id,
        owner_user_id,
        lot_name,
        location,
        total_slot,
        price
      FROM parking_lots
      WHERE lot_id = ?
        AND is_approve = 1
        AND p_status = 'ACTIVE'
      LIMIT 1`,
      [lotId]
    );

    if (lotRows.length === 0) {
      return NextResponse.json(
        { error: 'Parking lot is not available for booking' },
        { status: 404 }
      );
    }

    const lot = lotRows[0];
    if (Number(lot.owner_user_id) === requester.userId) {
      return NextResponse.json(
        { error: 'You cannot rent your own parking lot' },
        { status: 403 }
      );
    }

    const totalSlot = Number(lot.total_slot || 0);

    const [activeBookingRows] = await pool.query<ActiveBookingsRow[]>(
      `SELECT COUNT(*) AS active_bookings
      FROM bookings
      WHERE lot_id = ?
        AND b_status IN (${occupiedBookingStatuses.map(() => '?').join(', ')})
        AND (
          checkin_datetime IS NULL
          OR checkout_datetime IS NULL
          OR (
            checkin_datetime < ?
            AND DATE_ADD(checkout_datetime, INTERVAL 30 MINUTE) > ?
          )
        )`,
      [
        lotId,
        ...occupiedBookingStatuses,
        checkoutDateTime.mysqlDateTime,
        checkinDateTime.mysqlDateTime,
      ]
    );

    const activeBookings = Number(activeBookingRows[0]?.active_bookings || 0);
    const availableSlot = Math.max(totalSlot - activeBookings, 0);

    if (availableSlot <= 0) {
      return NextResponse.json(
        { error: 'No available slot for this parking lot right now' },
        { status: 409 }
      );
    }

    const [insertResult] = await pool.query<ResultSetHeader>(
      `INSERT INTO bookings (
        user_id,
        lot_id,
        plate_id,
        checkin_datetime,
        checkout_datetime,
        b_status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, 'WAITING_FOR_PAYMENT', NOW(), NOW())`,
      [
        requester.userId,
        lotId,
        plateId,
        checkinDateTime.mysqlDateTime,
        checkoutDateTime.mysqlDateTime,
      ]
    );

    try {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS booking_vehicle_metadata (
          b_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
          vehicle_brand VARCHAR(100) NULL,
          vehicle_model VARCHAR(100) NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_booking_vehicle_metadata_booking
            FOREIGN KEY (b_id) REFERENCES bookings(b_id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      );

      await pool.query(
        `INSERT INTO booking_vehicle_metadata (
          b_id,
          vehicle_brand,
          vehicle_model
        )
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          vehicle_brand = VALUES(vehicle_brand),
          vehicle_model = VALUES(vehicle_model),
          updated_at = CURRENT_TIMESTAMP`,
        [
          insertResult.insertId,
          vehicleBrand || null,
          vehicleModel || null,
        ]
      );
    } catch (metadataError) {
      console.error('Unable to save booking vehicle metadata:', metadataError);
    }

    const totalMinutes = Math.floor(
      (checkoutDateTime.comparableTime - checkinDateTime.comparableTime) / 60000
    );
    const rentAmount = Number(((totalMinutes / 60) * Number(lot.price || 0)).toFixed(2));
    const estimatedTotal = Number((rentAmount * 1.5).toFixed(2));

    return NextResponse.json({
      success: true,
      message: 'Booking created successfully',
      booking: {
        id: insertResult.insertId,
        status: 'WAITING_FOR_PAYMENT',
        lotName: lot.lot_name?.trim() || lot.location,
        totalMinutes,
        rentAmount,
        estimatedTotal,
      },
    });
  } catch (error) {
    console.error('Unable to create booking:', error);
    return NextResponse.json(
      { error: 'Unable to create booking right now' },
      { status: 500 }
    );
  }
}
