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

type ResendVerificationBody = {
  email?: string;
};

interface UserRow extends RowDataPacket {
  user_id: number;
  username: string;
  email: string;
  u_status: string;
}

const GENERIC_MESSAGE = 'If the account exists, verification email has been sent.';

function resolveAppBaseUrl(request: NextRequest): string {
  const configuredBaseUrl = (process.env.APP_BASE_URL || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)[0];
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, '');
  }

  return request.nextUrl.origin.replace(/\/+$/, '');
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ResendVerificationBody;
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    if (!isBrevoMailConfigured()) {
      return NextResponse.json(
        {
          error:
            'Email verification service is not configured. Please set BREVO_API_KEY and BREVO_SENDER_EMAIL.',
        },
        { status: 503 }
      );
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
      return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
    }

    const user = rows[0];
    const userStatus = String(user.u_status || '').toUpperCase().trim();
    if (userStatus === 'ACTIVE') {
      return NextResponse.json({
        success: true,
        message: 'Email is already verified. You can login now.',
      });
    }
    if (userStatus === 'SUSPENDED' || userStatus === 'BANNED') {
      return NextResponse.json({ error: 'This account cannot be verified' }, { status: 403 });
    }

    const cooldownRemaining = await getSecurityCodeCooldownRemaining(pool, {
      userId: Number(user.user_id),
      email,
      purpose: 'EMAIL_VERIFICATION',
      cooldownSeconds: 60,
    });
    if (cooldownRemaining > 0) {
      return NextResponse.json(
        {
          error: `Please wait ${cooldownRemaining} seconds before requesting new code.`,
          retryAfterSeconds: cooldownRemaining,
        },
        { status: 429 }
      );
    }

    const verificationCode = await createSecurityCode(pool, {
      userId: Number(user.user_id),
      email,
      purpose: 'EMAIL_VERIFICATION',
      expiresInMinutes: 15,
    });
    const appBaseUrl = resolveAppBaseUrl(request);
    const verificationLink = `${appBaseUrl}/verify-email?email=${encodeURIComponent(email)}&code=${encodeURIComponent(
      verificationCode
    )}`;

    await sendTransactionalEmail({
      to: email,
      subject: 'Park:D verify your email',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
          <h2 style="margin:0 0 12px 0">Verify your email</h2>
          <p>Hello ${user.username},</p>
          <p>Click this button to verify your Park:D account email:</p>
          <p style="margin:16px 0">
            <a href="${verificationLink}" style="display:inline-block;background:#5B7CFF;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Verify Email</a>
          </p>
          <p>If the button does not work, open this link:</p>
          <p style="word-break:break-all;margin:8px 0 12px 0"><a href="${verificationLink}">${verificationLink}</a></p>
          <p>This verification link expires in <strong>15 minutes</strong>.</p>
        </div>
      `,
      text: `Verify your Park:D email by opening this link: ${verificationLink} (expires in 15 minutes).`,
    });

    return NextResponse.json({
      success: true,
      message: `Verification email sent to ${email}`,
      retryAfterSeconds: 60,
    });
  } catch (error) {
    console.error('Resend verification failed:', error);
    return NextResponse.json(
      { error: 'Unable to resend verification email right now' },
      { status: 500 }
    );
  }
}
