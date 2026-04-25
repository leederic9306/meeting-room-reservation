import { randomUUID } from 'node:crypto';

import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { EnvelopeInterceptor } from '../src/common/interceptors/envelope.interceptor';
import { MailService } from '../src/infra/mail/mail.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';

// AppModule 로드 전 환경변수 — env.validation 통과용.
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
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RoomRow {
  id: string;
  name: string;
  capacity: number | null;
  location: string | null;
  description: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

interface BookingRow {
  id: string;
  roomId: string;
  userId: string;
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
  recurrenceId: string | null;
  recurrenceIndex: number | null;
  createdByAdmin: boolean;
  exceptionRequestId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * Booking 모듈 e2e용 인메모리 Prisma 더블.
 * 실제 EXCLUDE 제약은 Postgres에서만 동작하므로, 동등한 조건을
 * 메모리 상에서 흉내내어 SQLSTATE 23P01 에러를 재현한다.
 */
class InMemoryPrisma {
  users: UserRow[] = [];
  rooms: RoomRow[] = [];
  bookings: BookingRow[] = [];

  user = {
    findUnique: ({
      where,
    }: {
      where: { id?: string; email?: string };
    }): Promise<UserRow | null> => {
      const found = this.users.find((u) =>
        where.id !== undefined ? u.id === where.id : u.email === where.email,
      );
      return Promise.resolve(found ?? null);
    },
    deleteMany: (): Promise<{ count: number }> => Promise.resolve({ count: 0 }),
  };

  room = {
    findUnique: ({ where }: { where: { id: string } }): Promise<RoomRow | null> =>
      Promise.resolve(this.rooms.find((r) => r.id === where.id) ?? null),
  };

  booking = {
    findMany: ({
      where,
      orderBy,
    }: {
      where?: Partial<BookingRow> & {
        deletedAt?: null;
        startAt?: { lt: Date };
        endAt?: { gt: Date };
      };
      orderBy?: { startAt: 'asc' | 'desc' };
    }): Promise<unknown[]> => {
      let rows = [...this.bookings];
      if (where?.deletedAt === null) rows = rows.filter((r) => r.deletedAt === null);
      if (where?.roomId !== undefined) rows = rows.filter((r) => r.roomId === where.roomId);
      if (where?.userId !== undefined) rows = rows.filter((r) => r.userId === where.userId);
      if (where?.startAt && 'lt' in where.startAt) {
        const lt = where.startAt.lt.getTime();
        rows = rows.filter((r) => r.startAt.getTime() < lt);
      }
      if (where?.endAt && 'gt' in where.endAt) {
        const gt = where.endAt.gt.getTime();
        rows = rows.filter((r) => r.endAt.getTime() > gt);
      }
      rows.sort((a, b) =>
        orderBy?.startAt === 'desc'
          ? b.startAt.getTime() - a.startAt.getTime()
          : a.startAt.getTime() - b.startAt.getTime(),
      );
      return Promise.resolve(rows.map((r) => this.attachRelations(r)));
    },
    findFirst: ({
      where,
    }: {
      where: { id?: string; deletedAt?: null };
    }): Promise<unknown | null> => {
      const row = this.bookings.find(
        (r) =>
          (where.id === undefined || r.id === where.id) &&
          (where.deletedAt !== null || r.deletedAt === null),
      );
      return Promise.resolve(row ? this.attachRelations(row) : null);
    },
    create: ({
      data,
    }: {
      data: Omit<BookingRow, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> & {
        recurrenceId?: string | null;
        recurrenceIndex?: number | null;
        createdByAdmin?: boolean;
      };
    }): Promise<unknown> => {
      // EXCLUDE 제약 시뮬레이션 — 동일 회의실 + 활성(deletedAt=null) + 시간 겹침 [start, end).
      const conflict = this.bookings.find(
        (r) =>
          r.deletedAt === null &&
          r.roomId === data.roomId &&
          r.startAt.getTime() < data.endAt.getTime() &&
          r.endAt.getTime() > data.startAt.getTime(),
      );
      if (conflict) {
        const err = new Prisma.PrismaClientKnownRequestError(
          'exclusion violation: excl_booking_no_overlap',
          { code: 'P2010', clientVersion: 'test', meta: { code: '23P01' } },
        );
        return Promise.reject(err);
      }

      const row: BookingRow = {
        id: randomUUID(),
        roomId: data.roomId,
        userId: data.userId,
        title: data.title,
        description: data.description ?? null,
        startAt: data.startAt,
        endAt: data.endAt,
        recurrenceId: data.recurrenceId ?? null,
        recurrenceIndex: data.recurrenceIndex ?? null,
        createdByAdmin: data.createdByAdmin ?? false,
        exceptionRequestId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      this.bookings.push(row);
      return Promise.resolve(this.attachRelations(row));
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<BookingRow>;
    }): Promise<unknown> => {
      const row = this.bookings.find((r) => r.id === where.id);
      if (!row) {
        return Promise.reject(new Error(`booking not found: ${where.id}`));
      }
      Object.assign(row, data, { updatedAt: new Date() });
      return Promise.resolve(this.attachRelations(row));
    },
  };

  $connect(): Promise<void> {
    return Promise.resolve();
  }
  $disconnect(): Promise<void> {
    return Promise.resolve();
  }
  $queryRaw(): Promise<unknown[]> {
    return Promise.resolve([]);
  }

  private attachRelations(row: BookingRow): unknown {
    const room = this.rooms.find((r) => r.id === row.roomId);
    const user = this.users.find((u) => u.id === row.userId);
    return {
      ...row,
      room: room ? { id: room.id, name: room.name } : null,
      user: user ? { id: user.id, name: user.name, department: user.department } : null,
    };
  }

  reset(): void {
    this.users = [];
    this.rooms = [];
    this.bookings = [];
  }
}

describe('Booking (e2e)', () => {
  let app: INestApplication;
  let prisma: InMemoryPrisma;
  let jwt: JwtService;

  const BASE = '/api/v1';

  beforeAll(async () => {
    prisma = new InMemoryPrisma();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(MailService)
      .useValue({ send: () => Promise.resolve() })
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

    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  function makeUser(overrides: Partial<UserRow> = {}): UserRow {
    const now = new Date();
    return {
      id: randomUUID(),
      email: `${randomUUID()}@example.com`,
      passwordHash: 'hash',
      name: '홍길동',
      department: '개발팀',
      employeeNo: null,
      phone: null,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      lockedUntil: null,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  function makeRoom(overrides: Partial<RoomRow> = {}): RoomRow {
    const now = new Date();
    return {
      id: randomUUID(),
      name: '회의실 A',
      capacity: 8,
      location: '본관 3층',
      description: null,
      isActive: true,
      displayOrder: 0,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  function tokenFor(user: UserRow): string {
    return jwt.sign({ sub: user.id, email: user.email, role: user.role });
  }

  /** 시스템 시각 +N분 위치한 15분 경계 시각을 ISO 문자열로 반환. */
  function futureSlot(minutesAhead: number): Date {
    const ms = Date.now() + minutesAhead * 60_000;
    // 15분 경계로 올림.
    const aligned = Math.ceil(ms / (15 * 60_000)) * (15 * 60_000);
    return new Date(aligned);
  }

  beforeEach(() => {
    prisma.reset();
  });

  // ---------------------------------------------------------------------------
  // 정상 케이스
  // ---------------------------------------------------------------------------

  describe('정상 케이스', () => {
    it('POST /bookings → 201 + DTO 반환, 이어서 GET /bookings 캘린더에 노출', async () => {
      const user = makeUser();
      const room = makeRoom();
      prisma.users.push(user);
      prisma.rooms.push(room);
      const token = tokenFor(user);

      const start = futureSlot(60); // 현재 +1시간 부근의 15분 경계.
      const end = new Date(start.getTime() + 60 * 60_000); // +1시간.

      const createRes = await request(app.getHttpServer())
        .post(`${BASE}/bookings`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          roomId: room.id,
          title: '스프린트 리뷰',
          startAt: start.toISOString(),
          endAt: end.toISOString(),
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data).toMatchObject({
        title: '스프린트 리뷰',
        room: { id: room.id, name: room.name },
        user: { id: user.id, name: user.name },
        isMine: true,
        createdByAdmin: false,
      });
      expect(createRes.body.data.startAt).toBe(start.toISOString());
      expect(createRes.body.data.endAt).toBe(end.toISOString());

      const listRes = await request(app.getHttpServer())
        .get(`${BASE}/bookings`)
        .query({
          from: new Date(start.getTime() - 60 * 60_000).toISOString(),
          to: new Date(end.getTime() + 60 * 60_000).toISOString(),
        })
        .set('Authorization', `Bearer ${token}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data).toHaveLength(1);
      expect(listRes.body.data[0].id).toBe(createRes.body.data.id);
    });

    it('GET /bookings/:id → 단건 조회', async () => {
      const user = makeUser();
      const room = makeRoom();
      prisma.users.push(user);
      prisma.rooms.push(room);
      const token = tokenFor(user);
      const start = futureSlot(60);

      const createRes = await request(app.getHttpServer())
        .post(`${BASE}/bookings`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          roomId: room.id,
          title: '테스트',
          startAt: start.toISOString(),
          endAt: new Date(start.getTime() + 30 * 60_000).toISOString(),
        });
      const bookingId = createRes.body.data.id as string;

      const res = await request(app.getHttpServer())
        .get(`${BASE}/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(bookingId);
    });

    it('PATCH /bookings/:id 본인 예약 → 200 + 변경 적용', async () => {
      const user = makeUser();
      const room = makeRoom();
      prisma.users.push(user);
      prisma.rooms.push(room);
      const token = tokenFor(user);
      const start = futureSlot(60);

      const createRes = await request(app.getHttpServer())
        .post(`${BASE}/bookings`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          roomId: room.id,
          title: '원래 제목',
          startAt: start.toISOString(),
          endAt: new Date(start.getTime() + 30 * 60_000).toISOString(),
        });
      const bookingId = createRes.body.data.id as string;

      const res = await request(app.getHttpServer())
        .patch(`${BASE}/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '바뀐 제목' });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('바뀐 제목');
    });

    it('DELETE /bookings/:id → 204 + 이후 조회 시 404', async () => {
      const user = makeUser();
      const room = makeRoom();
      prisma.users.push(user);
      prisma.rooms.push(room);
      const token = tokenFor(user);
      const start = futureSlot(60);

      const createRes = await request(app.getHttpServer())
        .post(`${BASE}/bookings`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          roomId: room.id,
          title: '삭제 대상',
          startAt: start.toISOString(),
          endAt: new Date(start.getTime() + 30 * 60_000).toISOString(),
        });
      const bookingId = createRes.body.data.id as string;

      const delRes = await request(app.getHttpServer())
        .delete(`${BASE}/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(delRes.status).toBe(204);

      // 메모리상 deletedAt이 설정되었는지.
      const stored = prisma.bookings.find((b) => b.id === bookingId);
      expect(stored?.deletedAt).toBeInstanceOf(Date);

      const getRes = await request(app.getHttpServer())
        .get(`${BASE}/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(getRes.status).toBe(404);
      expect(getRes.body.error.code).toBe('BOOKING_NOT_FOUND');
    });
  });

  // ---------------------------------------------------------------------------
  // 충돌 케이스 — DB EXCLUDE 시뮬레이션 → BOOKING_TIME_CONFLICT
  // ---------------------------------------------------------------------------

  describe('충돌 케이스', () => {
    it('동일 회의실 + 시간 겹침 → 409 BOOKING_TIME_CONFLICT', async () => {
      const userA = makeUser();
      const userB = makeUser({ email: 'b@example.com' });
      const room = makeRoom();
      prisma.users.push(userA, userB);
      prisma.rooms.push(room);
      const tokenA = tokenFor(userA);
      const tokenB = tokenFor(userB);

      const start = futureSlot(60);
      const end = new Date(start.getTime() + 60 * 60_000);

      // 첫 예약 생성.
      const first = await request(app.getHttpServer())
        .post(`${BASE}/bookings`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          roomId: room.id,
          title: '먼저 잡힌 회의',
          startAt: start.toISOString(),
          endAt: end.toISOString(),
        });
      expect(first.status).toBe(201);

      // 30분 겹치는 두 번째 예약.
      const overlapStart = new Date(start.getTime() + 30 * 60_000);
      const overlapEnd = new Date(end.getTime() + 30 * 60_000);
      const second = await request(app.getHttpServer())
        .post(`${BASE}/bookings`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          roomId: room.id,
          title: '겹치는 회의',
          startAt: overlapStart.toISOString(),
          endAt: overlapEnd.toISOString(),
        });

      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('BOOKING_TIME_CONFLICT');
    });

    it('인접한 시간([)는 겹치지 않음) → 둘 다 생성 성공', async () => {
      const user = makeUser();
      const room = makeRoom();
      prisma.users.push(user);
      prisma.rooms.push(room);
      const token = tokenFor(user);

      const a = futureSlot(60);
      const b = new Date(a.getTime() + 60 * 60_000);
      const c = new Date(b.getTime() + 60 * 60_000);

      const first = await request(app.getHttpServer())
        .post(`${BASE}/bookings`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          roomId: room.id,
          title: '첫 회의',
          startAt: a.toISOString(),
          endAt: b.toISOString(),
        });
      expect(first.status).toBe(201);

      const second = await request(app.getHttpServer())
        .post(`${BASE}/bookings`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          roomId: room.id,
          title: '바로 이어지는 회의',
          startAt: b.toISOString(),
          endAt: c.toISOString(),
        });
      expect(second.status).toBe(201);
    });

    it('소프트 삭제된 예약은 충돌 검증에서 제외 → 같은 시간대로 새 예약 가능', async () => {
      const user = makeUser();
      const room = makeRoom();
      prisma.users.push(user);
      prisma.rooms.push(room);
      const token = tokenFor(user);

      const start = futureSlot(60);
      const end = new Date(start.getTime() + 60 * 60_000);

      const first = await request(app.getHttpServer())
        .post(`${BASE}/bookings`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          roomId: room.id,
          title: '취소될 회의',
          startAt: start.toISOString(),
          endAt: end.toISOString(),
        });
      const bookingId = first.body.data.id as string;

      await request(app.getHttpServer())
        .delete(`${BASE}/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const second = await request(app.getHttpServer())
        .post(`${BASE}/bookings`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          roomId: room.id,
          title: '재예약',
          startAt: start.toISOString(),
          endAt: end.toISOString(),
        });
      expect(second.status).toBe(201);
    });
  });

  // ---------------------------------------------------------------------------
  // 권한 / 검증 (e2e 레벨)
  // ---------------------------------------------------------------------------

  describe('권한 / 검증', () => {
    it('인증 없이 → 401', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/bookings`)
        .query({ from: new Date().toISOString(), to: new Date().toISOString() });
      expect(res.status).toBe(401);
    });

    it('로컬 DB 미연결 → ROOM_NOT_FOUND가 아닌 ROOM_INACTIVE 비활성 회의실 시 409', async () => {
      const user = makeUser();
      const room = makeRoom({ isActive: false });
      prisma.users.push(user);
      prisma.rooms.push(room);
      const token = tokenFor(user);
      const start = futureSlot(60);

      const res = await request(app.getHttpServer())
        .post(`${BASE}/bookings`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          roomId: room.id,
          title: '비활성 회의실',
          startAt: start.toISOString(),
          endAt: new Date(start.getTime() + 30 * 60_000).toISOString(),
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ROOM_INACTIVE');
    });

    it('타인 예약을 USER가 PATCH → 403 BOOKING_OWNERSHIP_REQUIRED', async () => {
      const owner = makeUser();
      const intruder = makeUser({ email: 'intruder@example.com' });
      const room = makeRoom();
      prisma.users.push(owner, intruder);
      prisma.rooms.push(room);

      const start = futureSlot(60);
      const created = await request(app.getHttpServer())
        .post(`${BASE}/bookings`)
        .set('Authorization', `Bearer ${tokenFor(owner)}`)
        .send({
          roomId: room.id,
          title: '내 예약',
          startAt: start.toISOString(),
          endAt: new Date(start.getTime() + 30 * 60_000).toISOString(),
        });

      const res = await request(app.getHttpServer())
        .patch(`${BASE}/bookings/${created.body.data.id}`)
        .set('Authorization', `Bearer ${tokenFor(intruder)}`)
        .send({ title: '탈취' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('BOOKING_OWNERSHIP_REQUIRED');
    });

    it('GET /bookings 범위 31일 초과 → 400 TIME_RANGE_TOO_LARGE', async () => {
      const user = makeUser();
      prisma.users.push(user);
      const token = tokenFor(user);

      const res = await request(app.getHttpServer())
        .get(`${BASE}/bookings`)
        .query({
          from: '2026-04-01T00:00:00.000Z',
          to: '2026-05-15T00:00:00.000Z',
        })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('TIME_RANGE_TOO_LARGE');
    });

    it('15분 단위가 아닌 startAt → 400 BOOKING_TIME_NOT_QUARTER', async () => {
      const user = makeUser();
      const room = makeRoom();
      prisma.users.push(user);
      prisma.rooms.push(room);
      const token = tokenFor(user);

      const start = futureSlot(60);
      const offset = new Date(start.getTime() + 7 * 60_000); // 7분 어긋남.

      const res = await request(app.getHttpServer())
        .post(`${BASE}/bookings`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          roomId: room.id,
          title: '15분 안 맞음',
          startAt: offset.toISOString(),
          endAt: new Date(offset.getTime() + 30 * 60_000).toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BOOKING_TIME_NOT_QUARTER');
    });
  });
});
