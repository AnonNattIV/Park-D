import 'server-only';

import type { RowDataPacket } from 'mysql2';
import getPool from '@/lib/db/mysql';
import { ensureParkingLotMetadataSchema } from '@/lib/parking-lot-metadata';
import { buildGoogleMapsEmbedUrl } from '@/lib/google-maps';

interface ParkingLotRow extends RowDataPacket {
  lot_id: number;
  lot_name: string | null;
  location: string;
  description: string | null;
  total_slot: number;
  price: number | string;
  latitude: number | string | null;
  longitude: number | string | null;
  owner_name: string;
  active_bookings: number | string;
}

interface ParkingLotSystemDbRow extends RowDataPacket {
  lot_id: number;
  lot_name: string | null;
  location: string;
  total_slot: number;
  price: number | string;
  p_status: string;
  is_approve: number | string;
  owner_name: string;
  address_line: string | null;
  street_number: string | null;
  district: string | null;
  amphoe: string | null;
  subdistrict: string | null;
  province: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  owner_income: number | string;
}

export interface HomeParkingLot {
  id: number;
  name: string;
  address: string;
  description: string;
  available: number;
  total: number;
  price: number;
  priceLabel: string;
  image: string;
  mapEmbedUrl: string | null;
  ownerName: string;
}

export interface ParkingLotSystemRow {
  id: number;
  name: string;
  addressLine: string;
  streetNumber: string;
  district: string;
  amphoe: string;
  subdistrict: string;
  province: string;
  total: number;
  price: number;
  priceLabel: string;
  status: string;
  ownerName: string;
  latitude: number | null;
  longitude: number | null;
  ownerIncome: number;
}

