/* eslint-disable no-console -- CLI 출력 스크립트 */
/**
 * rrule.js PoC — 회의실 예약 시스템 반복 예약 검증
 *
 * 실행:
 *   pnpm --filter backend exec ts-node scripts/rrule-poc.ts
 *
 * RRULE 시나리오:
 *   1) FREQ=WEEKLY;BYDAY=MO;COUNT=12                              매주 월요일 12회
 *   2) FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;UNTIL=20261028T235959   격주 화/목 6개월
 *   3) FREQ=MONTHLY;BYDAY=-1FR;COUNT=12                           매월 마지막 금요일
 *   4) FREQ=MONTHLY;BYDAY=1MO;COUNT=12                            매월 첫째 주 월요일
 *
 * 각 시나리오에서 다음 4단계를 검증:
 *   (a) 회차 펼침 결과 — 개수/요일/순서
 *   (b) Asia/Seoul 시간대 처리 — 입력 wall(KST) → UTC 저장 → KST 표시
 *   (c) 1년 초과 절단 — 무제한 RRULE을 between(dtstart, dtstart+1y)로 자르는 정책
 *   (d) EXDATE 제외 — RRuleSet에 exdate 등록 시 정확히 1건 차감
 *
 * 정책 근거: docs/06-rrule-poc-result.md (D-1 ~ D-4)
 *   - dtstart는 항상 fromZonedTime(wall, 'Asia/Seoul')로 UTC Date 생성
 *   - rrule.js의 tzid 옵션 / DTSTART;TZID 형식은 사용 금지 (시스템 TZ 의존)
 *   - 펼침 결과 Date는 모두 정상 UTC instant — 표시 시 formatInTimeZone으로 변환
 */

import { addYears } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { RRule, RRuleSet } from 'rrule';

const KST = 'Asia/Seoul';

/** KST wall time(ISO local 문자열) → 정확한 UTC Date */
function kst(wall: string): Date {
  return fromZonedTime(wall, KST);
}

function fmtUtc(d: Date): string {
  return d.toISOString();
}

function fmtKst(d: Date): string {
  return formatInTimeZone(d, KST, 'yyyy-MM-dd (EEE) HH:mm:ss XXX');
}

interface Scenario {
  id: string;
  rruleStr: string;
  /** 첫 회차의 KST wall time — fromZonedTime으로 UTC Date 변환 */
  dtstartWall: string;
  build: (dtstart: Date) => RRule;
  /** COUNT/UNTIL 제거한 무제한 버전 — (c) 절단 검증용 */
  buildUncapped: (dtstart: Date) => RRule;
  /** (a)에서 검증할 첫 회차의 UTC ISO 기대값 (없으면 스킵) */
  expectedFirstUtc?: string;
  /** (a)에서 검증할 총 회차 수 기대값 (UNTIL 케이스에서는 생략 가능) */
  expectedCount?: number;
}

const scenarios: Scenario[] = [
  {
    id: '1. 매주 월요일 12회',
    rruleStr: 'FREQ=WEEKLY;BYDAY=MO;COUNT=12',
    dtstartWall: '2026-04-27T09:00:00', // 월요일 09:00 KST
    build: (dtstart) =>
      new RRule({
        freq: RRule.WEEKLY,
        byweekday: [RRule.MO],
        count: 12,
        dtstart,
      }),
    buildUncapped: (dtstart) =>
      new RRule({
        freq: RRule.WEEKLY,
        byweekday: [RRule.MO],
        dtstart,
      }),
    expectedFirstUtc: '2026-04-27T00:00:00.000Z', // KST 09:00 = UTC 00:00
    expectedCount: 12,
  },
  {
    id: '2. 격주 화/목 6개월',
    rruleStr: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;UNTIL=20261028T235959',
    dtstartWall: '2026-04-28T10:00:00', // 화요일 10:00 KST
    build: (dtstart) =>
      new RRule({
        freq: RRule.WEEKLY,
        interval: 2,
        byweekday: [RRule.TU, RRule.TH],
        until: kst('2026-10-28T23:59:59'),
        dtstart,
      }),
    buildUncapped: (dtstart) =>
      new RRule({
        freq: RRule.WEEKLY,
        interval: 2,
        byweekday: [RRule.TU, RRule.TH],
        dtstart,
      }),
    expectedFirstUtc: '2026-04-28T01:00:00.000Z', // KST 10:00 = UTC 01:00
  },
  {
    id: '3. 매월 마지막 금요일',
    rruleStr: 'FREQ=MONTHLY;BYDAY=-1FR;COUNT=12',
    dtstartWall: '2026-04-24T14:00:00', // 2026-04 마지막 금요일 14:00 KST
    build: (dtstart) =>
      new RRule({
        freq: RRule.MONTHLY,
        byweekday: [RRule.FR.nth(-1)],
        count: 12,
        dtstart,
      }),
    buildUncapped: (dtstart) =>
      new RRule({
        freq: RRule.MONTHLY,
        byweekday: [RRule.FR.nth(-1)],
        dtstart,
      }),
    expectedFirstUtc: '2026-04-24T05:00:00.000Z', // KST 14:00 = UTC 05:00
    expectedCount: 12,
  },
  {
    id: '4. 매월 첫째 주 월요일',
    rruleStr: 'FREQ=MONTHLY;BYDAY=1MO;COUNT=12',
    dtstartWall: '2026-05-04T09:00:00', // 2026-05 첫 월요일 09:00 KST
    build: (dtstart) =>
      new RRule({
        freq: RRule.MONTHLY,
        byweekday: [RRule.MO.nth(1)],
        count: 12,
        dtstart,
      }),
    buildUncapped: (dtstart) =>
      new RRule({
        freq: RRule.MONTHLY,
        byweekday: [RRule.MO.nth(1)],
        dtstart,
      }),
    expectedFirstUtc: '2026-05-04T00:00:00.000Z', // KST 09:00 = UTC 00:00
    expectedCount: 12,
  },
];

