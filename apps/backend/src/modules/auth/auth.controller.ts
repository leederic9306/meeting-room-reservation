import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user.type';
import { parseCookies } from '../../common/utils/cookies';
import type { Env } from '../../config/env.validation';

import {
  AuthService,
  type LoginResult,
  type MeProfile,
  type ResendCodeResult,
  type SignupResult,
  type VerifyEmailResult,
} from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { ResendCodeDto } from './dto/resend-code.dto';
import { SignupDto } from './dto/signup.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** 응답 바디에는 Refresh Token을 싣지 않는다 — 쿠키로만 전달. */
export interface LoginResponseBody {
  accessToken: string;
  user: LoginResult['user'];
}

export interface RefreshResponseBody {
  accessToken: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  signup(@Body() dto: SignupDto): Promise<SignupResult> {
    return this.authService.signup(dto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<VerifyEmailResult> {
    // TODO(Phase 1): Refresh Token Set-Cookie는 로그인/재발급 정리 시 함께 추가.
    return this.authService.verifyEmail(dto);
  }

  @Post('resend-code')
  @HttpCode(HttpStatus.OK)
  resendCode(@Body() dto: ResendCodeDto): Promise<ResendCodeResult> {
    return this.authService.resendCode(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseBody> {
    const result = await this.authService.login(dto, {
      ipAddress: req.ip,
      userAgent: pickHeader(req.headers['user-agent']),
    });
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshResponseBody> {
    const token = parseCookies(req.headers.cookie)[REFRESH_TOKEN_COOKIE];
    const result = await this.authService.rotateRefreshToken(token, {
      ipAddress: req.ip,
      userAgent: pickHeader(req.headers['user-agent']),
    });
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = parseCookies(req.headers.cookie)[REFRESH_TOKEN_COOKIE];
    await this.authService.logout(user.id, token, req.ip);
    // clearCookie는 set 시 쓴 옵션과 동일해야 브라우저에서 정상 삭제됨.
    res.clearCookie(REFRESH_TOKEN_COOKIE, this.baseCookieOptions());
  }

  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  async requestPasswordReset(@Body() dto: PasswordResetRequestDto): Promise<{ message: string }> {
    await this.authService.requestPasswordReset(dto);
    // 계정 열거 방지 — 서비스 결과와 무관하게 항상 같은 본문.
    return { message: '이메일이 발송되었습니다.' };
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmPasswordReset(@Body() dto: PasswordResetConfirmDto): Promise<{ message: string }> {
    await this.authService.confirmPasswordReset(dto);
    return { message: '비밀번호가 변경되었습니다.' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser): Promise<MeProfile> {
    return this.authService.getMe(user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto): Promise<MeProfile> {
    return this.authService.updateProfile(user.id, dto);
  }

  @Post('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.changePassword(user.id, dto);
    // 세션 전부 무효화 — 브라우저 쿠키도 즉시 제거해 재로그인을 유도.
    res.clearCookie(REFRESH_TOKEN_COOKIE, this.baseCookieOptions());
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_TOKEN_COOKIE, token, {
      ...this.baseCookieOptions(),
      maxAge: this.authService.getRefreshTokenTtlMs(),
    });
  }

  private baseCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      // localhost http에서 dev 편의상 Secure 미설정. 그 외 환경은 항상 Secure.
      secure: this.config.get('NODE_ENV', { infer: true }) !== 'development',
      sameSite: 'strict',
      path: '/',
    };
  }
}

function pickHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
