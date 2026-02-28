import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Park-D',
  description: 'Parking Management System',
  icons: {
    icon: '/image/ParkD.ico',
    shortcut: '/image/ParkD.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
