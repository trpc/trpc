import { lazy } from '@trpc/server';
import { router } from '../trpc.js';

export const appRouter = router({
  user: lazy(() => import('./user.js')),
  // Alternative way to lazy load
  slow: lazy(() => import('./slow.js')),
});

export type AppRouter = typeof appRouter;
