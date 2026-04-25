import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * POST /recurrences/:id/exceptions 요청 바디. docs/03-api-spec.md §5.5.
 * `excludedDate`는 KST 기준 날짜(YYYY-MM-DD). 해당 일자의 시리즈 회차 Booking이 자동 소프트 삭제됨.
 */
export class CreateExceptionDto {
  /** ISO 날짜(YYYY-MM-DD) — KST 캘린더 기준. */
  @IsDateString(
    { strict: true, strictSeparator: true },
    { message: 'excludedDate는 YYYY-MM-DD 형식이어야 합니다.' },
  )
  excludedDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
