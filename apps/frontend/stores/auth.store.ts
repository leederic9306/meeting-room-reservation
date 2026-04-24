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

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: undefined,
      user: undefined,
      setSession: ({ accessToken, user }) => set({ accessToken, user }),
      setAccessToken: (accessToken) => set({ accessToken }),
      clear: () => set({ accessToken: undefined, user: undefined }),
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
