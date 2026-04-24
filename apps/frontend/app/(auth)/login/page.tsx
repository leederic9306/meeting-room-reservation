'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FieldError } from '@/components/features/auth/FieldError';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { login, loginFormSchema, type LoginFormValues } from '@/lib/api/auth';
import type { ApiError } from '@/lib/api/axios';
import { useAuthStore } from '@/stores/auth.store';

// useSearchParams는 Suspense 경계가 없으면 Next.js static export 시 CSR bailout 오류를 냄.
// 페이지 본체를 감싸 prerender가 통과하도록 구성.
export default function LoginPage(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: ({ accessToken, user }) => {
      setSession({ accessToken, user });
      toast.success(`${user.name}님 환영합니다.`);
      const next = searchParams.get('next');
      router.push(next && next.startsWith('/') ? next : '/dashboard');
    },
    onError: (error: ApiError) => {
      if (error.code === 'EMAIL_NOT_VERIFIED') {
        toast.error(error.userMessage);
        router.push('/verify-email');
        return;
      }
      if (error.code === 'ACCOUNT_LOCKED') {
        const lockedUntil = error.details?.lockedUntil as string | undefined;
        const until = lockedUntil ? new Date(lockedUntil).toLocaleTimeString('ko-KR') : '잠시 후';
        toast.error(`계정이 잠겼습니다. ${until}까지 다시 시도할 수 없습니다.`);
        return;
      }
      toast.error(error.userMessage);
    },
  });

  const onSubmit = handleSubmit((values) => mutation.mutate(values));

  return (
    <Card>
      <CardHeader>
        <CardTitle>로그인</CardTitle>
        <CardDescription>이메일과 비밀번호를 입력하세요.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="email">이메일</Label>
            <Input id="email" type="email" autoComplete="email" {...register('email')} />
            <FieldError message={errors.email?.message} />
          </div>

          <div>
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register('password')}
            />
            <FieldError message={errors.password?.message} />
          </div>

          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? '로그인 중...' : '로그인'}
          </Button>
        </form>

        <div className="mt-4 flex justify-between text-sm">
          <Link href="/signup" className="text-muted-foreground hover:text-primary">
            회원가입
          </Link>
          <Link href="/forgot-password" className="text-muted-foreground hover:text-primary">
            비밀번호를 잊으셨나요?
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
