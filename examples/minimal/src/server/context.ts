import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';

/**
 * Defines your inner context shape.
 * Add fields here that the inner context brings.
 */
interface CreateInnerContextOptions extends Partial<CreateHTTPContextOptions> {
  // session: Session | null;
}

/*
 * Defines your inner context shape
 * Add fields here that the inner context brings.
 * @see https://trpc.io/docs/server/context#inner-and-outer-context
 */
export async function createContextInner(opts: CreateInnerContextOptions) {
  return {
    ...opts,
  };
}

// This context will be available as `ctx` in all your resolvers
export type Context = Awaited<ReturnType<typeof createContextInner>>;

export async function createContext(
  /**
   * Depending on your adapter, the first argument of this function will be different.
   * @see https://trpc.io/docs/server/context
   */
  opts: CreateHTTPContextOptions,
) {
  // Create your context based on the request object
  // Will be available as `ctx` in all your resolvers

  const ctx = await createContextInner(opts);

  return ctx;
}
