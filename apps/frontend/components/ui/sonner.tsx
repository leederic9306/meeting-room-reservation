'use client';

import { Toaster as SonnerToaster, type ToasterProps } from 'sonner';

/**
 * Toaster — docs/07-design.md §6.4
 *
 * - position: 우측 상단 (top-right)
 * - 디자인 토큰으로 커스터마이즈된 톤(success/warning/error/info)
 * - radius-lg, shadow-lg, semantic 컬러 + 좌측 4px 강조 라인
 *
 * richColors=false 로 설정하고 톤별 클래스 직접 지정 — sonner 기본 진한 단색이
 * 디자인 시스템(연한 50 배경 + 700 텍스트)와 충돌하기 때문.
 */
export function Toaster(props: ToasterProps): JSX.Element {
  return (
    <SonnerToaster
      theme="light"
      position="top-right"
      closeButton
      duration={4000}
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            'group toast pointer-events-auto flex w-full items-start gap-3 rounded-lg border bg-white p-4 pr-10 shadow-lg',
          title: 'text-sm font-semibold text-neutral-900',
          description: 'mt-1 text-xs text-neutral-500',
          actionButton:
            'h-8 rounded-md bg-brand-500 px-3 text-xs font-semibold text-white hover:bg-brand-600',
          cancelButton:
            'h-8 rounded-md border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 hover:bg-neutral-50',
          closeButton:
            'absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600',
          // 톤별 좌측 4px 보더 + 옅은 배경 (semantic 토큰)
          success: 'border-success-500/20 bg-success-50/30 border-l-4 border-l-success-500',
          error: 'border-danger-500/20 bg-danger-50/30 border-l-4 border-l-danger-500',
          warning: 'border-warning-500/20 bg-warning-50/30 border-l-4 border-l-warning-500',
          info: 'border-brand-500/20 bg-brand-50/30 border-l-4 border-l-brand-500',
        },
      }}
      {...props}
    />
  );
}
