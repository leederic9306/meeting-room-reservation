# DB 설계 — 사내 회의실 예약 시스템

> **문서 정보**
> - 버전: 1.0
> - 작성일: 2026-04-23
> - 대상 DB: PostgreSQL 16
> - ORM: Prisma 5.x

---

## 1. 설계 원칙

- **PK는 UUID v4** — 분산/확장에 유리, URL 노출 시 추측 어려움
- **타임스탬프 컬럼 표준화** — `created_at`, `updated_at`, `deleted_at` (소프트 삭제는 필요한 테이블만)
- **시간 컬럼은 모두 `timestamptz`** — UTC로 저장, 표시 시 클라이언트 시간대 변환
- **DB 컬럼명은 snake_case**, Prisma 모델은 PascalCase + `@map`으로 매핑
- **외래키는 모두 명시적 제약** — `ON DELETE` 정책 명확히 정의
- **상태 값은 enum으로** — 매직 스트링 방지
- **인덱스는 조회 패턴 기반으로 설계** — 캘린더 조회가 가장 빈번
- **무결성 제약은 DB 레벨까지** — 애플리케이션만 믿지 않음 (예: 시간 겹침은 EXCLUDE 제약)

---

## 2. ERD (논리 모델)

```
┌─────────────────┐
│      User       │
│─────────────────│
│ id (PK)         │◄─────┐
│ email (UQ)      │      │
│ password_hash   │      │
│ name            │      │
│ department      │      │
│ employee_no     │      │
│ phone           │      │
│ role            │      │
│ status          │      │
│ created_at      │      │
└─────────────────┘      │
        │                │
        │ 1              │
        │                │
        │ N              │
┌──────────────────┐     │
│ EmailVerification│     │
│──────────────────│     │
│ id (PK)          │     │
│ user_id (FK)     │─────┤
│ code             │     │
│ expires_at       │     │
│ attempt_count    │     │
│ verified_at      │     │
└──────────────────┘     │
                         │
┌──────────────────┐     │
│  RefreshToken    │     │
│──────────────────│     │
│ id (PK)          │     │
│ user_id (FK)     │─────┤
│ token_hash       │     │
│ expires_at       │     │
│ revoked_at       │     │
└──────────────────┘     │
                         │
┌──────────────────┐     │
│ PasswordReset    │     │
│──────────────────│     │
│ id (PK)          │     │
│ user_id (FK)     │─────┤
│ token_hash       │     │
│ expires_at       │     │
│ used_at          │     │
└──────────────────┘     │
                         │
┌──────────────────┐     │
│   LoginAttempt   │     │
│──────────────────│     │
│ id (PK)          │     │
│ email            │     │
│ ip_address       │     │
│ success          │     │
│ attempted_at     │     │
└──────────────────┘     │
                         │
┌─────────────────┐      │
│      Room       │      │
│─────────────────│      │
│ id (PK)         │◄─┐   │
│ name (UQ)       │  │   │
│ capacity        │  │   │
│ location        │  │   │
│ description     │  │   │
│ is_active       │  │   │
│ created_at      │  │   │
└─────────────────┘  │   │
                     │   │
                     │   │
┌─────────────────────────┐
│       Booking           │
│─────────────────────────│
│ id (PK)                 │
│ room_id (FK)            │──┘
│ user_id (FK)            │──────┘
│ title                   │
│ description             │
│ start_at                │
│ end_at                  │
│ recurrence_id (FK,null) │──┐
│ recurrence_index        │  │
│ created_by_admin        │  │
│ created_at              │  │
│ updated_at              │  │
│ deleted_at              │  │
└─────────────────────────┘  │
                             │
┌──────────────────┐         │
│ RecurrenceRule   │         │
│──────────────────│         │
│ id (PK)          │◄────────┘
│ room_id (FK)     │
│ user_id (FK)     │
│ title            │
│ description      │
│ rrule            │
│ duration_minutes │
│ start_at         │
│ until_at         │
│ created_at       │
└──────────────────┘
        │ 1
        │ N
┌────────────────────┐
│ RecurrenceException│
│────────────────────│
│ id (PK)            │
│ recurrence_id (FK) │
│ excluded_date      │
│ reason             │
└────────────────────┘

┌──────────────────────┐
│ ExceptionRequest     │
│ (관리자 예외 신청)    │
│──────────────────────│
│ id (PK)              │
│ user_id (FK)         │
│ room_id (FK)         │
│ start_at             │
│ end_at               │
│ reason               │
│ status               │
│ reviewer_id (FK,null)│
│ review_comment       │
│ reviewed_at          │
│ booking_id (FK,null) │
│ created_at           │
└──────────────────────┘

┌──────────────────┐
│   AuditLog       │
│──────────────────│
│ id (PK)          │
│ actor_id (FK)    │
│ action           │
│ target_type      │
│ target_id        │
│ payload (jsonb)  │
│ created_at       │
└──────────────────┘
```

