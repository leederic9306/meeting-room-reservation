'use client';

import dynamic from 'next/dynamic';

// FullCalendar는 마운트 시점에 window에 접근하므로 SSR 비활성.
const BookingCalendar = dynamic(
  () => import('@/components/features/booking/BookingCalendar').then((m) => m.BookingCalendar),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[600px] items-center justify-center text-sm text-neutral-500">
        캘린더 불러오는 중...
      </div>
    ),
  },
);

export default function DashboardPage(): JSX.Element {
  return <BookingCalendar />;
}
