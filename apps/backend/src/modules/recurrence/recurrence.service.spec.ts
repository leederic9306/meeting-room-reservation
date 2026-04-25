import { Test, type TestingModule } from '@nestjs/testing';
import {
  Prisma,
  UserRole,
  type Booking,
  type RecurrenceException,
  type RecurrenceRule,
  type Room,
  type User,
} from '@prisma/client';
import { fromZonedTime } from 'date-fns-tz';

import { PrismaService } from '../../infra/prisma/prisma.service';

import { RecurrenceService, type CreateRecurrenceInput } from './recurrence.service';

const KST = 'Asia/Seoul';
const ROOM_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RECURRENCE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const FIXED_NOW = new Date('2026-04-25T03:00:00.000Z'); // 2026-04-25 12:00 KST 토

// 미래 dtstart (월요일 09:00 KST = 00:00Z)
const DTSTART_KST_WALL = '2026-04-27T09:00:00';
const DTSTART_UTC = fromZonedTime(DTSTART_KST_WALL, KST);

const userActor = { id: USER_ID, role: UserRole.USER };
const adminActor = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', role: UserRole.ADMIN };

const buildRoom = (overrides: Partial<Room> = {}): Room => ({
  id: ROOM_ID,
  name: '회의실 A',
  capacity: 8,
  location: '본관 3층',
  description: null,
  isActive: true,
  displayOrder: 0,
  createdAt: FIXED_NOW,
  updatedAt: FIXED_NOW,
  ...overrides,
});

const buildRecurrence = (overrides: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  id: RECURRENCE_ID,
  roomId: ROOM_ID,
  userId: USER_ID,
  title: '주간 동기화',
  description: null,
  rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
  durationMinutes: 60,
  startAt: DTSTART_UTC,
  untilAt: new Date(DTSTART_UTC.getTime() + 3 * 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
  createdAt: FIXED_NOW,
  updatedAt: FIXED_NOW,
  ...overrides,
});

const buildBaseInput = (overrides: Partial<CreateRecurrenceInput> = {}): CreateRecurrenceInput => ({
  roomId: ROOM_ID,
  title: '주간 동기화',
  dtstart: DTSTART_UTC,
  durationMinutes: 60,
  rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
  ...overrides,
});

const excludeError = new Prisma.PrismaClientKnownRequestError('exclude violation', {
  code: 'P2010',
  clientVersion: 'test',
  meta: { code: '23P01' },
});

interface MockPrisma {
  recurrenceRule: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  recurrenceException: {
    create: jest.Mock;
  };
  booking: {
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    findFirst: jest.Mock;
  };
  room: { findUnique: jest.Mock };
  $transaction: jest.Mock;
}

