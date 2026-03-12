'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Tabbar from '@/components/Tabbar';
import {
  AuthUser,
  clearStoredAuth,
  notifyAuthStateChanged,
  readStoredAuthUser,
  readStoredToken,
} from '@/lib/auth-client';

type OwnerRequestResponse = {
  success?: boolean;
  message?: string;
  error?: string;
  user?: {
    id: number;
    username: string;
    ownerRequestStatus: string | null;
  };
  ownerRequest?: {
    status: string | null;
    citizenId: string | null;
    evidenceUrl: string | null;
  };
};

export default function OwnerRequestPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [citizenId, setCitizenId] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const storedToken = readStoredToken();
    const storedUser = readStoredAuthUser();

    if (!storedToken || !storedUser) {
      router.replace('/login');
      return;
    }

    const normalizedRole = storedUser.role?.toLowerCase() || '';
    if (normalizedRole === 'owner' || normalizedRole === 'admin') {
      router.replace('/owner/home');
      return;
    }

    setToken(storedToken);
    setAuthUser(storedUser);
    setRequestStatus(storedUser.ownerRequestStatus || null);
    setIsReady(true);
  }, [router]);

  useEffect(() => {
    if (!isReady || !token) {
      return;
    }

    let isMounted = true;

    const loadOwnerRequest = async () => {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const response = await fetch('/api/owner-requests', {
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

        const result = (await response.json()) as OwnerRequestResponse;
        if (!response.ok) {
          throw new Error(result.error || 'Unable to load owner request');
        }

        if (!isMounted) {
          return;
        }

        const nextStatus = result.ownerRequest?.status || null;
        setRequestStatus(nextStatus);
        setCitizenId(result.ownerRequest?.citizenId || '');
        setEvidenceUrl(result.ownerRequest?.evidenceUrl || null);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        console.error('Unable to load owner request:', error);
        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to load owner request right now.'
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadOwnerRequest();

    return () => {
      isMounted = false;
    };
  }, [isReady, router, token]);

  const canSubmit = useMemo(() => {
    const status = (requestStatus || '').toUpperCase();
    return status !== 'PENDING' && status !== 'APPROVED';
  }, [requestStatus]);

  const statusBadgeClass = useMemo(() => {
    const status = (requestStatus || '').toUpperCase();
    if (status === 'PENDING') {
      return 'border border-blue-200 bg-blue-50 text-blue-700';
    }
    if (status === 'APPROVED') {
      return 'border border-emerald-200 bg-emerald-50 text-emerald-700';
    }
    if (status === 'REJECTED') {
      return 'border border-rose-200 bg-rose-50 text-rose-700';
    }
    return 'border border-blue-200 bg-blue-50 text-[#5B7CFF]';
  }, [requestStatus]);

  const statusLabel = useMemo(() => {
    const status = (requestStatus || '').toUpperCase();
    if (!status) {
      return 'NOT_REQUESTED';
    }
    return status;
  }, [requestStatus]);

  const handleEvidenceChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setEvidenceFile(file);
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleSubmit = async () => {
    if (!token || !authUser) {
      return;
    }

    if (!citizenId.trim()) {
      setErrorMessage('Citizen ID is required');
      return;
    }

    if (!/^\d+$/.test(citizenId.trim())) {
      setErrorMessage('Citizen ID must contain numbers only');
      return;
    }

    if (!evidenceFile && !evidenceUrl) {
      setErrorMessage('Please upload citizen ID evidence image');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const body = new FormData();
      body.append('citizenId', citizenId.trim());
      if (evidenceFile) {
        body.append('evidence', evidenceFile);
      }

      const response = await fetch('/api/owner-requests', {
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

      const result = (await response.json()) as OwnerRequestResponse;
      if (!response.ok) {
        throw new Error(result.error || 'Unable to submit owner request');
      }

      setRequestStatus(result.ownerRequest?.status || 'PENDING');
      setEvidenceUrl(result.ownerRequest?.evidenceUrl || null);
      setEvidenceFile(null);
      setSuccessMessage(result.message || 'Owner request submitted');

      const nextUser: AuthUser = {
        ...authUser,
        ownerRequestStatus: result.user?.ownerRequestStatus || 'PENDING',
      };
      setAuthUser(nextUser);
      localStorage.setItem('auth_user', JSON.stringify(nextUser));
      notifyAuthStateChanged();
    } catch (error) {
      console.error('Unable to submit owner request:', error);
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to submit owner request right now.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!token || !authUser) {
      return;
    }

    setIsCancelling(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await fetch('/api/owner-requests', {
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

      const result = (await response.json()) as OwnerRequestResponse;
      if (!response.ok) {
        throw new Error(result.error || 'Unable to cancel owner request');
      }

      setRequestStatus(result.ownerRequest?.status || null);
      setCitizenId(result.ownerRequest?.citizenId || '');
      setEvidenceUrl(result.ownerRequest?.evidenceUrl || null);
      setEvidenceFile(null);
      setSuccessMessage(result.message || 'Owner request cancelled');

      const nextUser: AuthUser = {
        ...authUser,
        ownerRequestStatus: result.user?.ownerRequestStatus || null,
      };
      setAuthUser(nextUser);
      localStorage.setItem('auth_user', JSON.stringify(nextUser));
      notifyAuthStateChanged();
    } catch (error) {
      console.error('Unable to cancel owner request:', error);
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to cancel owner request right now.'
      );
    } finally {
      setIsCancelling(false);
    }
  };

  if (!isReady) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Tabbar />
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-3xl bg-white p-8 shadow-xl">
          <div className="mb-8 rounded-3xl bg-gradient-to-r from-[#5B7CFF] via-[#4f74ff] to-[#3f63ef] p-6 text-white">
            <p className="text-sm uppercase tracking-[0.25em] text-blue-100">Owner Access</p>
            <h1 className="mt-2 text-3xl font-bold">Request Owner Role</h1>
            <p className="mt-2 max-w-2xl text-sm text-blue-100">
              Submit an owner request to unlock parking management pages and owner tools.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-800">Username:</span>{' '}
                  {authUser?.username}
                </p>
                <p className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-800">Current status:</span>{' '}
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${statusBadgeClass}`}>
                    {statusLabel}
                  </span>
                </p>

                {isLoading ? <p className="text-sm text-slate-500">Loading request...</p> : null}

                {requestStatus?.toUpperCase() === 'PENDING' ? (
                  <p className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                    Your request is pending admin review.
                  </p>
                ) : null}
                {requestStatus?.toUpperCase() === 'APPROVED' ? (
                  <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    Your owner request is approved. Please sign out and sign in again.
                  </p>
                ) : null}
                {requestStatus?.toUpperCase() === 'REJECTED' ? (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    Your previous request was denied. You can submit a new one.
                  </p>
                ) : null}

                {canSubmit ? (
                  <button
                    type="button"
                    onClick={() => {
                      void handleSubmit();
                    }}
                    disabled={isSubmitting || isCancelling}
                    className="rounded-xl bg-[#5B7CFF] px-5 py-3 font-semibold text-white transition-all duration-300 hover:bg-[#4a6bef] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSubmitting ? 'Submitting...' : 'Request Owner Access'}
                  </button>
                ) : null}
                {requestStatus?.toUpperCase() === 'PENDING' ? (
                  <button
                    type="button"
                    onClick={() => {
                      void handleCancelRequest();
                    }}
                    disabled={isCancelling || isSubmitting}
                    className="rounded-xl border border-rose-300 bg-rose-50 px-5 py-3 font-semibold text-rose-700 transition-all duration-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isCancelling ? 'Cancelling...' : 'Cancel Request'}
                  </button>
                ) : null}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Citizen ID
                  </label>
                  <input
                    type="text"
                    value={citizenId}
                    onChange={(event) =>
                      setCitizenId(event.target.value.replace(/\D/g, ''))
                    }
                    disabled={!canSubmit}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#5B7CFF] focus:ring-2 focus:ring-[#5B7CFF]/20 disabled:cursor-not-allowed disabled:bg-slate-100"
                    placeholder="Enter citizen ID"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Evidence Image
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleEvidenceChange}
                    disabled={!canSubmit}
                    className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Upload citizen ID image for admin verification (max 5 MB).
                  </p>

                  {evidenceFile ? (
                    <p className="mt-1 text-xs text-emerald-700">Selected: {evidenceFile.name}</p>
                  ) : null}
                  {evidenceUrl ? (
                    <a
                      href={evidenceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs font-semibold text-[#5B7CFF] hover:underline"
                    >
                      View current evidence
                    </a>
                  ) : null}
                </div>
              </div>
            </div>

            {errorMessage ? (
              <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMessage}
              </div>
            ) : null}
            {successMessage ? (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {successMessage}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
