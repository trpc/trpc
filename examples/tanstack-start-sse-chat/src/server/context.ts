import { hasSlowQueriesCookie } from '~/lib/slow-queries';
import { getSession } from './auth';

/**
 * Creates context for an incoming request
 * @see https://trpc.io/docs/v11/context
 */
export const createContext = async (opts: { req: Request }) => {
  const session = await getSession(opts.req);

  console.log('createContext for', session?.user?.name ?? 'unknown user');

  return {
    session,
    /** The blog's "Slow queries" switch is on */
    slowQueries: hasSlowQueriesCookie(opts.req.headers.get('cookie')),
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
