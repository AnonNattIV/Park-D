import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import getPool from '@/lib/db/mysql';
import { hashPassword, isValidEmail, sanitizeUsername, validatePassword } from '@/lib/auth';

interface ExistingUserRow extends RowDataPacket {
  user_id: number;
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
      VALUES (?, ?, ?, ?, 'ACTIVE', NULL, NOW(), NOW())`,
      [username, email, hashedPassword, username]
    );

    return NextResponse.json({
      success: true,
      user: {
        id: insertResult.insertId,
        username,
        email,
        role: 'user',
        ownerRequestStatus: null,
      },
      message: 'Registration successful',
    });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
