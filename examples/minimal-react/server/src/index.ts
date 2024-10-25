import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from '#router.js';
import cors from 'cors';

export type { AppRouter } from '#router.js';

// create server
createHTTPServer({
  middleware: cors(),
  router: appRouter,
  createContext() {
    console.log('context 3');
    return {};
  },
}).listen(2022);
