import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';

import { PrismaService } from '../../infra/prisma/prisma.service';

import {
  type CreateExceptionResultDto,
  type CreateRecurrenceResultDto,
  type RecurrenceDto,
  type RecurrenceWithRelations,
  type SkippedInstanceDto,
  toRecurrenceDto,
} from './dto/recurrence.dto';
import {
  expandRecurrence,
  InvalidRRuleError,
  type RecurrenceInstance,
} from './recurrence-expansion';

const KST = 'Asia/Seoul';
const QUARTER_MINUTES = 15;
const MAX_DURATION_MINUTES = 240;

const RECURRENCE_RELATIONS = {
  room: { select: { id: true, name: true } },
  user: { select: { id: true, name: true, department: true } },
  exceptions: true,
  bookings: {
    where: { deletedAt: null },
    select: { id: true, startAt: true, endAt: true },
  },
} as const;

export interface ActorContext {
  id: string;
  role: UserRole;
}

/**
 * Service 입력. controller가 DTO를 파싱한 뒤 dtstart를 UTC `Date`로 변환해 넘긴다.
 * (D-2/D-3 — `tzid` 없이 항상 UTC instant로 흐르게 하는 정책)
 */
export interface CreateRecurrenceInput {
  roomId: string;
  title: string;
  description?: string;
  /** UTC `Date` — controller에서 fromZonedTime으로 변환 완료. */
  dtstart: Date;
  durationMinutes: number;
  rrule: string;
}

