import { createHash, randomInt } from 'node:crypto';

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
import { type User, UserRole, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

import type { AuthUser } from '../../common/types/auth-user.type';
import type { Env } from '../../config/env.validation';
import { MailTemplateRenderer } from '../../infra/mail/mail-template.renderer';
import { MailService } from '../../infra/mail/mail.service';
import { PrismaService } from '../../infra/prisma/prisma.service';

import type { LoginDto } from './dto/login.dto';
import type { ResendCodeDto } from './dto/resend-code.dto';
import type { SignupDto } from './dto/signup.dto';
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

export interface LoginResult {
  accessToken: string;
  user: AuthUser & { name: string };
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
  // Phase 1 후반에 Refresh Token 발급/저장, LoginAttempt 기록, ACCOUNT_LOCKED를 추가한다.
  // ---------------------------------------------------------------------------

  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // 계정 열거 방지: 존재 여부와 무관하게 동일 에러.
    if (!user || !(await this.verifyPassword(user.passwordHash, dto.password))) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: '이메일 또는 비밀번호가 올바르지 않습니다.',
      });
    }

    if (user.status === UserStatus.PENDING) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: '이메일 인증이 필요합니다.',
      });
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: '이메일 또는 비밀번호가 올바르지 않습니다.',
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = await this.issueAccessToken(user);
    return {
      accessToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }

  // ---------------------------------------------------------------------------
  // JwtStrategy.validate()에서 호출. 토큰은 유효해도 계정이 DELETED/LOCKED 상태면 거절.
  // ---------------------------------------------------------------------------

  async validateJwtUser(userId: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, status: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      return null;
    }
    return { id: user.id, email: user.email, role: user.role };
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

  private async issueAccessToken(user: Pick<User, 'id' | 'email' | 'role'>): Promise<string> {
    return this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }
}
