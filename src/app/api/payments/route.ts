import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { verifyToken } from '@/lib/auth';
import getPool from '@/lib/db/mysql';
import { deletePaymentProofByUrl, uploadPaymentProof } from '@/lib/storage';
import { runBookingCheckoutAutomation } from '@/lib/booking-checkout';

export const dynamic = 'force-dynamic';

interface TokenPayload {
  userId?: string;
  role?: string;
}

interface BookingPaymentRow extends RowDataPacket {
  b_id: number;
  user_id: number;
  b_status: string;
  checkin_datetime: Date | string | null;
  checkout_datetime: Date | string | null;
  price: number | string;
  is_after_checkin: number | string;
}

interface ExistingPaymentRow extends RowDataPacket {
  pay_id: number;
  pay_status: string;
  proof_image_url: string | null;
}

function getRequesterUserId(request: NextRequest): number | null {
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

function toUnixTime(value: Date | string | null): number | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : time;
  }

  const parsed = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.getTime();
}

function normalizePayMethod(rawValue: FormDataEntryValue | null): string | null {
  const value =
    typeof rawValue === 'string' && rawValue.trim()
      ? rawValue.trim().toUpperCase()
      : 'QR_TRANSFER';

  if (value.length > 30) {
    return null;
  }

  if (!/^[A-Z0-9_ -]+$/.test(value)) {
    return null;
  }

  return value;
}

