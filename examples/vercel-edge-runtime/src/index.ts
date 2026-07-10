import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from './router';

addEventListener('fetch', (event) => {
  return event.respondWith(
    fetchRequestHandler({
      endpoint: '/trpc',
      req: event.request,
      router: appRouter,
      createContext: () => ({}),
    }),
  );
});
