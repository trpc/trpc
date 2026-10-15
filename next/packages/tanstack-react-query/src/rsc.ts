/**
 * React Server Components helpers (15 Q15.4), for Next, TanStack Start or
 * any RSC setup: a per-request query client and router caller through
 * React's `cache()`, the query helpers for server components, and a
 * server `HydrationBoundary` that sends prefetched queries to the browser.
 *
 * @example
 * ```tsx
 * // trpc/server.ts
 * import 'server-only';
 * export const { trpc, getQueryClient, prefetch, HydrationBoundary } =
 *   createTrpcRsc({ router: appRouter, ctx: createContext });
 *
 * // app/post/[id]/page.tsx (a server component)
 * export default async function Page({ params }) {
 *   prefetch(trpc.post.byId.queryOptions({ input: { id: params.id } }));
 *   return (
 *     <HydrationBoundary>
 *       <Post id={params.id} />
 *     </HydrationBoundary>
 *   );
 * }
 * ```
 * @module
 */
import {
  dehydrate,
  HydrationBoundary as ClientHydrationBoundary,
  QueryClient,
  type FetchQueryOptions,
} from '@tanstack/react-query';
import {
  createTrpcQueryUtils,
  hydrationOptions,
  type TrpcQueryUtils,
} from '@trpcdev/tanstack-query';
import { cache as reactCache, createElement, type ReactNode } from 'react';
import type { TrpcClient } from 'trpcdev/client';
import type { Serializer } from 'trpcdev/serializer';
import {
  createRouterClient,
  type AnyRouter,
  type RouterClientOptions,
} from 'trpcdev/server';

/**
 * Options for {@link createTrpcRsc}: the router and its ctx (a function is
 * called once per request) and layer, as for `createRouterClient`.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type TrpcRscOptions<TRouter extends AnyRouter> = {
  router: TRouter;
  /** Makes each request's query client. @default a `QueryClient` with a 30 s `staleTime` */
  makeQueryClient?: () => QueryClient;
  /** Must match the browser's `hydrationOptions()`. @default defaultSerializer */
  serializer?: Serializer;
  /**
   * Per-request memoization. React's `cache()` only memoizes in server
   * components; tests pass their own.
   * @default React's `cache`
   */
  cache?: <TFn extends (...args: any[]) => any>(fn: TFn) => TFn;
} & RouterClientOptions<TRouter>;

/**
 * What {@link createTrpcRsc} returns.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TrpcRsc<TRouter extends AnyRouter> {
  /** Query helpers whose calls go straight to the router. */
  trpc: TrpcQueryUtils<TrpcClient<TRouter>>;
  /** Calls the router directly, without the query cache. */
  caller: TrpcClient<TRouter>;
  /** The request's query client. */
  getQueryClient: () => QueryClient;
  /** Starts a query on the request's client without waiting for it. */
  prefetch: (options: FetchQueryOptions<any, any, any, any>) => void;
  /**
   * Sends the request's queries to the browser cache, pending ones as
   * promises that stream in. Render it around the client components that
   * read them, inside the app's `QueryClientProvider`.
   */
  HydrationBoundary: (props: { children?: ReactNode }) => ReactNode;
}

/**
 * Creates the server-component helpers for a router.
 *
 * @example
 * ```tsx
 * const { trpc, getQueryClient, HydrationBoundary } = createTrpcRsc({
 *   router: appRouter,
 *   ctx: async () => ({ user: await auth() }),
 * });
 * const post = await getQueryClient().fetchQuery(
 *   trpc.post.byId.queryOptions({ input: { id } }),
 * );
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function createTrpcRsc<TRouter extends AnyRouter>(
  opts: TrpcRscOptions<TRouter>,
): TrpcRsc<TRouter> {
  const cache = opts.cache ?? reactCache;
  const { dehydrate: dehydrateOptions } = hydrationOptions({
    serializer: opts.serializer,
  });
  const getQueryClient = cache(
    opts.makeQueryClient ??
      (() =>
        new QueryClient({
          defaultOptions: { queries: { staleTime: 30_000 } },
        })),
  );
  const ctx = (opts as { ctx?: unknown }).ctx;
  const caller = createRouterClient(opts.router, {
    ...opts,
    ctx: typeof ctx === 'function' ? cache(ctx as () => unknown) : ctx,
  } as never) as TrpcClient<TRouter>;
  const trpc = createTrpcQueryUtils({ client: caller });

  return {
    trpc,
    caller,
    getQueryClient,
    prefetch: (options) => {
      void getQueryClient().prefetchQuery(options);
    },
    HydrationBoundary: ({ children }) =>
      createElement(
        ClientHydrationBoundary,
        { state: dehydrate(getQueryClient(), dehydrateOptions) },
        children,
      ),
  };
}
