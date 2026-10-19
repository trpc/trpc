import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { auth } from '~/auth';

export async function createContext(opts?: FetchCreateContextFnOptions) {
  const session = await auth();

  return {
    session,
    headers: opts && Object.fromEntries(opts.req.headers),
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
