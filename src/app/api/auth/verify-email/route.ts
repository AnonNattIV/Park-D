import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import getPool from '@/lib/db/mysql';
import { isValidEmail } from '@/lib/auth';
import { ensureSecurityCodeTable, verifyAndConsumeSecurityCode } from '@/lib/security-codes';

type VerifyEmailBody = {
  email?: string;
  code?: string;
};

interface UserRow extends RowDataPacket {
  user_id: number;
  username: string;
  email: string;
  u_status: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as VerifyEmailBody;
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const code = typeof body?.code === 'string' ? body.code.trim() : '';

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }
    if (!code) {
      return NextResponse.json({ error: 'Verification code is required' }, { status: 400 });
    }

    const pool = getPool();
    await ensureSecurityCodeTable(pool);

    const [rows] = await pool.query<UserRow[]>(
      `SELECT user_id, username, email, u_status
      FROM users
      WHERE email = ?
      LIMIT 1`,
      [email]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Invalid verification request' }, { status: 400 });
    }

    const user = rows[0];
    const userStatus = String(user.u_status || '').toUpperCase().trim();
    if (userStatus === 'ACTIVE') {
      return NextResponse.json({
        success: true,
        message: 'Email already verified. You can login now.',
      });
    }
    if (userStatus === 'SUSPENDED' || userStatus === 'BANNED') {
      return NextResponse.json({ error: 'This account cannot be verified' }, { status: 403 });
    }

    const codeValid = await verifyAndConsumeSecurityCode(pool, {
      userId: Number(user.user_id),
      email,
      purpose: 'EMAIL_VERIFICATION',
      targetValue: '',
      code,
    });

    if (!codeValid) {
      return NextResponse.json({ error: 'Invalid or expired verification code' }, { status: 400 });
    }

    await pool.query<ResultSetHeader>(
      `UPDATE users
      SET u_status = 'ACTIVE',
          updated_at = NOW()
      WHERE user_id = ?`,
      [user.user_id]
    );

    return NextResponse.json({
      success: true,
      message: 'Email verified successfully. You can login now.',
    });
  } catch (error) {
    console.error('Verify email failed:', error);
    return NextResponse.json({ error: 'Unable to verify email right now' }, { status: 500 });
  }
}

