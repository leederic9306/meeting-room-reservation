'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
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
    // zustand persist 복원 직후 한 프레임 비어 있을 수 있어, "확정적 비ADMIN"과 구분.
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        세션 확인 중...
      </div>
    );
  }

  if (user.role !== 'ADMIN') {
    return <ForbiddenScreen />;
  }

  return <>{children}</>;
}

function ForbiddenScreen(): JSX.Element {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-5xl font-bold text-destructive">403</p>
      <h1 className="text-xl font-semibold">접근 권한이 없습니다</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        이 페이지는 관리자 권한이 필요합니다. 권한이 필요하면 관리자에게 문의해 주세요.
      </p>
      <Button asChild variant="outline">
        <Link href="/dashboard">대시보드로 돌아가기</Link>
      </Button>
    </div>
  );
}
