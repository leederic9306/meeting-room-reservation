'use client';

import { useMutation } from '@tanstack/react-query';
import { CalendarDays, ChevronDown, LogOut, Menu, ShieldCheck, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { logout } from '@/lib/api/auth';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';

interface NavLink {
  href: string;
  label: string;
}

const NAV_LINKS: NavLink[] = [
  { href: '/dashboard', label: '캘린더' },
  { href: '/my/requests', label: '내 신청' },
];

/**
 * AppHeader — docs/07-design.md §5.1
 *
 * - 그라데이션 아이콘 로고 + Pretendard 워드마크
 * - sticky + bg-white/80 + backdrop-blur (스크롤 시 자연스럽게)
 * - 중앙 인라인 네비게이션 (active = brand 색 + 하단 라인)
 * - 우측: ADMIN이면 ShieldCheck 배지, 사용자 아바타(이름 첫 글자) → 드롭다운
 * - 모바일: 햄버거 → 풀너비 드로어
 */
export function AppHeader(): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clear);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // 라우트가 바뀌면 모든 메뉴 닫기 — SPA 네비게이션 후에도 시트가 남는 문제 방지.
  useEffect(() => {
    setMenuOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  // 사용자 메뉴: 외부 클릭으로 닫기.
  useEffect(() => {
    if (!userMenuOpen) return;
    const onDocClick = (e: MouseEvent): void => {
      if (!userMenuRef.current?.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [userMenuOpen]);

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

  const isActive = (href: string): boolean => pathname?.startsWith(href) ?? false;
  const isAdmin = user?.role === 'ADMIN';
  const initial = user?.name?.trim().charAt(0).toUpperCase() ?? '?';

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-neutral-200 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between px-6">
        {/* 좌측 — 로고 */}
        <Link href="/dashboard" className="flex items-center gap-2.5" aria-label="홈으로">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 shadow-xs">
            <CalendarDays className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-semibold tracking-tight text-neutral-900">Meeting</span>
        </Link>

        {/* 중앙 — 데스크탑 네비게이션 */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="주 메뉴">
          {NAV_LINKS.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors',
                  active
                    ? 'text-brand-600'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                )}
              >
                {link.label}
                {active ? (
                  <span className="absolute -bottom-[13px] left-3 right-3 h-0.5 rounded-full bg-brand-500" />
                ) : null}
              </Link>
            );
          })}
        </nav>

        {/* 우측 — 액션 영역 */}
        <div className="flex items-center gap-2">
          {/* ADMIN 배지 — 시각적으로 분리 */}
          {isAdmin ? (
            <Link
              href="/admin/rooms"
              className={cn(
                'hidden h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors md:inline-flex',
                isActive('/admin')
                  ? 'bg-brand-50 text-brand-700'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200',
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
              관리자
            </Link>
          ) : null}

          {/* 사용자 메뉴 — 데스크탑 */}
          <div ref={userMenuRef} className="relative hidden md:block">
            <button
              type="button"
              onClick={() => setUserMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              className="inline-flex h-9 items-center gap-2 rounded-md pl-1.5 pr-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
            >
              <Avatar initial={initial} />
              <span className="max-w-[120px] truncate" aria-live="polite">
                {user?.name ?? '—'}
              </span>
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 text-neutral-400 transition-transform',
                  userMenuOpen && 'rotate-180',
                )}
              />
            </button>

            {userMenuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg"
              >
                <div className="border-b border-neutral-100 px-3 py-3">
                  <p className="truncate text-sm font-semibold text-neutral-900">
                    {user?.name ?? '—'}
                  </p>
                  <p className="truncate text-xs text-neutral-500">{user?.email ?? ''}</p>
                </div>
                <div className="py-1">
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => mutation.mutate()}
                    disabled={mutation.isPending}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
                  >
                    <LogOut className="h-4 w-4 text-neutral-400" />
                    {mutation.isPending ? '로그아웃 중...' : '로그아웃'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {/* 모바일 햄버거 — 터치 타겟 44x44 */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-neutral-700 hover:bg-neutral-100 md:hidden"
            aria-label={menuOpen ? '메뉴 닫기' : '메뉴 열기'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* 모바일 드로어 */}
      {menuOpen ? (
        <nav
          id="mobile-nav"
          aria-label="모바일 메뉴"
          className="border-t border-neutral-200 bg-white md:hidden"
        >
          <ul className="mx-auto flex max-w-[1440px] flex-col px-4 py-2">
            {NAV_LINKS.map((link) => {
              const active = isActive(link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-[44px] items-center rounded-md px-3 text-base font-medium',
                      active
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-neutral-700 hover:bg-neutral-100',
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
            {isAdmin ? (
              <li>
                <Link
                  href="/admin/rooms"
                  className={cn(
                    'flex min-h-[44px] items-center gap-2 rounded-md px-3 text-base font-medium',
                    isActive('/admin')
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-neutral-700 hover:bg-neutral-100',
                  )}
                >
                  <ShieldCheck className="h-4 w-4" />
                  관리자 페이지
                </Link>
              </li>
            ) : null}
            <li className="mt-2 border-t border-neutral-100 pt-2">
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar initial={initial} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-900">
                      {user?.name ?? '—'}
                    </p>
                    <p className="truncate text-xs text-neutral-500">{user?.email ?? ''}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending}
                  className="inline-flex h-11 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" />
                  {mutation.isPending ? '...' : '로그아웃'}
                </button>
              </div>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}

/** 사용자 이름 첫 글자를 보여주는 작은 아바타 — 드롭다운/모바일 메뉴 공용. */
function Avatar({ initial }: { initial: string }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-semibold text-white"
    >
      {initial}
    </span>
  );
}
