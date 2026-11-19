/**
 * The showcase's tRPC setup. The server calls the router directly; the
 * browser calls the endpoint (`api.$.ts`) with a link that pipelines: a
 * query in a batch can read its input from another query's data, and the
 * server fills it in, so a page's queries are one request even when each
 * needs the one before.
 */
import {
  dehydrate,
  isServer,
  QueryClient,
  type DehydratedState,
} from '@tanstack/react-query';
import { createIsomorphicFn } from '@tanstack/react-start';
import {
  createTRPCClient,
  experimental_pipelining,
  httpBatchStreamLink,
  isTRPCClientError,
} from '@trpc/client';
import {
  createTRPCContext,
  createTRPCOptionsProxy,
  type TRPCOptionsProxy,
} from '@trpc/tanstack-react-query';
import { TRPCError } from '@trpc/server';

import { meteredFetch } from './-request-meter.ts';
import { slowQueriesHeaders } from './-settings.ts';
import { appRouter, type AppRouter } from './-server/router.ts';

export const endpoint = '/kitchen-sink/blog/api';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
export type TRPC = TRPCOptionsProxy<AppRouter>;

/** A post that isn't there: from the endpoint, or from the router itself */
export function isNotFound(error: unknown) {
  return (
    (isTRPCClientError<AppRouter>(error) && error.data?.code === 'NOT_FOUND') ||
    (error instanceof TRPCError && error.code === 'NOT_FOUND')
  );
}

const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // Hydrated data keeps the server's fetch time; without a stale time,
        // the browser would fetch it again at once.
        staleTime: 60_000,
        // Asking again doesn't make a missing post appear
        retry: (failureCount, error) =>
          !isServer && failureCount < 3 && !isNotFound(error),
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

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchStreamLink({
      url: endpoint,
      // Lets a query read its input from another query's data, in one
      // request. The handler allows it too (`api.$.ts`).
      experimental_pipelining: experimental_pipelining(),
      // Queries go as POST, so the Network tab shows their inputs as JSON.
      methodOverride: 'POST',
      // The "Slow queries" setting, from the page's search params.
      headers: () => slowQueriesHeaders(),
      // Only for the request meter: it counts the requests.
      fetch: (url, init) =>
        meteredFetch(url, { ...init, signal: init?.signal ?? null }),
    }),
  ],
});

/**
 * Resolves once no query is fetching. A query that reads another's data
 * starts once that data is in, a step after it, so this checks again after
 * each change.
 */
async function idle(queryClient: QueryClient) {
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (queryClient.isFetching() === 0) {
      return;
    }
    await new Promise<void>((resolve) => {
      const unsubscribe = queryClient.getQueryCache().subscribe(() => {
        unsubscribe();
        resolve();
      });
    });
  }
}

/**
 * The proxy a loader loads handles with, its query client, and what it
 * sends to the browser with the page.
 *
 * On the server, it calls the router in the same process, into a query
 * client made for this request. A query that reads another's data only
 * starts once that data is in, so before the page goes out this waits for
 * every query, which takes no network trip here, and sends their data with
 * the page.
 *
 * In the browser, it calls the endpoint, into the tab's client, and waits
 * for nothing: the link sends the page's queries in one request.
 */
export const loaderTRPC = createIsomorphicFn()
  .server(() => {
    const queryClient = getQueryClient();
    return {
      dehydrated: async (): Promise<DehydratedState | null> => {
        await idle(queryClient);
        return dehydrate(queryClient);
      },
      queryClient,
      trpc: createTRPCOptionsProxy({
        // "Slow queries" slows the requests your browser sends. The page the
        // server renders doesn't wait for it.
        ctx: { slowQueries: false },
        queryClient,
        router: appRouter,
      }),
    };
  })
  .client(() => {
    const queryClient = getQueryClient();
    return {
      dehydrated: (): Promise<DehydratedState | null> => Promise.resolve(null),
      queryClient,
      trpc: createTRPCOptionsProxy({ client: trpcClient, queryClient }),
    };
  });
