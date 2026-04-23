# API 명세 — 사내 회의실 예약 시스템

> **문서 정보**
> - 버전: 1.0
> - 작성일: 2026-04-23
> - Base URL: `http://localhost:3001/api/v1` (로컬 기준)
> - 형식: REST + JSON

---

## 1. 공통 규칙

### 1.1 인증

- 인증이 필요한 모든 엔드포인트는 `Authorization: Bearer <accessToken>` 헤더 필요
- Refresh Token은 `HttpOnly`, `Secure`, `SameSite=Strict` Cookie로 전달 (쿠키명: `refresh_token`)
- 401 응답 시 클라이언트는 `/auth/refresh` 호출 → 재시도

### 1.2 응답 형식

**성공 응답 (2xx)**
```json
{
  "data": { ... },
  "meta": { ... }
}
```

`meta`는 페이지네이션 등 부가 정보가 있을 때만 포함.

**에러 응답 (4xx, 5xx)**
```json
{
  "error": {
    "code": "BOOKING_TIME_CONFLICT",
    "message": "선택한 시간대에 다른 예약이 있습니다.",
    "details": {
      "conflictingBookingId": "...",
      "field": "startAt"
    }
  }
}
```

| 필드 | 설명 |
|---|---|
| `code` | 머신리더블 에러 코드 (UPPER_SNAKE) |
| `message` | 사용자 표시용 한국어 메시지 |
| `details` | 선택, 추가 컨텍스트 |

### 1.3 표준 에러 코드

| 코드 | HTTP | 설명 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | 입력값 검증 실패 |
| `UNAUTHORIZED` | 401 | 토큰 없음/만료/무효 |
| `FORBIDDEN` | 403 | 권한 부족 |
| `NOT_FOUND` | 404 | 리소스 없음 |
| `CONFLICT` | 409 | 비즈니스 충돌 (중복 등) |
| `RATE_LIMITED` | 429 | 요청 한도 초과 |
| `INTERNAL_ERROR` | 500 | 서버 내부 에러 |

도메인별 세부 코드는 각 엔드포인트 아래에 명시.

### 1.4 페이지네이션

목록 조회 시 공통 쿼리 파라미터:
- `page`: 페이지 번호 (1부터, 기본 1)
- `limit`: 페이지당 항목 수 (기본 20, 최대 100)

응답 `meta`:
```json
{
  "meta": {
    "page": 1,
    "limit": 20,
    "totalItems": 145,
    "totalPages": 8
  }
}
```

### 1.5 시간 형식

- 모든 요청/응답의 시간은 **ISO 8601 UTC** 문자열 (예: `2026-04-23T09:00:00.000Z`)
- 클라이언트가 표시 시 사용자 시간대로 변환

### 1.6 권한 표기 규칙

각 엔드포인트 옆에 권한 뱃지를 붙임:
- 🔓 Public — 인증 불필요
- 🔐 USER — 로그인한 사용자
- 👑 ADMIN — 관리자만

---

## 2. 인증 (Auth)

### 2.1 회원가입 — `POST /auth/signup` 🔓

**Request**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "홍길동",
  "department": "개발팀",
  "employeeNo": "EMP001",
  "phone": "010-1234-5678"
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| email | string | O | 이메일 형식 |
| password | string | O | 8자 이상, 영문+숫자+특수문자 |
| name | string | O | 1~50자 |
| department | string | X | 최대 100자 |
| employeeNo | string | X | 최대 50자 |
| phone | string | X | 최대 20자 |

**Response 201**
```json
{
  "data": {
    "userId": "uuid",
    "email": "user@example.com",
    "verificationRequired": true,
    "codeSentAt": "2026-04-23T09:00:00.000Z"
  }
}
```

**에러**
- `EMAIL_ALREADY_EXISTS` (409)
- `WEAK_PASSWORD` (400)
- `VALIDATION_ERROR` (400)

**비고**
- 응답과 동시에 6자리 인증 코드 메일 발송
- 응답에는 코드 자체를 절대 포함하지 않음

---

### 2.2 인증 코드 검증 — `POST /auth/verify-email` 🔓

**Request**
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**Response 200**
```json
{
  "data": {
    "verified": true,
    "accessToken": "eyJ...",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "홍길동",
      "role": "USER"
    }
  }
}
```

Refresh Token은 Set-Cookie로 전달.

**에러**
- `INVALID_CODE` (400) — 코드 불일치
- `CODE_EXPIRED` (400) — 10분 만료
- `CODE_ATTEMPTS_EXCEEDED` (400) — 5회 실패, 코드 무효화 → 재발송 필요
- `ALREADY_VERIFIED` (409)

