/**
 * This a minimal tRPC server
 */
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { lazy } from '@trpc/server/unstable-core-do-not-import';
import { router } from './trpc.js';

const user = lazy(() =>
  import('./routers/user.js').then((m) => {
    console.log('💤 lazy loaded user router');
    return m.userRouter;
  }),
);
const appRouter = router({
  user,
});

// Export type router type signature, this is used by the client.
export type AppRouter = typeof appRouter;

const server = createHTTPServer({
  router: appRouter,
});

server.listen(3000);
