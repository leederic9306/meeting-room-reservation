# 테스트 케이스 — 사내 회의실 예약 시스템

> **문서 정보**
> - 버전: 1.0
> - 작성일: 2026-04-23
> - 대상: 백엔드(Jest + Supertest), 프런트엔드(Vitest + React Testing Library), E2E(Playwright)

---

## 0. 테스트 전략

### 0.1 테스트 피라미드

```
        /\         E2E 테스트 (Playwright)
       /  \        - 핵심 사용자 흐름만
      /────\       - 5~10개 시나리오
     /      \
    /        \     통합 테스트 (Supertest, MSW)
   /──────────\    - API 엔드포인트별
  /            \   - 50~100개
 /              \
/────────────────\  단위 테스트 (Jest, Vitest)
                    - 비즈니스 로직, 검증, 유틸
                    - 200~400개
```

### 0.2 도구

| 레이어 | 도구 |
|---|---|
| 백엔드 단위 | Jest |
| 백엔드 통합 | Jest + Supertest + Testcontainers (PostgreSQL) |
| 프런트엔드 단위 | Vitest + React Testing Library |
| 프런트엔드 통합 | Vitest + MSW (API 모킹) |
| E2E | Playwright |
| 부하 | k6 (선택) |

### 0.3 명명 규칙

```
[모듈/기능] - [상황] - [기대 결과]

예시:
- BookingService.create - 15분 단위가 아닌 시간 - BadRequestException 발생
- POST /bookings - 시간 충돌 - 409 BOOKING_TIME_CONFLICT 응답
- 예약 생성 모달 - 4시간 초과 입력 - 예외 신청 버튼 노출
```

### 0.4 자동 실행

- **로컬**: `pnpm test --watch`로 변경 파일 관련 테스트 자동 실행
- **pre-push hook**: 전체 단위 테스트 실행 (Husky)
- **CI**: 모든 PR에 단위 + 통합 + E2E 자동 실행
- **커버리지 게이트**:
  - 핵심 모듈 (auth, booking, recurrence, exception-request): 90%
  - 그 외: 70%
  - 미달 시 CI 실패

---

## 1. 인증 (Auth)

### 1.1 회원가입 (signup)

**단위 테스트 — AuthService.signup**

| ID | 케이스 | 기대 결과 |
|---|---|---|
| AUTH-T-001 | 정상 입력 | User 생성(status=PENDING), EmailVerification 생성, 코드 메일 발송 |
| AUTH-T-002 | 이메일 중복 (ACTIVE) | `EMAIL_ALREADY_EXISTS` 에러 |
| AUTH-T-003 | 이메일 중복 (PENDING, 24h 미경과) | `EMAIL_ALREADY_EXISTS` 에러 |
| AUTH-T-004 | 이메일 중복 (PENDING, 24h 경과) | 기존 PENDING 삭제 후 재생성 |
| AUTH-T-005 | 비밀번호 7자 | `WEAK_PASSWORD` 에러 |
| AUTH-T-006 | 비밀번호 영문만 | `WEAK_PASSWORD` 에러 |
| AUTH-T-007 | 비밀번호 영문+숫자 (특수문자 누락) | `WEAK_PASSWORD` 에러 |
| AUTH-T-008 | 정상 비밀번호 | argon2 해시로 저장 (평문 저장 안 됨 검증) |
| AUTH-T-009 | name 51자 | `VALIDATION_ERROR` |
| AUTH-T-010 | 선택 필드 미입력 | 정상 생성 |

**통합 테스트 — POST /auth/signup**

| ID | 케이스 | 기대 결과 |
|---|---|---|
| AUTH-I-001 | 정상 가입 | 201 + verificationRequired:true |
| AUTH-I-002 | 응답에 password 또는 code 누출 없음 | 응답 JSON에 해당 필드 없음 검증 |
| AUTH-I-003 | 동일 IP 5회/분 초과 | 429 RATE_LIMITED |
| AUTH-I-004 | MailHog에 메일 도착 | 메일 수신 확인 (테스트 환경에서) |

### 1.2 이메일 인증 (verify-email)

