import { createHash, randomBytes, randomInt } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, type User, UserRole, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

import type { AuthUser } from '../../common/types/auth-user.type';
import { parseDurationToMs } from '../../common/utils/duration';
import type { Env } from '../../config/env.validation';
import { MailTemplateRenderer } from '../../infra/mail/mail-template.renderer';
import { MailService } from '../../infra/mail/mail.service';
import { PrismaService } from '../../infra/prisma/prisma.service';

import type { ChangePasswordDto } from './dto/change-password.dto';
import type { LoginDto } from './dto/login.dto';
import type { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';
import type { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import type { ResendCodeDto } from './dto/resend-code.dto';
import type { SignupDto } from './dto/signup.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import type { VerifyEmailDto } from './dto/verify-email.dto';

export interface SignupResult {
  userId: string;
  email: string;
  verificationRequired: boolean;
  codeSentAt: string;
}

export interface VerifyEmailResult {
  verified: true;
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  };
}

export interface ResendCodeResult {
  codeSentAt: string;
  nextResendAvailableAt: string;
}

export interface LoginContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface LoginResult {
  accessToken: string;
  /** 서비스 레이어 전용 — 컨트롤러에서 쿠키로 내보내고 응답 바디에는 포함하지 않는다. */
  refreshToken: string;
  user: AuthUser & { name: string };
}

export interface MeProfile {
  id: string;
  email: string;
  name: string;
  department: string | null;
  employeeNo: string | null;
  phone: string | null;
  role: UserRole;
  createdAt: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly mailService: MailService,
    private readonly mailTemplates: MailTemplateRenderer,
  ) {}

  // ---------------------------------------------------------------------------
  // 비밀번호 해싱 — 다른 모듈(비밀번호 재설정 등)에서도 재사용 가능하도록 public.
  // ---------------------------------------------------------------------------

  async hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: this.config.get('ARGON2_MEMORY_COST', { infer: true }),
      timeCost: this.config.get('ARGON2_TIME_COST', { infer: true }),
      parallelism: this.config.get('ARGON2_PARALLELISM', { infer: true }),
    });
  }

  async verifyPassword(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch (error) {
      // 손상된 해시 등 비정상 상황. 로그만 남기고 불일치로 취급.
      this.logger.warn(`argon2.verify 실패: ${(error as Error).message}`);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // 회원가입 — docs/03-api-spec.md §2.1
  // ---------------------------------------------------------------------------

  async signup(dto: SignupDto): Promise<SignupResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_EXISTS',
        message: '이미 가입된 이메일입니다.',
      });
    }

    const passwordHash = await this.hashPassword(dto.password);
    const plainCode = this.generateVerificationCode();
    const storedCode = this.encodeVerificationCode(plainCode);
    const now = new Date();
    const expiresAt = this.computeExpiresAt(now);

    const verification = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          name: dto.name,
          department: dto.department,
          employeeNo: dto.employeeNo,
          phone: dto.phone,
          // role/status는 schema 기본값(USER/PENDING) 사용
        },
        select: { id: true, email: true },
      });
      return tx.emailVerification.create({
        data: {
          userId: user.id,
          code: storedCode,
          expiresAt,
          sentAt: now,
        },
        select: { id: true, userId: true, sentAt: true, user: { select: { email: true } } },
      });
    });

    // 외부 호출(메일)은 트랜잭션 외부. 실패하면 로그만 남기고 resend로 복구.
    await this.sendVerificationMail(verification.user.email, plainCode, dto.name);

    return {
      userId: verification.userId,
      email: verification.user.email,
      verificationRequired: true,
      codeSentAt: verification.sentAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // 이메일 인증 — docs/03-api-spec.md §2.2
  // ---------------------------------------------------------------------------

  async verifyEmail(dto: VerifyEmailDto): Promise<VerifyEmailResult> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      // 계정 열거 방지: 계정이 없어도 "코드 불일치"로 동일 응답.
      throw new BadRequestException({
        code: 'INVALID_CODE',
        message: '인증 코드가 올바르지 않습니다.',
      });
    }
    if (user.status === UserStatus.ACTIVE) {
      throw new ConflictException({
        code: 'ALREADY_VERIFIED',
        message: '이미 인증이 완료된 계정입니다.',
      });
    }

    const verification = await this.prisma.emailVerification.findFirst({
      where: { userId: user.id, verifiedAt: null },
      orderBy: { sentAt: 'desc' },
    });
    if (!verification) {
      throw new BadRequestException({
        code: 'INVALID_CODE',
        message: '인증 코드가 올바르지 않습니다.',
      });
    }

    const maxAttempts = this.config.get('EMAIL_CODE_MAX_ATTEMPTS', { infer: true });
    if (verification.attemptCount >= maxAttempts) {
      throw new BadRequestException({
        code: 'CODE_ATTEMPTS_EXCEEDED',
        message: '인증 코드 입력 실패 횟수를 초과했습니다. 재발송 후 다시 시도해주세요.',
      });
    }
    if (verification.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: 'CODE_EXPIRED',
        message: '인증 코드가 만료되었습니다. 재발송 후 다시 시도해주세요.',
      });
    }

    const expected = this.encodeVerificationCode(dto.code);
    if (!this.timingSafeEqual(expected, verification.code)) {
      const next = verification.attemptCount + 1;
      await this.prisma.emailVerification.update({
        where: { id: verification.id },
        data: { attemptCount: next },
      });
      if (next >= maxAttempts) {
        throw new BadRequestException({
          code: 'CODE_ATTEMPTS_EXCEEDED',
          message: '인증 코드 입력 실패 횟수를 초과했습니다. 재발송 후 다시 시도해주세요.',
        });
      }
      throw new BadRequestException({
        code: 'INVALID_CODE',
        message: '인증 코드가 올바르지 않습니다.',
      });
    }

    const activatedUser = await this.prisma.$transaction(async (tx) => {
      await tx.emailVerification.update({
        where: { id: verification.id },
        data: { verifiedAt: new Date() },
      });
      return tx.user.update({
        where: { id: user.id },
        data: { status: UserStatus.ACTIVE },
      });
    });

    const accessToken = await this.issueAccessToken(activatedUser);
    return {
      verified: true,
      accessToken,
      user: {
        id: activatedUser.id,
        email: activatedUser.email,
        name: activatedUser.name,
        role: activatedUser.role,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // 인증 코드 재발송 — docs/03-api-spec.md §2.3
  // ---------------------------------------------------------------------------

  async resendCode(dto: ResendCodeDto): Promise<ResendCodeResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, email: true, name: true, status: true },
    });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: '해당 이메일로 가입된 계정을 찾을 수 없습니다.',
      });
    }
    if (user.status === UserStatus.ACTIVE) {
      throw new ConflictException({
        code: 'ALREADY_VERIFIED',
        message: '이미 인증이 완료된 계정입니다.',
      });
    }

    const cooldownSec = this.config.get('EMAIL_CODE_RESEND_COOLDOWN_SECONDS', { infer: true });
    const latest = await this.prisma.emailVerification.findFirst({
      where: { userId: user.id },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    });
    const now = new Date();
    if (latest) {
      const elapsedSec = Math.floor((now.getTime() - latest.sentAt.getTime()) / 1000);
      if (elapsedSec < cooldownSec) {
        const retryAfterSeconds = cooldownSec - elapsedSec;
        throw new HttpException(
          {
            code: 'RESEND_COOLDOWN',
            message: '인증 코드 재발송은 잠시 후 가능합니다.',
            details: { retryAfterSeconds },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const plainCode = this.generateVerificationCode();
    const storedCode = this.encodeVerificationCode(plainCode);
    const expiresAt = this.computeExpiresAt(now);

    const created = await this.prisma.$transaction(async (tx) => {
      // 기존 미인증 코드는 모두 무효화(삭제) — 항상 최신 1건만 유효하도록 유지.
      await tx.emailVerification.deleteMany({
        where: { userId: user.id, verifiedAt: null },
      });
      return tx.emailVerification.create({
        data: { userId: user.id, code: storedCode, expiresAt, sentAt: now },
        select: { sentAt: true },
      });
    });

    await this.sendVerificationMail(user.email, plainCode, user.name);

    const nextResendAvailableAt = new Date(created.sentAt.getTime() + cooldownSec * 1000);
    return {
      codeSentAt: created.sentAt.toISOString(),
      nextResendAvailableAt: nextResendAvailableAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // 로그인 — docs/03-api-spec.md §2.4
  // ---------------------------------------------------------------------------

  async login(dto: LoginDto, ctx: LoginContext = {}): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const now = new Date();

    // 이미 잠금 구간이면 비밀번호 검증 전에 차단 — 공격 비용 상승 + lockedUntil을 기준으로 응답.
    if (user?.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
      await this.recordLoginAttempt(dto.email, false, ctx.ipAddress);
      throw this.accountLockedException(user.lockedUntil);
    }

    const passwordValid = user ? await this.verifyPassword(user.passwordHash, dto.password) : false;

    if (!user || !passwordValid) {
      await this.handleFailedLogin(dto.email, user, ctx);
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: '이메일 또는 비밀번호가 올바르지 않습니다.',
      });
    }

    if (user.status === UserStatus.PENDING) {
      await this.recordLoginAttempt(dto.email, false, ctx.ipAddress);
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: '이메일 인증이 필요합니다.',
      });
    }
    if (user.status !== UserStatus.ACTIVE) {
      // LOCKED/DELETED 상태는 계정 열거 방지 차원에서 자격 불일치와 동일 응답.
      await this.recordLoginAttempt(dto.email, false, ctx.ipAddress);
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: '이메일 또는 비밀번호가 올바르지 않습니다.',
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      // 성공 시 lockedUntil을 초기화 — 이후 실패 카운팅은 이 성공 시점 뒤부터 다시 시작.
      data: { lastLoginAt: now, lockedUntil: null },
    });
    await this.recordLoginAttempt(dto.email, true, ctx.ipAddress);
    await this.writeAuditLog({
      actorId: user.id,
      action: 'LOGIN_SUCCESS',
      targetType: 'USER',
      targetId: user.id,
      ipAddress: ctx.ipAddress,
    });

    const accessToken = await this.issueAccessToken(user);
    const refreshToken = await this.issueRefreshToken(user.id, ctx);
    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }

  // ---------------------------------------------------------------------------
  // Refresh Token 회전 — docs/03-api-spec.md §2.5
  // ---------------------------------------------------------------------------

  async rotateRefreshToken(
    refreshTokenPlain: string | undefined,
    ctx: LoginContext = {},
  ): Promise<LoginResult> {
    if (!refreshTokenPlain) {
      throw this.invalidRefreshTokenException();
    }
    const tokenHash = this.hashToken(refreshTokenPlain);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!existing || existing.revokedAt) {
      throw this.invalidRefreshTokenException();
    }
    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_EXPIRED',
        message: '리프레시 토큰이 만료되었습니다. 다시 로그인해주세요.',
      });
    }

    const { user } = existing;
    if (user.status !== UserStatus.ACTIVE) {
      throw this.invalidRefreshTokenException();
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw this.accountLockedException(user.lockedUntil);
    }

    const newTokenPlain = this.generateRefreshTokenValue();
    const newTokenHash = this.hashToken(newTokenPlain);
    const newExpiresAt = new Date(Date.now() + this.getRefreshTokenTtlMs());

    // 단일 트랜잭션으로 이전 토큰 revoke + 신규 토큰 발급을 원자화.
    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: newTokenHash,
          userAgent: ctx.userAgent?.slice(0, 500),
          ipAddress: ctx.ipAddress,
          expiresAt: newExpiresAt,
        },
      });
    });

    const accessToken = await this.issueAccessToken(user);
    return {
      accessToken,
      refreshToken: newTokenPlain,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }

  // ---------------------------------------------------------------------------
  // 로그아웃 — docs/03-api-spec.md §2.6
  // ---------------------------------------------------------------------------

  async logout(
    userId: string,
    refreshTokenPlain: string | undefined,
    ipAddress?: string,
  ): Promise<void> {
    if (refreshTokenPlain) {
      const tokenHash = this.hashToken(refreshTokenPlain);
      // 본인 소유 + 살아있는 토큰만 폐기 — 타 계정 토큰을 임의로 무효화하지 못하도록 userId 조건.
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.writeAuditLog({
      actorId: userId,
      action: 'LOGOUT',
      targetType: 'USER',
      targetId: userId,
      ipAddress,
    });
  }

  // ---------------------------------------------------------------------------
  // 비밀번호 재설정 요청 — docs/03-api-spec.md §2.7
  // 계정 열거를 방지하기 위해 어떤 입력이든 예외를 던지지 않는다. 컨트롤러가 항상 200 응답.
  // ---------------------------------------------------------------------------

  async requestPasswordReset(dto: PasswordResetRequestDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, email: true, name: true, status: true },
    });
    // 존재하지 않거나 ACTIVE가 아닌 계정은 아무것도 하지 않는다 — 외부에서 구분 불가.
    if (!user || user.status !== UserStatus.ACTIVE) {
      return;
    }

    const ttlHours = this.config.get('PASSWORD_RESET_TTL_HOURS', { infer: true });
    const plainToken = this.generatePasswordResetTokenValue();
    const tokenHash = this.hashToken(plainToken);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60_000);

    await this.prisma.$transaction(async (tx) => {
      // 기존 미사용 토큰은 전부 폐기 — 항상 최신 1건만 유효하도록 유지.
      await tx.passwordReset.deleteMany({
        where: { userId: user.id, usedAt: null },
      });
      await tx.passwordReset.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });
    });

    await this.sendPasswordResetMail(user.email, plainToken, user.name, ttlHours);
  }

  // ---------------------------------------------------------------------------
  // 비밀번호 재설정 확정 — docs/03-api-spec.md §2.8
  // ---------------------------------------------------------------------------

  async confirmPasswordReset(dto: PasswordResetConfirmDto): Promise<void> {
    // 강도 검사는 DB/해시 부하 전에 선행 — WEAK_PASSWORD는 토큰 유효성과 무관한 입력 오류.
    this.assertPasswordStrength(dto.newPassword);

    const tokenHash = this.hashToken(dto.token);
    const reset = await this.prisma.passwordReset.findUnique({ where: { tokenHash } });
    if (!reset || reset.usedAt) {
      throw new BadRequestException({
        code: 'INVALID_RESET_TOKEN',
        message: '유효하지 않은 재설정 토큰입니다.',
      });
    }
    if (reset.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: 'RESET_TOKEN_EXPIRED',
        message: '재설정 토큰이 만료되었습니다. 다시 요청해주세요.',
      });
    }

    const passwordHash = await this.hashPassword(dto.newPassword);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // usedAt 동시 갱신으로 1회성 보장 — 같은 토큰으로 두 번째 요청은 INVALID_RESET_TOKEN.
      await tx.passwordReset.update({
        where: { id: reset.id },
        data: { usedAt: now },
      });
      await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash, lockedUntil: null },
      });
      // 비밀번호 변경 시 기존 세션 전부 무효화 — 탈취된 세션으로 접근하지 못하도록.
      await tx.refreshToken.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: now },
      });
    });

    await this.writeAuditLog({
      actorId: reset.userId,
      action: 'PASSWORD_RESET',
      targetType: 'USER',
      targetId: reset.userId,
    });
  }

  // ---------------------------------------------------------------------------
  // 내 정보 조회 — docs/03-api-spec.md §2.9
  // ---------------------------------------------------------------------------

  async getMe(userId: string): Promise<MeProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        department: true,
        employeeNo: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });
    // JwtAuthGuard 통과 후에도 race(계정 삭제 등)로 사라질 수 있어 방어.
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: '사용자 정보를 찾을 수 없습니다.',
      });
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      department: user.department,
      employeeNo: user.employeeNo,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // 내 정보 수정 — docs/03-api-spec.md §2.10
  // email/role은 여기서 변경할 수 없다 (별도 엔드포인트).
  // ---------------------------------------------------------------------------

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<MeProfile> {
    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.department !== undefined) data.department = dto.department;
    if (dto.phone !== undefined) data.phone = dto.phone;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        department: true,
        employeeNo: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      department: user.department,
      employeeNo: user.employeeNo,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // 비밀번호 변경 — docs/03-api-spec.md §2.11
  // 현재 비번 확인 후 새 비번으로 갱신하고, 모든 Refresh Token을 무효화해
  // 다른 기기 세션을 강제 종료한다.
  // ---------------------------------------------------------------------------

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: '사용자 정보를 찾을 수 없습니다.',
      });
    }

    const currentValid = await this.verifyPassword(user.passwordHash, dto.currentPassword);
    if (!currentValid) {
      throw new BadRequestException({
        code: 'INVALID_CURRENT_PASSWORD',
        message: '현재 비밀번호가 올바르지 않습니다.',
      });
    }

    // 강도 검사는 해시 계산 전에 — WEAK_PASSWORD는 계산 비용 없이 조기 반려.
    this.assertPasswordStrength(dto.newPassword);

    const passwordHash = await this.hashPassword(dto.newPassword);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
      // 비밀번호 변경 시 기존 세션 전부 무효화 — 탈취된 세션으로 접근하지 못하도록.
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
    });

    await this.writeAuditLog({
      actorId: userId,
      action: 'PASSWORD_CHANGED',
      targetType: 'USER',
      targetId: userId,
    });
  }

  // ---------------------------------------------------------------------------
  // JwtStrategy.validate()에서 호출. 토큰은 유효해도 계정이 DELETED/LOCKED 상태면 거절.
  // ---------------------------------------------------------------------------

  async validateJwtUser(userId: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, status: true, lockedUntil: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      return null;
    }
    // 발급된 access token이라도 잠금 구간이면 즉시 거절 — 재로그인을 강제.
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      return null;
    }
    return { id: user.id, email: user.email, role: user.role };
  }

  /** Controller가 쿠키 maxAge/Expires를 계산할 때 공유하는 단일 진실. */
  getRefreshTokenTtlMs(): number {
    const expr = this.config.get('JWT_REFRESH_EXPIRES_IN', { infer: true });
    return parseDurationToMs(expr);
  }

  // ---------------------------------------------------------------------------
  // 로그인 실패 처리 — 실패 집계 후 임계값 도달 시 lockedUntil 설정.
  // ---------------------------------------------------------------------------

  private async handleFailedLogin(
    email: string,
    user: User | null,
    ctx: LoginContext,
  ): Promise<void> {
    await this.recordLoginAttempt(email, false, ctx.ipAddress);
    if (!user) {
      // 계정이 없으면 잠글 대상 없음 — LoginAttempt 기록만 남긴다.
      return;
    }

    // "연속" 실패는 "마지막 성공 이후" 실패로 정의 — 성공 시 카운터 리셋과 일관.
    const lastSuccess = await this.prisma.loginAttempt.findFirst({
      where: { email, success: true },
      orderBy: { attemptedAt: 'desc' },
      select: { attemptedAt: true },
    });
    const failedCount = await this.prisma.loginAttempt.count({
      where: {
        email,
        success: false,
        ...(lastSuccess ? { attemptedAt: { gt: lastSuccess.attemptedAt } } : {}),
      },
    });
    const maxAttempts = this.config.get('LOGIN_MAX_ATTEMPTS', { infer: true });

    if (failedCount >= maxAttempts) {
      const lockMinutes = this.config.get('LOGIN_LOCK_MINUTES', { infer: true });
      const lockedUntil = new Date(Date.now() + lockMinutes * 60_000);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil },
      });
      await this.writeAuditLog({
        actorId: null,
        action: 'ACCOUNT_LOCKED',
        targetType: 'USER',
        targetId: user.id,
        ipAddress: ctx.ipAddress,
        payload: {
          lockedUntil: lockedUntil.toISOString(),
          reason: 'LOGIN_MAX_ATTEMPTS_EXCEEDED',
          failedCount,
        },
      });
    } else {
      await this.writeAuditLog({
        actorId: user.id,
        action: 'LOGIN_FAILED',
        targetType: 'USER',
        targetId: user.id,
        ipAddress: ctx.ipAddress,
        payload: { failedCount },
      });
    }
  }

  private async recordLoginAttempt(
    email: string,
    success: boolean,
    ipAddress: string | undefined,
  ): Promise<void> {
    await this.prisma.loginAttempt.create({
      data: { email, success, ipAddress },
    });
  }

  private async writeAuditLog(params: {
    actorId: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    ipAddress?: string;
    payload?: Prisma.InputJsonValue;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: params.actorId ?? undefined,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId ?? undefined,
        ipAddress: params.ipAddress,
        payload: params.payload,
      },
    });
  }

  private accountLockedException(lockedUntil: Date): HttpException {
    // 423 Locked — NestJS HttpStatus 열거에 상수가 없어 숫자 리터럴 사용.
    return new HttpException(
      {
        code: 'ACCOUNT_LOCKED',
        message: '로그인 실패 횟수 초과로 계정이 일시 잠금되었습니다.',
        details: { lockedUntil: lockedUntil.toISOString() },
      },
      423,
    );
  }

  private invalidRefreshTokenException(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_REFRESH_TOKEN',
      message: '유효하지 않은 리프레시 토큰입니다.',
    });
  }

  private async issueRefreshToken(userId: string, ctx: LoginContext): Promise<string> {
    const token = this.generateRefreshTokenValue();
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + this.getRefreshTokenTtlMs());
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        userAgent: ctx.userAgent?.slice(0, 500),
        ipAddress: ctx.ipAddress,
        expiresAt,
      },
    });
    return token;
  }

  private generateRefreshTokenValue(): string {
    // 48 bytes = 384 bits. SHA-256 해시 저장 — 충돌/역산 위험 무시 수준.
    return randomBytes(48).toString('hex');
  }

  private generatePasswordResetTokenValue(): string {
    // 32 bytes = 256 bits, hex 64자. 메일에 포함되므로 refresh보다 조금 짧게.
    return randomBytes(32).toString('hex');
  }

  private assertPasswordStrength(password: string): void {
    const minLength = this.config.get('PASSWORD_MIN_LENGTH', { infer: true });
    if (password.length < minLength) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: `비밀번호는 최소 ${minLength}자 이상이어야 합니다.`,
      });
    }
    if (!/(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9])/.test(password)) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: '비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다.',
      });
    }
  }

  private hashToken(plain: string): string {
    return createHash('sha256').update(plain).digest('hex');
  }

  // ---------------------------------------------------------------------------
  // 내부 헬퍼
  // ---------------------------------------------------------------------------

  private generateVerificationCode(): string {
    const length = this.config.get('EMAIL_CODE_LENGTH', { infer: true });
    const max = 10 ** length;
    const n = randomInt(0, max);
    return String(n).padStart(length, '0');
  }

  private encodeVerificationCode(plain: string): string {
    const hashEnabled = this.config.get('EMAIL_CODE_HASH_ENABLED', { infer: true });
    if (!hashEnabled) {
      return plain;
    }
    return createHash('sha256').update(plain).digest('hex');
  }

  /** attemptCount 증가 전 비교는 타이밍 공격을 줄이기 위해 길이·내용을 일관되게 비교한다. */
  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  private computeExpiresAt(now: Date): Date {
    const ttlMin = this.config.get('EMAIL_CODE_TTL_MINUTES', { infer: true });
    return new Date(now.getTime() + ttlMin * 60_000);
  }

  private async sendVerificationMail(email: string, code: string, name?: string): Promise<void> {
    const ttlMinutes = this.config.get('EMAIL_CODE_TTL_MINUTES', { infer: true });
    const appName = this.config.get('MAIL_FROM_NAME', { infer: true });
    const subject = `[${appName}] 이메일 인증 코드`;
    const text = [
      `안녕하세요${name ? ` ${name}님` : ''},`,
      '',
      `회원가입을 완료하려면 아래 인증 코드를 ${ttlMinutes}분 이내에 입력해주세요.`,
      '',
      `인증 코드: ${code}`,
      '',
      '본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.',
    ].join('\n');

    try {
      const html = await this.mailTemplates.render('verification-code', {
        appName,
        name,
        code,
        ttlMinutes,
      });
      await this.mailService.send({ to: email, subject, text, html });
    } catch (error) {
      // 메일 실패는 요청을 막지 않는다 — 사용자는 resend로 재시도 가능.
      this.logger.error(
        `인증 메일 발송 실패: to=${email}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  private async sendPasswordResetMail(
    email: string,
    token: string,
    name: string,
    ttlHours: number,
  ): Promise<void> {
    const appName = this.config.get('MAIL_FROM_NAME', { infer: true });
    const origins = this.config.get('CORS_ORIGINS', { infer: true });
    const baseUrl = origins.split(',')[0]?.trim() ?? '';
    const resetUrl = baseUrl ? `${baseUrl}/reset-password?token=${encodeURIComponent(token)}` : '';
    const subject = `[${appName}] 비밀번호 재설정 안내`;
    const text = [
      `안녕하세요${name ? ` ${name}님` : ''},`,
      '',
      `비밀번호 재설정을 요청하셨습니다. ${ttlHours}시간 이내에 아래 링크 또는 토큰으로 진행해주세요.`,
      '',
      resetUrl ? `재설정 링크: ${resetUrl}` : undefined,
      `토큰: ${token}`,
      '',
      '본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.',
    ]
      .filter((line): line is string => line !== undefined)
      .join('\n');

    try {
      const html = await this.mailTemplates.render('password-reset', {
        appName,
        name,
        token,
        resetUrl,
        ttlHours,
      });
      await this.mailService.send({ to: email, subject, text, html });
    } catch (error) {
      // 메일 실패는 응답(200)에 영향을 주지 않는다 — 사용자에게는 항상 성공 메시지.
      this.logger.error(
        `비밀번호 재설정 메일 발송 실패: to=${email}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  private async issueAccessToken(user: Pick<User, 'id' | 'email' | 'role'>): Promise<string> {
    return this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }
}
