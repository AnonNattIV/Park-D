'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Tabbar from '@/components/Tabbar';
import {
  clearStoredAuth,
  readStoredAuthUser,
  readStoredToken,
} from '@/lib/auth-client';
import {
  addBangkokDuration,
  formatBangkokDateTimeLocalInput,
  parseBangkokDateTimeInput,
} from '@/lib/time-bangkok';

type BookingLotDetail = {
  id: number;
  name: string;
  address: string;
  price: number;
  totalSlot: number;
  availableSlot: number;
  latitude: number | null;
  longitude: number | null;
  mapEmbedUrl: string | null;
};

type ParkingDetailResponse = {
  lot: BookingLotDetail;
  error?: string;
};

type BookingCreateResponse = {
  success?: boolean;
  message?: string;
  error?: string;
  booking?: {
    id: number;
    rentAmount: number;
    estimatedTotal: number;
  };
};

type DurationUnit = 'HOUR' | 'DAY' | 'MONTH';
const MIN_CHECKIN_LEAD_TIME_MS = 15 * 60 * 1000;

function getCurrentMinuteEpoch(): number {
  return Math.floor(Date.now() / 60000) * 60000;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) {
    return '-';
  }

  const hasDecimal = !Number.isInteger(value);
  return value.toLocaleString('th-TH', {
    minimumFractionDigits: hasDecimal ? 2 : 0,
    maximumFractionDigits: hasDecimal ? 2 : 0,
  });
}

