import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';

import { PrismaService } from '../../infra/prisma/prisma.service';

import {
  type BookingDto,
  type BookingWithRelations,
  type UpdateBookingResponseDto,
  toBookingDto,
} from './dto/booking.dto';
import type { CreateBookingDto } from './dto/create-booking.dto';
import { DeleteBookingScope } from './dto/delete-booking.query';
import type { ListBookingsQuery } from './dto/list-bookings.query';
import type { UpdateBookingDto } from './dto/update-booking.dto';

/** 캘린더 조회 기간 상한 — PRD/API 스펙 §4.1. */
const MAX_LIST_RANGE_DAYS = 31;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 단일 예약 길이 상한 — 4시간(240분). 관리자 우회는 별도 엔드포인트(/admin/bookings). */
const MAX_DURATION_MINUTES = 240;

/** 시간 단위(분). 시작/종료 모두 15분 경계여야 한다. */
const QUARTER_MINUTES = 15;

const BOOKING_RELATIONS = {
  room: { select: { id: true, name: true } },
  user: { select: { id: true, name: true, department: true } },
} as const;

export interface ActorContext {
  id: string;
  role: UserRole;
}

@Injectable()
export class BookingService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // 조회
  // ---------------------------------------------------------------------------

  async list(query: ListBookingsQuery, actor: ActorContext): Promise<BookingDto[]> {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (to.getTime() <= from.getTime()) {
      throw new BadRequestException({
        code: 'INVALID_TIME_RANGE',
        message: 'to는 from보다 이후여야 합니다.',
      });
    }
    if (to.getTime() - from.getTime() > MAX_LIST_RANGE_DAYS * MS_PER_DAY) {
      throw new BadRequestException({
        code: 'TIME_RANGE_TOO_LARGE',
        message: `조회 범위는 최대 ${MAX_LIST_RANGE_DAYS}일을 초과할 수 없습니다.`,
      });
    }

    // userId 필터: ADMIN만 다른 사용자 지정 가능. 일반 사용자가 보낸 값은 자기 자신 외에는 거부.
    const userIdFilter =
      query.userId !== undefined && query.userId !== actor.id && actor.role !== UserRole.ADMIN
        ? (() => {
            throw new ForbiddenException({
              code: 'FORBIDDEN',
              message: '다른 사용자의 예약은 조회할 수 없습니다.',
            });
          })()
        : query.userId;

    const bookings = await this.prisma.booking.findMany({
      where: {
        deletedAt: null,
        // 캘린더 조회: 기간과 겹치는 모든 예약 — start < to AND end > from.
        startAt: { lt: to },
        endAt: { gt: from },
        ...(query.roomId !== undefined && { roomId: query.roomId }),
        ...(userIdFilter !== undefined && { userId: userIdFilter }),
      },
      orderBy: { startAt: 'asc' },
      include: BOOKING_RELATIONS,
    });

    return bookings.map((b) => toBookingDto(b as BookingWithRelations, actor.id));
  }

  async findById(id: string, actor: ActorContext): Promise<BookingDto> {
    const booking = await this.prisma.booking.findFirst({
      where: { id, deletedAt: null },
      include: BOOKING_RELATIONS,
    });
    if (!booking) {
      throw new NotFoundException({
        code: 'BOOKING_NOT_FOUND',
        message: '예약을 찾을 수 없습니다.',
      });
    }
    return toBookingDto(booking as BookingWithRelations, actor.id);
  }

  // ---------------------------------------------------------------------------
  // 생성
  // ---------------------------------------------------------------------------

  async create(dto: CreateBookingDto, actor: ActorContext): Promise<BookingDto> {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);

    this.validateTimeShape(startAt, endAt);
    this.assertFuture(startAt);
    this.assertDurationWithinLimit(startAt, endAt);
    await this.assertRoomActive(dto.roomId);

    try {
      const created = await this.prisma.booking.create({
        data: {
          roomId: dto.roomId,
          userId: actor.id,
          title: dto.title,
          description: dto.description,
          startAt,
          endAt,
          createdByAdmin: false,
        },
        include: BOOKING_RELATIONS,
      });
      return toBookingDto(created as BookingWithRelations, actor.id);
    } catch (error) {
      throw this.mapPrismaError(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 수정
  // ---------------------------------------------------------------------------

  async update(
    id: string,
    dto: UpdateBookingDto,
    actor: ActorContext,
  ): Promise<UpdateBookingResponseDto> {
    const existing = await this.prisma.booking.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'BOOKING_NOT_FOUND',
        message: '예약을 찾을 수 없습니다.',
      });
    }

    // 본인 또는 ADMIN만 수정 가능.
    if (existing.userId !== actor.id && actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException({
        code: 'BOOKING_OWNERSHIP_REQUIRED',
        message: '본인 예약만 수정할 수 있습니다.',
      });
    }

    // USER는 시작 시간이 지난 예약을 수정할 수 없다 (ADMIN은 가능 — 회고/감사 목적).
    if (existing.startAt.getTime() <= Date.now() && actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException({
        code: 'BOOKING_PAST_NOT_EDITABLE',
        message: '이미 시작된 예약은 수정할 수 없습니다.',
      });
    }

    const nextStart = dto.startAt !== undefined ? new Date(dto.startAt) : existing.startAt;
    const nextEnd = dto.endAt !== undefined ? new Date(dto.endAt) : existing.endAt;

    if (dto.startAt !== undefined || dto.endAt !== undefined) {
      this.validateTimeShape(nextStart, nextEnd);
      // 시작이 바뀌는 경우에만 미래 검증 — 종료만 늘리는 케이스를 막지 않기 위해.
      if (dto.startAt !== undefined) {
        this.assertFuture(nextStart);
      }
      this.assertDurationWithinLimit(nextStart, nextEnd);
    }

    const updateData: Prisma.BookingUpdateInput = {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.startAt !== undefined && { startAt: nextStart }),
      ...(dto.endAt !== undefined && { endAt: nextEnd }),
    };

    // 반복 회차(recurrenceId !== null) 수정은 자동으로 시리즈에서 분리한다.
    // docs/03-api-spec.md §4.4 — recurrenceId/Index NULL 처리 + 원 시리즈에 EXDATE 추가.
    // (단일 예약은 그대로 일반 update)
    if (existing.recurrenceId !== null) {
      return await this.detachInstanceAndUpdate(
        id,
        existing.recurrenceId,
        existing.startAt,
        updateData,
        actor.id,
      );
    }

    try {
      const updated = await this.prisma.booking.update({
        where: { id },
        data: updateData,
        include: BOOKING_RELATIONS,
      });
      return toBookingDto(updated as BookingWithRelations, actor.id);
    } catch (error) {
      throw this.mapPrismaError(error);
    }
  }

  /**
   * 반복 회차를 수정하면서 시리즈에서 분리.
   * - booking.recurrenceId / recurrenceIndex를 NULL로 만들고 사용자가 보낸 변경을 적용.
   * - 원 시리즈에 RecurrenceException(excludedDate=원래 시작일의 KST 일자) 추가.
   * - 같은 일자 EXDATE가 이미 있으면(P2002) 예외만 무시하고 분리는 그대로 수행.
   *
   * 트랜잭션 안에서 booking 업데이트와 EXDATE 추가가 함께 일어나야 한다 — 둘 중 하나만
   * 성공하면 시리즈 펼침 결과와 booking 행이 어긋난다.
   */
  private async detachInstanceAndUpdate(
    id: string,
    recurrenceId: string,
    originalStartAt: Date,
    updateData: Prisma.BookingUpdateInput,
    viewerId: string,
  ): Promise<UpdateBookingResponseDto> {
    const excludedDateUtc = kstDayStartUtc(originalStartAt);
    const detachData: Prisma.BookingUpdateInput = {
      ...updateData,
      recurrence: { disconnect: true },
      recurrenceIndex: null,
    };

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const next = await tx.booking.update({
          where: { id },
          data: detachData,
          include: BOOKING_RELATIONS,
        });
        await tx.recurrenceException.create({
          data: {
            recurrenceId,
            excludedDate: excludedDateUtc,
            reason: null,
          },
        });
        return next;
      });
      return {
        ...toBookingDto(updated as BookingWithRelations, viewerId),
        detachedFromSeries: true,
      };
    } catch (error) {
      // 같은 일자에 EXDATE가 이미 등록된 경우 — booking 분리만 수행.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        try {
          const updated = await this.prisma.booking.update({
            where: { id },
            data: detachData,
            include: BOOKING_RELATIONS,
          });
          return {
            ...toBookingDto(updated as BookingWithRelations, viewerId),
            detachedFromSeries: true,
          };
        } catch (fallbackError) {
          throw this.mapPrismaError(fallbackError);
        }
      }
      throw this.mapPrismaError(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 삭제 (소프트)
  // ---------------------------------------------------------------------------

  /**
   * 예약 삭제. docs/03-api-spec.md §4.5.
   *
   * `scope`는 반복 회차에서만 의미 있다. 단일 예약(`recurrenceId=null`)은 항상 단순
   * 소프트 삭제로 처리된다.
   *
   * - INSTANCE (기본): 해당 회차만 소프트 삭제 + RecurrenceException 추가
   * - FOLLOWING       : 이 회차부터 미래 모든 회차 소프트 삭제 + 시리즈 untilAt 단축
   * - SERIES          : 시리즈 전체 삭제 (모든 미래 회차 + RecurrenceRule)
   */
  async softDelete(
    id: string,
    actor: ActorContext,
    scope: DeleteBookingScope = DeleteBookingScope.INSTANCE,
  ): Promise<void> {
    const existing = await this.prisma.booking.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'BOOKING_NOT_FOUND',
        message: '예약을 찾을 수 없습니다.',
      });
    }

    if (existing.userId !== actor.id && actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException({
        code: 'BOOKING_OWNERSHIP_REQUIRED',
        message: '본인 예약만 삭제할 수 있습니다.',
      });
    }

    if (existing.startAt.getTime() <= Date.now() && actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException({
        code: 'BOOKING_PAST_NOT_DELETABLE',
        message: '이미 시작된 예약은 삭제할 수 없습니다.',
      });
    }

    // 단일 예약: scope 값과 무관하게 단순 소프트 삭제.
    if (existing.recurrenceId === null) {
      await this.prisma.booking.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      return;
    }

    const recurrenceId = existing.recurrenceId;
    const now = new Date();

    if (scope === DeleteBookingScope.INSTANCE) {
      // 해당 회차 소프트 삭제 + RecurrenceException 등록.
      // excludedDate는 KST 일자(`startAt`을 KST 캘린더로 절단)로 저장.
      const excludedDateUtc = kstDayStartUtc(existing.startAt);
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.booking.update({
            where: { id },
            data: { deletedAt: now },
          });
          await tx.recurrenceException.create({
            data: {
              recurrenceId,
              excludedDate: excludedDateUtc,
              reason: null,
            },
          });
        });
      } catch (error) {
        // 이미 같은 일자에 RecurrenceException이 등록되어 있는 경우 — booking만 소프트 삭제.
        // (회차의 일자별 EXDATE는 unique 제약이므로 P2002 가능)
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          await this.prisma.booking.update({
            where: { id },
            data: { deletedAt: now },
          });
          return;
        }
        throw error;
      }
      return;
    }

    if (scope === DeleteBookingScope.FOLLOWING) {
      // 이 회차 startAt 이상의 미래 회차들을 소프트 삭제 + 시리즈 untilAt을 직전으로 단축.
      const cutoff = existing.startAt;
      await this.prisma.$transaction([
        this.prisma.booking.updateMany({
          where: {
            recurrenceId,
            startAt: { gte: cutoff },
            deletedAt: null,
          },
          data: { deletedAt: now },
        }),
        // untilAt = cutoff (이 회차 직전까지 유효). 회차의 endAt이 아닌 startAt을 사용 —
        // "이 회차부터 미래"를 잘라낸 의미를 그대로 표현.
        this.prisma.recurrenceRule.update({
          where: { id: recurrenceId },
          data: { untilAt: cutoff },
        }),
      ]);
      return;
    }

    // SERIES: 미래 회차 소프트 삭제 + RecurrenceRule 하드 삭제.
    // 과거 회차는 감사/회고 목적으로 유지 (FK onDelete: SetNull로 recurrenceId만 떨어짐).
    await this.prisma.$transaction([
      this.prisma.booking.updateMany({
        where: {
          recurrenceId,
          startAt: { gte: now },
          deletedAt: null,
        },
        data: { deletedAt: now },
      }),
      this.prisma.recurrenceRule.delete({ where: { id: recurrenceId } }),
    ]);
  }

  // ---------------------------------------------------------------------------
  // 회차 인스턴스 일괄 충돌 검사 (반복 예약 시리즈용)
  // ---------------------------------------------------------------------------

  /**
   * 동일 회의실의 기존 예약과 시간이 겹치는 회차 인스턴스의 인덱스를 반환한다.
   *
   * 단일 SQL 쿼리(VALUES + tstzrange `&&`) 로 모든 인스턴스를 한 번에 비교하므로
   * 회차 수 N에 대해 N+1 쿼리가 발생하지 않는다. EXCLUDE 제약과 동일한
   * `tstzrange(..., '[)')` 반열림 구간을 사용해 9-10시 / 10-11시 같은 인접 예약은
   * 충돌로 판정하지 않는다.
   *
   * 입력 인스턴스 간의 자체 겹침은 검사하지 않는다(rrule 펼침 결과는 정의상
   * 서로 겹치지 않음). 호출자(reucrrence service) 가 RRULE 검증을 선행하는 것을 전제.
   *
   * @returns 충돌이 발생한 인스턴스의 인덱스(0-base) 오름차순 배열
   */
  async findConflictingInstanceIndices(
    roomId: string,
    instances: ReadonlyArray<{ startAt: Date; endAt: Date }>,
  ): Promise<number[]> {
    if (instances.length === 0) return [];

    const valuesRows = instances.map(
      (inst, idx) =>
        Prisma.sql`(${idx}::int, tstzrange(${inst.startAt}::timestamptz, ${inst.endAt}::timestamptz, '[)'))`,
    );

    const rows = await this.prisma.$queryRaw<Array<{ idx: number | bigint }>>(
      Prisma.sql`
        WITH instances(idx, rng) AS (
          VALUES ${Prisma.join(valuesRows)}
        )
        SELECT DISTINCT i.idx
        FROM instances i
        JOIN booking b
          ON b.room_id = ${roomId}::uuid
         AND b.deleted_at IS NULL
         AND tstzrange(b.start_at, b.end_at, '[)') && i.rng
        ORDER BY i.idx ASC
      `,
    );

    return rows.map((r) => Number(r.idx));
  }

  // ---------------------------------------------------------------------------
  // 검증 헬퍼
  // ---------------------------------------------------------------------------

  private validateTimeShape(startAt: Date, endAt: Date): void {
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_TIME_FORMAT',
        message: '시간 형식이 올바르지 않습니다.',
      });
    }
    if (endAt.getTime() <= startAt.getTime()) {
      throw new BadRequestException({
        code: 'INVALID_TIME_RANGE',
        message: '종료 시간은 시작 시간보다 이후여야 합니다.',
      });
    }
    if (!isQuarterAligned(startAt) || !isQuarterAligned(endAt)) {
      throw new BadRequestException({
        code: 'BOOKING_TIME_NOT_QUARTER',
        message: '시작/종료 시간은 15분 단위여야 합니다.',
      });
    }
  }

  private assertFuture(startAt: Date): void {
    if (startAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: 'BOOKING_TIME_PAST',
        message: '시작 시간은 현재 이후여야 합니다.',
      });
    }
  }

  private assertDurationWithinLimit(startAt: Date, endAt: Date): void {
    const minutes = (endAt.getTime() - startAt.getTime()) / 60_000;
    if (minutes > MAX_DURATION_MINUTES) {
      throw new BadRequestException({
        code: 'BOOKING_DURATION_EXCEEDED',
        message: `예약은 최대 ${MAX_DURATION_MINUTES / 60}시간까지 가능합니다. 더 긴 시간이 필요하면 예외 신청을 이용해 주세요.`,
      });
    }
  }

  private async assertRoomActive(roomId: string): Promise<void> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, isActive: true },
    });
    if (!room) {
      throw new NotFoundException({
        code: 'ROOM_NOT_FOUND',
        message: '회의실을 찾을 수 없습니다.',
      });
    }
    if (!room.isActive) {
      throw new ConflictException({
        code: 'ROOM_INACTIVE',
        message: '비활성 상태의 회의실에는 예약할 수 없습니다.',
      });
    }
  }

  /**
   * Prisma → 도메인 예외 매핑.
   * - SQLSTATE 23P01 (EXCLUDE 위반) → BOOKING_TIME_CONFLICT
   * - 그 외는 원본을 그대로 던져 글로벌 필터가 처리.
   */
  private mapPrismaError(error: unknown): unknown {
    if (isExcludeConflictError(error)) {
      return new ConflictException({
        code: 'BOOKING_TIME_CONFLICT',
        message: '선택한 시간대에 다른 예약이 있습니다.',
      });
    }
    return error;
  }
}

