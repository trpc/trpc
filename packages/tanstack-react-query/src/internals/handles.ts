import type {
  DataTag,
  FetchQueryOptions,
  GetNextPageParamFunction,
  QueryClient,
  QueryFunction,
} from '@tanstack/react-query';
import { hashKey, isCancelledError } from '@tanstack/react-query';
import type { TRPCClientErrorLike } from '@trpc/client';
import { isTRPCClientError } from '@trpc/client';
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
  TRPCInfiniteData,
  TRPCQueryBaseOptions,
  TRPCQueryKey,
} from './types';
import { readQueryKey } from './utils';

declare const handleDef: unique symbol;

type ErrorOf<TDef extends ResolverDef> = TRPCClientErrorLike<{
  transformer: TDef['transformer'];
  errorShape: TDef['errorShape'];
}>;

/**
 * A serializable reference to a query started on the server (or in a loader).
 * Pass it to a client component and read it with `trpc.unstable_fromHandle(handle)`.
 */
export interface unstable_TRPCQueryHandle<
  TDef extends ResolverDef = ResolverDef,
> {
  /** Type-only: never present at runtime. */
  readonly [handleDef]?: TDef & { kind: 'query' };
  readonly queryKey: DataTag<
    TRPCQueryKey<TDef['featureFlags']['keyPrefix']>,
    TDef['output'],
    ErrorOf<TDef>
  >;
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
  readonly queryKey: DataTag<
    TRPCQueryKey<TDef['featureFlags']['keyPrefix']>,
    TRPCInfiniteData<TDef['input'], TDef['output']>,
    ErrorOf<TDef>
  >;
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

/**
 * A handle from `.ensure()` or `.fetch()`: the handle plus the data they waited for.
 * `data` is serialized with the handle wherever you pass it.
 */
export type unstable_TRPCQueryHandleWithData<
  TDef extends ResolverDef = ResolverDef,
> = unstable_TRPCQueryHandle<TDef> & {
  readonly data: TDef['output'];
};

/**
 * An infinite handle from `.ensureInfinite()` or `.fetchInfinite()`: the handle plus the pages they waited for.
 * `data` is serialized with the handle wherever you pass it.
 */
export type unstable_TRPCInfiniteQueryHandleWithData<
  TDef extends ResolverDef = ResolverDef,
> = unstable_TRPCInfiniteQueryHandle<TDef> & {
  readonly data: TRPCInfiniteData<TDef['input'], TDef['output']>;
};

type HandleVerbArgs<TDef extends ResolverDef> = undefined extends TDef['input']
  ? [input?: TDef['input'], opts?: unstable_TRPCPrefetchOptions]
  : [input: TDef['input'], opts?: unstable_TRPCPrefetchOptions];

/** Verbs on query procedures of the handle proxy */
export interface DecorateQueryHandleVerbs<TDef extends ResolverDef> {
  /**
   * Start the query without waiting and return a serializable handle for it.
   * Never throws: errors surface where the handle is read.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#prefetch
   */
  prefetch: (...args: HandleVerbArgs<TDef>) => unstable_TRPCQueryHandle<TDef>;
  /**
   * Start the query and wait until the cache has data for it.
   * Stale data resolves at once and refetches in the background.
   * Rejects if the request fails.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#ensure
   */
  ensure: (
    ...args: HandleVerbArgs<TDef>
  ) => Promise<unstable_TRPCQueryHandleWithData<TDef>>;
  /**
   * Like `ensure`, but stale data is refetched before it resolves.
   * Rejects if the request fails.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#fetch
   */
  fetch: (
    ...args: HandleVerbArgs<TDef>
  ) => Promise<unstable_TRPCQueryHandleWithData<TDef>>;
}

/** Verbs on query procedures of the handle proxy that have a `cursor` input */
export interface DecorateInfiniteQueryHandleVerbs<TDef extends ResolverDef> {
  /**
   * Like `prefetch`, for an infinite query. Loads the first page unless `pages` is set.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#infinite-queries
   */
  prefetchInfinite: (
    input: TDef['input'],
    opts?: unstable_TRPCPrefetchInfiniteOptions<TDef>,
  ) => unstable_TRPCInfiniteQueryHandle<TDef>;
  /**
   * Like `ensure`, for an infinite query.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#infinite-queries
   */
  ensureInfinite: (
    input: TDef['input'],
    opts?: unstable_TRPCPrefetchInfiniteOptions<TDef>,
  ) => Promise<unstable_TRPCInfiniteQueryHandleWithData<TDef>>;
  /**
   * Like `fetch`, for an infinite query.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#infinite-queries
   */
  fetchInfinite: (
    input: TDef['input'],
    opts?: unstable_TRPCPrefetchInfiniteOptions<TDef>,
  ) => Promise<unstable_TRPCInfiniteQueryHandleWithData<TDef>>;
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
> = ReturnType<TProcedure['prefetch']>;

export type unstable_inferInfiniteQueryHandle<
  TProcedure extends DecorateInfiniteQueryHandleVerbs<any>,
> = ReturnType<TProcedure['prefetchInfinite']>;

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
      `Expected a tRPC handle from \`.prefetch()\` / \`.ensure()\` / \`.fetch()\`, got ${JSON.stringify(handle)}`,
    );
  }
  const data = readQueryKey(queryKey);
  const type = data.args?.type;
  if (type !== 'query' && type !== 'infinite') {
    throw new Error(
      `Expected a tRPC handle from \`.prefetch()\` / \`.ensure()\` / \`.fetch()\`, got a key of type ${String(type)} for "${data.path.join('.')}"`,
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
  };
}

/**
 * @internal
 */
export type HandleVerb = 'prefetch' | 'ensure' | 'fetch';

/**
 * @internal
 */
export function startHandle(opts: {
  queryClient: QueryClient;
  options: any;
  kind: 'query' | 'infinite';
  verb: HandleVerb;
}) {
  const { queryClient, options, kind, verb } = opts;
  if (kind === 'infinite') {
    const handle = {
      queryKey: options.queryKey,
      ...(options.initialPageParam != null && {
        initialCursor: options.initialPageParam,
      }),
    };
    switch (verb) {
      case 'prefetch':
        void queryClient.prefetchInfiniteQuery(options);
        return handle;
      case 'ensure':
        return queryClient
          .ensureInfiniteQueryData({ ...options, revalidateIfStale: true })
          .then((data) => ({ ...handle, data }));
      case 'fetch':
        return queryClient
          .fetchInfiniteQuery(options)
          .then((data) => ({ ...handle, data }));
    }
  }
  const handle = { queryKey: options.queryKey };
  switch (verb) {
    case 'prefetch':
      void queryClient.prefetchQuery(options);
      return handle;
    case 'ensure':
      return queryClient
        .ensureQueryData({ ...options, revalidateIfStale: true })
        .then((data) => ({ ...handle, data }));
    case 'fetch':
      return queryClient
        .fetchQuery(options)
        .then((data) => ({ ...handle, data }));
  }
}

function isServerEnvironment() {
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
            `Render the reading component inside <HydrateClient>, and don't return handles from server functions or server actions. ` +
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
  path: readonly string[],
  options: TOptions,
): TOptions {
  if (
    globalThis.process?.env?.['NODE_ENV'] !== 'production' &&
    typeof options.queryFn === 'function'
  ) {
    options.queryFn = warnIfNotHydrated(
      path,
      options.queryFn as QueryFunction<any, any, any>,
    );
  }
  refetchRejectedHydration(queryClient, options);
  return options;
}
