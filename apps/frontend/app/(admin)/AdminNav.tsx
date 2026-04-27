'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { listAdminExceptionRequests } from '@/lib/api/exception-requests';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/admin/rooms', label: '회의실' },
  { href: '/admin/users', label: '사용자' },
  { href: '/admin/exception-requests', label: '예외 신청', badge: 'pending' as const },
  { href: '/admin/audit-logs', label: '감사 로그' },
];

/** 새 신청 알림 폴링 주기 — 너무 잦으면 부담, 너무 길면 알림 지연. */
const PENDING_REFRESH_INTERVAL_MS = 30_000;

/**
 * AdminNav — docs/07-design.md §4.7
 *
 * 라인 스타일 탭. 활성 시 brand-600 텍스트 + 하단 brand-500 라인.
 * 비활성은 neutral-500, hover에 neutral-900.
 */
export function AdminNav(): JSX.Element {
  const pathname = usePathname();

  // PENDING 카운트만 가벼운 totalItems 조회로 — 첫 페이지의 meta.totalItems만 사용.
  const pendingCountQuery = useQuery({
    queryKey: ['admin', 'exception-requests', 'pending-count'],
    queryFn: () => listAdminExceptionRequests({ status: 'PENDING', page: 1, limit: 1 }),
    refetchInterval: PENDING_REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: true,
    select: (res) => res.meta.totalItems,
  });
  const pendingCount = pendingCountQuery.data ?? 0;

  return (
    <div className="border-b border-neutral-200">
      {/* 모바일은 가로 스크롤. -mx로 컨테이너 패딩 보정해 끝까지 스와이프 가능. */}
      <nav
        aria-label="관리자 메뉴"
        className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      >
        {TABS.map((tab) => {
          const active = pathname?.startsWith(tab.href) ?? false;
          const showBadge = tab.badge === 'pending' && pendingCount > 0;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap px-4 text-sm font-medium transition-colors',
                active ? 'text-brand-600' : 'text-neutral-500 hover:text-neutral-900',
              )}
            >
              {tab.label}
              {showBadge ? (
                <span
                  aria-label={`검토 대기 ${pendingCount}건`}
                  className={cn(
                    'inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold leading-none',
                    active ? 'bg-brand-600 text-white' : 'bg-danger-500 text-white',
                  )}
                >
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              ) : null}
              {active ? (
                <span
                  aria-hidden
                  className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand-500"
                />
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
