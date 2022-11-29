import { CreateNextContextOptions } from '@trpc/server/adapters/next';

export function createContext(opts: CreateNextContextOptions) {
  return {
    rsc: !!opts.req.headers.rsc,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
