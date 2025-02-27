import { experimental_lazy } from '@trpc/server';
import { router } from '../trpc.js';

export const appRouter = router({
  user: experimental_lazy(() => import('./user.js')),
  // Alternative way to lazy load
  slow: experimental_lazy(() => import('./slow.js')),
});

export type AppRouter = typeof appRouter;
