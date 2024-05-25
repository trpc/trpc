import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { auth } from '~/auth';
import { createTRPCContext } from '~/trpc/init';
import { appRouter } from '~/trpc/routers/_app';

const handler = auth(async (req) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    router: appRouter,
    req,
    createContext: () =>
      createTRPCContext({
        session: req.auth,
        headers: req.headers,
      }),
  }),
);

export { handler as GET, handler as POST };
