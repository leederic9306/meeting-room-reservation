import { api, unwrap } from './axios';

export {
  recurrenceInputSchema,
  recurrenceInputToRRule,
  previewRecurrenceStarts,
  RECURRENCE_FREQUENCIES,
  RECURRENCE_END_TYPES,
  RECURRENCE_PREVIEW_LIMIT,
  RECURRENCE_COUNT_MIN,
  RECURRENCE_COUNT_MAX,
  type RecurrenceInput,
  type RecurrenceFrequency,
  type RecurrenceEndType,
} from '@meeting-room/shared-types';

export interface SkippedInstanceDto {
  index: number;
  /** KST 기준 YYYY-MM-DD. */
  instanceDate: string;
  /** 인스턴스의 UTC 시작 시각 ISO. */
  startAt: string;
  reason: 'TIME_CONFLICT' | 'PAST_INSTANCE';
}

export interface CreateRecurrenceResultDto {
  recurrenceId: string;
  createdBookings: number;
  skippedBookings: SkippedInstanceDto[];
}

export interface CreateRecurrenceRequest {
  roomId: string;
  title: string;
  description?: string;
  startAt: string;
  durationMinutes: number;
  rrule: string;
}

export async function createRecurrence(
  payload: CreateRecurrenceRequest,
): Promise<CreateRecurrenceResultDto> {
  const body: Record<string, unknown> = { ...payload };
  if (!body.description) delete body.description;
  const res = await api.post<{ data: CreateRecurrenceResultDto }>('/recurrences', body);
  return unwrap(res.data);
}

/** 시리즈 조회 — 메타데이터(회차 수/진행도) 표시용. */
export interface RecurrenceInstanceDto {
  id: string;
  startAt: string;
  endAt: string;
  isPast: boolean;
}

export interface RecurrenceExceptionDto {
  id: string;
  excludedDate: string;
  reason: string | null;
  createdAt: string;
}

export interface RecurrenceDto {
  id: string;
  room: { id: string; name: string };
  user: { id: string; name: string; department: string | null };
  title: string;
  description: string | null;
  rrule: string;
  durationMinutes: number;
  startAt: string;
  untilAt: string;
  exceptions: RecurrenceExceptionDto[];
  instances: RecurrenceInstanceDto[];
  createdAt: string;
}

export async function getRecurrence(id: string): Promise<RecurrenceDto> {
  const res = await api.get<{ data: RecurrenceDto }>(`/recurrences/${id}`);
  return unwrap(res.data);
}

export interface UpdateRecurrenceInput {
  title?: string;
  description?: string;
}

export async function updateRecurrence(
  id: string,
  payload: UpdateRecurrenceInput,
): Promise<RecurrenceDto> {
  const body: Record<string, unknown> = {};
  if (payload.title !== undefined) body.title = payload.title;
  if (payload.description !== undefined) body.description = payload.description || undefined;
  const res = await api.patch<{ data: RecurrenceDto }>(`/recurrences/${id}`, body);
  return unwrap(res.data);
}

/** 진행도 헬퍼 — instances 배열에서 총/지난 회차 수 산출. */
export function computeRecurrenceProgress(rec: RecurrenceDto): {
  total: number;
  past: number;
  remaining: number;
} {
  const total = rec.instances.length;
  const past = rec.instances.filter((i) => i.isPast).length;
  return { total, past, remaining: total - past };
}
