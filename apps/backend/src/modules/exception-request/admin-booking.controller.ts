import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user.type';

import { CreateAdminBookingDto } from './dto/create-admin-booking.dto';
import { ExceptionRequestService } from './exception-request.service';

/**
 * 관리자 직접 예약 — POST /admin/bookings. docs/03-api-spec.md §6.7.
 * 4시간/과거 시점 우회. AuditLog 기록.
 *
 * 같은 ExceptionRequestService 가 책임지는 이유:
 *  - "관리자 예외 시간 처리" 라는 도메인 응집을 유지 (예외 신청을 거치지 않은
 *    직접 예약도 같은 정책의 변형이다 — 4시간/과거 우회 + 감사 로그)
 *  - BookingModule 은 USER 의 일반 예약 정책에 집중, 정책 분리.
 */
@Controller('admin/bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminBookingController {
  constructor(private readonly service: ExceptionRequestService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAdminBookingDto,
  ): Promise<{ id: string; userId: string; createdByAdmin: true }> {
    return this.service.createAdminBooking(dto, { id: user.id, role: user.role });
  }
}
