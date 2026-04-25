import { Test, type TestingModule } from '@nestjs/testing';
import { Prisma, UserRole, type Booking, type Room } from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';

import { BookingService } from './booking.service';
import type { CreateBookingDto } from './dto/create-booking.dto';

const ROOM_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ROOM_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BOOKING_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const FIXED_NOW = new Date('2026-04-25T03:00:00.000Z'); // 시스템 시계 고정.
// 미래 시작 — 15분 단위.
const FUTURE_START = new Date('2026-04-25T05:00:00.000Z');
const FUTURE_END = new Date('2026-04-25T06:00:00.000Z');

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

const buildBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: BOOKING_ID,
  roomId: ROOM_ID,
  userId: USER_ID,
  title: '미팅',
  description: null,
  startAt: FUTURE_START,
  endAt: FUTURE_END,
  recurrenceId: null,
  recurrenceIndex: null,
  createdByAdmin: false,
  exceptionRequestId: null,
  createdAt: FIXED_NOW,
  updatedAt: FIXED_NOW,
  deletedAt: null,
  ...overrides,
});

const buildBookingWithRelations = (
  overrides: Partial<Booking> = {},
): Booking & {
  room: Pick<Room, 'id' | 'name'>;
  user: { id: string; name: string; department: string | null };
} => {
  const base = buildBooking(overrides);
  return {
    ...base,
    room: { id: base.roomId, name: '회의실 A' },
    user: { id: base.userId, name: '홍길동', department: '개발팀' },
  };
};

const baseCreateDto: CreateBookingDto = {
  roomId: ROOM_ID,
  title: '미팅',
  startAt: FUTURE_START.toISOString(),
  endAt: FUTURE_END.toISOString(),
};

const userActor = { id: USER_ID, role: UserRole.USER };
const adminActor = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', role: UserRole.ADMIN };

