interface BookingHistory {
  id: string;
  parkingName: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: string;
  totalPrice: number;
}

interface BookingHistoryCardProps {
  booking: BookingHistory;
}

export default function BookingHistoryCard({ booking }: BookingHistoryCardProps) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5 bg-gray-50 rounded-xl shadow-md hover:shadow-lg hover:scale-[1.01] transition-all duration-200">
      {/* Left Side - Booking Details */}
      <div className="flex-1 space-y-2">
        <h3 className="text-lg font-bold text-gray-800">{booking.parkingName}</h3>
        <p className="text-sm text-gray-600">
          <span className="font-medium">วันที่:</span> {booking.date}
        </p>
        <p className="text-sm text-gray-600">
          <span className="font-medium">เวลา:</span> {booking.startTime} - {booking.endTime}
        </p>
        <p className="text-sm text-gray-600">
          <span className="font-medium">ระยะเวลา:</span> {booking.duration}
        </p>
      </div>

      {/* Right Side - Price */}
      <div className="flex flex-col items-end sm:items-end min-w-[100px]">
        <span className="text-sm text-gray-600">ค่าบริการ</span>
        <div className="text-2xl font-bold text-[#5B7CFF]">
          {booking.totalPrice}
          <span className="text-base font-medium text-gray-600 ml-1">บาท</span>
        </div>
      </div>
    </div>
  );
}

export type { BookingHistory };
