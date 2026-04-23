# Claude Code 메모리

이 디렉토리는 Claude Code가 프로젝트 작업 시 사용하는 컨텍스트, 규칙, 자동화 스크립트입니다.

## 구조

```
.claude/
├── rules/                    # 코딩/Git/테스트/DB 규칙 (CLAUDE.md에서 참조)
│   ├── coding-style.md
│   ├── architecture.md
│   ├── git-workflow.md
│   ├── testing.md
│   └── database.md
├── skills/                   # 슬래시 커맨드로 호출 가능한 작업 스킬
│   ├── test-watch/
│   │   └── SKILL.md
│   ├── migration-create/
│   │   └── SKILL.md
│   ├── module-scaffold/
│   │   └── SKILL.md
│   ├── api-endpoint/
│   │   └── SKILL.md
│   └── commit/
│       └── SKILL.md
├── hooks/                    # 자동 실행 스크립트
│   ├── post-edit-test.sh    # 코드 변경 시 관련 테스트 자동 실행
│   └── check-branch.sh      # 보호 브랜치 직접 작업 경고
└── settings.json             # Claude Code 권한 + hooks 설정
```

루트에는 다음 파일이 함께 있습니다:
- `CLAUDE.md` — 프로젝트 진입점 (Claude Code가 자동 로드)
- `.mcp.json` — MCP 서버 설정 (context7, postgres, filesystem)

## 사용법

### 슬래시 커맨드

Claude Code 세션 안에서:

| 명령 | 용도 |
|---|---|
| `/test-watch` | 변경 파일 관련 테스트 watch 모드 |
| `/test-watch backend` | 백엔드만 |
| `/migration-create <name>` | Prisma 마이그레이션 생성 |
| `/module-scaffold <name>` | NestJS 모듈 스캐폴딩 |
| `/api-endpoint POST /bookings` | API 명세 기반 엔드포인트 구현 |
| `/commit` | 한글 커밋 메시지 자동 생성 + 커밋 |

### 자동 실행 (Hooks)

다음은 별도 명령 없이 자동 동작합니다:

- **PostToolUse (Edit/Write)**: 코드 파일 변경 시 관련 테스트 자동 실행
  - 백엔드 파일 수정 → backend 테스트
  - 프런트 파일 수정 → frontend 테스트
  - shared-types 수정 → 양쪽 모두
  - 실패 시 다음 작업 차단

- **UserPromptSubmit**: 매 메시지 입력 시 보호 브랜치(main/develop) 작업 경고

### MCP 서버

자동으로 사용 가능한 외부 도구:

- **context7**: 라이브러리 최신 문서 조회. 예) "Prisma 5의 latest connection pool 옵션 알려줘"
- **postgres**: 로컬 DB 스키마/데이터 조회 (읽기 전용)
- **filesystem**: 프로젝트 파일 시스템 탐색

## 권한 정책

`settings.json`에 정의:

- **자동 허용**: `pnpm`, `git`, `docker`, 파일 작업
- **확인 필요**: `rm`, `git push`, `prisma migrate reset`, `docker compose down -v`
- **차단**: `rm -rf /`, `curl | sh`, `.env` 파일 읽기

## 추가/수정 시

### 새 skill 추가
1. `.claude/skills/<skill-name>/SKILL.md` 생성
2. YAML frontmatter에 `name`, `description`, `allowed-tools` 명시
3. 마크다운으로 동작 설명
4. Claude Code 재시작 또는 `/skills` 메뉴에서 확인

### 새 규칙 추가
1. `.claude/rules/<rule-name>.md` 생성
2. `CLAUDE.md`에서 참조 추가 (`@.claude/rules/<rule-name>.md`)

### Hook 추가
1. `.claude/hooks/<hook>.sh` 생성 (실행 권한 필요)
2. `.claude/settings.json`의 `hooks` 섹션에 등록

## 권장 워크플로우

1. **Phase 시작 시**: `docs/05-roadmap.md`에서 현재 Phase 확인
2. **새 모듈**: `/module-scaffold` → `/migration-create` → `/api-endpoint`
3. **기능 개발 중**: `/test-watch`로 변경 즉시 검증
4. **마무리**: `/commit`으로 커밋 → PR 생성

## 참고 문서

- 프로젝트 진입점: `../CLAUDE.md`
- 개발 로드맵: `../docs/05-roadmap.md`
- 테스트 케이스: `../docs/06-test-cases.md`
