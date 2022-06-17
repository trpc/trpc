import { t } from '../trpc';

export const healthRouter = t.router({
  queries: {
    healthz: t.procedure.resolve(() => 'yay!'),
  },
});
