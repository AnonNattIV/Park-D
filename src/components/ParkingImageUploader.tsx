'use client';

import { useState, useRef } from 'react';
import { XMarkIcon, PlusIcon } from '@heroicons/react/24/outline';

interface ParkingImageUploaderProps {
  images: File[];
  onImagesChange: (images: File[]) => void;
  maxImages?: number;
}

export default function ParkingImageUploader({
  images,
  onImagesChange,
  maxImages = 5,
}: ParkingImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newImages = Array.from(files).slice(0, maxImages - images.length);
      onImagesChange([...images, ...newImages]);
    }
  };

  const handleRemoveImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    onImagesChange(newImages);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-3">
        รูปถ่าย
      </label>

      {/* Upload Box */}
      <div
        onClick={handleUploadClick}
        className="w-[150px] h-[150px] rounded-lg border-2 border-dashed border-gray-300
          flex flex-col items-center justify-center cursor-pointer
          hover:border-[#5B7CFF] hover:bg-blue-50 transition-all duration-200"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageUpload}
          className="hidden"
        />
        <PlusIcon className="w-8 h-8 text-gray-400 mb-2" />
        <span className="text-sm text-gray-500">add photos</span>
      </div>

      {/* Preview Thumbnails */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-4">
          {images.map((image, index) => (
            <div key={index} className="relative group">
              <img
                src={URL.createObjectURL(image)}
                alt={`Preview ${index + 1}`}
                className="w-[100px] h-[100px] object-cover rounded-lg border border-gray-200"
              />
              <button
                type="button"
                onClick={() => handleRemoveImage(index)}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white
                  rounded-full flex items-center justify-center
                  opacity-0 group-hover:opacity-100 transition-opacity duration-200
                  hover:bg-red-600"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Max images hint */}
      <p className="text-xs text-gray-400 mt-2">
        {images.length} / {maxImages} รูป
      </p>
    </div>
  );
}
