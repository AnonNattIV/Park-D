'use client';

import Link from 'next/link';
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Tabbar from '@/components/Tabbar';
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
    };
    payment: {
      id: number;
      status: string | null;
      method: string | null;
      amount: number;
      paidAt: string | null;
      proofUrl: string | null;
    } | null;
  };
};

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
    return isApproved && booking.timeFlags.isCheckinWindow;
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

    return canByStatus && booking.timeFlags.isCheckoutWindow;
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
              <p className="mt-1 text-lg font-bold text-slate-800">{booking.status}</p>
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

          <div className="mt-6 space-y-4">
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

            {canCheckout ? (
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-800">Checkout</p>
                <p className="mt-1 text-xs text-slate-500">
                  Available after booking end time. This will send checkout status to owner.
                </p>
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
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
