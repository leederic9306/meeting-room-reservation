import { IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * POST /admin/bookings 요청 바디. docs/03-api-spec.md §6.7.
 *
 * 일반 /bookings와 달리:
 *  - userId 필수 (예약 대상)
 *  - 4시간 초과/과거 시점 허용 (관리자 우회)
 *
 * 15분 단위 / 순서 / 충돌(EXCLUDE)은 동일하게 강제된다.
 */
export class CreateAdminBookingDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  roomId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsDateString({}, { message: 'startAt은 ISO 8601 datetime이어야 합니다.' })
  startAt!: string;

  @IsDateString({}, { message: 'endAt은 ISO 8601 datetime이어야 합니다.' })
  endAt!: string;
}
