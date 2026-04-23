const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';

export interface ApiClientOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

/**
 * 백엔드 호출용 fetch 래퍼 (Phase 1 에서 인증/리프레시 토큰 인터셉터 추가 예정).
 */
export async function apiFetch<T>(path: string, options: ApiClientOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => undefined);
    throw new ApiError(response.status, errorBody);
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API 요청 실패 (status=${status})`);
    this.name = 'ApiError';
  }
}
