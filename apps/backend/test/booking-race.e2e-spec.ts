/**
 * 실제 Postgres에 직접 동시 INSERT를 던져 EXCLUDE 제약이
 * race condition도 차단함을 증명한다.
 *
 * 기본은 SKIP — CI가 인메모리 더블만 쓰는 환경을 깨지 않도록.
 * 로컬에서 Postgres가 떠 있을 때 다음으로 실행:
 *   RACE_DB_TEST=1 pnpm --filter @meeting-room/backend test:e2e -- booking-race
 */
import { Prisma, PrismaClient, UserRole, UserStatus } from '@prisma/client';

const ENABLED = process.env.RACE_DB_TEST === '1';
const describeOrSkip = ENABLED ? describe : describe.skip;

describeOrSkip('Booking EXCLUDE race condition (real Postgres)', () => {
  let prisma: PrismaClient;
  let roomId: string;
  let userId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const room = await prisma.room.create({
      data: {
        name: `race-room-${suffix}`,
        capacity: 8,
        location: 'race-test',
        isActive: true,
        displayOrder: 9999,
      },
    });
    roomId = room.id;

    const user = await prisma.user.create({
      data: {
        email: `race-${suffix}@test.local`,
        // 형식만 맞추면 됨 — 이 테스트는 로그인 흐름을 타지 않는다.
        passwordHash: '$argon2id$test$placeholder',
        name: 'race tester',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      },
    });
    userId = user.id;
  }, 30_000);

  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.booking.deleteMany({ where: { roomId } });
      await prisma.room.delete({ where: { id: roomId } });
      await prisma.user.delete({ where: { id: userId } });
    } finally {
      await prisma.$disconnect();
    }
  }, 30_000);

  it('동일 시간 슬롯에 N건 동시 INSERT → 1건만 성공, 나머지는 23P01', async () => {
    const N = 10;
    const start = nextQuarterFarFuture();
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const results = await Promise.allSettled(
      Array.from({ length: N }).map((_, i) =>
        prisma.booking.create({
          data: {
            roomId,
            userId,
            title: `race-${i}`,
            startAt: start,
            endAt: end,
            createdByAdmin: false,
          },
        }),
      ),
    );

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<unknown> => r.status === 'fulfilled',
    );
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(N - 1);

    for (const r of rejected) {
      expect(isExcludeViolation(r.reason)).toBe(true);
    }
  }, 60_000);

  it('소프트 삭제된 예약은 EXCLUDE WHERE 절에서 제외 → 같은 슬롯 재예약 가능', async () => {
    const start = nextQuarterFarFuture(120 /* +2일 띄움 */);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const first = await prisma.booking.create({
      data: { roomId, userId, title: 'first', startAt: start, endAt: end, createdByAdmin: false },
    });
    await prisma.booking.update({
      where: { id: first.id },
      data: { deletedAt: new Date() },
    });

    // 동일 슬롯에 재예약 — deletedAt IS NULL 조건 덕에 통과해야 한다.
    const second = await prisma.booking.create({
      data: { roomId, userId, title: 'second', startAt: start, endAt: end, createdByAdmin: false },
    });
    expect(second.id).not.toBe(first.id);
  }, 30_000);
});

function nextQuarterFarFuture(extraDays = 30): Date {
  const t = Date.now() + extraDays * 24 * 60 * 60 * 1000;
  const aligned = Math.ceil(t / (15 * 60 * 1000)) * (15 * 60 * 1000);
  return new Date(aligned);
}

function isExcludeViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const metaCode = (error.meta as { code?: string } | undefined)?.code;
    if (metaCode === '23P01') return true;
    if (typeof error.message === 'string' && error.message.includes('excl_booking_no_overlap')) {
      return true;
    }
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    const msg = String(error.message ?? '');
    if (msg.includes('23P01') || msg.includes('excl_booking_no_overlap')) return true;
  }
  if (error && typeof error === 'object') {
    const meta = (error as { meta?: { code?: string } }).meta;
    if (meta?.code === '23P01') return true;
  }
  return false;
}
