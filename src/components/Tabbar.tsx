'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { HomeIcon, BuildingOffice2Icon, UserCircleIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';
import {
  AUTH_STATE_CHANGE_EVENT,
  clearStoredAuth,
  hasStoredAuth,
} from '@/lib/auth-client';

type TabType = 'home' | 'owner' | 'aboutme';

const tabs: { id: TabType; label: string; href: string; icon: React.ReactNode }[] = [
  {
    id: 'home',
    label: 'Home',
    href: '/',
    icon: <HomeIcon className="w-5 h-5" />,
  },
  {
    id: 'owner',
    label: 'Owner',
    href: '/owner/home',
    icon: <BuildingOffice2Icon className="w-5 h-5" />,
  },
  {
    id: 'aboutme',
    label: 'About Me',
    href: '/aboutme',
    icon: <UserCircleIcon className="w-5 h-5" />,
  },
];

export default function Tabbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const showNavigationTabs = pathname !== '/' || isAuthenticated;

  useEffect(() => {
    const syncAuthState = () => {
      setIsAuthenticated(hasStoredAuth());
    };

    syncAuthState();

    window.addEventListener(AUTH_STATE_CHANGE_EVENT, syncAuthState);
    window.addEventListener('focus', syncAuthState);

    return () => {
      window.removeEventListener(AUTH_STATE_CHANGE_EVENT, syncAuthState);
      window.removeEventListener('focus', syncAuthState);
    };
  }, []);

  const getActiveTab = (): TabType => {
    if (pathname === '/' || pathname === '/user/home') return 'home';
    if (pathname === '/owner' || pathname.startsWith('/owner')) return 'owner';
    if (pathname === '/aboutme') return 'aboutme';
    return 'home';
  };

  const activeTab = getActiveTab();

  const handleTabClick = (href: string) => {
    router.push(href);
  };

  const handleAuthAction = () => {
    if (isAuthenticated) {
      clearStoredAuth();
      setIsAuthenticated(false);
      router.replace('/');
      return;
    }

    router.push('/login');
  };

  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div
            className="flex items-center gap-2 cursor-pointer group"
            onClick={() => router.push('/')}
          >
            <span className="text-2xl font-bold text-[#5B7CFF] group-hover:text-[#4a6bef] transition-colors">
              Park:D
            </span>
          </div>

          {/* Menu Tabs + Auth Action */}
          <div className="flex items-center gap-2">
            {/* Tabs */}
            {showNavigationTabs ? (
              <div className="flex items-center gap-1 bg-gray-100 rounded-full px-1.5 py-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => handleTabClick(tab.href)}
                    className={`
                      flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300
                      ${
                        activeTab === tab.id
                          ? 'bg-white text-[#5B7CFF] shadow-md'
                          : 'text-gray-600 hover:text-gray-800 hover:bg-gray-200/50'
                      }
                    `}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {/* Sign In / Log Out Button */}
            <button
              onClick={handleAuthAction}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white transition-all duration-300 ${
                isAuthenticated
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-[#5B7CFF] hover:bg-[#4a6bef]'
              }`}
            >
              <ArrowRightOnRectangleIcon className="w-5 h-5" />
              <span className="hidden sm:inline">
                {isAuthenticated ? 'Log Out' : 'Sign In'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
