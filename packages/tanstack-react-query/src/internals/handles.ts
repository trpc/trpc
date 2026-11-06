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
  TRPCInfiniteData,
  TRPCQueryBaseOptions,
  TRPCQueryKey,
} from './types';
import { readQueryKey } from './utils';

declare const handleDef: unique symbol;
declare const entryDef: unique symbol;

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
 * A serializable reference to a query, from `trpc.unstable_$loadHandles()` or
 * `trpc.<path>.unstable_$waterfallHandle()`. Pass it to a component and read it with
 * `trpc.unstable_$fromHandle(handle)`.
 */
export interface unstable_TRPCQueryHandle<
  TDef extends ResolverDef = ResolverDef,
> {
  /**
   * Type-only: never present at runtime. Required, so only
   * `unstable_$loadHandles` and `unstable_$waterfallHandle` create handles.
   */
  readonly [handleDef]: TDef & { kind: 'query' };
  readonly queryKey: HandleQueryKey<TDef, TDef['input'], 'query'>;
  /** The query's input. The key is absent when the input is `undefined`. */
  readonly input: TDef['input'];
}

/**
 * A serializable reference to an infinite query, from `trpc.unstable_$loadHandles()` or
 * `trpc.<path>.unstable_$waterfallInfiniteHandle()`.
 * Read it with `trpc.unstable_$fromHandle(handle, { getNextPageParam })`.
 */
export interface unstable_TRPCInfiniteQueryHandle<
  TDef extends ResolverDef = ResolverDef,
> {
  /**
   * Type-only: never present at runtime. Required, so only
   * `unstable_$loadHandles` and `unstable_$waterfallInfiniteHandle` create handles.
   */
  readonly [handleDef]: TDef & { kind: 'infinite' };
  readonly queryKey: HandleQueryKey<
    TDef,
    InfiniteHandleInput<TDef['input']>,
    'infinite'
  >;
  /** The query's input, without `cursor` and `direction` */
  readonly input: InfiniteHandleInput<TDef['input']>;
  readonly initialCursor?: NonNullable<ExtractCursorType<TDef['input']>> | null;
}

/** Any query or infinite query handle. */
export type unstable_AnyTRPCHandle =
  | unstable_TRPCQueryHandle<any>
  | unstable_TRPCInfiniteQueryHandle<any>;

/**
 * How `unstable_$loadHandles` starts an entry's query, named after the
 * `QueryClient` method it calls: `prefetchQuery`, `fetchQuery` or `ensureQueryData`.
 */
export type unstable_TRPCEntryKind = 'prefetch' | 'fetch' | 'ensure';

/**
 * A query for `trpc.unstable_$loadHandles()` to start, from
 * `unstable_$prefetchEntry`, `unstable_$fetchEntry` or `unstable_$ensureEntry`.
 * Creating it starts nothing.
 */
export interface unstable_TRPCQueryEntry<
  TDef extends ResolverDef = ResolverDef,
  TKind extends unstable_TRPCEntryKind = unstable_TRPCEntryKind,
> {
  /** Type-only: never present at runtime. */
  readonly [entryDef]: { def: TDef; kind: TKind; type: 'query' };
}

/**
 * An infinite query for `trpc.unstable_$loadHandles()` to start, from
 * `unstable_$prefetchInfiniteEntry`, `unstable_$fetchInfiniteEntry` or
 * `unstable_$ensureInfiniteEntry`. Creating it starts nothing.
 */
export interface unstable_TRPCInfiniteQueryEntry<
  TDef extends ResolverDef = ResolverDef,
  TKind extends unstable_TRPCEntryKind = unstable_TRPCEntryKind,
> {
  /** Type-only: never present at runtime. */
  readonly [entryDef]: { def: TDef; kind: TKind; type: 'infinite' };
}

/** Any query or infinite query entry. */
export type unstable_AnyTRPCEntry =
  | unstable_TRPCQueryEntry<any, any>
  | unstable_TRPCInfiniteQueryEntry<any, any>;

type HandleOfEntry<TEntry> =
  TEntry extends unstable_TRPCQueryEntry<infer TDef, any>
    ? unstable_TRPCQueryHandle<TDef>
    : TEntry extends unstable_TRPCInfiniteQueryEntry<infer TDef, any>
      ? unstable_TRPCInfiniteQueryHandle<TDef>
      : never;

type DataOfEntry<TEntry> =
  TEntry extends unstable_TRPCQueryEntry<infer TDef, any>
    ? TDef['output']
    : TEntry extends unstable_TRPCInfiniteQueryEntry<infer TDef, any>
      ? TRPCInfiniteData<TDef['input'], TDef['output']>
      : never;

type LoadedHandles<TEntries extends Record<string, unstable_AnyTRPCEntry>> = {
  [TKey in keyof TEntries]: HandleOfEntry<TEntries[TKey]>;
};

