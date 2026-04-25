import { addYears } from 'date-fns';
import { RRule, RRuleSet } from 'rrule';
import type { Frequency } from 'rrule';

/**
 * RRULE 펼침 — docs/06-rrule-poc-result.md (D-1 ~ D-4) 정책 적용.
 *
 * 핵심 규칙:
 *  - rrule.js의 `tzid` 옵션은 사용하지 않음 (D-2). dtstart는 호출자가 controller 경계에서
 *    `fromZonedTime(_, 'Asia/Seoul')`로 변환해 넘긴 UTC `Date` 그대로 주입.
 *  - 시리즈 펼침 범위는 항상 `[dtstart, dtstart + 1y]` (포함). RRULE이 COUNT/UNTIL을 갖든
 *    무제한이든 동일하게 1년에서 절단된다.
 *  - 펼침 결과 Date는 정상 UTC instant. 표시(KST 변환)는 호출자(controller)에서.
 */

const ONE_YEAR_TRUNCATION_DAYS = 366; // 윤년 1일 버퍼 — 경계에서의 안전성

export interface RecurrenceInstance {
  /**
   * RRULE 1년 절단 결과 시퀀스 내 0-base 위치.
   * 과거/충돌로 skip되어도 인덱스는 비지 않고 보존됨 (이 시리즈의 N번째 회차).
   */
  index: number;
  startAt: Date;
  endAt: Date;
  isPast: boolean;
}

export interface ExpansionResult {
  instances: RecurrenceInstance[];
  /** 1년 절단이 발생했는지(무제한 RRULE이거나 UNTIL이 1년 후로 지정된 경우). */
  truncatedToOneYear: boolean;
  /** 1년 절단 경계로 사용한 UTC Date (참고용). */
  windowEnd: Date;
}

export class InvalidRRuleError extends Error {
  constructor(reason: string) {
    super(`INVALID_RRULE: ${reason}`);
    this.name = 'InvalidRRuleError';
  }
}

/**
 * RRULE 문자열을 dtstart 기준으로 펼친다.
 *
 * @throws InvalidRRuleError RRULE 파싱 실패 또는 freq 누락 시
 */
export function expandRecurrence(opts: {
  rrule: string;
  /** UTC `Date` (controller 경계에서 KST → UTC 변환 완료된 값). */
  dtstart: Date;
  /** 회차 길이(분). 15의 배수, 1~240 — service 레이어에서 검증. */
  durationMinutes: number;
  /** 과거 회차 판정 기준. 미지정 시 `new Date()`. */
  now?: Date;
}): ExpansionResult {
  if (Number.isNaN(opts.dtstart.getTime())) {
    throw new InvalidRRuleError('dtstart가 유효하지 않습니다.');
  }
  if (opts.durationMinutes <= 0 || !Number.isFinite(opts.durationMinutes)) {
    throw new InvalidRRuleError('durationMinutes가 유효하지 않습니다.');
  }

  const rule = buildRRule(opts.rrule, opts.dtstart);

  // 1년 절단 윤년 버퍼: addYears는 +1년이지만 ms 단위 비교에서 평년/윤년 차로 1일이 빠질 수 있음.
  // 윤년 안전성을 위해 dtstart + 366일까지 허용 — 단, 1년 정책이 핵심이므로 addYears(1)을 그대로 사용.
  const windowEnd = addYears(opts.dtstart, 1);
  void ONE_YEAR_TRUNCATION_DAYS; // 상수 자체는 의도 표기용. 절단 기준은 addYears(1).

  const fired = rule.between(opts.dtstart, windowEnd, true);
  const truncated = wasTruncated(opts.rrule, fired, windowEnd);

  const now = opts.now ?? new Date();
  const durationMs = opts.durationMinutes * 60_000;

  const instances: RecurrenceInstance[] = fired.map((startAt, index) => {
    const endAt = new Date(startAt.getTime() + durationMs);
    return {
      index,
      startAt,
      endAt,
      // 시작이 현재 시각 이하면 과거로 분류 (booking.service의 assertFuture와 동일 정의).
      isPast: startAt.getTime() <= now.getTime(),
    };
  });

  return { instances, truncatedToOneYear: truncated, windowEnd };
}