**단위 테스트**

| ID | 케이스 | 기대 결과 |
|---|---|---|
| AUTH-T-011 | 정상 코드 | verifiedAt 설정, User.status=ACTIVE |
| AUTH-T-012 | 잘못된 코드 (1회) | attemptCount=1, `INVALID_CODE` |
| AUTH-T-013 | 잘못된 코드 5회 | 코드 무효화, `CODE_ATTEMPTS_EXCEEDED` |
| AUTH-T-014 | 만료된 코드 (10분+1초) | `CODE_EXPIRED` |
| AUTH-T-015 | 이미 인증된 코드 재사용 | `ALREADY_VERIFIED` |
| AUTH-T-016 | 평문 모드에서 코드 비교 | 평문 직접 비교 |
| AUTH-T-017 | 해시 모드에서 코드 비교 | SHA-256 해시 비교 |
| AUTH-T-018 | 인증 성공 시 동일 사용자의 다른 미인증 코드도 모두 폐기 | 다른 verification.verifiedAt도 설정 |

**통합 테스트**

| ID | 케이스 | 기대 결과 |
|---|---|---|
| AUTH-I-005 | 인증 성공 → JWT 발급 | 200 + accessToken + Set-Cookie refresh_token |
| AUTH-I-006 | 미인증 상태로 로그인 시도 | 403 EMAIL_NOT_VERIFIED |

### 1.3 인증 코드 재발송 (resend-code)

| ID | 케이스 | 기대 결과 |
|---|---|---|
| AUTH-T-019 | 60초 내 재요청 | `RESEND_COOLDOWN`, retryAfterSeconds 포함 |
| AUTH-T-020 | 60초 경과 후 재요청 | 새 코드 발급, 기존 코드 무효화 |
| AUTH-T-021 | 이미 인증된 사용자 재요청 | `ALREADY_VERIFIED` |
| AUTH-T-022 | 존재하지 않는 이메일 | `USER_NOT_FOUND` |

### 1.4 로그인 (login)

| ID | 케이스 | 기대 결과 |
|---|---|---|
| AUTH-T-023 | 정상 로그인 | Access + Refresh 발급, lastLoginAt 갱신 |
| AUTH-T-024 | 비밀번호 틀림 (1회) | `INVALID_CREDENTIALS`, LoginAttempt 기록 |
| AUTH-T-025 | 비밀번호 틀림 (5회) | User.lockedUntil = now+30분, `ACCOUNT_LOCKED` |
| AUTH-T-026 | 잠금 상태 로그인 시도 | `ACCOUNT_LOCKED`, lockedUntil 응답 |
| AUTH-T-027 | 잠금 시간 경과 후 로그인 | 정상 로그인, lockedUntil null |
| AUTH-T-028 | 존재하지 않는 이메일 | `INVALID_CREDENTIALS` (USER_NOT_FOUND 아님 — 계정 열거 방지) |
| AUTH-T-029 | DELETED 상태 사용자 | `INVALID_CREDENTIALS` |
| AUTH-T-030 | 로그인 성공 시 응답에 password_hash 없음 | 검증 |

### 1.5 토큰 갱신 (refresh)

| ID | 케이스 | 기대 결과 |
|---|---|---|
| AUTH-T-031 | 정상 Refresh | 새 Access + 새 Refresh (rotation), 기존 Refresh revoke |
| AUTH-T-032 | 만료된 Refresh | `REFRESH_TOKEN_EXPIRED` |
| AUTH-T-033 | revoke된 Refresh 재사용 (도난 시나리오) | `INVALID_REFRESH_TOKEN`, 해당 사용자 모든 Refresh revoke |
| AUTH-T-034 | 존재하지 않는 Refresh | `INVALID_REFRESH_TOKEN` |

### 1.6 비밀번호 재설정

