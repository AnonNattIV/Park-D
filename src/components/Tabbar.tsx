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
    icon: <HomeIcon className="w-6 h-6" />,
  },
  {
    id: 'owner',
    label: 'Owner',
    href: '/owner/home',
    icon: <BuildingOffice2Icon className="w-6 h-6" />,
  },
  {
    id: 'aboutme',
    label: 'About Me',
    href: '/aboutme',
    icon: <UserCircleIcon className="w-6 h-6" />,
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
    <>
      {/* Desktop Navigation - Top Sticky Bar */}
      <nav className="md:sticky md:top-0 md:z-50 md:bg-white/95 md:backdrop-blur-sm md:shadow-sm">
        <div className="hidden md:block mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
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
                <span>
                  {isAuthenticated ? 'Log Out' : 'Sign In'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md shadow-[0_-4px_20px_rgba(0,0,0,0.08)] md:hidden safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-2">
          {/* Logo on left (only on mobile) */}
          <div
            className="flex items-center gap-1 cursor-pointer group"
            onClick={() => router.push('/')}
          >
            <span className="text-lg font-bold text-[#5B7CFF] group-hover:text-[#4a6bef] transition-colors">
              Park:D
            </span>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.href)}
                className={`
                  flex flex-col items-center justify-center min-h-[44px] min-w-[44px] px-2 py-1 rounded-2xl transition-all duration-300
                  ${
                    activeTab === tab.id
                      ? 'text-[#5B7CFF] bg-[#5B7CFF]/10 scale-105'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }
                `}
              >
                {tab.icon}
                <span className="text-[10px] font-medium mt-0.5 leading-none">
                  {tab.label}
                </span>
              </button>
            ))}
          </div>

          {/* Sign In / Log Out Button (icon only on mobile) */}
          <button
            onClick={handleAuthAction}
            className={`
              flex flex-col items-center justify-center min-h-[44px] min-w-[44px] px-2 py-1 rounded-2xl transition-all duration-300
              ${
                isAuthenticated
                  ? 'text-red-500 hover:text-red-600 hover:bg-red-50'
                  : 'text-[#5B7CFF] hover:text-[#4a6bef] hover:bg-[#5B7CFF]/10'
              }
            `}
            aria-label={isAuthenticated ? 'Log Out' : 'Sign In'}
          >
            <ArrowRightOnRectangleIcon className="w-6 h-6" />
            <span className="text-[10px] font-medium mt-0.5 leading-none">
              {isAuthenticated ? 'Out' : 'In'}
            </span>
          </button>
        </div>
      </nav>

      {/* Bottom padding for mobile content to avoid being hidden by bottom nav */}
      <div className="h-16 md:hidden" />
    </>
  );
}
