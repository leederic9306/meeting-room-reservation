---
name: commit
description: Generate a Conventional Commit message in Korean and create the commit. Use when the user wants to commit their changes.
allowed-tools: Bash Read
---

# Commit

변경 사항을 분석해서 Conventional Commits 규격의 한글 커밋 메시지를 생성하고 커밋합니다.

## 사용법

```
/commit                  # 변경 사항 자동 분석
/commit "추가 컨텍스트"  # 사용자 힌트 추가
```

## 동작 흐름

### 1. 변경 사항 분석

```bash
# Staged + unstaged 모두 확인
git status
git diff --cached
git diff
```

### 2. Type 자동 판단

| 변경 유형 | Type |
|---|---|
| 새 파일/기능 추가 | `feat` |
| 버그 수정 | `fix` |
| 동작 동일, 코드 정리 | `refactor` |
| 테스트 파일 변경 (`.spec.ts`, `.test.tsx`, `e2e/`) | `test` |
| `docs/`, `*.md` 변경 | `docs` |
| `package.json`, 설정 파일, CI | `chore` |
| 포매팅만 | `style` |
| `.github/workflows/` | `ci` |

### 3. Scope 판단

변경된 파일 경로에서 도메인 추출:
- `apps/backend/src/modules/auth/` → `auth`
- `apps/backend/src/modules/booking/` → `booking`
- `apps/backend/prisma/` → `db`
- `apps/frontend/components/calendar/` → `calendar`
- `apps/frontend/app/(auth)/` → `auth`
- 여러 도메인 변경 시 가장 비중 큰 것 또는 `core`

### 4. 메시지 작성 규칙

- **한글**, 동사로 시작
- 50자 이내 요약
- 본문은 필요시 (왜 변경했는지)
- 푸터: 이슈 참조

### 5. 좋은 예시 패턴

```
feat(auth): 이메일 인증 코드 발송 기능 추가
fix(booking): 소프트 삭제된 예약이 충돌 검증에 포함되는 문제 수정
refactor(prisma): Booking 모델 인덱스 정리
test(recurrence): RRULE 1년 절단 단위 테스트 추가
docs(api): 예외 신청 엔드포인트 명세 보완
chore(deps): Prisma 5.20.0으로 업데이트
```

### 6. 사용자 확인 후 커밋

생성된 메시지를 사용자에게 보여주고 확인:

```
다음 메시지로 커밋합니다:

feat(auth): 이메일 인증 코드 발송 기능 추가

진행할까요? (y/n/edit)
```

확인 시:

```bash
git add -A   # 또는 사용자가 staged만 원하면 생략
git commit -m "$MESSAGE"
```

### 7. 다중 의도 감지

여러 종류의 변경이 섞여 있으면 분리 권장:

```
⚠️ 변경 사항이 두 가지 의도를 포함하는 것 같습니다:
- 인증 기능 추가 (feat)
- 예약 모듈 버그 수정 (fix)

각각 별도 커밋으로 나누는 것을 권장합니다.
계속할까요? (split/continue)
```

## 주의

- WIP 커밋은 지양 (squash merge 시 정리되지만 PR 단위로 의미 있게)
- 메시지에 비밀번호/토큰 절대 포함 금지
- Breaking change는 footer에 `BREAKING CHANGE:` 표시
