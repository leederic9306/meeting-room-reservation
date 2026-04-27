'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FieldError } from '@/components/features/auth/FieldError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import type { ApiError } from '@/lib/api/axios';
import {
  deleteBooking,
  updateBooking,
  updateBookingSchema,
  type BookingDto,
  type DeleteBookingScope,
  type UpdateBookingInput,
} from '@/lib/api/bookings';
import {
  computeRecurrenceProgress,
  getRecurrence,
  updateRecurrence,
  type RecurrenceDto,
} from '@/lib/api/recurrences';
import { cn } from '@/lib/utils';
import { formatKstDateTime, formatKstTimeRange } from '@/lib/utils/datetime';

import { DateTimeQuarterPicker } from './DateTimeQuarterPicker';

interface Props {
  open: boolean;
  onClose: () => void;
  booking: BookingDto;
}

const ERROR_BANNER: Partial<Record<string, string>> = {
  BOOKING_TIME_CONFLICT: '선택한 시간대에 이미 다른 예약이 있습니다. 시간을 변경해 주세요.',
};

const ERROR_TOAST: Partial<Record<string, string>> = {
  BOOKING_TIME_NOT_QUARTER: '시작/종료 시간은 15분 단위여야 합니다.',
  BOOKING_TIME_PAST: '과거 시점으로 변경할 수 없습니다.',
  BOOKING_DURATION_EXCEEDED: '예약은 최대 4시간까지 가능합니다.',
  BOOKING_PAST_NOT_EDITABLE: '이미 시작된 예약은 수정할 수 없습니다.',
  BOOKING_OWNERSHIP_REQUIRED: '본인 예약만 수정할 수 있습니다.',
  BOOKING_PAST_NOT_DELETABLE: '이미 시작된 예약은 삭제할 수 없습니다.',
  RECURRENCE_OWNERSHIP_REQUIRED: '본인 시리즈만 수정할 수 있습니다.',
  RECURRENCE_NOT_FOUND: '반복 시리즈를 찾을 수 없습니다.',
};

/**
 * 회차 수정/삭제 범위. UI 라벨과 백엔드 scope 의미를 정렬:
 *  - instance: 이 회차만
 *  - following: 이 회차부터 미래 모든 회차
 *  - series: 시리즈 전체 (회차 + RecurrenceRule)
 *
 * 수정 흐름은 "이 회차만"과 "전체"만 직접 지원한다 (이후-수정 단일 API 부재).
 */
const SCOPE_LABELS: Record<DeleteBookingScope, string> = {
  instance: '이 회차만',
  following: '이후 회차',
  series: '전체 시리즈',
};

type ActionMode = 'view' | 'edit-pick' | 'edit-form' | 'edit-series' | 'delete-confirm';

