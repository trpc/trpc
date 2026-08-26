import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';

export interface User {
  name: string[] | string;
}

export function createContext(opts: CreateFastifyContextOptions) {
  const user: User = { name: opts.req.headers.username ?? 'anonymous' };

  return { req: opts.req, res: opts.res, user };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
