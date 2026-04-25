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
        'rounded-lg border bg-card p-0 text-card-foreground shadow-lg backdrop:bg-black/40',
        'w-[min(640px,calc(100vw-2rem))] max-h-[calc(100vh-2rem)]',
        className,
      )}
      onClick={(e) => {
        // 백드롭 클릭으로 닫기 — dialog 자체가 클릭 타겟이 되는 영역.
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="flex items-start justify-between border-b p-4">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="닫기"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-4">{children}</div>
    </dialog>
  );
}
