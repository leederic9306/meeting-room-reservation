# 개발 로드맵 — 사내 회의실 예약 시스템

> **문서 정보**
> - 버전: 1.0
> - 작성일: 2026-04-23
> - 총 예상 기간: 7~8주
> - 진행 방식: Phase별 순차 개발, 각 Phase는 PR 머지로 마무리

---

## 0. 진행 원칙

### 0.1 페이즈 단위 작업

- 각 Phase는 **독립적으로 동작 가능한 단위**로 설계됨
- Phase 완료 시 `phase-N-complete` 태그 생성
- 다음 Phase 진입 전 다음을 반드시 확인:
  - 모든 테스트 통과
  - CI 그린
  - PR 머지 완료
  - 문서 업데이트

### 0.2 Claude Code 사용

- 각 작업 항목 옆에 Claude Code에 던질 **프롬프트 예시**를 표시 (`▶`로 시작)
- 프롬프트는 한 번에 너무 많은 작업을 요구하지 않음 (1~2시간 단위 분할)
- 모든 코드는 작성 후 직접 검토 → 필요 시 수정 요청

### 0.3 브랜치 전략

```
main          # 배포용 (현 단계 미사용)
develop       # 통합 브랜치
feature/<phase-번호>-<영문-요약>
              # 예: feature/p1-auth-signup
```

- PR은 항상 `develop` 대상
- Phase 완료 시 `develop` → `main` 머지 (배포 시점 도달 시)

### 0.4 커밋 메시지 형식

Conventional Commits + 한글 메시지:

```
<type>(<scope>): <한글 메시지>

[선택: 본문]
```

타입:
- `feat`: 신규 기능
- `fix`: 버그 수정
- `refactor`: 리팩토링
- `test`: 테스트 추가/수정
- `docs`: 문서
- `chore`: 빌드/설정/기타
- `style`: 포매팅
- `perf`: 성능 개선

예시:
```
feat(auth): 이메일 인증 코드 발송 기능 추가
fix(booking): 시간 겹침 검증 시 소프트 삭제 행 제외
refactor(prisma): Booking 모델 인덱스 정리
test(recurrence): RRULE 펼침 단위 테스트 추가
```

---

## Phase 0 — 프로젝트 스캐폴딩 (3일)

**목표**: 모노레포 구조 + 백엔드/프런트엔드 빈 프로젝트 + 로컬 DB + CI 파이프라인

### 0.1 모노레포 초기화

작업:
- pnpm workspace 설정
- Turborepo 도입
- 루트 `package.json`, `pnpm-workspace.yaml`, `turbo.json`

```
▶ pnpm + Turborepo로 모노레포를 초기화해줘.
  apps/backend, apps/frontend, packages/shared-types, packages/config 구조로.
  루트 package.json에는 turbo lint/typecheck/test/build 스크립트를 정의해.
```

### 0.2 백엔드 스캐폴딩

작업:
- NestJS 10 프로젝트 생성
- TypeScript strict 모드
- Prisma 5.x 설치
- @nestjs/config + zod로 환경변수 검증
- 기본 폴더 구조 (modules/, common/, infra/, config/)

```
▶ apps/backend에 NestJS 10 프로젝트를 만들어. TypeScript strict.
  - Prisma 5.x 설치 및 schema.prisma 위치는 prisma/
  - @nestjs/config + zod 환경변수 검증 (config/env.validation.ts)
  - 폴더: src/modules, src/common, src/infra, src/config
  - 기본 health check 엔드포인트 (GET /health)
```

### 0.3 프런트엔드 스캐폴딩

작업:
- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- shadcn/ui 초기화
- TanStack Query, Zustand, react-hook-form, zod
- 기본 레이아웃

```
▶ apps/frontend에 Next.js 14 App Router 프로젝트를 만들어. TypeScript.
  - Tailwind CSS + shadcn/ui (컴포넌트 출력 위치: components/ui/)
  - TanStack Query Provider
  - Zustand 기본 store 폴더 구조
  - 한국어 기본 (lang="ko")
  - 기본 색상은 CSS 변수 --color-primary로 추출
```

### 0.4 공유 패키지

작업:
- `packages/shared-types`: 백/프런트 공유 zod 스키마
- `packages/config`: ESLint/TS 베이스 설정

```
▶ packages/shared-types에 zod 기반 공유 스키마 패키지를 만들어.
  일단 빈 index.ts로 두고, 빌드 설정만 갖춰. tsup으로 ESM/CJS 양쪽 빌드.
▶ packages/config에 eslint-config-base, eslint-config-nest, eslint-config-next,
  tsconfig-base.json을 만들어. apps/backend와 apps/frontend가 이를 extend하도록.
```

