# DESIGN.md — 사내 회의실 예약 시스템 디자인 가이드

> **문서 정보**
>
> - 버전: 1.0
> - 작성일: 2026-04-26
> - 대상: Claude Code 및 디자인 작업자
> - 목적: 일관된 디자인 언어로 모든 화면을 다듬기 위한 단일 진실 공급원

---

## 0. 디자인 컨셉

### 0.1 컨셉 한 줄 정의

> **"신뢰할 수 있는 사내 도구의 정중함, Linear/Notion 수준의 정밀함"**

### 0.2 톤 & 무드

| 축            | 선택                             | 이유                         |
| ------------- | -------------------------------- | ---------------------------- |
| **밀도**      | 적당히 밀도 있음 (Notion/Linear) | 사내 도구는 정보 밀도가 중요 |
| **컬러 사용** | 절제 (모노 + 1 포인트)           | 차분하고 신뢰감 있는 인상    |
| **모서리**    | 부드러움 (radius 8~12px)         | 친근하지만 느슨하지 않음     |
| **그림자**    | 매우 약함 (subtle only)          | 깊이는 색조 차이로 표현      |
| **여백**      | 넉넉함                           | 시각적 호흡 확보             |
| **모션**      | 절제된 미세 모션                 | 산만하지 않게                |

### 0.3 피해야 할 것 (AI Slop 회피)

- 보라색 그라데이션
- 모든 카드에 동일한 두꺼운 그림자
- 과한 이모지 사용
- 의미 없는 글래스모피즘
- 모든 버튼에 호버 시 scale(1.05)
- 무의미한 그라데이션 텍스트

---

## 1. 컬러 시스템

### 1.1 핵심 원칙

**60-30-10 법칙**:

- 60% — 뉴트럴 (배경, 표면)
- 30% — 텍스트 + 보더
- 10% — 브랜드 컬러 (액션 버튼, 링크, 강조)

### 1.2 컬러 팔레트

CSS 변수로 모두 정의. `app/globals.css`에 배치.

```css
:root {
  /* === Brand === */
  --brand-50: #eff4ff;
  --brand-100: #dbe5fe;
  --brand-200: #bfd0fd;
  --brand-300: #93b0fa;
  --brand-400: #6087f5;
  --brand-500: #3b63ee; /* Primary */
  --brand-600: #2748d8; /* Hover */
  --brand-700: #1f37af; /* Active */
  --brand-800: #1e3289;
  --brand-900: #1e2d6b;

  /* === Neutral (Slate 계열, 약간 차가운 톤) === */
  --neutral-0: #ffffff;
  --neutral-50: #f8fafc; /* 페이지 배경 */
  --neutral-100: #f1f5f9; /* 카드 호버, 보조 표면 */
  --neutral-200: #e2e8f0; /* 보더 */
  --neutral-300: #cbd5e1; /* 보더 강조 */
  --neutral-400: #94a3b8; /* 비활성 텍스트 */
  --neutral-500: #64748b; /* 보조 텍스트 */
  --neutral-600: #475569; /* 본문 보조 */
  --neutral-700: #334155; /* 본문 */
  --neutral-800: #1e293b; /* 강조 텍스트 */
  --neutral-900: #0f172a; /* 제목 */

  /* === Semantic === */
  --success-50: #ecfdf5;
  --success-500: #10b981;
  --success-700: #047857;

  --warning-50: #fffbeb;
  --warning-500: #f59e0b;
  --warning-700: #b45309;

  --danger-50: #fef2f2;
  --danger-500: #ef4444;
  --danger-700: #b91c1c;

  /* === 캘린더 전용 (회의실별 색) === */
  --room-1: #3b63ee; /* Brand */
  --room-2: #14b8a6; /* Teal */
  --room-3: #f59e0b; /* Amber */
  --room-4: #ec4899; /* Pink */
  --room-5: #8b5cf6; /* Violet */
  --room-6: #06b6d4; /* Cyan */
  --room-7: #84cc16; /* Lime */
  --room-8: #f43f5e; /* Rose */
  --room-9: #6366f1; /* Indigo */
  --room-10: #a855f7; /* Purple */

  /* === Surface === */
  --surface-bg: var(--neutral-50);
  --surface-card: var(--neutral-0);
  --surface-elevated: var(--neutral-0);
  --surface-overlay: rgba(15, 23, 42, 0.4); /* Modal backdrop */

  /* === Shadow (매우 절제) === */
  --shadow-xs: 0 1px 2px rgba(15, 23, 42, 0.04);
  --shadow-sm: 0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04);
  --shadow-md: 0 4px 6px -2px rgba(15, 23, 42, 0.06), 0 2px 4px -2px rgba(15, 23, 42, 0.04);
  --shadow-lg: 0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.04);
  --shadow-xl: 0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.04);

  /* === Border Radius === */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;
}

/* === Dark mode (Phase 2 이후) === */
.dark {
  --surface-bg: #0b1120;
  --surface-card: #131c2e;
  --surface-elevated: #1a2438;
  /* ... 추후 정의 */
}
```

