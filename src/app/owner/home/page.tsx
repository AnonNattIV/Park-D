'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlusIcon } from '@heroicons/react/24/outline';
import Tabbar from '@/components/Tabbar';
import OwnerParkingCard, { ParkingStatus } from '@/components/OwnerParkingCard';
import OwnerStatCard from '@/components/OwnerStatCard';
import {
  AuthUser,
  clearStoredAuth,
  notifyAuthStateChanged,
  readStoredAuthUser,
  readStoredToken,
} from '@/lib/auth-client';

type ParkingLotSystemRow = {
  id: number;
  name: string;
  addressLine: string;
  streetNumber: string;
  district: string;
  amphoe: string;
  subdistrict: string;
  province: string;
  total: number;
  price: number;
  priceLabel: string;
  status: string;
  ownerName: string;
  latitude: number | null;
  longitude: number | null;
  ownerIncome: number;
};

type UserApiResponse = {
  success?: boolean;
  message?: string;
  error?: string;
  user?: Partial<AuthUser> & {
    id: number;
    role?: string;
    ownerRequestStatus?: string | null;
  };
};

type OwnerBookingDetail = {
  id: number;
  lotId: number;
  lotName: string;
  renter: {
    id: number;
    username: string;
    name: string | null;
  };
  bookingTime: string;
  checkinTime: string | null;
  checkinProofUrl: string | null;
  checkoutTime: string | null;
  bookingStatus: string;
  payment: {
    id: number;
    status: string | null;
    amount: number;
    method: string | null;
    proofUrl?: string | null;
  } | null;
};

function mapParkingStatus(statusLabel: string): ParkingStatus {
  const normalizedStatus = statusLabel.toLowerCase();

  if (normalizedStatus.includes('pending')) {
    return 'pending';
  }

  if (normalizedStatus.includes('inactive') || normalizedStatus.includes('closed')) {
    return 'closed';
  }

  return 'available';
}

