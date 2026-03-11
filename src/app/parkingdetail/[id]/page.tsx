'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Tabbar from '@/components/Tabbar';
import { hasStoredAuth } from '@/lib/auth-client';
import { Star } from 'lucide-react';

type Review = {
  score: number;
  comment: string;
  username: string;
};

type Reservation = {
  id: number;
  status: string;
  checkinTime: string | null;
  checkoutTime: string | null;
  blockedUntilTime: string | null;
};

type LotDetail = {
  id: number;
  name: string;
  address: string;
  location: string;
  description: string;
  price: number;
  totalSlot: number;
  availableSlot: number;
  ownerName: string;
  latitude: number | null;
  longitude: number | null;
  mapEmbedUrl: string | null;
  imageUrls?: string[];
};

type ParkingData = {
  lot: LotDetail;
  reservations?: Reservation[];
  reviews: Review[];
  vehicleTypes?: string[];
  rules?: string[];
};

const avatarGradients = [
  'from-[#5B7CFF] to-[#4a7bff]',
  'from-pink-500 to-rose-500',
  'from-emerald-500 to-teal-500',
  'from-purple-500 to-indigo-500',
  'from-amber-400 to-orange-500',
];
const BANGKOK_TIME_ZONE = 'Asia/Bangkok';

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) {
    return '-';
  }

  const hasDecimal = !Number.isInteger(value);
  return `${value.toLocaleString('th-TH', {
    minimumFractionDigits: hasDecimal ? 2 : 0,
    maximumFractionDigits: hasDecimal ? 2 : 0,
  })} บาท/ชม.`;
}

