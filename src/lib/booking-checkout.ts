import 'server-only';

import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import getPool from '@/lib/db/mysql';
import { ensureUserWallet, ensureWalletTables } from '@/lib/wallet';

export type CheckoutSettlementReason =
  | 'OWNER_APPROVED'
  | 'AUTO_APPROVED_7H'
  | 'AUTO_CHECKOUT_NO_CHECKIN';

interface BookingSettlementRow extends RowDataPacket {
  b_id: number;
  renter_user_id: number;
  owner_user_id: number;
  b_status: string;
  checkin_proof: string | null;
  checkin_datetime: Date | string | null;
  checkout_datetime: Date | string | null;
  price: number | string;
  total_minutes: number | string | null;
  pay_id: number | null;
  pay_status: string | null;
  pay_amount: number | string | null;
}

interface WalletLockRow extends RowDataPacket {
  wallet_id: number;
  balance: number | string;
}

interface AutoCheckoutCandidateRow extends RowDataPacket {
  b_id: number;
}

interface AutoApprovalCandidateRow extends RowDataPacket {
  b_id: number;
  late_minutes: number | string;
}

interface SettlementComputation {
  payAmount: number;
  rentAmount: number;
  ownerShare: number;
  platformShare: number;
  baseRefund: number;
  lateMinutes: number;
  penaltyAmount: number;
  renterRefund: number;
  ownerBonus: number;
}

