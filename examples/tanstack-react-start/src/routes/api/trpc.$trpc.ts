import { createFileRoute } from '@tanstack/react-router';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createTRPCContextInner } from '~/trpc/init';
import { appRouter } from '~/trpc/router/_app';

const handler = async (request: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req: request,
    router: appRouter,
    createContext: () => createTRPCContextInner(),
  });

export const Route = createFileRoute('/api/trpc/$trpc')({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
    },
  },
});
