import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';

import { type AdminUserDto, toAdminUserDto } from './dto/admin-user.dto';
import type { ListUsersQuery } from './dto/list-users.query';

/** 페이지네이션 기본값 — docs/03-api-spec.md §1.4. */
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface PaginatedUsers {
  data: AdminUserDto[];
  meta: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListUsersQuery): Promise<PaginatedUsers> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const where: Prisma.UserWhereInput = {
      // 소프트 삭제(DELETED)는 기본적으로 숨기되, status 필터로 명시 시에만 노출.
      ...(query.status === undefined && { status: { not: UserStatus.DELETED } }),
      ...(query.status !== undefined && { status: query.status }),
      ...(query.role !== undefined && { role: query.role }),
      ...(query.search !== undefined &&
        query.search.length > 0 && {
          OR: [
            { email: { contains: query.search, mode: 'insensitive' } },
            { name: { contains: query.search, mode: 'insensitive' } },
          ],
        }),
    };

    const [users, totalItems] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map(toAdminUserDto),
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / limit)),
      },
    };
  }

  async findById(id: string): Promise<AdminUserDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: '사용자를 찾을 수 없습니다.',
      });
    }
    return toAdminUserDto(user);
  }

  async updateRole(id: string, role: UserRole): Promise<AdminUserDto> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: '사용자를 찾을 수 없습니다.',
      });
    }

    // No-op이면 곧장 반환 — 마지막 ADMIN 카운트 검사를 우회하지 않도록 같은 역할이라도 통과.
    if (target.role === role) {
      return toAdminUserDto(target);
    }

    // 마지막 ADMIN 보호 (PRD AUTH-018) — ADMIN→USER 강등 시 ACTIVE 상태인 ADMIN이 1명뿐이면 차단.
    if (target.role === UserRole.ADMIN && role !== UserRole.ADMIN) {
      const activeAdminCount = await this.prisma.user.count({
        where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
      });
      const targetIsCountedAdmin = target.status === UserStatus.ACTIVE;
      // 강등 후 남는 ACTIVE ADMIN 수가 0이면 차단.
      const remaining = activeAdminCount - (targetIsCountedAdmin ? 1 : 0);
      if (remaining <= 0) {
        throw new ConflictException({
          code: 'LAST_ADMIN_PROTECTION',
          message: '마지막 관리자는 강등할 수 없습니다.',
        });
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { role },
    });
    return toAdminUserDto(updated);
  }
}
