'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { FieldError } from '@/components/features/auth/FieldError';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';

const formSchema = z.object({
  reviewComment: z
    .string()
    .min(1, '반려 사유를 입력해주세요.')
    .max(2000, '반려 사유는 2000자 이하여야 합니다.'),
});
type FormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onClose: () => void;
  /** 신청 미리 정보 — 모달 헤더/안내문에 표시. */
  preview: { title: string; userName: string };
  /** 부모가 mutation을 들고 있고 isPending도 부모가 관리. */
  isSubmitting: boolean;
  onSubmit: (reviewComment: string) => Promise<void>;
}

/**
 * 예외 신청 반려 사유 입력 모달.
 * - reviewComment 1자 이상 필수 (서버와 동일 정책)
 * - 부모가 mutation 결과를 관리 (성공 시 onClose, 에러 토스트 등)
 */
export function RejectExceptionRequestModal({
  open,
  onClose,
  preview,
  isSubmitting,
  onSubmit,
}: Props): JSX.Element {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { reviewComment: '' },
  });

  useEffect(() => {
    if (open) reset({ reviewComment: '' });
  }, [open, reset]);

  const submit = handleSubmit(async (values) => {
    await onSubmit(values.reviewComment);
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="예외 신청 반려"
      description={`"${preview.title}" — ${preview.userName} 님의 신청을 반려합니다.`}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="reject-comment" className="text-sm font-medium">
            반려 사유 <span className="text-destructive">*</span>
          </label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            신청자에게 그대로 회신되므로 정중하게 작성해 주세요.
          </p>
          <textarea
            id="reject-comment"
            placeholder="예: 회의실 사용 사유가 명확하지 않습니다. 보완 후 재신청 부탁드립니다."
            className={cn(
              'mt-1 flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              errors.reviewComment && 'border-destructive',
            )}
            maxLength={2000}
            aria-invalid={Boolean(errors.reviewComment)}
            {...register('reviewComment')}
          />
          <FieldError message={errors.reviewComment?.message} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            취소
          </Button>
          <Button type="submit" variant="destructive" disabled={isSubmitting}>
            {isSubmitting ? '반려 중...' : '반려'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
