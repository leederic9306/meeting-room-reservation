'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { FieldError } from '@/components/features/auth/FieldError';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
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

  const footer = (
    <>
      <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
        취소
      </Button>
      <Button type="submit" form="reject-form" variant="destructive" disabled={isSubmitting}>
        {isSubmitting ? '반려 중...' : '반려'}
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="예외 신청 반려"
      description={`"${preview.title}" — ${preview.userName} 님의 신청을 반려합니다.`}
      footer={footer}
    >
      <form id="reject-form" onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="reject-comment">
            반려 사유 <span className="text-danger-500">*</span>
          </Label>
          <p className="mb-1.5 text-xs text-neutral-500">
            신청자에게 그대로 회신되므로 정중하게 작성해 주세요.
          </p>
          <Textarea
            id="reject-comment"
            placeholder="예: 회의실 사용 사유가 명확하지 않습니다. 보완 후 재신청 부탁드립니다."
            className={cn('min-h-[120px]', errors.reviewComment && 'border-danger-500')}
            maxLength={2000}
            aria-invalid={Boolean(errors.reviewComment)}
            {...register('reviewComment')}
          />
          <FieldError message={errors.reviewComment?.message} />
        </div>
      </form>
    </Modal>
  );
}
