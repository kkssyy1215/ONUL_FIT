import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '톤픽 v2 — 나만의 톤 추천',
  description: '선택형·자연어·음성 입력으로 나에게 맞는 뷰티 추천을 받아보세요.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
