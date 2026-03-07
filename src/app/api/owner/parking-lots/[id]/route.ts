import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { verifyToken } from '@/lib/auth';
import getPool from '@/lib/db/mysql';

export const dynamic = 'force-dynamic';

type TokenPayload = {
  userId?: string;
  role?: string;
};

interface ParkingLotOwnerRow extends RowDataPacket {
  lot_id: number;
  owner_user_id: number;
  lot_name: string | null;
  description: string | null;
  location: string;
  address_line: string | null;
  street_number: string | null;
  district: string | null;
  amphoe: string | null;
  subdistrict: string | null;
  province: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  total_slot: number | string;
  price: number | string;
  p_status: 'ACTIVE' | 'INACTIVE';
  is_approve: number | string;
}

interface ParkingLotMetadataRow extends RowDataPacket {
  vehicle_types_json: unknown;
  rules_json: unknown;
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

function parseLotId(rawId: string): number | null {
  const lotId = Number(rawId);
  if (!Number.isInteger(lotId) || lotId <= 0) {
    return null;
  }

  return lotId;
}

function buildLocationLabel({
  addressLine,
  streetNumber,
  district,
  amphoe,
  subdistrict,
  province,
}: {
  addressLine: string;
  streetNumber: string;
  district: string;
  amphoe: string;
  subdistrict: string;
  province: string;
}): string {
  return [
    addressLine,
    streetNumber,
    subdistrict,
    district,
    amphoe,
    province,
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(', ');
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueValues = new Set<string>();
  value.forEach((item) => {
    if (typeof item !== 'string') {
      return;
    }

    const normalizedItem = item.trim();
    if (!normalizedItem) {
      return;
    }

    uniqueValues.add(normalizedItem);
  });

  return Array.from(uniqueValues);
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

async function readLotForOwner(lotId: number): Promise<ParkingLotOwnerRow | null> {
  const pool = getPool();
  const [rows] = await pool.query<ParkingLotOwnerRow[]>(
    `SELECT
      lot_id,
      owner_user_id,
      lot_name,
      description,
      location,
      address_line,
      street_number,
      district,
      amphoe,
      subdistrict,
      province,
      latitude,
      longitude,
      total_slot,
      price,
      p_status,
      is_approve
    FROM parking_lots
    WHERE lot_id = ?
    LIMIT 1`,
    [lotId]
  );

  return rows[0] || null;
}

async function readParkingLotMetadata(
  lotId: number
): Promise<{ vehicleTypes: string[]; rules: string[] }> {
  const pool = getPool();
  const [tableRows] = await pool.query<RowDataPacket[]>(
    `SELECT 1
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = 'parking_lot_metadata'
    LIMIT 1`
  );

  if (tableRows.length === 0) {
    return { vehicleTypes: [], rules: [] };
  }

  const [metadataRows] = await pool.query<ParkingLotMetadataRow[]>(
    `SELECT vehicle_types_json, rules_json
    FROM parking_lot_metadata
    WHERE lot_id = ?
    LIMIT 1`,
    [lotId]
  );

  if (metadataRows.length === 0) {
    return { vehicleTypes: [], rules: [] };
  }

  return {
    vehicleTypes: parseStringArrayValue(metadataRows[0].vehicle_types_json),
    rules: parseStringArrayValue(metadataRows[0].rules_json),
  };
}

function mapParkingLotResponse(
  row: ParkingLotOwnerRow,
  metadata: { vehicleTypes: string[]; rules: string[] }
) {
  return {
    id: row.lot_id,
    ownerUserId: Number(row.owner_user_id),
    name: row.lot_name?.trim() || row.location,
    description: row.description?.trim() || '',
    location: row.location,
    addressLine: row.address_line?.trim() || '',
    streetNumber: row.street_number?.trim() || '',
    district: row.district?.trim() || '',
    amphoe: row.amphoe?.trim() || '',
    subdistrict: row.subdistrict?.trim() || '',
    province: row.province?.trim() || '',
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    totalSlots: Number(row.total_slot),
    price: Number(row.price),
    status: row.p_status,
    isApproved: Number(row.is_approve) === 1,
    vehicleTypes: metadata.vehicleTypes,
    rules: metadata.rules,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const requester = readRequester(request);
    if (!requester) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (requester.role !== 'owner' && requester.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const lotId = parseLotId(params.id);
    if (!lotId) {
      return NextResponse.json({ error: 'Invalid parking lot id' }, { status: 400 });
    }

    const lotRow = await readLotForOwner(lotId);
    if (!lotRow) {
      return NextResponse.json({ error: 'Parking lot not found' }, { status: 404 });
    }

    if (requester.role !== 'admin' && Number(lotRow.owner_user_id) !== requester.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const metadata = await readParkingLotMetadata(lotId);
    return NextResponse.json({
      success: true,
      parkingLot: mapParkingLotResponse(lotRow, metadata),
    });
  } catch (error) {
    console.error('Unable to load owner parking lot:', error);
    return NextResponse.json(
      { error: 'Unable to load parking lot right now' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const requester = readRequester(request);
    if (!requester) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (requester.role !== 'owner' && requester.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const lotId = parseLotId(params.id);
    if (!lotId) {
      return NextResponse.json({ error: 'Invalid parking lot id' }, { status: 400 });
    }

    const existingLot = await readLotForOwner(lotId);
    if (!existingLot) {
      return NextResponse.json({ error: 'Parking lot not found' }, { status: 404 });
    }

    if (requester.role !== 'admin' && Number(existingLot.owner_user_id) !== requester.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const description = typeof body?.description === 'string' ? body.description.trim() : '';
    const addressLine = typeof body?.addressLine === 'string' ? body.addressLine.trim() : '';
    const streetNumber = typeof body?.streetNumber === 'string' ? body.streetNumber.trim() : '';
    const district = typeof body?.district === 'string' ? body.district.trim() : '';
    const amphoe = typeof body?.amphoe === 'string' ? body.amphoe.trim() : '';
    const subdistrict = typeof body?.subdistrict === 'string' ? body.subdistrict.trim() : '';
    const province = typeof body?.province === 'string' ? body.province.trim() : '';
    const totalSlots = Number(body?.totalSlots);
    const price = Number(body?.price);
    const statusRaw = typeof body?.status === 'string' ? body.status.trim().toUpperCase() : '';
    const status = statusRaw === 'ACTIVE' || statusRaw === 'INACTIVE' ? statusRaw : '';
    const rawLatitude =
      body?.latitude === null || body?.latitude === undefined || body?.latitude === ''
        ? null
        : Number(body.latitude);
    const rawLongitude =
      body?.longitude === null || body?.longitude === undefined || body?.longitude === ''
        ? null
        : Number(body.longitude);
    const vehicleTypes = normalizeStringArray(body?.vehicleTypes);
    const rules = normalizeStringArray(body?.rules);

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (!addressLine) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    if (!streetNumber) {
      return NextResponse.json({ error: 'Number is required' }, { status: 400 });
    }

    if (!district) {
      return NextResponse.json({ error: 'District is required' }, { status: 400 });
    }

    if (!amphoe) {
      return NextResponse.json({ error: 'Amphoe is required' }, { status: 400 });
    }

    if (!subdistrict) {
      return NextResponse.json({ error: 'Subdistrict is required' }, { status: 400 });
    }

    if (!province) {
      return NextResponse.json({ error: 'Province is required' }, { status: 400 });
    }

    if (!Number.isInteger(totalSlots) || totalSlots <= 0) {
      return NextResponse.json({ error: 'Total slots must be a positive integer' }, { status: 400 });
    }

    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: 'Price must be greater than 0' }, { status: 400 });
    }

    if (!status) {
      return NextResponse.json({ error: 'Status must be ACTIVE or INACTIVE' }, { status: 400 });
    }

    if ((rawLatitude === null) !== (rawLongitude === null)) {
      return NextResponse.json(
        { error: 'Both latitude and longitude are required when filling coordinates' },
        { status: 400 }
      );
    }

    if (rawLatitude !== null) {
      if (!Number.isFinite(rawLatitude) || rawLatitude < -90 || rawLatitude > 90) {
        return NextResponse.json({ error: 'Latitude must be between -90 and 90' }, { status: 400 });
      }
    }

    if (rawLongitude !== null) {
      if (!Number.isFinite(rawLongitude) || rawLongitude < -180 || rawLongitude > 180) {
        return NextResponse.json({ error: 'Longitude must be between -180 and 180' }, { status: 400 });
      }
    }

    const location = buildLocationLabel({
      addressLine,
      streetNumber,
      district,
      amphoe,
      subdistrict,
      province,
    });

    if (!location) {
      return NextResponse.json(
        { error: 'Unable to build location from address fields' },
        { status: 400 }
      );
    }

    const pool = getPool();
    await pool.query(
      `UPDATE parking_lots
      SET
        lot_name = ?,
        description = ?,
        location = ?,
        address_line = ?,
        street_number = ?,
        district = ?,
        amphoe = ?,
        subdistrict = ?,
        province = ?,
        latitude = ?,
        longitude = ?,
        total_slot = ?,
        price = ?,
        p_status = ?,
        updated_at = NOW()
      WHERE lot_id = ?
      LIMIT 1`,
      [
        name,
        description || null,
        location,
        addressLine,
        streetNumber,
        district,
        amphoe,
        subdistrict,
        province,
        rawLatitude,
        rawLongitude,
        totalSlots,
        price,
        status,
        lotId,
      ]
    );

    try {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS parking_lot_metadata (
          lot_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
          vehicle_types_json TEXT NULL,
          rules_json TEXT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_parking_lot_metadata_lot
            FOREIGN KEY (lot_id) REFERENCES parking_lots(lot_id)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      );

      await pool.query(
        `INSERT INTO parking_lot_metadata (
          lot_id,
          vehicle_types_json,
          rules_json
        )
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          vehicle_types_json = VALUES(vehicle_types_json),
          rules_json = VALUES(rules_json),
          updated_at = CURRENT_TIMESTAMP`,
        [
          lotId,
          vehicleTypes.length > 0 ? JSON.stringify(vehicleTypes) : null,
          rules.length > 0 ? JSON.stringify(rules) : null,
        ]
      );
    } catch (metadataError) {
      console.error('Unable to update parking lot metadata:', metadataError);
    }

    const updatedLot = await readLotForOwner(lotId);
    if (!updatedLot) {
      return NextResponse.json({ error: 'Parking lot not found after update' }, { status: 404 });
    }

    const metadata = await readParkingLotMetadata(lotId);
    return NextResponse.json({
      success: true,
      message: 'Parking lot updated',
      parkingLot: mapParkingLotResponse(updatedLot, metadata),
    });
  } catch (error) {
    console.error('Unable to update owner parking lot:', error);
    return NextResponse.json(
      { error: 'Unable to update parking lot right now' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const requester = readRequester(request);
    if (!requester) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (requester.role !== 'owner' && requester.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const lotId = parseLotId(params.id);
    if (!lotId) {
      return NextResponse.json({ error: 'Invalid parking lot id' }, { status: 400 });
    }

    const existingLot = await readLotForOwner(lotId);
    if (!existingLot) {
      return NextResponse.json({ error: 'Parking lot not found' }, { status: 404 });
    }

    if (requester.role !== 'admin' && Number(existingLot.owner_user_id) !== requester.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const pool = getPool();
    const [deleteResult] = await pool.query<ResultSetHeader>(
      `DELETE FROM parking_lots
      WHERE lot_id = ?
      LIMIT 1`,
      [lotId]
    );

    if (deleteResult.affectedRows === 0) {
      return NextResponse.json({ error: 'Parking lot not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Parking lot deleted',
    });
  } catch (error) {
    const dbError = error as { code?: string };
    if (dbError.code === 'ER_ROW_IS_REFERENCED_2') {
      return NextResponse.json(
        { error: 'Unable to delete this parking lot because bookings already exist' },
        { status: 409 }
      );
    }

    console.error('Unable to delete owner parking lot:', error);
    return NextResponse.json(
      { error: 'Unable to delete parking lot right now' },
      { status: 500 }
    );
  }
}