### 0.5 Prisma 초기 스키마 적용

작업:
- 작성해둔 `prisma/schema.prisma`를 백엔드에 배치
- `_extra_constraints.sql` 별도 마이그레이션으로 추가

```
▶ docs와 prisma 디렉토리에 있는 schema.prisma를 apps/backend/prisma/로 이동.
  그리고 docker compose up으로 PostgreSQL 띄운 뒤
  prisma migrate dev --name init 실행해서 첫 마이그레이션을 만들어.
  이어서 prisma migrate dev --create-only --name add_constraints 로 빈 마이그레이션을 만들고
  _extra_constraints.sql의 내용을 그 안의 migration.sql에 복사해 넣어.
  마지막으로 prisma migrate dev로 적용.
```

### 0.6 개발 도구 (ESLint, Prettier, Husky)

작업:
- 루트 ESLint, Prettier 설정
- Husky pre-commit hook (lint-staged)
- editorconfig

```
▶ 루트에 Prettier, Husky, lint-staged를 설정해.
  pre-commit에서 stash된 파일만 eslint --fix + prettier --write 적용.
  .editorconfig도 추가.
```

### 0.7 GitHub Actions CI

작업:
- PR 시 lint, typecheck, test, build 실행
- pnpm 캐시 + Turborepo remote cache (선택)

```
▶ .github/workflows/ci.yml을 만들어.
  - PR 또는 develop push 시 트리거
  - pnpm install (캐시)
  - pnpm lint, typecheck, test, build 모노레포 전체 실행
  - 빌드 실패 시 머지 차단 (branch protection은 GitHub UI에서 별도 설정)
```

### 0.8 Phase 0 완료 체크

- [ ] `docker compose up -d` 후 PostgreSQL 정상 기동
- [ ] `pnpm install` 성공
- [ ] `pnpm lint && pnpm typecheck && pnpm build` 전체 통과
- [ ] 백엔드 `GET /health` 응답 확인
- [ ] 프런트엔드 빈 페이지 렌더 확인
- [ ] CI 그린
- [ ] 태그: `phase-0-complete`

---

## Phase 1 — 인증 + 회원가입 + 이메일 인증 (1주)

**목표**: 사용자가 가입하고 이메일 인증 후 로그인할 수 있다.

### 1.1 인증 모듈 골격

```
▶ apps/backend/src/modules/auth 모듈을 만들어. AuthModule, AuthController, AuthService.
  공통 가드(JwtAuthGuard, RolesGuard)와 데코레이터(@CurrentUser, @Roles)는 src/common에.
  비밀번호 해싱은 argon2.
```

### 1.2 회원가입 + 이메일 인증

작업:
- `POST /auth/signup`
- `POST /auth/verify-email`
- `POST /auth/resend-code`
- 6자리 코드 생성 + EmailVerification 저장
- 환경변수에 따라 평문/해시 분기

```
▶ 회원가입과 이메일 인증을 구현해.
  - POST /auth/signup: 사용자 생성 (status=PENDING) + 인증 코드 발송
  - POST /auth/verify-email: 코드 검증 → status=ACTIVE + JWT 발급
  - POST /auth/resend-code: 60초 쿨다운
  - 인증 코드는 EMAIL_CODE_HASH_ENABLED=false면 평문, true면 SHA-256 해시 저장
  - 5회 실패 시 코드 무효화
  - 24시간 미인증 계정 자동 삭제는 Phase 1 마지막에 @Cron으로 추가
  - 통합 테스트 포함 (Jest + Supertest)
```

### 1.3 이메일 발송 어댑터

```
▶ src/infra/mail에 MailService 추상화를 만들어.
  - 인터페이스: send({to, subject, html, text})
  - 구현체: SmtpMailService (nodemailer 기반, MailHog로 로컬 테스트 가능)
  - 템플릿: src/infra/mail/templates/에 verification-code.hbs 등
  - 환경변수 MAIL_HOST/PORT/USER/PASSWORD/FROM 사용
```

### 1.4 로그인 + Dual JWT

작업:
- `POST /auth/login` — Access + Refresh 발급
- `POST /auth/refresh` — Refresh로 새 Access 발급 + Refresh rotation
- `POST /auth/logout` — Refresh 무효화
- 5회 실패 시 30분 잠금 (LoginAttempt + User.lockedUntil)

