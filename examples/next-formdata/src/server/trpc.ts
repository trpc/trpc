/**
 * This is your entry point to setup the root configuration for tRPC on the server.
 * - `initTRPC` should only be used once per app.
 * - We export only the functionality that we use so we can enforce which base procedures should be used
 *
 * Learn how to create protected base procedures and other things below:
 * @see https://trpc.io/docs/v11/router
 * @see https://trpc.io/docs/v11/procedures
 */
import { initTRPC } from '@trpc/server';
import type * as trpcNext from '@trpc/server/adapters/next';
import { ZodError } from 'zod';

/**
 * Creates context for an incoming request
 * @see https://trpc.io/docs/v11/context
 */
export async function createContext(opts: trpcNext.CreateNextContextOptions) {
  return {
    req: opts.req,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  errorFormatter(opts) {
    return {
      ...opts.shape,
      data: {
        zodError:
          opts.error.code === 'BAD_REQUEST' &&
          opts.error.cause instanceof ZodError
            ? opts.error.cause.flatten()
            : null,
        ...opts.shape.data,
      },
    };
  },
});
/**
 * Unprotected procedure
 **/
export const publicProcedure = t.procedure;

export const router = t.router;
