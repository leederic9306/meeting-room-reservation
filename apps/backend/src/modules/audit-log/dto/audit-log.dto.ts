import type { AuditLog, User } from '@prisma/client';

/**
 * AuditLog 응답 DTO. docs/03-api-spec.md §8 (감사 로그).
 *
 * - actor 정보는 actorId가 있는 경우에만 join 결과로 채워진다 (시스템 작업/계정 삭제 후엔 null).
 * - payload 는 액션별로 구조가 다르므로 unknown 으로 노출 — 화면이 액션별 포맷을 처리한다.
 */
export interface AuditLogDto {
  id: string;
  actor: { id: string; name: string; email: string } | null;
  action: string;
  targetType: string;
  targetId: string | null;
  payload: unknown;
  ipAddress: string | null;
  createdAt: string;
}

export type AuditLogWithRelations = AuditLog & {
  actor: Pick<User, 'id' | 'name' | 'email'> | null;
};

export function toAuditLogDto(log: AuditLogWithRelations): AuditLogDto {
  return {
    id: log.id,
    actor: log.actor ? { id: log.actor.id, name: log.actor.name, email: log.actor.email } : null,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    payload: log.payload,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt.toISOString(),
  };
}
