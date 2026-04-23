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
import type { LoginDto } from './dto/login.dto';
import type { ResendCodeDto } from './dto/resend-code.dto';
import type { SignupDto } from './dto/signup.dto';
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
  };
  const configGet = jest.fn((key: string) => envValues[key]);

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      emailVerification: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
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

    async function withHashedUser(overrides: Partial<{ status: UserStatus }> = {}) {
      const passwordHash = await service.hashPassword(dto.password);
      return {
        id: 'uuid-1',
        email: dto.email,
        passwordHash,
        name: '앨리스',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        ...overrides,
      };
    }

    it('비밀번호 불일치면 INVALID_CREDENTIALS로 UnauthorizedException', async () => {
      const user = await withHashedUser();
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(
        service.login({ email: dto.email, password: 'WrongPass1!' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('존재하지 않는 이메일도 INVALID_CREDENTIALS (계정 열거 방지)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('PENDING 상태면 EMAIL_NOT_VERIFIED로 ForbiddenException', async () => {
      const user = await withHashedUser({ status: UserStatus.PENDING });
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(service.login(dto)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('정상 로그인 시 accessToken + user 반환, lastLoginAt 갱신', async () => {
      const user = await withHashedUser();
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.user.update.mockResolvedValue(user);

      const result = await service.login(dto);

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user).toEqual({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: { lastLoginAt: expect.any(Date) },
      });
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
  });
});
