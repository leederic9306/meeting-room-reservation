import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user.type';

import type { ApproveExceptionRequestResponseDto } from './dto/exception-request.dto';
import { ListExceptionRequestsQuery } from './dto/list-exception-requests.query';
import { RejectExceptionRequestDto } from './dto/reject-exception-request.dto';
import {
  ExceptionRequestService,
  type PaginatedExceptionRequests,
} from './exception-request.service';

/**
 * 관리자용 예외 신청 워크플로우. docs/03-api-spec.md §6.4~§6.6.
 * 컨트롤러 단위 RolesGuard + @Roles(ADMIN) 으로 USER 노출 차단.
 */
@Controller('admin/exception-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminExceptionRequestController {
  constructor(private readonly service: ExceptionRequestService) {}

  @Get()
  list(@Query() query: ListExceptionRequestsQuery): Promise<PaginatedExceptionRequests> {
    return this.service.listAdmin(query);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApproveExceptionRequestResponseDto> {
    return this.service.approve(id, { id: user.id, role: user.role });
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectExceptionRequestDto,
  ): Promise<unknown> {
    return this.service.reject(id, dto.reviewComment, { id: user.id, role: user.role });
  }
}
