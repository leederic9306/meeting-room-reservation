import { randomUUID } from 'node:crypto';

import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { UserRole, UserStatus } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { EnvelopeInterceptor } from '../src/common/interceptors/envelope.interceptor';
import { MailService, type SendMailOptions } from '../src/infra/mail/mail.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';

// 필수 환경변수 — AppModule이 로드되기 전에 세팅해야 env.validation을 통과한다.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-min-16chars-long';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-min-16chars-long';
process.env.MAIL_FROM ??= 'noreply@test.local';
process.env.EMAIL_CODE_HASH_ENABLED ??= 'false';
process.env.EMAIL_CODE_RESEND_COOLDOWN_SECONDS ??= '60';
process.env.EMAIL_CODE_MAX_ATTEMPTS ??= '5';
process.env.EMAIL_CODE_TTL_MINUTES ??= '10';

interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  department: string | null;
  employeeNo: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface EmailVerificationRow {
  id: string;
  userId: string;
  code: string;
  expiresAt: Date;
  attemptCount: number;
  verifiedAt: Date | null;
  sentAt: Date;
}

/**
 * 작은 인메모리 Prisma 더블. 테스트에 필요한 메서드만 구현한다.
 * $transaction은 동일 인스턴스를 tx로 전달해 컨트랙트만 유지한다.
 */
class InMemoryPrisma {
  users: UserRow[] = [];
  emailVerifications: EmailVerificationRow[] = [];

  user = {
    findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
      return (
        this.users.find((u) =>
          where.id !== undefined ? u.id === where.id : u.email === where.email,
        ) ?? null
      );
    },
    create: async ({ data }: { data: Partial<UserRow> & { email: string; name: string } }) => {
      const row: UserRow = {
        id: randomUUID(),
        email: data.email,
        passwordHash: data.passwordHash ?? '',
        name: data.name,
        department: data.department ?? null,
        employeeNo: data.employeeNo ?? null,
        phone: data.phone ?? null,
        role: data.role ?? UserRole.USER,
        status: data.status ?? UserStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.users.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
      const user = this.users.find((u) => u.id === where.id);
      if (!user) throw new Error(`user not found: ${where.id}`);
      Object.assign(user, data, { updatedAt: new Date() });
      return user;
    },
    deleteMany: async () => ({ count: 0 }),
  };

  emailVerification = {
    findFirst: async ({
      where,
      orderBy,
    }: {
      where: { userId: string; verifiedAt?: Date | null };
      orderBy?: { sentAt: 'asc' | 'desc' };
    }) => {
      let rows = this.emailVerifications.filter((r) => r.userId === where.userId);
      if (where.verifiedAt === null) rows = rows.filter((r) => r.verifiedAt === null);
      rows = [...rows].sort((a, b) =>
        orderBy?.sentAt === 'desc'
          ? b.sentAt.getTime() - a.sentAt.getTime()
          : a.sentAt.getTime() - b.sentAt.getTime(),
      );
      return rows[0] ?? null;
    },
    create: async ({
      data,
    }: {
      data: { userId: string; code: string; expiresAt: Date; sentAt?: Date };
    }) => {
      const row: EmailVerificationRow = {
        id: randomUUID(),
        userId: data.userId,
        code: data.code,
        expiresAt: data.expiresAt,
        attemptCount: 0,
        verifiedAt: null,
        sentAt: data.sentAt ?? new Date(),
      };
      this.emailVerifications.push(row);
      return { ...row, user: { email: this.users.find((u) => u.id === row.userId)?.email } };
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<EmailVerificationRow>;
    }) => {
      const row = this.emailVerifications.find((r) => r.id === where.id);
      if (!row) throw new Error(`verification not found: ${where.id}`);
      Object.assign(row, data);
      return row;
    },
    deleteMany: async ({ where }: { where: { userId: string; verifiedAt?: Date | null } }) => {
      const before = this.emailVerifications.length;
      this.emailVerifications = this.emailVerifications.filter(
        (r) => !(r.userId === where.userId && (where.verifiedAt !== null || r.verifiedAt === null)),
      );
      return { count: before - this.emailVerifications.length };
    },
  };

  async $transaction<T>(
    arg: ((tx: InMemoryPrisma) => Promise<T>) | Promise<T>[],
  ): Promise<T | T[]> {
    if (typeof arg === 'function') {
      return arg(this);
    }
    return Promise.all(arg);
  }

  async $connect(): Promise<void> {
    // InMemory는 연결 개념이 없음 — Prisma 컨트랙트만 유지.
    return Promise.resolve();
  }
  async $disconnect(): Promise<void> {
    return Promise.resolve();
  }
  async $queryRaw(): Promise<unknown> {
    return [];
  }

  reset(): void {
    this.users = [];
    this.emailVerifications = [];
  }
}

class CapturingMail extends MailService {
  sent: SendMailOptions[] = [];
  async send(options: SendMailOptions): Promise<void> {
    this.sent.push(options);
  }
  reset(): void {
    this.sent = [];
  }
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: InMemoryPrisma;
  let mail: CapturingMail;

