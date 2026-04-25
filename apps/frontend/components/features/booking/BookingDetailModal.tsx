'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FieldError } from '@/components/features/auth/FieldError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import type { ApiError } from '@/lib/api/axios';
import {
  deleteBooking,
  updateBooking,
  updateBookingSchema,
  type BookingDto,
  type UpdateBookingInput,
} from '@/lib/api/bookings';
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
};

export function BookingDetailModal({ open, onClose, booking }: Props): JSX.Element {
  const [editMode, setEditMode] = useState(false);
  const queryClient = useQueryClient();

  // 모달을 다시 열거나 다른 예약으로 바뀌면 항상 읽기 모드로 시작.
  useEffect(() => {
    if (open) setEditMode(false);
  }, [open, booking.id]);

  const updateMutation = useMutation({
    mutationFn: (values: UpdateBookingInput) => updateBooking(booking.id, values),
    onSuccess: () => {
      toast.success('예약이 수정되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      onClose();
    },
    // onError는 EditForm 내부에서 RHF setError로 처리 — 그래야 인라인 배너가 폼에 붙는다.
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteBooking(booking.id),
    onSuccess: () => {
      toast.success('예약이 삭제되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      onClose();
    },
    onError: (error: ApiError) => {
      toast.error(ERROR_TOAST[error.code] ?? error.userMessage);
    },
  });

  return (
    <Modal open={open} onClose={onClose} title={booking.title}>
      {editMode ? (
        <EditForm
          booking={booking}
          isSubmitting={updateMutation.isPending}
          onCancel={() => setEditMode(false)}
          onSubmit={async (values, { setBannerError }) => {
            try {
              await updateMutation.mutateAsync(values);
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
      ) : (
        <ReadView booking={booking} />
      )}

      {!editMode && booking.isMine ? (
        <div className="mt-6 flex justify-end gap-2 border-t pt-4">
          <Button
            type="button"
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (window.confirm('정말 이 예약을 삭제하시겠어요?')) {
                deleteMutation.mutate();
              }
            }}
          >
            {deleteMutation.isPending ? '삭제 중...' : '삭제'}
          </Button>
          <Button type="button" variant="outline" onClick={() => setEditMode(true)}>
            수정
          </Button>
        </div>
      ) : null}
    </Modal>
  );
}

function ReadView({ booking }: { booking: BookingDto }): JSX.Element {
  return (
    <dl className="grid grid-cols-[7rem_1fr] gap-y-3 text-sm">
      <dt className="text-muted-foreground">회의실</dt>
      <dd>{booking.room.name}</dd>

      <dt className="text-muted-foreground">예약자</dt>
      <dd>
        {booking.user.name}
        {booking.user.department ? (
          <span className="text-muted-foreground"> · {booking.user.department}</span>
        ) : null}
      </dd>

      <dt className="text-muted-foreground">날짜</dt>
      <dd>{formatKstDateTime(booking.startAt)}</dd>

      <dt className="text-muted-foreground">시간</dt>
      <dd>{formatKstTimeRange(booking.startAt, booking.endAt)}</dd>

      {booking.description ? (
        <>
          <dt className="text-muted-foreground">설명</dt>
          <dd className="whitespace-pre-wrap">{booking.description}</dd>
        </>
      ) : null}
    </dl>
  );
}

interface EditFormHandlers {
  setBannerError: (message: string) => void;
}

interface EditFormProps {
  booking: BookingDto;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: UpdateBookingInput, handlers: EditFormHandlers) => Promise<void>;
}

function EditForm({ booking, isSubmitting, onCancel, onSubmit }: EditFormProps): JSX.Element {
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
      {banner ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
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
          className={cn(errors.title && 'border-destructive')}
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
        <Label htmlFor="edit-description">설명</Label>
        <textarea
          id="edit-description"
          className={cn(
            'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            errors.description && 'border-destructive',
          )}
          maxLength={2000}
          aria-invalid={Boolean(errors.description)}
          {...register('description')}
        />
        <FieldError message={errors.description?.message} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          취소
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '저장 중...' : '저장'}
        </Button>
      </div>
    </form>
  );
}
