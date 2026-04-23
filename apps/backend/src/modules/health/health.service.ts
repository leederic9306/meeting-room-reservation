import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../infra/prisma/prisma.service';

export type ServiceStatus = 'ok' | 'error';

export interface HealthCheckResult {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: number;
  services: {
    database: ServiceStatus;
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthCheckResult> {
    const database = await this.pingDatabase();
    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: { database },
    };
  }

  private async pingDatabase(): Promise<ServiceStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch (error) {
      this.logger.error('DB 헬스체크 실패', error instanceof Error ? error.stack : error);
      return 'error';
    }
  }
}
