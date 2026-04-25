/* eslint-disable no-console -- CLI 벤치마크 출력 스크립트 */
/**
 * Method A (booking 미리 펼침) vs Method B (RRULE만 저장 + 조회 시 펼침) JS 측 벤치마크
 *
 * 실행: pnpm --filter backend exec ts-node --transpile-only scripts/expand-vs-rrule-bench.ts
 *
 * SQL 측 측정은 별도 psql 세션에서 수행. 본 스크립트는 Method B의 JS 펼침 비용만 측정한다.
 *  - 시리즈 10개 × 1년 매일(365회차) = 펼침 시 3,650 인스턴스
 *  - 1주 윈도우 펼침: rrule.between(weekStart, weekEnd, true)
 *  - 1년 전체 펼침   : rrule.all() (수정 시 미래 회차 재펼침 비용 추정용)
 */

import { fromZonedTime } from 'date-fns-tz';
import { RRule } from 'rrule';

const KST = 'Asia/Seoul';

const rules = Array.from({ length: 10 }, (_, s) => {
  const baseKst = new Date('2030-06-01T09:00:00').getTime() + s * 15 * 60 * 1000;
  return {
    rrule: 'FREQ=DAILY;COUNT=365',
    dtstart: fromZonedTime(new Date(baseKst), KST),
    durationMin: 15,
  };
});

const weekStart = fromZonedTime('2030-06-01T00:00:00', KST);
const weekEnd = fromZonedTime('2030-06-08T00:00:00', KST);

interface Instance {
  startAt: Date;
  endAt: Date;
}

function expandWeek(): Instance[] {
  const out: Instance[] = [];
  for (const r of rules) {
    const rule = new RRule({
      ...RRule.parseString(r.rrule),
      dtstart: r.dtstart,
    });
    const dates = rule.between(weekStart, weekEnd, true);
    for (const d of dates) {
      out.push({
        startAt: d,
        endAt: new Date(d.getTime() + r.durationMin * 60 * 1000),
      });
    }
  }
  return out;
}

function expandFullYear(): Instance[] {
  const out: Instance[] = [];
  for (const r of rules) {
    const rule = new RRule({
      ...RRule.parseString(r.rrule),
      dtstart: r.dtstart,
    });
    const dates = rule.all();
    for (const d of dates) {
      out.push({
        startAt: d,
        endAt: new Date(d.getTime() + r.durationMin * 60 * 1000),
      });
    }
  }
  return out;
}

function bench(name: string, fn: () => unknown[], iters: number): void {
  // warm-up
  fn();
  const samples: number[] = [];
  let lastLen = 0;
  for (let i = 0; i < iters; i++) {
    const t0 = process.hrtime.bigint();
    const out = fn();
    const t1 = process.hrtime.bigint();
    samples.push(Number(t1 - t0) / 1e6);
    lastLen = out.length;
  }
  samples.sort((a, b) => a - b);
  // length>=1 보장(iters>0). non-null assertion으로 noUncheckedIndexedAccess 우회.
  const min = samples[0]!;
  const max = samples[samples.length - 1]!;
  const median = samples[Math.floor(samples.length / 2)]!;
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  console.log(`[${name}]`);
  console.log(`  반복 횟수    : ${iters}`);
  console.log(`  결과 인스턴스: ${lastLen}`);
  console.log(
    `  소요(ms)     : min ${min.toFixed(3)} / median ${median.toFixed(3)} / avg ${avg.toFixed(3)} / max ${max.toFixed(3)}`,
  );
}

console.log(`Node.js : ${process.version}`);
console.log(`시리즈 수: ${rules.length}, 회차/시리즈: 365 (1년 매일)`);
console.log(`1주 윈도우: ${weekStart.toISOString()} ~ ${weekEnd.toISOString()}\n`);

bench('B 1주 펼침 (rrule.between)', expandWeek, 200);
bench('B 1년 전체 펼침 (rrule.all)', expandFullYear, 50);