```
▶ 로그인/리프레시/로그아웃을 구현해.
  - Access Token: 15분, JWT (HS256, JWT_ACCESS_SECRET)
  - Refresh Token: 14일, HttpOnly+Secure+SameSite=Strict 쿠키, DB 저장 (token_hash는 SHA-256)
  - 5회 연속 실패 시 lockedUntil = now + 30분
  - 응답에서는 비밀번호/토큰을 절대 평문 노출 금지
  - LoginAttempt 기록 + AuditLog 기록
```

### 1.5 비밀번호 재설정

```
▶ 비밀번호 재설정을 구현해.
  - POST /auth/password-reset/request: 항상 200 (계정 열거 방지)
  - POST /auth/password-reset/confirm: 토큰 검증 + 비번 변경 + 모든 RefreshToken 무효화
  - 토큰 유효시간 1시간
```

### 1.6 내 정보 조회/수정

```
▶ /auth/me 엔드포인트를 구현해.
  - GET /auth/me: 현재 사용자 정보
  - PATCH /auth/me: name, department, phone 수정 (email/role 변경 불가)
  - POST /auth/me/password: 현재 비번 확인 후 변경 + Refresh 무효화
```

### 1.7 프런트엔드 인증 화면

```
▶ Next.js 인증 페이지 5개를 만들어.
  - /signup: 가입 폼
  - /verify-email: 6자리 코드 입력 (재전송 버튼 + 60초 카운트다운)
  - /login: 로그인
  - /forgot-password: 재설정 요청
  - /reset-password?token=...: 새 비번 입력
  공통:
  - react-hook-form + zod 검증
  - TanStack Query mutation으로 API 호출
  - 에러는 토스트(shadcn/ui sonner)로 표시
  - 로그인 성공 시 zustand auth store에 사용자 정보 저장 + /dashboard로 이동
  - axios 인터셉터: 401 → /auth/refresh → 재시도, 실패 시 /login
```

### 1.8 인증 가드 + 보호된 레이아웃

```
▶ Next.js (main) 라우트 그룹을 만들어 인증된 사용자만 접근 가능하게 해.
  - middleware.ts에서 쿠키/토큰 확인
  - 미인증 시 /login으로 리다이렉트
  - 보호된 레이아웃에는 헤더(이름 + 로그아웃 버튼) 포함
```

### 1.9 Phase 1 완료 체크

- [ ] 가입 → 이메일 인증 → 로그인 → 보호된 페이지 접근 전체 흐름 동작
- [ ] MailHog UI에서 인증 코드 메일 수신 확인
- [ ] 인증 관련 통합 테스트 통과
- [ ] CI 그린, 태그: `phase-1-complete`

---

## Phase 2 — 단일 회의실 + 단일 예약 CRUD + 캘린더 UI (1.5주)

**목표**: 사용자가 회의실 1개에 대해 예약을 만들고, 수정/삭제하고, 캘린더에서 볼 수 있다.

### 2.1 Room 모듈 (조회만)

```
▶ src/modules/room 모듈을 만들어.
  - GET /rooms: 활성 회의실 목록
  - GET /rooms/:id: 단일 조회
  - 일단 시드로 회의실 1개 ("회의실 A")만 넣어둠
  - prisma/seed.ts에 추가
```

### 2.2 Booking 모듈 (CRUD)

```
▶ src/modules/booking 모듈을 만들어.
  - GET /bookings?roomId&from&to: 캘린더 조회 (from~to 최대 31일)
  - GET /bookings/:id
  - POST /bookings: 단일 예약 생성
  - PATCH /bookings/:id: 본인 예약만 (ADMIN 제외)
  - DELETE /bookings/:id: 소프트 삭제

  검증 로직:
  - 15분 단위 (시작/종료 모두)
  - 시작 < 종료
  - 시작이 미래
  - 길이 ≤ 4시간
  - 회의실 활성 상태
  - 시간 겹침은 DB EXCLUDE 제약이 차단 → SQLSTATE 23P01 catch하여 BOOKING_TIME_CONFLICT 응답
  - 시작 이후 예약은 USER 수정/삭제 불가

  단위 테스트: 검증 로직 각각
  통합 테스트: 정상 케이스 + 충돌 케이스
```

### 2.3 캘린더 UI 베이스

```
▶ Next.js에 /dashboard 페이지를 만들어 캘린더 UI를 구현해.
  - FullCalendar 또는 react-big-calendar 라이브러리 사용 (선택 후 통일)
  - 일/주/월 뷰 전환 가능
  - 본인 예약은 진하게, 타인 예약은 회색
  - GET /bookings를 현재 보이는 시간 범위로 호출
  - 빈 슬롯 클릭 → 예약 생성 모달
  - 기존 예약 클릭 → 상세 모달 (본인이면 수정/삭제 버튼)
  - 모바일에서는 일 단위 뷰 기본
```

