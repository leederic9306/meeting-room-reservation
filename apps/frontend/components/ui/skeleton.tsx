import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/**
 * 로딩 중 자리만 표시하는 placeholder. (docs/07-design.md §6.3)
 * - neutral-100 배경 + animate-pulse, radius-md
 * - 폭/높이는 className으로 호출 측이 지정.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('animate-pulse rounded-md bg-neutral-100', className)} {...props} />;
}
