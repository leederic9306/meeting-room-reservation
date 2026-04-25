import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * POST /admin/exception-requests/:id/reject 요청 바디. docs/03-api-spec.md §6.6.
 * `reviewComment`는 신청자에게 반려 사유로 회신되므로 필수.
 */
export class RejectExceptionRequestDto {
  @IsString()
  @MinLength(1, { message: '반려 사유를 입력해주세요.' })
  @MaxLength(2000)
  reviewComment!: string;
}
