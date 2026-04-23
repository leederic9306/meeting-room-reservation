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

  const corsOrigins = config
    .get('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  logger.log(`🚀 Backend 실행 중: http://localhost:${port} (health: /health)`);
}

void bootstrap();
