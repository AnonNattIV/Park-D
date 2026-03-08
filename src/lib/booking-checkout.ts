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

interface AutoUnpaidCancellationCandidateRow extends RowDataPacket {
  b_id: number;
}

interface SettlementComputation {
  payAmount: number;
  rentAmount: number;
  ownerShare: number;
  platformShare: number;
  depositAmount: number;
  lateMinutes: number;
  penaltyAmount: number;
  penaltyExcess: number;
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
  // - owner gets 80% of booked rent + penalty (or full deposit when checkout denied)
  // - renter gets deposit refund minus late penalties (or zero when forfeited)
  const isPaid = booking.pay_status === 'PAID';
  const payAmount = isPaid ? Number(booking.pay_amount || 0) : 0;
  const price = Number(booking.price || 0);
  // Keep booked rent static from payment amount, independent of actual usage/check-out submit time.
  const rentAmount = isPaid ? roundMoney(payAmount / 1.5) : 0;
  const ownerShare = isPaid ? roundMoney(rentAmount * 0.8) : 0;
  const platformShare = isPaid ? roundMoney(rentAmount * 0.2) : 0;
  const depositAmount = isPaid ? roundMoney(payAmount - rentAmount) : 0;

  const lateMinutes = Math.max(0, Math.floor(Number(policy.lateMinutes || 0)));
  // Late penalty uses full hourly rate x late usage time.
  const penaltyAmount = isPaid ? roundMoney((lateMinutes / 60) * price) : 0;
  const forceForfeitHalf = Boolean(policy.forceForfeitHalf);

  const renterRefund = forceForfeitHalf
    ? 0
    : Math.max(0, roundMoney(depositAmount - penaltyAmount));
  const ownerBonus = forceForfeitHalf ? depositAmount : penaltyAmount;
  const penaltyExcess = forceForfeitHalf
    ? 0
    : Math.max(0, roundMoney(penaltyAmount - depositAmount));

  return {
    payAmount,
    rentAmount,
    ownerShare,
    platformShare,
    depositAmount,
    lateMinutes,
    penaltyAmount,
    penaltyExcess,
    renterRefund,
    ownerBonus,
  };
}

async function creditWallet(
  connection: PoolConnection,
  userId: number,
  amount: number,
  txType: 'TOPUP' | 'REFUND' | 'DEBIT',
  bookingId: number,
  paymentId: number | null,
  note: string
): Promise<void> {
  if (amount === 0) {
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
    'Income from parking lot checkout'
  );

  if (amounts.penaltyExcess > 0) {
    await creditWallet(
      connection,
      Number(booking.renter_user_id),
      -amounts.penaltyExcess,
      'DEBIT',
      bookingId,
      paymentId,
      'Late checkout penalty charge'
    );
  }

  await creditWallet(
    connection,
    Number(booking.renter_user_id),
    amounts.renterRefund,
    'REFUND',
    bookingId,
    paymentId,
    'Deposit returned after checkout'
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

async function runAutoCancelUnpaidReservations(): Promise<void> {
  // Auto-cancel unpaid bookings:
  // 1) no payment submitted within 10 minutes after booking creation
  // 2) payment still not approved when reservation (check-in) time starts
  const pool = getPool();
  const [rows] = await pool.query<AutoUnpaidCancellationCandidateRow[]>(
    `SELECT b.b_id
    FROM bookings b
    LEFT JOIN payments p ON p.b_id = b.b_id
    WHERE b.b_status = 'WAITING_FOR_PAYMENT'
      AND (
        (
          p.pay_id IS NULL
          AND CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00') >= DATE_ADD(b.booking_time, INTERVAL 10 MINUTE)
        )
        OR (
          b.checkin_datetime IS NOT NULL
          AND CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00') >= b.checkin_datetime
          AND (p.pay_id IS NULL OR p.pay_status <> 'PAID')
        )
      )
    ORDER BY b.booking_time ASC
    LIMIT 200`
  );

  for (const row of rows) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [bookingUpdateResult] = await connection.query<ResultSetHeader>(
        `UPDATE bookings b
        LEFT JOIN payments p ON p.b_id = b.b_id
        SET b.b_status = 'CANCELLED',
            b.updated_at = NOW()
        WHERE b.b_id = ?
          AND b.b_status = 'WAITING_FOR_PAYMENT'
          AND (
            (
              p.pay_id IS NULL
              AND CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00') >= DATE_ADD(b.booking_time, INTERVAL 10 MINUTE)
            )
            OR (
              b.checkin_datetime IS NOT NULL
              AND CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00') >= b.checkin_datetime
              AND (p.pay_id IS NULL OR p.pay_status <> 'PAID')
            )
          )`,
        [Number(row.b_id)]
      );

      if (bookingUpdateResult.affectedRows > 0) {
        await connection.query(
          `UPDATE payments
          SET pay_status = CASE WHEN pay_status = 'PENDING' THEN 'FAILED' ELSE pay_status END,
              updated_at = NOW()
          WHERE b_id = ?
            AND pay_status IN ('PENDING', 'FAILED')`,
          [Number(row.b_id)]
        );
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      console.error('Auto cancel unpaid reservation failed:', error);
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
          updated_at
        ),
        0
      ) AS late_minutes
    FROM bookings
    WHERE b_status = 'CHECKING_OUT'
      AND checkout_datetime IS NOT NULL
      AND NOW() >= DATE_ADD(updated_at, INTERVAL 7 HOUR)
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
  await runAutoCancelUnpaidReservations();
  await runAutoNoCheckinCheckout();
  await runAutoCheckoutApprovalAfter7Hours();
}
