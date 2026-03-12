import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import getPool from '@/lib/db/mysql';
import { runBookingCheckoutAutomation } from '@/lib/booking-checkout';
import { ensureParkingLotMetadataSchema } from '@/lib/parking-lot-metadata';
import { buildGoogleMapsEmbedUrl } from '@/lib/google-maps';

interface ParkingLotDetailRow extends RowDataPacket {
  lot_id: number;
  lot_name: string | null;
  display_lot_name_th: string | null;
  description: string | null;
  location: string;
  display_location_th: string | null;
  price: number | string;
  total_slot: number | string;
  address_line: string | null;
  display_address_line_th: string | null;
  street_number: string | null;
  display_street_number_th: string | null;
  district: string | null;
  display_district_th: string | null;
  amphoe: string | null;
  display_amphoe_th: string | null;
  subdistrict: string | null;
  display_subdistrict_th: string | null;
  province: string | null;
  display_province_th: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  owner_name: string;
}

interface ActiveBookingsRow extends RowDataPacket {
  active_bookings: number | string;
}

interface ParkingLotMetadataRow extends RowDataPacket {
  vehicle_types_json: unknown;
  rules_json: unknown;
  image_urls_json: unknown;
}

interface ParkingLotReservationRow extends RowDataPacket {
  b_id: number;
  b_status: string;
  checkin_datetime: Date | string | null;
  checkout_datetime: Date | string | null;
  blocked_until: Date | string | null;
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

function deriveLotName(
  lotName: string | null | undefined,
  location: string,
  fallbackId: number
): string {
  const normalizedLotName = lotName?.trim();
  if (normalizedLotName) {
    return normalizedLotName;
  }

  const primarySegment = location
    .split(',')
    .map((segment) => segment.trim())
    .find(Boolean);

  return primarySegment || `Parking Lot #${fallbackId}`;
}

function buildMapEmbedUrl(
  latitude: number | null,
  longitude: number | null
): string | null {
  return buildGoogleMapsEmbedUrl(latitude, longitude);
}

function parseStringArrayValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value !== 'string') {
    return [];
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(normalizedValue) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  } catch {
    // fall back to comma/newline parser
  }

  return normalizedValue
    .split('\n')
    .flatMap((line) => line.split(','))
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json(
      { error: 'invalid parking-lot id' },
      { status: 400 }
    );
  }

  try {
    try {
      await runBookingCheckoutAutomation();
    } catch (automationError) {
      console.error('Unable to run booking checkout automation:', automationError);
    }

    const pool = getPool();
    await ensureParkingLotMetadataSchema();

    const [lotRows] = await pool.query<ParkingLotDetailRow[]>(
      `SELECT
        pl.lot_id,
        pl.lot_name,
        plm.display_lot_name_th,
        pl.description,
        pl.location,
        plm.display_location_th,
        pl.price,
        pl.total_slot,
        pl.address_line,
        plm.display_address_line_th,
        pl.street_number,
        plm.display_street_number_th,
        pl.district,
        plm.display_district_th,
        pl.amphoe,
        plm.display_amphoe_th,
        pl.subdistrict,
        plm.display_subdistrict_th,
        pl.province,
        plm.display_province_th,
        pl.latitude,
        pl.longitude,
        u.name AS owner_name
      FROM parking_lots pl
      LEFT JOIN parking_lot_metadata plm ON plm.lot_id = pl.lot_id
      INNER JOIN users u ON u.user_id = pl.owner_user_id
      WHERE pl.lot_id = ?
      LIMIT 1`,
      [id]
    );

    if (lotRows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    const lotRow = lotRows[0];

    const [activeBookingRows] = await pool.query<ActiveBookingsRow[]>(
      `SELECT COUNT(*) AS active_bookings
      FROM bookings
      WHERE lot_id = ?
        AND b_status IN (${occupiedBookingStatuses.map(() => '?').join(', ')})
        AND (
          checkin_datetime IS NULL
          OR checkout_datetime IS NULL
          OR (
            checkin_datetime < DATE_ADD(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00'), INTERVAL 1 HOUR)
            AND DATE_ADD(checkout_datetime, INTERVAL 30 MINUTE) > CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00')
          )
        )`,
      [id, ...occupiedBookingStatuses]
    );

    const totalSlot = Number(lotRow.total_slot || 0);
    const activeBookings = Number(activeBookingRows[0]?.active_bookings || 0);
    const availableSlot = Math.max(totalSlot - activeBookings, 0);
    const price = Number(lotRow.price || 0);

    const [reservationRows] = await pool.query<ParkingLotReservationRow[]>(
      `SELECT
        b_id,
        b_status,
        checkin_datetime,
        checkout_datetime,
        DATE_ADD(checkout_datetime, INTERVAL 30 MINUTE) AS blocked_until
      FROM bookings
      WHERE lot_id = ?
        AND b_status IN (${occupiedBookingStatuses.map(() => '?').join(', ')})
        AND checkin_datetime IS NOT NULL
        AND checkout_datetime IS NOT NULL
        AND DATE_ADD(checkout_datetime, INTERVAL 30 MINUTE) > CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00')
      ORDER BY checkin_datetime ASC
      LIMIT 20`,
      [id, ...occupiedBookingStatuses]
    );

    const parsedLatitude =
      lotRow.latitude === null ? null : Number(lotRow.latitude);
    const parsedLongitude =
      lotRow.longitude === null ? null : Number(lotRow.longitude);
    const latitude = Number.isFinite(parsedLatitude as number)
      ? (parsedLatitude as number)
      : null;
    const longitude = Number.isFinite(parsedLongitude as number)
      ? (parsedLongitude as number)
      : null;

    const [revRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         r.review_id, 
         r.score, 
         r.comment, 
         r.created_at, 
         u.name AS username
       FROM reviews r
       JOIN bookings b ON r.b_id = b.b_id
       JOIN users u ON b.user_id = u.user_id
       WHERE b.lot_id = ?
       ORDER BY r.created_at DESC`,
      [id]
    );

    let vehicleTypes: string[] = [];
    let rules: string[] = [];
    let imageUrls: string[] = [];
    const [metadataRows] = await pool.query<ParkingLotMetadataRow[]>(
      `SELECT vehicle_types_json, rules_json, image_urls_json
      FROM parking_lot_metadata
      WHERE lot_id = ?
      LIMIT 1`,
      [id]
    );

    if (metadataRows.length > 0) {
      vehicleTypes = parseStringArrayValue(metadataRows[0].vehicle_types_json);
      rules = parseStringArrayValue(metadataRows[0].rules_json);
      imageUrls = parseStringArrayValue(metadataRows[0].image_urls_json);
    }

    const addressParts = [
      lotRow.display_address_line_th || lotRow.address_line,
      lotRow.display_street_number_th || lotRow.street_number,
      lotRow.display_subdistrict_th || lotRow.subdistrict,
      lotRow.display_district_th || lotRow.district,
      lotRow.display_amphoe_th || lotRow.amphoe,
      lotRow.display_province_th || lotRow.province,
    ]
      .map((part) => part?.trim())
      .filter(Boolean) as string[];
    const displayLocation = (lotRow.display_location_th || lotRow.location || '').trim();
    const address = addressParts.length > 0 ? addressParts.join(', ') : displayLocation;
    const displayLotName = (lotRow.display_lot_name_th || lotRow.lot_name || '').trim();

    return NextResponse.json({
      lot: {
        id: lotRow.lot_id,
        name: deriveLotName(displayLotName || null, displayLocation, lotRow.lot_id),
        address,
        location: displayLocation,
        description: lotRow.description?.trim() || '',
        price,
        totalSlot,
        availableSlot,
        ownerName: lotRow.owner_name,
        latitude,
        longitude,
        mapEmbedUrl: buildMapEmbedUrl(latitude, longitude),
        imageUrls,
      },
      reservations: reservationRows.map((row) => ({
        id: row.b_id,
        status: row.b_status,
        checkinTime: row.checkin_datetime,
        checkoutTime: row.checkout_datetime,
        blockedUntilTime: row.blocked_until,
      })),
      reviews: revRows,
      vehicleTypes,
      rules,
    });
  } catch (err) {
    console.error('parkingdetail GET failed', err);
    return NextResponse.json(
      { error: 'internal server error' },
      { status: 500 }
    );
  }
}
