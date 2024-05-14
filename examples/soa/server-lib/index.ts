import { initTRPC } from '@trpc/server';

type Context = {
  foo?: 'bar';
};

const t = initTRPC.context<Context>().create();

/**
 * Create a router
 * @link https://trpc.io/docs/v11/router
 */
export const router = t.router;

/**
 * Create an unprotected procedure
 * @link https://trpc.io/docs/v11/procedures
 **/
export const publicProcedure = t.procedure;

/**
 * @link https://trpc.io/docs/v11/merging-routers
 */
export const mergeRouters = t.mergeRouters;
