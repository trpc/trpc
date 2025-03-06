/**
 * This a minimal tRPC server
 */
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { createContext } from './context.js';
import { appRouter } from './routers/_app.js';

const server = createHTTPServer({
  router: appRouter,
  createContext,
});

server.listen(3000);
