'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileClock } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, TableSkeletonRows } from '@/components/ui/state-views';
import type { ApiError } from '@/lib/api/axios';
import {
  cancelExceptionRequest,
  EXCEPTION_REQUEST_STATUSES,
  listMyExceptionRequests,
  type ExceptionRequestDto,
  type ExceptionRequestStatus,
  type ListExceptionRequestsParams,
  type PaginatedExceptionRequests,
} from '@/lib/api/exception-requests';
import { cn } from '@/lib/utils';
import { formatKstDateTime, formatKstTimeRange } from '@/lib/utils/datetime';

const PAGE_LIMIT = 20;

const STATUS_LABEL: Record<ExceptionRequestStatus, string> = {
  PENDING: '검토 대기',
  APPROVED: '승인됨',
  REJECTED: '반려됨',
  CANCELLED: '취소됨',
};

/** 디자인 §4.4 — semantic 토큰 기반 상태 배지 */
const STATUS_TONE: Record<ExceptionRequestStatus, string> = {
  PENDING: 'border-warning-500/20 bg-warning-50 text-warning-700',
  APPROVED: 'border-success-500/20 bg-success-50 text-success-700',
  REJECTED: 'border-danger-500/20 bg-danger-50 text-danger-700',
  CANCELLED: 'border-neutral-200 bg-neutral-100 text-neutral-600',
};
const STATUS_DOT: Record<ExceptionRequestStatus, string> = {
  PENDING: 'bg-warning-500',
  APPROVED: 'bg-success-500',
  REJECTED: 'bg-danger-500',
  CANCELLED: 'bg-neutral-400',
};

const ERROR_TOAST: Partial<Record<string, string>> = {
  EXCEPTION_REQUEST_OWNERSHIP_REQUIRED: '본인 신청만 취소할 수 있습니다.',
  INVALID_STATUS_TRANSITION: '대기 상태의 신청만 취소할 수 있습니다.',
  EXCEPTION_REQUEST_NOT_FOUND: '예외 신청을 찾을 수 없습니다.',
};

