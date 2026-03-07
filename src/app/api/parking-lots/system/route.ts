import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { verifyToken } from '@/lib/auth';
import getPool from '@/lib/db/mysql';
import { listParkingLotSystemRows } from '@/lib/parking-lots';

export const dynamic = 'force-dynamic';

type TokenPayload = {
  userId?: string;
  role?: string;
};

interface OwnerProfileRow extends RowDataPacket {
  user_id: number;
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
  const segments = [
    addressLine,
    streetNumber,
    subdistrict,
    district,
    amphoe,
    province,
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  return segments.join(', ');
}

function readBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization') || '';

  if (!authorization.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
}

function readRequester(request: NextRequest): { userId: number; role: string } | null {
  const token = readBearerToken(request);

  if (!token) {
    return null;
  }

  const payload = verifyToken(token) as TokenPayload | null;
  const role = payload?.role?.toLowerCase() || '';
  const userId = Number(payload?.userId);

  if (!payload || !Number.isFinite(userId) || userId <= 0) {
    return null;
  }

  return {
    userId,
    role,
  };
}

export async function GET(request: NextRequest) {
  try {
    const requester = readRequester(request);
    if (!requester) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (requester.role !== 'owner' && requester.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parkingLots = await listParkingLotSystemRows(requester.userId, requester.role);
    return NextResponse.json({ parkingLots });
  } catch (error) {
    console.error('Unable to load parking lot system data:', error);
    return NextResponse.json(
      { error: 'Unable to load parking lot system data right now' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const requester = readRequester(request);
    if (!requester) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (requester.role !== 'owner' && requester.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const lotName = typeof body?.lotName === 'string' ? body.lotName.trim() : '';
    const addressLine = typeof body?.addressLine === 'string' ? body.addressLine.trim() : '';
    const streetNumber = typeof body?.streetNumber === 'string' ? body.streetNumber.trim() : '';
    const district = typeof body?.district === 'string' ? body.district.trim() : '';
    const amphoe = typeof body?.amphoe === 'string' ? body.amphoe.trim() : '';
    const subdistrict = typeof body?.subdistrict === 'string' ? body.subdistrict.trim() : '';
    const province = typeof body?.province === 'string' ? body.province.trim() : '';
    const rawLatitude =
      body?.latitude === null || body?.latitude === undefined || body?.latitude === ''
        ? null
        : Number(body.latitude);
    const rawLongitude =
      body?.longitude === null || body?.longitude === undefined || body?.longitude === ''
        ? null
        : Number(body.longitude);
    const description = typeof body?.description === 'string' ? body.description.trim() : '';
    const totalSlotRaw = Number(body?.totalSlot);
    const priceRaw = Number(body?.price);
    const location = buildLocationLabel({
      addressLine,
      streetNumber,
      district,
      amphoe,
      subdistrict,
      province,
    });

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

    if (!location) {
      return NextResponse.json({ error: 'Unable to build location from address fields' }, { status: 400 });
    }

    if (!Number.isInteger(totalSlotRaw) || totalSlotRaw <= 0) {
      return NextResponse.json({ error: 'Total slot must be a positive integer' }, { status: 400 });
    }

    if (!Number.isFinite(priceRaw) || priceRaw <= 0) {
      return NextResponse.json({ error: 'Price must be greater than 0' }, { status: 400 });
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

    const pool = getPool();
    const [ownerRows] = await pool.query<OwnerProfileRow[]>(
      `SELECT user_id
      FROM owner_profiles
      WHERE user_id = ?
      LIMIT 1`,
      [requester.userId]
    );

    if (ownerRows.length === 0) {
      return NextResponse.json(
        { error: 'Only approved owners can create parking lot requests' },
        { status: 403 }
      );
    }

    const [insertResult] = await pool.query<ResultSetHeader>(
      `INSERT INTO parking_lots (
        owner_user_id,
        lot_name,
        description,
        is_approve,
        p_status,
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
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, 0, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        requester.userId,
        lotName || null,
        description || null,
        location,
        addressLine || null,
        streetNumber || null,
        district || null,
        amphoe || null,
        subdistrict || null,
        province || null,
        rawLatitude,
        rawLongitude,
        totalSlotRaw,
        priceRaw,
      ]
    );

    return NextResponse.json({
      success: true,
      message: 'Parking lot request submitted',
      parkingLot: {
        id: insertResult.insertId,
        status: 'REQUEST',
      },
    });
  } catch (error) {
    console.error('Unable to create parking lot request:', error);
    return NextResponse.json(
      { error: 'Unable to create parking lot request right now' },
      { status: 500 }
    );
  }
}
