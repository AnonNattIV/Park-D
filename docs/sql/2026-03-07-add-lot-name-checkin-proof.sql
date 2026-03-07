SET @add_lot_name_sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'parking_lots'
        AND COLUMN_NAME = 'lot_name'
    ),
    'SELECT ''parking_lots.lot_name already exists''',
    'ALTER TABLE parking_lots ADD COLUMN lot_name VARCHAR(120) NULL AFTER owner_user_id'
  )
);
PREPARE add_lot_name_stmt FROM @add_lot_name_sql;
EXECUTE add_lot_name_stmt;
DEALLOCATE PREPARE add_lot_name_stmt;

SET @add_checkin_proof_sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'bookings'
        AND COLUMN_NAME = 'checkin_proof'
    ),
    'SELECT ''bookings.checkin_proof already exists''',
    'ALTER TABLE bookings ADD COLUMN checkin_proof VARCHAR(512) NULL AFTER checkin_datetime'
  )
);
PREPARE add_checkin_proof_stmt FROM @add_checkin_proof_sql;
EXECUTE add_checkin_proof_stmt;
DEALLOCATE PREPARE add_checkin_proof_stmt;
