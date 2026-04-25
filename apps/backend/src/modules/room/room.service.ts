import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';

import type { CreateRoomDto } from './dto/create-room.dto';
import { type RoomDto, toRoomDto } from './dto/room.dto';
import type { UpdateRoomDto } from './dto/update-room.dto';

export interface ListRoomsOptions {
  /** 호출자 역할 — ADMIN만 비활성 회의실까지 조회 가능. */
  requesterRole: UserRole;
  includeInactive?: boolean;
}

/** 회의실 최대 개수 — docs/03-api-spec.md §3.3 (ROOM_LIMIT_EXCEEDED). */
const MAX_ROOMS = 10;

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

  async create(dto: CreateRoomDto): Promise<RoomDto> {
    // 10개 제한 — 비활성 회의실도 슬롯을 차지한다.
    const total = await this.prisma.room.count();
    if (total >= MAX_ROOMS) {
      throw new ConflictException({
        code: 'ROOM_LIMIT_EXCEEDED',
        message: `회의실은 최대 ${MAX_ROOMS}개까지 등록할 수 있습니다.`,
      });
    }

    try {
      const created = await this.prisma.room.create({
        data: {
          name: dto.name,
          capacity: dto.capacity,
          location: dto.location,
          description: dto.description,
          displayOrder: dto.displayOrder ?? 0,
        },
      });
      return toRoomDto(created);
    } catch (error) {
      throw this.mapPrismaError(error);
    }
  }

  async update(id: string, dto: UpdateRoomDto): Promise<RoomDto> {
    const existing = await this.prisma.room.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({
        code: 'ROOM_NOT_FOUND',
        message: '회의실을 찾을 수 없습니다.',
      });
    }

    try {
      const updated = await this.prisma.room.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.capacity !== undefined && { capacity: dto.capacity }),
          ...(dto.location !== undefined && { location: dto.location }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          ...(dto.displayOrder !== undefined && { displayOrder: dto.displayOrder }),
        },
      });
      return toRoomDto(updated);
    } catch (error) {
      throw this.mapPrismaError(error);
    }
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.room.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({
        code: 'ROOM_NOT_FOUND',
        message: '회의실을 찾을 수 없습니다.',
      });
    }

    // 미래(또는 진행 중) 예약이 하나라도 있으면 삭제 불가 — 비활성화(PATCH)로 안내.
    const futureBookingCount = await this.prisma.booking.count({
      where: {
        roomId: id,
        deletedAt: null,
        endAt: { gt: new Date() },
      },
    });
    if (futureBookingCount > 0) {
      throw new ConflictException({
        code: 'ROOM_HAS_FUTURE_BOOKINGS',
        message:
          '미래 예약이 있는 회의실은 삭제할 수 없습니다. 비활성화하려면 isActive=false로 수정해 주세요.',
      });
    }

    await this.prisma.room.delete({ where: { id } });
  }

  /**
   * Prisma → 도메인 예외 매핑.
   * - P2002 (unique 위반, name 컬럼) → ROOM_NAME_DUPLICATE
   * - 그 외는 원본을 그대로 던져 글로벌 필터가 처리.
   */
  private mapPrismaError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = (error.meta as { target?: string[] | string } | undefined)?.target;
      const targets = Array.isArray(target) ? target : target ? [target] : [];
      if (targets.some((t) => t.includes('name'))) {
        return new ConflictException({
          code: 'ROOM_NAME_DUPLICATE',
          message: '이미 존재하는 회의실 이름입니다.',
        });
      }
    }
    return error;
  }
}
