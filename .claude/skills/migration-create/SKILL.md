---
name: migration-create
description: Create a Prisma migration with optional advanced SQL. Use when adding/modifying database schema, adding indexes, EXCLUDE constraints, CHECK constraints, or any DB structural change.
allowed-tools: Bash Read Write Edit
---

# Migration Create

Prisma 마이그레이션을 생성합니다. 고급 SQL(EXCLUDE, CHECK, 부분 인덱스)이 필요하면 별도 마이그레이션으로 추가합니다.

## 사용법

```
/migration-create <영문_snake_case_이름>
```

예: `/migration-create add_room_amenities_field`

## 동작 흐름

### 1. 사용자 의도 파악

먼저 사용자에게 다음을 확인:
- 변경 내용이 **schema.prisma 수정만**으로 가능한지?
- 아니면 **EXCLUDE/CHECK/부분 인덱스/트리거** 같은 고급 SQL이 필요한지?

### 2-A. 일반 마이그레이션

schema.prisma 수정만으로 가능한 경우:

```bash
# 1. apps/backend/prisma/schema.prisma 수정
# 2. 마이그레이션 생성 + 적용
pnpm --filter backend prisma migrate dev --name $ARGUMENTS

# 3. 생성된 SQL 검토 출력
cat apps/backend/prisma/migrations/$(ls -t apps/backend/prisma/migrations | head -1)/migration.sql
```

### 2-B. 고급 SQL이 필요한 경우

```bash
# 1. 빈 마이그레이션 생성
pnpm --filter backend prisma migrate dev --create-only --name $ARGUMENTS

# 2. 생성된 폴더 안내
LATEST=$(ls -t apps/backend/prisma/migrations | head -1)
echo "Edit: apps/backend/prisma/migrations/$LATEST/migration.sql"

# 3. 사용자가 SQL 추가 후
pnpm --filter backend prisma migrate dev
```

## 검증

마이그레이션 생성 후:
1. `migration.sql` 내용 검토
2. 의도하지 않은 DROP/ALTER가 있는지 확인
3. 운영 데이터 손실 가능성 검토
4. 필요 시 데이터 백필 마이그레이션 별도 생성

## 명명 규칙

좋은 이름:
- `add_user_phone_field`
- `change_booking_status_enum`
- `add_booking_overlap_constraint`
- `drop_unused_legacy_columns`

나쁜 이름:
- `update`, `fix`, `change` (모호)
- 한글 (Prisma 호환성)
- `Add Field` (camelCase X, snake_case)

## 주의

- **머지된 마이그레이션은 절대 수정 금지** — history 변경
- 운영 환경에서는 `migrate dev` 절대 사용 금지 — `migrate deploy`
- 컬럼 추가는 nullable → 백필 → NOT NULL 3단계
- 자세한 규칙은 `@.claude/rules/database.md` 참조
