# DESIGN-REFERENCES.md — 화면별 시각 레퍼런스 가이드

> **이 문서의 목적**
> 각 화면을 어떤 디자인으로 다듬을지 시각적으로 결정할 때, 참고할 만한
> 실제 서비스와 검색 키워드를 정리한 것. DESIGN.md의 보조 자료입니다.
>
> **사용법**: 아래 검색 키워드를 Google Images, Dribbble, Behance, Mobbin에서
> 검색해서 영감을 얻은 뒤, DESIGN.md의 토큰과 가이드대로 구현합니다.

---

## 🔵 1. 로그인 / 회원가입 화면

### 추천 컨셉: **2분할 레이아웃 (Split Screen)**

좌측에 브랜드 메시지 + 그라데이션 비주얼, 우측에 폼.
사내 도구지만 첫인상이 중요하므로 임팩트 있게.

### 참고 사이트 (실제 방문 권장)

| 사이트      | 특징                              | URL                |
| ----------- | --------------------------------- | ------------------ |
| **Linear**  | 좌측 다크 그라데이션 + 우측 흰 폼 | linear.app/login   |
| **Vercel**  | 미니멀 중앙 정렬, 다크 테마       | vercel.com/login   |
| **Cal.com** | 좌측 일러스트 + 우측 폼           | cal.com/auth/login |
| **Notion**  | 깔끔한 중앙 정렬 + 일러스트       | notion.so/login    |
| **Loom**    | 색감 있는 그라데이션 좌측         | loom.com/login     |

### 검색 키워드

- "split screen login design"
- "saas login page dark"
- "minimalist login UI 2026"
- "B2B login page design"
- "Linear login screen"

### 구현 시 핵심 포인트

- 좌측 그라데이션은 `from-brand-700 via-brand-800 to-neutral-900` (진하게)
- 좌측 배경에 미세한 격자 패턴 (opacity 3%) — AI slop 아님
- 모바일에서는 좌측 숨김
- 폼은 max-width 384px (sm)로 컴팩트하게

---

## 🔵 2. 이메일 인증 (OTP)

### 추천 컨셉: **6칸 분리된 OTP 입력**

가장 임팩트 있는 한 가지 — 6자리를 한 입력란이 아닌 6개 분리된 칸으로.

### 참고 사이트

| 사이트             | 특징                 |
| ------------------ | -------------------- |
| **Apple ID 인증**  | 6칸 분리, 큰 폰트    |
| **Slack 매직링크** | 미니멀 중앙 정렬     |
| **Vercel 인증**    | 깔끔한 입력 + 타이머 |
| **Auth0**          | 표준 OTP UI          |

### 검색 키워드

- "OTP input design"
- "6 digit verification code UI"
- "PIN code input UX"
- "two factor authentication design"

### 구현 시 핵심 포인트

- 각 칸 크기: `w-12 h-14` (48×56px)
- 폰트: tabular nums, 20px, semibold
- 자동 포커스 이동 (한 자리 입력 시 다음 칸으로)
- 붙여넣기(paste) 6자리 → 자동 분배
- Hero 영역에 봉투 아이콘 + 그라데이션 배경 (가벼운 일러스트)

### 라이브러리 추천

```
npm install input-otp
```

shadcn/ui와 호환되는 OTP 컴포넌트.

---

## 🔵 3. 메인 대시보드 (캘린더)

### 추천 컨셉: **Cron / Notion Calendar 스타일**

가장 많이 사용하는 화면이므로 **이 화면 디자인이 전체 인상**을 결정합니다.

### 참고 사이트 (필수 방문)

| 사이트                     | 왜 봐야 하나                                       |
| -------------------------- | -------------------------------------------------- |
| **Cron / Notion Calendar** | 캘린더 디자인의 기준 (notion.com/product/calendar) |
| **Cal.com**                | 오픈소스 캘린더, 코드 참고 가능                    |
| **Linear Cycles**          | Linear의 시간 기반 뷰 (linear.app)                 |
| **Google Calendar (최신)** | 표준 인터랙션 패턴                                 |
| **Fantastical**            | 정보 밀도 높지만 깔끔 (mac 앱)                     |
| **Amie**                   | 개성 있는 캘린더 (amie.so)                         |

