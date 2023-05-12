import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

export const appRouter = router({
  greeting: publicProcedure
    .input(
      z.object({
        text: z.string(),
      }),
    )
    .query(async (opts) => {
      console.log('request from', opts.ctx.headers?.['x-trpc-source']);
      return `hello ${opts.input.text}`;
    }),
});

export type AppRouter = typeof appRouter;
