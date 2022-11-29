import { publicProcedure, router } from '../trpc';

export const appRouter = router({
  hello: publicProcedure.query((opts) => {
    return {
      text: 'world',
      rsc: opts.ctx.rsc,
    };
  }),
});

export type AppRouter = typeof appRouter;