### 1.3 Tailwind 통합

`tailwind.config.ts`:

```ts
extend: {
  colors: {
    brand: {
      50: 'var(--brand-50)',
      // ... 100~900
    },
    neutral: { /* same */ },
    success: { /* same */ },
  },
  boxShadow: {
    xs: 'var(--shadow-xs)',
    sm: 'var(--shadow-sm)',
    md: 'var(--shadow-md)',
    lg: 'var(--shadow-lg)',
    xl: 'var(--shadow-xl)',
  },
  borderRadius: {
    sm: 'var(--radius-sm)',
    md: 'var(--radius-md)',
    lg: 'var(--radius-lg)',
    xl: 'var(--radius-xl)',
  },
}
```

---

## 2. 타이포그래피

### 2.1 폰트 페어링

**한글**: Pretendard (가변 폰트, 한국어 최적화)
**영문/숫자**: Inter는 너무 흔하므로 의도적으로 회피, 대신 **Geist Sans** 사용 (Vercel 제작, 깔끔하고 모던)
**숫자 (캘린더, 통계)**: Geist Mono (등폭 — 캘린더 시간 정렬용)

```html
<!-- app/layout.tsx -->
<link
  rel="stylesheet"
  as="style"
  crossorigin="anonymous"
  href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
/>
```

```ts
// app/layout.tsx
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';

<body className={`${GeistSans.variable} ${GeistMono.variable}`}>
```

```css
:root {
  --font-sans: 'Pretendard Variable', 'GeistSans', -apple-system, sans-serif;
  --font-mono: 'GeistMono', 'SF Mono', monospace;
}

body {
  font-family: var(--font-sans);
}
.tabular {
  font-family: var(--font-mono);
  font-feature-settings: 'tnum';
}
```

### 2.2 타입 스케일

| 토큰           | 크기             | 줄높이 | 용도                          |
| -------------- | ---------------- | ------ | ----------------------------- |
| `text-display` | 36px / 2.25rem   | 1.1    | 페이지 메인 타이틀 (대시보드) |
| `text-h1`      | 28px / 1.75rem   | 1.2    | 페이지 타이틀                 |
| `text-h2`      | 22px / 1.375rem  | 1.3    | 섹션 타이틀                   |
| `text-h3`      | 18px / 1.125rem  | 1.4    | 카드 헤더                     |
| `text-body`    | 14px / 0.875rem  | 1.5    | 본문 (기본)                   |
| `text-sm`      | 13px / 0.8125rem | 1.5    | 보조 정보                     |
| `text-xs`      | 12px / 0.75rem   | 1.4    | 메타 정보, 라벨               |
| `text-micro`   | 11px / 0.6875rem | 1.4    | 배지, 캡션                    |

**font-weight**:

- `400` 본문
- `500` 강조 본문
- `600` 헤더, 버튼
- `700` 큰 타이틀만

### 2.3 위계 원칙

- 한 화면에 H1은 1개만
- 제목과 본문 사이 크기 차이는 최소 1.5배
- letter-spacing: 큰 제목은 -0.02em (타이트), 라벨은 +0.05em (트래킹)

---

## 3. 레이아웃 시스템

### 3.1 Spacing Scale

4px 베이스, Tailwind 기본 사용:

```
1 = 4px
2 = 8px
3 = 12px
4 = 16px   ← 가장 자주 사용
5 = 20px
6 = 24px   ← 컴포넌트 간 간격
8 = 32px
10 = 40px
12 = 48px  ← 섹션 간 간격
16 = 64px
```

**카드 내부 패딩**: 16px (작은 카드) / 24px (큰 카드)
**섹션 간 마진**: 32~48px
**페이지 좌우 마진**: 24px (모바일) / 32px (데스크탑)

### 3.2 컨테이너

```tsx
// 페이지 최대 너비
<div className="mx-auto w-full max-w-[1280px] px-6 lg:px-8">
```

캘린더 페이지는 더 넓게 (1440px), 폼 페이지는 좁게 (480px) 등 페이지 성격에 맞춤.

### 3.3 그리드

12 컬럼 그리드 사용 시:

```tsx
<div className="grid grid-cols-12 gap-6">
```

