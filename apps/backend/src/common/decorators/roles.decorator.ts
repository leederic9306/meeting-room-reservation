import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * @Roles('ADMIN') — RolesGuard가 읽는 메타데이터 키를 설정한다.
 * 반드시 JwtAuthGuard 뒤에 RolesGuard를 체이닝해야 동작한다.
 */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
