import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { UserRole, UserStatus } from '@prisma/client';

import { MailTemplateRenderer } from '../../infra/mail/mail-template.renderer';
import { MailService } from '../../infra/mail/mail.service';
import { PrismaService } from '../../infra/prisma/prisma.service';

import { AuthService } from './auth.service';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { LoginDto } from './dto/login.dto';
import type { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';
import type { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import type { ResendCodeDto } from './dto/resend-code.dto';
import type { SignupDto } from './dto/signup.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import type { VerifyEmailDto } from './dto/verify-email.dto';

type TxClient = {
  user: {
    create: jest.Mock;
    update: jest.Mock;
  };
  emailVerification: {
    create: jest.Mock;
    update: jest.Mock;
    deleteMany: jest.Mock;
  };
  refreshToken: {
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  passwordReset: {
    create: jest.Mock;
    update: jest.Mock;
    deleteMany: jest.Mock;
  };
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    emailVerification: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    passwordReset: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    loginAttempt: {
      create: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
    };
    auditLog: {
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let mail: { send: jest.Mock };
  let mailTemplates: { render: jest.Mock };
  let jwtSignAsync: jest.Mock;

  const envValues: Record<string, unknown> = {
    ARGON2_MEMORY_COST: 19456,
    ARGON2_TIME_COST: 2,
    ARGON2_PARALLELISM: 1,
    EMAIL_CODE_LENGTH: 6,
    EMAIL_CODE_TTL_MINUTES: 10,
    EMAIL_CODE_MAX_ATTEMPTS: 5,
    EMAIL_CODE_RESEND_COOLDOWN_SECONDS: 60,
    EMAIL_CODE_HASH_ENABLED: false,
    MAIL_FROM_NAME: '회의실 예약',
    LOGIN_MAX_ATTEMPTS: 5,
    LOGIN_LOCK_MINUTES: 30,
    JWT_REFRESH_EXPIRES_IN: '14d',
    PASSWORD_RESET_TTL_HOURS: 1,
    PASSWORD_MIN_LENGTH: 8,
    CORS_ORIGINS: 'http://localhost:3000',
  };
  const configGet = jest.fn((key: string) => envValues[key]);

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
      emailVerification: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'rt-new' }),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      passwordReset: {
        create: jest.fn().mockResolvedValue({ id: 'pr-new' }),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      loginAttempt: {
        create: jest.fn().mockResolvedValue(undefined),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      $transaction: jest.fn(async (arg: ((tx: TxClient) => Promise<unknown>) | unknown[]) => {
        if (typeof arg === 'function') {
          const tx: TxClient = {
            user: { create: prisma.user.create, update: prisma.user.update },
            emailVerification: {
              create: prisma.emailVerification.create,
              update: prisma.emailVerification.update,
              deleteMany: prisma.emailVerification.deleteMany,
            },
            refreshToken: {
              create: prisma.refreshToken.create,
              update: prisma.refreshToken.update,
              updateMany: prisma.refreshToken.updateMany,
            },
            passwordReset: {
              create: prisma.passwordReset.create,
              update: prisma.passwordReset.update,
              deleteMany: prisma.passwordReset.deleteMany,
            },
          };
          return arg(tx);
        }
        return Promise.all(arg);
      }),
    };
    mail = { send: jest.fn().mockResolvedValue(undefined) };
    mailTemplates = { render: jest.fn().mockResolvedValue('<html>rendered</html>') };
    jwtSignAsync = jest.fn().mockResolvedValue('signed.jwt.token');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { signAsync: jwtSignAsync } },
        { provide: ConfigService, useValue: { get: configGet } },
        { provide: MailService, useValue: mail },
        { provide: MailTemplateRenderer, useValue: mailTemplates },
      ],
    }).compile();

    service = module.get(AuthService);
    envValues.EMAIL_CODE_HASH_ENABLED = false;
  });

  describe('signup', () => {
    const dto: SignupDto = {
      email: 'alice@example.com',
      password: 'Password1!',
      name: '앨리스',
    };

    it('신규 이메일이면 User + EmailVerification을 생성하고 인증 메일 발송', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'user-1', email: dto.email });
      prisma.emailVerification.create.mockResolvedValue({
        id: 'ev-1',
        userId: 'user-1',
        sentAt: new Date('2026-04-23T09:00:00Z'),
        user: { email: dto.email },
      });

      const result = await service.signup(dto);

      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      const userArg = prisma.user.create.mock.calls[0]?.[0] as {
        data: { passwordHash: string; email: string };
      };
      expect(userArg.data.passwordHash).toMatch(/^\$argon2id\$/);
      expect(userArg.data.passwordHash).not.toContain(dto.password);

      expect(prisma.emailVerification.create).toHaveBeenCalledTimes(1);
      const evArg = prisma.emailVerification.create.mock.calls[0]?.[0] as {
        data: { userId: string; code: string; expiresAt: Date };
      };
      expect(evArg.data.userId).toBe('user-1');
      expect(evArg.data.code).toMatch(/^\d{6}$/); // 평문 저장 (EMAIL_CODE_HASH_ENABLED=false)
      expect(evArg.data.expiresAt.getTime()).toBeGreaterThan(Date.now());

      expect(mailTemplates.render).toHaveBeenCalledWith('verification-code', {
        appName: expect.any(String),
        name: dto.name,
        code: evArg.data.code,
        ttlMinutes: 10,
      });
      expect(mail.send).toHaveBeenCalledTimes(1);
      const mailArg = mail.send.mock.calls[0]?.[0] as {
        to: string;
        subject: string;
        text: string;
        html: string;
      };
      expect(mailArg.to).toBe(dto.email);
      expect(mailArg.text).toContain(evArg.data.code);
      expect(mailArg.html).toBe('<html>rendered</html>');

      expect(result).toEqual({
        userId: 'user-1',
        email: dto.email,
        verificationRequired: true,
        codeSentAt: '2026-04-23T09:00:00.000Z',
      });
    });

    it('EMAIL_CODE_HASH_ENABLED=true면 SHA-256 해시로 저장', async () => {
      envValues.EMAIL_CODE_HASH_ENABLED = true;
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'user-1', email: dto.email });
      prisma.emailVerification.create.mockResolvedValue({
        id: 'ev-1',
        userId: 'user-1',
        sentAt: new Date(),
        user: { email: dto.email },
      });

      await service.signup(dto);

      const evArg = prisma.emailVerification.create.mock.calls[0]?.[0] as {
        data: { code: string };
      };
      expect(evArg.data.code).toMatch(/^[a-f0-9]{64}$/);
      expect(evArg.data.code).not.toMatch(/^\d{6}$/);
    });

    it('이미 존재하는 이메일이면 EMAIL_ALREADY_EXISTS로 ConflictException', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'uuid-existing' });

      await expect(service.signup(dto)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    const dto: VerifyEmailDto = { email: 'alice@example.com', code: '123456' };

    function pendingUser() {
      return {
        id: 'user-1',
        email: dto.email,
        name: '앨리스',
        role: UserRole.USER,
        status: UserStatus.PENDING,
      };
    }

    it('코드 일치 시 User.status=ACTIVE 전이 + accessToken 발급', async () => {
      prisma.user.findUnique.mockResolvedValue(pendingUser());
      prisma.emailVerification.findFirst.mockResolvedValue({
        id: 'ev-1',
        userId: 'user-1',
        code: '123456',
        expiresAt: new Date(Date.now() + 5 * 60_000),
        attemptCount: 0,
      });
      prisma.user.update.mockResolvedValue({
        ...pendingUser(),
        status: UserStatus.ACTIVE,
      });

      const result = await service.verifyEmail(dto);

      expect(prisma.emailVerification.update).toHaveBeenCalledWith({
        where: { id: 'ev-1' },
        data: { verifiedAt: expect.any(Date) },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { status: UserStatus.ACTIVE },
      });
      expect(result.verified).toBe(true);
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user).toEqual({
        id: 'user-1',
        email: dto.email,
        name: '앨리스',
        role: UserRole.USER,
      });
    });

    it('존재하지 않는 이메일 → INVALID_CODE (계정 열거 방지)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.verifyEmail(dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.emailVerification.findFirst).not.toHaveBeenCalled();
    });

    it('이미 ACTIVE면 ALREADY_VERIFIED', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...pendingUser(),
        status: UserStatus.ACTIVE,
      });

      await expect(service.verifyEmail(dto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('만료된 코드는 CODE_EXPIRED', async () => {
      prisma.user.findUnique.mockResolvedValue(pendingUser());
      prisma.emailVerification.findFirst.mockResolvedValue({
        id: 'ev-1',
        userId: 'user-1',
        code: '123456',
        expiresAt: new Date(Date.now() - 1000),
        attemptCount: 0,
      });

      await expect(service.verifyEmail(dto)).rejects.toMatchObject({
        response: { code: 'CODE_EXPIRED' },
      });
    });

    it('코드 불일치 시 attemptCount 증가 + INVALID_CODE', async () => {
      prisma.user.findUnique.mockResolvedValue(pendingUser());
      prisma.emailVerification.findFirst.mockResolvedValue({
        id: 'ev-1',
        userId: 'user-1',
        code: '654321',
        expiresAt: new Date(Date.now() + 5 * 60_000),
        attemptCount: 0,
      });

      await expect(service.verifyEmail(dto)).rejects.toMatchObject({
        response: { code: 'INVALID_CODE' },
      });
      expect(prisma.emailVerification.update).toHaveBeenCalledWith({
        where: { id: 'ev-1' },
        data: { attemptCount: 1 },
      });
    });

    it('5번째 실패 시 CODE_ATTEMPTS_EXCEEDED로 코드 무효화', async () => {
      prisma.user.findUnique.mockResolvedValue(pendingUser());
      prisma.emailVerification.findFirst.mockResolvedValue({
        id: 'ev-1',
        userId: 'user-1',
        code: '654321',
        expiresAt: new Date(Date.now() + 5 * 60_000),
        attemptCount: 4, // 다음 실패가 5번째
      });

      await expect(service.verifyEmail(dto)).rejects.toMatchObject({
        response: { code: 'CODE_ATTEMPTS_EXCEEDED' },
      });
      expect(prisma.emailVerification.update).toHaveBeenCalledWith({
        where: { id: 'ev-1' },
        data: { attemptCount: 5 },
      });
    });

    it('이미 5회 소진된 상태에서는 바로 CODE_ATTEMPTS_EXCEEDED', async () => {
      prisma.user.findUnique.mockResolvedValue(pendingUser());
      prisma.emailVerification.findFirst.mockResolvedValue({
        id: 'ev-1',
        userId: 'user-1',
        code: '123456',
        expiresAt: new Date(Date.now() + 5 * 60_000),
        attemptCount: 5,
      });

      await expect(service.verifyEmail(dto)).rejects.toMatchObject({
        response: { code: 'CODE_ATTEMPTS_EXCEEDED' },
      });
      expect(prisma.emailVerification.update).not.toHaveBeenCalled();
    });

    it('EMAIL_CODE_HASH_ENABLED=true면 해시 저장값과 입력 코드 해시를 비교', async () => {
      envValues.EMAIL_CODE_HASH_ENABLED = true;
      // 123456의 sha256 hex
      const hashed = 'ed32750dfe8887c1a7a81a2a6ce6b8297df8d60f5c4de063d6c6aa75d53fa32b';
      // 위 값은 임시. 실제 해시를 서비스 로직과 동일하게 계산:
      // 테스트에서는 내부 헬퍼에 의존하지 않고 Node crypto로 직접 계산한다.
      const { createHash } = await import('node:crypto');
      const realHash = createHash('sha256').update(dto.code).digest('hex');
      expect(realHash).not.toBe(hashed); // 방어 — hashed 리터럴 미사용 경고 방지
      prisma.user.findUnique.mockResolvedValue(pendingUser());
      prisma.emailVerification.findFirst.mockResolvedValue({
        id: 'ev-1',
        userId: 'user-1',
        code: realHash,
        expiresAt: new Date(Date.now() + 5 * 60_000),
        attemptCount: 0,
      });
      prisma.user.update.mockResolvedValue({
        ...pendingUser(),
        status: UserStatus.ACTIVE,
      });

      const result = await service.verifyEmail(dto);
      expect(result.verified).toBe(true);
    });
  });

  describe('resendCode', () => {
    const dto: ResendCodeDto = { email: 'alice@example.com' };

    function pendingUserRow() {
      return { id: 'user-1', email: dto.email, status: UserStatus.PENDING };
    }

    it('쿨다운 경과 후 재발송 — 기존 미인증 코드 삭제 + 신규 코드 생성/발송', async () => {
      prisma.user.findUnique.mockResolvedValue(pendingUserRow());
      prisma.emailVerification.findFirst.mockResolvedValue({
        sentAt: new Date(Date.now() - 61_000),
      });
      prisma.emailVerification.deleteMany.mockResolvedValue({ count: 1 });
      const sentAt = new Date();
      prisma.emailVerification.create.mockResolvedValue({ sentAt });

      const result = await service.resendCode(dto);

      expect(prisma.emailVerification.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', verifiedAt: null },
      });
      expect(prisma.emailVerification.create).toHaveBeenCalledTimes(1);
      expect(mail.send).toHaveBeenCalledTimes(1);
      expect(result.codeSentAt).toBe(sentAt.toISOString());
      expect(new Date(result.nextResendAvailableAt).getTime()).toBe(sentAt.getTime() + 60_000);
    });

    it('쿨다운 미경과 시 RESEND_COOLDOWN + retryAfterSeconds', async () => {
      prisma.user.findUnique.mockResolvedValue(pendingUserRow());
      prisma.emailVerification.findFirst.mockResolvedValue({
        sentAt: new Date(Date.now() - 10_000), // 10초 전
      });

      let caught: unknown;
      await service.resendCode(dto).catch((e) => {
        caught = e;
      });
      expect(caught).toBeInstanceOf(HttpException);
      const err = caught as HttpException;
      expect(err.getStatus()).toBe(429);
      const body = err.getResponse() as { code: string; details: { retryAfterSeconds: number } };
      expect(body.code).toBe('RESEND_COOLDOWN');
      expect(body.details.retryAfterSeconds).toBeGreaterThan(0);
      expect(body.details.retryAfterSeconds).toBeLessThanOrEqual(60);
      expect(prisma.emailVerification.create).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('존재하지 않는 이메일이면 USER_NOT_FOUND', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.resendCode(dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('이미 ACTIVE면 ALREADY_VERIFIED', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        status: UserStatus.ACTIVE,
      });
      await expect(service.resendCode(dto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('이전 발송 이력이 없으면(쿨다운 검사 스킵) 바로 신규 코드 생성', async () => {
      prisma.user.findUnique.mockResolvedValue(pendingUserRow());
      prisma.emailVerification.findFirst.mockResolvedValue(null);
      prisma.emailVerification.deleteMany.mockResolvedValue({ count: 0 });
      prisma.emailVerification.create.mockResolvedValue({ sentAt: new Date() });

      await expect(service.resendCode(dto)).resolves.toBeDefined();
    });
  });

  describe('login', () => {
    const dto: LoginDto = { email: 'alice@example.com', password: 'Password1!' };

    async function withHashedUser(
      overrides: Partial<{ status: UserStatus; lockedUntil: Date | null }> = {},
    ) {
      const passwordHash = await service.hashPassword(dto.password);
      return {
        id: 'uuid-1',
        email: dto.email,
        passwordHash,
        name: '앨리스',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        lockedUntil: null as Date | null,
        ...overrides,
      };
    }

    function findAuditCall(action: string) {
      return prisma.auditLog.create.mock.calls.find(
        (c) => (c[0] as { data: { action: string } }).data.action === action,
      );
    }

    it('비밀번호 불일치면 INVALID_CREDENTIALS + LoginAttempt(success=false) + LOGIN_FAILED 감사', async () => {
      const user = await withHashedUser();
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(
        service.login(
          { email: dto.email, password: 'WrongPass1!' },
          { ipAddress: '127.0.0.1', userAgent: 'jest' },
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(prisma.loginAttempt.create).toHaveBeenCalledWith({
        data: { email: dto.email, success: false, ipAddress: '127.0.0.1' },
      });
      expect(findAuditCall('LOGIN_FAILED')).toBeDefined();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('존재하지 않는 이메일도 INVALID_CREDENTIALS (계정 열거 방지), 잠금 갱신 없음', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.loginAttempt.create).toHaveBeenCalledWith({
        data: { email: dto.email, success: false, ipAddress: undefined },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('PENDING 상태면 EMAIL_NOT_VERIFIED로 ForbiddenException + 실패 기록', async () => {
      const user = await withHashedUser({ status: UserStatus.PENDING });
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(service.login(dto)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.loginAttempt.create).toHaveBeenCalledWith({
        data: { email: dto.email, success: false, ipAddress: undefined },
      });
    });

    it('정상 로그인 시 accessToken + refreshToken + LOGIN_SUCCESS 기록, lockedUntil 리셋', async () => {
      const user = await withHashedUser();
      prisma.user.findUnique.mockResolvedValue(user);

      const result = await service.login(dto, {
        ipAddress: '10.0.0.1',
        userAgent: 'mozilla',
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toMatch(/^[a-f0-9]{96}$/);
      expect(result.user).toEqual({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: { lastLoginAt: expect.any(Date), lockedUntil: null },
      });
      expect(prisma.loginAttempt.create).toHaveBeenCalledWith({
        data: { email: dto.email, success: true, ipAddress: '10.0.0.1' },
      });
      expect(findAuditCall('LOGIN_SUCCESS')).toBeDefined();

      // Refresh Token은 SHA-256 해시로 저장되어야 한다 (평문 그대로 저장 금지).
      const rtCall = prisma.refreshToken.create.mock.calls[0]?.[0] as {
        data: { tokenHash: string; userId: string; expiresAt: Date };
      };
      expect(rtCall.data.userId).toBe(user.id);
      expect(rtCall.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(rtCall.data.tokenHash).not.toBe(result.refreshToken);
      // 14d TTL
      expect(rtCall.data.expiresAt.getTime() - Date.now()).toBeGreaterThan(13 * 86_400_000);
    });

    it('lockedUntil이 미래면 비밀번호 검증 전에 ACCOUNT_LOCKED(423) 반환', async () => {
      const lockedUntil = new Date(Date.now() + 10 * 60_000);
      const user = await withHashedUser({ lockedUntil });
      prisma.user.findUnique.mockResolvedValue(user);

      let caught: unknown;
      await service.login(dto).catch((e) => {
        caught = e;
      });
      expect(caught).toBeInstanceOf(HttpException);
      const err = caught as HttpException;
      expect(err.getStatus()).toBe(423);
      const body = err.getResponse() as { code: string; details: { lockedUntil: string } };
      expect(body.code).toBe('ACCOUNT_LOCKED');
      expect(body.details.lockedUntil).toBe(lockedUntil.toISOString());
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
      // 잠금 응답이어도 시도 이력은 남긴다.
      expect(prisma.loginAttempt.create).toHaveBeenCalledWith({
        data: { email: dto.email, success: false, ipAddress: undefined },
      });
    });

    it('마지막 성공 이후 5번째 실패 시 lockedUntil=now+30m + ACCOUNT_LOCKED 감사 기록', async () => {
      const user = await withHashedUser();
      prisma.user.findUnique.mockResolvedValue(user);
      // 직전 성공 이력 없음 — 전체 실패 카운트가 5.
      prisma.loginAttempt.findFirst.mockResolvedValue(null);
      prisma.loginAttempt.count.mockResolvedValue(5);

      const before = Date.now();
      await expect(
        service.login({ email: dto.email, password: 'WrongPass1!' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      const after = Date.now();

      const updateCall = prisma.user.update.mock.calls.find(
        (c) => (c[0] as { data: { lockedUntil?: Date } }).data.lockedUntil instanceof Date,
      );
      expect(updateCall).toBeDefined();
      const lockedUntil = (updateCall?.[0] as { data: { lockedUntil: Date } }).data.lockedUntil;
      const delta = lockedUntil.getTime() - before;
      expect(delta).toBeGreaterThanOrEqual(30 * 60_000);
      expect(lockedUntil.getTime() - after).toBeLessThanOrEqual(30 * 60_000);

      const audit = findAuditCall('ACCOUNT_LOCKED');
      expect(audit).toBeDefined();
      const auditArg = audit?.[0] as {
        data: { actorId?: string | null; payload: { reason: string; failedCount: number } };
      };
      expect(auditArg.data.actorId).toBeUndefined();
      expect(auditArg.data.payload.reason).toBe('LOGIN_MAX_ATTEMPTS_EXCEEDED');
      expect(auditArg.data.payload.failedCount).toBe(5);
    });

    it('마지막 성공 이후 실패 4건이면 잠금 없이 LOGIN_FAILED만 기록', async () => {
      const user = await withHashedUser();
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.loginAttempt.findFirst.mockResolvedValue({ attemptedAt: new Date() });
      prisma.loginAttempt.count.mockResolvedValue(4);

      await expect(
        service.login({ email: dto.email, password: 'WrongPass1!' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(
        prisma.user.update.mock.calls.some(
          (c) => (c[0] as { data: Record<string, unknown> }).data.lockedUntil instanceof Date,
        ),
      ).toBe(false);
      expect(findAuditCall('ACCOUNT_LOCKED')).toBeUndefined();
      const failedAudit = findAuditCall('LOGIN_FAILED');
      expect(failedAudit).toBeDefined();
      expect(
        (failedAudit?.[0] as { data: { payload: { failedCount: number } } }).data.payload
          .failedCount,
      ).toBe(4);
    });
  });

  describe('rotateRefreshToken', () => {
    function activeUser(overrides: Partial<{ status: UserStatus; lockedUntil: Date | null }> = {}) {
      return {
        id: 'uuid-1',
        email: 'alice@example.com',
        name: '앨리스',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        lockedUntil: null as Date | null,
        ...overrides,
      };
    }

    it('유효한 토큰 회전 시 이전 토큰 revoke + 신규 발급 + 새 accessToken 반환', async () => {
      const plain = 'plain-rt-value';
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-old',
        userId: 'uuid-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86_400_000),
        user: activeUser(),
      });

      const result = await service.rotateRefreshToken(plain, { ipAddress: '10.0.0.2' });

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-old' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      const createArg = prisma.refreshToken.create.mock.calls[0]?.[0] as {
        data: { tokenHash: string; userId: string };
      };
      expect(createArg.data.userId).toBe('uuid-1');
      expect(createArg.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toMatch(/^[a-f0-9]{96}$/);
      expect(result.refreshToken).not.toBe(plain);
    });

    it('쿠키가 없으면 INVALID_REFRESH_TOKEN', async () => {
      await expect(service.rotateRefreshToken(undefined)).rejects.toMatchObject({
        response: { code: 'INVALID_REFRESH_TOKEN' },
      });
      expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
    });

    it('DB에 없는 토큰이면 INVALID_REFRESH_TOKEN', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.rotateRefreshToken('unknown')).rejects.toMatchObject({
        response: { code: 'INVALID_REFRESH_TOKEN' },
      });
    });

    it('이미 revoke된 토큰은 INVALID_REFRESH_TOKEN (회전 공격 감지 지점)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-old',
        userId: 'uuid-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        user: activeUser(),
      });
      await expect(service.rotateRefreshToken('any')).rejects.toMatchObject({
        response: { code: 'INVALID_REFRESH_TOKEN' },
      });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('만료된 토큰은 REFRESH_TOKEN_EXPIRED', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-old',
        userId: 'uuid-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        user: activeUser(),
      });
      await expect(service.rotateRefreshToken('any')).rejects.toMatchObject({
        response: { code: 'REFRESH_TOKEN_EXPIRED' },
      });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('사용자가 ACTIVE가 아니면 INVALID_REFRESH_TOKEN (계정 상태 변동 대응)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-old',
        userId: 'uuid-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86_400_000),
        user: activeUser({ status: UserStatus.LOCKED }),
      });
      await expect(service.rotateRefreshToken('any')).rejects.toMatchObject({
        response: { code: 'INVALID_REFRESH_TOKEN' },
      });
    });

    it('사용자가 잠금 구간이면 ACCOUNT_LOCKED', async () => {
      const lockedUntil = new Date(Date.now() + 5 * 60_000);
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-old',
        userId: 'uuid-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86_400_000),
        user: activeUser({ lockedUntil }),
      });

      let caught: unknown;
      await service.rotateRefreshToken('any').catch((e) => {
        caught = e;
      });
      expect(caught).toBeInstanceOf(HttpException);
      expect((caught as HttpException).getStatus()).toBe(423);
    });
  });

  describe('logout', () => {
    it('쿠키가 있으면 본인 소유 + 살아있는 토큰만 revoke + LOGOUT 감사', async () => {
      await service.logout('uuid-1', 'plain-rt-value', '10.0.0.3');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          userId: 'uuid-1',
          revokedAt: null,
        },
        data: { revokedAt: expect.any(Date) },
      });
      const audit = prisma.auditLog.create.mock.calls[0]?.[0] as {
        data: { action: string; actorId: string; targetType: string };
      };
      expect(audit.data.action).toBe('LOGOUT');
      expect(audit.data.actorId).toBe('uuid-1');
      expect(audit.data.targetType).toBe('USER');
    });

    it('쿠키가 없어도 감사 로그는 남긴다 (중복 로그아웃 허용)', async () => {
      await service.logout('uuid-1', undefined);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('validateJwtUser', () => {
    it('ACTIVE 사용자면 AuthUser 반환', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'uuid-1',
        email: 'alice@example.com',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      });

      const result = await service.validateJwtUser('uuid-1');

      expect(result).toEqual({ id: 'uuid-1', email: 'alice@example.com', role: UserRole.USER });
    });

    it('LOCKED 사용자는 null', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'uuid-1',
        email: 'alice@example.com',
        role: UserRole.USER,
        status: UserStatus.LOCKED,
      });

      await expect(service.validateJwtUser('uuid-1')).resolves.toBeNull();
    });

    it('ACTIVE여도 lockedUntil이 미래면 null (잠금 구간 내 재인증 강제)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'uuid-1',
        email: 'alice@example.com',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        lockedUntil: new Date(Date.now() + 60_000),
      });

      await expect(service.validateJwtUser('uuid-1')).resolves.toBeNull();
    });

    it('lockedUntil이 과거면 정상 통과', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'uuid-1',
        email: 'alice@example.com',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        lockedUntil: new Date(Date.now() - 60_000),
      });

      await expect(service.validateJwtUser('uuid-1')).resolves.toEqual({
        id: 'uuid-1',
        email: 'alice@example.com',
        role: UserRole.USER,
      });
    });
  });

  describe('requestPasswordReset', () => {
    const dto: PasswordResetRequestDto = { email: 'alice@example.com' };

    function activeUserRow() {
      return {
        id: 'uuid-1',
        email: dto.email,
        name: '앨리스',
        status: UserStatus.ACTIVE,
      };
    }

    it('ACTIVE 사용자면 기존 미사용 토큰 삭제 + 신규 PasswordReset 생성 + 메일 발송', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUserRow());

      await service.requestPasswordReset(dto);

      expect(prisma.passwordReset.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'uuid-1', usedAt: null },
      });
      expect(prisma.passwordReset.create).toHaveBeenCalledTimes(1);
      const createArg = prisma.passwordReset.create.mock.calls[0]?.[0] as {
        data: { userId: string; tokenHash: string; expiresAt: Date };
      };
      expect(createArg.data.userId).toBe('uuid-1');
      // 평문 토큰을 저장하지 않고 SHA-256 해시만 남겨야 한다.
      expect(createArg.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      // 1시간 TTL (PASSWORD_RESET_TTL_HOURS=1)
      expect(createArg.data.expiresAt.getTime() - Date.now()).toBeGreaterThan(55 * 60_000);
      expect(createArg.data.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(
        60 * 60_000 + 1000,
      );

      expect(mailTemplates.render).toHaveBeenCalledWith(
        'password-reset',
        expect.objectContaining({
          name: '앨리스',
          ttlHours: 1,
          token: expect.stringMatching(/^[a-f0-9]{64}$/),
          resetUrl: expect.stringContaining('http://localhost:3000/reset-password?token='),
        }),
      );
      expect(mail.send).toHaveBeenCalledTimes(1);
      const mailArg = mail.send.mock.calls[0]?.[0] as { to: string; text: string };
      expect(mailArg.to).toBe(dto.email);
      // 메일 본문은 평문 토큰을 포함하지만 DB에는 해시만 저장됐는지 위에서 확인.
      expect(mailArg.text).toMatch(/[a-f0-9]{64}/);
    });

    it('존재하지 않는 이메일은 아무 것도 하지 않고 조용히 리턴 (계정 열거 방지)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.requestPasswordReset(dto)).resolves.toBeUndefined();
      expect(prisma.passwordReset.create).not.toHaveBeenCalled();
      expect(prisma.passwordReset.deleteMany).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('PENDING 등 비ACTIVE 계정도 메일/토큰 생성 없이 조용히 리턴', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...activeUserRow(),
        status: UserStatus.PENDING,
      });

      await expect(service.requestPasswordReset(dto)).resolves.toBeUndefined();
      expect(prisma.passwordReset.create).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('메일 발송이 실패해도 예외를 전파하지 않는다', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUserRow());
      mail.send.mockRejectedValueOnce(new Error('smtp down'));

      await expect(service.requestPasswordReset(dto)).resolves.toBeUndefined();
      expect(prisma.passwordReset.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('confirmPasswordReset', () => {
    const plainToken = 'a'.repeat(64); // 테스트용 — 실제 구현은 난수 hex.
    const dto: PasswordResetConfirmDto = {
      token: plainToken,
      newPassword: 'NewPassword1!',
    };

    async function tokenHashOf(plain: string): Promise<string> {
      const { createHash } = await import('node:crypto');
      return createHash('sha256').update(plain).digest('hex');
    }

    it('정상 토큰이면 비번 갱신 + usedAt 기록 + 모든 RefreshToken revoke + 감사 로그', async () => {
      const hash = await tokenHashOf(plainToken);
      prisma.passwordReset.findUnique.mockResolvedValue({
        id: 'pr-1',
        userId: 'uuid-1',
        tokenHash: hash,
        usedAt: null,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      });
      prisma.user.update.mockResolvedValue(undefined);

      await service.confirmPasswordReset(dto);

      expect(prisma.passwordReset.findUnique).toHaveBeenCalledWith({ where: { tokenHash: hash } });
      expect(prisma.passwordReset.update).toHaveBeenCalledWith({
        where: { id: 'pr-1' },
        data: { usedAt: expect.any(Date) },
      });

      const userUpdate = prisma.user.update.mock.calls[0]?.[0] as {
        where: { id: string };
        data: { passwordHash: string; lockedUntil: null };
      };
      expect(userUpdate.where.id).toBe('uuid-1');
      expect(userUpdate.data.passwordHash).toMatch(/^\$argon2id\$/);
      expect(userUpdate.data.passwordHash).not.toContain(dto.newPassword);
      expect(userUpdate.data.lockedUntil).toBeNull();

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'uuid-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });

      const audit = prisma.auditLog.create.mock.calls[0]?.[0] as {
        data: { action: string; actorId: string; targetId: string };
      };
      expect(audit.data.action).toBe('PASSWORD_RESET');
      expect(audit.data.actorId).toBe('uuid-1');
      expect(audit.data.targetId).toBe('uuid-1');
    });

    it('DB에 없는 토큰은 INVALID_RESET_TOKEN', async () => {
      prisma.passwordReset.findUnique.mockResolvedValue(null);

      await expect(service.confirmPasswordReset(dto)).rejects.toMatchObject({
        response: { code: 'INVALID_RESET_TOKEN' },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('이미 usedAt이 채워진 토큰은 INVALID_RESET_TOKEN (재사용 차단)', async () => {
      prisma.passwordReset.findUnique.mockResolvedValue({
        id: 'pr-1',
        userId: 'uuid-1',
        tokenHash: await tokenHashOf(plainToken),
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60_000),
      });

      await expect(service.confirmPasswordReset(dto)).rejects.toMatchObject({
        response: { code: 'INVALID_RESET_TOKEN' },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('만료된 토큰은 RESET_TOKEN_EXPIRED', async () => {
      prisma.passwordReset.findUnique.mockResolvedValue({
        id: 'pr-1',
        userId: 'uuid-1',
        tokenHash: await tokenHashOf(plainToken),
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.confirmPasswordReset(dto)).rejects.toMatchObject({
        response: { code: 'RESET_TOKEN_EXPIRED' },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('짧은 새 비밀번호는 WEAK_PASSWORD — 토큰 조회 전에 차단', async () => {
      await expect(
        service.confirmPasswordReset({ token: plainToken, newPassword: 'short1!' }),
      ).rejects.toMatchObject({
        response: { code: 'WEAK_PASSWORD' },
      });
      expect(prisma.passwordReset.findUnique).not.toHaveBeenCalled();
    });

    it('문자 구성 미달(숫자/특수문자 누락)은 WEAK_PASSWORD', async () => {
      await expect(
        service.confirmPasswordReset({ token: plainToken, newPassword: 'onlyletters' }),
      ).rejects.toMatchObject({
        response: { code: 'WEAK_PASSWORD' },
      });
      expect(prisma.passwordReset.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('getMe', () => {
    it('사용자 정보를 MeProfile 형태로 반환 (passwordHash 등 민감 필드 제외)', async () => {
      const createdAt = new Date('2026-04-23T09:00:00Z');
      prisma.user.findUnique.mockResolvedValue({
        id: 'uuid-1',
        email: 'alice@example.com',
        name: '앨리스',
        department: '개발팀',
        employeeNo: 'EMP001',
        phone: '010-1234-5678',
        role: UserRole.USER,
        createdAt,
      });

      const result = await service.getMe('uuid-1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
        select: expect.objectContaining({
          id: true,
          email: true,
          name: true,
          department: true,
          employeeNo: true,
          phone: true,
          role: true,
          createdAt: true,
        }),
      });
      // select에 passwordHash가 포함되면 안 된다 — 민감 필드 유출 방지.
      const selectArg = (
        prisma.user.findUnique.mock.calls[0]?.[0] as { select: Record<string, boolean> }
      ).select;
      expect(selectArg).not.toHaveProperty('passwordHash');

      expect(result).toEqual({
        id: 'uuid-1',
        email: 'alice@example.com',
        name: '앨리스',
        department: '개발팀',
        employeeNo: 'EMP001',
        phone: '010-1234-5678',
        role: UserRole.USER,
        createdAt: '2026-04-23T09:00:00.000Z',
      });
    });

    it('옵션 필드가 null이면 null 그대로 반환', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'uuid-1',
        email: 'alice@example.com',
        name: '앨리스',
        department: null,
        employeeNo: null,
        phone: null,
        role: UserRole.USER,
        createdAt: new Date('2026-04-23T09:00:00Z'),
      });

      const result = await service.getMe('uuid-1');

      expect(result.department).toBeNull();
      expect(result.employeeNo).toBeNull();
      expect(result.phone).toBeNull();
    });

    it('사용자 row가 없으면 USER_NOT_FOUND (JwtAuthGuard 통과 후 race)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getMe('uuid-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    const baseUserRow = {
      id: 'uuid-1',
      email: 'alice@example.com',
      name: '앨리스',
      department: '개발팀',
      employeeNo: 'EMP001',
      phone: '010-1234-5678',
      role: UserRole.USER,
      createdAt: new Date('2026-04-23T09:00:00Z'),
    };

    it('제공된 필드만 user.update에 전달한다 (email/role은 전달되지 않는다)', async () => {
      prisma.user.update.mockResolvedValue({
        ...baseUserRow,
        name: '새앨리스',
        department: '플랫폼팀',
        phone: '010-9999-8888',
      });

      const dto: UpdateProfileDto = {
        name: '새앨리스',
        department: '플랫폼팀',
        phone: '010-9999-8888',
      };
      const result = await service.updateProfile('uuid-1', dto);

      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      const call = prisma.user.update.mock.calls[0]?.[0] as {
        where: { id: string };
        data: Record<string, unknown>;
      };
      expect(call.where).toEqual({ id: 'uuid-1' });
      expect(call.data).toEqual({
        name: '새앨리스',
        department: '플랫폼팀',
        phone: '010-9999-8888',
      });
      expect(call.data).not.toHaveProperty('email');
      expect(call.data).not.toHaveProperty('role');
      expect(call.data).not.toHaveProperty('passwordHash');

      expect(result).toEqual({
        id: 'uuid-1',
        email: 'alice@example.com',
        name: '새앨리스',
        department: '플랫폼팀',
        employeeNo: 'EMP001',
        phone: '010-9999-8888',
        role: UserRole.USER,
        createdAt: '2026-04-23T09:00:00.000Z',
      });
    });

    it('부분 업데이트 — 미지정 필드는 data에 포함되지 않는다', async () => {
      prisma.user.update.mockResolvedValue({ ...baseUserRow, phone: '010-0000-0000' });

      await service.updateProfile('uuid-1', { phone: '010-0000-0000' });

      const call = prisma.user.update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(call.data).toEqual({ phone: '010-0000-0000' });
    });

    it('빈 DTO면 data={}로 update 호출 (updatedAt만 갱신 효과)', async () => {
      prisma.user.update.mockResolvedValue(baseUserRow);

      await service.updateProfile('uuid-1', {});

      const call = prisma.user.update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(call.data).toEqual({});
    });
  });

  describe('changePassword', () => {
    const dto: ChangePasswordDto = {
      currentPassword: 'OldPass1!',
      newPassword: 'NewPass1!',
    };

    async function activeUserWithHash(plain: string) {
      const passwordHash = await service.hashPassword(plain);
      return { id: 'uuid-1', passwordHash };
    }

    it('정상 변경 시 새 해시 저장 + 모든 Refresh Token revoke + PASSWORD_CHANGED 감사', async () => {
      prisma.user.findUnique.mockResolvedValue(await activeUserWithHash(dto.currentPassword));

      await service.changePassword('uuid-1', dto);

      const userUpdate = prisma.user.update.mock.calls[0]?.[0] as {
        where: { id: string };
        data: { passwordHash: string };
      };
      expect(userUpdate.where.id).toBe('uuid-1');
      expect(userUpdate.data.passwordHash).toMatch(/^\$argon2id\$/);
      expect(userUpdate.data.passwordHash).not.toContain(dto.newPassword);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'uuid-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });

      const audit = prisma.auditLog.create.mock.calls[0]?.[0] as {
        data: { action: string; actorId: string; targetId: string; targetType: string };
      };
      expect(audit.data.action).toBe('PASSWORD_CHANGED');
      expect(audit.data.actorId).toBe('uuid-1');
      expect(audit.data.targetId).toBe('uuid-1');
      expect(audit.data.targetType).toBe('USER');
    });

    it('현재 비번 불일치면 INVALID_CURRENT_PASSWORD — 비번/토큰 유지', async () => {
      prisma.user.findUnique.mockResolvedValue(await activeUserWithHash('DifferentPass1!'));

      await expect(service.changePassword('uuid-1', dto)).rejects.toMatchObject({
        response: { code: 'INVALID_CURRENT_PASSWORD' },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('새 비번이 짧으면 WEAK_PASSWORD — 현재 비번 확인 후, DB 변경 전에 차단', async () => {
      prisma.user.findUnique.mockResolvedValue(await activeUserWithHash(dto.currentPassword));

      await expect(
        service.changePassword('uuid-1', {
          currentPassword: dto.currentPassword,
          newPassword: 'short1!',
        }),
      ).rejects.toMatchObject({
        response: { code: 'WEAK_PASSWORD' },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('새 비번 문자 구성 미달(영문만)도 WEAK_PASSWORD', async () => {
      prisma.user.findUnique.mockResolvedValue(await activeUserWithHash(dto.currentPassword));

      await expect(
        service.changePassword('uuid-1', {
          currentPassword: dto.currentPassword,
          newPassword: 'onlyletters',
        }),
      ).rejects.toMatchObject({
        response: { code: 'WEAK_PASSWORD' },
      });
    });

    it('사용자 row가 없으면 USER_NOT_FOUND', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.changePassword('uuid-1', dto)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
