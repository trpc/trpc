import { initTRPC } from '@trpc/server';

type Context = {
  foo?: 'bar';
};

const t = initTRPC.context<Context>().create();

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

/**
 * @link https://trpc.io/docs/merging-routers
 */
export const mergeRouters = t.mergeRouters;
