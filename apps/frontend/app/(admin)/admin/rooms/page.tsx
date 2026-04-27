'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DoorOpen, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { RoomFormModal } from '@/components/features/admin/RoomFormModal';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, TableSkeletonRows } from '@/components/ui/state-views';
import { deleteRoom, listAllRooms } from '@/lib/api/admin';
import type { ApiError } from '@/lib/api/axios';
import type { RoomDto } from '@/lib/api/bookings';

const ROOM_LIMIT = 10;

const DELETE_ERROR: Partial<Record<string, string>> = {
  ROOM_HAS_FUTURE_BOOKINGS:
    '미래 예약이 있는 회의실은 삭제할 수 없습니다. 비활성화하려면 수정에서 활성 체크를 해제해 주세요.',
};

export default function AdminRoomsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [modalRoom, setModalRoom] = useState<RoomDto | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const roomsQuery = useQuery<RoomDto[]>({
    queryKey: ['admin', 'rooms'],
    queryFn: listAllRooms,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRoom,
    onSuccess: () => {
      toast.success('회의실이 삭제되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'rooms'] });
      void queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
    onError: (error: ApiError) => {
      toast.error(DELETE_ERROR[error.code] ?? error.userMessage);
    },
  });

  const rooms = roomsQuery.data ?? [];
  const atLimit = rooms.length >= ROOM_LIMIT;

  const handleDelete = (room: RoomDto): void => {
    if (!window.confirm(`'${room.name}' 회의실을 삭제하시겠습니까?`)) return;
    deleteMutation.mutate(room.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          총 <span className="tabular font-medium text-neutral-900">{rooms.length}</span> /{' '}
          {ROOM_LIMIT} 개 등록됨
        </p>
        <Button onClick={() => setCreateOpen(true)} disabled={atLimit}>
          <Plus className="h-4 w-4" strokeWidth={2.25} />
          회의실 추가
        </Button>
      </div>

      {atLimit ? (
        <div className="rounded-lg border border-warning-500/20 bg-warning-50 px-3 py-2 text-sm text-warning-700">
          회의실은 최대 {ROOM_LIMIT}개까지 등록할 수 있습니다.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3">수용</th>
                <th className="px-4 py-3">위치</th>
                <th className="px-4 py-3">순서</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3 text-right">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {roomsQuery.isLoading ? (
                <TableSkeletonRows rows={4} columns={6} />
              ) : roomsQuery.isError ? (
                <tr>
                  <td colSpan={6} className="p-0">
                    <ErrorState
                      error={roomsQuery.error}
                      onRetry={() => void roomsQuery.refetch()}
                      isRetrying={roomsQuery.isFetching}
                    />
                  </td>
                </tr>
              ) : rooms.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-0">
                    <EmptyState
                      icon={DoorOpen}
                      tone="brand"
                      title="등록된 회의실이 없습니다"
                      description="첫 회의실을 등록하면 사용자가 캘린더에서 바로 예약할 수 있습니다."
                      action={
                        <Button onClick={() => setCreateOpen(true)} disabled={atLimit}>
                          <Plus className="h-4 w-4" strokeWidth={2.25} />
                          회의실 추가
                        </Button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                rooms.map((room) => (
                  <tr key={room.id} className="transition-colors hover:bg-neutral-50">
                    <td className="px-4 py-3 font-medium text-neutral-900">{room.name}</td>
                    <td className="px-4 py-3 tabular text-neutral-700">{room.capacity ?? '-'}</td>
                    <td className="px-4 py-3 text-neutral-700">{room.location ?? '-'}</td>
                    <td className="px-4 py-3 tabular text-neutral-700">{room.displayOrder}</td>
                    <td className="px-4 py-3">
                      {room.isActive ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-success-500/20 bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
                          활성
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
                          비활성
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setModalRoom(room)}>
                          수정
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(room)}
                          disabled={deleteMutation.isPending}
                        >
                          삭제
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <RoomFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <RoomFormModal
        open={modalRoom !== null}
        onClose={() => setModalRoom(null)}
        room={modalRoom ?? undefined}
      />
    </div>
  );
}
