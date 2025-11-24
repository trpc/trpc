import { lazy } from '@trpc/server';
import { router } from '../trpc.ts';

export const appRouter = router({
  user: lazy(() => import('./user.ts')),
  // Alternative way to lazy load
  slow: lazy(() => import('./slow.ts')),
});

export type AppRouter = typeof appRouter;
