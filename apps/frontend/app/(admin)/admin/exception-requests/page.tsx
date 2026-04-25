'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { RejectExceptionRequestModal } from '@/components/features/admin/RejectExceptionRequestModal';
import { Button } from '@/components/ui/button';
import type { ApiError } from '@/lib/api/axios';
import {
  approveExceptionRequest,
  EXCEPTION_REQUEST_STATUSES,
  listAdminExceptionRequests,
  rejectExceptionRequest,
  type ExceptionRequestDto,
  type ExceptionRequestStatus,
  type ListAdminExceptionRequestsParams,
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
  INVALID_STATUS_TRANSITION: '이미 처리된 신청입니다.',
  BOOKING_TIME_CONFLICT: '승인 시점에 다른 예약이 존재합니다. 새로고침 후 다시 시도해 주세요.',
  EXCEPTION_REQUEST_NOT_FOUND: '예외 신청을 찾을 수 없습니다.',
  REVIEW_COMMENT_REQUIRED: '반려 사유를 입력해주세요.',
};

export default function AdminExceptionRequestsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ListAdminExceptionRequestsParams>({
    status: 'PENDING',
    page: 1,
    limit: PAGE_LIMIT,
  });
  const [rejectTarget, setRejectTarget] = useState<ExceptionRequestDto | undefined>();

  const requestsQuery = useQuery<PaginatedExceptionRequests>({
    queryKey: ['admin', 'exception-requests', filters],
    queryFn: () => listAdminExceptionRequests(filters),
    placeholderData: keepPreviousData,
  });

  const approveMutation = useMutation({
    mutationFn: approveExceptionRequest,
    onSuccess: (result) => {
      toast.success(
        `승인되었습니다. 예약 ID: ${result.bookingId.slice(0, 8)}… 캘린더에 즉시 반영됩니다.`,
      );
      // 신청 목록 + 캘린더(bookings) + 새 신청 배지 모두 무효화 — 즉시 반영.
      void queryClient.invalidateQueries({ queryKey: ['admin', 'exception-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'exception-requests', 'pending-count'],
      });
    },
    onError: (error: ApiError) => {
      toast.error(ERROR_TOAST[error.code] ?? error.userMessage);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reviewComment }: { id: string; reviewComment: string }) =>
      rejectExceptionRequest(id, reviewComment),
    onSuccess: () => {
      toast.success('신청이 반려되었습니다.');
      setRejectTarget(undefined);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'exception-requests'] });
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'exception-requests', 'pending-count'],
      });
    },
    onError: (error: ApiError) => {
      toast.error(ERROR_TOAST[error.code] ?? error.userMessage);
    },
  });

  const handleApprove = (req: ExceptionRequestDto): void => {
    if (!window.confirm(`"${req.title}" 신청을 승인하시겠어요? 예약이 즉시 생성됩니다.`)) return;
    approveMutation.mutate(req.id);
  };

  const data = requestsQuery.data;
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">예외 신청 검토</h2>
        <p className="text-sm text-muted-foreground">
          관리자 승인이 필요한 예약 신청 목록입니다. 승인 시 예약이 즉시 생성되고 캘린더에
          반영됩니다.
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
              <th className="px-4 py-2">신청자</th>
              <th className="px-4 py-2">회의실</th>
              <th className="px-4 py-2">날짜 / 시간</th>
              <th className="px-4 py-2">제목 / 사유</th>
              <th className="px-4 py-2">상태</th>
              <th className="px-4 py-2 text-right">작업</th>
            </tr>
          </thead>
          <tbody>
            {requestsQuery.isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  불러오는 중...
                </td>
              </tr>
            ) : (data?.data.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  조건에 맞는 신청이 없습니다.
                </td>
              </tr>
            ) : (
              data?.data.map((req) => {
                const isPending = req.status === 'PENDING';
                const isProcessing =
                  (approveMutation.isPending && approveMutation.variables === req.id) ||
                  (rejectMutation.isPending && rejectMutation.variables?.id === req.id);
                return (
                  <tr key={req.id} className="border-t align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium">{req.user.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {req.user.department ?? '-'}
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
                      <div className="font-medium">{req.title}</div>
                      <div
                        className="mt-1 line-clamp-3 max-w-[24rem] text-xs text-muted-foreground"
                        title={req.reason}
                      >
                        {req.reason}
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
                      {req.reviewer ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {req.reviewer.name} ·{' '}
                          {req.reviewedAt ? new Date(req.reviewedAt).toLocaleString('ko-KR') : ''}
                        </div>
                      ) : null}
                      {req.reviewComment ? (
                        <div
                          className="mt-1 max-w-[16rem] text-xs text-muted-foreground"
                          title={req.reviewComment}
                        >
                          “{req.reviewComment}”
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isPending ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isProcessing}
                            onClick={() => setRejectTarget(req)}
                          >
                            반려
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={isProcessing}
                            onClick={() => handleApprove(req)}
                          >
                            {approveMutation.isPending && approveMutation.variables === req.id
                              ? '승인 중...'
                              : '승인'}
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })
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

      {rejectTarget ? (
        <RejectExceptionRequestModal
          open
          preview={{ title: rejectTarget.title, userName: rejectTarget.user.name }}
          isSubmitting={rejectMutation.isPending}
          onClose={() => setRejectTarget(undefined)}
          onSubmit={async (reviewComment) => {
            await rejectMutation.mutateAsync({ id: rejectTarget.id, reviewComment });
          }}
        />
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
