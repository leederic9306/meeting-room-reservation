import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { AuthUser } from '../types/auth-user.type';

/**
 * @CurrentUser() — JwtAuthGuard 통과 후 req.user를 AuthUser로 주입한다.
 * 가드 없이 사용하면 undefined일 수 있으므로 항상 @UseGuards(JwtAuthGuard)와 함께 사용할 것.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    return request.user;
  },
);
