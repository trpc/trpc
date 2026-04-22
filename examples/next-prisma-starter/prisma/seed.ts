/**
 * Adds seed data to your db
 *
 * @see https://www.prisma.io/docs/guides/database/seed-database
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const firstPostId = '5c03994c-fc16-47e0-bd02-d218a370a078';
  await prisma.post.upsert({
    where: {
      id: firstPostId,
    },
    create: {
      id: firstPostId,
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
