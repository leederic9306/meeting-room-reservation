import { Test, type TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../infra/prisma/prisma.service';

import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  let prismaPing: jest.Mock;

  beforeEach(async () => {
    prismaPing = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: { $queryRaw: prismaPing } },
      ],
    }).compile();

    service = module.get(HealthService);
  });

  it('DB 핑 성공 시 status=ok, services.database=ok', async () => {
    prismaPing.mockResolvedValue([{ '?column?': 1 }]);

    const result = await service.check();

    expect(result.status).toBe('ok');
    expect(result.services.database).toBe('ok');
    expect(typeof result.uptime).toBe('number');
    expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('DB 핑 실패 시 status=degraded, services.database=error', async () => {
    prismaPing.mockRejectedValue(new Error('connection refused'));

    const result = await service.check();

    expect(result.status).toBe('degraded');
    expect(result.services.database).toBe('error');
  });
});
