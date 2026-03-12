import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import getPool from '@/lib/db/mysql';
import { hashPassword, isValidEmail, sanitizeUsername, validatePassword } from '@/lib/auth';
import { isBrevoMailConfigured, sendTransactionalEmail } from '@/lib/email';
import { createSecurityCode, ensureSecurityCodeTable } from '@/lib/security-codes';

interface ExistingUserRow extends RowDataPacket {
  user_id: number;
}

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
    const body = await request.json();
    const username = typeof body?.username === 'string' ? sanitizeUsername(body.username) : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const confirmPassword = typeof body?.confirmPassword === 'string' ? body.confirmPassword : '';

    if (!username || !email || !password || !confirmPassword) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    if (password !== confirmPassword) {
      return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
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

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json({ error: passwordValidation.message || 'Weak password' }, { status: 400 });
    }

    const pool = getPool();
    const [existingRows] = await pool.query<ExistingUserRow[]>(
      'SELECT user_id FROM users WHERE username = ? OR email = ? LIMIT 1',
      [username, email]
    );

    if (existingRows.length > 0) {
      return NextResponse.json({ error: 'Username or email already exists' }, { status: 409 });
    }

    const hashedPassword = await hashPassword(password);
    const [insertResult] = await pool.query<ResultSetHeader>(
      `INSERT INTO users (
        username,
        email,
        password_hash,
        name,
        u_status,
        owner_request_status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, 'INACTIVE', NULL, NOW(), NOW())`,
      [username, email, hashedPassword, username]
    );

    await ensureSecurityCodeTable(pool);
    const verificationCode = await createSecurityCode(pool, {
      userId: Number(insertResult.insertId),
      email,
      purpose: 'EMAIL_VERIFICATION',
      expiresInMinutes: 15,
    });
    const appBaseUrl = resolveAppBaseUrl(request);
    const verificationLink = `${appBaseUrl}/verify-email?email=${encodeURIComponent(email)}&code=${encodeURIComponent(
      verificationCode
    )}`;

    let verificationMailSent = true;
    try {
      await sendTransactionalEmail({
        to: email,
        subject: 'Park:D verify your email',
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
            <h2 style="margin:0 0 12px 0">Verify your email</h2>
            <p>Hello ${username},</p>
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
    } catch (mailError) {
      verificationMailSent = false;
      console.error('Unable to send registration verification email:', mailError);
    }

    return NextResponse.json({
      success: true,
      requiresEmailVerification: true,
      user: {
        id: insertResult.insertId,
        username,
        email,
        role: 'user',
        ownerRequestStatus: null,
      },
      message: verificationMailSent
        ? 'Registration successful. Verification email sent to your inbox.'
        : 'Registration successful. Please resend verification email from verify email page.',
    });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
