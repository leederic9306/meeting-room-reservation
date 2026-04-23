# 코딩 스타일

## TypeScript

### 타입 안전성
- **strict 모드 필수**: `strict: true`, `noUncheckedIndexedAccess: true`
- **`any` 사용 금지**: 불가피하면 `unknown` + 타입 가드로 좁혀 사용
- **공개 함수는 반환 타입 명시**: `export` 함수, 클래스 public 메서드
- **타입 추론 활용**: 지역 변수는 명시적 타입을 남발하지 않음
- **DTO는 zod 스키마**에서 파생 (`packages/shared-types`)

```ts
// ❌ Bad
function getUser(id): any { ... }
const data: User = await fetch(...).then(r => r.json()); // 검증 없이 캐스팅

// ✅ Good
async function getUser(id: string): Promise<UserDto> { ... }
const raw = await fetch(...).then(r => r.json());
const data = UserDtoSchema.parse(raw); // 런타임 검증
```

### Null/Undefined
- `undefined` 통일. `null`은 DB에서 넘어온 값에만 사용
- 옵셔널 체이닝(`?.`)과 nullish coalescing(`??`) 적극 사용
- 빈 값은 `""` 대신 `undefined`

## NestJS (Backend)

### 레이어 규칙
```
Controller → Service → Repository(Prisma)
```

- **Controller**: HTTP 관심사만. DTO 검증, 인증/권한 체크, service 호출
- **Service**: 비즈니스 로직. HTTP/DB 직접 알지 못함
- **Repository**: Prisma 호출. service 안에서만 사용

### 의존성 주입
- 생성자 주입만 사용
- 모듈 간 의존은 단방향. 순환 의존 발견 시 즉시 설계 재검토

### 예외 처리
- NestJS 내장 예외 사용 (`NotFoundException`, `BadRequestException`, `ConflictException` 등)
- 도메인 예외는 `src/common/exceptions/`에 정의
- 글로벌 필터로 응답 형식 통일:

```ts
{
  "error": {
    "code": "BOOKING_TIME_CONFLICT",
    "message": "선택한 시간대에 다른 예약이 있습니다.",
    "details": { ... }
  }
}
```

### 함수/메서드 길이
- 한 함수 50줄 초과 시 분할 검토
- 분기 5개 이상 시 전략 패턴 또는 lookup table 검토

## Next.js (Frontend)

### App Router 원칙
- **기본은 서버 컴포넌트**. 상태/이벤트가 필요한 경우에만 `"use client"`
- `"use client"`는 가능한 한 leaf 컴포넌트에 배치
- 서버 데이터 페칭은 서버 컴포넌트에서 직접 수행, 클라이언트는 TanStack Query

### 디렉토리
```
app/                  # 라우트
  (auth)/login/
  (main)/dashboard/
  (admin)/admin/
components/
  ui/                 # shadcn/ui 기본
  features/           # 도메인 단위
hooks/                # use- 접두사
lib/
  api/                # API 클라이언트
  utils/
stores/               # Zustand
```

### 상태 관리
- **서버 상태**: TanStack Query
- **클라이언트 전역**: Zustand
- **폼**: react-hook-form + zod
- `useState` 3개 이상 관련 시 `useReducer` 또는 zustand로 추출

## 네이밍

| 대상 | 규칙 | 예 |
|---|---|---|
| 변수/함수 | camelCase | `getUserById` |
| 클래스/타입 | PascalCase | `BookingService` |
| 상수 | UPPER_SNAKE | `MAX_BOOKING_HOURS` |
| 파일 (일반) | kebab-case | `booking.service.ts` |
| 파일 (컴포넌트) | PascalCase | `BookingModal.tsx` |
| 환경변수 | UPPER_SNAKE | `JWT_ACCESS_SECRET` |
| Prisma 모델 | PascalCase 단수 | `Booking`, `User` |
| DB 컬럼 | snake_case | `created_at` (`@map`) |

**불리언은 `is/has/can/should` 접두사**: `isActive`, `hasCompleted`, `canEdit`.

## 파일 조직

- **한 파일 = 한 관심사**
- **파일 최대 300줄 권장**
- **import 순서**: 외부 → 절대 경로 → 상대 경로. ESLint 자동 정렬

## 에러/로깅

- `console.log` 금지 (테스트 제외). NestJS는 `Logger`, 프런트는 별도 logger
- 에러 메시지에 비밀번호/토큰/PII 절대 포함 금지
- 외부 API 호출 실패는 재시도 정책 정의 필수

## 시간 처리

- **DB는 모두 UTC** (`Timestamptz(6)`)
- **표시 시에만** 사용자 시간대(Asia/Seoul) 변환
- 비교/연산은 모두 UTC로
- 라이브러리: 백엔드는 `date-fns` + `date-fns-tz`, 프런트도 동일

## 주석

- **WHY를 적고, WHAT은 코드로 말한다**
- TODO에는 항상 이슈 번호 또는 컨텍스트 명시
- 한국어 주석 OK (팀 한국어 환경)

```ts
// ❌ Bad
// 사용자 조회
const user = await this.userRepo.findById(id);

// ✅ Good
// 마지막 ADMIN 보호 (PRD AUTH-018) - 강등 전 ADMIN 카운트 검증
const adminCount = await this.userRepo.countByRole('ADMIN');
if (adminCount === 1 && targetUser.role === 'ADMIN') {
  throw new LastAdminProtectionException();
}
```
