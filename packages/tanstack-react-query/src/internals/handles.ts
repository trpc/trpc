import type {
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

/** Any query or infinite query handle. */
export type unstable_AnyTRPCHandle =
  | unstable_TRPCQueryHandle<any>
  | unstable_TRPCInfiniteQueryHandle<any>;

/** Options for starting a query that returns a handle */
export interface unstable_TRPCPrefetchOptions
  extends
    Pick<
      FetchQueryOptions,
      'staleTime' | 'retry' | 'retryDelay' | 'gcTime' | 'meta'
    >,
    TRPCQueryBaseOptions {}

type HandleGetNextPageParam<TDef extends ResolverDef> =
  GetNextPageParamFunction<
    NonNullable<ExtractCursorType<TDef['input']>> | null,
    TDef['output']
  >;

/**
 * Options for starting an infinite query that returns a handle. Pass
 * `pages` and `getNextPageParam` to load several pages up front.
 * @see https://trpc.io/docs/client/tanstack-react-query/usage#infiniteQueryOptions
 */
export type unstable_TRPCPrefetchInfiniteOptions<TDef extends ResolverDef> =
  unstable_TRPCPrefetchOptions & {
    initialCursor?: NonNullable<ExtractCursorType<TDef['input']>> | null;
  } & (
      | {
          pages?: never;
          /**
           * Without it, refetching a cached query with more than one page
           * fails on the second page.
           */
          getNextPageParam?: HandleGetNextPageParam<TDef>;
        }
      | {
          /** Number of pages to load up front */
          pages: number;
          getNextPageParam: HandleGetNextPageParam<TDef>;
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
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#queryOptions
   */
  unstable_$prefetch: (
    ...args: undefined extends TDef['input']
      ? [input?: TDef['input'], opts?: unstable_TRPCPrefetchOptions]
      : [input: TDef['input'], opts?: unstable_TRPCPrefetchOptions]
  ) => unstable_TRPCQueryHandle<TDef>;
  /**
   * Start the query and wait until the cache has data for it, so a loader can hold
   * navigation until then. The handle carries no data: read it with `useSuspenseQuery`
   * to get data that's always defined. Rejects if that request fails.
   *
   * Same as `await queryClient.ensureQueryData({ ...trpc.<path>.queryOptions(input, opts), revalidateIfStale: true })`.
   * Not available on `useTRPC()`.
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#queryOptions
   */
  unstable_$ensure: (
    ...args: undefined extends TDef['input']
      ? [input?: TDef['input'], opts?: unstable_TRPCPrefetchOptions]
      : [input: TDef['input'], opts?: unstable_TRPCPrefetchOptions]
  ) => Promise<unstable_TRPCQueryHandle<TDef>>;
  /**
   * Like `unstable_$ensure`, but stale data in the cache is refetched before it resolves.
   * Rejects if that request fails.
   *
   * Same as `await queryClient.fetchQuery(trpc.<path>.queryOptions(input, opts))`.
   * Not available on `useTRPC()`.
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#queryOptions
   */
  unstable_$fetch: (
    ...args: undefined extends TDef['input']
      ? [input?: TDef['input'], opts?: unstable_TRPCPrefetchOptions]
      : [input: TDef['input'], opts?: unstable_TRPCPrefetchOptions]
  ) => Promise<unstable_TRPCQueryHandle<TDef>>;
}

/** Verbs added to query procedures with a `cursor` input */
export interface DecorateInfiniteQueryHandleVerbs<TDef extends ResolverDef> {
  /**
   * Like `unstable_$prefetch`, for an infinite query. Loads the first page unless `pages` is set.
   *
   * Same as `void queryClient.prefetchInfiniteQuery(trpc.<path>.infiniteQueryOptions(input, opts))`.
   * On `useTRPC()`, call it during render, like `unstable_$prefetch`.
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#infiniteQueryOptions
   */
  unstable_$prefetchInfinite: (
    input: TDef['input'],
    opts?: unstable_TRPCPrefetchInfiniteOptions<TDef>,
  ) => unstable_TRPCInfiniteQueryHandle<TDef>;
  /**
   * Like `unstable_$ensure`, for an infinite query.
   *
   * Same as `await queryClient.ensureInfiniteQueryData({ ...trpc.<path>.infiniteQueryOptions(input, opts), revalidateIfStale: true })`.
   * Not available on `useTRPC()`.
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#infiniteQueryOptions
   */
  unstable_$ensureInfinite: (
    input: TDef['input'],
    opts?: unstable_TRPCPrefetchInfiniteOptions<TDef>,
  ) => Promise<unstable_TRPCInfiniteQueryHandle<TDef>>;
  /**
   * Like `unstable_$fetch`, for an infinite query.
   *
   * Same as `await queryClient.fetchInfiniteQuery(trpc.<path>.infiniteQueryOptions(input, opts))`.
   * Not available on `useTRPC()`.
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#infiniteQueryOptions
   */
  unstable_$fetchInfinite: (
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
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#queryOptions
   */
  unstable_$fromHandle: {
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

/**
 * The handle type a query procedure's `unstable_$prefetch()` returns, for
 * typing props. `unstable_$ensure()` and `unstable_$fetch()` resolve to the
 * same type.
 * @see https://trpc.io/docs/client/tanstack-react-query/usage#inferring-input-and-output-types
 */
export type unstable_inferQueryHandle<
  TProcedure extends DecorateQueryHandleVerbs<any>,
> = ReturnType<TProcedure['unstable_$prefetch']>;

/**
 * The handle type an infinite query procedure's
 * `unstable_$prefetchInfinite()` returns, for typing props.
 * @see https://trpc.io/docs/client/tanstack-react-query/usage#inferring-input-and-output-types
 */
export type unstable_inferInfiniteQueryHandle<
  TProcedure extends DecorateInfiniteQueryHandleVerbs<any>,
> = ReturnType<TProcedure['unstable_$prefetchInfinite']>;

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
  const toHandle = () => handle;

  if (kind === 'infinite') {
    switch (verb) {
      case 'prefetch':
        void queryClient.prefetchInfiniteQuery(options);
        return handle;
      case 'ensure':
        return queryClient
          .ensureInfiniteQueryData({ ...options, revalidateIfStale: true })
          .then(toHandle);
      case 'fetch':
        return queryClient.fetchInfiniteQuery(options).then(toHandle);
    }
  }
  switch (verb) {
    case 'prefetch':
      void queryClient.prefetchQuery(options);
      return handle;
    case 'ensure':
      return queryClient
        .ensureQueryData({ ...options, revalidateIfStale: true })
        .then(toHandle);
    case 'fetch':
      return queryClient.fetchQuery(options).then(toHandle);
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
        // oxlint-disable-next-line no-console
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
