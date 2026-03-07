-- Park-D owner cancel + wallet refund flow schema
-- Run this script once on the target database.

CREATE TABLE IF NOT EXISTS wallets (
  wallet_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL UNIQUE,
  balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_wallets_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_transactions (
  tx_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  wallet_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  booking_id BIGINT UNSIGNED NULL,
  payment_id BIGINT UNSIGNED NULL,
  tx_type ENUM('REFUND', 'TOPUP', 'DEBIT', 'ADJUSTMENT') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  balance_before DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL,
  note VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_wallet_transactions_wallet_created (wallet_id, created_at),
  KEY idx_wallet_transactions_user_created (user_id, created_at),
  CONSTRAINT fk_wallet_transactions_wallet
    FOREIGN KEY (wallet_id) REFERENCES wallets(wallet_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_wallet_transactions_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parking_lot_metadata (
  lot_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  vehicle_types_json TEXT NULL,
  rules_json TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_parking_lot_metadata_lot
    FOREIGN KEY (lot_id) REFERENCES parking_lots(lot_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS booking_vehicle_metadata (
  b_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  vehicle_brand VARCHAR(100) NULL,
  vehicle_model VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_booking_vehicle_metadata_booking
    FOREIGN KEY (b_id) REFERENCES bookings(b_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_proofs (
  pay_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  proof_image_url VARCHAR(1024) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_proofs_payment
    FOREIGN KEY (pay_id) REFERENCES payments(pay_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
