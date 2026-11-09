import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createContext } from './context.ts';
import { appRouter } from './router.ts';

export default {
  fetch(req: Request) {
    return fetchRequestHandler({
      endpoint: '/trpc',
      req,
      router: appRouter,
      createContext,
    });
  },
};
