import { UserRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

/**
 * PATCH /admin/users/:id/role 요청 바디. docs/03-api-spec.md §7.3.
 * 마지막 ADMIN 강등 차단(LAST_ADMIN_PROTECTION)은 서비스 레이어에서.
 */
export class UpdateRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;
}
