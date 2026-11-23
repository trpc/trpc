import 'server-only'; // <-- ensure this file cannot be imported from the client
import {
  createTRPCOptionsProxy,
  unstable_createHydrateClient,
} from '@trpc/tanstack-react-query';
import { headers } from 'next/headers';
import { cache } from 'react';
import { createContext } from '~/server/context';
import { appRouter } from '~/server/routers/_app';
import { makeQueryClient } from './query-client';

/**
 * The same query client for the whole request
 * @see https://trpc.io/docs/v11/client/nextjs/app-router-setup#6-create-a-trpc-caller-for-server-components
 */
export const getQueryClient = cache(makeQueryClient);

/**
 * Calls the router directly, without HTTP, from server components
 */
export const trpc = createTRPCOptionsProxy({
  ctx: async () => createContext({ headers: await headers() }),
  router: appRouter,
  queryClient: getQueryClient,
});

/**
 * Sends the queries a page loaded to the client components below it
 * @see https://trpc.io/docs/v11/client/tanstack-react-query/handles#hydrate-client
 */
export const HydrateClient = unstable_createHydrateClient(getQueryClient);
