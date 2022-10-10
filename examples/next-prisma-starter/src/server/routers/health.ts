import { router, baseProcedure } from '../trpc';

export const healthRouter = router({
  healthz: baseProcedure.query(() => 'yay!'),
});
