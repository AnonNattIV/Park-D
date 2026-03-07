'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import Tabbar from '@/components/Tabbar';
import ParkingImageUploader from '@/components/ParkingImageUploader';
import MapCoordinatePicker from '@/components/MapCoordinatePicker';
import {
  clearStoredAuth,
  readStoredAuthUser,
  readStoredToken,
} from '@/lib/auth-client';

interface ParkingForm {
  name: string;
  addressLine: string;
  streetNumber: string;
  district: string;
  amphoe: string;
  subdistrict: string;
  province: string;
  latitude: string;
  longitude: string;
  totalSlots: number;
  pricePerHour: number;
  vehicleTypesText: string;
  rulesText: string;
  description: string;
  images: File[];
}

interface ParkingLotCreateResponse {
  success?: boolean;
  message?: string;
  error?: string;
}

type FormField = keyof Omit<ParkingForm, 'images'>;
type PinSource = 'none' | 'gps' | 'address' | 'manual';

function createInitialFormData(): ParkingForm {
  return {
    name: '',
    addressLine: '',
    streetNumber: '',
    district: '',
    amphoe: '',
    subdistrict: '',
    province: '',
    latitude: '',
    longitude: '',
    totalSlots: 1,
    pricePerHour: 0,
    vehicleTypesText: '',
    rulesText: '',
    description: '',
    images: [],
  };
}

function parseCoordinateInput(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseListField(value: string): string[] {
  const uniqueValues = new Set<string>();

  value
    .split('\n')
    .flatMap((line) => line.split(','))
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => uniqueValues.add(item));

  return Array.from(uniqueValues);
}

