import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import getPool from '@/lib/db/mysql';
import { generateToken, sanitizeUsername, verifyPassword } from '@/lib/auth';
import { OwnerRequestStatus, resolveAppRole } from '@/lib/roles';

interface LoginRow extends RowDataPacket {
  user_id: number;
  username: string;
  email: string;
  password_hash: string;
  u_status: string;
  owner_request_status: OwnerRequestStatus;
  roles: string;
  has_owner_profile: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const usernameInput = typeof body?.username === 'string' ? sanitizeUsername(body.username) : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!usernameInput || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    const pool = getPool();
    const [rows] = await pool.query<LoginRow[]>(
      `SELECT
        u.user_id,
        u.username,
        u.email,
        u.password_hash,
        u.u_status,
        u.owner_request_status,
        u.roles,
        CASE WHEN op.user_id IS NULL THEN 0 ELSE 1 END AS has_owner_profile
      FROM users u
      LEFT JOIN owner_profiles op ON op.user_id = u.user_id
      WHERE u.username = ? OR u.email = ?
      LIMIT 1`,
      [usernameInput, usernameInput]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Invalid username/email or password' }, { status: 401 });
    }

    const user = rows[0];
    const currentStatus = String(user.u_status || '').toUpperCase().trim();
    
    if (currentStatus !== 'ACTIVE') {
      let errorMessage = 'This account is not active';
      if (currentStatus === 'SUSPENDED') {
        errorMessage = 'Your account has been suspended.';
      } else if (currentStatus === 'BANNED') {
        errorMessage = 'Your account has been permanently banned.';
      }

      return NextResponse.json({ error: errorMessage }, { status: 403 });
    }

    const passwordValid = await verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      return NextResponse.json({ error: 'Invalid username/email or password' }, { status: 401 });
    }

    const role = resolveAppRole({
      roles: user.roles,
      hasOwnerProfile: user.has_owner_profile,
      ownerRequestStatus: user.owner_request_status,
    });
    const token = generateToken({
      userId: String(user.user_id),
      username: user.username,
      role,
    });

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user.user_id,
        username: user.username,
        email: user.email,
        role,
        ownerRequestStatus: user.owner_request_status,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
