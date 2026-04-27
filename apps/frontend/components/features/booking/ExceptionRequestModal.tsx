'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FieldError } from '@/components/features/auth/FieldError';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
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

  const footer = (
    <>
      <Button type="button" variant="secondary" onClick={onClose} disabled={mutation.isPending}>
        취소
      </Button>
      <Button type="submit" form="exception-request-form" disabled={mutation.isPending}>
        {mutation.isPending ? '신청 중...' : '예외 신청'}
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="예외 신청"
      description="관리자 승인이 필요한 예약 사유를 작성해 주세요."
      footer={footer}
    >
      <form id="exception-request-form" onSubmit={onSubmit} className="space-y-5" noValidate>
        {serverError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-danger-500/20 bg-danger-50 px-3 py-2.5 text-sm text-danger-700"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 translate-y-0.5" />
            <span>{serverError}</span>
          </div>
        ) : null}

        <dl className="grid grid-cols-[5rem_1fr] gap-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <dt className="text-neutral-500">회의실</dt>
          <dd className="text-neutral-900">{preset.roomName ?? '회의실'}</dd>
          <dt className="text-neutral-500">제목</dt>
          <dd className="text-neutral-900">{preset.title || '(미입력)'}</dd>
          <dt className="text-neutral-500">날짜</dt>
          <dd className="tabular text-neutral-900">{formatKstDateTime(preset.startAt)}</dd>
          <dt className="text-neutral-500">시간</dt>
          <dd className="tabular text-neutral-900">
            {formatKstTimeRange(preset.startAt, preset.endAt)}
          </dd>
        </dl>

        <div>
          <Label htmlFor="exception-reason">
            신청 사유 <span className="text-danger-500">*</span>
          </Label>
          <p className="mb-1.5 text-xs text-neutral-500">
            10자 이상으로, 4시간 초과/과거 시점이 필요한 사유를 구체적으로 작성해 주세요.
          </p>
          <Textarea
            id="exception-reason"
            placeholder="예: 외부 컨설팅 업체와의 종일 워크샵으로 9시간 사용이 필요합니다."
            className={cn('min-h-[120px]', errors.reason && 'border-danger-500')}
            maxLength={2000}
            aria-invalid={Boolean(errors.reason)}
            {...register('reason')}
          />
          <FieldError message={errors.reason?.message} />
        </div>
      </form>
    </Modal>
  );
}
