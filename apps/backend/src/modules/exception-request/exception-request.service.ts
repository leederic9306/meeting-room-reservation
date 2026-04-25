import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Booking, ExceptionRequestStatus, Prisma, UserRole } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';

import type { Env } from '../../config/env.validation';
import { MailTemplateRenderer } from '../../infra/mail/mail-template.renderer';
import { MailService } from '../../infra/mail/mail.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

import type { CreateAdminBookingDto } from './dto/create-admin-booking.dto';
import type { CreateExceptionRequestDto } from './dto/create-exception-request.dto';
import {
  type ApproveExceptionRequestResponseDto,
  type ConflictHintDto,
  type CreateExceptionRequestResponseDto,
  type ExceptionRequestDto,
  type ExceptionRequestWithRelations,
  toExceptionRequestDto,
} from './dto/exception-request.dto';
import type { ListExceptionRequestsQuery } from './dto/list-exception-requests.query';

const KST = 'Asia/Seoul';
const KST_DATE_FORMAT = "yyyy-MM-dd (EEE) HH:mm 'KST'";
const QUARTER_MINUTES = 15;
const NORMAL_BOOKING_MAX_MINUTES = 240; // 일반 예약 상한 — 이를 초과해야 예외 신청 의미 있음
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const REQUEST_RELATIONS = {
  user: { select: { id: true, name: true, department: true, email: true } },
  room: { select: { id: true, name: true } },
  reviewer: { select: { id: true, name: true } },
  booking: { select: { id: true } },
} as const;

/**
 * 관리자 직접 예약(/admin/bookings) 생성 시 사용하는 include — 메일 발송용으로 user 의 email 까지 포함.
 * BOOKING_RELATIONS 확장이 아니라 별도로 두는 이유: email 은 일반 booking 응답에 노출되면 안 되므로,
 * 메일 발송 경로에서만 fetch 한다.
 */
const ADMIN_BOOKING_RELATIONS = {
  room: { select: { id: true, name: true } },
  user: { select: { id: true, name: true, department: true, email: true } },
} as const;

export interface ActorContext {
  id: string;
  role: UserRole;
}

export interface PaginatedExceptionRequests {
  data: ExceptionRequestDto[];
  meta: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

/**
 * 관리자 예외 신청 워크플로우. docs/03-api-spec.md §6.
 *
 * 핵심 정책:
 *  - 신청은 4시간 초과 또는 과거 시점에 한해 의미 있다(EXCEPTION_NOT_REQUIRED 검증).
 *  - 신청 시점 충돌은 참고용 — 승인 시점에 재검증한다.
 *  - 승인 흐름은 트랜잭션 내 SELECT FOR UPDATE 로 PENDING 행을 잠그고,
 *    인접 충돌은 EXCLUDE 제약(SQLSTATE 23P01)이 진실의 원천. 동시 승인 race도 DB가 차단.
 *  - 메일 발송은 트랜잭션 외부(커밋 후)에서 — 발송 실패가 상태 전이를 롤백하지 않도록.
 *  - AuditLog 는 관리자 행위(승인/반려/직접 예약)에만 기록.
 *
 * 메일 시점:
 *  - create  → 신청자에게 접수 확인 (참고용 충돌 건수 동봉)
 *  - approve → 신청자에게 승인 결과 + Booking ID
 *  - reject  → 신청자에게 반려 사유
 *  - createAdminBooking → 대상 사용자에게 관리자 직접 예약 알림
 */
@Injectable()
export class ExceptionRequestService {
  private readonly logger = new Logger(ExceptionRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly mailTemplates: MailTemplateRenderer,
    private readonly config: ConfigService<Env, true>,
    private readonly auditLog: AuditLogService,
  ) {}

  // ---------------------------------------------------------------------------
  // 사용자 — 신청 / 내 목록 / 취소
  // ---------------------------------------------------------------------------

  async create(
    dto: CreateExceptionRequestDto,
    actor: ActorContext,
  ): Promise<CreateExceptionRequestResponseDto> {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);

    this.validateTimeShape(startAt, endAt);
    await this.assertRoomActive(dto.roomId);
    this.assertExceptionMeaningful(startAt, endAt);

