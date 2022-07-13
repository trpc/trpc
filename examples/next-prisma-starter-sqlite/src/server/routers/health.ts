import { t } from '../trpc';

export const healthRouter = t.router({
  healthz: t.procedure.query(() => 'yay!'),
});
