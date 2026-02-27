'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthUser, clearStoredAuth, readStoredAuthUser, readStoredToken } from '@/lib/auth-client';

type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface OwnerRequestItem {
  userId: number;
  username: string;
  citizenId: string;
  submittedAt: string;
  status: RequestStatus;
}

const adminSummary = [
  { label: 'Pending Owner Requests', value: '3' },
  { label: 'Active Parking Lots', value: '41' },
  { label: 'Bookings Today', value: '128' },
];

const initialOwnerRequests: OwnerRequestItem[] = [
  {
    userId: 101,
    username: 'mike_parker',
    citizenId: '1103700123456',
    submittedAt: '2026-02-26 11:30',
    status: 'PENDING',
  },
  {
    userId: 114,
    username: 'sarah_lot_owner',
    citizenId: '1739900098765',
    submittedAt: '2026-02-26 17:05',
    status: 'PENDING',
  },
  {
    userId: 132,
    username: 'john_citypark',
    citizenId: '1101200088888',
    submittedAt: '2026-02-27 08:10',
    status: 'PENDING',
  },
];

export default function AdminHomePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [requests, setRequests] = useState<OwnerRequestItem[]>(initialOwnerRequests);

  useEffect(() => {
    const token = readStoredToken();
    const storedUser = readStoredAuthUser();

    if (!token || !storedUser) {
      router.replace('/login');
      return;
    }

    const role = storedUser.role?.toLowerCase();
    const isAdminMock = role === 'admin';

    if (!isAdminMock) {
      router.replace('/user');
      return;
    }

    setUser(storedUser);
    setIsReady(true);
  }, [router]);

  const handleLogout = () => {
    clearStoredAuth();
    router.replace('/login');
  };

  const updateRequestStatus = (userId: number, status: RequestStatus) => {
    setRequests((prev) =>
      prev.map((item) => (item.userId === userId ? { ...item, status } : item))
    );
  };

  if (!isReady || !user) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl bg-gradient-to-r from-slate-800 to-slate-700 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm opacity-80">Admin Homepage (Mock)</p>
              <h1 className="text-3xl font-bold">Control Center</h1>
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

        <section className="grid gap-4 md:grid-cols-3">
          {adminSummary.map((item) => (
            <article key={item.label} className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">{item.label}</p>
              <p className="mt-2 text-3xl font-bold text-slate-800">{item.value}</p>
            </article>
          ))}
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800">Owner Verification Queue</h2>
            <p className="text-sm text-slate-500">Mock data for homepage preview</p>
          </div>

          <div className="space-y-3">
            {requests.map((item) => (
              <article key={item.userId} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-slate-800">{item.username}</p>
                    <p className="text-sm text-slate-500">User ID: {item.userId}</p>
                    <p className="text-sm text-slate-500">Citizen ID: {item.citizenId}</p>
                    <p className="text-sm text-slate-500">Submitted: {item.submittedAt}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {item.status}
                    </span>
                    <button
                      onClick={() => updateRequestStatus(item.userId, 'APPROVED')}
                      className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-600"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => updateRequestStatus(item.userId, 'REJECTED')}
                      className="rounded-lg bg-rose-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-600"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