    const created = await this.prisma.exceptionRequest.create({
      data: {
        userId: actor.id,
        roomId: dto.roomId,
        title: dto.title,
        reason: dto.reason,
        startAt,
        endAt,
        status: ExceptionRequestStatus.PENDING,
      },
      include: REQUEST_RELATIONS,
    });

    // 신청 시점 충돌 힌트 — 승인 시점에 다시 검증되므로 안내 목적.
    const conflicts = await this.findOverlappingBookings(dto.roomId, startAt, endAt);

    // 신청자에게 접수 확인 메일 — fire-and-forget. 실패해도 신청 자체는 성공.
    void this.sendReceiptMail(
      created as ExceptionRequestWithRelations & { user: { email: string } },
      conflicts.length,
    ).catch((e) => {
      this.logger.error(
        `접수 메일 발송 실패: requestId=${created.id}`,
        e instanceof Error ? e.stack : e,
      );
    });

    return {
      ...toExceptionRequestDto(created as ExceptionRequestWithRelations),
      conflicts,
    };
  }

  async listMine(
    actor: ActorContext,
    query: ListExceptionRequestsQuery,
  ): Promise<PaginatedExceptionRequests> {
    return this.list(
      {
        ...query,
        userId: actor.id, // 본인 자체로 강제 — 쿼리의 userId는 무시.
      },
      query.page,
      query.limit,
      undefined,
    );
  }