### 검색 키워드

- "Cron calendar app screenshot"
- "Notion calendar interface"
- "modern calendar app design"
- "scheduling app dashboard"
- "team calendar UI"
- "weekly calendar view design"

### 구현 시 핵심 포인트

**1. 컨트롤 바 구조 (한 줄에 통합)**

```
[< 오늘 >] [날짜]  ··· [회의실 필터 pills] ···  [일/주/월 segmented]
```

**2. 시간 라벨 위치 변경**

- 현재: 시간 라벨이 첫 컬럼 안에 있음 → 공간 낭비
- 개선: 시간 라벨을 셀 좌측 외부에 작게 표시 (Cron 스타일)

**3. 예약 블록 디테일**

- 좌측 4px 굵은 컬러 보더 (회의실 색상)
- 본문은 화이트/세미투명 배경 + 보더 색상의 텍스트
- 또는 솔리드 컬러 배경 + 화이트 텍스트 (둘 중 컨셉 통일)

**4. 현재 시각 표시선**

- 빨간 선이 캘린더를 가로지르며 "지금"을 표시
- 좌측 끝에 작은 동그라미

**5. 주말 구분**

- 토/일 컬럼은 배경색을 `neutral-50/30`로 살짝 다르게

**6. 빈 슬롯 호버**

- 점선 보더 + 옅은 브랜드 색 + 중앙 + 아이콘
- "여기에 예약 추가" 메시지 (작게)

### 색상 사용 예시 (회의실 별)

```
회의실 A → brand-500 (파랑)
회의실 B → teal-500 (청록)
회의실 C → amber-500 (주황)
...
```

DESIGN.md §1.2의 `--room-1` ~ `--room-10` 사용.

---

## 🔵 4. 새 예약 모달

### 추천 컨셉: **Linear 스타일 컴팩트 모달**

현재는 모든 옵션이 흩어져 있음 → 통합된 시간 입력 + 시각 미리보기로 개선.

### 참고 사이트

| 사이트                 | 특징                    |
| ---------------------- | ----------------------- |
| **Linear (이슈 생성)** | 가장 깔끔한 모달 디자인 |
| **Cron 이벤트 생성**   | 시간 입력의 모범        |
| **Notion 페이지 생성** | 인풋 스타일 참고        |
| **Cal.com 부킹**       | 캘린더 부킹 모달        |

### 검색 키워드

- "calendar event creation modal"
- "Linear issue create modal"
- "scheduling form design"
- "time picker UI design"

### 구현 시 핵심 포인트

**1. 시간 입력**
현재 5개 셀렉트(연·월·일 + 시·분 × 2) → 너무 많음.

개선안 A: **자연어 입력 + 캘린더 팝업**

```
[2026-04-28 14:00]  →  [2026-04-28 15:00]
```

인라인 편집, 클릭 시 작은 캘린더 + 시간 슬라이더.

개선안 B: **시각 슬라이더**
캘린더 미리보기에서 드래그로 시간 지정.

**2. "총 N분" 실시간 피드백**
시간 입력 아래 작게 "총 60분" / "총 5시간 — ⚠ 4시간 초과 (관리자 승인 필요)" 표시.

**3. 회의실 선택**
드롭다운에 컬러 닷 포함 → 캘린더와 시각적 일관성.

**4. 반복 예약**
체크박스 대신 **Switch 토글**, 활성화 시 추가 옵션 펼쳐짐 (애니메이션).

**5. 푸터**
배경 `neutral-50`, 우측 정렬 [취소] [예약하기]. 모바일에서는 [예약하기]가 우선.

---

