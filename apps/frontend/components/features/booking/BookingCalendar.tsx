'use client';

import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import type { ApiError } from '@/lib/api/axios';
import {
  listBookingsByRange,
  listRooms,
  updateBooking,
  type BookingDto,
  type ListBookingsParams,
  type RoomDto,
  type UpdateBookingInput,
} from '@/lib/api/bookings';
import { cn } from '@/lib/utils';
import { ceilToQuarter } from '@/lib/utils/datetime';
import { buildRoomColorMap, getRoomColor } from '@/lib/utils/room-colors';

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

/**
 * 좌우 스와이프 판정 임계값.
 * - 너무 작으면 의도치 않은 세로 스크롤이 prev/next로 새고
 * - 너무 크면 작은 화면에서 한 손 사용이 불편해진다.
 */
const SWIPE_HORIZONTAL_MIN_PX = 80;
const SWIPE_VERTICAL_MAX_PX = 50;
const SWIPE_MAX_DURATION_MS = 600;

/**
 * 모바일 여부를 동기적으로 판단. SSR 안전성은 호출 측이 책임 — 이 컴포넌트는
 * dashboard에서 ssr:false로 dynamic import되므로 window 접근이 안전하다.
 */
function isMobileWidth(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < MOBILE_BREAKPOINT_PX;
}

/** 본인 예약 강조용 테두리색 — 어떤 회의실 색상 위에서도 충분히 대비된다. */
const MINE_BORDER_COLOR = '#1f2937'; // gray-800

/**
 * 드래그/리사이즈 시 백엔드 에러코드 → 사용자 토스트 매핑.
 */
const DRAG_ERROR_TOAST: Partial<Record<string, string>> = {
  BOOKING_TIME_CONFLICT: '해당 시간대에 이미 다른 예약이 있어 이동할 수 없습니다.',
  BOOKING_TIME_NOT_QUARTER: '시작/종료 시간은 15분 단위여야 합니다.',
  BOOKING_TIME_PAST: '과거 시점으로 이동할 수 없습니다.',
  BOOKING_DURATION_EXCEEDED: '예약은 최대 4시간까지 가능합니다.',
  BOOKING_PAST_NOT_EDITABLE: '이미 시작된 예약은 변경할 수 없습니다.',
  BOOKING_OWNERSHIP_REQUIRED: '본인 예약만 변경할 수 있습니다.',
};

interface VisibleRange {
  start: Date;
  end: Date;
}

