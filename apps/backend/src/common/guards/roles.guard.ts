import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';
import type { Request } from 'express';

import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthUser } from '../types/auth-user.type';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // @Roles() 미지정 핸들러는 통과 (JwtAuthGuard만 요구).
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '접근 권한이 없습니다.',
      });
    }

    if (!required.includes(user.role)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '접근 권한이 없습니다.',
      });
    }

    return true;
  }
}
