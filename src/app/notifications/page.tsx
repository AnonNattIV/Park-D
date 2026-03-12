'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Tabbar from '@/components/Tabbar';
import { clearStoredAuth, readStoredAuthUser, readStoredToken } from '@/lib/auth-client';

type NotificationItem = {
  id: number;
  type: string;
  title: string;
  message: string;
  actionUrl: string | null;
  isRead: boolean;
  createdAt: Date | string;
  readAt: Date | string | null;
};

type NotificationsResponse = {
  success?: boolean;
  error?: string;
  unreadCount?: number;
  updatedCount?: number;
  notifications?: NotificationItem[];
};

function formatBangkokDateTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NotificationsPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    const storedToken = readStoredToken();
    const storedUser = readStoredAuthUser();

    if (!storedToken || !storedUser) {
      router.replace('/login');
      return;
    }

    setToken(storedToken);
    setIsReady(true);
  }, [router]);

  const loadNotifications = useCallback(async () => {
    if (!token) {
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const response = await fetch('/api/notifications?limit=100', {
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

      const result = (await response.json()) as NotificationsResponse;
      if (!response.ok) {
        throw new Error(result.error || 'Unable to load notifications');
      }

      setNotifications(result.notifications || []);
      setUnreadCount(Number(result.unreadCount || 0));
    } catch (error) {
      console.error('Unable to load notifications:', error);
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to load notifications right now.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [router, token]);

  useEffect(() => {
    if (!isReady || !token) {
      return;
    }

    void loadNotifications();
  }, [isReady, loadNotifications, token]);

  const handleMarkAllRead = async () => {
    if (!token) {
      return;
    }

    setIsMarkingAll(true);
    setErrorMessage('');

    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'MARK_ALL_READ' }),
      });

      if (response.status === 401) {
        clearStoredAuth();
        router.replace('/login');
        return;
      }

      const result = (await response.json()) as NotificationsResponse;
      if (!response.ok) {
        throw new Error(result.error || 'Unable to mark notifications as read');
      }

      setUnreadCount(Number(result.unreadCount || 0));
      setNotifications((previous) =>
        previous.map((item) => ({
          ...item,
          isRead: true,
        }))
      );
    } catch (error) {
      console.error('Unable to mark notifications as read:', error);
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to mark notifications as read right now.'
      );
    } finally {
      setIsMarkingAll(false);
    }
  };

  const handleMarkOneRead = async (notificationId: number) => {
    if (!token) {
      return;
    }

    try {
      const response = await fetch(`/api/notifications/${notificationId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        clearStoredAuth();
        router.replace('/login');
        return;
      }

      const result = (await response.json()) as NotificationsResponse;
      if (!response.ok) {
        throw new Error(result.error || 'Unable to mark notification as read');
      }

      setUnreadCount(Number(result.unreadCount || 0));
      setNotifications((previous) =>
        previous.map((item) =>
          item.id === notificationId
            ? {
                ...item,
                isRead: true,
              }
            : item
        )
      );
    } catch (error) {
      console.error('Unable to mark notification as read:', error);
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to mark notification as read right now.'
      );
    }
  };

  const unreadLabel = useMemo(
    () => `${unreadCount.toLocaleString('en-US')} unread`,
    [unreadCount]
  );

  if (!isReady) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Tabbar />
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
              <p className="mt-1 text-sm text-slate-500">{unreadLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                void handleMarkAllRead();
              }}
              disabled={isMarkingAll || unreadCount === 0}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isMarkingAll ? 'Updating...' : 'Mark all as read'}
            </button>
          </div>

          {errorMessage ? (
            <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          {isLoading ? (
            <p className="text-sm text-slate-500">Loading notifications...</p>
          ) : notifications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              No notifications yet.
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`rounded-2xl border p-4 ${
                    notification.isRead
                      ? 'border-slate-200 bg-white'
                      : 'border-blue-200 bg-blue-50/50'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">{notification.title}</h2>
                      <p className="mt-1 text-sm text-slate-600">{notification.message}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        {formatBangkokDateTime(notification.createdAt)}
                      </p>
                    </div>
                    {!notification.isRead ? (
                      <button
                        type="button"
                        onClick={() => {
                          void handleMarkOneRead(notification.id);
                        }}
                        className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
                      >
                        Mark read
                      </button>
                    ) : (
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                        Read
                      </span>
                    )}
                  </div>

                  {notification.actionUrl ? (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (!notification.isRead) {
                            void handleMarkOneRead(notification.id);
                          }
                          router.push(notification.actionUrl as string);
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Open
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