export async function POST(request: NextRequest) {
  let uploadedProofUrl: string | null = null;

  try {
    const requesterUserId = getRequesterUserId(request);
    if (!requesterUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      await runBookingCheckoutAutomation();
    } catch (automationError) {
      console.error('Unable to run booking checkout automation:', automationError);
    }

    const formData = await request.formData();
    const rawBookingId = formData.get('bookingId');
    const proofFile = formData.get('proof');
    const payMethod = normalizePayMethod(formData.get('payMethod'));

    const bookingId = Number(typeof rawBookingId === 'string' ? rawBookingId : '');

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return NextResponse.json({ error: 'Invalid booking id' }, { status: 400 });
    }

    if (!(proofFile instanceof File)) {
      return NextResponse.json(
        { error: 'Payment proof image is required' },
        { status: 400 }
      );
    }

    if (!proofFile.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Only image files are allowed for payment proof' },
        { status: 400 }
      );
    }

    if (proofFile.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Payment proof image must be 5 MB or smaller' },
        { status: 400 }
      );
    }

    if (!payMethod) {
      return NextResponse.json(
        { error: 'Invalid payment method' },
        { status: 400 }
      );
    }

    const pool = getPool();

    const [bookingRows] = await pool.query<BookingPaymentRow[]>(
      `SELECT
        b.b_id,
        b.user_id,
        b.b_status,
        b.checkin_datetime,
        b.checkout_datetime,
        pl.price,
        CASE
          WHEN b.checkin_datetime IS NOT NULL
           AND CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00') >= b.checkin_datetime
          THEN 1 ELSE 0
        END AS is_after_checkin
      FROM bookings b
      INNER JOIN parking_lots pl ON pl.lot_id = b.lot_id
      WHERE b.b_id = ?
      LIMIT 1`,
      [bookingId]
    );

    if (bookingRows.length === 0) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const booking = bookingRows[0];
    if (Number(booking.user_id) !== requesterUserId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (booking.b_status !== 'WAITING_FOR_PAYMENT') {
      return NextResponse.json(
        { error: 'This booking is not available for payment' },
        { status: 409 }
      );
    }

    if (Number(booking.is_after_checkin) === 1) {
      await pool.query(
        `UPDATE bookings
        SET b_status = 'CANCELLED',
            updated_at = NOW()
        WHERE b_id = ?
          AND b_status = 'WAITING_FOR_PAYMENT'`,
        [bookingId]
      );

      await pool.query(
        `UPDATE payments
        SET pay_status = CASE WHEN pay_status = 'PENDING' THEN 'FAILED' ELSE pay_status END,
            updated_at = NOW()
        WHERE b_id = ?
          AND pay_status IN ('PENDING', 'FAILED')`,
        [bookingId]
      );

      return NextResponse.json(
        { error: 'Reservation time started before payment approval. Booking cancelled automatically.' },
        { status: 409 }
      );
    }

    await pool.query(
      `CREATE TABLE IF NOT EXISTS payment_proofs (
        pay_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
        proof_image_url VARCHAR(1024) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_payment_proofs_payment
          FOREIGN KEY (pay_id) REFERENCES payments(pay_id)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );

    const [existingPaymentRows] = await pool.query<ExistingPaymentRow[]>(
      `SELECT
        p.pay_id,
        p.pay_status,
        pp.proof_image_url
      FROM payments p
      LEFT JOIN payment_proofs pp ON pp.pay_id = p.pay_id
      WHERE p.b_id = ?
      LIMIT 1`,
      [bookingId]
    );

    const existingPayment = existingPaymentRows[0] || null;
    if (existingPayment && existingPayment.pay_status !== 'FAILED') {
      return NextResponse.json(
        {
          error: 'Payment already exists for this booking',
          payment: {
            id: existingPayment.pay_id,
            status: existingPayment.pay_status,
          },
        },
        { status: 409 }
      );
    }

    const checkinUnixTime = toUnixTime(booking.checkin_datetime);
    const checkoutUnixTime = toUnixTime(booking.checkout_datetime);

    if (!checkinUnixTime || !checkoutUnixTime || checkoutUnixTime <= checkinUnixTime) {
      return NextResponse.json(
        { error: 'Booking time is invalid for payment calculation' },
        { status: 400 }
      );
    }

    const totalMinutes = Math.floor((checkoutUnixTime - checkinUnixTime) / 60000);
    if (totalMinutes <= 0) {
      return NextResponse.json(
        { error: 'Booking duration is invalid for payment calculation' },
        { status: 400 }
      );
    }

    const rentAmount = Number(
      (((totalMinutes / 60) * Number(booking.price || 0))).toFixed(2)
    );
    const payAmount = Number((rentAmount * 1.5).toFixed(2));
    const ownerIncome = Number((rentAmount * 0.8).toFixed(2));

    uploadedProofUrl = await uploadPaymentProof(
      proofFile,
      requesterUserId,
      bookingId
    );

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      let paymentId: number;
      const previousProofUrl =
        existingPayment?.pay_status === 'FAILED'
          ? existingPayment.proof_image_url
          : null;

      if (existingPayment?.pay_status === 'FAILED') {
        const [updatePaymentResult] = await connection.query<ResultSetHeader>(
          `UPDATE payments
          SET pay_status = 'PENDING',
              pay_method = ?,
              pay_amount = ?,
              paid_at = NULL,
              updated_at = NOW()
          WHERE pay_id = ?
            AND pay_status = 'FAILED'`,
          [payMethod, payAmount, existingPayment.pay_id]
        );

        if (updatePaymentResult.affectedRows === 0) {
          await connection.rollback();
          return NextResponse.json(
            { error: 'Payment already exists for this booking' },
            { status: 409 }
          );
        }

        paymentId = existingPayment.pay_id;
      } else {
        const [insertPaymentResult] = await connection.query<ResultSetHeader>(
          `INSERT INTO payments (
            b_id,
            pay_status,
            pay_method,
            pay_amount,
            paid_at,
            created_at,
            updated_at
          )
          VALUES (?, 'PENDING', ?, ?, NULL, NOW(), NOW())`,
          [bookingId, payMethod, payAmount]
        );

        paymentId = insertPaymentResult.insertId;
      }

      await connection.query(
        `UPDATE bookings
        SET b_status = 'WAITING_FOR_PAYMENT',
            updated_at = NOW()
        WHERE b_id = ?`,
        [bookingId]
      );

      await connection.query(
        `INSERT INTO payment_proofs (
          pay_id,
          proof_image_url
        )
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE
          proof_image_url = VALUES(proof_image_url),
          updated_at = CURRENT_TIMESTAMP`,
        [paymentId, uploadedProofUrl]
      );

      await connection.commit();

      if (previousProofUrl && previousProofUrl !== uploadedProofUrl) {
        try {
          await deletePaymentProofByUrl(previousProofUrl);
        } catch (deleteError) {
          console.error('Unable to delete previous payment proof:', deleteError);
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Payment proof submitted. Waiting for approval.',
        payment: {
          id: paymentId,
          bookingId,
          status: 'PENDING',
          method: payMethod,
          amount: payAmount,
          rentAmount,
          ownerIncome,
          proofUrl: uploadedProofUrl,
        },
      });
    } catch (error) {
      await connection.rollback();

      const mysqlError = error as { code?: string };
      if (mysqlError?.code === 'ER_DUP_ENTRY') {
        if (uploadedProofUrl) {
          try {
            await deletePaymentProofByUrl(uploadedProofUrl);
            uploadedProofUrl = null;
          } catch (deleteError) {
            console.error('Unable to rollback uploaded payment proof:', deleteError);
          }
        }

        return NextResponse.json(
          { error: 'Payment already exists for this booking' },
          { status: 409 }
        );
      }

      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Unable to create payment:', error);

    if (uploadedProofUrl) {
      try {
        await deletePaymentProofByUrl(uploadedProofUrl);
      } catch (deleteError) {
        console.error('Unable to rollback uploaded payment proof:', deleteError);
      }
    }

    return NextResponse.json(
      { error: 'Unable to submit payment right now' },
      { status: 500 }
    );
  }
}