export function BookingCalendar(): JSX.Element {
  const calendarRef = useRef<FullCalendar>(null);
  const queryClient = useQueryClient();
  const [view, setView] = useState<CalendarView>(() =>
    isMobileWidth() ? 'timeGridDay' : 'timeGridWeek',
  );
  const [range, setRange] = useState<VisibleRange | null>(null);
  /** 컨트롤 바 좌측에 표시할 날짜 라벨 — FullCalendar view.title 을 그대로 사용. */
  const [rangeLabel, setRangeLabel] = useState<string>('');
  const [createSlot, setCreateSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [activeBooking, setActiveBooking] = useState<BookingDto | null>(null);
  /** undefined = 전체. 특정 회의실 선택 시 해당 id만 조회한다. */
  const [selectedRoomId, setSelectedRoomId] = useState<string | undefined>(undefined);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const moveOrResizeMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: UpdateBookingInput }) =>
      updateBooking(id, values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });

  // 회전/리사이즈로 모바일↔데스크탑 경계를 넘는 경우만 보정.
  useEffect(() => {
    const onResize = (): void => {
      if (!isMobileWidth()) return;
      setView((current) => (current === 'timeGridDay' ? current : 'timeGridDay'));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const roomsQuery = useQuery<RoomDto[]>({
    queryKey: ['rooms'],
    queryFn: listRooms,
    staleTime: 5 * 60 * 1000,
  });

  const rooms = useMemo(() => roomsQuery.data ?? [], [roomsQuery.data]);
  const roomColorMap = useMemo(() => buildRoomColorMap(rooms), [rooms]);
  const sortedRooms = useMemo(
    () =>
      [...rooms].sort((a, b) => {
        if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
        return a.name.localeCompare(b.name, 'ko');
      }),
    [rooms],
  );

  const queryParams: ListBookingsParams | null = useMemo(() => {
    if (!range) return null;
    return {
      from: range.start.toISOString(),
      to: range.end.toISOString(),
      ...(selectedRoomId !== undefined && { roomId: selectedRoomId }),
    };
  }, [range, selectedRoomId]);

  const bookingsQuery = useQuery({
    queryKey: ['bookings', queryParams],
    queryFn: () => {
      if (!queryParams) return Promise.resolve<BookingDto[]>([]);
      return listBookingsByRange(queryParams);
    },
    enabled: queryParams !== null,
  });

  const events = useMemo(
    () =>
      (bookingsQuery.data ?? []).map((b) => {
        const roomColor = getRoomColor(roomColorMap, b.room.id);
        const isPast = new Date(b.endAt).getTime() < Date.now();
        const isRecurrence = b.recurrenceId !== null;
        const canEdit = b.isMine && !isPast && !isRecurrence;
        return {
          id: b.id,
          title: b.title,
          start: b.startAt,
          end: b.endAt,
          backgroundColor: roomColor,
          borderColor: b.isMine ? MINE_BORDER_COLOR : roomColor,
          textColor: '#ffffff',
          classNames: [
            ...(b.isMine ? ['fc-event-mine'] : []),
            ...(canEdit ? ['fc-event-editable'] : ['fc-event-readonly']),
          ],
          editable: canEdit,
          startEditable: canEdit,
          durationEditable: canEdit,
          extendedProps: { booking: b },
        };
      }),
    [bookingsQuery.data, roomColorMap],
  );

  const switchView = (next: CalendarView): void => {
    setView(next);
    calendarRef.current?.getApi().changeView(next);
  };

  const goPrev = (): void => calendarRef.current?.getApi().prev();
  const goNext = (): void => calendarRef.current?.getApi().next();
  const goToday = (): void => calendarRef.current?.getApi().today();

  /** 새 예약 버튼 — 가장 가까운 다음 15분 시작, 1시간 슬롯 기본 */
  const openCreateNow = (): void => {
    const start = ceilToQuarter(new Date());
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    setCreateSlot({ start, end });
  };

  // ----- 좌우 스와이프 (touch) → prev/next 이동 -----
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>): void => {
    const t = e.touches[0];
    if (e.touches.length !== 1 || !t) {
      touchStartRef.current = null;
      return;
    }
    touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
  };
  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>): void => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const dt = Date.now() - start.time;
    if (dt > SWIPE_MAX_DURATION_MS) return;
    if (Math.abs(dy) > SWIPE_VERTICAL_MAX_PX) return;
    if (Math.abs(dx) < SWIPE_HORIZONTAL_MIN_PX) return;
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (dx > 0) api.prev();
    else api.next();
  };

  return (
    <div>
      {/* === 페이지 헤더 === */}
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">캘린더</p>
          <h1 className="mt-1 text-h1 font-semibold tracking-tight text-neutral-900">
            {rangeLabel || '예약 현황'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="default" size="default" onClick={openCreateNow}>
            <Plus className="h-4 w-4" strokeWidth={2.25} />새 예약
          </Button>
        </div>
      </div>

      {/* === 컨트롤 바 === */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-xs">
        {/* 좌측 — 날짜 네비게이션 */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            aria-label="이전"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="inline-flex h-8 items-center rounded-md border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            오늘
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="다음"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* 중앙 — 회의실 Pill 필터 */}
        <RoomPillFilter
          rooms={sortedRooms}
          roomColorMap={roomColorMap}
          selectedRoomId={selectedRoomId}
          onSelect={setSelectedRoomId}
          loading={roomsQuery.isLoading}
        />

        {/* 우측 — 뷰 전환 (Segmented Control) */}
        <div
          role="tablist"
          aria-label="캘린더 뷰 전환"
          className="inline-flex items-center gap-0.5 rounded-md bg-neutral-100 p-0.5"
        >
          {(Object.keys(VIEW_LABELS) as CalendarView[]).map((v) => {
            const active = view === v;
            return (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchView(v)}
                className={cn(
                  'inline-flex h-8 min-w-[44px] items-center justify-center rounded px-3 text-sm font-medium transition-all',
                  active
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-900',
                )}
              >
                {VIEW_LABELS[v]}
              </button>
            );
          })}
        </div>
      </div>

      {/* 본인 예약/타임존 안내 — 컨트롤 바 아래 작은 메타 줄 */}
      <div className="mb-3 flex flex-wrap items-center justify-end gap-3 text-xs text-neutral-500">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2 py-0.5"
          title="모든 예약 시간은 한국 표준시(Asia/Seoul, UTC+9) 기준입니다."
        >
          한국 표준시 · UTC+9
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-3 w-3 rounded border-2"
            style={{ borderColor: MINE_BORDER_COLOR, backgroundColor: '#e5e7eb' }}
          />
          내 예약
        </span>
      </div>

      {/* === 캘린더 본체 === */}
      <div
        className="overflow-hidden rounded-xl border border-neutral-200 bg-white p-2 shadow-xs sm:p-4"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: 'pan-y' }}
      >
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView={view}
          // 자체 헤더 비활성 — 위쪽 커스텀 컨트롤 바로 모두 대체.
          headerToolbar={false}
          locale="ko"
          buttonText={{ today: '오늘' }}
          allDaySlot={false}
          nowIndicator
          weekends
          slotDuration="00:15:00"
          slotLabelInterval="01:00"
          slotMinTime="07:00:00"
          slotMaxTime="22:00:00"
          height="auto"
          selectable
          selectMirror
          editable
          eventStartEditable
          eventDurationEditable
          snapDuration="00:15:00"
          select={(arg) => {
            const start = ceilToQuarter(arg.start);
            const minEnd = new Date(start.getTime() + 60 * 60 * 1000);
            const end = arg.end.getTime() > start.getTime() ? arg.end : minEnd;
            setCreateSlot({ start, end });
            calendarRef.current?.getApi().unselect();
          }}
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
          eventDrop={(arg) => {
            const booking = arg.event.extendedProps.booking as BookingDto | undefined;
            const start = arg.event.start;
            const end = arg.event.end;
            if (!booking || !start || !end) {
              arg.revert();
              return;
            }
            moveOrResizeMutation.mutate(
              {
                id: booking.id,
                values: { startAt: start.toISOString(), endAt: end.toISOString() },
              },
              {
                onSuccess: () => toast.success('예약 시간을 이동했습니다.'),
                onError: (error) => {
                  const e = error as ApiError;
                  toast.error(DRAG_ERROR_TOAST[e.code] ?? e.userMessage);
                  arg.revert();
                },
              },
            );
          }}
          eventResize={(arg) => {
            const booking = arg.event.extendedProps.booking as BookingDto | undefined;
            const start = arg.event.start;
            const end = arg.event.end;
            if (!booking || !start || !end) {
              arg.revert();
              return;
            }
            moveOrResizeMutation.mutate(
              {
                id: booking.id,
                values: { startAt: start.toISOString(), endAt: end.toISOString() },
              },
              {
                onSuccess: () => toast.success('예약 길이를 변경했습니다.'),
                onError: (error) => {
                  const e = error as ApiError;
                  toast.error(DRAG_ERROR_TOAST[e.code] ?? e.userMessage);
                  arg.revert();
                },
              },
            );
          }}
          eventContent={(arg) => {
            const booking = arg.event.extendedProps.booking as BookingDto | undefined;
            const isRecurrence =
              booking?.recurrenceId !== null && booking?.recurrenceId !== undefined;
            const isMonthView = arg.view.type === 'dayGridMonth';
            return (
              <div className="flex items-center gap-1 overflow-hidden px-1 text-[0.8125rem] leading-snug">
                {isMonthView ? (
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: arg.event.backgroundColor }}
                  />
                ) : null}
                {arg.timeText ? (
                  <span className="shrink-0 font-medium tabular">{arg.timeText}</span>
                ) : null}
                {isRecurrence ? (
                  <span aria-label="반복 예약" title="반복 예약" className="shrink-0">
                    ↻
                  </span>
                ) : null}
                <span className="truncate">{arg.event.title}</span>
              </div>
            );
          }}
          datesSet={(arg) => {
            // 보이는 범위가 바뀔 때마다 GET /bookings를 새로 호출.
            setRange({ start: arg.start, end: arg.end });
            // 컨트롤 바 좌측 라벨에 사용할 제목.
            setRangeLabel(arg.view.title);
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
          defaultRoomId={selectedRoomId}
        />
      ) : null}

      {activeBooking ? (
        <BookingDetailModal open onClose={() => setActiveBooking(null)} booking={activeBooking} />
      ) : null}
    </div>
  );
}