### 2.4 예약 생성/수정 모달

```
▶ 예약 생성/수정 모달 컴포넌트를 만들어.
  - 회의실 선택, 제목, 설명, 시작/종료 시간
  - 시간은 15분 단위 셀렉트 (00, 15, 30, 45)
  - react-hook-form + zod (shared-types에서 import)
  - 검증 실패 시 인라인 에러
  - 성공 시 캘린더 자동 갱신 (TanStack Query invalidate)
  - 충돌 에러 시 명확한 안내 메시지
```

### 2.5 Phase 2 완료 체크

- [ ] 캘린더에서 클릭 → 예약 생성 가능
- [ ] 본인 예약 수정/삭제 가능
- [ ] 충돌 시 즉시 에러 표시
- [ ] DB EXCLUDE 제약이 race condition도 차단 (수동 테스트)
- [ ] CI 그린, 태그: `phase-2-complete`

---

## Phase 3 — 다중 회의실 + 권한 (3일)

**목표**: 회의실 여러 개 등록 가능, 관리자 페이지 분리.

### 3.1 Room 관리 (관리자)

```
▶ Room 관리 엔드포인트를 추가해.
  - POST /rooms (ADMIN)
  - PATCH /rooms/:id (ADMIN)
  - DELETE /rooms/:id (ADMIN, 미래 예약 없을 때만)
  - 최대 10개 제한
  - is_active=false면 신규 예약 불가
```

### 3.2 권한 가드 + 역할 변경

```
▶ RolesGuard와 @Roles() 데코레이터를 적용해.
  - 모든 /admin/* 엔드포인트는 ADMIN 필요
  - PATCH /admin/users/:id/role: 역할 변경 (마지막 ADMIN 강등 차단)
  - GET /admin/users: 사용자 목록 (검색/필터/페이지네이션)
```

### 3.3 관리자 페이지 (프런트)

```
▶ Next.js (admin) 라우트 그룹을 만들어. ADMIN만 접근 가능.
  - /admin/rooms: 회의실 CRUD UI
  - /admin/users: 사용자 목록 + 역할 변경
  - 일반 사용자가 접근 시 403 화면
  - 헤더에 사용자가 ADMIN이면 "관리자 페이지" 링크 노출
```

### 3.4 캘린더 회의실 필터

```
▶ 캘린더에 회의실 필터 UI를 추가해.
  - "전체" 또는 특정 회의실 선택
  - 회의실별 색상 구분 (각 Room에 색상 자동 할당, 또는 displayOrder 기반)
```

### 3.5 Phase 3 완료 체크

- [ ] 관리자가 회의실 추가/수정/삭제 가능
- [ ] 사용자가 여러 회의실 중 선택해서 예약 가능
- [ ] 관리자 페이지 접근 권한 정상 동작
- [ ] CI 그린, 태그: `phase-3-complete`

---

## Phase 3.5 — RRULE PoC (2~3일)

**목표**: Phase 4 본 작업 전 RRULE 처리 라이브러리와 핵심 로직을 별도 브랜치에서 검증.

### 3.5.1 라이브러리 평가

```
▶ rrule.js 라이브러리로 다음 시나리오를 처리하는 PoC 스크립트를 만들어.
  apps/backend/scripts/rrule-poc.ts에 작성하고 ts-node로 실행 가능하게.

  검증 시나리오:
  1) FREQ=WEEKLY;BYDAY=MO;COUNT=12 → 12개 회차 정확히 반환
  2) FREQ=DAILY;UNTIL=2027-04-30 → 1년 초과 시 절단 후 회차 수 확인
  3) FREQ=MONTHLY;BYMONTHDAY=15 → 매월 15일 (말일 처리 확인)
  4) DTSTART와 시간대 처리 (UTC 저장 vs Asia/Seoul 표시)
  5) EXDATE 적용 후 회차 펼침
  6) 서머타임 영향 (한국은 미사용이지만 라이브러리 동작 확인)

  결과를 콘솔에 표로 출력하고, 각 시나리오별 시작/종료 시각이 의도대로인지 확인.
```

### 3.5.2 시간대 처리 결정

```
▶ 다음을 결정하고 docs/06-rrule-poc-result.md에 기록:
  - DTSTART는 UTC로 저장하는지, 로컬로 저장하는지
  - rrule.js의 tzid 옵션 사용 여부
  - 회차 인스턴스 생성 시 UTC 변환 방식
  - 서머타임 영역 사용자가 있을 때의 정책 (현 단계는 한국만 가정)
```

### 3.5.3 충돌 검출 함수 PoC

