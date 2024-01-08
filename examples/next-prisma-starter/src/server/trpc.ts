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
import { transformer } from '~/utils/transformer';
import type { Context } from './context';

const t = initTRPC.context<Context>().create({
  /**
   * @see https://trpc.io/docs/data-transformers
   */
  transformer,
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
 * Merge multiple routers together
 * @see https://trpc.io/docs/merging-routers
 */
export const mergeRouters = t.mergeRouters;

/**
 * Create a server-side caller
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;
