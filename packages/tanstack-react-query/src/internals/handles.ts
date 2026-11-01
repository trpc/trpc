import type {
  FetchQueryOptions,
  GetNextPageParamFunction,
  QueryClient,
  QueryFunction,
} from '@tanstack/react-query';
import { hashKey, isCancelledError } from '@tanstack/react-query';
import type { TRPCClientErrorLike } from '@trpc/client';
import { isTRPCClientError } from '@trpc/client';
import { dehydrateHandleQuery, hydrateHandleQuery } from './hydration';
import type {
  UnusedSkipTokenTRPCInfiniteQueryOptionsIn,
  UnusedSkipTokenTRPCInfiniteQueryOptionsOut,
} from './infiniteQueryOptions';
import type {
  UnusedSkipTokenTRPCQueryOptionsIn,
  UnusedSkipTokenTRPCQueryOptionsOut,
} from './queryOptions';
import type {
  ExtractCursorType,
  FeatureFlags,
  ResolverDef,
  TRPCQueryBaseOptions,
  TRPCQueryKey,
} from './types';
import { readQueryKey } from './utils';

declare const handleDef: unique symbol;

type ErrorOf<TDef extends ResolverDef> = TRPCClientErrorLike<{
  transformer: TDef['transformer'];
  errorShape: TDef['errorShape'];
}>;

type InfiniteHandleInput<TInput> = TInput extends object
  ? Omit<TInput, 'cursor' | 'direction'>
  : TInput;

/**
 * A plain tuple typed with the procedure's input. TanStack Router's serializability check
 * rejects `unknown` inputs and `DataTag`-ged keys, so handles in `beforeLoad` need this shape.
 */
type HandleQueryKey<
  TDef extends ResolverDef,
  TInput,
  TType extends 'query' | 'infinite',
> = TDef['featureFlags']['keyPrefix'] extends true
  ? [prefix: string[], path: string[], opts?: { input?: TInput; type?: TType }]
  : [path: string[], opts?: { input?: TInput; type?: TType }];

/**
 * A serializable reference to a query started on the server (or in a loader).
 * Pass it to a client component and read it with `trpc.unstable_fromHandle(handle)`.
 */
export interface unstable_TRPCQueryHandle<
  TDef extends ResolverDef = ResolverDef,
> {
  /** Type-only: never present at runtime. */
  readonly [handleDef]?: TDef & { kind: 'query' };
  readonly queryKey: HandleQueryKey<TDef, TDef['input'], 'query'>;
  /** The input the query was started with */
  readonly input: TDef['input'];
}

/**
 * A serializable reference to an infinite query started on the server (or in a loader).
 * Read it with `trpc.unstable_fromHandle(handle, { getNextPageParam })`.
 */
export interface unstable_TRPCInfiniteQueryHandle<
  TDef extends ResolverDef = ResolverDef,
> {
  /** Type-only: never present at runtime. */
  readonly [handleDef]?: TDef & { kind: 'infinite' };
  readonly queryKey: HandleQueryKey<
    TDef,
    InfiniteHandleInput<TDef['input']>,
    'infinite'
  >;
  /** The input the query was started with, without `cursor` and `direction` */
  readonly input: InfiniteHandleInput<TDef['input']>;
  readonly initialCursor?: NonNullable<ExtractCursorType<TDef['input']>> | null;
}

export type unstable_AnyTRPCHandle =
  unstable_TRPCQueryHandle<any> | unstable_TRPCInfiniteQueryHandle<any>;

/** Options for starting a query that returns a handle */
export interface unstable_TRPCPrefetchOptions
  extends
    Pick<
      FetchQueryOptions,
      'staleTime' | 'retry' | 'retryDelay' | 'gcTime' | 'meta'
    >,
    TRPCQueryBaseOptions {}

