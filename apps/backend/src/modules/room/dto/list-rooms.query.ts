import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * GET /rooms 쿼리 스트링.
 * `includeInactive`는 ADMIN만 의미 — 일반 사용자가 보내도 서비스에서 무시한다.
 */
export class ListRoomsQuery {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return value;
  })
  @IsBoolean()
  includeInactive?: boolean;
}
