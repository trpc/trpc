import 'server-only';
import {
  createTRPCOptionsProxy,
  unstable_createHydrateClient,
} from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { appRouter } from '~/server/routers/_app';
import { makeQueryClient } from './query-client';

// one query client per request
export const getQueryClient = cache(makeQueryClient);

export const trpc = createTRPCOptionsProxy({
  ctx: {},
  router: appRouter,
  queryClient: getQueryClient,
});

export const HydrateClient = unstable_createHydrateClient(getQueryClient);