@Injectable()
export class RecurrenceService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // 시리즈 생성 — POST /recurrences
  // ---------------------------------------------------------------------------

  /**
   * 시리즈를 만들고 회차들을 Booking에 펼쳐 INSERT 한다.
   *
   * 충돌 처리는 **사전 검증 없이 INSERT 시도 → SQLSTATE 23P01 catch** 방식.
   * EXCLUDE 제약(`excl_booking_no_overlap`)이 진실의 원천이며 동시 INSERT race도
   * DB 레벨에서 차단된다.
   *
   * 흐름:
   *  1. 입력 검증 (durationMinutes 15분 단위, 회의실 활성, RRULE 유효)
   *  2. expandRecurrence — dtstart 기준 1년 절단, 인스턴스 펼침
   *  3. 모두 과거이면 ALL_INSTANCES_FAILED (시리즈 자체를 만들지 않음)
   *  4. RecurrenceRule INSERT
   *  5. 인스턴스마다 Booking INSERT 시도 — 23P01이면 skipped로 누적, 그 외 에러는 그대로 전파
   *  6. 0건 성공이면 RecurrenceRule 롤백(hard delete) 후 ALL_INSTANCES_FAILED
   */
  async create(
    input: CreateRecurrenceInput,
    actor: ActorContext,
  ): Promise<CreateRecurrenceResultDto> {
    this.validateDuration(input.durationMinutes);
    this.assertQuarterAligned(input.dtstart);
    await this.assertRoomActive(input.roomId);

    let expansion;
    try {
      expansion = expandRecurrence({
        rrule: input.rrule,
        dtstart: input.dtstart,
        durationMinutes: input.durationMinutes,
      });
    } catch (e) {
      if (e instanceof InvalidRRuleError) {
        throw new BadRequestException({
          code: 'INVALID_RRULE',
          message: 'RRULE이 유효하지 않습니다.',
          details: { reason: e.message },
        });
      }
      throw e;
    }

    if (expansion.instances.length === 0) {
      throw new ConflictException({
        code: 'ALL_INSTANCES_FAILED',
        message: '생성 가능한 회차가 없습니다.',
      });
    }

    // 미래 회차가 하나도 없으면 시리즈 자체를 만들지 않는다(과거만 있는 RRULE).
    const futureInstances = expansion.instances.filter((i) => !i.isPast);
    if (futureInstances.length === 0) {
      throw new ConflictException({
        code: 'ALL_INSTANCES_FAILED',
        message: '모든 회차가 과거 시점입니다.',
        details: { totalInstances: expansion.instances.length },
      });
    }

    const lastInstance = expansion.instances[expansion.instances.length - 1]!;
    const recurrence = await this.prisma.recurrenceRule.create({
      data: {
        roomId: input.roomId,
        userId: actor.id,
        title: input.title,
        description: input.description,
        rrule: input.rrule,
        durationMinutes: input.durationMinutes,
        startAt: input.dtstart,
        untilAt: lastInstance.endAt,
      },
    });

    const skipped: SkippedInstanceDto[] = [];
    let createdCount = 0;

    for (const instance of expansion.instances) {
      if (instance.isPast) {
        skipped.push(this.toSkipped(instance, 'PAST_INSTANCE'));
        continue;
      }
      try {
        await this.prisma.booking.create({
          data: {
            roomId: input.roomId,
            userId: actor.id,
            title: input.title,
            description: input.description,
            startAt: instance.startAt,
            endAt: instance.endAt,
            recurrenceId: recurrence.id,
            recurrenceIndex: instance.index,
            createdByAdmin: false,
          },
        });
        createdCount += 1;
      } catch (error) {
        if (isExcludeConflictError(error)) {
          skipped.push(this.toSkipped(instance, 'TIME_CONFLICT'));
          continue;
        }
        // 그 외 에러 — 시리즈 정리 후 전파 (이미 만든 RecurrenceRule이 dangling 되지 않도록).
        await this.cleanupOrphanRecurrence(recurrence.id);
        throw error;
      }
    }

    if (createdCount === 0) {
      // 모든 회차가 충돌(또는 과거)로 실패 — 빈 시리즈 남기지 않는다.
      await this.cleanupOrphanRecurrence(recurrence.id);
      throw new ConflictException({
        code: 'ALL_INSTANCES_FAILED',
        message: '모든 회차가 충돌로 실패했습니다.',
        details: { skippedCount: skipped.length },
      });
    }

    return {
      recurrenceId: recurrence.id,
      createdBookings: createdCount,
      skippedBookings: skipped,
    };
  }

  // ---------------------------------------------------------------------------
  // 조회 — GET /recurrences/:id
  // ---------------------------------------------------------------------------

  async findById(id: string, actor: ActorContext): Promise<RecurrenceDto> {
    const rule = await this.prisma.recurrenceRule.findUnique({
      where: { id },
      include: RECURRENCE_RELATIONS,
    });
    if (!rule) {
      throw new NotFoundException({
        code: 'RECURRENCE_NOT_FOUND',
        message: '반복 시리즈를 찾을 수 없습니다.',
      });
    }

    // USER는 자기 시리즈만 조회 가능. ADMIN은 전체.
    if (rule.userId !== actor.id && actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException({
        code: 'RECURRENCE_OWNERSHIP_REQUIRED',
        message: '본인 시리즈만 조회할 수 있습니다.',
      });
    }

    return toRecurrenceDto(rule as RecurrenceWithRelations, new Date());
  }

  // ---------------------------------------------------------------------------
  // 수정 — PATCH /recurrences/:id (title/description만)
  // ---------------------------------------------------------------------------

  async update(
    id: string,
    dto: { title?: string; description?: string },
    actor: ActorContext,
  ): Promise<RecurrenceDto> {
    const existing = await this.prisma.recurrenceRule.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'RECURRENCE_NOT_FOUND',
        message: '반복 시리즈를 찾을 수 없습니다.',
      });
    }
    if (existing.userId !== actor.id && actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException({
        code: 'RECURRENCE_OWNERSHIP_REQUIRED',
        message: '본인 시리즈만 수정할 수 있습니다.',
      });
    }

    if (dto.title === undefined && dto.description === undefined) {
      // 변경 없음 — 그냥 현재 상태 반환.
      return this.findById(id, actor);
    }

    const updated = await this.prisma.recurrenceRule.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
      include: RECURRENCE_RELATIONS,
    });
    return toRecurrenceDto(updated as RecurrenceWithRelations, new Date());
  }

  // ---------------------------------------------------------------------------
  // 삭제 — DELETE /recurrences/:id?from=...
  // ---------------------------------------------------------------------------

  /**
   * `from` 미지정: 시리즈 + 미래 회차 전체 소프트 삭제 + RecurrenceRule 하드 삭제
   * `from` 지정 : `from` 이후 회차만 소프트 삭제 + untilAt 단축
   */
  async remove(id: string, from: Date | undefined, actor: ActorContext): Promise<void> {
    const existing = await this.prisma.recurrenceRule.findUnique({
      where: { id },
      select: { id: true, userId: true, startAt: true },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'RECURRENCE_NOT_FOUND',
        message: '반복 시리즈를 찾을 수 없습니다.',
      });
    }
    if (existing.userId !== actor.id && actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException({
        code: 'RECURRENCE_OWNERSHIP_REQUIRED',
        message: '본인 시리즈만 삭제할 수 있습니다.',
      });
    }

    const now = new Date();
    if (from !== undefined) {
      if (Number.isNaN(from.getTime())) {
        throw new BadRequestException({
          code: 'INVALID_TIME_FORMAT',
          message: 'from이 올바르지 않습니다.',
        });
      }
      // `from` 시점 이후 + 미래 회차만 소프트 삭제.
      const cutoff = new Date(Math.max(from.getTime(), now.getTime()));
      await this.prisma.$transaction([
        this.prisma.booking.updateMany({
          where: {
            recurrenceId: id,
            startAt: { gte: cutoff },
            deletedAt: null,
          },
          data: { deletedAt: now },
        }),
        this.prisma.recurrenceRule.update({
          where: { id },
          data: { untilAt: cutoff },
        }),
      ]);
      return;
    }

    // 전체 삭제: 미래 회차 소프트 삭제 + 시리즈 하드 삭제.
    // (과거 회차는 감사/회고 목적으로 유지 — onDelete: SetNull로 recurrenceId만 떨어진다.)
    await this.prisma.$transaction([
      this.prisma.booking.updateMany({
        where: {
          recurrenceId: id,
          startAt: { gte: now },
          deletedAt: null,
        },
        data: { deletedAt: now },
      }),
      this.prisma.recurrenceRule.delete({ where: { id } }),
    ]);
  }

  // ---------------------------------------------------------------------------
  // EXDATE 추가 — POST /recurrences/:id/exceptions
  // ---------------------------------------------------------------------------

  /**
   * `excludedDate`(KST 일자)에 해당하는 시리즈 회차를 EXDATE로 등록하고
   * 매칭 Booking을 소프트 삭제한다.
   *
   * 같은 슬롯 재예약은 부분 인덱스(`WHERE deleted_at IS NULL`)에 의해 즉시 가능 —
   * EXCLUDE 제약이 deleted된 행을 제외하므로.
   */
  async addException(
    recurrenceId: string,
    dto: { excludedDate: string; reason?: string },
    actor: ActorContext,
  ): Promise<CreateExceptionResultDto> {
    const rule = await this.prisma.recurrenceRule.findUnique({
      where: { id: recurrenceId },
      select: { id: true, userId: true, durationMinutes: true },
    });
    if (!rule) {
      throw new NotFoundException({
        code: 'RECURRENCE_NOT_FOUND',
        message: '반복 시리즈를 찾을 수 없습니다.',
      });
    }
    if (rule.userId !== actor.id && actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException({
        code: 'RECURRENCE_OWNERSHIP_REQUIRED',
        message: '본인 시리즈만 수정할 수 있습니다.',
      });
    }

    // KST 캘린더상 해당 일자(00:00 ~ 24:00 KST)에 시작하는 회차 Booking을 찾는다.
    const dayBoundary = parseKstDayBoundary(dto.excludedDate);
    const matching = await this.prisma.booking.findFirst({
      where: {
        recurrenceId,
        startAt: { gte: dayBoundary.startUtc, lt: dayBoundary.endUtc },
        deletedAt: null,
      },
      select: { id: true },
    });

    // unique([recurrenceId, excludedDate]) — 같은 일자 중복 등록은 P2002로 떨어짐.
    let exception;
    try {
      exception = await this.prisma.$transaction(async (tx) => {
        const created = await tx.recurrenceException.create({
          data: {
            recurrenceId,
            excludedDate: dayBoundary.startUtc, // DATE 컬럼 — 시간은 무시됨
            reason: dto.reason,
          },
        });
        if (matching) {
          await tx.booking.update({
            where: { id: matching.id },
            data: { deletedAt: new Date() },
          });
        }
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'EXCEPTION_ALREADY_EXISTS',
          message: '해당 일자에 이미 예외가 등록되어 있습니다.',
        });
      }
      throw error;
    }

    return {
      id: exception.id,
      excludedDate: formatInTimeZone(exception.excludedDate, KST, 'yyyy-MM-dd'),
      reason: exception.reason,
      deletedBookingId: matching?.id ?? null,
    };
  }

  // ---------------------------------------------------------------------------
  // 검증 헬퍼
  // ---------------------------------------------------------------------------

  private validateDuration(durationMinutes: number): void {
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      throw new BadRequestException({
        code: 'INVALID_DURATION',
        message: 'durationMinutes는 양의 정수여야 합니다.',
      });
    }
    if (durationMinutes % QUARTER_MINUTES !== 0) {
      throw new BadRequestException({
        code: 'BOOKING_TIME_NOT_QUARTER',
        message: 'durationMinutes는 15분 단위여야 합니다.',
      });
    }
    if (durationMinutes > MAX_DURATION_MINUTES) {
      throw new BadRequestException({
        code: 'BOOKING_DURATION_EXCEEDED',
        message: `회차 길이는 최대 ${MAX_DURATION_MINUTES / 60}시간입니다.`,
      });
    }
  }

  private assertQuarterAligned(startAt: Date): void {
    if (Number.isNaN(startAt.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_TIME_FORMAT',
        message: '시간 형식이 올바르지 않습니다.',
      });
    }
    if (
      startAt.getUTCSeconds() !== 0 ||
      startAt.getUTCMilliseconds() !== 0 ||
      startAt.getUTCMinutes() % QUARTER_MINUTES !== 0
    ) {
      throw new BadRequestException({
        code: 'BOOKING_TIME_NOT_QUARTER',
        message: '시작 시각은 15분 단위여야 합니다.',
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

  private async cleanupOrphanRecurrence(recurrenceId: string): Promise<void> {
    try {
      await this.prisma.recurrenceRule.delete({ where: { id: recurrenceId } });
    } catch {
      // 정리 실패는 무시 — 외부에는 더 의미 있는 본 에러를 전파.
    }
  }

  private toSkipped(
    instance: RecurrenceInstance,
    reason: SkippedInstanceDto['reason'],
  ): SkippedInstanceDto {
    return {
      index: instance.index,
      instanceDate: formatInTimeZone(instance.startAt, KST, 'yyyy-MM-dd'),
      startAt: instance.startAt.toISOString(),
      reason,
    };
  }
}

/**
 * KST 기준 YYYY-MM-DD 일자의 [00:00, 24:00) UTC 경계.
 * 예: '2026-05-25' → start=2026-05-24T15:00:00Z, end=2026-05-25T15:00:00Z
 */
function parseKstDayBoundary(date: string): { startUtc: Date; endUtc: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new BadRequestException({
      code: 'INVALID_TIME_FORMAT',
      message: 'excludedDate는 YYYY-MM-DD 형식이어야 합니다.',
    });
  }
  // KST = UTC+9, DST 미사용 — 하드코딩으로 단순/명시적 변환.
  const startUtc = new Date(`${date}T00:00:00.000+09:00`);
  if (Number.isNaN(startUtc.getTime())) {
    throw new BadRequestException({
      code: 'INVALID_TIME_FORMAT',
      message: 'excludedDate가 유효하지 않습니다.',
    });
  }
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startUtc, endUtc };
}

/**
 * Prisma EXCLUDE 위반(SQLSTATE 23P01) 감지 — booking.service의 동일 헬퍼와 정렬.
 *
 * Prisma 버전/드라이버에 따라 알려진 에러 + meta.code='23P01' 또는
 * 알려지지 않은 에러 + 메시지에 제약명 포함 형태로 표면화된다.
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
  if (error && typeof error === 'object') {
    const meta = (error as { meta?: { code?: string } }).meta;
    if (meta?.code === '23P01') return true;
  }
  return false;
}
