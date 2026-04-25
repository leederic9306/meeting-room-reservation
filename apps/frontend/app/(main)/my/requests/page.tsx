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

const STATUS_TONE: Record<ExceptionRequestStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  APPROVED: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
  REJECTED: 'bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200',
  CANCELLED: 'bg-muted text-muted-foreground',
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
        <h1 className="text-2xl font-bold">내 예외 신청</h1>
        <p className="text-sm text-muted-foreground">
          관리자 승인이 필요한 예약 신청 이력입니다. 검토 대기 중인 신청은 취소할 수 있습니다.
        </p>
      </div>

      <div
        role="toolbar"
        aria-label="신청 상태 필터"
        className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2"
      >
        <span className="px-1 text-xs font-medium text-muted-foreground">상태</span>
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

      <div className="overflow-x-auto rounded-md border bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2">제목</th>
              <th className="px-4 py-2">회의실</th>
              <th className="px-4 py-2">날짜 / 시간</th>
              <th className="px-4 py-2">상태</th>
              <th className="px-4 py-2">검토</th>
              <th className="px-4 py-2 text-right">작업</th>
            </tr>
          </thead>
          <tbody>
            {requestsQuery.isLoading ? (
              <TableSkeletonRows rows={5} columns={6} />
            ) : requestsQuery.isError ? (
              <tr>
                <td colSpan={6} className="px-0 py-0">
                  <ErrorState
                    error={requestsQuery.error}
                    onRetry={() => void requestsQuery.refetch()}
                    isRetrying={requestsQuery.isFetching}
                  />
                </td>
              </tr>
            ) : (data?.data.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={6} className="px-0 py-0">
                  <EmptyState
                    icon={FileClock}
                    title={
                      filters.status === undefined
                        ? '아직 예외 신청 내역이 없습니다'
                        : '조건에 맞는 신청이 없습니다'
                    }
                    description={
                      filters.status === undefined
                        ? '4시간 이상의 예약이나 시간 충돌은 관리자 승인이 필요합니다. 캘린더에서 예약 시 안내됩니다.'
                        : '다른 상태 필터를 선택해 보세요.'
                    }
                  />
                </td>
              </tr>
            ) : (
              data?.data.map((req) => (
                <tr key={req.id} className="border-t align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium">{req.title}</div>
                    <div
                      className="mt-1 line-clamp-2 max-w-[24rem] text-xs text-muted-foreground"
                      title={req.reason}
                    >
                      {req.reason}
                    </div>
                  </td>
                  <td className="px-4 py-3">{req.room.name}</td>
                  <td className="px-4 py-3">
                    <div>{formatKstDateTime(req.startAt)}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatKstTimeRange(req.startAt, req.endAt)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        STATUS_TONE[req.status],
                      )}
                    >
                      {STATUS_LABEL[req.status]}
                    </span>
                    {req.status === 'APPROVED' && req.bookingId ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        예약 ID: {req.bookingId.slice(0, 8)}…
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {req.reviewer ? (
                      <>
                        <div>{req.reviewer.name}</div>
                        <div className="text-muted-foreground">
                          {req.reviewedAt ? new Date(req.reviewedAt).toLocaleString('ko-KR') : ''}
                        </div>
                        {req.reviewComment ? (
                          <div
                            className="mt-1 max-w-[16rem] text-muted-foreground"
                            title={req.reviewComment}
                          >
                            “{req.reviewComment}”
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {req.status === 'PENDING' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
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

      {meta ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            총 {meta.totalItems}건 — {meta.page} / {meta.totalPages} 페이지
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setFilters((prev) => ({ ...prev, page: Math.max(1, (prev.page ?? 1) - 1) }))
              }
              disabled={meta.page <= 1 || requestsQuery.isFetching}
            >
              이전
            </Button>
            <Button
              size="sm"
              variant="outline"
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
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        selected
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}
