import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import getPool from '@/lib/db/mysql';
import {
  ensureNotificationTables,
  getUnreadNotificationCount,
  listUserNotifications,
  markAllNotificationsAsRead,
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

function parsePositiveInt(raw: string | null, fallback: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function parseBooleanParam(raw: string | null): boolean {
  if (!raw) {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

export async function GET(request: NextRequest) {
  try {
    const requesterUserId = readRequesterUserId(request);
    if (!requesterUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pool = getPool();
    await ensureNotificationTables(pool);

    const limit = parsePositiveInt(request.nextUrl.searchParams.get('limit'), 20, 100);
    const unreadOnly = parseBooleanParam(request.nextUrl.searchParams.get('unreadOnly'));
    const summaryOnly = parseBooleanParam(request.nextUrl.searchParams.get('summary'));

    const unreadCount = await getUnreadNotificationCount(pool, requesterUserId);
    if (summaryOnly) {
      return NextResponse.json({
        success: true,
        unreadCount,
      });
    }

    const notifications = await listUserNotifications(pool, requesterUserId, {
      limit,
      unreadOnly,
    });

    return NextResponse.json({
      success: true,
      unreadCount,
      notifications,
    });
  } catch (error) {
    console.error('Unable to load notifications:', error);
    return NextResponse.json(
      { error: 'Unable to load notifications right now' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const requesterUserId = readRequesterUserId(request);
    if (!requesterUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const action = typeof body?.action === 'string' ? body.action.trim().toUpperCase() : '';
    if (action !== 'MARK_ALL_READ') {
      return NextResponse.json(
        { error: 'Invalid action. Use MARK_ALL_READ' },
        { status: 400 }
      );
    }

    const pool = getPool();
    await ensureNotificationTables(pool);

    const updatedCount = await markAllNotificationsAsRead(pool, requesterUserId);
    const unreadCount = await getUnreadNotificationCount(pool, requesterUserId);

    return NextResponse.json({
      success: true,
      updatedCount,
      unreadCount,
    });
  } catch (error) {
    console.error('Unable to update notifications:', error);
    return NextResponse.json(
      { error: 'Unable to update notifications right now' },
      { status: 500 }
    );
  }
}

