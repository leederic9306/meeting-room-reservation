import type { User, UserRole, UserStatus } from '@prisma/client';

/**
 * 관리자 응답 DTO. docs/03-api-spec.md §7.
 * passwordHash 등 민감 필드는 제외하고 안전한 필드만 노출한다.
 */
export interface AdminUserDto {
  id: string;
  email: string;
  name: string;
  department: string | null;
  employeeNo: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toAdminUserDto(user: User): AdminUserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    department: user.department,
    employeeNo: user.employeeNo,
    phone: user.phone,
    role: user.role,
    status: user.status,
    lockedUntil: user.lockedUntil ? user.lockedUntil.toISOString() : null,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
