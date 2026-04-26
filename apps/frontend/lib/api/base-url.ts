/**
 * API base URL 계산.
 *
 * - `NEXT_PUBLIC_API_BASE_URL`이 명시되면 그대로 사용 (운영/스테이징).
 * - dev에서는 사용자가 접속한 hostname을 그대로 따라간다 (`localhost`로 들어왔으면
 *   `localhost:3001`, `127.0.0.1`로 들어왔으면 `127.0.0.1:3001`).
 *   이렇게 하지 않으면 frontend(`127.0.0.1:3000`)와 backend(`localhost:3001`)가
 *   서로 다른 site로 취급되어 SameSite=Strict인 refresh 쿠키가 전송되지 않는다.
 * - SSR/빌드 타임처럼 `window`가 없을 때는 안전한 기본값(`localhost:3001`)을 쓴다.
 *   (이 경로의 호출은 SSR에서 실제로 발생하지 않지만 import-time 안전장치.)
 */
export function getApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:3001/api/v1`;
  }
  return 'http://localhost:3001/api/v1';
}
