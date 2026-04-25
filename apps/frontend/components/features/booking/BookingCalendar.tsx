'use client';

import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { listBookingsByRange, type BookingDto, type ListBookingsParams } from '@/lib/api/bookings';
import { ceilToQuarter } from '@/lib/utils/datetime';

import { BookingDetailModal } from './BookingDetailModal';
import { CreateBookingModal } from './CreateBookingModal';

type CalendarView = 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth';

const VIEW_LABELS: Record<CalendarView, string> = {
  timeGridDay: '일',
  timeGridWeek: '주',
  dayGridMonth: '월',
};

/** 모바일 폭 임계 — Tailwind sm 미만은 일 뷰를 기본으로. */
const MOBILE_BREAKPOINT_PX = 640;

interface VisibleRange {
  start: Date;
  end: Date;
}

export function BookingCalendar(): JSX.Element {
  const calendarRef = useRef<FullCalendar>(null);
  const [view, setView] = useState<CalendarView>('timeGridWeek');
  const [range, setRange] = useState<VisibleRange | null>(null);
  const [createSlot, setCreateSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [activeBooking, setActiveBooking] = useState<BookingDto | null>(null);

  // 모바일 진입 시 일 뷰로 — 마운트 1회 + viewport 변경 시 자동 보정.
  useEffect(() => {
    const apply = (): void => {
      if (typeof window === 'undefined') return;
      const isMobile = window.innerWidth < MOBILE_BREAKPOINT_PX;
      setView((current) => {
        if (isMobile && current !== 'timeGridDay') return 'timeGridDay';
        // 데스크탑 폭으로 넓어지면 사용자가 명시적으로 바꾸기 전까지는 그대로 둔다.
        return current;
      });
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);

  const queryParams: ListBookingsParams | null = useMemo(() => {
    if (!range) return null;
    return { from: range.start.toISOString(), to: range.end.toISOString() };
  }, [range]);

  const bookingsQuery = useQuery({
    queryKey: ['bookings', queryParams],
    queryFn: () => {
      if (!queryParams) return Promise.resolve<BookingDto[]>([]);
      // 월 뷰는 한 화면 ~6주(>31일)이므로 chunk 분할 호출이 필요하다.
      return listBookingsByRange(queryParams);
    },
    enabled: queryParams !== null,
  });

  const events = useMemo(
    () =>
      (bookingsQuery.data ?? []).map((b) => ({
        id: b.id,
        title: b.title,
        start: b.startAt,
        end: b.endAt,
        // FullCalendar의 색상 토큰 — 본인 예약은 진하게, 타인은 회색.
        backgroundColor: b.isMine ? 'var(--color-primary)' : '#9ca3af', // gray-400
        borderColor: b.isMine ? 'var(--color-primary)' : '#9ca3af',
        textColor: '#ffffff',
        extendedProps: { booking: b },
      })),
    [bookingsQuery.data],
  );

  const switchView = (next: CalendarView): void => {
    setView(next);
    calendarRef.current?.getApi().changeView(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1" role="tablist" aria-label="캘린더 뷰 전환">
          {(Object.keys(VIEW_LABELS) as CalendarView[]).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => switchView(v)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                view === v
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded" style={{ backgroundColor: 'var(--color-primary)' }} />
            내 예약
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-gray-400" />
            타인 예약
          </span>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-2 sm:p-4">
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView={view}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: '', // 뷰 토글은 위쪽 커스텀 버튼으로.
          }}
          locale="ko"
          buttonText={{ today: '오늘' }}
          allDaySlot={false}
          nowIndicator
          slotDuration="00:15:00"
          slotLabelInterval="01:00"
          slotMinTime="07:00:00"
          slotMaxTime="22:00:00"
          height="auto"
          selectable
          selectMirror
          // 슬롯 선택 시간이 15분 미만이면 자동으로 1시간으로 보정 — UX 보호.
          select={(arg) => {
            const start = ceilToQuarter(arg.start);
            const minEnd = new Date(start.getTime() + 60 * 60 * 1000);
            const end = arg.end.getTime() > start.getTime() ? arg.end : minEnd;
            setCreateSlot({ start, end });
            calendarRef.current?.getApi().unselect();
          }}
          // dayGridMonth에서는 dateClick으로 진입 — 기본 1시간 슬롯 제공.
          dateClick={(arg) => {
            if (view !== 'dayGridMonth') return;
            const start = ceilToQuarter(arg.date);
            const end = new Date(start.getTime() + 60 * 60 * 1000);
            setCreateSlot({ start, end });
          }}
          eventClick={(arg) => {
            const booking = arg.event.extendedProps.booking as BookingDto | undefined;
            if (booking) setActiveBooking(booking);
          }}
          datesSet={(arg) => {
            // 보이는 범위가 바뀔 때마다 GET /bookings를 새로 호출.
            setRange({ start: arg.start, end: arg.end });
          }}
          events={events}
        />
      </div>

      {createSlot ? (
        <CreateBookingModal
          open
          onClose={() => setCreateSlot(null)}
          initialStart={createSlot.start}
          initialEnd={createSlot.end}
        />
      ) : null}

      {activeBooking ? (
        <BookingDetailModal open onClose={() => setActiveBooking(null)} booking={activeBooking} />
      ) : null}
    </div>
  );
}
