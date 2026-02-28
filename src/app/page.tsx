'use client';

import { useEffect, useState } from 'react';
import ParkingHomePage from '@/components/ParkingHomePage';
import { AUTH_STATE_CHANGE_EVENT, hasStoredAuth } from '@/lib/auth-client';

export default function RootPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const syncAuthState = () => {
      setIsAuthenticated(hasStoredAuth());
    };

    syncAuthState();

    window.addEventListener(AUTH_STATE_CHANGE_EVENT, syncAuthState);
    window.addEventListener('focus', syncAuthState);
    window.addEventListener('storage', syncAuthState);

    return () => {
      window.removeEventListener(AUTH_STATE_CHANGE_EVENT, syncAuthState);
      window.removeEventListener('focus', syncAuthState);
      window.removeEventListener('storage', syncAuthState);
    };
  }, []);

  return <ParkingHomePage showPrice={isAuthenticated} />;
}