| ID | 케이스 | 기대 결과 |
|---|---|---|
| AUTH-T-035 | 존재하는 이메일로 요청 | PasswordReset 생성, 메일 발송, 200 |
| AUTH-T-036 | 존재하지 않는 이메일로 요청 | 200 (계정 열거 방지) |
| AUTH-T-037 | 정상 토큰으로 비번 변경 | 비번 갱신, 모든 RefreshToken revoke |
| AUTH-T-038 | 만료된 토큰 | `RESET_TOKEN_EXPIRED` |
| AUTH-T-039 | 사용된 토큰 재사용 | `INVALID_RESET_TOKEN` |
| AUTH-T-040 | 약한 새 비밀번호 | `WEAK_PASSWORD` |

### 1.7 권한 (RolesGuard)

| ID | 케이스 | 기대 결과 |
|---|---|---|
| AUTH-T-041 | USER가 ADMIN 엔드포인트 접근 | 403 FORBIDDEN |
| AUTH-T-042 | ADMIN이 ADMIN 엔드포인트 접근 | 정상 |
| AUTH-T-043 | 토큰 없이 보호 엔드포인트 접근 | 401 UNAUTHORIZED |
| AUTH-T-044 | 만료된 Access Token | 401 UNAUTHORIZED |

### 1.8 마지막 ADMIN 보호

| ID | 케이스 | 기대 결과 |
|---|---|---|
| AUTH-T-045 | 마지막 ADMIN을 USER로 강등 시도 | `LAST_ADMIN_PROTECTION` |
| AUTH-T-046 | 마지막 ADMIN 삭제 시도 | `LAST_ADMIN_PROTECTION` |
| AUTH-T-047 | 2명 중 1명 강등 | 정상 |

---

## 2. 회의실 (Room)

### 2.1 회의실 CRUD (관리자)

| ID | 케이스 | 기대 결과 |
|---|---|---|
| ROOM-T-001 | 정상 생성 | 201, displayOrder 자동 부여 |
| ROOM-T-002 | 이름 중복 | `ROOM_NAME_DUPLICATE` |
| ROOM-T-003 | 11번째 생성 시도 | `ROOM_LIMIT_EXCEEDED` |
| ROOM-T-004 | 비활성화 (isActive=false) | 정상, 기존 예약 영향 없음 |
| ROOM-T-005 | 비활성 회의실에 신규 예약 시도 | `ROOM_INACTIVE` |
| ROOM-T-006 | 미래 예약 있는 회의실 삭제 | `ROOM_HAS_FUTURE_BOOKINGS` |
| ROOM-T-007 | 모든 예약 만료된 회의실 삭제 | 정상 |
| ROOM-T-008 | USER가 회의실 생성 시도 | 403 |

### 2.2 회의실 조회

| ID | 케이스 | 기대 결과 |
|---|---|---|
| ROOM-T-009 | USER 조회 — includeInactive 무시 | 활성 회의실만 |
| ROOM-T-010 | ADMIN 조회 — includeInactive=true | 전체 |
| ROOM-T-011 | displayOrder 정렬 | 오름차순 정렬 |

---

## 3. 예약 (Booking) — 핵심

### 3.1 시간 검증

| ID | 케이스 | 기대 결과 |
|---|---|---|
| BOOK-T-001 | 9:00-10:00 (정시) | 정상 |
| BOOK-T-002 | 9:15-9:45 (15분 단위) | 정상 |
| BOOK-T-003 | 9:00-9:10 (10분 단위) | `BOOKING_TIME_NOT_QUARTER` |
| BOOK-T-004 | 9:00-9:01 (분 단위 X) | `BOOKING_TIME_NOT_QUARTER` |
| BOOK-T-005 | 9:00:30 (초 포함) | `BOOKING_TIME_NOT_QUARTER` |
| BOOK-T-006 | 시작=종료 | `INVALID_TIME_RANGE` |
| BOOK-T-007 | 시작 > 종료 | `INVALID_TIME_RANGE` |
| BOOK-T-008 | 어제 시점 | `BOOKING_TIME_PAST` |
| BOOK-T-009 | 1분 전 시작 | `BOOKING_TIME_PAST` |
| BOOK-T-010 | 정확히 4시간 (예: 9:00-13:00) | 정상 |
| BOOK-T-011 | 4시간 1분 (9:00-13:01) → 사실 15분 단위 위반이므로 4:15시간으로 검증 | `BOOKING_DURATION_EXCEEDED` |
| BOOK-T-012 | 4:15시간 (9:00-13:15) | `BOOKING_DURATION_EXCEEDED` |