function printRow(idx: number, d: Date): void {
  console.log(`  ${String(idx).padStart(3)} | ${fmtUtc(d).padEnd(25)} | ${fmtKst(d)}`);
}

function printTableHeader(): void {
  console.log('  idx | UTC                       | KST');
  console.log('  ----+---------------------------+--------------------------------');
}

function printSampledRows(dates: Date[]): void {
  printTableHeader();
  if (dates.length <= 10) {
    dates.forEach((d, i) => printRow(i + 1, d));
    return;
  }
  dates.slice(0, 5).forEach((d, i) => printRow(i + 1, d));
  console.log('  ... (중간 생략) ...');
  dates.slice(-5).forEach((d, i) => printRow(dates.length - 5 + i + 1, d));
}

// ─────────────────────────────────────────────────────────────────────────────
// (a) 회차 펼침 결과 검증
// ─────────────────────────────────────────────────────────────────────────────
function stepA(s: Scenario, dtstart: Date): Date[] {
  console.log('\n  ── (a) 회차 펼침 결과 ──');
  const rule = s.build(dtstart);
  const all = rule.all();
  console.log(`  구성 RRULE: ${rule.toString().replace(/\n/g, ' | ')}`);
  console.log(`  총 회차    : ${all.length}`);
  printSampledRows(all);

  if (s.expectedFirstUtc) {
    const ok = all[0]?.toISOString() === s.expectedFirstUtc;
    console.log(
      `  ✓ 첫 회차 UTC: ${all[0]?.toISOString()} ${ok ? '== 기대값 OK' : '!= ' + s.expectedFirstUtc + ' FAIL'}`,
    );
  }
  if (s.expectedCount !== undefined) {
    const ok = all.length === s.expectedCount;
    console.log(
      `  ✓ 회차 수    : ${all.length} ${ok ? '== ' + s.expectedCount + ' OK' : '!= ' + s.expectedCount + ' FAIL'}`,
    );
  }
  return all;
}

