# Git Workflow

## 1. 브랜치 전략

```
main          # 배포용 (Phase 7 이후 활성화)
develop       # 통합 브랜치 (모든 PR의 기본 대상)
feature/<phase>-<영문-요약>
              # 예: feature/p1-auth-signup
              #     feature/p2-booking-crud
              #     feature/p4-recurrence-rrule
```

### 브랜치 명명 규칙

| 타입 | 패턴 | 예 |
|---|---|---|
| 기능 | `feature/p<phase>-<desc>` | `feature/p1-auth-signup` |
| 버그 | `fix/<desc>` | `fix/booking-timezone-bug` |
| 리팩토링 | `refactor/<desc>` | `refactor/extract-mail-service` |
| 문서 | `docs/<desc>` | `docs/update-api-spec` |
| 핫픽스 | `hotfix/<desc>` | `hotfix/login-loop` |

## 2. 커밋 메시지

**Conventional Commits + 한글**:

```
<type>(<scope>): <한글 메시지>

[선택: 본문 - 한글]

[선택: footer - Closes #123]
```

### 타입

| 타입 | 용도 |
|---|---|
| `feat` | 신규 기능 |
| `fix` | 버그 수정 |
| `refactor` | 리팩토링 (동작 변경 없음) |
| `test` | 테스트 추가/수정 |
| `docs` | 문서 |
| `chore` | 빌드/설정/기타 |
| `style` | 포매팅 (의미 변경 없음) |
| `perf` | 성능 개선 |
| `ci` | CI 설정 |

### Scope (도메인 단위)

- `auth`, `user`, `room`, `booking`, `recurrence`, `exception-request`, `audit-log`
- `api`, `db`, `infra`, `ui`, `calendar`, `deps`

### 좋은 예시

```
feat(auth): 이메일 인증 코드 발송 기능 추가

- 6자리 숫자 코드 생성 후 EmailVerification에 저장
- MailService 어댑터로 발송
- 60초 쿨다운 적용 (PRD AUTH-007)

Refs: #12
```

```
fix(booking): 소프트 삭제된 예약이 충돌 검증에 포함되는 문제 수정

EXCLUDE 제약의 WHERE 절에 deleted_at IS NULL 조건이 누락되어
삭제된 예약과도 충돌 처리되던 문제.

Fixes: #45
```

```
test(recurrence): RRULE 1년 절단 단위 테스트 추가
```

```
refactor(prisma): Booking 모델 인덱스 정리
```

### 나쁜 예시

```
❌ 수정함
❌ update files
❌ feat: stuff
❌ fix bug
```

## 3. PR 절차

### 3.1 PR 생성 전 체크리스트

- [ ] `develop`에서 최신 pull
- [ ] 로컬에서 `pnpm lint && pnpm typecheck && pnpm test --run` 통과
- [ ] 커밋 메시지가 컨벤션 준수
- [ ] 관련 테스트 추가/수정
- [ ] 관련 문서 업데이트

### 3.2 PR 본문 템플릿

```markdown
## 변경 사항

- 이번 PR에서 무엇을 했는지 한글로 간략히

## 관련 이슈/문서

- Closes #123
- 관련 PRD: AUTH-001 ~ AUTH-005
- 관련 API 명세: 03-api-spec.md §2.1

## 테스트

- [ ] 단위 테스트 추가/수정
- [ ] 통합 테스트 통과
- [ ] 수동 테스트 시나리오:
  1. ...
  2. ...

## 스크린샷 (UI 변경 시)

(있다면 첨부)

## 체크리스트

- [ ] CI 그린
- [ ] 셀프 코드 리뷰 완료
- [ ] 환경변수 추가 시 .env.example에 반영
- [ ] 문서 업데이트 필요 시 반영
```

### 3.3 머지 전략

- **Squash merge 기본** — PR 단위로 커밋 히스토리 정리
- 머지 후 feature 브랜치 자동 삭제

### 3.4 코드 리뷰 (셀프 또는 팀)

- 모든 PR은 최소 셀프 리뷰
- 다음 항목 확인:
  - 비즈니스 로직 누락 없는지
  - 테스트가 핵심 케이스를 커버하는지
  - 에러 처리 적절한지
  - 성능 문제 없는지 (N+1 쿼리 등)
  - 보안 (민감 정보 노출, 권한 검증)

## 4. 태그 / 릴리스

- SemVer: `v1.2.3`
- Phase 완료 시 태그: `phase-0-complete`, `phase-1-complete`, ..., `phase-7-complete`
- 정식 릴리스: `v1.0.0` (Phase 7 완료 후)
- 릴리스 노트는 Conventional Commits 기반 자동 생성 검토 (release-please 등)

## 5. .gitignore 정책

- `node_modules/`, `dist/`, `build/`, `.next/`, `coverage/` — 빌드 산출물
- `.env`, `.env.local` — 비밀
- `.env.example` — 커밋 (템플릿)
- Prisma migrations — 커밋 (스키마 이력)
- Prisma generated client — 무시

## 6. Hooks (Husky)

### pre-commit
- lint-staged로 변경 파일만 ESLint + Prettier

### commit-msg
- commitlint로 메시지 형식 검증

### pre-push
- 전체 단위 테스트 실행 (실패 시 push 차단)

## 7. 자동화 — Claude Code

`/commit` 슬래시 커맨드 사용 권장:
- 변경 파일 스캔
- 적절한 type/scope 자동 판단
- 한글 메시지 초안 생성
- 사용자 확인 후 커밋

자세히는 `.claude/skills/commit/SKILL.md` 참조.
