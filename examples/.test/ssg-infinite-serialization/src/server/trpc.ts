/**
 * This is your entry point to setup the root configuration for tRPC on the server.
 * - `initTRPC` should only be used once per app.
 * - We export only the functionality that we use so we can enforce which base procedures should be used
 *
 * Learn how to create protected base procedures and other things below:
 * @see https://trpc.io/docs/router
 * @see https://trpc.io/docs/procedures
 */
import { initTRPC } from '@trpc/server';
import superjson from 'superjson';

const t = initTRPC.create({
  /**
   * @see https://trpc.io/docs/data-transformers
   */
  // transformer: superjson,
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
