import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * POST /admin/users/:id/lock 요청 바디. 사유는 선택 — AuditLog payload 에 기록되어 회고용으로 활용된다.
 */
export class LockUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
