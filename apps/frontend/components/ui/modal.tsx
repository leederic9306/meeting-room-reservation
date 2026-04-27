'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** 푸터 슬롯 — 보통 액션 버튼들(Cancel/Submit). neutral-50 배경에 끈끈한 푸터로 렌더. */
  footer?: ReactNode;
}

/**
 * Modal — docs/07-design.md §4.6
 *
 * 네이티브 <dialog> 기반:
 * - showModal()이 자동으로 백드롭/포커스 트랩/ESC 닫기를 제공
 * - <form method="dialog">는 사용하지 않으므로 onClose는 수동
 *
 * 스타일:
 * - radius-xl, shadow-xl
 * - backdrop은 neutral-900/40 + blur-sm (살짝 깊이감)
 * - 헤더는 neutral-100 보더, 푸터는 neutral-50 배경
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
  footer,
}: ModalProps): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  // ESC, 백드롭 클릭 등 네이티브 닫힘을 부모 상태와 동기화.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const onCancel = (e: Event): void => {
      e.preventDefault();
      onClose();
    };
    dlg.addEventListener('cancel', onCancel);
    return () => dlg.removeEventListener('cancel', onCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={cn(
        // <dialog> 기본 스타일 무시하고 디자인 토큰으로 대체.
        'border-0 bg-white p-0 text-neutral-900 shadow-xl',
        'backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm',
        // 모바일(<sm): 풀스크린 시트 — 좁은 화면에서 가독성/입력 편의 우선.
        'max-sm:m-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-full max-sm:rounded-none',
        // 데스크탑(sm+): 중앙 정렬 카드, radius-xl
        'sm:max-h-[calc(100vh-2rem)] sm:w-[min(640px,calc(100vw-2rem))] sm:rounded-xl',
        className,
      )}
      onClick={(e) => {
        // 백드롭 클릭으로 닫기 — dialog 자체가 클릭 타겟이 되는 영역.
        if (e.target === ref.current) onClose();
      }}
    >
      {/* 헤더 sticky + body scroll 분리 — 풀스크린에서도 버튼 영역이 항상 노출. */}
      <div className="flex h-full max-h-[100dvh] flex-col sm:max-h-[calc(100vh-2rem)]">
        <div className="flex items-start justify-between gap-2 border-b border-neutral-100 px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-h3 font-semibold text-neutral-900">{title}</h2>
            {description ? <p className="mt-1 text-sm text-neutral-500">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-m-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-neutral-100 bg-neutral-50 px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