export default function ParkingSpacePage() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [token, setToken] = useState('');
  const [formData, setFormData] = useState<ParkingForm>(createInitialFormData);
  const [errors, setErrors] = useState<Partial<Record<FormField, string>>>({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAutoLocating, setIsAutoLocating] = useState(false);
  const [isGpsLocating, setIsGpsLocating] = useState(false);
  const [isPinLocked, setIsPinLocked] = useState(false);
  const [pinSource, setPinSource] = useState<PinSource>('none');
  const [gpsStatus, setGpsStatus] = useState<
    'idle' | 'prompting' | 'granted' | 'denied' | 'unsupported' | 'error'
  >('idle');
  const [locateError, setLocateError] = useState('');
  const locateRequestIdRef = useRef(0);

  const numericLatitude = useMemo(() => {
    return parseCoordinateInput(formData.latitude);
  }, [formData.latitude]);

  const numericLongitude = useMemo(() => {
    return parseCoordinateInput(formData.longitude);
  }, [formData.longitude]);

  useEffect(() => {
    const storedToken = readStoredToken();
    const storedUser = readStoredAuthUser();

    if (!storedToken || !storedUser) {
      router.replace('/login');
      return;
    }

    const normalizedRole = storedUser.role?.toLowerCase() || '';
    if (normalizedRole !== 'owner' && normalizedRole !== 'admin') {
      router.replace('/owner/home');
      return;
    }

    setToken(storedToken);
    setIsReady(true);
  }, [router]);

  const setCoordinates = useCallback((latitude: number, longitude: number, source: PinSource) => {
    setFormData((prev) => ({
      ...prev,
      latitude: String(latitude),
      longitude: String(longitude),
    }));

    setErrors((prev) => ({
      ...prev,
      latitude: undefined,
      longitude: undefined,
    }));

    setSubmitError('');
    setPinSource(source);

    if (source === 'manual') {
      // Stop in-flight auto geocode so manual pin selection stays stable.
      locateRequestIdRef.current += 1;
      setIsAutoLocating(false);
    }
  }, []);

  const lockPinToGpsLocation = useCallback(async () => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setGpsStatus('unsupported');
      return;
    }

    setLocateError('');
    setGpsStatus('prompting');
    setIsGpsLocating(true);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });

      const nextLatitude = Number(position.coords.latitude.toFixed(7));
      const nextLongitude = Number(position.coords.longitude.toFixed(7));
      setCoordinates(nextLatitude, nextLongitude, 'gps');
      setGpsStatus('granted');
    } catch (error) {
      const geoError = error as GeolocationPositionError;
      if (geoError?.code === 1) {
        setGpsStatus('denied');
        return;
      }

      setGpsStatus('error');
    } finally {
      setIsGpsLocating(false);
    }
  }, [setCoordinates]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (numericLatitude !== null && numericLongitude !== null) {
      return;
    }

    void lockPinToGpsLocation();
  }, [isReady, numericLatitude, numericLongitude, lockPinToGpsLocation]);

  const handleInputChange = (field: FormField, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value } as ParkingForm));

    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }

    if (submitError) {
      setSubmitError('');
    }

    if (locateError) {
      setLocateError('');
    }
  };

  const handleImagesChange = (images: File[]) => {
    setFormData((prev) => ({ ...prev, images }));
  };

  const handleMapCoordinateChange = useCallback(
    (latitude: number, longitude: number) => {
      if (isPinLocked) {
        return;
      }
      setCoordinates(latitude, longitude, 'manual');
    },
    [setCoordinates, isPinLocked]
  );

  const handleLocateByAddress = useCallback(async () => {
    const addressSegments = [
      formData.addressLine,
      formData.streetNumber,
      formData.subdistrict,
      formData.district,
      formData.amphoe,
      formData.province,
    ]
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (addressSegments.length === 0) {
      return;
    }

    const query = [...addressSegments, 'Thailand'].join(', ');
    const requestId = ++locateRequestIdRef.current;

    setLocateError('');
    setIsAutoLocating(true);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
        {
          method: 'GET',
        }
      );

      if (!response.ok) {
        throw new Error('Unable to locate pin by address');
      }

      const result = (await response.json()) as Array<{ lat: string; lon: string }>;
      if (!Array.isArray(result) || result.length === 0) {
        return;
      }

      if (requestId !== locateRequestIdRef.current) {
        return;
      }

      const nextLatitude = Number(result[0].lat);
      const nextLongitude = Number(result[0].lon);

      if (!Number.isFinite(nextLatitude) || !Number.isFinite(nextLongitude)) {
        throw new Error('Invalid coordinate response from map service.');
      }

      setCoordinates(Number(nextLatitude.toFixed(7)), Number(nextLongitude.toFixed(7)), 'address');
    } catch (error) {
      console.error('Locate by address error:', error);
      if (requestId === locateRequestIdRef.current) {
        setLocateError('ไม่สามารถค้นหาพิกัดจากที่อยู่ได้ กรุณาปักหมุดบนแผนที่ด้วยตนเอง');
      }
    } finally {
      if (requestId === locateRequestIdRef.current) {
        setIsAutoLocating(false);
      }
    }
  }, [
    formData.addressLine,
    formData.streetNumber,
    formData.subdistrict,
    formData.district,
    formData.amphoe,
    formData.province,
    setCoordinates,
  ]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (isPinLocked) {
      return;
    }

    if (pinSource === 'manual') {
      return;
    }

    const debounceTimeout = window.setTimeout(() => {
      void handleLocateByAddress();
    }, 700);

    return () => {
      window.clearTimeout(debounceTimeout);
    };
  }, [
    isReady,
    isPinLocked,
    pinSource,
    formData.addressLine,
    formData.streetNumber,
    formData.subdistrict,
    formData.district,
    formData.amphoe,
    formData.province,
    handleLocateByAddress,
  ]);

  const togglePinLock = useCallback(() => {
    setIsPinLocked((previous) => {
      const next = !previous;
      if (next) {
        locateRequestIdRef.current += 1;
        setIsAutoLocating(false);
      }
      return next;
    });
  }, []);

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<FormField, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'กรุณากรอกชื่อพื้นที่จอดรถ';
    }

    if (!formData.addressLine.trim()) {
      newErrors.addressLine = 'กรุณากรอกที่อยู่';
    }

    if (!formData.streetNumber.trim()) {
      newErrors.streetNumber = 'กรุณากรอกเลขที่';
    }

    if (!formData.district.trim()) {
      newErrors.district = 'กรุณากรอกเขต';
    }

    if (!formData.amphoe.trim()) {
      newErrors.amphoe = 'กรุณากรอกอำเภอ';
    }

    if (!formData.subdistrict.trim()) {
      newErrors.subdistrict = 'กรุณากรอกแขวง/ตำบล';
    }

    if (!formData.province.trim()) {
      newErrors.province = 'กรุณากรอกจังหวัด';
    }

    const latitude = Number(formData.latitude);
    const longitude = Number(formData.longitude);

    if (!formData.latitude.trim()) {
      newErrors.latitude = 'กรุณาเลือกพิกัดบนแผนที่';
    } else if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      newErrors.latitude = 'ละติจูดต้องอยู่ระหว่าง -90 ถึง 90';
    }

    if (!formData.longitude.trim()) {
      newErrors.longitude = 'กรุณาเลือกพิกัดบนแผนที่';
    } else if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      newErrors.longitude = 'ลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180';
    }

    if (!Number.isInteger(formData.totalSlots) || formData.totalSlots <= 0) {
      newErrors.totalSlots = 'จำนวนช่องจอดต้องเป็นจำนวนเต็มมากกว่า 0';
    }

    if (!Number.isFinite(formData.pricePerHour) || formData.pricePerHour <= 0) {
      newErrors.pricePerHour = 'ราคาต้องมากกว่า 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!token || !validateForm()) {
      return;
    }

    setSubmitError('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/parking-lots/system', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          lotName: formData.name,
          addressLine: formData.addressLine,
          streetNumber: formData.streetNumber,
          district: formData.district,
          amphoe: formData.amphoe,
          subdistrict: formData.subdistrict,
          province: formData.province,
          latitude: Number(formData.latitude),
          longitude: Number(formData.longitude),
          totalSlot: formData.totalSlots,
          price: formData.pricePerHour,
          vehicleTypes: parseListField(formData.vehicleTypesText),
          rules: parseListField(formData.rulesText),
          description: formData.description,
        }),
      });

      const result = (await response.json()) as ParkingLotCreateResponse;

      if (response.status === 401) {
        clearStoredAuth();
        router.replace('/login');
        return;
      }

      if (!response.ok) {
        throw new Error(result.error || 'ไม่สามารถส่งคำขอเพิ่มที่จอดรถได้ในขณะนี้');
      }

      setFormData(createInitialFormData());
      setPinSource('none');
      setIsPinLocked(false);
      alert(result.message || 'ส่งคำขอเพิ่มที่จอดรถเรียบร้อยแล้ว');
      router.push('/owner/home');
    } catch (error) {
      console.error('Parking lot request submit error:', error);
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'ไม่สามารถส่งคำขอเพิ่มที่จอดรถได้ในขณะนี้'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    router.push('/owner/home');
  };

  if (!isReady) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Tabbar />

      <div className="fixed bottom-0 left-0 right-0 z-[1200] border-t border-blue-100 bg-blue-50 px-4 py-4">
        <div className="mx-auto max-w-3xl">
          <button
            onClick={() => {
              void handleSubmit();
            }}
            disabled={isSubmitting}
            className="w-full rounded-xl bg-blue-600 py-3 font-medium text-white transition-all duration-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? 'กำลังส่งข้อมูล...' : 'ส่งคำขออนุมัติ'}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 pb-40 sm:px-6 lg:px-8">
        <div className="mb-8">
          <button
            onClick={handleBack}
            className="mb-4 flex items-center gap-2 text-gray-600 transition-colors hover:text-blue-600"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            <span>กลับ</span>
          </button>
          <h1 className="text-2xl font-bold text-gray-800">สร้างพื้นที่จอดรถ</h1>
        </div>

        <div className="space-y-6 rounded-xl bg-white p-8 shadow-md">
          {submitError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {submitError}
            </div>
          ) : null}

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              ชื่อ <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className={`w-full rounded-lg border bg-white px-4 py-3 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.name ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-blue-500'
              }`}
              placeholder="ชื่อสถานที่จอดรถ"
            />
            {errors.name ? <p className="mt-1 text-xs text-red-500">{errors.name}</p> : null}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              ที่อยู่ <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.addressLine}
              onChange={(e) => handleInputChange('addressLine', e.target.value)}
              className={`w-full rounded-lg border bg-white px-4 py-3 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.addressLine ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-blue-500'
              }`}
              placeholder="ที่อยู่"
            />
            {errors.addressLine ? <p className="mt-1 text-xs text-red-500">{errors.addressLine}</p> : null}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              เลขที่ <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.streetNumber}
              onChange={(e) => handleInputChange('streetNumber', e.target.value)}
              className={`w-full rounded-lg border bg-white px-4 py-3 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.streetNumber ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-blue-500'
              }`}
              placeholder="เลขที่อาคาร/บ้าน"
            />
            {errors.streetNumber ? <p className="mt-1 text-xs text-red-500">{errors.streetNumber}</p> : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                เขต <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.district}
                onChange={(e) => handleInputChange('district', e.target.value)}
                className={`w-full rounded-lg border bg-white px-4 py-3 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.district ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-blue-500'
                }`}
                placeholder="เขต"
              />
              {errors.district ? <p className="mt-1 text-xs text-red-500">{errors.district}</p> : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                อำเภอ <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.amphoe}
                onChange={(e) => handleInputChange('amphoe', e.target.value)}
                className={`w-full rounded-lg border bg-white px-4 py-3 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.amphoe ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-blue-500'
                }`}
                placeholder="อำเภอ"
              />
              {errors.amphoe ? <p className="mt-1 text-xs text-red-500">{errors.amphoe}</p> : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                แขวง/ตำบล <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.subdistrict}
                onChange={(e) => handleInputChange('subdistrict', e.target.value)}
                className={`w-full rounded-lg border bg-white px-4 py-3 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.subdistrict ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-blue-500'
                }`}
                placeholder="แขวง/ตำบล"
              />
              {errors.subdistrict ? <p className="mt-1 text-xs text-red-500">{errors.subdistrict}</p> : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                จังหวัด <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.province}
                onChange={(e) => handleInputChange('province', e.target.value)}
                className={`w-full rounded-lg border bg-white px-4 py-3 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.province ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-blue-500'
                }`}
                placeholder="จังหวัด"
              />
              {errors.province ? <p className="mt-1 text-xs text-red-500">{errors.province}</p> : null}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              ตำแหน่งปักหมุด <span className="text-red-500">*</span>
            </label>
            <p className="mb-3 text-xs text-gray-500">
              แผนที่จะเริ่มต้นที่กรุงเทพฯ และพยายามค้นหาพิกัดจากข้อมูลที่อยู่โดยอัตโนมัติ
              คุณสามารถลากหรือคลิกแผนที่เพื่อปรับหมุดให้แม่นยำได้
            </p>

            <div className="mb-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  void lockPinToGpsLocation();
                }}
                disabled={isGpsLocating || gpsStatus === 'unsupported'}
                className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGpsLocating ? 'กำลังอ่านตำแหน่ง GPS...' : 'ใช้พิกัด GPS ปัจจุบัน'}
              </button>

              <button
                type="button"
                onClick={togglePinLock}
                disabled={numericLatitude === null || numericLongitude === null}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  isPinLocked
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {isPinLocked ? 'ปลดล็อกหมุด' : 'ล็อกหมุด'}
              </button>

              <span className="text-xs text-slate-500">
                หาก GPS ไม่แม่นยำ สามารถลากหรือคลิกแผนที่เพื่อย้ายหมุดได้
              </span>
              {numericLatitude !== null && numericLongitude !== null ? (
                <span className="text-xs text-slate-600">
                  พิกัดที่เลือก: {numericLatitude.toFixed(7)}, {numericLongitude.toFixed(7)}
                </span>
              ) : null}

              {isAutoLocating ? (
                <span className="text-xs text-slate-500">กำลังค้นหาพิกัดจากที่อยู่...</span>
              ) : null}

              {gpsStatus === 'prompting' ? (
                <span className="text-xs text-slate-500">กำลังขอสิทธิ์ใช้ GPS...</span>
              ) : null}

              {gpsStatus === 'granted' ? (
                <span className="text-xs text-emerald-600">เปิดใช้งานตำแหน่ง GPS แล้ว</span>
              ) : null}

              {gpsStatus === 'denied' ? (
                <span className="text-xs text-amber-600">
                  ปฏิเสธสิทธิ์ GPS กรุณาเปิดสิทธิ์ตำแหน่งในเบราว์เซอร์
                </span>
              ) : null}

              {gpsStatus === 'unsupported' ? (
                <span className="text-xs text-amber-600">เบราว์เซอร์นี้ไม่รองรับ GPS</span>
              ) : null}

              {gpsStatus === 'error' ? (
                <span className="text-xs text-amber-600">ไม่สามารถอ่านตำแหน่ง GPS ปัจจุบันได้</span>
              ) : null}

              {isPinLocked ? (
                <span className="text-xs text-emerald-700">หมุดถูกล็อกอยู่</span>
              ) : null}
            </div>

            {locateError ? <p className="mb-3 text-xs text-red-500">{locateError}</p> : null}

            <MapCoordinatePicker
              latitude={numericLatitude}
              longitude={numericLongitude}
              onChange={handleMapCoordinateChange}
              isPinLocked={isPinLocked}
            />

            {errors.latitude || errors.longitude ? (
              <p className="mt-2 text-xs text-red-500">{errors.latitude || errors.longitude}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                จำนวนช่องจอด <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={formData.totalSlots}
                onChange={(e) => handleInputChange('totalSlots', parseInt(e.target.value, 10) || 0)}
                min="1"
                step="1"
                className={`w-full rounded-lg border bg-white px-4 py-3 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.totalSlots ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-blue-500'
                }`}
                placeholder="จำนวนช่องจอดทั้งหมด"
              />
              {errors.totalSlots ? <p className="mt-1 text-xs text-red-500">{errors.totalSlots}</p> : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                ราคา <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={formData.pricePerHour}
                  onChange={(e) => handleInputChange('pricePerHour', parseFloat(e.target.value) || 0)}
                  min="0"
                  step="0.5"
                  className={`w-full rounded-lg border bg-white px-4 py-3 pr-16 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.pricePerHour ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-blue-500'
                  }`}
                  placeholder="ราคาต่อชั่วโมง"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                  THB
                </span>
              </div>
              {errors.pricePerHour ? <p className="mt-1 text-xs text-red-500">{errors.pricePerHour}</p> : null}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              ประเภทยานพาหนะที่รองรับ (ไม่บังคับ)
            </label>
            <textarea
              value={formData.vehicleTypesText}
              onChange={(e) => handleInputChange('vehicleTypesText', e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-gray-200 bg-white px-4 py-3 transition-all duration-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="กรอกทีละบรรทัดหรือคั่นด้วยเครื่องหมายจุลภาค เช่น รถยนต์, รถจักรยานยนต์"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              กฎระเบียบ (ไม่บังคับ)
            </label>
            <textarea
              value={formData.rulesText}
              onChange={(e) => handleInputChange('rulesText', e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-gray-200 bg-white px-4 py-3 transition-all duration-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="กรอกทีละบรรทัดหรือคั่นด้วยเครื่องหมายจุลภาค"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              รายละเอียดเพิ่มเติม (ไม่บังคับ)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              rows={4}
              className="w-full resize-none rounded-lg border border-gray-200 bg-white px-4 py-3 transition-all duration-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="เพิ่มรายละเอียดของที่จอดรถ..."
            />
          </div>

          <ParkingImageUploader
            images={formData.images}
            onImagesChange={handleImagesChange}
            maxImages={5}
          />
        </div>
      </div>
    </div>
  );
}

