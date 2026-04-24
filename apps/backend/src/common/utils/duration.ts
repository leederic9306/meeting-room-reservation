const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * `15m`, `14d`, `500ms` 같은 간단한 기간 문자열을 ms로 변환한다.
 * ConfigService의 JWT_*_EXPIRES_IN 값과 일관된 단위 체계를 쓰기 위한 유틸.
 */
export function parseDurationToMs(duration: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(duration.trim());
  if (!match) {
    throw new Error(`지원하지 않는 기간 형식: "${duration}"`);
  }
  const value = Number(match[1]);
  const unit = match[2] as keyof typeof UNIT_MS;
  return value * UNIT_MS[unit]!;
}
