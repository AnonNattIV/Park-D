'use client';

import Link from 'next/link';
import Tabbar from '@/components/Tabbar';

export default function ParkingDetailPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Tabbar />
      <div className="mx-auto max-w-6xl p-6">
        {/* Back Button */}
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-gray-600 transition-colors hover:text-[#5B7CFF]"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            <span>กลับหน้าแรก</span>
          </Link>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
          {/* Left Side - Parking Info */}
          <div className="space-y-6">
            {/* Image Preview Card */}
            <div className="rounded-2xl bg-white p-6 shadow-md">
              <div className="relative h-64 overflow-hidden rounded-xl bg-gradient-to-br from-[#5B7CFF] to-[#4a7bff]">
                <div className="flex h-full items-center justify-center">
                  <span className="text-9xl opacity-50">🅿️</span>
                </div>
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-900/25 via-transparent to-white/10"></div>
              </div>
            </div>

            {/* Parking Name Card */}
            <div className="rounded-2xl bg-white p-6 shadow-md">
              <h1 className="mb-4 text-3xl font-bold text-gray-800">Park A</h1>
              <div className="flex items-center gap-2">
                <div className="flex text-yellow-400">
                  <span>★</span>
                  <span>★</span>
                  <span>★</span>
                  <span>★</span>
                  <span className="text-gray-300">★</span>
                </div>
                <span className="text-sm text-gray-500">(124 รีวิว)</span>
              </div>
            </div>

            {/* Description Card */}
            <div className="rounded-2xl bg-white p-6 shadow-md">
              <h2 className="mb-3 text-xl font-bold text-gray-800">รายละเอียด</h2>
              <p className="text-gray-600 leading-relaxed">
                ที่จอดรถที่ปลอดภัยและสะดวกสบาย เหมาะสำหรับทั้งการจอดรถระยะสั้นและระยะยาว
                มีระบบรักษาความปลอดภัย 24 ชั่วโมง และกล้องวงจรปิดครอบคลุมทุกพื้นที่
              </p>
            </div>

            {/* Vehicle Types Card */}
            <div className="rounded-2xl bg-white p-6 shadow-md">
              <h2 className="mb-3 text-xl font-bold text-gray-800">ประเภทยานพาหนะที่รองรับ</h2>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-gray-600">
                  <span className="h-2 w-2 rounded-full bg-[#5B7CFF]"></span>
                  <span>รถยนต์ส่วนบุคคล</span>
                </li>
                <li className="flex items-center gap-2 text-gray-600">
                  <span className="h-2 w-2 rounded-full bg-[#5B7CFF]"></span>
                  <span>รถSUV</span>
                </li>
                <li className="flex items-center gap-2 text-gray-600">
                  <span className="h-2 w-2 rounded-full bg-[#5B7CFF]"></span>
                  <span>รถจักรยานยนต์</span>
                </li>
              </ul>
            </div>

            {/* Rules Card */}
            <div className="rounded-2xl bg-white p-6 shadow-md">
              <h2 className="mb-3 text-xl font-bold text-gray-800">กฎระเบียบ</h2>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-gray-600">
                  <svg
                    className="h-4 w-4 text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  <span>ห้ามสูบบุหรี่</span>
                </li>
                <li className="flex items-center gap-2 text-gray-600">
                  <svg
                    className="h-4 w-4 text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  <span>ห้ามทำเสียงดัง</span>
                </li>
                <li className="flex items-center gap-2 text-gray-600">
                  <svg
                    className="h-4 w-4 text-green-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span>จอดในพื้นที่กำหนด</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Right Side - Reviews & Location */}
          <div className="space-y-6">
            {/* Reviews Section */}
            <div className="rounded-2xl bg-white p-6 shadow-md">
              <h2 className="mb-4 text-xl font-bold text-gray-800">รีวิวจากผู้ใช้งาน</h2>
              <div className="space-y-4">
                {/* Review 1 */}
                <div className="border-b border-gray-100 pb-4">
                  <div className="mb-2 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#5B7CFF] to-[#4a7bff] text-white font-bold">
                      A
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">Alex Johnson</p>
                      <div className="flex text-yellow-400 text-sm">
                        <span>★</span>
                        <span>★</span>
                        <span>★</span>
                        <span>★</span>
                        <span>★</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-gray-600">
                    ที่จอดรถดีมาก สะอาด ปลอดภัย พนักงานเป็นกันเองครับ
                  </p>
                </div>

                {/* Review 2 */}
                <div className="border-b border-gray-100 pb-4">
                  <div className="mb-2 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-rose-500 text-white font-bold">
                      S
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">Sarah Williams</p>
                      <div className="flex text-yellow-400 text-sm">
                        <span>★</span>
                        <span>★</span>
                        <span>★</span>
                        <span>★</span>
                        <span className="text-gray-300">★</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-gray-600">
                    สะดวกสบายดีค่ะ แต่คนเยอะตอนช่วงพักกลางวัน
                  </p>
                </div>

                {/* Review 3 */}
                <div>
                  <div className="mb-2 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 text-white font-bold">
                      M
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">Michael Chen</p>
                      <div className="flex text-yellow-400 text-sm">
                        <span>★</span>
                        <span>★</span>
                        <span>★</span>
                        <span>★</span>
                        <span>★</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-gray-600">
                    ราคาเหมาะสมครับ จอดง่าย เข้าออกสะดวก
                  </p>
                </div>
              </div>
            </div>

            {/* Location Section */}
            <div className="rounded-2xl bg-white p-6 shadow-md">
              <h2 className="mb-4 text-xl font-bold text-gray-800">ตำแหน่งที่ตั้ง</h2>
              <div className="flex h-64 items-center justify-center rounded-xl bg-gray-200">
                <div className="text-center">
                  <svg
                    className="mx-auto mb-2 h-16 w-16 text-gray-400"
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
                  <p className="text-gray-500">แผนที่แสดงตำแหน่งที่จอดรถ</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-gray-600">
                123 ถนนสุขุมวิท แขวงคลองเตย เขตวัฒนา กรุงเทพฯ 10110
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
