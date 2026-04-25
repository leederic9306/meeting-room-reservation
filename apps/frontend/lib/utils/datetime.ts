/**
 * 캘린더/예약 모달용 시간 유틸. 모든 날짜/시간 비교는 UTC 기준 ISO 문자열로 다룬다.
 * 표시(`<input type="datetime-local">`)는 사용자 로컬 시간대를 사용한다.
 */

const MS_PER_MINUTE = 60_000;

/** Date → 사용자 로컬 시간대 기준 `YYYY-MM-DDTHH:mm` (datetime-local input value). */
export function toLocalInputValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * MS_PER_MINUTE;
  // toISOString은 UTC 기준이므로 로컬 오프셋만큼 빼서 같은 "벽시계" 시각을 얻는다.
  const local = new Date(date.getTime() - offsetMs);
  return local.toISOString().slice(0, 16);
}

/** datetime-local input value(`YYYY-MM-DDTHH:mm`) → 백엔드용 UTC ISO 문자열. */
export function fromLocalInputValue(value: string): string {
  // datetime-local은 시간대 정보가 없는 "wall clock". new Date()는 로컬로 해석.
  const d = new Date(value);
  return d.toISOString();
}

/** 분 단위 15 경계로 올림한 Date(밀리초). */
export function ceilToQuarter(date: Date): Date {
  const ms = date.getTime();
  const quarter = 15 * MS_PER_MINUTE;
  return new Date(Math.ceil(ms / quarter) * quarter);
}

/** 두 ISO datetime이 정확히 같은 시점인가. */
export function isQuarterAligned(date: Date): boolean {
  return (
    date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0 && date.getUTCMinutes() % 15 === 0
  );
}

/** 한국 표시용 "M월 D일 (요일) HH:mm" 포맷터 (Asia/Seoul 타임존). */
export function formatKstDateTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
}

/** "HH:mm ~ HH:mm" 짧은 시간 범위 (같은 날 가정). */
export function formatKstTimeRange(startIso: string, endIso: string): string {
  const fmt = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return `${fmt.format(new Date(startIso))} ~ ${fmt.format(new Date(endIso))}`;
}
