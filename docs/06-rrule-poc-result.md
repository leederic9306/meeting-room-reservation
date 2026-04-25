# RRule PoC 결과 및 시간대 처리 정책

> **문서 정보**
>
> - 버전: 1.1
> - 작성일: 2026-04-25
> - 작성자: leederic9306
> - 관련 PoC: `apps/backend/scripts/rrule-poc.ts`
> - 관련 규칙: CLAUDE.md §7, `.claude/rules/database.md` §8
> - 적용 시점: Phase 4 (Recurrence) 구현 시작 시

---

## 0. 배경

Phase 4(반복 예약)에 앞서 `rrule.js@2.8.1`의 시간대 처리, EXDATE, 1년 절단 동작을 PoC로 검증했다
(`apps/backend/scripts/rrule-poc.ts`). PoC는 두 단계로 진행했다.

1. **초기 탐색 PoC** — TZID 모드 동작, BYMONTHDAY 말일 처리, DST(`America/Los_Angeles`) 영향 등
   라이브러리 가장자리 동작을 확인.
2. **production 패턴 회귀 PoC (현재 스크립트)** — 실제 시스템에서 사용할 4가지 RRULE 패턴
   (매주 월요일 12회 / 격주 화·목 6개월 / 매월 마지막 금요일 / 매월 첫째 주 월요일)을
   각각 (a) 펼침 결과 (b) Asia/Seoul 표시 (c) 1년 절단 (d) EXDATE 제외 4단계로 검증.

초기 탐색에서 다음 두 가지를 식별했다.

1. **rrule v2의 `tzid` 옵션은 시스템 TZ에 따라 결과가 흔들린다.** 같은 RRULE 문자열을 KST 시스템과 UTC
   시스템에서 실행하면 서로 다른 epoch ms를 가진 Date 객체가 반환된다. 결과를 그대로 DB에 저장하면
   환경별로 9시간이 어긋날 수 있다.
2. **rrule.js는 BYMONTHDAY 미존재일·DST 전환에 대한 자동 보정을 수행하지 않는다.** "매월 31일"은 31일
   없는 달을 스킵하며, 09:00 LA wall-time 반복은 DST 진입 후 wall-time이 1시간 시프트된다(UTC 인스턴트
   기준 일정).

본 문서는 위 결과를 바탕으로 한 4가지 정책 결정을 기록한다.

---

## 1. 결정 사항 요약

| #   | 항목                   | 결정                                                                                           |
| --- | ---------------------- | ---------------------------------------------------------------------------------------------- |
| D-1 | DTSTART 저장 형식      | **UTC `Timestamptz(6)`** 단일 컬럼 (별도 tz 컬럼 없음, 현 단계)                                |
| D-2 | rrule.js `tzid` 옵션   | **사용하지 않음.** dtstart는 항상 UTC `Date`로 직접 구성                                       |
| D-3 | 회차 인스턴스 UTC 변환 | 입력 시 `fromZonedTime(wall, 'Asia/Seoul')` → 출력 시 `formatInTimeZone(d, 'Asia/Seoul', ...)` |
| D-4 | DST 영역 사용자 정책   | 현 단계는 **한국 단일 TZ 가정**. 다중 TZ/DST 도입은 별도 PRD로 재논의                          |

---

## 2. D-1. DTSTART 저장 형식 — UTC `Timestamptz(6)`

### 결정

- `RecurrenceRule.dtstart`는 **PostgreSQL `Timestamptz(6)`** 컬럼에 **UTC 인스턴트**로 저장한다.
- 별도의 `tzid` 컬럼은 **현 단계에서 추가하지 않는다** (한국 단일 TZ 가정).
- 회차 펼침 결과인 `Booking.start_at` / `end_at`도 동일 정책(이미 §`02-db-design.md`에 명시).

### 근거

- CLAUDE.md §2.5 / `.claude/rules/database.md` §1: 모든 시간 컬럼은 `Timestamptz(6)` UTC.
- 한국은 DST 미사용으로 KST↔UTC 변환은 항상 9시간 고정. wall time과 UTC instant는 1:1 매핑.
- TZID 컬럼을 추가하면 비교/조회 쿼리가 복잡해지고, 캘린더 충돌 검증(EXCLUDE 제약)이 어려워진다.
- 다중 TZ 요건 발생 시점에 마이그레이션으로 컬럼 추가 가능 (D-4 참조).

