import { NextRequest, NextResponse } from 'next/server';
import { getParkingLotImageByKey } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { key: string[] } }
) {
  try {
    const rawKey = Array.isArray(params.key) ? params.key : [];
    const objectKey = rawKey.map((segment) => decodeURIComponent(segment)).join('/');

    if (!objectKey) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    const image = await getParkingLotImageByKey(objectKey);
    const body = new ArrayBuffer(image.body.byteLength);
    new Uint8Array(body).set(image.body);

    return new NextResponse(body, {
      headers: {
        'Content-Type': image.contentType,
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    console.error('Parking lot image fetch error:', error);
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }
}

