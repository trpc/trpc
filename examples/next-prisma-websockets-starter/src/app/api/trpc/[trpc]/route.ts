/**
 * The tRPC HTTP handler. The browser talks to tRPC over the WebSocket, and
 * server components call the router directly, so this serves other clients.
 * @see https://trpc.io/docs/client/nextjs/app-router-setup#3-create-the-api-route-handler
 */
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createRequestContext } from '~/server/context';
import { appRouter } from '~/server/routers/_app';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    /**
     * @see https://trpc.io/docs/v11/context
     */
    createContext: createRequestContext,
    /**
     * @see https://trpc.io/docs/v11/error-handling
     */
    onError({ error }) {
      if (error.code === 'INTERNAL_SERVER_ERROR') {
        // send to bug reporting
        console.error('Something went wrong', error);
      }
    },
  });

export { handler as GET, handler as POST };
