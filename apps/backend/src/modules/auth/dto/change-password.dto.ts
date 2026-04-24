import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * POST /auth/me/password 요청 바디 — docs/03-api-spec.md §2.11
 * 비밀번호 강도 검증은 AuthService에서 WEAK_PASSWORD로 응답한다.
 */
export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  currentPassword!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  newPassword!: string;
}
