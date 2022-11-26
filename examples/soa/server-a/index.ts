import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { serverA_appRouter } from './serverA_appRouter';

const port = 2021;

createHTTPServer({
  router: serverA_appRouter,
  createContext() {
    return {};
  },
}).listen(port);

console.log('server A listening on port', port);
