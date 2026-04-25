import { Module } from '@nestjs/common';

import { AdminUserController } from './admin-user.controller';
import { UserService } from './user.service';

@Module({
  controllers: [AdminUserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
