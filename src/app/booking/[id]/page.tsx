'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
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

type PaymentCreateResponse = {
  success?: boolean;
  message?: string;
  error?: string;
  payment?: {
    id: number;
    bookingId: number;
    status: string;
    method: string;
    amount: number;
    rentAmount?: number;
    ownerIncome?: number;
    proofUrl: string;
  };
};

type DurationUnit = 'HOUR' | 'DAY' | 'MONTH';

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
  const [durationAmount, setDurationAmount] = useState(2);
  const [minimumDateTime, setMinimumDateTime] = useState('');
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [paymentProofName, setPaymentProofName] = useState('');
  const [createdBookingId, setCreatedBookingId] = useState<number | null>(null);

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

    const now = new Date();
    const defaultCheckinEpoch = now.getTime();

    setMinimumDateTime(formatBangkokDateTimeLocalInput(now));
    setCheckinDatetime(formatBangkokDateTimeLocalInput(defaultCheckinEpoch));
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

  useEffect(() => {
    if (createdBookingId === null) {
      return;
    }

    setCreatedBookingId(null);
    // Reset retry booking id when booking inputs are changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    plateId,
    vehicleBrand,
    vehicleModel,
    checkinDatetime,
    checkoutDatetime,
    durationAmount,
    durationUnit,
    lotIdParam,
  ]);

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

  const estimatedTotal = useMemo(() => Number((estimatedRent * 1.5).toFixed(2)), [estimatedRent]);
  const isTimeInvalid = durationMinutes <= 0;
  const isFormInvalid = isTimeInvalid;

  const handlePaymentProofChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setPaymentProofFile(file);
    setPaymentProofName(file?.name || '');
  };

  const submitPaymentForBooking = async (bookingId: number) => {
    if (!token) {
      return;
    }

    if (!paymentProofFile) {
      throw new Error('กรุณาอัปโหลดหลักฐานการชำระเงิน');
    }

    const formData = new FormData();
    formData.append('bookingId', String(bookingId));
    formData.append('payMethod', 'QR_TRANSFER');
    formData.append('proof', paymentProofFile);

    const response = await fetch('/api/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const result = (await response.json()) as PaymentCreateResponse;

    if (response.status === 401) {
      clearStoredAuth();
      router.replace('/login');
      return;
    }

    if (!response.ok) {
      throw new Error(result.error || 'ไม่สามารถยืนยันการชำระเงินได้ในขณะนี้');
    }

    setCreatedBookingId(null);
    alert(result.message || 'ส่งหลักฐานการชำระเงินเรียบร้อยแล้ว');
    router.push('/aboutme');
  };

  const handleSubmit = async () => {
    if (!token || !lot || !lotIdParam) {
      return;
    }

    const normalizedPlateId = plateId.trim().toUpperCase();
    const normalizedBrand = vehicleBrand.trim();
    const normalizedModel = vehicleModel.trim();

    if (!normalizedPlateId) {
      setSubmitError('กรุณากรอกทะเบียนรถ');
      return;
    }

    if (!paymentProofFile) {
      setSubmitError('กรุณาอัปโหลดหลักฐานการชำระเงิน');
      return;
    }

    if (!checkinDatetime || !checkoutDatetime) {
      setSubmitError('กรุณาระบุเวลาเข้าและเวลาออก');
      return;
    }

    if (!Number.isInteger(durationAmount) || durationAmount <= 0) {
      setSubmitError('Duration amount must be a positive integer');
      return;
    }

    const checkin = parseBangkokDateTimeInput(checkinDatetime);
    const checkout = parseBangkokDateTimeInput(checkoutDatetime);

    if (!checkin || !checkout) {
      setSubmitError('รูปแบบวันเวลาไม่ถูกต้อง');
      return;
    }

    if (checkout.comparableTime <= checkin.comparableTime) {
      setSubmitError('เวลาออกต้องมากกว่าเวลาเข้า');
      return;
    }

    setSubmitError('');
    setIsSubmitting(true);

    try {
      let bookingId = createdBookingId;

      if (!bookingId) {
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
          throw new Error(result.error || 'ไม่สามารถสร้างการจองได้ในขณะนี้');
        }

        bookingId = result.booking.id;
        setCreatedBookingId(bookingId);
      }

      await submitPaymentForBooking(bookingId);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'ไม่สามารถยืนยันการชำระเงินได้ในขณะนี้'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isReady || isLoadingLot) {
    return (
      <div className="min-h-screen bg-white pb-28">
        <Tabbar />
        <div className="mx-auto max-w-5xl p-6 text-center text-gray-500">กำลังโหลด...</div>
      </div>
    );
  }

  if (lotError || !lot) {
    return (
      <div className="min-h-screen bg-white pb-28">
        <Tabbar />
        <div className="mx-auto max-w-5xl p-6 text-center text-red-600">
          {lotError || 'ไม่พบข้อมูลที่จอดรถ'}
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
                  <li>ราคา: {formatPrice(lot.price)} บาท/ชม.</li>
                  <li>
                    ที่ว่าง: {lot.availableSlot} / {lot.totalSlot}
                  </li>
                  <li>เวลาจอง: {durationMinutes > 0 ? `${durationMinutes} นาที` : '-'}</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-bold text-gray-900">Vehicle Information</h2>
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block font-medium text-gray-900">ทะเบียนรถ *</label>
                  <input
                    type="text"
                    value={plateId}
                    onChange={(e) => setPlateId(e.target.value)}
                    className="w-full rounded-2xl bg-[#F3F4F6] px-5 py-4 text-gray-900 transition-all focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]"
                    placeholder="กข 1234"
                  />
                </div>
                <div>
                  <label className="mb-2 block font-medium text-gray-900">ยี่ห้อ (ไม่บังคับ)</label>
                  <input
                    type="text"
                    value={vehicleBrand}
                    onChange={(e) => setVehicleBrand(e.target.value)}
                    className="w-full rounded-2xl bg-[#F3F4F6] px-5 py-4 text-gray-900 transition-all focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]"
                    placeholder="Toyota"
                  />
                </div>
                <div>
                  <label className="mb-2 block font-medium text-gray-900">รุ่น (ไม่บังคับ)</label>
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
                        setDurationAmount(Number.isFinite(nextValue) ? Math.max(1, Math.floor(nextValue)) : 1);
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
              <h2 className="mb-4 text-2xl font-bold text-gray-900">Payment Method</h2>
              <div className="rounded-3xl bg-[#F3F4F6] p-8">
                <div className="flex items-center gap-6">
                  <div className="h-28 w-28 flex-shrink-0 rounded-xl bg-[#D1D5DB]"></div>
                  <div className="text-xl font-bold leading-tight text-gray-900">
                    Scan QR Code
                    <br />
                    to pay
                  </div>
                </div>
                <p className="mt-4 text-sm text-gray-500">
                  Confirm to create booking and submit real payment record.
                </p>
                <div className="mt-4">
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    หลักฐานการชำระเงิน *
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePaymentProofChange}
                    className="block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-[#5B7CFF] file:px-4 file:py-2 file:font-medium file:text-white hover:file:bg-[#4a6bef]"
                  />
                  {paymentProofName ? (
                    <p className="mt-2 text-xs text-gray-500">ไฟล์ที่เลือก: {paymentProofName}</p>
                  ) : (
                    <p className="mt-2 text-xs text-gray-500">รองรับเฉพาะไฟล์รูปภาพ ไม่เกิน 5 MB</p>
                  )}
                </div>
                {createdBookingId ? (
                  <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    มีรายการจองที่สร้างแล้ว (#{createdBookingId}) หากชำระเงินไม่สำเร็จสามารถกดยืนยันอีกครั้งเพื่อส่งหลักฐานใหม่ได้
                  </p>
                ) : null}
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
            {isSubmitting ? 'กำลังบันทึก...' : 'ยืนยันการชำระ'}
          </button>
        </div>
      </div>
    </div>
  );
}
