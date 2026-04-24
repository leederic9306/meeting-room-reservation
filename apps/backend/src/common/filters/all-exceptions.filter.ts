import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

interface ErrorResponseBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * 모든 예외를 docs/03-api-spec.md §1.2의 포맷으로 통일한다.
 *   { error: { code, message, details? } }
 *
 * HttpException의 response 바디에 { code, message, details } 객체가 실려 오면 그대로 사용.
 * ValidationPipe가 던지는 400은 class-validator 메시지 배열을 VALIDATION_ERROR로 감싼다.
 * 그 외 예외는 500 INTERNAL_ERROR로 처리한다.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const { status, body } = this.resolve(exception);

    response.status(status).json({ error: body });
  }

  private resolve(exception: unknown): { status: number; body: ErrorResponseBody } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const body = this.toErrorBody(status, raw);
      return { status, body };
    }

    this.logger.error(
      '처리되지 않은 예외',
      exception instanceof Error ? exception.stack : exception,
    );
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL_ERROR', message: '서버 내부 오류가 발생했습니다.' },
    };
  }

  private toErrorBody(status: number, raw: unknown): ErrorResponseBody {
    if (typeof raw === 'string') {
      return { code: this.defaultCodeFor(status), message: raw };
    }
    if (raw && typeof raw === 'object') {
      const rec = raw as Record<string, unknown>;

      // 서비스 레이어에서 던진 { code, message, details }.
      if (typeof rec.code === 'string' && typeof rec.message === 'string') {
        return {
          code: rec.code,
          message: rec.message,
          details: this.pickDetails(rec.details),
        };
      }

      // ValidationPipe: { statusCode, message: string | string[], error }.
      if (status === HttpStatus.BAD_REQUEST) {
        const messages = Array.isArray(rec.message)
          ? (rec.message as unknown[]).filter((m): m is string => typeof m === 'string')
          : typeof rec.message === 'string'
            ? [rec.message]
            : [];
        return {
          code: 'VALIDATION_ERROR',
          message: messages[0] ?? '입력값이 올바르지 않습니다.',
          details: messages.length > 1 ? { messages } : undefined,
        };
      }

      return {
        code: this.defaultCodeFor(status),
        message: typeof rec.message === 'string' ? rec.message : this.defaultMessageFor(status),
      };
    }
    return {
      code: this.defaultCodeFor(status),
      message: this.defaultMessageFor(status),
    };
  }

  private pickDetails(value: unknown): Record<string, unknown> | undefined {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return undefined;
  }

  private defaultCodeFor(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'VALIDATION_ERROR';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMITED';
      default:
        return 'INTERNAL_ERROR';
    }
  }

  private defaultMessageFor(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return '입력값이 올바르지 않습니다.';
      case HttpStatus.UNAUTHORIZED:
        return '인증이 필요합니다.';
      case HttpStatus.FORBIDDEN:
        return '접근 권한이 없습니다.';
      case HttpStatus.NOT_FOUND:
        return '요청한 리소스를 찾을 수 없습니다.';
      case HttpStatus.CONFLICT:
        return '요청이 충돌합니다.';
      case HttpStatus.TOO_MANY_REQUESTS:
        return '요청이 너무 많습니다.';
      default:
        return '서버 내부 오류가 발생했습니다.';
    }
  }
}
