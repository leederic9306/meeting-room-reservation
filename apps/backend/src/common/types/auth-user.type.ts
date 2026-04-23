import type { UserRole } from '@prisma/client';

/**
 * JwtStrategy.validate()가 반환하여 req.user로 주입되는 최소 사용자 표현.
 * 전체 User row를 노출하지 않도록 의도적으로 축소.
 */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}
