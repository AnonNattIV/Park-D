import 'server-only';

import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { Pool, PoolConnection } from 'mysql2/promise';
import { isBrevoMailConfigured, sendTransactionalEmail } from '@/lib/email';

type QueryExecutor = Pick<Pool, 'query'> | Pick<PoolConnection, 'query'>;

interface NotificationRow extends RowDataPacket {
  notification_id: number;
  notification_type: string;
  title: string;
  message: string;
  action_url: string | null;
  is_read: number | string;
  created_at: Date | string;
  read_at: Date | string | null;
}

interface UnreadCountRow extends RowDataPacket {
  unread_count: number | string;
}

interface AdminUserRow extends RowDataPacket {
  user_id: number;
}

interface UserEmailRow extends RowDataPacket {
  user_id: number;
  username: string;
  email: string;
  u_status: string;
}

export interface NotificationPayload {
  userId: number;
  type: string;
  title: string;
  message: string;
  actionUrl?: string | null;
}

export interface DeliverableNotificationPayload extends NotificationPayload {
  sendEmail?: boolean;
  emailSubject?: string;
}

export interface UserNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  actionUrl: string | null;
  isRead: boolean;
  createdAt: Date | string;
  readAt: Date | string | null;
}

let notificationsSchemaEnsured = false;

function normalizeType(value: string): string {
  const normalized = value.trim().toUpperCase();
  return normalized ? normalized.slice(0, 64) : 'SYSTEM';
}

function normalizeTitle(value: string): string {
  const normalized = value.trim();
  return normalized ? normalized.slice(0, 160) : 'Notification';
}

function normalizeMessage(value: string): string {
  const normalized = value.trim();
  return normalized ? normalized.slice(0, 1024) : '-';
}

function normalizeActionUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, 1024);
}

function normalizeEmailSubject(value: string | undefined, fallback: string): string {
  const normalized = (value || '').trim();
  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, 180);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveAppBaseUrl(): string {
  const raw =
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.RAILWAY_PUBLIC_DOMAIN?.trim() ||
    '';

  if (!raw) {
    return '';
  }

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, '');
}

