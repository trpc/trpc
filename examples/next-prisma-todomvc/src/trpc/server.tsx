import 'server-only';
import {
  createTRPCOptionsProxy,
  unstable_createHydrateClient,
} from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { createInnerTRPCContext } from '../server/context';
import { appRouter } from '../server/routers/_app';
import { makeQueryClient } from './query-client';

/**
 * One `QueryClient` per request.
 * @see https://trpc.io/docs/client/nextjs/app-router-setup#6-create-a-trpc-caller-for-server-components
 */
export const getQueryClient = cache(makeQueryClient);

export const trpc = createTRPCOptionsProxy({
  // The inner context reads nothing from the request, so the pages can
  // render at build time and revalidate (ISR). Reading `headers()` here
  // would make every page that loads a query render on each request.
  ctx: () => createInnerTRPCContext({}),
  router: appRouter,
  queryClient: getQueryClient,
});

/**
 * Sends the queries a server component started to the browser.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#hydrate-client
 */
export const HydrateClient = unstable_createHydrateClient(getQueryClient);