describe('BookingService', () => {
  let service: BookingService;
  let prisma: {
    booking: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    room: { findUnique: jest.Mock };
  };

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    prisma = {
      booking: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      room: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [BookingService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(BookingService);
  });

  // ---------------------------------------------------------------------------
  // create — 검증 로직 각각
  // ---------------------------------------------------------------------------

  describe('create — 시간 검증', () => {
    beforeEach(() => {
      prisma.room.findUnique.mockResolvedValue(buildRoom());
      prisma.booking.create.mockResolvedValue(buildBookingWithRelations());
    });

    it('15분 단위가 아닌 시작 시간 → BOOKING_TIME_NOT_QUARTER', async () => {
      await expect(
        service.create({ ...baseCreateDto, startAt: '2026-04-25T05:07:00.000Z' }, userActor),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_TIME_NOT_QUARTER' }),
      });
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('15분 단위가 아닌 종료 시간 → BOOKING_TIME_NOT_QUARTER', async () => {
      await expect(
        service.create({ ...baseCreateDto, endAt: '2026-04-25T06:30:30.000Z' }, userActor),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_TIME_NOT_QUARTER' }),
      });
    });

    it('초/밀리초가 0이 아니면 BOOKING_TIME_NOT_QUARTER', async () => {
      await expect(
        service.create({ ...baseCreateDto, startAt: '2026-04-25T05:00:30.000Z' }, userActor),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_TIME_NOT_QUARTER' }),
      });
    });

    it('시작 ≥ 종료 → INVALID_TIME_RANGE', async () => {
      await expect(
        service.create(
          {
            ...baseCreateDto,
            startAt: FUTURE_END.toISOString(),
            endAt: FUTURE_START.toISOString(),
          },
          userActor,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_TIME_RANGE' }),
      });
    });

    it('시작 == 종료 → INVALID_TIME_RANGE', async () => {
      await expect(
        service.create({ ...baseCreateDto, endAt: baseCreateDto.startAt }, userActor),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_TIME_RANGE' }),
      });
    });

    it('시작이 과거 → BOOKING_TIME_PAST', async () => {
      await expect(
        service.create(
          {
            ...baseCreateDto,
            startAt: '2026-04-25T02:00:00.000Z',
            endAt: '2026-04-25T02:30:00.000Z',
          },
          userActor,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_TIME_PAST' }),
      });
    });

    it('시작이 정확히 현재 시각 → BOOKING_TIME_PAST (경계)', async () => {
      await expect(
        service.create(
          {
            ...baseCreateDto,
            startAt: FIXED_NOW.toISOString(),
            endAt: '2026-04-25T03:30:00.000Z',
          },
          userActor,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_TIME_PAST' }),
      });
    });

    it('길이 4시간 초과(4시간 15분) → BOOKING_DURATION_EXCEEDED', async () => {
      await expect(
        service.create(
          {
            ...baseCreateDto,
            startAt: '2026-04-25T05:00:00.000Z',
            endAt: '2026-04-25T09:15:00.000Z',
          },
          userActor,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_DURATION_EXCEEDED' }),
      });
    });

    it('길이 정확히 4시간 → 허용 (경계)', async () => {
      await service.create(
        {
          ...baseCreateDto,
          startAt: '2026-04-25T05:00:00.000Z',
          endAt: '2026-04-25T09:00:00.000Z',
        },
        userActor,
      );
      expect(prisma.booking.create).toHaveBeenCalled();
    });
  });

  describe('create — 회의실 상태', () => {
    it('존재하지 않는 회의실 → ROOM_NOT_FOUND', async () => {
      prisma.room.findUnique.mockResolvedValue(null);
      await expect(service.create(baseCreateDto, userActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ROOM_NOT_FOUND' }),
      });
    });

    it('비활성 회의실 → ROOM_INACTIVE', async () => {
      prisma.room.findUnique.mockResolvedValue(buildRoom({ isActive: false }));
      await expect(service.create(baseCreateDto, userActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ROOM_INACTIVE' }),
      });
    });
  });

  describe('create — EXCLUDE 충돌 매핑', () => {
    beforeEach(() => {
      prisma.room.findUnique.mockResolvedValue(buildRoom());
    });

    it('Prisma 알려진 에러 + meta.code=23P01 → BOOKING_TIME_CONFLICT (409)', async () => {
      const err = new Prisma.PrismaClientKnownRequestError('exclude violation', {
        code: 'P2010',
        clientVersion: 'test',
        meta: { code: '23P01' },
      });
      prisma.booking.create.mockRejectedValue(err);

      await expect(service.create(baseCreateDto, userActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_TIME_CONFLICT' }),
      });
    });

    it('알려지지 않은 에러 + 메시지에 제약명 포함 → BOOKING_TIME_CONFLICT', async () => {
      const err = new Prisma.PrismaClientUnknownRequestError(
        'duplicate key violates exclusion constraint "excl_booking_no_overlap"',
        { clientVersion: 'test' },
      );
      prisma.booking.create.mockRejectedValue(err);

      await expect(service.create(baseCreateDto, userActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_TIME_CONFLICT' }),
      });
    });

    it('관련 없는 에러는 그대로 통과', async () => {
      const err = new Error('boom');
      prisma.booking.create.mockRejectedValue(err);
      await expect(service.create(baseCreateDto, userActor)).rejects.toBe(err);
    });
  });

  describe('create — 정상', () => {
    it('모든 검증 통과 시 BookingDto 반환 + isMine=true', async () => {
      prisma.room.findUnique.mockResolvedValue(buildRoom());
      prisma.booking.create.mockResolvedValue(buildBookingWithRelations());

      const result = await service.create(baseCreateDto, userActor);

      expect(result.id).toBe(BOOKING_ID);
      expect(result.isMine).toBe(true);
      expect(result.startAt).toBe(FUTURE_START.toISOString());
      expect(prisma.booking.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            roomId: ROOM_ID,
            userId: USER_ID,
            createdByAdmin: false,
          }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // update — 권한/시작 이후
  // ---------------------------------------------------------------------------

  describe('update', () => {
    it('타인 예약을 USER가 수정 → BOOKING_OWNERSHIP_REQUIRED (403)', async () => {
      prisma.booking.findFirst.mockResolvedValue(buildBooking({ userId: OTHER_USER_ID }));

      await expect(service.update(BOOKING_ID, { title: '변경' }, userActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_OWNERSHIP_REQUIRED' }),
      });
    });

    it('ADMIN은 타인 예약도 수정 가능', async () => {
      prisma.booking.findFirst.mockResolvedValue(buildBooking({ userId: OTHER_USER_ID }));
      prisma.booking.update.mockResolvedValue(
        buildBookingWithRelations({ userId: OTHER_USER_ID, title: '변경' }),
      );

      const result = await service.update(BOOKING_ID, { title: '변경' }, adminActor);
      expect(result.title).toBe('변경');
    });

    it('이미 시작된 예약을 USER가 수정 → BOOKING_PAST_NOT_EDITABLE (403)', async () => {
      prisma.booking.findFirst.mockResolvedValue(
        buildBooking({
          startAt: new Date('2026-04-25T02:30:00.000Z'),
          endAt: new Date('2026-04-25T03:30:00.000Z'),
        }),
      );

      await expect(service.update(BOOKING_ID, { title: '변경' }, userActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_PAST_NOT_EDITABLE' }),
      });
    });

    it('이미 시작된 예약도 ADMIN은 수정 가능', async () => {
      prisma.booking.findFirst.mockResolvedValue(
        buildBooking({
          startAt: new Date('2026-04-25T02:30:00.000Z'),
          endAt: new Date('2026-04-25T03:30:00.000Z'),
        }),
      );
      prisma.booking.update.mockResolvedValue(buildBookingWithRelations({ title: '변경' }));

      const result = await service.update(BOOKING_ID, { title: '변경' }, adminActor);
      expect(result.title).toBe('변경');
    });

    it('존재하지 않는 예약 → BOOKING_NOT_FOUND', async () => {
      prisma.booking.findFirst.mockResolvedValue(null);
      await expect(service.update(BOOKING_ID, { title: '변경' }, userActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_NOT_FOUND' }),
      });
    });

    it('소프트 삭제된 예약 → BOOKING_NOT_FOUND (findFirst의 deletedAt:null 필터로 차단)', async () => {
      prisma.booking.findFirst.mockResolvedValue(null);
      await expect(service.update(BOOKING_ID, { title: '변경' }, userActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_NOT_FOUND' }),
      });
      expect(prisma.booking.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: BOOKING_ID, deletedAt: null } }),
      );
    });

    it('startAt 변경 시 새 값에 대한 시간 검증을 수행한다', async () => {
      prisma.booking.findFirst.mockResolvedValue(buildBooking());
      await expect(
        service.update(BOOKING_ID, { startAt: '2026-04-25T05:07:00.000Z' }, userActor),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_TIME_NOT_QUARTER' }),
      });
    });

    it('startAt만 변경하면 새 startAt에 대한 미래 검증 수행', async () => {
      prisma.booking.findFirst.mockResolvedValue(buildBooking());
      await expect(
        service.update(
          BOOKING_ID,
          { startAt: '2026-04-25T02:30:00.000Z', endAt: '2026-04-25T02:45:00.000Z' },
          userActor,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_TIME_PAST' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // softDelete
  // ---------------------------------------------------------------------------

  describe('softDelete', () => {
    it('타인 예약 USER 삭제 → BOOKING_OWNERSHIP_REQUIRED', async () => {
      prisma.booking.findFirst.mockResolvedValue(buildBooking({ userId: OTHER_USER_ID }));

      await expect(service.softDelete(BOOKING_ID, userActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_OWNERSHIP_REQUIRED' }),
      });
    });

    it('이미 시작된 예약 USER 삭제 → BOOKING_PAST_NOT_DELETABLE', async () => {
      prisma.booking.findFirst.mockResolvedValue(
        buildBooking({
          startAt: new Date('2026-04-25T02:30:00.000Z'),
          endAt: new Date('2026-04-25T03:30:00.000Z'),
        }),
      );

      await expect(service.softDelete(BOOKING_ID, userActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_PAST_NOT_DELETABLE' }),
      });
    });

    it('정상 삭제 → deletedAt 설정', async () => {
      prisma.booking.findFirst.mockResolvedValue(buildBooking());
      prisma.booking.update.mockResolvedValue(buildBooking({ deletedAt: FIXED_NOW }));

      await service.softDelete(BOOKING_ID, userActor);

      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: BOOKING_ID },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('이미 시작된 예약도 ADMIN은 삭제 가능', async () => {
      prisma.booking.findFirst.mockResolvedValue(
        buildBooking({
          startAt: new Date('2026-04-25T02:30:00.000Z'),
          endAt: new Date('2026-04-25T03:30:00.000Z'),
        }),
      );
      prisma.booking.update.mockResolvedValue(buildBooking({ deletedAt: FIXED_NOW }));

      await service.softDelete(BOOKING_ID, adminActor);

      expect(prisma.booking.update).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // list — 범위 검증
  // ---------------------------------------------------------------------------

  describe('list', () => {
    it('to <= from → INVALID_TIME_RANGE', async () => {
      await expect(
        service.list(
          { from: '2026-04-25T00:00:00.000Z', to: '2026-04-24T00:00:00.000Z' },
          userActor,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_TIME_RANGE' }),
      });
    });

    it('범위 31일 초과 → TIME_RANGE_TOO_LARGE', async () => {
      await expect(
        service.list(
          { from: '2026-04-01T00:00:00.000Z', to: '2026-05-03T00:00:00.000Z' },
          userActor,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'TIME_RANGE_TOO_LARGE' }),
      });
    });

    it('일반 사용자가 다른 userId 지정 → FORBIDDEN', async () => {
      await expect(
        service.list(
          {
            from: '2026-04-25T00:00:00.000Z',
            to: '2026-04-26T00:00:00.000Z',
            userId: OTHER_USER_ID,
          },
          userActor,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'FORBIDDEN' }),
      });
    });

    it('ADMIN은 다른 userId 지정 가능', async () => {
      prisma.booking.findMany.mockResolvedValue([]);

      await service.list(
        {
          from: '2026-04-25T00:00:00.000Z',
          to: '2026-04-26T00:00:00.000Z',
          userId: OTHER_USER_ID,
        },
        adminActor,
      );

      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: OTHER_USER_ID }),
        }),
      );
    });

    it('소프트 삭제된 예약은 결과에서 제외 (deletedAt:null 필터)', async () => {
      prisma.booking.findMany.mockResolvedValue([]);

      await service.list(
        { from: '2026-04-25T00:00:00.000Z', to: '2026-04-26T00:00:00.000Z' },
        userActor,
      );

      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });

    it('roomId 지정 시 where에 포함', async () => {
      prisma.booking.findMany.mockResolvedValue([]);

      await service.list(
        {
          from: '2026-04-25T00:00:00.000Z',
          to: '2026-04-26T00:00:00.000Z',
          roomId: OTHER_ROOM_ID,
        },
        userActor,
      );

      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ roomId: OTHER_ROOM_ID }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // findById
  // ---------------------------------------------------------------------------

  describe('findById', () => {
    it('소프트 삭제된 예약은 BOOKING_NOT_FOUND', async () => {
      prisma.booking.findFirst.mockResolvedValue(null);

      await expect(service.findById(BOOKING_ID, userActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_NOT_FOUND' }),
      });
    });

    it('isMine은 viewerId 기준으로 결정', async () => {
      prisma.booking.findFirst.mockResolvedValue(
        buildBookingWithRelations({ userId: OTHER_USER_ID }),
      );

      const result = await service.findById(BOOKING_ID, userActor);
      expect(result.isMine).toBe(false);
    });
  });
});
