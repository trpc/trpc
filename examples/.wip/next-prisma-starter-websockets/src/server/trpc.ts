import { PrismaClient } from '@prisma/client';
import { CreateContextFnOptions } from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';
import { IncomingMessage } from 'http';
import ws from 'ws';
import * as trpc from '@trpc/server';

const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
});
/**
 * Creates context for an incoming request
 * @link https://trpc.io/docs/context
 */

export const createContext = async ({
  req,
  res,
}:
  | trpcNext.CreateNextContextOptions
  | CreateContextFnOptions<IncomingMessage, ws>) => {
  return {
    prisma,
  };
};
export type Context = trpc.inferAsyncReturnType<typeof createContext>;

/**
 * Helper function to create a router with context
 */
export function createRouter() {
  return trpc.router<Context>();
}
