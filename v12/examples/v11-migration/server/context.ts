import type { CreateContextOpts } from '@trpc12/trpc/server';

/** HTTP calls send `authorization`; v11's `wsLink` sends `connectionParams`. */
export function createContext(opts: CreateContextOpts) {
  const token = opts.info.connectionParams?.['token'];
  return {
    user:
      typeof token === 'string'
        ? token
        : (opts.request.headers['authorization'] ?? null),
  };
}

export type Context = ReturnType<typeof createContext>;
