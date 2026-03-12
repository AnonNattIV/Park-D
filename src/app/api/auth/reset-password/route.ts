import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import getPool from '@/lib/db/mysql';
import { hashPassword, isValidEmail, validatePassword } from '@/lib/auth';
import { sendTransactionalEmail } from '@/lib/email';
import { ensureSecurityCodeTable, verifyAndConsumeSecurityCode } from '@/lib/security-codes';

type ResetPasswordBody = {
  identifier?: string;
  email?: string;
  username?: string;
  code?: string;
  newPassword?: string;
  confirmPassword?: string;
};

interface UserLookupRow extends RowDataPacket {
  user_id: number;
  username: string;
  email: string;
  u_status: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ResetPasswordBody;
    const rawIdentifier =
      (typeof body?.identifier === 'string' && body.identifier.trim()) ||
      (typeof body?.email === 'string' && body.email.trim()) ||
      (typeof body?.username === 'string' && body.username.trim()) ||
      '';
    const identifier = rawIdentifier.trim();
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
    const confirmPassword = typeof body?.confirmPassword === 'string' ? body.confirmPassword : '';

    if (!identifier) {
      return NextResponse.json({ error: 'Email or username is required' }, { status: 400 });
    }

    if (!code) {
      return NextResponse.json({ error: 'Reset code is required' }, { status: 400 });
    }

    if (!newPassword || !confirmPassword) {
      return NextResponse.json({ error: 'New password and confirm password are required' }, { status: 400 });
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 });
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { error: passwordValidation.message || 'Weak password' },
        { status: 400 }
      );
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
      return NextResponse.json({ error: 'Invalid or expired reset code' }, { status: 400 });
    }

    const user = rows[0];
    const codeValid = await verifyAndConsumeSecurityCode(pool, {
      userId: Number(user.user_id),
      email: user.email,
      purpose: 'PASSWORD_RESET',
      targetValue: '',
      code,
    });

    if (!codeValid) {
      return NextResponse.json({ error: 'Invalid or expired reset code' }, { status: 400 });
    }

    const hashedPassword = await hashPassword(newPassword);
    const [updateResult] = await pool.query<ResultSetHeader>(
      `UPDATE users
      SET password_hash = ?,
          updated_at = NOW()
      WHERE user_id = ?`,
      [hashedPassword, user.user_id]
    );

    if (Number(updateResult.affectedRows || 0) === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    try {
      await sendTransactionalEmail({
        to: user.email,
        subject: 'Park:D password changed',
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
            <h2 style="margin:0 0 12px 0">Password updated</h2>
            <p>Hello ${user.username},</p>
            <p>Your Park:D password was changed successfully.</p>
            <p>If this was not you, please reset your password immediately.</p>
          </div>
        `,
        text: `Hello ${user.username}, your Park:D password was changed successfully.`,
      });
    } catch (mailError) {
      console.error('Unable to send password changed email:', mailError);
    }

    return NextResponse.json({
      success: true,
      message: 'Password has been reset successfully',
    });
  } catch (error) {
    console.error('Reset password failed:', error);
    return NextResponse.json(
      { error: 'Unable to reset password right now' },
      { status: 500 }
    );
  }
}
