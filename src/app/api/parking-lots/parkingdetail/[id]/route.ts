import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import getPool from '@/lib/db/mysql';

interface ParkingLotDetailRow extends RowDataPacket {
  lot_id: number;
  lot_name: string | null;
  description: string | null;
  location: string;
  price: number | string;
  total_slot: number | string;
  address_line: string | null;
  street_number: string | null;
  district: string | null;
  amphoe: string | null;
  subdistrict: string | null;
  province: string | null;
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
  if (latitude === null || longitude === null) {
    return null;
  }

  const bbox = [
    longitude - 0.0045,
    latitude - 0.0045,
    longitude + 0.0045,
    latitude + 0.0045,
  ]
    .map((value) => value.toFixed(6))
    .join(',');

  const marker = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;

  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
    bbox
  )}&layer=mapnik&marker=${encodeURIComponent(marker)}`;
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
    const pool = getPool();

    const [lotRows] = await pool.query<ParkingLotDetailRow[]>(
      `SELECT
        pl.lot_id,
        pl.lot_name,
        pl.description,
        pl.location,
        pl.price,
        pl.total_slot,
        pl.address_line,
        pl.street_number,
        pl.district,
        pl.amphoe,
        pl.subdistrict,
        pl.province,
        pl.latitude,
        pl.longitude,
        u.name AS owner_name
      FROM parking_lots pl
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
        AND b_status IN (${occupiedBookingStatuses.map(() => '?').join(', ')})`,
      [id, ...occupiedBookingStatuses]
    );

    const totalSlot = Number(lotRow.total_slot || 0);
    const activeBookings = Number(activeBookingRows[0]?.active_bookings || 0);
    const availableSlot = Math.max(totalSlot - activeBookings, 0);
    const price = Number(lotRow.price || 0);

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
      `SELECT r.score, r.comment, u.username
       FROM reviews r
       JOIN bookings b ON b.b_id = r.b_id
       JOIN users u ON u.user_id = b.user_id
       WHERE b.lot_id = ?`,
      [id]
    );

    const [metadataTableRows] = await pool.query<RowDataPacket[]>(
      `SELECT 1
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = 'parking_lot_metadata'
      LIMIT 1`
    );

    let vehicleTypes: string[] = [];
    let rules: string[] = [];

    if (metadataTableRows.length > 0) {
      const [metadataRows] = await pool.query<ParkingLotMetadataRow[]>(
        `SELECT vehicle_types_json, rules_json
        FROM parking_lot_metadata
        WHERE lot_id = ?
        LIMIT 1`,
        [id]
      );

      if (metadataRows.length > 0) {
        vehicleTypes = parseStringArrayValue(metadataRows[0].vehicle_types_json);
        rules = parseStringArrayValue(metadataRows[0].rules_json);
      }
    }

    const addressParts = [
      lotRow.address_line,
      lotRow.street_number,
      lotRow.subdistrict,
      lotRow.district,
      lotRow.amphoe,
      lotRow.province,
    ]
      .map((part) => part?.trim())
      .filter(Boolean) as string[];

    const address =
      addressParts.length > 0 ? addressParts.join(', ') : lotRow.location;

    return NextResponse.json({
      lot: {
        id: lotRow.lot_id,
        name: deriveLotName(lotRow.lot_name, lotRow.location, lotRow.lot_id),
        address,
        location: lotRow.location,
        description: lotRow.description?.trim() || '',
        price,
        totalSlot,
        availableSlot,
        ownerName: lotRow.owner_name,
        latitude,
        longitude,
        mapEmbedUrl: buildMapEmbedUrl(latitude, longitude),
      },
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
