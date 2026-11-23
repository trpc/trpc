import 'server-only';
import {
  createTRPCOptionsProxy,
  unstable_createHydrateClient,
} from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { createRequestContext } from '~/server/context';
import { appRouter } from '~/server/routers/_app';
import { makeQueryClient } from './query-client';

/**
 * @see https://trpc.io/docs/client/nextjs/app-router-setup#6-create-a-trpc-caller-for-server-components
 */

// IMPORTANT: Create a stable getter for the query client that
//            will return the same client during the same request.
export const getQueryClient = cache(makeQueryClient);

export const trpc = createTRPCOptionsProxy({
  ctx: createRequestContext,
  router: appRouter,
  queryClient: getQueryClient,
});

/**
 * Sends the queries this request started to the browser
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#hydrate-client
 */
export const HydrateClient = unstable_createHydrateClient(getQueryClient);
