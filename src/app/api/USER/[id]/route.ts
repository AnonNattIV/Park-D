import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import getPool from '@/lib/db/mysql';
import { verifyToken } from '@/lib/auth';
import { OwnerRequestStatus, resolveAppRole } from '@/lib/roles';

type PatchAction = 'REQUEST_OWNER' | 'APPROVE_OWNER' | 'REJECT_OWNER';

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
  phone: string | null;
  u_status: 'ACTIVE' | 'INACTIVE' | 'BANNED';
  owner_request_status: OwnerRequestStatus;
  roles: string;
  has_owner_profile: number;
}

interface OwnerRoleRow extends RowDataPacket {
  user_id: number;
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
      u.phone,
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
    phone: user.phone,
    status: user.u_status,
    ownerRequestStatus: user.owner_request_status,
    role: resolveAppRole({
      roles: user.roles,
      hasOwnerProfile: user.has_owner_profile,
      ownerRequestStatus: user.owner_request_status,
    }),
  };
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

    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      user: buildUserResponse(user),
    });
  } catch (error) {
    console.error('Get user error:', error);
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
      const citizenId = typeof body?.citizenId === 'string' ? body.citizenId.trim() : '';
      if (!citizenId) {
        return NextResponse.json({ error: 'citizenId is required to approve owner role' }, { status: 400 });
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

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
