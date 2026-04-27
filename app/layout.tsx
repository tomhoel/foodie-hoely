// Minimal root layout — required by Next.js App Router even for API-only apps.
// No pages are rendered; this exists only to satisfy the framework.
export const metadata = { title: 'Foodie API' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
