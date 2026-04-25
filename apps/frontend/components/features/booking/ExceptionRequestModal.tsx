'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FieldError } from '@/components/features/auth/FieldError';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import type { ApiError } from '@/lib/api/axios';
import {
  createExceptionRequest,
  createExceptionRequestSchema,
  type CreateExceptionRequestInput,
} from '@/lib/api/exception-requests';
import { cn } from '@/lib/utils';
import { formatKstDateTime, formatKstTimeRange } from '@/lib/utils/datetime';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 4시간/과거 검증을 통과하지 못한 예약 폼 값. reason만 추가로 입력받는다. */
  preset: {
    roomId: string;
    title: string;
    startAt: string;
    endAt: string;
    roomName?: string;
  };
}

const ERROR_BANNER: Partial<Record<string, string>> = {
  EXCEPTION_NOT_REQUIRED: '4시간 이내 미래 시간은 일반 예약으로 신청해 주세요.',
  ROOM_INACTIVE: '비활성 상태의 회의실에는 예약할 수 없습니다.',
  ROOM_NOT_FOUND: '존재하지 않는 회의실입니다.',
};

const ERROR_TOAST: Partial<Record<string, string>> = {
  BOOKING_TIME_NOT_QUARTER: '시작/종료 시간은 15분 단위여야 합니다.',
  INVALID_TIME_FORMAT: '시간 형식이 올바르지 않습니다.',
  INVALID_TIME_RANGE: '종료 시간은 시작 시간보다 이후여야 합니다.',
};

/**
 * 예외 신청 사유 입력 모달.
 *
 * - 시간/회의실/제목은 예약 폼 값을 그대로 받아 표시만(읽기 전용)
 * - 사용자는 reason 만 입력 → POST /exception-requests
 * - 성공 시 /my/requests 로 이동 (toast로 안내)
 */
export function ExceptionRequestModal({ open, onClose, preset }: Props): JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<CreateExceptionRequestInput>({
    resolver: zodResolver(createExceptionRequestSchema),
    defaultValues: {
      roomId: preset.roomId,
      title: preset.title,
      startAt: preset.startAt,
      endAt: preset.endAt,
      reason: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      roomId: preset.roomId,
      title: preset.title,
      startAt: preset.startAt,
      endAt: preset.endAt,
      reason: '',
    });
  }, [open, preset.roomId, preset.title, preset.startAt, preset.endAt, reset]);

  const mutation = useMutation({
    mutationFn: createExceptionRequest,
    onSuccess: (result) => {
      // 신청 시점 충돌 정보가 있으면 안내 — 승인 시 다시 검증되므로 차단은 아님.
      const conflictHint =
        result.conflicts.length > 0
          ? ` 신청 시점 기준 ${result.conflicts.length}건의 충돌이 있습니다 — 검토 시 다시 확인됩니다.`
          : '';
      toast.success(`예외 신청이 접수되었습니다.${conflictHint}`);
      void queryClient.invalidateQueries({ queryKey: ['exception-requests', 'me'] });
      onClose();
      router.push('/my/requests');
    },
    onError: (error: ApiError) => {
      if (ERROR_BANNER[error.code] !== undefined) {
        setError('root.serverError', { type: 'server', message: ERROR_BANNER[error.code] });
        return;
      }
      toast.error(ERROR_TOAST[error.code] ?? error.userMessage);
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
      title="예외 신청"
      description="관리자 승인이 필요한 예약 사유를 작성해 주세요."
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

        <dl className="grid grid-cols-[5rem_1fr] gap-y-2 rounded-md border border-input bg-muted/30 p-3 text-sm">
          <dt className="text-muted-foreground">회의실</dt>
          <dd>{preset.roomName ?? '회의실'}</dd>
          <dt className="text-muted-foreground">제목</dt>
          <dd>{preset.title || '(미입력)'}</dd>
          <dt className="text-muted-foreground">날짜</dt>
          <dd>{formatKstDateTime(preset.startAt)}</dd>
          <dt className="text-muted-foreground">시간</dt>
          <dd>{formatKstTimeRange(preset.startAt, preset.endAt)}</dd>
        </dl>

        <div>
          <label htmlFor="exception-reason" className="text-sm font-medium">
            신청 사유 <span className="text-destructive">*</span>
          </label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            10자 이상으로, 4시간 초과/과거 시점이 필요한 사유를 구체적으로 작성해 주세요.
          </p>
          <textarea
            id="exception-reason"
            placeholder="예: 외부 컨설팅 업체와의 종일 워크샵으로 9시간 사용이 필요합니다."
            className={cn(
              'mt-1 flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              errors.reason && 'border-destructive',
            )}
            maxLength={2000}
            aria-invalid={Boolean(errors.reason)}
            {...register('reason')}
          />
          <FieldError message={errors.reason?.message} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            취소
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? '신청 중...' : '예외 신청'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
