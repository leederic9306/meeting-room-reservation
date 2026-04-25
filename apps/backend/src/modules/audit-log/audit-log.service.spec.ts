import { Test, type TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../infra/prisma/prisma.service';

import { AuditLogService } from './audit-log.service';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let prisma: {
    auditLog: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue(undefined),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest
        .fn()
        .mockImplementation(async (ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : ops)),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [AuditLogService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(AuditLogService);
  });

  describe('record', () => {
    it('기본 prisma client 로 INSERT', async () => {
      await service.record({
        action: 'TEST_ACTION',
        targetType: 'TEST',
        targetId: 't1',
        actorId: 'u1',
        payload: { foo: 'bar' },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'TEST_ACTION',
          targetType: 'TEST',
          targetId: 't1',
          actorId: 'u1',
          payload: { foo: 'bar' },
        }),
      });
    });

    it('tx 가 주어지면 트랜잭션 client 의 create 호출', async () => {
      const txCreate = jest.fn().mockResolvedValue(undefined);
      const tx = { auditLog: { create: txCreate } } as unknown as Parameters<
        AuditLogService['record']
      >[1];
      await service.record({ action: 'TX_ACTION', targetType: 'TEST', actorId: 'u1' }, tx);
      expect(txCreate).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('actorId/targetId null 이면 undefined 로 — 시스템 액션', async () => {
      await service.record({
        action: 'SYSTEM_CLEANUP',
        targetType: 'BOOKING',
        actorId: null,
        targetId: null,
      });
      const arg = prisma.auditLog.create.mock.calls[0]?.[0] as {
        data: { actorId?: string; targetId?: string };
      };
      expect(arg.data.actorId).toBeUndefined();
      expect(arg.data.targetId).toBeUndefined();
    });
  });

  describe('list', () => {
    it('필터 + 페이지네이션 — where 와 skip/take 가 정확히 전달된다', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.list({
        action: 'USER_ROLE_CHANGED',
        targetType: 'USER',
        actorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        from: '2026-04-01T00:00:00Z',
        to: '2026-05-01T00:00:00Z',
        page: 2,
        limit: 50,
      });

      const findManyArgs = prisma.auditLog.findMany.mock.calls[0]?.[0] as {
        where: {
          action: string;
          targetType: string;
          actorId: string;
          createdAt: { gte: Date; lt: Date };
        };
        skip: number;
        take: number;
      };
      expect(findManyArgs.where.action).toBe('USER_ROLE_CHANGED');
      expect(findManyArgs.where.targetType).toBe('USER');
      expect(findManyArgs.where.actorId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      expect(findManyArgs.where.createdAt.gte).toEqual(new Date('2026-04-01T00:00:00Z'));
      expect(findManyArgs.where.createdAt.lt).toEqual(new Date('2026-05-01T00:00:00Z'));
      expect(findManyArgs.skip).toBe(50);
      expect(findManyArgs.take).toBe(50);
    });

    it('limit 미지정 시 기본 20', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);
      await service.list({});
      const args = prisma.auditLog.findMany.mock.calls[0]?.[0] as { take: number };
      expect(args.take).toBe(20);
    });

    it('limit 100 초과는 100으로 클램프', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);
      // class-validator 가 컨트롤러에서 막지만 서비스 단에서도 안전망.
      await service.list({ limit: 9999 as unknown as number });
      const args = prisma.auditLog.findMany.mock.calls[0]?.[0] as { take: number };
      expect(args.take).toBe(100);
    });
  });
});
