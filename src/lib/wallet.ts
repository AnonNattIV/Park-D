import 'server-only';

import type { RowDataPacket } from 'mysql2';
import type { Pool, PoolConnection } from 'mysql2/promise';

type QueryExecutor = Pick<Pool, 'query'> | Pick<PoolConnection, 'query'>;

interface WalletRow extends RowDataPacket {
  wallet_id: number;
  user_id: number;
  balance: number | string;
}

interface WalletTransactionRow extends RowDataPacket {
  tx_id: number;
  tx_type: string;
  amount: number | string;
  balance_before: number | string;
  balance_after: number | string;
  note: string | null;
  booking_id: number | null;
  payment_id: number | null;
  created_at: Date | string;
}

export async function ensureWalletTables(executor: QueryExecutor): Promise<void> {
  await executor.query(
    `CREATE TABLE IF NOT EXISTS wallets (
      wallet_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL UNIQUE,
      balance DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_wallets_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await executor.query(
    `CREATE TABLE IF NOT EXISTS wallet_transactions (
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
      CONSTRAINT fk_wallet_transactions_wallet
        FOREIGN KEY (wallet_id) REFERENCES wallets(wallet_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
      CONSTRAINT fk_wallet_transactions_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

export async function ensureUserWallet(
  executor: QueryExecutor,
  userId: number
): Promise<WalletRow> {
  await executor.query(
    `INSERT INTO wallets (user_id, balance, created_at, updated_at)
    VALUES (?, 0, NOW(), NOW())
    ON DUPLICATE KEY UPDATE updated_at = updated_at`,
    [userId]
  );

  const [walletRows] = await executor.query<WalletRow[]>(
    `SELECT wallet_id, user_id, balance
    FROM wallets
    WHERE user_id = ?
    LIMIT 1`,
    [userId]
  );

  if (walletRows.length === 0) {
    throw new Error('Unable to initialize wallet');
  }

  return walletRows[0];
}

export async function getUserWalletWithTransactions(
  executor: QueryExecutor,
  userId: number,
  limit = 10
): Promise<{
  walletId: number;
  balance: number;
  transactions: Array<{
    id: number;
    type: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    note: string | null;
    bookingId: number | null;
    paymentId: number | null;
    createdAt: Date | string;
  }>;
}> {
  const walletRow = await ensureUserWallet(executor, userId);

  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 10;
  const [transactionRows] = await executor.query<WalletTransactionRow[]>(
    `SELECT
      tx_id,
      tx_type,
      amount,
      balance_before,
      balance_after,
      note,
      booking_id,
      payment_id,
      created_at
    FROM wallet_transactions
    WHERE wallet_id = ?
    ORDER BY tx_id DESC
    LIMIT ?`,
    [walletRow.wallet_id, normalizedLimit]
  );

  return {
    walletId: walletRow.wallet_id,
    balance: Number(walletRow.balance || 0),
    transactions: transactionRows.map((row) => ({
      id: row.tx_id,
      type: row.tx_type,
      amount: Number(row.amount || 0),
      balanceBefore: Number(row.balance_before || 0),
      balanceAfter: Number(row.balance_after || 0),
      note: row.note,
      bookingId: row.booking_id === null ? null : Number(row.booking_id),
      paymentId: row.payment_id === null ? null : Number(row.payment_id),
      createdAt: row.created_at,
    })),
  };
}

