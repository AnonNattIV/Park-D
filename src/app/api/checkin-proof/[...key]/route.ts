import { NextRequest, NextResponse } from 'next/server';
import { getCheckinProofByKey } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { key: string[] } }
) {
  try {
    const rawKey = Array.isArray(params.key) ? params.key : [];
    const objectKey = rawKey.map((segment) => decodeURIComponent(segment)).join('/');

    if (!objectKey) {
      return NextResponse.json({ error: 'Proof not found' }, { status: 404 });
    }

    const image = await getCheckinProofByKey(objectKey);
    const body = new ArrayBuffer(image.body.byteLength);

    new Uint8Array(body).set(image.body);

    return new NextResponse(body, {
      headers: {
        'Content-Type': image.contentType,
        'Cache-Control': 'private, max-age=120',
      },
    });
  } catch (error) {
    console.error('Check-in proof fetch error:', error);
    return NextResponse.json({ error: 'Proof not found' }, { status: 404 });
  }
}
