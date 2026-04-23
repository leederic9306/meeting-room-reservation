-- =============================================================================
-- 회의실 예약 시스템 - 추가 제약 마이그레이션
-- =============================================================================
-- 이 파일은 Prisma가 자동 생성한 마이그레이션 이후에 적용해야 하는
-- PostgreSQL 고급 제약(EXCLUDE, CHECK)을 정의합니다.
--
-- 적용 방법:
--   1. `prisma migrate dev --name init` 실행하여 기본 스키마 마이그레이션 생성
--   2. 생성된 마이그레이션 폴더의 migration.sql 파일 끝에 이 파일 내용 추가
--   3. 또는 별도 마이그레이션으로 `prisma migrate dev --create-only --name add_constraints`
--      후 빈 파일에 이 내용 붙여넣고 `prisma migrate dev` 재실행
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. btree_gist 확장 활성화 (EXCLUDE 제약에 필요)
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;


-- -----------------------------------------------------------------------------
-- 2. Booking 테이블 - 시간 유효성 CHECK 제약
-- -----------------------------------------------------------------------------

-- 종료 시간이 시작 시간보다 이후
ALTER TABLE booking
  ADD CONSTRAINT chk_booking_time_order
  CHECK (end_at > start_at);

-- 시작 시간은 15분 단위 (분이 0/15/30/45)
ALTER TABLE booking
  ADD CONSTRAINT chk_booking_start_quarter
  CHECK (
    EXTRACT(MINUTE FROM start_at)::int IN (0, 15, 30, 45)
    AND EXTRACT(SECOND FROM start_at) = 0
  );

-- 종료 시간도 15분 단위
ALTER TABLE booking
  ADD CONSTRAINT chk_booking_end_quarter
  CHECK (
    EXTRACT(MINUTE FROM end_at)::int IN (0, 15, 30, 45)
    AND EXTRACT(SECOND FROM end_at) = 0
  );

-- 4시간 이내 (관리자 예외 등록은 우회)
ALTER TABLE booking
  ADD CONSTRAINT chk_booking_max_duration
  CHECK (
    created_by_admin = true
    OR end_at - start_at <= interval '4 hours'
  );


-- -----------------------------------------------------------------------------
-- 3. Booking 테이블 - 시간 겹침 EXCLUDE 제약 (가장 중요)
-- -----------------------------------------------------------------------------
-- 동일 회의실 내에서 시간 범위가 겹치는 예약을 DB 레벨에서 차단
-- '[)' = 시작 포함, 종료 미포함 → 9:00-10:00과 10:00-11:00은 겹치지 않음
-- WHERE 절로 소프트 삭제된 행은 제외
ALTER TABLE booking
  ADD CONSTRAINT excl_booking_no_overlap
  EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (deleted_at IS NULL);


-- -----------------------------------------------------------------------------
-- 4. RecurrenceRule 테이블 - 회차 길이 및 시리즈 길이 CHECK 제약
-- -----------------------------------------------------------------------------

-- 회차 길이는 15의 배수, 0 초과 240 이하
ALTER TABLE recurrence_rule
  ADD CONSTRAINT chk_recurrence_duration
  CHECK (
    duration_minutes > 0
    AND duration_minutes <= 240
    AND duration_minutes % 15 = 0
  );

-- 시리즈 종료는 시작으로부터 1년 이내
ALTER TABLE recurrence_rule
  ADD CONSTRAINT chk_recurrence_until_max
  CHECK (until_at <= start_at + interval '1 year');

-- 종료가 시작 이후
ALTER TABLE recurrence_rule
  ADD CONSTRAINT chk_recurrence_time_order
  CHECK (until_at >= start_at);


-- -----------------------------------------------------------------------------
-- 5. ExceptionRequest 테이블 - 시간 유효성 CHECK 제약
-- -----------------------------------------------------------------------------

ALTER TABLE exception_request
  ADD CONSTRAINT chk_exception_request_time_order
  CHECK (end_at > start_at);


-- -----------------------------------------------------------------------------
-- 6. 부분 인덱스 추가 (Prisma에서 표현 어려운 부분)
-- -----------------------------------------------------------------------------

-- 활성 예약만 대상으로 하는 부분 인덱스 (캘린더 조회 성능)
CREATE INDEX IF NOT EXISTS idx_booking_active_room_time
  ON booking (room_id, start_at, end_at)
  WHERE deleted_at IS NULL;

-- 활성 미인증 코드만 대상으로 하는 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_email_verification_user_active
  ON email_verification (user_id)
  WHERE verified_at IS NULL;

-- 진행 중 반복 시리즈 조회용
CREATE INDEX IF NOT EXISTS idx_recurrence_rule_active
  ON recurrence_rule (room_id, start_at, until_at);
