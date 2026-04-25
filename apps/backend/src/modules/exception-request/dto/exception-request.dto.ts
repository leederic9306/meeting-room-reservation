import type { ExceptionRequest, ExceptionRequestStatus, Room, User } from '@prisma/client';

/**
 * 예외 신청 응답 DTO. docs/03-api-spec.md §6.
 *
 * - 신청 시점 충돌 정보(`conflicts`)는 생성 응답에서만 채워진다 — 참고용.
 * - 승인 응답에서 `bookingId` 가 채워지며, 그 외 상태에서는 null.
 *   reviewer 정보는 검토 시점 이후에만 노출.
 */
export interface ExceptionRequestDto {
  id: string;
  status: ExceptionRequestStatus;
  user: { id: string; name: string; department: string | null };
  room: { id: string; name: string };
  title: string;
  reason: string;
  startAt: string;
  endAt: string;
  reviewer: { id: string; name: string } | null;
  reviewComment: string | null;
  reviewedAt: string | null;
  bookingId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ExceptionRequestWithRelations = ExceptionRequest & {
  user: Pick<User, 'id' | 'name' | 'department'>;
  room: Pick<Room, 'id' | 'name'>;
  reviewer: Pick<User, 'id' | 'name'> | null;
  booking: { id: string } | null;
};

export function toExceptionRequestDto(req: ExceptionRequestWithRelations): ExceptionRequestDto {
  return {
    id: req.id,
    status: req.status,
    user: {
      id: req.user.id,
      name: req.user.name,
      department: req.user.department,
    },
    room: { id: req.room.id, name: req.room.name },
    title: req.title,
    reason: req.reason,
    startAt: req.startAt.toISOString(),
    endAt: req.endAt.toISOString(),
    reviewer: req.reviewer ? { id: req.reviewer.id, name: req.reviewer.name } : null,
    reviewComment: req.reviewComment,
    reviewedAt: req.reviewedAt?.toISOString() ?? null,
    bookingId: req.booking?.id ?? null,
    createdAt: req.createdAt.toISOString(),
    updatedAt: req.updatedAt.toISOString(),
  };
}

/**
 * 신청 시점 참고용 충돌 정보. 승인 시점에 다시 검증되므로 단순 안내 목적.
 */
export interface ConflictHintDto {
  bookingId: string;
  title: string;
  startAt: string;
  endAt: string;
}

/**
 * 생성 응답 — 기본 신청 객체에 신청 시점 충돌 힌트를 덧붙인다.
 */
export type CreateExceptionRequestResponseDto = ExceptionRequestDto & {
  conflicts: ConflictHintDto[];
};

/**
 * 승인 응답 — 생성된 Booking의 id를 함께 노출.
 */
export interface ApproveExceptionRequestResponseDto {
  id: string;
  status: ExceptionRequestStatus;
  bookingId: string;
  reviewedAt: string;
}
