import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { serverA_appRouter } from './serverA_appRouter';

export type ServerA_AppRouter = typeof serverA_appRouter;

createHTTPServer({
  router: serverA_appRouter,
  createContext() {
    return {};
  },
}).listen(2021);
