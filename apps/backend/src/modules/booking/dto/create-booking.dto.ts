import { IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * POST /bookings 요청 바디. docs/03-api-spec.md §4.3.
 * 시간 검증(15분 단위/순서/미래/4시간/회의실 활성)은 서비스 레이어에서.
 */
export class CreateBookingDto {
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