대부분은 flexbox로 충분. 그리드는 카드 갤러리, 통계 위젯에만.

---

## 4. 컴포넌트 디자인 토큰

### 4.1 버튼

**Primary**

```tsx
className="
  h-10 px-4
  inline-flex items-center justify-center gap-2
  rounded-lg
  bg-brand-500 text-white
  text-sm font-semibold
  shadow-xs
  transition-all duration-150
  hover:bg-brand-600
  active:bg-brand-700
  focus:outline-none focus:ring-2 focus:ring-brand-200 focus:ring-offset-2
  disabled:opacity-50 disabled:cursor-not-allowed
"
```

**Secondary** (현재 가장 부족한 부분)

```tsx
className="
  h-10 px-4
  inline-flex items-center justify-center gap-2
  rounded-lg
  bg-white text-neutral-700
  text-sm font-semibold
  border border-neutral-200
  transition-all duration-150
  hover:bg-neutral-50 hover:border-neutral-300
  active:bg-neutral-100
"
```

**Ghost** (탭/네비게이션)

```tsx
className="
  h-9 px-3
  inline-flex items-center
  rounded-md
  text-sm font-medium text-neutral-600
  transition-colors
  hover:bg-neutral-100 hover:text-neutral-900
"
```

**Danger** (삭제)

```tsx
className="
  h-10 px-4
  bg-danger-500 text-white
  hover:bg-danger-700
  ...
"
```

크기 변형: `h-8` (sm), `h-10` (md, 기본), `h-12` (lg).

### 4.2 입력 필드

```tsx
className="
  h-10 w-full px-3
  rounded-lg
  bg-white
  border border-neutral-200
  text-sm text-neutral-900
  placeholder:text-neutral-400
  transition-colors
  hover:border-neutral-300
  focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100
  disabled:bg-neutral-50 disabled:text-neutral-400
"
```

**중요**: 현재 화면들의 가장 큰 시각 결함이 입력 필드 — border가 너무 진하고 radius가 작음. 위 토큰 적용 시 즉시 개선.

### 4.3 카드

**일반 카드**

```tsx
className="
  bg-white
  border border-neutral-200
  rounded-xl
  shadow-xs
  p-6
"
```

**인터랙티브 카드** (호버 시 강조)

```tsx
className="
  bg-white border border-neutral-200 rounded-xl shadow-xs p-6
  transition-all duration-200
  hover:border-neutral-300 hover:shadow-sm hover:-translate-y-0.5
  cursor-pointer
"
```

### 4.4 배지

```tsx
// 상태 배지 (활성, 인증대기 등)
const variants = {
  success: 'bg-success-50 text-success-700 border border-success-500/20',
  warning: 'bg-warning-50 text-warning-700 border border-warning-500/20',
  danger: 'bg-danger-50 text-danger-700 border border-danger-500/20',
  neutral: 'bg-neutral-100 text-neutral-700 border border-neutral-200',
  brand: 'bg-brand-50 text-brand-700 border border-brand-500/20',
};

// 사용
<span className="inline-flex items-center gap-1 px-2 h-6 rounded-md text-xs font-medium ${variants.success}">
  <span className="w-1.5 h-1.5 rounded-full bg-success-500" />
  활성
</span>;
```

### 4.5 테이블

```tsx
<table className="w-full">
  <thead>
    <tr className="border-b border-neutral-200">
      <th className="text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider px-4 py-3">
        이름
      </th>
    </tr>
  </thead>
  <tbody className="divide-y divide-neutral-100">
    <tr className="hover:bg-neutral-50 transition-colors">
      <td className="px-4 py-3 text-sm text-neutral-900">...</td>
    </tr>
  </tbody>
</table>
```

**개선 포인트**: 현재 사용자 관리 테이블은 행 높이가 일관되지 않음 → `py-3`으로 통일.

### 4.6 모달

```tsx
// Backdrop
className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm"

// Container
className="
  fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
  w-full max-w-md
  bg-white rounded-2xl shadow-xl
  p-6
"
```

`backdrop-blur-sm` 살짝 적용하면 깊이감 ↑ (현재 그냥 흰색 배경에 떠있음).

### 4.7 탭 네비게이션 (현재 가장 약한 부분)

```tsx
// Container
<div className="border-b border-neutral-200">
  <nav className="-mb-px flex gap-1">
    {tabs.map((tab) => (
      <button
        className={cn(
          'px-4 py-3 text-sm font-medium transition-colors relative',
          active ? 'text-brand-600' : 'text-neutral-500 hover:text-neutral-900',
        )}
      >
        {tab.label}
        {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />}
      </button>
    ))}
  </nav>
</div>
```

