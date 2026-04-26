import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { EnvelopeInterceptor } from './common/interceptors/envelope.interceptor';
import type { Env } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = new Logger('Bootstrap');
  const config = app.get(ConfigService<Env, true>);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  // /health는 프리픽스 제외 (PRD/roadmap의 GET /health 규약)
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  const configuredOrigins = config
    .get('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // dev에서는 사용자가 localhost / 127.0.0.1 어느 쪽으로 들어와도 동작하도록 양쪽을 자동 매핑.
  // (운영에서는 실제 도메인만 허용해야 하므로 development에서만 적용.)
  const isDev = config.get('NODE_ENV', { infer: true }) === 'development';
  const corsOrigins = isDev
    ? Array.from(
        new Set(
          configuredOrigins.flatMap((origin) => {
            const variants = [origin];
            if (origin.includes('://localhost')) {
              variants.push(origin.replace('://localhost', '://127.0.0.1'));
            } else if (origin.includes('://127.0.0.1')) {
              variants.push(origin.replace('://127.0.0.1', '://localhost'));
            }
            return variants;
          }),
        ),
      )
    : configuredOrigins;
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  logger.log(`🚀 Backend 실행 중: http://localhost:${port} (health: /health)`);
}

void bootstrap();
