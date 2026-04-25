'use client';

import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { logout } from '@/lib/api/auth';
import { useAuthStore } from '@/stores/auth.store';

export function AppHeader(): JSX.Element {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clear);

  const mutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      clearSession();
      router.replace('/login');
    },
    onError: () => {
      // 서버 로그아웃이 실패해도 로컬 세션과 마커 쿠키는 반드시 제거.
      clearSession();
      toast.error('로그아웃 처리 중 오류가 발생했지만 세션은 정리되었습니다.');
      router.replace('/login');
    },
  });

  return (
    <header className="border-b bg-background">
      <div className="container flex h-14 items-center justify-between">
        <Link href="/dashboard" className="text-lg font-semibold text-primary">
          회의실 예약
        </Link>
        <div className="flex items-center gap-3">
          {user?.role === 'ADMIN' ? (
            <Link href="/admin/rooms" className="text-sm font-medium text-primary hover:underline">
              관리자 페이지
            </Link>
          ) : null}
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {user?.name ?? '—'}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? '로그아웃 중...' : '로그아웃'}
          </Button>
        </div>
      </div>
    </header>
  );
}
