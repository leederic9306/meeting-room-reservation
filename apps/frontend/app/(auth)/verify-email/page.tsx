'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FieldError } from '@/components/features/auth/FieldError';
import { OtpInput } from '@/components/features/auth/OtpInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  resendVerificationCode,
  verifyEmail,
  verifyEmailFormSchema,
  type VerifyEmailFormValues,
} from '@/lib/api/auth';
import type { ApiError } from '@/lib/api/axios';
import { useAuthStore } from '@/stores/auth.store';

const RESEND_COOLDOWN_SECONDS = 60;

// useSearchParams는 Suspense 경계가 없으면 Next.js static export 시 CSR bailout 오류를 냄.
export default function VerifyEmailPage(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <VerifyEmailPageContent />
    </Suspense>
  );
}

function VerifyEmailPageContent(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const initialEmail = searchParams.get('email') ?? '';

  const [cooldown, setCooldown] = useState<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    control,
    register,
    handleSubmit,
    getValues,
    watch,
    formState: { errors },
  } = useForm<VerifyEmailFormValues>({
    resolver: zodResolver(verifyEmailFormSchema),
    defaultValues: { email: initialEmail, code: '' },
  });

  const email = watch('email');

  // 가입 직후 진입 시 자동으로 60초 카운트다운 시작 (PRD AUTH-007)
  useEffect(() => {
    if (initialEmail) startCooldown(RESEND_COOLDOWN_SECONDS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startCooldown(seconds: number): void {
    setCooldown(seconds);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  const verifyMutation = useMutation({
    mutationFn: verifyEmail,
    onSuccess: ({ accessToken, user }) => {
      setSession({ accessToken, user });
      toast.success('이메일 인증이 완료되었습니다.');
      router.push('/dashboard');
    },
    onError: (error: ApiError) => {
      toast.error(error.userMessage);
    },
  });

  const resendMutation = useMutation({
    mutationFn: resendVerificationCode,
    onSuccess: (data) => {
      toast.success('인증 코드를 재발송했습니다.');
      const next = new Date(data.nextResendAvailableAt).getTime();
      const remain = Math.max(0, Math.ceil((next - Date.now()) / 1000));
      startCooldown(remain || RESEND_COOLDOWN_SECONDS);
    },
    onError: (error: ApiError) => {
      const retryAfter = (error.details?.retryAfterSeconds as number | undefined) ?? 0;
      if (error.code === 'RESEND_COOLDOWN' && retryAfter > 0) {
        startCooldown(retryAfter);
      }
      toast.error(error.userMessage);
    },
  });

  const onSubmit = handleSubmit((values) => verifyMutation.mutate(values));

  function handleResend(): void {
    const currentEmail = getValues('email');
    if (!currentEmail) {
      toast.error('이메일을 먼저 입력해주세요.');
      return;
    }
    resendMutation.mutate(currentEmail);
  }

  return (
    <div className="text-center">
      {/* 일러스트 — 그라데이션 원 안의 메일 아이콘 (§5.3) */}
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-brand-50">
        <Mail className="h-8 w-8 text-brand-600" strokeWidth={1.75} />
      </div>

      <h2 className="text-h2 font-semibold tracking-tight text-neutral-900">
        이메일을 확인해주세요
      </h2>
      <p className="mt-2 text-sm text-neutral-500">
        {email ? (
          <>
            <span className="font-medium text-neutral-900">{email}</span>로<br />
            6자리 인증 코드를 보냈습니다.
          </>
        ) : (
          '가입한 이메일로 발송된 6자리 코드를 입력해주세요. (10분 내 유효)'
        )}
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5 text-left" noValidate>
        {/* 가입 직후엔 이메일이 readonly에 가깝지만, 직접 진입 시 수정 가능해야 함 */}
        <div>
          <Label htmlFor="email">이메일</Label>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
          <FieldError message={errors.email?.message} />
        </div>

        <div>
          <Label htmlFor="code-0">인증 코드</Label>
          <Controller
            control={control}
            name="code"
            render={({ field }) => (
              <OtpInput
                value={field.value ?? ''}
                onChange={field.onChange}
                autoFocus={Boolean(initialEmail)}
                disabled={verifyMutation.isPending}
              />
            )}
          />
          <div className="mt-1 text-center">
            <FieldError message={errors.code?.message} />
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={verifyMutation.isPending}>
          {verifyMutation.isPending ? '확인 중...' : '인증 완료'}
        </Button>
      </form>

      <p className="mt-6 text-sm text-neutral-500">
        코드를 받지 못하셨나요?{' '}
        {cooldown > 0 ? (
          <span className="tabular text-neutral-400">{cooldown}초 후 재전송 가능</span>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={resendMutation.isPending}
            className="font-medium text-brand-600 hover:underline disabled:opacity-50"
          >
            {resendMutation.isPending ? '재전송 중...' : '재전송'}
          </button>
        )}
      </p>
    </div>
  );
}
