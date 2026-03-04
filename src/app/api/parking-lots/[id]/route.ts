import { NextRequest, NextResponse } from 'next/server';
import { getParkingLotDetail } from '@/lib/parking-lots';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  try {
    const data = await getParkingLotDetail(id);
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    console.error('parking-lots/[id] GET error', err);
    return NextResponse.json({ error: 'internal server error' }, { status: 500 });
  }
}