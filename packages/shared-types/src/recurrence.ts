import { z } from 'zod';

/**
 * 예약 모달의 "반복" 옵션 폼 스키마 — 프런트엔드 전용 입력 모델.
 *
 * 백엔드 `POST /recurrences` 는 RFC 5545 RRULE 문자열을 받지만, 폼은 단순
 * 프리셋(매일/매주/매월) + 종료 조건 3종만 다룬다. 폼 값은 클라이언트에서
 * `buildRRule(...)` 로 RRULE 문자열로 직렬화되어 서버에 전달된다.
 *
 * 종료 조건:
 *  - `count`: 횟수 지정 (COUNT=N)
 *  - `until`: 종료일 지정 (UNTIL=YYYYMMDDT235959Z, KST 23:59:59 기준)
 *  - `forever`: 무기한 — 서버에서 1년으로 자동 절단(D-1, recurrence-expansion 정책)
 */

export const RECURRENCE_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export const RECURRENCE_END_TYPES = ['count', 'until', 'forever'] as const;
export type RecurrenceEndType = (typeof RECURRENCE_END_TYPES)[number];

/** 미리보기 회차 수 — 폼에는 처음 5개만 표시 (PRD 미리보기 정책). */
export const RECURRENCE_PREVIEW_LIMIT = 5;

/** 횟수 지정 시 허용 범위. 1년 절단 정책상 365가 일 단위 최대 — 안전한 상한. */
export const RECURRENCE_COUNT_MIN = 2;
export const RECURRENCE_COUNT_MAX = 365;

const recurrenceObject = z.object({
  enabled: z.boolean(),
  freq: z.enum(RECURRENCE_FREQUENCIES).optional(),
  endType: z.enum(RECURRENCE_END_TYPES).optional(),
  /** endType='count'일 때만 의미 있음. */
  count: z.number().int().min(RECURRENCE_COUNT_MIN).max(RECURRENCE_COUNT_MAX).optional(),
  /** endType='until'일 때 YYYY-MM-DD (사용자 로컬 캘린더 기준). */
  until: z.string().optional(),
});

/**
 * `enabled=true`일 때만 freq/endType 및 그에 종속된 필드를 검증한다.
 * 비활성 상태에서는 어떤 값이 남아 있어도 통과 — 토글로 켰다가 끄는 흐름을 허용.
 */
export const recurrenceInputSchema = recurrenceObject.superRefine((value, ctx) => {
  if (!value.enabled) return;

  if (value.freq === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['freq'],
      message: '반복 주기를 선택해주세요.',
    });
  }

  if (value.endType === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endType'],
      message: '반복 종료 조건을 선택해주세요.',
    });
    return;
  }

  if (value.endType === 'count') {
    if (value.count === undefined || Number.isNaN(value.count)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['count'],
        message: '반복 횟수를 입력해주세요.',
      });
    }
  }

  if (value.endType === 'until') {
    if (!value.until || !/^\d{4}-\d{2}-\d{2}$/.test(value.until)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['until'],
        message: '종료일을 선택해주세요.',
      });
    }
  }
});

export type RecurrenceInput = z.infer<typeof recurrenceInputSchema>;

/**
 * 폼 값 → RFC 5545 RRULE 문자열.
 *
 * - DAILY/WEEKLY/MONTHLY 만 지원. 더 복잡한 패턴(BYDAY 다중 등)은 별도 PoC 후 확장.
 * - `until` 은 사용자 로컬 캘린더 기준 일자의 23:59:59 KST → UTC 변환 후 UNTIL=...Z 로 직렬화.
 *   (KST=UTC+9, DST 미사용 — 백엔드의 KST 가정과 정렬)
 *
 * `enabled=false` 또는 필수 필드 누락 시 undefined.
 */
export function recurrenceInputToRRule(input: RecurrenceInput): string | undefined {
  if (!input.enabled || input.freq === undefined || input.endType === undefined) return undefined;

  const parts: string[] = [`FREQ=${input.freq}`];

  if (input.endType === 'count') {
    if (input.count === undefined) return undefined;
    parts.push(`COUNT=${input.count}`);
  } else if (input.endType === 'until') {
    if (!input.until) return undefined;
    const utc = kstDateEndToUtc(input.until);
    if (utc === undefined) return undefined;
    parts.push(`UNTIL=${utc}`);
  }
  // 'forever' 는 COUNT/UNTIL 미지정 — 서버가 1년 절단

  return parts.join(';');
}

/**
 * `YYYY-MM-DD` (KST 캘린더) → 해당 일 23:59:59 KST 의 UTC RFC 5545 표현 (`YYYYMMDDTHHMMSSZ`).
 * KST=UTC+9 로 단순 보정 — DST 미사용.
 */
function kstDateEndToUtc(date: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const kstEnd = new Date(`${date}T23:59:59+09:00`);
  if (Number.isNaN(kstEnd.getTime())) return undefined;
  // ISO → 'YYYYMMDDTHHMMSSZ'
  const iso = kstEnd
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  return iso;
}

/**
 * 폼 값 + 첫 회차 시작 시각으로 미리보기 회차 시작들을 계산.
 *
 * 클라이언트 미리보기 전용 — RRULE 펼침과 정확히 동일할 필요는 없다(BYDAY 등 확장 시
 * 분기 추가 필요). 현재 지원하는 단일 프리셋 한정.
 *
 * - `forever` 는 `RECURRENCE_PREVIEW_LIMIT` 만큼만 생성
 * - `count` 는 min(count, LIMIT)
 * - `until` 은 종료일을 넘기지 않는 범위 내 LIMIT 까지
 */
export function previewRecurrenceStarts(
  input: RecurrenceInput,
  firstStart: Date,
  limit: number = RECURRENCE_PREVIEW_LIMIT,
): Date[] {
  if (!input.enabled || input.freq === undefined || input.endType === undefined) return [];
  if (Number.isNaN(firstStart.getTime())) return [];

  const max = (() => {
    if (input.endType === 'count') {
      return Math.min(input.count ?? 0, limit);
    }
    return limit;
  })();
  if (max <= 0) return [];

  const untilCutoff = (() => {
    if (input.endType !== 'until') return undefined;
    if (!input.until || !/^\d{4}-\d{2}-\d{2}$/.test(input.until)) return undefined;
    return new Date(`${input.until}T23:59:59+09:00`);
  })();

  const result: Date[] = [];
  for (let i = 0; i < max; i += 1) {
    const next = advanceByFrequency(firstStart, input.freq, i);
    if (untilCutoff !== undefined && next.getTime() > untilCutoff.getTime()) break;
    result.push(next);
  }
  return result;
}

function advanceByFrequency(base: Date, freq: RecurrenceFrequency, step: number): Date {
  const d = new Date(base.getTime());
  if (step === 0) return d;
  if (freq === 'DAILY') {
    d.setDate(d.getDate() + step);
  } else if (freq === 'WEEKLY') {
    d.setDate(d.getDate() + step * 7);
  } else {
    d.setMonth(d.getMonth() + step);
  }
  return d;
}