export default function MyRequestsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ListExceptionRequestsParams>({
    page: 1,
    limit: PAGE_LIMIT,
  });

  const requestsQuery = useQuery<PaginatedExceptionRequests>({
    queryKey: ['exception-requests', 'me', filters],
    queryFn: () => listMyExceptionRequests(filters),
    placeholderData: keepPreviousData,
  });

  const cancelMutation = useMutation({
    mutationFn: cancelExceptionRequest,
    onSuccess: () => {
      toast.success('신청이 취소되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['exception-requests', 'me'] });
    },
    onError: (error: ApiError) => {
      toast.error(ERROR_TOAST[error.code] ?? error.userMessage);
    },
  });

  const handleCancel = (req: ExceptionRequestDto): void => {
    if (!window.confirm(`"${req.title}" 신청을 취소하시겠어요?`)) return;
    cancelMutation.mutate(req.id);
  };

  const data = requestsQuery.data;
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">내 활동</p>
        <h1 className="mt-1 text-h1 font-semibold tracking-tight text-neutral-900">예외 신청</h1>
        <p className="mt-1.5 text-sm text-neutral-500">
          관리자 승인이 필요한 예약 신청 이력입니다. 검토 대기 중인 신청은 취소할 수 있습니다.
        </p>
      </div>

      <div
        role="toolbar"
        aria-label="신청 상태 필터"
        className="flex flex-wrap items-center gap-1.5 rounded-xl border border-neutral-200 bg-white p-3 shadow-xs"
      >
        <span className="px-2 text-xs font-medium text-neutral-500">상태</span>
        <FilterChip
          label="전체"
          selected={filters.status === undefined}
          onClick={() => setFilters((prev) => ({ ...prev, status: undefined, page: 1 }))}
        />
        {EXCEPTION_REQUEST_STATUSES.map((status) => (
          <FilterChip
            key={status}
            label={STATUS_LABEL[status]}
            selected={filters.status === status}
            onClick={() => setFilters((prev) => ({ ...prev, status, page: 1 }))}
          />
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                <th className="px-4 py-3">제목</th>
                <th className="px-4 py-3">회의실</th>
                <th className="px-4 py-3">날짜 / 시간</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">검토</th>
                <th className="px-4 py-3 text-right">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {requestsQuery.isLoading ? (
                <TableSkeletonRows rows={5} columns={6} />
              ) : requestsQuery.isError ? (
                <tr>
                  <td colSpan={6} className="p-0">
                    <ErrorState
                      error={requestsQuery.error}
                      onRetry={() => void requestsQuery.refetch()}
                      isRetrying={requestsQuery.isFetching}
                    />
                  </td>
                </tr>
              ) : (data?.data.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={6} className="p-0">
                    <EmptyState
                      icon={FileClock}
                      tone={filters.status === undefined ? 'brand' : 'neutral'}
                      title={
                        filters.status === undefined
                          ? '아직 예외 신청 내역이 없습니다'
                          : '조건에 맞는 신청이 없습니다'
                      }
                      description={
                        filters.status === undefined
                          ? '4시간 이상의 예약이나 시간 충돌은 관리자 승인이 필요합니다. 캘린더에서 예약 시 자동으로 안내됩니다.'
                          : '다른 상태 필터를 선택해 보세요.'
                      }
                      action={
                        filters.status === undefined ? (
                          <Button asChild variant="default">
                            <a href="/dashboard">캘린더로 이동</a>
                          </Button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              ) : (
                data?.data.map((req) => (
                  <tr key={req.id} className="align-top transition-colors hover:bg-neutral-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-neutral-900">{req.title}</div>
                      <div
                        className="mt-1 line-clamp-2 max-w-[24rem] text-xs text-neutral-500"
                        title={req.reason}
                      >
                        {req.reason}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{req.room.name}</td>
                    <td className="px-4 py-3">
                      <div className="tabular font-medium text-neutral-900">
                        {formatKstDateTime(req.startAt)}
                      </div>
                      <div className="tabular mt-0.5 text-[0.8125rem] text-neutral-500">
                        {formatKstTimeRange(req.startAt, req.endAt)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium',
                          STATUS_TONE[req.status],
                        )}
                      >
                        <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[req.status])} />
                        {STATUS_LABEL[req.status]}
                      </span>
                      {req.status === 'APPROVED' && req.bookingId ? (
                        <div className="mt-1 font-mono text-[0.625rem] text-neutral-400">
                          예약 ID: {req.bookingId.slice(0, 8)}…
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {req.reviewer ? (
                        <>
                          <div className="font-medium text-neutral-900">{req.reviewer.name}</div>
                          <div className="text-neutral-500">
                            {req.reviewedAt ? new Date(req.reviewedAt).toLocaleString('ko-KR') : ''}
                          </div>
                          {req.reviewComment ? (
                            <div
                              className="mt-1 max-w-[16rem] text-neutral-500"
                              title={req.reviewComment}
                            >
                              “{req.reviewComment}”
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {req.status === 'PENDING' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={cancelMutation.isPending}
                          onClick={() => handleCancel(req)}
                        >
                          취소
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {meta ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-500">
            총 <span className="tabular font-medium text-neutral-900">{meta.totalItems}</span>건 —{' '}
            {meta.page} / {meta.totalPages} 페이지
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setFilters((prev) => ({ ...prev, page: Math.max(1, (prev.page ?? 1) - 1) }))
              }
              disabled={meta.page <= 1 || requestsQuery.isFetching}
            >
              이전
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }))}
              disabled={meta.page >= meta.totalPages || requestsQuery.isFetching}
            >
              다음
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface FilterChipProps {
  label: string;
  selected: boolean;
  onClick: () => void;
}

function FilterChip({ label, selected, onClick }: FilterChipProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'inline-flex h-8 items-center rounded-full px-3 text-xs font-medium transition-colors',
        selected
          ? 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-500/20'
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
      )}
    >
      {label}
    </button>
  );
}