---

### 2.3 인증 코드 재발송 — `POST /auth/resend-code` 🔓

**Request**
```json
{
  "email": "user@example.com"
}
```

**Response 200**
```json
{
  "data": {
    "codeSentAt": "2026-04-23T09:01:00.000Z",
    "nextResendAvailableAt": "2026-04-23T09:02:00.000Z"
  }
}
```

**에러**
- `RESEND_COOLDOWN` (429) — 60초 쿨다운 미경과, `details.retryAfterSeconds` 포함
- `ALREADY_VERIFIED` (409)
- `USER_NOT_FOUND` (404)

---

### 2.4 로그인 — `POST /auth/login` 🔓

**Request**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response 200**
```json
{
  "data": {
    "accessToken": "eyJ...",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "홍길동",
      "role": "USER"
    }
  }
}
```

Refresh Token은 Set-Cookie로 전달.

**에러**
- `INVALID_CREDENTIALS` (401) — 이메일/비번 불일치 (구분하지 않음, 계정 열거 방지)
- `EMAIL_NOT_VERIFIED` (403)
- `ACCOUNT_LOCKED` (423) — 5회 실패 잠금, `details.lockedUntil` 포함

---

### 2.5 토큰 갱신 — `POST /auth/refresh` 🔓

Cookie의 `refresh_token` 사용.

**Response 200**
```json
{
  "data": {
    "accessToken": "eyJ..."
  }
}
```

새 Refresh Token도 Set-Cookie로 갱신 (rotation).

**에러**
- `INVALID_REFRESH_TOKEN` (401)
- `REFRESH_TOKEN_EXPIRED` (401)

---

### 2.6 로그아웃 — `POST /auth/logout` 🔐

Refresh Token 무효화 + Cookie 삭제.

**Response 204** (no content)

---

### 2.7 비밀번호 재설정 요청 — `POST /auth/password-reset/request` 🔓

**Request**
```json
{
  "email": "user@example.com"
}
```

**Response 200**
```json
{
  "data": {
    "message": "이메일이 발송되었습니다."
  }
}
```

**비고**
- 이메일 존재 여부와 무관하게 항상 200 반환 (계정 열거 방지)

---

### 2.8 비밀번호 재설정 — `POST /auth/password-reset/confirm` 🔓

**Request**
```json
{
  "token": "reset-token-from-email",
  "newPassword": "NewSecurePass123!"
}
```

**Response 200**
```json
{
  "data": {
    "message": "비밀번호가 변경되었습니다."
  }
}
```

**에러**
- `INVALID_RESET_TOKEN` (400)
- `RESET_TOKEN_EXPIRED` (400)
- `WEAK_PASSWORD` (400)

---

### 2.9 내 정보 조회 — `GET /auth/me` 🔐

**Response 200**
```json
{
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "홍길동",
    "department": "개발팀",
    "employeeNo": "EMP001",
    "phone": "010-1234-5678",
    "role": "USER",
    "createdAt": "2026-04-23T..."
  }
}
```

---

### 2.10 내 정보 수정 — `PATCH /auth/me` 🔐

**Request**
```json
{
  "name": "홍길동",
  "department": "플랫폼팀",
  "phone": "010-9999-8888"
}
```

`email`, `role`은 변경 불가 (별도 엔드포인트).

**Response 200** — 수정된 사용자 정보 반환

---

### 2.11 비밀번호 변경 — `POST /auth/me/password` 🔐

**Request**
```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass456!"
}
```

**Response 204**

**에러**
- `INVALID_CURRENT_PASSWORD` (400)
- `WEAK_PASSWORD` (400)

---

## 3. 회의실 (Room)

### 3.1 회의실 목록 — `GET /rooms` 🔐

