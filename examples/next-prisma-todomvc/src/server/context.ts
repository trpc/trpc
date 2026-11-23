import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';

/**
 * Defines your inner context shape.
 * Add fields here that the inner context brings.
 */
export interface CreateInnerContextOptions {
  req?: Request;
}

/**
 * Inner context. Will always be available in your procedures, in contrast to the outer context.
 *
 * Also useful for:
 * - testing, so you don't have to mock the request
 * - server components that render at build time, where there is no request
 *
 * @see https://trpc.io/docs/v11/context#inner-and-outer-context
 */
export async function createInnerTRPCContext(opts?: CreateInnerContextOptions) {
  return {
    ...opts,
  };
}

/**
 * Outer context. Used in the route handler and will e.g. bring `req` to the context as "not `undefined`".
 *
 * @see https://trpc.io/docs/v11/context#inner-and-outer-context
 */
export const createTRPCContext = async (opts: FetchCreateContextFnOptions) => {
  const innerContext = await createInnerTRPCContext({
    req: opts.req,
  });

  return {
    ...innerContext,
    req: opts.req,
  };
};
