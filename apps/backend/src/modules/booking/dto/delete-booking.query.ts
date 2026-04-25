import { IsEnum, IsOptional } from 'class-validator';

/**
 * 반복 예약 회차 삭제 범위. docs/03-api-spec.md §4.5.
 *
 * - `INSTANCE` (기본): 해당 회차만 소프트 삭제 + RecurrenceException 추가
 *   → POST /recurrences/:id/exceptions와 동일 효과 (클라이언트 편의 alias)
 * - `FOLLOWING`: 이 회차부터 미래 모든 회차 소프트 삭제 + 시리즈 untilAt 단축
 * - `SERIES`: 시리즈 전체 삭제 (모든 미래 회차 + RecurrenceRule)
 *
 * 단일 예약(recurrenceId=null)은 scope 값과 무관하게 항상 단순 소프트 삭제.
 */
export enum DeleteBookingScope {
  INSTANCE = 'instance',
  FOLLOWING = 'following',
  SERIES = 'series',
}

export class DeleteBookingQuery {
  @IsOptional()
  @IsEnum(DeleteBookingScope, {
    message: 'scope는 instance | following | series 중 하나여야 합니다.',
  })
  scope?: DeleteBookingScope;
}
