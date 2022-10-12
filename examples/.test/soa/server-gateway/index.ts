import { serverA_appRouter } from '../server-a/serverA_appRouter';
import { serverB_appRouter } from '../server-b/serverB_appRouter';
import { router } from '../server-lib';

const appRouter = router({
  serverA: serverA_appRouter,
  serverB: serverB_appRouter,
});

export type AppRouter = typeof appRouter;
