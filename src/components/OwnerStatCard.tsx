interface OwnerStatProps {
  title: string;
  value: number;
  unit?: string;
}

export default function OwnerStatCard({ title, value, unit }: OwnerStatProps) {
  return (
    <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-all duration-200">
      <h3 className="text-gray-600 text-sm font-medium mb-2">{title}</h3>
      <div className="flex items-baseline justify-center gap-1">
        <span className="text-4xl font-bold text-[#5B7CFF]">{value}</span>
        {unit && <span className="text-gray-500 text-lg">{unit}</span>}
      </div>
    </div>
  );
}