### 3.2 충돌 검증 (DB EXCLUDE 제약)

| ID | 케이스 | 기대 결과 |
|---|---|---|
| BOOK-T-013 | 동일 시간 동일 회의실 | `BOOKING_TIME_CONFLICT` |
| BOOK-T-014 | 부분 겹침 (9:00-10:00 vs 9:30-10:30) | `BOOKING_TIME_CONFLICT` |
| BOOK-T-015 | 인접 (9:00-10:00 vs 10:00-11:00) | 정상 (`[)` 범위) |
| BOOK-T-016 | 동일 시간 다른 회의실 | 정상 |
| BOOK-T-017 | 소프트 삭제된 예약과 동일 시간 | 정상 (deleted_at IS NULL 조건) |
| BOOK-T-018 | 동시에 두 트랜잭션 INSERT | 한쪽만 성공 (race condition 방지) |
| BOOK-T-019 | 개인이 동일 회의실 인접 2회 | 정상 (BOOK-010 규칙) |

### 3.3 예약 수정/삭제 권한

| ID | 케이스 | 기대 결과 |
|---|---|---|
| BOOK-T-020 | 본인 예약 수정 | 정상 |
| BOOK-T-021 | 타인 예약 수정 (USER) | 403 BOOKING_OWNERSHIP_REQUIRED |
| BOOK-T-022 | 타인 예약 수정 (ADMIN) | 정상 |
| BOOK-T-023 | 시작 시간 이후 예약 수정 (USER) | 403 BOOKING_PAST_NOT_EDITABLE |
| BOOK-T-024 | 시작 시간 이후 예약 수정 (ADMIN) | 정상 |
| BOOK-T-025 | 본인 예약 삭제 → 소프트 삭제 | deletedAt 설정, 캘린더에서 사라짐 |
| BOOK-T-026 | 시작 시간 이후 예약 삭제 (USER) | 403 |

### 3.4 캘린더 조회

| ID | 케이스 | 기대 결과 |
|---|---|---|
| BOOK-T-027 | 1주 조회 | 해당 범위 예약만 반환 |
| BOOK-T-028 | 31일 조회 | 정상 |
| BOOK-T-029 | 32일 조회 | `TIME_RANGE_TOO_LARGE` |
| BOOK-T-030 | from > to | `INVALID_TIME_RANGE` |
| BOOK-T-031 | roomId 필터 | 해당 회의실만 |
| BOOK-T-032 | 본인 예약 isMine=true | 응답 검증 |
| BOOK-T-033 | 소프트 삭제된 예약 제외 | 응답에 미포함 |

---

## 4. 반복 예약 (Recurrence)

### 4.1 RRULE 펼침

| ID | 케이스 | 기대 결과 |
|---|---|---|
| RECUR-T-001 | `FREQ=DAILY;COUNT=7` | 7회 회차 생성 |
| RECUR-T-002 | `FREQ=WEEKLY;BYDAY=MO;COUNT=12` | 12회, 모두 월요일 |
| RECUR-T-003 | `FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10` | 10회, 월/수/금 |
| RECUR-T-004 | `FREQ=MONTHLY;BYDAY=-1FR;COUNT=6` | 6회, 매월 마지막 금요일 |
| RECUR-T-005 | `FREQ=MONTHLY;BYDAY=1MO;COUNT=6` | 6회, 매월 첫째 월요일 |
| RECUR-T-006 | UNTIL이 1년 초과 | 1년에서 자동 절단 |
| RECUR-T-007 | COUNT 없고 UNTIL 없음 (무기한) | 1년에서 자동 절단 |
| RECUR-T-008 | 잘못된 RRULE 문법 | `INVALID_RRULE` |

### 4.2 시리즈 생성

