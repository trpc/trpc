import 'server-only';
import { createHydrationHelpers } from '@trpc/react-query/rsc';
import type { inferRouterOutputs } from '@trpc/server';
import { auth } from '~/auth';
import type { Context } from '~/server/context';
import { appRouter } from '~/server/routers/_app';
import { createCallerFactory } from '~/server/trpc';
import { headers } from 'next/headers';
import { cache } from 'react';
import { createQueryClient } from './shared';

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a tRPC call from a React Server Component.
 */
const createContext = cache(async (): Promise<Context> => {
  const _headers = new Headers(headers());
  _headers.set('x-trpc-source', 'rsc');

  return {
    headers: Object.fromEntries(_headers),
    session: await auth(),
  };
});

const getQueryClient = cache(createQueryClient);
const caller = createCallerFactory(appRouter)(createContext);

export const { trpc, HydrateClient } = createHydrationHelpers<typeof appRouter>(
  caller,
  getQueryClient,
);

export type RouterOutputs = inferRouterOutputs<typeof appRouter>;
