import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import getPool from '@/lib/db/mysql';
import { verifyToken } from '@/lib/auth';
import type { OwnerRequestStatus } from '@/lib/roles';

export const dynamic = 'force-dynamic';

type TokenPayload = {
  userId?: string;
  role?: string;
};

interface OwnerRequestRow extends RowDataPacket {
  user_id: number;
  username: string;
  name: string;
  email: string;
  owner_request_status: OwnerRequestStatus;
  owner_citizen_id: string | null;
  request_updated_at: Date | string;
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

    const [rows] = await getPool().query<OwnerRequestRow[]>(
      `SELECT
        u.user_id,
        u.username,
        u.name,
        u.email,
        u.owner_request_status,
        op.o_citizen_id AS owner_citizen_id,
        u.updated_at AS request_updated_at
      FROM users u
      LEFT JOIN owner_profiles op ON op.user_id = u.user_id
      WHERE u.u_status = 'ACTIVE'
        AND u.owner_request_status IS NOT NULL
      ORDER BY
        CASE u.owner_request_status
          WHEN 'PENDING' THEN 0
          WHEN 'REJECTED' THEN 1
          WHEN 'APPROVED' THEN 2
          ELSE 3
        END,
        u.updated_at DESC,
        u.user_id DESC`
    );

    const requests = rows.map((row) => ({
      userId: row.user_id,
      username: row.username,
      fullName: row.name,
      email: row.email,
      citizenId: row.owner_citizen_id,
      submittedAt: toIsoDateString(row.request_updated_at),
      status: row.owner_request_status,
    }));

    return NextResponse.json({ requests });
  } catch (error) {
    console.error('Unable to load owner requests:', error);
    return NextResponse.json(
      { error: 'Unable to load owner requests right now' },
      { status: 500 }
    );
  }
}