| ID | 케이스 | 기대 결과 |
|---|---|---|
| RECUR-T-009 | 정상 시리즈 | RecurrenceRule + 회차들 Booking 생성, recurrence_index 0부터 |
| RECUR-T-010 | 회차당 4시간 초과 | `BOOKING_DURATION_EXCEEDED` (시리즈 자체 거부) |
| RECUR-T-011 | 첫 회차 과거 | 과거 회차 skip, 미래만 생성 |
| RECUR-T-012 | 일부 회차 충돌 | 충돌 skip, 나머지 정상, 응답에 skipped 포함 |
| RECUR-T-013 | 모든 회차 충돌 | `ALL_INSTANCES_FAILED` |
| RECUR-T-014 | duration_minutes가 15 배수 아님 | `VALIDATION_ERROR` |

### 4.3 EXDATE (예외 일자)

| ID | 케이스 | 기대 결과 |
|---|---|---|
| RECUR-T-015 | EXDATE 추가 | RecurrenceException 생성, 해당 Booking 소프트 삭제 |
| RECUR-T-016 | 동일 EXDATE 중복 추가 | UNIQUE 제약 — `CONFLICT` |
| RECUR-T-017 | 시리즈에 없는 일자에 EXDATE 추가 | `VALIDATION_ERROR` |

### 4.4 회차 단위 수정/삭제 (scope)

| ID | 케이스 | 기대 결과 |
|---|---|---|
| RECUR-T-018 | scope=instance 삭제 | 해당 Booking 소프트 삭제 + EXDATE 추가 |
| RECUR-T-019 | scope=following 삭제 | 이 회차부터 미래 모두 삭제 + 시리즈 untilAt 단축 |
| RECUR-T-020 | scope=series 삭제 | 모든 회차 + RecurrenceRule 삭제 |
| RECUR-T-021 | 단일 예약(recurrenceId=null)에 scope=series | scope 무시, 단일 삭제 |

### 4.5 회차 수정 시 시리즈 분리

| ID | 케이스 | 기대 결과 |
|---|---|---|
| RECUR-T-022 | 반복 회차의 시간 변경 | recurrenceId=null, EXDATE 추가, detachedFromSeries:true |
| RECUR-T-023 | 반복 회차의 제목만 변경 | 분리 (정책 일관성) 또는 인스턴스만 변경 (구현 결정) |

### 4.6 시리즈 메타 수정

| ID | 케이스 | 기대 결과 |
|---|---|---|
| RECUR-T-024 | title 수정 → 모든 미래 회차 반영 | 모든 회차 title 동기 |
| RECUR-T-025 | RRULE 변경 시도 | `VALIDATION_ERROR` (PATCH에서 차단) |

---

## 5. 관리자 예외 신청 (ExceptionRequest)

### 5.1 신청 검증

| ID | 케이스 | 기대 결과 |
|---|---|---|
| EXCEPT-T-001 | 4시간 초과 신청 | 정상 PENDING |
| EXCEPT-T-002 | 과거 시점 신청 | 정상 PENDING |
| EXCEPT-T-003 | 4시간 이내 + 미래 신청 | `EXCEPTION_NOT_REQUIRED` |
| EXCEPT-T-004 | 사유 미입력 | `VALIDATION_ERROR` |
| EXCEPT-T-005 | 신청 시점 충돌 (참고용) | 정상 생성, 응답에 충돌 정보 |

### 5.2 신청 상태 전이

| ID | 케이스 | 기대 결과 |
|---|---|---|
| EXCEPT-T-006 | PENDING → 본인 취소 | CANCELLED |
| EXCEPT-T-007 | APPROVED → 본인 취소 시도 | `INVALID_STATUS_TRANSITION` |
| EXCEPT-T-008 | 타인 신청 취소 시도 | 403 |
| EXCEPT-T-009 | 이미 처리된 신청 재승인 시도 | `INVALID_STATUS_TRANSITION` |

### 5.3 관리자 승인

