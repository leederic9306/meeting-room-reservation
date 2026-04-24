'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FieldError } from '@/components/features/auth/FieldError';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signup, signupFormSchema, type SignupFormValues } from '@/lib/api/auth';
import type { ApiError } from '@/lib/api/axios';

export default function SignupPage(): JSX.Element {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: {
      email: '',
      password: '',
      name: '',
      department: '',
      employeeNo: '',
      phone: '',
    },
  });

  const mutation = useMutation({
    mutationFn: signup,
    onSuccess: (data) => {
      toast.success('인증 코드를 이메일로 발송했습니다.');
      router.push(`/verify-email?email=${encodeURIComponent(data.email)}`);
    },
    onError: (error: ApiError) => {
      toast.error(error.userMessage);
    },
  });

  const onSubmit = handleSubmit((values) => mutation.mutate(values));

  return (
    <Card>
      <CardHeader>
        <CardTitle>회원가입</CardTitle>
        <CardDescription>사내 회의실 예약 시스템 계정을 만듭니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="user@example.com"
              {...register('email')}
            />
            <FieldError message={errors.email?.message} />
          </div>

          <div>
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="영문+숫자+특수문자 포함 8자 이상"
              {...register('password')}
            />
            <FieldError message={errors.password?.message} />
          </div>

          <div>
            <Label htmlFor="name">이름</Label>
            <Input id="name" autoComplete="name" {...register('name')} />
            <FieldError message={errors.name?.message} />
          </div>

          <div>
            <Label htmlFor="department">부서 (선택)</Label>
            <Input id="department" {...register('department')} />
            <FieldError message={errors.department?.message} />
          </div>

          <div>
            <Label htmlFor="employeeNo">사번 (선택)</Label>
            <Input id="employeeNo" {...register('employeeNo')} />
            <FieldError message={errors.employeeNo?.message} />
          </div>

          <div>
            <Label htmlFor="phone">전화번호 (선택)</Label>
            <Input id="phone" autoComplete="tel" {...register('phone')} />
            <FieldError message={errors.phone?.message} />
          </div>

          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? '처리 중...' : '가입하기'}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          이미 계정이 있으신가요?{' '}
          <Link href="/login" className="text-primary hover:underline">
            로그인
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
