import { Module } from '@nestjs/common';

import { AdminBookingController } from './admin-booking.controller';
import { AdminExceptionRequestController } from './admin-exception-request.controller';
import { ExceptionRequestService } from './exception-request.service';
import { UserExceptionRequestController } from './user-exception-request.controller';

@Module({
  controllers: [
    UserExceptionRequestController,
    AdminExceptionRequestController,
    AdminBookingController,
  ],
  providers: [ExceptionRequestService],
  exports: [ExceptionRequestService],
})
export class ExceptionRequestModule {}
