import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * POST /recurrences 요청 바디. docs/03-api-spec.md §5.1.
 *
 * - `startAt` 은 첫 회차의 시각. controller 경계에서 `fromZonedTime(_, 'Asia/Seoul')`으로
 *   UTC `Date`로 변환된 뒤 service에 전달됨 (D-2/D-3, docs/06-rrule-poc-result.md).
 * - 15분 단위 / 미래 / RRULE 유효성 검사는 service에서.
 */
export class CreateRecurrenceDto {
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

  @IsInt()
  @Min(15)
  @Max(240)
  durationMinutes!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  rrule!: string;
}
