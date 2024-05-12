/**
 * This file contains the tRPC http response handler and context creation for Next.js
 */
import { createContext } from '~/server/context';
import { appRouter } from '~/server/routers/_app';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { NextRequest } from 'next/server';

// We're using the edge-runtime
export const config = {
  runtime: 'edge',
};

// export API handler
export default async function handler(req: NextRequest) {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    router: appRouter,
    req,
    /**
     * @link https://trpc.io/docs/v11/context
     */
    createContext,
    /**
     * @link https://trpc.io/docs/v11/error-handling
     */
    onError({ error }) {
      if (error.code === 'INTERNAL_SERVER_ERROR') {
        // send to bug reporting
        console.error('Something went wrong', error);
      }
    },
  });
}