  async cancel(id: string, actor: ActorContext): Promise<ExceptionRequestDto> {
    const existing = await this.prisma.exceptionRequest.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'EXCEPTION_REQUEST_NOT_FOUND',
        message: '예외 신청을 찾을 수 없습니다.',
      });
    }
    if (existing.userId !== actor.id) {
      throw new ForbiddenException({
        code: 'EXCEPTION_REQUEST_OWNERSHIP_REQUIRED',
        message: '본인 신청만 취소할 수 있습니다.',
      });
    }
    if (existing.status !== ExceptionRequestStatus.PENDING) {
      throw new ConflictException({
        code: 'INVALID_STATUS_TRANSITION',
        message: '대기 상태의 신청만 취소할 수 있습니다.',
      });
    }

    const updated = await this.prisma.exceptionRequest.update({
      where: { id },
      data: { status: ExceptionRequestStatus.CANCELLED },
      include: REQUEST_RELATIONS,
    });
    return toExceptionRequestDto(updated as ExceptionRequestWithRelations);
  }

  // ---------------------------------------------------------------------------
  // 관리자 — 목록 / 승인 / 반려
  // ---------------------------------------------------------------------------

  async listAdmin(query: ListExceptionRequestsQuery): Promise<PaginatedExceptionRequests> {
    // 관리자 목록은 status 미지정 시 PENDING 만 노출 — 검토 대시보드 기본 뷰.
    const status = query.status ?? ExceptionRequestStatus.PENDING;
    return this.list(
      { ...query, status, userId: query.userId },
      query.page,
      query.limit,
      undefined,
    );
  }

  /**
   * 승인 — 트랜잭션 내 SELECT FOR UPDATE + 충돌 재검증 + Booking INSERT + 상태 전이.
   * 메일 발송과 AuditLog 기록은 커밋 후 (메일 실패가 트랜잭션을 롤백하지 않게).
   *
   * 동시 승인 race 보호:
   *  - request 행 자체는 FOR UPDATE 로 단일 직렬화
   *  - Booking 시간 충돌은 EXCLUDE 제약(23P01) 으로 차단 → BOOKING_TIME_CONFLICT 변환
   */
  async approve(id: string, actor: ActorContext): Promise<ApproveExceptionRequestResponseDto> {
    const result = await this.prisma.$transaction(
      async (tx) => {
        // 1) PENDING 행을 FOR UPDATE 로 잠근다 — 동시 승인/반려 race 차단.
        const lockedRows = await tx.$queryRaw<
          Array<{
            id: string;
            user_id: string;
            room_id: string;
            title: string;
            description: string | null;
            start_at: Date;
            end_at: Date;
            status: ExceptionRequestStatus;
          }>
        >`SELECT id, user_id, room_id, title, reason AS description, start_at, end_at, status
          FROM exception_request WHERE id = ${id}::uuid FOR UPDATE`;

        const locked = lockedRows[0];
        if (!locked) {
          throw new NotFoundException({
            code: 'EXCEPTION_REQUEST_NOT_FOUND',
            message: '예외 신청을 찾을 수 없습니다.',
          });
        }
        if (locked.status !== ExceptionRequestStatus.PENDING) {
          throw new ConflictException({
            code: 'INVALID_STATUS_TRANSITION',
            message: '이미 처리된 신청입니다.',
          });
        }

        // 2) 충돌 재검증 — 신청 시점과 다를 수 있다(다른 예약이 새로 들어왔을 수 있음).
        const conflicts = await this.findOverlappingBookings(
          locked.room_id,
          locked.start_at,
          locked.end_at,
          tx,
        );
        if (conflicts.length > 0) {
          throw new ConflictException({
            code: 'BOOKING_TIME_CONFLICT',
            message: '승인 시점에 다른 예약이 존재합니다.',
            details: { conflicts },
          });
        }

        // 3) Booking INSERT — EXCLUDE 제약이 race 까지 차단.
        let booking: Booking;
        try {
          booking = await tx.booking.create({
            data: {
              roomId: locked.room_id,
              userId: locked.user_id,
              title: locked.title,
              description: locked.description,
              startAt: locked.start_at,
              endAt: locked.end_at,
              createdByAdmin: true,
              exceptionRequestId: locked.id,
            },
          });
        } catch (error) {
          if (isExcludeConflictError(error)) {
            throw new ConflictException({
              code: 'BOOKING_TIME_CONFLICT',
              message: '승인 시점에 다른 예약이 존재합니다.',
            });
          }
          throw error;
        }

        // 4) ExceptionRequest 상태 전이.
        const reviewedAt = new Date();
        const updated = await tx.exceptionRequest.update({
          where: { id: locked.id },
          data: {
            status: ExceptionRequestStatus.APPROVED,
            reviewerId: actor.id,
            reviewedAt,
          },
          include: REQUEST_RELATIONS,
        });

        // 5) AuditLog (트랜잭션 내 — 상태 전이와 원자성 유지).
        await this.auditLog.record(
          {
            action: 'EXCEPTION_APPROVED',
            targetType: 'EXCEPTION_REQUEST',
            targetId: locked.id,
            actorId: actor.id,
            payload: { bookingId: booking.id, requesterId: locked.user_id },
          },
          tx,
        );

        return {
          updated: updated as ExceptionRequestWithRelations & { user: { email: string } },
          booking,
          reviewedAt,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    // 6) 메일 발송 — 트랜잭션 외부에서, 실패해도 승인은 그대로 유지.
    void this.sendApprovalMail(result.updated, result.booking).catch((e) => {
      this.logger.error(
        `승인 메일 발송 실패: requestId=${result.updated.id}`,
        e instanceof Error ? e.stack : e,
      );
    });

    return {
      id: result.updated.id,
      status: result.updated.status,
      bookingId: result.booking.id,
      reviewedAt: result.reviewedAt.toISOString(),
    };
  }

  async reject(
    id: string,
    reviewComment: string,
    actor: ActorContext,
  ): Promise<ExceptionRequestDto> {
    if (reviewComment.trim().length === 0) {
      throw new BadRequestException({
        code: 'REVIEW_COMMENT_REQUIRED',
        message: '반려 사유를 입력해주세요.',
      });
    }

    const reviewedAt = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<
        Array<{ id: string; user_id: string; status: ExceptionRequestStatus }>
      >`SELECT id, user_id, status FROM exception_request WHERE id = ${id}::uuid FOR UPDATE`;
      const locked = lockedRows[0];
      if (!locked) {
        throw new NotFoundException({
          code: 'EXCEPTION_REQUEST_NOT_FOUND',
          message: '예외 신청을 찾을 수 없습니다.',
        });
      }
      if (locked.status !== ExceptionRequestStatus.PENDING) {
        throw new ConflictException({
          code: 'INVALID_STATUS_TRANSITION',
          message: '이미 처리된 신청입니다.',
        });
      }

      const updated = await tx.exceptionRequest.update({
        where: { id: locked.id },
        data: {
          status: ExceptionRequestStatus.REJECTED,
          reviewerId: actor.id,
          reviewComment,
          reviewedAt,
        },
        include: REQUEST_RELATIONS,
      });

      await this.auditLog.record(
        {
          action: 'EXCEPTION_REJECTED',
          targetType: 'EXCEPTION_REQUEST',
          targetId: locked.id,
          actorId: actor.id,
          payload: { reviewComment, requesterId: locked.user_id },
        },
        tx,
      );

      return updated as ExceptionRequestWithRelations & { user: { email: string } };
    });

    void this.sendRejectionMail(result, reviewComment).catch((e) => {
      this.logger.error(
        `반려 메일 발송 실패: requestId=${result.id}`,
        e instanceof Error ? e.stack : e,
      );
    });

    return toExceptionRequestDto(result);
  }

  // ---------------------------------------------------------------------------
  // 관리자 직접 예약 — POST /admin/bookings
  // ---------------------------------------------------------------------------

  /**
   * 관리자 직접 예약. 4시간 / 과거 시점 / 시작-종료 길이 제한 모두 우회한다.
   * 단, 15분 단위와 시작 < 종료, 회의실 활성, EXCLUDE 충돌은 그대로 강제.
   * AuditLog 에 BOOKING_CREATED_BY_ADMIN 으로 기록.
   *
   * 대상 사용자에게는 알림 메일 발송(트랜잭션 외부, fire-and-forget) — 본인이 모르게 잡힌
   * 예약을 사후에라도 인지할 수 있도록.
   */
  async createAdminBooking(
    dto: CreateAdminBookingDto,
    actor: ActorContext,
  ): Promise<{ id: string; userId: string; createdByAdmin: true }> {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);

    this.validateTimeShape(startAt, endAt);
    await this.assertUserActive(dto.userId);
    await this.assertRoomActive(dto.roomId);

    let booking: Booking & {
      room: { id: string; name: string };
      user: { id: string; name: string; department: string | null; email: string };
    };
    try {
      booking = (await this.prisma.booking.create({
        data: {
          roomId: dto.roomId,
          userId: dto.userId,
          title: dto.title,
          description: dto.description,
          startAt,
          endAt,
          createdByAdmin: true,
        },
        include: ADMIN_BOOKING_RELATIONS,
      })) as typeof booking;
    } catch (error) {
      if (isExcludeConflictError(error)) {
        throw new ConflictException({
          code: 'BOOKING_TIME_CONFLICT',
          message: '선택한 시간대에 다른 예약이 있습니다.',
        });
      }
      throw error;
    }

    await this.auditLog.record({
      action: 'BOOKING_BY_ADMIN',
      targetType: 'BOOKING',
      targetId: booking.id,
      actorId: actor.id,
      payload: {
        targetUserId: dto.userId,
        roomId: dto.roomId,
        title: dto.title,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      },
    });

    // 대상 사용자 알림 메일 — fire-and-forget.
    // 처리자(admin) 이름은 별도 lookup (AuthUser 에는 name 이 없음).
    void this.sendAdminBookingMail(booking, actor.id).catch((e) => {
      this.logger.error(
        `관리자 예약 알림 메일 발송 실패: bookingId=${booking.id}`,
        e instanceof Error ? e.stack : e,
      );
    });

    return { id: booking.id, userId: booking.userId, createdByAdmin: true };
  }

  // ---------------------------------------------------------------------------
  // 내부 헬퍼
  // ---------------------------------------------------------------------------

  private async list(
    filter: { status?: ExceptionRequestStatus; userId?: string },
    pageInput: number | undefined,
    limitInput: number | undefined,
    _: undefined,
  ): Promise<PaginatedExceptionRequests> {
    const page = pageInput ?? DEFAULT_PAGE;
    const limit = Math.min(limitInput ?? DEFAULT_LIMIT, MAX_LIMIT);

    const where: Prisma.ExceptionRequestWhereInput = {
      ...(filter.status !== undefined && { status: filter.status }),
      ...(filter.userId !== undefined && { userId: filter.userId }),
    };

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.exceptionRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: REQUEST_RELATIONS,
      }),
      this.prisma.exceptionRequest.count({ where }),
    ]);

    return {
      data: items.map((it) => toExceptionRequestDto(it as ExceptionRequestWithRelations)),
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / limit)),
      },
    };
  }

  /**
   * EXCEPTION_NOT_REQUIRED 검증.
   * 예외 신청은 다음 두 경우에만 의미 있다:
   *  - 길이가 4시간(240분)을 초과
   *  - startAt이 과거 시점 (회고 등록 등)
   * 이 외 — 4시간 이내 + 미래 시점 — 은 일반 예약을 사용하라고 안내한다.
   */
  private assertExceptionMeaningful(startAt: Date, endAt: Date): void {
    const minutes = (endAt.getTime() - startAt.getTime()) / 60_000;
    const isPast = startAt.getTime() <= Date.now();
    const isLong = minutes > NORMAL_BOOKING_MAX_MINUTES;
    if (!isPast && !isLong) {
      throw new BadRequestException({
        code: 'EXCEPTION_NOT_REQUIRED',
        message: '4시간 이내 미래 시간은 일반 예약으로 신청해 주세요.',
      });
    }
  }

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

  private async assertUserActive(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: '사용자를 찾을 수 없습니다.',
      });
    }
    if (user.status !== 'ACTIVE') {
      throw new ConflictException({
        code: 'USER_NOT_ACTIVE',
        message: '활성 상태의 사용자만 예약 대상이 될 수 있습니다.',
      });
    }
  }

  /**
   * 같은 회의실에서 시간이 겹치는 (소프트 삭제 안 된) 예약 조회.
   * tstzrange 반열림(`[)`) 의미와 일치하도록 `startAt < end && endAt > start` 로 검사한다.
   * tx 인자가 있으면 트랜잭션 내에서 실행 (FOR UPDATE 잠금 후 재검증 시).
   */
  private async findOverlappingBookings(
    roomId: string,
    start: Date,
    end: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<ConflictHintDto[]> {
    const client = tx ?? this.prisma;
    const rows = await client.booking.findMany({
      where: {
        roomId,
        deletedAt: null,
        startAt: { lt: end },
        endAt: { gt: start },
      },
      orderBy: { startAt: 'asc' },
      select: { id: true, title: true, startAt: true, endAt: true },
      take: 10,
    });
    return rows.map((b) => ({
      bookingId: b.id,
      title: b.title,
      startAt: b.startAt.toISOString(),
      endAt: b.endAt.toISOString(),
    }));
  }

  // ---------------------------------------------------------------------------
  // 메일 발송 (HBS 템플릿 — src/infra/mail/templates/exception-request-*.hbs)
  // 모든 메일은 fire-and-forget 호출자 측에서 catch 하므로 throw 가능. plain text
  // 폴백을 함께 보내 메일 클라이언트가 HTML 비활성인 경우에도 핵심 정보가 도달하도록 한다.
  // ---------------------------------------------------------------------------

  private async sendReceiptMail(
    request: ExceptionRequestWithRelations & { user: { email: string } },
    conflictCount: number,
  ): Promise<void> {
    const appName = this.config.get('MAIL_FROM_NAME', { infer: true });
    const subject = `[${appName}] 예외 신청이 접수되었습니다`;
    const view = {
      appName,
      name: request.user.name,
      title: request.title,
      roomName: request.room.name,
      startAt: formatKstDateTime(request.startAt),
      endAt: formatKstDateTime(request.endAt),
      conflictCount: conflictCount > 0 ? conflictCount : null,
    };
    const text = [
      `${request.user.name}님,`,
      ``,
      `예외 신청이 관리자 검토 대기열에 접수되었습니다.`,
      `- 제목: ${request.title}`,
      `- 회의실: ${request.room.name}`,
      `- 시간: ${view.startAt} ~ ${view.endAt}`,
      conflictCount > 0 ? `- 신청 시점 충돌: ${conflictCount}건 (검토 시 다시 확인됨)` : undefined,
      ``,
      `검토 결과는 별도 메일로 안내됩니다.`,
    ]
      .filter((line): line is string => line !== undefined)
      .join('\n');

    const html = await this.mailTemplates.render('exception-request-received', view);
    await this.mailService.send({ to: request.user.email, subject, text, html });
  }

  private async sendApprovalMail(
    request: ExceptionRequestWithRelations & { user: { email: string } },
    booking: Booking,
  ): Promise<void> {
    const appName = this.config.get('MAIL_FROM_NAME', { infer: true });
    const subject = `[${appName}] 예외 신청이 승인되었습니다`;
    const view = {
      appName,
      name: request.user.name,
      title: request.title,
      roomName: request.room.name,
      startAt: formatKstDateTime(request.startAt),
      endAt: formatKstDateTime(request.endAt),
      bookingId: booking.id,
      dashboardUrl: this.dashboardUrl(),
    };
    const text = [
      `${request.user.name}님,`,
      ``,
      `예외 예약이 승인되었습니다.`,
      `- 제목: ${request.title}`,
      `- 회의실: ${request.room.name}`,
      `- 시간: ${view.startAt} ~ ${view.endAt}`,
      `- 예약 ID: ${booking.id}`,
      view.dashboardUrl ? `- 캘린더: ${view.dashboardUrl}` : undefined,
    ]
      .filter((line): line is string => line !== undefined)
      .join('\n');

    const html = await this.mailTemplates.render('exception-request-approved', view);
    await this.mailService.send({ to: request.user.email, subject, text, html });
  }

  private async sendRejectionMail(
    request: ExceptionRequestWithRelations & { user: { email: string } },
    reviewComment: string,
  ): Promise<void> {
    const appName = this.config.get('MAIL_FROM_NAME', { infer: true });
    const subject = `[${appName}] 예외 신청이 반려되었습니다`;
    const view = {
      appName,
      name: request.user.name,
      title: request.title,
      roomName: request.room.name,
      startAt: formatKstDateTime(request.startAt),
      endAt: formatKstDateTime(request.endAt),
      reviewComment,
    };
    const text = [
      `${request.user.name}님,`,
      ``,
      `예외 예약이 반려되었습니다.`,
      `- 제목: ${request.title}`,
      `- 회의실: ${request.room.name}`,
      `- 시간: ${view.startAt} ~ ${view.endAt}`,
      ``,
      `반려 사유:`,
      reviewComment,
    ].join('\n');

    const html = await this.mailTemplates.render('exception-request-rejected', view);
    await this.mailService.send({ to: request.user.email, subject, text, html });
  }

  private async sendAdminBookingMail(
    booking: Booking & {
      room: { id: string; name: string };
      user: { id: string; name: string; email: string };
    },
    adminId: string,
  ): Promise<void> {
    // 처리자 이름 lookup — JWT AuthUser 에는 name 이 없으므로 별도 조회.
    // 실패하거나 못 찾으면 adminName 미설정으로 진행 (템플릿이 graceful 처리).
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: { name: true },
    });
    const appName = this.config.get('MAIL_FROM_NAME', { infer: true });
    const subject = `[${appName}] 새 예약이 등록되었습니다`;
    const view = {
      appName,
      name: booking.user.name,
      adminName: admin?.name ?? null,
      title: booking.title,
      roomName: booking.room.name,
      startAt: formatKstDateTime(booking.startAt),
      endAt: formatKstDateTime(booking.endAt),
      bookingId: booking.id,
      dashboardUrl: this.dashboardUrl(),
    };
    const text = [
      `${booking.user.name}님,`,
      ``,
      `관리자가 회원님 명의로 회의실 예약을 생성했습니다.`,
      admin?.name ? `- 처리자: ${admin.name}` : undefined,
      `- 제목: ${booking.title}`,
      `- 회의실: ${booking.room.name}`,
      `- 시간: ${view.startAt} ~ ${view.endAt}`,
      `- 예약 ID: ${booking.id}`,
      view.dashboardUrl ? `- 캘린더: ${view.dashboardUrl}` : undefined,
    ]
      .filter((line): line is string => line !== undefined)
      .join('\n');

    const html = await this.mailTemplates.render('admin-booking-created', view);
    await this.mailService.send({ to: booking.user.email, subject, text, html });
  }

  /**
   * CORS_ORIGINS 의 첫 번째 값을 프런트 base url 로 사용 — auth 메일과 동일 규약.
   */
  private dashboardUrl(): string | null {
    const origins = this.config.get('CORS_ORIGINS', { infer: true });
    const baseUrl = origins.split(',')[0]?.trim();
    if (!baseUrl) return null;
    return `${baseUrl}/dashboard`;
  }
}

function isQuarterAligned(date: Date): boolean {
  return (
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0 &&
    date.getUTCMinutes() % QUARTER_MINUTES === 0
  );
}

/** 메일 본문/템플릿 공용 — KST 타임존으로 사람이 읽기 좋은 표기. */
function formatKstDateTime(d: Date): string {
  return formatInTimeZone(d, KST, KST_DATE_FORMAT);
}

/**
 * Prisma EXCLUDE 위반(SQLSTATE 23P01) 감지 — booking.service의 동일 헬퍼와 정렬.
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
