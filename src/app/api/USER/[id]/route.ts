import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import getPool from '@/lib/db/mysql';
import { verifyToken } from '@/lib/auth';
import { OwnerRequestStatus, resolveAppRole } from '@/lib/roles';
import { ensureWalletTables, getUserWalletWithTransactions } from '@/lib/wallet';
import { runBookingCheckoutAutomation } from '@/lib/booking-checkout';
import { ensureOwnerRequestMetadataSchema } from '@/lib/owner-request-metadata';

type PatchAction = 'REQUEST_OWNER' | 'APPROVE_OWNER' | 'REJECT_OWNER';
const GENDER_OPTIONS = ['Male', 'Female', 'Other'] as const;

interface TokenPayload {
  userId: string;
  username: string;
  role: string;
}

interface UserRow extends RowDataPacket {
  user_id: number;
  username: string;
  email: string;
  name: string;
  surname: string | null;
  gender: string | null;
  age: number | null;
  phone: string | null;
  profile_image_url: string | null;
  u_status: 'ACTIVE' | 'INACTIVE' | 'BANNED';
  owner_request_status: OwnerRequestStatus;
  roles: string;
  has_owner_profile: number;
}

interface OwnerRoleRow extends RowDataPacket {
  user_id: number;
}

interface OwnerRequestMetadataRow extends RowDataPacket {
  citizen_id: string | null;
}

interface BookingHistoryRow extends RowDataPacket {
  b_id: number;
  parking_name: string;
  booking_time: Date | string;
  checkin_datetime: Date | string | null;
  checkin_proof: string | null;
  checkout_datetime: Date | string | null;
  b_status: string;
  total_time_minutes: number | null;
  total_price: number | string | null;
  pay_status: string | null;
  pay_method: string | null;
  pay_amount: number | string | null;
}

