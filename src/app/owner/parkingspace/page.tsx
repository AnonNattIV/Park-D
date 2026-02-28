'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import Tabbar from '@/components/Tabbar';
import ParkingImageUploader from '@/components/ParkingImageUploader';

// Type Definitions
interface ParkingForm {
  name: string;
  location: string;
  pricePerHour: number;
  description: string;
  images: File[];
  status: 'pending';
}

export default function ParkingSpacePage() {
  const router = useRouter();

  const [formData, setFormData] = useState<ParkingForm>({
    name: '',
    location: '',
    pricePerHour: 0,
    description: '',
    images: [],
    status: 'pending',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof Omit<ParkingForm, 'images' | 'status'>, string>>>({});

  const handleInputChange = (
    field: keyof Omit<ParkingForm, 'images' | 'status'>,
    value: string | number
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleImagesChange = (images: File[]) => {
    setFormData((prev) => ({ ...prev, images }));
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof Omit<ParkingForm, 'images' | 'status'>, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'จำเป็นต้องระบุชื่อ';
    }
    if (!formData.location.trim()) {
      newErrors.location = 'จำเป็นต้องระบุสถานที่';
    }
    if (!formData.pricePerHour || formData.pricePerHour < 0) {
      newErrors.pricePerHour = 'จำเป็นต้องระบุราคา';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validateForm()) {
      alert('ส่งคำขอเพิ่มพื้นที่สำเร็จ');
      // Here you would typically send data to backend
      console.log('Submitted data:', formData);
      // Reset form state
      setFormData({
        name: '',
        location: '',
        pricePerHour: 0,
        description: '',
        images: [],
        status: 'pending',
      });
      router.push('/owner/home');
    }
  };

  const handleBack = () => {
    router.push('/owner/home');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Tabbar />

      {/* Fixed Submit Section - Bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-blue-50 border-t border-blue-100 px-4 py-4 z-40">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={handleSubmit}
            className="w-full py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-all duration-200"
          >
            ยืนยันการเพิ่มและรออนุมัติ
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-32">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-gray-600 hover:text-blue-600 transition-colors mb-4"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            <span>กลับ</span>
          </button>
          <h1 className="text-2xl font-bold text-gray-800">เพิ่มพื้นที่ปล่อยเช่า</h1>
        </div>

        {/* Main Form Container */}
        <div className="bg-white rounded-xl shadow-md p-8 space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ชื่อ <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className={`w-full px-4 py-3 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 ${
                errors.name
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-gray-200 focus:border-blue-500'
              }`}
              placeholder="ชื่อพื้นที่จอดรถ"
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              สถานที่ <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => handleInputChange('location', e.target.value)}
              className={`w-full px-4 py-3 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 ${
                errors.location
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-gray-200 focus:border-blue-500'
              }`}
              placeholder="ที่อยู่พื้นที่จอดรถ"
            />
            {errors.location && <p className="text-red-500 text-xs mt-1">{errors.location}</p>}
          </div>

          {/* Price per hour */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ราคา / ชั่วโมง <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                value={formData.pricePerHour}
                onChange={(e) => handleInputChange('pricePerHour', parseFloat(e.target.value) || 0)}
                min="0"
                step="0.5"
                className={`w-full px-4 py-3 pr-16 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 ${
                  errors.pricePerHour
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-gray-200 focus:border-blue-500'
                }`}
                placeholder="ราคาต่อชั่วโมง"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                บาท
              </span>
            </div>
            {errors.pricePerHour && <p className="text-red-500 text-xs mt-1">{errors.pricePerHour}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              คำอธิบาย (เพิ่มเติม)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              rows={4}
              className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 resize-none"
              placeholder="รายละเอียดเพิ่มเติมเกี่ยวกับพื้นที่จอดรถ..."
            />
          </div>

          {/* Image Upload */}
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
