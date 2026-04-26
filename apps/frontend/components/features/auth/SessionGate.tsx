'use client';

import axios from 'axios';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { getApiBaseUrl } from '@/lib/api/base-url';
import { getAccessToken, useAuthStore } from '@/stores/auth.store';

const SESSION_COOKIE_RE = /(?:^|;\s*)mr_session=1/;

type GateStatus = 'pending' | 'refreshing' | 'ready' | 'failed';

/**
 * 보호 라우트 진입 직후 access token이 메모리에 비어있으면(=새로고침 직후) 자식의
 * 데이터 쿼리가 401을 먼저 만나 깜빡이거나 refresh 실패로 로그인으로 튕기기 전에,
 * 한 번만 /auth/refresh를 호출해 token을 미리 복구한다.
 *
 * 세션 존재 판단은 **쿠키**(mr_session)를 본다. zustand persist의 user 상태는
 * SSR→client hydration 시점에는 비어있어 "로그인 안 됨"으로 잘못 판정될 수 있다.
 * mr_session 쿠키는 동기적으로 즉시 읽을 수 있어 이런 경합을 피한다.
 *
 * - 쿠키 없음(=비로그인): 그대로 자식을 렌더 — middleware 가 /login 으로 redirect.
 * - refresh 성공: 자식 렌더 (이때부터 인터셉터가 정상 동작).
 * - refresh 실패: 세션 정리 후 /login 로 이동.
 *
 * StrictMode/dev에서 effect가 두 번 마운트돼도 ref 가드로 한 번만 실행한다.
 */
export function SessionGate({ children }: { children: ReactNode }): JSX.Element {
  const router = useRouter();
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const clear = useAuthStore((s) => s.clear);
  const [status, setStatus] = useState<GateStatus>('pending');
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // 토큰이 이미 있으면 즉시 통과 — 로그인 직후 정상 흐름.
    if (getAccessToken() !== undefined) {
      setStatus('ready');
      return;
    }
    // mr_session 쿠키조차 없으면 비로그인 — middleware 가 /login 으로 보낸다.
    if (!SESSION_COOKIE_RE.test(document.cookie)) {
      setStatus('ready');
      return;
    }
    setStatus('refreshing');
    axios
      .post<{ data: { accessToken: string } }>(
        `${getApiBaseUrl()}/auth/refresh`,
        {},
        { withCredentials: true },
      )
      .then((res) => {
        setAccessToken(res.data.data.accessToken);
        setStatus('ready');
      })
      .catch(() => {
        clear();
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        router.replace(`/login?next=${next}`);
        setStatus('failed');
      });
  }, [setAccessToken, clear, router]);

  if (status === 'ready') return <>{children}</>;
  // 토큰 복구 중에는 헤더/캘린더가 깜빡이지 않도록 빈 placeholder만 노출.
  return <div aria-busy="true" className="min-h-screen" />;
}
