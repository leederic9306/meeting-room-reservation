import { IsDateString, IsOptional } from 'class-validator';

/**
 * DELETE /recurrences/:id 쿼리. docs/03-api-spec.md §5.4.
 * `from` 미지정 시 시리즈 전체 삭제, 지정 시 해당 시점 이후만 삭제.
 */
export class DeleteRecurrenceQuery {
  @IsOptional()
  @IsDateString({}, { message: 'from은 ISO 8601 datetime이어야 합니다.' })
  from?: string;
}
