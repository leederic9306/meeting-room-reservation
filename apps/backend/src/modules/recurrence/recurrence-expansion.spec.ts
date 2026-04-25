import { addYears } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

import { expandRecurrence, expandWithExdates, InvalidRRuleError } from './recurrence-expansion';

const KST = 'Asia/Seoul';

/** KST wall-time(YYYY-MM-DDTHH:mm:ss) → UTC Date — controller 경계 변환을 흉내. */
const kst = (wall: string): Date => fromZonedTime(wall, KST);

const FIXED_NOW = new Date('2026-04-25T03:00:00.000Z'); // 2026-04-25 12:00 KST 토요일

describe('expandRecurrence', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // PoC 4종 시나리오 (rrule-poc.ts와 동일한 패턴)
  // ---------------------------------------------------------------------------

  describe('PoC 시나리오 1 — 매주 월요일 12회', () => {
    const dtstart = kst('2026-04-27T09:00:00');

    it('12회 펼침, 첫 회차 UTC 기대값 일치', () => {
      const r = expandRecurrence({
        rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=12',
        dtstart,
        durationMinutes: 60,
      });

      expect(r.instances).toHaveLength(12);
      expect(r.instances[0]!.startAt.toISOString()).toBe('2026-04-27T00:00:00.000Z');
      expect(r.instances[0]!.endAt.toISOString()).toBe('2026-04-27T01:00:00.000Z');
      // index는 0..11
      expect(r.instances.map((i) => i.index)).toEqual(Array.from({ length: 12 }, (_, i) => i));
    });

    it('모든 회차가 KST 09:00 (DST 없음)', () => {
      const r = expandRecurrence({
        rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=12',
        dtstart,
        durationMinutes: 60,
      });
      const hours = new Set(r.instances.map((i) => formatInTimeZone(i.startAt, KST, 'HH:mm')));
      expect(hours).toEqual(new Set(['09:00']));
    });

    it('COUNT 한정이라 1년 내 모두 발생 → truncatedToOneYear=false', () => {
      const r = expandRecurrence({
        rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=12',
        dtstart,
        durationMinutes: 60,
      });
      expect(r.truncatedToOneYear).toBe(false);
    });
  });

  describe('PoC 시나리오 2 — 격주 화/목 UNTIL 6개월', () => {
    const dtstart = kst('2026-04-28T10:00:00');

    it('첫 회차 UTC = 01:00, 모두 화/목', () => {
      const r = expandRecurrence({
        rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;UNTIL=20261028T235959Z',
        dtstart,
        durationMinutes: 90,
      });
      expect(r.instances.length).toBeGreaterThan(0);
      expect(r.instances[0]!.startAt.toISOString()).toBe('2026-04-28T01:00:00.000Z');
      // 길이 90분 검증
      const dur = (r.instances[0]!.endAt.getTime() - r.instances[0]!.startAt.getTime()) / 60_000;
      expect(dur).toBe(90);

      // 요일은 화(2) 또는 목(4) — KST 기준
      for (const inst of r.instances) {
        const dow = formatInTimeZone(inst.startAt, KST, 'i'); // ISO 요일 1=월..7=일
        expect(['2', '4']).toContain(dow);
      }
    });
  });

  describe('PoC 시나리오 3 — 매월 마지막 금요일 12회', () => {
    const dtstart = kst('2026-04-24T14:00:00');

    it('12회, 모두 KST 마지막 금요일', () => {
      const r = expandRecurrence({
        rrule: 'FREQ=MONTHLY;BYDAY=-1FR;COUNT=12',
        dtstart,
        durationMinutes: 120,
      });
      expect(r.instances).toHaveLength(12);
      expect(r.instances[0]!.startAt.toISOString()).toBe('2026-04-24T05:00:00.000Z');

      // 모든 회차가 금요일(KST)인지
      const dows = r.instances.map((i) => formatInTimeZone(i.startAt, KST, 'i'));
      expect(new Set(dows)).toEqual(new Set(['5']));
    });
  });

  describe('PoC 시나리오 4 — 매월 첫째 주 월요일 12회', () => {
    const dtstart = kst('2026-05-04T09:00:00');

    it('12회, 첫 회차 KST 09:00', () => {
      const r = expandRecurrence({
        rrule: 'FREQ=MONTHLY;BYDAY=1MO;COUNT=12',
        dtstart,
        durationMinutes: 60,
      });
      expect(r.instances).toHaveLength(12);
      expect(r.instances[0]!.startAt.toISOString()).toBe('2026-05-04T00:00:00.000Z');
      const months = r.instances.map((i) => formatInTimeZone(i.startAt, KST, 'yyyy-MM'));
      // 12개월에 걸쳐 단일 회차씩
      expect(new Set(months).size).toBe(12);
    });
  });

  // ---------------------------------------------------------------------------
  // 1년 절단 경계
  // ---------------------------------------------------------------------------

  describe('1년 절단', () => {
    const dtstart = kst('2026-04-27T09:00:00');

    it('무제한 RRULE은 1년 윈도우로 절단되어 유한 개수 반환', () => {
      const r = expandRecurrence({
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        dtstart,
        durationMinutes: 60,
      });
      expect(Number.isFinite(r.instances.length)).toBe(true);
      expect(r.instances.length).toBeGreaterThan(40); // 매주 월 → 약 52
      expect(r.instances.length).toBeLessThanOrEqual(53);
      expect(r.truncatedToOneYear).toBe(true);
    });

    it('절단 윈도우 끝점은 dtstart + 1y (포함) — windowEnd가 정확히 일치', () => {
      const r = expandRecurrence({
        rrule: 'FREQ=DAILY',
        dtstart,
        durationMinutes: 30,
      });
      expect(r.windowEnd.toISOString()).toBe(addYears(dtstart, 1).toISOString());
      // 마지막 인스턴스는 windowEnd 이내
      const last = r.instances[r.instances.length - 1]!;
      expect(last.startAt.getTime()).toBeLessThanOrEqual(r.windowEnd.getTime());
    });

    it('마지막 회차의 endAt은 항상 dtstart + 1y 이내 — DB chk_recurrence_until_max 정렬', () => {
      // 무제한 DAILY 절단: 마지막 회차 startAt + duration ≤ dtstart + 1y 여야 한다.
      // (between 끝점을 windowEnd - duration 으로 좁혀 처리)
      const r = expandRecurrence({
        rrule: 'FREQ=DAILY',
        dtstart,
        durationMinutes: 60,
      });
      const last = r.instances[r.instances.length - 1]!;
      expect(last.endAt.getTime()).toBeLessThanOrEqual(r.windowEnd.getTime());
    });

    it('1년 경계에 startAt이 정확히 일치하는 회차는 untilAt 초과 방지를 위해 제외', () => {
      // dtstart=2026-04-27, FREQ=YEARLY;COUNT=2 → 두 번째 회차는 2027-04-27 09:00 (경계).
      // duration=60분이면 endAt=10:00 > windowEnd → 제외되어 instances=1.
      const r = expandRecurrence({
        rrule: 'FREQ=YEARLY;COUNT=2',
        dtstart,
        durationMinutes: 60,
      });
      expect(r.instances).toHaveLength(1);
    });

    it('COUNT만 있는 RRULE이 1년 안에 모두 발생하면 truncated=false', () => {
      const r = expandRecurrence({
        rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
        dtstart,
        durationMinutes: 60,
      });
      expect(r.instances).toHaveLength(4);
      expect(r.truncatedToOneYear).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 과거 회차 skip (isPast 표기)
  // ---------------------------------------------------------------------------

  describe('과거 회차 표기', () => {
    it('FIXED_NOW 이전 dtstart의 첫 회차는 isPast=true', () => {
      // FIXED_NOW = 2026-04-25T03:00:00Z (KST 12:00 토)
      // 시작을 KST 4월 20일(월)로 — 과거.
      const dtstart = kst('2026-04-20T09:00:00'); // 2026-04-20T00:00:00Z
      const r = expandRecurrence({
        rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
        dtstart,
        durationMinutes: 60,
      });
      expect(r.instances[0]!.isPast).toBe(true); // 2026-04-20
      expect(r.instances[1]!.isPast).toBe(false); // 2026-04-27 (FIXED_NOW 이후)
      // 인덱스는 skip되어도 0,1,2,3 그대로 유지(시퀀스 위치 보존)
      expect(r.instances.map((i) => i.index)).toEqual([0, 1, 2, 3]);
    });

    it('현재 시각 이후만 있으면 isPast 모두 false', () => {
      const dtstart = kst('2026-04-27T09:00:00');
      const r = expandRecurrence({
        rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=3',
        dtstart,
        durationMinutes: 60,
      });
      expect(r.instances.every((i) => !i.isPast)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 입력 변형/오류
  // ---------------------------------------------------------------------------

  describe('RRULE 파싱', () => {
    const dtstart = kst('2026-04-27T09:00:00');

    it('RRULE: prefix가 있어도 파싱됨', () => {
      const r = expandRecurrence({
        rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3',
        dtstart,
        durationMinutes: 60,
      });
      expect(r.instances).toHaveLength(3);
    });

    it('빈 RRULE → InvalidRRuleError', () => {
      expect(() => expandRecurrence({ rrule: '', dtstart, durationMinutes: 60 })).toThrow(
        InvalidRRuleError,
      );
    });

    it('FREQ 누락 → InvalidRRuleError', () => {
      expect(() => expandRecurrence({ rrule: 'COUNT=5', dtstart, durationMinutes: 60 })).toThrow(
        InvalidRRuleError,
      );
    });

    it('완전한 garbage → InvalidRRuleError', () => {
      expect(() =>
        expandRecurrence({ rrule: 'NOT_AN_RRULE', dtstart, durationMinutes: 60 }),
      ).toThrow(InvalidRRuleError);
    });

    it('TZID 옵션이 들어와도 무시되고 dtstart의 UTC instant가 진실의 원천', () => {
      // 입력에 TZID가 박혀있어도 — 우리는 strip하고 dtstart UTC 그대로 사용 (D-2).
      const r = expandRecurrence({
        rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=2;TZID=America/Los_Angeles',
        dtstart,
        durationMinutes: 60,
      });
      expect(r.instances[0]!.startAt.toISOString()).toBe('2026-04-27T00:00:00.000Z');
    });
  });
});

// ---------------------------------------------------------------------------
// EXDATE 매칭이 UTC instant 단위로 동작 (D-3, PoC 단계 (d))
// ---------------------------------------------------------------------------

describe('expandWithExdates — EXDATE는 UTC instant 단위로 매칭', () => {
  const dtstart = fromZonedTime('2026-04-27T09:00:00', KST);

  it('정확한 UTC instant exdate는 해당 회차를 정확히 1건 제외', () => {
    const baseAll = expandRecurrence({
      rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
      dtstart,
      durationMinutes: 60,
    });
    expect(baseAll.instances).toHaveLength(4);

    const target = baseAll.instances[2]!.startAt; // 3번째 회차의 정확한 UTC instant
    const filtered = expandWithExdates({
      rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
      dtstart,
      exdates: [target],
    });
    expect(filtered).toHaveLength(3);
    expect(filtered.some((d) => d.getTime() === target.getTime())).toBe(false);
  });

  it('1ms 어긋난 exdate는 매칭 실패 — 회차 그대로 유지', () => {
    const baseAll = expandRecurrence({
      rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
      dtstart,
      durationMinutes: 60,
    });
    const offByOneMs = new Date(baseAll.instances[2]!.startAt.getTime() + 1);
    const filtered = expandWithExdates({
      rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
      dtstart,
      exdates: [offByOneMs],
    });
    expect(filtered).toHaveLength(4); // 절단되지 않음
  });

  it('1초 어긋난 exdate도 매칭 실패', () => {
    const baseAll = expandRecurrence({
      rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
      dtstart,
      durationMinutes: 60,
    });
    const offBy1s = new Date(baseAll.instances[2]!.startAt.getTime() + 1000);
    const filtered = expandWithExdates({
      rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
      dtstart,
      exdates: [offBy1s],
    });
    expect(filtered).toHaveLength(4);
  });

  it('여러 exdate를 동시 적용', () => {
    const baseAll = expandRecurrence({
      rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=6',
      dtstart,
      durationMinutes: 60,
    });
    const exdates = [baseAll.instances[1]!.startAt, baseAll.instances[4]!.startAt];
    const filtered = expandWithExdates({
      rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=6',
      dtstart,
      exdates,
    });
    expect(filtered).toHaveLength(4);
    for (const ex of exdates) {
      expect(filtered.some((d) => d.getTime() === ex.getTime())).toBe(false);
    }
  });

  it('KST wall-time이 같지만 UTC instant가 다른 날짜는 매칭 실패', () => {
    // 같은 "09:00 KST" 라도 다른 주차의 인스턴트는 별개.
    const baseAll = expandRecurrence({
      rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
      dtstart,
      durationMinutes: 60,
    });
    // 1주 더 미래의 인스턴트 — 시리즈에 없는 instant
    const farFuture = new Date(baseAll.instances[3]!.startAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const filtered = expandWithExdates({
      rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
      dtstart,
      exdates: [farFuture],
    });
    expect(filtered).toHaveLength(4);
  });
});