| ID | 케이스 | 기대 결과 |
|---|---|---|
| EXCEPT-T-010 | 정상 승인 | APPROVED, Booking 생성(created_by_admin=true), 메일 발송, AuditLog 기록 |
| EXCEPT-T-011 | 승인 시점 충돌 (PENDING 사이 다른 예약 들어옴) | `BOOKING_TIME_CONFLICT`, 승인 차단 |
| EXCEPT-T-012 | 승인 트랜잭션 내 동시 두 승인 시도 | 한쪽만 성공 (FOR UPDATE 잠금) |
| EXCEPT-T-013 | USER가 승인 시도 | 403 |

### 5.4 관리자 반려

| ID | 케이스 | 기대 결과 |
|---|---|---|
| EXCEPT-T-014 | reviewComment 포함 반려 | REJECTED, 메일 발송, AuditLog |
| EXCEPT-T-015 | reviewComment 누락 | `VALIDATION_ERROR` |

### 5.5 관리자 직접 예약

| ID | 케이스 | 기대 결과 |
|---|---|---|
| EXCEPT-T-016 | 5시간 직접 예약 | 정상 (created_by_admin=true) |
| EXCEPT-T-017 | 과거 시점 직접 예약 | 정상 |
| EXCEPT-T-018 | 다른 사용자 명의로 예약 | 정상, userId 검증 |
| EXCEPT-T-019 | 충돌하는 시간에 직접 예약 시도 | `BOOKING_TIME_CONFLICT` (관리자도 충돌은 차단) |

---

## 6. 감사 로그 (AuditLog)

| ID | 케이스 | 기대 결과 |
|---|---|---|
| AUDIT-T-001 | 역할 변경 시 자동 기록 | action=USER_ROLE_CHANGED, payload에 before/after |
| AUDIT-T-002 | 예외 승인 시 자동 기록 | action=EXCEPTION_APPROVED, payload에 신청 정보 |
| AUDIT-T-003 | 관리자 직접 예약 시 자동 기록 | action=BOOKING_BY_ADMIN |
| AUDIT-T-004 | 회의실 생성/수정/삭제 기록 | 각각 ROOM_CREATED, ROOM_UPDATED, ROOM_DELETED |
| AUDIT-T-005 | actor가 시스템(cron)이면 actor_id=null | 정리 작업 시 |
| AUDIT-T-006 | USER가 감사 로그 조회 시도 | 403 |
| AUDIT-T-007 | ADMIN이 필터로 조회 | targetType, actorId 필터 정상 동작 |

---

## 7. 데이터 정리 (Cron)

| ID | 케이스 | 기대 결과 |
|---|---|---|
| CRON-T-001 | 24시간 미인증 User 삭제 | status=PENDING이고 createdAt < now-24h만 삭제 |
| CRON-T-002 | ACTIVE User는 영향 없음 | 변경 없음 |
| CRON-T-003 | 만료된 EmailVerification 정리 (7일 이상) | 삭제 |
| CRON-T-004 | 만료된 RefreshToken 정리 (30일) | 삭제 |
| CRON-T-005 | 90일 이상 LoginAttempt 정리 | 삭제 |
| CRON-T-006 | 정리 작업도 AuditLog 기록 | actor_id=null로 기록 |

---

## 8. 프런트엔드 컴포넌트

### 8.1 인증 화면

| ID | 케이스 | 기대 결과 |
|---|---|---|
| FE-T-001 | 회원가입 폼 — 비번 부족 입력 | 인라인 에러 표시 |
| FE-T-002 | 회원가입 성공 → 인증 코드 화면으로 이동 | 라우팅 검증 |
| FE-T-003 | 인증 코드 화면 — 60초 카운트다운 | 카운트다운 표시 + 종료 후 재전송 활성화 |
| FE-T-004 | 인증 코드 6자리 자동 포커스 이동 | 한 자리 입력 시 다음 칸으로 |
| FE-T-005 | 로그인 실패 → 토스트 표시 | 에러 메시지 표시 |
| FE-T-006 | 로그인 성공 → /dashboard 이동 | 라우팅 + auth store 업데이트 |
| FE-T-007 | 401 응답 → 자동 refresh → 재시도 | 인터셉터 동작 |
| FE-T-008 | refresh 실패 → /login 리다이렉트 | 검증 |

