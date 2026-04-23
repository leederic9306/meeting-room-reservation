import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';

/**
 * POST /auth/verify-email 요청 바디.
 * code는 숫자 6자리(기본) — 길이 검증은 AuthService에서 EMAIL_CODE_LENGTH와 비교.
 */
export class VerifyEmailDto {
  @IsEmail({}, { message: '이메일 형식이 올바르지 않습니다.' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @Matches(/^\d+$/, { message: '인증 코드는 숫자만 입력 가능합니다.' })
  @MaxLength(10)
  code!: string;
}
