import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * 모든 성공 응답을 docs/03-api-spec.md §1.2 포맷({ data, meta? })으로 감싼다.
 * - 이미 data 키가 있는 객체는 그대로 통과 (이중 래핑 방지)
 * - undefined/null 반환(204 No Content 등)은 그대로 통과
 */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((payload) => {
        if (payload === undefined || payload === null) return payload;
        if (typeof payload === 'object' && payload !== null && 'data' in payload) {
          return payload;
        }
        return { data: payload };
      }),
    );
  }
}
