/**
 * This is the API-handler of your app. It serves the router from `~/trpc/routers/_app`.
 */
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '~/trpc/routers/_app';

// We're using the edge-runtime
export const runtime = 'edge';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => ({}),
  });

export { handler as GET, handler as POST };
