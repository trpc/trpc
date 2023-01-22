import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

/**
 * Unprotected procedure
 **/
export const publicProcedure = t.procedure;

export const router = t.router;
export const middleware = t.middleware;