**개선 포인트**: 현재 활성 탭이 단순 색상 변경뿐 → 하단 굵은 라인 추가로 가시성 ↑.

---

## 5. 페이지별 개선 가이드

각 화면을 어떻게 다시 디자인할지 구체적으로 정리. Claude Code가 이 가이드를 보고 작업하면 됩니다.

### 5.1 글로벌 헤더 (모든 페이지 공통)

**현재**: 좌측 "회의실 예약" 텍스트, 우측 메뉴 — 너무 평범
**개선**:

```tsx
<header className="sticky top-0 z-50 h-14 bg-white/80 backdrop-blur-md border-b border-neutral-200">
  <div className="mx-auto max-w-[1440px] h-full px-6 flex items-center justify-between">
    {/* 좌측 - 로고 */}
    <Link href="/dashboard" className="flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
        <CalendarIcon className="w-4 h-4 text-white" strokeWidth={2.5} />
      </div>
      <span className="font-semibold text-neutral-900 tracking-tight">Meeting</span>
    </Link>

    {/* 중앙 - 네비게이션 (선택) */}
    <nav className="hidden md:flex items-center gap-1">
      <NavLink href="/dashboard">캘린더</NavLink>
      <NavLink href="/my/requests">내 신청</NavLink>
    </nav>

    {/* 우측 - 사용자 메뉴 */}
    <div className="flex items-center gap-3">
      {isAdmin && (
        <Link
          href="/admin"
          className="px-3 h-8 rounded-md bg-neutral-100 text-xs font-semibold text-neutral-700 hover:bg-neutral-200 transition-colors flex items-center gap-1.5"
        >
          <ShieldIcon className="w-3.5 h-3.5" />
          관리자
        </Link>
      )}
      <UserMenu user={user} /> {/* 아바타 + 드롭다운 */}
    </div>
  </div>
</header>
```

**핵심 개선**:

- 작은 그라데이션 아이콘 로고 (브랜드 정체성)
- `backdrop-blur` + 반투명 배경 (스크롤 시 자연스러움)
- 관리자 진입은 배지 형태 (시각적으로 분리)
- 사용자 메뉴는 텍스트 대신 아바타 (이름 첫 글자) → 드롭다운

---

### 5.2 로그인 / 회원가입 화면

**현재 문제점**: 카드가 화면 정중앙에 외롭게 떠 있음. 컨텍스트 부족.
**개선 방향**: **2분할 레이아웃** (좌측 비주얼, 우측 폼)

```tsx
<div className="min-h-screen grid lg:grid-cols-2">
  {/* 좌측 - 비주얼 패널 (데스크탑만) */}
  <div className="hidden lg:flex relative bg-gradient-to-br from-brand-700 via-brand-800 to-neutral-900 p-12 flex-col justify-between overflow-hidden">
    {/* 배경 장식 - 미세한 격자 패턴 */}
    <div
      className="absolute inset-0 opacity-[0.03]"
      style={{
        backgroundImage:
          'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    />

    {/* 상단 로고 */}
    <Link href="/" className="relative flex items-center gap-2 text-white">
      <div className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-sm flex items-center justify-center">
        <CalendarIcon className="w-5 h-5" />
      </div>
      <span className="font-semibold tracking-tight">Meeting</span>
    </Link>

    {/* 하단 카피 */}
    <div className="relative max-w-md">
      <h1 className="text-3xl font-semibold text-white tracking-tight leading-tight">
        모두의 시간을 존중하는
        <br />
        가장 단순한 회의실 예약
      </h1>
      <p className="mt-4 text-brand-100/80 text-sm leading-relaxed">
        15분 단위 예약, 자동 충돌 방지, 반복 일정까지.
        <br />
        팀이 필요한 모든 기능을 한 화면에 담았습니다.
      </p>

      {/* 작은 통계 (실제 사내 데이터) */}
      <div className="mt-8 flex items-center gap-6 pt-6 border-t border-white/10">
        <Stat value="50+" label="활성 사용자" />
        <Stat value="1,200" label="누적 예약" />
      </div>
    </div>
  </div>

  {/* 우측 - 폼 패널 */}
  <div className="flex items-center justify-center p-6 lg:p-12">
    <div className="w-full max-w-sm">
      {/* 모바일 로고 */}
      <div className="lg:hidden mb-8 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center">
          <CalendarIcon className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold">Meeting</span>
      </div>

      <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">
        다시 만나서 반가워요
      </h2>
      <p className="mt-2 text-sm text-neutral-500">이메일과 비밀번호를 입력해주세요.</p>

      <form className="mt-8 space-y-4">
        <FormField label="이메일" type="email" />
        <FormField label="비밀번호" type="password" />
        <Button className="w-full">로그인</Button>
      </form>

      <div className="mt-6 flex justify-between text-sm">
        <Link href="/signup" className="text-neutral-600 hover:text-brand-600">
          계정 만들기
        </Link>
        <Link href="/forgot-password" className="text-neutral-600 hover:text-brand-600">
          비밀번호를 잊으셨나요?
        </Link>
      </div>
    </div>
  </div>
</div>
```

