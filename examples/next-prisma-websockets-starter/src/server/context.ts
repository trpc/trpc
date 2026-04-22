import type { CreateNextContextOptions } from '@trpc/server/adapters/next';
import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '~/pages/api/auth/[...nextauth]';

function isNextApiContext(
  opts: CreateNextContextOptions | CreateWSSContextFnOptions,
): opts is CreateNextContextOptions {
  return 'req' in opts && 'res' in opts && 'cookies' in opts.req;
}

/**
 * Creates context for an incoming request
 * @see https://trpc.io/docs/v11/context
 */
export const createContext = async (
  opts: CreateNextContextOptions | CreateWSSContextFnOptions,
) => {
  const session = isNextApiContext(opts)
    ? await getServerSession(opts.req, opts.res, authOptions)
    : null;

  console.log('createContext for', session?.user?.name ?? 'unknown user');

  return {
    session,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
