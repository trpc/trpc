import 'server-only';
import { createHydrationHelpers } from '@trpc/react-query/rsc';
import { auth } from '~/auth';
import type { Context } from '~/server/context';
import { appRouter } from '~/server/routers/_app';
import { createCallerFactory } from '~/server/trpc';
import { headers } from 'next/headers';
import { cache } from 'react';
import { createQueryClient } from './shared';

const createContext = cache(async (): Promise<Context> => {
  const _headers = new Headers(await headers());
  _headers.set('x-trpc-source', 'rsc');

  return {
    headers: Object.fromEntries(_headers),
    session: await auth(),
  };
});

/**
 * Create a stable getter for the query client that
 * will return the same client during the same request.
 */
const getQueryClient = cache(createQueryClient);
const caller = createCallerFactory(appRouter)(createContext);

export const { trpc, HydrateClient } = createHydrationHelpers<typeof appRouter>(
  caller,
  getQueryClient,
);
