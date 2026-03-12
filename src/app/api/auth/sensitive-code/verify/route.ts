import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import getPool from '@/lib/db/mysql';
import { isValidEmail, verifyToken } from '@/lib/auth';
import { ensureSecurityCodeTable, verifySecurityCode } from '@/lib/security-codes';

type TokenPayload = {
  userId?: string;
};

type VerifySensitiveCodeBody = {
  newEmail?: string;
  code?: string;
  channel?: 'CURRENT' | 'NEW' | string;
};

interface UserRow extends RowDataPacket {
  user_id: number;
  email: string;
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

    const body = (await request.json()) as VerifySensitiveCodeBody;
    const newEmail = typeof body?.newEmail === 'string' ? body.newEmail.trim().toLowerCase() : '';
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    const channel = typeof body?.channel === 'string' ? body.channel.trim().toUpperCase() : '';

    if (!newEmail || !isValidEmail(newEmail)) {
      return NextResponse.json({ error: 'Valid new email is required' }, { status: 400 });
    }
    if (!code) {
      return NextResponse.json({ error: 'Verification code is required' }, { status: 400 });
    }
    if (channel !== 'CURRENT' && channel !== 'NEW') {
      return NextResponse.json(
        { error: 'Verification channel must be CURRENT or NEW' },
        { status: 400 }
      );
    }

    const pool = getPool();
    await ensureSecurityCodeTable(pool);

    const [rows] = await pool.query<UserRow[]>(
      `SELECT user_id, email, u_status
      FROM users
      WHERE user_id = ?
      LIMIT 1`,
      [requesterUserId]
    );

    if (rows.length === 0 || rows[0].u_status !== 'ACTIVE') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = rows[0];
    const isValid =
      channel === 'CURRENT'
        ? await verifySecurityCode(pool, {
            userId: requesterUserId,
            email: user.email,
            purpose: 'ACCOUNT_SENSITIVE_CHANGE',
            targetValue: newEmail,
            code,
          })
        : await verifySecurityCode(pool, {
            userId: requesterUserId,
            email: newEmail,
            purpose: 'EMAIL_VERIFICATION',
            targetValue: 'EMAIL_CHANGE',
            code,
          });

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid or expired verification code' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message:
        channel === 'CURRENT'
          ? 'Current-email verification code is valid.'
          : 'New-email verification code is valid.',
    });
  } catch (error) {
    console.error('Unable to verify sensitive action code:', error);
    return NextResponse.json(
      { error: 'Unable to verify code right now' },
      { status: 500 }
    );
  }
}
