export const metadata = {
  title: "Park-D",
  description: "Park-D Next.js app",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