## 🔵 5. 관리자 페이지 (전반)

### 추천 컨셉: **Stripe / Vercel 어드민 스타일**

데이터 밀집형 어드민. 통계 카드를 상단에 배치해서 한눈에 상태 파악.

### 참고 사이트

| 사이트                | 특징                                             |
| --------------------- | ------------------------------------------------ |
| **Stripe Dashboard**  | 통계 + 테이블의 표준 (stripe.com/docs/dashboard) |
| **Vercel Dashboard**  | 미니멀 어드민 (vercel.com/dashboard)             |
| **Linear Settings**   | 설정 페이지 디자인                               |
| **PostHog Dashboard** | 데이터 시각화 + 테이블                           |
| **Resend Dashboard**  | 깔끔한 어드민 (resend.com)                       |

### 검색 키워드

- "saas admin dashboard design"
- "stats card UI design"
- "data table modern design"
- "Stripe dashboard UI"
- "settings page design saas"

### 구현 시 핵심 포인트

**1. 페이지 헤더 + 통계 카드 4개**

```
관리자
회의실과 사용자를 관리합니다

[활성 사용자]  [회의실]  [이번 주 예약]  [대기 신청 ⚠]
     42         3 / 10       87            2
```

**2. 통계 카드 디자인**

- 좌측: 라벨(uppercase tracking) + 큰 숫자 + 트렌드(↑ +3)
- 우측: 작은 아이콘 (브랜드 색 배경 원)
- 호버 시 살짝 떠오름

**3. 탭 디자인**

- 현재: 활성 탭에 색만 변경
- 개선: 활성 탭 하단에 2px 굵은 브랜드 색 라인

**4. 액션 버튼 위치**

- 우상단에 primary 버튼 ("회의실 추가" 등)
- 테이블 위에 위치, 항상 같은 자리

---

## 🔵 6. 사용자 관리 테이블

### 추천 컨셉: **Vercel Team Members 스타일**

### 참고 사이트

- **Vercel** Team Members 페이지
- **Linear** Workspace Members
- **GitHub** Organization Members

### 검색 키워드

- "team members table design"
- "user management UI saas"
- "user list with role"

### 구현 시 핵심 포인트

**1. 사용자 행 구조**

```
[아바타]  이름                    역할        상태       최근 로그인
         이메일                                                    [⋮]
         부서 · 사번
```

2줄 구성으로 정보 밀도 ↑ + 스캐닝 ↑

**2. 아바타**

- 프로필 이미지 없으면 이름 첫 글자 + 컬러 배경
- `w-9 h-9 rounded-full`

**3. 역할 표시**

- 드롭다운이 아닌 **배지 + 호버 시 변경 메뉴**
- ADMIN: `bg-brand-50 text-brand-700 border-brand-500/20`
- USER: `bg-neutral-100 text-neutral-700 border-neutral-200`

**4. 상태 배지 (DESIGN.md §4.4 참고)**

- 활성: 초록 점 + "활성"
- 인증대기: 주황 점 + "인증 대기"
- 잠김: 빨강 점 + "잠김"

**5. 행 우측 액션**

- `⋮` (kebab menu)
- 클릭 시: 상세보기, 잠금 해제, 역할 변경, 삭제

---

## 🔵 7. 회의실 관리

### 추천 컨셉: **Linear Project / Vercel Projects 스타일**

테이블이 아닌 **카드 그리드** 방식 권장 (회의실 수가 적으므로).

### 참고 사이트

- **Vercel Projects 페이지**
- **Linear Projects 페이지**
- **Notion Workspace 페이지**

### 검색 키워드

- "project cards grid design"
- "workspace cards UI"
- "room cards design saas"

### 구현 시 핵심 포인트

**1. 카드 그리드 (3열)**
각 회의실을 카드로:

```
┌───────────────────────────┐
│ ●  회의실 A          [활성] │
│    본관 3층                │
│                           │
│  👥 8명 · 표시 순서 0      │
│                           │
│  [수정]  [⋮]               │
└───────────────────────────┘
```

