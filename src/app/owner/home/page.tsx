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

function mapParkingStatus(statusLabel: string): ParkingStatus {
  if (statusLabel.toLowerCase().includes('pending')) {
    return 'pending';
  }

  return 'available';
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

  const normalizedRole = authUser?.role?.toLowerCase() || '';
  const canManageOwnerView = normalizedRole === 'owner' || normalizedRole === 'admin';
  const ownerRequestStatus = authUser?.ownerRequestStatus?.toUpperCase() || null;
  const ownerRequestStatusLabel = ownerRequestStatus || 'NOT_REQUESTED';
  const ownerRequestStatusBadgeClass =
    ownerRequestStatus === 'APPROVED'
      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
      : ownerRequestStatus === null
        ? 'border border-blue-200 bg-blue-50 text-[#5B7CFF]'
        : 'border border-red-200 bg-red-50 text-red-700';
  const totalSlots = parkingLots.reduce((sum, lot) => sum + lot.total, 0);
  const pendingLots = parkingLots.filter((lot) => lot.status.toLowerCase().includes('pending')).length;
  const averagePrice = parkingLots.length
    ? Math.round(parkingLots.reduce((sum, lot) => sum + lot.price, 0) / parkingLots.length)
    : 0;

  useEffect(() => {
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
                  Your previous owner request was rejected. You can submit a new request.
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
          <OwnerStatCard title="Average Price" value={averagePrice} unit="THB" />
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
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
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
