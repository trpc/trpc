import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

export const appRouter = router({
  hello: publicProcedure
    .input(
      z.object({
        name: z.string(),
      }),
    )
    .query((opts) => {
      return {
        text: `hello ${opts.input.name || 'world'}`,
        rsc: opts.ctx.rsc,
      };
    }),
});

export type AppRouter = typeof appRouter;
