import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/**
 * 로딩 중 차지할 자리만 표시하는 placeholder.
 * - 색은 muted, animate-pulse로 살짝 깜빡임.
 * - 폭/높이는 className으로 호출 측이 지정.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}
