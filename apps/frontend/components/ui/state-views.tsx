import { AlertTriangle, ArrowRight, Inbox, Lock, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/axios';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// EmptyState — 일러스트(아이콘) + 안내 메시지 + 선택적 액션 / 도움말 링크
// docs/07-design.md §5.7
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  /** 일러스트 역할의 lucide 아이콘. 기본은 Inbox. */
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** "새로 만들기" 같은 후속 액션 버튼/링크. */
  action?: ReactNode;
  /** 도움말/정책 링크 — 액션과 별개로 추가 설명 페이지로 유도. */
  helpHref?: string;
  helpLabel?: string;
  /** 일러스트 톤 — 기본은 neutral. brand면 brand-50→100 그라데이션. */
  tone?: 'neutral' | 'brand';
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  helpHref,
  helpLabel,
  tone = 'neutral',
  className,
}: EmptyStateProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 px-6 py-16 text-center',
        className,
      )}
    >
      <div
        aria-hidden
        className={cn(
          'flex h-16 w-16 items-center justify-center rounded-2xl',
          tone === 'brand'
            ? 'bg-gradient-to-br from-brand-100 to-brand-50'
            : 'bg-gradient-to-br from-neutral-100 to-neutral-50',
        )}
      >
        <Icon
          className={cn('h-8 w-8', tone === 'brand' ? 'text-brand-600' : 'text-neutral-400')}
          strokeWidth={1.5}
        />
      </div>
      <div>
        <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
        {description ? (
          <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-500">{description}</p>
        ) : null}
      </div>
      {action ?? null}
      {helpHref ? (
        <Link
          href={helpHref}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
        >
          {helpLabel ?? '자세히 알아보기'}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ErrorState — 에러 메시지 + 재시도 버튼
// ---------------------------------------------------------------------------

interface ErrorStateProps {
  /** TanStack Query의 error 객체. ApiError면 userMessage를 사용. */
  error?: unknown;
  /** 재시도 트리거. 보통 query.refetch. */
  onRetry?: () => void;
  /** 재시도 진행 중 표시. */
  isRetrying?: boolean;
  /** 호출 측에서 메시지 직접 지정하고 싶을 때 — error보다 우선. */
  title?: string;
  description?: string;
  className?: string;
}

function extractMessage(error: unknown): string {
  if (error instanceof ApiError) return error.userMessage;
  if (error instanceof Error) return error.message;
  return '알 수 없는 오류가 발생했습니다.';
}

export function ErrorState({
  error,
  onRetry,
  isRetrying,
  title,
  description,
  className,
}: ErrorStateProps): JSX.Element {
  const heading = title ?? '데이터를 불러오지 못했습니다';
  const detail = description ?? extractMessage(error);

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-4 px-6 py-16 text-center',
        className,
      )}
    >
      <div
        aria-hidden
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-danger-50 to-white"
      >
        <AlertTriangle className="h-8 w-8 text-danger-500" strokeWidth={1.5} />
      </div>
      <div>
        <h3 className="text-base font-semibold text-neutral-900">{heading}</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-500">{detail}</p>
      </div>
      {onRetry ? (
        <Button type="button" variant="secondary" onClick={onRetry} disabled={isRetrying}>
          {isRetrying ? '다시 시도 중...' : '다시 시도'}
        </Button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UnauthorizedState — 권한 없음 (403)
// ---------------------------------------------------------------------------

interface UnauthorizedStateProps {
  /** 호출 측에서 메시지를 더 좁힐 때 (예: "이 페이지는 관리자 전용입니다."). */
  message?: string;
  /** 홈으로 이동할 경로. 기본은 /dashboard. */
  homeHref?: string;
  homeLabel?: string;
}

export function UnauthorizedState({
  message,
  homeHref = '/dashboard',
  homeLabel = '대시보드로 돌아가기',
}: UnauthorizedStateProps): JSX.Element {
  return (
    <div
      role="alert"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <div
        aria-hidden
        className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-danger-50 to-white"
      >
        <Lock className="h-10 w-10 text-danger-500" strokeWidth={1.5} />
      </div>
      <p className="tabular text-h1 font-bold text-danger-700">403</p>
      <h2 className="text-h2 font-semibold tracking-tight text-neutral-900">
        접근 권한이 없습니다
      </h2>
      <p className="max-w-md text-sm text-neutral-500">
        {message ??
          '이 페이지를 보려면 추가 권한이 필요합니다. 권한이 필요하면 관리자에게 문의해 주세요.'}
      </p>
      <Button asChild variant="secondary" className="min-h-[44px]">
        <Link href={homeHref}>{homeLabel}</Link>
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TableSkeletonRows — 테이블 로딩 placeholder 행
// ---------------------------------------------------------------------------

interface TableSkeletonRowsProps {
  rows?: number;
  columns: number;
  /** 각 셀 폭 가변 — 디자인 일관성보다 자연스러운 대기감 우선. */
  widths?: ReadonlyArray<string>;
}

export function TableSkeletonRows({
  rows = 5,
  columns,
  widths,
}: TableSkeletonRowsProps): JSX.Element {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <tr key={rowIdx}>
          {Array.from({ length: columns }).map((__, colIdx) => (
            <td key={colIdx} className="px-4 py-3">
              <Skeleton className={`h-4 ${widths?.[colIdx] ?? 'w-full'}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