interface CheckoutSettlementPolicy {
  lateMinutes?: number;
  forceForfeitHalf?: boolean;
  finalStatus?: 'CHECKOUT_APPROVED' | 'CHECKOUT_REJECTED';
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

async function ensureCheckoutSettlementTable(connection: PoolConnection): Promise<void> {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS booking_checkout_settlements (
      b_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      owner_user_id BIGINT UNSIGNED NOT NULL,
      renter_user_id BIGINT UNSIGNED NOT NULL,
      pay_id BIGINT UNSIGNED NULL,
      pay_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      rent_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      owner_share DECIMAL(12,2) NOT NULL DEFAULT 0,
      platform_share DECIMAL(12,2) NOT NULL DEFAULT 0,
      renter_refund DECIMAL(12,2) NOT NULL DEFAULT 0,
      owner_bonus DECIMAL(12,2) NOT NULL DEFAULT 0,
      settlement_reason ENUM('OWNER_APPROVED', 'AUTO_APPROVED_7H', 'AUTO_CHECKOUT_NO_CHECKIN') NOT NULL,
      settled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_booking_checkout_settlements_booking
        FOREIGN KEY (b_id) REFERENCES bookings(b_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

function computeSettlementAmounts(
  booking: BookingSettlementRow,
  policy: CheckoutSettlementPolicy
): SettlementComputation {
  // Settlement model:
  // - payer transfers 150% of rent at payment time
  // - owner gets 80% of rent (+ optional bonus from forfeited refund)
  // - renter gets 50% base refund minus late penalties (or zero when forfeited)
  const isPaid = booking.pay_status === 'PAID';
  const payAmount = isPaid ? Number(booking.pay_amount || 0) : 0;
  const totalMinutes = Number(booking.total_minutes || 0);
  const price = Number(booking.price || 0);
  const rentAmount = isPaid ? roundMoney((totalMinutes / 60) * price) : 0;
  const ownerShare = isPaid ? roundMoney(rentAmount * 0.8) : 0;
  const platformShare = isPaid ? roundMoney(rentAmount * 0.2) : 0;
  const baseRefund = isPaid ? roundMoney(payAmount * 0.5) : 0;

  const lateMinutes = Math.max(0, Math.floor(Number(policy.lateMinutes || 0)));
  const penaltyAmount = isPaid ? roundMoney((lateMinutes / 60) * price) : 0;
  const forceForfeitHalf = Boolean(policy.forceForfeitHalf);

  const renterRefund = forceForfeitHalf
    ? 0
    : Math.max(0, roundMoney(baseRefund - penaltyAmount));
  const ownerBonus = roundMoney(baseRefund - renterRefund);

  return {
    payAmount,
    rentAmount,
    ownerShare,
    platformShare,
    baseRefund,
    lateMinutes,
    penaltyAmount,
    renterRefund,
    ownerBonus,
  };
}

async function creditWallet(
  connection: PoolConnection,
  userId: number,
  amount: number,
  txType: 'TOPUP' | 'REFUND',
  bookingId: number,
  paymentId: number | null,
  note: string
): Promise<void> {
  if (amount <= 0) {
    return;
  }

  await ensureUserWallet(connection, userId);

  const [walletRows] = await connection.query<WalletLockRow[]>(
    `SELECT wallet_id, balance
    FROM wallets
    WHERE user_id = ?
    LIMIT 1
    FOR UPDATE`,
    [userId]
  );

  if (walletRows.length === 0) {
    throw new Error('Unable to lock wallet for settlement');
  }

  const wallet = walletRows[0];
  const balanceBefore = Number(wallet.balance || 0);
  const balanceAfter = roundMoney(balanceBefore + amount);

  await connection.query(
    `UPDATE wallets
    SET balance = ?,
        updated_at = NOW()
    WHERE wallet_id = ?`,
    [balanceAfter, wallet.wallet_id]
  );

  await connection.query(
    `INSERT INTO wallet_transactions (
      wallet_id,
      user_id,
      booking_id,
      payment_id,
      tx_type,
      amount,
      balance_before,
      balance_after,
      note,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      wallet.wallet_id,
      userId,
      bookingId,
      paymentId,
      txType,
      amount,
      balanceBefore,
      balanceAfter,
      note,
    ]
  );
}

export async function finalizeCheckoutWithSettlement(
  connection: PoolConnection,
  bookingId: number,
  reason: CheckoutSettlementReason,
  policy: CheckoutSettlementPolicy = {}
): Promise<{ didSettle: boolean }> {
  await ensureWalletTables(connection);
  await ensureCheckoutSettlementTable(connection);

  const [bookingRows] = await connection.query<BookingSettlementRow[]>(
    `SELECT
      b.b_id,
      b.user_id AS renter_user_id,
      pl.owner_user_id,
      b.b_status,
      b.checkin_proof,
      b.checkin_datetime,
      b.checkout_datetime,
      pl.price,
      CASE
        WHEN b.checkin_datetime IS NOT NULL
         AND b.checkout_datetime IS NOT NULL
         AND b.checkout_datetime > b.checkin_datetime
        THEN TIMESTAMPDIFF(MINUTE, b.checkin_datetime, b.checkout_datetime)
        ELSE 0
      END AS total_minutes,
      p.pay_id,
      p.pay_status,
      p.pay_amount
    FROM bookings b
    INNER JOIN parking_lots pl ON pl.lot_id = b.lot_id
    LEFT JOIN payments p ON p.b_id = b.b_id
    WHERE b.b_id = ?
    LIMIT 1
    FOR UPDATE`,
    [bookingId]
  );

  if (bookingRows.length === 0) {
    throw new Error('Booking not found');
  }

  const booking = bookingRows[0];
  const finalStatus = policy.finalStatus || 'CHECKOUT_APPROVED';

  if (booking.b_status !== finalStatus) {
    await connection.query(
      `UPDATE bookings
      SET b_status = ?,
          updated_at = NOW()
      WHERE b_id = ?`,
      [finalStatus, bookingId]
    );
  }

  const amounts = computeSettlementAmounts(booking, policy);
  const ownerPayout = roundMoney(amounts.ownerShare + amounts.ownerBonus);
  const paymentId = booking.pay_id === null ? null : Number(booking.pay_id);

  const [settlementInsertResult] = await connection.query<ResultSetHeader>(
    `INSERT IGNORE INTO booking_checkout_settlements (
      b_id,
      owner_user_id,
      renter_user_id,
      pay_id,
      pay_amount,
      rent_amount,
      owner_share,
      platform_share,
      renter_refund,
      owner_bonus,
      settlement_reason,
      settled_at,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
    [
      bookingId,
      booking.owner_user_id,
      booking.renter_user_id,
      paymentId,
      amounts.payAmount,
      amounts.rentAmount,
      amounts.ownerShare,
      amounts.platformShare,
      amounts.renterRefund,
      amounts.ownerBonus,
      reason,
    ]
  );

  // INSERT IGNORE makes this operation idempotent for repeated review/automation calls.
  if (settlementInsertResult.affectedRows === 0) {
    return { didSettle: false };
  }

  await creditWallet(
    connection,
    Number(booking.owner_user_id),
    ownerPayout,
    'TOPUP',
    bookingId,
    paymentId,
    `Checkout settlement owner payout (${reason})`
  );

  await creditWallet(
    connection,
    Number(booking.renter_user_id),
    amounts.renterRefund,
    'REFUND',
    bookingId,
    paymentId,
    `Checkout settlement renter refund (${reason})`
  );

  return { didSettle: true };
}

async function runAutoNoCheckinCheckout(): Promise<void> {
  // Auto-close bookings that reached checkout time without any check-in proof.
  const pool = getPool();
  const [rows] = await pool.query<AutoCheckoutCandidateRow[]>(
    `SELECT b_id
    FROM bookings
    WHERE b_status IN ('PAYMENT_CONFIRMED', 'CHECKING_IN', 'CHECKIN_REJECTED')
      AND checkin_proof IS NULL
      AND checkout_datetime IS NOT NULL
      AND CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00') >= checkout_datetime
    ORDER BY checkout_datetime ASC
    LIMIT 200`
  );

  for (const row of rows) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await finalizeCheckoutWithSettlement(
        connection,
        Number(row.b_id),
        'AUTO_CHECKOUT_NO_CHECKIN',
        {
          forceForfeitHalf: true,
          finalStatus: 'CHECKOUT_APPROVED',
        }
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      console.error('Auto no-checkin checkout failed:', error);
    } finally {
      connection.release();
    }
  }
}

async function runAutoCheckoutApprovalAfter7Hours(): Promise<void> {
  // Auto-approve owner checkout review if request stays in CHECKING_OUT for too long.
  const pool = getPool();
  const [rows] = await pool.query<AutoApprovalCandidateRow[]>(
    `SELECT
      b_id,
      GREATEST(
        TIMESTAMPDIFF(
          MINUTE,
          checkout_datetime,
          CONVERT_TZ(updated_at, '+00:00', '+07:00')
        ),
        0
      ) AS late_minutes
    FROM bookings
    WHERE b_status = 'CHECKING_OUT'
      AND checkout_datetime IS NOT NULL
      AND UTC_TIMESTAMP() >= DATE_ADD(updated_at, INTERVAL 7 HOUR)
    ORDER BY updated_at ASC
    LIMIT 200`
  );

  for (const row of rows) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await finalizeCheckoutWithSettlement(
        connection,
        Number(row.b_id),
        'AUTO_APPROVED_7H',
        {
          lateMinutes: Number(row.late_minutes || 0),
          forceForfeitHalf: false,
          finalStatus: 'CHECKOUT_APPROVED',
        }
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      console.error('Auto checkout approval after 7 hours failed:', error);
    } finally {
      connection.release();
    }
  }
}

export async function runBookingCheckoutAutomation(): Promise<void> {
  await runAutoNoCheckinCheckout();
  await runAutoCheckoutApprovalAfter7Hours();
}
