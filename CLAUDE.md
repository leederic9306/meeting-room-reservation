# 사내 회의실 예약 시스템

> 이 파일은 Claude Code가 프로젝트 진입 시 자동으로 읽는 컨텍스트 메모리입니다.
> 프로젝트의 핵심 규칙, 컨벤션, 작업 흐름을 정의합니다.

---

## 1. 프로젝트 개요

사내 약 50명 규모를 위한 회의실 예약 시스템.

- **백엔드**: NestJS 10 + TypeScript + Prisma 5 + PostgreSQL 16
- **프런트엔드**: Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui
- **인프라**: Docker Compose (로컬), Vercel + Railway (배포 예정)
- **주요 기능**: 인증(이메일 인증 코드), 예약 CRUD, 반복 예약(RRULE), 관리자 예외 승인

상세는 `docs/` 디렉토리를 참고:

- `docs/01-prd.md` — 요구사항
- `docs/02-db-design.md` — DB 설계
- `docs/03-api-spec.md` — API 명세
- `docs/04-local-dev-setup.md` — 로컬 환경
- `docs/05-roadmap.md` — 개발 로드맵
- `docs/06-test-cases.md` — 테스트 케이스
- `docs/07-design.md` — 디자인 가이드 (컬러, 타이포, 컴포넌트 토큰)
- `docs/08-design-references.md` — 화면별 참고 사이트

---

## 2. 핵심 규칙 (반드시 준수)

다음 규칙은 모든 작업에서 우선합니다. 자세한 내용은 `.claude/rules/` 하위 파일 참조.

### 2.1 코딩 스타일

- TypeScript strict 모드, `any` 사용 금지 (불가피하면 `unknown` + 타입 가드)
- 함수는 단일 책임. 한 함수 50줄 초과 시 분할 검토
- public 함수는 반환 타입 명시
- 에러 메시지에 비밀번호/토큰/PII 절대 포함 금지
- 자세히는 `@.claude/rules/coding-style.md`

### 2.2 아키텍처

- NestJS는 Controller → Service → Repository(Prisma) 단방향
- 모듈 간 호출은 service의 public API만. 다른 모듈의 repository 직접 호출 금지
- 외부 서비스(SMTP, Claude API 등)는 어댑터로 추상화
- 자세히는 `@.claude/rules/architecture.md`

### 2.3 Git 워크플로우

- 브랜치: `feature/p<phase>-<영문-요약>` (예: `feature/p1-auth-signup`)
- PR 대상: `develop`
- 커밋 메시지: Conventional Commits + **한글** (예: `feat(auth): 이메일 인증 코드 발송 기능 추가`)
- PR 머지 전 CI 그린 필수
- 자세히는 `@.claude/rules/git-workflow.md`

### 2.4 테스트

- 모든 비즈니스 로직 변경에는 테스트 추가/수정 필수
- 핵심 모듈(auth, booking, recurrence, exception-request) 커버리지 90%+
- 그 외 70%+
- 변경 후 항상 `pnpm test --run` 실행하여 통과 확인
- 자세히는 `@.claude/rules/testing.md`

### 2.5 데이터베이스

- 시간 컬럼은 모두 `Timestamptz(6)` (UTC 저장)
- 시간 겹침은 DB EXCLUDE 제약으로 차단 — 애플리케이션 검증만 의존 금지
- 마이그레이션은 항상 `prisma migrate dev --name <영문_snake>`로 생성
- 자세히는 `@.claude/rules/database.md`

### 2.6 디자인

- 모든 UI 컴포넌트는 `docs/07-design.md`의 토큰 시스템 사용
- 컬러는 CSS 변수(`--brand-500` 등)로만 참조, 하드코딩 금지
- 폰트는 Pretendard + GeistSans + GeistMono 조합 유지
- 시각 레퍼런스가 필요하면 `docs/design-mockups/` 참고
- 자세히는 `@docs/07-design.md`

---

## 3. 작업 시작 전 체크리스트

새 작업을 시작할 때 항상:

1. **현재 Phase 확인** — `docs/05-roadmap.md`에서 진행 중인 Phase와 작업 항목 확인
2. **관련 문서 읽기** — 해당 작업과 관련된 `docs/` 문서 먼저 읽기
3. **기존 패턴 확인** — 같은 모듈 내 기존 코드 스타일/패턴 따르기
4. **테스트 먼저 작성 권장** — 가능하면 TDD, 최소한 작업 직후 테스트 추가

---

## 4. 작업 완료 전 자동 실행

코드 변경 후 항상 다음을 실행:

```bash
# 백엔드 변경 시
pnpm --filter backend lint
pnpm --filter backend typecheck
pnpm --filter backend test --run

# 프런트엔드 변경 시
pnpm --filter frontend lint
pnpm --filter frontend typecheck
pnpm --filter frontend test --run

# 전체 검증
pnpm lint && pnpm typecheck && pnpm test --run && pnpm build
```

이 작업은 PostToolUse hook으로 자동 실행되도록 `.claude/settings.json`에 설정됨.

---

## 5. 사용 가능한 Skills

이 프로젝트는 다음 커스텀 skills를 제공합니다 (`.claude/skills/`):

| Skill               | 용도                                                     |
| ------------------- | -------------------------------------------------------- |
| `/test-watch`       | 변경된 파일 관련 테스트 자동 실행                        |
| `/migration-create` | Prisma 마이그레이션 + 추가 SQL 생성                      |
| `/module-scaffold`  | NestJS 모듈 스캐폴딩 (controller + service + dto + spec) |
| `/api-endpoint`     | API 명세 기반 엔드포인트 구현                            |
| `/commit`           | Conventional Commits + 한글 메시지 자동 생성             |

자세히는 각 `SKILL.md` 파일 참조.

---

## 6. MCP 서버

이 프로젝트는 다음 MCP 서버를 사용합니다 (`.mcp.json`):

- **context7** — 라이브러리 최신 문서 조회 (NestJS, Prisma, Next.js 등)
- **postgres** — DB 스키마 조회, 쿼리 실행 (로컬 개발 DB)
- **github** — PR 생성, 이슈 관리 (선택)

사용 시 항상 최신 라이브러리 버전 기준으로 정보를 가져오세요.

---

## 7. 자주 하는 실수 방지

- **시간 비교 시 시간대 혼동** — 항상 UTC로 비교, 표시만 KST
- **소프트 삭제 무시** — Booking 조회 시 항상 `deletedAt: null` 조건 추가
- **Prisma 모델 직접 노출** — 응답은 항상 DTO로 매핑, password_hash 등 민감 필드 제거
- **EXCLUDE 제약 위반 catch 누락** — SQLSTATE `23P01`을 잡아 `BOOKING_TIME_CONFLICT`로 변환
- **반복 예약 회차 한 번에 처리** — 시리즈 수정 시 미래 회차만 영향, 과거는 불변
- **JWT 시크릿 코드 하드코딩 금지** — 항상 환경변수
- **rrule.js 시간대 처리** — 항상 UTC로 dtstart 지정, 표시 시 변환

---

## 8. 도움말

- 프로젝트 관련 의사결정 이력은 `docs/` 각 문서의 "변경 이력" 참조
- 모르는 부분은 추측하지 말고 사용자에게 질문
- 라이브러리 사용법은 context7 MCP로 최신 문서 조회 후 작업
