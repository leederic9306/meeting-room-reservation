import { z } from 'zod';

import type { AuthRole, AuthUser } from '@/stores/auth.store';

import { api, unwrap } from './axios';

// ---- 공유 검증 규칙 -------------------------------------------------------

/** PRD AUTH-002 — 8자 이상, 영문+숫자+특수문자 각 1자 이상. */
export const passwordSchema = z
  .string()
  .min(8, '비밀번호는 8자 이상이어야 합니다.')
  .max(72, '비밀번호는 72자 이하여야 합니다.')
  .regex(/[A-Za-z]/, '영문을 포함해야 합니다.')
  .regex(/[0-9]/, '숫자를 포함해야 합니다.')
  .regex(/[^A-Za-z0-9]/, '특수문자를 포함해야 합니다.');

export const emailSchema = z.string().email('이메일 형식이 올바르지 않습니다.');

// ---- 폼 스키마 ------------------------------------------------------------

export const signupFormSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1, '이름을 입력해주세요.').max(50),
  department: z.string().max(100).optional().or(z.literal('')),
  employeeNo: z.string().max(50).optional().or(z.literal('')),
  phone: z.string().max(20).optional().or(z.literal('')),
});
export type SignupFormValues = z.infer<typeof signupFormSchema>;

export const verifyEmailFormSchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/, '6자리 숫자 코드를 입력해주세요.'),
});
export type VerifyEmailFormValues = z.infer<typeof verifyEmailFormSchema>;

export const loginFormSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, '비밀번호를 입력해주세요.'),
});
export type LoginFormValues = z.infer<typeof loginFormSchema>;

export const forgotPasswordFormSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordFormSchema>;

export const resetPasswordFormSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: '비밀번호가 일치하지 않습니다.',
  });
export type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>;

// ---- API 응답 타입 -------------------------------------------------------

interface SignupResponseData {
  userId: string;
  email: string;
  verificationRequired: boolean;
  codeSentAt: string;
}

interface AuthSessionResponseData {
  accessToken: string;
  user: { id: string; email: string; name: string; role: AuthRole };
}

interface VerifyEmailResponseData extends AuthSessionResponseData {
  verified: true;
}

interface ResendCodeResponseData {
  codeSentAt: string;
  nextResendAvailableAt: string;
}

interface PasswordResetMessageData {
  message: string;
}

// ---- API 함수 ------------------------------------------------------------

export async function signup(values: SignupFormValues): Promise<SignupResponseData> {
  const payload = {
    email: values.email,
    password: values.password,
    name: values.name,
    department: values.department || undefined,
    employeeNo: values.employeeNo || undefined,
    phone: values.phone || undefined,
  };
  const res = await api.post<{ data: SignupResponseData }>('/auth/signup', payload);
  return unwrap(res.data);
}

export async function verifyEmail(
  values: VerifyEmailFormValues,
): Promise<{ accessToken: string; user: AuthUser }> {
  const res = await api.post<{ data: VerifyEmailResponseData }>('/auth/verify-email', values);
  const { accessToken, user } = unwrap(res.data);
  return { accessToken, user };
}

export async function resendVerificationCode(email: string): Promise<ResendCodeResponseData> {
  const res = await api.post<{ data: ResendCodeResponseData }>('/auth/resend-code', {
    email,
  });
  return unwrap(res.data);
}

export async function login(
  values: LoginFormValues,
): Promise<{ accessToken: string; user: AuthUser }> {
  const res = await api.post<{ data: AuthSessionResponseData }>('/auth/login', values);
  return unwrap(res.data);
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

export async function requestPasswordReset(email: string): Promise<PasswordResetMessageData> {
  const res = await api.post<{ data: PasswordResetMessageData }>('/auth/password-reset/request', {
    email,
  });
  return unwrap(res.data);
}

export async function confirmPasswordReset(payload: {
  token: string;
  newPassword: string;
}): Promise<PasswordResetMessageData> {
  const res = await api.post<{ data: PasswordResetMessageData }>(
    '/auth/password-reset/confirm',
    payload,
  );
  return unwrap(res.data);
}
