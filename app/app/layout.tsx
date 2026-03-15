import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import dynamic from 'next/dynamic';
import './globals.css';

// Load Privy client-side only — it relies on browser APIs and validates its
// app ID at init time, which would fail during static generation.
const PrivyProviderWrapper = dynamic(
  () => import('@/components/PrivyProviderWrapper'),
  { ssr: false }
);

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MonadClaw Guild',
  description: 'MonadClaw Guild — Web3 Community Chat',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-950 text-white min-h-screen`}>
        <PrivyProviderWrapper>{children}</PrivyProviderWrapper>
      </body>
    </html>
  );
}