**2. 카드 좌측 컬러 보더**

- 4px 두께, 회의실 색상 (캘린더와 일관성)
- 한눈에 어떤 색 회의실인지 인식

**3. 새 회의실 추가 카드**

- 마지막에 점선 보더 + 중앙 + 아이콘
- "회의실 추가" 텍스트

**4. 비활성 회의실**

- opacity 60% + "비활성" 배지
- 시각적으로 명확히 구분

---

## 🔵 8. 예외 신청 검토 (관리자)

### 추천 컨셉: **Linear Inbox / GitHub PR 리스트 스타일**

검토 작업이므로 정보가 한눈에 들어와야 함.

### 참고 사이트

- **Linear Inbox** — 처리 대기 작업 UI의 모범
- **GitHub PR list** — 검토 워크플로우
- **Vercel Approval** — 배포 승인 UI

### 검색 키워드

- "approval workflow UI"
- "request review interface"
- "pending requests dashboard"
- "Linear inbox design"

### 구현 시 핵심 포인트

**1. 신청 카드 구조**

```
┌─────────────────────────────────────────────────────────┐
│ 🟡 검토 대기                                  2시간 전   │
│                                                         │
│ 김철수 · 개발팀                                          │
│ 회의실 A · 4월 28일 09:00 - 18:00 (9시간)              │
│                                                         │
│ 사유: 외부 컨설팅 업체 종일 워크샵으로 9시간 필요합니다.    │
│                                                         │
│              [반려]                          [승인 →]   │
└─────────────────────────────────────────────────────────┘
```

**2. 충돌 경고**

- 승인 직전에 충돌 검증 → 충돌 시 카드 상단에 빨간 경고 배너

**3. 빈 상태**

- DESIGN.md §5.7 참고
- 그라데이션 원에 인박스 아이콘 + "대기 중인 신청이 없습니다"

---

## 🔵 9. 감사 로그

### 추천 컨셉: **Stripe Events / Vercel Audit Log 스타일**

시간 흐름이 중요하므로 타임라인 또는 밀집 테이블.

### 참고 사이트

- **Stripe Events** (dashboard.stripe.com/events)
- **Vercel Audit Log**
- **GitHub Activity**
- **Linear Activity**

### 검색 키워드

- "audit log UI design"
- "activity feed timeline"
- "event log dashboard"
- "Stripe events page"

### 구현 시 핵심 포인트

**1. 액션별 아이콘 + 색상**

- LOGIN_SUCCESS: 초록 ✓
- LOGIN_FAILED: 빨강 ✕
- ROOM_CREATED: 파랑 +
- ROOM_UPDATED: 노랑 ✎
- USER_ROLE_CHANGED: 보라 👤

**2. 타임라인 그룹화**

- "오늘", "어제", "이번 주", "이전" 으로 세션 헤더
- 같은 액터의 연속 이벤트는 시각적으로 그룹

**3. 펼치기 디테일**

- 기본은 한 줄 요약
- 펼치기 클릭 시 payload(JSON) 보기 — 코드 블록 스타일

**4. 필터 영역**

- 현재: 4개 셀렉트가 가로로 → 답답함
- 개선: 인라인 필터 칩 (active filter 표시 + X로 제거)

---

## 🔵 10. 빈 상태 / 에러 / 로딩

### 빈 상태 (Empty State)

**참고 사이트**:

- **Linear** 모든 빈 상태 (일러스트 단순하지만 인상적)
- **Notion** 빈 페이지
- **Slack** 빈 채널

**검색 키워드**:

- "empty state illustration minimal"
- "empty state UI design"
- "no results screen design"

**구현**: DESIGN.md §5.7 참고. 일러스트는 직접 그릴 필요 없이 lucide-react 아이콘 + 그라데이션 배경.

### 에러 페이지 (404, 500)