### 비결정 사항(미래 검토)

- 다중 TZ 도입 시 `dtstart_tz VARCHAR(32) NOT NULL DEFAULT 'Asia/Seoul'` 추가 검토.
- 그 경우 회차 펼침 시 dtstart_tz 기준으로 wall time을 재해석해야 함.

---

## 3. D-2. rrule.js `tzid` 옵션 — 사용하지 않음

### 결정

- `rrule.js`의 `RRule({ ..., tzid: 'Asia/Seoul' })` 옵션 및 `DTSTART;TZID=...` 형태의 RRULE 문자열은
  **백엔드 코드에서 사용하지 않는다.**
- `dtstart`는 항상 **UTC `Date`** (epoch ms가 실제 UTC 인스턴트인 Date)를 직접 만들어 주입한다.
- iCal 직렬화/역직렬화가 필요한 경우(외부 캘린더 연동 등 향후 작업)에는 별도 어댑터 레이어에서
  TZID를 다루고, 내부 도메인 경계 안쪽에는 항상 UTC만 흐르게 한다.

### 근거 (PoC 결과)

초기 탐색 PoC에서 다음과 같이 확인됨:

- `rrulestr('DTSTART;TZID=Asia/Seoul:20260427T090000\nRRULE:FREQ=DAILY;COUNT=3').all()`
  → KST 시스템에서 epoch ms가 `2026-04-27T09:00:00.000Z` 로 나옴 (기대값 `00:00:00.000Z`와 9h 어긋남).
- 같은 RRULE 문자열을 UTC 시스템에서 실행하면 `00:00:00.000Z`가 나올 가능성이 있어 **환경 의존적**.
- DB에 그대로 저장 시 운영(KST) ↔ CI(UTC) 간 데이터 불일치 위험.

production 패턴 회귀 PoC는 본 결정에 따라 항상 `fromZonedTime`으로 dtstart를 구성하며,
(a) 단계에서 4 패턴 모두 첫 회차 UTC가 기대값과 정확히 일치함을 확인.

### 적용 패턴

```ts
import { datetime, RRule } from 'rrule';
import { fromZonedTime } from 'date-fns-tz';

// ❌ 금지 — TZID 옵션 사용
const bad = new RRule({
  freq: RRule.WEEKLY,
  byweekday: [RRule.MO],
  count: 12,
  dtstart: new Date(...),
  tzid: 'Asia/Seoul', // 사용 금지
});

// ✅ 권장 — 입력 wall time을 미리 UTC Date로 변환 후 dtstart에 주입
const dtstartUtc = fromZonedTime('2026-04-27T09:00:00', 'Asia/Seoul'); // 2026-04-27T00:00:00.000Z
const rule = new RRule({
  freq: RRule.WEEKLY,
  byweekday: [RRule.MO],
  count: 12,
  dtstart: dtstartUtc,
});
```

---

## 4. D-3. 회차 인스턴스 UTC 변환 방식

### 결정

회차 인스턴스 생성/조회 파이프라인은 다음 단방향 흐름을 따른다.

```
[입력] Frontend (KST wall time, ISO string)
          │  e.g., "2026-04-27T09:00:00"
          ▼
[변환] Backend Controller / Service
          │  fromZonedTime(input, 'Asia/Seoul') → UTC Date
          ▼
[저장] RecurrenceRule.dtstart (Timestamptz UTC)
          │
          ▼
[펼침] rrule.all() / rrule.between()
          │  반환 Date는 모두 정상 UTC instant
          ▼
[저장] Booking.start_at / end_at (Timestamptz UTC)
          │
          ▼
[표시] Frontend
          │  formatInTimeZone(d, 'Asia/Seoul', 'yyyy-MM-dd HH:mm') → 사용자 표시
```

### 적용 지침

- **백엔드는 어떤 시점에도 wall-time 문자열을 그대로 `new Date()`에 넣지 않는다.** (서버 TZ에 따라 해석이 달라짐)
- **DTO 경계**(controller 입력)에서만 wall time → UTC 변환을 수행하고, 그 안쪽 service/repository는
  UTC `Date`만 다룬다.
- **펼침 범위는 `between(start, end, true)`**로 한정한다 — 예약 시리즈 1년 절단 정책 적용
  (production 패턴 회귀 PoC의 (c) 단계에서 4 패턴 모두 검증).