**참고 이미지 검색**: "split screen login design" / "Linear login" / "Vercel sign up"

---

### 5.3 이메일 인증 화면

**개선**: 6자리 코드를 한 칸씩 분리된 입력으로 표시 (시각적으로 확실하게)

```tsx
<div className="text-center max-w-sm mx-auto">
  {/* 일러스트 영역 */}
  <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-100 to-brand-50 flex items-center justify-center mb-6">
    <MailIcon className="w-8 h-8 text-brand-600" />
  </div>

  <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">이메일을 확인해주세요</h2>
  <p className="mt-2 text-sm text-neutral-500">
    <span className="font-medium text-neutral-900">{email}</span>로<br />
    6자리 인증 코드를 보냈습니다.
  </p>

  {/* 6자리 입력 - 칸 분리 */}
  <div className="mt-8 flex justify-center gap-2">
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <input
        key={i}
        type="text"
        maxLength={1}
        className="w-12 h-14 text-center text-xl font-semibold rounded-lg border border-neutral-200 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition-all"
      />
    ))}
  </div>

  <Button className="w-full mt-6">인증 완료</Button>

  {/* 재발송 - 카운트다운 */}
  <p className="mt-4 text-sm text-neutral-500">
    코드를 받지 못하셨나요?{' '}
    {canResend ? (
      <button className="text-brand-600 font-medium hover:underline">재전송</button>
    ) : (
      <span className="text-neutral-400">{countdown}초 후 재전송 가능</span>
    )}
  </p>
</div>
```

**참고 검색**: "OTP input design" / "verification code UI"

---

### 5.4 캘린더 / 대시보드 (가장 중요)

**현재 문제점**:

- 단조로운 회색 격자
- 빈 상태가 황량함
- 컨트롤(뷰 전환, 필터)이 흩어져 있음
- 시간 라벨이 약함

**개선 방향**: Linear + Cron 캘린더 스타일

```tsx
<div className="min-h-screen bg-neutral-50">
  <Header />

  <main className="mx-auto max-w-[1440px] px-6 py-6">
    {/* === 페이지 헤더 - 통계 + 액션 === */}
    <div className="flex items-end justify-between mb-6">
      <div>
        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">캘린더</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
          {format(currentDate, 'yyyy년 M월', { locale: ko })}
        </h1>
      </div>

      {/* 우측 액션 */}
      <div className="flex items-center gap-3">
        <Button variant="secondary" size="sm" leftIcon={<PlusIcon />}>
          새 예약
        </Button>
      </div>
    </div>

    {/* === 컨트롤 바 === */}
    <div className="bg-white rounded-xl border border-neutral-200 shadow-xs p-3 mb-4 flex items-center justify-between">
      {/* 좌측 - 날짜 네비게이션 */}
      <div className="flex items-center gap-2">
        <button className="p-1.5 rounded-md hover:bg-neutral-100 transition-colors">
          <ChevronLeftIcon className="w-4 h-4 text-neutral-600" />
        </button>
        <button className="px-3 h-8 rounded-md text-sm font-medium border border-neutral-200 hover:bg-neutral-50">
          오늘
        </button>
        <button className="p-1.5 rounded-md hover:bg-neutral-100 transition-colors">
          <ChevronRightIcon className="w-4 h-4 text-neutral-600" />
        </button>
        <h2 className="ml-3 text-sm font-semibold text-neutral-900 tabular">{dateRangeLabel}</h2>
      </div>

      {/* 중앙 - 회의실 필터 (Pill 형태) */}
      <div className="flex items-center gap-1.5">
        <RoomPill active={!selectedRoom}>전체</RoomPill>
        {rooms.map((room) => (
          <RoomPill key={room.id} active={selectedRoom === room.id} color={room.color}>
            {room.name}
          </RoomPill>
        ))}
      </div>

      {/* 우측 - 뷰 전환 (Segmented Control) */}
      <div className="inline-flex items-center bg-neutral-100 rounded-md p-0.5">
        {['일', '주', '월'].map((view) => (
          <button
            key={view}
            className={cn(
              'px-3 h-7 rounded-sm text-xs font-medium transition-all',
              currentView === view
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-500 hover:text-neutral-900',
            )}
          >
            {view}
          </button>
        ))}
      </div>
    </div>

    {/* === 캘린더 본체 === */}
    <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
      <CalendarGrid />
    </div>
  </main>
</div>
```

