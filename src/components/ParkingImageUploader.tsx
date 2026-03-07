'use client';

import { useRef } from 'react';
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
      <label className="mb-3 block text-sm font-medium text-gray-700">รูปภาพ</label>

      <div
        onClick={handleUploadClick}
        className="h-[150px] w-[150px] cursor-pointer rounded-lg border-2 border-dashed border-gray-300
          flex flex-col items-center justify-center
          transition-all duration-200 hover:border-[#5B7CFF] hover:bg-blue-50"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageUpload}
          className="hidden"
        />
        <PlusIcon className="mb-2 h-8 w-8 text-gray-400" />
        <span className="text-sm text-gray-500">เพิ่มรูปภาพ</span>
      </div>

      {images.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-3">
          {images.map((image, index) => (
            <div key={index} className="group relative">
              <img
                src={URL.createObjectURL(image)}
                alt={`Preview ${index + 1}`}
                className="h-[100px] w-[100px] rounded-lg border border-gray-200 object-cover"
              />
              <button
                type="button"
                onClick={() => handleRemoveImage(index)}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center
                  rounded-full bg-red-500 text-white opacity-0 transition-opacity duration-200
                  hover:bg-red-600 group-hover:opacity-100"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <p className="mt-2 text-xs text-gray-400">
        {images.length} / {maxImages} รูป
      </p>
    </div>
  );
}

