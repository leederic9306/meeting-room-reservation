import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/**
 * Button (docs/07-design.md §4.1)
 *
 * - default(primary): brand-500 → 600(hover) → 700(active)
 * - secondary: 흰 배경 + neutral 보더, 가장 많이 쓰이는 보조 액션
 * - outline: secondary와 시각적 동일 — shadcn 호환을 위해 alias로 유지
 * - destructive(=danger): 삭제 등 위험 액션
 * - ghost: 탭/네비게이션, 호버 배경만
 * - link: 인라인 텍스트 링크
 *
 * Focus ring 은 brand-100 으로 통일. scale 변형 없음 (§6.2 — 색상만).
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'rounded-lg text-sm font-semibold',
    'transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 focus-visible:ring-offset-0',
    'disabled:opacity-50 disabled:pointer-events-none',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'bg-brand-500 text-white shadow-xs hover:bg-brand-600 active:bg-brand-700',
        secondary: [
          'bg-white text-neutral-700 border border-neutral-200',
          'hover:bg-neutral-50 hover:border-neutral-300 active:bg-neutral-100',
        ].join(' '),
        outline: [
          'bg-white text-neutral-700 border border-neutral-200',
          'hover:bg-neutral-50 hover:border-neutral-300 active:bg-neutral-100',
        ].join(' '),
        destructive: 'bg-danger-500 text-white shadow-xs hover:bg-danger-700',
        ghost: 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
        link: 'text-brand-600 underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        default: 'h-10 px-4',
        lg: 'h-12 px-5 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