---

## 3. 테이블 명세

### 3.1 User — 사용자

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | 사용자 식별자 |
| email | varchar(255) | UNIQUE NOT NULL | 로그인 ID, 도메인 제한 없음 |
| password_hash | varchar(255) | NOT NULL | argon2 해시 |
| name | varchar(50) | NOT NULL | 표시 이름 |
| department | varchar(100) | NULL | 부서/팀 |
| employee_no | varchar(50) | NULL | 사번 |
| phone | varchar(20) | NULL | 연락처 |
| role | enum | NOT NULL DEFAULT 'USER' | USER, ADMIN |
| status | enum | NOT NULL DEFAULT 'PENDING' | PENDING, ACTIVE, LOCKED, DELETED |
| locked_until | timestamptz | NULL | 로그인 잠금 해제 시각 |
| last_login_at | timestamptz | NULL | 마지막 로그인 시각 |
| created_at | timestamptz | NOT NULL DEFAULT now() | |
| updated_at | timestamptz | NOT NULL DEFAULT now() | |

**인덱스**
- `idx_user_email` (email) — 로그인 조회
- `idx_user_status` (status) — 미인증 계정 정리 배치용

**비고**
- 소프트 삭제 시 `status = 'DELETED'`, 이메일에 `_deleted_<timestamp>` suffix 추가하여 재가입 가능
- AUTH-009 (24시간 자동 삭제) 처리: cron 또는 pg_cron 으로 `status = 'PENDING' AND created_at < now() - interval '24 hours'` 삭제

---

### 3.2 EmailVerification — 이메일 인증 코드

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK → User.id, ON DELETE CASCADE | |
| code | varchar(6) | NOT NULL | 6자리 숫자 코드 (해시 저장 권장) |
| expires_at | timestamptz | NOT NULL | 발송 시점 + 10분 |
| attempt_count | int | NOT NULL DEFAULT 0 | 최대 5 |
| verified_at | timestamptz | NULL | 인증 완료 시각 |
| sent_at | timestamptz | NOT NULL DEFAULT now() | 재발송 쿨다운 계산용 |

**인덱스**
- `idx_email_verification_user` (user_id) — 사용자별 최신 코드 조회
- `idx_email_verification_user_active` (user_id, verified_at) WHERE verified_at IS NULL

**비고**
- 같은 사용자에게 여러 코드가 쌓일 수 있음 — 인증 성공 시 모두 폐기
- **코드 저장 방식**: 환경별 분기
  - 로컬/개발 환경: 평문 저장 (디버깅 편의)
  - 스테이징/운영 환경: SHA-256 해시 저장 (DB 유출 시 보안)
  - 환경변수 `EMAIL_CODE_HASH_ENABLED` (boolean)로 제어

---

### 3.3 RefreshToken — 리프레시 토큰

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK → User.id, ON DELETE CASCADE | |
| token_hash | varchar(255) | UNIQUE NOT NULL | SHA-256 해시 |
| user_agent | varchar(500) | NULL | 디바이스 식별 |
| ip_address | inet | NULL | 발급 IP |
| expires_at | timestamptz | NOT NULL | 발급 + 14일 |
| revoked_at | timestamptz | NULL | 로그아웃/회수 시각 |
| created_at | timestamptz | NOT NULL DEFAULT now() | |

**인덱스**
- `idx_refresh_token_hash` (token_hash) — 검증 조회
- `idx_refresh_token_user_active` (user_id, revoked_at) WHERE revoked_at IS NULL

---

### 3.4 PasswordReset — 비밀번호 재설정 토큰

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK → User.id, ON DELETE CASCADE | |
| token_hash | varchar(255) | UNIQUE NOT NULL | |
| expires_at | timestamptz | NOT NULL | 발급 + 1시간 |
| used_at | timestamptz | NULL | 사용 시각 |
| created_at | timestamptz | NOT NULL DEFAULT now() | |

