import 'server-only';
import {
  createTRPCOptionsProxy,
  unstable_createHydrateClient,
} from '@trpc/tanstack-react-query';
import { headers } from 'next/headers';
import { cache } from 'react';
import { createContext } from '~/server/context';
import { appRouter } from '~/server/routers/_app';
import { makeQueryClient } from './query-client';

// IMPORTANT: Create a stable getter for the query client that
//            will return the same client during the same request.
export const getQueryClient = cache(makeQueryClient);

export const trpc = createTRPCOptionsProxy({
  ctx: async () => createContext({ headers: await headers() }),
  router: appRouter,
  queryClient: getQueryClient,
});

/**
 * Sends the queries this request started to the browser, pending ones too.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#hydrate-client
 */
export const HydrateClient = unstable_createHydrateClient(getQueryClient);
