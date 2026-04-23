import { create } from 'zustand';

/**
 * UI 전역 상태 예시 — 서버 상태는 TanStack Query, 클라이언트 전역만 여기.
 * 도메인별 store는 파일 분리: auth.store.ts, booking-draft.store.ts 등.
 */
interface UiState {
  isSidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  isSidebarOpen: true,
  openSidebar: () => set({ isSidebarOpen: true }),
  closeSidebar: () => set({ isSidebarOpen: false }),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
}));
