import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // 회의실 — 이름 unique 기반 upsert로 멱등성 보장.
  const room = await prisma.room.upsert({
    where: { name: '회의실 A' },
    update: {},
    create: {
      name: '회의실 A',
      capacity: 8,
      location: '본관 3층',
      description: '프로젝터 있음',
      displayOrder: 0,
    },
  });

  console.log(`[seed] 회의실 준비 완료: ${room.name} (id=${room.id})`);
}

main()
  .catch((error: unknown) => {
    console.error('[seed] 실패:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
