import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';

export interface User {
  name: string[] | string;
}

export function createContext({ req, res }: CreateFastifyContextOptions) {
  const user: User = { name: req.headers.username ?? 'anonymous' };

  return { req, res, user };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