export interface ParkingLotDetail {
  lot: RowDataPacket;
  reviews: Array<{ score: number; comment: string; username: string }>;
  // vehicleTypes, rules, images … // จะเติมเมื่อ spec ชัด
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

function buildPriceLabel(price: number): string {
  const hasDecimal = !Number.isInteger(price);
  return `${price.toLocaleString('th-TH', {
    minimumFractionDigits: hasDecimal ? 2 : 0,
    maximumFractionDigits: hasDecimal ? 2 : 0,
  })} บาท/ชม.`;
}

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

function deriveLotIcon(location: string, index: number): string {
  const normalizedLocation = location.toLowerCase();

  if (normalizedLocation.includes('mall')) {
    return '🅿️';
  }

  if (normalizedLocation.includes('siam') || normalizedLocation.includes('city')) {
    return '🚗';
  }

  if (normalizedLocation.includes('airport')) {
    return '✈️';
  }

  const fallbackIcons = ['🅿️', '🚗', '🚙', '🏢'];
  return fallbackIcons[index % fallbackIcons.length];
}

function buildMapEmbedUrl(
  latitude: number | null,
  longitude: number | null
): string | null {
  return buildGoogleMapsEmbedUrl(latitude, longitude);
}

function normalizeText(value: string | null | undefined): string {
  const normalizedValue = value?.trim();
  return normalizedValue || '-';
}

async function ensureCheckoutSettlementTableExists(): Promise<void> {
  await getPool().query(
    `CREATE TABLE IF NOT EXISTS booking_checkout_settlements (
      b_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      owner_user_id BIGINT UNSIGNED NOT NULL,
      renter_user_id BIGINT UNSIGNED NOT NULL,
      pay_id BIGINT UNSIGNED NULL,
      pay_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      rent_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      owner_share DECIMAL(12,2) NOT NULL DEFAULT 0,
      platform_share DECIMAL(12,2) NOT NULL DEFAULT 0,
      renter_refund DECIMAL(12,2) NOT NULL DEFAULT 0,
      owner_bonus DECIMAL(12,2) NOT NULL DEFAULT 0,
      settlement_reason ENUM('OWNER_APPROVED', 'AUTO_APPROVED_7H', 'AUTO_CHECKOUT_NO_CHECKIN') NOT NULL,
      settled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_booking_checkout_settlements_booking
        FOREIGN KEY (b_id) REFERENCES bookings(b_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

export async function listHomeParkingLots(locationFilter?: string): Promise<HomeParkingLot[]> {
  await ensureParkingLotMetadataSchema();

  const normalizedLocationFilter = locationFilter?.trim();
  const params: Array<string | number> = [...occupiedBookingStatuses];
  let locationClause = '';

  if (normalizedLocationFilter) {
    locationClause =
      " AND COALESCE(NULLIF(TRIM(plm.display_location_th), ''), pl.location) LIKE ?";
    params.push(`%${normalizedLocationFilter}%`);
  }

  const [rows] = await getPool().query<ParkingLotRow[]>(
    `SELECT
      pl.lot_id,
      COALESCE(NULLIF(TRIM(plm.display_lot_name_th), ''), pl.lot_name) AS lot_name,
      COALESCE(NULLIF(TRIM(plm.display_location_th), ''), pl.location) AS location,
      pl.description,
      pl.total_slot,
      pl.price,
      pl.latitude,
      pl.longitude,
      u.name AS owner_name,
      COALESCE(SUM(
        CASE
          WHEN b.b_status IN (${occupiedBookingStatuses.map(() => '?').join(', ')})
            AND (
              b.checkin_datetime IS NULL
              OR b.checkout_datetime IS NULL
              OR (
                b.checkin_datetime < DATE_ADD(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00'), INTERVAL 1 HOUR)
                AND DATE_ADD(b.checkout_datetime, INTERVAL 30 MINUTE) > CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00')
              )
            )
          THEN 1
          ELSE 0
        END
      ), 0) AS active_bookings
    FROM parking_lots pl
    LEFT JOIN parking_lot_metadata plm ON plm.lot_id = pl.lot_id
    INNER JOIN users u ON u.user_id = pl.owner_user_id
    LEFT JOIN bookings b ON b.lot_id = pl.lot_id
    WHERE pl.is_approve = 1
      AND pl.p_status = 'ACTIVE'${locationClause}
    GROUP BY
      pl.lot_id,
      pl.lot_name,
      pl.location,
      plm.display_lot_name_th,
      plm.display_location_th,
      pl.description,
      pl.total_slot,
      pl.price,
      pl.latitude,
      pl.longitude,
      u.name
    ORDER BY pl.created_at DESC, pl.lot_id DESC`,
    params
  );

  return rows.map((row, index) => {
    const total = Number(row.total_slot);
    const occupied = Number(row.active_bookings || 0);
    const price = Number(row.price);
    const latitude = row.latitude === null ? null : Number(row.latitude);
    const longitude = row.longitude === null ? null : Number(row.longitude);
    const displayLocation = row.location;
    const displayLotName = row.lot_name?.trim() || '';

    return {
      id: row.lot_id,
      name: deriveLotName(
        displayLotName || row.lot_name,
        displayLocation || row.location,
        row.lot_id
      ),
      address: displayLocation || row.location,
      description: row.description?.trim() || 'Parking lot available now.',
      available: Math.max(total - occupied, 0),
      total,
      price,
      priceLabel: buildPriceLabel(price),
      image: deriveLotIcon(row.location, index),
      mapEmbedUrl: buildMapEmbedUrl(latitude, longitude),
      ownerName: row.owner_name,
    };
  });
}

export async function listParkingLotSystemRows(
  userId: number,
  role: string
): Promise<ParkingLotSystemRow[]> {
  await ensureCheckoutSettlementTableExists();

  const normalizedRole = role.toLowerCase();
  let ownerClause = '';
  const params: number[] = [];

  if (normalizedRole === 'owner') {
    ownerClause = ' WHERE pl.owner_user_id = ?';
    params.push(userId);
  }

  const [rows] = await getPool().query<ParkingLotSystemDbRow[]>(
    `SELECT
      pl.lot_id,
      pl.lot_name,
      pl.location,
      pl.total_slot,
      pl.price,
      pl.p_status,
      pl.is_approve,
      u.name AS owner_name,
      pl.address_line,
      pl.street_number,
      pl.district,
      pl.amphoe,
      pl.subdistrict,
      pl.province,
      pl.latitude,
      pl.longitude,
      COALESCE((
        SELECT ROUND(SUM(
          CASE
            WHEN bcs.b_id IS NOT NULL THEN (bcs.owner_share + bcs.owner_bonus)
            WHEN b.b_status = 'CHECKOUT_APPROVED'
             AND p.pay_status = 'PAID'
             AND b.checkin_datetime IS NOT NULL
             AND b.checkout_datetime IS NOT NULL
            THEN (p.pay_amount / 1.5) * 0.8
            ELSE 0
          END
        ), 2)
        FROM bookings b
        LEFT JOIN booking_checkout_settlements bcs ON bcs.b_id = b.b_id
        LEFT JOIN payments p ON p.b_id = b.b_id
        WHERE b.lot_id = pl.lot_id
      ), 0) AS owner_income
    FROM parking_lots pl
    INNER JOIN users u ON u.user_id = pl.owner_user_id${ownerClause}
    ORDER BY pl.created_at DESC, pl.lot_id DESC`,
    params
  );

  return rows.map((row) => {
    const price = Number(row.price);

    return {
      id: row.lot_id,
      name: deriveLotName(row.lot_name, row.location, row.lot_id),
      addressLine: row.address_line?.trim() || row.location,
      streetNumber: normalizeText(row.street_number),
      district: normalizeText(row.district),
      amphoe: normalizeText(row.amphoe),
      subdistrict: normalizeText(row.subdistrict),
      province: normalizeText(row.province),
      total: Number(row.total_slot),
      price,
      priceLabel: buildPriceLabel(price),
      status: `${Number(row.is_approve) === 1 ? 'Approved' : 'Pending'} / ${row.p_status}`,
      ownerName: row.owner_name,
      latitude: row.latitude === null ? null : Number(row.latitude),
      longitude: row.longitude === null ? null : Number(row.longitude),
      ownerIncome: Number(row.owner_income || 0),
    };
  });

  
}

export async function getParkingLotDetail(lotId: number): Promise<ParkingLotDetail | null> {
  const pool = getPool();
  const [lotRows] = await pool.query<RowDataPacket[]>(
    'SELECT lot_id, lot_name, description, location, price, total_slot, /* … */ ' +
    'FROM parking_lots WHERE lot_id = ?',
    [lotId]
  );
  if (lotRows.length === 0) return null;
  const lot = lotRows[0];

  const [revRows] = await pool.query<RowDataPacket[]>(
    `SELECT r.score, r.comment, u.username
     FROM reviews r
     JOIN bookings b ON b.b_id = r.b_id
     JOIN users u ON u.user_id = b.user_id
     WHERE b.lot_id = ?`,
    [lotId]
  );

  return {
    lot,
    reviews: revRows as any,
    // TODO: vehicleTypes, rules, images
  };
}