```
▶ 펼친 회차들에 대해 한 번의 SQL 쿼리로 모든 충돌을 검출하는 함수를 만들어.
  - 입력: room_id + 회차 인스턴스 배열
  - 출력: 충돌 회차 인덱스 배열
  - Prisma raw query로 작성 (UNION 또는 VALUES 절 사용)
  - 단위 테스트로 다양한 충돌 패턴 검증
```

### 3.5.4 PoC 완료 체크

- [ ] 6개 시나리오 모두 의도대로 동작
- [ ] 시간대 처리 방식 문서화
- [ ] 충돌 검출 함수 동작 확인
- [ ] PoC 코드는 main에 머지하지 않고 별도 브랜치에서 결과만 docs/06-rrule-poc-result.md로 정리
- [ ] Phase 4 진입 시 이 결정사항을 따라 구현

---

## Phase 3.5 — RRULE PoC (2일, Phase 4 진입 전 필수)

**목표**: Phase 4 진입 전 RRULE 처리의 위험을 사전 검증.

### 3.5.1 rrule.js 라이브러리 검증

```
▶ apps/backend/scripts/rrule-poc.ts를 만들어 다음을 검증:
  - 매주 월요일 12회: FREQ=WEEKLY;BYDAY=MO;COUNT=12
  - 격주 화/목 6개월: FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;UNTIL=...
  - 매월 마지막 금요일: FREQ=MONTHLY;BYDAY=-1FR
  - 매월 첫째 주 월요일: FREQ=MONTHLY;BYDAY=1MO
  각 케이스에 대해:
  - 회차 펼침 결과 검증
  - 시간대(Asia/Seoul) 처리 확인 (DST는 한국에 없으나 UTC 변환 정확성)
  - 1년 초과 시 절단 동작 확인
  - EXDATE 제외 동작 확인
```

### 3.5.2 충돌 검출 SQL 검증

```
▶ Phase 2의 EXCLUDE 제약이 다음 케이스에서 정상 동작하는지 SQL로 직접 검증:
  - 정확히 같은 시간 두 예약 (실패해야 정상)
  - 1초 겹침 (실패)
  - 9:00-10:00과 10:00-11:00 (성공해야 정상, '[)' 범위)
  - 소프트 삭제된 예약과 새 예약 동일 시간 (성공해야 정상)
  - 동시에 두 트랜잭션이 같은 시간 INSERT 시도 (한쪽만 성공)
  결과를 docs/05-roadmap.md에 부록으로 기록.
```

### 3.5.3 시리즈 펼침 vs 동적 계산 비교

```
▶ 다음 두 방식의 트레이드오프를 측정:
  - A: Booking에 회차 미리 펼쳐 저장 (현재 채택)
  - B: RecurrenceRule만 저장하고 조회 시 RRULE 펼침
  벤치마크:
  - 1년치 매일 반복 (365회) 시리즈 10개
  - 캘린더 1주 조회 응답 시간
  - 시리즈 수정 시 부하
  결과를 docs/02-db-design.md에 부록으로 기록 + 채택 근거 강화.
```

### 3.5.4 Phase 3.5 완료 체크

- [ ] rrule.js로 모든 핵심 케이스 정상 처리 확인
- [ ] EXCLUDE 제약 동작 검증 완료
- [ ] 펼침 전략 채택 근거 문서화
- [ ] 발견된 위험은 Phase 4 작업 항목에 반영
- [ ] 태그: `phase-3.5-poc-complete`

---

## Phase 4 — 반복 예약 (1.5주)

**목표**: RRULE 기반 반복 예약 + 예외 일자 제외.

### 4.1 Recurrence 모듈

```
▶ src/modules/recurrence 모듈을 만들어.
  - rrule.js 라이브러리 사용
  - POST /recurrences: 시리즈 생성 + 회차들을 Booking에 펼쳐 저장
    - 1년 초과 자동 절단
    - 과거 회차 skip
    - 충돌 회차도 skip하되 응답에 명시
  - GET /recurrences/:id: 시리즈 + 인스턴스 + 예외 조회
  - PATCH /recurrences/:id: title, description만 수정
  - DELETE /recurrences/:id?from=...: 전체 또는 특정 시점부터 삭제
  - POST /recurrences/:id/exceptions: EXDATE 추가 (해당 Booking 자동 소프트 삭제)

  단위 테스트:
  - RRULE 펼침 함수
  - 충돌 검출 로직
  - 1년 절단
```

### 4.2 Booking 삭제 시 scope 처리