---

### 3.5 LoginAttempt — 로그인 시도 이력

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| email | varchar(255) | NOT NULL | 시도된 이메일 (계정 미존재 케이스 포함) |
| ip_address | inet | NULL | |
| success | boolean | NOT NULL | |
| attempted_at | timestamptz | NOT NULL DEFAULT now() | |

**인덱스**
- `idx_login_attempt_email_recent` (email, attempted_at DESC) — 최근 5회 실패 조회

**비고**
- 30일 이상 된 데이터는 정기 삭제 (감사 목적이면 보관)

---

### 3.6 Room — 회의실

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| name | varchar(100) | UNIQUE NOT NULL | 회의실 이름 |
| capacity | int | NULL | 수용 인원 |
| location | varchar(200) | NULL | 위치 (예: "본관 3층") |
| description | text | NULL | |
| is_active | boolean | NOT NULL DEFAULT true | 비활성 시 신규 예약 불가 |
| display_order | int | NOT NULL DEFAULT 0 | 캘린더 표시 순서 |
| created_at | timestamptz | NOT NULL DEFAULT now() | |
| updated_at | timestamptz | NOT NULL DEFAULT now() | |

**인덱스**
- `idx_room_active_order` (is_active, display_order) — 캘린더 회의실 목록

---

### 3.7 Booking — 예약 (가장 중요)

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| room_id | uuid | FK → Room.id, ON DELETE RESTRICT | 회의실 |
| user_id | uuid | FK → User.id, ON DELETE RESTRICT | 예약자 |
| title | varchar(200) | NOT NULL | 회의 제목 |
| description | text | NULL | 설명 |
| start_at | timestamptz | NOT NULL | 시작 시각 (UTC) |
| end_at | timestamptz | NOT NULL | 종료 시각 (UTC) |
| recurrence_id | uuid | FK → RecurrenceRule.id, NULL | 반복 시리즈 ID (단일 예약은 NULL) |
| recurrence_index | int | NULL | 시리즈 내 회차 순번 (0부터) |
| created_by_admin | boolean | NOT NULL DEFAULT false | ADMIN이 예외로 생성한 경우 true |
| exception_request_id | uuid | FK → ExceptionRequest.id, NULL | 승인 요청에서 생성된 경우 추적 |
| created_at | timestamptz | NOT NULL DEFAULT now() | |
| updated_at | timestamptz | NOT NULL DEFAULT now() | |
| deleted_at | timestamptz | NULL | 소프트 삭제 |

**제약**

```sql
-- 시간 유효성
CHECK (end_at > start_at)

-- 15분 단위 (분이 0,15,30,45 중 하나)
CHECK (EXTRACT(MINUTE FROM start_at) IN (0,15,30,45))
CHECK (EXTRACT(MINUTE FROM end_at) IN (0,15,30,45))
CHECK (EXTRACT(SECOND FROM start_at) = 0)
CHECK (EXTRACT(SECOND FROM end_at) = 0)

-- 4시간 이내 (관리자 예외는 created_by_admin = true 로 우회)
CHECK (
  created_by_admin = true
  OR end_at - start_at <= interval '4 hours'
)

-- 동일 회의실 시간 겹침 차단 (PostgreSQL EXCLUDE 제약, btree_gist 확장 필요)
EXCLUDE USING gist (
  room_id WITH =,
  tstzrange(start_at, end_at, '[)') WITH &&
) WHERE (deleted_at IS NULL)
```

**인덱스**
- `idx_booking_room_time` (room_id, start_at, end_at) WHERE deleted_at IS NULL — 캘린더 조회 핵심
- `idx_booking_user_time` (user_id, start_at) WHERE deleted_at IS NULL — 내 예약 조회
- `idx_booking_recurrence` (recurrence_id) WHERE recurrence_id IS NOT NULL — 시리즈 조회

**비고**
- `tstzrange '[)'` — 시작은 포함, 종료는 미포함. 9:00-10:00과 10:00-11:00은 겹치지 않음.
- `btree_gist` 확장 활성화 필수: `CREATE EXTENSION IF NOT EXISTS btree_gist;`
- 소프트 삭제는 EXCLUDE 제약의 WHERE 절로 처리

---

