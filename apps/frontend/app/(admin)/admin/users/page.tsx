'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
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
      <div>
        <h2 className="text-lg font-semibold">사용자 관리</h2>
        <p className="text-sm text-muted-foreground">
          이메일/이름 검색과 역할/상태 필터를 사용할 수 있습니다.
        </p>
      </div>

      <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="user-search">검색</Label>
          <Input
            id="user-search"
            placeholder="이메일 또는 이름"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="user-role">역할</Label>
          <select
            id="user-role"
            className="flex h-10 w-32 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            className="flex h-10 w-36 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

      <div className="overflow-x-auto rounded-md border bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2">이름</th>
              <th className="px-4 py-2">이메일</th>
              <th className="px-4 py-2">부서</th>
              <th className="px-4 py-2">역할</th>
              <th className="px-4 py-2">상태</th>
              <th className="px-4 py-2">최근 로그인</th>
            </tr>
          </thead>
          <tbody>
            {usersQuery.isLoading ? (
              <TableSkeletonRows rows={6} columns={6} />
            ) : usersQuery.isError ? (
              <tr>
                <td colSpan={6} className="px-0 py-0">
                  <ErrorState
                    error={usersQuery.error}
                    onRetry={() => void usersQuery.refetch()}
                    isRetrying={usersQuery.isFetching}
                  />
                </td>
              </tr>
            ) : (data?.data.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={6} className="px-0 py-0">
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
                  <tr key={user.id} className="border-t">
                    <td className="px-4 py-2 font-medium">{user.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{user.email}</td>
                    <td className="px-4 py-2">{user.department ?? '-'}</td>
                    <td className="px-4 py-2">
                      <select
                        aria-label={`${user.name} 역할`}
                        className={cn(
                          'h-8 rounded-md border border-input bg-background px-2 text-sm',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          'disabled:cursor-not-allowed disabled:opacity-60',
                        )}
                        value={user.role}
                        disabled={isMe || roleMutation.isPending}
                        onChange={(e) => handleRoleChange(user, e.target.value as UserRole)}
                      >
                        <option value="USER">USER</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                      {isMe ? (
                        <span className="ml-2 text-xs text-muted-foreground">(본인)</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2">{STATUS_LABEL[user.status]}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('ko-KR') : '-'}
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
            총 {meta.totalItems}명 — {meta.page} / {meta.totalPages} 페이지
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setFilters((prev) => ({ ...prev, page: Math.max(1, (prev.page ?? 1) - 1) }))
              }
              disabled={meta.page <= 1 || usersQuery.isFetching}
            >
              이전
            </Button>
            <Button
              size="sm"
              variant="outline"
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