function formatDateTimeValue(value: string | null): string {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
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

export default function OwnerPage() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [token, setToken] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [parkingLots, setParkingLots] = useState<ParkingLotSystemRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [requestError, setRequestError] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [ownerBookings, setOwnerBookings] = useState<OwnerBookingDetail[]>([]);
  const [isBookingLoading, setIsBookingLoading] = useState(false);
  const [bookingLoadError, setBookingLoadError] = useState('');
  const [bookingActionMessage, setBookingActionMessage] = useState('');
  const [bookingActionError, setBookingActionError] = useState('');
  const [processingCancelBookingId, setProcessingCancelBookingId] = useState<number | null>(null);
  const [processingCheckoutReviewId, setProcessingCheckoutReviewId] = useState<number | null>(null);
  const [processingCheckoutReviewAction, setProcessingCheckoutReviewAction] = useState<
    'APPROVE' | 'DENY' | null
  >(null);

  const normalizedRole = authUser?.role?.toLowerCase() || '';
  const canManageOwnerView = normalizedRole === 'owner' || normalizedRole === 'admin';
  const ownerRequestStatus = authUser?.ownerRequestStatus?.toUpperCase() || null;
  const ownerRequestStatusLabel =
    ownerRequestStatus === 'PENDING'
      ? 'REQUEST'
      : ownerRequestStatus === 'REJECTED'
        ? 'DENIED'
        : ownerRequestStatus || 'NOT_REQUESTED';
  const ownerRequestStatusBadgeClass =
    ownerRequestStatus === 'APPROVED'
      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
      : ownerRequestStatus === null
        ? 'border border-blue-200 bg-blue-50 text-[#5B7CFF]'
        : 'border border-red-200 bg-red-50 text-red-700';
  const totalSlots = parkingLots.reduce((sum, lot) => sum + lot.total, 0);
  const pendingLots = parkingLots.filter((lot) => lot.status.toLowerCase().includes('pending')).length;
  const requestingLots = parkingLots.filter((lot) => lot.status.toLowerCase().includes('pending'));
  const actualIncome = Number(
    parkingLots.reduce((sum, lot) => sum + Number(lot.ownerIncome || 0), 0).toFixed(2)
  );

  useEffect(() => {
    // Bootstrap auth state from localStorage before loading owner-only data.
    const storedToken = readStoredToken();
    const storedUser = readStoredAuthUser();

    if (!storedToken || !storedUser) {
      router.replace('/login');
      return;
    }

    setToken(storedToken);
    setAuthUser(storedUser);
    setIsReady(true);
  }, [router]);

  useEffect(() => {
    if (!isReady || !token || !authUser?.id) {
      return;
    }

    let isMounted = true;

    const syncOwnerRequestStatus = async () => {
      // Keep local owner request badge in sync with the latest server state.
      try {
        const response = await fetch(`/api/USER/${authUser.id}`, {
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

        if (!response.ok) {
          return;
        }

        const result = (await response.json()) as UserApiResponse;
        const nextOwnerRequestStatus = result.user?.ownerRequestStatus;

        if (!isMounted || (nextOwnerRequestStatus !== null && typeof nextOwnerRequestStatus !== 'string')) {
          return;
        }

        setAuthUser((previousUser) => {
          if (!previousUser || previousUser.ownerRequestStatus === nextOwnerRequestStatus) {
            return previousUser;
          }

          const nextUser: AuthUser = {
            ...previousUser,
            ownerRequestStatus: nextOwnerRequestStatus,
          };

          if (typeof window !== 'undefined') {
            localStorage.setItem('auth_user', JSON.stringify(nextUser));
            notifyAuthStateChanged();
          }

          return nextUser;
        });
      } catch (error) {
        console.error('Unable to sync owner request status:', error);
      }
    };

    void syncOwnerRequestStatus();

    return () => {
      isMounted = false;
    };
  }, [authUser?.id, isReady, router, token]);

  useEffect(() => {
    if (!isReady || !token) {
      return;
    }

    if (!canManageOwnerView) {
      setIsLoading(false);
      setParkingLots([]);
      return;
    }

    let isMounted = true;

    const loadParkingLotSystem = async () => {
      // Owner gets own lots, admin gets all lots (enforced by backend role checks).
      setIsLoading(true);
      setErrorMessage('');

      try {
        const response = await fetch('/api/parking-lots/system', {
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

        const result = (await response.json()) as {
          parkingLots?: ParkingLotSystemRow[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(result.error || 'Unable to load parking lot system');
        }

        if (!isMounted) {
          return;
        }

        setParkingLots(result.parkingLots || []);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        console.error('Unable to load parking lot system:', error);
        setErrorMessage('Unable to load the parking lot system right now.');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadParkingLotSystem();

    return () => {
      isMounted = false;
    };
  }, [canManageOwnerView, isReady, router, token]);

  useEffect(() => {
    if (!isReady || !token || !canManageOwnerView) {
      return;
    }

    let isMounted = true;

    const loadOwnerBookings = async () => {
      // This powers the owner table for cancel/checkout-review actions.
      setIsBookingLoading(true);
      setBookingLoadError('');

      try {
        const response = await fetch('/api/owner/bookings', {
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

        const result = (await response.json()) as {
          bookings?: OwnerBookingDetail[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(result.error || 'Unable to load owner booking details');
        }

        if (!isMounted) {
          return;
        }

        setOwnerBookings(result.bookings || []);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        console.error('Unable to load owner bookings:', error);
        setBookingLoadError('Unable to load owner booking details right now.');
      } finally {
        if (isMounted) {
          setIsBookingLoading(false);
        }
      }
    };

    void loadOwnerBookings();

    return () => {
      isMounted = false;
    };
  }, [canManageOwnerView, isReady, router, token]);

  const handleCancelBookingByOwner = async (bookingId: number) => {
    if (!token) {
      return;
    }

    // Owner cancel triggers backend refund logic (wallet credit) when payment exists.
    const confirmed = confirm('Cancel this booking and refund payment to renter wallet?');
    if (!confirmed) {
      return;
    }

    setBookingActionError('');
    setBookingActionMessage('');
    setProcessingCancelBookingId(bookingId);

    try {
      const response = await fetch(`/api/owner/bookings/${bookingId}/cancel`, {
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
        message?: string;
        error?: string;
        booking?: { id: number; status: string };
      };

      if (!response.ok) {
        throw new Error(result.error || 'Unable to cancel booking');
      }

      setOwnerBookings((prev) =>
        prev.map((item) =>
          item.id === bookingId
            ? {
                ...item,
                bookingStatus: result.booking?.status || 'CANCELLED',
                payment: item.payment
                  ? { ...item.payment, status: 'REFUNDED' }
                  : item.payment,
              }
            : item
        )
      );
      setBookingActionMessage(result.message || 'Booking cancelled successfully');
    } catch (error) {
      console.error('Unable to cancel owner booking:', error);
      setBookingActionError(
        error instanceof Error ? error.message : 'Unable to cancel booking right now.'
      );
    } finally {
      setProcessingCancelBookingId(null);
    }
  };

  const handleCheckoutReviewByOwner = async (
    bookingId: number,
    action: 'APPROVE' | 'DENY'
  ) => {
    if (!token) {
      return;
    }

    // DENY keeps record but marks checkout rejected; APPROVE finalizes settlement.
    if (action === 'DENY') {
      const confirmed = confirm('Deny this checkout request?');
      if (!confirmed) {
        return;
      }
    }

    setBookingActionError('');
    setBookingActionMessage('');
    setProcessingCheckoutReviewId(bookingId);
    setProcessingCheckoutReviewAction(action);

    try {
      const response = await fetch(`/api/owner/bookings/${bookingId}/checkout-review`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action }),
      });

      if (response.status === 401) {
        clearStoredAuth();
        router.replace('/login');
        return;
      }

      const result = (await response.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
        booking?: { id: number; status: string };
      };

      if (!response.ok) {
        throw new Error(result.error || 'Unable to review checkout');
      }

      const nextStatus =
        result.booking?.status ||
        (action === 'APPROVE' ? 'CHECKOUT_APPROVED' : 'CHECKOUT_REJECTED');

      setOwnerBookings((previous) =>
        previous.map((item) =>
          item.id === bookingId
            ? {
                ...item,
                bookingStatus: nextStatus,
              }
            : item
        )
      );
      setBookingActionMessage(result.message || 'Checkout status updated');
    } catch (error) {
      console.error('Unable to review checkout request:', error);
      setBookingActionError(
        error instanceof Error ? error.message : 'Unable to review checkout right now.'
      );
    } finally {
      setProcessingCheckoutReviewId(null);
      setProcessingCheckoutReviewAction(null);
    }
  };

  const handleRequestOwnerAccess = async () => {
    if (!token || !authUser) {
      return;
    }

    setRequestError('');
    setRequestMessage('');
    setIsSubmittingRequest(true);

    try {
      const response = await fetch(`/api/USER/${authUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'REQUEST_OWNER',
        }),
      });

      const result = (await response.json()) as UserApiResponse;

      if (response.status === 401) {
        clearStoredAuth();
        router.replace('/login');
        return;
      }

      if (!response.ok || !result.user) {
        throw new Error(result.error || 'Unable to submit owner request');
      }

      const nextUser: AuthUser = {
        ...authUser,
        ...result.user,
        id: result.user.id || authUser.id,
        username:
          typeof result.user.username === 'string' ? result.user.username : authUser.username,
        role: typeof result.user.role === 'string' ? result.user.role : authUser.role,
      };

      setAuthUser(nextUser);

      if (typeof window !== 'undefined') {
        localStorage.setItem('auth_user', JSON.stringify(nextUser));
        notifyAuthStateChanged();
      }

      setRequestMessage(result.message || 'Owner request submitted successfully.');
    } catch (error) {
      console.error('Owner request error:', error);
      setRequestError(
        error instanceof Error ? error.message : 'Unable to submit owner request right now.'
      );
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  if (!isReady) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  if (!canManageOwnerView) {
    const canSubmitRequest =
      ownerRequestStatus !== 'PENDING' && ownerRequestStatus !== 'APPROVED';

    return (
      <div className="min-h-screen bg-gray-50">
        <Tabbar />
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-white p-8 shadow-xl">
            <div className="mb-8 rounded-3xl bg-gradient-to-r from-[#5B7CFF] via-[#4f74ff] to-[#3f63ef] p-6 text-white">
              <p className="text-sm uppercase tracking-[0.25em] text-blue-100">
                Owner Access
              </p>
              <h1 className="mt-2 text-3xl font-bold">Request Owner Role</h1>
              <p className="mt-2 max-w-2xl text-sm text-blue-100">
                Submit an owner request to unlock parking management pages and owner tools.
              </p>
            </div>

            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-800">Username:</span>{' '}
                {authUser?.username}
              </p>
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-800">Current status:</span>{' '}
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${ownerRequestStatusBadgeClass}`}
                >
                  {ownerRequestStatusLabel}
                </span>
              </p>

              {requestError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {requestError}
                </div>
              ) : null}

              {requestMessage ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {requestMessage}
                </div>
              ) : null}

              {ownerRequestStatus === 'PENDING' ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Your owner request is pending review.
                </div>
              ) : null}

              {ownerRequestStatus === 'REJECTED' ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Your previous owner request was denied. You can submit a new request.
                </div>
              ) : null}

              {ownerRequestStatus === 'APPROVED' ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                  Your owner request is approved. Sign out and sign back in if the owner tools do
                  not appear yet.
                </div>
              ) : null}

              {canSubmitRequest ? (
                <button
                  type="button"
                  onClick={() => {
                    void handleRequestOwnerAccess();
                  }}
                  disabled={isSubmittingRequest}
                  className="inline-flex items-center rounded-xl bg-[#5B7CFF] px-5 py-3 font-semibold text-white transition-all duration-300 hover:bg-[#4a6bef] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmittingRequest ? 'Submitting...' : 'Request Owner Access'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Tabbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-slate-300">
                Parkinglot System
              </p>
              <h1 className="mt-2 text-3xl font-bold">Owner Parking Lots</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">
                This dashboard uses live parking lot data from the database and gives you quick
                access to the owner tools added in the merge.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => router.push('/owner/parkingspace')}
                className="inline-flex items-center gap-2 rounded-xl bg-[#5B7CFF] px-4 py-3 font-semibold text-white transition-all duration-300 hover:bg-[#4a6bef] hover:shadow-md"
              >
                <PlusIcon className="h-5 w-5" />
                <span>Add Parking</span>
              </button>
              <button
                type="button"
                onClick={() => router.push('/owner/parkingmanage')}
                className="inline-flex items-center rounded-xl border border-white/20 bg-white/10 px-4 py-3 font-semibold text-white transition-all duration-300 hover:bg-white/15"
              >
                Open Parking Manager
              </button>
            </div>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <OwnerStatCard title="Parking Lots" value={parkingLots.length} />
          <OwnerStatCard title="Total Slots" value={totalSlots} />
          <OwnerStatCard title="Pending Lots" value={pendingLots} />
          <OwnerStatCard title="Actual Income" value={actualIncome} unit="THB" />
        </div>

        <section className="mb-8">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Quick Management</h2>
              <p className="text-sm text-gray-500">
                Use the merged owner cards for fast navigation into parking tools.
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push('/owner/parkingmanage')}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 font-medium text-gray-700 transition-all duration-300 hover:bg-gray-50 hover:shadow-sm"
            >
              Open Full Manager
            </button>
          </div>

          {parkingLots.length > 0 ? (
            <div className="space-y-4">
              {parkingLots.slice(0, 3).map((lot) => (
                <OwnerParkingCard
                  key={lot.id}
                  id={String(lot.id)}
                  name={lot.name}
                  status={mapParkingStatus(lot.status)}
                  onManage={(lotId) => {
                    router.push(`/owner/parkingmanage?lotId=${lotId}`);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl bg-white px-5 py-8 text-center text-gray-500 shadow-sm">
              No parking lots available for quick management yet.
            </div>
          )}
        </section>

        <section className="mb-8">
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-gray-800">Parking Lot Requests</h2>
            <p className="text-sm text-gray-500">
              These parking lots are still waiting for admin approval.
            </p>
          </div>

          {requestingLots.length > 0 ? (
            <div className="space-y-4">
              {requestingLots.slice(0, 5).map((lot) => (
                <OwnerParkingCard
                  key={`request-${lot.id}`}
                  id={String(lot.id)}
                  name={lot.name}
                  status="pending"
                  onManage={(lotId) => {
                    router.push(`/owner/parkingmanage?lotId=${lotId}`);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl bg-white px-5 py-8 text-center text-gray-500 shadow-sm">
              No parking lot requests are pending right now.
            </div>
          )}
        </section>

        <section className="mb-8">
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-gray-800">Booked Slot Details</h2>
            <p className="text-sm text-gray-500">
              Review renter bookings and cancel with automatic refund to wallet.
            </p>
          </div>

          {bookingActionError ? (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {bookingActionError}
            </div>
          ) : null}

          {bookingActionMessage ? (
            <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
              {bookingActionMessage}
            </div>
          ) : null}

          {bookingLoadError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {bookingLoadError}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-100 text-left text-sm font-semibold text-slate-700">
                    <tr>
                      <th className="px-4 py-3">Booking</th>
                      <th className="px-4 py-3">Parking Lot</th>
                      <th className="px-4 py-3">Renter</th>
                      <th className="px-4 py-3">Check-in</th>
                      <th className="px-4 py-3">Check-out</th>
                      <th className="px-4 py-3">Payment</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white text-sm text-slate-600">
                    {isBookingLoading ? (
                      <tr>
                        <td className="px-4 py-6 text-center text-slate-500" colSpan={8}>
                          Loading booking details...
                        </td>
                      </tr>
                    ) : ownerBookings.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-center text-slate-500" colSpan={8}>
                          No booking details found.
                        </td>
                      </tr>
                    ) : (
                      ownerBookings.map((booking) => {
                        const canCancel =
                          booking.bookingStatus !== 'CANCELLED' &&
                          booking.bookingStatus !== 'CHECKOUT_APPROVED' &&
                          booking.bookingStatus !== 'CHECKING_OUT';
                        const canReviewCheckout = booking.bookingStatus === 'CHECKING_OUT';
                        const isProcessingCheckoutReview =
                          processingCheckoutReviewId === booking.id;

                        return (
                          <tr key={booking.id} className="hover:bg-slate-50">
                            <td className="px-4 py-4 font-semibold text-slate-800">#{booking.id}</td>
                            <td className="px-4 py-4">{booking.lotName}</td>
                            <td className="px-4 py-4">
                              <div className="font-medium text-slate-700">
                                {booking.renter.name || booking.renter.username}
                              </div>
                              <div className="text-xs text-slate-500">@{booking.renter.username}</div>
                            </td>
                            <td className="px-4 py-4">{formatDateTimeValue(booking.checkinTime)}</td>
                            <td className="px-4 py-4">{formatDateTimeValue(booking.checkoutTime)}</td>
                            <td className="px-4 py-4">
                              {booking.payment
                                ? `${booking.payment.amount.toLocaleString('th-TH', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })} THB (${booking.payment.status || '-'})`
                                : '-'}
                            </td>
                            <td className="px-4 py-4">{booking.bookingStatus}</td>
                            <td className="px-4 py-4">
                              <div className="flex flex-col gap-2">
                                {booking.checkinProofUrl ? (
                                  <a
                                    href={booking.checkinProofUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-lg border border-slate-300 px-3 py-2 text-center text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                                  >
                                    View Check-in Proof
                                  </a>
                                ) : null}

                                {canReviewCheckout ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void handleCheckoutReviewByOwner(booking.id, 'APPROVE');
                                      }}
                                      disabled={isProcessingCheckoutReview}
                                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                                    >
                                      {isProcessingCheckoutReview &&
                                      processingCheckoutReviewAction === 'APPROVE'
                                        ? 'Approving...'
                                        : 'Approve Checkout'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void handleCheckoutReviewByOwner(booking.id, 'DENY');
                                      }}
                                      disabled={isProcessingCheckoutReview}
                                      className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                                    >
                                      {isProcessingCheckoutReview &&
                                      processingCheckoutReviewAction === 'DENY'
                                        ? 'Denying...'
                                        : 'Deny Checkout'}
                                    </button>
                                  </>
                                ) : null}

                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleCancelBookingByOwner(booking.id);
                                  }}
                                  disabled={
                                    !canCancel ||
                                    processingCancelBookingId === booking.id ||
                                    isProcessingCheckoutReview
                                  }
                                  className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                                >
                                  {processingCancelBookingId === booking.id
                                    ? 'Cancelling...'
                                    : 'Cancel'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {errorMessage ? (
          <div className="mb-8 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {!errorMessage && !isLoading && parkingLots.length === 0 ? (
          <div className="mb-8 rounded-2xl bg-white px-5 py-8 text-center text-gray-500 shadow-sm">
            No parking lots are in the system yet.
          </div>
        ) : null}

        <div className="overflow-hidden rounded-3xl bg-white shadow-xl">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-100 text-left text-sm font-semibold text-slate-700">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Address</th>
                  <th className="px-4 py-3">Number</th>
                  <th className="px-4 py-3">District</th>
                  <th className="px-4 py-3">Amphoe</th>
                  <th className="px-4 py-3">Subdistrict</th>
                  <th className="px-4 py-3">Province</th>
                  <th className="px-4 py-3">Coordinates</th>
                  <th className="px-4 py-3">Slots</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-sm text-slate-600">
                {isLoading ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={11}>
                      Loading parking lots...
                    </td>
                  </tr>
                ) : (
                  parkingLots.map((lot) => (
                    <tr key={lot.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4 font-semibold text-slate-800">{lot.name}</td>
                      <td className="px-4 py-4">{lot.addressLine}</td>
                      <td className="px-4 py-4">{lot.streetNumber}</td>
                      <td className="px-4 py-4">{lot.district}</td>
                      <td className="px-4 py-4">{lot.amphoe}</td>
                      <td className="px-4 py-4">{lot.subdistrict}</td>
                      <td className="px-4 py-4">{lot.province}</td>
                      <td className="px-4 py-4">
                        {lot.latitude !== null && lot.longitude !== null
                          ? `${lot.latitude.toFixed(5)}, ${lot.longitude.toFixed(5)}`
                          : '-'}
                      </td>
                      <td className="px-4 py-4">{lot.total}</td>
                      <td className="px-4 py-4">{lot.priceLabel}</td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            lot.status.toLowerCase().includes('pending')
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {lot.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
