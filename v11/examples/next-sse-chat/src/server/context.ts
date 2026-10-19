import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { auth } from './auth';

/**
 * Creates context for an incoming request
 * @see https://trpc.io/docs/v11/context
 */
export const createContext = async (opts: FetchCreateContextFnOptions) => {
  const session = await auth();

  console.log('createContext for', session?.user?.name ?? 'unknown user');

  return {
    session,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
