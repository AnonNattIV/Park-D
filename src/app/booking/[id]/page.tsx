'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import Tabbar from '@/components/Tabbar'; // ดึง Tabbar มาใช้เหมือนหน้าอื่นๆ

export default function BookingPage() {
  const params = useParams();
  const id = params?.id;

  return (
    // ใส่ pb-28 เผื่อพื้นที่ให้แถบยืนยันชำระเงินด้านล่าง
    <div className="min-h-screen bg-white pb-28 relative">
      <Tabbar />
      
      <div className="mx-auto max-w-5xl p-6">
        {/* Back Button */}
        <div className="mb-8">
          <Link
            href={`/parkingdetail/${id}`}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-gray-800 text-gray-800 transition-colors hover:bg-gray-100"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
        </div>

        {/* Main Layout Grid */}
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
          
          {/* --- Left Column --- */}
          <div className="space-y-10">
            
            {/* Summary Booking Section */}
            <section>
              <h2 className="mb-4 text-2xl font-bold text-gray-900">Summary booking</h2>
              <div className="rounded-3xl bg-[#F3F4F6] p-8">
                <h3 className="mb-1 text-2xl font-bold text-gray-900">Park A</h3>
                <p className="mb-4 text-gray-600">Nimman Space Parking</p>
                <ul className="space-y-2 text-gray-700 list-disc list-inside marker:text-gray-400">
                  <li>18.7961, 98.9673</li>
                  <li>โซนนิมมาน</li>
                  <li>ราคา: 20 บาท/ชม.</li>
                  <li>ที่ว่าง: 10 ช่อง</li>
                </ul>
              </div>
            </section>

            {/* Vehicle Information Section */}
            <section>
              <h2 className="mb-4 text-2xl font-bold text-gray-900">Vehicle Information</h2>
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block font-medium text-gray-900">ทะเบียนรถ</label>
                  <input 
                    type="text" 
                    className="w-full rounded-2xl bg-[#F3F4F6] px-5 py-4 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#5B7CFF] transition-all"
                  />
                </div>
                <div>
                  <label className="mb-2 block font-medium text-gray-900">ยี่ห้อ</label>
                  <input 
                    type="text" 
                    className="w-full rounded-2xl bg-[#F3F4F6] px-5 py-4 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#5B7CFF] transition-all"
                  />
                </div>
                <div>
                  <label className="mb-2 block font-medium text-gray-900">รุ่น</label>
                  <input 
                    type="text" 
                    className="w-full rounded-2xl bg-[#F3F4F6] px-5 py-4 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#5B7CFF] transition-all"
                  />
                </div>
              </div>
            </section>
          </div>

          {/* --- Right Column --- */}
          <div>
            <section>
              <h2 className="mb-4 text-2xl font-bold text-gray-900">Payment Method</h2>
              <div className="flex items-center gap-6 rounded-3xl bg-[#F3F4F6] p-8">
                {/* QR Placeholder (กล่องสีเทา) */}
                <div className="h-28 w-28 rounded-xl bg-[#D1D5DB] flex-shrink-0"></div>
                <div className="text-xl font-bold text-gray-900 leading-tight">
                  Scan QR Code<br />to pay
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* แถบด้านล่าง (Fixed Bottom Bar) */}
      <div className="fixed bottom-0 left-0 w-full bg-[#E5EEFF] py-5 z-50">
        <div className="mx-auto flex max-w-5xl justify-center">
          <button className="w-80 rounded-xl bg-[#4D94FF] py-3.5 text-center text-lg font-bold text-white transition-colors hover:bg-[#3A7EE6] shadow-sm">
            ยืนยันการชำระ
          </button>
        </div>
      </div>
    </div>
  );
}