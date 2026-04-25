'use client';

import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

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
 * - 충돌은 사용자가 가장 흔히 마주치는 케이스 — 한 줄로 안내 후 revert.
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
  // 첫 렌더부터 모바일이면 일 뷰. ssr:false 보장이 있어 동기적으로 판단 가능.
  const [view, setView] = useState<CalendarView>(() =>
    isMobileWidth() ? 'timeGridDay' : 'timeGridWeek',
  );
  const [range, setRange] = useState<VisibleRange | null>(null);
  const [createSlot, setCreateSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [activeBooking, setActiveBooking] = useState<BookingDto | null>(null);
  /** undefined = 전체. 특정 회의실 선택 시 해당 id만 조회한다. */
  const [selectedRoomId, setSelectedRoomId] = useState<string | undefined>(undefined);
  // 좌우 스와이프 추적용 ref. ref로 두면 setState 리렌더 없이 터치 이벤트 누적이 가능하다.
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // 드래그/리사이즈 시 호출. 성공 시 invalidate, 실패 시 호출자가 revert를 책임진다.
  const moveOrResizeMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: UpdateBookingInput }) =>
      updateBooking(id, values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });

  // 회전/리사이즈로 모바일↔데스크탑 경계를 넘는 경우만 보정.
  // 데스크탑 → 모바일: 자동으로 일 뷰로. 그 반대는 사용자 선택 존중.
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
        // 드래그/리사이즈 허용 조건:
        //  - 본인 예약
        //  - 아직 시작 전 (이미 시작했으면 백엔드가 BOOKING_PAST_NOT_EDITABLE)
        //  - 단일 예약 (반복 회차는 scope 결정이 필요해 모달에서만 처리 — UX 보호)
        const isPast = new Date(b.endAt).getTime() < Date.now();
        const isRecurrence = b.recurrenceId !== null;
        const canEdit = b.isMine && !isPast && !isRecurrence;
        return {
          id: b.id,
          title: b.title,
          start: b.startAt,
          end: b.endAt,
          backgroundColor: roomColor,
          // 본인 예약은 어두운 테두리로 구분 — 어떤 회의실 색이든 위에서 잘 보인다.
          borderColor: b.isMine ? MINE_BORDER_COLOR : roomColor,
          textColor: '#ffffff',
          classNames: [
            ...(b.isMine ? ['fc-event-mine'] : []),
            ...(canEdit ? ['fc-event-editable'] : ['fc-event-readonly']),
          ],
          // per-event 권한. FullCalendar 전역 editable=true 위에서 false면 드래그/리사이즈 차단.
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

  /**
   * 좌우 스와이프 → 이전/다음 기간 이동.
   * - 빠른 스와이프(<600ms)만 인식 — 길게 누른 동작은 FullCalendar가 select/drag로 사용.
   * - 세로 변위가 크면 무시 — 페이지 세로 스크롤과 충돌 방지.
   * - FullCalendar는 longPressDelay(기본 1000ms) 후에야 select가 트리거되므로
   *   600ms 미만 스와이프는 슬롯 선택과 충돌하지 않는다.
   */
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
    // 좌→우 스와이프(dx>0)는 이전 기간, 우→좌(dx<0)는 다음 기간 — Google Calendar 동일.
    if (dx > 0) api.prev();
    else api.next();
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
              // 모바일 터치 타겟 44px 보장(min-h/min-w). 데스크탑은 시각상 sm-h-9 유지.
              className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md px-3 text-sm font-medium transition-colors sm:min-h-[36px] sm:min-w-0 ${
                view === v
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span
            className="rounded-full border border-input bg-muted/40 px-2 py-0.5 text-xs"
            title="모든 예약 시간은 한국 표준시(Asia/Seoul, UTC+9) 기준입니다."
          >
            한국 표준시 · UTC+9
          </span>
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

      <div
        className="rounded-lg border bg-card p-2 sm:p-4"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        // 스와이프 중 의도치 않은 새로고침/뒤로가기 제스처(브라우저 기본) 차단.
        style={{ touchAction: 'pan-y' }}
      >
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
          // 모든 표시/계산은 KST. 이벤트 객체의 native Date는 UTC instant를 유지하므로
          // toISOString()은 그대로 백엔드 포맷과 호환된다.
          timeZone="Asia/Seoul"
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
          // 드래그/리사이즈 전역 활성화. 이벤트 단위로 editable=false 지정해 본인 외/과거/회차 차단.
          editable
          eventStartEditable
          eventDurationEditable
          // 15분 단위 스냅 — 백엔드 BOOKING_TIME_NOT_QUARTER 사전 차단.
          snapDuration="00:15:00"
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
      // 모바일 44px 터치 타겟. 데스크탑은 컴팩트 유지.
      className={cn(
        'inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors sm:min-h-[28px]',
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
