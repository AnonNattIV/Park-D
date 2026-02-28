import { CalendarIcon, ClockIcon, TagIcon } from '@heroicons/react/24/outline';

interface BookingCardProps {
  parkingName: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: string;
  price: number;
}

export default function BookingCard({
  parkingName,
  date,
  startTime,
  endTime,
  duration,
  price,
}: BookingCardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between p-5">
        {/* Left Side */}
        <div className="flex-1 space-y-3">
          <h3 className="text-lg font-bold text-gray-800">{parkingName}</h3>
          <div className="flex items-center gap-2 text-gray-600">
            <CalendarIcon className="w-4 h-4 text-[#5B7CFF]" />
            <span className="text-sm">{date}</span>
          </div>
          <div className="flex items-center gap-4 text-gray-600">
            <div className="flex items-center gap-2">
              <ClockIcon className="w-4 h-4 text-[#5B7CFF]" />
              <span className="text-sm">{startTime} - {endTime}</span>
            </div>
            <span className="text-sm text-gray-500">({duration})</span>
          </div>
        </div>

        {/* Right Side */}
        <div className="mt-4 md:mt-0 md:ml-6 md:pl-6 md:border-l md:border-gray-200 flex flex-col items-start md:items-end">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <TagIcon className="w-4 h-4" />
            <span className="text-sm">Payment</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl md:text-3xl font-bold text-gray-800">{price}</span>
            <span className="text-sm md:text-lg font-medium text-gray-600">บาท</span>
          </div>
        </div>
      </div>
    </div>
  );
}
