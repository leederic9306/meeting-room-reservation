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

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user.type';

import { CreateExceptionRequestDto } from './dto/create-exception-request.dto';
import type {
  CreateExceptionRequestResponseDto,
  ExceptionRequestDto,
} from './dto/exception-request.dto';
import { ListExceptionRequestsQuery } from './dto/list-exception-requests.query';
import {
  ExceptionRequestService,
  type PaginatedExceptionRequests,
} from './exception-request.service';

/**
 * 사용자 자기 자신용 엔드포인트. docs/03-api-spec.md §6.1~§6.3.
 * /admin/* 흐름은 별도 컨트롤러에서 ADMIN 가드와 함께 노출한다.
 */
@Controller('exception-requests')
@UseGuards(JwtAuthGuard)
export class UserExceptionRequestController {
  constructor(private readonly service: ExceptionRequestService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateExceptionRequestDto,
  ): Promise<CreateExceptionRequestResponseDto> {
    return this.service.create(dto, { id: user.id, role: user.role });
  }

  @Get('me')
  listMine(
    @CurrentUser() user: AuthUser,
    @Query() query: ListExceptionRequestsQuery,
  ): Promise<PaginatedExceptionRequests> {
    return this.service.listMine({ id: user.id, role: user.role }, query);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ExceptionRequestDto> {
    return this.service.cancel(id, { id: user.id, role: user.role });
  }
}
