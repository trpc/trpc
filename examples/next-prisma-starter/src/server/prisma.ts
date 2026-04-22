/**
 * Instantiates a single PrismaClient with a Postgres adapter and stores it on
 * the global object during development to avoid exhausting connections on HMR.
 * @see https://www.prisma.io/docs/support/help-articles/nextjs-prisma-client-dev-practices
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from './env';

const prismaGlobal = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

const createPrismaClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
    log:
      env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

export const prisma: PrismaClient = prismaGlobal.prisma ?? createPrismaClient();

if (env.NODE_ENV !== 'production') {
  prismaGlobal.prisma = prisma;
}
