import * as trpc from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';
import { WSCreateContextFnOptions } from '@trpc/server/adapters/ws';
import { getSession } from 'next-auth/react';

/**
 * Creates context for an incoming request
 * @link https://trpc.io/docs/context
 */
export const createContext = async (
  opts: trpcNext.CreateNextContextOptions | WSCreateContextFnOptions,
) => {
  const session = await getSession(opts);

  console.log('createContext for', session?.user?.name ?? 'unknown user');

  return {
    session,
  };
};

export type Context = trpc.inferAsyncReturnType<typeof createContext>;
