import type {
  FetchQueryOptions,
  GetNextPageParamFunction,
  QueryClient,
  QueryFunction,
} from '@tanstack/react-query';
import { hashKey, isCancelledError } from '@tanstack/react-query';
import type { TRPCClientErrorLike } from '@trpc/client';
import { isTRPCClientError } from '@trpc/client';
import type { coerceAsyncIterableToArray } from '@trpc/server/unstable-core-do-not-import';
import type {
  DefinedTRPCInfiniteQueryOptionsOut,
  UnusedSkipTokenTRPCInfiniteQueryOptionsIn,
  UnusedSkipTokenTRPCInfiniteQueryOptionsOut,
} from './infiniteQueryOptions';
import type {
  DefinedTRPCQueryOptionsOut,
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
 * Pass it to a client component and read it with `trpc.unstable_$fromHandle(handle)`.
 */
export interface unstable_TRPCQueryHandle<
  TDef extends ResolverDef = ResolverDef,
> {
  /**
   * Type-only: never present at runtime. Required, so only the handle verbs
   * create handles.
   */
  readonly [handleDef]: TDef & { kind: 'query' };
  readonly queryKey: HandleQueryKey<TDef, TDef['input'], 'query'>;
  /** The input the query was started with */
  readonly input: TDef['input'];
}

/**
 * A handle from `unstable_$ensure()` or `unstable_$fetch()`: it also carries the data
 * the query had then. `trpc.unstable_$fromHandle(handle)` uses it as `initialData`,
 * so `useQuery` has `data` from the first render. Data in the cache wins over it.
 */
export interface unstable_TRPCQueryHandleWithData<
  TDef extends ResolverDef = ResolverDef,
> extends unstable_TRPCQueryHandle<TDef> {
  readonly data: coerceAsyncIterableToArray<TDef['output']>;
  /** When `data` was fetched, as a timestamp, so its staleness carries over */
  readonly dataUpdatedAt: number;
}

/**
 * A serializable reference to an infinite query started on the server (or in a loader).
 * Read it with `trpc.unstable_$fromHandle(handle, { getNextPageParam })`.
 */
export interface unstable_TRPCInfiniteQueryHandle<
  TDef extends ResolverDef = ResolverDef,
> {
  /**
   * Type-only: never present at runtime. Required, so only the handle verbs
   * create handles.
   */
  readonly [handleDef]: TDef & { kind: 'infinite' };
  readonly queryKey: HandleQueryKey<
    TDef,
    InfiniteHandleInput<TDef['input']>,
    'infinite'
  >;
  /** The input the query was started with, without `cursor` and `direction` */
  readonly input: InfiniteHandleInput<TDef['input']>;
  readonly initialCursor?: NonNullable<ExtractCursorType<TDef['input']>> | null;
}

/**
 * An infinite handle from `unstable_$ensureInfinite()` or `unstable_$fetchInfinite()`:
 * it also carries the loaded `pages` and `pageParams`.
 */
export interface unstable_TRPCInfiniteQueryHandleWithData<
  TDef extends ResolverDef = ResolverDef,
> extends unstable_TRPCInfiniteQueryHandle<TDef> {
  readonly data: TRPCInfiniteData<TDef['input'], TDef['output']>;
  /** When `data` was fetched, as a timestamp, so its staleness carries over */
  readonly dataUpdatedAt: number;
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
   * Same as `void queryClient.prefetchQuery(trpc.<path>.queryOptions(input, opts))`.
   * On `useTRPC()`, call it during render: like TanStack's `usePrefetchQuery`, it only
   * starts a query the cache has no state for.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles
   */
  unstable_$prefetch: (
    ...args: undefined extends TDef['input']
      ? [input?: TDef['input'], opts?: unstable_TRPCPrefetchOptions]
      : [input: TDef['input'], opts?: unstable_TRPCPrefetchOptions]
  ) => unstable_TRPCQueryHandle<TDef>;
  /**
   * Start the query and wait until the cache has data for it. The handle carries that data.
   * Rejects if that request fails.
   *
   * Same as `await queryClient.ensureQueryData({ ...trpc.<path>.queryOptions(input, opts), revalidateIfStale: true })`.
   * Not available on `useTRPC()`.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles
   */
  unstable_$ensure: (
    ...args: undefined extends TDef['input']
      ? [input?: TDef['input'], opts?: unstable_TRPCPrefetchOptions]
      : [input: TDef['input'], opts?: unstable_TRPCPrefetchOptions]
  ) => Promise<unstable_TRPCQueryHandleWithData<TDef>>;
  /**
   * Like `unstable_$ensure`, but stale data in the cache is refetched before it resolves.
   * Rejects if that request fails.
   *
   * Same as `await queryClient.fetchQuery(trpc.<path>.queryOptions(input, opts))`.
   * Not available on `useTRPC()`.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#fetch
   */
  unstable_$fetch: (
    ...args: undefined extends TDef['input']
      ? [input?: TDef['input'], opts?: unstable_TRPCPrefetchOptions]
      : [input: TDef['input'], opts?: unstable_TRPCPrefetchOptions]
  ) => Promise<unstable_TRPCQueryHandleWithData<TDef>>;
}

/** Verbs added to query procedures with a `cursor` input */
export interface DecorateInfiniteQueryHandleVerbs<TDef extends ResolverDef> {
  /**
   * Like `unstable_$prefetch`, for an infinite query. Loads the first page unless `pages` is set.
   *
   * Same as `void queryClient.prefetchInfiniteQuery(trpc.<path>.infiniteQueryOptions(input, opts))`.
   * On `useTRPC()`, call it during render, like `unstable_$prefetch`.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#infinite-queries
   */
  unstable_$prefetchInfinite: (
    input: TDef['input'],
    opts?: unstable_TRPCPrefetchInfiniteOptions<TDef>,
  ) => unstable_TRPCInfiniteQueryHandle<TDef>;
  /**
   * Like `unstable_$ensure`, for an infinite query. The handle carries the loaded pages.
   *
   * Same as `await queryClient.ensureInfiniteQueryData({ ...trpc.<path>.infiniteQueryOptions(input, opts), revalidateIfStale: true })`.
   * Not available on `useTRPC()`.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#infinite-queries
   */
  unstable_$ensureInfinite: (
    input: TDef['input'],
    opts?: unstable_TRPCPrefetchInfiniteOptions<TDef>,
  ) => Promise<unstable_TRPCInfiniteQueryHandleWithData<TDef>>;
  /**
   * Like `unstable_$fetch`, for an infinite query. The handle carries the loaded pages.
   *
   * Same as `await queryClient.fetchInfiniteQuery(trpc.<path>.infiniteQueryOptions(input, opts))`.
   * Not available on `useTRPC()`.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#infinite-queries
   */
  unstable_$fetchInfinite: (
    input: TDef['input'],
    opts?: unstable_TRPCPrefetchInfiniteOptions<TDef>,
  ) => Promise<unstable_TRPCInfiniteQueryHandleWithData<TDef>>;
}

type WithoutInitialData<TOptions> = Omit<
  TOptions,
  'initialData' | 'initialDataUpdatedAt'
>;

/** Readers added to every router level of the options proxy */
export interface DecorateHandleReaders<TFeatureFlags extends FeatureFlags> {
  /**
   * Options for a handle: the same options `trpc.<path>.queryOptions(input)` or
   * `trpc.<path>.infiniteQueryOptions(input, opts)` return for the handle's procedure and input.
   * Pass them to `useQuery`, `useSuspenseQuery`, `useSuspenseInfiniteQuery`, etc.
   *
   * If the handle carries data, from `unstable_$ensure` or `unstable_$fetch`, it becomes
   * `initialData`, so `useQuery` has `data` from the first render. Data in the cache wins.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#reading-a-handle
   */
  unstable_$fromHandle: {
    <TDef extends ResolverDef, TData = TDef['output']>(
      handle: unstable_TRPCQueryHandleWithData<TDef>,
      opts?: WithoutInitialData<
        UnusedSkipTokenTRPCQueryOptionsIn<
          NoInfer<TDef['output']>,
          TData,
          ErrorOf<TDef>,
          TFeatureFlags
        >
      >,
    ): DefinedTRPCQueryOptionsOut<
      TDef['output'],
      TData,
      ErrorOf<TDef>,
      TFeatureFlags
    >;
    <TDef extends ResolverDef, TData = TDef['output']>(
      handle: unstable_TRPCQueryHandle<TDef>,
      opts?: UnusedSkipTokenTRPCQueryOptionsIn<
        NoInfer<TDef['output']>,
        TData,
        ErrorOf<TDef>,
        TFeatureFlags
      >,
    ): UnusedSkipTokenTRPCQueryOptionsOut<
      TDef['output'],
      TData,
      ErrorOf<TDef>,
      TFeatureFlags
    >;
    <TDef extends ResolverDef, TData = TDef['output']>(
      handle: unstable_TRPCInfiniteQueryHandleWithData<TDef>,
      opts: WithoutInitialData<
        UnusedSkipTokenTRPCInfiniteQueryOptionsIn<
          TDef['input'],
          NoInfer<TDef['output']>,
          TData,
          ErrorOf<TDef>,
          TFeatureFlags
        >
      >,
    ): DefinedTRPCInfiniteQueryOptionsOut<
      TDef['input'],
      TDef['output'],
      TData,
      ErrorOf<TDef>,
      TFeatureFlags
    >;
    <TDef extends ResolverDef, TData = TDef['output']>(
      handle: unstable_TRPCInfiniteQueryHandle<TDef>,
      opts: UnusedSkipTokenTRPCInfiniteQueryOptionsIn<
        TDef['input'],
        NoInfer<TDef['output']>,
        TData,
        ErrorOf<TDef>,
        TFeatureFlags
      >,
    ): UnusedSkipTokenTRPCInfiniteQueryOptionsOut<
      TDef['input'],
      TDef['output'],
      TData,
      ErrorOf<TDef>,
      TFeatureFlags
    >;
  };
}

export type unstable_inferQueryHandle<
  TProcedure extends DecorateQueryHandleVerbs<any>,
> = ReturnType<TProcedure['unstable_$prefetch']>;

export type unstable_inferQueryHandleWithData<
  TProcedure extends DecorateQueryHandleVerbs<any>,
> = Awaited<ReturnType<TProcedure['unstable_$ensure']>>;

export type unstable_inferInfiniteQueryHandle<
  TProcedure extends DecorateInfiniteQueryHandleVerbs<any>,
> = ReturnType<TProcedure['unstable_$prefetchInfinite']>;

export type unstable_inferInfiniteQueryHandleWithData<
  TProcedure extends DecorateInfiniteQueryHandleVerbs<any>,
> = Awaited<ReturnType<TProcedure['unstable_$ensureInfinite']>>;

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
      `Expected a tRPC handle from \`.unstable_$prefetch()\` / \`.unstable_$ensure()\` / \`.unstable_$fetch()\`, got ${JSON.stringify(handle)}`,
    );
  }
  const data = readQueryKey(queryKey);
  const type = data.args?.type;
  if (type !== 'query' && type !== 'infinite') {
    throw new Error(
      `Expected a tRPC handle from \`.unstable_$prefetch()\` / \`.unstable_$ensure()\` / \`.unstable_$fetch()\`, got a key of type ${String(type)} for "${data.path.join('.')}"`,
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
 * A prefetch during render runs on every render, so it follows the rule of
 * TanStack's `usePrefetchQuery`: start only a query the cache has no state for.
 * Stale data is refetched by the reader's observer, and an error stays until
 * the reader's error boundary resets it: restarting it here would suspend the
 * reader again.
 */
function needsRenderPrefetch(queryClient: QueryClient, options: any) {
  return !queryClient.getQueryState(options.queryKey);
}

/**
 * @internal
 */
export function startHandle(opts: {
  queryClient: QueryClient;
  options: any;
  kind: 'query' | 'infinite';
  verb: HandleVerb;
  inRender: boolean;
}) {
  const { queryClient, options, kind, verb, inRender } = opts;
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
  const withData = (data: unknown) => ({
    ...handle,
    data,
    dataUpdatedAt:
      queryClient.getQueryState(options.queryKey)?.dataUpdatedAt ?? Date.now(),
  });

  if (kind === 'infinite') {
    switch (verb) {
      case 'prefetch':
        void queryClient.prefetchInfiniteQuery(options);
        return handle;
      case 'ensure':
        return queryClient
          .ensureInfiniteQueryData({ ...options, revalidateIfStale: true })
          .then(withData);
      case 'fetch':
        return queryClient.fetchInfiniteQuery(options).then(withData);
    }
  }
  switch (verb) {
    case 'prefetch':
      void queryClient.prefetchQuery(options);
      return handle;
    case 'ensure':
      return queryClient
        .ensureQueryData({ ...options, revalidateIfStale: true })
        .then(withData);
    case 'fetch':
      return queryClient.fetchQuery(options).then(withData);
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
            `Render the reading component inside <HydrateClient> or <HydrationBoundary>, and don't return handles from server functions or server actions. ` +
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
 * redacted error, before any `retry` from `unstable_$fromHandle()` applies. Refetch such
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
  refetchRejectedHydration(queryClient, options);
  return options;
}
