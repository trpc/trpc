import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { getSession } from 'next-auth/react';

/**
 * Creates context for an incoming request
 * @link https://trpc.io/docs/v11/context
 */
export const createContext = async (opts: FetchCreateContextFnOptions) => {
  const session = await getSession({
    req: {
      headers: Object.fromEntries(opts.req.headers),
    },
  });

  console.log('createContext for', session?.user?.name ?? 'unknown user');

  return {
    session,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
