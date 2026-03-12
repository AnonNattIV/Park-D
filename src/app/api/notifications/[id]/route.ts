import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import getPool from '@/lib/db/mysql';
import {
  ensureNotificationTables,
  getUnreadNotificationCount,
  markNotificationAsRead,
} from '@/lib/notifications';

export const dynamic = 'force-dynamic';

type TokenPayload = {
  userId?: string;
};

function readRequesterUserId(request: NextRequest): number | null {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();
  if (!token) {
    return null;
  }

  const payload = verifyToken(token) as TokenPayload | null;
  const userId = Number(payload?.userId);

  if (!payload || !Number.isInteger(userId) || userId <= 0) {
    return null;
  }

  return userId;
}

function parseNotificationId(rawId: string): number | null {
  const parsed = Number(rawId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const requesterUserId = readRequesterUserId(request);
    if (!requesterUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const notificationId = parseNotificationId(params.id);
    if (!notificationId) {
      return NextResponse.json({ error: 'Invalid notification id' }, { status: 400 });
    }

    const pool = getPool();
    await ensureNotificationTables(pool);

    const updatedCount = await markNotificationAsRead(pool, requesterUserId, notificationId);
    const unreadCount = await getUnreadNotificationCount(pool, requesterUserId);

    return NextResponse.json({
      success: true,
      updatedCount,
      unreadCount,
    });
  } catch (error) {
    console.error('Unable to mark notification as read:', error);
    return NextResponse.json(
      { error: 'Unable to mark notification as read right now' },
      { status: 500 }
    );
  }
}

