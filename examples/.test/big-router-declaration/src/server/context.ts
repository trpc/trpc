import type * as trpcNext from '@trpc/server/adapters/next';

export interface Session {
  id: string;
  firstName: string;
  lastName: string;
}
export interface CreateContextOptions extends Partial<trpcNext.CreateNextContextOptions> {
  session: Session | null
}

/**
 * Inner function for `createContext` where we create the context.
 * This is useful for testing when we don't want to mock Next.js' request/response
 */
export async function createContextInner(opts: CreateContextOptions) {
  return {
    ...opts
  };
}

export type Context = Awaited<ReturnType<typeof createContextInner>>;

/**
 * Creates context for an incoming request
 * @link https://trpc.io/docs/context
 */
export async function createContext(
  opts: trpcNext.CreateNextContextOptions,
): Promise<Context> {
  return await createContextInner({
    ...opts,
    session: null,
  });
}
