import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * GET /admin/audit-logs 쿼리 파라미터.
 *
 * - action: 단일 액션 코드 정확 일치 (예: USER_ROLE_CHANGED)
 * - targetType: BOOKING/USER/ROOM/EXCEPTION_REQUEST 등 정확 일치
 * - actorId: 단일 사용자 필터
 * - from/to: 생성 시각 범위 (createdAt)
 * - page/limit: 공통 페이지네이션 (§1.4)
 */
export class ListAuditLogsQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  targetType?: string;

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsDateString({}, { message: 'from은 ISO 8601 datetime이어야 합니다.' })
  from?: string;

  @IsOptional()
  @IsDateString({}, { message: 'to는 ISO 8601 datetime이어야 합니다.' })
  to?: string;

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
