'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState, ErrorState, TableSkeletonRows } from '@/components/ui/state-views';
import {
  actionLabel,
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  listAdminAuditLogs,
  targetTypeLabel,
  type AuditLogDto,
  type KnownAuditAction,
  type KnownAuditTargetType,
  type ListAuditLogsParams,
  type PaginatedAuditLogs,
} from '@/lib/api/audit-logs';
import { cn } from '@/lib/utils';

const PAGE_LIMIT = 20;

interface FilterState extends ListAuditLogsParams {
  page: number;
  limit: number;
}

export default function AdminAuditLogsPage(): JSX.Element {
  const [filters, setFilters] = useState<FilterState>({ page: 1, limit: PAGE_LIMIT });
  const [draft, setDraft] = useState<{ from: string; to: string }>({ from: '', to: '' });

  const logsQuery = useQuery<PaginatedAuditLogs>({
    queryKey: ['admin', 'audit-logs', filters],
    queryFn: () => listAdminAuditLogs(filters),
    placeholderData: keepPreviousData,
  });

  const data = logsQuery.data;
  const meta = data?.meta;

  const applyDateRange = (e: React.FormEvent): void => {
    e.preventDefault();
    setFilters((prev) => ({
      ...prev,
      from: draft.from ? new Date(draft.from).toISOString() : undefined,
      to: draft.to ? new Date(draft.to).toISOString() : undefined,
      page: 1,
    }));
  };

  const clearFilters = (): void => {
    setDraft({ from: '', to: '' });
    setFilters({ page: 1, limit: PAGE_LIMIT });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">감사 로그</h2>
        <p className="text-sm text-muted-foreground">
          관리자 행위, 사용자 상태 전이, 회의실/예외 신청 변경 등 주요 이벤트의 기록입니다.
        </p>
      </div>

      <form
        onSubmit={applyDateRange}
        className="grid grid-cols-1 gap-3 rounded-md border bg-card p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]"
      >
        <div>
          <Label htmlFor="audit-action">액션</Label>
          <select
            id="audit-action"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={filters.action ?? ''}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                action: (e.target.value || undefined) as KnownAuditAction | undefined,
                page: 1,
              }))
            }
          >
            <option value="">전체</option>
            {(Object.keys(AUDIT_ACTIONS) as KnownAuditAction[]).map((key) => (
              <option key={key} value={key}>
                {AUDIT_ACTIONS[key]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="audit-target">대상 타입</Label>
          <select
            id="audit-target"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={filters.targetType ?? ''}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                targetType: (e.target.value || undefined) as KnownAuditTargetType | undefined,
                page: 1,
              }))
            }
          >
            <option value="">전체</option>
            {(Object.keys(AUDIT_TARGET_TYPES) as KnownAuditTargetType[]).map((key) => (
              <option key={key} value={key}>
                {AUDIT_TARGET_TYPES[key]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="audit-from">시작 (from)</Label>
          <Input
            id="audit-from"
            type="datetime-local"
            value={draft.from}
            onChange={(e) => setDraft((p) => ({ ...p, from: e.target.value }))}
          />
        </div>
        <div>
          <Label htmlFor="audit-to">끝 (to)</Label>
          <Input
            id="audit-to"
            type="datetime-local"
            value={draft.to}
            onChange={(e) => setDraft((p) => ({ ...p, to: e.target.value }))}
          />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">적용</Button>
          <Button type="button" variant="outline" onClick={clearFilters}>
            초기화
          </Button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-md border bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2">시각</th>
              <th className="px-4 py-2">액션</th>
              <th className="px-4 py-2">대상</th>
              <th className="px-4 py-2">행위자</th>
              <th className="px-4 py-2">상세</th>
            </tr>
          </thead>
          <tbody>
            {logsQuery.isLoading ? (
              <TableSkeletonRows rows={6} columns={5} />
            ) : logsQuery.isError ? (
              <tr>
                <td colSpan={5} className="px-0 py-0">
                  <ErrorState
                    error={logsQuery.error}
                    onRetry={() => void logsQuery.refetch()}
                    isRetrying={logsQuery.isFetching}
                  />
                </td>
              </tr>
            ) : (data?.data.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={5} className="px-0 py-0">
                  <EmptyState
                    icon={ScrollText}
                    title="조건에 맞는 로그가 없습니다"
                    description="기간이나 액션/대상 필터를 비우거나 더 넓혀 보세요."
                    action={
                      <Button type="button" variant="outline" onClick={clearFilters}>
                        필터 초기화
                      </Button>
                    }
                  />
                </td>
              </tr>
            ) : (
              data?.data.map((log) => <AuditLogRow key={log.id} log={log} />)
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
              disabled={meta.page <= 1 || logsQuery.isFetching}
            >
              이전
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }))}
              disabled={meta.page >= meta.totalPages || logsQuery.isFetching}
            >
              다음
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AuditLogRow({ log }: { log: AuditLogDto }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const hasPayload = log.payload !== null && log.payload !== undefined;

  return (
    <tr className="border-t align-top">
      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
        {new Date(log.createdAt).toLocaleString('ko-KR')}
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
          {actionLabel(log.action)}
        </span>
        <div className="mt-1 font-mono text-[0.625rem] text-muted-foreground">{log.action}</div>
      </td>
      <td className="px-4 py-3">
        <div>{targetTypeLabel(log.targetType)}</div>
        {log.targetId ? (
          <div className="font-mono text-[0.625rem] text-muted-foreground" title={log.targetId}>
            {log.targetId.slice(0, 8)}…
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {log.actor ? (
          <>
            <div className="font-medium">{log.actor.name}</div>
            <div className="text-xs text-muted-foreground">{log.actor.email}</div>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">시스템</span>
        )}
      </td>
      <td className="px-4 py-3">
        {hasPayload ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={cn(
              'rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-accent',
            )}
          >
            {expanded ? '닫기' : '펼치기'}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
        {expanded && hasPayload ? (
          <pre className="mt-2 max-w-[36rem] overflow-x-auto rounded-md bg-muted/40 p-2 text-[0.625rem] leading-relaxed">
            {JSON.stringify(log.payload, null, 2)}
          </pre>
        ) : null}
      </td>
    </tr>
  );
}
