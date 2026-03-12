import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import getPool from '@/lib/db/mysql';
import { validatePassword, verifyPassword, verifyToken } from '@/lib/auth';

type TokenPayload = {
  userId?: string;
};

type PasswordCheckBody = {
  currentPassword?: string;
  newPassword?: string;
  confirmNewPassword?: string;
};

interface UserPasswordRow extends RowDataPacket {
  user_id: number;
  password_hash: string;
  u_status: string;
}

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

export async function POST(request: NextRequest) {
  try {
    const requesterUserId = readRequesterUserId(request);
    if (!requesterUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as PasswordCheckBody;
    const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
    const confirmNewPassword =
      typeof body?.confirmNewPassword === 'string' ? body.confirmNewPassword : '';

    if (!currentPassword) {
      return NextResponse.json({ error: 'Current password is required' }, { status: 400 });
    }
    if (!newPassword || !confirmNewPassword) {
      return NextResponse.json(
        { error: 'New password and confirm password are required' },
        { status: 400 }
      );
    }
    if (newPassword !== confirmNewPassword) {
      return NextResponse.json({ error: 'New password and confirm password do not match' }, { status: 400 });
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { error: passwordValidation.message || 'Weak password' },
        { status: 400 }
      );
    }
    if (newPassword === currentPassword) {
      return NextResponse.json(
        { error: 'New password must be different from current password' },
        { status: 400 }
      );
    }

    const pool = getPool();
    const [rows] = await pool.query<UserPasswordRow[]>(
      `SELECT user_id, password_hash, u_status
      FROM users
      WHERE user_id = ?
      LIMIT 1`,
      [requesterUserId]
    );

    if (rows.length === 0 || rows[0].u_status !== 'ACTIVE') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = rows[0];
    const currentPasswordValid = await verifyPassword(currentPassword, user.password_hash);
    if (!currentPasswordValid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Password information is valid.',
    });
  } catch (error) {
    console.error('Unable to check password change input:', error);
    return NextResponse.json({ error: 'Unable to check password right now' }, { status: 500 });
  }
}