### 8.2 캘린더

| ID | 케이스 | 기대 결과 |
|---|---|---|
| FE-T-009 | 빈 슬롯 클릭 → 모달 열림 | 시작 시간 자동 입력 |
| FE-T-010 | 본인 예약 클릭 → 수정 가능 모달 | 수정/삭제 버튼 노출 |
| FE-T-011 | 타인 예약 클릭 → 읽기 전용 모달 | 수정/삭제 버튼 숨김 |
| FE-T-012 | 회의실 필터 변경 → 데이터 갱신 | TanStack Query refetch |
| FE-T-013 | 일/주/월 뷰 전환 | 표시 변경 |
| FE-T-014 | 모바일 — 일 뷰 기본 | viewport에 따라 자동 |

### 8.3 예약 모달

| ID | 케이스 | 기대 결과 |
|---|---|---|
| FE-T-015 | 4시간 초과 입력 → "예외 신청" 버튼 노출 | UI 검증 |
| FE-T-016 | 충돌 응답 → 충돌 정보 표시 | 에러 메시지에 충돌 예약 정보 |
| FE-T-017 | 반복 옵션 활성화 → 주기 선택 UI | 표시 |
| FE-T-018 | 반복 미리보기 — 처음 5개 회차 | 표시 |
| FE-T-019 | 등록 후 충돌 회차 알림 | 모달 표시 |

### 8.4 관리자 페이지

| ID | 케이스 | 기대 결과 |
|---|---|---|
| FE-T-020 | USER가 /admin 접근 | 403 화면 |
| FE-T-021 | 회의실 추가 폼 | 정상 동작 |
| FE-T-022 | 예외 신청 승인 → 캘린더 갱신 | 다른 탭에서도 반영(만료 정책에 따라) |
| FE-T-023 | 마지막 ADMIN 강등 시도 | 에러 표시 |

---

## 9. E2E 시나리오 (Playwright)

핵심 사용자 흐름 5개를 자동 검증.

| ID | 시나리오 |
|---|---|
| E2E-001 | **신규 가입~첫 예약**: 가입 → MailHog 코드 확인 → 인증 → 로그인 → 캘린더 → 예약 생성 → 캘린더 반영 확인 |
| E2E-002 | **반복 예약 + EXDATE**: 매주 12회 반복 등록 → 특정 회차 삭제 → 캘린더에서 해당 회차 사라짐 확인 |
| E2E-003 | **관리자 예외 승인 흐름**: USER가 5시간 신청 → ADMIN이 승인 → 신청자 캘린더에 반영 |
| E2E-004 | **권한 분리**: USER 로그인 → /admin 접근 시 차단 확인 |
| E2E-005 | **충돌 방지**: 두 사용자가 동시에 같은 시간 예약 → 한쪽만 성공 |

---

## 10. 테스트 자동 실행 설정

### 10.1 백엔드 (jest.config.ts)

```ts
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.module.ts',
    '!src/**/*.dto.ts',
    '!src/main.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
    './src/modules/auth/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    './src/modules/booking/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    './src/modules/recurrence/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    './src/modules/exception-request/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
```

### 10.2 프런트엔드 (vitest.config.ts)

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
```

### 10.3 Husky pre-push hook

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

pnpm test --run --silent
```

### 10.4 GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
  push:
    branches: [develop, main]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: meetingroom
          POSTGRES_PASSWORD: testpw
          POSTGRES_DB: meetingroom_test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
      mailhog:
        image: mailhog/mailhog:v1.0.1
        ports: ['1025:1025', '8025:8025']
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:setup    # btree_gist 확장 + 마이그레이션
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test --coverage
      - run: pnpm build
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage
          path: coverage/
```

### 10.5 변경 파일 watch 모드 (개발 시)

```bash
# 백엔드
pnpm --filter backend test --watch

# 프런트엔드
pnpm --filter frontend test --watch
```

---

## 11. 변경 이력

| 버전 | 일자 | 작성자 | 변경 내용 |
|---|---|---|---|
| 1.0 | 2026-04-23 | 데릭 + Claude | 초기 작성 |