// ─────────────────────────────────────────────────────────────────────────────
// (b) Asia/Seoul 시간대 처리 검증
//     모든 회차의 KST wall time(시:분)이 dtstart와 동일해야 함
//     (한국은 DST 미사용, KST↔UTC 항상 +09:00 고정)
// ─────────────────────────────────────────────────────────────────────────────
function stepB(s: Scenario, dtstart: Date, all: Date[]): void {
  console.log('\n  ── (b) Asia/Seoul 시간대 처리 ──');
  if (all.length === 0) {
    console.log('  회차 없음 — 스킵');
    return;
  }
  console.log(`  입력 wall(KST)   : ${s.dtstartWall}`);
  console.log(`  변환 dtstart(UTC): ${fmtUtc(dtstart)}`);
  console.log(`  첫 회차 KST 표시 : ${fmtKst(all[0]!)}`);
  console.log(`  말 회차 KST 표시 : ${fmtKst(all[all.length - 1]!)}`);

  // dtstart의 KST 시:분과 모든 회차의 KST 시:분이 일치하는지 검증
  const expectedHm = formatInTimeZone(dtstart, KST, 'HH:mm');
  const offByOne = all.find((d) => formatInTimeZone(d, KST, 'HH:mm') !== expectedHm);
  if (offByOne) {
    console.log(`  ✗ KST 시각 불일치 발견: ${fmtKst(offByOne)} (기대 ${expectedHm}) FAIL`);
  } else {
    console.log(`  ✓ 모든 회차 KST 시각 = ${expectedHm} (dtstart와 일치) OK`);
  }

  // UTC offset이 모두 +09:00인지 (DST 없음)
  const offsets = new Set(all.map((d) => formatInTimeZone(d, KST, 'XXX')));
  console.log(
    `  ✓ KST offset 집합: ${[...offsets].join(', ')} ${offsets.size === 1 && offsets.has('+09:00') ? 'OK' : 'WARN'}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// (c) 1년 초과 절단 검증
//     COUNT/UNTIL을 제거한 무제한 RRULE을 between(dtstart, dtstart+1y)로
//     자르는 정책이 정상 동작하는지 확인
// ─────────────────────────────────────────────────────────────────────────────
function stepC(s: Scenario, dtstart: Date, capped: Date[]): void {
  console.log('\n  ── (c) 1년 초과 절단 ──');
  const uncappedRule = s.buildUncapped(dtstart);
  const oneYearLater = addYears(dtstart, 1);
  const within1y = uncappedRule.between(dtstart, oneYearLater, true);

  console.log(`  원본(COUNT/UNTIL 적용) 펼침 회차 : ${capped.length}`);
  console.log(`  무제한 RRULE 1년 이내 회차       : ${within1y.length}`);
  console.log(`  절단 범위 [dtstart, +1y]:`);
  console.log(`    start UTC: ${fmtUtc(dtstart)}`);
  console.log(`    end   UTC: ${fmtUtc(oneYearLater)}`);
  if (within1y.length > 0) {
    console.log(`  절단된 마지막 회차(KST): ${fmtKst(within1y[within1y.length - 1]!)}`);
  }

  // 무제한 RRULE은 끝없이 회차 생성하므로, 1년 절단이 정상 동작하면
  // within1y는 유한 길이여야 함
  const ok = Number.isFinite(within1y.length) && within1y.length > 0;
  console.log(
    `  ✓ 무제한 RRULE이 1년 범위로 절단되어 ${within1y.length}건 반환: ${ok ? 'OK' : 'FAIL'}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// (d) EXDATE 제외 검증
//     RRuleSet.exdate(date) 등록 시 정확히 1건 차감되어야 함
//     매칭은 동일 UTC instant(밀리초까지)
// ─────────────────────────────────────────────────────────────────────────────
function stepD(s: Scenario, dtstart: Date, capped: Date[]): void {
  console.log('\n  ── (d) EXDATE 제외 ──');
  if (capped.length < 2) {
    console.log('  회차 < 2 — 스킵');
    return;
  }
  const set = new RRuleSet();
  set.rrule(s.build(dtstart));
  const target = capped[Math.floor(capped.length / 2)]!; // 가운데 회차 1건 제외 (length>=2 보장)
  set.exdate(target);
  const filtered = set.all();
  const stillIn = filtered.some((d) => d.getTime() === target.getTime());

  console.log(`  제외 대상 UTC : ${fmtUtc(target)}`);
  console.log(`  제외 대상 KST : ${fmtKst(target)}`);
  console.log(`  원본 회차      : ${capped.length}`);
  console.log(`  EXDATE 적용 후 : ${filtered.length}`);
  console.log(
    `  ✓ 정확히 1건 감소 + 대상 인스턴트 부재: ` +
      `${filtered.length === capped.length - 1 && !stillIn ? 'OK' : 'FAIL'}`,
  );
}

function runScenario(s: Scenario): void {
  const dtstart = kst(s.dtstartWall);
  console.log('\n' + '='.repeat(90));
  console.log(`[${s.id}]`);
  console.log(`  RRULE     : ${s.rruleStr}`);
  console.log(`  dtstart   : ${s.dtstartWall} KST  →  ${fmtUtc(dtstart)}`);
  console.log('='.repeat(90));

  const all = stepA(s, dtstart);
  stepB(s, dtstart, all);
  stepC(s, dtstart, all);
  stepD(s, dtstart, all);
}

function main(): void {
  console.log('rrule.js PoC — 4 RRULE 패턴 × 4단계 검증');
  console.log(`실행 시간 : ${new Date().toISOString()}`);
  console.log(`프로세스 TZ: ${process.env.TZ ?? 'unset (system default)'}`);
  console.log(`Node.js   : ${process.version}`);
  for (const s of scenarios) {
    runScenario(s);
  }
  console.log('\n=== 모든 시나리오 출력 완료 ===');
}

main();