export function BookingDetailModal({ open, onClose, booking }: Props): JSX.Element {
  const [mode, setMode] = useState<ActionMode>('view');
  const [editScope, setEditScope] = useState<'instance' | 'series'>('instance');
  const [deleteScope, setDeleteScope] = useState<DeleteBookingScope>('instance');
  const queryClient = useQueryClient();

  const isRecurrence = booking.recurrenceId !== null;

  // 모달을 다시 열거나 다른 예약으로 바뀌면 항상 view 모드로 시작.
  useEffect(() => {
    if (open) {
      setMode('view');
      setEditScope('instance');
      setDeleteScope('instance');
    }
  }, [open, booking.id]);

  const recurrenceQuery = useQuery<RecurrenceDto>({
    queryKey: ['recurrence', booking.recurrenceId],
    queryFn: () => getRecurrence(booking.recurrenceId!),
    enabled: open && isRecurrence,
    staleTime: 60_000,
  });

  const updateBookingMutation = useMutation({
    mutationFn: (values: UpdateBookingInput) => updateBooking(booking.id, values),
    onSuccess: (result) => {
      // 시리즈에서 분리되었으면 사용자에게 명시적으로 안내 — 그 외엔 일반 성공 토스트.
      const detached = (result as { detachedFromSeries?: true }).detachedFromSeries === true;
      toast.success(
        detached ? '이 회차가 시리즈에서 분리되어 수정되었습니다.' : '예약이 수정되었습니다.',
      );
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      void queryClient.invalidateQueries({ queryKey: ['recurrence'] });
      onClose();
    },
  });

  const updateSeriesMutation = useMutation({
    mutationFn: (values: { title?: string; description?: string }) =>
      updateRecurrence(booking.recurrenceId!, values),
    onSuccess: () => {
      toast.success('시리즈 정보가 수정되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      void queryClient.invalidateQueries({ queryKey: ['recurrence'] });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (scope: DeleteBookingScope | undefined) => deleteBooking(booking.id, scope),
    onSuccess: () => {
      toast.success('예약이 삭제되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      void queryClient.invalidateQueries({ queryKey: ['recurrence'] });
      onClose();
    },
    onError: (error: ApiError) => {
      toast.error(ERROR_TOAST[error.code] ?? error.userMessage);
    },
  });

  const recurrenceMeta = recurrenceQuery.data
    ? computeRecurrenceProgress(recurrenceQuery.data)
    : undefined;

  return (
    <Modal open={open} onClose={onClose} title={booking.title}>
      {mode === 'view' ? (
        <>
          <ReadView booking={booking} />
          {isRecurrence ? (
            <RecurrenceMetaPanel
              loading={recurrenceQuery.isLoading}
              recurrenceIndex={booking.recurrenceIndex}
              meta={recurrenceMeta}
            />
          ) : null}

          {booking.isMine ? (
            <div className="mt-6 flex justify-end gap-2 border-t border-neutral-100 pt-4">
              <Button
                type="button"
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (isRecurrence) {
                    setMode('delete-confirm');
                  } else if (window.confirm('정말 이 예약을 삭제하시겠어요?')) {
                    deleteMutation.mutate(undefined);
                  }
                }}
              >
                {deleteMutation.isPending ? '삭제 중...' : '삭제'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (isRecurrence) {
                    // 반복 회차는 수정 범위를 먼저 골라야 한다.
                    setMode('edit-pick');
                    setEditScope('instance');
                  } else {
                    setMode('edit-form');
                  }
                }}
              >
                수정
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      {mode === 'edit-pick' && isRecurrence ? (
        <EditScopePicker
          scope={editScope}
          onChange={setEditScope}
          onCancel={() => setMode('view')}
          onConfirm={() => setMode(editScope === 'series' ? 'edit-series' : 'edit-form')}
          confirmLabel="다음"
        />
      ) : null}

      {mode === 'edit-form' ? (
        <EditForm
          mode={isRecurrence ? 'instance' : 'single'}
          booking={booking}
          isSubmitting={updateBookingMutation.isPending}
          onCancel={() => setMode(isRecurrence ? 'edit-pick' : 'view')}
          onSubmit={async (values, { setBannerError }) => {
            try {
              await updateBookingMutation.mutateAsync(values);
            } catch (error) {
              const e = error as ApiError;
              if (ERROR_BANNER[e.code] !== undefined) {
                setBannerError(ERROR_BANNER[e.code]!);
                return;
              }
              toast.error(ERROR_TOAST[e.code] ?? e.userMessage);
            }
          }}
        />
      ) : null}

      {mode === 'edit-series' && isRecurrence ? (
        <SeriesEditForm
          recurrence={recurrenceQuery.data}
          fallbackBooking={booking}
          isSubmitting={updateSeriesMutation.isPending}
          onCancel={() => setMode('edit-pick')}
          onSubmit={async (values) => {
            try {
              await updateSeriesMutation.mutateAsync(values);
            } catch (error) {
              const e = error as ApiError;
              toast.error(ERROR_TOAST[e.code] ?? e.userMessage);
            }
          }}
        />
      ) : null}

      {mode === 'delete-confirm' && isRecurrence ? (
        <DeleteScopeConfirm
          scope={deleteScope}
          onChange={setDeleteScope}
          isSubmitting={deleteMutation.isPending}
          onCancel={() => setMode('view')}
          onConfirm={() => deleteMutation.mutate(deleteScope)}
        />
      ) : null}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// 읽기 뷰
// ---------------------------------------------------------------------------

function ReadView({ booking }: { booking: BookingDto }): JSX.Element {
  return (
    <dl className="grid grid-cols-[7rem_1fr] gap-y-3 text-sm">
      <dt className="text-neutral-500">회의실</dt>
      <dd className="text-neutral-900">{booking.room.name}</dd>

      <dt className="text-neutral-500">예약자</dt>
      <dd className="text-neutral-900">
        {booking.user.name}
        {booking.user.department ? (
          <span className="text-neutral-500"> · {booking.user.department}</span>
        ) : null}
      </dd>

      <dt className="text-neutral-500">날짜</dt>
      <dd className="tabular text-neutral-900">{formatKstDateTime(booking.startAt)}</dd>

      <dt className="text-neutral-500">시간</dt>
      <dd className="tabular text-neutral-900">
        {formatKstTimeRange(booking.startAt, booking.endAt)}
      </dd>

      {booking.description ? (
        <>
          <dt className="text-neutral-500">설명</dt>
          <dd className="whitespace-pre-wrap text-neutral-700">{booking.description}</dd>
        </>
      ) : null}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// 시리즈 메타정보 패널
// ---------------------------------------------------------------------------

interface RecurrenceMetaPanelProps {
  loading: boolean;
  recurrenceIndex: number | null;
  meta?: { total: number; past: number; remaining: number };
}

function RecurrenceMetaPanel({
  loading,
  recurrenceIndex,
  meta,
}: RecurrenceMetaPanelProps): JSX.Element {
  return (
    <div className="mt-4 rounded-lg border border-brand-500/20 bg-brand-50/40 p-3 text-xs">
      <div className="mb-1 flex items-center gap-1.5 font-medium text-brand-700">
        <span aria-hidden>↻</span>
        <span>반복 시리즈</span>
      </div>
      {loading ? (
        <p className="text-neutral-500">시리즈 정보를 불러오는 중...</p>
      ) : meta ? (
        <p className="tabular text-neutral-600">
          이번 회차 {recurrenceIndex !== null ? `${recurrenceIndex + 1}` : '-'} / 전체 {meta.total}
          회 · 진행 {meta.past} / 남은 {meta.remaining}회
        </p>
      ) : (
        <p className="text-neutral-500">시리즈 정보를 불러오지 못했습니다.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 수정 범위 선택
// ---------------------------------------------------------------------------

interface EditScopePickerProps {
  scope: 'instance' | 'series';
  onChange: (scope: 'instance' | 'series') => void;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
}

/**
 * 수정 범위 선택기. "이후 회차" 옵션은 비활성으로 노출 — 단일 API 부재로 일괄 수정은 미지원.
 */
function EditScopePicker({
  scope,
  onChange,
  onCancel,
  onConfirm,
  confirmLabel,
}: EditScopePickerProps): JSX.Element {
  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-500">수정 범위를 선택해 주세요.</p>
      <div className="space-y-2 text-sm">
        <label className="flex items-start gap-2">
          <input
            type="radio"
            className="mt-1 h-4 w-4 accent-brand-500"
            checked={scope === 'instance'}
            onChange={() => onChange('instance')}
          />
          <span>
            <span className="font-medium text-neutral-900">{SCOPE_LABELS.instance}</span>
            <span className="block text-xs text-neutral-500">
              해당 회차만 수정됩니다. 시리즈에서 자동으로 분리됩니다.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 opacity-60">
          <input type="radio" className="mt-1 h-4 w-4 accent-brand-500" disabled />
          <span>
            <span className="font-medium text-neutral-900">{SCOPE_LABELS.following}</span>
            <span className="block text-xs text-neutral-500">
              이후 회차의 일괄 수정은 지원하지 않습니다. 시간 변경이 필요하면 시리즈 삭제 후
              재생성하세요.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            className="mt-1 h-4 w-4 accent-brand-500"
            checked={scope === 'series'}
            onChange={() => onChange('series')}
          />
          <span>
            <span className="font-medium text-neutral-900">{SCOPE_LABELS.series}</span>
            <span className="block text-xs text-neutral-500">
              제목/설명만 변경할 수 있습니다 (시간/회의실은 시리즈 단위로 변경 불가).
            </span>
          </span>
        </label>
      </div>
      <div className="flex justify-end gap-2 border-t border-neutral-100 pt-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          취소
        </Button>
        <Button type="button" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 단일/회차 수정 폼 (시간/제목/설명)
// ---------------------------------------------------------------------------

interface EditFormHandlers {
  setBannerError: (message: string) => void;
}

interface EditFormProps {
  /** 'single'은 단일 예약, 'instance'는 반복 회차(자동 분리) — 라벨 외 동작 동일. */
  mode: 'single' | 'instance';
  booking: BookingDto;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: UpdateBookingInput, handlers: EditFormHandlers) => Promise<void>;
}

function EditForm({ mode, booking, isSubmitting, onCancel, onSubmit }: EditFormProps): JSX.Element {
  const {
    register,
    control,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<UpdateBookingInput>({
    resolver: zodResolver(updateBookingSchema),
    defaultValues: {
      title: booking.title,
      description: booking.description ?? '',
      startAt: booking.startAt,
      endAt: booking.endAt,
    },
  });

  const submit = handleSubmit(async (values) => {
    clearErrors('root.serverError');
    await onSubmit(values, {
      setBannerError: (message) => setError('root.serverError', { type: 'server', message }),
    });
  });

  const banner = errors.root?.serverError?.message;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {mode === 'instance' ? (
        <p className="rounded-lg border border-warning-500/20 bg-warning-50 px-3 py-2 text-xs text-warning-700">
          저장하면 이 회차가 시리즈에서 자동으로 분리되며 단독 예약으로 전환됩니다.
        </p>
      ) : null}

      {banner ? (
        <div
          role="alert"
          className="rounded-lg border border-danger-500/20 bg-danger-50 px-3 py-2 text-sm text-danger-700"
        >
          {banner}
        </div>
      ) : null}

      <div>
        <Label htmlFor="edit-title">제목</Label>
        <Input
          id="edit-title"
          maxLength={200}
          aria-invalid={Boolean(errors.title)}
          className={cn(errors.title && 'border-danger-500')}
          {...register('title')}
        />
        <FieldError message={errors.title?.message} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Controller
          name="startAt"
          control={control}
          render={({ field, fieldState }) => (
            <DateTimeQuarterPicker
              id="edit-start"
              label="시작"
              value={field.value ?? ''}
              onChange={field.onChange}
              error={fieldState.error?.message}
              required
            />
          )}
        />
        <Controller
          name="endAt"
          control={control}
          render={({ field, fieldState }) => (
            <DateTimeQuarterPicker
              id="edit-end"
              label="종료"
              value={field.value ?? ''}
              onChange={field.onChange}
              error={fieldState.error?.message}
              required
            />
          )}
        />
      </div>

      <div>
        <Label htmlFor="edit-description" optional>
          설명
        </Label>
        <Textarea
          id="edit-description"
          maxLength={2000}
          aria-invalid={Boolean(errors.description)}
          className={cn(errors.description && 'border-danger-500')}
          {...register('description')}
        />
        <FieldError message={errors.description?.message} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          취소
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '저장 중...' : '저장'}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// 시리즈 수정 폼 (제목/설명만)
// ---------------------------------------------------------------------------

interface SeriesEditFormProps {
  recurrence: RecurrenceDto | undefined;
  fallbackBooking: BookingDto;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: { title?: string; description?: string }) => Promise<void>;
}

function SeriesEditForm({
  recurrence,
  fallbackBooking,
  isSubmitting,
  onCancel,
  onSubmit,
}: SeriesEditFormProps): JSX.Element {
  // 시리즈 데이터가 아직 없으면 회차 정보로 초기값 채움 — 사용자 대기 시간 단축.
  const initialTitle = recurrence?.title ?? fallbackBooking.title;
  const initialDescription = recurrence?.description ?? fallbackBooking.description ?? '';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ title: string; description: string }>({
    defaultValues: { title: initialTitle, description: initialDescription },
  });

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      title: values.title,
      description: values.description,
    });
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="rounded-lg border border-brand-500/20 bg-brand-50/40 px-3 py-2 text-xs text-brand-700">
        전체 시리즈 — 제목과 설명만 수정할 수 있습니다.
      </p>

      <div>
        <Label htmlFor="series-title">제목</Label>
        <Input
          id="series-title"
          maxLength={200}
          aria-invalid={Boolean(errors.title)}
          className={cn(errors.title && 'border-danger-500')}
          {...register('title', { required: '제목을 입력해주세요.' })}
        />
        <FieldError message={errors.title?.message} />
      </div>

      <div>
        <Label htmlFor="series-description" optional>
          설명
        </Label>
        <Textarea id="series-description" maxLength={2000} {...register('description')} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          취소
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '저장 중...' : '저장'}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// 삭제 범위 확인
// ---------------------------------------------------------------------------

interface DeleteScopeConfirmProps {
  scope: DeleteBookingScope;
  onChange: (scope: DeleteBookingScope) => void;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteScopeConfirm({
  scope,
  onChange,
  isSubmitting,
  onCancel,
  onConfirm,
}: DeleteScopeConfirmProps): JSX.Element {
  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-500">삭제 범위를 선택해 주세요.</p>
      <div className="space-y-2 text-sm">
        {(['instance', 'following', 'series'] as DeleteBookingScope[]).map((s) => (
          <label key={s} className="flex items-start gap-2">
            <input
              type="radio"
              className="mt-1 h-4 w-4 accent-brand-500"
              checked={scope === s}
              onChange={() => onChange(s)}
            />
            <span>
              <span className="font-medium text-neutral-900">{SCOPE_LABELS[s]}</span>
              <span className="block text-xs text-neutral-500">{describeDeleteScope(s)}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2 border-t border-neutral-100 pt-3">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          취소
        </Button>
        <Button type="button" variant="destructive" onClick={onConfirm} disabled={isSubmitting}>
          {isSubmitting ? '삭제 중...' : '삭제'}
        </Button>
      </div>
    </div>
  );
}

function describeDeleteScope(scope: DeleteBookingScope): string {
  if (scope === 'instance') return '이 회차만 삭제하고 시리즈에 예외(EXDATE)로 등록합니다.';
  if (scope === 'following') return '이 회차부터 미래의 모든 회차를 삭제합니다.';
  return '시리즈 전체와 모든 미래 회차를 삭제합니다.';
}
