import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';

import { type AuditLogDto, type AuditLogWithRelations, toAuditLogDto } from './dto/audit-log.dto';
import type { ListAuditLogsQuery } from './dto/list-audit-logs.query';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const AUDIT_LOG_RELATIONS = {
  actor: { select: { id: true, name: true, email: true } },
} as const;

export interface PaginatedAuditLogs {
  data: AuditLogDto[];
  meta: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

/**
 * AuditLog write/read 의 단일 진입점.
 *
 * write 측 책임:
 *  - prisma.auditLog.create 직접 호출을 한 곳으로 모아 컬럼 누락/오타를 방지
 *  - 트랜잭션 클라이언트(`tx`) 가 주어지면 동일 트랜잭션 내에서 INSERT 하도록 위임
 *    (상태 전이와 감사 기록의 원자성이 필요한 경우 — 승인/반려/직접 예약 등)
 *  - write 실패가 비즈니스 흐름을 막으면 안 되는 경로는 호출자가 try/catch + 로그
 *
 * read 측 책임:
 *  - GET /admin/audit-logs 페이지네이션 + 필터 (action/targetType/actorId/from/to)
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 감사 로그 작성. tx 가 주어지면 트랜잭션 내에서, 아니면 일반 prisma client 로 INSERT.
   *
   * - actorId 가 null 이면 시스템 액션(스케줄러, cleanup 등) 으로 기록
   * - payload 는 컬럼 타입이 JsonB — Prisma 의 InputJsonValue 로 받는다
   */
  async record(
    params: {
      action: string;
      targetType: string;
      targetId?: string | null;
      actorId?: string | null;
      payload?: Prisma.InputJsonValue;
      ipAddress?: string;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        actorId: params.actorId ?? undefined,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId ?? undefined,
        payload: params.payload,
        ipAddress: params.ipAddress,
      },
    });
  }

  /**
   * fire-and-forget 변형 — 호출자가 await 하지 않고 흐름을 진행해야 할 때 사용.
   * 실패해도 비즈니스 응답에 영향이 없으며, Logger 로 흔적을 남긴다.
   */
  recordAsync(params: {
    action: string;
    targetType: string;
    targetId?: string | null;
    actorId?: string | null;
    payload?: Prisma.InputJsonValue;
    ipAddress?: string;
  }): void {
    void this.record(params).catch((error) => {
      this.logger.error(
        `감사 로그 기록 실패: action=${params.action} targetId=${params.targetId ?? 'null'}`,
        error instanceof Error ? error.stack : error,
      );
    });
  }

  // ---------------------------------------------------------------------------
  // 조회 — GET /admin/audit-logs
  // ---------------------------------------------------------------------------

  async list(query: ListAuditLogsQuery): Promise<PaginatedAuditLogs> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const createdAtFilter: Prisma.DateTimeFilter = {};
    if (query.from !== undefined) createdAtFilter.gte = new Date(query.from);
    if (query.to !== undefined) createdAtFilter.lt = new Date(query.to);

    const where: Prisma.AuditLogWhereInput = {
      ...(query.action !== undefined && { action: query.action }),
      ...(query.targetType !== undefined && { targetType: query.targetType }),
      ...(query.actorId !== undefined && { actorId: query.actorId }),
      ...((query.from !== undefined || query.to !== undefined) && { createdAt: createdAtFilter }),
    };

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: AUDIT_LOG_RELATIONS,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: items.map((it) => toAuditLogDto(it as AuditLogWithRelations)),
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / limit)),
      },
    };
  }
}
