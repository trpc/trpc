/**
 * Depending on your adapter, the first argument of {@link createContext} will be different.
 * @see https://trpc.io/docs/server/context
 */
import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';

export async function createContext(opts: CreateHTTPContextOptions) {
  // Create your context based on the request object
  // Will be available as `ctx` in all your resolvers

  return {
    ...opts,
    // ^?
  };
}

// This context will be available as `ctx` in all your resolvers
export type Context = Awaited<ReturnType<typeof createContext>>;
