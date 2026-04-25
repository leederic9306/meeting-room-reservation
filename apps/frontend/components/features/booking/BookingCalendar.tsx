'use client';

import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  listBookingsByRange,
  listRooms,
  type BookingDto,
  type ListBookingsParams,
  type RoomDto,
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

/** 본인 예약 강조용 테두리색 — 어떤 회의실 색상 위에서도 충분히 대비된다. */
const MINE_BORDER_COLOR = '#1f2937'; // gray-800

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
  /** undefined = 전체. 특정 회의실 선택 시 해당 id만 조회한다. */
  const [selectedRoomId, setSelectedRoomId] = useState<string | undefined>(undefined);

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

  const roomsQuery = useQuery<RoomDto[]>({
    queryKey: ['rooms'],
    queryFn: listRooms,
    staleTime: 5 * 60 * 1000,
  });

  const rooms = useMemo(() => roomsQuery.data ?? [], [roomsQuery.data]);
  const roomColorMap = useMemo(() => buildRoomColorMap(rooms), [rooms]);
  // 정렬된 회의실 목록 — 필터 칩과 범례에서 동일 순서로 노출.
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
      // 월 뷰는 한 화면 ~6주(>31일)이므로 chunk 분할 호출이 필요하다.
      return listBookingsByRange(queryParams);
    },
    enabled: queryParams !== null,
  });

  const events = useMemo(
    () =>
      (bookingsQuery.data ?? []).map((b) => {
        const roomColor = getRoomColor(roomColorMap, b.room.id);
        return {
          id: b.id,
          title: b.title,
          start: b.startAt,
          end: b.endAt,
          backgroundColor: roomColor,
          // 본인 예약은 어두운 테두리로 구분 — 어떤 회의실 색이든 위에서 잘 보인다.
          borderColor: b.isMine ? MINE_BORDER_COLOR : roomColor,
          textColor: '#ffffff',
          classNames: b.isMine ? ['fc-event-mine'] : [],
          extendedProps: { booking: b },
        };
      }),
    [bookingsQuery.data, roomColorMap],
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
            <span
              className="h-3 w-3 rounded border-2"
              style={{ borderColor: MINE_BORDER_COLOR, backgroundColor: '#e5e7eb' }}
            />
            내 예약
          </span>
        </div>
      </div>

      <RoomFilterChips
        rooms={sortedRooms}
        roomColorMap={roomColorMap}
        selectedRoomId={selectedRoomId}
        onSelect={setSelectedRoomId}
        loading={roomsQuery.isLoading}
      />

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
          eventContent={(arg) => {
            const booking = arg.event.extendedProps.booking as BookingDto | undefined;
            const isRecurrence =
              booking?.recurrenceId !== null && booking?.recurrenceId !== undefined;
            return (
              <div className="flex items-center gap-1 overflow-hidden px-1 text-xs">
                {arg.timeText ? <span className="shrink-0 font-medium">{arg.timeText}</span> : null}
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

interface RoomFilterChipsProps {
  rooms: RoomDto[];
  roomColorMap: Map<string, string>;
  selectedRoomId: string | undefined;
  onSelect: (roomId: string | undefined) => void;
  loading: boolean;
}

function RoomFilterChips({
  rooms,
  roomColorMap,
  selectedRoomId,
  onSelect,
  loading,
}: RoomFilterChipsProps): JSX.Element {
  const activeRooms = rooms.filter((r) => r.isActive);

  return (
    <div
      role="toolbar"
      aria-label="회의실 필터"
      className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2"
    >
      <span className="px-1 text-xs font-medium text-muted-foreground">회의실</span>
      <FilterChip
        label="전체"
        selected={selectedRoomId === undefined}
        onClick={() => onSelect(undefined)}
      />
      {loading && rooms.length === 0 ? (
        <span className="text-xs text-muted-foreground">불러오는 중...</span>
      ) : null}
      {activeRooms.map((room) => (
        <FilterChip
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

interface FilterChipProps {
  label: string;
  color?: string;
  selected: boolean;
  onClick: () => void;
}

function FilterChip({ label, color, selected, onClick }: FilterChipProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        selected
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {color ? (
        <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      ) : null}
      {label}
    </button>
  );
}
