import { api } from './axios';

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

export interface PaginatedAuditLogs {
  data: AuditLogDto[];
  meta: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface ListAuditLogsParams {
  action?: string;
  targetType?: string;
  actorId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export async function listAdminAuditLogs(
  params: ListAuditLogsParams = {},
): Promise<PaginatedAuditLogs> {
  const cleaned: Record<string, string | number> = {};
  if (params.action) cleaned.action = params.action;
  if (params.targetType) cleaned.targetType = params.targetType;
  if (params.actorId) cleaned.actorId = params.actorId;
  if (params.from) cleaned.from = params.from;
  if (params.to) cleaned.to = params.to;
  if (params.page) cleaned.page = params.page;
  if (params.limit) cleaned.limit = params.limit;
  const res = await api.get<PaginatedAuditLogs>('/admin/audit-logs', { params: cleaned });
  return res.data;
}

/**
 * 화면에 노출되는 액션 코드 목록 — 필터 select 옵션과 라벨에 동시에 사용.
 * 백엔드에서 새 액션이 추가되면 여기에 한 줄 추가하면 된다.
 */
export const AUDIT_ACTIONS = {
  USER_ROLE_CHANGED: '역할 변경',
  USER_LOCKED: '계정 잠금',
  USER_UNLOCKED: '계정 잠금 해제',
  EXCEPTION_APPROVED: '예외 신청 승인',
  EXCEPTION_REJECTED: '예외 신청 반려',
  BOOKING_BY_ADMIN: '관리자 직접 예약',
  ROOM_CREATED: '회의실 생성',
  ROOM_UPDATED: '회의실 수정',
  ROOM_DELETED: '회의실 삭제',
  // auth.service 가 기록하는 액션도 같은 화면에서 조회 가능하도록 노출.
  LOGIN_SUCCESS: '로그인 성공',
  LOGIN_FAILED: '로그인 실패',
  ACCOUNT_LOCKED: '자동 잠금 (실패 누적)',
  LOGOUT: '로그아웃',
  PASSWORD_CHANGED: '비밀번호 변경',
  PASSWORD_RESET: '비밀번호 재설정',
} as const;

export type KnownAuditAction = keyof typeof AUDIT_ACTIONS;

export const AUDIT_TARGET_TYPES = {
  USER: '사용자',
  ROOM: '회의실',
  BOOKING: '예약',
  EXCEPTION_REQUEST: '예외 신청',
} as const;

export type KnownAuditTargetType = keyof typeof AUDIT_TARGET_TYPES;

export function actionLabel(action: string): string {
  return (AUDIT_ACTIONS as Record<string, string>)[action] ?? action;
}

export function targetTypeLabel(t: string): string {
  return (AUDIT_TARGET_TYPES as Record<string, string>)[t] ?? t;
}
