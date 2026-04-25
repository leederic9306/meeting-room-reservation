'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FieldError } from '@/components/features/auth/FieldError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import type { ApiError } from '@/lib/api/axios';
import {
  createBooking,
  createBookingSchema,
  listRooms,
  type CreateBookingInput,
  type RoomDto,
} from '@/lib/api/bookings';
import { cn } from '@/lib/utils';

import { DateTimeQuarterPicker } from './DateTimeQuarterPicker';

interface Props {
  open: boolean;
  onClose: () => void;
  initialStart: Date;
  initialEnd: Date;
  /** 슬롯에서 미리 선택된 회의실(있다면). */
  defaultRoomId?: string;
}

/**
 * 도메인 에러 코드 → 사용자 메시지 (충돌 등 명확한 안내).
 * 충돌은 폼 위쪽 배너로 띄워 입력값을 그대로 두고 시간만 다시 고를 수 있게 한다.
 */
const ERROR_BANNER: Partial<Record<string, string>> = {
  BOOKING_TIME_CONFLICT: '선택한 시간대에 이미 다른 예약이 있습니다. 시간을 변경해 주세요.',
  ROOM_INACTIVE: '비활성 상태의 회의실에는 예약할 수 없습니다.',
  ROOM_NOT_FOUND: '존재하지 않는 회의실입니다.',
};

const ERROR_TOAST: Partial<Record<string, string>> = {
  BOOKING_TIME_NOT_QUARTER: '시작/종료 시간은 15분 단위여야 합니다.',
  BOOKING_TIME_PAST: '과거 시점에는 예약할 수 없습니다.',
  BOOKING_DURATION_EXCEEDED: '예약은 최대 4시간까지 가능합니다.',
};

export function CreateBookingModal({
  open,
  onClose,
  initialStart,
  initialEnd,
  defaultRoomId,
}: Props): JSX.Element {
  const queryClient = useQueryClient();

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
    formState: { errors },
  } = useForm<CreateBookingInput>({
    resolver: zodResolver(createBookingSchema),
    defaultValues: {
      roomId: defaultRoomId ?? '',
      title: '',
      description: '',
      startAt: initialStart.toISOString(),
      endAt: initialEnd.toISOString(),
    },
  });

  // 모달이 열릴 때마다(또는 슬롯이 바뀔 때) 초기값 동기화.
  useEffect(() => {
    if (!open) return;
    reset({
      roomId: defaultRoomId ?? '',
      title: '',
      description: '',
      startAt: initialStart.toISOString(),
      endAt: initialEnd.toISOString(),
    });
  }, [open, initialStart, initialEnd, defaultRoomId, reset]);

  const mutation = useMutation({
    mutationFn: createBooking,
    onSuccess: () => {
      toast.success('예약이 생성되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      onClose();
    },
    onError: (error: ApiError) => {
      // 충돌은 폼에 인라인 배너로, 그 외는 토스트로 — 사용자가 입력값을 잃지 않게.
      if (ERROR_BANNER[error.code] !== undefined) {
        setError('root.serverError', {
          type: 'server',
          message: ERROR_BANNER[error.code],
        });
        return;
      }
      toast.error(ERROR_TOAST[error.code] ?? error.userMessage);
    },
  });

  const onSubmit = handleSubmit((values) => {
    clearErrors('root.serverError');
    mutation.mutate(values);
  });

  const activeRooms = (roomsQuery.data ?? []).filter((r) => r.isActive);
  const serverError = errors.root?.serverError?.message;

  return (
    <Modal open={open} onClose={onClose} title="새 예약" description="시간을 확인하고 예약하세요.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {serverError ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {serverError}
          </div>
        ) : null}

        <div>
          <Label htmlFor="booking-room">회의실</Label>
          <select
            id="booking-room"
            aria-invalid={Boolean(errors.roomId)}
            disabled={roomsQuery.isLoading || activeRooms.length === 0}
            className={cn(
              'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              errors.roomId && 'border-destructive',
            )}
            {...register('roomId')}
          >
            <option value="">회의실 선택</option>
            {activeRooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.location ? ` · ${r.location}` : ''}
              </option>
            ))}
          </select>
          <FieldError message={errors.roomId?.message} />
        </div>

        <div>
          <Label htmlFor="booking-title">제목</Label>
          <Input
            id="booking-title"
            placeholder="예: 스프린트 리뷰"
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
                id="booking-start"
                label="시작"
                value={field.value}
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

        <div>
          <Label htmlFor="booking-description">설명 (선택)</Label>
          <textarea
            id="booking-description"
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
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            취소
          </Button>
          <Button type="submit" disabled={mutation.isPending || activeRooms.length === 0}>
            {mutation.isPending ? '저장 중...' : '예약하기'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
