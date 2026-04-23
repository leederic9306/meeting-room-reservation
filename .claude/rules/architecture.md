# Architecture

## 1. 모노레포 구조

```
meeting-room/
├── apps/
│   ├── backend/        # NestJS API
│   └── frontend/       # Next.js 14
├── packages/
│   ├── shared-types/   # zod 공유 스키마
│   └── config/         # ESLint/TS 베이스
├── prisma/             # 마이그레이션 (apps/backend/prisma 심볼릭)
├── docker/             # Docker 초기화 스크립트
├── docs/               # 프로젝트 문서
├── .claude/            # Claude Code 메모리
└── docker-compose.yml
```

- 패키지 매니저: **pnpm + workspaces**
- 빌드 도구: **Turborepo**

## 2. 백엔드 구조 (NestJS)

```
apps/backend/src/
├── modules/                 # 도메인 모듈
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── dto/
│   │   ├── guards/
│   │   └── auth.service.spec.ts
│   ├── user/
│   ├── room/
│   ├── booking/
│   ├── recurrence/
│   ├── exception-request/
│   └── audit-log/
├── common/                  # 공용 필터/가드/데코레이터
│   ├── exceptions/
│   ├── decorators/
│   ├── filters/
│   ├── interceptors/
│   └── guards/
├── infra/                   # 외부 어댑터
│   ├── prisma/
│   └── mail/                # SMTP/SES 추상화
├── config/                  # 환경변수 검증
└── main.ts
```

### 모듈 규칙
- **모듈 = 도메인 단위** (기능별 X)
- 모듈 간 호출은 **service의 public 메서드만**
- 다른 모듈의 repository/internal 함수 직접 호출 금지
- 순환 의존 발생 시 즉시 설계 재검토

## 3. 프런트엔드 구조 (Next.js App Router)

```
apps/frontend/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   ├── verify-email/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   └── reset-password/page.tsx
│   ├── (main)/
│   │   ├── dashboard/page.tsx
│   │   └── my/requests/page.tsx
│   ├── (admin)/
│   │   └── admin/
│   │       ├── rooms/page.tsx
│   │       ├── users/page.tsx
│   │       ├── exception-requests/page.tsx
│   │       └── audit-logs/page.tsx
│   ├── layout.tsx
│   ├── globals.css
│   └── providers.tsx
├── components/
│   ├── ui/                  # shadcn/ui 프리미티브
│   └── features/            # 도메인 컴포넌트
│       ├── booking/
│       ├── calendar/
│       └── exception-request/
├── hooks/
├── lib/
│   ├── api/                 # API 클라이언트 + zod
│   └── utils/
├── stores/                  # zustand
└── middleware.ts
```

## 4. 데이터 흐름

```
UI Component
  ↓ calls
Custom Hook (useBookings, useCreateBooking...)
  ↓ uses
TanStack Query → API Client (lib/api)
  ↓ HTTP
NestJS Controller (DTO 검증, 권한 체크)
  ↓
Service (비즈니스 로직)
  ↓
Prisma (Repository)
  ↓
PostgreSQL
```

각 단계 단방향. 역방향 참조 금지.

## 5. DTO/타입 공유

- **공유 스키마**: `packages/shared-types`에 **zod 스키마로 정의**
- 백엔드는 zod → class-validator 변환 또는 직접 zod 사용
- 프런트는 zod 타입 직접 사용
- Prisma 모델은 **내부 구현**. 절대 API 응답으로 그대로 반환 금지

```ts
// packages/shared-types/src/booking.ts
export const BookingDtoSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  title: z.string().min(1).max(200),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  // password_hash 같은 민감 필드는 절대 포함 X
});
export type BookingDto = z.infer<typeof BookingDtoSchema>;
```

## 6. 인증 경계

- Access Token: 15분 만료, `Authorization: Bearer <token>` 헤더
- Refresh Token: 14일 만료, HttpOnly + Secure + SameSite=Strict 쿠키
- 모든 protected 엔드포인트는 `@UseGuards(JwtAuthGuard)` 필수
- ADMIN 엔드포인트는 추가로 `@UseGuards(RolesGuard) @Roles('ADMIN')`
- 프런트는 axios 인터셉터: 401 → `/auth/refresh` → 재요청

## 7. 외부 서비스 격리

외부 API(SMTP, AWS SES, 사내 SSO 등)는 **infra 레이어**에 어댑터로:

```ts
// infra/mail/mail.service.ts
export interface MailService {
  send(opts: SendMailOptions): Promise<void>;
}

// infra/mail/smtp-mail.service.ts
@Injectable()
export class SmtpMailService implements MailService {
  // nodemailer 구현
}

// infra/mail/ses-mail.service.ts (운영용)
@Injectable()
export class SesMailService implements MailService {
  // AWS SES 구현
}
```

서비스 레이어는 인터페이스에만 의존. 환경별 구현 교체 가능.

## 8. 트랜잭션 경계

- 여러 테이블 변경은 반드시 트랜잭션 (Prisma `$transaction`)
- 외부 호출(이메일 발송 등)은 트랜잭션 밖에서 — DB 커밋 후 발송
- 동시성 제어 필요 시 `SELECT FOR UPDATE` (Prisma raw query)

```ts
// 예: 예외 신청 승인
await this.prisma.$transaction(async (tx) => {
  const request = await tx.$queryRaw`
    SELECT * FROM exception_request WHERE id = ${id} FOR UPDATE
  `;
  // 충돌 재검증
  // booking 생성
  // request 상태 변경
});
// 트랜잭션 외부에서 메일 발송
await this.mailService.send({ ... });
```

## 9. 에러 응답 통일

`src/common/filters/all-exceptions.filter.ts`에서 모든 에러를 다음 형식으로:

```json
{
  "error": {
    "code": "DOMAIN_SPECIFIC_CODE",
    "message": "사용자 친화적 한국어 메시지",
    "details": {
      "field": "startAt",
      "conflictingBookingId": "..."
    },
    "requestId": "uuid"
  }
}
```

`requestId`는 모든 응답에 포함하여 로그 추적 가능.
