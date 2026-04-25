import { NextResponse, type NextRequest } from 'next/server';

// 백엔드의 HttpOnly refresh_token 쿠키는 dev 환경(localhost:3000↔3001)에선
// 백엔드 도메인에만 걸리므로 프런트 미들웨어가 읽을 수 없다.
// 대신 로그인 성공 시 auth.store가 기록하는 비민감 세션 마커 쿠키로 인증 여부를 판단.
// 실제 인증은 API 호출 시 axios 인터셉터(401 → refresh)가 책임진다.
const SESSION_COOKIE = 'mr_session';

export function middleware(request: NextRequest): NextResponse {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (hasSession) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  const redirect = request.nextUrl.clone();
  redirect.pathname = '/login';
  redirect.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
  return NextResponse.redirect(redirect);
}

// (main) / (admin) 라우트 그룹에 속하는 실제 URL만 보호한다.
// 라우트 그룹 폴더명은 URL에 반영되지 않으므로 실제 경로로 명시.
// /admin/*의 ADMIN 역할 검증은 클라이언트 AdminGuard와 백엔드 RolesGuard가 책임진다.
export const config = {
  matcher: ['/dashboard/:path*', '/my/:path*', '/admin/:path*'],
};
