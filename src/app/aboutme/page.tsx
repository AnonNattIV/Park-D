'use client';

import { useState, useRef } from 'react';
import { UserCircleIcon, CloudArrowUpIcon, TrashIcon } from '@heroicons/react/24/outline';
import Tabbar from '@/components/Tabbar';
import BookingHistoryCard, { BookingHistory } from '@/components/BookingHistoryCard';

// Type Definitions
interface ProfileForm {
  firstName: string;
  lastName: string;
  gender: string;
  age: number;
  email: string;
  phone: string;
  avatar: string | null;
}

const GENDER_OPTIONS = ['Male', 'Female', 'Other'];

export default function ProfilePage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<ProfileForm>({
    firstName: '',
    lastName: '',
    gender: '',
    age: 0,
    email: '',
    phone: '',
    avatar: null,
  });

  const [errors, setErrors] = useState<Partial<Record<keyof ProfileForm, string>>>({});

  const handleInputChange = (field: keyof ProfileForm, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const imageUrl = URL.createObjectURL(file);
      setFormData((prev) => ({ ...prev, avatar: imageUrl }));
    }
  };

  const handleAvatarDelete = () => {
    setFormData((prev) => ({ ...prev, avatar: null }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof ProfileForm, string>> = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }
    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }
    if (!formData.gender) {
      newErrors.gender = 'Gender is required';
    }
    if (!formData.age || formData.age < 1) {
      newErrors.age = 'Valid age is required';
    }
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (validateForm()) {
      alert('Profile saved successfully!');
      // Here you would typically send data to backend
      console.log('Saved data:', formData);
    }
  };

  // Mock Data for Booking History
  const mockBookings: BookingHistory[] = [
    {
      id: '1',
      parkingName: 'Park A',
      date: '17/01/2025',
      startTime: '6:00 AM',
      endTime: '7:00 AM',
      duration: '1 ชั่วโมง',
      totalPrice: 20,
    },
    {
      id: '2',
      parkingName: 'Park B',
      date: '25/01/2025',
      startTime: '6:00 AM',
      endTime: '8:00 AM',
      duration: '2 ชั่วโมง',
      totalPrice: 40,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Tabbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {/* Profile Image Section */}
          <section className="bg-gray-50 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              {/* Avatar */}
              <div className="relative group">
                <div
                  className="w-[120px] h-[120px] rounded-full overflow-hidden shadow-md transition-transform duration-300 group-hover:scale-105 bg-gradient-to-br from-[#5B7CFF] to-[#4a7bff]"
                >
                  {formData.avatar ? (
                    <img
                      src={formData.avatar}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UserCircleIcon className="w-full h-full text-white p-4" />
                  )}
                </div>
              </div>

              {/* Avatar Actions */}
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 bg-[#5B7CFF] text-white font-medium rounded-lg hover:bg-[#4a6bef] hover:shadow-md transition-all duration-300"
                >
                  <CloudArrowUpIcon className="w-5 h-5" />
                  <span>Upload New Picture</span>
                </button>
                {formData.avatar && (
                  <button
                    onClick={handleAvatarDelete}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 hover:shadow-md transition-all duration-300"
                  >
                    <TrashIcon className="w-5 h-5" />
                    <span>Delete</span>
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Personal Info Section */}
          <section className="p-6 sm:p-8 border-b border-gray-100">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-800">Personal Info</h2>
              <p className="text-sm text-gray-500 mt-1">Provide your Personal Info</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* First Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => handleInputChange('firstName', e.target.value)}
                  className={`w-full px-4 py-3 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]/20 transition-all ${
                    errors.firstName
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-gray-200 focus:border-[#5B7CFF]'
                  }`}
                  placeholder="Enter first name"
                />
                {errors.firstName && (
                  <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>
                )}
              </div>

              {/* Last Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => handleInputChange('lastName', e.target.value)}
                  className={`w-full px-4 py-3 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]/20 transition-all ${
                    errors.lastName
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-gray-200 focus:border-[#5B7CFF]'
                  }`}
                  placeholder="Enter last name"
                />
                {errors.lastName && (
                  <p className="text-red-500 text-xs mt-1">{errors.lastName}</p>
                )}
              </div>

              {/* Gender */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Gender <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.gender}
                  onChange={(e) => handleInputChange('gender', e.target.value)}
                  className={`w-full px-4 py-3 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]/20 transition-all cursor-pointer ${
                    errors.gender
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-gray-200 focus:border-[#5B7CFF]'
                  }`}
                >
                  <option value="" disabled>
                    Select gender
                  </option>
                  {GENDER_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {errors.gender && (
                  <p className="text-red-500 text-xs mt-1">{errors.gender}</p>
                )}
              </div>

              {/* Age */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Age <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={formData.age}
                  onChange={(e) => handleInputChange('age', parseInt(e.target.value) || 0)}
                  min="1"
                  max="150"
                  className={`w-full px-4 py-3 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]/20 transition-all ${
                    errors.age
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-gray-200 focus:border-[#5B7CFF]'
                  }`}
                  placeholder="Enter age"
                />
                {errors.age && <p className="text-red-500 text-xs mt-1">{errors.age}</p>}
              </div>
            </div>
          </section>

          {/* Contact Info Section */}
          <section className="p-6 sm:p-8 border-b border-gray-100">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-800">Contact Info</h2>
              <p className="text-sm text-gray-500 mt-1">Provide your Contact Informations</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className={`w-full px-4 py-3 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]/20 transition-all ${
                    errors.email
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-gray-200 focus:border-[#5B7CFF]'
                  }`}
                  placeholder="Enter email address"
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone No</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]/20 focus:border-[#5B7CFF] transition-all"
                  placeholder="Enter phone number"
                />
              </div>
            </div>
          </section>

          {/* Save Button Section */}
          <section className="p-6 sm:p-8 bg-gray-50">
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                className="px-8 py-3 bg-[#5B7CFF] text-white font-semibold rounded-lg hover:bg-[#4a6bef] hover:shadow-md transition-all duration-300"
              >
                Save Changes
              </button>
            </div>
          </section>
        </div>

        {/* Booking History Section */}
        <section className="mt-8">
          <h2 className="text-xl font-bold text-gray-800 mb-6">ประวัติการจอง</h2>
          <div className="space-y-4">
            {mockBookings.length > 0 ? (
              mockBookings.map((booking) => (
                <BookingHistoryCard key={booking.id} booking={booking} />
              ))
            ) : (
              <div className="flex items-center justify-center py-12">
                <p className="text-gray-500 text-lg">ยังไม่มีประวัติการจอง</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