```
▶ DELETE /bookings/:id에 scope 쿼리를 추가해.
  - scope=instance (기본): 해당 회차만 + RecurrenceException 추가
  - scope=following: 이 회차부터 미래 모두 + 시리즈 untilAt 단축
  - scope=series: 시리즈 전체 삭제
  - 단일 예약(recurrenceId=null)은 scope 무시
```

### 4.3 Booking 수정 시 시리즈 분리

```
▶ PATCH /bookings/:id에서 반복 회차를 수정하면 자동으로 시리즈에서 분리.
  - recurrenceId를 null로 변경
  - 원 시리즈에 RecurrenceException(excludedDate) 추가
  - 응답에 detachedFromSeries: true 포함
```

### 4.4 반복 예약 UI

```
▶ 예약 모달에 "반복" 옵션을 추가해.
  - 체크 시 주기 선택 (매일/매주/매월)
  - 종료 조건: 횟수 / 종료일 / 무기한 (서버에서 1년으로 절단)
  - 미리보기: 처음 5개 회차 표시
  - 생성 후 충돌 회차가 있으면 알림 모달로 안내
```

### 4.5 반복 예약 시각화

```
▶ 캘린더에서 반복 예약은 아이콘(↻)으로 표시.
  - 클릭 시 상세 모달에 "이 회차만 / 이후 / 전체" 수정/삭제 옵션
  - 시리즈 메타정보(전체 회차 수, 진행도) 표시
```

### 4.6 Phase 4 완료 체크

- [ ] 매주 12회 반복 예약 정상 등록
- [ ] EXDATE 추가 시 캘린더에서 해당 회차 사라짐
- [ ] 충돌 회차는 자동 skip 후 안내
- [ ] "이 회차만" 수정 시 시리즈에서 분리
- [ ] 1년 초과 시 자동 절단
- [ ] CI 그린, 태그: `phase-4-complete`

---

## Phase 5 — 관리자 예외 승인 워크플로우 (1주)

**목표**: 사용자 예외 신청 → 관리자 승인/반려.

### 5.1 ExceptionRequest 모듈

```
▶ src/modules/exception-request 모듈을 만들어.
  - POST /exception-requests: 신청 (PENDING)
    - 4시간 초과 또는 과거 시점에만 의미 있음 → EXCEPTION_NOT_REQUIRED 검증
    - 신청 시점 충돌 검증 (참고용 정보 응답에 포함)
  - GET /exception-requests/me: 내 신청 목록
  - POST /exception-requests/:id/cancel: 본인 + PENDING만
  - GET /admin/exception-requests: 관리자 대기 목록
  - POST /admin/exception-requests/:id/approve:
    - 트랜잭션 내 SELECT FOR UPDATE
    - 시간 충돌 재검증
    - Booking 생성 (created_by_admin=true, exception_request_id 연결)
    - 신청자에게 이메일 발송
    - AuditLog 기록
  - POST /admin/exception-requests/:id/reject:
    - reviewComment 필수
    - 신청자에게 이메일 발송
    - AuditLog 기록
  - POST /admin/bookings: 관리자 직접 예약 (4시간/과거 우회)
```

### 5.2 사용자 신청 UI

```
▶ 예약 모달에서 검증 실패 시 (4시간 초과/과거) "예외 신청" 버튼 노출.
  - 클릭 → 사유 입력 모달 → POST /exception-requests
  - 신청 후 "내 신청 목록" 페이지(/my/requests)로 이동 안내
  - /my/requests: 내 신청 이력 (상태별 필터, PENDING은 취소 버튼)
```

### 5.3 관리자 승인 UI

```
▶ /admin/exception-requests 페이지를 만들어.
  - 기본 PENDING 필터
  - 신청자, 회의실, 시간, 사유 표시
  - 승인 / 반려 버튼
  - 반려 시 사유 입력 모달
  - 승인 후 Booking이 캘린더에 즉시 반영
  - 새 신청 알림 표시 (배지)
```

### 5.4 알림 이메일

```
▶ 다음 시점에 이메일 발송:
  - 사용자가 신청 → 본인에게 접수 확인 이메일
  - 관리자 승인 → 신청자에게 승인 결과 + Booking 정보
  - 관리자 반려 → 신청자에게 반려 사유
  - 관리자 직접 예약 → 대상 사용자에게 알림
  템플릿은 src/infra/mail/templates/에.
```

### 5.5 AuditLog 기록 시작

```
▶ AuditLog 기록을 다음 액션에 추가:
  - USER_ROLE_CHANGED
  - USER_LOCKED / USER_UNLOCKED
  - EXCEPTION_APPROVED / EXCEPTION_REJECTED
  - BOOKING_BY_ADMIN
  - ROOM_CREATED / ROOM_UPDATED / ROOM_DELETED

  공통 패턴:
  - AuditLogInterceptor 또는 명시적 호출
  - payload에는 변경 전/후 또는 핵심 정보 포함
  - GET /admin/audit-logs 엔드포인트 + UI (필터 + 페이지네이션)
```

