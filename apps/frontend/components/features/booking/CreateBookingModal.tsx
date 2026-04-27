'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Clock } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { FieldError } from '@/components/features/auth/FieldError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import type { ApiError } from '@/lib/api/axios';
import {
  createBooking,
  createBookingSchema,
  listRooms,
  type CreateBookingInput,
  type RoomDto,
} from '@/lib/api/bookings';
import { shouldOfferExceptionRequest } from '@/lib/api/exception-requests';
import {
  createRecurrence,
  previewRecurrenceStarts,
  recurrenceInputSchema,
  recurrenceInputToRRule,
  RECURRENCE_COUNT_MAX,
  RECURRENCE_COUNT_MIN,
  RECURRENCE_PREVIEW_LIMIT,
  type CreateRecurrenceResultDto,
  type SkippedInstanceDto,
} from '@/lib/api/recurrences';
import { cn } from '@/lib/utils';
import { formatKstDateTime, formatKstTimeRange } from '@/lib/utils/datetime';
import { buildRoomColorMap, getRoomColor } from '@/lib/utils/room-colors';

import { DateTimeQuarterPicker } from './DateTimeQuarterPicker';
import { ExceptionRequestModal } from './ExceptionRequestModal';

interface Props {
  open: boolean;
  onClose: () => void;
  initialStart: Date;
  initialEnd: Date;
  /** 슬롯에서 미리 선택된 회의실(있다면). */
  defaultRoomId?: string;
}

const ERROR_BANNER: Partial<Record<string, string>> = {
  BOOKING_TIME_CONFLICT: '선택한 시간대에 이미 다른 예약이 있습니다. 시간을 변경해 주세요.',
  ROOM_INACTIVE: '비활성 상태의 회의실에는 예약할 수 없습니다.',
  ROOM_NOT_FOUND: '존재하지 않는 회의실입니다.',
  ALL_INSTANCES_FAILED: '생성 가능한 회차가 없습니다. 시간/주기/종료 조건을 확인해 주세요.',
  INVALID_RRULE: '반복 규칙이 올바르지 않습니다.',
};

const ERROR_TOAST: Partial<Record<string, string>> = {
  BOOKING_TIME_NOT_QUARTER: '시작/종료 시간은 15분 단위여야 합니다.',
  BOOKING_TIME_PAST: '과거 시점에는 예약할 수 없습니다.',
  BOOKING_DURATION_EXCEEDED: '예약은 최대 4시간까지 가능합니다.',
};

/** 디자인 §4.2 — Input과 톤을 맞춘 공용 select 클래스 */
const SELECT_CLASS = cn(
  'flex h-10 w-full rounded-lg bg-white px-3 text-sm text-neutral-900',
  'border border-neutral-200 transition-colors',
  'hover:border-neutral-300',
  'focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100',
);

/**
 * 단일 예약 폼 + 반복 옵션을 한 폼으로 결합한 스키마.
 * 반복이 켜진 경우 createBookingSchema의 단일-회차 필드(roomId/title/시간)는 첫 회차로 사용된다.
 */
const formSchema = z.object({
  booking: createBookingSchema,
  recurrence: recurrenceInputSchema,
});
type FormValues = z.infer<typeof formSchema>;

