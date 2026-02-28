'use client';

import { useState } from 'react';
import Tabbar from '@/components/Tabbar';

export default function UserHomePage() {
  const [location, setLocation] = useState('');
  const [timeRange, setTimeRange] = useState('');

  const parkingLots = [
    {
      id: 1,
      name: 'Central Mall Parking',
      address: '123 Sukhumvit Road, Bangkok',
      available: 45,
      total: 100,
      price: '20 บาท/ชม.',
      image: '🅿️',
    },
    {
      id: 2,
      name: 'Siam Paragon Parking',
      address: '991 Rama I Road, Pathum Wan',
      available: 28,
      total: 200,
      price: '30 บาท/ชม.',
      image: '🚗',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Tabbar />
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-gray-50 to-gray-100">
        {/* Hero Section with Search Card */}
        <section className="relative overflow-hidden pt-16 pb-24">
          {/* Background Decorative Elements */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-20 left-10 w-72 h-72 bg-[#5B7CFF]/5 rounded-full blur-3xl"></div>
            <div className="absolute top-40 right-20 w-96 h-96 bg-[#4a7bff]/5 rounded-full blur-3xl"></div>
          </div>

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Search Card */}
            <div className="max-w-2xl mx-auto">
              <div className="bg-white rounded-[2rem] shadow-2xl p-8 md:p-10 relative overflow-hidden">

                {/* Title */}
                <h1 className="text-3xl md:text-4xl font-bold text-center text-gray-800 mb-8">
                  ค้นหาที่จอดเลย !
                </h1>

                {/* Search Form */}
                <div className="space-y-4">
                  {/* Location Input */}
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                      <svg
                        className="h-5 w-5 text-gray-400 group-focus-within:text-[#5B7CFF] transition-colors"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="ต้องการจอดที่ไหน ?"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-gray-50 rounded-2xl text-gray-700 placeholder-gray-400
                        focus:outline-none focus:ring-2 focus:ring-[#5B7CFF] focus:bg-white focus:shadow-lg
                        transition-all duration-300"
                    />
                  </div>

                  {/* Time Range Input */}
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                      <svg
                        className="h-5 w-5 text-gray-400 group-focus-within:text-[#5B7CFF] transition-colors"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="ช่วงเวลาไหน ?"
                      value={timeRange}
                      onChange={(e) => setTimeRange(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-gray-50 rounded-2xl text-gray-700 placeholder-gray-400
                        focus:outline-none focus:ring-2 focus:ring-[#5B7CFF] focus:bg-white focus:shadow-lg
                        transition-all duration-300"
                    />
                  </div>

                  {/* Search Button */}
                  <button className="w-full py-4 bg-gradient-to-r from-[#5B7CFF] to-[#4a7bff] text-white font-bold rounded-2xl
                    hover:shadow-xl hover:scale-[1.02] active:scale-95
                    transition-all duration-300 flex items-center justify-center gap-3">
                    <svg
                      className="h-6 w-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    <span>ค้นหา</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Suggestions Section */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Suggestions</h2>
            <p className="text-gray-500">ที่จอดรถยอดนิยมใกล้คุณ</p>
          </div>

          {/* Parking Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {parkingLots.map((lot) => (
              <div
                key={lot.id}
                className="bg-white rounded-3xl shadow-lg overflow-hidden hover:shadow-2xl hover:-translate-y-1
                  transition-all duration-300 cursor-pointer group"
              >
                {/* Card Header */}
                <div className="relative h-48 bg-gradient-to-br from-[#5B7CFF] to-[#4a7bff] flex items-center justify-center">
                  <span className="text-7xl group-hover:scale-110 transition-transform duration-300">
                    {lot.image}
                  </span>
                  {/* Price Badge */}
                  <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-md">
                    <span className="text-sm font-semibold text-[#5B7CFF]">{lot.price}</span>
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-800 mb-2 group-hover:text-[#5B7CFF] transition-colors">
                    {lot.name}
                  </h3>
                  <p className="text-gray-500 mb-4 flex items-center gap-2">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    {lot.address}
                  </p>

                  {/* Available Slots */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                      <span className="text-sm text-gray-600">
                        ว่าง <span className="font-bold text-gray-800">{lot.available}</span> / {lot.total}
                      </span>
                    </div>
                    <button className="px-5 py-2 bg-[#5B7CFF] text-white font-medium rounded-xl
                      hover:bg-[#4a6bef] hover:shadow-md transition-all duration-300">
                      จองเลย
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
