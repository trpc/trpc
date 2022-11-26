import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { serverB_appRouter } from './serverB_appRouter';

const port = 2022;

createHTTPServer({
  router: serverB_appRouter,
  createContext() {
    return {};
  },
}).listen(port);

console.log('server B listening on port', port);
