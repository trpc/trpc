import { experimental_lazy } from '@trpc/server';
import { router } from '../trpc.js';

const user = experimental_lazy(() =>
  import('./user.js').then((m) => {
    console.log('💤 lazy loaded user router');
    return m.userRouter;
  }),
);

const slow = experimental_lazy(() =>
  import('./slow.js').then((m) => {
    console.log('💤 lazy loaded slow router');
    return m.slowRouter;
  }),
);

export const appRouter = router({
  user,
  slow,
});

export type AppRouter = typeof appRouter;
