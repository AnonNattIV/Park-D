'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Tabbar from '@/components/Tabbar';
import { readStoredAuthUser, readStoredToken } from '@/lib/auth-client';

type ParkingLotSystemRow = {
  id: number;
  name: string;
  addressLine: string;
  streetNumber: string;
  district: string;
  amphoe: string;
  subdistrict: string;
  province: string;
  total: number;
  price: number;
  priceLabel: string;
  status: string;
  ownerName: string;
  latitude: number | null;
  longitude: number | null;
};

export default function OwnerPage() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [token, setToken] = useState('');
  const [parkingLots, setParkingLots] = useState<ParkingLotSystemRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const storedToken = readStoredToken();
    const storedUser = readStoredAuthUser();

    if (!storedToken || !storedUser) {
      router.replace('/login');
      return;
    }

    const role = storedUser.role?.toLowerCase();

    if (role !== 'owner' && role !== 'admin') {
      router.replace('/user/home');
      return;
    }

    setToken(storedToken);
    setIsReady(true);
  }, [router]);

  useEffect(() => {
    if (!isReady || !token) {
      return;
    }

    let isMounted = true;

    const loadParkingLotSystem = async () => {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const response = await fetch('/api/parking-lots/system', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
        });

        const result = (await response.json()) as {
          parkingLots?: ParkingLotSystemRow[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(result.error || 'Unable to load parking lot system');
        }

        if (!isMounted) {
          return;
        }

        setParkingLots(result.parkingLots || []);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        console.error('Unable to load parking lot system:', error);
        setErrorMessage('ไม่สามารถโหลดระบบจัดการที่จอดรถได้ในตอนนี้');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadParkingLotSystem();

    return () => {
      isMounted = false;
    };
  }, [isReady, token]);

  if (!isReady) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Tabbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-xl">
          <p className="text-sm uppercase tracking-[0.25em] text-slate-300">
            Parkinglot System
          </p>
          <h1 className="mt-2 text-3xl font-bold">Owner Parking Lots</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">
            ตารางนี้ใช้ข้อมูลที่อยู่จากตาราง parking_lots โดยตรง โดยแยกเป็น ที่อยู่, เลขที่, เขต, อำเภอ, ตำบล และ จังหวัด
          </p>
        </div>

        {errorMessage ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {!errorMessage && !isLoading && parkingLots.length === 0 ? (
          <div className="rounded-2xl bg-white px-5 py-8 text-center text-gray-500 shadow-sm">
            ยังไม่มีข้อมูลลานจอดรถในระบบ
          </div>
        ) : null}

        <div className="overflow-hidden rounded-3xl bg-white shadow-xl">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-100 text-left text-sm font-semibold text-slate-700">
                <tr>
                  <th className="px-4 py-3">ชื่อที่จอด</th>
                  <th className="px-4 py-3">ที่อยู่</th>
                  <th className="px-4 py-3">เลขที่</th>
                  <th className="px-4 py-3">เขต</th>
                  <th className="px-4 py-3">อำเภอ</th>
                  <th className="px-4 py-3">ตำบล</th>
                  <th className="px-4 py-3">จังหวัด</th>
                  <th className="px-4 py-3">พิกัด</th>
                  <th className="px-4 py-3">ช่องจอด</th>
                  <th className="px-4 py-3">ราคา</th>
                  <th className="px-4 py-3">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-sm text-slate-600">
                {isLoading ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={11}>
                      กำลังโหลดข้อมูลลานจอดรถ...
                    </td>
                  </tr>
                ) : (
                  parkingLots.map((lot) => (
                    <tr key={lot.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4 font-semibold text-slate-800">{lot.name}</td>
                      <td className="px-4 py-4">{lot.addressLine}</td>
                      <td className="px-4 py-4">{lot.streetNumber}</td>
                      <td className="px-4 py-4">{lot.district}</td>
                      <td className="px-4 py-4">{lot.amphoe}</td>
                      <td className="px-4 py-4">{lot.subdistrict}</td>
                      <td className="px-4 py-4">{lot.province}</td>
                      <td className="px-4 py-4">
                        {lot.latitude !== null && lot.longitude !== null
                          ? `${lot.latitude.toFixed(5)}, ${lot.longitude.toFixed(5)}`
                          : '-'}
                      </td>
                      <td className="px-4 py-4">{lot.total}</td>
                      <td className="px-4 py-4">{lot.priceLabel}</td>
                      <td className="px-4 py-4">
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                          {lot.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
