'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState, ErrorState, TableSkeletonRows } from '@/components/ui/state-views';
import {
  listAdminUsers,
  updateUserRole,
  type AdminUserDto,
  type ListUsersParams,
  type PaginatedUsers,
  type UserRole,
  type UserStatus,
} from '@/lib/api/admin';
import type { ApiError } from '@/lib/api/axios';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';

const PAGE_LIMIT = 20;

const ROLE_ERROR: Partial<Record<string, string>> = {
  LAST_ADMIN_PROTECTION: '마지막 관리자는 강등할 수 없습니다.',
};

const STATUS_LABEL: Record<UserStatus, string> = {
  PENDING: '인증 대기',
  ACTIVE: '활성',
  LOCKED: '잠금',
  DELETED: '삭제됨',
};

/** 상태 배지 톤 — 디자인 §4.4 semantic colors */
const STATUS_TONE: Record<UserStatus, string> = {
  PENDING: 'border-warning-500/20 bg-warning-50 text-warning-700',
  ACTIVE: 'border-success-500/20 bg-success-50 text-success-700',
  LOCKED: 'border-danger-500/20 bg-danger-50 text-danger-700',
  DELETED: 'border-neutral-200 bg-neutral-100 text-neutral-600',
};
const STATUS_DOT: Record<UserStatus, string> = {
  PENDING: 'bg-warning-500',
  ACTIVE: 'bg-success-500',
  LOCKED: 'bg-danger-500',
  DELETED: 'bg-neutral-400',
};

/** 셀렉트 박스 공통 클래스 — 디자인 §4.2와 시각적으로 정렬 */
const SELECT_CLASS = cn(
  'flex h-10 rounded-lg bg-white px-3 text-sm text-neutral-900',
  'border border-neutral-200',
  'transition-colors hover:border-neutral-300',
  'focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100',
);

export default function AdminUsersPage(): JSX.Element {
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);

  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<ListUsersParams>({ page: 1, limit: PAGE_LIMIT });

  const usersQuery = useQuery<PaginatedUsers>({
    queryKey: ['admin', 'users', filters],
    queryFn: () => listAdminUsers(filters),
    placeholderData: keepPreviousData,
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) => updateUserRole(id, role),
    onSuccess: () => {
      toast.success('역할이 변경되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error: ApiError) => {
      toast.error(ROLE_ERROR[error.code] ?? error.userMessage);
    },
  });

  const handleSearchSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    setFilters((prev) => ({ ...prev, search: searchInput || undefined, page: 1 }));
  };

  const handleRoleChange = (user: AdminUserDto, nextRole: UserRole): void => {
    if (nextRole === user.role) return;
    if (
      !window.confirm(
        `${user.name}(${user.email}) 님의 역할을 ${nextRole === 'ADMIN' ? '관리자' : '일반 사용자'}로 변경하시겠습니까?`,
      )
    ) {
      return;
    }
    roleMutation.mutate({ id: user.id, role: nextRole });
  };

  const data = usersQuery.data;
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <form
        onSubmit={handleSearchSubmit}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-xs"
      >
        <div className="min-w-[240px] flex-1">
          <Label htmlFor="user-search">검색</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              id="user-search"
              placeholder="이메일 또는 이름"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="user-role">역할</Label>
          <select
            id="user-role"
            className={cn(SELECT_CLASS, 'w-32')}
            value={filters.role ?? ''}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                role: (e.target.value || undefined) as UserRole | undefined,
                page: 1,
              }))
            }
          >
            <option value="">전체</option>
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </div>
        <div>
          <Label htmlFor="user-status">상태</Label>
          <select
            id="user-status"
            className={cn(SELECT_CLASS, 'w-36')}
            value={filters.status ?? ''}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                status: (e.target.value || undefined) as UserStatus | undefined,
                page: 1,
              }))
            }
          >
            <option value="">전체</option>
            <option value="PENDING">인증 대기</option>
            <option value="ACTIVE">활성</option>
            <option value="LOCKED">잠금</option>
            <option value="DELETED">삭제됨</option>
          </select>
        </div>
        <Button type="submit">검색</Button>
      </form>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3">이메일</th>
                <th className="px-4 py-3">부서</th>
                <th className="px-4 py-3">역할</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">최근 로그인</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {usersQuery.isLoading ? (
                <TableSkeletonRows rows={6} columns={6} />
              ) : usersQuery.isError ? (
                <tr>
                  <td colSpan={6} className="p-0">
                    <ErrorState
                      error={usersQuery.error}
                      onRetry={() => void usersQuery.refetch()}
                      isRetrying={usersQuery.isFetching}
                    />
                  </td>
                </tr>
              ) : (data?.data.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={6} className="p-0">
                    <EmptyState
                      icon={Users}
                      title="조건에 맞는 사용자가 없습니다"
                      description="검색어나 역할/상태 필터를 비우거나 다른 값으로 시도해 보세요."
                    />
                  </td>
                </tr>
              ) : (
                data?.data.map((user) => {
                  const isMe = user.id === me?.id;
                  return (
                    <tr key={user.id} className="transition-colors hover:bg-neutral-50">
                      <td className="px-4 py-3 font-medium text-neutral-900">{user.name}</td>
                      <td className="px-4 py-3 text-neutral-600">{user.email}</td>
                      <td className="px-4 py-3 text-neutral-700">{user.department ?? '-'}</td>
                      <td className="px-4 py-3">
                        <select
                          aria-label={`${user.name} 역할`}
                          className={cn(
                            'h-8 rounded-md border border-neutral-200 bg-white px-2 text-sm',
                            'focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100',
                            'disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400',
                          )}
                          value={user.role}
                          disabled={isMe || roleMutation.isPending}
                          onChange={(e) => handleRoleChange(user, e.target.value as UserRole)}
                        >
                          <option value="USER">USER</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                        {isMe ? (
                          <span className="ml-2 text-xs text-neutral-400">(본인)</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium',
                            STATUS_TONE[user.status],
                          )}
                        >
                          <span
                            className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[user.status])}
                          />
                          {STATUS_LABEL[user.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular text-neutral-500">
                        {user.lastLoginAt
                          ? new Date(user.lastLoginAt).toLocaleString('ko-KR')
                          : '-'}
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
            총 <span className="tabular font-medium text-neutral-900">{meta.totalItems}</span>명 —{' '}
            {meta.page} / {meta.totalPages} 페이지
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setFilters((prev) => ({ ...prev, page: Math.max(1, (prev.page ?? 1) - 1) }))
              }
              disabled={meta.page <= 1 || usersQuery.isFetching}
            >
              이전
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }))}
              disabled={meta.page >= meta.totalPages || usersQuery.isFetching}
            >
              다음
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
