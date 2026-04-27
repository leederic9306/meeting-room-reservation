import type { ReactNode } from 'react';

import { AdminGuard } from '@/components/features/admin/AdminGuard';
import { AdminStatsPanel } from '@/components/features/admin/AdminStatsPanel';
import { AppHeader } from '@/components/features/auth/AppHeader';
import { SessionGate } from '@/components/features/auth/SessionGate';

import { AdminNav } from './AdminNav';

export default function AdminLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <SessionGate>
      <div className="flex min-h-screen flex-col bg-neutral-50">
        <AppHeader />
        <AdminGuard>
          <div className="container flex-1 py-8">
            {/* 페이지 헤더 — 디자인 §5.6 (eyebrow + h1) */}
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                관리자
              </p>
              <h1 className="mt-1 text-h1 font-semibold tracking-tight text-neutral-900">
                회의실 예약 관리
              </h1>
              <p className="mt-1.5 text-sm text-neutral-500">
                회의실, 사용자, 예외 신청, 감사 로그를 한 곳에서 관리합니다.
              </p>
            </div>

            {/* 통계 카드 4개 */}
            <div className="mb-6">
              <AdminStatsPanel />
            </div>

            <AdminNav />
            <main className="mt-6">{children}</main>
          </div>
        </AdminGuard>
      </div>
    </SessionGate>
  );
}
