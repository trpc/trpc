import { createRouter, baseProcedure } from '../trpc';

export const healthRouter = createRouter({
  healthz: baseProcedure.query(() => 'yay!'),
});
