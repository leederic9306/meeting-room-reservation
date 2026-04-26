import type { ReactNode } from 'react';

import { AdminGuard } from '@/components/features/admin/AdminGuard';
import { AppHeader } from '@/components/features/auth/AppHeader';
import { SessionGate } from '@/components/features/auth/SessionGate';

import { AdminNav } from './AdminNav';

export default function AdminLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <SessionGate>
      <div className="flex min-h-screen flex-col bg-muted/20">
        <AppHeader />
        <AdminGuard>
          <div className="container flex-1 py-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold">관리자 페이지</h1>
              <p className="mt-1 text-sm text-muted-foreground">회의실과 사용자를 관리합니다.</p>
            </div>
            <AdminNav />
            <main className="mt-6">{children}</main>
          </div>
        </AdminGuard>
      </div>
    </SessionGate>
  );
}
