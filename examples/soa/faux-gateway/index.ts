import { serverA_appRouter } from '../server-a/router.js';
import { serverB_appRouter } from '../server-b/router.js';
import { router } from '../server-lib/index.js';

const appRouter = router({
  serverA: serverA_appRouter,
  serverB: serverB_appRouter,
});

export type AppRouter = typeof appRouter;