**참고**:

- **Vercel 404** — 매우 미니멀
- **GitHub 404** — 옥토캣 일러스트
- **Linear 404** — 깔끔

**검색 키워드**:

- "404 page design minimal"
- "error page UI saas"

### 로딩 상태

스피너 X, **스켈레톤 우선**. 참고:

- **YouTube** 스켈레톤
- **Linear** 스켈레톤
- **Notion** 페이지 로딩

---

## 🎨 색상 영감 보드

브랜드 컬러 변경 검토 시 참고할 만한 색상 팔레트.

### 현재 (Brand Blue) — 추천

무난하고 신뢰감. B2B 사내 도구에 잘 맞음.

### 대안 1: **Indigo + Slate**

조금 더 차분하고 prestige한 느낌.

```
Brand: #4F46E5 (indigo-600)
Hover: #4338CA (indigo-700)
```

참고: Vercel, Linear

### 대안 2: **Emerald + Stone**

신선하고 활기찬 느낌. 사내 분위기가 캐주얼하면.

```
Brand: #10B981 (emerald-500)
Hover: #059669 (emerald-600)
```

참고: Notion (악센트), Cal.com

### 대안 3: **Brand Black** (모노)

극도의 미니멀. Vercel/GitHub 스타일.

```
Brand: #18181B (zinc-900)
Hover: #27272A (zinc-800)
```

참고: Vercel, Stripe (최신), Resend

---

## 📐 폰트 영감

| 폰트               | 분위기                | 추천 사용처      |
| ------------------ | --------------------- | ---------------- |
| **Pretendard** ✓   | 깔끔, 한글 최적       | 기본 (현재)      |
| **GeistSans** ✓    | 모던, 컴팩트          | 영문/숫자 (현재) |
| Suit               | 가독성 우수, 부드러움 | 본문 강조        |
| Wanted Sans        | 강한 개성             | 로고, 헤더       |
| Spoqa Han Sans Neo | 안정적                | 본문             |

**현재 권장 조합 유지**: Pretendard + GeistSans + GeistMono

---

## 🎬 모션 영감

마이크로 인터랙션 참고용:

- **Linear** — 모달 등장, 페이지 전환 (linear.app)
- **Notion** — 호버 효과, 드래그 앤 드롭 (notion.so)
- **Stripe** — 폼 검증 피드백 (stripe.com)
- **Vercel** — 스켈레톤 → 콘텐츠 전환 (vercel.com)

**검색 키워드**: "micro interactions saas", "ui motion design subtle"

**라이브러리**: 단순한 트랜지션은 Tailwind만으로 충분. 복잡한 모션은 `framer-motion` (현재 `Motion`) 사용.

---

## 📚 학습 자료

디자인 감각이 부족하다고 하셨는데, 다음 자료가 도움됩니다:

### 무료 영상

- **Refactoring UI** by Adam Wathan (Tailwind 창시자) — 비슷한 이름의 책 + 영상
- **DesignCourse** (YouTube) — UX/UI 강의
- **Flux Academy** (YouTube)

### 책

- **Refactoring UI** (PDF) — 단 한 권만 본다면 이거. 200페이지 안 됨.
- **Don't Make Me Think** by Steve Krug — UX 기본기

### 일상적으로 둘러보기 (관찰력 향상)

- **Mobbin** (mobbin.com) — 실제 앱 스크린샷 모음
- **Page Flows** (pageflows.com) — 사용자 흐름 영상
- **SaaS Pages** (saaspages.xyz) — SaaS 페이지 모음
- **Land-book** (land-book.com) — 랜딩 페이지

매일 **5분만 둘러봐도** 6개월 후 감각이 확연히 다릅니다.

---

## 변경 이력

| 버전 | 일자       | 작성자          | 변경 내용 |
| ---- | ---------- | --------------- | --------- |
| 1.0  | 2026-04-26 | 이경민 + Claude | 초기 작성 |
