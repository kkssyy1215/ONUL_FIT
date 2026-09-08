import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '오늘핏 — 오늘 날씨에 맞는 외출 준비',
  description: '오늘의 날씨, 챙길 것, 내 취향과 옷장을 반영한 옷차림을 한 번에 확인하세요.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