**Query**
- `includeInactive`: boolean (기본 false, ADMIN만 true 사용 가능)

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "회의실 A",
      "capacity": 8,
      "location": "본관 3층",
      "description": "프로젝터 있음",
      "isActive": true,
      "displayOrder": 0
    }
  ]
}
```

---

### 3.2 회의실 상세 — `GET /rooms/:id` 🔐

**Response 200** — 단일 회의실 객체

**에러**
- `ROOM_NOT_FOUND` (404)

---

### 3.3 회의실 생성 — `POST /rooms` 👑

**Request**
```json
{
  "name": "회의실 B",
  "capacity": 12,
  "location": "본관 4층",
  "description": "화상회의 가능",
  "displayOrder": 1
}
```

**Response 201** — 생성된 회의실 객체

**에러**
- `ROOM_NAME_DUPLICATE` (409)
- `ROOM_LIMIT_EXCEEDED` (409) — 10개 초과

---

### 3.4 회의실 수정 — `PATCH /rooms/:id` 👑

**Request** — 부분 업데이트 (모든 필드 선택)

**Response 200** — 수정된 회의실 객체

---

### 3.5 회의실 삭제 — `DELETE /rooms/:id` 👑

**Response 204**

**에러**
- `ROOM_HAS_FUTURE_BOOKINGS` (409) — 미래 예약이 있을 때
- 비활성화는 별도 — 삭제 대신 `PATCH`로 `isActive: false` 권장

---

## 4. 예약 (Booking)

### 4.1 예약 목록 — `GET /bookings` 🔐

**Query**
- `roomId`: uuid (선택, 미지정 시 전체)
- `from`: ISO datetime (필수)
- `to`: ISO datetime (필수)
- `userId`: uuid (선택, ADMIN만 다른 사용자 지정 가능)

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "room": {
        "id": "uuid",
        "name": "회의실 A"
      },
      "user": {
        "id": "uuid",
        "name": "홍길동",
        "department": "개발팀"
      },
      "title": "스프린트 리뷰",
      "description": null,
      "startAt": "2026-04-23T09:00:00.000Z",
      "endAt": "2026-04-23T10:00:00.000Z",
      "recurrenceId": null,
      "recurrenceIndex": null,
      "createdByAdmin": false,
      "isMine": true,
      "createdAt": "2026-04-22T..."
    }
  ]
}
```

**제약**
- `to - from` 최대 31일 (성능 보호)

**에러**
- `INVALID_TIME_RANGE` (400)
- `TIME_RANGE_TOO_LARGE` (400)

---

### 4.2 예약 상세 — `GET /bookings/:id` 🔐

**Response 200** — 단일 예약 객체 (반복 예약 시 시리즈 정보 포함)

```json
{
  "data": {
    "id": "uuid",
    "room": { ... },
    "user": { ... },
    "title": "주간 회의",
    "description": "...",
    "startAt": "2026-04-23T09:00:00.000Z",
    "endAt": "2026-04-23T10:00:00.000Z",
    "recurrence": {
      "id": "uuid",
      "rrule": "FREQ=WEEKLY;BYDAY=MO;COUNT=12",
      "currentIndex": 3,
      "totalCount": 12
    },
    "createdByAdmin": false,
    "createdAt": "..."
  }
}
```

---

### 4.3 예약 생성 — `POST /bookings` 🔐

**Request**
```json
{
  "roomId": "uuid",
  "title": "스프린트 리뷰",
  "description": "Q2 회고 포함",
  "startAt": "2026-04-25T09:00:00.000Z",
  "endAt": "2026-04-25T10:00:00.000Z"
}
```

**Response 201** — 생성된 예약 객체

**검증 순서**
1. 시간 형식 (15분 단위)
2. 시작 < 종료
3. 시작이 미래 (현재 이후)
4. 기간 ≤ 4시간
5. 회의실 활성 상태
6. 시간 충돌 없음

**에러**
- `BOOKING_TIME_NOT_QUARTER` (400) — 15분 단위 위반
- `BOOKING_TIME_PAST` (400) — 과거 시점
- `BOOKING_DURATION_EXCEEDED` (400) — 4시간 초과 → "예외 신청 안내"
- `BOOKING_TIME_CONFLICT` (409) — 충돌, `details.conflictingBookingId` 포함
- `ROOM_INACTIVE` (409)

---

### 4.4 예약 수정 — `PATCH /bookings/:id` 🔐

**Request** — 부분 업데이트
```json
{
  "title": "변경된 제목",
  "startAt": "2026-04-25T10:00:00.000Z",
  "endAt": "2026-04-25T11:00:00.000Z"
}
```

**Response 200** — 수정된 예약 객체

**규칙**
- 본인 예약 또는 ADMIN만 가능
- 시작 시간 이후 예약은 USER 수정 불가 (ADMIN은 가능)
- 반복 예약의 인스턴스를 수정하면 자동으로 시리즈에서 분리 (`recurrenceId`가 NULL이 됨, EXDATE 추가)
  - 클라이언트에서 명시적으로 알리려면 응답에 `detachedFromSeries: true` 포함

