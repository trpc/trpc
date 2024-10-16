import { createHTTPServer } from '@trpc/server/adapters/standalone';
import cors from 'cors';
import appRouter from './app-router.js';

// create server
createHTTPServer({
  middleware: cors(),
  router: appRouter,
  createContext() {
    console.log('context 3');
    return {};
  },
}).listen(2022);
