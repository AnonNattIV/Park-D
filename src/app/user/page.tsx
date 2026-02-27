'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthUser, clearStoredAuth, readStoredAuthUser, readStoredToken } from '@/lib/auth-client';

const userSummary = [
  { label: 'Active Booking', value: '1' },
  { label: 'Saved Lots', value: '4' },
  { label: 'Total Trips', value: '26' },
];

const upcomingBookings = [
  {
    id: 'BK-10021',
    lotName: 'Central Mall Parking',
    slot: 'B2-17',
    time: 'Today, 14:00 - 16:00',
    status: 'Confirmed',
  },
  {
    id: 'BK-10022',
    lotName: 'North Station',
    slot: 'A1-03',
    time: 'Tomorrow, 09:30 - 11:00',
    status: 'Pending Payment',
  },
];

export default function UserHomePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const token = readStoredToken();
    const storedUser = readStoredAuthUser();

    if (!token || !storedUser) {
      router.replace('/login');
      return;
    }

    if (storedUser.role?.toLowerCase() === 'admin') {
      router.replace('/admin');
      return;
    }

    setUser(storedUser);
    setIsReady(true);
  }, [router]);

  const handleLogout = () => {
    clearStoredAuth();
    router.replace('/login');
  };

  if (!isReady || !user) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl bg-gradient-to-r from-[#4a7bff] to-[#6692ff] p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm opacity-80">Owner / Renter Homepage (Mock)</p>
              <h1 className="text-3xl font-bold">Hello, {user.username}</h1>
              <p className="mt-1 text-sm opacity-90">Find, book, and manage your parking in one place.</p>
            </div>

            <button
              onClick={handleLogout}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#4a7bff] transition hover:bg-blue-50"
            >
              Logout
            </button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {userSummary.map((item) => (
            <article key={item.label} className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">{item.label}</p>
              <p className="mt-2 text-3xl font-bold text-slate-800">{item.value}</p>
            </article>
          ))}
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800">Upcoming Bookings</h2>
            <button className="text-sm font-semibold text-[#4a7bff] transition hover:underline">
              View All
            </button>
          </div>

          <div className="space-y-3">
            {upcomingBookings.map((booking) => (
              <article key={booking.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-slate-800">{booking.lotName}</p>
                    <p className="text-sm text-slate-500">{booking.time}</p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-sm text-slate-600">Slot {booking.slot}</p>
                    <p className="text-sm font-semibold text-[#4a7bff]">{booking.status}</p>
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
