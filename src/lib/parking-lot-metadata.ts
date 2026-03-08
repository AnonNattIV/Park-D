import 'server-only';

import type { RowDataPacket } from 'mysql2';
import getPool from '@/lib/db/mysql';

interface ColumnExistsRow extends RowDataPacket {
  has_column: number | string;
}

let metadataSchemaEnsured = false;

const METADATA_COLUMN_DEFINITIONS: Array<{ name: string; definition: string }> = [
  { name: 'image_urls_json', definition: 'TEXT NULL' },
  { name: 'owner_evidence_url', definition: 'VARCHAR(1024) NULL' },
  { name: 'display_lot_name_th', definition: 'VARCHAR(255) NULL' },
  { name: 'display_location_th', definition: 'VARCHAR(500) NULL' },
  { name: 'display_address_line_th', definition: 'VARCHAR(255) NULL' },
  { name: 'display_street_number_th', definition: 'VARCHAR(100) NULL' },
  { name: 'display_district_th', definition: 'VARCHAR(255) NULL' },
  { name: 'display_amphoe_th', definition: 'VARCHAR(255) NULL' },
  { name: 'display_subdistrict_th', definition: 'VARCHAR(255) NULL' },
  { name: 'display_province_th', definition: 'VARCHAR(255) NULL' },
];

export async function ensureParkingLotMetadataSchema(): Promise<void> {
  if (metadataSchemaEnsured) {
    return;
  }

  const pool = getPool();

  await pool.query(
    `CREATE TABLE IF NOT EXISTS parking_lot_metadata (
      lot_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      vehicle_types_json TEXT NULL,
      rules_json TEXT NULL,
      image_urls_json TEXT NULL,
      owner_evidence_url VARCHAR(1024) NULL,
      display_lot_name_th VARCHAR(255) NULL,
      display_location_th VARCHAR(500) NULL,
      display_address_line_th VARCHAR(255) NULL,
      display_street_number_th VARCHAR(100) NULL,
      display_district_th VARCHAR(255) NULL,
      display_amphoe_th VARCHAR(255) NULL,
      display_subdistrict_th VARCHAR(255) NULL,
      display_province_th VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_parking_lot_metadata_lot
        FOREIGN KEY (lot_id) REFERENCES parking_lots(lot_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  for (const column of METADATA_COLUMN_DEFINITIONS) {
    const [columnRows] = await pool.query<ColumnExistsRow[]>(
      `SELECT COUNT(*) AS has_column
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'parking_lot_metadata'
        AND column_name = ?
      LIMIT 1`,
      [column.name]
    );

    if (Number(columnRows[0]?.has_column || 0) === 0) {
      await pool.query(
        `ALTER TABLE parking_lot_metadata
        ADD COLUMN ${column.name} ${column.definition}`
      );
    }
  }

  metadataSchemaEnsured = true;
}

