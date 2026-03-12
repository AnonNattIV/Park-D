import { NextRequest, NextResponse } from 'next/server';
import { getOwnerRequestEvidenceByKey } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { key: string[] } }
) {
  try {
    const rawKey = Array.isArray(params.key) ? params.key : [];
    const objectKey = rawKey.map((segment) => decodeURIComponent(segment)).join('/');

    if (!objectKey) {
      return NextResponse.json({ error: 'Evidence file not found' }, { status: 404 });
    }

    const file = await getOwnerRequestEvidenceByKey(objectKey);
    const body = new ArrayBuffer(file.body.byteLength);
    new Uint8Array(body).set(file.body);

    return new NextResponse(body, {
      headers: {
        'Content-Type': file.contentType,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error) {
    console.error('Owner request evidence fetch error:', error);
    return NextResponse.json({ error: 'Evidence file not found' }, { status: 404 });
  }
}
