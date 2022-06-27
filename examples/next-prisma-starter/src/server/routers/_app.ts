/**
 * This file contains the root router of your tRPC-backend
 */
import { t } from '../trpc';
import { createTRPCClient } from '@trpc/client';
import { z } from 'zod';

// import { healthRouter } from './health';
// import { postRouter } from './post';

export const appRouter = t.router({
  procedures: {
    post: t.procedure.query(() => 1),
    health: {
      a: t.procedure.query(() => 5),
      b: t.procedure.query(() => 6),
      c: {
        d: t.procedure.input(z.string().nullish()).query(() => 7),
      },
    },
  },
});

console.log(appRouter._def.procedures);
export type AppRouter = typeof appRouter;

const client = createTRPCClient<AppRouter>({ url: '' });

client.health.c.d.query();
