import { serverA_appRouter } from '../server-a/router';
import { serverB_appRouter } from '../server-b/router';
import { router } from '../server-lib';

const appRouter = router({
  serverA: serverA_appRouter,
  serverB: serverB_appRouter,
});

export type AppRouter = typeof appRouter;
