/**
 * `Cookie` 헤더 문자열을 name → value 맵으로 파싱한다.
 * cookie-parser를 추가하지 않기 위한 최소 유틸 (Refresh Token 한 건만 읽는다).
 */
export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const name = trimmed.slice(0, eqIdx);
    const raw = trimmed.slice(eqIdx + 1);
    try {
      cookies[name] = decodeURIComponent(raw);
    } catch {
      cookies[name] = raw;
    }
  }
  return cookies;
}
