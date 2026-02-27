import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center space-y-6">
        <h1 className="text-6xl font-bold text-gray-800">
          Park-D
        </h1>
        <p className="text-xl text-gray-600">
          Parking Management System
        </p>

        <div className="flex gap-4 justify-center pt-8">
          <Link
            href="/login"
            className="px-8 py-3 bg-[#5B7CFF] text-white font-semibold rounded-lg hover:bg-[#4a6bef] transition-all"
          >
            Login
          </Link>
          <Link
            href="/register"
            className="px-8 py-3 bg-white text-[#5B7CFF] border-2 border-[#5B7CFF] font-semibold rounded-lg hover:bg-blue-50 transition-all"
          >
            Register
          </Link>
        </div>

        <p className="text-gray-500">
          Application running successfully! 🚗
        </p>
      </div>
    </main>
  );
}
