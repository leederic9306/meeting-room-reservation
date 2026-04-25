'use client';

import dynamic from 'next/dynamic';

// FullCalendar는 마운트 시점에 window에 접근하므로 SSR 비활성.
const BookingCalendar = dynamic(
  () => import('@/components/features/booking/BookingCalendar').then((m) => m.BookingCalendar),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[600px] items-center justify-center text-sm text-muted-foreground">
        캘린더 불러오는 중...
      </div>
    ),
  },
);

export default function DashboardPage(): JSX.Element {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">대시보드</h1>
      <p className="text-sm text-muted-foreground">
        빈 슬롯을 클릭하면 예약 생성, 예약을 클릭하면 상세 정보를 확인할 수 있습니다.
      </p>
      <BookingCalendar />
    </div>
  );
}
