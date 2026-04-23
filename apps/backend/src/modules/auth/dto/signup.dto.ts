import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * POST /auth/signup 요청 바디.
 * 상세 규칙은 docs/03-api-spec.md §2.1 참조.
 * PASSWORD_MIN_LENGTH는 env로 오버라이드 가능하지만 기본 8자를 전제로 validator 구성.
 */
export class SignupDto {
  @IsEmail({}, { message: '이메일 형식이 올바르지 않습니다.' })
  @MaxLength(255)
  email!: string;

  // 8자 이상 + 영문/숫자/특수문자 각 1개 이상 (PRD AUTH-003)
  @IsString()
  @MinLength(8, { message: '비밀번호는 최소 8자 이상이어야 합니다.' })
  @Matches(/(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9])/, {
    message: '비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다.',
  })
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  employeeNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
