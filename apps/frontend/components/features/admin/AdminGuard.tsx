'use client';

import type { ReactNode } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { UnauthorizedState } from '@/components/ui/state-views';
import { useAuthStore } from '@/stores/auth.store';

/**
 * 클라이언트 측 ADMIN 권한 가드.
 * - 미들웨어가 mr_session 쿠키로 1차 인증을 보장하므로 여기선 역할만 검증한다.
 * - 비-ADMIN(또는 세션 hydration 직후 user undefined)이면 403 화면.
 *   백엔드도 RolesGuard로 이중 방어 — UI 통과만으로는 데이터 접근 불가.
 */
export function AdminGuard({ children }: { children: ReactNode }): JSX.Element {
  const user = useAuthStore((s) => s.user);

  if (!user) {
    // zustand persist 복원 직후 한 프레임 비어 있을 수 있어, 깜빡임 대신 가벼운 스켈레톤.
    return (
      <div className="space-y-3" aria-busy="true" aria-label="세션 확인 중">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
    );
  }

  if (user.role !== 'ADMIN') {
    return (
      <UnauthorizedState message="이 페이지는 관리자 권한이 필요합니다. 권한이 필요하면 관리자에게 문의해 주세요." />
    );
  }

  return <>{children}</>;
}
