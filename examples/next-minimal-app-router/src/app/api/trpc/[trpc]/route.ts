import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '~/server/router';
import { createContext } from '~/server/trpc';

// We're not using this atm - we're invoking procedures directly
const handler = async (req: Request) =>
  fetchRequestHandler({
    router: appRouter,
    endpoint: '/api/trpc',
    req,
    createContext,
  });
export { handler as GET, handler as POST };
