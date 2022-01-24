/**
 * Ensures that we only have one prisma client initialized in development
 * @link https://www.prisma.io/docs/support/help-articles/nextjs-prisma-client-dev-practices
 */

/* eslint-disable no-var */
import { PrismaClient } from '@prisma/client';

// https://www.prisma.io/docs/support/help-articles/nextjs-prisma-client-dev-practices
declare global {
  var prisma: PrismaClient | undefined;
}

const createClient = () => {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });
};

export const prisma = global.prisma || createClient();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
