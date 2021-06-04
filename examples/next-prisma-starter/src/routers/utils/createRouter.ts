import { PrismaClient } from '@prisma/client';
import { CreateHttpContextOptions } from '@trpc/server';
import * as trpc from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';
const prisma = new PrismaClient();

/**
 * Creates context for an incoming request
 * @link https://trpc.io/docs/context
 */
export const createContext = async (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  { req, res }: trpcNext.CreateNextContextOptions | CreateHttpContextOptions,
) => {
  return {
    prisma,
  };
};

// Infers the context returned from `createContext`
export type Context = trpc.inferAsyncReturnType<typeof createContext>;

/**
 * Helper function to create a router with context
 */
export function createRouter() {
  return trpc.router<Context>();
}
