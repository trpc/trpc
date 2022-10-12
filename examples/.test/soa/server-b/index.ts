import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { serverB_appRouter } from './serverB_appRouter';

createHTTPServer({
  router: serverB_appRouter,
  createContext() {
    return {};
  },
}).listen(2022);
