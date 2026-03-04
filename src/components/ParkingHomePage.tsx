'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Tabbar from '@/components/Tabbar';
import { readStoredAuthUser, readStoredToken } from '@/lib/auth-client';

type ParkingLot = {
  id: number;
  name: string;
  address: string;
  description: string;
  available: number;
  total: number;
  price: number;
  priceLabel: string;
  image: string;
  mapEmbedUrl: string | null;
  ownerName: string;
};

type ParkingHomePageProps = {
  showPrice?: boolean;
  requireAuth?: boolean;
};

async function fetchParkingLots(locationFilter = ''): Promise<ParkingLot[]> {
  const params = new URLSearchParams();

  if (locationFilter.trim()) {
    params.set('location', locationFilter.trim());
  }

  const response = await fetch(
    `/api/parking-lots${params.toString() ? `?${params.toString()}` : ''}`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );

  const result = (await response.json()) as {
    parkingLots?: ParkingLot[];
    error?: string;
  };

  if (!response.ok) {
    throw new Error(result.error || 'Unable to load parking lots');
  }

  return result.parkingLots || [];
}

export default function ParkingHomePage({
  showPrice = true,
  requireAuth = false,
}: ParkingHomePageProps) {
  const router = useRouter();
  const [location, setLocation] = useState('');
  const [timeRange, setTimeRange] = useState('');
  const [isReady, setIsReady] = useState(!requireAuth);
  const [parkingLots, setParkingLots] = useState<ParkingLot[]>([]);
  const [isLoadingLots, setIsLoadingLots] = useState(true);
  const [lotsError, setLotsError] = useState('');

  useEffect(() => {
    if (!requireAuth) {
      return;
    }

    const token = readStoredToken();
    const user = readStoredAuthUser();

    if (!token || !user) {
      router.replace('/login');
      return;
    }

    setIsReady(true);
  }, [requireAuth, router]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    let isMounted = true;

    const loadParkingLots = async () => {
      setIsLoadingLots(true);
      setLotsError('');

      try {
        const lots = await fetchParkingLots();

        if (!isMounted) {
          return;
        }

        setParkingLots(lots);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        console.error('Unable to fetch parking lots:', error);
        setLotsError('ไม่สามารถโหลดข้อมูลที่จอดรถได้ในตอนนี้');
      } finally {
        if (isMounted) {
          setIsLoadingLots(false);
        }
      }
    };

    void loadParkingLots();

    return () => {
      isMounted = false;
    };
  }, [isReady]);

  const handleSearch = async () => {
    setIsLoadingLots(true);
    setLotsError('');

    try {
      const lots = await fetchParkingLots(location);
      setParkingLots(lots);
    } catch (error) {
      console.error('Unable to search parking lots:', error);
      setLotsError('ไม่สามารถค้นหาที่จอดรถได้ในตอนนี้');
    } finally {
      setIsLoadingLots(false);
    }
  };

  if (!isReady) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Tabbar />
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-gray-50 to-gray-100">
        <section className="relative overflow-hidden pt-16 pb-24">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-20 left-10 h-72 w-72 rounded-full bg-[#5B7CFF]/5 blur-3xl"></div>
            <div className="absolute top-40 right-20 h-96 w-96 rounded-full bg-[#4a7bff]/5 blur-3xl"></div>
          </div>

          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl">
              <div className="relative overflow-hidden rounded-[2rem] bg-white p-8 shadow-2xl md:p-10">
                <h1 className="mb-8 text-center text-3xl font-bold text-gray-800 md:text-4xl">
                  ค้นหาที่จอดเลย !
                </h1>

                <div className="space-y-4">
                  <div className="group relative">
                    <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
                      <svg
                        className="h-5 w-5 text-gray-400 transition-colors group-focus-within:text-[#5B7CFF]"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="ต้องการจอดที่ไหน ?"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="w-full rounded-2xl bg-gray-50 py-4 pl-12 pr-4 text-gray-700 placeholder-gray-400 transition-all duration-300
                        focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#5B7CFF] focus:shadow-lg"
                    />
                  </div>

                  <div className="group relative">
                    <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
                      <svg
                        className="h-5 w-5 text-gray-400 transition-colors group-focus-within:text-[#5B7CFF]"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="ช่วงเวลาไหน ?"
                      value={timeRange}
                      onChange={(e) => setTimeRange(e.target.value)}
                      className="w-full rounded-2xl bg-gray-50 py-4 pl-12 pr-4 text-gray-700 placeholder-gray-400 transition-all duration-300
                        focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#5B7CFF] focus:shadow-lg"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      void handleSearch();
                    }}
                    disabled={isLoadingLots}
                    className="flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-[#5B7CFF] to-[#4a7bff] py-4 font-bold text-white
                      transition-all duration-300 hover:scale-[1.02] hover:shadow-xl active:scale-95
                      disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
                  >
                    <svg
                      className="h-6 w-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    <span>{isLoadingLots ? 'กำลังโหลด...' : 'ค้นหา'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h2 className="mb-2 text-2xl font-bold text-gray-800">Suggestions</h2>
            <p className="text-gray-500">ที่จอดรถยอดนิยมใกล้คุณ</p>
          </div>

          {lotsError ? (
            <div className="rounded-3xl border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-700">
              {lotsError}
            </div>
          ) : null}

          {!lotsError && !isLoadingLots && parkingLots.length === 0 ? (
            <div className="rounded-3xl bg-white px-6 py-8 text-center text-gray-500 shadow-lg">
              ยังไม่มีที่จอดรถที่พร้อมใช้งาน
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {parkingLots.map((lot) => (
              <Link
                key={lot.id}
                href={`/parkingdetail/${lot.id}`}
                className="group cursor-pointer overflow-hidden rounded-3xl bg-white shadow-lg transition-all duration-300
                  hover:shadow-xl hover:scale-[1.02]"
              >
                <div className="relative h-48 overflow-hidden bg-gradient-to-br from-[#5B7CFF] to-[#4a7bff]">
                  {lot.mapEmbedUrl ? (
                    <iframe
                      title={`Map of ${lot.name}`}
                      src={lot.mapEmbedUrl}
                      className="h-full w-full border-0 pointer-events-none"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <span className="text-7xl transition-transform duration-300 group-hover:scale-110">
                        {lot.image}
                      </span>
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-900/25 via-transparent to-white/10"></div>
                  <div className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur-sm">
                    {lot.mapEmbedUrl ? 'OpenStreetMap' : 'Map Unavailable'}
                  </div>
                  {showPrice ? (
                    <div className="absolute right-4 top-4 rounded-full bg-white/90 px-4 py-2 shadow-md backdrop-blur-sm">
                      <span className="text-sm font-semibold text-[#5B7CFF]">{lot.priceLabel}</span>
                    </div>
                  ) : null}
                </div>

                <div className="p-6">
                  <h3 className="mb-2 text-xl font-bold text-gray-800 transition-colors group-hover:text-[#5B7CFF]">
                    {lot.name}
                  </h3>
                  <p className="mb-3 flex items-center gap-2 text-gray-500">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    {lot.address}
                  </p>
                  <p className="mb-4 text-sm text-gray-500">{lot.description}</p>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
                      <span className="text-sm text-gray-600">
                        ว่าง <span className="font-bold text-gray-800">{lot.available}</span> / {lot.total}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="rounded-xl bg-[#5B7CFF] px-5 py-2 font-medium text-white transition-all duration-300
                        hover:bg-[#4a6bef] hover:shadow-md"
                    >
                      จองเลย
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
