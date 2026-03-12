'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthUser, clearStoredAuth, readStoredAuthUser, readStoredToken } from '@/lib/auth-client';

type OwnerRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
type OwnerRequestAction = 'APPROVE_OWNER' | 'REJECT_OWNER';
type ParkingLotRequestStatus = 'REQUEST' | 'APPROVED' | 'DENIED';
type ParkingLotRequestAction = 'APPROVE' | 'DENY';
type AdminMenu = 'owner' | 'parking' | 'payment' | 'booking';
type PaymentReviewAction = 'APPROVE' | 'DENY';

interface PaymentApprovalItem {
  payment: {
    id: number;
    bookingId: number;
    status: string;
    method: string;
    amount: number;
    paidAt: string | null;
    submittedAt: string;
    proofUrl: string | null;
  };
  lot: {
    id: number;
    name: string;
    location: string;
  };
  owner: {
    id: number;
    username: string;
    name: string | null;
  };
  renter: {
    id: number;
    username: string;
    name: string | null;
  };
}

interface OwnerRequestItem {
  userId: number;
  username: string;
  fullName: string;
  email: string;
  citizenId: string | null;
  submittedAt: string;
  status: OwnerRequestStatus;
}

interface ParkingLotRequestItem {
  lotId: number;
  lotName: string;
  location: string;
  price: number;
  totalSlot: number;
  ownerUserId: number;
  ownerUsername: string;
  ownerName: string;
  ownerEvidenceUrl?: string | null;
  submittedAt: string;
  status: ParkingLotRequestStatus;
}

interface OwnerRequestListResponse {
  requests?: OwnerRequestItem[];
  error?: string;
}

interface OwnerRequestPatchResponse {
  success?: boolean;
  message?: string;
  error?: string;
  user?: {
    ownerRequestStatus?: string | null;
  };
}

interface ParkingLotRequestListResponse {
  requests?: ParkingLotRequestItem[];
  error?: string;
}

interface ParkingLotRequestPatchResponse {
  success?: boolean;
  message?: string;
  error?: string;
  lot?: {
    lotId?: number;
    status?: string | null;
  };
}

interface PaymentApprovalListResponse {
  approvals?: PaymentApprovalItem[];
  error?: string;
}

interface PaymentReviewResponse {
  success?: boolean;
  message?: string;
  error?: string;
  payment?: {
    id: number;
    status: string;
  };
}

interface BookingHistoryItem {
  id: number;
  status: string;
  checkin: string;
  checkout: string;
  createdAt: string;
  plateId: string;
  renterUsername: string;
  renterFirstName: string | null;
  renterLastName: string | null;
  lotName: string;
  lotLocation: string;
  vehicleBrand: string | null;
  vehicleModel: string | null;
}

