import type { Booking, Room, User } from '@prisma/client';

/**
 * 예약 응답 DTO. docs/03-api-spec.md §4.1 / §4.2 참조.
 * Prisma 모델은 내부 구현 — 외부에는 이 형태로만 노출한다.
 */
export interface BookingDto {
  id: string;
  room: { id: string; name: string };
  user: { id: string; name: string; department: string | null };
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  recurrenceId: string | null;
  recurrenceIndex: number | null;
  createdByAdmin: boolean;
  isMine: boolean;
  createdAt: string;
}

export type BookingWithRelations = Booking & {
  room: Pick<Room, 'id' | 'name'>;
  user: Pick<User, 'id' | 'name' | 'department'>;
};

export function toBookingDto(booking: BookingWithRelations, viewerId: string): BookingDto {
  return {
    id: booking.id,
    room: { id: booking.room.id, name: booking.room.name },
    user: {
      id: booking.user.id,
      name: booking.user.name,
      department: booking.user.department,
    },
    title: booking.title,
    description: booking.description,
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    recurrenceId: booking.recurrenceId,
    recurrenceIndex: booking.recurrenceIndex,
    createdByAdmin: booking.createdByAdmin,
    isMine: booking.userId === viewerId,
    createdAt: booking.createdAt.toISOString(),
  };
}
