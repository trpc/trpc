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
     * Lets a query in a batch read its input from an earlier query's data.
     * The blog pages use it to load a post and its author in one request
     */
    allowPipelining: true,
    /**
     * The client sends queries as POST, so the Network tab shows their inputs as JSON
     * @see https://trpc.io/docs/rpc#overriding-the-default-http-method
     */
    allowMethodOverride: true,
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