describe('RecurrenceService', () => {
  let service: RecurrenceService;
  let prisma: MockPrisma;

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    prisma = {
      recurrenceRule: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      recurrenceException: { create: jest.fn() },
      booking: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
      },
      room: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };

    // $transaction이 callback 형태로 호출되면 콜백을 동일 mock prisma로 실행.
    // 배열 형태(이번 모듈에서는 deletion만 사용)는 입력을 그대로 resolve.
    prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: MockPrisma) => Promise<unknown>)(prisma);
      }
      return Array.isArray(arg) ? Promise.all(arg) : arg;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [RecurrenceService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(RecurrenceService);
  });

  // ---------------------------------------------------------------------------
  // create — 입력 검증
  // ---------------------------------------------------------------------------

  describe('create — 입력 검증', () => {
    it('15분 단위가 아닌 durationMinutes → BOOKING_TIME_NOT_QUARTER', async () => {
      await expect(
        service.create(buildBaseInput({ durationMinutes: 17 }), userActor),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_TIME_NOT_QUARTER' }),
      });
    });

    it('durationMinutes 240 초과 → BOOKING_DURATION_EXCEEDED', async () => {
      await expect(
        service.create(buildBaseInput({ durationMinutes: 255 }), userActor),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_DURATION_EXCEEDED' }),
      });
    });

    it('15분 단위 아닌 dtstart → BOOKING_TIME_NOT_QUARTER', async () => {
      const dtstart = fromZonedTime('2026-04-27T09:07:00', KST);
      await expect(service.create(buildBaseInput({ dtstart }), userActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_TIME_NOT_QUARTER' }),
      });
    });

    it('비활성 회의실 → ROOM_INACTIVE', async () => {
      prisma.room.findUnique.mockResolvedValue(buildRoom({ isActive: false }));
      await expect(service.create(buildBaseInput(), userActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ROOM_INACTIVE' }),
      });
    });

    it('존재하지 않는 회의실 → ROOM_NOT_FOUND', async () => {
      prisma.room.findUnique.mockResolvedValue(null);
      await expect(service.create(buildBaseInput(), userActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ROOM_NOT_FOUND' }),
      });
    });

    it('잘못된 RRULE → INVALID_RRULE', async () => {
      prisma.room.findUnique.mockResolvedValue(buildRoom());
      await expect(
        service.create(buildBaseInput({ rrule: 'NOT_AN_RRULE' }), userActor),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_RRULE' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // create — 정상 흐름
  // ---------------------------------------------------------------------------

  describe('create — 정상', () => {
    beforeEach(() => {
      prisma.room.findUnique.mockResolvedValue(buildRoom());
      prisma.recurrenceRule.create.mockResolvedValue(buildRecurrence());
      prisma.booking.create.mockImplementation(({ data }: { data: Booking }) =>
        Promise.resolve({ ...data, id: 'booking-x' }),
      );
    });

    it('주 1회 4회 펼침 → 4 회차 INSERT, skipped 없음', async () => {
      const result = await service.create(buildBaseInput(), userActor);
      expect(result.recurrenceId).toBe(RECURRENCE_ID);
      expect(result.createdBookings).toBe(4);
      expect(result.skippedBookings).toEqual([]);
      expect(prisma.booking.create).toHaveBeenCalledTimes(4);

      // 각 INSERT가 recurrenceId/index를 적절히 설정하는지
      const indices = prisma.booking.create.mock.calls.map(
        (c) => (c[0] as { data: { recurrenceIndex: number } }).data.recurrenceIndex,
      );
      expect(indices).toEqual([0, 1, 2, 3]);
    });

    it('untilAt = 마지막 회차의 endAt', async () => {
      await service.create(buildBaseInput(), userActor);
      const arg = prisma.recurrenceRule.create.mock.calls[0]?.[0] as {
        data: { untilAt: Date; startAt: Date };
      };
      // 4번째 회차 = dtstart + 3주, end = + 1시간
      const expectedUntil = new Date(
        DTSTART_UTC.getTime() + 3 * 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000,
      );
      expect(arg.data.untilAt.toISOString()).toBe(expectedUntil.toISOString());
    });
  });

  // ---------------------------------------------------------------------------
  // create — 23P01 catch (회차별)
  // ---------------------------------------------------------------------------

  describe('create — SQLSTATE 23P01 catch', () => {
    beforeEach(() => {
      prisma.room.findUnique.mockResolvedValue(buildRoom());
      prisma.recurrenceRule.create.mockResolvedValue(buildRecurrence());
    });

    it('일부 회차만 충돌 → 충돌은 skipped, 나머지는 INSERT 성공', async () => {
      // 0,1,2,3 중 인덱스 1만 충돌. 나머지는 정상 INSERT.
      let callIdx = 0;
      prisma.booking.create.mockImplementation(({ data }: { data: Booking }) => {
        const i = callIdx++;
        if (i === 1) {
          return Promise.reject(excludeError);
        }
        return Promise.resolve({ ...data, id: `booking-${i}` });
      });

      const result = await service.create(buildBaseInput(), userActor);
      expect(result.createdBookings).toBe(3);
      expect(result.skippedBookings).toHaveLength(1);
      expect(result.skippedBookings[0]).toMatchObject({
        index: 1,
        reason: 'TIME_CONFLICT',
      });
      // skipped도 KST 일자 형식이 들어갔는지
      expect(result.skippedBookings[0]!.instanceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('PrismaClientUnknownRequestError + 메시지에 제약명 포함도 23P01로 매핑', async () => {
      const unknownErr = new Prisma.PrismaClientUnknownRequestError(
        'duplicate key violates exclusion constraint "excl_booking_no_overlap"',
        { clientVersion: 'test' },
      );
      let callIdx = 0;
      prisma.booking.create.mockImplementation(({ data }: { data: Booking }) => {
        const i = callIdx++;
        if (i === 0) return Promise.reject(unknownErr);
        return Promise.resolve({ ...data, id: `booking-${i}` });
      });

      const result = await service.create(buildBaseInput(), userActor);
      expect(result.skippedBookings.map((s) => s.index)).toEqual([0]);
      expect(result.createdBookings).toBe(3);
    });

    it('모든 회차가 충돌 → ALL_INSTANCES_FAILED + RecurrenceRule rollback (delete)', async () => {
      prisma.booking.create.mockRejectedValue(excludeError);
      await expect(service.create(buildBaseInput(), userActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ALL_INSTANCES_FAILED' }),
      });
      expect(prisma.recurrenceRule.delete).toHaveBeenCalledWith({
        where: { id: RECURRENCE_ID },
      });
    });

    it('23P01이 아닌 에러는 그대로 전파 + RecurrenceRule rollback', async () => {
      const boom = new Error('connection lost');
      prisma.booking.create.mockRejectedValue(boom);
      await expect(service.create(buildBaseInput(), userActor)).rejects.toBe(boom);
      expect(prisma.recurrenceRule.delete).toHaveBeenCalledWith({
        where: { id: RECURRENCE_ID },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // create — 과거 회차 skip
  // ---------------------------------------------------------------------------

  describe('create — 과거 회차 skip', () => {
    beforeEach(() => {
      prisma.room.findUnique.mockResolvedValue(buildRoom());
      prisma.booking.create.mockImplementation(({ data }: { data: Booking }) =>
        Promise.resolve({ ...data, id: 'booking-x' }),
      );
    });

    it('일부 회차가 과거 → 과거는 skipped(PAST_INSTANCE), 미래는 INSERT', async () => {
      // dtstart = 2026-04-20 09:00 KST (FIXED_NOW=04-25 03:00Z 이전). COUNT=4 매주 월요일.
      // 첫 2 회차(04-20, 04-27)는… 04-20은 과거, 04-27 09:00 KST는 04-27 00:00Z = NOW(04-25 03Z) 이후 → 미래.
      const dtstart = fromZonedTime('2026-04-20T09:00:00', KST);
      prisma.recurrenceRule.create.mockResolvedValue(
        buildRecurrence({
          startAt: dtstart,
          rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
        }),
      );

      const result = await service.create(
        buildBaseInput({ dtstart, rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4' }),
        userActor,
      );
      expect(result.createdBookings).toBe(3);
      expect(result.skippedBookings).toHaveLength(1);
      expect(result.skippedBookings[0]).toMatchObject({
        index: 0,
        reason: 'PAST_INSTANCE',
      });
    });

    it('모든 회차가 과거 → ALL_INSTANCES_FAILED (RecurrenceRule도 만들지 않음)', async () => {
      // 시작 1년 전, COUNT=2 → 둘 다 과거
      const dtstart = fromZonedTime('2025-04-21T09:00:00', KST);
      await expect(
        service.create(
          buildBaseInput({ dtstart, rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=2' }),
          userActor,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ALL_INSTANCES_FAILED' }),
      });
      expect(prisma.recurrenceRule.create).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // findById / update / remove
  // ---------------------------------------------------------------------------

  describe('findById', () => {
    const buildFullRule = (
      overrides: Partial<RecurrenceRule> = {},
    ): RecurrenceRule & {
      room: Pick<Room, 'id' | 'name'>;
      user: Pick<User, 'id' | 'name' | 'department'>;
      exceptions: RecurrenceException[];
      bookings: Pick<Booking, 'id' | 'startAt' | 'endAt'>[];
    } => ({
      ...buildRecurrence(overrides),
      room: { id: ROOM_ID, name: '회의실 A' },
      user: { id: USER_ID, name: '홍길동', department: '개발팀' },
      exceptions: [],
      bookings: [],
    });

    it('없는 시리즈 → RECURRENCE_NOT_FOUND', async () => {
      prisma.recurrenceRule.findUnique.mockResolvedValue(null);
      await expect(service.findById(RECURRENCE_ID, userActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'RECURRENCE_NOT_FOUND' }),
      });
    });

    it('타인 시리즈를 USER가 조회 → RECURRENCE_OWNERSHIP_REQUIRED', async () => {
      prisma.recurrenceRule.findUnique.mockResolvedValue(buildFullRule({ userId: OTHER_USER_ID }));
      await expect(service.findById(RECURRENCE_ID, userActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'RECURRENCE_OWNERSHIP_REQUIRED' }),
      });
    });

    it('ADMIN은 타인 시리즈 조회 가능', async () => {
      prisma.recurrenceRule.findUnique.mockResolvedValue(buildFullRule({ userId: OTHER_USER_ID }));
      const result = await service.findById(RECURRENCE_ID, adminActor);
      expect(result.id).toBe(RECURRENCE_ID);
    });

    it('인스턴스 isPast 분류 — endAt이 NOW 이전이면 true', async () => {
      const pastBooking = {
        id: 'past',
        startAt: new Date('2026-04-20T00:00:00.000Z'),
        endAt: new Date('2026-04-20T01:00:00.000Z'),
      };
      const futureBooking = {
        id: 'future',
        startAt: new Date('2026-04-27T00:00:00.000Z'),
        endAt: new Date('2026-04-27T01:00:00.000Z'),
      };
      const full = buildFullRule();
      full.bookings = [pastBooking, futureBooking];
      prisma.recurrenceRule.findUnique.mockResolvedValue(full);

      const result = await service.findById(RECURRENCE_ID, userActor);
      const past = result.instances.find((i) => i.id === 'past')!;
      const future = result.instances.find((i) => i.id === 'future')!;
      expect(past.isPast).toBe(true);
      expect(future.isPast).toBe(false);
    });
  });

  describe('update', () => {
    it('타인 시리즈 USER 수정 → RECURRENCE_OWNERSHIP_REQUIRED', async () => {
      prisma.recurrenceRule.findUnique.mockResolvedValue({
        id: RECURRENCE_ID,
        userId: OTHER_USER_ID,
      });
      await expect(
        service.update(RECURRENCE_ID, { title: '바꾸기' }, userActor),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'RECURRENCE_OWNERSHIP_REQUIRED' }),
      });
    });

    it('title/description 둘 다 미지정 → 변경 없이 현재 상태 반환', async () => {
      // findUnique는 권한 체크용 select 호출 + findById용 include 호출 두 번 사용.
      prisma.recurrenceRule.findUnique
        .mockResolvedValueOnce({ id: RECURRENCE_ID, userId: USER_ID })
        .mockResolvedValueOnce({
          ...buildRecurrence(),
          room: { id: ROOM_ID, name: '회의실 A' },
          user: { id: USER_ID, name: '홍길동', department: null },
          exceptions: [],
          bookings: [],
        });

      const result = await service.update(RECURRENCE_ID, {}, userActor);
      expect(prisma.recurrenceRule.update).not.toHaveBeenCalled();
      expect(result.id).toBe(RECURRENCE_ID);
    });

    it('title만 지정 → title만 update', async () => {
      prisma.recurrenceRule.findUnique.mockResolvedValueOnce({
        id: RECURRENCE_ID,
        userId: USER_ID,
      });
      prisma.recurrenceRule.update.mockResolvedValue({
        ...buildRecurrence({ title: '새 제목' }),
        room: { id: ROOM_ID, name: '회의실 A' },
        user: { id: USER_ID, name: '홍길동', department: null },
        exceptions: [],
        bookings: [],
      });

      const result = await service.update(RECURRENCE_ID, { title: '새 제목' }, userActor);
      expect(result.title).toBe('새 제목');
      const arg = prisma.recurrenceRule.update.mock.calls[0]?.[0] as {
        data: { title?: string; description?: string };
      };
      expect(arg.data).toEqual({ title: '새 제목' });
    });
  });

  describe('remove', () => {
    beforeEach(() => {
      prisma.recurrenceRule.findUnique.mockResolvedValue({
        id: RECURRENCE_ID,
        userId: USER_ID,
        startAt: DTSTART_UTC,
      });
    });

    it('from 미지정 → 미래 회차 소프트 삭제 + RecurrenceRule hard delete', async () => {
      await service.remove(RECURRENCE_ID, undefined, userActor);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const txArg = prisma.$transaction.mock.calls[0]?.[0] as unknown[];
      expect(Array.isArray(txArg)).toBe(true);
      expect(txArg).toHaveLength(2);
    });

    it('from 지정 → 그 시점 이후만 소프트 삭제 + untilAt 갱신', async () => {
      const from = new Date('2026-05-15T00:00:00.000Z');
      await service.remove(RECURRENCE_ID, from, userActor);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('타인 시리즈 USER 삭제 → RECURRENCE_OWNERSHIP_REQUIRED', async () => {
      prisma.recurrenceRule.findUnique.mockResolvedValue({
        id: RECURRENCE_ID,
        userId: OTHER_USER_ID,
        startAt: DTSTART_UTC,
      });
      await expect(service.remove(RECURRENCE_ID, undefined, userActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'RECURRENCE_OWNERSHIP_REQUIRED' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // addException
  // ---------------------------------------------------------------------------

  describe('addException', () => {
    beforeEach(() => {
      prisma.recurrenceRule.findUnique.mockResolvedValue({
        id: RECURRENCE_ID,
        userId: USER_ID,
        durationMinutes: 60,
      });
    });

    it('매칭 Booking 존재 → 소프트 삭제 + RecurrenceException 생성', async () => {
      const matchingBookingId = 'match-booking-id';
      prisma.booking.findFirst.mockResolvedValue({ id: matchingBookingId });
      prisma.recurrenceException.create.mockImplementation(
        ({ data }: { data: { excludedDate: Date; reason?: string } }) =>
          Promise.resolve({
            id: 'exc-1',
            recurrenceId: RECURRENCE_ID,
            excludedDate: data.excludedDate,
            reason: data.reason ?? null,
            createdAt: FIXED_NOW,
          }),
      );
      prisma.booking.update.mockResolvedValue({});

      const result = await service.addException(
        RECURRENCE_ID,
        { excludedDate: '2026-05-25', reason: '공휴일' },
        userActor,
      );
      expect(result.excludedDate).toBe('2026-05-25');
      expect(result.deletedBookingId).toBe(matchingBookingId);

      // booking.findFirst가 KST 일자 경계로 검색했는지 확인.
      const findArg = prisma.booking.findFirst.mock.calls[0]?.[0] as {
        where: {
          recurrenceId: string;
          startAt: { gte: Date; lt: Date };
        };
      };
      expect(findArg.where.recurrenceId).toBe(RECURRENCE_ID);
      expect(findArg.where.startAt.gte.toISOString()).toBe('2026-05-24T15:00:00.000Z');
      expect(findArg.where.startAt.lt.toISOString()).toBe('2026-05-25T15:00:00.000Z');

      // booking.update가 deletedAt을 세팅했는지
      const updateArg = prisma.booking.update.mock.calls[0]?.[0] as {
        where: { id: string };
        data: { deletedAt: Date };
      };
      expect(updateArg.where.id).toBe(matchingBookingId);
      expect(updateArg.data.deletedAt).toBeInstanceOf(Date);

      // DATE 컬럼 저장값은 KST 라벨을 UTC 자정으로 만든 Date여야 한다 — UTC 캐스팅 후
      // PG가 "2026-05-25"로 저장하도록(라운드트립 시 1일 밀림 방지).
      const createArg = prisma.recurrenceException.create.mock.calls[0]?.[0] as {
        data: { excludedDate: Date };
      };
      expect(createArg.data.excludedDate.toISOString()).toBe('2026-05-25T00:00:00.000Z');
    });

    it('매칭 Booking 없음 → exception만 생성, deletedBookingId=null', async () => {
      prisma.booking.findFirst.mockResolvedValue(null);
      prisma.recurrenceException.create.mockResolvedValue({
        id: 'exc-2',
        recurrenceId: RECURRENCE_ID,
        excludedDate: new Date('2026-05-24T15:00:00.000Z'),
        reason: null,
        createdAt: FIXED_NOW,
      });

      const result = await service.addException(
        RECURRENCE_ID,
        { excludedDate: '2026-05-25' },
        userActor,
      );
      expect(result.deletedBookingId).toBeNull();
      expect(prisma.booking.update).not.toHaveBeenCalled();
    });

    it('이미 등록된 일자 → P2002 → EXCEPTION_ALREADY_EXISTS', async () => {
      prisma.booking.findFirst.mockResolvedValue(null);
      const dupErr = new Prisma.PrismaClientKnownRequestError('unique violation', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['recurrence_id', 'excluded_date'] },
      });
      prisma.recurrenceException.create.mockRejectedValue(dupErr);

      await expect(
        service.addException(RECURRENCE_ID, { excludedDate: '2026-05-25' }, userActor),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'EXCEPTION_ALREADY_EXISTS' }),
      });
    });

    it('타인 시리즈 USER → RECURRENCE_OWNERSHIP_REQUIRED', async () => {
      prisma.recurrenceRule.findUnique.mockResolvedValue({
        id: RECURRENCE_ID,
        userId: OTHER_USER_ID,
        durationMinutes: 60,
      });
      await expect(
        service.addException(RECURRENCE_ID, { excludedDate: '2026-05-25' }, userActor),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'RECURRENCE_OWNERSHIP_REQUIRED' }),
      });
    });

    it('잘못된 날짜 형식 → INVALID_TIME_FORMAT', async () => {
      await expect(
        service.addException(RECURRENCE_ID, { excludedDate: '2026/05/25' }, userActor),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_TIME_FORMAT' }),
      });
    });

    it('EXDATE는 KST 일자 경계로 매칭됨 — 같은 KST 일자의 다른 시간 인스턴스도 같은 일자로 잡힘', async () => {
      // 04-27 KST 09:00 인스턴스(=04-27 00:00Z) — excludedDate=2026-04-27이면 매칭
      prisma.booking.findFirst.mockResolvedValue({ id: 'b1' });
      prisma.recurrenceException.create.mockResolvedValue({
        id: 'exc',
        recurrenceId: RECURRENCE_ID,
        excludedDate: new Date('2026-04-26T15:00:00.000Z'),
        reason: null,
        createdAt: FIXED_NOW,
      });
      prisma.booking.update.mockResolvedValue({});

      await service.addException(RECURRENCE_ID, { excludedDate: '2026-04-27' }, userActor);

      const findArg = prisma.booking.findFirst.mock.calls[0]?.[0] as {
        where: { startAt: { gte: Date; lt: Date } };
      };
      // KST 04-27 = UTC 04-26 15:00 ~ 04-27 15:00
      expect(findArg.where.startAt.gte.toISOString()).toBe('2026-04-26T15:00:00.000Z');
      expect(findArg.where.startAt.lt.toISOString()).toBe('2026-04-27T15:00:00.000Z');
    });
  });
});