type LoadedData<TEntries extends Record<string, unstable_AnyTRPCEntry>> = {
  [
    TKey in keyof TEntries as TEntries[TKey] extends {
      readonly [entryDef]: { kind: 'fetch' | 'ensure' };
    }
      ? TKey
      : never
  ]: DataOfEntry<TEntries[TKey]>;
};

/**
 * What `trpc.unstable_$loadHandles()` resolves to: `[handles, data]`. `handles` has a handle
 * for every entry, by the entry's key; return them from the loader. `data` has the data of
 * every fetch and ensure entry, by the entry's key.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#loader-data
 */
export type unstable_TRPCLoadedHandles<
  TEntries extends Record<string, unstable_AnyTRPCEntry>,
> = readonly [handles: LoadedHandles<TEntries>, data: LoadedData<TEntries>];

/** Options for an entry */
export interface unstable_TRPCEntryOptions
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
 * Options for an infinite query entry. Pass `pages` and `getNextPageParam`
 * to load several pages up front.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#infinite-queries
 */
export type unstable_TRPCInfiniteEntryOptions<TDef extends ResolverDef> =
  unstable_TRPCEntryOptions & {
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

type EntryArgs<TDef extends ResolverDef> = undefined extends TDef['input']
  ? [input?: TDef['input'], opts?: unstable_TRPCEntryOptions]
  : [input: TDef['input'], opts?: unstable_TRPCEntryOptions];

/**
 * Entries added to query procedures on a proxy that can load handles, not on `useTRPC()`
 */
export interface DecorateQueryEntryVerbs<TDef extends ResolverDef> {
  /**
   * An entry for `trpc.unstable_$loadHandles()` that starts the query without waiting,
   * like `queryClient.prefetchQuery`. It never makes the load reject: errors surface
   * where the handle is read. Creating the entry starts nothing.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#prefetch
   */
  unstable_$prefetchEntry: (
    ...args: EntryArgs<TDef>
  ) => unstable_TRPCQueryEntry<TDef, 'prefetch'>;
  /**
   * An entry for `trpc.unstable_$loadHandles()` that waits for fresh data, like
   * `queryClient.fetchQuery`: cached data is used only if it isn't stale. The load
   * rejects if the request fails. Creating the entry starts nothing.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#fetch
   */
  unstable_$fetchEntry: (
    ...args: EntryArgs<TDef>
  ) => unstable_TRPCQueryEntry<TDef, 'fetch'>;
  /**
   * An entry for `trpc.unstable_$loadHandles()` that uses any cached data, even stale,
   * like `queryClient.ensureQueryData({ revalidateIfStale: true })`. It fetches and waits
   * only when the cache has no data, and the load rejects if that request fails. Stale
   * data is refetched in the background. Creating the entry starts nothing.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#ensure
   */
  unstable_$ensureEntry: (
    ...args: EntryArgs<TDef>
  ) => unstable_TRPCQueryEntry<TDef, 'ensure'>;
}

/** Handles added to query procedures */
export interface DecorateQueryHandleVerbs<TDef extends ResolverDef> {
  /**
   * Builds a handle for an input you only know during render, like an id from another
   * query's data, which makes it a request waterfall. The name keeps that visible.
   *
   * On `useTRPC()`, call it during render: like TanStack's `usePrefetchQuery`, it starts
   * the query if the cache has no state for it. On other proxies it starts nothing, and
   * the component that reads the handle fetches when it renders.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#waterfall-handles
   */
  unstable_$waterfallHandle: {
    (
      ...args: undefined extends TDef['input']
        ? [input?: TDef['input']]
        : [input: TDef['input']]
    ): unstable_TRPCQueryHandle<TDef>;
    /**
     * Switches a handle, like one a loader passed down, to a new input, like a term the
     * user is typing. While the new input maps to the handle's own query, it returns the
     * handle as is, so the first render reads what the loader started.
     * @see https://trpc.io/docs/client/tanstack-react-query/handles#switching-input
     */
    (
      handle: unstable_TRPCQueryHandle<TDef>,
      switchInput: (input: TDef['input']) => TDef['input'],
    ): unstable_TRPCQueryHandle<TDef>;
  };
}

/**
 * Entries added to query procedures with a `cursor` input on a proxy that can load
 * handles, not on `useTRPC()`
 */
export interface DecorateInfiniteQueryEntryVerbs<TDef extends ResolverDef> {
  /**
   * Like `unstable_$prefetchEntry`, for an infinite query. Loads the first page unless `pages` is set.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#infinite-queries
   */
  unstable_$prefetchInfiniteEntry: (
    input: TDef['input'],
    opts?: unstable_TRPCInfiniteEntryOptions<TDef>,
  ) => unstable_TRPCInfiniteQueryEntry<TDef, 'prefetch'>;
  /**
   * Like `unstable_$fetchEntry`, for an infinite query.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#infinite-queries
   */
  unstable_$fetchInfiniteEntry: (
    input: TDef['input'],
    opts?: unstable_TRPCInfiniteEntryOptions<TDef>,
  ) => unstable_TRPCInfiniteQueryEntry<TDef, 'fetch'>;
  /**
   * Like `unstable_$ensureEntry`, for an infinite query.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#infinite-queries
   */
  unstable_$ensureInfiniteEntry: (
    input: TDef['input'],
    opts?: unstable_TRPCInfiniteEntryOptions<TDef>,
  ) => unstable_TRPCInfiniteQueryEntry<TDef, 'ensure'>;
}

/** Handles added to query procedures with a `cursor` input */
export interface DecorateInfiniteQueryHandleVerbs<TDef extends ResolverDef> {
  /**
   * Like `unstable_$waterfallHandle`, for an infinite query.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#waterfall-handles
   */
  unstable_$waterfallInfiniteHandle: {
    (input: TDef['input']): unstable_TRPCInfiniteQueryHandle<TDef>;
    (
      handle: unstable_TRPCInfiniteQueryHandle<TDef>,
      switchInput: (
        input: InfiniteHandleInput<TDef['input']>,
      ) => InfiniteHandleInput<TDef['input']>,
    ): unstable_TRPCInfiniteQueryHandle<TDef>;
  };
}

/**
 * Added to the root of a proxy that can load handles, not to `useTRPC()`, since a
 * render can't wait for queries
 */
export interface DecorateLoadHandles {
  /**
   * Starts every entry before it waits for any, so the order of the entries doesn't
   * matter. Resolves to `[handles, data]` once every fetch and ensure entry has data:
   * a handle for every entry, and the data of the fetch and ensure entries. Rejects as
   * soon as a fetch or ensure entry fails. Prefetch entries never make it reject.
   * @example
   * ```ts
   * const [handles, data] = await trpc.unstable_$loadHandles({
   *   comments: trpc.post.comments.unstable_$prefetchInfiniteEntry({ postId: id }),
   *   post: trpc.post.byId.unstable_$ensureEntry({ id }),
   * });
   * if (!data.post.published) throw notFound();
   * return handles;
   * ```
   * @see https://trpc.io/docs/client/tanstack-react-query/handles
   */
  unstable_$loadHandles: <
    TEntries extends Record<string, unstable_AnyTRPCEntry>,
  >(
    entries: TEntries,
  ) => Promise<unstable_TRPCLoadedHandles<TEntries>>;
}

/** Helpers added to every router level of the options proxy */
export interface DecorateHandleHelpers<TFeatureFlags extends FeatureFlags> {
  /**
   * Options for a handle: the same options `trpc.<path>.queryOptions(input)` or
   * `trpc.<path>.infiniteQueryOptions(input, opts)` return for the handle's procedure and input.
   * Pass them to `useQuery`, `useSuspenseQuery`, `useSuspenseInfiniteQuery`, etc.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#reading-a-handle
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
 * The handle type of a query procedure, for typing props.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#typing-props
 */
export type unstable_inferQueryHandle<
  TProcedure extends DecorateQueryHandleVerbs<any>,
> = ReturnType<TProcedure['unstable_$waterfallHandle']>;

/**
 * The handle type of an infinite query procedure, for typing props.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#typing-props
 */
export type unstable_inferInfiniteQueryHandle<
  TProcedure extends DecorateInfiniteQueryHandleVerbs<any>,
> = ReturnType<TProcedure['unstable_$waterfallInfiniteHandle']>;

const notAHandle =
  'Expected a tRPC handle from `.unstable_$loadHandles()` or `.unstable_$waterfallHandle()`';

/**
 * @internal
 */
export function readHandle(
  handle: unstable_AnyTRPCHandle,
  prefix: string | undefined,
) {
  const queryKey = handle?.queryKey as unknown as TRPCQueryKey<any> | undefined;
  if (!Array.isArray(queryKey)) {
    throw new Error(`${notAHandle}, got ${JSON.stringify(handle)}`);
  }
  const data = readQueryKey(queryKey);
  const type = data.args?.type;
  if (type !== 'query' && type !== 'infinite') {
    throw new Error(
      `${notAHandle}, got a key of type ${String(type)} for "${data.path.join('.')}"`,
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

type HandleType = 'query' | 'infinite';

/**
 * @internal
 */
export function toHandle(options: any, type: HandleType) {
  const input = readQueryKey(options.queryKey).args?.input;
  // Next.js rejects `undefined` in `getServerSideProps` / `getStaticProps` props
  const handle: Record<string, unknown> = {
    queryKey: options.queryKey,
    ...(input !== undefined && { input }),
  };
  if (type === 'infinite' && options.initialPageParam != null) {
    handle['initialCursor'] = options.initialPageParam;
  }
  return handle;
}

const entryState = Symbol('trpc.handleEntry');

interface EntryState {
  kind: unstable_TRPCEntryKind;
  type: HandleType;
  options: any;
}

/**
 * @internal
 */
export function createEntry(state: EntryState) {
  return { [entryState]: state };
}

function readEntry(key: string, entry: unknown): EntryState {
  const state = (entry as { [entryState]?: EntryState } | null)?.[entryState];
  if (!state) {
    throw new Error(
      `Expected an entry from \`.unstable_$prefetchEntry()\`, \`.unstable_$fetchEntry()\` or \`.unstable_$ensureEntry()\` for "${key}", got ${JSON.stringify(entry)}`,
    );
  }
  return state;
}

function startEntry(queryClient: QueryClient, state: EntryState) {
  const { options } = state;
  if (state.type === 'infinite') {
    switch (state.kind) {
      case 'prefetch':
        return queryClient.prefetchInfiniteQuery(options);
      case 'ensure':
        return queryClient.ensureInfiniteQueryData({
          ...options,
          revalidateIfStale: true,
        });
      case 'fetch':
        return queryClient.fetchInfiniteQuery(options);
    }
  }
  switch (state.kind) {
    case 'prefetch':
      return queryClient.prefetchQuery(options);
    case 'ensure':
      return queryClient.ensureQueryData({
        ...options,
        revalidateIfStale: true,
      });
    case 'fetch':
      return queryClient.fetchQuery(options);
  }
}

/**
 * @internal
 */
export async function loadHandles(
  queryClient: QueryClient,
  entries: Record<string, unknown>,
) {
  const states = Object.entries(entries).map(
    ([key, entry]) => [key, readEntry(key, entry)] as const,
  );
  const loads = states.map(([key, state]) => ({
    key,
    state,
    promise: startEntry(queryClient, state),
  }));
  const waited = loads.filter((load) => load.state.kind !== 'prefetch');
  const results = await Promise.all(waited.map((load) => load.promise));

  const handles = Object.fromEntries(
    loads.map((load) => [
      load.key,
      toHandle(load.state.options, load.state.type),
    ]),
  );
  const data = Object.fromEntries(
    waited.map((load, index) => [load.key, results[index]]),
  );
  return [handles, data] as const;
}

/**
 * Waterfall handles. Their readers may fetch during render by design, so a
 * fetch during server rendering isn't a missing hydration.
 */
const waterfallHandles = new WeakSet<object>();

/**
 * A render runs again and again, so it follows the rule of TanStack's
 * `usePrefetchQuery`: start only a query the cache has no state for. Stale
 * data is refetched by the reader's observer, and an error stays until the
 * reader's error boundary resets it: restarting it here would suspend the
 * reader again.
 */
function prefetchInRender(
  queryClient: QueryClient,
  options: any,
  type: HandleType,
) {
  if (queryClient.getQueryState(options.queryKey)) {
    return;
  }
  void (type === 'infinite'
    ? queryClient.prefetchInfiniteQuery(options)
    : queryClient.prefetchQuery(options));
}

interface WaterfallOptions {
  options: any;
  type: HandleType;
  /** The `useTRPC()` proxy's client, which starts the query during render */
  renderClient: QueryClient | null;
}

/**
 * @internal
 */
export function waterfallHandle(opts: WaterfallOptions) {
  const handle = toHandle(opts.options, opts.type);
  waterfallHandles.add(handle);
  if (opts.renderClient) {
    prefetchInRender(opts.renderClient, opts.options, opts.type);
  }
  return handle;
}

/**
 * @internal
 */
export function switchHandle(
  previous: unstable_AnyTRPCHandle,
  opts: WaterfallOptions,
) {
  if (hashKey(opts.options.queryKey) === hashKey(previous.queryKey)) {
    if (opts.renderClient) {
      prefetchInRender(opts.renderClient, opts.options, opts.type);
    }
    return previous;
  }
  return waterfallHandle(opts);
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
export function prepareHandleRead<
  TOptions extends { queryFn?: unknown },
>(opts: {
  queryClient: QueryClient;
  rawHandle: unstable_AnyTRPCHandle;
  handle: ReturnType<typeof readHandle>;
  options: TOptions;
}): TOptions {
  const { options } = opts;
  if (
    globalThis.process?.env?.['NODE_ENV'] !== 'production' &&
    typeof options.queryFn === 'function' &&
    !waterfallHandles.has(opts.rawHandle)
  ) {
    options.queryFn = warnIfNotHydrated(
      opts.handle.path,
      options.queryFn as QueryFunction<any, any, any>,
    );
  }
  refetchRejectedHydration(opts.queryClient, options);
  return options;
}
