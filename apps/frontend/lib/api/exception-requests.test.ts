import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createExceptionRequestSchema, shouldOfferExceptionRequest } from './exception-requests';

const FIXED_NOW = new Date('2026-04-25T03:00:00.000Z');

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

describe('createExceptionRequestSchema', () => {
  const valid = {
    roomId: '11111111-1111-4111-8111-111111111111',
    title: '워크샵',
    reason: '외부 컨설팅 종일 워크샵 진행',
    startAt: '2026-04-26T05:00:00.000Z',
    endAt: '2026-04-26T10:00:00.000Z',
  };

  it('정상 입력은 통과', () => {
    const result = createExceptionRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('reason 10자 미만 → 메시지', () => {
    const result = createExceptionRequestSchema.safeParse({ ...valid, reason: '짧음' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((i) => i.path[0] === 'reason');
      expect(err?.message).toMatch(/10자/);
    }
  });

  it('roomId 빈 문자열 → 회의실 메시지', () => {
    const result = createExceptionRequestSchema.safeParse({ ...valid, roomId: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((i) => i.path[0] === 'roomId');
      expect(err?.message).toMatch(/회의실/);
    }
  });
});

describe('shouldOfferExceptionRequest', () => {
  it('4시간 이내 미래 → false (일반 예약 사용)', () => {
    expect(
      shouldOfferExceptionRequest('2026-04-26T05:00:00.000Z', '2026-04-26T07:00:00.000Z'),
    ).toBe(false);
  });

  it('정확히 4시간 미래 → false', () => {
    expect(
      shouldOfferExceptionRequest('2026-04-26T05:00:00.000Z', '2026-04-26T09:00:00.000Z'),
    ).toBe(false);
  });

  it('4시간 1분 초과 → true', () => {
    expect(
      shouldOfferExceptionRequest('2026-04-26T05:00:00.000Z', '2026-04-26T09:01:00.000Z'),
    ).toBe(true);
  });

  it('과거 시점은 길이 무관 true', () => {
    expect(
      shouldOfferExceptionRequest('2026-04-24T05:00:00.000Z', '2026-04-24T06:00:00.000Z'),
    ).toBe(true);
  });

  it('endAt ≤ startAt → false (잘못된 입력은 CTA 노출하지 않음)', () => {
    expect(
      shouldOfferExceptionRequest('2026-04-26T07:00:00.000Z', '2026-04-26T05:00:00.000Z'),
    ).toBe(false);
  });

  it('잘못된 ISO 문자열 → false', () => {
    expect(shouldOfferExceptionRequest('invalid', '2026-04-26T05:00:00.000Z')).toBe(false);
  });
});
