import { describe, expect, it } from 'vitest';

import { createBookingSchema, updateBookingSchema } from './bookings';

const BASE = {
  roomId: '11111111-1111-4111-8111-111111111111',
  title: '미팅',
  description: '',
  startAt: '2026-04-25T05:00:00.000Z',
  endAt: '2026-04-25T06:00:00.000Z',
};

describe('createBookingSchema (shared-types)', () => {
  it('정상 입력은 통과', () => {
    const result = createBookingSchema.safeParse(BASE);
    expect(result.success).toBe(true);
  });

  it('roomId 누락 → 회의실 선택 메시지', () => {
    const result = createBookingSchema.safeParse({ ...BASE, roomId: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((i) => i.path[0] === 'roomId');
      expect(err?.message).toMatch(/회의실/);
    }
  });

  it('title 누락 → 제목 입력 메시지', () => {
    const result = createBookingSchema.safeParse({ ...BASE, title: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((i) => i.path[0] === 'title');
      expect(err?.message).toMatch(/제목/);
    }
  });

  it('startAt이 15분 단위가 아니면 BOOKING_TIME_NOT_QUARTER 메시지', () => {
    const result = createBookingSchema.safeParse({
      ...BASE,
      startAt: '2026-04-25T05:07:00.000Z',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((i) => i.path[0] === 'startAt');
      expect(err?.message).toMatch(/15분/);
    }
  });

  it('endAt ≤ startAt → 인라인 에러는 endAt 경로에 부착', () => {
    const result = createBookingSchema.safeParse({
      ...BASE,
      startAt: '2026-04-25T06:00:00.000Z',
      endAt: '2026-04-25T05:00:00.000Z',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((i) => i.path[0] === 'endAt');
      expect(err?.message).toMatch(/이후/);
    }
  });

  it('길이 4시간 초과 → endAt 경로 에러', () => {
    const result = createBookingSchema.safeParse({
      ...BASE,
      startAt: '2026-04-25T05:00:00.000Z',
      endAt: '2026-04-25T09:15:00.000Z',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((i) => i.path[0] === 'endAt');
      expect(err?.message).toMatch(/4시간/);
    }
  });

  it('정확히 4시간 → 통과', () => {
    const result = createBookingSchema.safeParse({
      ...BASE,
      startAt: '2026-04-25T05:00:00.000Z',
      endAt: '2026-04-25T09:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('description 비어있는 문자열 허용', () => {
    const result = createBookingSchema.safeParse({ ...BASE, description: '' });
    expect(result.success).toBe(true);
  });
});

describe('updateBookingSchema (shared-types)', () => {
  it('빈 객체 통과 — 부분 업데이트', () => {
    const result = updateBookingSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('startAt만 → 통과 (시간 쌍 규칙은 양쪽 모두 있을 때만)', () => {
    const result = updateBookingSchema.safeParse({ startAt: '2026-04-25T05:00:00.000Z' });
    expect(result.success).toBe(true);
  });

  it('startAt + endAt 둘 다 있을 때 순서 검증 적용', () => {
    const result = updateBookingSchema.safeParse({
      startAt: '2026-04-25T06:00:00.000Z',
      endAt: '2026-04-25T05:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('title 1자 미만 → 거절', () => {
    const result = updateBookingSchema.safeParse({ title: '' });
    expect(result.success).toBe(false);
  });
});
