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
}

/**
 * 네이티브 <dialog> 기반 모달.
 * - showModal()이 자동으로 백드롭/포커스 트랩/ESC 닫기를 제공한다.
 * - <form method="dialog">는 사용하지 않으므로 onClose는 수동으로 호출.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
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
        // <dialog>의 기본 스타일을 무시하고 shadcn 톤으로 대체.
        'border bg-card p-0 text-card-foreground shadow-lg backdrop:bg-black/40',
        // 모바일(<sm): 풀스크린 시트 — 좁은 화면에서 가독성/입력 편의 우선.
        // dvh를 써야 iOS 주소창 변동 시 빈 영역이 안 생긴다.
        'max-sm:m-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-full max-sm:rounded-none',
        // 데스크탑(sm+): 중앙 정렬 카드.
        'sm:max-h-[calc(100vh-2rem)] sm:w-[min(640px,calc(100vw-2rem))] sm:rounded-lg',
        className,
      )}
      onClick={(e) => {
        // 백드롭 클릭으로 닫기 — dialog 자체가 클릭 타겟이 되는 영역.
        if (e.target === ref.current) onClose();
      }}
    >
      {/* 헤더 sticky + body scroll 분리 — 풀스크린에서도 버튼 영역이 항상 노출. */}
      <div className="flex h-full max-h-[100dvh] flex-col sm:max-h-[calc(100vh-2rem)]">
        <div className="flex items-start justify-between gap-2 border-b p-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            // 터치 타겟 44x44 보장 — iOS HIG / Material 가이드.
            className="-m-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </dialog>
  );
}
