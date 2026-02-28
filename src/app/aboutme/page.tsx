'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  CloudArrowUpIcon,
  TrashIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import Tabbar from '@/components/Tabbar';
import BookingHistoryCard, { BookingHistory } from '@/components/BookingHistoryCard';
import {
  AuthUser,
  clearStoredAuth,
  readStoredAuthUser,
  readStoredToken,
} from '@/lib/auth-client';

type ProfileForm = {
  firstName: string;
  lastName: string;
  gender: string;
  age: string;
  email: string;
  phone: string;
  avatar: string | null;
};

const GENDER_OPTIONS = ['Male', 'Female', 'Other'] as const;

type ApiBookingHistory = {
  id: string;
  parkingName: string;
  bookingTime: string;
  checkinTime: string | null;
  checkoutTime: string | null;
  durationMinutes: number | null;
  totalPrice: number;
};

type UserApiResponse = {
  success?: boolean;
  user?: {
    id: number;
    username: string;
    email: string;
    name: string;
    surname: string | null;
    gender?: string | null;
    age?: number | null;
    phone: string | null;
    role: string;
    ownerRequestStatus?: string | null;
    profileImageUrl?: string | null;
  };
  bookings?: ApiBookingHistory[];
  error?: string;
};

function formatDate(dateValue: string): string {
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  return parsed.toLocaleDateString('th-TH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatTime(dateValue: string | null): string {
  if (!dateValue) {
    return '-';
  }

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  return parsed.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(durationMinutes: number | null): string {
  if (!durationMinutes || durationMinutes <= 0) {
    return '-';
  }

  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours} ชั่วโมง ${minutes} นาที`;
  }

  if (hours > 0) {
    return `${hours} ชั่วโมง`;
  }

  return `${minutes} นาที`;
}

function mapBookingToCard(booking: ApiBookingHistory): BookingHistory {
  return {
    id: booking.id,
    parkingName: booking.parkingName,
    date: formatDate(booking.bookingTime),
    startTime: formatTime(booking.checkinTime),
    endTime: formatTime(booking.checkoutTime),
    duration: formatDuration(booking.durationMinutes),
    totalPrice: booking.totalPrice,
  };
}

function updateStoredAuthUser(nextUser: AuthUser): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem('auth_user', JSON.stringify(nextUser));
}

export default function ProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState('');
  const [formData, setFormData] = useState<ProfileForm>({
    firstName: '',
    lastName: '',
    gender: '',
    age: '',
    email: '',
    phone: '',
    avatar: null,
  });
  const [bookings, setBookings] = useState<BookingHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeletingImage, setIsDeletingImage] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const authUserId = authUser?.id;
  const authUsername = authUser?.username;

  useEffect(() => {
    const storedToken = readStoredToken();
    const storedUser = readStoredAuthUser();

    if (!storedToken || !storedUser) {
      router.replace('/login');
      return;
    }

    setToken(storedToken);
    setAuthUser(storedUser);
  }, [router]);

  useEffect(() => {
    if (!token || !authUserId || !authUsername) {
      return;
    }

    let isMounted = true;

    const loadProfile = async () => {
      setIsLoading(true);
      setLoadError('');

      try {
        const response = await fetch(`/api/USER/${authUserId}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
        });

        const result = (await response.json()) as UserApiResponse;

        if (response.status === 401) {
          clearStoredAuth();
          router.replace('/login');
          return;
        }

        if (!response.ok || !result.user) {
          throw new Error(result.error || 'Unable to load profile');
        }

        if (!isMounted) {
          return;
        }

        setFormData({
          firstName: result.user.name || '',
          lastName: result.user.surname || '',
          gender: result.user.gender || '',
          age:
            result.user.age === null || result.user.age === undefined
              ? ''
              : String(result.user.age),
          email: result.user.email || '',
          phone: result.user.phone || '',
          avatar: result.user.profileImageUrl || null,
        });
        setBookings((result.bookings || []).map(mapBookingToCard));

        const nextStoredUser: AuthUser = {
          id: authUserId,
          username: result.user.username || authUsername,
          email: result.user.email,
          name: result.user.name,
          surname: result.user.surname,
          gender: result.user.gender || null,
          age: result.user.age ?? null,
          phone: result.user.phone,
          role: result.user.role,
          ownerRequestStatus: result.user.ownerRequestStatus || null,
          profileImageUrl: result.user.profileImageUrl || null,
        };

        setAuthUser(nextStoredUser);
        updateStoredAuthUser(nextStoredUser);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        console.error('Profile load error:', error);
        setLoadError('ไม่สามารถโหลดข้อมูลโปรไฟล์ได้ในตอนนี้');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, [authUserId, authUsername, router, token]);

  const handleInputChange = (field: keyof ProfileForm, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formError) {
      setFormError('');
    }
    if (successMessage) {
      setSuccessMessage('');
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !token || !authUser) {
      return;
    }

    setFormError('');
    setSuccessMessage('');
    setIsUploading(true);

    try {
      const body = new FormData();
      body.append('file', file);

      const response = await fetch('/api/profile-image', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      const result = (await response.json()) as {
        success?: boolean;
        imageUrl?: string;
        error?: string;
      };

      if (!response.ok || !result.imageUrl) {
        throw new Error(result.error || 'Unable to upload image');
      }

      setFormData((prev) => ({ ...prev, avatar: result.imageUrl || null }));
      setSuccessMessage('อัปโหลดรูปโปรไฟล์เรียบร้อยแล้ว');

      const nextStoredUser: AuthUser = {
        ...authUser,
        profileImageUrl: result.imageUrl,
      };
      setAuthUser(nextStoredUser);
      updateStoredAuthUser(nextStoredUser);
    } catch (error) {
      console.error('Avatar upload error:', error);
      setFormError('ไม่สามารถอัปโหลดรูปโปรไฟล์ได้');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAvatarDelete = async () => {
    if (!token || !authUser || !formData.avatar) {
      return;
    }

    setFormError('');
    setSuccessMessage('');
    setIsDeletingImage(true);

    try {
      const response = await fetch('/api/profile-image', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error || 'Unable to delete image');
      }

      setFormData((prev) => ({ ...prev, avatar: null }));
      setSuccessMessage('ลบรูปโปรไฟล์เรียบร้อยแล้ว');

      const nextStoredUser: AuthUser = {
        ...authUser,
        profileImageUrl: null,
      };
      setAuthUser(nextStoredUser);
      updateStoredAuthUser(nextStoredUser);
    } catch (error) {
      console.error('Avatar delete error:', error);
      setFormError('ไม่สามารถลบรูปโปรไฟล์ได้');
    } finally {
      setIsDeletingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSave = async () => {
    if (!token || !authUser) {
      return;
    }

    const firstName = formData.firstName.trim();
    const gender = formData.gender.trim();
    const ageInput = formData.age.trim();
    const email = formData.email.trim();
    let age: number | null = null;

    if (!firstName) {
      setFormError('First name is required');
      return;
    }

    if (!email) {
      setFormError('Email is required');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError('Invalid email format');
      return;
    }

    if (gender && !GENDER_OPTIONS.includes(gender as (typeof GENDER_OPTIONS)[number])) {
      setFormError('Invalid gender value');
      return;
    }

    if (ageInput) {
      const parsedAge = Number(ageInput);
      if (!Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 150) {
        setFormError('Age must be between 1 and 150');
        return;
      }
      age = parsedAge;
    }

    setIsSaving(true);
    setFormError('');
    setSuccessMessage('');

    try {
      const response = await fetch(`/api/USER/${authUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: firstName,
          surname: formData.lastName.trim(),
          gender,
          age,
          email,
          phone: formData.phone.trim(),
        }),
      });

      const result = (await response.json()) as UserApiResponse;

      if (!response.ok || !result.user) {
        throw new Error(result.error || 'Unable to save profile');
      }

      setFormData((prev) => ({
        ...prev,
        firstName: result.user?.name || prev.firstName,
        lastName: result.user?.surname || '',
        gender: result.user?.gender || '',
        age:
          result.user?.age === null || result.user?.age === undefined
            ? ''
            : String(result.user.age),
        email: result.user?.email || prev.email,
        phone: result.user?.phone || '',
        avatar: result.user?.profileImageUrl || prev.avatar,
      }));

      const nextStoredUser: AuthUser = {
        ...authUser,
        email: result.user.email,
        name: result.user.name,
        surname: result.user.surname,
        gender: result.user.gender || null,
        age: result.user.age ?? null,
        phone: result.user.phone,
        role: result.user.role,
        ownerRequestStatus: result.user.ownerRequestStatus || null,
        profileImageUrl: result.user.profileImageUrl || null,
      };

      setAuthUser(nextStoredUser);
      updateStoredAuthUser(nextStoredUser);
      setSuccessMessage('บันทึกข้อมูลโปรไฟล์เรียบร้อยแล้ว');
    } catch (error) {
      console.error('Profile save error:', error);
      setFormError(
        error instanceof Error ? error.message : 'ไม่สามารถบันทึกข้อมูลโปรไฟล์ได้'
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading && !authUser) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Tabbar />

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-xl bg-white shadow-lg">
          <section className="bg-gray-50 p-6 sm:p-8">
            <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
              <div className="group relative">
                <div className="relative h-[120px] w-[120px] overflow-hidden rounded-full bg-gradient-to-br from-[#5B7CFF] to-[#4a7bff] shadow-md transition-transform duration-300 group-hover:scale-105">
                  {formData.avatar ? (
                    <Image
                      src={formData.avatar}
                      alt="Profile"
                      fill
                      sizes="120px"
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    <UserCircleIcon className="h-full w-full p-4 text-white" />
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    void handleAvatarUpload(event);
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || isDeletingImage}
                  className="flex items-center gap-2 rounded-lg bg-[#5B7CFF] px-4 py-2 font-medium text-white transition-all duration-300 hover:bg-[#4a6bef] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <CloudArrowUpIcon className="h-5 w-5" />
                  <span>{isUploading ? 'Uploading...' : 'Upload New Picture'}</span>
                </button>
                {formData.avatar ? (
                  <button
                    type="button"
                    onClick={() => {
                      void handleAvatarDelete();
                    }}
                    disabled={isUploading || isDeletingImage}
                    className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 font-medium text-white transition-all duration-300 hover:bg-red-600 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <TrashIcon className="h-5 w-5" />
                    <span>{isDeletingImage ? 'Deleting...' : 'Delete'}</span>
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <section className="border-b border-gray-100 p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-800">Personal Info</h2>
              <p className="mt-1 text-sm text-gray-500">Update your profile information</p>
            </div>

            {loadError ? (
              <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {loadError}
              </div>
            ) : null}

            {formError ? (
              <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {formError}
              </div>
            ) : null}

            {successMessage ? (
              <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {successMessage}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => handleInputChange('firstName', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 transition-all focus:border-[#5B7CFF] focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]/20"
                  placeholder="Enter first name"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Last Name
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => handleInputChange('lastName', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 transition-all focus:border-[#5B7CFF] focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]/20"
                  placeholder="Enter last name"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Gender</label>
                <select
                  value={formData.gender}
                  onChange={(e) => handleInputChange('gender', e.target.value)}
                  className="w-full cursor-pointer rounded-lg border border-gray-200 bg-white px-4 py-3 transition-all focus:border-[#5B7CFF] focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]/20"
                >
                  <option value="">Select gender</option>
                  {GENDER_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Age</label>
                <input
                  type="number"
                  min="1"
                  max="150"
                  value={formData.age}
                  onChange={(e) => handleInputChange('age', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 transition-all focus:border-[#5B7CFF] focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]/20"
                  placeholder="Enter age"
                />
              </div>
            </div>
          </section>

          <section className="border-b border-gray-100 p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-800">Contact Info</h2>
              <p className="mt-1 text-sm text-gray-500">Keep your contact details current</p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Email ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 transition-all focus:border-[#5B7CFF] focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]/20"
                  placeholder="Enter email address"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Phone No
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 transition-all focus:border-[#5B7CFF] focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]/20"
                  placeholder="Enter phone number"
                />
              </div>
            </div>
          </section>

          <section className="bg-gray-50 p-6 sm:p-8">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  void handleSave();
                }}
                disabled={isSaving || isLoading}
                className="rounded-lg bg-[#5B7CFF] px-8 py-3 font-semibold text-white transition-all duration-300 hover:bg-[#4a6bef] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </section>
        </div>

        <section className="mt-8">
          <h2 className="mb-6 text-xl font-bold text-gray-800">ประวัติการจอง</h2>
          <div className="space-y-4">
            {bookings.length > 0 ? (
              bookings.map((booking) => (
                <BookingHistoryCard key={booking.id} booking={booking} />
              ))
            ) : (
              <div className="flex items-center justify-center py-12">
                <p className="text-lg text-gray-500">ยังไม่มีประวัติการจอง</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
