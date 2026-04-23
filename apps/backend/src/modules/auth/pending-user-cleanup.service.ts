import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UserStatus } from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * PRD AUTH-009 — 24시간 이상 미인증 PENDING 계정을 자동 삭제한다.
 * EmailVerification 등 종속 레코드는 User FK의 ON DELETE CASCADE로 함께 정리된다.
 */
@Injectable()
export class PendingUserCleanupService {
  private static readonly PENDING_TTL_HOURS = 24;
  private readonly logger = new Logger(PendingUserCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'pending-user-cleanup' })
  async handleCron(): Promise<void> {
    const removed = await this.purgeExpiredPendingUsers(new Date());
    if (removed > 0) {
      this.logger.log(`미인증 계정 ${removed}건 자동 삭제`);
    }
  }

  /** 테스트에서 직접 호출할 수 있도록 public으로 노출. */
  async purgeExpiredPendingUsers(now: Date): Promise<number> {
    const threshold = new Date(
      now.getTime() - PendingUserCleanupService.PENDING_TTL_HOURS * 60 * 60 * 1000,
    );
    const result = await this.prisma.user.deleteMany({
      where: { status: UserStatus.PENDING, createdAt: { lt: threshold } },
    });
    return result.count;
  }
}
