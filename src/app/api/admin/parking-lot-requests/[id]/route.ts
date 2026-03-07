import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import getPool from '@/lib/db/mysql';
import { verifyToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type ParkingLotRequestAction = 'APPROVE' | 'DENY';

type TokenPayload = {
  userId?: string;
  role?: string;
};

interface ParkingLotStatusRow extends RowDataPacket {
  lot_id: number;
  is_approve: number | string;
  p_status: 'ACTIVE' | 'INACTIVE';
}

function readBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization') || '';

  if (!authorization.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
}

function parseLotId(rawId: string): number | null {
  const parsed = Number(rawId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function isPendingRequest(isApprove: number, pStatus: 'ACTIVE' | 'INACTIVE'): boolean {
  return isApprove === 0 && pStatus === 'ACTIVE';
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const lotId = parseLotId(params.id);
    if (!lotId) {
      return NextResponse.json({ error: 'Invalid parking lot id' }, { status: 400 });
    }

    const body = await request.json();
    const action = typeof body?.action === 'string' ? body.action.toUpperCase() as ParkingLotRequestAction : null;

    if (!action || (action !== 'APPROVE' && action !== 'DENY')) {
      return NextResponse.json({ error: 'Invalid action. Use APPROVE or DENY' }, { status: 400 });
    }

    const pool = getPool();
    const [currentRows] = await pool.query<ParkingLotStatusRow[]>(
      `SELECT lot_id, is_approve, p_status
      FROM parking_lots
      WHERE lot_id = ?
      LIMIT 1`,
      [lotId]
    );

    if (currentRows.length === 0) {
      return NextResponse.json({ error: 'Parking lot not found' }, { status: 404 });
    }

    const currentLot = currentRows[0];
    const currentApprove = Number(currentLot.is_approve);

    if (!isPendingRequest(currentApprove, currentLot.p_status)) {
      return NextResponse.json({ error: 'Parking lot request is not pending' }, { status: 409 });
    }

    let updateResult: ResultSetHeader;
    if (action === 'APPROVE') {
      [updateResult] = await pool.query<ResultSetHeader>(
        `UPDATE parking_lots
        SET is_approve = 1,
            p_status = 'ACTIVE',
            updated_at = NOW()
        WHERE lot_id = ?
          AND is_approve = 0
          AND p_status = 'ACTIVE'`,
        [lotId]
      );
    } else {
      [updateResult] = await pool.query<ResultSetHeader>(
        `UPDATE parking_lots
        SET is_approve = 0,
            p_status = 'INACTIVE',
            updated_at = NOW()
        WHERE lot_id = ?
          AND is_approve = 0
          AND p_status = 'ACTIVE'`,
        [lotId]
      );
    }

    if (updateResult.affectedRows === 0) {
      return NextResponse.json({ error: 'Parking lot request is no longer pending' }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      message: action === 'APPROVE' ? 'Parking lot request approved' : 'Parking lot request denied',
      lot: {
        lotId,
        status: action === 'APPROVE' ? 'APPROVED' : 'DENIED',
      },
    });
  } catch (error) {
    console.error('Unable to update parking lot request:', error);
    return NextResponse.json(
      { error: 'Unable to update parking lot request right now' },
      { status: 500 }
    );
  }
}