**에러**
- `BOOKING_PAST_NOT_EDITABLE` (403)
- `BOOKING_OWNERSHIP_REQUIRED` (403)

---

### 4.5 예약 삭제 — `DELETE /bookings/:id` 🔐

**Query**
- `scope`: `instance` (기본) | `following` | `series` — 반복 예약일 때만 의미 있음

**Response 204**

**규칙**
- 단일 예약: 그냥 소프트 삭제
- 반복 회차 + `scope=instance`: 해당 회차 소프트 삭제 + RecurrenceException 추가
- 반복 회차 + `scope=following`: 이 회차부터 미래 모든 회차 삭제 + 시리즈 `untilAt` 단축
- 반복 회차 + `scope=series`: 시리즈 전체 삭제 (모든 회차 + RecurrenceRule)

**에러**
- `BOOKING_PAST_NOT_DELETABLE` (403) — USER 한정

---

## 5. 반복 예약 (Recurrence)

### 5.1 반복 예약 생성 — `POST /recurrences` 🔐

**Request**
```json
{
  "roomId": "uuid",
  "title": "주간 동기화",
  "description": "매주 모니터링",
  "startAt": "2026-04-27T09:00:00.000Z",
  "durationMinutes": 60,
  "rrule": "FREQ=WEEKLY;BYDAY=MO;COUNT=12"
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| roomId | uuid | |
| title | string | 1~200자 |
| startAt | ISO datetime | 첫 회차 시작 (15분 단위) |
| durationMinutes | int | 회차당 길이 (15의 배수, 1~240) |
| rrule | string | RFC 5545 RRULE |

**Response 201**
```json
{
  "data": {
    "recurrenceId": "uuid",
    "createdBookings": 11,
    "skippedBookings": [
      {
        "instanceDate": "2026-05-25",
        "reason": "TIME_CONFLICT",
        "conflictingBookingId": "uuid"
      }
    ]
  }
}
```

**규칙**
- RRULE이 1년을 초과하는 경우 1년에서 자동 절단
- 과거 시점 회차는 자동 skip
- 시간 충돌 회차도 skip하되 결과에 명시 (PRD RECUR-007)

**에러**
- `INVALID_RRULE` (400)
- `RRULE_RANGE_TOO_LARGE` (400) — 1년 초과 (자동 절단 정책 변경 시)
- `BOOKING_DURATION_EXCEEDED` (400) — 4시간 초과
- `ALL_INSTANCES_FAILED` (409) — 모든 회차가 skip된 경우

---

### 5.2 반복 시리즈 조회 — `GET /recurrences/:id` 🔐

**Response 200**
```json
{
  "data": {
    "id": "uuid",
    "room": { ... },
    "user": { ... },
    "title": "주간 동기화",
    "rrule": "FREQ=WEEKLY;BYDAY=MO;COUNT=12",
    "durationMinutes": 60,
    "startAt": "2026-04-27T09:00:00.000Z",
    "untilAt": "2026-07-13T10:00:00.000Z",
    "exceptions": [
      { "id": "uuid", "excludedDate": "2026-05-25", "reason": "..." }
    ],
    "instances": [
      { "id": "booking-uuid", "startAt": "...", "endAt": "...", "isPast": false }
    ]
  }
}
```

---

### 5.3 반복 시리즈 수정 — `PATCH /recurrences/:id` 🔐

**Request**
```json
{
  "title": "변경된 시리즈 제목",
  "description": "..."
}
```

**규칙**
- 시리즈의 메타정보(title, description)만 수정 가능
- 시간/RRULE 변경은 "삭제 후 재생성" 흐름 권장 (복잡도 관리)

**Response 200** — 수정된 시리즈 객체

---

### 5.4 반복 시리즈 삭제 — `DELETE /recurrences/:id` 🔐

**Query**
- `from`: ISO date (선택) — 이 일자부터 삭제, 미지정 시 전체

**Response 204**

---

### 5.5 반복 회차 예외(EXDATE) 추가 — `POST /recurrences/:id/exceptions` 🔐

**Request**
```json
{
  "excludedDate": "2026-05-25",
  "reason": "공휴일"
}
```

**Response 201**
```json
{
  "data": {
    "id": "uuid",
    "excludedDate": "2026-05-25",
    "deletedBookingId": "uuid"
  }
}
```

**비고**
- 해당 일자의 Booking 자동 소프트 삭제
- `DELETE /bookings/:id?scope=instance`와 동일 효과 — 클라이언트가 편한 쪽 사용

---

## 6. 관리자 예외 신청 (Exception Request)

### 6.1 예외 신청 — `POST /exception-requests` 🔐

**Request**
```json
{
  "roomId": "uuid",
  "title": "외부 손님 종일 워크샵",
  "startAt": "2026-04-30T09:00:00.000Z",
  "endAt": "2026-04-30T18:00:00.000Z",
  "reason": "외부 컨설팅 업체 종일 워크샵으로 9시간 필요합니다."
}
```

**Response 201**
```json
{
  "data": {
    "id": "uuid",
    "status": "PENDING",
    "createdAt": "..."
  }
}
```

**검증**
- 4시간 초과 또는 과거 시점일 때만 신청 의미 있음 (4시간 이내 + 미래는 일반 예약 사용 안내)
- 신청 시점 충돌 검증 (참고용 — 승인 시점에 재검증)

**에러**
- `EXCEPTION_NOT_REQUIRED` (400) — 일반 예약으로 가능한 시간

---

### 6.2 내 예외 신청 목록 — `GET /exception-requests/me` 🔐

**Query**
- `status`: 필터 (선택)
- `page`, `limit`: 페이지네이션

**Response 200** — 신청 목록

---

### 6.3 예외 신청 취소 — `POST /exception-requests/:id/cancel` 🔐

**규칙**
- PENDING 상태만 취소 가능
- 본인만 취소 가능

**Response 200**

**에러**
- `INVALID_STATUS_TRANSITION` (409)

---

### 6.4 전체 예외 신청 목록 — `GET /admin/exception-requests` 👑

**Query**
- `status`: 필터 (기본 PENDING)
- `userId`: 신청자 필터
- `page`, `limit`

**Response 200** — 신청 목록 (신청자 정보 포함)

---

### 6.5 예외 신청 승인 — `POST /admin/exception-requests/:id/approve` 👑

**Response 200**
```json
{
  "data": {
    "id": "uuid",
    "status": "APPROVED",
    "bookingId": "uuid",
    "reviewedAt": "..."
  }
}
```

**검증**
- 트랜잭션 내에서 시간 충돌 재검증 → 충돌 시 승인 실패
- 승인 시 Booking 자동 생성 (`createdByAdmin: true`)
- AuditLog 기록

**에러**
- `INVALID_STATUS_TRANSITION` (409) — 이미 처리됨
- `BOOKING_TIME_CONFLICT` (409) — 승인 시점에 다른 예약 존재

---

### 6.6 예외 신청 반려 — `POST /admin/exception-requests/:id/reject` 👑

**Request**
```json
{
  "reviewComment": "회의실 사용 사유가 명확하지 않습니다."
}
```

**Response 200**

**검증**
- `reviewComment` 필수
- AuditLog 기록

---

### 6.7 관리자 직접 예약 — `POST /admin/bookings` 👑

**Request** — `POST /bookings`와 동일 + `userId` 추가
```json
{
  "userId": "예약 대상 사용자 uuid",
  "roomId": "uuid",
  "title": "...",
  "startAt": "...",
  "endAt": "..."
}
```

**규칙**
- 4시간 초과, 과거 시점 모두 허용
- `createdByAdmin: true`로 저장
- AuditLog 기록

**Response 201**

---

## 7. 사용자 관리 (Admin)

### 7.1 사용자 목록 — `GET /admin/users` 👑

**Query**
- `search`: 이메일/이름 부분 검색
- `role`, `status`: 필터
- `page`, `limit`

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "name": "홍길동",
      "department": "개발팀",
      "role": "USER",
      "status": "ACTIVE",
      "lastLoginAt": "...",
      "createdAt": "..."
    }
  ],
  "meta": { ... }
}
```