function formatDateTimeLabel(value: string | null): string {
  if (!value) {
    return '-';
  }

  const directDate = new Date(value);
  if (!Number.isNaN(directDate.getTime())) {
    return directDate.toLocaleString('th-TH', {
      timeZone: BANGKOK_TIME_ZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const normalizedValue = value.includes('T') ? value : value.replace(' ', 'T');
  const fallbackDate = new Date(normalizedValue);
  if (Number.isNaN(fallbackDate.getTime())) {
    return '-';
  }

  return fallbackDate.toLocaleString('th-TH', {
    timeZone: BANGKOK_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
export default function ParkingDetailPage() {
  const params = useParams();
  const rawId = params?.id;
  const lotId = Array.isArray(rawId) ? rawId[0] : rawId;

  const [data, setData] = useState<ParkingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const syncAuth = () => {
      setIsAuthenticated(hasStoredAuth());
    };

    syncAuth();
    window.addEventListener('focus', syncAuth);
    window.addEventListener('storage', syncAuth);

    return () => {
      window.removeEventListener('focus', syncAuth);
      window.removeEventListener('storage', syncAuth);
    };
  }, []);

  useEffect(() => {
    if (!lotId) {
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const response = await fetch(`/api/parking-lots/parkingdetail/${lotId}`, {
          method: 'GET',
          cache: 'no-store',
        });

        const result = (await response.json()) as ParkingData & { error?: string };

        if (!response.ok) {
          throw new Error(result.error || 'Unable to load parking details');
        }

        if (!isMounted) {
          return;
        }

        setData(result);
      } catch (fetchError) {
        if (!isMounted) {
          return;
        }

        setError(fetchError instanceof Error ? fetchError.message : 'Unable to load parking details');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [lotId]);

  const avgScore = useMemo(() => {
    const reviews = data?.reviews || [];
    if (reviews.length === 0) {
      return 0;
    }

    return reviews.reduce((sum, item) => sum + Number(item.score || 0), 0) / reviews.length;
  }, [data?.reviews]);

  const renderStars = (score: number) => {
    const rounded = Math.max(0, Math.min(5, Math.round(score)));

    return (
      <div className="flex text-sm text-yellow-400">
        {[1, 2, 3, 4, 5].map((star) => (
          <span key={star} className={star <= rounded ? '' : 'text-gray-300'}>
            ★
          </span>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Tabbar />
        <div className="flex h-[60vh] items-center justify-center text-gray-500">
          <p className="text-xl">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Tabbar />
        <div className="p-6 text-center text-red-600">เกิดข้อผิดพลาด: {error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Tabbar />
        <div className="p-6 text-center">ไม่พบข้อมูล</div>
      </div>
    );
  }

  const { lot, reviews } = data;
  const reservations = data.reservations || [];
  const vehicleTypes = data.vehicleTypes || [];
  const rules = data.rules || [];
  const canViewPrice = isAuthenticated;
  const coverImageUrl = lot.imageUrls?.[0] || null;

  return (
    <div className="relative min-h-screen bg-gray-50 pb-28">
      <Tabbar />
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-gray-600 transition-colors hover:text-[#5B7CFF]"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>กลับหน้าหลัก</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
          <div className="space-y-6">
            <div className="rounded-2xl bg-white p-6 shadow-md">
              <div className="relative h-64 overflow-hidden rounded-xl bg-slate-100">
                {coverImageUrl ? (
                  <img
                    src={coverImageUrl}
                    alt={`Parking image of ${lot.name}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : lot.mapEmbedUrl ? (
                  <iframe
                    title={`Map of ${lot.name}`}
                    src={lot.mapEmbedUrl}
                    className="h-full w-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-500">
                    Map unavailable
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-md">
              <h1 className="mb-2 text-3xl font-bold text-gray-800">{lot.name}</h1>
              <p className="mb-3 text-sm text-gray-500">{lot.address}</p>
              <div className="mb-2 flex items-center gap-2">
                {renderStars(avgScore)}
                <span className="text-sm text-gray-500">({reviews.length} รีวิว)</span>
              </div>
              <p className="text-sm text-gray-600">เจ้าของพื้นที่: {lot.ownerName}</p>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-md">
              <h2 className="mb-3 text-xl font-bold text-gray-800">รายละเอียด</h2>
              <div className="mb-4 flex flex-wrap gap-4">
                <div className="rounded-lg bg-blue-50 px-4 py-2 text-blue-700">
                  <span className="block text-xs font-semibold uppercase opacity-70">ราคา</span>
                  <span className="text-lg font-bold">
                    {canViewPrice ? formatPrice(lot.price) : 'Login to view price'}
                  </span>
                </div>
                <div className="rounded-lg bg-green-50 px-4 py-2 text-green-700">
                  <span className="block text-xs font-semibold uppercase opacity-70">ช่องจอด</span>
                  <span className="text-lg font-bold">
                    ว่าง {lot.availableSlot} / {lot.totalSlot}
                  </span>
                </div>
              </div>
              <p className="whitespace-pre-line leading-relaxed text-gray-600">
                {lot.description || 'ไม่พบรายละเอียดเพิ่มเติม'}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-md">
              <h2 className="mb-3 text-xl font-bold text-gray-800">ประเภทยานพาหนะที่รองรับ</h2>
              {vehicleTypes.length > 0 ? (
                <ul className="space-y-2">
                  {vehicleTypes.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-gray-600">
                      <span className="h-2 w-2 rounded-full bg-[#5B7CFF]"></span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">ยังไม่ได้ระบุข้อมูล</p>
              )}
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-md">
              <h2 className="mb-3 text-xl font-bold text-gray-800">กฎระเบียบ</h2>
              {rules.length > 0 ? (
                <ul className="space-y-2 text-gray-600">
                  {rules.map((rule) => (
                    <li key={rule} className="flex items-start gap-2">
                      <span className="mt-1 h-2 w-2 rounded-full bg-slate-400"></span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">ยังไม่ได้ระบุข้อมูล</p>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl bg-white p-6 shadow-md">
              <h2 className="mb-4 text-xl font-bold text-gray-800">รีวิวจากผู้ใช้งาน</h2>
              <div className="space-y-4">
                {reviews.length > 0 ? (
                  reviews.map((review, index) => (
                    <div
                      key={`${review.username}-${index}`}
                      className={`border-b border-gray-100 pb-4 ${index === reviews.length - 1 ? 'border-none pb-0' : ''}`}
                    >
                      <div className="mb-2 flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${avatarGradients[index % avatarGradients.length]} font-bold uppercase text-white`}
                        >
                          {review.username.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800">{review.username}</p>
                          {renderStars(Number(review.score || 0))}
                        </div>
                      </div>
                      <p className="text-gray-600">{review.comment}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">ยังไม่มีรีวิวสำหรับที่จอดรถนี้</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-md">
              <h2 className="mb-4 text-xl font-bold text-gray-800">Reservation List</h2>
              {reservations.length > 0 ? (
                <div className="space-y-1 text-sm text-slate-600">
                  {reservations.map((reservation) => (
                    <p key={`reservation-${reservation.id}-${reservation.checkinTime || 'none'}`}>
                      {formatDateTimeLabel(reservation.checkinTime)} -{' '}
                      {formatDateTimeLabel(reservation.blockedUntilTime || reservation.checkoutTime)}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  No reservation time in current window.
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-md">
              <h2 className="mb-4 text-xl font-bold text-gray-800">ตำแหน่งที่ตั้ง</h2>
              <div className="relative h-64 overflow-hidden rounded-xl bg-gray-100">
                {lot.mapEmbedUrl ? (
                  <iframe
                    title={`Location of ${lot.name}`}
                    src={lot.mapEmbedUrl}
                    className="h-full w-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-500">
                    ไม่พบพิกัดแผนที่
                  </div>
                )}
              </div>
              <p className="mt-3 text-sm text-gray-600">{lot.address}</p>
              {lot.latitude !== null && lot.longitude !== null ? (
                <p className="mt-1 text-xs text-gray-500">
                  พิกัด: {lot.latitude.toFixed(6)}, {lot.longitude.toFixed(6)}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {isAuthenticated ? (
        <div className="fixed bottom-0 left-0 z-50 w-full border-t border-blue-100 bg-[#EBF0FF] px-6 py-4 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <div className="text-sm text-gray-600">{lot.name}</div>
            <div className="flex flex-col items-end gap-2 md:flex-row md:items-center md:gap-6">
              <div className="text-xl font-bold text-gray-800">{formatPrice(lot.price)}</div>
              <Link
                href={`/booking/${lotId}`}
                className="rounded-lg bg-[#5B7CFF] px-10 py-3 font-bold text-white shadow-sm transition-colors hover:bg-[#4a6bef]"
              >
                จอง
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


