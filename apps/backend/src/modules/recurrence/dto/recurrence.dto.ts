import type { Booking, RecurrenceException, RecurrenceRule, Room, User } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';

const KST = 'Asia/Seoul';

/**
 * 반복 시리즈 응답 DTO. docs/03-api-spec.md §5.2.
 * Prisma 모델은 내부 구현 — 외부에는 이 형태로만 노출한다.
 */
export interface RecurrenceDto {
  id: string;
  room: { id: string; name: string };
  user: { id: string; name: string; department: string | null };
  title: string;
  description: string | null;
  rrule: string;
  durationMinutes: number;
  startAt: string;
  untilAt: string;
  exceptions: RecurrenceExceptionDto[];
  instances: RecurrenceInstanceDto[];
  createdAt: string;
}

export interface RecurrenceExceptionDto {
  id: string;
  excludedDate: string;
  reason: string | null;
  createdAt: string;
}

export interface RecurrenceInstanceDto {
  id: string;
  startAt: string;
  endAt: string;
  isPast: boolean;
}

export type RecurrenceWithRelations = RecurrenceRule & {
  room: Pick<Room, 'id' | 'name'>;
  user: Pick<User, 'id' | 'name' | 'department'>;
  exceptions: RecurrenceException[];
  bookings: Pick<Booking, 'id' | 'startAt' | 'endAt'>[];
};

/** rrule.js 펼침 결과의 회차 시작 인스턴스. */
export interface CreateRecurrenceResultDto {
  recurrenceId: string;
  createdBookings: number;
  skippedBookings: SkippedInstanceDto[];
}

export interface SkippedInstanceDto {
  index: number;
  /** KST 기준 YYYY-MM-DD. */
  instanceDate: string;
  /** 인스턴스의 UTC 시작 시각 ISO. */
  startAt: string;
  reason: 'TIME_CONFLICT' | 'PAST_INSTANCE';
}

export interface CreateExceptionResultDto {
  id: string;
  excludedDate: string;
  reason: string | null;
  deletedBookingId: string | null;
}

export function toRecurrenceDto(rule: RecurrenceWithRelations, now: Date): RecurrenceDto {
  return {
    id: rule.id,
    room: { id: rule.room.id, name: rule.room.name },
    user: {
      id: rule.user.id,
      name: rule.user.name,
      department: rule.user.department,
    },
    title: rule.title,
    description: rule.description,
    rrule: rule.rrule,
    durationMinutes: rule.durationMinutes,
    startAt: rule.startAt.toISOString(),
    untilAt: rule.untilAt.toISOString(),
    exceptions: rule.exceptions
      .slice()
      .sort((a, b) => a.excludedDate.getTime() - b.excludedDate.getTime())
      .map((e) => ({
        id: e.id,
        excludedDate: formatInTimeZone(e.excludedDate, KST, 'yyyy-MM-dd'),
        reason: e.reason,
        createdAt: e.createdAt.toISOString(),
      })),
    instances: rule.bookings
      .slice()
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
      .map((b) => ({
        id: b.id,
        startAt: b.startAt.toISOString(),
        endAt: b.endAt.toISOString(),
        isPast: b.endAt.getTime() <= now.getTime(),
      })),
    createdAt: rule.createdAt.toISOString(),
  };
}