export function CreateBookingModal({
  open,
  onClose,
  initialStart,
  initialEnd,
  defaultRoomId,
}: Props): JSX.Element {
  const queryClient = useQueryClient();
  const [conflictResult, setConflictResult] = useState<CreateRecurrenceResultDto | undefined>();
  const [exceptionPreset, setExceptionPreset] = useState<
    | {
        roomId: string;
        title: string;
        startAt: string;
        endAt: string;
        roomName?: string;
      }
    | undefined
  >();

  const roomsQuery = useQuery<RoomDto[]>({
    queryKey: ['rooms'],
    queryFn: listRooms,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      booking: {
        roomId: defaultRoomId ?? '',
        title: '',
        description: '',
        startAt: initialStart.toISOString(),
        endAt: initialEnd.toISOString(),
      },
      recurrence: { enabled: false },
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      booking: {
        roomId: defaultRoomId ?? '',
        title: '',
        description: '',
        startAt: initialStart.toISOString(),
        endAt: initialEnd.toISOString(),
      },
      recurrence: { enabled: false },
    });
    setConflictResult(undefined);
    setExceptionPreset(undefined);
  }, [open, initialStart, initialEnd, defaultRoomId, reset]);

  const recurrence = watch('recurrence');
  const startAtValue = watch('booking.startAt');
  const endAtValue = watch('booking.endAt');
  const titleValue = watch('booking.title');
  const roomIdValue = watch('booking.roomId');

  // 4시간 초과/과거 시점이면 일반 예약 불가 — 예외 신청 CTA 노출 조건.
  const offerException = useMemo(() => {
    if (recurrence.enabled) return false;
    if (!startAtValue || !endAtValue) return false;
    return shouldOfferExceptionRequest(startAtValue, endAtValue);
  }, [recurrence.enabled, startAtValue, endAtValue]);

  /** 시작-종료 길이를 분 단위로 — 푸터/라벨에 표시 */
  const durationMinutes = useMemo(() => {
    if (!startAtValue || !endAtValue) return null;
    const start = new Date(startAtValue);
    const end = new Date(endAtValue);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    const diff = end.getTime() - start.getTime();
    return diff > 0 ? Math.round(diff / 60_000) : null;
  }, [startAtValue, endAtValue]);

  // 미리보기 — 첫 회차 시작 + 주기로 처음 N개 추정 (BYDAY 등 미지원, 단순 프리셋 한정).
  const previewItems = useMemo(() => {
    if (!recurrence.enabled) return [];
    const start = startAtValue ? new Date(startAtValue) : undefined;
    const end = endAtValue ? new Date(endAtValue) : undefined;
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
    const durationMs = end.getTime() - start.getTime();
    if (durationMs <= 0) return [];
    return previewRecurrenceStarts(recurrence, start, RECURRENCE_PREVIEW_LIMIT).map((s) => ({
      startIso: s.toISOString(),
      endIso: new Date(s.getTime() + durationMs).toISOString(),
    }));
  }, [recurrence, startAtValue, endAtValue]);

  const singleMutation = useMutation({
    mutationFn: createBooking,
    onSuccess: () => {
      toast.success('예약이 생성되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      onClose();
    },
    onError: (error: ApiError) => {
      handleApiError(error);
    },
  });

  const recurrenceMutation = useMutation({
    mutationFn: createRecurrence,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      if (result.skippedBookings.length > 0) {
        setConflictResult(result);
      } else {
        toast.success(`반복 예약 ${result.createdBookings}회차가 생성되었습니다.`);
        onClose();
      }
    },
    onError: (error: ApiError) => {
      handleApiError(error);
    },
  });

  function handleApiError(error: ApiError): void {
    if (ERROR_BANNER[error.code] !== undefined) {
      setError('root.serverError', { type: 'server', message: ERROR_BANNER[error.code] });
      return;
    }
    toast.error(ERROR_TOAST[error.code] ?? error.userMessage);
  }

  const onSubmit = handleSubmit((values) => {
    clearErrors('root.serverError');
    if (!values.recurrence.enabled) {
      const payload: CreateBookingInput = {
        ...values.booking,
        description: values.booking.description || undefined,
      };
      singleMutation.mutate(payload);
      return;
    }
    const rrule = recurrenceInputToRRule(values.recurrence);
    if (!rrule) {
      setError('root.serverError', {
        type: 'server',
        message: '반복 규칙이 올바르지 않습니다. 주기와 종료 조건을 확인해 주세요.',
      });
      return;
    }
    const start = new Date(values.booking.startAt);
    const end = new Date(values.booking.endAt);
    const durMin = Math.round((end.getTime() - start.getTime()) / 60_000);
    recurrenceMutation.mutate({
      roomId: values.booking.roomId,
      title: values.booking.title,
      description: values.booking.description || undefined,
      startAt: values.booking.startAt,
      durationMinutes: durMin,
      rrule,
    });
  });

  const activeRooms = (roomsQuery.data ?? []).filter((r) => r.isActive);
  const roomColorMap = useMemo(() => buildRoomColorMap(roomsQuery.data ?? []), [roomsQuery.data]);
  const selectedRoom = useMemo(
    () => activeRooms.find((r) => r.id === roomIdValue),
    [activeRooms, roomIdValue],
  );
  const serverError = errors.root?.serverError?.message;
  const isPending = singleMutation.isPending || recurrenceMutation.isPending;

  // 푸터 — 모달 footer slot에 분리 (§4.6)
  const footer = (
    <>
      <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
        취소
      </Button>
      <Button
        type="submit"
        form="create-booking-form"
        disabled={isPending || activeRooms.length === 0 || offerException}
      >
        {isPending ? '저장 중...' : recurrence.enabled ? '반복 예약하기' : '예약하기'}
      </Button>
    </>
  );

  return (
    <>
      <Modal
        open={open && conflictResult === undefined}
        onClose={onClose}
        title="새 예약"
        description="시간을 확인하고 예약하세요."
        footer={footer}
      >
        <form id="create-booking-form" onSubmit={onSubmit} className="space-y-5" noValidate>
          {serverError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-danger-500/20 bg-danger-50 px-3 py-2.5 text-sm text-danger-700"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 translate-y-0.5" />
              <span>{serverError}</span>
            </div>
          ) : null}

          {/* 회의실 — 선택된 항목 옆에 컬러 도트 표시 */}
          <div>
            <Label htmlFor="booking-room">회의실</Label>
            <div className="relative">
              {selectedRoom ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
                  style={{ backgroundColor: getRoomColor(roomColorMap, selectedRoom.id) }}
                />
              ) : null}
              <select
                id="booking-room"
                aria-invalid={Boolean(errors.booking?.roomId)}
                disabled={roomsQuery.isLoading || activeRooms.length === 0}
                className={cn(
                  SELECT_CLASS,
                  selectedRoom && 'pl-8',
                  errors.booking?.roomId && 'border-danger-500',
                )}
                {...register('booking.roomId')}
              >
                <option value="">회의실 선택</option>
                {activeRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.location ? ` · ${r.location}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <FieldError message={errors.booking?.roomId?.message} />
          </div>

          {/* 제목 */}
          <div>
            <Label htmlFor="booking-title">제목</Label>
            <Input
              id="booking-title"
              placeholder="예: 스프린트 리뷰"
              maxLength={200}
              aria-invalid={Boolean(errors.booking?.title)}
              className={cn(errors.booking?.title && 'border-danger-500')}
              {...register('booking.title')}
            />
            <FieldError message={errors.booking?.title?.message} />
          </div>

          {/* 시간 — 시작 → 화살표 → 종료 + 길이 표시 */}
          <div>
            <Label>시간</Label>
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
              <Controller
                name="booking.startAt"
                control={control}
                render={({ field, fieldState }) => (
                  <DateTimeQuarterPicker
                    id="booking-start"
                    label="시작"
                    value={field.value}
                    onChange={field.onChange}
                    error={fieldState.error?.message}
                    required
                  />
                )}
              />
              <ArrowRight
                aria-hidden
                className="hidden h-4 w-4 self-center text-neutral-400 sm:block sm:translate-y-3"
              />
              <Controller
                name="booking.endAt"
                control={control}
                render={({ field, fieldState }) => (
                  <DateTimeQuarterPicker
                    id="booking-end"
                    label="종료"
                    value={field.value}
                    onChange={field.onChange}
                    error={fieldState.error?.message}
                    required
                  />
                )}
              />
            </div>

            {/* 길이/경고 라벨 */}
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              <Clock className="h-3 w-3 text-neutral-400" />
              {durationMinutes !== null ? (
                <span
                  className={cn(
                    'tabular',
                    durationMinutes > 240 ? 'text-warning-700' : 'text-neutral-500',
                  )}
                >
                  총 {durationMinutes}분
                  {durationMinutes > 240 ? ' · 4시간 초과 — 관리자 승인 필요' : ''}
                </span>
              ) : (
                <span className="text-neutral-400">시작/종료 시간을 모두 선택하세요</span>
              )}
            </div>
          </div>

          {/* 설명 */}
          <div>
            <Label htmlFor="booking-description" optional>
              설명
            </Label>
            <Textarea
              id="booking-description"
              maxLength={2000}
              aria-invalid={Boolean(errors.booking?.description)}
              className={cn(errors.booking?.description && 'border-danger-500')}
              {...register('booking.description')}
            />
            <FieldError message={errors.booking?.description?.message} />
          </div>

          {/* 반복 */}
          <RecurrenceSection
            errors={errors}
            register={register}
            previewItems={previewItems}
            recurrenceEnabled={recurrence.enabled}
            recurrenceEndType={recurrence.endType}
          />

          {/* 예외 신청 안내 */}
          {offerException ? (
            <div
              role="status"
              className="rounded-lg border border-warning-500/20 bg-warning-50 p-3 text-sm text-warning-700"
            >
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-4 w-4" strokeWidth={2} />
                일반 예약으로는 신청할 수 없는 시간입니다
              </p>
              <p className="mt-1 text-xs leading-relaxed">
                4시간을 초과하거나 과거 시점인 경우 관리자 승인이 필요한 예외 신청을 이용해 주세요.
              </p>
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!roomIdValue || !titleValue}
                  onClick={() => {
                    const roomName = activeRooms.find((r) => r.id === roomIdValue)?.name;
                    setExceptionPreset({
                      roomId: roomIdValue,
                      title: titleValue,
                      startAt: startAtValue,
                      endAt: endAtValue,
                      roomName,
                    });
                  }}
                >
                  예외 신청
                </Button>
              </div>
            </div>
          ) : null}
        </form>
      </Modal>

      {exceptionPreset ? (
        <ExceptionRequestModal
          open
          preset={exceptionPreset}
          onClose={() => setExceptionPreset(undefined)}
        />
      ) : null}

      {conflictResult ? (
        <ConflictResultModal
          result={conflictResult}
          onClose={() => {
            setConflictResult(undefined);
            onClose();
          }}
        />
      ) : null}
    </>
  );
}

interface RecurrenceSectionProps {
  errors: Record<string, unknown>;
  register: ReturnType<typeof useForm<FormValues>>['register'];
  previewItems: ReadonlyArray<{ startIso: string; endIso: string }>;
  recurrenceEnabled: boolean;
  recurrenceEndType: FormValues['recurrence']['endType'];
}

function RecurrenceSection({
  errors,
  register,
  previewItems,
  recurrenceEnabled,
  recurrenceEndType,
}: RecurrenceSectionProps): JSX.Element {
  const formErrors = errors as {
    recurrence?: {
      freq?: { message?: string };
      endType?: { message?: string };
      count?: { message?: string };
      until?: { message?: string };
    };
  };
  const recurrenceErrors = formErrors.recurrence;

  return (
    <div className="rounded-lg border border-neutral-200">
      <label className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <span className="block text-sm font-medium text-neutral-900">반복 예약</span>
          <span className="mt-0.5 block text-xs text-neutral-500">
            정기 회의를 한 번에 등록 (최대 1년)
          </span>
        </div>
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-brand-500"
          {...register('recurrence.enabled')}
        />
      </label>

      {recurrenceEnabled ? (
        <div className="space-y-3 border-t border-neutral-100 px-4 py-3">
          <div>
            <Label htmlFor="recurrence-freq">주기</Label>
            <select
              id="recurrence-freq"
              aria-invalid={Boolean(recurrenceErrors?.freq?.message)}
              className={cn(SELECT_CLASS, recurrenceErrors?.freq?.message && 'border-danger-500')}
              {...register('recurrence.freq')}
            >
              <option value="">주기 선택</option>
              <option value="DAILY">매일</option>
              <option value="WEEKLY">매주</option>
              <option value="MONTHLY">매월</option>
            </select>
            <FieldError message={recurrenceErrors?.freq?.message} />
          </div>

          <div>
            <Label>종료 조건</Label>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="count"
                  className="h-4 w-4 accent-brand-500"
                  {...register('recurrence.endType')}
                />
                <span className="text-neutral-700">횟수</span>
                <input
                  type="number"
                  min={RECURRENCE_COUNT_MIN}
                  max={RECURRENCE_COUNT_MAX}
                  disabled={recurrenceEndType !== 'count'}
                  aria-invalid={Boolean(recurrenceErrors?.count?.message)}
                  className={cn(
                    'h-9 w-24 rounded-md border bg-white px-2 tabular text-sm transition-colors',
                    'hover:border-neutral-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100',
                    'disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400',
                    recurrenceErrors?.count?.message ? 'border-danger-500' : 'border-neutral-200',
                  )}
                  {...register('recurrence.count', { valueAsNumber: true })}
                />
                <span className="text-neutral-500">회</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="until"
                  className="h-4 w-4 accent-brand-500"
                  {...register('recurrence.endType')}
                />
                <span className="text-neutral-700">종료일</span>
                <input
                  type="date"
                  disabled={recurrenceEndType !== 'until'}
                  aria-invalid={Boolean(recurrenceErrors?.until?.message)}
                  className={cn(
                    'h-9 rounded-md border bg-white px-2 tabular text-sm transition-colors',
                    'hover:border-neutral-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100',
                    'disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400',
                    recurrenceErrors?.until?.message ? 'border-danger-500' : 'border-neutral-200',
                  )}
                  {...register('recurrence.until')}
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="forever"
                  className="h-4 w-4 accent-brand-500"
                  {...register('recurrence.endType')}
                />
                <span className="text-neutral-700">무기한</span>
                <span className="text-xs text-neutral-400">(서버에서 1년으로 자동 절단)</span>
              </label>
            </div>
            <FieldError message={recurrenceErrors?.endType?.message} />
            <FieldError message={recurrenceErrors?.count?.message} />
            <FieldError message={recurrenceErrors?.until?.message} />
          </div>

          <div>
            <Label>미리보기 (처음 {RECURRENCE_PREVIEW_LIMIT}개)</Label>
            {previewItems.length === 0 ? (
              <p className="text-xs text-neutral-500">
                주기와 시작 시간을 선택하면 회차가 표시됩니다.
              </p>
            ) : (
              <ol className="space-y-1 rounded-md bg-neutral-50 p-2.5 text-xs text-neutral-600">
                {previewItems.map((item, idx) => (
                  <li key={item.startIso} className="flex items-baseline gap-2">
                    <span className="tabular text-neutral-400">{idx + 1}.</span>
                    <span className="tabular">
                      {formatKstDateTime(item.startIso)} (
                      {formatKstTimeRange(item.startIso, item.endIso)})
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface ConflictResultModalProps {
  result: CreateRecurrenceResultDto;
  onClose: () => void;
}

function ConflictResultModal({ result, onClose }: ConflictResultModalProps): JSX.Element {
  const skipped = result.skippedBookings;
  const conflictCount = skipped.filter((s) => s.reason === 'TIME_CONFLICT').length;
  const pastCount = skipped.filter((s) => s.reason === 'PAST_INSTANCE').length;

  return (
    <Modal
      open
      onClose={onClose}
      title="반복 예약 생성 결과"
      description={`${result.createdBookings}회차 생성 · ${skipped.length}회차 제외`}
      footer={
        <Button type="button" onClick={onClose}>
          확인
        </Button>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-neutral-700">
          일부 회차는 다음 사유로 생성되지 않았습니다.
          {conflictCount > 0 ? ` 충돌 ${conflictCount}건` : ''}
          {pastCount > 0 ? `${conflictCount > 0 ? ', ' : ' '}과거 회차 ${pastCount}건` : ''}.
        </p>
        <ul className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs">
          {skipped.map((s) => (
            <li key={`${s.index}-${s.startAt}`} className="flex justify-between gap-2">
              <span className="text-neutral-700">{labelForSkipReason(s)}</span>
              <span className="tabular text-neutral-500">{formatKstDateTime(s.startAt)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

function labelForSkipReason(s: SkippedInstanceDto): string {
  return s.reason === 'TIME_CONFLICT' ? '시간 충돌' : '과거 시점';
}