export type unstable_TRPCPrefetchInfiniteOptions<TDef extends ResolverDef> =
  unstable_TRPCPrefetchOptions & {
    initialCursor?: NonNullable<ExtractCursorType<TDef['input']>> | null;
  } & (
      | { pages?: never }
      | {
          /** Number of pages to load up front */
          pages: number;
          getNextPageParam: GetNextPageParamFunction<
            NonNullable<ExtractCursorType<TDef['input']>> | null,
            TDef['output']
          >;
        }
    );

/** Verbs added to query procedures */
export interface DecorateQueryHandleVerbs<TDef extends ResolverDef> {
  /**
   * Start the query without waiting and return a serializable handle for it.
   * Never throws: errors surface where the handle is read.
   *
   * Not available on `useTRPC()`.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles
   */
  unstable_prefetch: (
    ...args: undefined extends TDef['input']
      ? [input?: TDef['input'], opts?: unstable_TRPCPrefetchOptions]
      : [input: TDef['input'], opts?: unstable_TRPCPrefetchOptions]
  ) => unstable_TRPCQueryHandle<TDef>;
  /**
   * Start the query and wait until the cache has data for it.
   * Rejects if that request fails.
   *
   * Not available on `useTRPC()`.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles
   */
  unstable_ensure: (
    ...args: undefined extends TDef['input']
      ? [input?: TDef['input'], opts?: unstable_TRPCPrefetchOptions]
      : [input: TDef['input'], opts?: unstable_TRPCPrefetchOptions]
  ) => Promise<unstable_TRPCQueryHandle<TDef>>;
  /**
   * Like `unstable_ensure`, but stale data in the cache is refetched before it resolves.
   * Rejects if that request fails.
   *
   * Not available on `useTRPC()`.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#fetch
   */
  unstable_fetch: (
    ...args: undefined extends TDef['input']
      ? [input?: TDef['input'], opts?: unstable_TRPCPrefetchOptions]
      : [input: TDef['input'], opts?: unstable_TRPCPrefetchOptions]
  ) => Promise<unstable_TRPCQueryHandle<TDef>>;
}

/** Verbs added to query procedures with a `cursor` input */
export interface DecorateInfiniteQueryHandleVerbs<TDef extends ResolverDef> {
  /**
   * Like `unstable_prefetch`, for an infinite query. Loads the first page unless `pages` is set.
   *
   * Not available on `useTRPC()`.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#infinite-queries
   */
  unstable_prefetchInfinite: (
    input: TDef['input'],
    opts?: unstable_TRPCPrefetchInfiniteOptions<TDef>,
  ) => unstable_TRPCInfiniteQueryHandle<TDef>;
  /**
   * Like `unstable_ensure`, for an infinite query.
   *
   * Not available on `useTRPC()`.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#infinite-queries
   */
  unstable_ensureInfinite: (
    input: TDef['input'],
    opts?: unstable_TRPCPrefetchInfiniteOptions<TDef>,
  ) => Promise<unstable_TRPCInfiniteQueryHandle<TDef>>;
  /**
   * Like `unstable_fetch`, for an infinite query.
   *
   * Not available on `useTRPC()`.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#infinite-queries
   */
  unstable_fetchInfinite: (
    input: TDef['input'],
    opts?: unstable_TRPCPrefetchInfiniteOptions<TDef>,
  ) => Promise<unstable_TRPCInfiniteQueryHandle<TDef>>;
}

