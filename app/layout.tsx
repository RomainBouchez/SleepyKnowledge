import type { Metadata, Viewport } from 'next';
import './globals.css';
import Navigation from '@/components/Navigation';
import CloudSyncInit from '@/components/CloudSyncInit';

export const metadata: Metadata = {
  title: 'SleepIQ',
  description: 'Track and improve your sleep with AI coaching',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SleepIQ',
  },
  icons: {
    apple: '/icons/icon-192.png',
    icon: '/icon.svg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0908',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full">
      <body className="h-full bg-ng-bg text-ng-white overflow-hidden">
        {/* Main scrollable content — bottom padding accounts for nav bar */}
        <main
          className="h-full overflow-y-auto safe-top"
          style={{ paddingBottom: '200px' }}
          id="main-scroll">
          {children}
        </main>
        {/* Fixed bottom navigation */}
        <CloudSyncInit />
        <Navigation />
      </body>
    </html>
  );
}
