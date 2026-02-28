import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { listParkingLotSystemRows } from '@/lib/parking-lots';

export const dynamic = 'force-dynamic';

type TokenPayload = {
  userId?: string;
  role?: string;
};

function readBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization') || '';

  if (!authorization.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
}

export async function GET(request: NextRequest) {
  try {
    const token = readBearerToken(request);

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = verifyToken(token) as TokenPayload | null;
    const role = payload?.role?.toLowerCase() || '';
    const userId = Number(payload?.userId);

    if (!payload || !Number.isFinite(userId)) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parkingLots = await listParkingLotSystemRows(userId, role);
    return NextResponse.json({ parkingLots });
  } catch (error) {
    console.error('Unable to load parking lot system data:', error);
    return NextResponse.json(
      { error: 'Unable to load parking lot system data right now' },
      { status: 500 }
    );
  }
}
