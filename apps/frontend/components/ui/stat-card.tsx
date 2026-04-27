import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  /** 숫자/문자열 모두 허용 — 등폭 폰트로 렌더링 */
  value: string | number;
  /** "+12%" 같은 변화 표시. 양수는 success, "-" 시작이면 danger 톤 */
  trend?: string;
  /** "최대 10개" 같은 작은 보조 정보 */
  subtitle?: string;
  icon?: LucideIcon;
  /** 0이 아닌 값 강조용 (예: 대기 신청 1건↑) — brand 톤 보더로 시선 유도 */
  highlight?: boolean;
}

/**
 * StatCard — docs/07-design.md §5.6
 *
 * 관리자 대시보드 상단에 노출되는 4개 카드 슬롯의 표준 컴포넌트.
 * 우측 상단 아이콘은 brand-50 패치, 좌측에 라벨/값/추세를 정렬한다.
 */
export function StatCard({
  label,
  value,
  trend,
  subtitle,
  icon: Icon,
  highlight,
}: StatCardProps): JSX.Element {
  const isNegative = typeof trend === 'string' && trend.trim().startsWith('-');

  return (
    <div
      className={cn(
        'flex items-start justify-between rounded-xl border bg-white p-5 shadow-xs transition-colors',
        highlight ? 'border-brand-200 bg-brand-50/30' : 'border-neutral-200',
      )}
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</p>
        <p className="mt-1.5 text-2xl font-semibold tabular text-neutral-900">{value}</p>
        {trend ? (
          <p
            className={cn(
              'mt-1 text-xs font-medium',
              isNegative ? 'text-danger-700' : 'text-success-700',
            )}
          >
            {isNegative ? '↓' : '↑'} {trend.replace(/^[+-]/, '')}
          </p>
        ) : subtitle ? (
          <p className="mt-1 text-xs text-neutral-500">{subtitle}</p>
        ) : null}
      </div>
      {Icon ? (
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            highlight ? 'bg-white' : 'bg-brand-50',
          )}
        >
          <Icon className="h-5 w-5 text-brand-600" strokeWidth={1.75} />
        </div>
      ) : null}
    </div>
  );
}

/** 로딩 중 스켈레톤 */
export function StatCardSkeleton(): JSX.Element {
  return (
    <div className="flex items-start justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-xs">
      <div className="min-w-0 space-y-2">
        <div className="h-3 w-20 animate-pulse rounded bg-neutral-100" />
        <div className="h-7 w-12 animate-pulse rounded bg-neutral-100" />
        <div className="h-3 w-16 animate-pulse rounded bg-neutral-100" />
      </div>
      <div className="h-10 w-10 animate-pulse rounded-lg bg-neutral-100" />
    </div>
  );
}
