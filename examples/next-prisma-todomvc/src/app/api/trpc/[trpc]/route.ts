import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createTRPCContext } from '../../../../server/context';
import { appRouter } from '../../../../server/routers/_app';

/**
 * @see https://trpc.io/docs/client/nextjs/app-router-setup#3-create-the-api-route-handler
 */
const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: createTRPCContext,
    onError({ error }) {
      if (error.code === 'INTERNAL_SERVER_ERROR') {
        // send to bug reporting
        console.error('Something went wrong', error);
      }
    },
  });

export { handler as GET, handler as POST };
