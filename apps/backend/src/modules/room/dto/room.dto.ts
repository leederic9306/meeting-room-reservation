import type { Room } from '@prisma/client';

/**
 * 회의실 응답 DTO. docs/03-api-spec.md §3.1 / §3.2 참조.
 * Prisma Room 모델은 내부 구현 — API에는 이 DTO로만 노출한다.
 */
export interface RoomDto {
  id: string;
  name: string;
  capacity: number | null;
  location: string | null;
  description: string | null;
  isActive: boolean;
  displayOrder: number;
}

export function toRoomDto(room: Room): RoomDto {
  return {
    id: room.id,
    name: room.name,
    capacity: room.capacity,
    location: room.location,
    description: room.description,
    isActive: room.isActive,
    displayOrder: room.displayOrder,
  };
}
