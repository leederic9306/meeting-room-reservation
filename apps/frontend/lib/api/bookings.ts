import { type CreateBookingInput, type UpdateBookingInput } from '@meeting-room/shared-types';

import { api, unwrap } from './axios';

// 폼 스키마/타입은 shared-types에서 직접 import — 별칭만 재export.
export {
  createBookingSchema,
  updateBookingSchema,
  isQuarterAlignedIso,
  MAX_BOOKING_DURATION_MINUTES,
  QUARTER_MINUTES,
  type CreateBookingInput,
  type UpdateBookingInput,
} from '@meeting-room/shared-types';

// ---- 응답 타입 -----------------------------------------------------------

export interface BookingDto {
  id: string;
  room: { id: string; name: string };
  user: { id: string; name: string; department: string | null };
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  recurrenceId: string | null;
  recurrenceIndex: number | null;
  createdByAdmin: boolean;
  isMine: boolean;
  createdAt: string;
}

export interface RoomDto {
  id: string;
  name: string;
  capacity: number | null;
  location: string | null;
  description: string | null;
  isActive: boolean;
  displayOrder: number;
}

// ---- API 함수 -----------------------------------------------------------

export interface ListBookingsParams {
  roomId?: string;
  from: string;
  to: string;
  userId?: string;
}

export async function listBookings(params: ListBookingsParams): Promise<BookingDto[]> {
  const res = await api.get<{ data: BookingDto[] }>('/bookings', { params });
  return unwrap(res.data);
}

/** 백엔드의 단일 호출 범위 상한과 동치 — 초과 시 chunk로 분할한다. */
const MAX_LIST_RANGE_MS = 31 * 24 * 60 * 60 * 1000;

/**
 * 월 뷰처럼 31일을 초과하는 범위 조회. 31일 chunk로 나눠 병렬 호출 후 id 중복 제거.
 * 단일 예약이 chunk 경계에 걸쳐 양쪽에 잡힐 수 있어 dedup 필수.
 */
export async function listBookingsByRange(params: ListBookingsParams): Promise<BookingDto[]> {
  const start = new Date(params.from).getTime();
  const end = new Date(params.to).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return [];
  if (end - start <= MAX_LIST_RANGE_MS) return listBookings(params);

  const chunks: ListBookingsParams[] = [];
  for (let cursor = start; cursor < end; cursor = Math.min(cursor + MAX_LIST_RANGE_MS, end)) {
    const next = Math.min(cursor + MAX_LIST_RANGE_MS, end);
    chunks.push({
      ...params,
      from: new Date(cursor).toISOString(),
      to: new Date(next).toISOString(),
    });
    if (next === end) break;
  }
  const results = await Promise.all(chunks.map(listBookings));
  const seen = new Set<string>();
  const merged: BookingDto[] = [];
  for (const b of results.flat()) {
    if (!seen.has(b.id)) {
      seen.add(b.id);
      merged.push(b);
    }
  }
  return merged;
}

export async function getBooking(id: string): Promise<BookingDto> {
  const res = await api.get<{ data: BookingDto }>(`/bookings/${id}`);
  return unwrap(res.data);
}

export async function createBooking(values: CreateBookingInput): Promise<BookingDto> {
  const payload = { ...values, description: values.description || undefined };
  const res = await api.post<{ data: BookingDto }>('/bookings', payload);
  return unwrap(res.data);
}

export async function updateBooking(id: string, values: UpdateBookingInput): Promise<BookingDto> {
  const payload: Record<string, unknown> = {};
  if (values.title !== undefined) payload.title = values.title;
  if (values.description !== undefined) payload.description = values.description || undefined;
  if (values.startAt !== undefined) payload.startAt = values.startAt;
  if (values.endAt !== undefined) payload.endAt = values.endAt;
  const res = await api.patch<{ data: BookingDto }>(`/bookings/${id}`, payload);
  return unwrap(res.data);
}

export async function deleteBooking(id: string): Promise<void> {
  await api.delete(`/bookings/${id}`);
}

export async function listRooms(): Promise<RoomDto[]> {
  const res = await api.get<{ data: RoomDto[] }>('/rooms');
  return unwrap(res.data);
}