function isQuarterAligned(date: Date): boolean {
  return (
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0 &&
    date.getUTCMinutes() % QUARTER_MINUTES === 0
  );
}

/**
 * Prisma는 EXCLUDE 위반을 버전/드라이버에 따라 다르게 표면화한다.
 * - PrismaClientKnownRequestError + meta.code='23P01'
 * - 또는 PrismaClientUnknownRequestError + 메시지에 '23P01'/제약명 포함
 *
 * 두 경로 모두 한 번에 잡는다.
 */
function isExcludeConflictError(error: unknown): boolean {
  const constraintName = 'excl_booking_no_overlap';
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const metaCode = (error.meta as { code?: string } | undefined)?.code;
    if (metaCode === '23P01') return true;
    if (typeof error.message === 'string' && error.message.includes(constraintName)) return true;
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    const msg = String(error.message ?? '');
    if (msg.includes('23P01') || msg.includes(constraintName)) return true;
  }
  // 테스트 더블 등에서 평범한 객체로 흉내내는 경우(meta.code='23P01')도 허용.
  if (error && typeof error === 'object') {
    const meta = (error as { meta?: { code?: string } }).meta;
    if (meta?.code === '23P01') return true;
  }
  return false;
}

/**
 * 임의의 UTC instant를 KST 캘린더상 같은 일자의 00:00 KST에 해당하는 UTC instant로 변환.
 * 예: 2026-04-27T00:00:00Z (KST 09:00) → 2026-04-26T15:00:00Z (KST 00:00)
 *
 * RecurrenceException.excludedDate(DATE 컬럼) 저장 시 사용 — 시간 부분은 DB에서 잘리지만
 * 명시적 경계로 변환해 컬럼간 의도 일관성을 유지한다.
 */
function kstDayStartUtc(instant: Date): Date {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kstMs = instant.getTime() + KST_OFFSET_MS;
  const kstDayStartMs = Math.floor(kstMs / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000);
  return new Date(kstDayStartMs - KST_OFFSET_MS);
}
