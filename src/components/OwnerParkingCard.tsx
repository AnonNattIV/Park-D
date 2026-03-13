import { PencilIcon } from '@heroicons/react/24/outline';

export type ParkingStatus = 'available' | 'occupied' | 'pending' | 'closed';

interface OwnerParkingProps {
  id: string;
  name: string;
  status: ParkingStatus;
  onManage?: (id: string) => void;
  onOpen?: (id: string) => void;
}

const STATUS_CONFIG: Record<ParkingStatus, { label: string; dotColor: string; textColor: string }> = {
  available: {
    label: 'Open',
    dotColor: 'bg-green-500',
    textColor: 'text-green-600',
  },
  occupied: {
    label: 'Occupied',
    dotColor: 'bg-gray-400',
    textColor: 'text-gray-500',
  },
  pending: {
    label: 'Pending approval',
    dotColor: 'bg-yellow-500',
    textColor: 'text-yellow-600',
  },
  closed: {
    label: 'Temporarily closed',
    dotColor: 'bg-amber-500',
    textColor: 'text-amber-600',
  },
};

export default function OwnerParkingCard({ id, name, status, onManage, onOpen }: OwnerParkingProps) {
  const config = STATUS_CONFIG[status];
  const isClickable = typeof onOpen === 'function';

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={() => {
        onOpen?.(id);
      }}
      onKeyDown={(event) => {
        if (!isClickable) {
          return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen?.(id);
        }
      }}
      className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5 bg-gray-50 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 ${
        isClickable ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex items-center gap-4 flex-1">
        <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold text-gray-800">{name}</h3>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${config.dotColor}`} />
            <span className={`text-sm font-medium ${config.textColor}`}>{config.label}</span>
          </div>
        </div>
      </div>

      <button
        onClick={(event) => {
          event.stopPropagation();
          onManage?.(id);
        }}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-all duration-200"
      >
        <PencilIcon className="w-4 h-4" />
        <span>Manage</span>
      </button>
    </div>
  );
}
