import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Noto_Sans_JP, JetBrains_Mono } from 'next/font/google';
import { ActiveMatchGuard } from '@/components/active-match-guard';
import './globals.css';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  display: 'swap',
  variable: '--font-display',
});

const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-body',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'サウナ',
  description: 'サウナ',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'StudyMatch',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${bricolage.variable} ${notoSansJP.variable} ${jetbrainsMono.variable}`}>
      <body>
        <ActiveMatchGuard />
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
