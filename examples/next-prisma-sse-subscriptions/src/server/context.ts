import type { CreateNextContextOptions } from '@trpc/server/adapters/next';
import { getServerSession } from 'next-auth';
import { authOptions } from './authOptions';
/**
 * Creates context for an incoming request
 * @link https://trpc.io/docs/v11/context
 */
export const createContext = async (opts: CreateNextContextOptions) => {
  const session = await getServerSession(opts.req, opts.res, authOptions);

  console.log('createContext for', session?.user?.name ?? 'unknown user');

  return {
    session,
    req: opts.req,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