/** Readers added to every router level of the options proxy */
export interface DecorateHandleReaders<TFeatureFlags extends FeatureFlags> {
  /**
   * Options for a handle: the same options `trpc.<path>.queryOptions(input)` or
   * `trpc.<path>.infiniteQueryOptions(input, opts)` return for the handle's procedure and input.
   * Pass them to `useQuery`, `useSuspenseQuery`, `useSuspenseInfiniteQuery`, etc.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#reading-a-handle
   */
  unstable_fromHandle: {
    <
      TDef extends ResolverDef,
      TQueryFnData extends TDef['output'] = TDef['output'],
      TData = TQueryFnData,
    >(
      handle: unstable_TRPCQueryHandle<TDef>,
      opts?: UnusedSkipTokenTRPCQueryOptionsIn<
        TQueryFnData,
        TData,
        ErrorOf<TDef>,
        TFeatureFlags
      >,
    ): UnusedSkipTokenTRPCQueryOptionsOut<
      TQueryFnData,
      TData,
      ErrorOf<TDef>,
      TFeatureFlags
    >;
    <
      TDef extends ResolverDef,
      TQueryFnData extends TDef['output'] = TDef['output'],
      TData = TQueryFnData,
    >(
      handle: unstable_TRPCInfiniteQueryHandle<TDef>,
      opts: UnusedSkipTokenTRPCInfiniteQueryOptionsIn<
        TDef['input'],
        TQueryFnData,
        TData,
        ErrorOf<TDef>,
        TFeatureFlags
      >,
    ): UnusedSkipTokenTRPCInfiniteQueryOptionsOut<
      TDef['input'],
      TQueryFnData,
      TData,
      ErrorOf<TDef>,
      TFeatureFlags
    >;
  };
}

export type unstable_inferQueryHandle<
  TProcedure extends DecorateQueryHandleVerbs<any>,
> = ReturnType<TProcedure['unstable_prefetch']>;

export type unstable_inferInfiniteQueryHandle<
  TProcedure extends DecorateInfiniteQueryHandleVerbs<any>,
> = ReturnType<TProcedure['unstable_prefetchInfinite']>;

/**
 * @internal
 */
export function readHandle(
  handle: unstable_AnyTRPCHandle,
  prefix: string | undefined,
) {
  const queryKey = handle?.queryKey as unknown as TRPCQueryKey<any> | undefined;
  if (!Array.isArray(queryKey)) {
    throw new Error(
      `Expected a tRPC handle from \`.unstable_prefetch()\` / \`.unstable_ensure()\` / \`.unstable_fetch()\`, got ${JSON.stringify(handle)}`,
    );
  }
  const data = readQueryKey(queryKey);
  const type = data.args?.type;
  if (type !== 'query' && type !== 'infinite') {
    throw new Error(
      `Expected a tRPC handle from \`.unstable_prefetch()\` / \`.unstable_ensure()\` / \`.unstable_fetch()\`, got a key of type ${String(type)} for "${data.path.join('.')}"`,
    );
  }
  if ((data.prefix?.[0] ?? undefined) !== prefix) {
    throw new Error(
      `The handle for "${data.path.join('.')}" was created with keyPrefix ${JSON.stringify(data.prefix?.[0])}, but this proxy uses ${JSON.stringify(prefix)}`,
    );
  }
  return {
    type,
    path: data.path,
    input: data.args?.input,
    queryKey,
    dehydratedQuery: (handle as { dehydratedQuery?: unknown }).dehydratedQuery,
  };
}

/**
 * @internal
 */
export type HandleVerb = 'prefetch' | 'ensure' | 'fetch';

/**
 * A prefetch during render runs on every render, so it only starts a query
 * the cache has never fetched, keyed by the query hash. Stale data is
 * refetched by the reader's observer, and an error stays until the reader's
 * error boundary resets it: restarting it here would suspend the reader again.
 */
function needsRenderPrefetch(queryClient: QueryClient, options: any) {
  const query = queryClient
    .getQueryCache()
    .get(queryClient.defaultQueryOptions(options).queryHash);
  return (
    !query ||
    (query.state.status === 'pending' && query.state.fetchStatus === 'idle')
  );
}

/**
 * @internal
 */
