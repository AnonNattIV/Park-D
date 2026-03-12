'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
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
  bookingStatus?: string;
  durationMinutes: number | null;
  totalPrice: number;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  paymentAmount?: number | null;
};

type WalletTransaction = {
  id: number;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  note: string | null;
  bookingId: number | null;
  paymentId: number | null;
  createdAt: string;
};

type WalletSummary = {
  id: number;
  balance: number;
  transactions: WalletTransaction[];
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
  wallet?: WalletSummary;
  error?: string;
};

const BANGKOK_TIMEZONE = 'Asia/Bangkok';

function parseDateValue(dateValue: string | null): Date | null {
  if (!dateValue) {
    return null;
  }

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function formatScheduledDate(
  checkinTime: string | null,
  bookingTimeFallback: string
): string {
  const source = checkinTime || bookingTimeFallback;
  const parsed = parseDateValue(source);
  if (!parsed) {
    return '-';
  }

  return parsed.toLocaleDateString('th-TH', {
    timeZone: BANGKOK_TIMEZONE,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatTime(dateValue: string | null): string {
  const parsed = parseDateValue(dateValue);
  if (!parsed) {
    return '-';
  }

  return parsed.toLocaleTimeString('th-TH', {
    timeZone: BANGKOK_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatWalletTransactionTime(dateValue: string): string {
  const parsed = parseDateValue(dateValue);
  if (!parsed) {
    return '-';
  }

  return parsed.toLocaleString('th-TH', {
    timeZone: BANGKOK_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeWalletNote(note: string | null): string {
  if (!note) {
    return '-';
  }

  const cleaned = note
    .replace(/\((OWNER_APPROVED|AUTO_APPROVED_7H|AUTO_CHECKOUT_NO_CHECKIN)\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || '-';
}

function describeWalletTransaction(tx: WalletTransaction): string {
  const normalizedType = tx.type.toUpperCase();
  const normalizedNote = (tx.note || '').toLowerCase();

  if (normalizedType === 'TOPUP') {
    if (
      normalizedNote.includes('income from parking lot') ||
      normalizedNote.includes('owner payout') ||
      normalizedNote.includes('parking lot')
    ) {
      return 'Income from parking lot';
    }

    return 'Wallet top-up';
  }

  if (normalizedType === 'REFUND') {
    if (
      normalizedNote.includes('deposit returned') ||
      normalizedNote.includes('checkout settlement renter refund') ||
      normalizedNote.includes('checkout')
    ) {
      return 'Deposit returned';
    }

    if (normalizedNote.includes('cancelled booking') || normalizedNote.includes('cancelled')) {
      return 'Refund from cancelled booking';
    }

    return 'Wallet refund';
  }

  if (normalizedType === 'DEBIT') {
    return 'Penalty charged from wallet balance';
  }

  return normalizeWalletNote(tx.note);
}

function formatDuration(durationMinutes: number | null): string {
  if (!durationMinutes || durationMinutes <= 0) {
    return '-';
  }

  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours} hr ${minutes} min`;
  }

  if (hours > 0) {
    return `${hours} hr`;
  }

  return `${minutes} min`;
}

function mapBookingStatusLabel(
  bookingStatus: string | undefined,
  paymentStatus: string | null | undefined
): string {
  const normalizedBookingStatus = (bookingStatus || '-').toUpperCase();
  const normalizedPaymentStatus = (paymentStatus || '').toUpperCase();

  if (normalizedBookingStatus === 'WAITING_FOR_PAYMENT' && normalizedPaymentStatus === 'PENDING') {
    return 'UNDER PROGRESS OF CHECKING';
  }

  if (normalizedBookingStatus === 'PAYMENT_CONFIRMED' && normalizedPaymentStatus === 'PAID') {
    return 'CHECKOUT';
  }

  return normalizedBookingStatus;
}

function mapBookingToCard(booking: ApiBookingHistory): BookingHistory {
  return {
    id: booking.id,
    parkingName: booking.parkingName,
    date: formatScheduledDate(booking.checkinTime, booking.bookingTime),
    startTime: formatTime(booking.checkinTime),
    endTime: formatTime(booking.checkoutTime),
    duration: formatDuration(booking.durationMinutes),
    totalPrice:
      // Prefer stored payment amount when available; fallback to computed booking total.
      booking.paymentAmount !== null && booking.paymentAmount !== undefined
        ? booking.paymentAmount
        : booking.totalPrice,
    paymentStatus: booking.paymentStatus,
    paymentMethod: booking.paymentMethod,
    bookingStatus: mapBookingStatusLabel(booking.bookingStatus, booking.paymentStatus),
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
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [expandedWalletTransactionId, setExpandedWalletTransactionId] = useState<number | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeletingImage, setIsDeletingImage] = useState(false);
  const [isSendingSecurityCode, setIsSendingSecurityCode] = useState(false);
  const [securityCodeCooldownSeconds, setSecurityCodeCooldownSeconds] = useState(0);
  const [isCheckingCurrentEmailCode, setIsCheckingCurrentEmailCode] = useState(false);
  const [isCheckingNewEmailCode, setIsCheckingNewEmailCode] = useState(false);
  const [isCheckingPassword, setIsCheckingPassword] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isCurrentEmailCodeChecked, setIsCurrentEmailCodeChecked] = useState(false);
  const [isNewEmailCodeChecked, setIsNewEmailCodeChecked] = useState(false);
  const [isPasswordChecked, setIsPasswordChecked] = useState(false);
  const [currentEmailCode, setCurrentEmailCode] = useState('');
  const [newEmailCode, setNewEmailCode] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const authUserId = authUser?.id;
  const authUsername = authUser?.username;
  const normalizedCurrentEmail = (authUser?.email || '').toLowerCase();
  const normalizedFormEmail = formData.email.trim().toLowerCase();
  const isEmailChangePending = Boolean(normalizedFormEmail && normalizedFormEmail !== normalizedCurrentEmail);

  useEffect(() => {
    // Client-side guard for routes that require auth token + user payload.
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
      // Single call hydrates profile, recent bookings, and wallet summary panel.
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
        setWallet(result.wallet || null);

        // Refresh local auth cache so header/tabs use latest user profile values.
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
        setLoadError('à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¹‚à¸«à¸¥à¸”à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹‚à¸›à¸£à¹„à¸Ÿà¸¥à¹Œà¹„à¸”à¹‰à¹ƒà¸™à¸•à¸­à¸™à¸™à¸µà¹‰');
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

  useEffect(() => {
    setExpandedWalletTransactionId(null);
  }, [wallet?.id]);

  useEffect(() => {
    if (securityCodeCooldownSeconds <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setSecurityCodeCooldownSeconds((previous) => (previous > 0 ? previous - 1 : 0));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [securityCodeCooldownSeconds]);

  const handleInputChange = (field: keyof ProfileForm, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (field === 'email') {
      setIsCurrentEmailCodeChecked(false);
      setIsNewEmailCodeChecked(false);
    }
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
      setSuccessMessage('à¸­à¸±à¸›à¹‚à¸«à¸¥à¸”à¸£à¸¹à¸›à¹‚à¸›à¸£à¹„à¸Ÿà¸¥à¹Œà¹€à¸£à¸µà¸¢à¸šà¸£à¹‰à¸­à¸¢à¹à¸¥à¹‰à¸§');

      const nextStoredUser: AuthUser = {
        ...authUser,
        profileImageUrl: result.imageUrl,
      };
      setAuthUser(nextStoredUser);
      updateStoredAuthUser(nextStoredUser);
    } catch (error) {
      console.error('Avatar upload error:', error);
      setFormError('à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸­à¸±à¸›à¹‚à¸«à¸¥à¸”à¸£à¸¹à¸›à¹‚à¸›à¸£à¹„à¸Ÿà¸¥à¹Œà¹„à¸”à¹‰');
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
      setSuccessMessage('à¸¥à¸šà¸£à¸¹à¸›à¹‚à¸›à¸£à¹„à¸Ÿà¸¥à¹Œà¹€à¸£à¸µà¸¢à¸šà¸£à¹‰à¸­à¸¢à¹à¸¥à¹‰à¸§');

      const nextStoredUser: AuthUser = {
        ...authUser,
        profileImageUrl: null,
      };
      setAuthUser(nextStoredUser);
      updateStoredAuthUser(nextStoredUser);
    } catch (error) {
      console.error('Avatar delete error:', error);
      setFormError('à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸¥à¸šà¸£à¸¹à¸›à¹‚à¸›à¸£à¹„à¸Ÿà¸¥à¹Œà¹„à¸”à¹‰');
    } finally {
      setIsDeletingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSendSecurityCode = async () => {
    if (!token || !authUser) {
      return;
    }
    if (securityCodeCooldownSeconds > 0) {
      setFormError(`Please wait ${securityCodeCooldownSeconds}s before sending new code`);
      return;
    }

    const nextEmail = normalizedFormEmail;
    if (!nextEmail) {
      setFormError('Email is required before requesting verification code');
      return;
    }
    if (nextEmail === normalizedCurrentEmail) {
      setFormError('Please change email before requesting verification code');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setFormError('Invalid new email format');
      return;
    }

    setFormError('');
    setSuccessMessage('');
    setIsSendingSecurityCode(true);

    try {
      const response = await fetch('/api/auth/sensitive-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          newEmail: nextEmail,
        }),
      });

      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
        retryAfterSeconds?: number;
      };

      if (!response.ok) {
        if (response.status === 429 && Number(result.retryAfterSeconds || 0) > 0) {
          setSecurityCodeCooldownSeconds(Number(result.retryAfterSeconds || 0));
        }
        throw new Error(result.error || 'Unable to send verification code');
      }

      setIsCurrentEmailCodeChecked(false);
      setIsNewEmailCodeChecked(false);
      setSecurityCodeCooldownSeconds(Math.max(Number(result.retryAfterSeconds || 60), 60));
      setSuccessMessage(
        result.message || 'Verification codes sent to your current and new email.'
      );
    } catch (error) {
      console.error('Send security code error:', error);
      setFormError(
        error instanceof Error ? error.message : 'Unable to send verification code right now'
      );
    } finally {
      setIsSendingSecurityCode(false);
    }
  };

  const handleCheckSecurityCode = async (channel: 'CURRENT' | 'NEW') => {
    if (!token || !authUser) {
      return;
    }

    const nextEmail = normalizedFormEmail;
    const code = channel === 'CURRENT' ? currentEmailCode.trim() : newEmailCode.trim();

    if (!nextEmail || !isEmailChangePending) {
      setFormError('Please change email before checking verification code');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setFormError('Invalid new email format');
      return;
    }
    if (!code) {
      setFormError('Verification code is required');
      return;
    }

    setFormError('');
    setSuccessMessage('');
    if (channel === 'CURRENT') {
      setIsCheckingCurrentEmailCode(true);
    } else {
      setIsCheckingNewEmailCode(true);
    }

    try {
      const response = await fetch('/api/auth/sensitive-code/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          newEmail: nextEmail,
          code,
          channel,
        }),
      });

      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(result.error || 'Unable to verify code');
      }

      if (channel === 'CURRENT') {
        setIsCurrentEmailCodeChecked(true);
      } else {
        setIsNewEmailCodeChecked(true);
      }
      setSuccessMessage(
        result.message ||
          (channel === 'CURRENT'
            ? 'Current-email verification code is valid.'
            : 'New-email verification code is valid.')
      );
    } catch (error) {
      console.error('Check security code error:', error);
      if (channel === 'CURRENT') {
        setIsCurrentEmailCodeChecked(false);
      } else {
        setIsNewEmailCodeChecked(false);
      }
      setFormError(error instanceof Error ? error.message : 'Unable to verify code right now');
    } finally {
      if (channel === 'CURRENT') {
        setIsCheckingCurrentEmailCode(false);
      } else {
        setIsCheckingNewEmailCode(false);
      }
    }
  };

  const handleCheckPassword = async () => {
    if (!token || !authUser) {
      return;
    }

    const trimmedNewPassword = newPassword.trim();
    const trimmedConfirmNewPassword = confirmNewPassword.trim();

    if (!currentPassword) {
      setFormError('Current password is required to change password');
      return;
    }
    if (!trimmedNewPassword || !trimmedConfirmNewPassword) {
      setFormError('New password and confirm password are required');
      return;
    }
    if (trimmedNewPassword !== trimmedConfirmNewPassword) {
      setFormError('New password and confirm password do not match');
      return;
    }

    setFormError('');
    setSuccessMessage('');
    setIsCheckingPassword(true);

    try {
      const response = await fetch('/api/auth/password-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword: trimmedNewPassword,
          confirmNewPassword: trimmedConfirmNewPassword,
        }),
      });

      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(result.error || 'Unable to check password');
      }

      setIsPasswordChecked(true);
      setSuccessMessage(result.message || 'Password information is valid.');
    } catch (error) {
      console.error('Check password error:', error);
      setIsPasswordChecked(false);
      setFormError(error instanceof Error ? error.message : 'Unable to check password right now');
    } finally {
      setIsCheckingPassword(false);
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
    const normalizedEmail = email.toLowerCase();
    const trimmedNewPassword = newPassword.trim();
    const trimmedConfirmNewPassword = confirmNewPassword.trim();
    const currentEmail = (authUser.email || '').toLowerCase();
    const emailChanged = normalizedEmail !== currentEmail;
    const passwordChangeRequested = trimmedNewPassword.length > 0;
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

    if (trimmedConfirmNewPassword && !passwordChangeRequested) {
      setFormError('Please enter new password before confirm password');
      return;
    }

    if (passwordChangeRequested) {
      if (!currentPassword) {
        setFormError('Current password is required to change password');
        return;
      }

      if (trimmedNewPassword !== trimmedConfirmNewPassword) {
        setFormError('New password and confirm password do not match');
        return;
      }
    }

    if (emailChanged && (!currentEmailCode.trim() || !newEmailCode.trim())) {
      setFormError('Both current-email and new-email verification codes are required');
      return;
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
          email: normalizedEmail,
          phone: formData.phone.trim(),
          currentPassword,
          newPassword: trimmedNewPassword,
          currentEmailCode: currentEmailCode.trim(),
          newEmailCode: newEmailCode.trim(),
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
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setCurrentEmailCode('');
      setNewEmailCode('');
      setIsCurrentEmailCodeChecked(false);
      setIsNewEmailCodeChecked(false);
      setSuccessMessage('à¸šà¸±à¸™à¸—à¸¶à¸à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹‚à¸›à¸£à¹„à¸Ÿà¸¥à¹Œà¹€à¸£à¸µà¸¢à¸šà¸£à¹‰à¸­à¸¢à¹à¸¥à¹‰à¸§');
    } catch (error) {
      console.error('Profile save error:', error);
      setFormError(
        error instanceof Error ? error.message : 'à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸šà¸±à¸™à¸—à¸¶à¸à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹‚à¸›à¸£à¹„à¸Ÿà¸¥à¹Œà¹„à¸”à¹‰'
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

            <div className="grid grid-cols-1 gap-6">
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

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">Email Change</p>
                <p className="mt-1 text-xs text-slate-500">
                  Email change requires one code from current email and one code from new email.
                </p>

                <div className="mt-4 space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Current Email
                    </label>
                    <input
                      type="text"
                      value={normalizedCurrentEmail || '-'}
                      disabled
                      className="w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-100 px-4 py-3 text-gray-500"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      New Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 transition-all focus:border-[#5B7CFF] focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]/20"
                      placeholder="Enter new email address"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      void handleSendSecurityCode();
                    }}
                    disabled={
                      isSendingSecurityCode ||
                      !isEmailChangePending ||
                      securityCodeCooldownSeconds > 0
                    }
                    className="rounded-lg border border-[#5B7CFF] bg-white px-4 py-2 text-sm font-semibold text-[#5B7CFF] transition hover:bg-[#EEF2FF] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSendingSecurityCode
                      ? 'Sending code...'
                      : securityCodeCooldownSeconds > 0
                        ? `Send again in ${securityCodeCooldownSeconds}s`
                        : 'Send Verification Codes'}
                  </button>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Current Email Code
                    </label>
                    <input
                      type="text"
                      value={currentEmailCode}
                      onChange={(e) => {
                        setCurrentEmailCode(e.target.value);
                        if (isCurrentEmailCodeChecked) {
                          setIsCurrentEmailCodeChecked(false);
                        }
                      }}
                      className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 transition-all focus:border-[#5B7CFF] focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]/20"
                      placeholder="Code sent to current email"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        void handleCheckSecurityCode('CURRENT');
                      }}
                      disabled={
                        isCheckingCurrentEmailCode ||
                        !isEmailChangePending ||
                        !currentEmailCode.trim()
                      }
                      className="rounded-lg border border-emerald-500 bg-white px-4 py-2 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCheckingCurrentEmailCode ? 'Checking...' : 'Check Current Code'}
                    </button>
                    {isCurrentEmailCodeChecked ? (
                      <span className="text-xs font-semibold text-emerald-600">
                        Current code checked
                      </span>
                    ) : null}
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      New Email Code
                    </label>
                    <input
                      type="text"
                      value={newEmailCode}
                      onChange={(e) => {
                        setNewEmailCode(e.target.value);
                        if (isNewEmailCodeChecked) {
                          setIsNewEmailCodeChecked(false);
                        }
                      }}
                      className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 transition-all focus:border-[#5B7CFF] focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]/20"
                      placeholder="Code sent to new email"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        void handleCheckSecurityCode('NEW');
                      }}
                      disabled={isCheckingNewEmailCode || !isEmailChangePending || !newEmailCode.trim()}
                      className="rounded-lg border border-emerald-500 bg-white px-4 py-2 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCheckingNewEmailCode ? 'Checking...' : 'Check New Code'}
                    </button>
                    {isNewEmailCodeChecked ? (
                      <span className="text-xs font-semibold text-emerald-600">
                        New code checked
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">Password Change</p>
                <p className="mt-1 text-xs text-slate-500">
                  Password change requires only your current password.
                </p>

                <div className="mt-4 space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => {
                        setCurrentPassword(e.target.value);
                        if (isPasswordChecked) {
                          setIsPasswordChecked(false);
                        }
                      }}
                      className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 transition-all focus:border-[#5B7CFF] focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]/20"
                      placeholder="Required only for password change"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        if (isPasswordChecked) {
                          setIsPasswordChecked(false);
                        }
                      }}
                      className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 transition-all focus:border-[#5B7CFF] focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]/20"
                      placeholder="Leave empty to keep current password"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={confirmNewPassword}
                      onChange={(e) => {
                        setConfirmNewPassword(e.target.value);
                        if (isPasswordChecked) {
                          setIsPasswordChecked(false);
                        }
                      }}
                      className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 transition-all focus:border-[#5B7CFF] focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]/20"
                      placeholder="Confirm new password"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        void handleCheckPassword();
                      }}
                      disabled={
                        isCheckingPassword ||
                        !currentPassword ||
                        !newPassword.trim() ||
                        !confirmNewPassword.trim()
                      }
                      className="rounded-lg border border-emerald-500 bg-white px-4 py-2 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCheckingPassword ? 'Checking...' : 'Check Password'}
                    </button>
                    {isPasswordChecked ? (
                      <span className="text-xs font-semibold text-emerald-600">
                        Password checked
                      </span>
                    ) : null}
                  </div>
                </div>
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
          <h2 className="mb-4 text-xl font-bold text-gray-800">Wallet</h2>
          <div className="mb-6 rounded-xl bg-white p-5 shadow-md">
            <p className="text-sm text-gray-500">Current Balance</p>
            <p className="mt-1 text-3xl font-bold text-[#5B7CFF]">
              {(wallet?.balance || 0).toLocaleString('th-TH', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              THB
            </p>
            {wallet?.transactions?.length ? (
              <div className="mt-4 space-y-2">
                {wallet.transactions.slice(0, 5).map((tx) => (
                  <div key={tx.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedWalletTransactionId((previousId) =>
                          previousId === tx.id ? null : tx.id
                        );
                      }}
                      className="flex w-full items-center justify-between text-left"
                    >
                      <div>
                        <p className="font-medium text-gray-700">{describeWalletTransaction(tx)}</p>
                        <p className="text-xs text-gray-500">
                          {formatWalletTransactionTime(tx.createdAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`font-semibold ${
                            tx.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {tx.amount >= 0 ? '+' : '-'}
                          {Math.abs(tx.amount).toLocaleString('th-TH', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{' '}
                          THB
                        </p>
                        <p className="text-[11px] text-[#5B7CFF]">
                          {expandedWalletTransactionId === tx.id ? 'Hide details' : 'View details'}
                        </p>
                      </div>
                    </button>
                    {expandedWalletTransactionId === tx.id ? (
                      <div className="mt-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                        <p>Note: {normalizeWalletNote(tx.note)}</p>
                        <p className="mt-1">
                          Balance: {tx.balanceBefore.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                          THB to{' '}
                          {tx.balanceAfter.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                          THB
                        </p>
                        <p className="mt-1">
                          Ref: booking #{tx.bookingId ?? '-'}, payment #{tx.paymentId ?? '-'}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-gray-500">No wallet transactions yet.</p>
            )}
          </div>
          <h2 className="mb-6 text-xl font-bold text-gray-800">Booking History</h2>
          <div className="space-y-4">
            {bookings.length > 0 ? (
              bookings.map((booking) => (
                <Link key={booking.id} href={`/booking-history/${booking.id}`} className="block">
                  <BookingHistoryCard booking={booking} />
                </Link>
              ))
            ) : (
              <div className="flex items-center justify-center py-12">
                <p className="text-lg text-gray-500">No booking history yet.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
