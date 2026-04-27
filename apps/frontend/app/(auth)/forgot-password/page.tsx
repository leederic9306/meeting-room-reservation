'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { AuthFormHeader } from '@/components/features/auth/AuthFormHeader';
import { FieldError } from '@/components/features/auth/FieldError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  forgotPasswordFormSchema,
  requestPasswordReset,
  type ForgotPasswordFormValues,
} from '@/lib/api/auth';
import type { ApiError } from '@/lib/api/axios';

export default function ForgotPasswordPage(): JSX.Element {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitSuccessful },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordFormSchema),
    defaultValues: { email: '' },
  });

  const mutation = useMutation({
    mutationFn: ({ email }: ForgotPasswordFormValues) => requestPasswordReset(email),
    onSuccess: () => {
      toast.success('이메일이 등록되어 있다면 재설정 링크를 발송했습니다.');
    },
    onError: (error: ApiError) => {
      toast.error(error.userMessage);
    },
  });

  const onSubmit = handleSubmit((values) => mutation.mutate(values));

  return (
    <>
      <AuthFormHeader
        title="비밀번호 재설정"
        description="가입한 이메일로 재설정 링크를 발송해드립니다."
      />

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="email">이메일</Label>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
          <FieldError message={errors.email?.message} />
        </div>

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? '전송 중...' : '재설정 링크 받기'}
        </Button>
      </form>

      {isSubmitSuccessful && mutation.isSuccess && (
        <p className="mt-4 rounded-lg border border-success-500/20 bg-success-50 p-3 text-sm text-success-700">
          메일함을 확인해주세요. 메일이 보이지 않으면 스팸함도 확인해주세요.
        </p>
      )}

      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-medium text-neutral-600 hover:text-brand-600">
          로그인으로 돌아가기
        </Link>
      </p>
    </>
  );
}