**캘린더 그리드 핵심 개선**:

```tsx
// 시간 셀
<div className="border-b border-neutral-100 h-12 relative group">
  {/* 시간 라벨 (좌측) */}
  <span className="absolute -top-2 -left-12 text-xs font-medium text-neutral-400 tabular">
    {hour}:00
  </span>

  {/* 호버 시 + 표시 */}
  <button className="
    absolute inset-1 rounded-md
    opacity-0 group-hover:opacity-100
    bg-brand-50 border border-dashed border-brand-300
    transition-opacity
    flex items-center justify-center
  ">
    <PlusIcon className="w-4 h-4 text-brand-500" />
  </button>
</div>

// 예약 블록
<div className="
  absolute left-1 right-1
  rounded-md
  bg-brand-500 text-white
  px-2 py-1.5
  text-xs font-medium
  shadow-sm
  cursor-pointer
  hover:shadow-md hover:brightness-110
  transition-all
  border-l-4 border-brand-700
">
  <div className="font-semibold truncate">{booking.title}</div>
  <div className="text-brand-100 text-[11px] tabular mt-0.5">
    {format(booking.startAt, 'HH:mm')} - {format(booking.endAt, 'HH:mm')}
  </div>
</div>
```

**현재 시각 표시선** (지금이 어디쯤인지 시각적으로):

```tsx
<div
  className="absolute left-0 right-0 z-10 pointer-events-none"
  style={{ top: `${currentTimePosition}%` }}
>
  <div className="flex items-center">
    <div className="w-2 h-2 rounded-full bg-danger-500 -ml-1" />
    <div className="flex-1 h-px bg-danger-500" />
  </div>
</div>
```

**참고 검색**: "Cron calendar app design" / "Linear calendar" / "Notion calendar"

---

### 5.5 새 예약 모달

**현재 문제점**: 시간 선택이 5개 셀렉트로 분산됨 → UX 답답함
**개선**: 더 통합된 시간 입력 + 시각 미리보기

```tsx
<Dialog>
  <DialogContent className="sm:max-w-md p-0 overflow-hidden">
    {/* 헤더 */}
    <div className="px-6 py-4 border-b border-neutral-100">
      <h2 className="text-lg font-semibold text-neutral-900">새 예약</h2>
    </div>

    <div className="p-6 space-y-5">
      {/* 회의실 선택 - 컬러 도트 포함 */}
      <Field label="회의실">
        <Select>
          <SelectTrigger>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-500" />
              <span>회의실 A · 본관 3층</span>
            </div>
          </SelectTrigger>
        </Select>
      </Field>

      {/* 제목 */}
      <Field label="제목">
        <Input placeholder="회의 제목을 입력하세요" />
      </Field>

      {/* 시간 - 통합 인터페이스 */}
      <Field label="시간">
        <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-center">
          <DateTimeInput value={startAt} />
          <span className="text-neutral-400">→</span>
          <DateTimeInput value={endAt} />
        </div>

        {/* 길이 표시 */}
        <p className="mt-2 text-xs text-neutral-500 flex items-center gap-1.5">
          <ClockIcon className="w-3 h-3" />총 {duration}분
          {duration > 240 && (
            <span className="text-warning-700 ml-1">· 4시간 초과 — 관리자 승인 필요</span>
          )}
        </p>
      </Field>

      {/* 설명 */}
      <Field label="설명" optional>
        <Textarea rows={3} />
      </Field>

      {/* 반복 - Toggle */}
      <div className="flex items-center justify-between py-2">
        <div>
          <div className="text-sm font-medium text-neutral-900">반복 예약</div>
          <div className="text-xs text-neutral-500">정기 회의를 반복으로 등록</div>
        </div>
        <Switch />
      </div>
    </div>

    {/* 푸터 */}
    <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-100 flex justify-end gap-2">
      <Button variant="secondary">취소</Button>
      <Button>예약하기</Button>
    </div>
  </DialogContent>
</Dialog>
```

**참고 검색**: "calendar event modal design" / "Cal.com booking modal"

---

### 5.6 관리자 페이지

**현재 문제점**: 모든 정보가 한 줄에 늘어져 있어 스캐닝 어려움
**개선 방향**: 통계 카드 + 더 구조화된 테이블

