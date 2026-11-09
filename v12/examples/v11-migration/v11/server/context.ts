import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';

export function createContext(opts: FetchCreateContextFnOptions) {
  return { user: opts.req.headers.get('authorization') };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
