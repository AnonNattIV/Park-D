import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import getPool from '@/lib/db/mysql';
import { verifyToken } from '@/lib/auth';
import { deleteProfileImageByUrl, uploadProfileImage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

interface TokenPayload {
  userId: string;
  role: string;
}

interface UserImageRow extends RowDataPacket {
  profile_image_url: string | null;
}

function getRequesterAuth(request: NextRequest): TokenPayload | null {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();
  if (!token) {
    return null;
  }

  const payload = verifyToken(token) as TokenPayload | null;
  if (!payload?.userId) {
    return null;
  }

  return payload;
}

async function getCurrentImageUrl(userId: number): Promise<string | null> {
  const [rows] = await getPool().query<UserImageRow[]>(
    'SELECT profile_image_url FROM users WHERE user_id = ? LIMIT 1',
    [userId]
  );

  return rows[0]?.profile_image_url || null;
}

export async function POST(request: NextRequest) {
  try {
    const requester = getRequesterAuth(request);
    if (!requester) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = Number(requester.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Image file is required' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image must be 5 MB or smaller' }, { status: 400 });
    }

    const previousImageUrl = await getCurrentImageUrl(userId);
    const imageUrl = await uploadProfileImage(file, userId);

    await getPool().query<ResultSetHeader>(
      `UPDATE users
      SET profile_image_url = ?,
          updated_at = NOW()
      WHERE user_id = ?`,
      [imageUrl, userId]
    );

    if (previousImageUrl && previousImageUrl !== imageUrl) {
      await deleteProfileImageByUrl(previousImageUrl);
    }

    return NextResponse.json({
      success: true,
      imageUrl,
    });
  } catch (error) {
    console.error('Profile image upload error:', error);
    return NextResponse.json({ error: 'Unable to upload image' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const requester = getRequesterAuth(request);
    if (!requester) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = Number(requester.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const previousImageUrl = await getCurrentImageUrl(userId);

    await getPool().query<ResultSetHeader>(
      `UPDATE users
      SET profile_image_url = NULL,
          updated_at = NOW()
      WHERE user_id = ?`,
      [userId]
    );

    await deleteProfileImageByUrl(previousImageUrl);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Profile image delete error:', error);
    return NextResponse.json({ error: 'Unable to delete image' }, { status: 500 });
  }
}
