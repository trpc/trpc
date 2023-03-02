import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from './router.js';

const server = Bun.serve({
  port: 3000,
  fetch(req) {

    return fetchRequestHandler({
      endpoint: '/trpc',
      req: req,
      router: appRouter,
          createContext: () => ({}),

    });
  },
});

console.log(`Listening on http://localhost:${server.port}...`);
