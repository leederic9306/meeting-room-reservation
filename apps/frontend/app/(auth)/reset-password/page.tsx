'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { AuthFormHeader } from '@/components/features/auth/AuthFormHeader';
import { FieldError } from '@/components/features/auth/FieldError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  confirmPasswordReset,
  resetPasswordFormSchema,
  type ResetPasswordFormValues,
} from '@/lib/api/auth';
import type { ApiError } from '@/lib/api/axios';

// useSearchParams는 Suspense 경계가 없으면 Next.js static export 시 CSR bailout 오류를 냄.
export default function ResetPasswordPage(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}

function ResetPasswordPageContent(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: ResetPasswordFormValues) =>
      confirmPasswordReset({ token, newPassword: values.newPassword }),
    onSuccess: () => {
      toast.success('비밀번호가 변경되었습니다. 다시 로그인해주세요.');
      router.push('/login');
    },
    onError: (error: ApiError) => {
      toast.error(error.userMessage);
    },
  });

  const onSubmit = handleSubmit((values) => {
    if (!token) {
      toast.error('재설정 토큰이 유효하지 않습니다. 다시 요청해주세요.');
      return;
    }
    mutation.mutate(values);
  });

  if (!token) {
    return (
      <div>
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-warning-50">
          <AlertTriangle className="h-6 w-6 text-warning-700" strokeWidth={1.75} />
        </div>
        <AuthFormHeader
          title="유효하지 않은 링크"
          description="재설정 링크가 잘못되었거나 만료되었습니다."
        />
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-brand-600 hover:underline"
        >
          비밀번호 재설정 다시 요청 →
        </Link>
      </div>
    );
  }

  return (
    <>
      <AuthFormHeader title="새 비밀번호 설정" description="새로 사용할 비밀번호를 입력해주세요." />

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="newPassword">새 비밀번호</Label>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            placeholder="영문+숫자+특수문자 8자 이상"
            {...register('newPassword')}
          />
          <FieldError message={errors.newPassword?.message} />
        </div>

        <div>
          <Label htmlFor="confirmPassword">비밀번호 확인</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            {...register('confirmPassword')}
          />
          <FieldError message={errors.confirmPassword?.message} />
        </div>

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? '변경 중...' : '비밀번호 변경'}
        </Button>
      </form>
    </>
  );
}
