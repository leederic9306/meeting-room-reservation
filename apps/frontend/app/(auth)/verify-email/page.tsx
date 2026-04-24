'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FieldError } from '@/components/features/auth/FieldError';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<VerifyEmailFormValues>({
    resolver: zodResolver(verifyEmailFormSchema),
    defaultValues: { email: initialEmail, code: '' },
  });

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
    const email = getValues('email');
    if (!email) {
      toast.error('이메일을 먼저 입력해주세요.');
      return;
    }
    resendMutation.mutate(email);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>이메일 인증</CardTitle>
        <CardDescription>
          가입한 이메일로 발송된 6자리 코드를 입력해주세요. (10분 내 유효)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="email">이메일</Label>
            <Input id="email" type="email" autoComplete="email" {...register('email')} />
            <FieldError message={errors.email?.message} />
          </div>

          <div>
            <Label htmlFor="code">인증 코드</Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              {...register('code')}
            />
            <FieldError message={errors.code?.message} />
          </div>

          <Button type="submit" className="w-full" disabled={verifyMutation.isPending}>
            {verifyMutation.isPending ? '확인 중...' : '인증 완료'}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleResend}
            disabled={cooldown > 0 || resendMutation.isPending}
          >
            {cooldown > 0
              ? `재전송 (${cooldown}초 후 가능)`
              : resendMutation.isPending
                ? '재전송 중...'
                : '인증 코드 재전송'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
