import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import getPool from '@/lib/db/mysql';
import { verifyToken } from '@/lib/auth';
import { ensureOwnerRequestMetadataSchema } from '@/lib/owner-request-metadata';
import {
  deleteOwnerRequestEvidenceByUrl,
  uploadOwnerRequestEvidence,
} from '@/lib/storage';
import type { OwnerRequestStatus } from '@/lib/roles';
import {
  createNotification,
  createNotifications,
  ensureNotificationTables,
  listActiveAdminUserIds,
} from '@/lib/notifications';

export const dynamic = 'force-dynamic';

type TokenPayload = {
  userId?: string;
  role?: string;
};

interface OwnerRequestUserRow extends RowDataPacket {
  user_id: number;
  username: string;
  u_status: 'ACTIVE' | 'INACTIVE' | 'BANNED';
  owner_request_status: OwnerRequestStatus;
}

interface OwnerRequestMetadataRow extends RowDataPacket {
  user_id: number;
  citizen_id: string;
  evidence_url: string | null;
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

async function readOwnerRequestUser(userId: number): Promise<OwnerRequestUserRow | null> {
  const pool = getPool();
  const [rows] = await pool.query<OwnerRequestUserRow[]>(
    `SELECT user_id, username, u_status, owner_request_status
    FROM users
    WHERE user_id = ?
    LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
}

async function readOwnerRequestMetadata(userId: number): Promise<OwnerRequestMetadataRow | null> {
  const pool = getPool();
  await ensureOwnerRequestMetadataSchema();

  const [rows] = await pool.query<OwnerRequestMetadataRow[]>(
    `SELECT user_id, citizen_id, evidence_url
    FROM owner_request_metadata
    WHERE user_id = ?
    LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
}

export async function GET(request: NextRequest) {
  try {
    const requesterUserId = readRequesterUserId(request);
    if (!requesterUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await readOwnerRequestUser(requesterUserId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const metadata = await readOwnerRequestMetadata(requesterUserId);
    return NextResponse.json({
      success: true,
      user: {
        id: user.user_id,
        username: user.username,
        ownerRequestStatus: user.owner_request_status,
      },
      ownerRequest: {
        status: user.owner_request_status,
        citizenId: metadata?.citizen_id || null,
        evidenceUrl: metadata?.evidence_url || null,
      },
    });
  } catch (error) {
    console.error('Unable to load owner request:', error);
    return NextResponse.json(
      { error: 'Unable to load owner request right now' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let uploadedEvidenceUrl: string | null = null;
  let replacedEvidenceUrl: string | null = null;

  try {
    const requesterUserId = readRequesterUserId(request);
    if (!requesterUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const citizenId = typeof formData.get('citizenId') === 'string'
      ? String(formData.get('citizenId')).trim()
      : '';
    const evidence = formData.get('evidence');

    if (!citizenId) {
      return NextResponse.json({ error: 'Citizen ID is required' }, { status: 400 });
    }

    if (!/^\d+$/.test(citizenId)) {
      return NextResponse.json({ error: 'Citizen ID must contain numbers only' }, { status: 400 });
    }

    const hasNewEvidenceUpload = evidence instanceof File && evidence.size > 0;

    const user = await readOwnerRequestUser(requesterUserId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.u_status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Only active users can request owner role' }, { status: 400 });
    }

    if (user.owner_request_status === 'APPROVED') {
      return NextResponse.json({ error: 'User is already approved as owner' }, { status: 409 });
    }

    if (user.owner_request_status === 'PENDING') {
      return NextResponse.json({ error: 'Owner request is already pending' }, { status: 409 });
    }

    const previousMetadata = await readOwnerRequestMetadata(requesterUserId);

    if (!hasNewEvidenceUpload && !previousMetadata?.evidence_url) {
      return NextResponse.json({ error: 'Citizen ID evidence image is required' }, { status: 400 });
    }

    if (hasNewEvidenceUpload && evidence instanceof File) {
      if (!evidence.type.startsWith('image/')) {
        return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 });
      }

      if (evidence.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'Evidence image must be 5 MB or smaller' },
          { status: 400 }
        );
      }

      uploadedEvidenceUrl = await uploadOwnerRequestEvidence(evidence, requesterUserId);
      replacedEvidenceUrl = previousMetadata?.evidence_url || null;
    }

    const nextEvidenceUrl = uploadedEvidenceUrl || previousMetadata?.evidence_url || null;

    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      await ensureOwnerRequestMetadataSchema();

      const [updateResult] = await connection.query<ResultSetHeader>(
        `UPDATE users
        SET owner_request_status = 'PENDING',
            updated_at = NOW()
        WHERE user_id = ?
          AND (owner_request_status IS NULL OR owner_request_status <> 'PENDING')`,
        [requesterUserId]
      );

      if (updateResult.affectedRows === 0) {
        await connection.rollback();
        return NextResponse.json({ error: 'Owner request is already pending' }, { status: 409 });
      }

      await connection.query(
        `INSERT INTO owner_request_metadata (
          user_id,
          citizen_id,
          evidence_url
        )
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          citizen_id = VALUES(citizen_id),
          evidence_url = VALUES(evidence_url),
          updated_at = CURRENT_TIMESTAMP`,
        [requesterUserId, citizenId, nextEvidenceUrl]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    if (replacedEvidenceUrl && replacedEvidenceUrl !== uploadedEvidenceUrl) {
      await deleteOwnerRequestEvidenceByUrl(replacedEvidenceUrl);
    }

    try {
      await ensureNotificationTables(pool);
      const adminIds = await listActiveAdminUserIds(pool);
      if (adminIds.length > 0) {
        await createNotifications(
          pool,
          adminIds.map((adminUserId) => ({
            userId: adminUserId,
            type: 'OWNER_REQUEST_SUBMITTED',
            title: 'New owner request',
            message: `${user.username} submitted an owner role request.`,
            actionUrl: '/admin',
          }))
        );
      }

      await createNotification(pool, {
        userId: requesterUserId,
        type: 'OWNER_REQUEST_SUBMITTED',
        title: 'Owner request submitted',
        message: 'Your owner request has been submitted and is waiting for admin review.',
        actionUrl: '/owner/request',
      });
    } catch (notificationError) {
      console.error('Unable to create owner request notifications:', notificationError);
    }

    return NextResponse.json({
      success: true,
      message: 'Owner request submitted',
      user: {
        id: requesterUserId,
        username: user.username,
        ownerRequestStatus: 'PENDING',
      },
      ownerRequest: {
        status: 'PENDING',
        citizenId,
        evidenceUrl: nextEvidenceUrl,
      },
    });
  } catch (error) {
    console.error('Unable to submit owner request:', error);
    if (uploadedEvidenceUrl) {
      try {
        await deleteOwnerRequestEvidenceByUrl(uploadedEvidenceUrl);
      } catch (cleanupError) {
        console.error('Unable to clean up owner request evidence:', cleanupError);
      }
    }

    return NextResponse.json(
      { error: 'Unable to submit owner request right now' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const requesterUserId = readRequesterUserId(request);
    if (!requesterUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await readOwnerRequestUser(requesterUserId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.owner_request_status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Only pending owner request can be cancelled' },
        { status: 409 }
      );
    }

    const pool = getPool();
    const [updateResult] = await pool.query<ResultSetHeader>(
      `UPDATE users
      SET owner_request_status = NULL,
          updated_at = NOW()
      WHERE user_id = ?
        AND owner_request_status = 'PENDING'`,
      [requesterUserId]
    );

    if (updateResult.affectedRows === 0) {
      return NextResponse.json(
        { error: 'Owner request is no longer pending' },
        { status: 409 }
      );
    }

    try {
      await ensureNotificationTables(pool);
      await createNotification(pool, {
        userId: requesterUserId,
        type: 'OWNER_REQUEST_CANCELLED',
        title: 'Owner request cancelled',
        message: 'Your owner request was cancelled. You can edit and submit again.',
        actionUrl: '/owner/request',
      });
    } catch (notificationError) {
      console.error('Unable to create owner request cancel notification:', notificationError);
    }

    const metadata = await readOwnerRequestMetadata(requesterUserId);
    return NextResponse.json({
      success: true,
      message: 'Owner request cancelled',
      user: {
        id: requesterUserId,
        username: user.username,
        ownerRequestStatus: null,
      },
      ownerRequest: {
        status: null,
        citizenId: metadata?.citizen_id || null,
        evidenceUrl: metadata?.evidence_url || null,
      },
    });
  } catch (error) {
    console.error('Unable to cancel owner request:', error);
    return NextResponse.json(
      { error: 'Unable to cancel owner request right now' },
      { status: 500 }
    );
  }
}