interface RoomPillFilterProps {
  rooms: RoomDto[];
  roomColorMap: Map<string, string>;
  selectedRoomId: string | undefined;
  onSelect: (roomId: string | undefined) => void;
  loading: boolean;
}

/**
 * Pill 형태 회의실 필터 — 컨트롤 바 중앙에 위치 (§5.4).
 * 활성 시 brand-50 배경 + brand-700 텍스트, 비활성은 회의실 컬러 도트만 노출.
 */
function RoomPillFilter({
  rooms,
  roomColorMap,
  selectedRoomId,
  onSelect,
  loading,
}: RoomPillFilterProps): JSX.Element {
  const activeRooms = rooms.filter((r) => r.isActive);

  return (
    <div role="toolbar" aria-label="회의실 필터" className="flex flex-wrap items-center gap-1.5">
      <RoomPill
        label="전체"
        selected={selectedRoomId === undefined}
        onClick={() => onSelect(undefined)}
      />
      {loading && rooms.length === 0 ? (
        <span className="text-xs text-neutral-400">불러오는 중...</span>
      ) : null}
      {activeRooms.map((room) => (
        <RoomPill
          key={room.id}
          label={room.name}
          color={getRoomColor(roomColorMap, room.id)}
          selected={selectedRoomId === room.id}
          onClick={() => onSelect(room.id)}
        />
      ))}
    </div>
  );
}

interface RoomPillProps {
  label: string;
  color?: string;
  selected: boolean;
  onClick: () => void;
}

function RoomPill({ label, color, selected, onClick }: RoomPillProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors',
        selected
          ? 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-500/20'
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
      )}
    >
      {color ? (
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      ) : null}
      {label}
    </button>
  );
}