export default function BookingPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = params?.id;
  const lotIdParam = Array.isArray(rawId) ? rawId[0] : rawId;

  const [token, setToken] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [lot, setLot] = useState<BookingLotDetail | null>(null);
  const [isLoadingLot, setIsLoadingLot] = useState(true);
  const [lotError, setLotError] = useState('');

  const [plateId, setPlateId] = useState('');
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [checkinDatetime, setCheckinDatetime] = useState('');
  const [checkoutDatetime, setCheckoutDatetime] = useState('');
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('HOUR');
  const [durationAmount, setDurationAmount] = useState(1);
  const [minimumDateTime, setMinimumDateTime] = useState('');

  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const storedToken = readStoredToken();
    const storedUser = readStoredAuthUser();

    if (!storedToken || !storedUser) {
      router.replace('/login');
      return;
    }

    setToken(storedToken);
    setIsReady(true);

    const minimumCheckinEpoch = getCurrentMinuteEpoch() + MIN_CHECKIN_LEAD_TIME_MS;
    setMinimumDateTime(formatBangkokDateTimeLocalInput(minimumCheckinEpoch));
    setCheckinDatetime(formatBangkokDateTimeLocalInput(minimumCheckinEpoch));
  }, [router]);

  useEffect(() => {
    if (!isReady || !lotIdParam) {
      return;
    }

    let isMounted = true;
    setIsLoadingLot(true);
    setLotError('');

    const loadLot = async () => {
      try {
        const response = await fetch(`/api/parking-lots/parkingdetail/${lotIdParam}`, {
          method: 'GET',
          cache: 'no-store',
        });

        const result = (await response.json()) as ParkingDetailResponse;

        if (!response.ok) {
          throw new Error(result.error || 'Unable to load parking lot data');
        }

        if (!isMounted) {
          return;
        }

        setLot(result.lot);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setLotError(error instanceof Error ? error.message : 'Unable to load parking lot data');
      } finally {
        if (isMounted) {
          setIsLoadingLot(false);
        }
      }
    };

    void loadLot();

    return () => {
      isMounted = false;
    };
  }, [isReady, lotIdParam]);

  useEffect(() => {
    if (!checkinDatetime) {
      return;
    }

    const parsedCheckin = parseBangkokDateTimeInput(checkinDatetime);
    if (!parsedCheckin) {
      return;
    }

    const computedCheckoutEpoch = addBangkokDuration(
      parsedCheckin.comparableTime,
      durationUnit,
      durationAmount
    );
    setCheckoutDatetime(formatBangkokDateTimeLocalInput(computedCheckoutEpoch));
  }, [checkinDatetime, durationAmount, durationUnit]);

  const durationMinutes = useMemo(() => {
    if (!checkinDatetime || !checkoutDatetime) {
      return 0;
    }

    const checkin = parseBangkokDateTimeInput(checkinDatetime);
    const checkout = parseBangkokDateTimeInput(checkoutDatetime);
    if (!checkin || !checkout) {
      return 0;
    }

    const diff = Math.floor((checkout.comparableTime - checkin.comparableTime) / 60000);
    return diff > 0 ? diff : 0;
  }, [checkinDatetime, checkoutDatetime]);

  const estimatedRent = useMemo(() => {
    if (!lot || durationMinutes <= 0) {
      return 0;
    }

    return Number(((durationMinutes / 60) * lot.price).toFixed(2));
  }, [lot, durationMinutes]);

  const estimatedDeposit = useMemo(
    () => Number((estimatedRent * 0.5).toFixed(2)),
    [estimatedRent]
  );

  const estimatedTotal = useMemo(
    () => Number((estimatedRent * 1.5).toFixed(2)),
    [estimatedRent]
  );

  const isTimeInvalid = durationMinutes <= 0;
  const isFormInvalid = isTimeInvalid;

  const handleSubmit = async () => {
    if (!token || !lot || !lotIdParam) {
      return;
    }

    const normalizedPlateId = plateId.trim().toUpperCase();
    const normalizedBrand = vehicleBrand.trim();
    const normalizedModel = vehicleModel.trim();

    if (!normalizedPlateId) {
      setSubmitError('Please enter plate number');
      return;
    }

    if (!checkinDatetime || !checkoutDatetime) {
      setSubmitError('Please set check-in and check-out time');
      return;
    }

    if (!Number.isInteger(durationAmount) || durationAmount <= 0) {
      setSubmitError('Duration amount must be a positive integer');
      return;
    }

    const checkin = parseBangkokDateTimeInput(checkinDatetime);
    const checkout = parseBangkokDateTimeInput(checkoutDatetime);

    if (!checkin || !checkout) {
      setSubmitError('Invalid date-time format');
      return;
    }

    if (checkout.comparableTime <= checkin.comparableTime) {
      setSubmitError('Check-out must be later than check-in');
      return;
    }

    const minimumCheckinEpoch = getCurrentMinuteEpoch() + MIN_CHECKIN_LEAD_TIME_MS;
    if (checkin.comparableTime < minimumCheckinEpoch) {
      setSubmitError('Check-in time must be at least 15 minutes from now');
      return;
    }

    setSubmitError('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          lotId: Number(lotIdParam),
          plateId: normalizedPlateId,
          vehicleBrand: normalizedBrand,
          vehicleModel: normalizedModel,
          checkinDatetime,
          checkoutDatetime,
        }),
      });

      const result = (await response.json()) as BookingCreateResponse;

      if (response.status === 401) {
        clearStoredAuth();
        router.replace('/login');
        return;
      }

      if (!response.ok || !result.booking?.id) {
        throw new Error(result.error || 'Unable to create booking right now');
      }

      router.push(`/booking-history/${result.booking.id}`);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Unable to create booking right now'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isReady || isLoadingLot) {
    return (
      <div className="min-h-screen bg-white pb-28">
        <Tabbar />
        <div className="mx-auto max-w-5xl p-6 text-center text-gray-500">Loading...</div>
      </div>
    );
  }

  if (lotError || !lot) {
    return (
      <div className="min-h-screen bg-white pb-28">
        <Tabbar />
        <div className="mx-auto max-w-5xl p-6 text-center text-red-600">
          {lotError || 'Parking lot not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-white pb-28">
      <Tabbar />

      <div className="mx-auto max-w-5xl p-6">
        <div className="mb-8">
          <Link
            href={`/parkingdetail/${lotIdParam}`}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-gray-800 text-gray-800 transition-colors hover:bg-gray-100"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
          <div className="space-y-10">
            <section>
              <h2 className="mb-4 text-2xl font-bold text-gray-900">Summary booking</h2>
              <div className="rounded-3xl bg-[#F3F4F6] p-8">
                <h3 className="mb-1 text-2xl font-bold text-gray-900">{lot.name}</h3>
                <p className="mb-4 text-gray-600">{lot.address}</p>
                <ul className="list-inside list-disc space-y-2 text-gray-700 marker:text-gray-400">
                  <li>
                    {lot.latitude !== null && lot.longitude !== null
                      ? `${lot.latitude.toFixed(6)}, ${lot.longitude.toFixed(6)}`
                      : 'No coordinates available'}
                  </li>
                  <li>Price: {formatPrice(lot.price)} THB/hr</li>
                  <li>
                    Available: {lot.availableSlot} / {lot.totalSlot}
                  </li>
                  <li>Duration: {durationMinutes > 0 ? `${durationMinutes} min` : '-'}</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-bold text-gray-900">Vehicle Information</h2>
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block font-medium text-gray-900">Plate Number *</label>
                  <input
                    type="text"
                    value={plateId}
                    onChange={(e) => setPlateId(e.target.value)}
                    className="w-full rounded-2xl bg-[#F3F4F6] px-5 py-4 text-gray-900 transition-all focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]"
                    placeholder="AA 1234"
                  />
                </div>
                <div>
                  <label className="mb-2 block font-medium text-gray-900">Brand (optional)</label>
                  <input
                    type="text"
                    value={vehicleBrand}
                    onChange={(e) => setVehicleBrand(e.target.value)}
                    className="w-full rounded-2xl bg-[#F3F4F6] px-5 py-4 text-gray-900 transition-all focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]"
                    placeholder="Toyota"
                  />
                </div>
                <div>
                  <label className="mb-2 block font-medium text-gray-900">Model (optional)</label>
                  <input
                    type="text"
                    value={vehicleModel}
                    onChange={(e) => setVehicleModel(e.target.value)}
                    className="w-full rounded-2xl bg-[#F3F4F6] px-5 py-4 text-gray-900 transition-all focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]"
                    placeholder="Yaris"
                  />
                </div>
              </div>
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-bold text-gray-900">Booking Time</h2>
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block font-medium text-gray-900">Check-in *</label>
                  <input
                    type="datetime-local"
                    value={checkinDatetime}
                    onChange={(e) => setCheckinDatetime(e.target.value)}
                    min={minimumDateTime || undefined}
                    className="w-full rounded-2xl bg-[#F3F4F6] px-5 py-4 text-gray-900 transition-all focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block font-medium text-gray-900">Duration *</label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={durationAmount}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        setDurationAmount(
                          Number.isFinite(nextValue) ? Math.max(1, Math.floor(nextValue)) : 1
                        );
                      }}
                      className="w-full rounded-2xl bg-[#F3F4F6] px-5 py-4 text-gray-900 transition-all focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block font-medium text-gray-900">Unit *</label>
                    <select
                      value={durationUnit}
                      onChange={(event) => setDurationUnit(event.target.value as DurationUnit)}
                      className="w-full rounded-2xl bg-[#F3F4F6] px-5 py-4 text-gray-900 transition-all focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]"
                    >
                      <option value="HOUR">Hour</option>
                      <option value="DAY">Day</option>
                      <option value="MONTH">Month</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-2 block font-medium text-gray-900">Check-out *</label>
                  <input
                    type="datetime-local"
                    value={checkoutDatetime}
                    readOnly
                    className="w-full rounded-2xl bg-[#F3F4F6] px-5 py-4 text-gray-900 transition-all focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]"
                  />
                </div>
              </div>
            </section>
          </div>

          <div>
            <section>
              <h2 className="mb-4 text-2xl font-bold text-gray-900">Payment Step</h2>
              <div className="rounded-3xl bg-[#F3F4F6] p-8">
                <p className="text-sm text-gray-600">
                  After confirming this booking, you will go to booking history detail page to upload payment proof.
                </p>
                <p className="mt-2 text-sm text-gray-600">
                  Unpaid booking without submitted payment will be held temporarily and cancelled automatically after 10 minutes.
                </p>
                <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                  <p className="font-semibold">Payment formula</p>
                  <p className="mt-1">Rent = (Duration in hours) x Price per hour</p>
                  <p>Deposit = 50% of Rent</p>
                  <p className="font-semibold">Total now = Rent + Deposit</p>
                </div>
              </div>
            </section>

            {submitError ? (
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {submitError}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 z-50 w-full bg-[#E5EEFF] py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6">
          <div className="space-y-1 text-right">
            <div className="text-xs font-medium text-gray-500">
              Rent: {formatPrice(isTimeInvalid ? 0 : estimatedRent)} THB
            </div>
            <div className="text-xs font-medium text-gray-500">
              Deposit (50%): {formatPrice(isTimeInvalid ? 0 : estimatedDeposit)} THB
            </div>
            <div className="text-lg font-bold text-gray-800">
              Total (Rent + 50%): {formatPrice(isTimeInvalid ? 0 : estimatedTotal)} THB
            </div>
          </div>
          <button
            onClick={() => {
              void handleSubmit();
            }}
            disabled={isSubmitting || isFormInvalid}
            className="w-80 rounded-xl bg-[#4D94FF] py-3.5 text-center text-lg font-bold text-white shadow-sm transition-colors hover:bg-[#3A7EE6] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Saving...' : 'Confirm Booking'}
          </button>
        </div>
      </div>
    </div>
  );
}
