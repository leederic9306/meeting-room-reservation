'use client';

import { useMutation } from '@tanstack/react-query';
import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { logout } from '@/lib/api/auth';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';

export function AppHeader(): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clear);
  const [menuOpen, setMenuOpen] = useState(false);

  // 라우트가 바뀌면 자동으로 메뉴 닫기 — SPA 네비게이션 후에도 시트가 남는 문제 방지.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

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

  const links = [
    { href: '/my/requests', label: '내 신청', show: true },
    { href: '/admin/rooms', label: '관리자 페이지', show: user?.role === 'ADMIN' },
  ];

  return (
    <header className="border-b bg-background">
      <div className="container flex h-14 items-center justify-between">
        <Link href="/dashboard" className="text-lg font-semibold text-primary">
          회의실 예약
        </Link>

        {/* 데스크탑: 인라인 네비. */}
        <div className="hidden items-center gap-3 sm:flex">
          {links
            .filter((l) => l.show)
            .map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm font-medium text-primary hover:underline"
              >
                {l.label}
              </Link>
            ))}
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

        {/* 모바일: 햄버거 토글. 터치 타겟 44x44. */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground hover:bg-accent sm:hidden"
          aria-label={menuOpen ? '메뉴 닫기' : '메뉴 열기'}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* 모바일 드로어 — 햄버거 클릭 시 헤더 아래로 펼쳐진다. */}
      {menuOpen ? (
        <nav
          id="mobile-nav"
          aria-label="모바일 메뉴"
          className={cn(
            'border-t bg-background sm:hidden',
            // 화면 가득 채우진 않고 자연스러운 패널. 백드롭 없음 (헤더 단순화).
          )}
        >
          <ul className="container flex flex-col py-2">
            {links
              .filter((l) => l.show)
              .map((l) => {
                const active = pathname?.startsWith(l.href);
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className={cn(
                        'flex min-h-[44px] items-center rounded-md px-3 text-base font-medium',
                        active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent',
                      )}
                    >
                      {l.label}
                    </Link>
                  </li>
                );
              })}
            <li className="mt-2 border-t pt-2">
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-sm text-muted-foreground" aria-live="polite">
                  {user?.name ?? '—'}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? '로그아웃 중...' : '로그아웃'}
                </Button>
              </div>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
