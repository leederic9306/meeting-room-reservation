# Database

## 1. 기본 원칙

- **시간 컬럼은 모두 `Timestamptz(6)`** (UTC 저장, 마이크로초)
- **DB 컬럼은 snake_case**, Prisma 모델은 PascalCase + `@map`
- **PK는 UUID v4** — 분산/보안 고려
- **외래키는 ON DELETE 명시** (Cascade/Restrict/SetNull)
- **소프트 삭제는 `deleted_at` 컬럼** (필요한 테이블만 — Booking)
- **상태값은 enum**

## 2. 마이그레이션

### 2.1 일반 마이그레이션

Prisma 스키마 수정 후:

```bash
pnpm --filter backend prisma migrate dev --name <영문_snake_case>
```

마이그레이션 이름 예:
- `add_booking_index`
- `change_user_role_enum`
- `drop_unused_column`

### 2.2 고급 SQL이 필요한 경우

Prisma가 표현 못 하는 EXCLUDE 제약, 부분 인덱스, 트리거 등은:

```bash
pnpm --filter backend prisma migrate dev --create-only --name add_xxx_constraint
```

생성된 빈 마이그레이션 파일에 직접 SQL 추가 후:

```bash
pnpm --filter backend prisma migrate dev
```

### 2.3 마이그레이션 적용 순서
1. 로컬에서 작성 + 검증
2. PR에 마이그레이션 파일 포함
3. CI에서 마이그레이션 dry-run 검증 (선택)
4. 머지 후 운영 배포 시 `prisma migrate deploy`

### 2.4 절대 하지 말 것
- 머지된 마이그레이션 파일 수정 ❌ (history 변경)
- production DB에 `migrate dev` ❌ (`migrate deploy`만)
- 데이터 손실 가능 마이그레이션은 사전 백업

## 3. 핵심 제약

### 3.1 시간 겹침 차단 (Booking)

```sql
EXCLUDE USING gist (
  room_id WITH =,
  tstzrange(start_at, end_at, '[)') WITH &&
) WHERE (deleted_at IS NULL)
```

- `[)` = 시작 포함, 종료 미포함 → 9-10시와 10-11시는 겹치지 않음
- WHERE 절로 소프트 삭제 제외
- `btree_gist` 확장 필요 (init script에 포함됨)

### 3.2 애플리케이션 코드에서 catch

```ts
try {
  await this.prisma.booking.create({ data });
} catch (e) {
  if (isPrismaError(e) && e.meta?.code === '23P01') {
    // EXCLUDE 제약 위반
    throw new BookingTimeConflictException();
  }
  throw e;
}
```

### 3.3 CHECK 제약

- 15분 단위
- 4시간 제한 (관리자 우회)
- 종료 > 시작
- RecurrenceRule duration 1~240, 15 배수
- 시리즈 1년 제한

## 4. 인덱싱 전략

조회 패턴 우선:

| 쿼리 | 인덱스 |
|---|---|
| 캘린더 조회 | `(room_id, start_at, end_at) WHERE deleted_at IS NULL` |
| 내 예약 | `(user_id, start_at) WHERE deleted_at IS NULL` |
| 시리즈 회차 | `(recurrence_id) WHERE recurrence_id IS NOT NULL` |
| 로그인 시도 검사 | `(email, attempted_at DESC)` |
| 관리자 신청 목록 | `(status, created_at)` |

EXPLAIN ANALYZE로 검증 후 추가.

## 5. 트랜잭션

### 5.1 사용 시점
- 여러 테이블 변경 시
- 순서가 중요한 작업
- 동시성 제어 필요 시

```ts
await this.prisma.$transaction(async (tx) => {
  const booking = await tx.booking.create({ data });
  await tx.auditLog.create({ data: { action: 'BOOKING_CREATED', ... } });
});
```

### 5.2 격리 수준
- 기본 (Read Committed) 충분한 경우 다수
- 신청 승인 등 race 우려 시 `Serializable` 또는 `SELECT FOR UPDATE`

```ts
await this.prisma.$transaction(async (tx) => {
  const request = await tx.$queryRaw<ExceptionRequest[]>`
    SELECT * FROM exception_request WHERE id = ${id}::uuid FOR UPDATE
  `;
  // ...
}, { isolationLevel: 'Serializable' });
```

### 5.3 외부 호출은 트랜잭션 밖
- 이메일 발송, 외부 API 호출은 DB 커밋 후
- 실패 시 재시도 로직

## 6. 시드 데이터

`apps/backend/prisma/seed.ts`:

```ts
// ADMIN 계정 1개
await prisma.user.upsert({
  where: { email: process.env.SEED_ADMIN_EMAIL! },
  update: {},
  create: {
    email: process.env.SEED_ADMIN_EMAIL!,
    passwordHash: await argon2.hash(process.env.SEED_ADMIN_PASSWORD!),
    name: process.env.SEED_ADMIN_NAME!,
    role: 'ADMIN',
    status: 'ACTIVE',
  },
});

// 회의실 1개
await prisma.room.upsert({
  where: { name: '회의실 A' },
  update: {},
  create: { name: '회의실 A', capacity: 8, location: '본관 3층' },
});
```

실행:

```bash
pnpm --filter backend prisma db seed
```

## 7. 데이터 정리 (Cron)

- 미인증 User (24시간) — 매시간
- 만료된 EmailVerification (7일+) — 매일
- 만료된 RefreshToken (30일+) — 매일
- LoginAttempt (90일+) — 매주
- 정리 작업도 AuditLog에 시스템 액터로 기록

NestJS `@Cron`으로 구현, 운영 환경에서는 `pg_cron` 검토.

## 8. 시간대 주의사항

```ts
// ❌ 위험 - 서버 시간대 의존
const now = new Date();
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);

// ✅ UTC 명시
import { addHours, startOfDay } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';

const nowUtc = new Date(); // 항상 UTC
const todayInSeoul = utcToZonedTime(nowUtc, 'Asia/Seoul');
const tomorrowSeoulMidnightUtc = zonedTimeToUtc(
  addHours(startOfDay(todayInSeoul), 24),
  'Asia/Seoul',
);
```

## 9. Prisma 사용 팁

### include vs select
- 필요한 필드만 select로 한정 (특히 password_hash 같은 민감 필드)
- include로 관계 join 시 N+1 방지

### Raw query
- 복잡한 집계, EXCLUDE 제약 회피, FOR UPDATE 등 Prisma가 못 표현하는 경우만
- 항상 매개변수 바인딩 (`$queryRaw` + 템플릿 리터럴)

### 마이그레이션 베스트 프랙티스
- 한 마이그레이션 = 한 의도
- 컬럼 추가는 nullable로 시작 → 데이터 백필 → NOT NULL 변경 (3단계)
- 컬럼 삭제는 deprecate 표시 후 다음 릴리스에서 삭제
