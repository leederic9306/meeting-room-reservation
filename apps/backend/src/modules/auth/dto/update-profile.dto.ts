import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * PATCH /auth/me 요청 바디 — docs/03-api-spec.md §2.10
 * email/role은 별도 엔드포인트로 분리되어 있어 여기서 다루지 않는다.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
