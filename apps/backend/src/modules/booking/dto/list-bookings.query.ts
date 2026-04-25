import { IsDateString, IsOptional, IsUUID } from 'class-validator';

/**
 * GET /bookings 쿼리. docs/03-api-spec.md §4.1.
 * `to - from` 최대 31일 검증은 서비스 레이어에서 수행.
 */
export class ListBookingsQuery {
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsDateString({}, { message: 'from은 ISO 8601 datetime이어야 합니다.' })
  from!: string;

  @IsDateString({}, { message: 'to는 ISO 8601 datetime이어야 합니다.' })
  to!: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}
