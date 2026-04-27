import { forwardRef, type TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/**
 * Textarea (docs/07-design.md §4.2 — Input과 동일한 스타일 톤)
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded-lg bg-white px-3 py-2 text-sm text-neutral-900',
        'border border-neutral-200',
        'placeholder:text-neutral-400',
        'transition-colors',
        'hover:border-neutral-300',
        'focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100',
        'disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
