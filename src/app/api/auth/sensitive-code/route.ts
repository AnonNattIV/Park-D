import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import getPool from '@/lib/db/mysql';
import { verifyToken, isValidEmail } from '@/lib/auth';
import { isBrevoMailConfigured, sendTransactionalEmail } from '@/lib/email';
import {
  createSecurityCode,
  ensureSecurityCodeTable,
  getSecurityCodeCooldownRemaining,
} from '@/lib/security-codes';

type TokenPayload = {
  userId?: string;
};

type SensitiveCodeRequestBody = {
  newEmail?: string;
};

interface UserRow extends RowDataPacket {
  user_id: number;
  username: string;
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

    if (!isBrevoMailConfigured()) {
      return NextResponse.json(
        {
          error:
            'Email service is not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL in environment.',
        },
        { status: 503 }
      );
    }

    const body = (await request.json()) as SensitiveCodeRequestBody;
    const nextEmail = typeof body?.newEmail === 'string' ? body.newEmail.trim().toLowerCase() : '';
    if (!nextEmail) {
      return NextResponse.json({ error: 'New email is required' }, { status: 400 });
    }
    if (nextEmail && !isValidEmail(nextEmail)) {
      return NextResponse.json({ error: 'Invalid new email format' }, { status: 400 });
    }

    const pool = getPool();
    await ensureSecurityCodeTable(pool);

    const [userRows] = await pool.query<UserRow[]>(
      `SELECT user_id, username, email, u_status
      FROM users
      WHERE user_id = ?
      LIMIT 1`,
      [requesterUserId]
    );

    if (userRows.length === 0 || userRows[0].u_status !== 'ACTIVE') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = userRows[0];

    if (nextEmail === user.email.toLowerCase()) {
      return NextResponse.json({ error: 'New email must be different from current email' }, { status: 400 });
    }

    const [duplicateEmailRows] = await pool.query<RowDataPacket[]>(
      `SELECT user_id
      FROM users
      WHERE email = ?
        AND user_id <> ?
      LIMIT 1`,
      [nextEmail, requesterUserId]
    );

    if (duplicateEmailRows.length > 0) {
      return NextResponse.json({ error: 'Email is already in use' }, { status: 409 });
    }

    const currentEmailCooldown = await getSecurityCodeCooldownRemaining(pool, {
      userId: requesterUserId,
      email: user.email,
      purpose: 'ACCOUNT_SENSITIVE_CHANGE',
      cooldownSeconds: 60,
    });
    const newEmailCooldown = await getSecurityCodeCooldownRemaining(pool, {
      userId: requesterUserId,
      email: nextEmail,
      purpose: 'EMAIL_VERIFICATION',
      cooldownSeconds: 60,
    });
    const cooldownRemaining = Math.max(currentEmailCooldown, newEmailCooldown);
    if (cooldownRemaining > 0) {
      return NextResponse.json(
        {
          error: `Please wait ${cooldownRemaining} seconds before sending new codes.`,
          retryAfterSeconds: cooldownRemaining,
        },
        { status: 429 }
      );
    }

    const currentEmailCode = await createSecurityCode(pool, {
      userId: requesterUserId,
      email: user.email,
      purpose: 'ACCOUNT_SENSITIVE_CHANGE',
      targetValue: nextEmail,
      expiresInMinutes: 10,
    });
    const newEmailCode = await createSecurityCode(pool, {
      userId: requesterUserId,
      email: nextEmail,
      purpose: 'EMAIL_VERIFICATION',
      targetValue: 'EMAIL_CHANGE',
      expiresInMinutes: 10,
    });

    await sendTransactionalEmail({
      to: user.email,
      subject: 'Park:D current email verification code',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
          <h2 style="margin:0 0 12px 0">Verify current email for email change</h2>
          <p>Hello ${user.username},</p>
          <p>Use this code to confirm this email-change request:</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:12px 0">${currentEmailCode}</p>
          <p>This code expires in <strong>10 minutes</strong>.</p>
          <p>If you did not request this, please secure your account.</p>
        </div>
      `,
      text: `Your current-email verification code is ${currentEmailCode}. It expires in 10 minutes.`,
    });

    await sendTransactionalEmail({
      to: nextEmail,
      subject: 'Park:D new email verification code',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
          <h2 style="margin:0 0 12px 0">Verify new email for email change</h2>
          <p>Hello ${user.username},</p>
          <p>Use this code to verify this new email address:</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:12px 0">${newEmailCode}</p>
          <p>This code expires in <strong>10 minutes</strong>.</p>
        </div>
      `,
      text: `Your new-email verification code is ${newEmailCode}. It expires in 10 minutes.`,
    });

    return NextResponse.json({
      success: true,
      message: `Verification codes sent to current email (${user.email}) and new email (${nextEmail})`,
      retryAfterSeconds: 60,
    });
  } catch (error) {
    console.error('Unable to send sensitive action code:', error);
    return NextResponse.json(
      { error: 'Unable to send verification code right now' },
      { status: 500 }
    );
  }
}
