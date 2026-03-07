import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import getPool from '@/lib/db/mysql';
import { verifyToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type TokenPayload = {
  userId?: string;
  role?: string;
};

interface ParkingLotRequestRow extends RowDataPacket {
  lot_id: number;
  lot_name: string | null;
  location: string;
  price: number | string;
  total_slot: number;
  is_approve: number | string;
  p_status: 'ACTIVE' | 'INACTIVE';
  submitted_at: Date | string;
  owner_user_id: number;
  owner_username: string;
  owner_name: string;
}

function readBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization') || '';

  if (!authorization.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
}

function toIsoDateString(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toISOString();
}

function mapRequestStatus(isApprove: number, pStatus: 'ACTIVE' | 'INACTIVE'): 'REQUEST' | 'APPROVED' | 'DENIED' {
  if (isApprove === 1) {
    return 'APPROVED';
  }

  if (pStatus === 'INACTIVE') {
    return 'DENIED';
  }

  return 'REQUEST';
}

export async function GET(request: NextRequest) {
  try {
    const token = readBearerToken(request);

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = verifyToken(token) as TokenPayload | null;
    const role = payload?.role?.trim().toLowerCase() || '';

    if (!payload?.userId || role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [rows] = await getPool().query<ParkingLotRequestRow[]>(
      `SELECT
        pl.lot_id,
        pl.lot_name,
        pl.location,
        pl.price,
        pl.total_slot,
        pl.is_approve,
        pl.p_status,
        pl.created_at AS submitted_at,
        pl.owner_user_id,
        u.username AS owner_username,
        u.name AS owner_name
      FROM parking_lots pl
      INNER JOIN users u ON u.user_id = pl.owner_user_id
      ORDER BY
        CASE
          WHEN pl.is_approve = 0 AND pl.p_status = 'ACTIVE' THEN 0
          WHEN pl.is_approve = 1 THEN 1
          ELSE 2
        END,
        pl.created_at DESC,
        pl.lot_id DESC`
    );

    const requests = rows.map((row) => {
      const requestStatus = mapRequestStatus(Number(row.is_approve), row.p_status);
      const lotName = row.lot_name?.trim() || row.location;

      return {
        lotId: row.lot_id,
        lotName,
        location: row.location,
        price: Number(row.price),
        totalSlot: Number(row.total_slot),
        ownerUserId: row.owner_user_id,
        ownerUsername: row.owner_username,
        ownerName: row.owner_name,
        submittedAt: toIsoDateString(row.submitted_at),
        status: requestStatus,
      };
    });

    return NextResponse.json({ requests });
  } catch (error) {
    console.error('Unable to load parking lot requests:', error);
    return NextResponse.json(
      { error: 'Unable to load parking lot requests right now' },
      { status: 500 }
    );
  }
}
