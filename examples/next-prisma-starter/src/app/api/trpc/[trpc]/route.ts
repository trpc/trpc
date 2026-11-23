/**
 * This file contains tRPC's HTTP response handler
 */
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createContext } from '~/server/context';
import { appRouter } from '~/server/routers/_app';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    /**
     * @see https://trpc.io/docs/v11/context
     */
    createContext: () => createContext({ headers: req.headers }),
    /**
     * @see https://trpc.io/docs/v11/error-handling
     */
    onError({ error }) {
      if (error.code === 'INTERNAL_SERVER_ERROR') {
        // send to bug reporting
        console.error('Something went wrong', error);
      }
    },
    /**
     * @see https://trpc.io/docs/v11/caching#api-response-caching
     */
    // responseMeta() {
    //   // ...
    // },
  });

export { handler as GET, handler as POST };