### 3.8 RecurrenceRule — 반복 예약 시리즈

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| room_id | uuid | FK → Room.id, ON DELETE RESTRICT | |
| user_id | uuid | FK → User.id, ON DELETE RESTRICT | |
| title | varchar(200) | NOT NULL | 시리즈 제목 (개별 회차 수정 가능) |
| description | text | NULL | |
| rrule | text | NOT NULL | RFC 5545 RRULE 문자열 |
| duration_minutes | int | NOT NULL | 회차당 길이 (15의 배수, 최대 240) |
| start_at | timestamptz | NOT NULL | 첫 회차 시작 시각 |
| until_at | timestamptz | NOT NULL | 시스템상 1년 제한 |
| created_at | timestamptz | NOT NULL DEFAULT now() | |
| updated_at | timestamptz | NOT NULL DEFAULT now() | |

**제약**

```sql
CHECK (duration_minutes > 0 AND duration_minutes <= 240 AND duration_minutes % 15 = 0)
CHECK (until_at <= start_at + interval '1 year')
```

**비고**
- RRULE 예시: `FREQ=WEEKLY;BYDAY=MO;COUNT=12` → 월요일 12회
- 회차 인스턴스는 Booking 테이블에 미리 펼쳐서 저장 (확장 전략)
- 이유: 충돌 검증을 단순한 SQL로 처리, 캘린더 조회 시 RRULE 파싱 불필요
- 시리즈 수정 시 미래 Booking 행 재생성

---

### 3.9 RecurrenceException — 반복 예약 예외 일자

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| recurrence_id | uuid | FK → RecurrenceRule.id, ON DELETE CASCADE | |
| excluded_date | date | NOT NULL | 제외할 일자 (날짜 단위) |
| reason | varchar(500) | NULL | |
| created_at | timestamptz | NOT NULL DEFAULT now() | |

**제약**
- UNIQUE (recurrence_id, excluded_date)

**비고**
- 사용자가 시리즈 중 특정 회차 삭제 시 추가
- 동시에 해당 Booking 행도 소프트 삭제

---

### 3.10 ExceptionRequest — 관리자 예외 신청

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK → User.id, ON DELETE RESTRICT | 신청자 |
| room_id | uuid | FK → Room.id, ON DELETE RESTRICT | |
| start_at | timestamptz | NOT NULL | |
| end_at | timestamptz | NOT NULL | |
| title | varchar(200) | NOT NULL | |
| reason | text | NOT NULL | 신청 사유 (필수) |
| status | enum | NOT NULL DEFAULT 'PENDING' | PENDING, APPROVED, REJECTED, CANCELLED |
| reviewer_id | uuid | FK → User.id, NULL | 처리한 ADMIN |
| review_comment | text | NULL | 반려 사유 등 |
| reviewed_at | timestamptz | NULL | |
| booking_id | uuid | FK → Booking.id, NULL | 승인 시 생성된 예약 |
| created_at | timestamptz | NOT NULL DEFAULT now() | |
| updated_at | timestamptz | NOT NULL DEFAULT now() | |

**인덱스**
- `idx_exception_request_status` (status, created_at) — 관리자 대기 목록
- `idx_exception_request_user` (user_id, created_at DESC) — 내 신청 이력

---

### 3.11 AuditLog — 감사 로그

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK | |
| actor_id | uuid | FK → User.id, NULL | 행위자 (시스템 작업 시 NULL) |
| action | varchar(100) | NOT NULL | 예: BOOKING_CREATED, USER_ROLE_CHANGED |
| target_type | varchar(50) | NOT NULL | 예: BOOKING, USER, ROOM |
| target_id | uuid | NULL | |
| payload | jsonb | NULL | 변경 전/후 또는 추가 컨텍스트 |
| ip_address | inet | NULL | |
| created_at | timestamptz | NOT NULL DEFAULT now() | |

**인덱스**
- `idx_audit_log_target` (target_type, target_id, created_at DESC)
- `idx_audit_log_actor` (actor_id, created_at DESC)

**비고**
- 영구 보관. 12개월 이상 된 로그는 별도 아카이브 테이블로 이관 검토
- 권한 변경, 예외 승인/반려 등 민감 작업은 반드시 기록

---

## 4. Enum 정의

### 4.1 UserRole

```
USER    -- 일반 사용자
ADMIN   -- 관리자
```

### 4.2 UserStatus

```
PENDING  -- 이메일 인증 대기
ACTIVE   -- 정상
LOCKED   -- 잠김 (로그인 실패 누적)
DELETED  -- 소프트 삭제
```

### 4.3 ExceptionRequestStatus