```tsx
<div>
  {/* 페이지 헤더 */}
  <PageHeader title="관리자" subtitle="회의실과 사용자를 관리합니다" />
  {/* 통계 카드 (관리자 첫 인상 개선) */}
  <div className="grid grid-cols-4 gap-4 mb-6">
    <StatCard label="활성 사용자" value="42" trend="+3" icon={<UsersIcon />} />
    <StatCard label="회의실" value="3" subtitle="최대 10개" icon={<DoorIcon />} />
    <StatCard label="이번 주 예약" value="87" trend="+12%" icon={<CalendarIcon />} />
    <StatCard
      label="대기 중인 신청"
      value="2"
      icon={<ClockIcon />}
      highlight // 0이 아니면 강조
    />
  </div>
  {/* 탭 - 라인 스타일 */}
  <Tabs />
  {/* 컨텐츠 */}
  ...
</div>
```

**StatCard 컴포넌트**:

```tsx
<div className="bg-white rounded-xl border border-neutral-200 p-5">
  <div className="flex items-start justify-between">
    <div>
      <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular text-neutral-900">{value}</p>
      {trend && <p className="mt-1 text-xs font-medium text-success-700">↑ {trend}</p>}
    </div>
    <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center">
      <Icon className="w-5 h-5 text-brand-600" />
    </div>
  </div>
</div>
```

---

### 5.7 빈 상태 (Empty State)

**현재 문제점**: 빈 상태가 단조로움 (예: "검토 대기 중인 신청이 없습니다")
**개선**: 일러스트 + 명확한 다음 액션

```tsx
<div className="text-center py-16 px-6">
  {/* 일러스트 - 단순한 아이콘이 그라데이션 원 안에 */}
  <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-neutral-100 to-neutral-50 flex items-center justify-center mb-4">
    <InboxIcon className="w-8 h-8 text-neutral-400" strokeWidth={1.5} />
  </div>

  <h3 className="text-base font-semibold text-neutral-900">대기 중인 신청이 없습니다</h3>
  <p className="mt-1 text-sm text-neutral-500 max-w-sm mx-auto">
    새로운 예외 신청이 접수되면 여기에 표시됩니다.
  </p>

  {/* 선택: 도움말 링크 */}
  <Link
    href="/help/exception"
    className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
  >
    예외 승인 정책 보기
    <ArrowRightIcon className="w-3.5 h-3.5" />
  </Link>
</div>
```

---

## 6. 마이크로 인터랙션

절제된 모션만 사용. **모든 transition은 `duration-150` 또는 `duration-200`**.

### 6.1 표준 트랜지션

```css
/* 기본 */
transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);

/* 살짝 더 부드럽게 (모달 등) */
transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
```

### 6.2 패턴

| 인터랙션         | 효과                                                    |
| ---------------- | ------------------------------------------------------- |
| 버튼 호버        | 색상만 변경 (scale 변경 X)                              |
| 카드 호버        | `shadow` 한 단계 ↑ + `border` 강조 + `-translate-y-0.5` |
| 모달 열림        | scale(0.95) + opacity(0) → scale(1) + opacity(1), 200ms |
| 페이지 전환      | opacity 페이드 (200ms)                                  |
| 토스트 등장      | translateY(-10px) → translateY(0), 300ms                |
| 캘린더 예약 호버 | brightness(1.1) + shadow ↑                              |

### 6.3 로딩 상태

스피너 대신 **스켈레톤** 우선:

```tsx
<div className="space-y-3">
  <div className="h-4 bg-neutral-100 rounded animate-pulse w-1/2" />
  <div className="h-4 bg-neutral-100 rounded animate-pulse" />
  <div className="h-4 bg-neutral-100 rounded animate-pulse w-3/4" />
</div>
```

`tailwindcss-animate` 또는 직접 `animate-pulse` 사용.

### 6.4 토스트 알림

shadcn/ui의 `sonner`:

```tsx
// 성공
toast.success("예약이 생성되었습니다", {
  description: "회의실 A · 4월 28일 오전 7:00",
  action: { label: "보기", onClick: () => router.push(...) }
});

// 에러
toast.error("선택한 시간에 다른 예약이 있습니다", {
  description: "다른 시간을 선택해주세요"
});
```

---

## 7. 아이콘 시스템

**라이브러리**: `lucide-react` (이미 shadcn/ui와 함께 설치)

**원칙**:

- 모든 아이콘은 동일한 stroke-width: `1.75` 또는 `2`
- 크기: `w-4 h-4` (작음, 인라인) / `w-5 h-5` (기본) / `w-6 h-6` (큼)
- 색상: 자체 색 X, `text-neutral-500` 등 텍스트 컬러 상속
- 절대 이모지로 대체하지 말 것 (공식 화면)

