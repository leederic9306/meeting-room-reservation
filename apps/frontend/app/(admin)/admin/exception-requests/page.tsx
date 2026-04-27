'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { RejectExceptionRequestModal } from '@/components/features/admin/RejectExceptionRequestModal';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, TableSkeletonRows } from '@/components/ui/state-views';
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
      <p className="text-sm text-neutral-500">
        관리자 승인이 필요한 예약 신청 목록입니다. 승인 시 예약이 즉시 생성되고 캘린더에 반영됩니다.
      </p>

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
                <th className="px-4 py-3">신청자</th>
                <th className="px-4 py-3">회의실</th>
                <th className="px-4 py-3">날짜 / 시간</th>
                <th className="px-4 py-3">제목 / 사유</th>
                <th className="px-4 py-3">상태</th>
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
                      icon={ClipboardCheck}
                      tone={filters.status === 'PENDING' ? 'brand' : 'neutral'}
                      title={
                        filters.status === 'PENDING'
                          ? '검토 대기 중인 신청이 없습니다'
                          : '조건에 맞는 신청이 없습니다'
                      }
                      description={
                        filters.status === 'PENDING'
                          ? '새 예외 신청이 접수되면 여기에 자동으로 표시됩니다. 30초마다 새로 확인합니다.'
                          : '다른 상태 필터를 선택해 보세요.'
                      }
                    />
                  </td>
                </tr>
              ) : (
                data?.data.map((req) => {
                  const isPending = req.status === 'PENDING';
                  const isProcessing =
                    (approveMutation.isPending && approveMutation.variables === req.id) ||
                    (rejectMutation.isPending && rejectMutation.variables?.id === req.id);
                  return (
                    <tr key={req.id} className="align-top transition-colors hover:bg-neutral-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-neutral-900">{req.user.name}</div>
                        <div className="text-xs text-neutral-500">{req.user.department ?? '-'}</div>
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
                        <div className="font-medium text-neutral-900">{req.title}</div>
                        <div
                          className="mt-1 line-clamp-3 max-w-[24rem] text-xs text-neutral-500"
                          title={req.reason}
                        >
                          {req.reason}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium',
                            STATUS_TONE[req.status],
                          )}
                        >
                          <span
                            className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[req.status])}
                          />
                          {STATUS_LABEL[req.status]}
                        </span>
                        {req.reviewer ? (
                          <div className="mt-1 text-xs text-neutral-500">
                            {req.reviewer.name} ·{' '}
                            {req.reviewedAt ? new Date(req.reviewedAt).toLocaleString('ko-KR') : ''}
                          </div>
                        ) : null}
                        {req.reviewComment ? (
                          <div
                            className="mt-1 max-w-[16rem] text-xs text-neutral-500"
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
                              variant="secondary"
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
