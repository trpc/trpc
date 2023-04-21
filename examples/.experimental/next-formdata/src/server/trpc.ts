/**
 * This is your entry point to setup the root configuration for tRPC on the server.
 * - `initTRPC` should only be used once per app.
 * - We export only the functionality that we use so we can enforce which base procedures should be used
 *
 * Learn how to create protected base procedures and other things below:
 * @see https://trpc.io/docs/v10/router
 * @see https://trpc.io/docs/v10/procedures
 */
import { initTRPC } from '@trpc/server';
import { CreateNextContextOptions } from '@trpc/server/adapters/next';
import { ZodError } from 'zod';

type Context = CreateNextContextOptions;
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
export const middleware = t.middleware;
