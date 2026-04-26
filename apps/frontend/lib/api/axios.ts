import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

import { clearSession, getAccessToken, setAccessToken } from '@/stores/auth.store';

import { getApiBaseUrl } from './base-url';

// 인증 인터셉터 전용 사설 옵션. 호출자가 axios 표준 config 자리에 그대로 넘길 수 있도록
// AxiosRequestConfig에 합쳐 둔다.
declare module 'axios' {
  interface AxiosRequestConfig {
    _retry?: boolean;
    _skipAuthRefresh?: boolean;
  }
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly userMessage: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(userMessage);
    this.name = 'ApiError';
  }
}

// baseURL은 인스턴스 생성 시점에 한 번 평가되어 SSR 환경에서 잘못된 host로 고정될
// 위험이 있어, 요청 시점에 인터셉터에서 결정한다 (window.location.hostname 기반).
export const api: AxiosInstance = axios.create({
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.baseURL = getApiBaseUrl();
  const token = getAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshInFlight: Promise<string> | undefined;

async function requestRefresh(): Promise<string> {
  // Refresh Token은 HttpOnly 쿠키로 전송되므로 별도 헤더 불필요.
  const response = await axios.post<{ data: { accessToken: string } }>(
    `${getApiBaseUrl()}/auth/refresh`,
    {},
    { withCredentials: true },
  );
  return response.data.data.accessToken;
}

function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  const current = window.location.pathname + window.location.search;
  if (window.location.pathname.startsWith('/login')) return;
  const next = encodeURIComponent(current);
  window.location.assign(`/login?next=${next}`);
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as AxiosRequestConfig | undefined;
    const status = error.response?.status;
    const body = error.response?.data;

    // 401 → refresh 후 재시도. 단, refresh 자체 401, 또는 이미 재시도한 요청은 제외.
    // Authorization 헤더 없이 보낸 요청의 401은 보통 자격 증명 실패(예: login
    // INVALID_CREDENTIALS)이지만, 페이지 새로고침 직후처럼 access token이 메모리에서
    // 사라졌고 mr_session 마커 쿠키가 살아있는 경우(=백엔드 refresh 쿠키도 살아있을
    // 가능성)는 정상 흐름이므로 refresh를 시도해야 한다.
    const isRefreshCall = original?.url?.includes('/auth/refresh');
    const hadBearer = Boolean(
      (original?.headers as Record<string, string> | undefined)?.Authorization,
    );
    const sessionMaybeAlive =
      typeof document !== 'undefined' && /(?:^|;\s*)mr_session=1/.test(document.cookie);
    if (
      status === 401 &&
      original &&
      !original._retry &&
      !original._skipAuthRefresh &&
      !isRefreshCall &&
      (hadBearer || sessionMaybeAlive)
    ) {
      original._retry = true;
      try {
        refreshInFlight ??= requestRefresh().finally(() => {
          refreshInFlight = undefined;
        });
        const newToken = await refreshInFlight;
        setAccessToken(newToken);
        if (original.headers) {
          (original.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
        }
        return api.request(original);
      } catch {
        clearSession();
        redirectToLogin();
        return Promise.reject(
          new ApiError(401, 'UNAUTHORIZED', '세션이 만료되었습니다. 다시 로그인해주세요.'),
        );
      }
    }

    if (body?.error) {
      return Promise.reject(
        new ApiError(status ?? 500, body.error.code, body.error.message, body.error.details),
      );
    }

    return Promise.reject(
      new ApiError(status ?? 0, 'NETWORK_ERROR', error.message || '네트워크 오류가 발생했습니다.'),
    );
  },
);

export function unwrap<T>(payload: { data: T }): T {
  return payload.data;
}
