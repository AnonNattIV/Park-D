'use client';

import { useState, useRef } from 'react';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface ManageParkingImagesProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  maxImages?: number;
  isEditable?: boolean;
}

export default function ManageParkingImages({
  images,
  onImagesChange,
  maxImages = 10,
  isEditable = true,
}: ManageParkingImagesProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!isEditable) return;

    const files = event.target.files;
    if (files) {
      const newImages = Array.from(files)
        .slice(0, maxImages - images.length)
        .map((file) => URL.createObjectURL(file));
      onImagesChange([...images, ...newImages]);
    }
  };

  const handleRemoveImage = (index: number) => {
    if (!isEditable) return;

    const newImages = images.filter((_, i) => i !== index);
    onImagesChange(newImages);
  };

  const handleUploadClick = () => {
    if (!isEditable) return;
    fileInputRef.current?.click();
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-3">
        รูปถ่าย
      </label>

      {/* Images Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {/* Existing Images */}
        {images.map((image, index) => (
          <div key={index} className="relative group aspect-square">
            <img
              src={image}
              alt={`Parking ${index + 1}`}
              className="w-full h-full object-cover rounded-lg border border-gray-200"
            />
            {isEditable && (
              <button
                type="button"
                onClick={() => handleRemoveImage(index)}
                className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-600"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}

        {/* Add Image Button */}
        {isEditable && images.length < maxImages && (
          <div
            onClick={handleUploadClick}
            className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all duration-200"
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
            <span className="text-sm text-gray-500">เพิ่มรูป</span>
          </div>
        )}
      </div>

      {/* Image count */}
      <p className="text-xs text-gray-400 mt-2">
        {images.length} / {maxImages} รูป
      </p>
    </div>
  );
}
