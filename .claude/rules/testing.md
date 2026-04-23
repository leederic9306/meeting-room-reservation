# Testing

## 1. 기본 원칙

- **모든 비즈니스 로직 변경에는 테스트 추가/수정 필수**
- 변경 후 항상 `pnpm test --run` 통과 확인
- 테스트 없는 PR은 머지 금지
- 핵심 모듈 90%, 그 외 70% 커버리지 강제 (jest coverageThreshold)

## 2. 테스트 종류

| 종류 | 도구 | 위치 |
|---|---|---|
| 백엔드 단위 | Jest | `src/**/*.spec.ts` (코드 옆) |
| 백엔드 통합 | Jest + Supertest | `test/**/*.e2e-spec.ts` |
| 프런트 단위/통합 | Vitest + RTL | `**/*.test.tsx` |
| E2E | Playwright | `e2e/*.spec.ts` |

## 3. 명명 규칙

```
[모듈/기능] - [상황] - [기대 결과]

예:
- BookingService.create - 15분 단위가 아닌 시간 - BadRequestException 발생
- POST /bookings - 시간 충돌 - 409 BOOKING_TIME_CONFLICT 응답
- 예약 모달 - 4시간 초과 입력 - 예외 신청 버튼 노출
```

`describe`/`it` 구조:

```ts
describe('BookingService', () => {
  describe('create', () => {
    it('15분 단위가 아닌 시간이면 BadRequestException 발생', async () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

## 4. AAA 패턴

```ts
it('정상 예약 생성 시 Booking row 반환', async () => {
  // Arrange
  const dto: CreateBookingDto = { ... };
  const expectedRoom = await fixtures.createRoom();

  // Act
  const result = await service.create(userId, dto);

  // Assert
  expect(result.id).toBeDefined();
  expect(result.startAt).toEqual(dto.startAt);
});
```

## 5. 테스트 데이터

### Fixtures
- `test/fixtures/` 디렉토리에 공통 fixture
- 함수형: `createUser({ overrides })`, `createBooking({ overrides })`
- DB는 매 테스트 격리 — `beforeEach`에서 truncate 또는 transaction rollback

### 시간 처리
- 현재 시각 의존 테스트는 **항상** `jest.useFakeTimers()` + `jest.setSystemTime(...)`
- 시간대 명시: `new Date('2026-04-23T09:00:00Z')` (Z = UTC)

## 6. 모킹

### 외부 의존성
- DB: Testcontainers로 진짜 PostgreSQL 사용 (단위 테스트 빼고)
- 이메일: MailService 모킹 (`jest.fn()`)
- 외부 API: `nock` 또는 MSW

### 단위 테스트는 mock
- 다른 service, repository는 mock
- 비즈니스 로직만 검증

### 통합 테스트는 진짜
- 실제 DB, 실제 라우팅
- MailHog는 진짜 띄워두고 사용 가능

## 7. 자동 실행

### 로컬 개발
```bash
# 변경 파일 watch (가장 자주 사용)
pnpm --filter backend test --watch
pnpm --filter frontend test --watch

# 전체
pnpm test --run

# 커버리지
pnpm test --coverage
```

### Hooks
- **pre-push**: `pnpm test --run --silent`
- 실패 시 push 차단

### CI
- 모든 PR/push에 자동 실행
- 단위 + 통합 + E2E + 빌드 + 커버리지 게이트

### Claude Code 자동 실행
`.claude/settings.json`의 `hooks.PostToolUse`에서 코드 변경 감지 시 자동 실행:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "if echo \"$CLAUDE_FILE_PATHS\" | grep -qE '\\.(ts|tsx)$'; then pnpm --filter ${CLAUDE_AFFECTED_PACKAGE:-...} test --run --bail --silent --findRelatedTests $CLAUDE_FILE_PATHS 2>/dev/null || true; fi"
          }
        ]
      }
    ]
  }
}
```

## 8. 커버리지 게이트

`apps/backend/jest.config.ts`:

```ts
export default {
  coverageThreshold: {
    global: { branches: 70, functions: 70, lines: 70, statements: 70 },
    './src/modules/auth/': { branches: 90, functions: 90, lines: 90, statements: 90 },
    './src/modules/booking/': { branches: 90, functions: 90, lines: 90, statements: 90 },
    './src/modules/recurrence/': { branches: 90, functions: 90, lines: 90, statements: 90 },
    './src/modules/exception-request/': { branches: 90, functions: 90, lines: 90, statements: 90 },
  },
};
```

미달 시 CI 실패 → 머지 차단.

## 9. 테스트 케이스 ID 추적

- 각 테스트 케이스는 `docs/06-test-cases.md`의 ID 참조 가능
- 주석으로 표시:

```ts
// Test ID: BOOK-T-013 (동일 시간 동일 회의실 → BOOKING_TIME_CONFLICT)
it('동일 시간 동일 회의실에 예약 시 BOOKING_TIME_CONFLICT', async () => {
  ...
});
```

## 10. 자주 빠뜨리는 케이스

- **Race condition**: 동시 INSERT — DB 제약으로 보호되는지 검증
- **시간대**: 한국/UTC 변환이 정확한지
- **소프트 삭제**: deletedAt 행이 정상 흐름에 영향 없는지
- **권한**: USER가 ADMIN API 호출 시 403
- **빈 응답**: 데이터 없을 때 빈 배열 vs null
- **에러 메시지**: 민감 정보 누출 없는지
- **쿼리 N+1**: include/select로 join 검증

## 11. E2E 시나리오

`docs/06-test-cases.md` §9 참조. 5개 핵심 흐름만 자동화:

1. 신규 가입~첫 예약
2. 반복 예약 + EXDATE
3. 관리자 예외 승인
4. 권한 분리
5. 충돌 방지

E2E는 비싸므로 핵심만, 단위/통합으로 커버 가능한 건 그쪽으로.
