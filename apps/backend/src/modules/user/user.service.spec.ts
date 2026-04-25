import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { UserRole, UserStatus, type User } from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

import { UserService } from './user.service';

const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const buildUser = (overrides: Partial<User> = {}): User => ({
  id: '11111111-1111-4111-8111-111111111111',
  email: 'alice@example.com',
  passwordHash: 'hash',
  name: 'Alice',
  department: '개발팀',
  employeeNo: 'E001',
  phone: null,
  role: UserRole.USER,
  status: UserStatus.ACTIVE,
  lockedUntil: null,
  lastLoginAt: null,
  createdAt: new Date('2026-04-23T00:00:00Z'),
  updatedAt: new Date('2026-04-23T00:00:00Z'),
  ...overrides,
});

describe('UserService', () => {
  let service: UserService;
  let userFindMany: jest.Mock;
  let userFindUnique: jest.Mock;
  let userCount: jest.Mock;
  let userUpdate: jest.Mock;
  let prismaTransaction: jest.Mock;
  let auditLogRecord: jest.Mock;

  beforeEach(async () => {
    userFindMany = jest.fn();
    userFindUnique = jest.fn();
    userCount = jest.fn();
    userUpdate = jest.fn();
    auditLogRecord = jest.fn().mockResolvedValue(undefined);
    // $transaction([...]) → 두 인자가 thenable이라 가정, 입력 배열을 그대로 Promise.all 처럼 처리.
    prismaTransaction = jest.fn(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      return ops;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findMany: userFindMany,
              findUnique: userFindUnique,
              count: userCount,
              update: userUpdate,
            },
            $transaction: prismaTransaction,
          },
        },
        { provide: AuditLogService, useValue: { record: auditLogRecord } },
      ],
    }).compile();

    service = module.get(UserService);
  });

  describe('list', () => {
    it('기본값(page=1, limit=20)으로 페이지네이션 + DELETED 제외', async () => {
      userFindMany.mockResolvedValue([buildUser()]);
      userCount.mockResolvedValue(1);

      const result = await service.list({});

      expect(userFindMany).toHaveBeenCalledWith({
        where: { status: { not: UserStatus.DELETED } },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(result.meta).toEqual({ page: 1, limit: 20, totalItems: 1, totalPages: 1 });
      expect(result.data[0]?.email).toBe('alice@example.com');
      // 민감 필드 미노출.
      expect(result.data[0]).not.toHaveProperty('passwordHash');
    });

    it('search는 email/name OR contains insensitive', async () => {
      userFindMany.mockResolvedValue([]);
      userCount.mockResolvedValue(0);

      await service.list({ search: 'ali' });

      expect(userFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { email: { contains: 'ali', mode: 'insensitive' } },
              { name: { contains: 'ali', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('role/status 필터가 그대로 전달되고 status 지정 시 DELETED 자동 제외 해제', async () => {
      userFindMany.mockResolvedValue([]);
      userCount.mockResolvedValue(0);

      await service.list({ role: UserRole.ADMIN, status: UserStatus.DELETED });

      expect(userFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { role: UserRole.ADMIN, status: UserStatus.DELETED },
        }),
      );
    });

    it('limit은 100으로 캡, totalPages는 ceil(total/limit)', async () => {
      userFindMany.mockResolvedValue([]);
      userCount.mockResolvedValue(305);

      const result = await service.list({ page: 2, limit: 500 });

      expect(userFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 100, take: 100 }));
      expect(result.meta).toEqual({ page: 2, limit: 100, totalItems: 305, totalPages: 4 });
    });

    it('빈 결과여도 totalPages는 최소 1', async () => {
      userFindMany.mockResolvedValue([]);
      userCount.mockResolvedValue(0);

      const result = await service.list({});

      expect(result.meta.totalPages).toBe(1);
    });
  });

  describe('findById', () => {
    it('존재하면 AdminUserDto 반환', async () => {
      userFindUnique.mockResolvedValue(buildUser());

      const result = await service.findById('11111111-1111-4111-8111-111111111111');

      expect(result.email).toBe('alice@example.com');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('없으면 USER_NOT_FOUND', async () => {
      userFindUnique.mockResolvedValue(null);

      await expect(service.findById('11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({
        constructor: NotFoundException,
        response: expect.objectContaining({ code: 'USER_NOT_FOUND' }),
      });
    });
  });

  describe('updateRole', () => {
    it('USER → ADMIN 승격은 카운트 검사 없이 통과', async () => {
      userFindUnique.mockResolvedValue(buildUser({ role: UserRole.USER }));
      userUpdate.mockResolvedValue(buildUser({ role: UserRole.ADMIN }));

      const result = await service.updateRole(
        '11111111-1111-4111-8111-111111111111',
        UserRole.ADMIN,
        ADMIN_ID,
      );

      expect(userCount).not.toHaveBeenCalled();
      expect(result.role).toBe(UserRole.ADMIN);
      expect(auditLogRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_ROLE_CHANGED',
          targetType: 'USER',
          actorId: ADMIN_ID,
          payload: expect.objectContaining({ before: 'USER', after: 'ADMIN' }),
        }),
      );
    });

    it('마지막 ACTIVE ADMIN 강등은 LAST_ADMIN_PROTECTION', async () => {
      userFindUnique.mockResolvedValue(
        buildUser({ role: UserRole.ADMIN, status: UserStatus.ACTIVE }),
      );
      userCount.mockResolvedValue(1);

      await expect(
        service.updateRole('11111111-1111-4111-8111-111111111111', UserRole.USER, ADMIN_ID),
      ).rejects.toMatchObject({
        constructor: ConflictException,
        response: expect.objectContaining({ code: 'LAST_ADMIN_PROTECTION' }),
      });
      expect(userUpdate).not.toHaveBeenCalled();
      expect(auditLogRecord).not.toHaveBeenCalled();
    });

    it('ACTIVE ADMIN이 둘 이상이면 강등 허용', async () => {
      userFindUnique.mockResolvedValue(
        buildUser({ role: UserRole.ADMIN, status: UserStatus.ACTIVE }),
      );
      userCount.mockResolvedValue(2);
      userUpdate.mockResolvedValue(buildUser({ role: UserRole.USER }));

      const result = await service.updateRole(
        '11111111-1111-4111-8111-111111111111',
        UserRole.USER,
        ADMIN_ID,
      );

      expect(result.role).toBe(UserRole.USER);
    });

    it('대상이 LOCKED ADMIN이고 다른 ACTIVE ADMIN이 1명 있으면 강등 허용', async () => {
      // LOCKED ADMIN은 ACTIVE 카운트에 포함되지 않으므로, count=1이면 다른 ACTIVE ADMIN이 1명 존재.
      userFindUnique.mockResolvedValue(
        buildUser({ role: UserRole.ADMIN, status: UserStatus.LOCKED }),
      );
      userCount.mockResolvedValue(1);
      userUpdate.mockResolvedValue(buildUser({ role: UserRole.USER }));

      const result = await service.updateRole(
        '11111111-1111-4111-8111-111111111111',
        UserRole.USER,
        ADMIN_ID,
      );

      expect(result.role).toBe(UserRole.USER);
    });

    it('동일 역할 지정은 no-op으로 통과 (DB update 호출 없음, AuditLog 도 미발생)', async () => {
      userFindUnique.mockResolvedValue(buildUser({ role: UserRole.ADMIN }));

      const result = await service.updateRole(
        '11111111-1111-4111-8111-111111111111',
        UserRole.ADMIN,
        ADMIN_ID,
      );

      expect(userCount).not.toHaveBeenCalled();
      expect(userUpdate).not.toHaveBeenCalled();
      expect(auditLogRecord).not.toHaveBeenCalled();
      expect(result.role).toBe(UserRole.ADMIN);
    });

    it('없는 사용자면 USER_NOT_FOUND', async () => {
      userFindUnique.mockResolvedValue(null);

      await expect(
        service.updateRole('11111111-1111-4111-8111-111111111111', UserRole.ADMIN, ADMIN_ID),
      ).rejects.toMatchObject({
        constructor: NotFoundException,
        response: expect.objectContaining({ code: 'USER_NOT_FOUND' }),
      });
    });
  });

  describe('lockUser', () => {
    it('ACTIVE 사용자 → LOCKED 으로 변경 + AuditLog 기록', async () => {
      userFindUnique.mockResolvedValue(buildUser({ status: UserStatus.ACTIVE }));
      userUpdate.mockResolvedValue(buildUser({ status: UserStatus.LOCKED }));

      const result = await service.lockUser(
        '11111111-1111-4111-8111-111111111111',
        ADMIN_ID,
        '권한 남용',
      );

      expect(userUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: UserStatus.LOCKED }),
        }),
      );
      expect(auditLogRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_LOCKED',
          targetType: 'USER',
          actorId: ADMIN_ID,
          payload: expect.objectContaining({ reason: '권한 남용' }),
        }),
      );
      expect(result.status).toBe(UserStatus.LOCKED);
    });

    it('이미 LOCKED 면 USER_ALREADY_LOCKED', async () => {
      userFindUnique.mockResolvedValue(buildUser({ status: UserStatus.LOCKED }));

      await expect(
        service.lockUser('11111111-1111-4111-8111-111111111111', ADMIN_ID),
      ).rejects.toMatchObject({
        constructor: ConflictException,
        response: expect.objectContaining({ code: 'USER_ALREADY_LOCKED' }),
      });
      expect(userUpdate).not.toHaveBeenCalled();
    });

    it('마지막 ACTIVE ADMIN 잠금은 LAST_ADMIN_PROTECTION', async () => {
      userFindUnique.mockResolvedValue(
        buildUser({ role: UserRole.ADMIN, status: UserStatus.ACTIVE }),
      );
      userCount.mockResolvedValue(1);

      await expect(
        service.lockUser('11111111-1111-4111-8111-111111111111', ADMIN_ID),
      ).rejects.toMatchObject({
        constructor: ConflictException,
        response: expect.objectContaining({ code: 'LAST_ADMIN_PROTECTION' }),
      });
    });

    it('없는 사용자면 USER_NOT_FOUND', async () => {
      userFindUnique.mockResolvedValue(null);
      await expect(
        service.lockUser('11111111-1111-4111-8111-111111111111', ADMIN_ID),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'USER_NOT_FOUND' }),
      });
    });
  });

  describe('unlockUser', () => {
    it('LOCKED → ACTIVE 변경 + AuditLog 기록', async () => {
      userFindUnique.mockResolvedValue(buildUser({ status: UserStatus.LOCKED }));
      userUpdate.mockResolvedValue(buildUser({ status: UserStatus.ACTIVE }));

      const result = await service.unlockUser('11111111-1111-4111-8111-111111111111', ADMIN_ID);

      expect(userUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: UserStatus.ACTIVE, lockedUntil: null }),
        }),
      );
      expect(auditLogRecord).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_UNLOCKED', actorId: ADMIN_ID }),
      );
      expect(result.status).toBe(UserStatus.ACTIVE);
    });

    it('LOCKED 가 아니면 USER_NOT_LOCKED', async () => {
      userFindUnique.mockResolvedValue(buildUser({ status: UserStatus.ACTIVE }));
      await expect(
        service.unlockUser('11111111-1111-4111-8111-111111111111', ADMIN_ID),
      ).rejects.toMatchObject({
        constructor: ConflictException,
        response: expect.objectContaining({ code: 'USER_NOT_LOCKED' }),
      });
    });
  });
});
