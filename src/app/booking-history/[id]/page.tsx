'use client';

import Link from 'next/link';
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Tabbar from '@/components/Tabbar';
import { Star } from 'lucide-react';
import { clearStoredAuth, readStoredAuthUser, readStoredToken } from '@/lib/auth-client';

type BookingDetailResponse = {
  success?: boolean;
  error?: string;
  booking?: {
    id: number;
    lot: {
      id: number;
      name: string;
      location: string;
      price: number;
    };
    plateId: string;
    bookingTime: string;
    checkinTime: string | null;
    checkoutTime: string | null;
    checkinProof: string | null;
    status: string;
    totalMinutes: number | null;
    estimatedRent: number | null;
    timeFlags: {
      isCheckinWindow: boolean;
      isCheckoutWindow: boolean;
      hasCheckinProof: boolean;
      canCancelBeforeReservation: boolean;
    };
    payment: {
      id: number;
      status: string | null;
      method: string | null;
      amount: number;
      paidAt: string | null;
      proofUrl: string | null;
    }
    review?: {
      score: number;
      comment: string | null;
      createdAt: string;
      diffMinutes: number;
    } | null;
  };
};

type PaymentCreateResponse = {
  success?: boolean;
  message?: string;
  error?: string;
};

const BANGKOK_TIMEZONE = 'Asia/Bangkok';

function toDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function formatDateTime(value: string | null): string {
  const parsed = toDate(value);
  if (!parsed) {
    return '-';
  }

  return parsed.toLocaleString('th-TH', {
    timeZone: BANGKOK_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMoney(value: number): string {
  return value.toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getBookingStatusLabel(
  bookingStatus: string,
  paymentStatus: string | null | undefined
): string {
  const normalizedBookingStatus = bookingStatus.toUpperCase();
  const normalizedPaymentStatus = (paymentStatus || '').toUpperCase();

  if (normalizedBookingStatus === 'WAITING_FOR_PAYMENT' && normalizedPaymentStatus === 'PENDING') {
    return 'UNDER PROGRESS OF CHECKING';
  }

  if (normalizedBookingStatus === 'PAYMENT_CONFIRMED' && normalizedPaymentStatus === 'PAID') {
    return 'CHECKOUT';
  }

  return normalizedBookingStatus;
}

export default function BookingHistoryDetailPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = params?.id;
  const bookingId = Array.isArray(rawId) ? rawId[0] : rawId;

  const [token, setToken] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [booking, setBooking] = useState<BookingDetailResponse['booking'] | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkinProofFile, setCheckinProofFile] = useState<File | null>(null);
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const isApprovedAndCheckedOut = useMemo(() => {
    if (!booking) return false;
    // อนุญาตให้รีวิวได้เมื่อ Owner กดยืนยันแล้ว
    return ['CHECKOUT_APPROVED', 'COMPLETED'].includes(booking.status.toUpperCase());
  }, [booking]);

  useEffect(() => {
    const storedToken = readStoredToken();
    const storedUser = readStoredAuthUser();

    if (!storedToken || !storedUser) {
      router.replace('/login');
      return;
    }

    setToken(storedToken);
    setIsReady(true);
  }, [router]);

  const loadBookingDetail = useCallback(async () => {
    if (!token || !bookingId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const response = await fetch(`/api/bookings/${bookingId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });

      if (response.status === 401) {
        clearStoredAuth();
        router.replace('/login');
        return;
      }

      const result = (await response.json()) as BookingDetailResponse;
      if (!response.ok || !result.booking) {
        throw new Error(result.error || 'Unable to load booking detail');
      }

      setBooking(result.booking);
    } catch (error) {
      console.error('Unable to load booking detail:', error);
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to load booking detail right now.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [bookingId, router, token]);

  useEffect(() => {
    if (!isReady || !token || !bookingId) {
      return;
    }

    void loadBookingDetail();
  }, [isReady, token, bookingId, loadBookingDetail]);

  useEffect(() => {
    if (!isReady || !token || !bookingId) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadBookingDetail();
    }, 30000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isReady, token, bookingId, loadBookingDetail]);

  const canCheckin = useMemo(() => {
    if (!booking) {
      return false;
    }

    const status = booking.status.toUpperCase();
    const isApproved = status === 'PAYMENT_CONFIRMED' || status === 'CHECKIN_REJECTED';
    return isApproved && booking.timeFlags.isCheckinWindow && !booking.timeFlags.hasCheckinProof;
  }, [booking]);

  const canSubmitPayment = useMemo(() => {
    if (!booking) {
      return false;
    }

    const bookingStatus = booking.status.toUpperCase();
    const paymentStatus = booking.payment?.status?.toUpperCase() || '';
    if (bookingStatus !== 'WAITING_FOR_PAYMENT') {
      return false;
    }

    return paymentStatus !== 'PAID' && paymentStatus !== 'PENDING';
  }, [booking]);

  const isPaymentUnderReview = useMemo(() => {
    if (!booking) {
      return false;
    }

    return (
      booking.status.toUpperCase() === 'WAITING_FOR_PAYMENT' &&
      (booking.payment?.status?.toUpperCase() || '') === 'PENDING'
    );
  }, [booking]);

  const canCheckout = useMemo(() => {
    if (!booking) {
      return false;
    }

    if (!booking.timeFlags.hasCheckinProof) {
      return false;
    }

    const status = booking.status.toUpperCase();
    const canByStatus =
      status === 'CHECKING_IN' ||
      status === 'CHECKIN_APPROVED' ||
      status === 'CHECKOUT_REJECTED';

    return canByStatus;
  }, [booking]);

  const canCancelCheckout = useMemo(() => {
    if (!booking) {
      return false;
    }

    return booking.status.toUpperCase() === 'CHECKING_OUT';
  }, [booking]);

  const canCancelBooking = useMemo(() => {
    if (!booking) {
      return false;
    }

    const status = booking.status.toUpperCase();
    if (status === 'CANCELLED' || status === 'CHECKOUT_APPROVED') {
      return false;
    }

    return booking.timeFlags.canCancelBeforeReservation;
  }, [booking]);

  const isFinalizedBooking = useMemo(() => {
    if (!booking) {
      return false;
    }

    const status = booking.status.toUpperCase();
    return status === 'CANCELLED' || status === 'CHECKOUT_APPROVED';
  }, [booking]);

  const handleCheckinProofChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setCheckinProofFile(file);
    setActionError('');
    setActionMessage('');
  };

  const handleSubmitCheckin = async () => {
    if (!token || !bookingId || !checkinProofFile) {
      setActionError('Please upload check-in proof image.');
      return;
    }

    setActionError('');
    setActionMessage('');
    setIsSubmitting(true);

    try {
      const body = new FormData();
      body.append('proof', checkinProofFile);

      const response = await fetch(`/api/bookings/${bookingId}/checkin`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      if (response.status === 401) {
        clearStoredAuth();
        router.replace('/login');
        return;
      }

      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(result.error || 'Unable to submit check-in proof');
      }

      setActionMessage(result.message || 'Check-in proof submitted successfully.');
      setCheckinProofFile(null);
      await loadBookingDetail();
    } catch (error) {
      console.error('Unable to submit check-in proof:', error);
      setActionError(
        error instanceof Error ? error.message : 'Unable to submit check-in proof right now.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitCheckout = async () => {
    if (!token || !bookingId) {
      return;
    }

    setActionError('');
    setActionMessage('');
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/bookings/${bookingId}/checkout`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        clearStoredAuth();
        router.replace('/login');
        return;
      }

      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(result.error || 'Unable to submit checkout');
      }

      setActionMessage(result.message || 'Checkout request sent to owner.');
      await loadBookingDetail();
    } catch (error) {
      console.error('Unable to submit checkout:', error);
      setActionError(
        error instanceof Error ? error.message : 'Unable to submit checkout right now.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaymentProofChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setPaymentProofFile(file);
    setActionError('');
    setActionMessage('');
  };

  const handleSubmitPayment = async () => {
    if (!token || !bookingId || !paymentProofFile) {
      setActionError('Please upload payment proof image.');
      return;
    }

    setActionError('');
    setActionMessage('');
    setIsSubmitting(true);

    try {
      const body = new FormData();
      body.append('bookingId', String(bookingId));
      body.append('payMethod', 'QR_TRANSFER');
      body.append('proof', paymentProofFile);

      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      if (response.status === 401) {
        clearStoredAuth();
        router.replace('/login');
        return;
      }

      const result = (await response.json()) as PaymentCreateResponse;
      if (!response.ok) {
        throw new Error(result.error || 'Unable to submit payment proof');
      }

      setActionMessage(result.message || 'Payment proof submitted successfully.');
      setPaymentProofFile(null);
      await loadBookingDetail();
    } catch (error) {
      console.error('Unable to submit payment proof:', error);
      setActionError(
        error instanceof Error ? error.message : 'Unable to submit payment proof right now.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelCheckout = async () => {
    if (!token || !bookingId) {
      return;
    }

    setActionError('');
    setActionMessage('');
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/bookings/${bookingId}/checkout`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        clearStoredAuth();
        router.replace('/login');
        return;
      }

      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(result.error || 'Unable to cancel checkout');
      }

      setActionMessage(result.message || 'Checkout request cancelled.');
      await loadBookingDetail();
    } catch (error) {
      console.error('Unable to cancel checkout:', error);
      setActionError(
        error instanceof Error ? error.message : 'Unable to cancel checkout right now.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!token || !bookingId) {
      return;
    }

    setActionError('');
    setActionMessage('');
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        clearStoredAuth();
        router.replace('/login');
        return;
      }

      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(result.error || 'Unable to cancel booking');
      }

      setActionMessage(result.message || 'Booking cancelled.');
      await loadBookingDetail();
    } catch (error) {
      console.error('Unable to cancel booking:', error);
      setActionError(error instanceof Error ? error.message : 'Unable to cancel booking right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isReady || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Tabbar />
        <div className="mx-auto max-w-4xl px-4 py-10 text-center text-gray-500">Loading...</div>
      </div>
    );
  }

  if (errorMessage || !booking) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Tabbar />
        <div className="mx-auto max-w-4xl px-4 py-10 text-center text-red-600">
          {errorMessage || 'Booking not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Tabbar />
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-5">
          <Link href="/aboutme" className="text-sm font-semibold text-[#5B7CFF] hover:underline">
            Back to profile
          </Link>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-800">Booking Detail #{booking.id}</h1>
          <p className="mt-1 text-sm text-slate-500">{booking.lot.name}</p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Status</p>
              <p className="mt-1 text-lg font-bold text-slate-800">
                {getBookingStatusLabel(booking.status, booking.payment?.status)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Plate</p>
              <p className="mt-1 text-lg font-bold text-slate-800">{booking.plateId}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Check-in</p>
              <p className="mt-1 text-lg font-bold text-slate-800">{formatDateTime(booking.checkinTime)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Check-out</p>
              <p className="mt-1 text-lg font-bold text-slate-800">{formatDateTime(booking.checkoutTime)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Payment</p>
              <p className="mt-1 text-lg font-bold text-slate-800">
                {booking.payment
                  ? `${formatMoney(booking.payment.amount)} THB (${booking.payment.status || '-'})`
                  : '-'}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Estimated Rent</p>
              <p className="mt-1 text-lg font-bold text-slate-800">
                {booking.estimatedRent === null ? '-' : `${formatMoney(booking.estimatedRent)} THB`}
              </p>
            </div>
          </div>

          {booking.payment?.proofUrl ? (
            <div className="mt-4">
              <a
                href={booking.payment.proofUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-[#5B7CFF] hover:underline"
              >
                View payment proof
              </a>
            </div>
          ) : null}

          {booking.checkinProof ? (
            <div className="mt-2">
              <a
                href={booking.checkinProof}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-[#5B7CFF] hover:underline"
              >
                View check-in proof
              </a>
            </div>
          ) : null}

          {actionError ? (
            <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {actionError}
            </div>
          ) : null}

          {actionMessage ? (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {actionMessage}
            </div>
          ) : null}

          {booking.status.toUpperCase() === 'WAITING_FOR_PAYMENT' ? (
            <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-800">Payment</p>
              <p className="mt-1 text-xs text-blue-700">
                Submit payment proof within 10 minutes after reservation. If not submitted, booking is auto-cancelled.
              </p>
              {isPaymentUnderReview ? (
                <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-blue-700">
                  Payment proof is under progress of checking by admin.
                </p>
              ) : (
                <div className="mt-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePaymentProofChange}
                    className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void handleSubmitPayment();
                    }}
                    disabled={isSubmitting || !canSubmitPayment || !paymentProofFile}
                    className="mt-3 rounded-lg bg-[#5B7CFF] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#4a6bef] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit Payment Proof'}
                  </button>
                </div>
              )}
            </div>
          ) : null}

          {canCancelBooking ? (
            <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm text-rose-700">
                You can cancel only at least 1 day before reservation time.
              </p>
              <button
                type="button"
                onClick={() => {
                  void handleCancelBooking();
                }}
                disabled={isSubmitting}
                className="mt-3 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Cancelling...' : 'Cancel Booking'}
              </button>
            </div>
          ) : null}

          {!isFinalizedBooking && booking.status.toUpperCase() !== 'WAITING_FOR_PAYMENT' ? (
            <div className="mt-6 space-y-4">
              {!booking.timeFlags.hasCheckinProof ? (
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-800">Check-in</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Available only in booking time after payment approval.
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleCheckinProofChange}
                    className="mt-3 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void handleSubmitCheckin();
                    }}
                    disabled={!canCheckin || !checkinProofFile || isSubmitting}
                    className="mt-3 rounded-lg bg-[#5B7CFF] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#4a6bef] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit Check-in Proof'}
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                  Check-in proof already submitted.
                </div>
              )}

              {booking.timeFlags.hasCheckinProof || canCancelCheckout ? (
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-800">Checkout</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {canCancelCheckout
                      ? 'Checkout request already sent. You can cancel it before owner review.'
                      : canCheckout
                        ? 'Ready to send checkout status to owner immediately after check-in.'
                        : 'Checkout section is available after check-in proof is submitted.'}
                  </p>
                  {canCheckout ? (
                    <button
                      type="button"
                      onClick={() => {
                        void handleSubmitCheckout();
                      }}
                      disabled={isSubmitting}
                      className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSubmitting ? 'Submitting...' : 'Send Checkout Status'}
                    </button>
                  ) : null}
                  {canCancelCheckout ? (
                    <button
                      type="button"
                      onClick={() => {
                        void handleCancelCheckout();
                      }}
                      disabled={isSubmitting}
                      className="mt-3 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSubmitting ? 'Cancelling...' : 'Cancel Checkout'}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {booking.review ? (
            <div className="mt-8 pt-6 border-t border-slate-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-800">รีวิวของคุณ</h3>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 shadow-sm">
                <div className="flex mb-2 gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={20}
                      className={star <= booking.review!.score ? "fill-yellow-500 text-yellow-500" : "text-gray-200"}
                    />
                  ))}
                </div>
                <p className="text-sm text-slate-700 mt-2">
                  {booking.review.comment || <span className="text-slate-400 italic">ไม่มีความคิดเห็น</span>}
                </p>
              </div>

              {/* แสดงปุ่มแก้ไขรีวิวเสมอ */}
              <Link href={`/review/${booking.id}`}>
                <button className="w-full mt-4 flex items-center justify-center gap-2 py-3 border-2 border-yellow-500 text-yellow-600 font-bold rounded-xl hover:bg-yellow-50 transition-colors">
                  แก้ไขรีวิว
                </button>
              </Link>
            </div>
          ) : ['CHECKOUT_APPROVED', 'COMPLETED'].includes(booking.status.toUpperCase()) ? (
            <div className="mt-8 pt-6 border-t border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 mb-3 text-center">การใช้งานเสร็จสิ้น</h3>
              <p className="text-sm text-slate-500 mb-4 text-center">
                กรุณาให้คะแนนเพื่อเป็นประโยชน์ต่อผู้ใช้งานท่านอื่น
              </p>
              <Link href={`/review/${booking.id}`}>
                <button className="w-full flex items-center justify-center gap-2 py-3 bg-yellow-500 text-white font-bold rounded-xl hover:bg-yellow-600 transition-colors shadow-md">
                  <Star size={20} className="fill-white" />
                  ให้คะแนน / รีวิวสถานที่
                </button>
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
