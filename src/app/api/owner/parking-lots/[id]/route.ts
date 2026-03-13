import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { verifyToken } from '@/lib/auth';
import getPool from '@/lib/db/mysql';
import { ensureParkingLotMetadataSchema } from '@/lib/parking-lot-metadata';
import {
  buildLocationMetadataDbPayload,
  buildNormalizedLocationLabel,
  LocationNormalizationService,
} from '@/lib/location-normalization';

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

const METADATA_LOCATION_COLUMNS = [
  'raw_name',
  'raw_address',
  'raw_house_number',
  'raw_district',
  'raw_amphoe',
  'raw_subdistrict',
  'raw_province',
  'raw_latitude',
  'raw_longitude',
  'raw_input_lang',
  'place_id',
  'normalized_name_en',
  'normalized_name_th',
  'normalized_address_en',
  'normalized_address_th',
  'normalized_house_number',
  'normalized_district_en',
  'normalized_district_th',
  'normalized_amphoe_en',
  'normalized_amphoe_th',
  'normalized_subdistrict_en',
  'normalized_subdistrict_th',
  'normalized_province_en',
  'normalized_province_th',
  'normalized_country_code',
  'normalized_latitude',
  'normalized_longitude',
  'resolution_status',
  'resolution_source',
  'confidence_score',
  'is_fallback_translation',
  'display_lot_name_th',
  'display_location_th',
  'display_address_line_th',
  'display_street_number_th',
  'display_district_th',
  'display_amphoe_th',
  'display_subdistrict_th',
  'display_province_th',
] as const;

type MetadataLocationColumn = (typeof METADATA_LOCATION_COLUMNS)[number];

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

function buildRawLocationLabel(payload: {
  addressLine: string;
  streetNumber: string;
  district: string;
  amphoe: string;
  subdistrict: string;
  province: string;
}): string {
  return buildNormalizedLocationLabel([
    payload.addressLine,
    payload.streetNumber,
    payload.subdistrict,
    payload.district,
    payload.amphoe,
    payload.province,
  ]);
}

function normalizeStringArray(value: unknown): string[] {
  const uniqueValues = new Set<string>();

  if (Array.isArray(value)) {
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

  if (typeof value === 'string') {
    const normalizedValue = value.trim();
    if (!normalizedValue) {
      return [];
    }

    try {
      const parsed = JSON.parse(normalizedValue) as unknown;
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
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
    } catch {
      // fall back to comma/newline parser
    }

    normalizedValue
      .split('\n')
      .flatMap((line) => line.split(','))
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => uniqueValues.add(item));
  }

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
  await ensureParkingLotMetadataSchema();

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

    const lotNameRaw = typeof body?.name === 'string' ? body.name : '';
    const descriptionRaw = typeof body?.description === 'string' ? body.description : '';
    const addressLineRaw = typeof body?.addressLine === 'string' ? body.addressLine : '';
    const streetNumberRaw = typeof body?.streetNumber === 'string' ? body.streetNumber : '';
    const districtRaw = typeof body?.district === 'string' ? body.district : '';
    const amphoeRaw = typeof body?.amphoe === 'string' ? body.amphoe : '';
    const subdistrictRaw = typeof body?.subdistrict === 'string' ? body.subdistrict : '';
    const provinceRaw = typeof body?.province === 'string' ? body.province : '';
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

    const lotName = lotNameRaw.trim();
    const addressLine = addressLineRaw.trim();
    const streetNumber = streetNumberRaw.trim();
    const district = districtRaw.trim();
    const amphoe = amphoeRaw.trim();
    const subdistrict = subdistrictRaw.trim();
    const province = provinceRaw.trim();

    if (!lotName) {
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
      return NextResponse.json(
        { error: 'Total slots must be a positive integer' },
        { status: 400 }
      );
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
        return NextResponse.json(
          { error: 'Longitude must be between -180 and 180' },
          { status: 400 }
        );
      }
    }

    const rawLocation = buildRawLocationLabel({
      addressLine: addressLineRaw,
      streetNumber: streetNumberRaw,
      district: districtRaw,
      amphoe: amphoeRaw,
      subdistrict: subdistrictRaw,
      province: provinceRaw,
    });

    if (!rawLocation) {
      return NextResponse.json(
        { error: 'Unable to build location from address fields' },
        { status: 400 }
      );
    }

    const normalizer = new LocationNormalizationService();
    const normalizationResult = await normalizer.normalize({
      name: lotNameRaw,
      address: addressLineRaw,
      houseNumber: streetNumberRaw,
      district: districtRaw,
      amphoe: amphoeRaw,
      subdistrict: subdistrictRaw,
      province: provinceRaw,
      latitude: rawLatitude,
      longitude: rawLongitude,
    });

    const metadataLocationPayload = buildLocationMetadataDbPayload(
      lotNameRaw,
      normalizationResult
    );
    const metadataLocationValues = METADATA_LOCATION_COLUMNS.map(
      (column) => metadataLocationPayload[column as MetadataLocationColumn]
    );

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
        lotNameRaw || null,
        descriptionRaw || null,
        rawLocation,
        addressLineRaw || null,
        streetNumberRaw || null,
        districtRaw || null,
        amphoeRaw || null,
        subdistrictRaw || null,
        provinceRaw || null,
        rawLatitude,
        rawLongitude,
        totalSlots,
        price,
        status,
        lotId,
      ]
    );

    try {
      await ensureParkingLotMetadataSchema();

      await pool.query(
        `INSERT INTO parking_lot_metadata (
          lot_id,
          vehicle_types_json,
          rules_json,
          ${METADATA_LOCATION_COLUMNS.join(',\n          ')}
        )
        VALUES (?, ?, ?, ${METADATA_LOCATION_COLUMNS.map(() => '?').join(', ')})
        ON DUPLICATE KEY UPDATE
          vehicle_types_json = VALUES(vehicle_types_json),
          rules_json = VALUES(rules_json),
          ${METADATA_LOCATION_COLUMNS.map((column) => `${column} = VALUES(${column})`).join(',\n          ')},
          updated_at = CURRENT_TIMESTAMP`,
        [
          lotId,
          vehicleTypes.length > 0 ? JSON.stringify(vehicleTypes) : null,
          rules.length > 0 ? JSON.stringify(rules) : null,
          ...metadataLocationValues,
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
