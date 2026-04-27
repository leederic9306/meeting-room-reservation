import { CalendarDays } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * AuthLayout — docs/07-design.md §5.2
 *
 * 2분할 레이아웃:
 * - 좌측 (lg+): 브랜드 그라데이션 패널 + 로고 + 카피 + 통계
 * - 우측: 페이지 폼 (모바일은 풀너비)
 *
 * 화면 정중앙에 외롭게 떠 있던 카드 패턴을 제거 — 폼은 컨텍스트(브랜드/메시지)와
 * 함께 보일 때 더 자연스럽다.
 */
export default function AuthLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* === 좌측 — 비주얼 패널 (데스크탑 전용) === */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-neutral-900 p-12 lg:flex">
        {/* 미세한 격자 패턴 — 평면을 깨주되 시각적으로 거슬리지 않을 정도 (opacity 3%). */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* 상단 — 로고 */}
        <Link
          href="/"
          className="relative flex items-center gap-2.5 text-white"
          aria-label="홈으로"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 backdrop-blur-sm">
            <CalendarDays className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <span className="text-base font-semibold tracking-tight">Meeting</span>
        </Link>

        {/* 하단 — 카피 + 통계 */}
        <div className="relative max-w-md">
          <h1 className="text-display font-semibold leading-tight tracking-tight text-white">
            모두의 시간을 존중하는
            <br />
            가장 단순한 회의실 예약
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/80">
            15분 단위 예약, 자동 충돌 방지, 반복 일정까지.
            <br />
            팀이 필요한 모든 기능을 한 화면에 담았습니다.
          </p>

          <div className="mt-8 flex items-center gap-8 border-t border-white/10 pt-6">
            <Stat value="15분" label="단위 슬롯" />
            <Stat value="자동" label="충돌 방지" />
            <Stat value="RRULE" label="반복 예약" />
          </div>
        </div>
      </div>

      {/* === 우측 — 폼 패널 === */}
      <div className="flex items-center justify-center bg-neutral-50 px-6 py-12 lg:px-12">
        <div className="w-full max-w-sm">
          {/* 모바일 전용 로고 — 데스크탑은 좌측 패널이 대체 */}
          <Link href="/" className="mb-8 flex items-center gap-2.5 lg:hidden" aria-label="홈으로">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 shadow-xs">
              <CalendarDays className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-semibold tracking-tight text-neutral-900">Meeting</span>
          </Link>

          {children}
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }): JSX.Element {
  return (
    <div>
      <p className="tabular text-xl font-semibold text-white">{value}</p>
      <p className="mt-0.5 text-xs text-white/65">{label}</p>
    </div>
  );
}
