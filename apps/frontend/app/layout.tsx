import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import type { CSSProperties, ReactNode } from 'react';

import { Providers } from './providers';

import './globals.css';

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? '회의실 예약';
const primaryColor = process.env.NEXT_PUBLIC_PRIMARY_COLOR ?? '#3B63EE';

export const metadata: Metadata = {
  title: {
    default: appName,
    template: `%s | ${appName}`,
  },
  description: '사내 회의실 예약 시스템',
};

export const viewport: Viewport = {
  themeColor: primaryColor,
};

// NEXT_PUBLIC_PRIMARY_COLOR 를 --color-primary 로 런타임 주입 (PRD UX-002)
// — Tailwind에 하드코딩 대신 CSS 변수로 추출
const htmlStyle = {
  '--color-primary': primaryColor,
} as CSSProperties;

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html
      lang="ko"
      style={htmlStyle}
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
