/**
 * This is your entry point to setup the root configuration for tRPC on the server.
 * - `initTRPC` should only be used once per app.
 * - We export only the functionality that we use so we can enforce which base procedures should be used
 *
 * Learn how to create protected base procedures and other things below:
 * @link https://trpc.io/docs/router
 * @link https://trpc.io/docs/procedures
 */
import { initTRPC } from '@trpc/server';
import superjson from 'superjson';

const t = initTRPC.create({
  /**
   * @link https://trpc.io/docs/data-transformers
   */
  transformer: superjson,
});

/**
 * Create a router
 * @link https://trpc.io/docs/router
 */
export const router = t.router;

/**
 * Create an unprotected procedure
 * @link https://trpc.io/docs/procedures
 **/
export const publicProcedure = t.procedure;
