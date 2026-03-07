'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthUser, clearStoredAuth, readStoredAuthUser, readStoredToken } from '@/lib/auth-client';

type OwnerRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
type OwnerRequestAction = 'APPROVE_OWNER' | 'REJECT_OWNER';
type ParkingLotRequestStatus = 'REQUEST' | 'APPROVED' | 'DENIED';
type ParkingLotRequestAction = 'APPROVE' | 'DENY';
type AdminMenu = 'owner' | 'parking';

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

  useEffect(() => {
    if (!isReady || !token) {
      return;
    }

    void loadOwnerRequests();
    void loadParkingLotRequests();
  }, [isReady, loadOwnerRequests, loadParkingLotRequests, token]);

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

  const pendingOwnerCount = useMemo(
    () => ownerRequests.filter((item) => item.status === 'PENDING').length,
    [ownerRequests]
  );

  const pendingParkingCount = useMemo(
    () => parkingRequests.filter((item) => item.status === 'REQUEST').length,
    [parkingRequests]
  );

  const approvedParkingCount = useMemo(
    () => parkingRequests.filter((item) => item.status === 'APPROVED').length,
    [parkingRequests]
  );

  const deniedParkingCount = useMemo(
    () => parkingRequests.filter((item) => item.status === 'DENIED').length,
    [parkingRequests]
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

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
        ) : (
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
        )}
      </div>
    </div>
  );
}
