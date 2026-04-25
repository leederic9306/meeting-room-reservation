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
    <nav className="border-b">
      {/* 모바일: 가로 스크롤. 데스크탑: 일반 flex. -mx로 컨테이너 패딩 보정해 끝까지 스와이프 가능. */}
      <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {TABS.map((tab) => {
          const active = pathname?.startsWith(tab.href);
          const showBadge = tab.badge === 'pending' && pendingCount > 0;
          return (
            <li key={tab.href} className="shrink-0">
              <Link
                href={tab.href}
                className={cn(
                  // min-h-[44px]로 터치 타겟 보장.
                  'inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap border-b-2 px-4 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
                {showBadge ? (
                  <span
                    aria-label={`검토 대기 ${pendingCount}건`}
                    className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[0.625rem] font-semibold leading-none text-white"
                  >
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