function formatSubmittedAt(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getOwnerStatusLabel(status: OwnerRequestStatus): string {
  if (status === 'PENDING') {
    return 'REQUEST';
  }

  if (status === 'REJECTED') {
    return 'DENIED';
  }

  return 'APPROVED';
}

function getOwnerStatusClassName(status: OwnerRequestStatus): string {
  if (status === 'APPROVED') {
    return 'bg-emerald-100 text-emerald-800';
  }

  if (status === 'REJECTED') {
    return 'bg-rose-100 text-rose-800';
  }

  return 'bg-amber-100 text-amber-800';
}

function getParkingStatusClassName(status: ParkingLotRequestStatus): string {
  if (status === 'APPROVED') {
    return 'bg-emerald-100 text-emerald-800';
  }

  if (status === 'DENIED') {
    return 'bg-rose-100 text-rose-800';
  }

  return 'bg-amber-100 text-amber-800';
}

export default function AdminHomePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [activeMenu, setActiveMenu] = useState<AdminMenu>('owner');

  const [ownerRequests, setOwnerRequests] = useState<OwnerRequestItem[]>([]);
  const [isOwnerLoading, setIsOwnerLoading] = useState(true);
  const [ownerLoadError, setOwnerLoadError] = useState('');
  const [ownerActionError, setOwnerActionError] = useState('');
  const [ownerActionMessage, setOwnerActionMessage] = useState('');
  const [processingOwnerUserId, setProcessingOwnerUserId] = useState<number | null>(null);
  const [citizenIdByUser, setCitizenIdByUser] = useState<Record<number, string>>({});

  const [parkingRequests, setParkingRequests] = useState<ParkingLotRequestItem[]>([]);
  const [isParkingLoading, setIsParkingLoading] = useState(true);
  const [parkingLoadError, setParkingLoadError] = useState('');
  const [parkingActionError, setParkingActionError] = useState('');
  const [parkingActionMessage, setParkingActionMessage] = useState('');
  const [processingLotId, setProcessingLotId] = useState<number | null>(null);
  const [paymentApprovals, setPaymentApprovals] = useState<PaymentApprovalItem[]>([]);
  const [isPaymentLoading, setIsPaymentLoading] = useState(true);
  const [paymentLoadError, setPaymentLoadError] = useState('');
  const [paymentActionError, setPaymentActionError] = useState('');
  const [paymentActionMessage, setPaymentActionMessage] = useState('');
  const [processingPaymentId, setProcessingPaymentId] = useState<number | null>(null);

  const [bookings, setBookings] = useState<BookingHistoryItem[]>([]);
  const [isBookingLoading, setIsBookingLoading] = useState(false);
  const [bookingFilterStatus, setBookingFilterStatus] = useState('ALL');
  const [bookingSortBy, setBookingSortBy] = useState('created_at');
  const [bookingOrder, setBookingOrder] = useState('desc');
  const [bookingLoadError, setBookingLoadError] = useState('');

  useEffect(() => {
    const storedToken = readStoredToken();
    const storedUser = readStoredAuthUser();

    if (!storedToken || !storedUser) {
      router.replace('/login');
      return;
    }

    if (storedUser.role?.toLowerCase() !== 'admin') {
      router.replace('/');
      return;
    }

    setUser(storedUser);
    setToken(storedToken);
    setIsReady(true);
  }, [router]);

  const loadOwnerRequests = useCallback(async () => {
    if (!token) {
      return;
    }

    setIsOwnerLoading(true);
    setOwnerLoadError('');

    try {
      const response = await fetch('/api/admin/owner-requests', {
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

      const result = (await response.json()) as OwnerRequestListResponse;

      if (!response.ok) {
        throw new Error(result.error || 'Unable to load owner requests');
      }

      const nextRequests = result.requests || [];
      setOwnerRequests(nextRequests);
      setCitizenIdByUser((prev) => {
        const nextMap: Record<number, string> = { ...prev };
        nextRequests.forEach((item) => {
          if (item.citizenId && !nextMap[item.userId]) {
            nextMap[item.userId] = item.citizenId;
          }
        });
        return nextMap;
      });
    } catch (error) {
      console.error('Unable to load owner requests:', error);
      setOwnerLoadError(error instanceof Error ? error.message : 'Unable to load owner requests right now.');
    } finally {
      setIsOwnerLoading(false);
    }
  }, [router, token]);

  const loadParkingLotRequests = useCallback(async () => {
    if (!token) {
      return;
    }

    setIsParkingLoading(true);
    setParkingLoadError('');

    try {
      const response = await fetch('/api/admin/parking-lot-requests', {
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

      const result = (await response.json()) as ParkingLotRequestListResponse;

      if (!response.ok) {
        throw new Error(result.error || 'Unable to load parking lot requests');
      }

      setParkingRequests(result.requests || []);
    } catch (error) {
      console.error('Unable to load parking lot requests:', error);
      setParkingLoadError(
        error instanceof Error ? error.message : 'Unable to load parking lot requests right now.'
      );
    } finally {
      setIsParkingLoading(false);
    }
  }, [router, token]);

  const loadPaymentApprovals = useCallback(async () => {
    if (!token) {
      return;
    }

    setIsPaymentLoading(true);
    setPaymentLoadError('');

    try {
      const response = await fetch('/api/admin/payment-approvals', {
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

      const result = (await response.json()) as PaymentApprovalListResponse;

      if (!response.ok) {
        throw new Error(result.error || 'Unable to load payment approvals');
      }

      setPaymentApprovals(result.approvals || []);
    } catch (error) {
      console.error('Unable to load payment approvals:', error);
      setPaymentLoadError(
        error instanceof Error ? error.message : 'Unable to load payment approvals right now.'
      );
    } finally {
      setIsPaymentLoading(false);
    }
  }, [router, token]);

  useEffect(() => {
    if (!isReady || !token) {
      return;
    }

    void loadOwnerRequests();
    void loadParkingLotRequests();
    void loadPaymentApprovals();
  }, [isReady, loadOwnerRequests, loadParkingLotRequests, loadPaymentApprovals, token]);

  const loadBookings = useCallback(async () => {
    if (!token) return;
    setIsBookingLoading(true);
    setBookingLoadError('');

    try {
      const params = new URLSearchParams({
        status: bookingFilterStatus,
        sortBy: bookingSortBy,
        order: bookingOrder,
      });

      const response = await fetch(`/api/bookings?${params.toString()}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });

      if (response.status === 401) {
        clearStoredAuth();
        router.replace('/login');
        return;
      }

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to load bookings');

      setBookings(result.bookings || []);
    } catch (error) {
      console.error('Unable to load bookings:', error);
    } finally {
      setIsBookingLoading(false);
    }
  }, [token, bookingFilterStatus, bookingSortBy, bookingOrder, router]);

  useEffect(() => {
    if (activeMenu === 'booking') {
      void loadBookings();
    }
  }, [activeMenu, loadBookings]);

  const handleLogout = () => {
    clearStoredAuth();
    router.replace('/login');
  };

  const handleCitizenIdChange = (userId: number, value: string) => {
    setCitizenIdByUser((prev) => ({
      ...prev,
      [userId]: value,
    }));
  };

  const handleOwnerRequestAction = async (item: OwnerRequestItem, action: OwnerRequestAction) => {
    if (!token || item.status !== 'PENDING') {
      return;
    }

    setOwnerActionError('');
    setOwnerActionMessage('');

    const citizenIdInput = citizenIdByUser[item.userId]?.trim() || item.citizenId || '';

    if (action === 'APPROVE_OWNER' && !citizenIdInput) {
      setOwnerActionError(`Citizen ID is required to approve user ${item.username}.`);
      return;
    }

    setProcessingOwnerUserId(item.userId);

    try {
      const response = await fetch(`/api/USER/${item.userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(
          action === 'APPROVE_OWNER'
            ? { action, citizenId: citizenIdInput }
            : { action }
        ),
      });

      if (response.status === 401) {
        clearStoredAuth();
        router.replace('/login');
        return;
      }

      const result = (await response.json()) as OwnerRequestPatchResponse;

      if (!response.ok) {
        throw new Error(result.error || 'Unable to update owner request');
      }

      const nextStatus = result.user?.ownerRequestStatus?.toUpperCase() as OwnerRequestStatus | undefined;
      const fallbackStatus: OwnerRequestStatus = action === 'APPROVE_OWNER' ? 'APPROVED' : 'REJECTED';

      setOwnerRequests((prev) =>
        prev.map((requestItem) =>
          requestItem.userId === item.userId
            ? {
                ...requestItem,
                status: nextStatus || fallbackStatus,
                citizenId:
                  action === 'APPROVE_OWNER'
                    ? citizenIdInput
                    : requestItem.citizenId,
              }
            : requestItem
        )
      );

      if (action === 'APPROVE_OWNER') {
        setCitizenIdByUser((prev) => ({
          ...prev,
          [item.userId]: citizenIdInput,
        }));
      }

      setOwnerActionMessage(result.message || 'Owner request updated successfully.');
    } catch (error) {
      console.error('Unable to update owner request:', error);
      setOwnerActionError(error instanceof Error ? error.message : 'Unable to update owner request right now.');
    } finally {
      setProcessingOwnerUserId(null);
    }
  };

  const handleParkingLotRequestAction = async (
    item: ParkingLotRequestItem,
    action: ParkingLotRequestAction
  ) => {
    if (!token || item.status !== 'REQUEST') {
      return;
    }

    setParkingActionError('');
    setParkingActionMessage('');
    setProcessingLotId(item.lotId);

    try {
      const response = await fetch(`/api/admin/parking-lot-requests/${item.lotId}`, {
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

      const result = (await response.json()) as ParkingLotRequestPatchResponse;

      if (!response.ok) {
        throw new Error(result.error || 'Unable to update parking lot request');
      }

      const nextStatus = result.lot?.status?.toUpperCase() as ParkingLotRequestStatus | undefined;
      const fallbackStatus: ParkingLotRequestStatus = action === 'APPROVE' ? 'APPROVED' : 'DENIED';

      setParkingRequests((prev) =>
        prev.map((requestItem) =>
          requestItem.lotId === item.lotId
            ? {
                ...requestItem,
                status: nextStatus || fallbackStatus,
              }
            : requestItem
        )
      );

      setParkingActionMessage(result.message || 'Parking lot request updated successfully.');
    } catch (error) {
      console.error('Unable to update parking lot request:', error);
      setParkingActionError(
        error instanceof Error ? error.message : 'Unable to update parking lot request right now.'
      );
    } finally {
      setProcessingLotId(null);
    }
  };

  const handlePaymentReviewAction = async (
    item: PaymentApprovalItem,
    action: PaymentReviewAction
  ) => {
    if (!token || item.payment.status.toUpperCase() !== 'PENDING') {
      return;
    }

    setPaymentActionError('');
    setPaymentActionMessage('');
    setProcessingPaymentId(item.payment.id);

    try {
      const response = await fetch(`/api/payments/${item.payment.id}/review`, {
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

      const result = (await response.json()) as PaymentReviewResponse;

      if (!response.ok) {
        throw new Error(result.error || 'Unable to review payment');
      }

      const nextStatus = result.payment?.status?.toUpperCase();
      setPaymentApprovals((prev) =>
        prev.map((approval) =>
          approval.payment.id === item.payment.id
            ? {
                ...approval,
                payment: {
                  ...approval.payment,
                  status: nextStatus || (action === 'APPROVE' ? 'PAID' : 'FAILED'),
                },
              }
            : approval
        )
      );

      setPaymentActionMessage(result.message || 'Payment reviewed successfully.');
    } catch (error) {
      console.error('Unable to review payment:', error);
      setPaymentActionError(
        error instanceof Error ? error.message : 'Unable to review payment right now.'
      );
    } finally {
      setProcessingPaymentId(null);
    }
  };

  const pendingOwnerCount = useMemo(
    () => ownerRequests.filter((item) => (item.status || '').toUpperCase() === 'PENDING').length,
    [ownerRequests]
  );

  const pendingParkingCount = useMemo(
    () => parkingRequests.filter((item) => (item.status || '').toUpperCase() === 'REQUEST').length,
    [parkingRequests]
  );

  const approvedParkingCount = useMemo(
    () => parkingRequests.filter((item) => (item.status || '').toUpperCase() === 'APPROVED').length,
    [parkingRequests]
  );

  const deniedParkingCount = useMemo(
    () => parkingRequests.filter((item) => (item.status || '').toUpperCase() === 'DENIED').length,
    [parkingRequests]
  );

  const pendingPaymentCount = useMemo(
    () =>
      paymentApprovals.filter((item) => (item.payment?.status || '').toUpperCase() === 'PENDING')
        .length,
    [paymentApprovals]
  );

  if (!isReady || !user) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl bg-gradient-to-r from-slate-800 to-slate-700 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm opacity-80">Admin Homepage</p>
              <h1 className="text-3xl font-bold">Admin Request Control Center</h1>
              <p className="mt-1 text-sm opacity-90">Signed in as {user.username}</p>
            </div>

            <button
              onClick={handleLogout}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
            >
              Logout
            </button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <article className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Pending Owner Requests</p>
            <p className="mt-2 text-3xl font-bold text-amber-700">{pendingOwnerCount}</p>
          </article>
          <article className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Parking Lot Requests</p>
            <p className="mt-2 text-3xl font-bold text-amber-700">{pendingParkingCount}</p>
          </article>
          <article className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Approved Parking Lots</p>
            <p className="mt-2 text-3xl font-bold text-emerald-700">{approvedParkingCount}</p>
          </article>
          <article className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Denied Parking Lots</p>
            <p className="mt-2 text-3xl font-bold text-rose-700">{deniedParkingCount}</p>
          </article>
          <article className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Pending Payment Proofs</p>
            <p className="mt-2 text-3xl font-bold text-amber-700">{pendingPaymentCount}</p>
          </article>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-slate-600">Request Menu</p>
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveMenu('owner')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeMenu === 'owner'
                  ? 'bg-white text-slate-900 shadow'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Owner Requests
            </button>
            <button
              type="button"
              onClick={() => setActiveMenu('parking')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeMenu === 'parking'
                  ? 'bg-white text-slate-900 shadow'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Parking Lot Requests
            </button>
            <button
              type="button"
              onClick={() => setActiveMenu('payment')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeMenu === 'payment'
                  ? 'bg-white text-slate-900 shadow'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Payment Proofs
            </button>

            <button
              type="button"
              onClick={() => setActiveMenu('booking')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeMenu === 'booking'
                  ? 'bg-white text-slate-900 shadow'
                  : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                Booking History
              </button>
            
          </div>
        </section>

        {activeMenu === 'owner' ? (
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Owner Request Board</h2>
                <p className="text-sm text-slate-500">Live data from database owner requests</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void loadOwnerRequests();
                }}
                disabled={isOwnerLoading}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isOwnerLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {ownerLoadError ? (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {ownerLoadError}
              </div>
            ) : null}

            {ownerActionError ? (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {ownerActionError}
              </div>
            ) : null}

            {ownerActionMessage ? (
              <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {ownerActionMessage}
              </div>
            ) : null}

            {isOwnerLoading ? (
              <p className="py-8 text-center text-sm text-slate-500">Loading owner requests...</p>
            ) : ownerRequests.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No owner requests found.</p>
            ) : (
              <div className="space-y-3">
                {ownerRequests.map((item) => {
                  const isPending = item.status === 'PENDING';
                  const isProcessing = processingOwnerUserId === item.userId;

                  return (
                    <article key={item.userId} className="rounded-xl border border-slate-200 p-4">
                      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                        <div>
                          <p className="font-semibold text-slate-800">{item.username}</p>
                          <p className="text-sm text-slate-500">Name: {item.fullName || '-'}</p>
                          <p className="text-sm text-slate-500">Email: {item.email}</p>
                          <p className="text-sm text-slate-500">User ID: {item.userId}</p>
                          <p className="text-sm text-slate-500">Submitted: {formatSubmittedAt(item.submittedAt)}</p>
                        </div>

                        <div className="min-w-[300px] space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`rounded-lg px-3 py-1 text-xs font-semibold ${getOwnerStatusClassName(item.status)}`}>
                              {getOwnerStatusLabel(item.status)}
                            </span>
                          </div>

                          <input
                            type="text"
                            value={citizenIdByUser[item.userId] ?? item.citizenId ?? ''}
                            onChange={(event) => handleCitizenIdChange(item.userId, event.target.value)}
                            placeholder="Citizen ID"
                            disabled={!isPending || isProcessing}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100"
                          />

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                void handleOwnerRequestAction(item, 'APPROVE_OWNER');
                              }}
                              disabled={!isPending || isProcessing}
                              className="flex-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {isProcessing ? 'Processing...' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void handleOwnerRequestAction(item, 'REJECT_OWNER');
                              }}
                              disabled={!isPending || isProcessing}
                              className="flex-1 rounded-lg bg-rose-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {isProcessing ? 'Processing...' : 'Deny'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : activeMenu === 'parking' ? (
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Parking Lot Request Board</h2>
                <p className="text-sm text-slate-500">Approve or deny parking lot requests from owners</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void loadParkingLotRequests();
                }}
                disabled={isParkingLoading}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isParkingLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {parkingLoadError ? (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {parkingLoadError}
              </div>
            ) : null}

            {parkingActionError ? (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {parkingActionError}
              </div>
            ) : null}

            {parkingActionMessage ? (
              <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {parkingActionMessage}
              </div>
            ) : null}

            {isParkingLoading ? (
              <p className="py-8 text-center text-sm text-slate-500">Loading parking lot requests...</p>
            ) : parkingRequests.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No parking lot requests found.</p>
            ) : (
              <div className="space-y-3">
                {parkingRequests.map((item) => {
                  const isRequest = item.status === 'REQUEST';
                  const isProcessing = processingLotId === item.lotId;

                  return (
                    <article key={item.lotId} className="rounded-xl border border-slate-200 p-4">
                      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                        <div>
                          <p className="font-semibold text-slate-800">{item.lotName}</p>
                          <p className="text-sm text-slate-500">Location: {item.location}</p>
                          <p className="text-sm text-slate-500">
                            Owner: {item.ownerUsername} ({item.ownerName || '-'})
                          </p>
                          <p className="text-sm text-slate-500">Owner User ID: {item.ownerUserId}</p>
                          <p className="text-sm text-slate-500">
                            Slots: {item.totalSlot} | Price: {item.price.toLocaleString('th-TH')} THB/hr
                          </p>
                          <p className="text-sm text-slate-500">Submitted: {formatSubmittedAt(item.submittedAt)}</p>
                          {item.ownerEvidenceUrl ? (
                            <a
                              href={item.ownerEvidenceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-block rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                            >
                              Open Owner Evidence
                            </a>
                          ) : (
                            <p className="text-xs text-rose-600">No owner evidence file.</p>
                          )}
                        </div>

                        <div className="min-w-[300px] space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`rounded-lg px-3 py-1 text-xs font-semibold ${getParkingStatusClassName(item.status)}`}>
                              {item.status}
                            </span>
                          </div>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                void handleParkingLotRequestAction(item, 'APPROVE');
                              }}
                              disabled={!isRequest || isProcessing}
                              className="flex-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {isProcessing ? 'Processing...' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void handleParkingLotRequestAction(item, 'DENY');
                              }}
                              disabled={!isRequest || isProcessing}
                              className="flex-1 rounded-lg bg-rose-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {isProcessing ? 'Processing...' : 'Deny'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : activeMenu === 'payment' ? (
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Payment Proof Review Board</h2>
                <p className="text-sm text-slate-500">Approve or deny uploaded payment proofs</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void loadPaymentApprovals();
                }}
                disabled={isPaymentLoading}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isPaymentLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {paymentLoadError ? (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {paymentLoadError}
              </div>
            ) : null}

            {paymentActionError ? (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {paymentActionError}
              </div>
            ) : null}

            {paymentActionMessage ? (
              <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {paymentActionMessage}
              </div>
            ) : null}

            {isPaymentLoading ? (
              <p className="py-8 text-center text-sm text-slate-500">Loading payment approvals...</p>
            ) : paymentApprovals.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No payment proofs found.</p>
            ) : (
              <div className="space-y-3">
                {paymentApprovals.map((item) => {
                  const isPending = item.payment.status.toUpperCase() === 'PENDING';
                  const isProcessing = processingPaymentId === item.payment.id;

                  return (
                    <article key={item.payment.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                        <div className="space-y-1">
                          <p className="font-semibold text-slate-800">
                            Payment #{item.payment.id} / Booking #{item.payment.bookingId}
                          </p>
                          <p className="text-sm text-slate-500">Lot: {item.lot.name}</p>
                          <p className="text-sm text-slate-500">
                            Owner: {item.owner.username} ({item.owner.name || '-'})
                          </p>
                          <p className="text-sm text-slate-500">
                            Renter: {item.renter.username} ({item.renter.name || '-'})
                          </p>
                          <p className="text-sm text-slate-500">
                            Amount: {item.payment.amount.toLocaleString('th-TH', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{' '}
                            THB ({item.payment.method})
                          </p>
                          <p className="text-sm text-slate-500">
                            Submitted: {formatSubmittedAt(item.payment.submittedAt)}
                          </p>
                          {item.payment.proofUrl ? (
                            <a
                              href={item.payment.proofUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                            >
                              Open Proof
                            </a>
                          ) : (
                            <p className="text-xs text-rose-600">No proof image found.</p>
                          )}
                        </div>

                        <div className="min-w-[300px] space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                                item.payment.status.toUpperCase() === 'PAID'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : item.payment.status.toUpperCase() === 'FAILED'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {item.payment.status}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                void handlePaymentReviewAction(item, 'APPROVE');
                              }}
                              disabled={!isPending || isProcessing}
                              className="flex-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {isProcessing ? 'Processing...' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void handlePaymentReviewAction(item, 'DENY');
                              }}
                              disabled={!isPending || isProcessing}
                              className="flex-1 rounded-lg bg-rose-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {isProcessing ? 'Processing...' : 'Deny'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : activeMenu === 'booking' ? (
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Booking & Rental History</h2>
                <p className="text-sm text-slate-500">Monitor all platform bookings</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
              <select 
                  value={bookingFilterStatus}
                  onChange={(e) => setBookingFilterStatus(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="WAITING_FOR_PAYMENT">Pending Payment</option>
                  <option value="PAYMENT_CONFIRMED">Paid</option>
                  <option value="CHECKOUT_APPROVED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>

                <select 
                  value={bookingSortBy}
                  onChange={(e) => setBookingSortBy(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                >
                  <option value="created_at">Date Created</option>
                  <option value="checkin_datetime">Check-in Date</option>
                </select>
                
                <button
                  onClick={() => setBookingOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  {bookingOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
                </button>

                <button
                  type="button"
                  onClick={() => void loadBookings()}
                  disabled={isBookingLoading}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-70"
                >
                  {isBookingLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>
            </div>

            {bookingLoadError ? (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {bookingLoadError}
              </div>
            ) : null}

            {isBookingLoading ? (
              <p className="py-8 text-center text-sm text-slate-500">Loading booking history...</p>
            ) : bookings.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No bookings match your criteria.</p>
            ) : (
              <div className="space-y-3">
                {bookings.map((booking) => (
                  <article key={booking.id} className="rounded-xl border border-slate-200 p-4 hover:shadow-sm transition">
                    <div className="grid gap-4 md:grid-cols-[2fr_1.5fr_1fr] md:items-center">
                      <div>
                        <p className="font-semibold text-slate-800">Booking #{booking.id} - {booking.lotName}</p>
                        <p className="text-sm text-slate-500">Location: {booking.lotLocation}</p>
                        <p className="text-sm text-slate-500 mt-1">
                          <span className="font-medium text-slate-700">Renter:</span> {booking.renterUsername} ({booking.renterFirstName || ''} {booking.renterLastName || ''})
                        </p>
                        <p className="text-sm text-slate-500">
                          <span className="font-medium text-slate-700">Vehicle:</span> {booking.plateId} {booking.vehicleBrand ? `(${booking.vehicleBrand} ${booking.vehicleModel || ''})` : ''}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <p className="text-sm text-slate-600">
                          <span className="inline-block w-16 text-slate-400">In:</span> 
                          {booking.checkin ? formatSubmittedAt(booking.checkin) : 'Pending'}
                        </p>
                        <p className="text-sm text-slate-600">
                          <span className="inline-block w-16 text-slate-400">Out:</span> 
                          {booking.checkout ? formatSubmittedAt(booking.checkout) : 'Pending'}
                        </p>
                      </div>

                      <div className="text-right flex flex-col items-end gap-2">
                        <span className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                          booking.status === 'CHECKOUT_APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                          booking.status === 'CANCELLED' ? 'bg-rose-100 text-rose-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {booking.status}
                        </span>
                        <p className="text-xs text-slate-400">Created: {new Date(booking.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
