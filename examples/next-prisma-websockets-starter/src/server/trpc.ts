/**
 * This is your entry point to setup the root configuration for tRPC on the server.
 * - `initTRPC` should only be used once per app.
 * - We export only the functionality that we use so we can enforce which base procedures should be used
 *
 * Learn how to create protected base procedures and other things below:
 * @see https://trpc.io/docs/router
 * @see https://trpc.io/docs/procedures
 */

import { Context } from './context';
import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';

const t = initTRPC.context<Context>().create({
  /**
   * @see https://trpc.io/docs/data-transformers
   */
  transformer: superjson,
  /**
   * @see https://trpc.io/docs/error-formatting
   */
  errorFormatter({ shape }) {
    return shape;
  },
});

/**
 * Create a router
 * @see https://trpc.io/docs/router
 */
export const router = t.router;

/**
 * Create an unprotected procedure
 * @see https://trpc.io/docs/procedures
 **/
export const publicProcedure = t.procedure;

/**
 * @see https://trpc.io/docs/middlewares
 */
export const middleware = t.middleware;

/**
 * @see https://trpc.io/docs/merging-routers
 */
export const mergeRouters = t.mergeRouters;

const isAuthed = middleware(({ next, ctx }) => {
  const user = ctx.session?.user;

  if (!user?.name) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  return next({
    ctx: {
      user: {
        ...user,
        name: user.name,
      },
    },
  });
});

/**
 * Protected base procedure
 */
export const authedProcedure = t.procedure.use(isAuthed);
