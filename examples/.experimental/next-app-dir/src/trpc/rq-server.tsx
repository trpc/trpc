import 'server-only';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type {
  TRPCInfiniteQueryOptions,
  TRPCQueryOptions,
} from '@trpc/tanstack-react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { auth } from '~/auth';
import type { Context } from '~/server/context';
import { appRouter } from '~/server/routers/_app';
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

export const trpc = createTRPCOptionsProxy({
  router: appRouter,
  queryClient: getQueryClient,
  ctx: createContext,
});

export function HydrateClient(props: { children: React.ReactNode }) {
  const dehydratedState = dehydrate(getQueryClient());

  return (
    <HydrationBoundary state={dehydratedState}>
      {props.children}
    </HydrationBoundary>
  );
}

export function prefetch(
  queryOptions:
    | ReturnType<TRPCQueryOptions<any>>
    | ReturnType<TRPCInfiniteQueryOptions<any>>,
) {
  const queryClient = getQueryClient();
  // `initialPageParam` is only present on infinite query options, so it
  // discriminates the union for us
  if ('initialPageParam' in queryOptions) {
    void queryClient.prefetchInfiniteQuery(queryOptions);
  } else {
    void queryClient.prefetchQuery(queryOptions);
  }
}
