import type { CreateNextContextOptions } from '@trpc/server/adapters/next';
import { getSession } from 'next-auth/react';
/**
 * Creates context for an incoming request
 * @link https://trpc.io/docs/v11/context
 */
export const createContext = async (opts: CreateNextContextOptions) => {
  const session = await getSession(opts);

  console.log('createContext for', session?.user?.name ?? 'unknown user');

  return {
    session,
    req: opts.req,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
