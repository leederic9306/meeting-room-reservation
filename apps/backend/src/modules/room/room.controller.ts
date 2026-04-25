import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user.type';

import { ListRoomsQuery } from './dto/list-rooms.query';
import type { RoomDto } from './dto/room.dto';
import { RoomService } from './room.service';

@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListRoomsQuery): Promise<RoomDto[]> {
    return this.roomService.list({
      requesterRole: user.role,
      includeInactive: query.includeInactive,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<RoomDto> {
    return this.roomService.findById(id);
  }
}
