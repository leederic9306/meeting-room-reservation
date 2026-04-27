'use client';

import { useQueries } from '@tanstack/react-query';
import { CalendarRange, ClipboardList, DoorOpen, Users } from 'lucide-react';

import { StatCard, StatCardSkeleton } from '@/components/ui/stat-card';
import { listAdminUsers, listAllRooms } from '@/lib/api/admin';
import { listBookingsByRange } from '@/lib/api/bookings';
import { listAdminExceptionRequests } from '@/lib/api/exception-requests';

const ROOM_LIMIT = 10;
const PENDING_REFRESH_INTERVAL_MS = 30_000;

/** 한국 표준시 기준 이번 주(월~일) 시작/끝을 UTC ISO로 반환. */
function thisWeekRangeIso(): { from: string; to: string } {
  const now = new Date();
  const day = now.getDay(); // 0(일) ~ 6(토)
  const monOffset = (day + 6) % 7; // 월요일까지 며칠 전인지
  const startLocal = new Date(now);
  startLocal.setHours(0, 0, 0, 0);
  startLocal.setDate(startLocal.getDate() - monOffset);
  const endLocal = new Date(startLocal);
  endLocal.setDate(endLocal.getDate() + 7);
  return { from: startLocal.toISOString(), to: endLocal.toISOString() };
}

/**
 * AdminStatsPanel — docs/07-design.md §5.6
 *
 * 관리자 첫 인상을 개선하기 위한 4개 통계 카드.
 * 각 쿼리는 독립적으로 페치되며, 로딩 중에는 스켈레톤으로 자리만 잡는다.
 * 대기 신청은 30초 폴링 (AdminNav 배지와 동일 정책)으로 라이브 반영.
 */
export function AdminStatsPanel(): JSX.Element {
  const { from, to } = thisWeekRangeIso();

  const results = useQueries({
    queries: [
      {
        queryKey: ['admin', 'stats', 'rooms'],
        queryFn: listAllRooms,
        staleTime: 60_000,
      },
      {
        queryKey: ['admin', 'users', { page: 1, limit: 1 }],
        queryFn: () => listAdminUsers({ page: 1, limit: 1, status: 'ACTIVE' }),
        select: (res: Awaited<ReturnType<typeof listAdminUsers>>) => res.meta.totalItems,
        staleTime: 30_000,
      },
      {
        queryKey: ['admin', 'stats', 'bookings-week', from, to],
        queryFn: () => listBookingsByRange({ from, to }),
        select: (data: Awaited<ReturnType<typeof listBookingsByRange>>) => data.length,
        staleTime: 30_000,
      },
      {
        queryKey: ['admin', 'exception-requests', 'pending-count'],
        queryFn: () => listAdminExceptionRequests({ status: 'PENDING', page: 1, limit: 1 }),
        select: (res: Awaited<ReturnType<typeof listAdminExceptionRequests>>) =>
          res.meta.totalItems,
        refetchInterval: PENDING_REFRESH_INTERVAL_MS,
        refetchOnWindowFocus: true,
      },
    ],
  });

  const [roomsQ, usersCountQ, bookingsCountQ, pendingCountQ] = results;
  const activeRoomCount = (roomsQ.data ?? []).filter((r) => r.isActive).length;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {usersCountQ.isLoading ? (
        <StatCardSkeleton />
      ) : (
        <StatCard
          label="활성 사용자"
          value={usersCountQ.data ?? 0}
          icon={Users}
          subtitle="status = ACTIVE"
        />
      )}

      {roomsQ.isLoading ? (
        <StatCardSkeleton />
      ) : (
        <StatCard
          label="회의실"
          value={activeRoomCount}
          icon={DoorOpen}
          subtitle={`최대 ${ROOM_LIMIT}개`}
        />
      )}

      {bookingsCountQ.isLoading ? (
        <StatCardSkeleton />
      ) : (
        <StatCard
          label="이번 주 예약"
          value={bookingsCountQ.data ?? 0}
          icon={CalendarRange}
          subtitle="월요일 ~ 일요일"
        />
      )}

      {pendingCountQ.isLoading ? (
        <StatCardSkeleton />
      ) : (
        <StatCard
          label="대기 중인 신청"
          value={pendingCountQ.data ?? 0}
          icon={ClipboardList}
          highlight={(pendingCountQ.data ?? 0) > 0}
        />
      )}
    </div>
  );
}
