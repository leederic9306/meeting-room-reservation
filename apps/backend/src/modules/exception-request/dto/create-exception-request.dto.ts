import { IsDateString, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * POST /exception-requests 요청 바디. docs/03-api-spec.md §6.1.
 *
 * 시간 검증(15분 단위/순서/EXCEPTION_NOT_REQUIRED 등)은 서비스 레이어에서.
 * 일반 예약과 달리 4시간 초과/과거 시점이 허용되므로 컨트롤러 단계에서는 형식만 검증.
 */
export class CreateExceptionRequestDto {
  @IsUUID()
  roomId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(10, { message: '신청 사유는 최소 10자 이상 입력해주세요.' })
  @MaxLength(2000)
  reason!: string;

  @IsDateString({}, { message: 'startAt은 ISO 8601 datetime이어야 합니다.' })
  startAt!: string;

  @IsDateString({}, { message: 'endAt은 ISO 8601 datetime이어야 합니다.' })
  endAt!: string;
}
