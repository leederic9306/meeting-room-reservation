import { Test, type TestingModule } from '@nestjs/testing';
import { ExceptionRequestStatus, Prisma, UserRole } from '@prisma/client';

import { MailService } from '../../infra/mail/mail.service';
import { PrismaService } from '../../infra/prisma/prisma.service';

import type { CreateAdminBookingDto } from './dto/create-admin-booking.dto';
import type { CreateExceptionRequestDto } from './dto/create-exception-request.dto';
import { ExceptionRequestService } from './exception-request.service';

const ROOM_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ADMIN_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const REQUEST_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const FIXED_NOW = new Date('2026-04-25T03:00:00.000Z');
// 5시간(>4시간) 미래 — 예외 신청 의미 있음.
const LONG_FUTURE_START = new Date('2026-04-26T05:00:00.000Z');
const LONG_FUTURE_END = new Date('2026-04-26T10:00:00.000Z');

const userActor = { id: USER_ID, role: UserRole.USER };
const adminActor = { id: ADMIN_ID, role: UserRole.ADMIN };

const buildRequestRow = (
  overrides: {
    id?: string;
    user_id?: string;
    room_id?: string;
    title?: string;
    description?: string | null;
    start_at?: Date;
    end_at?: Date;
    status?: ExceptionRequestStatus;
  } = {},
): {
  id: string;
  user_id: string;
  room_id: string;
  title: string;
  description: string | null;
  start_at: Date;
  end_at: Date;
  status: ExceptionRequestStatus;
} => ({
  id: REQUEST_ID,
  user_id: USER_ID,
  room_id: ROOM_ID,
  title: '워크샵',
  description: '외부 컨설팅 종일 워크샵',
  start_at: LONG_FUTURE_START,
  end_at: LONG_FUTURE_END,
  status: ExceptionRequestStatus.PENDING,
  ...overrides,
});

const buildRequestWithRelations = (
  overrides: Partial<{
    status: ExceptionRequestStatus;
    reviewerId: string | null;
    reviewComment: string | null;
    reviewedAt: Date | null;
    booking: { id: string } | null;
  }> = {},
): unknown => ({
  id: REQUEST_ID,
  userId: USER_ID,
  roomId: ROOM_ID,
  title: '워크샵',
  reason: '외부 컨설팅 종일 워크샵',
  startAt: LONG_FUTURE_START,
  endAt: LONG_FUTURE_END,
  status: overrides.status ?? ExceptionRequestStatus.PENDING,
  reviewerId: overrides.reviewerId ?? null,
  reviewComment: overrides.reviewComment ?? null,
  reviewedAt: overrides.reviewedAt ?? null,
  createdAt: FIXED_NOW,
  updatedAt: FIXED_NOW,
  user: { id: USER_ID, name: '홍길동', department: '개발팀', email: 'hong@example.com' },
  room: { id: ROOM_ID, name: '회의실 A' },
  reviewer: null,
  booking: overrides.booking ?? null,
});

