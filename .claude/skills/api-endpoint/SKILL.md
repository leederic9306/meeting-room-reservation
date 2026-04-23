---
name: api-endpoint
description: Implement an API endpoint based on the spec in docs/03-api-spec.md. Use when implementing or modifying any REST endpoint.
allowed-tools: Read Write Edit Grep Bash
---

# API Endpoint

API 명세(`docs/03-api-spec.md`)를 기반으로 엔드포인트를 구현합니다.

## 사용법

```
/api-endpoint <method> <path>
```

예: `/api-endpoint POST /bookings`

## 동작 흐름

### 1. 명세 조회

먼저 `docs/03-api-spec.md`에서 해당 엔드포인트 섹션 찾기:
- 요청 형식
- 응답 형식
- 검증 규칙
- 권한 (USER / ADMIN)
- 에러 코드

### 2. 구현 체크리스트

- [ ] **DTO 정의** — `packages/shared-types`에 zod 스키마 + 백엔드 DTO
- [ ] **Controller 메서드** — 라우팅, Guard, 데코레이터
- [ ] **Service 메서드** — 비즈니스 로직
- [ ] **검증 로직** — 명세의 모든 검증 규칙
- [ ] **에러 처리** — 명세의 모든 에러 코드 → 도메인 예외 매핑
- [ ] **AuditLog 기록** — 민감 작업 시
- [ ] **단위 테스트** — service 분기 모두
- [ ] **통합 테스트** — controller + 실제 DB
- [ ] **테스트 케이스 ID** — `docs/06-test-cases.md`의 ID 주석

### 3. 권한 체크

명세에 따라:

```ts
// 🔓 Public
@Post('signup')
async signup(@Body() dto: SignupDto) { ... }

// 🔐 USER (인증 필요)
@UseGuards(JwtAuthGuard)
@Post('bookings')
async create(
  @CurrentUser() user: AuthUser,
  @Body() dto: CreateBookingDto,
) { ... }

// 👑 ADMIN
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Post('admin/users/:id/role')
async changeRole(...) { ... }
```

### 4. 에러 처리 패턴

```ts
// 도메인 예외 정의
export class BookingTimeConflictException extends ConflictException {
  constructor(conflictingBookingId?: string) {
    super({
      code: 'BOOKING_TIME_CONFLICT',
      message: '선택한 시간대에 다른 예약이 있습니다.',
      details: conflictingBookingId ? { conflictingBookingId } : undefined,
    });
  }
}

// 글로벌 필터에서 통일된 응답 형식으로 변환
```

### 5. 응답 형식

```ts
// 모든 성공 응답은 data 래핑
return { data: result };

// 페이지네이션
return { data: items, meta: { page, limit, totalItems, totalPages } };

// 204 No Content
@HttpCode(204)
async delete() {
  await this.service.delete(id);
}
```

### 6. 자동 검증

구현 후 자동 실행:
- `pnpm --filter backend lint`
- `pnpm --filter backend typecheck`
- `pnpm --filter backend test --run --findRelatedTests <변경 파일>`

## 참조

- API 명세: `docs/03-api-spec.md`
- 테스트 케이스: `docs/06-test-cases.md`
- 아키텍처: `@.claude/rules/architecture.md`
- 코딩 스타일: `@.claude/rules/coding-style.md`

## 자주 빠뜨리는 것

- DTO에서 zod refine으로 비즈니스 검증 (시간 순서 등)
- 응답에 password_hash 등 민감 필드 누출
- 권한 데코레이터 누락 (특히 ADMIN)
- 에러 코드를 명세와 다르게 사용
- 트랜잭션 경계 누락
