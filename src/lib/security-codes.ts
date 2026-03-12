import 'server-only';

import crypto from 'crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { Pool, PoolConnection } from 'mysql2/promise';

type QueryExecutor = Pick<Pool, 'query'> | Pick<PoolConnection, 'query'>;

export type SecurityCodePurpose = 'PASSWORD_RESET' | 'ACCOUNT_SENSITIVE_CHANGE' | 'EMAIL_VERIFICATION';

interface SecurityCodeRow extends RowDataPacket {
  security_code_id: number;
  user_id: number | null;
  email: string;
  purpose: string;
  target_value: string | null;
  code_hash: string;
  attempts: number | string;
  max_attempts: number | string;
  expires_at: Date | string;
}

interface SecurityCodeCreatedAtRow extends RowDataPacket {
  created_at: Date | string;
}

interface CreateSecurityCodeInput {
  userId: number | null;
  email: string;
  purpose: SecurityCodePurpose;
  targetValue?: string | null;
  expiresInMinutes?: number;
}

interface VerifySecurityCodeInput {
  userId: number | null;
  email: string;
  purpose: SecurityCodePurpose;
  targetValue?: string | null;
  code: string;
}

let securityCodeSchemaEnsured = false;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeTargetValue(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

function getCodePepper(): string {
  return process.env.SECURITY_CODE_PEPPER?.trim() || process.env.JWT_SECRET || 'parkd-security-code';
}

function hashSecurityCode(value: string): string {
  return crypto
    .createHash('sha256')
    .update(`${value}:${getCodePepper()}`)
    .digest('hex');
}

export function generateNumericSecurityCode(length = 6): string {
  let output = '';

  for (let index = 0; index < length; index += 1) {
    output += String(crypto.randomInt(0, 10));
  }

  return output;
}

function isDateExpired(value: Date | string): boolean {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return true;
  }

  return parsed.getTime() < Date.now();
}