describe('ExceptionRequestService', () => {
  let service: ExceptionRequestService;
  let prisma: {
    exceptionRequest: {
      create: jest.Mock;
      update: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    booking: {
      findMany: jest.Mock;
      create: jest.Mock;
    };
    room: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
    auditLog: { create: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let mail: { send: jest.Mock };

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    prisma = {
      exceptionRequest: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      booking: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      room: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      auditLog: { create: jest.fn() },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(),
    };

    // 트랜잭션은 동일 mock prisma 로 즉시 실행 (배열 형태는 입력을 그대로 resolve).
    prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return Array.isArray(arg) ? Promise.all(arg) : arg;
    });

    mail = { send: jest.fn().mockResolvedValue(undefined) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ExceptionRequestService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
      ],
    }).compile();

    service = moduleRef.get(ExceptionRequestService);
  });

  // ---------------------------------------------------------------------------
  // create — EXCEPTION_NOT_REQUIRED
  // ---------------------------------------------------------------------------

  describe('create', () => {
    const baseDto: CreateExceptionRequestDto = {
      roomId: ROOM_ID,
      title: '워크샵',
      reason: '외부 컨설팅 종일 워크샵 진행 (5시간 필요)',
      startAt: LONG_FUTURE_START.toISOString(),
      endAt: LONG_FUTURE_END.toISOString(),
    };

    beforeEach(() => {
      prisma.room.findUnique.mockResolvedValue({ id: ROOM_ID, isActive: true });
      prisma.exceptionRequest.create.mockResolvedValue(buildRequestWithRelations());
    });

    it('4시간 이내 미래 → EXCEPTION_NOT_REQUIRED', async () => {
      const dto: CreateExceptionRequestDto = {
        ...baseDto,
        startAt: '2026-04-26T05:00:00.000Z',
        endAt: '2026-04-26T07:00:00.000Z',
      };
      await expect(service.create(dto, userActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'EXCEPTION_NOT_REQUIRED' }),
      });
      expect(prisma.exceptionRequest.create).not.toHaveBeenCalled();
    });

    it('4시간 초과 미래 → 신청 생성', async () => {
      const result = await service.create(baseDto, userActor);
      expect(result.id).toBe(REQUEST_ID);
      expect(result.status).toBe(ExceptionRequestStatus.PENDING);
      expect(prisma.exceptionRequest.create).toHaveBeenCalledTimes(1);
    });

    it('과거 시점 (4시간 이내라도) → 신청 생성', async () => {
      // 회고 등록 — 신청 의미 있음.
      const dto: CreateExceptionRequestDto = {
        ...baseDto,
        startAt: '2026-04-24T05:00:00.000Z',
        endAt: '2026-04-24T06:00:00.000Z',
      };
      await service.create(dto, userActor);
      expect(prisma.exceptionRequest.create).toHaveBeenCalledTimes(1);
    });

    it('15분 단위 아님 → BOOKING_TIME_NOT_QUARTER', async () => {
      const dto: CreateExceptionRequestDto = {
        ...baseDto,
        startAt: '2026-04-26T05:07:00.000Z',
      };
      await expect(service.create(dto, userActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_TIME_NOT_QUARTER' }),
      });
    });

    it('회의실 비활성 → ROOM_INACTIVE', async () => {
      prisma.room.findUnique.mockResolvedValue({ id: ROOM_ID, isActive: false });
      await expect(service.create(baseDto, userActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ROOM_INACTIVE' }),
      });
    });

    it('충돌 정보는 conflicts 배열로 응답에 포함 (참고용 — 신청은 통과)', async () => {
      prisma.booking.findMany.mockResolvedValue([
        {
          id: 'booking-1',
          title: '기존 예약',
          startAt: LONG_FUTURE_START,
          endAt: LONG_FUTURE_END,
        },
      ]);
      const result = await service.create(baseDto, userActor);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toMatchObject({ bookingId: 'booking-1' });
    });
  });

  // ---------------------------------------------------------------------------
  // cancel
  // ---------------------------------------------------------------------------

  describe('cancel', () => {
    it('PENDING + 본인 → CANCELLED', async () => {
      prisma.exceptionRequest.findUnique.mockResolvedValue({
        id: REQUEST_ID,
        userId: USER_ID,
        status: ExceptionRequestStatus.PENDING,
      });
      prisma.exceptionRequest.update.mockResolvedValue(
        buildRequestWithRelations({ status: ExceptionRequestStatus.CANCELLED }),
      );
      const result = await service.cancel(REQUEST_ID, userActor);
      expect(result.status).toBe(ExceptionRequestStatus.CANCELLED);
    });

    it('타인 신청 → EXCEPTION_REQUEST_OWNERSHIP_REQUIRED', async () => {
      prisma.exceptionRequest.findUnique.mockResolvedValue({
        id: REQUEST_ID,
        userId: OTHER_USER_ID,
        status: ExceptionRequestStatus.PENDING,
      });
      await expect(service.cancel(REQUEST_ID, userActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'EXCEPTION_REQUEST_OWNERSHIP_REQUIRED' }),
      });
    });

    it('이미 처리된 신청 → INVALID_STATUS_TRANSITION', async () => {
      prisma.exceptionRequest.findUnique.mockResolvedValue({
        id: REQUEST_ID,
        userId: USER_ID,
        status: ExceptionRequestStatus.APPROVED,
      });
      await expect(service.cancel(REQUEST_ID, userActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_STATUS_TRANSITION' }),
      });
    });

    it('존재하지 않음 → EXCEPTION_REQUEST_NOT_FOUND', async () => {
      prisma.exceptionRequest.findUnique.mockResolvedValue(null);
      await expect(service.cancel(REQUEST_ID, userActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'EXCEPTION_REQUEST_NOT_FOUND' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // approve
  // ---------------------------------------------------------------------------

  describe('approve', () => {
    beforeEach(() => {
      prisma.$queryRaw.mockResolvedValue([buildRequestRow()]);
      prisma.booking.findMany.mockResolvedValue([]);
      prisma.booking.create.mockResolvedValue({
        id: 'booking-new',
        userId: USER_ID,
      });
      prisma.exceptionRequest.update.mockResolvedValue(
        buildRequestWithRelations({
          status: ExceptionRequestStatus.APPROVED,
          reviewerId: ADMIN_ID,
          reviewedAt: FIXED_NOW,
          booking: { id: 'booking-new' },
        }),
      );
      prisma.auditLog.create.mockResolvedValue({});
    });

    it('정상 흐름 — Booking 생성 + AuditLog + 메일 발송', async () => {
      const result = await service.approve(REQUEST_ID, adminActor);
      expect(result.bookingId).toBe('booking-new');
      expect(result.status).toBe(ExceptionRequestStatus.APPROVED);

      // FOR UPDATE 로 잠근 후 충돌 재검증, Booking 생성, 상태 전이, AuditLog 순.
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.booking.findMany).toHaveBeenCalled();
      expect(prisma.booking.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            createdByAdmin: true,
            exceptionRequestId: REQUEST_ID,
          }),
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'EXCEPTION_APPROVED',
            targetType: 'EXCEPTION_REQUEST',
            targetId: REQUEST_ID,
          }),
        }),
      );

      // 메일은 fire-and-forget — 마이크로태스크 처리 후 검증.
      await Promise.resolve();
      await Promise.resolve();
      expect(mail.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'hong@example.com',
          subject: expect.stringContaining('승인'),
        }),
      );
    });

    it('이미 처리된 신청 → INVALID_STATUS_TRANSITION (Booking INSERT 미발생)', async () => {
      prisma.$queryRaw.mockResolvedValue([
        buildRequestRow({ status: ExceptionRequestStatus.REJECTED }),
      ]);
      await expect(service.approve(REQUEST_ID, adminActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_STATUS_TRANSITION' }),
      });
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('충돌 재검증 시 다른 예약 존재 → BOOKING_TIME_CONFLICT', async () => {
      prisma.booking.findMany.mockResolvedValue([
        {
          id: 'conflict-1',
          title: '신규 충돌 예약',
          startAt: LONG_FUTURE_START,
          endAt: LONG_FUTURE_END,
        },
      ]);
      await expect(service.approve(REQUEST_ID, adminActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_TIME_CONFLICT' }),
      });
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('Booking INSERT 시 EXCLUDE 위반(23P01) → BOOKING_TIME_CONFLICT', async () => {
      const excludeError = new Prisma.PrismaClientKnownRequestError('exclude conflict', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { code: '23P01' },
      });
      prisma.booking.create.mockRejectedValue(excludeError);
      await expect(service.approve(REQUEST_ID, adminActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_TIME_CONFLICT' }),
      });
    });

    it('존재하지 않음 → EXCEPTION_REQUEST_NOT_FOUND', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      await expect(service.approve(REQUEST_ID, adminActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'EXCEPTION_REQUEST_NOT_FOUND' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // reject
  // ---------------------------------------------------------------------------

  describe('reject', () => {
    beforeEach(() => {
      prisma.$queryRaw.mockResolvedValue([
        { id: REQUEST_ID, user_id: USER_ID, status: ExceptionRequestStatus.PENDING },
      ]);
      prisma.exceptionRequest.update.mockResolvedValue(
        buildRequestWithRelations({
          status: ExceptionRequestStatus.REJECTED,
          reviewerId: ADMIN_ID,
          reviewComment: '사유 부족',
          reviewedAt: FIXED_NOW,
        }),
      );
      prisma.auditLog.create.mockResolvedValue({});
    });

    it('정상 흐름 — 상태 전이 + AuditLog + 반려 메일', async () => {
      const result = await service.reject(REQUEST_ID, '사유가 부족합니다.', adminActor);
      expect(result.status).toBe(ExceptionRequestStatus.REJECTED);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'EXCEPTION_REJECTED',
            targetType: 'EXCEPTION_REQUEST',
          }),
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
      expect(mail.send).toHaveBeenCalledWith(
        expect.objectContaining({ subject: expect.stringContaining('반려') }),
      );
    });

    it('빈 reviewComment → REVIEW_COMMENT_REQUIRED (FOR UPDATE 호출 전 차단)', async () => {
      await expect(service.reject(REQUEST_ID, '   ', adminActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'REVIEW_COMMENT_REQUIRED' }),
      });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('이미 처리된 신청 → INVALID_STATUS_TRANSITION', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { id: REQUEST_ID, user_id: USER_ID, status: ExceptionRequestStatus.APPROVED },
      ]);
      await expect(service.reject(REQUEST_ID, '사유', adminActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_STATUS_TRANSITION' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // createAdminBooking
  // ---------------------------------------------------------------------------

  describe('createAdminBooking', () => {
    const baseDto: CreateAdminBookingDto = {
      userId: USER_ID,
      roomId: ROOM_ID,
      title: '관리자 직접 예약',
      startAt: LONG_FUTURE_START.toISOString(),
      endAt: LONG_FUTURE_END.toISOString(),
    };

    beforeEach(() => {
      prisma.room.findUnique.mockResolvedValue({ id: ROOM_ID, isActive: true });
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID, status: 'ACTIVE' });
      prisma.booking.create.mockResolvedValue({
        id: 'booking-admin',
        userId: USER_ID,
      });
      prisma.auditLog.create.mockResolvedValue({});
    });

    it('정상 흐름 — Booking 생성 + AuditLog (4시간 초과/과거 우회 허용)', async () => {
      const result = await service.createAdminBooking(baseDto, adminActor);
      expect(result.id).toBe('booking-admin');
      expect(result.createdByAdmin).toBe(true);
      expect(prisma.booking.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ createdByAdmin: true, userId: USER_ID }),
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'BOOKING_CREATED_BY_ADMIN',
            targetType: 'BOOKING',
            targetId: 'booking-admin',
          }),
        }),
      );
    });

    it('과거 시점 허용', async () => {
      await service.createAdminBooking(
        {
          ...baseDto,
          startAt: '2026-04-24T05:00:00.000Z',
          endAt: '2026-04-24T06:00:00.000Z',
        },
        adminActor,
      );
      expect(prisma.booking.create).toHaveBeenCalled();
    });

    it('15분 단위는 그대로 강제 — BOOKING_TIME_NOT_QUARTER', async () => {
      await expect(
        service.createAdminBooking(
          {
            ...baseDto,
            startAt: '2026-04-26T05:07:00.000Z',
          },
          adminActor,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_TIME_NOT_QUARTER' }),
      });
    });

    it('대상 사용자가 없으면 USER_NOT_FOUND', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.createAdminBooking(baseDto, adminActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'USER_NOT_FOUND' }),
      });
    });

    it('비활성 사용자에는 예약 불가 — USER_NOT_ACTIVE', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID, status: 'LOCKED' });
      await expect(service.createAdminBooking(baseDto, adminActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'USER_NOT_ACTIVE' }),
      });
    });

    it('Booking EXCLUDE 위반 → BOOKING_TIME_CONFLICT', async () => {
      const excludeError = new Prisma.PrismaClientKnownRequestError('exclude', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { code: '23P01' },
      });
      prisma.booking.create.mockRejectedValue(excludeError);
      await expect(service.createAdminBooking(baseDto, adminActor)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BOOKING_TIME_CONFLICT' }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // listMine 강제 userId 자기 자신
  // ---------------------------------------------------------------------------

  describe('listMine', () => {
    beforeEach(() => {
      prisma.exceptionRequest.findMany.mockResolvedValue([buildRequestWithRelations()]);
      prisma.exceptionRequest.count.mockResolvedValue(1);
    });

    it('쿼리 userId 가 다른 값이어도 actor.id 로 강제 필터링', async () => {
      await service.listMine(userActor, { userId: OTHER_USER_ID });
      const findManyArgs = prisma.exceptionRequest.findMany.mock.calls[0]?.[0] as {
        where: { userId: string };
      };
      expect(findManyArgs.where.userId).toBe(USER_ID);
    });
  });
});
