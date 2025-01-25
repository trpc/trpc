/**
 * This is your entry point to setup the root configuration for tRPC on the server.
 * - `initTRPC` should only be used once per app.
 * - We export only the functionality that we use so we can enforce which base procedures should be used
 *
 * Learn how to create protected base procedures and other things below:
 * @see https://trpc.io/docs/v11/router
 * @see https://trpc.io/docs/v11/procedures
 */

import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { Context } from './context';

const t = initTRPC.context<Context>().create({
  /**
   * @see https://trpc.io/docs/v11/data-transformers
   */
  transformer: superjson,
  /**
   * @see https://trpc.io/docs/v11/error-formatting
   */
  errorFormatter({ shape }) {
    return shape;
  },
  sse: {
    maxDurationMs: 5 * 60 * 1_000, // 5 minutes
    ping: {
      enabled: true,
      intervalMs: 3_000,
    },
    client: {
      reconnectAfterInactivityMs: 5_000,
    },
  },
});

export const createCallerFactory = t.createCallerFactory;

/**
 * Create a router
 * @see https://trpc.io/docs/v11/router
 */
export const router = t.router;

/**
 * Create an unprotected procedure
 * @see https://trpc.io/docs/v11/procedures
 **/
export const publicProcedure = t.procedure.use(
  async function artificialDelayInDevelopment(opts) {
    const res = opts.next(opts);

    if (process.env.NODE_ENV === 'development') {
      const randomNumber = (min: number, max: number) =>
        Math.floor(Math.random() * (max - min + 1)) + min;

      const delay = randomNumber(300, 1_000);
      console.debug(
        'ℹ️ doing artificial delay of',
        delay,
        'ms before returning',
        opts.path,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    return res;
  },
);

/**
 * @see https://trpc.io/docs/v11/merging-routers
 */
export const mergeRouters = t.mergeRouters;

/**
 * Protected base procedure
 */
export const authedProcedure = publicProcedure.use(function isAuthed(opts) {
  const user = opts.ctx.session?.user;

  if (!user?.name) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  return opts.next({
    ctx: {
      user: {
        ...user,
        name: user.name,
      },
    },
  });
});
