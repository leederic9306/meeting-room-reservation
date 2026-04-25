import { Global, Module } from '@nestjs/common';

import { AdminAuditLogController } from './admin-audit-log.controller';
import { AuditLogService } from './audit-log.service';

/**
 * 감사 로그 모듈. @Global 로 선언해 어느 모듈에서나 AuditLogService 를 주입할 수 있게 한다.
 * (User/Room/ExceptionRequest 등 여러 도메인이 일관된 진입점으로 기록)
 */
@Global()
@Module({
  controllers: [AdminAuditLogController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
