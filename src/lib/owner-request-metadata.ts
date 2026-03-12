import 'server-only';

import type { RowDataPacket } from 'mysql2';
import getPool from '@/lib/db/mysql';

interface ColumnExistsRow extends RowDataPacket {
  has_column: number | string;
}

let ownerRequestMetadataSchemaEnsured = false;

const OWNER_REQUEST_METADATA_COLUMNS: Array<{ name: string; definition: string }> = [
  { name: 'citizen_id', definition: 'VARCHAR(32) NOT NULL' },
  { name: 'evidence_url', definition: 'VARCHAR(1024) NULL' },
];

export async function ensureOwnerRequestMetadataSchema(): Promise<void> {
  if (ownerRequestMetadataSchemaEnsured) {
    return;
  }

  const pool = getPool();

  await pool.query(
    `CREATE TABLE IF NOT EXISTS owner_request_metadata (
      user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      citizen_id VARCHAR(32) NOT NULL,
      evidence_url VARCHAR(1024) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_owner_request_metadata_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  for (const column of OWNER_REQUEST_METADATA_COLUMNS) {
    const [rows] = await pool.query<ColumnExistsRow[]>(
      `SELECT COUNT(*) AS has_column
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'owner_request_metadata'
        AND column_name = ?
      LIMIT 1`,
      [column.name]
    );

    if (Number(rows[0]?.has_column || 0) === 0) {
      await pool.query(
        `ALTER TABLE owner_request_metadata
        ADD COLUMN ${column.name} ${column.definition}`
      );
    }
  }

  ownerRequestMetadataSchemaEnsured = true;
}
