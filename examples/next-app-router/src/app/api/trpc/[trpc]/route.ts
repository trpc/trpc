import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '~/server/router';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    async createContext() {},
  });

export { handler as GET, handler as POST };