function toAbsoluteUrl(actionUrl: string | null | undefined): string | null {
  if (!actionUrl) {
    return null;
  }

  const trimmed = actionUrl.trim();
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const baseUrl = resolveAppBaseUrl();
  if (!baseUrl) {
    return null;
  }

  return `${baseUrl}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}

export async function ensureNotificationTables(executor: QueryExecutor): Promise<void> {
  if (notificationsSchemaEnsured) {
    return;
  }

  await executor.query(
    `CREATE TABLE IF NOT EXISTS user_notifications (
      notification_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      notification_type VARCHAR(64) NOT NULL,
      title VARCHAR(160) NOT NULL,
      message VARCHAR(1024) NOT NULL,
      action_url VARCHAR(1024) NULL,
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      read_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user_notifications_user_created (user_id, notification_id),
      INDEX idx_user_notifications_user_read (user_id, is_read, notification_id),
      CONSTRAINT fk_user_notifications_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  notificationsSchemaEnsured = true;
}

export async function createNotifications(
  executor: QueryExecutor,
  payloads: NotificationPayload[]
): Promise<void> {
  const validPayloads = payloads.filter(
    (payload) => Number.isInteger(payload.userId) && payload.userId > 0
  );

  if (validPayloads.length === 0) {
    return;
  }

  const valuePlaceholders = validPayloads.map(() => '(?, ?, ?, ?, ?, 0, NULL, NOW(), NOW())').join(', ');
  const params: Array<number | string | null> = [];

  for (const payload of validPayloads) {
    params.push(
      payload.userId,
      normalizeType(payload.type),
      normalizeTitle(payload.title),
      normalizeMessage(payload.message),
      normalizeActionUrl(payload.actionUrl)
    );
  }

  await executor.query(
    `INSERT INTO user_notifications (
      user_id,
      notification_type,
      title,
      message,
      action_url,
      is_read,
      read_at,
      created_at,
      updated_at
    )
    VALUES ${valuePlaceholders}`,
    params
  );
}

export async function createNotification(
  executor: QueryExecutor,
  payload: NotificationPayload
): Promise<void> {
  await createNotifications(executor, [payload]);
}

async function sendNotificationEmails(
  executor: QueryExecutor,
  payloads: DeliverableNotificationPayload[]
): Promise<void> {
  if (!isBrevoMailConfigured()) {
    return;
  }

  const targets = payloads.filter(
    (payload) => payload.sendEmail === true && Number.isInteger(payload.userId) && payload.userId > 0
  );
  if (targets.length === 0) {
    return;
  }

  const uniqueUserIds = Array.from(new Set(targets.map((payload) => payload.userId)));
  const placeholders = uniqueUserIds.map(() => '?').join(', ');

  const [rows] = await executor.query<UserEmailRow[]>(
    `SELECT user_id, username, email, u_status
    FROM users
    WHERE user_id IN (${placeholders})`,
    uniqueUserIds
  );

  const activeUsers = new Map<number, UserEmailRow>();
  for (const row of rows) {
    if (row.u_status === 'ACTIVE' && row.email) {
      activeUsers.set(Number(row.user_id), row);
    }
  }

  for (const payload of targets) {
    const user = activeUsers.get(payload.userId);
    if (!user) {
      continue;
    }

    const actionUrl = normalizeActionUrl(payload.actionUrl);
    const absoluteActionUrl = toAbsoluteUrl(actionUrl);
    const subject = normalizeEmailSubject(payload.emailSubject, payload.title || 'Park:D notification');
    const safeTitle = escapeHtml(payload.title || 'Notification');
    const safeMessage = escapeHtml(payload.message || '-');
    const safeUsername = escapeHtml(user.username || 'User');
    const actionHtml = absoluteActionUrl
      ? `<p style="margin-top:14px"><a href="${escapeHtml(absoluteActionUrl)}" style="color:#2563eb;text-decoration:none;font-weight:600">Open in Park:D</a></p>`
      : '';
    const actionText = absoluteActionUrl ? `\nOpen: ${absoluteActionUrl}` : '';

    try {
      await sendTransactionalEmail({
        to: user.email,
        subject,
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
            <h2 style="margin:0 0 12px 0">${safeTitle}</h2>
            <p>Hello ${safeUsername},</p>
            <p>${safeMessage}</p>
            ${actionHtml}
          </div>
        `,
        text: `${payload.title}\n${payload.message}${actionText}`,
      });
    } catch (mailError) {
      console.error('Unable to send notification email:', mailError);
    }
  }
}

export async function createNotificationsWithDelivery(
  executor: QueryExecutor,
  payloads: DeliverableNotificationPayload[]
): Promise<void> {
  await createNotifications(executor, payloads);
  await sendNotificationEmails(executor, payloads);
}

export async function createNotificationWithDelivery(
  executor: QueryExecutor,
  payload: DeliverableNotificationPayload
): Promise<void> {
  await createNotificationsWithDelivery(executor, [payload]);
}

export async function getUnreadNotificationCount(
  executor: QueryExecutor,
  userId: number
): Promise<number> {
  const [rows] = await executor.query<UnreadCountRow[]>(
    `SELECT COUNT(*) AS unread_count
    FROM user_notifications
    WHERE user_id = ?
      AND is_read = 0`,
    [userId]
  );

  return Number(rows[0]?.unread_count || 0);
}

export async function listUserNotifications(
  executor: QueryExecutor,
  userId: number,
  options?: {
    limit?: number;
    unreadOnly?: boolean;
  }
): Promise<UserNotification[]> {
  const limit = Number.isInteger(options?.limit) ? Math.min(Math.max(Number(options?.limit || 20), 1), 100) : 20;
  const unreadOnly = options?.unreadOnly === true;

  const whereClause = unreadOnly
    ? 'WHERE user_id = ? AND is_read = 0'
    : 'WHERE user_id = ?';

  const [rows] = await executor.query<NotificationRow[]>(
    `SELECT
      notification_id,
      notification_type,
      title,
      message,
      action_url,
      is_read,
      created_at,
      read_at
    FROM user_notifications
    ${whereClause}
    ORDER BY notification_id DESC
    LIMIT ?`,
    [userId, limit]
  );

  return rows.map((row) => ({
    id: Number(row.notification_id),
    type: row.notification_type,
    title: row.title,
    message: row.message,
    actionUrl: row.action_url,
    isRead: Number(row.is_read || 0) === 1,
    createdAt: row.created_at,
    readAt: row.read_at,
  }));
}

export async function markAllNotificationsAsRead(
  executor: QueryExecutor,
  userId: number
): Promise<number> {
  const [result] = await executor.query<ResultSetHeader>(
    `UPDATE user_notifications
    SET is_read = 1,
        read_at = NOW(),
        updated_at = NOW()
    WHERE user_id = ?
      AND is_read = 0`,
    [userId]
  );

  return Number(result.affectedRows || 0);
}

export async function markNotificationAsRead(
  executor: QueryExecutor,
  userId: number,
  notificationId: number
): Promise<number> {
  const [result] = await executor.query<ResultSetHeader>(
    `UPDATE user_notifications
    SET is_read = 1,
        read_at = NOW(),
        updated_at = NOW()
    WHERE notification_id = ?
      AND user_id = ?
      AND is_read = 0`,
    [notificationId, userId]
  );

  return Number(result.affectedRows || 0);
}

export async function listActiveAdminUserIds(executor: QueryExecutor): Promise<number[]> {
  const [rows] = await executor.query<AdminUserRow[]>(
    `SELECT user_id
    FROM users
    WHERE u_status = 'ACTIVE'
      AND FIND_IN_SET('ADMIN', REPLACE(UPPER(roles), ' ', '')) > 0`
  );

  return rows.map((row) => Number(row.user_id)).filter((id) => Number.isInteger(id) && id > 0);
}