export function startHandle(opts: {
  queryClient: QueryClient;
  options: any;
  kind: 'query' | 'infinite';
  verb: HandleVerb;
  selfHydrating: boolean;
  inRender: boolean;
}) {
  const { queryClient, options, kind, verb, selfHydrating, inRender } = opts;
  const input = readQueryKey(options.queryKey).args?.input;
  const handle: Record<string, unknown> = { queryKey: options.queryKey, input };
  if (kind === 'infinite' && options.initialPageParam != null) {
    handle['initialCursor'] = options.initialPageParam;
  }
  if (inRender) {
    if (needsRenderPrefetch(queryClient, options)) {
      void (kind === 'infinite'
        ? queryClient.prefetchInfiniteQuery(options)
        : queryClient.prefetchQuery(options));
    }
    return handle;
  }
  const done = () => {
    if (selfHydrating) {
      const dehydratedQuery = dehydrateHandleQuery(
        queryClient,
        options.queryKey,
      );
      if (dehydratedQuery) {
        handle['dehydratedQuery'] = dehydratedQuery;
      }
    }
    return handle;
  };

  if (kind === 'infinite') {
    switch (verb) {
      case 'prefetch':
        void queryClient.prefetchInfiniteQuery(options);
        return done();
      case 'ensure':
        return queryClient
          .ensureInfiniteQueryData({ ...options, revalidateIfStale: true })
          .then(done);
      case 'fetch':
        return queryClient.fetchInfiniteQuery(options).then(done);
    }
  }
  switch (verb) {
    case 'prefetch':
      void queryClient.prefetchQuery(options);
      return done();
    case 'ensure':
      return queryClient
        .ensureQueryData({ ...options, revalidateIfStale: true })
        .then(done);
    case 'fetch':
      return queryClient.fetchQuery(options).then(done);
  }
}

/**
 * @internal
 */
export function isServerEnvironment() {
  return typeof window === 'undefined' || 'Deno' in globalThis;
}

const warnedNotHydrated = new Set<string>();

function warnIfNotHydrated(
  path: readonly string[],
  queryFn: QueryFunction<any, any, any>,
): QueryFunction<any, any, any> {
  return (context) => {
    if (isServerEnvironment()) {
      const queryHash = hashKey(context.queryKey);
      if (!warnedNotHydrated.has(queryHash)) {
        warnedNotHydrated.add(queryHash);
        // eslint-disable-next-line no-console
        console.warn(
          `[@trpc/tanstack-react-query] The handle for "${path.join('.')}" is being fetched again during server rendering: ` +
            `the query it refers to isn't in this QueryClient. ` +
            `Render the reading component inside <HydrateClient> (or use self-hydrating handles), and don't return handles from server functions or server actions. ` +
            `See https://trpc.io/docs/client/tanstack-react-query/handles#where-handles-dont-work`,
        );
      }
    }
    return queryFn(context);
  };
}

const watchedHydrations = new WeakSet<Promise<unknown>>();

/**
 * A query dehydrated as pending that later rejects reaches the browser as a
 * redacted error, before any `retry` from `unstable_fromHandle()` applies. Refetch such
 * a query once so error boundaries see a `TRPCClientError` from this client.
 */
function refetchRejectedHydration(queryClient: QueryClient, options: any) {
  if (isServerEnvironment()) {
    return;
  }
  const query = queryClient
    .getQueryCache()
    .find({ queryKey: options.queryKey, exact: true });
  const promise = query?.promise;
  if (
    !query ||
    !promise ||
    query.state.data !== undefined ||
    query.state.fetchStatus === 'idle' ||
    watchedHydrations.has(promise)
  ) {
    return;
  }
  watchedHydrations.add(promise);
  promise.catch((error: unknown) => {
    if (
      isTRPCClientError(error) ||
      isCancelledError(error) ||
      query.state.fetchStatus !== 'idle'
    ) {
      return;
    }
    query.fetch(queryClient.defaultQueryOptions(options)).catch(() => {
      // surfaces through the query's state
    });
  });
}

/**
 * @internal
 */
export function prepareHandleRead<TOptions extends { queryFn?: unknown }>(
  queryClient: QueryClient,
  handle: ReturnType<typeof readHandle>,
  options: TOptions,
): TOptions {
  if (
    globalThis.process?.env?.['NODE_ENV'] !== 'production' &&
    typeof options.queryFn === 'function'
  ) {
    options.queryFn = warnIfNotHydrated(
      handle.path,
      options.queryFn as QueryFunction<any, any, any>,
    );
  }
  hydrateHandleQuery(queryClient, handle.dehydratedQuery);
  refetchRejectedHydration(queryClient, options);
  return options;
}
