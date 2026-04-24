import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type AuthRole = 'USER' | 'ADMIN';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: AuthRole;
}

interface AuthState {
  accessToken: string | undefined;
  user: AuthUser | undefined;
  setSession: (payload: { accessToken: string; user: AuthUser }) => void;
  setAccessToken: (accessToken: string) => void;
  clear: () => void;
}

// Refresh Token TTL(14일)과 동일. 프런트 미들웨어가 보호 라우트 접근 시
// "세션이 있을 법함"을 판단하기 위한 비민감 마커(값은 항상 "1").
const SESSION_COOKIE = 'mr_session';
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

function writeSessionCookie(): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${SESSION_COOKIE}=1; Path=/; Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

function eraseSessionCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: undefined,
      user: undefined,
      setSession: ({ accessToken, user }) => {
        writeSessionCookie();
        set({ accessToken, user });
      },
      setAccessToken: (accessToken) => set({ accessToken }),
      clear: () => {
        eraseSessionCookie();
        set({ accessToken: undefined, user: undefined });
      },
    }),
    {
      name: 'meeting-room.auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user }),
    },
  ),
);

export function getAccessToken(): string | undefined {
  return useAuthStore.getState().accessToken;
}

export function setAccessToken(accessToken: string): void {
  useAuthStore.getState().setAccessToken(accessToken);
}

export function clearSession(): void {
  useAuthStore.getState().clear();
}
