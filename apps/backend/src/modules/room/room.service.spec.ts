import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Prisma, UserRole, type Room } from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

import { RoomService } from './room.service';

const ACTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const buildRoom = (overrides: Partial<Room> = {}): Room => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: '회의실 A',
  capacity: 8,
  location: '본관 3층',
  description: null,
  isActive: true,
  displayOrder: 0,
  createdAt: new Date('2026-04-23T00:00:00Z'),
  updatedAt: new Date('2026-04-23T00:00:00Z'),
  ...overrides,
});

describe('RoomService', () => {
  let service: RoomService;
  let roomFindMany: jest.Mock;
  let roomFindUnique: jest.Mock;
  let roomCount: jest.Mock;
  let roomCreate: jest.Mock;
  let roomUpdate: jest.Mock;
  let roomDelete: jest.Mock;
  let bookingCount: jest.Mock;
  let auditLogRecord: jest.Mock;

  beforeEach(async () => {
    roomFindMany = jest.fn();
    roomFindUnique = jest.fn();
    roomCount = jest.fn();
    roomCreate = jest.fn();
    roomUpdate = jest.fn();
    roomDelete = jest.fn();
    bookingCount = jest.fn();
    auditLogRecord = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomService,
        {
          provide: PrismaService,
          useValue: {
            room: {
              findMany: roomFindMany,
              findUnique: roomFindUnique,
              count: roomCount,
              create: roomCreate,
              update: roomUpdate,
              delete: roomDelete,
            },
            booking: { count: bookingCount },
          },
        },
        { provide: AuditLogService, useValue: { record: auditLogRecord } },
      ],
    }).compile();

    service = module.get(RoomService);
  });

  describe('list', () => {
    it('일반 사용자는 isActive=true인 회의실만 조회', async () => {
      roomFindMany.mockResolvedValue([buildRoom()]);

      const result = await service.list({ requesterRole: UserRole.USER });

      expect(roomFindMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      });
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('회의실 A');
    });

    it('일반 사용자가 includeInactive=true 보내도 무시되어 활성만 반환', async () => {
      roomFindMany.mockResolvedValue([]);

      await service.list({ requesterRole: UserRole.USER, includeInactive: true });

      expect(roomFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    it('ADMIN + includeInactive=true이면 비활성 포함 전체 반환', async () => {
      roomFindMany.mockResolvedValue([
        buildRoom(),
        buildRoom({
          id: '22222222-2222-4222-8222-222222222222',
          isActive: false,
          name: '회의실 B',
        }),
      ]);

      const result = await service.list({
        requesterRole: UserRole.ADMIN,
        includeInactive: true,
      });

      expect(roomFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
      expect(result).toHaveLength(2);
    });

    it('ADMIN이라도 includeInactive 미지정이면 활성만', async () => {
      roomFindMany.mockResolvedValue([]);

      await service.list({ requesterRole: UserRole.ADMIN });

      expect(roomFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    it('Prisma 모델 민감 필드(createdAt 등)는 응답 DTO에 포함되지 않음', async () => {
      roomFindMany.mockResolvedValue([buildRoom()]);

      const result = await service.list({ requesterRole: UserRole.USER });

      expect(result[0]).not.toHaveProperty('createdAt');
      expect(result[0]).not.toHaveProperty('updatedAt');
    });
  });

  describe('findById', () => {
    it('존재하는 id면 RoomDto 반환', async () => {
      roomFindUnique.mockResolvedValue(buildRoom());

      const result = await service.findById('11111111-1111-4111-8111-111111111111');

      expect(result.name).toBe('회의실 A');
      expect(roomFindUnique).toHaveBeenCalledWith({
        where: { id: '11111111-1111-4111-8111-111111111111' },
      });
    });

    it('없으면 ROOM_NOT_FOUND NotFoundException', async () => {
      roomFindUnique.mockResolvedValue(null);

      await expect(service.findById('11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({
        constructor: NotFoundException,
        response: expect.objectContaining({ code: 'ROOM_NOT_FOUND' }),
      });
    });
  });

  describe('create', () => {
    it('정상 생성 — RoomDto 반환', async () => {
      roomCount.mockResolvedValue(3);
      roomCreate.mockResolvedValue(buildRoom({ name: '회의실 신규' }));

      const result = await service.create({ name: '회의실 신규', capacity: 10 }, ACTOR_ID);

      expect(roomCreate).toHaveBeenCalledWith({
        data: {
          name: '회의실 신규',
          capacity: 10,
          location: undefined,
          description: undefined,
          displayOrder: 0,
        },
      });
      expect(result.name).toBe('회의실 신규');
      expect(auditLogRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ROOM_CREATED',
          targetType: 'ROOM',
          actorId: ACTOR_ID,
        }),
      );
    });

    it('이미 10개 등록되어 있으면 ROOM_LIMIT_EXCEEDED', async () => {
      roomCount.mockResolvedValue(10);

      await expect(service.create({ name: '11번째' }, ACTOR_ID)).rejects.toMatchObject({
        constructor: ConflictException,
        response: expect.objectContaining({ code: 'ROOM_LIMIT_EXCEEDED' }),
      });
      expect(roomCreate).not.toHaveBeenCalled();
      expect(auditLogRecord).not.toHaveBeenCalled();
    });

    it('이름이 중복(P2002)이면 ROOM_NAME_DUPLICATE', async () => {
      roomCount.mockResolvedValue(2);
      roomCreate.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique violation', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['name'] },
        }),
      );

      await expect(service.create({ name: '회의실 A' }, ACTOR_ID)).rejects.toMatchObject({
        constructor: ConflictException,
        response: expect.objectContaining({ code: 'ROOM_NAME_DUPLICATE' }),
      });
      expect(auditLogRecord).not.toHaveBeenCalled();
    });

    it('displayOrder 미지정이면 0으로 저장', async () => {
      roomCount.mockResolvedValue(0);
      roomCreate.mockResolvedValue(buildRoom());

      await service.create({ name: '회의실 X' }, ACTOR_ID);

      expect(roomCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ displayOrder: 0 }) }),
      );
    });
  });

  describe('update', () => {
    it('존재하는 id에 부분 업데이트 적용', async () => {
      roomFindUnique.mockResolvedValue(buildRoom());
      roomUpdate.mockResolvedValue(buildRoom({ name: '변경됨', isActive: false }));

      const result = await service.update(
        '11111111-1111-4111-8111-111111111111',
        {
          name: '변경됨',
          isActive: false,
        },
        ACTOR_ID,
      );

      expect(roomUpdate).toHaveBeenCalledWith({
        where: { id: '11111111-1111-4111-8111-111111111111' },
        data: { name: '변경됨', isActive: false },
      });
      expect(result.name).toBe('변경됨');
      expect(result.isActive).toBe(false);
      // 변경된 필드만 changes 에 — 변경되지 않은 필드는 노이즈로 들어가지 않는다.
      expect(auditLogRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ROOM_UPDATED',
          targetType: 'ROOM',
          actorId: ACTOR_ID,
          payload: expect.objectContaining({
            changes: expect.objectContaining({
              name: { before: '회의실 A', after: '변경됨' },
              isActive: { before: true, after: false },
            }),
          }),
        }),
      );
    });

    it('없으면 ROOM_NOT_FOUND', async () => {
      roomFindUnique.mockResolvedValue(null);

      await expect(
        service.update('11111111-1111-4111-8111-111111111111', { name: '변경됨' }, ACTOR_ID),
      ).rejects.toMatchObject({
        constructor: NotFoundException,
        response: expect.objectContaining({ code: 'ROOM_NOT_FOUND' }),
      });
      expect(roomUpdate).not.toHaveBeenCalled();
      expect(auditLogRecord).not.toHaveBeenCalled();
    });

    it('이름 중복 시 ROOM_NAME_DUPLICATE', async () => {
      roomFindUnique.mockResolvedValue(buildRoom());
      roomUpdate.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique violation', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['name'] },
        }),
      );

      await expect(
        service.update('11111111-1111-4111-8111-111111111111', { name: '중복' }, ACTOR_ID),
      ).rejects.toMatchObject({
        constructor: ConflictException,
        response: expect.objectContaining({ code: 'ROOM_NAME_DUPLICATE' }),
      });
    });
  });

  describe('remove', () => {
    it('미래 예약이 없으면 정상 삭제', async () => {
      roomFindUnique.mockResolvedValue(buildRoom());
      bookingCount.mockResolvedValue(0);
      roomDelete.mockResolvedValue(buildRoom());

      await service.remove('11111111-1111-4111-8111-111111111111', ACTOR_ID);

      expect(bookingCount).toHaveBeenCalledWith({
        where: {
          roomId: '11111111-1111-4111-8111-111111111111',
          deletedAt: null,
          endAt: { gt: expect.any(Date) },
        },
      });
      expect(roomDelete).toHaveBeenCalledWith({
        where: { id: '11111111-1111-4111-8111-111111111111' },
      });
      expect(auditLogRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ROOM_DELETED',
          targetType: 'ROOM',
          actorId: ACTOR_ID,
          payload: expect.objectContaining({ name: '회의실 A' }),
        }),
      );
    });

    it('미래 예약이 있으면 ROOM_HAS_FUTURE_BOOKINGS', async () => {
      roomFindUnique.mockResolvedValue(buildRoom());
      bookingCount.mockResolvedValue(2);

      await expect(
        service.remove('11111111-1111-4111-8111-111111111111', ACTOR_ID),
      ).rejects.toMatchObject({
        constructor: ConflictException,
        response: expect.objectContaining({ code: 'ROOM_HAS_FUTURE_BOOKINGS' }),
      });
      expect(roomDelete).not.toHaveBeenCalled();
      expect(auditLogRecord).not.toHaveBeenCalled();
    });

    it('없는 회의실이면 ROOM_NOT_FOUND', async () => {
      roomFindUnique.mockResolvedValue(null);

      await expect(
        service.remove('11111111-1111-4111-8111-111111111111', ACTOR_ID),
      ).rejects.toMatchObject({
        constructor: NotFoundException,
        response: expect.objectContaining({ code: 'ROOM_NOT_FOUND' }),
      });
      expect(bookingCount).not.toHaveBeenCalled();
      expect(roomDelete).not.toHaveBeenCalled();
    });
  });
});
