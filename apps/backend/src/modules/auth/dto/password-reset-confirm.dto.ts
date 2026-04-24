import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * POST /auth/password-reset/confirm 요청 바디.
 * 비밀번호 강도(길이/문자 구성) 검증은 AuthService에서 수행하여 WEAK_PASSWORD로 응답한다.
 */
export class PasswordResetConfirmDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  token!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  newPassword!: string;
}