### 5.6 Phase 5 완료 체크

- [ ] 사용자가 5시간 예약 시도 → 예외 신청 흐름 진입
- [ ] 관리자가 승인 → 자동으로 Booking 생성, 캘린더 반영
- [ ] 승인 시점 충돌 시 승인 차단
- [ ] 모든 민감 작업이 AuditLog에 기록
- [ ] CI 그린, 태그: `phase-5-complete`

---

## Phase 6 — 디자인 폴리싱 + 모바일 + 테마 (1주)

**목표**: Google Calendar 수준의 UI 완성도 + 회사 브랜드 색상 적용 가능.

### 6.1 테마 변수화

```
▶ Tailwind 설정에서 메인 색상을 CSS 변수(--color-primary)로 추출.
  - shadcn/ui theme를 회사 브랜드 색상에 맞춰 변경 쉽게 정리
  - .env에서 NEXT_PUBLIC_PRIMARY_COLOR로 주입 가능
  - app/globals.css에 라이트 테마 변수 정의
  - 다크 모드는 일단 보류 (변수 구조만 잡아둠)
```

### 6.2 캘린더 UX 개선

```
▶ 캘린더 UX를 Google Calendar처럼 다듬어.
  - 드래그로 시간 슬롯 선택해서 생성
  - 기존 예약 드래그로 시간 이동 (PATCH 호출)
  - 리사이즈로 길이 조정
  - 다른 사용자 예약은 드래그 불가
  - 토요일/일요일 구분 표시
  - "오늘" 버튼, 이전/다음 네비게이션
  - 시간대 표시 (한국 시간)
```

### 6.3 모바일 반응형

```
▶ 모바일 화면 대응:
  - 일 단위 뷰가 기본
  - 헤더는 햄버거 메뉴
  - 모달은 풀스크린 시트로 전환
  - 터치 영역 최소 44x44
  - 캘린더 좌우 스와이프로 날짜 이동
```

### 6.4 빈 상태 / 에러 / 로딩 UI

```
▶ 모든 페이지에 다음 상태 처리:
  - 로딩: 스켈레톤 UI
  - 빈 데이터: 일러스트 + 안내 메시지
  - 에러: 재시도 버튼이 있는 에러 화면
  - 권한 없음: 친절한 안내 + 홈으로 이동 버튼
```

### 6.5 Phase 6 완료 체크

- [ ] 모바일에서 전체 흐름 동작 확인
- [ ] CSS 변수만 바꿔서 메인 색상 변경 가능
- [ ] 셀프 디자인 검토 — 다음 시나리오를 직접 따라가며 어색한 부분 기록
  - 신규 사용자가 가입 → 첫 예약 생성까지
  - 기존 사용자가 반복 예약 등록 → 예외 일자 추가
  - 관리자가 예외 신청 처리
  - 모바일에서 동일 시나리오 반복
- [ ] CI 그린, 태그: `phase-6-complete`

---

## Phase 7 — 테스트 보강 + 문서 정리 + 배포 준비 (1주)

**목표**: 테스트 커버리지 70% 이상, 운영 배포 준비 완료.

### 7.1 테스트 보강

```
▶ 다음 테스트를 추가/보강해:
  - 단위 테스트:
    - 모든 service 클래스의 비즈니스 로직 분기
    - RRULE 펼침, 충돌 검출, 4시간 검증, 15분 단위 검증
  - 통합 테스트:
    - 인증 전체 흐름 (가입~비번 재설정)
    - 예약 CRUD + 충돌 케이스
    - 반복 예약 + 예외
    - 예외 신청 → 승인/반려
    - 권한 검증 (USER가 ADMIN API 접근 시 403)
  - 부하 테스트 (선택):
    - k6 또는 Artillery로 동시 50명 캘린더 조회

  커버리지 목표:
  - 전체 70% 이상 (jest --coverage)
  - 다음 도메인은 90% 이상 필수:
    * src/modules/auth (인증/세션 관리)
    * src/modules/booking (예약 검증 로직)
    * src/modules/recurrence (RRULE 펼침/충돌)
    * src/modules/exception-request (승인 워크플로우)
  - jest.config.ts에 coverageThreshold로 강제 (위 도메인은 90, 전체는 70)
```

### 7.2 데이터 정리 배치

