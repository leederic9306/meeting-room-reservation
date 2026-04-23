import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user.type';

import {
  AuthService,
  type LoginResult,
  type ResendCodeResult,
  type SignupResult,
  type VerifyEmailResult,
} from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ResendCodeDto } from './dto/resend-code.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