function parseUserId(rawId: string): number | null {
  const parsed = Number(rawId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function getRequesterAuth(request: NextRequest): TokenPayload | null {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();
  if (!token) {
    return null;
  }

  const payload = verifyToken(token) as TokenPayload | null;
  if (!payload?.userId || !payload?.role) {
    return null;
  }

  return payload;
}

async function getUserById(userId: number): Promise<UserRow | null> {
  const pool = getPool();
  const [rows] = await pool.query<UserRow[]>(
    `SELECT
      u.user_id,
      u.username,
      u.email,
      u.name,
      u.surname,
      u.gender,
      u.age,
      u.phone,
      u.profile_image_url,
      u.u_status,
      u.owner_request_status,
      u.roles,
      CASE WHEN op.user_id IS NULL THEN 0 ELSE 1 END AS has_owner_profile
    FROM users u
    LEFT JOIN owner_profiles op ON op.user_id = u.user_id
    WHERE u.user_id = ?
    LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
}

async function validateManagementRole(userId: number): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<OwnerRoleRow[]>(
    `SELECT u.user_id
    FROM users u
    INNER JOIN owner_profiles op ON op.user_id = u.user_id
    WHERE u.user_id = ?
      AND u.u_status = 'ACTIVE'
      AND u.owner_request_status = 'APPROVED'
    LIMIT 1`,
    [userId]
  );

  return rows.length > 0;
}

function buildUserResponse(user: UserRow) {
  return {
    id: user.user_id,
    username: user.username,
    email: user.email,
    name: user.name,
    surname: user.surname,
    gender: user.gender,
    age: user.age,
    phone: user.phone,
    profileImageUrl: user.profile_image_url,
    status: user.u_status,
    ownerRequestStatus: user.owner_request_status,
    role: resolveAppRole({
      roles: user.roles,
      hasOwnerProfile: user.has_owner_profile,
      ownerRequestStatus: user.owner_request_status,
    }),
  };
}

async function getBookingHistory(userId: number) {
  const [rows] = await getPool().query<BookingHistoryRow[]>(
    `SELECT
      b.b_id,
      COALESCE(NULLIF(TRIM(pl.lot_name), ''), pl.location) AS parking_name,
      b.booking_time,
      b.checkin_datetime,
      b.checkin_proof,
      b.checkout_datetime,
      b.b_status,
      b.total_time_minutes,
      CASE
        WHEN p.pay_amount IS NOT NULL THEN p.pay_amount
        WHEN b.total_time_minutes IS NULL THEN NULL
        ELSE ROUND((b.total_time_minutes / 60) * pl.price * 1.5, 2)
      END AS total_price
      ,
      p.pay_status,
      p.pay_method,
      p.pay_amount
    FROM bookings b
    INNER JOIN parking_lots pl ON pl.lot_id = b.lot_id
    LEFT JOIN payments p ON p.b_id = b.b_id
    WHERE b.user_id = ?
    ORDER BY b.booking_time DESC
    LIMIT 10`,
    [userId]
  );

  return rows.map((row) => ({
    id: String(row.b_id),
    parkingName: row.parking_name,
    bookingTime: row.booking_time,
    checkinTime: row.checkin_datetime,
    checkinProof: row.checkin_proof,
    checkoutTime: row.checkout_datetime,
    bookingStatus: row.b_status,
    durationMinutes: row.total_time_minutes,
    totalPrice: row.total_price === null ? 0 : Number(row.total_price),
    paymentStatus: row.pay_status,
    paymentMethod: row.pay_method,
    paymentAmount: row.pay_amount === null ? null : Number(row.pay_amount),
  }));
}

async function getWalletSummary(userId: number) {
  const pool = getPool();
  await ensureWalletTables(pool);

  const wallet = await getUserWalletWithTransactions(pool, userId, 20);
  return {
    id: wallet.walletId,
    balance: wallet.balance,
    transactions: wallet.transactions.map((item) => ({
      id: item.id,
      type: item.type,
      amount: item.amount,
      balanceBefore: item.balanceBefore,
      balanceAfter: item.balanceAfter,
      note: item.note,
      bookingId: item.bookingId,
      paymentId: item.paymentId,
      createdAt: item.createdAt,
    })),
  };
}

async function emailExistsForAnotherUser(email: string, userId: number): Promise<boolean> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT user_id
    FROM users
    WHERE email = ?
      AND user_id <> ?
    LIMIT 1`,
    [email, userId]
  );

  return rows.length > 0;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = parseUserId(params.id);
    if (!userId) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }

    const requester = getRequesterAuth(request);
    if (!requester) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requesterId = Number(requester.userId);
    if (!Number.isInteger(requesterId) || requesterId <= 0) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requesterIsAdmin = requester.role.trim().toLowerCase() === 'admin';
    const requesterCanManage = await validateManagementRole(requesterId);
    if (requesterId !== userId && !requesterIsAdmin && !requesterCanManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
      await runBookingCheckoutAutomation();
    } catch (automationError) {
      console.error('Unable to run booking checkout automation:', automationError);
    }

    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      user: buildUserResponse(user),
      bookings: await getBookingHistory(userId),
      wallet: await getWalletSummary(userId),
    });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = parseUserId(params.id);
    if (!userId) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }

    const requester = getRequesterAuth(request);
    if (!requester) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requesterId = Number(requester.userId);
    if (!Number.isInteger(requesterId) || requesterId <= 0) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requesterIsAdmin = requester.role.trim().toLowerCase() === 'admin';
    if (requesterId !== userId && !requesterIsAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const surname = typeof body?.surname === 'string' ? body.surname.trim() : '';
    const rawGender = typeof body?.gender === 'string' ? body.gender.trim() : '';
    const rawAge = body?.age;
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
    const gender = rawGender || null;
    let age: number | null = null;

    if (!name) {
      return NextResponse.json({ error: 'First name is required' }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    if (gender && !GENDER_OPTIONS.includes(gender as (typeof GENDER_OPTIONS)[number])) {
      return NextResponse.json({ error: 'Invalid gender value' }, { status: 400 });
    }

    if (rawAge !== undefined && rawAge !== null && rawAge !== '') {
      const parsedAge = Number(rawAge);
      if (!Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 150) {
        return NextResponse.json({ error: 'Age must be between 1 and 150' }, { status: 400 });
      }
      age = parsedAge;
    }

    if (await emailExistsForAnotherUser(email, userId)) {
      return NextResponse.json({ error: 'Email is already in use' }, { status: 409 });
    }

    const [updateResult] = await getPool().query<ResultSetHeader>(
      `UPDATE users
      SET name = ?,
          surname = ?,
          gender = ?,
          age = ?,
          email = ?,
          phone = ?,
          updated_at = NOW()
      WHERE user_id = ?`,
      [
        name,
        surname || null,
        gender,
        age,
        email,
        phone || null,
        userId,
      ]
    );

    if (updateResult.affectedRows === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const updatedUser = await getUserById(userId);
    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Profile updated',
      user: buildUserResponse(updatedUser),
    });
  } catch (error) {
    console.error('Put user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = parseUserId(params.id);
    if (!userId) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }

    const requester = getRequesterAuth(request);
    if (!requester) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requesterId = Number(requester.userId);
    if (!Number.isInteger(requesterId) || requesterId <= 0) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const action = typeof body?.action === 'string' ? body.action.toUpperCase() as PatchAction : null;

    if (!action || !['REQUEST_OWNER', 'APPROVE_OWNER', 'REJECT_OWNER'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Use REQUEST_OWNER, APPROVE_OWNER, or REJECT_OWNER' },
        { status: 400 }
      );
    }

    const targetUser = await getUserById(userId);
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const pool = getPool();

    if (action === 'REQUEST_OWNER') {
      if (requesterId !== userId) {
        return NextResponse.json({ error: 'You can only request owner role for yourself' }, { status: 403 });
      }

      if (targetUser.u_status !== 'ACTIVE') {
        return NextResponse.json({ error: 'Only active users can request owner role' }, { status: 400 });
      }

      if (targetUser.owner_request_status === 'APPROVED') {
        return NextResponse.json({ error: 'User is already approved as owner' }, { status: 409 });
      }

      if (targetUser.owner_request_status === 'PENDING') {
        return NextResponse.json({ error: 'Owner request is already pending' }, { status: 409 });
      }

      await pool.query<ResultSetHeader>(
        `UPDATE users
        SET owner_request_status = 'PENDING',
            updated_at = NOW()
        WHERE user_id = ?`,
        [userId]
      );

      const updatedUser = await getUserById(userId);
      return NextResponse.json({
        success: true,
        message: 'Owner request submitted',
        user: updatedUser ? buildUserResponse(updatedUser) : null,
      });
    }

    const requesterIsAdmin = requester.role.trim().toLowerCase() === 'admin';
    const requesterCanManage = requesterIsAdmin || await validateManagementRole(requesterId);
    if (!requesterCanManage) {
      return NextResponse.json({ error: 'Admin or owner role is required for this action' }, { status: 403 });
    }

    if (targetUser.owner_request_status !== 'PENDING') {
      return NextResponse.json({ error: 'Owner request is not pending' }, { status: 409 });
    }

    if (action === 'APPROVE_OWNER') {
      await ensureOwnerRequestMetadataSchema();

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const [metadataRows] = await connection.query<OwnerRequestMetadataRow[]>(
          `SELECT citizen_id
          FROM owner_request_metadata
          WHERE user_id = ?
          LIMIT 1
          FOR UPDATE`,
          [userId]
        );

        const citizenId = metadataRows[0]?.citizen_id?.trim() || '';
        if (!citizenId) {
          await connection.rollback();
          return NextResponse.json(
            { error: 'Citizen ID from owner request form is required before approval' },
            { status: 400 }
          );
        }

        if (!/^\d+$/.test(citizenId)) {
          await connection.rollback();
          return NextResponse.json(
            { error: 'Citizen ID from owner request form must contain numbers only' },
            { status: 400 }
          );
        }

        const [updateResult] = await connection.query<ResultSetHeader>(
          `UPDATE users
          SET owner_request_status = 'APPROVED',
              updated_at = NOW()
          WHERE user_id = ?
            AND owner_request_status = 'PENDING'`,
          [userId]
        );

        if (updateResult.affectedRows === 0) {
          await connection.rollback();
          return NextResponse.json({ error: 'Owner request is no longer pending' }, { status: 409 });
        }

        await connection.query<ResultSetHeader>(
          `INSERT INTO owner_profiles (
            user_id,
            o_citizen_id,
            earning,
            created_at,
            updated_at
          )
          VALUES (?, ?, 0, NOW(), NOW())
          ON DUPLICATE KEY UPDATE
            o_citizen_id = VALUES(o_citizen_id),
            updated_at = NOW()`,
          [userId, citizenId]
        );

        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }

      const updatedUser = await getUserById(userId);
      return NextResponse.json({
        success: true,
        message: 'Owner request approved',
        user: updatedUser ? buildUserResponse(updatedUser) : null,
      });
    }

    const [rejectResult] = await pool.query<ResultSetHeader>(
      `UPDATE users
      SET owner_request_status = 'REJECTED',
          updated_at = NOW()
      WHERE user_id = ?
        AND owner_request_status = 'PENDING'`,
      [userId]
    );

    if (rejectResult.affectedRows === 0) {
      return NextResponse.json({ error: 'Owner request is no longer pending' }, { status: 409 });
    }

    const updatedUser = await getUserById(userId);
    return NextResponse.json({
      success: true,
      message: 'Owner request rejected',
      user: updatedUser ? buildUserResponse(updatedUser) : null,
    });
  } catch (error) {
    console.error('Patch user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
