import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * PATCH /bookings/:id 요청 바디. docs/03-api-spec.md §4.4.
 * 부분 업데이트 — 모든 필드 선택. roomId 변경은 별도 정책이라 포함하지 않는다.
 */
export class UpdateBookingDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsDateString({}, { message: 'startAt은 ISO 8601 datetime이어야 합니다.' })
  startAt?: string;

  @IsOptional()
  @IsDateString({}, { message: 'endAt은 ISO 8601 datetime이어야 합니다.' })
  endAt?: string;
}
