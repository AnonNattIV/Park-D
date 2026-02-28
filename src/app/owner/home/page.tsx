import Tabbar from '@/components/Tabbar';

export default function OwnerPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Tabbar />
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">Owner Page</h1>
          <p className="text-gray-500">Coming soon...</p>
        </div>
      </div>
    </div>
  );
}
