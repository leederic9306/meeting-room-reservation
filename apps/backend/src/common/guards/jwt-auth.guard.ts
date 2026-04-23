import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JWT Access Token 검증 가드.
 * passport-jwt의 'jwt' 전략을 감싸 NestJS DI와 통합한다.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
