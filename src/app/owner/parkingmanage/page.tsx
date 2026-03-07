'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import Tabbar from '@/components/Tabbar';
import { clearStoredAuth, readStoredAuthUser, readStoredToken } from '@/lib/auth-client';

type LotStatus = 'ACTIVE' | 'INACTIVE';

type LotSummary = {
  id: number;
  name: string;
  status: string;
};

type LotDetail = {
  id: number;
  name: string;
  description: string;
  addressLine: string;
  streetNumber: string;
  district: string;
  amphoe: string;
  subdistrict: string;
  province: string;
  latitude: number | null;
  longitude: number | null;
  totalSlots: number;
  price: number;
  status: LotStatus;
  isApproved: boolean;
  vehicleTypes: string[];
  rules: string[];
};

type FormData = {
  name: string;
  description: string;
  addressLine: string;
  streetNumber: string;
  district: string;
  amphoe: string;
  subdistrict: string;
  province: string;
  latitude: string;
  longitude: string;
  totalSlots: number;
  price: number;
  status: LotStatus;
  isApproved: boolean;
  vehicleTypesText: string;
  rulesText: string;
};

function toFormData(lot: LotDetail): FormData {
  return {
    name: lot.name,
    description: lot.description || '',
    addressLine: lot.addressLine,
    streetNumber: lot.streetNumber,
    district: lot.district,
    amphoe: lot.amphoe,
    subdistrict: lot.subdistrict,
    province: lot.province,
    latitude: lot.latitude === null ? '' : String(lot.latitude),
    longitude: lot.longitude === null ? '' : String(lot.longitude),
    totalSlots: lot.totalSlots,
    price: lot.price,
    status: lot.status,
    isApproved: lot.isApproved,
    vehicleTypesText: (lot.vehicleTypes || []).join('\n'),
    rulesText: (lot.rules || []).join('\n'),
  };
}

function parseLines(value: string): string[] {
  const uniqueValues = new Set<string>();
  value
    .split('\n')
    .flatMap((line) => line.split(','))
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => uniqueValues.add(item));

  return Array.from(uniqueValues);
}

function statusLabel(status: LotStatus) {
  return status === 'ACTIVE' ? 'Open' : 'Temporarily Closed';
}

function ParkingManagePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const queryLotId = useMemo(() => {
    const value = Number(searchParams.get('lotId'));
    return Number.isInteger(value) && value > 0 ? value : null;
  }, [searchParams]);

  const [isReady, setIsReady] = useState(false);
  const [token, setToken] = useState('');
  const [lots, setLots] = useState<LotSummary[]>([]);
  const [selectedLotId, setSelectedLotId] = useState<number | null>(null);
  const [formData, setFormData] = useState<FormData | null>(null);
  const [originalData, setOriginalData] = useState<FormData | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const storedToken = readStoredToken();
    const storedUser = readStoredAuthUser();

    if (!storedToken || !storedUser) {
      router.replace('/login');
      return;
    }

    const role = storedUser.role?.toLowerCase() || '';
    if (role !== 'owner' && role !== 'admin') {
      router.replace('/owner/home');
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

    const loadLots = async () => {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const response = await fetch('/api/parking-lots/system', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });

        if (response.status === 401) {
          clearStoredAuth();
          router.replace('/login');
          return;
        }

        const result = (await response.json()) as {
          parkingLots?: LotSummary[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(result.error || 'Unable to load parking lots');
        }

        if (!isMounted) {
          return;
        }

        const nextLots = result.parkingLots || [];
        setLots(nextLots);

        if (nextLots.length === 0) {
          setSelectedLotId(null);
          setFormData(null);
          setOriginalData(null);
          return;
        }

        const preferredLotId =
          queryLotId && nextLots.some((item) => item.id === queryLotId)
            ? queryLotId
            : nextLots[0].id;

        setSelectedLotId(preferredLotId);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to load parking lots right now.'
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadLots();

    return () => {
      isMounted = false;
    };
  }, [isReady, queryLotId, router, token]);

  useEffect(() => {
    if (!isReady || !token || !selectedLotId) {
      return;
    }

    let isMounted = true;

    const loadLotDetail = async () => {
      setIsLoading(true);
      setErrorMessage('');
      setSuccessMessage('');
      setIsEditMode(false);

      try {
        const response = await fetch(`/api/owner/parking-lots/${selectedLotId}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });

        if (response.status === 401) {
          clearStoredAuth();
          router.replace('/login');
          return;
        }

        const result = (await response.json()) as {
          parkingLot?: LotDetail;
          error?: string;
        };

        if (!response.ok || !result.parkingLot) {
          throw new Error(result.error || 'Unable to load parking lot detail');
        }

        if (!isMounted) {
          return;
        }

        const nextForm = toFormData(result.parkingLot);
        setFormData(nextForm);
        setOriginalData(nextForm);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to load parking lot detail right now.'
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadLotDetail();

    return () => {
      isMounted = false;
    };
  }, [isReady, router, selectedLotId, token]);

  const handleChange = (field: keyof FormData, value: string | number | LotStatus) => {
    setFormData((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        [field]: value,
      };
    });
    setErrorMessage('');
    setSuccessMessage('');
  };

  const validateForm = (data: FormData): string | null => {
    if (!data.name.trim()) return 'Name is required';
    if (!data.addressLine.trim()) return 'Address is required';
    if (!data.streetNumber.trim()) return 'Number is required';
    if (!data.district.trim()) return 'District is required';
    if (!data.amphoe.trim()) return 'Amphoe is required';
    if (!data.subdistrict.trim()) return 'Subdistrict is required';
    if (!data.province.trim()) return 'Province is required';
    if (!Number.isInteger(data.totalSlots) || data.totalSlots <= 0) return 'Slots must be a positive integer';
    if (!Number.isFinite(data.price) || data.price <= 0) return 'Price must be greater than 0';

    const hasLat = data.latitude.trim().length > 0;
    const hasLon = data.longitude.trim().length > 0;

    if (hasLat !== hasLon) return 'Please provide both latitude and longitude';

    if (hasLat) {
      const latitude = Number(data.latitude);
      const longitude = Number(data.longitude);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        return 'Latitude must be between -90 and 90';
      }
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        return 'Longitude must be between -180 and 180';
      }
    }

    return null;
  };

  const updateLot = async (nextForm: FormData, message: string): Promise<boolean> => {
    if (!token || !selectedLotId) {
      return false;
    }

    const validationError = validateForm(nextForm);
    if (validationError) {
      setErrorMessage(validationError);
      return false;
    }

    const payload = {
      name: nextForm.name.trim(),
      description: nextForm.description.trim(),
      addressLine: nextForm.addressLine.trim(),
      streetNumber: nextForm.streetNumber.trim(),
      district: nextForm.district.trim(),
      amphoe: nextForm.amphoe.trim(),
      subdistrict: nextForm.subdistrict.trim(),
      province: nextForm.province.trim(),
      latitude: nextForm.latitude.trim() ? Number(nextForm.latitude) : null,
      longitude: nextForm.longitude.trim() ? Number(nextForm.longitude) : null,
      totalSlots: nextForm.totalSlots,
      price: nextForm.price,
      status: nextForm.status,
      vehicleTypes: parseLines(nextForm.vehicleTypesText),
      rules: parseLines(nextForm.rulesText),
    };

    const response = await fetch(`/api/owner/parking-lots/${selectedLotId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      clearStoredAuth();
      router.replace('/login');
      return false;
    }

    const result = (await response.json()) as {
      parkingLot?: LotDetail;
      message?: string;
      error?: string;
    };

    if (!response.ok || !result.parkingLot) {
      throw new Error(result.error || 'Unable to update parking lot');
    }

    const mapped = toFormData(result.parkingLot);
    setFormData(mapped);
    setOriginalData(mapped);
    setLots((previous) =>
      previous.map((item) =>
        item.id === result.parkingLot?.id
          ? {
              ...item,
              name: result.parkingLot.name,
              status: `${result.parkingLot.isApproved ? 'Approved' : 'Pending'} / ${result.parkingLot.status}`,
            }
          : item
      )
    );
    setSuccessMessage(result.message || message);
    setErrorMessage('');
    return true;
  };

  const handleSave = async () => {
    if (!formData) {
      return;
    }

    setIsSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const didUpdate = await updateLot(formData, 'Parking lot updated');
      if (didUpdate) {
        setIsEditMode(false);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save right now.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleBooking = async () => {
    if (!formData) {
      return;
    }

    const nextStatus: LotStatus = formData.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    setIsToggling(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const didUpdate = await updateLot(
        {
          ...formData,
          status: nextStatus,
        },
        nextStatus === 'INACTIVE' ? 'Booking temporarily closed' : 'Booking opened'
      );
      if (didUpdate) {
        setIsEditMode(false);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update booking status.');
    } finally {
      setIsToggling(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !selectedLotId) {
      return;
    }

    if (!confirm('Delete this parking lot? This action cannot be undone.')) {
      return;
    }

    setIsDeleting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await fetch(`/api/owner/parking-lots/${selectedLotId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        clearStoredAuth();
        router.replace('/login');
        return;
      }

      const result = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        throw new Error(result.error || 'Unable to delete parking lot');
      }

      const nextLots = lots.filter((item) => item.id !== selectedLotId);
      setLots(nextLots);
      setSelectedLotId(nextLots.length > 0 ? nextLots[0].id : null);
      setFormData(null);
      setOriginalData(null);
      setIsEditMode(false);
      setSuccessMessage(result.message || 'Parking lot deleted');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete parking lot right now.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isReady) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Tabbar />
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => router.push('/owner/home')}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-blue-600"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Back
          </button>
          {formData && !isEditMode ? (
            <button
              onClick={() => setIsEditMode(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Edit
            </button>
          ) : null}
        </div>

        <h1 className="mb-4 text-2xl font-bold text-gray-800">Parking Lot Manage</h1>

        {errorMessage ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}
        {successMessage ? <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div> : null}

        <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
          <label className="mb-2 block text-sm font-medium text-gray-700">Select lot</label>
          <select
            value={selectedLotId || ''}
            disabled={isLoading || lots.length === 0}
            onChange={(event) => {
              const nextId = Number(event.target.value);
              setSelectedLotId(nextId);
              setIsEditMode(false);
              router.replace(`/owner/parkingmanage?lotId=${nextId}`);
            }}
            className="w-full rounded-lg border border-gray-200 px-3 py-2"
          >
            {isLoading && lots.length === 0 ? <option value="">Loading...</option> : null}
            {!isLoading && lots.length === 0 ? <option value="">No parking lots yet</option> : null}
            {lots.map((item) => (
              <option key={item.id} value={item.id}>
                #{item.id} {item.name} ({item.status})
              </option>
            ))}
          </select>
        </div>

        {formData ? (
          <div className="space-y-4 rounded-lg bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-gray-700">
                Booking status: <span className="font-semibold">{statusLabel(formData.status)}</span>
              </div>
              <button
                onClick={() => {
                  void handleToggleBooking();
                }}
                disabled={isToggling || isSaving || isDeleting || isEditMode}
                className={`rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                  formData.status === 'ACTIVE' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isToggling ? 'Updating...' : formData.status === 'ACTIVE' ? 'Temporarily Close Booking' : 'Open Booking'}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input disabled={!isEditMode} value={formData.name} onChange={(e) => handleChange('name', e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2" placeholder="Name" />
              <input disabled={!isEditMode} value={formData.addressLine} onChange={(e) => handleChange('addressLine', e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2" placeholder="Address" />
              <input disabled={!isEditMode} value={formData.streetNumber} onChange={(e) => handleChange('streetNumber', e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2" placeholder="Number" />
              <input disabled={!isEditMode} value={formData.district} onChange={(e) => handleChange('district', e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2" placeholder="District" />
              <input disabled={!isEditMode} value={formData.amphoe} onChange={(e) => handleChange('amphoe', e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2" placeholder="Amphoe" />
              <input disabled={!isEditMode} value={formData.subdistrict} onChange={(e) => handleChange('subdistrict', e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2" placeholder="Subdistrict" />
              <input disabled={!isEditMode} value={formData.province} onChange={(e) => handleChange('province', e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2" placeholder="Province" />
              <input disabled={!isEditMode} value={formData.latitude} onChange={(e) => handleChange('latitude', e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2" placeholder="Latitude" />
              <input disabled={!isEditMode} value={formData.longitude} onChange={(e) => handleChange('longitude', e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2" placeholder="Longitude" />
              <input disabled={!isEditMode} type="number" min={1} value={formData.totalSlots} onChange={(e) => handleChange('totalSlots', parseInt(e.target.value, 10) || 0)} className="rounded-lg border border-gray-200 px-3 py-2" placeholder="Slots" />
              <input disabled={!isEditMode} type="number" min={0} step={0.5} value={formData.price} onChange={(e) => handleChange('price', parseFloat(e.target.value) || 0)} className="rounded-lg border border-gray-200 px-3 py-2" placeholder="Price per hour" />
            </div>

            <textarea disabled={!isEditMode} value={formData.description} onChange={(e) => handleChange('description', e.target.value)} rows={3} className="w-full rounded-lg border border-gray-200 px-3 py-2" placeholder="Description" />
            <textarea disabled={!isEditMode} value={formData.vehicleTypesText} onChange={(e) => handleChange('vehicleTypesText', e.target.value)} rows={3} className="w-full rounded-lg border border-gray-200 px-3 py-2" placeholder="Vehicle types (optional)" />
            <textarea disabled={!isEditMode} value={formData.rulesText} onChange={(e) => handleChange('rulesText', e.target.value)} rows={3} className="w-full rounded-lg border border-gray-200 px-3 py-2" placeholder="Rules (optional)" />

            {isEditMode ? (
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    if (originalData) {
                      setFormData(originalData);
                    }
                    setIsEditMode(false);
                    setErrorMessage('');
                    setSuccessMessage('');
                  }}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    void handleSave();
                  }}
                  disabled={isSaving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            ) : null}

            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="mb-3 text-sm text-red-700">Delete this parking lot permanently.</p>
              <button
                onClick={() => {
                  void handleDelete();
                }}
                disabled={isDeleting || isSaving || isToggling}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {isDeleting ? 'Deleting...' : 'Delete parking lot'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ParkingManagePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <ParkingManagePageContent />
    </Suspense>
  );
}
