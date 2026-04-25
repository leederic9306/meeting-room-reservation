import { ExceptionRequestStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/**
 * GET /exception-requests/me 와 GET /admin/exception-requests 공통 쿼리.
 * - status: 단일 상태 필터 (관리자는 기본 PENDING)
 * - userId: 관리자 한정 — 신청자 필터
 * - page/limit: 공통 페이지네이션 (§1.4)
 */
export class ListExceptionRequestsQuery {
  @IsOptional()
  @IsEnum(ExceptionRequestStatus, {
    message: 'status는 PENDING/APPROVED/REJECTED/CANCELLED 중 하나여야 합니다.',
  })
  status?: ExceptionRequestStatus;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
