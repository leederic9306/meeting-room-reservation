import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * PATCH /recurrences/:id 요청 바디. docs/03-api-spec.md §5.3.
 * 시간/RRULE 변경은 정책상 "삭제 후 재생성" — 이 엔드포인트는 메타정보만.
 */
export class UpdateRecurrenceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
