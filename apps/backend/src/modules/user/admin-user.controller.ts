import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import type { AdminUserDto } from './dto/admin-user.dto';
import { ListUsersQuery } from './dto/list-users.query';
import { UpdateRoleDto } from './dto/update-role.dto';
import { type PaginatedUsers, UserService } from './user.service';

/**
 * 관리자 전용 사용자 관리 엔드포인트. docs/03-api-spec.md §7.
 * 컨트롤러 단위로 RolesGuard + @Roles(ADMIN)을 강제 — 누락된 핸들러가 USER에 노출되지 않도록.
 */
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminUserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  list(@Query() query: ListUsersQuery): Promise<PaginatedUsers> {
    return this.userService.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserDto> {
    return this.userService.findById(id);
  }

  @Patch(':id/role')
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<AdminUserDto> {
    return this.userService.updateRole(id, dto.role);
  }
}