- **EXDATE는 dtstart와 동일한 UTC instant 단위(밀리초까지)** 로 등록해야 매칭됨
  (production 패턴 회귀 PoC의 (d) 단계에서 4 패턴 모두 검증).

### 라이브러리

- 변환: `date-fns-tz`의 `fromZonedTime`, `formatInTimeZone` (이미 `apps/backend/package.json`에 추가됨)
- RRULE: `rrule@2.8.1`
- ※ `datetime(...)` 헬퍼는 "UTC Date 생성"용이므로 wall-time 입력 변환에 직접 사용하지 말 것.
  명시적인 `fromZonedTime`으로 의도를 코드에 남긴다.

---

## 5. D-4. DST 영역 사용자 정책

### 결정 (현 단계)

- 본 시스템은 **사내 50명, 한국 단일 시간대(`Asia/Seoul`)** 만 가정한다.
- 한국은 DST 미사용이므로 wall time ↔ UTC instant가 항상 1:1 (offset +09:00 고정).
- 따라서 **회차 펼침 시 추가 보정 로직은 두지 않는다.**
- `Asia/Seoul`은 코드 상수(`TZ_DEFAULT = 'Asia/Seoul'`)로 한 곳에 둔다 (앞으로 다중 TZ 도입 시 단일
  변경점이 되도록).

### 결정 (미래 다중 TZ/DST 도입 시 — 참고)

초기 탐색 PoC에서 `America/Los_Angeles` 09:00 daily 반복을 검증한 결과:

| 구분                            | 동작                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------- |
| UTC instant 고정 (현 코드 패턴) | DST 진입 후 사용자 wall time이 09:00 → 10:00 으로 시프트                         |
| Wall time 고정                  | 매 회차 dtstart를 wall time + tz로 재계산하는 후처리 필요. UTC instant가 1h 점프 |

- 둘 중 어느 것이 "옳은" 동작인지는 **사용자 기대에 따라 다르며**, rrule.js는 자동 보정하지 않는다.
- **회의실 예약 도메인의 자연스러운 기대**는 "wall time 고정"(예: 매주 월요일 오전 9시 회의는 DST와
  무관하게 9시여야 함). 따라서 다중 TZ 도입 시점에는 다음 옵션을 검토:
  1. `RecurrenceRule`에 `dtstart_tz` 컬럼 추가 (D-1)
  2. 펼침 시 `(dtstart_wall, dtstart_tz, RRULE)` 기반으로 매 회차 wall time을 tz로 재해석 후 UTC로 환산
  3. 또는 `temporal-polyfill` / `Temporal` API 도입 검토 (Node 22+ 기준)
- 위 변경은 **PRD 재논의 + 마이그레이션 + 기존 시리즈 데이터 backfill** 이 필요하므로 별도 RFC로 진행.

### 트리거 조건

다음 중 하나가 충족되면 본 정책을 재논의한다.

- 해외 지점 또는 외부 협업자가 시스템 사용자로 추가됨
- iCalendar 외부 연동(Google Calendar 등) 요건 발생

---

## 6. 후속 액션 (Phase 4 진입 전)

- [ ] 본 결정을 `.claude/rules/database.md` §8 (시간대 주의사항) 하위에 1줄 요약 링크 추가
- [ ] `apps/backend/src/common/`에 `TZ_DEFAULT` 상수 + `toUtcFromKst(wall) / formatKst(d)` 유틸 추가
      (Phase 4-1 첫 커밋에 포함)
- [ ] `apps/backend/scripts/rrule-poc.ts` 는 PoC용 — 본 코드 진입 시 삭제하거나 `examples/`로 이동
- [ ] `RecurrenceRule.dtstart` 컬럼은 `Timestamptz(6)` 단일 (이미 `02-db-design.md` 반영됨, 별도 변경 없음)

---

## 7. 변경 이력

| 일자       | 버전 | 작성자       | 내용                                                                                                   |
| ---------- | ---- | ------------ | ------------------------------------------------------------------------------------------------------ |
| 2026-04-25 | 1.0  | leederic9306 | rrule.js PoC 결과 기반 4가지 정책 결정 최초 작성                                                       |
| 2026-04-25 | 1.1  | leederic9306 | PoC 스크립트를 4 production RRULE 패턴 × 4단계((a)~(d)) 검증 구조로 재구성, 본 문서 시나리오 인용 갱신 |