```
PENDING    -- 검토 대기
APPROVED   -- 승인됨 (Booking 생성됨)
REJECTED   -- 반려됨
CANCELLED  -- 신청자 취소
```

---

## 5. 핵심 시나리오별 데이터 흐름

### 5.1 일반 예약 생성

```
1. INSERT INTO booking (...)
   ↓
2. EXCLUDE 제약이 시간 겹침 자동 검증
   - 충돌 시 PostgreSQL이 에러 반환 → 23P01 SQLSTATE
   - 애플리케이션은 이를 catch하여 사용자 친화적 메시지로 변환
3. AuditLog 기록 (BOOKING_CREATED)
```

### 5.2 반복 예약 생성

```
1. INSERT INTO recurrence_rule (...) → recurrence_id 획득
2. RRULE 파싱으로 모든 회차 시각 계산 (백엔드 lib: rrule.js)
3. 각 회차에 대해:
   a. 과거 시점이면 skip
   b. INSERT INTO booking (recurrence_id, recurrence_index, ...)
   c. EXCLUDE 제약 위반 시 충돌 회차 목록에 누적, 그 외 회차는 정상 INSERT
4. 트랜잭션 마지막에 충돌 회차 정보를 응답에 포함
   - 정책: 일부 충돌이어도 나머지는 등록 (PRD RECUR-007)
```

### 5.3 반복 예약 수정 (이 회차만)

```
1. 대상 Booking row 수정
2. 시리즈 분리 정책: recurrence_id를 NULL로 만들고 단일 예약화
   또는 RecurrenceException 추가 + 새로운 단일 Booking 생성
   → 후자가 시리즈 무결성 유지에 더 깔끔
```

### 5.4 반복 예약 수정 (이후 모든 회차)

```
1. 기존 시리즈의 until_at을 변경 시점 직전으로 단축
2. 변경 시점 이후의 미래 Booking들 소프트 삭제
3. 새로운 RecurrenceRule을 변경 시점부터 새로 생성
4. 새 시리즈로 미래 Booking 재펼침
```

### 5.5 관리자 예외 신청 → 승인

```
[신청]
1. INSERT INTO exception_request (status='PENDING', ...)

[승인]
1. SELECT FOR UPDATE 로 해당 ExceptionRequest 잠금
2. 시간 겹침 재검증 (PENDING 사이 다른 예약이 들어왔을 수 있음)
   - 충돌 시 승인 실패 → 관리자에게 안내
3. 트랜잭션 내에서:
   a. INSERT INTO booking (created_by_admin=true, exception_request_id=...)
   b. UPDATE exception_request SET status='APPROVED', booking_id=..., reviewer_id=..., reviewed_at=now()
4. AuditLog 기록 (EXCEPTION_APPROVED)
5. 신청자에게 이메일 발송
```

---

## 6. 마이그레이션 전략

- **초기 마이그레이션**: `init` — 모든 테이블, enum, 인덱스, EXCLUDE 제약 포함
- **`btree_gist` 확장**: 첫 마이그레이션에 `CREATE EXTENSION IF NOT EXISTS btree_gist;` 포함
- **시드 데이터**: 개발 환경용 시드 스크립트 별도 (`prisma/seed.ts`)
  - ADMIN 계정 1개 (환경변수로 비밀번호 주입)
  - 회의실 1개 ("회의실 A")
- **마이그레이션 명명**: `<순번>_<영문_snake_case>` (예: `0001_init`, `0002_add_room_capacity`)

---

## 7. 데이터 정리 정책

| 대상 | 주기 | 조건 |
|---|---|---|
| 미인증 User | 매시간 | `status='PENDING' AND created_at < now() - 24h` |
| 만료된 EmailVerification | 매일 | `expires_at < now() - 7d` |
| 만료된 RefreshToken | 매일 | `expires_at < now() - 30d` (revoke 이력 보존) |
| LoginAttempt | 매주 | `attempted_at < now() - 90d` |
| 만료된 PasswordReset | 매일 | `expires_at < now() - 7d` |
| AuditLog | 영구 보관 | 12개월 이상은 아카이브 검토 |

구현은 NestJS `@Cron` 또는 `pg_cron` 확장 사용 검토.

---

## 8. 변경 이력

| 버전 | 일자 | 작성자 | 변경 내용 |
|---|---|---|---|
| 1.0 | 2026-04-23 | 데릭 + Claude | 초기 작성 |
