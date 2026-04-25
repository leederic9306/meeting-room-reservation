import { z } from 'zod';

import { api, unwrap } from './axios';

// ---- Status enum ---------------------------------------------------------

export const EXCEPTION_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type ExceptionRequestStatus = (typeof EXCEPTION_REQUEST_STATUSES)[number];

// ---- Form schema (zod) ---------------------------------------------------

/**
 * 예외 신청 입력 폼. 백엔드 정책과 정렬:
 *  - 4시간 초과 또는 과거 시점일 때만 의미 있음 (서버에서 EXCEPTION_NOT_REQUIRED 검증)
 *  - 사유 10자 이상 (서버 검증과 동일)
 * 시간/회의실은 모달에서 받는 값(예약 폼 값)을 그대로 사용 — 폼 자체는 reason만 입력받는다.
 */
export const createExceptionRequestSchema = z.object({
  roomId: z.string().uuid('회의실을 선택해주세요.'),
  title: z.string().min(1, '제목을 입력해주세요.').max(200, '제목은 200자 이하여야 합니다.'),
  reason: z
    .string()
    .min(10, '신청 사유는 최소 10자 이상 입력해주세요.')
    .max(2000, '신청 사유는 2000자 이하여야 합니다.'),
  startAt: z.string().min(1, '시작 시간이 비어 있습니다.'),
  endAt: z.string().min(1, '종료 시간이 비어 있습니다.'),
});
export type CreateExceptionRequestInput = z.infer<typeof createExceptionRequestSchema>;

// ---- Response shapes -----------------------------------------------------

export interface ConflictHintDto {
  bookingId: string;
  title: string;
  startAt: string;
  endAt: string;
}

export interface ExceptionRequestDto {
  id: string;
  status: ExceptionRequestStatus;
  user: { id: string; name: string; department: string | null };
  room: { id: string; name: string };
  title: string;
  reason: string;
  startAt: string;
  endAt: string;
  reviewer: { id: string; name: string } | null;
  reviewComment: string | null;
  reviewedAt: string | null;
  bookingId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateExceptionRequestResponseDto = ExceptionRequestDto & {
  conflicts: ConflictHintDto[];
};

export interface PaginatedExceptionRequests {
  data: ExceptionRequestDto[];
  meta: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

// ---- API functions -------------------------------------------------------

export interface ListExceptionRequestsParams {
  status?: ExceptionRequestStatus;
  page?: number;
  limit?: number;
}

export async function createExceptionRequest(
  values: CreateExceptionRequestInput,
): Promise<CreateExceptionRequestResponseDto> {
  const res = await api.post<{ data: CreateExceptionRequestResponseDto }>(
    '/exception-requests',
    values,
  );
  return unwrap(res.data);
}

export async function listMyExceptionRequests(
  params: ListExceptionRequestsParams = {},
): Promise<PaginatedExceptionRequests> {
  const res = await api.get<PaginatedExceptionRequests>('/exception-requests/me', { params });
  // /me endpoint returns { data, meta } directly (paginated shape).
  return res.data;
}

export async function cancelExceptionRequest(id: string): Promise<ExceptionRequestDto> {
  const res = await api.post<{ data: ExceptionRequestDto }>(`/exception-requests/${id}/cancel`);
  return unwrap(res.data);
}

// ---- Admin endpoints -----------------------------------------------------

export interface ApproveExceptionRequestResponseDto {
  id: string;
  status: ExceptionRequestStatus;
  bookingId: string;
  reviewedAt: string;
}

export interface ListAdminExceptionRequestsParams {
  status?: ExceptionRequestStatus;
  userId?: string;
  page?: number;
  limit?: number;
}

export async function listAdminExceptionRequests(
  params: ListAdminExceptionRequestsParams = {},
): Promise<PaginatedExceptionRequests> {
  const cleaned: Record<string, string | number> = {};
  if (params.status) cleaned.status = params.status;
  if (params.userId) cleaned.userId = params.userId;
  if (params.page) cleaned.page = params.page;
  if (params.limit) cleaned.limit = params.limit;
  const res = await api.get<PaginatedExceptionRequests>('/admin/exception-requests', {
    params: cleaned,
  });
  return res.data;
}

export async function approveExceptionRequest(
  id: string,
): Promise<ApproveExceptionRequestResponseDto> {
  const res = await api.post<{ data: ApproveExceptionRequestResponseDto }>(
    `/admin/exception-requests/${id}/approve`,
  );
  return unwrap(res.data);
}

export async function rejectExceptionRequest(
  id: string,
  reviewComment: string,
): Promise<ExceptionRequestDto> {
  const res = await api.post<{ data: ExceptionRequestDto }>(
    `/admin/exception-requests/${id}/reject`,
    { reviewComment },
  );
  return unwrap(res.data);
}

// ---- Helpers -------------------------------------------------------------

/**
 * 일반 예약으로 가능한 시간인지 판별. 4시간 이내 + 미래면 일반 예약,
 * 그 외(4시간 초과 또는 과거)는 예외 신청만 의미 있음.
 *
 * 예약 모달의 폼 값에서 4시간/과거 정책 위반을 사전에 감지해 "예외 신청" 버튼을 노출할지
 * 결정한다. 이 헬퍼와 백엔드의 `assertExceptionMeaningful` 정책은 정확히 일치해야 한다.
 */
export function shouldOfferExceptionRequest(
  startIso: string,
  endIso: string,
  now: Date = new Date(),
): boolean {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  if (end.getTime() <= start.getTime()) return false;
  const minutes = (end.getTime() - start.getTime()) / 60_000;
  const isPast = start.getTime() <= now.getTime();
  const isLong = minutes > 240; // 백엔드 NORMAL_BOOKING_MAX_MINUTES와 동일
  return isPast || isLong;
}
