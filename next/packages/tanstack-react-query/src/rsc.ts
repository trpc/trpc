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
  noop,
  QueryClient,
  type QueryExecuteOptions,
} from '@tanstack/react-query';
import {
  createTrpcQueryUtils,
  hydrationOptions,
  type TrpcQueryUtils,
} from '@trpc12/tanstack-query';
import { cache as reactCache, createElement, type ReactNode } from 'react';
import type { TrpcClient } from '@trpc12/trpc/client';
import type { AnySerializer, DansonForm } from '@trpc12/trpc/serializer';
import {
  createRouterClient,
  type AnyRouter,
  type RouterClientOptions,
  type SerializerOption,
} from '@trpc12/trpc/server';

/** Next's `redirect()`, `notFound()` and dynamic-API errors carry a `digest`. */
const hasDigest = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  typeof (error as { digest?: unknown }).digest === 'string';

/**
 * Options for {@link createTrpcRsc}: the router and its ctx (a function is
 * called once per request) and layer, as for `createRouterClient`.
 * @since 0.1.0
 * @stability stable
 */
export type TrpcRscOptions<TRouter extends AnyRouter> = {
  router: TRouter;
  /** Makes each request's query client. @default a `QueryClient` with a 30 s `staleTime` */
  makeQueryClient?: () => QueryClient;
  /**
   * Per-request memoization. React's `cache()` only memoizes in server
   * components; tests pass their own.
   * @default React's `cache`
   */
  cache?: <TFn extends (...args: any[]) => any>(fn: TFn) => TFn;
  /** Must match the browser's `keyPrefix`, so prefetched queries hydrate. */
  keyPrefix?: string | undefined;
} & RouterClientOptions<TRouter> &
  SerializerOption;

/**
 * What {@link createTrpcRsc} returns.
 * @since 0.1.0
 * @stability stable
 */
export interface TrpcRsc<TRouter extends AnyRouter> {
  /** Query helpers whose calls go straight to the router. */
  trpc: TrpcQueryUtils<TrpcClient<TRouter, {}, DansonForm>>;
  /** Calls the router directly, without the query cache. */
  caller: TrpcClient<TRouter, {}, DansonForm>;
  /** The request's query client. */
  getQueryClient: () => QueryClient;
  /** Starts a query on the request's client without waiting for it. */
  prefetch: (options: QueryExecuteOptions<any, any, any, any, any>) => void;
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
 * const post = await getQueryClient().query(
 *   trpc.post.byId.queryOptions({ input: { id } }),
 * );
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function createTrpcRsc<TRouter extends AnyRouter>(
  opts: TrpcRscOptions<TRouter>,
): TrpcRsc<TRouter> {
  const cache = opts.cache ?? reactCache;
  const { dehydrate: dehydrateOptions } = hydrationOptions({
    serializer: (opts as { serializer?: AnySerializer }).serializer,
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
  } as never) as TrpcClient<TRouter, {}, DansonForm>;
  const trpc = createTrpcQueryUtils({
    client: caller,
    keyPrefix: opts.keyPrefix,
  });

  return {
    trpc,
    caller,
    getQueryClient,
    prefetch: (options) => {
      void getQueryClient().query(options).catch(noop);
    },
    HydrationBoundary: ({ children }) => {
      const client = getQueryClient();
      const state = dehydrate(client, {
        shouldRedactErrors:
          client.getDefaultOptions().dehydrate?.shouldRedactErrors ??
          ((error) => !hasDigest(error)),
        ...dehydrateOptions,
      });
      return createElement(ClientHydrationBoundary, { state }, children);
    },
  };
}
