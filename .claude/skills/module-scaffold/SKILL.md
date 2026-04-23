---
name: module-scaffold
description: Scaffold a NestJS module with controller, service, DTO, and spec files following project conventions. Use when starting a new domain module.
allowed-tools: Read Write Bash
---

# Module Scaffold

NestJS 도메인 모듈을 프로젝트 컨벤션에 맞게 스캐폴딩합니다.

## 사용법

```
/module-scaffold <module-name>
```

예: `/module-scaffold notification`

## 생성 파일

```
apps/backend/src/modules/<module-name>/
├── <module-name>.module.ts
├── <module-name>.controller.ts
├── <module-name>.service.ts
├── <module-name>.service.spec.ts
├── dto/
│   ├── create-<module-name>.dto.ts
│   └── update-<module-name>.dto.ts
└── README.md           # 모듈 설명
```

## 템플릿

### `<name>.module.ts`
```ts
import { Module } from '@nestjs/common';
import { <Name>Controller } from './<name>.controller';
import { <Name>Service } from './<name>.service';
import { PrismaModule } from '../../infra/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [<Name>Controller],
  providers: [<Name>Service],
  exports: [<Name>Service],
})
export class <Name>Module {}
```

### `<name>.controller.ts`
```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { <Name>Service } from './<name>.service';

@Controller('<name-plural>')
@UseGuards(JwtAuthGuard)
export class <Name>Controller {
  constructor(private readonly <name>Service: <Name>Service) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return this.<name>Service.list(user.id);
  }
}
```

### `<name>.service.ts`
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class <Name>Service {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    return this.prisma.<name>.findMany({ where: { userId } });
  }
}
```

### `<name>.service.spec.ts`
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { <Name>Service } from './<name>.service';
import { PrismaService } from '../../infra/prisma/prisma.service';

describe('<Name>Service', () => {
  let service: <Name>Service;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        <Name>Service,
        { provide: PrismaService, useValue: { /* mock */ } },
      ],
    }).compile();
    service = module.get(<Name>Service);
  });

  it('서비스가 정의됨', () => {
    expect(service).toBeDefined();
  });
});
```

### `dto/create-<name>.dto.ts`
```ts
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const Create<Name>Schema = z.object({
  // 필드 정의
});

export class Create<Name>Dto extends createZodDto(Create<Name>Schema) {}
```

## 동작

1. 사용자 입력 받음
2. PascalCase, camelCase, kebab-case 변환:
   - `notification` → `Notification`, `notification`, `notification`
3. 위 템플릿으로 파일 생성
4. `app.module.ts`에 자동 등록 안내
5. shared-types에 zod 스키마 추가 권장 안내

## 후속 작업 안내

```
✅ 모듈 스캐폴딩 완료
다음 단계:
1. apps/backend/src/app.module.ts의 imports에 <Name>Module 추가
2. packages/shared-types/src/<name>.ts에 zod 스키마 정의
3. /migration-create로 DB 스키마 추가
4. 테스트 케이스를 docs/06-test-cases.md에 추가
```

## 컨벤션 참조

- `@.claude/rules/architecture.md` — 모듈 구조
- `@.claude/rules/coding-style.md` — 네이밍
