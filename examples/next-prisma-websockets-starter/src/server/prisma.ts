/**
 * Instantiates a single instance PrismaClient and save it on the global object.
 * @see https://www.prisma.io/docs/support/help-articles/nextjs-prisma-client-dev-practices
 */
import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const adapter = new PrismaPg({ connectionString });

const prismaGlobal = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma: PrismaClient =
  prismaGlobal.prisma ||
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  prismaGlobal.prisma = prisma;
}
