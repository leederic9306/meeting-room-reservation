import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

// auth.store가 로그인 시 set, 로그아웃 시 unset하는 비민감 세션 마커.
// middleware.ts의 보호 라우트 판단과 동일한 키.
const SESSION_COOKIE = 'mr_session';

export default function HomePage(): never {
  const hasSession = Boolean(cookies().get(SESSION_COOKIE)?.value);
  redirect(hasSession ? '/dashboard' : '/login');
}
