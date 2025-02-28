import { initTRPC } from '@trpc/server';
import * as standalone from '@trpc/server/adapters/standalone';

const t = initTRPC.create();

const router = t.router({
  hello: t.procedure.query(() => {
    return 'Hello, world!';
  }),
});

export const appRouter = router;

export type AppRouter = typeof appRouter;

standalone
  .createHTTPServer({
    router: appRouter,
    createContext: () => ({}),
  })
  .listen(3000);
