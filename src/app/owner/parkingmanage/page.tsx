'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, PencilIcon } from '@heroicons/react/24/outline';
import Tabbar from '@/components/Tabbar';
import ManageParkingImages from '@/components/ManageParkingImages';

// Type Definitions
interface ParkingManage {
  id: string;
  name: string;
  location: string;
  pricePerHour: number;
  description: string;
  images: string[];
}

type ParkingManageFormData = Omit<ParkingManage, 'id'>;

export default function ParkingManagePage() {
  const router = useRouter();

  // Mock parking data
  const [originalParkingData, setOriginalParkingData] = useState<ParkingManage>({
    id: '',
    name: '',
    location: '',
    pricePerHour: 0,
    description: '',
    images: [],
  });

  const [formData, setFormData] = useState<ParkingManageFormData>({
    name: '',
    location: '',
    pricePerHour: 0,
    description: '',
    images: [],
  });

  const [isEditMode, setIsEditMode] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof ParkingManageFormData, string>>>({});

  // Initialize form data when component mounts
  useEffect(() => {
    setFormData({
      name: originalParkingData.name,
      location: originalParkingData.location,
      pricePerHour: originalParkingData.pricePerHour,
      description: originalParkingData.description,
      images: [...originalParkingData.images],
    });
  }, [originalParkingData]);

  const handleInputChange = (
    field: keyof ParkingManageFormData,
    value: string | number | 'available' | 'unavailable' | string[]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field when user starts typing
    if (errors[field as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof ParkingManageFormData, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'จำเป็นต้องระบุชื่อพื้นที่';
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

  const handleEditClick = () => {
    setIsEditMode(true);
  };

  const handleCancelEdit = () => {
    // Revert to original state
    setFormData({
      name: originalParkingData.name,
      location: originalParkingData.location,
      pricePerHour: originalParkingData.pricePerHour,
      description: originalParkingData.description,
      images: [...originalParkingData.images],
    });
    setErrors({});
    setIsEditMode(false);
  };

  const handleSave = () => {
    if (validateForm()) {
      // Here you would typically send data to backend
      console.log('Updated parking data:', {
        id: originalParkingData.id,
        ...formData,
      });
      // Update original data
      setOriginalParkingData({
        ...originalParkingData,
        ...formData,
      } as ParkingManage);
      alert('บันทึกการเปลี่ยนแปลงสำเร็จ');
      setIsEditMode(false);
      // TODO: Call PUT /api/owner/parking/:id
    }
  };

  const handleDelete = () => {
    const confirmed = confirm('คุณต้องการลบพื้นที่นี้หรือไม่?');
    if (confirmed) {
      // Here you would typically call DELETE /api/owner/parking/:id
      console.log('Deleting parking:', originalParkingData.id);
      alert('ลบสำเร็จ');
      router.push('/owner/home');
    }
  };

  const handleBack = () => {
    router.push('/owner/home');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Tabbar />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-gray-600 hover:text-blue-600 transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            <span>กลับ</span>
          </button>

          {!isEditMode ? (
            <button
              onClick={handleEditClick}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-all duration-200"
            >
              <PencilIcon className="w-4 h-4" />
              <span>แก้ไขข้อมูล</span>
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleCancelEdit}
                className="px-4 py-2 bg-white text-gray-700 font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-all duration-200"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-all duration-200"
              >
                บันทึกการเปลี่ยนแปลง
              </button>
            </div>
          )}
        </div>

        {/* Page Title */}
        <h1 className="text-2xl font-bold text-gray-800 mb-8">จัดการพื้นที่ปล่อยเช่า</h1>

        {/* Main Form Container */}
        <div className="bg-white rounded-xl shadow-md p-8 space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ชื่อพื้นที่
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              disabled={!isEditMode}
              className={`w-full px-4 py-3 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 ${
                !isEditMode ? 'bg-gray-100 text-gray-600 cursor-not-allowed' : ''
              } ${errors.name ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-blue-500'}`}
              placeholder="ชื่อพื้นที่จอดรถ"
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              สถานที่
            </label>
            <textarea
              value={formData.location}
              onChange={(e) => handleInputChange('location', e.target.value)}
              rows={3}
              disabled={!isEditMode}
              className={`w-full px-4 py-3 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 resize-none ${
                !isEditMode ? 'bg-gray-100 text-gray-600 cursor-not-allowed' : ''
              } ${errors.location ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-blue-500'}`}
              placeholder="ที่อยู่พื้นที่จอดรถ"
            />
            {errors.location && <p className="text-red-500 text-xs mt-1">{errors.location}</p>}
          </div>

          {/* Price per hour */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ราคา / ชั่วโมง
            </label>
            <div className="relative">
              <input
                type="number"
                value={formData.pricePerHour}
                onChange={(e) => handleInputChange('pricePerHour', parseFloat(e.target.value) || 0)}
                min="0"
                step="0.5"
                disabled={!isEditMode}
                className={`w-full px-4 py-3 pr-16 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 ${
                  !isEditMode ? 'bg-gray-100 text-gray-600 cursor-not-allowed' : ''
                } ${errors.pricePerHour ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-blue-500'}`}
                placeholder="ราคาต่อชั่วโมง"
              />
              <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-sm ${
                !isEditMode ? 'text-gray-400' : 'text-gray-500'
              }`}>
                บาท
              </span>
            </div>
            {errors.pricePerHour && <p className="text-red-500 text-xs mt-1">{errors.pricePerHour}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              คำอธิบาย
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              rows={4}
              disabled={!isEditMode}
              className={`w-full px-4 py-3 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 resize-none ${
                !isEditMode ? 'bg-gray-100 text-gray-600 cursor-not-allowed' : ''
              }`}
              placeholder="รายละเอียดเพิ่มเติมเกี่ยวกับพื้นที่จอดรถ..."
            />
          </div>

          {/* Images */}
          <ManageParkingImages
            images={formData.images}
            onImagesChange={(images) => handleInputChange('images', images)}
            maxImages={10}
            isEditable={isEditMode}
          />        
        </div>

        {/* Delete Section - Danger Zone */}
        <div className="mt-8 border-2 border-red-200 rounded-xl p-6 bg-red-50/50">
          <h3 className="text-lg font-semibold text-red-800 mb-4">Danger Zone</h3>
          <p className="text-sm text-red-600 mb-4">
            การดำเนินการนี้ไม่สามารถย้อนกลับได้ กรุณาตรวจสอบให้แน่ใจก่อนดำเนินการ
          </p>
          <button
            onClick={handleDelete}
            className="px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-all duration-200"
          >
            ลบพื้นที่นี้
          </button>
        </div>
      </div>
    </div>
  );
}