export async function ensureSecurityCodeTable(executor: QueryExecutor): Promise<void> {
  if (securityCodeSchemaEnsured) {
    return;
  }

  await executor.query(
    `CREATE TABLE IF NOT EXISTS user_security_codes (
      security_code_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      email VARCHAR(255) NOT NULL,
      purpose VARCHAR(64) NOT NULL,
      target_value VARCHAR(255) NULL,
      code_hash CHAR(64) NOT NULL,
      attempts INT UNSIGNED NOT NULL DEFAULT 0,
      max_attempts INT UNSIGNED NOT NULL DEFAULT 5,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user_security_codes_lookup (email, purpose, used_at, expires_at),
      INDEX idx_user_security_codes_user_lookup (user_id, purpose, used_at, expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  securityCodeSchemaEnsured = true;
}

export async function createSecurityCode(
  executor: QueryExecutor,
  input: CreateSecurityCodeInput
): Promise<string> {
  const normalizedEmail = normalizeEmail(input.email);
  const normalizedTargetValue = normalizeTargetValue(input.targetValue);
  const expiresInMinutes = Number.isInteger(input.expiresInMinutes)
    ? Math.min(Math.max(Number(input.expiresInMinutes || 15), 1), 60)
    : 15;

  const code = generateNumericSecurityCode();
  const codeHash = hashSecurityCode(code);

  await executor.query(
    `UPDATE user_security_codes
    SET used_at = NOW(),
        updated_at = NOW()
    WHERE email = ?
      AND purpose = ?
      AND used_at IS NULL
      AND (
        (? IS NULL AND user_id IS NULL)
        OR user_id = ?
      )`,
    [normalizedEmail, input.purpose, input.userId, input.userId]
  );

  await executor.query(
    `INSERT INTO user_security_codes (
      user_id,
      email,
      purpose,
      target_value,
      code_hash,
      attempts,
      max_attempts,
      expires_at,
      used_at,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, 0, 5, DATE_ADD(NOW(), INTERVAL ? MINUTE), NULL, NOW(), NOW())`,
    [
      input.userId,
      normalizedEmail,
      input.purpose,
      normalizedTargetValue || null,
      codeHash,
      expiresInMinutes,
    ]
  );

  return code;
}

export async function getSecurityCodeCooldownRemaining(
  executor: QueryExecutor,
  input: {
    userId: number | null;
    email: string;
    purpose: SecurityCodePurpose;
    cooldownSeconds?: number;
  }
): Promise<number> {
  const normalizedEmail = normalizeEmail(input.email);
  const cooldownSeconds = Number.isInteger(input.cooldownSeconds)
    ? Math.min(Math.max(Number(input.cooldownSeconds || 60), 1), 3600)
    : 60;

  const [rows] = await executor.query<SecurityCodeCreatedAtRow[]>(
    `SELECT created_at
    FROM user_security_codes
    WHERE email = ?
      AND purpose = ?
      AND (
        (? IS NULL AND user_id IS NULL)
        OR user_id = ?
      )
    ORDER BY security_code_id DESC
    LIMIT 1`,
    [normalizedEmail, input.purpose, input.userId, input.userId]
  );

  if (rows.length === 0) {
    return 0;
  }

  const createdAtRaw = rows[0].created_at;
  const createdAt = createdAtRaw instanceof Date ? createdAtRaw : new Date(createdAtRaw);
  if (Number.isNaN(createdAt.getTime())) {
    return 0;
  }

  const elapsedSeconds = Math.floor((Date.now() - createdAt.getTime()) / 1000);
  const remaining = cooldownSeconds - elapsedSeconds;
  return remaining > 0 ? remaining : 0;
}

async function verifySecurityCodeInternal(
  executor: QueryExecutor,
  input: VerifySecurityCodeInput,
  consumeOnSuccess: boolean
): Promise<boolean> {
  const normalizedEmail = normalizeEmail(input.email);
  const normalizedCode = input.code.trim();
  const normalizedTargetValue = normalizeTargetValue(input.targetValue);

  if (!normalizedCode) {
    return false;
  }

  const [rows] = await executor.query<SecurityCodeRow[]>(
    `SELECT
      security_code_id,
      user_id,
      email,
      purpose,
      target_value,
      code_hash,
      attempts,
      max_attempts,
      expires_at
    FROM user_security_codes
    WHERE email = ?
      AND purpose = ?
      AND used_at IS NULL
    ORDER BY security_code_id DESC
    LIMIT 1`,
    [normalizedEmail, input.purpose]
  );

  if (rows.length === 0) {
    return false;
  }

  const record = rows[0];
  if (input.userId !== null && Number(record.user_id) !== Number(input.userId)) {
    return false;
  }

  if (normalizeTargetValue(record.target_value) !== normalizedTargetValue) {
    return false;
  }

  if (isDateExpired(record.expires_at)) {
    return false;
  }

  const attempts = Number(record.attempts || 0);
  const maxAttempts = Number(record.max_attempts || 5);
  if (attempts >= maxAttempts) {
    return false;
  }

  const expectedHash = hashSecurityCode(normalizedCode);
  if (expectedHash !== record.code_hash) {
    await executor.query<ResultSetHeader>(
      `UPDATE user_security_codes
      SET attempts = attempts + 1,
          updated_at = NOW()
      WHERE security_code_id = ?
        AND used_at IS NULL`,
      [record.security_code_id]
    );
    return false;
  }

  if (!consumeOnSuccess) {
    return true;
  }

  const [consumeResult] = await executor.query<ResultSetHeader>(
    `UPDATE user_security_codes
    SET used_at = NOW(),
        updated_at = NOW()
    WHERE security_code_id = ?
      AND used_at IS NULL`,
    [record.security_code_id]
  );

  return Number(consumeResult.affectedRows || 0) > 0;
}

export async function verifyAndConsumeSecurityCode(
  executor: QueryExecutor,
  input: VerifySecurityCodeInput
): Promise<boolean> {
  return verifySecurityCodeInternal(executor, input, true);
}

export async function verifySecurityCode(
  executor: QueryExecutor,
  input: VerifySecurityCodeInput
): Promise<boolean> {
  return verifySecurityCodeInternal(executor, input, false);
}