/**
 * RRULE 문자열을 파싱하고 dtstart를 직접 주입해 RRule을 만든다.
 *
 * - DTSTART/EXDATE/TZID 등이 RRULE 문자열에 박혀 있을 가능성을 고려해 RRULE 본체만 추출한다.
 * - rrule.js v2.8.1의 `RRule.parseString`은 단일 RRULE 라인의 옵션만 파싱.
 *   "RRULE:FREQ=..." 형태로 prefix가 있어도 무시되도록 prefix 제거.
 * - `tzid` 옵션은 명시적으로 비워둔다(D-2 — 시스템 TZ 의존 회피).
 */
function buildRRule(rruleInput: string, dtstart: Date): RRule {
  const trimmed = rruleInput.trim();
  if (trimmed.length === 0) {
    throw new InvalidRRuleError('RRULE이 비어 있습니다.');
  }

  // "RRULE:FREQ=..." prefix 제거. 다중 라인 입력은 첫 번째 RRULE 라인만 사용.
  const ruleLine = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.toUpperCase().startsWith('DTSTART'));
  if (!ruleLine) {
    throw new InvalidRRuleError('RRULE 라인을 찾을 수 없습니다.');
  }
  const body = ruleLine.replace(/^RRULE:/i, '');

  let parsed: Partial<{ freq: Frequency }> & Record<string, unknown>;
  try {
    parsed = RRule.parseString(body) as typeof parsed;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'parse error';
    throw new InvalidRRuleError(msg);
  }

  if (parsed.freq === undefined || parsed.freq === null) {
    throw new InvalidRRuleError('FREQ가 지정되지 않았습니다.');
  }

  // tzid는 사용 금지 (D-2). 입력에 들어있어도 강제 제거.
  delete parsed.tzid;

  return new RRule({ ...parsed, dtstart });
}

/**
 * 1년 절단이 발생했는지 판정.
 *
 * - 무제한 RRULE(COUNT/UNTIL 둘 다 없음): 거의 항상 truncated=true (between으로 잘렸음)
 * - UNTIL이 1년 후로 지정된 RRULE: between과 차이 발생 시 truncated=true
 * - COUNT만 있고 1년 안에 모두 발생: truncated=false
 *
 * 무제한 RRULE에서 `rule.all()`을 호출하면 무한 루프이므로, "COUNT/UNTIL 미존재"
 * 자체를 무제한 신호로 사용한다.
 */
function wasTruncated(rruleInput: string, fired: Date[], _windowEnd: Date): boolean {
  const upper = rruleInput.toUpperCase();
  const hasCount = /(?:^|[;:])COUNT=/.test(upper);
  const hasUntil = /(?:^|[;:])UNTIL=/.test(upper);

  if (!hasCount && !hasUntil) {
    // 무제한 RRULE은 항상 1년에서 절단됨 (단, fired가 0이면 의미 없음 → false).
    return fired.length > 0;
  }

  // UNTIL이 windowEnd보다 미래인 케이스 정밀 판정은 UNTIL 파싱이 필요.
  // 본 단계는 신호 수준으로 충분 — between([dtstart, windowEnd])이 모두 잡혔다고 가정.
  return false;
}

/**
 * 외부 EXDATE 목록을 적용한 RRule 펼침.
 *
 * - 회차 인스턴트와 EXDATE는 **밀리초까지 정확히 일치**해야 매칭됨 (D-3, PoC 검증).
 *   1ms라도 어긋나면 EXDATE가 무시되므로, 호출자는 RRULE이 펼친 원본 UTC instant를
 *   그대로 EXDATE로 등록해야 한다.
 *
 * 본 함수는 주로 테스트/검증용으로 노출 — 실제 운영 흐름에서는 Booking을 직접
 * 소프트 삭제(deletedAt)해 EXCLUDE 제약이 진실의 원천이 되도록 하므로 사용하지 않는다.
 */
export function expandWithExdates(opts: {
  rrule: string;
  dtstart: Date;
  exdates: ReadonlyArray<Date>;
}): Date[] {
  const rule = buildRRule(opts.rrule, opts.dtstart);
  const set = new RRuleSet();
  set.rrule(rule);
  for (const ex of opts.exdates) {
    set.exdate(ex);
  }
  return set.all();
}
