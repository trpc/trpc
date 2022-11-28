import { publicProcedure, router } from '../trpc';

export const appRouter = router({
  hello: publicProcedure.query(() => 'world'),
});

export type AppRouter = typeof appRouter;
