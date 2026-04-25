import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { UserRole, type Room } from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';

import { RoomService } from './room.service';

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
  let findMany: jest.Mock;
  let findUnique: jest.Mock;

  beforeEach(async () => {
    findMany = jest.fn();
    findUnique = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomService,
        {
          provide: PrismaService,
          useValue: { room: { findMany, findUnique } },
        },
      ],
    }).compile();

    service = module.get(RoomService);
  });

  describe('list', () => {
    it('일반 사용자는 isActive=true인 회의실만 조회', async () => {
      findMany.mockResolvedValue([buildRoom()]);

      const result = await service.list({ requesterRole: UserRole.USER });

      expect(findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      });
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('회의실 A');
    });

    it('일반 사용자가 includeInactive=true 보내도 무시되어 활성만 반환', async () => {
      findMany.mockResolvedValue([]);

      await service.list({ requesterRole: UserRole.USER, includeInactive: true });

      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
    });

    it('ADMIN + includeInactive=true이면 비활성 포함 전체 반환', async () => {
      findMany.mockResolvedValue([
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

      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
      expect(result).toHaveLength(2);
    });

    it('ADMIN이라도 includeInactive 미지정이면 활성만', async () => {
      findMany.mockResolvedValue([]);

      await service.list({ requesterRole: UserRole.ADMIN });

      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
    });

    it('Prisma 모델 민감 필드(createdAt 등)는 응답 DTO에 포함되지 않음', async () => {
      findMany.mockResolvedValue([buildRoom()]);

      const result = await service.list({ requesterRole: UserRole.USER });

      expect(result[0]).not.toHaveProperty('createdAt');
      expect(result[0]).not.toHaveProperty('updatedAt');
    });
  });

  describe('findById', () => {
    it('존재하는 id면 RoomDto 반환', async () => {
      findUnique.mockResolvedValue(buildRoom());

      const result = await service.findById('11111111-1111-4111-8111-111111111111');

      expect(result.name).toBe('회의실 A');
      expect(findUnique).toHaveBeenCalledWith({
        where: { id: '11111111-1111-4111-8111-111111111111' },
      });
    });

    it('없으면 ROOM_NOT_FOUND NotFoundException', async () => {
      findUnique.mockResolvedValue(null);

      await expect(service.findById('11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({
        constructor: NotFoundException,
        response: expect.objectContaining({ code: 'ROOM_NOT_FOUND' }),
      });
    });
  });
});