  const BASE = '/api/v1';
  const signupBody = {
    email: 'alice@example.com',
    password: 'Password1!',
    name: '앨리스',
    department: '개발팀',
  };

  beforeAll(async () => {
    prisma = new InMemoryPrisma();
    mail = new CapturingMail();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalInterceptors(new EnvelopeInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prisma.reset();
    mail.reset();
  });

  function extractCode(): string {
    expect(mail.sent).toHaveLength(1);
    const match = /\b(\d{6})\b/.exec(mail.sent[0]!.text);
    expect(match).not.toBeNull();
    return match![1]!;
  }

  describe('POST /auth/signup', () => {
    it('유효한 입력 → 201 + verificationRequired=true + 인증 메일 발송', async () => {
      const res = await request(app.getHttpServer()).post(`${BASE}/auth/signup`).send(signupBody);

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        email: signupBody.email,
        verificationRequired: true,
      });
      expect(typeof res.body.data.userId).toBe('string');
      expect(typeof res.body.data.codeSentAt).toBe('string');
      expect(mail.sent).toHaveLength(1);
      expect(mail.sent[0]!.to).toBe(signupBody.email);
      // 응답 바디에 코드 자체를 포함하지 않아야 한다.
      expect(JSON.stringify(res.body)).not.toMatch(/\b\d{6}\b/);
    });

    it('비밀번호 약하면 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/auth/signup`)
        .send({ ...signupBody, password: 'weak' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('이메일 중복 → 409 EMAIL_ALREADY_EXISTS', async () => {
      await request(app.getHttpServer()).post(`${BASE}/auth/signup`).send(signupBody).expect(201);
      const res = await request(app.getHttpServer()).post(`${BASE}/auth/signup`).send(signupBody);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    });
  });

  describe('POST /auth/verify-email', () => {
    beforeEach(async () => {
      await request(app.getHttpServer()).post(`${BASE}/auth/signup`).send(signupBody).expect(201);
    });

    it('정상 코드 → 200 + accessToken + user + status=ACTIVE', async () => {
      const code = extractCode();

      const res = await request(app.getHttpServer())
        .post(`${BASE}/auth/verify-email`)
        .send({ email: signupBody.email, code });

      expect(res.status).toBe(200);
      expect(res.body.data.verified).toBe(true);
      expect(typeof res.body.data.accessToken).toBe('string');
      expect(res.body.data.user).toMatchObject({
        email: signupBody.email,
        name: signupBody.name,
        role: 'USER',
      });
      const user = await prisma.user.findUnique({ where: { email: signupBody.email } });
      expect(user?.status).toBe(UserStatus.ACTIVE);
    });

    it('잘못된 코드 5회 → 5번째는 CODE_ATTEMPTS_EXCEEDED', async () => {
      const wrong = { email: signupBody.email, code: '000000' };
      for (let i = 0; i < 4; i += 1) {
        const res = await request(app.getHttpServer())
          .post(`${BASE}/auth/verify-email`)
          .send(wrong);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('INVALID_CODE');
      }
      const last = await request(app.getHttpServer()).post(`${BASE}/auth/verify-email`).send(wrong);
      expect(last.status).toBe(400);
      expect(last.body.error.code).toBe('CODE_ATTEMPTS_EXCEEDED');
    });

    it('이미 인증된 계정 → 409 ALREADY_VERIFIED', async () => {
      const code = extractCode();
      await request(app.getHttpServer())
        .post(`${BASE}/auth/verify-email`)
        .send({ email: signupBody.email, code })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`${BASE}/auth/verify-email`)
        .send({ email: signupBody.email, code });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ALREADY_VERIFIED');
    });
  });

  describe('POST /auth/resend-code', () => {
    beforeEach(async () => {
      await request(app.getHttpServer()).post(`${BASE}/auth/signup`).send(signupBody).expect(201);
      mail.reset(); // 회원가입 메일 제외
    });

    it('쿨다운 미경과 시 429 RESEND_COOLDOWN + retryAfterSeconds', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/auth/resend-code`)
        .send({ email: signupBody.email });

      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('RESEND_COOLDOWN');
      expect(res.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('쿨다운 경과 → 200 + 새 코드 발송 (구 코드 무효화)', async () => {
      // 직전 signup 시점을 과거로 옮겨 쿨다운 우회
      prisma.emailVerifications.forEach((ev) => {
        ev.sentAt = new Date(ev.sentAt.getTime() - 61_000);
      });

      const res = await request(app.getHttpServer())
        .post(`${BASE}/auth/resend-code`)
        .send({ email: signupBody.email });

      expect(res.status).toBe(200);
      expect(typeof res.body.data.codeSentAt).toBe('string');
      expect(typeof res.body.data.nextResendAvailableAt).toBe('string');
      expect(mail.sent).toHaveLength(1);
      // 오직 1건의 미인증 코드만 남아야 한다 (기존 무효화).
      const active = prisma.emailVerifications.filter((r) => r.verifiedAt === null);
      expect(active).toHaveLength(1);
    });

    it('존재하지 않는 이메일 → 404 USER_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/auth/resend-code`)
        .send({ email: 'nobody@example.com' });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('USER_NOT_FOUND');
    });
  });
});
