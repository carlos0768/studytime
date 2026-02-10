import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'StudyRoom — オンライン自習室',
  description: '友達と一緒にオンラインで勉強しよう。リアルタイム自習室アプリ。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        {children}
        <div id="bgm-player" style={{ position: 'fixed', width: 0, height: 0, overflow: 'hidden' }} />
      </body>
    </html>
  );
}
