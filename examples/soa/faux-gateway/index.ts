import { serverA_appRouter } from '../server-a/router.ts';
import { serverB_appRouter } from '../server-b/router.ts';
import { router } from '../server-lib/index.ts';

const appRouter = router({
  serverA: serverA_appRouter,
  serverB: serverB_appRouter,
});

export type AppRouter = typeof appRouter;
