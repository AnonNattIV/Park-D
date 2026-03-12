'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Tabbar from '@/components/Tabbar';
import { readStoredAuthUser, readStoredToken } from '@/lib/auth-client';

export default function OwnerEntryPage() {
  const router = useRouter();

  useEffect(() => {
    const token = readStoredToken();
    const user = readStoredAuthUser();

    if (!token || !user) {
      router.replace('/login');
      return;
    }

    const role = user.role?.toLowerCase() || '';
    if (role === 'owner' || role === 'admin') {
      router.replace('/owner/home');
      return;
    }

    router.replace('/owner/request');
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Tabbar />
      <div className="mx-auto max-w-3xl px-4 py-12 text-center text-sm text-slate-500">
        Redirecting...
      </div>
    </div>
  );
}
