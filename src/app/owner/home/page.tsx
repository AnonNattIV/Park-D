'use client';

import { useState } from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import Tabbar from '@/components/Tabbar';
import OwnerStatCard from '@/components/OwnerStatCard';
import OwnerParkingCard, { ParkingStatus } from '@/components/OwnerParkingCard';

// Type Definitions
interface OwnerStats {
  totalRevenue: number;
  activeBookings: number;
  pendingSpaces: number;
}

interface OwnerParking {
  id: string;
  name: string;
  status: ParkingStatus;
}

export default function OwnerPage() {
  // State for owner access request
  const [ownerRequestStatus, setOwnerRequestStatus] = useState<'idle' | 'pending' | 'approved'>('idle');
  const [ownerUsername] = useState('jariyawat');

  // Mock stats data
  const ownerStats: OwnerStats = {
    totalRevenue: 25784,
    activeBookings: 1,
    pendingSpaces: 1,
  };

  // Mock parking spaces data
  const parkingSpaces: OwnerParking[] = [
    {
      id: '1',
      name: 'Park A',
      status: 'available',
    },
    {
      id: '2',
      name: 'Park B',
      status: 'occupied',
    },
    {
      id: '3',
      name: 'Park C',
      status: 'pending',
    },
  ];

  // Handlers
  const handleRequestOwnerAccess = () => {
    setOwnerRequestStatus('pending');
    alert('ส่งคำขอสำเร็จ');
  };

  const handleManageParking = (id: string) => {
    console.log('Manage parking space:', id);
    // TODO: Open manage modal or navigate to edit page
  };

  const handleAddParking = () => {
    console.log('Add new parking space');
    // TODO: Open add parking modal or navigate to add page
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Tabbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        {/* SECTION 1: Request Owner Access */}
        <section>
          <h1 className="text-2xl font-bold text-gray-800 mb-6">Request Owner Access</h1>
          <div className="bg-white rounded-xl shadow-md p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
              <div className="flex-1">
                <p className="text-gray-600 mb-4">
                  <span className="font-medium">Username:</span> {ownerUsername}
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <strong>สิทธิ์การขอความเป็นผู้ปล่อยเช่า</strong>
                  </p>
                  <p className="text-sm text-blue-700 mt-1">
                    กรุณายื่นคำขอ/คำขอติดต่อทางทีมงานก่อน
                  </p>
                </div>
                {ownerRequestStatus === 'pending' && (
                  <p className="text-sm text-yellow-600 mt-3">
                    <span className="font-medium">สถานะ:</span> รอการอนุมัติจากแอดมิน
                  </p>
                )}
                {ownerRequestStatus === 'approved' && (
                  <p className="text-sm text-green-600 mt-3">
                    <span className="font-medium">สถานะ:</span> ได้รับอนุมัติแล้ว
                  </p>
                )}
              </div>
              {ownerRequestStatus === 'idle' && (
                <button
                  onClick={handleRequestOwnerAccess}
                  className="px-6 py-3 bg-[#5B7CFF] text-white font-semibold rounded-lg hover:bg-[#4a6bef] hover:shadow-md transition-all duration-300 whitespace-nowrap"
                >
                  ส่งคำขอ
                </button>
              )}
            </div>
          </div>
        </section>

        {/* SECTION 2: Parking Owner Dashboard */}
        <section>
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Parking Owner Dashboard</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <OwnerStatCard title="รายได้รวม" value={ownerStats.totalRevenue} unit="บาท" />
            <OwnerStatCard title="การจองที่กำลังใช้อยู่" value={ownerStats.activeBookings} />
            <OwnerStatCard title="รออนุมัติพื้นที่ปล่อยเช่า" value={ownerStats.pendingSpaces} />
          </div>
        </section>

        {/* SECTION 3: My Parking Space */}
        <section>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">My Parking Space</h2>
            <button
              onClick={handleAddParking}
              className="flex items-center gap-2 px-4 py-2 bg-[#5B7CFF] text-white font-medium rounded-lg hover:bg-[#4a6bef] hover:shadow-md transition-all duration-300"
            >
              <PlusIcon className="w-5 h-5" />
              <span>เพิ่มพื้นที่</span>
            </button>
          </div>

          <div className="space-y-4">
            {parkingSpaces.length > 0 ? (
              parkingSpaces.map((parking) => (
                <OwnerParkingCard
                  key={parking.id}
                  id={parking.id}
                  name={parking.name}
                  status={parking.status}
                  onManage={handleManageParking}
                />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 bg-white rounded-xl shadow-md">
                <p className="text-gray-500 text-lg">ยังไม่มีพื้นที่จอดรถ</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
