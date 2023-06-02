import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '../router';

export const runtime = 'edge';

const handler = (req: Request) => {
  return fetchRequestHandler({
    createContext: () => ({}),
    endpoint: '/api/trpc',
    req,
    router: appRouter,
  });
};

export { handler as GET, handler as POST };
