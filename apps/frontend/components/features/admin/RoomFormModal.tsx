'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { FieldError } from '@/components/features/auth/FieldError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import {
  createRoom,
  updateRoom,
  type CreateRoomInput,
  type UpdateRoomInput,
} from '@/lib/api/admin';
import type { ApiError } from '@/lib/api/axios';
import type { RoomDto } from '@/lib/api/bookings';
import { cn } from '@/lib/utils';

const roomFormSchema = z.object({
  name: z.string().min(1, '회의실 이름은 필수입니다.').max(100, '100자 이내로 입력해 주세요.'),
  // 빈 문자열은 setValueAs에서 undefined로 변환되어 들어온다.
  capacity: z
    .number({ invalid_type_error: '숫자를 입력해 주세요.' })
    .int()
    .min(1, '1 이상이어야 합니다.')
    .max(1000, '1000 이하여야 합니다.')
    .optional(),
  location: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  displayOrder: z.number().int().min(0),
  isActive: z.boolean(),
});

type RoomFormValues = z.infer<typeof roomFormSchema>;

const numericOrUndefined = (v: unknown): number | undefined => {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
};

const numericOrZero = (v: unknown): number => numericOrUndefined(v) ?? 0;

const ERROR_MESSAGES: Partial<Record<string, string>> = {
  ROOM_LIMIT_EXCEEDED: '회의실은 최대 10개까지 등록할 수 있습니다.',
  ROOM_NAME_DUPLICATE: '이미 존재하는 회의실 이름입니다.',
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** undefined면 생성 모드, 있으면 수정 모드. */
  room?: RoomDto;
}

export function RoomFormModal({ open, onClose, room }: Props): JSX.Element {
  const isEdit = room !== undefined;
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<RoomFormValues>({
    resolver: zodResolver(roomFormSchema),
    defaultValues: {
      name: '',
      capacity: undefined,
      location: '',
      description: '',
      displayOrder: 0,
      isActive: true,
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      name: room?.name ?? '',
      capacity: room?.capacity ?? undefined,
      location: room?.location ?? '',
      description: room?.description ?? '',
      displayOrder: room?.displayOrder ?? 0,
      isActive: room?.isActive ?? true,
    });
  }, [open, room, reset]);

  const mutation = useMutation({
    mutationFn: async (values: RoomFormValues) => {
      if (isEdit && room) {
        const payload: UpdateRoomInput = {
          name: values.name,
          capacity: values.capacity ?? null,
          location: values.location ? values.location : null,
          description: values.description ? values.description : null,
          displayOrder: values.displayOrder,
          isActive: values.isActive,
        };
        return updateRoom(room.id, payload);
      }
      const payload: CreateRoomInput = {
        name: values.name,
        capacity: values.capacity,
        location: values.location || undefined,
        description: values.description || undefined,
        displayOrder: values.displayOrder,
      };
      return createRoom(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? '회의실이 수정되었습니다.' : '회의실이 생성되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'rooms'] });
      void queryClient.invalidateQueries({ queryKey: ['rooms'] });
      onClose();
    },
    onError: (error: ApiError) => {
      const inline = ERROR_MESSAGES[error.code];
      if (inline) {
        setError('root.serverError', { type: 'server', message: inline });
        return;
      }
      toast.error(error.userMessage);
    },
  });

  const onSubmit = handleSubmit((values) => {
    clearErrors('root.serverError');
    mutation.mutate(values);
  });

  const serverError = errors.root?.serverError?.message;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? '회의실 수정' : '회의실 추가'}
      description={isEdit ? '회의실 정보를 수정합니다.' : '새 회의실을 등록합니다.'}
    >
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
          <Label htmlFor="room-name">이름</Label>
          <Input
            id="room-name"
            maxLength={100}
            aria-invalid={Boolean(errors.name)}
            className={cn(errors.name && 'border-destructive')}
            {...register('name')}
          />
          <FieldError message={errors.name?.message} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="room-capacity">수용 인원</Label>
            <Input
              id="room-capacity"
              type="number"
              min={1}
              max={1000}
              aria-invalid={Boolean(errors.capacity)}
              className={cn(errors.capacity && 'border-destructive')}
              {...register('capacity', { setValueAs: numericOrUndefined })}
            />
            <FieldError message={errors.capacity?.message} />
          </div>
          <div>
            <Label htmlFor="room-display-order">표시 순서</Label>
            <Input
              id="room-display-order"
              type="number"
              min={0}
              aria-invalid={Boolean(errors.displayOrder)}
              className={cn(errors.displayOrder && 'border-destructive')}
              {...register('displayOrder', { setValueAs: numericOrZero })}
            />
            <FieldError message={errors.displayOrder?.message} />
          </div>
        </div>

        <div>
          <Label htmlFor="room-location">위치</Label>
          <Input
            id="room-location"
            maxLength={200}
            placeholder="예: 본관 3층"
            {...register('location')}
          />
          <FieldError message={errors.location?.message} />
        </div>

        <div>
          <Label htmlFor="room-description">설명</Label>
          <textarea
            id="room-description"
            className={cn(
              'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              errors.description && 'border-destructive',
            )}
            maxLength={2000}
            {...register('description')}
          />
          <FieldError message={errors.description?.message} />
        </div>

        {isEdit ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              {...register('isActive')}
            />
            활성 상태 (체크 해제 시 신규 예약 차단)
          </label>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            취소
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? '저장 중...' : isEdit ? '수정' : '추가'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
