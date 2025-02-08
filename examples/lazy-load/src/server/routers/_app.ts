import { experimental_lazy } from '@trpc/server';
import { router } from '../trpc.js';

export const appRouter = router({
  user: experimental_lazy(() =>
    import('./user.js').then((m) => {
      console.log('💤 lazy loaded user router');
      return m.userRouter;
    }),
  ),
  slow: experimental_lazy(() =>
    import('./slow.js').then((m) => {
      console.log('💤 lazy loaded slow router');
      return m.slowRouter;
    }),
  ),
});

export type AppRouter = typeof appRouter;
