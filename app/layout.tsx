import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'English Pronunciation Coach',
  description:
    'AI-powered English pronunciation diagnosis — phoneme-level acoustic analysis and physical correction prescriptions.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
