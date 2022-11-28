import { initTRPC } from '@trpc/server';
import { Context } from './context';

// You can use any variable name you like.
// We use t to keep things simple.
const t = initTRPC.context<Context>().create();

export const router = t.router;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;