---

### 7.2 사용자 상세 — `GET /admin/users/:id` 👑

**Response 200** — 단일 사용자 객체

---

### 7.3 사용자 역할 변경 — `PATCH /admin/users/:id/role` 👑

**Request**
```json
{
  "role": "ADMIN"
}
```

**Response 200**

**검증**
- 마지막 ADMIN 강등 차단 (PRD AUTH-018)

**에러**
- `LAST_ADMIN_PROTECTION` (409)

---

### 7.4 사용자 잠금 해제 — `POST /admin/users/:id/unlock` 👑

**Response 204**

---

### 7.5 사용자 삭제 — `DELETE /admin/users/:id` 👑

**규칙**
- 소프트 삭제 (`status: DELETED`)
- 미래 예약은 모두 자동 취소
- 마지막 ADMIN 삭제 차단

**Response 204**

---

## 8. 감사 로그 (Audit Log)

### 8.1 감사 로그 조회 — `GET /admin/audit-logs` 👑

**Query**
- `actorId`, `targetType`, `targetId`, `action`
- `from`, `to`: 시간 범위
- `page`, `limit`

**Response 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "actor": { "id": "...", "name": "..." },
      "action": "EXCEPTION_APPROVED",
      "targetType": "EXCEPTION_REQUEST",
      "targetId": "uuid",
      "payload": { ... },
      "ipAddress": "...",
      "createdAt": "..."
    }
  ],
  "meta": { ... }
}
```

---

## 9. Rate Limiting

| 엔드포인트 | 제한 | 단위 |
|---|---|---|
| `POST /auth/login` | 10회/분 | IP |
| `POST /auth/signup` | 5회/분 | IP |
| `POST /auth/resend-code` | 1회/60초 | 이메일 |
| `POST /auth/password-reset/request` | 3회/시간 | 이메일 |
| 그 외 인증 필요 엔드포인트 | 100회/분 | 사용자 |
| 전체 | 500회/분 | IP |

초과 시 `429 RATE_LIMITED` + `Retry-After` 헤더.

---

## 10. 엔드포인트 요약 표

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| POST | `/auth/signup` | 🔓 | 회원가입 |
| POST | `/auth/verify-email` | 🔓 | 이메일 인증 |
| POST | `/auth/resend-code` | 🔓 | 인증 코드 재발송 |
| POST | `/auth/login` | 🔓 | 로그인 |
| POST | `/auth/refresh` | 🔓 | 토큰 갱신 |
| POST | `/auth/logout` | 🔐 | 로그아웃 |
| POST | `/auth/password-reset/request` | 🔓 | 비밀번호 재설정 요청 |
| POST | `/auth/password-reset/confirm` | 🔓 | 비밀번호 재설정 |
| GET | `/auth/me` | 🔐 | 내 정보 |
| PATCH | `/auth/me` | 🔐 | 내 정보 수정 |
| POST | `/auth/me/password` | 🔐 | 비밀번호 변경 |
| GET | `/rooms` | 🔐 | 회의실 목록 |
| GET | `/rooms/:id` | 🔐 | 회의실 상세 |
| POST | `/rooms` | 👑 | 회의실 생성 |
| PATCH | `/rooms/:id` | 👑 | 회의실 수정 |
| DELETE | `/rooms/:id` | 👑 | 회의실 삭제 |
| GET | `/bookings` | 🔐 | 예약 목록 |
| GET | `/bookings/:id` | 🔐 | 예약 상세 |
| POST | `/bookings` | 🔐 | 예약 생성 |
| PATCH | `/bookings/:id` | 🔐 | 예약 수정 |
| DELETE | `/bookings/:id` | 🔐 | 예약 삭제 |
| POST | `/recurrences` | 🔐 | 반복 예약 생성 |
| GET | `/recurrences/:id` | 🔐 | 반복 시리즈 조회 |
| PATCH | `/recurrences/:id` | 🔐 | 반복 시리즈 수정 |
| DELETE | `/recurrences/:id` | 🔐 | 반복 시리즈 삭제 |
| POST | `/recurrences/:id/exceptions` | 🔐 | EXDATE 추가 |
| POST | `/exception-requests` | 🔐 | 예외 신청 |
| GET | `/exception-requests/me` | 🔐 | 내 신청 목록 |
| POST | `/exception-requests/:id/cancel` | 🔐 | 신청 취소 |
| GET | `/admin/exception-requests` | 👑 | 전체 신청 목록 |
| POST | `/admin/exception-requests/:id/approve` | 👑 | 승인 |
| POST | `/admin/exception-requests/:id/reject` | 👑 | 반려 |
| POST | `/admin/bookings` | 👑 | 관리자 직접 예약 |
| GET | `/admin/users` | 👑 | 사용자 목록 |
| GET | `/admin/users/:id` | 👑 | 사용자 상세 |
| PATCH | `/admin/users/:id/role` | 👑 | 역할 변경 |
| POST | `/admin/users/:id/unlock` | 👑 | 잠금 해제 |
| DELETE | `/admin/users/:id` | 👑 | 사용자 삭제 |
| GET | `/admin/audit-logs` | 👑 | 감사 로그 |

---

## 11. 변경 이력

| 버전 | 일자 | 작성자 | 변경 내용 |
|---|---|---|---|
| 1.0 | 2026-04-23 | 데릭 + Claude | 초기 작성 |
