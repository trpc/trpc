/**
 * The showcase's tRPC setup. The server calls the router directly; the
 * browser calls the endpoint (`api.$.ts`) and counts its requests, so the
 * page can show that hydrated data isn't fetched again.
 */
import { isServer, QueryClient } from '@tanstack/react-query';
import { createIsomorphicFn } from '@tanstack/react-start';
import { createTRPCClient, httpBatchLink, routerType } from '@trpc/client';
import {
  createTRPCContext,
  createTRPCOptionsProxy,
  type TRPCOptionsProxy,
} from '@trpc/tanstack-react-query';
import { useSyncExternalStore } from 'react';

import { appRouter, type AppRouter } from './-server/router.ts';

export const endpoint = '/kitchen-sink/handles/api';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
export type TRPC = TRPCOptionsProxy<AppRouter>;

const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      // Hydrated data keeps the server's fetch time; without a stale time,
      // the browser would fetch it again at once.
      queries: { staleTime: 60_000 },
      // Pending queries go to the browser too, and finish there as they
      // stream in.
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          query.state.status === 'success' || query.state.status === 'pending',
      },
    },
  });

let browserQueryClient: QueryClient | undefined;

/** A new client for each server render, and one for the whole tab. */
export function getQueryClient() {
  if (isServer) {
    return makeQueryClient();
  }
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

let sent = 0;
const listeners = new Set<() => void>();

export const trpcClient = createTRPCClient({
  router: routerType<AppRouter>(),
  links: [
    httpBatchLink({
      fetch: (url, init) => {
        sent += 1;
        for (const listener of listeners) listener();
        return fetch(url, { ...init, signal: init?.signal ?? null });
      },
      url: endpoint,
    }),
  ],
});

/** How many requests this tab sent to the endpoint. The server sent none. */
export function useRequestCount() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => sent,
    () => 0,
  );
}

/**
 * The proxy a loader loads handles with, and its query client. On the
 * server it calls the router in the same process, into a client made for
 * this request; in the browser, the endpoint, into the tab's client.
 */
export const loaderTRPC = createIsomorphicFn()
  .server(() => {
    const queryClient = getQueryClient();
    return {
      queryClient,
      trpc: createTRPCOptionsProxy({ ctx: {}, queryClient, router: appRouter }),
    };
  })
  .client(() => {
    const queryClient = getQueryClient();
    return {
      queryClient,
      trpc: createTRPCOptionsProxy({ client: trpcClient, queryClient }),
    };
  });