```
▶ 다음 cron 작업을 추가 (NestJS @Cron 또는 BullMQ):
  - 매시간: 미인증 User 24시간 후 삭제
  - 매일: 만료된 EmailVerification, RefreshToken, PasswordReset 정리
  - 매주: 90일 이상 LoginAttempt 정리
  - 모든 정리 작업은 AuditLog 기록 (시스템 액터)
```

### 7.3 보안 점검

```
▶ 다음 보안 항목 점검:
  - helmet 적용 (XSS, CSP, HSTS)
  - express-rate-limit 또는 @nestjs/throttler 적용 (정책은 .env 기반)
  - CORS 화이트리스트 (CORS_ORIGINS)
  - 모든 응답에서 비밀번호/토큰 누출 없는지 확인
  - SQL Injection 자동 방어 확인 (Prisma는 기본 안전)
  - 의존성 취약점 스캔 (pnpm audit)
```

### 7.4 운영용 환경변수 템플릿

```
▶ .env.production.example을 만들어:
  - DATABASE_URL: 외부 DB
  - MAIL_*: AWS SES 또는 SendGrid
  - JWT_*: 강력한 시크릿 (생성 가이드 포함)
  - NODE_ENV=production
  - 운영 시 변경 필수 항목에 # !! 표시
```

### 7.5 운영 문서

```
▶ docs/05-deployment.md를 작성해:
  - 운영 환경 요구사항 (Node 버전, PostgreSQL 버전, 메모리)
  - DB 마이그레이션 절차 (prisma migrate deploy)
  - 시드 데이터 적용 방법
  - 환경변수 체크리스트
  - 헬스체크 엔드포인트 활용
  - 로그 수집 방법
  - 장애 대응 (DB 연결 끊김, SMTP 장애 등)
  - 백업/복구 절차
```

### 7.6 README 정리

```
▶ 루트 README.md를 작성:
  - 프로젝트 개요
  - 기술 스택
  - 빠른 시작 (docker compose up + pnpm install + pnpm dev)
  - 디렉토리 구조 설명
  - docs/ 링크
  - 기여 방법 (커밋 컨벤션, PR 템플릿)
```

### 7.7 Phase 7 완료 체크

- [ ] 테스트 커버리지 70% 이상
- [ ] 보안 점검 항목 모두 통과
- [ ] 운영 문서 검토 완료
- [ ] 배포 시 Claude Code에 던질 프롬프트 준비 완료
- [ ] CI 그린, 태그: `phase-7-complete`, `v1.0.0` 릴리스

---

## 마일스톤 요약

| Phase | 목표 | 기간 | 누적 | 산출물 |
|---|---|---|---|---|
| 0 | 스캐폴딩 | 3일 | 3일 | 모노레포 + DB + CI |
| 1 | 인증 | 1주 | 1주 3일 | 가입/로그인/이메일 인증 |
| 2 | 예약 CRUD | 1.5주 | 3주 | 단일 예약 + 캘린더 |
| 3 | 다중 회의실/권한 | 3일 | 3주 3일 | 관리자 페이지 |
| 3.5 | RRULE PoC | 2~3일 | 4주 1일 | 시간대/충돌 검증 결과 문서 |
| 4 | 반복 예약 | 1.5주 | 5주 3일 | RRULE + EXDATE |
| 5 | 예외 승인 | 1주 | 6주 3일 | 워크플로우 |
| 6 | 폴리싱 | 1주 | 7주 3일 | 모바일/테마 |
| 7 | 마무리 | 1주 | 8주 3일 | 테스트/문서/배포 준비 |

총 예상 기간: **약 8~9주** (PoC 단계 추가로 0.5주 증가)

---

## 의존성 / 위험 요소

| 위험 | 대응 |
|---|---|
| RRULE 처리 복잡도 | rrule.js 라이브러리에 의존, **Phase 3.5에서 별도 PoC 진행** 후 결과를 Phase 4 구현에 반영 |
| 시간대 버그 | DB는 모두 UTC, 표시만 Asia/Seoul. Phase 2부터 테스트 케이스에 시간대 포함 |
| EXCLUDE 제약 + 소프트 삭제 상호작용 | Phase 2 단위 테스트에 race condition 케이스 포함 |
| 회사 브랜드 색상 미정 | 변수화로 후속 변경 가능하게 설계 (Phase 6) |
| 알림 채널 (Slack 등) 미정 | 이메일만 우선, 추상화로 후속 추가 가능 |

---

## 변경 이력

| 버전 | 일자 | 작성자 | 변경 내용 |
|---|---|---|---|
| 1.0 | 2026-04-23 | 데릭 + Claude | 초기 작성 |
