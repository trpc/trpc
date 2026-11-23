/**
 * This file contains the tRPC http response handler and context creation
 */
import { createFileRoute } from '@tanstack/react-router';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createContext } from '~/server/context';
import { appRouter } from '~/server/routers/_app';

const handler = (opts: { request: Request }) =>
  fetchRequestHandler({
    router: appRouter,
    req: opts.request,
    endpoint: '/api/trpc',
    /**
     * @see https://trpc.io/docs/v11/context
     */
    createContext,
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

export const Route = createFileRoute('/api/trpc/$')({
  server: { handlers: { GET: handler, POST: handler } },
});
