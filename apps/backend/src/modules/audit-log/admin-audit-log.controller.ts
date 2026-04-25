import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { AuditLogService, type PaginatedAuditLogs } from './audit-log.service';
import { ListAuditLogsQuery } from './dto/list-audit-logs.query';

/**
 * 관리자 전용 감사 로그 조회. docs/03-api-spec.md §8.
 * 컨트롤러 단위 RolesGuard + @Roles(ADMIN) 으로 USER 노출 차단.
 */
@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminAuditLogController {
  constructor(private readonly service: AuditLogService) {}

  @Get()
  list(@Query() query: ListAuditLogsQuery): Promise<PaginatedAuditLogs> {
    return this.service.list(query);
  }
}