```tsx
import { Calendar, Users, Clock, ChevronRight } from 'lucide-react';

<Calendar className="w-4 h-4 text-neutral-500" strokeWidth={1.75} />;
```

---

## 8. 다크 모드 (Phase 2 이후)

지금은 **변수 구조만** 잡고, 실제 다크 테마는 후속:

```css
.dark {
  --surface-bg: #0b1120;
  --surface-card: #131c2e;
  --surface-elevated: #1a2438;
  --neutral-200: #2a3548; /* 보더 */
  /* ... */
}
```

`next-themes` 라이브러리로 토글 구현, 헤더 우측에 토글 버튼 (Phase 6 이후).

---

## 9. 접근성

- **모든 인터랙티브 요소**는 `focus-visible` 스타일 보장 (`ring-4 ring-brand-100`)
- 색상 대비: 본문 텍스트 최소 4.5:1 (neutral-700 on white = 통과)
- 폼 라벨은 항상 `<label htmlFor>` 명시
- 모달은 `role="dialog"`, `aria-modal`, focus trap
- 캘린더 키보드 네비게이션 (arrow keys로 슬롯 이동)

---

## 10. 참고 자료 (검색용 키워드)

이미지 검색 시 참고할 키워드 — 디자인 영감을 얻을 수 있습니다.

### 사이트

- **Linear** (linear.app) — 절제된 컬러, 정밀한 디테일
- **Cal.com** (cal.com) — 캘린더 UX의 표준
- **Cron / Notion Calendar** — 모던 캘린더 디자인
- **Vercel Dashboard** — 데이터 밀집 어드민 패널
- **Notion** — 폼/모달의 기본
- **Stripe Dashboard** — 통계 카드, 데이터 테이블

### Dribbble / Behance 검색어

- "calendar app interface"
- "admin dashboard minimal"
- "saas login split screen"
- "OTP verification UI"
- "empty state illustration minimal"
- "data table design"

### 디자인 시스템 참조

- **shadcn/ui** (이미 사용 중) — ui.shadcn.com
- **Radix UI** — 접근성 가이드
- **Tailwind UI** — 컴포넌트 패턴
- **Vercel Geist** — 타이포 + 컬러
- **Untitled UI** — 무료 Figma 키트

---

## 11. 우선순위 (작업 순서 권장)

작업이 너무 크면 다음 순서로 단계 진행:

| 우선순위 | 항목                                                               | 임팩트      | 난이도 |
| -------- | ------------------------------------------------------------------ | ----------- | ------ |
| 🔴 P0    | 컬러 팔레트 + 폰트 토큰 적용 (`globals.css`, `tailwind.config.ts`) | 매우 큼     | 낮음   |
| 🔴 P0    | 버튼/입력 필드/카드 스타일 정리                                    | 매우 큼     | 낮음   |
| 🔴 P0    | 글로벌 헤더 개편 (로고 + 아바타)                                   | 큼          | 중간   |
| 🟠 P1    | 로그인/회원가입 2분할 레이아웃                                     | 큼          | 중간   |
| 🟠 P1    | 캘린더 컨트롤 바 + 그리드 디테일                                   | 매우 큼     | 큼     |
| 🟡 P2    | 이메일 인증 OTP UI                                                 | 중간        | 낮음   |
| 🟡 P2    | 관리자 통계 카드 + 테이블 정리                                     | 중간        | 중간   |
| 🟢 P3    | 빈 상태 일러스트                                                   | 낮음        | 낮음   |
| 🟢 P3    | 마이크로 인터랙션 + 토스트                                         | 중간        | 중간   |
| 🔵 P4    | 다크 모드                                                          | 낮음 (지금) | 큼     |

---

## 12. Claude Code 작업 시 참고 프롬프트

이 문서를 기반으로 Claude Code에 작업을 요청할 때:

```
@DESIGN.md를 참고해서 [페이지명]의 디자인을 다듬어줘.
- 우선 §1 컬러 시스템과 §2 타이포그래피를 globals.css와 tailwind.config.ts에 반영
- 그 다음 §5.[해당 섹션]의 가이드대로 [페이지명] 컴포넌트 수정
- 모든 컴포넌트는 §4 디자인 토큰을 사용
- 새 컴포넌트가 필요하면 components/ui/에 추가
```

---

## 변경 이력

| 버전 | 일자       | 작성자          | 변경 내용 |
| ---- | ---------- | --------------- | --------- |
| 1.0  | 2026-04-26 | 이경민 + Claude | 초기 작성 |
