/**
 * Adds seed data to your db
 *
 * @link https://www.prisma.io/docs/guides/database/seed-database
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.post.upsert({
    where: {
      id: '5c03994c-fc16-47e0-bd02-d218a370a078',
    },
    create: {
      title: 'First Post',
      text: 'This is an example post generated from `prisma/seed.ts`',
    },
    update: {},
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
