import { describe, expect, it } from 'vitest';

import {
  computeRecurrenceProgress,
  previewRecurrenceStarts,
  recurrenceInputSchema,
  recurrenceInputToRRule,
  type RecurrenceDto,
  type RecurrenceInput,
} from './recurrences';

const FIRST_START = new Date('2026-04-27T00:00:00.000Z');

describe('recurrenceInputSchema', () => {
  it('enabled=false 면 freq/endType 미지정도 통과', () => {
    const result = recurrenceInputSchema.safeParse({ enabled: false });
    expect(result.success).toBe(true);
  });

  it('enabled=true + freq 누락 → freq 경로 에러', () => {
    const result = recurrenceInputSchema.safeParse({ enabled: true, endType: 'forever' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((i) => i.path[0] === 'freq');
      expect(err).toBeDefined();
    }
  });

  it('enabled=true + endType=count + count 누락 → count 경로 에러', () => {
    const result = recurrenceInputSchema.safeParse({
      enabled: true,
      freq: 'WEEKLY',
      endType: 'count',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((i) => i.path[0] === 'count');
      expect(err).toBeDefined();
    }
  });

  it('enabled=true + endType=until + 잘못된 형식 → until 경로 에러', () => {
    const result = recurrenceInputSchema.safeParse({
      enabled: true,
      freq: 'WEEKLY',
      endType: 'until',
      until: 'invalid',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((i) => i.path[0] === 'until');
      expect(err).toBeDefined();
    }
  });
});

describe('recurrenceInputToRRule', () => {
  it('비활성 → undefined', () => {
    expect(recurrenceInputToRRule({ enabled: false })).toBeUndefined();
  });

  it('DAILY + COUNT', () => {
    const input: RecurrenceInput = {
      enabled: true,
      freq: 'DAILY',
      endType: 'count',
      count: 10,
    };
    expect(recurrenceInputToRRule(input)).toBe('FREQ=DAILY;COUNT=10');
  });

  it('forever 는 COUNT/UNTIL 없이 FREQ만', () => {
    const input: RecurrenceInput = {
      enabled: true,
      freq: 'WEEKLY',
      endType: 'forever',
    };
    expect(recurrenceInputToRRule(input)).toBe('FREQ=WEEKLY');
  });

  it('UNTIL 은 KST 23:59:59의 UTC RFC 5545 표현', () => {
    const input: RecurrenceInput = {
      enabled: true,
      freq: 'MONTHLY',
      endType: 'until',
      until: '2026-12-31',
    };
    // 2026-12-31 23:59:59 +09:00 = 2026-12-31 14:59:59Z
    expect(recurrenceInputToRRule(input)).toBe('FREQ=MONTHLY;UNTIL=20261231T145959Z');
  });
});

describe('previewRecurrenceStarts', () => {
  it('비활성 → 빈 배열', () => {
    expect(previewRecurrenceStarts({ enabled: false }, FIRST_START)).toEqual([]);
  });

  it('DAILY count=3 → 3개 (2일째, 3일째 포함)', () => {
    const items = previewRecurrenceStarts(
      { enabled: true, freq: 'DAILY', endType: 'count', count: 3 },
      FIRST_START,
    );
    expect(items.map((d) => d.toISOString())).toEqual([
      '2026-04-27T00:00:00.000Z',
      '2026-04-28T00:00:00.000Z',
      '2026-04-29T00:00:00.000Z',
    ]);
  });

  it('WEEKLY 무기한 → 미리보기 한도(5)만큼 7일 간격', () => {
    const items = previewRecurrenceStarts(
      { enabled: true, freq: 'WEEKLY', endType: 'forever' },
      FIRST_START,
    );
    expect(items).toHaveLength(5);
    expect(items[1]!.toISOString()).toBe('2026-05-04T00:00:00.000Z');
    expect(items[4]!.toISOString()).toBe('2026-05-25T00:00:00.000Z');
  });

  it('UNTIL 컷오프 적용 — 종료일을 넘는 회차는 미포함', () => {
    const items = previewRecurrenceStarts(
      { enabled: true, freq: 'DAILY', endType: 'until', until: '2026-04-29' },
      FIRST_START,
    );
    // 4/27, 4/28, 4/29 까지 (4/30 이후는 cutoff 초과)
    expect(items).toHaveLength(3);
  });
});

describe('computeRecurrenceProgress', () => {
  function makeRecurrence(instances: { isPast: boolean }[]): RecurrenceDto {
    return {
      id: 'r1',
      room: { id: 'room', name: 'A' },
      user: { id: 'u', name: '홍길동', department: null },
      title: 'sync',
      description: null,
      rrule: 'FREQ=WEEKLY',
      durationMinutes: 60,
      startAt: '2026-04-27T00:00:00.000Z',
      untilAt: '2026-12-31T00:00:00.000Z',
      exceptions: [],
      instances: instances.map((i, idx) => ({
        id: `b${idx}`,
        startAt: '2026-04-27T00:00:00.000Z',
        endAt: '2026-04-27T01:00:00.000Z',
        isPast: i.isPast,
      })),
      createdAt: '2026-04-27T00:00:00.000Z',
    };
  }

  it('총/지난/남은 회차 수 계산', () => {
    const rec = makeRecurrence([
      { isPast: true },
      { isPast: true },
      { isPast: false },
      { isPast: false },
      { isPast: false },
    ]);
    expect(computeRecurrenceProgress(rec)).toEqual({ total: 5, past: 2, remaining: 3 });
  });

  it('빈 시리즈는 모두 0', () => {
    const rec = makeRecurrence([]);
    expect(computeRecurrenceProgress(rec)).toEqual({ total: 0, past: 0, remaining: 0 });
  });
});
