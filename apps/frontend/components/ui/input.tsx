import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Input (docs/07-design.md §4.2)
 *
 * - 고정 높이 40px, radius-lg, neutral-200 보더
 * - 포커스: brand-500 보더 + brand-100 ring(4px)
 * - 디자인 가이드 §4.2: "border가 너무 진하고 radius가 작음" → 토큰 적용으로 즉시 개선
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-lg bg-white px-3 py-2 text-sm text-neutral-900',
          'border border-neutral-200',
          'placeholder:text-neutral-400',
          'transition-colors',
          'hover:border-neutral-300',
          'focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100',
          'disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
