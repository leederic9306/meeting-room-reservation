import { z } from 'zod';

/**
 * 예약 생성/수정 폼의 공유 zod 스키마.
 * 시간 검증 정책은 백엔드 booking.service의 검증과 정확히 일치해야 한다.
 *   - 15분 단위 (분 0/15/30/45, 초·밀리초 0)
 *   - 종료 > 시작
 *   - 길이 ≤ 240분 (4시간)
 *
 * 미래 시각 검증은 클라이언트에서만(서버 검증 시점과 사용자 입력 사이의 race를
 * 보호하기 위해) 적용 — 폼 제출 시점에 평가되도록 별도 헬퍼로 노출한다.
 */

export const MAX_BOOKING_DURATION_MINUTES = 240;
export const QUARTER_MINUTES = 15;

export function isQuarterAlignedIso(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0 &&
    d.getUTCMinutes() % QUARTER_MINUTES === 0
  );
}

export const titleField = z
  .string()
  .min(1, '제목을 입력해주세요.')
  .max(200, '제목은 200자 이하여야 합니다.');

export const descriptionField = z
  .string()
  .max(2000, '설명은 2000자 이하여야 합니다.')
  .optional()
  .or(z.literal(''));

export const startAtField = z
  .string()
  .min(1, '시작 시간을 선택해주세요.')
  .refine(isQuarterAlignedIso, { message: '시작 시간은 15분 단위여야 합니다.' });

export const endAtField = z
  .string()
  .min(1, '종료 시간을 선택해주세요.')
  .refine(isQuarterAlignedIso, { message: '종료 시간은 15분 단위여야 합니다.' });

/**
 * 시작/종료 ISO 쌍에 적용되는 공통 super-refine.
 * - 종료 > 시작
 * - 길이 ≤ 4시간
 *
 * `endAt` 경로에 에러를 부착해 폼 인라인 메시지가 직관적인 위치에 표시되도록 한다.
 */
function applyTimePairRules<T extends { startAt: string; endAt: string }>(
  schema: z.ZodType<T>,
): z.ZodEffects<z.ZodType<T>, T> {
  return schema.superRefine((value, ctx) => {
    const start = new Date(value.startAt);
    const end = new Date(value.endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
    if (end.getTime() <= start.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endAt'],
        message: '종료 시간은 시작 시간보다 이후여야 합니다.',
      });
      return;
    }
    const durationMinutes = (end.getTime() - start.getTime()) / 60_000;
    if (durationMinutes > MAX_BOOKING_DURATION_MINUTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endAt'],
        message: `예약은 최대 ${MAX_BOOKING_DURATION_MINUTES / 60}시간까지 가능합니다. 더 긴 시간이 필요하면 예외 신청을 이용해 주세요.`,
      });
    }
  });
}

const createBookingObject = z.object({
  roomId: z.string().uuid('회의실을 선택해주세요.'),
  title: titleField,
  description: descriptionField,
  startAt: startAtField,
  endAt: endAtField,
});
export const createBookingSchema = applyTimePairRules(createBookingObject);
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

const updateBookingObject = z.object({
  title: titleField.optional(),
  description: descriptionField,
  startAt: startAtField.optional(),
  endAt: endAtField.optional(),
});
/** 부분 업데이트 — startAt/endAt이 둘 다 있을 때만 시간 쌍 규칙을 적용. */
export const updateBookingSchema = updateBookingObject.superRefine((value, ctx) => {
  if (value.startAt === undefined || value.endAt === undefined) return;
  const start = new Date(value.startAt);
  const end = new Date(value.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
  if (end.getTime() <= start.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endAt'],
      message: '종료 시간은 시작 시간보다 이후여야 합니다.',
    });
    return;
  }
  const durationMinutes = (end.getTime() - start.getTime()) / 60_000;
  if (durationMinutes > MAX_BOOKING_DURATION_MINUTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endAt'],
      message: `예약은 최대 ${MAX_BOOKING_DURATION_MINUTES / 60}시간까지 가능합니다.`,
    });
  }
});
export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;
