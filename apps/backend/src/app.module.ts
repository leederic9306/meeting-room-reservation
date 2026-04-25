import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { validateEnv } from './config/env.validation';
import { MailModule } from './infra/mail/mail.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { BookingModule } from './modules/booking/booking.module';
import { ExceptionRequestModule } from './modules/exception-request/exception-request.module';
import { HealthModule } from './modules/health/health.module';
import { RecurrenceModule } from './modules/recurrence/recurrence.module';
import { RoomModule } from './modules/room/room.module';
import { UserModule } from './modules/user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      // cwd가 apps/backend인 경우와 모노레포 루트인 경우 모두 지원
      envFilePath: ['.env.local', '.env', '../../.env.local', '../../.env'],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    MailModule,
    AuthModule,
    HealthModule,
    RoomModule,
    BookingModule,
    RecurrenceModule,
    ExceptionRequestModule,
    UserModule,
  ],
})
export class AppModule {}
