import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';

import { type RoomDto, toRoomDto } from './dto/room.dto';

export interface ListRoomsOptions {
  /** 호출자 역할 — ADMIN만 비활성 회의실까지 조회 가능. */
  requesterRole: UserRole;
  includeInactive?: boolean;
}

@Injectable()
export class RoomService {
  constructor(private readonly prisma: PrismaService) {}

  async list(options: ListRoomsOptions): Promise<RoomDto[]> {
    // 비활성 포함은 ADMIN 전용 — 일반 사용자가 includeInactive=true 보내도 무시한다.
    const includeInactive =
      options.includeInactive === true && options.requesterRole === UserRole.ADMIN;

    const where: Prisma.RoomWhereInput = includeInactive ? {} : { isActive: true };

    const rooms = await this.prisma.room.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });

    return rooms.map(toRoomDto);
  }

  async findById(id: string): Promise<RoomDto> {
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room) {
      throw new NotFoundException({
        code: 'ROOM_NOT_FOUND',
        message: '회의실을 찾을 수 없습니다.',
      });
    }
    return toRoomDto(room);
  }
}
