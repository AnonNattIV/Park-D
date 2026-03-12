import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import getPool from '@/lib/db/mysql';
import { isValidEmail } from '@/lib/auth';
import { isBrevoMailConfigured, sendTransactionalEmail } from '@/lib/email';
import {
  createSecurityCode,
  ensureSecurityCodeTable,
  getSecurityCodeCooldownRemaining,
} from '@/lib/security-codes';

type ForgotPasswordBody = {
  identifier?: string;
  email?: string;
  username?: string;
};

interface UserLookupRow extends RowDataPacket {
  user_id: number;
  username: string;
  email: string;
  u_status: string;
}

const GENERIC_MESSAGE =
  'If this account exists in our system, we sent a password reset code.';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ForgotPasswordBody;
    const rawIdentifier =
      (typeof body?.identifier === 'string' && body.identifier.trim()) ||
      (typeof body?.email === 'string' && body.email.trim()) ||
      (typeof body?.username === 'string' && body.username.trim()) ||
      '';
    const identifier = rawIdentifier.trim();

    if (!identifier) {
      return NextResponse.json({ error: 'Email or username is required' }, { status: 400 });
    }

    const pool = getPool();
    await ensureSecurityCodeTable(pool);

    const normalizedEmail = identifier.toLowerCase();
    const isEmailIdentifier = isValidEmail(normalizedEmail);
    const [rows] = await pool.query<UserLookupRow[]>(
      `SELECT user_id, username, email, u_status
      FROM users
      WHERE email = ?
      OR username = ?
      LIMIT 1`,
      [isEmailIdentifier ? normalizedEmail : '', identifier]
    );

    if (rows.length === 0 || rows[0].u_status !== 'ACTIVE') {
      return NextResponse.json({
        success: true,
        message: GENERIC_MESSAGE,
        retryAfterSeconds: 60,
      });
    }

    if (!isBrevoMailConfigured()) {
      return NextResponse.json(
        {
          error:
            'Email service is not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL in environment.',
        },
        { status: 503 }
      );
    }

    const user = rows[0];
    const cooldownRemaining = await getSecurityCodeCooldownRemaining(pool, {
      userId: Number(user.user_id),
      email: user.email,
      purpose: 'PASSWORD_RESET',
      cooldownSeconds: 60,
    });

    if (cooldownRemaining > 0) {
      return NextResponse.json(
        {
          error: `Please wait ${cooldownRemaining} seconds before requesting a new reset code.`,
          retryAfterSeconds: cooldownRemaining,
        },
        { status: 429 }
      );
    }

    const resetCode = await createSecurityCode(pool, {
      userId: Number(user.user_id),
      email: user.email,
      purpose: 'PASSWORD_RESET',
      expiresInMinutes: 15,
    });

    await sendTransactionalEmail({
      to: user.email,
      subject: 'Park:D password reset code',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
          <h2 style="margin:0 0 12px 0">Reset your password</h2>
          <p>Hello ${user.username},</p>
          <p>Use this code to reset your password:</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:12px 0">${resetCode}</p>
          <p>This code expires in <strong>15 minutes</strong>.</p>
          <p>If you did not request this, you can ignore this email.</p>
        </div>
      `,
      text: `Reset your Park:D password using this code: ${resetCode}. The code expires in 15 minutes.`,
    });

    return NextResponse.json({
      success: true,
      message: GENERIC_MESSAGE,
      retryAfterSeconds: 60,
    });
  } catch (error) {
    console.error('Forgot password request failed:', error);
    return NextResponse.json(
      { error: 'Unable to process forgot password request right now' },
      { status: 500 }
    );
  }
}
