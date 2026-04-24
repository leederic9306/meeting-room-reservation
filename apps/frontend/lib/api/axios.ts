import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

import { clearSession, getAccessToken, setAccessToken } from '@/stores/auth.store';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';

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

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

interface RetriableConfig extends AxiosRequestConfig {
  _retry?: boolean;
  _skipAuthRefresh?: boolean;
}

let refreshInFlight: Promise<string> | undefined;

async function requestRefresh(): Promise<string> {
  // Refresh Token은 HttpOnly 쿠키로 전송되므로 별도 헤더 불필요.
  const response = await axios.post<{ data: { accessToken: string } }>(
    `${API_BASE_URL}/auth/refresh`,
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
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    const body = error.response?.data;

    // 401 → refresh 후 재시도. 단, refresh 자체 401, 또는 이미 재시도한 요청은 제외.
    const isRefreshCall = original?.url?.includes('/auth/refresh');
    if (
      status === 401 &&
      original &&
      !original._retry &&
      !original._skipAuthRefresh &&
      !isRefreshCall
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
