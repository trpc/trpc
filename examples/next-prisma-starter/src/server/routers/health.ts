import { router, publicProcedure } from '../trpc';

export const healthRouter = router({
  healthz: publicProcedure.query(() => 'yay!'),
});
