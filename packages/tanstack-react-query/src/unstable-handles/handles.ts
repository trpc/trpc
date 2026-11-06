import type {
  FetchQueryOptions,
  GetNextPageParamFunction,
  QueryClient,
  QueryFunction,
} from '@tanstack/react-query';
import { hashKey, isCancelledError } from '@tanstack/react-query';
import { isTRPCClientError } from '@trpc/client';
import type {
  DecorateInfiniteQueryProcedure,
  DecorateQueryProcedure,
  DecorateRouterKeyable,
} from '../internals/createOptionsProxy';
import type {
  UnusedSkipTokenTRPCInfiniteQueryOptionsIn,
  UnusedSkipTokenTRPCInfiniteQueryOptionsOut,
} from '../internals/infiniteQueryOptions';
import type {
  UnusedSkipTokenTRPCQueryOptionsIn,
  UnusedSkipTokenTRPCQueryOptionsOut,
} from '../internals/queryOptions';
import type {
  ExtractCursorType,
  ResolverDef,
  TRPCInfiniteData,
  TRPCQueryBaseOptions,
  TRPCQueryKey,
} from '../internals/types';
import { readQueryKey } from '../internals/utils';
import type { ErrorOf } from './entryError';
import { entryCause, TRPCEntryError } from './entryError';
import type { TRPCLoaderBrand } from './loaderProxy';
import { isLoaderProxy } from './loaderProxy';

declare const handleDef: unique symbol;
declare const entryDef: unique symbol;

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
 * A serializable reference to a query, from `loadHandles()` or `waterfallHandle()`.
 * Pass it to a component and read it with `fromHandle(trpc, handle)`.
 */
export interface TRPCQueryHandle<TDef extends ResolverDef = ResolverDef> {
  /**
   * Type-only: never present at runtime. Required, so only
   * `loadHandles` and `waterfallHandle` create handles.
   */
  readonly [handleDef]: TDef & { kind: 'query' };
  readonly queryKey: HandleQueryKey<TDef, TDef['input'], 'query'>;
  /** The query's input. The key is absent when the input is `undefined`. */
  readonly input: TDef['input'];
}

/**
 * A serializable reference to an infinite query, from `loadHandles()` or
 * `waterfallInfiniteHandle()`. Read it with `fromHandle(trpc, handle, { getNextPageParam })`.
 */
export interface TRPCInfiniteQueryHandle<
  TDef extends ResolverDef = ResolverDef,
> {
  /**
   * Type-only: never present at runtime. Required, so only
   * `loadHandles` and `waterfallInfiniteHandle` create handles.
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
export type AnyTRPCHandle = TRPCQueryHandle<any> | TRPCInfiniteQueryHandle<any>;

/**
 * How `loadHandles` starts an entry's query, named after the
 * `QueryClient` method it calls: `prefetchQuery`, `fetchQuery` or `ensureQueryData`.
 */
export type TRPCEntryKind = 'prefetch' | 'fetch' | 'ensure';

/**
 * A query for `loadHandles()` to start, from `prefetchEntry`, `fetchEntry` or
 * `ensureEntry`.
 * Creating it starts nothing.
 */
export interface TRPCQueryEntry<
  TDef extends ResolverDef = ResolverDef,
  TKind extends TRPCEntryKind = TRPCEntryKind,
> {
  /** Type-only: never present at runtime. */
  readonly [entryDef]: { def: TDef; kind: TKind; type: 'query' };
}

/**
 * An infinite query for `loadHandles()` to start, from `prefetchInfiniteEntry`,
 * `fetchInfiniteEntry` or `ensureInfiniteEntry`. Creating it starts nothing.
 */
export interface TRPCInfiniteQueryEntry<
  TDef extends ResolverDef = ResolverDef,
  TKind extends TRPCEntryKind = TRPCEntryKind,
> {
  /** Type-only: never present at runtime. */
  readonly [entryDef]: { def: TDef; kind: TKind; type: 'infinite' };
}

/** Any query or infinite query entry. */
export type AnyTRPCEntry =
  | TRPCQueryEntry<any, any>
  | TRPCInfiniteQueryEntry<any, any>;

type HandleOfEntry<TEntry> =
  TEntry extends TRPCQueryEntry<infer TDef, any>
    ? TRPCQueryHandle<TDef>
    : TEntry extends TRPCInfiniteQueryEntry<infer TDef, any>
      ? TRPCInfiniteQueryHandle<TDef>
      : never;

type DataOfEntry<TEntry> =
  TEntry extends TRPCQueryEntry<infer TDef, any>
    ? TDef['output']
    : TEntry extends TRPCInfiniteQueryEntry<infer TDef, any>
      ? TRPCInfiniteData<TDef['input'], TDef['output']>
      : never;

type HandlesOf<TEntries extends Record<string, AnyTRPCEntry>> = {
  [TKey in keyof TEntries]: HandleOfEntry<TEntries[TKey]>;
};

type DefOfEntry<TEntry> = TEntry extends {
  readonly [entryDef]: { def: infer TDef extends ResolverDef };
}
  ? TDef
  : never;

/** Only fetch and ensure entries are waited for, so only they have data */
type WaitedKey<TEntries, TKey extends keyof TEntries> = TEntries[TKey] extends {
  readonly [entryDef]: { kind: 'fetch' | 'ensure' };
}
  ? TKey
  : never;

type DataOf<TEntries extends Record<string, AnyTRPCEntry>> = {
  [TKey in keyof TEntries as WaitedKey<TEntries, TKey>]: DataOfEntry<
    TEntries[TKey]
  >;
};

type ResultsOf<TEntries extends Record<string, AnyTRPCEntry>> = {
  [TKey in keyof TEntries as WaitedKey<TEntries, TKey>]: TRPCEntryResult<
    DefOfEntry<TEntries[TKey]>,
    DataOfEntry<TEntries[TKey]>
  >;
};

/**
 * What `loadHandlesSettled()` has for a fetch or ensure entry: its data, or
 * the error it failed with.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#errors-as-values
 */
export type TRPCEntryResult<TDef extends ResolverDef, TData> =
  | { readonly status: 'success'; readonly data: TData }
  | { readonly status: 'error'; readonly error: TRPCEntryError<TDef> };

/**
 * What `loadHandles()` resolves to: `[handles, data]`. `handles` has a handle
 * for every entry, by the entry's key; return them from the loader. `data` has the data of
 * every fetch and ensure entry, by the entry's key.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#loader-data
 */
export type TRPCLoadedHandles<TEntries extends Record<string, AnyTRPCEntry>> =
  readonly [handles: HandlesOf<TEntries>, data: DataOf<TEntries>];

/**
 * What `loadHandlesSettled()` resolves to: `[handles, results]`. `results`
 * has a `TRPCEntryResult` for every fetch and ensure entry, by the entry's key.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#errors-as-values
 */
export type TRPCSettledHandles<TEntries extends Record<string, AnyTRPCEntry>> =
  readonly [handles: HandlesOf<TEntries>, results: ResultsOf<TEntries>];

/** Options for an entry */
export interface TRPCEntryOptions
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
export type TRPCInfiniteEntryOptions<TDef extends ResolverDef> =
  TRPCEntryOptions & {
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
  ? [input?: TDef['input'], opts?: TRPCEntryOptions]
  : [input: TDef['input'], opts?: TRPCEntryOptions];

type WaterfallArgs<TDef extends ResolverDef> = undefined extends TDef['input']
  ? [input?: TDef['input']]
  : [input: TDef['input']];

type LoaderQueryProcedure<TDef extends ResolverDef> =
  DecorateQueryProcedure<TDef> & TRPCLoaderBrand<'procedure'>;

type LoaderInfiniteQueryProcedure<TDef extends ResolverDef> =
  DecorateInfiniteQueryProcedure<TDef> & TRPCLoaderBrand<'procedure'>;

/**
 * The handle type of a query procedure, for typing props.
 * @example
 * ```ts
 * type PostHandle = inferQueryHandle<TRPC['post']['byId']>;
 * ```
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#typing-props
 */
export type inferQueryHandle<TProcedure extends DecorateQueryProcedure<any>> =
  TProcedure extends DecorateQueryProcedure<infer TDef>
    ? TRPCQueryHandle<TDef>
    : never;

/**
 * The handle type of an infinite query procedure, for typing props.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#typing-props
 */
export type inferInfiniteQueryHandle<
  TProcedure extends DecorateInfiniteQueryProcedure<any>,
> =
  TProcedure extends DecorateInfiniteQueryProcedure<infer TDef>
    ? TRPCInfiniteQueryHandle<TDef>
    : never;
const notAHandle =
  'Expected a tRPC handle from `loadHandles()` or `waterfallHandle()`';

function readHandle(handle: AnyTRPCHandle, prefix: string | undefined) {
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

function toHandle(options: any, type: HandleType) {
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
  kind: TRPCEntryKind;
  type: HandleType;
  options: any;
}

function createEntry(state: EntryState) {
  return { [entryState]: state };
}

function readEntry(key: string, entry: unknown): EntryState {
  const state = (entry as { [entryState]?: EntryState } | null)?.[entryState];
  if (!state) {
    throw new Error(
      `Expected an entry from \`prefetchEntry()\`, \`fetchEntry()\` or \`ensureEntry()\` for "${key}", got ${JSON.stringify(entry)}`,
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

function toEntryError(key: string, state: EntryState, error: unknown) {
  if (isCancelledError(error)) {
    return error;
  }
  return new TRPCEntryError({
    key,
    path: readQueryKey(state.options.queryKey).path.join('.'),
    ...entryCause(error),
  });
}

function settleLoad(promise: Promise<unknown>) {
  return promise.then(
    (data) => ({ status: 'success', data }),
    (error: unknown) => {
      if (error instanceof TRPCEntryError) {
        return { status: 'error', error };
      }
      throw error;
    },
  );
}

async function startEntries(opts: {
  queryClient: QueryClient;
  entries: Record<string, unknown>;
  /** Resolve each waited entry to a `TRPCEntryResult` instead of rejecting */
  settle: boolean;
}) {
  const { queryClient, entries } = opts;
  const states = Object.entries(entries).map(
    ([key, entry]) => [key, readEntry(key, entry)] as const,
  );
  const loads = states.map(([key, state]) => ({
    key,
    state,
    promise: startEntry(queryClient, state).catch((error: unknown) => {
      throw toEntryError(key, state, error);
    }),
  }));
  const waited = loads.filter((load) => load.state.kind !== 'prefetch');
  const results = await Promise.all(
    waited.map((load) =>
      opts.settle ? settleLoad(load.promise) : load.promise,
    ),
  );

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
  /** The client that starts the query during render, `null` on a loader proxy */
  renderClient: QueryClient | null;
}

function createWaterfallHandle(opts: WaterfallOptions) {
  const handle = toHandle(opts.options, opts.type);
  waterfallHandles.add(handle);
  if (opts.renderClient) {
    prefetchInRender(opts.renderClient, opts.options, opts.type);
  }
  return handle;
}

function switchHandle(previous: AnyTRPCHandle, opts: WaterfallOptions) {
  if (hashKey(opts.options.queryKey) === hashKey(previous.queryKey)) {
    if (opts.renderClient) {
      prefetchInRender(opts.renderClient, opts.options, opts.type);
    }
    return previous;
  }
  return createWaterfallHandle(opts);
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
 * redacted error, before any `retry` from `fromHandle()` applies. Refetch such
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

function prepareHandleRead<TOptions extends { queryFn?: unknown }>(opts: {
  queryClient: QueryClient;
  rawHandle: AnyTRPCHandle;
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

interface ProxyContext {
  proxy: any;
  path: string[];
  prefix: string | undefined;
  /** Whether it's from `createTRPCLoaderProxy`, which can load handles */
  isLoader: boolean;
}

function readProxy(proxy: unknown, fn: string): ProxyContext {
  const queryKey = (proxy as { queryKey?: unknown } | null)?.queryKey;
  if (typeof queryKey !== 'function') {
    throw new Error(
      `\`${fn}()\` expects a tRPC options proxy or one of its procedures, got ${String(proxy)}`,
    );
  }
  const key = readQueryKey(queryKey());
  return {
    proxy,
    path: key.path,
    prefix: key.prefix?.[0],
    isLoader: isLoaderProxy(proxy as object),
  };
}

function queryClientOf(ctx: ProxyContext): QueryClient {
  return ctx.proxy['~queryClient']();
}

function optionsOf(
  procedure: any,
  type: HandleType,
): (input: unknown, opts: unknown) => any {
  return type === 'infinite'
    ? procedure.infiniteQueryOptions
    : procedure.queryOptions;
}

function readLoaderRoot(trpc: unknown, fn: string) {
  const ctx = readLoaderProxy(trpc, fn);
  if (ctx.path.length > 0) {
    throw new Error(
      `\`${fn}()\` takes the root proxy, \`trpc\`, got \`trpc.${ctx.path.join('.')}\``,
    );
  }
  return ctx;
}

function readLoaderProxy(proxy: unknown, fn: string) {
  const ctx = readProxy(proxy, fn);
  if (!ctx.isLoader) {
    throw new Error(
      `\`${fn}()\` needs the proxy from \`createTRPCLoaderProxy\`, not \`useTRPC()\` or \`createTRPCOptionsProxy\`: loading waits for queries, which a render can't. ` +
        `Load handles in a route loader or server component, or build one in a component with \`waterfallHandle\` ` +
        `and wait where you read it, with \`useSuspenseQuery\`. ` +
        `See https://trpc.io/docs/client/tanstack-react-query/handles#in-render`,
    );
  }
  return ctx;
}

function entry(opts: {
  fn: string;
  type: HandleType;
  kind: TRPCEntryKind;
  procedure: unknown;
  input: unknown;
  opts: unknown;
}) {
  const ctx = readLoaderProxy(opts.procedure, opts.fn);
  return createEntry({
    type: opts.type,
    kind: opts.kind,
    options: optionsOf(ctx.proxy, opts.type)(opts.input, opts.opts),
  });
}

function waterfall(opts: {
  fn: string;
  type: HandleType;
  procedure: unknown;
  inputOrHandle: unknown;
  switchInput: unknown;
}) {
  const { fn, type, inputOrHandle, switchInput } = opts;
  const ctx = readProxy(opts.procedure, fn);
  const renderClient = ctx.isLoader ? null : queryClientOf(ctx);
  if (typeof switchInput !== 'function') {
    return createWaterfallHandle({
      options: optionsOf(ctx.proxy, type)(inputOrHandle, undefined),
      type,
      renderClient,
    });
  }
  const previous = inputOrHandle as AnyTRPCHandle;
  const handleOpts =
    type === 'infinite'
      ? { initialCursor: (previous as TRPCInfiniteQueryHandle).initialCursor }
      : undefined;
  const own = optionsOf(ctx.proxy, type)(previous.input, handleOpts);
  if (hashKey(own.queryKey) !== hashKey(previous.queryKey)) {
    throw new Error(
      `\`${fn}(trpc.${ctx.path.join('.')}, handle, switchInput)\` can only switch a handle for \`${ctx.path.join('.')}\`, got one for ${JSON.stringify(previous.queryKey)}`,
    );
  }
  return switchHandle(previous, {
    options: optionsOf(ctx.proxy, type)(
      switchInput(previous.input),
      handleOpts,
    ),
    type,
    renderClient,
  });
}

/**
 * Whether `error` is a failed entry from `loadHandles()`. Pass a procedure to
 * check that the entry was for it, which types `error.cause` with its errors.
 * @example
 * ```ts
 * const [handles] = await loadHandles(trpc, {
 *   post: ensureEntry(trpc.post.byId, { id }),
 * }).catch((error: unknown) => {
 *   if (isTRPCEntryError(error, trpc.post.byId) && error.code === 'NOT_FOUND') {
 *     throw notFound();
 *   }
 *   throw error;
 * });
 * ```
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#errors-ensure
 */
export function isTRPCEntryError<TDef extends ResolverDef>(
  error: unknown,
  procedure: DecorateQueryProcedure<TDef>,
): error is TRPCEntryError<TDef>;
export function isTRPCEntryError(error: unknown): error is TRPCEntryError;
export function isTRPCEntryError(error: unknown, procedure?: unknown) {
  if (!(error instanceof TRPCEntryError)) {
    return false;
  }
  return (
    procedure === undefined ||
    error.path === readProxy(procedure, 'isTRPCEntryError').path.join('.')
  );
}

/**
 * Starts every entry before it waits for any, so the order of the entries doesn't
 * matter. Resolves to `[handles, data]` once every fetch and ensure entry has data:
 * a handle for every entry, and the data of the fetch and ensure entries. Rejects as
 * soon as a fetch or ensure entry fails. Prefetch entries never make it reject.
 *
 * Takes the root of the proxy from `createTRPCLoaderProxy`, not `useTRPC()`, since a
 * render can't wait for queries.
 * @example
 * ```ts
 * const [handles, data] = await loadHandles(trpc, {
 *   comments: prefetchInfiniteEntry(trpc.post.comments, { postId: id }),
 *   post: ensureEntry(trpc.post.byId, { id }),
 * });
 * if (!data.post.published) throw notFound();
 * return handles;
 * ```
 * @see https://trpc.io/docs/client/tanstack-react-query/handles
 */
export function loadHandles<TEntries extends Record<string, AnyTRPCEntry>>(
  trpc: TRPCLoaderBrand<'root'>,
  entries: TEntries,
): Promise<TRPCLoadedHandles<TEntries>> {
  return startEntries({
    queryClient: queryClientOf(readLoaderRoot(trpc, 'loadHandles')),
    entries,
    settle: false,
  }) as Promise<any>;
}

/**
 * Like `loadHandles()`, but it waits for every fetch and ensure entry to
 * settle and never rejects because one failed. Resolves to `[handles, results]`:
 * `results` has `{ status: 'success', data }` or `{ status: 'error', error }`,
 * with a `TRPCEntryError`, for every fetch and ensure entry.
 *
 * A cancelled query still rejects, as it does with `loadHandles()`.
 * @example
 * ```ts
 * const [handles, results] = await loadHandlesSettled(trpc, {
 *   post: ensureEntry(trpc.post.byId, { id }),
 *   comments: prefetchInfiniteEntry(trpc.post.comments, { postId: id }),
 * });
 * if (results.post.status === 'error') {
 *   if (results.post.error.code === 'NOT_FOUND') throw notFound();
 *   throw results.post.error;
 * }
 * ```
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#errors-as-values
 */
export function loadHandlesSettled<
  TEntries extends Record<string, AnyTRPCEntry>,
>(
  trpc: TRPCLoaderBrand<'root'>,
  entries: TEntries,
): Promise<TRPCSettledHandles<TEntries>> {
  return startEntries({
    queryClient: queryClientOf(readLoaderRoot(trpc, 'loadHandlesSettled')),
    entries,
    settle: true,
  }) as Promise<any>;
}

/**
 * An entry for `loadHandles()` that starts the query without waiting, like
 * `queryClient.prefetchQuery`. It never makes the load reject: errors surface where
 * the handle is read. Creating the entry starts nothing.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#prefetch
 */
export function prefetchEntry<TDef extends ResolverDef>(
  procedure: LoaderQueryProcedure<TDef>,
  ...args: EntryArgs<TDef>
): TRPCQueryEntry<TDef, 'prefetch'>;
export function prefetchEntry(
  procedure: unknown,
  input?: unknown,
  opts?: unknown,
): unknown {
  return entry({
    fn: 'prefetchEntry',
    type: 'query',
    kind: 'prefetch',
    procedure,
    input,
    opts,
  });
}

/**
 * An entry for `loadHandles()` that waits for fresh data, like `queryClient.fetchQuery`:
 * cached data is used only if it isn't stale. The load rejects if the request fails.
 * Creating the entry starts nothing.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#fetch
 */
export function fetchEntry<TDef extends ResolverDef>(
  procedure: LoaderQueryProcedure<TDef>,
  ...args: EntryArgs<TDef>
): TRPCQueryEntry<TDef, 'fetch'>;
export function fetchEntry(
  procedure: unknown,
  input?: unknown,
  opts?: unknown,
): unknown {
  return entry({
    fn: 'fetchEntry',
    type: 'query',
    kind: 'fetch',
    procedure,
    input,
    opts,
  });
}

/**
 * An entry for `loadHandles()` that uses any cached data, even stale, like
 * `queryClient.ensureQueryData({ revalidateIfStale: true })`. It fetches and waits only
 * when the cache has no data, and the load rejects if that request fails. Stale data is
 * refetched in the background. Creating the entry starts nothing.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#ensure
 */
export function ensureEntry<TDef extends ResolverDef>(
  procedure: LoaderQueryProcedure<TDef>,
  ...args: EntryArgs<TDef>
): TRPCQueryEntry<TDef, 'ensure'>;
export function ensureEntry(
  procedure: unknown,
  input?: unknown,
  opts?: unknown,
): unknown {
  return entry({
    fn: 'ensureEntry',
    type: 'query',
    kind: 'ensure',
    procedure,
    input,
    opts,
  });
}

/**
 * Like `prefetchEntry`, for an infinite query. Loads the first page unless `pages` is set.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#infinite-queries
 */
export function prefetchInfiniteEntry<TDef extends ResolverDef>(
  procedure: LoaderInfiniteQueryProcedure<TDef>,
  input: TDef['input'],
  opts?: TRPCInfiniteEntryOptions<TDef>,
): TRPCInfiniteQueryEntry<TDef, 'prefetch'> {
  return entry({
    fn: 'prefetchInfiniteEntry',
    type: 'infinite',
    kind: 'prefetch',
    procedure,
    input,
    opts,
  }) as any;
}

/**
 * Like `fetchEntry`, for an infinite query.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#infinite-queries
 */
export function fetchInfiniteEntry<TDef extends ResolverDef>(
  procedure: LoaderInfiniteQueryProcedure<TDef>,
  input: TDef['input'],
  opts?: TRPCInfiniteEntryOptions<TDef>,
): TRPCInfiniteQueryEntry<TDef, 'fetch'> {
  return entry({
    fn: 'fetchInfiniteEntry',
    type: 'infinite',
    kind: 'fetch',
    procedure,
    input,
    opts,
  }) as any;
}

/**
 * Like `ensureEntry`, for an infinite query.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#infinite-queries
 */
export function ensureInfiniteEntry<TDef extends ResolverDef>(
  procedure: LoaderInfiniteQueryProcedure<TDef>,
  input: TDef['input'],
  opts?: TRPCInfiniteEntryOptions<TDef>,
): TRPCInfiniteQueryEntry<TDef, 'ensure'> {
  return entry({
    fn: 'ensureInfiniteEntry',
    type: 'infinite',
    kind: 'ensure',
    procedure,
    input,
    opts,
  }) as any;
}

/**
 * Builds a handle for an input you only know during render, like an id from another
 * query's data, which makes it a request waterfall. The name keeps that visible.
 *
 * With `useTRPC()`, call it during render: like TanStack's `usePrefetchQuery`, it starts
 * the query if the cache has no state for it. With a proxy from `createTRPCLoaderProxy`
 * it starts nothing, and the component that reads the handle fetches when it renders.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#waterfall-handles
 */
export function waterfallHandle<TDef extends ResolverDef>(
  procedure: DecorateQueryProcedure<TDef>,
  ...args: WaterfallArgs<TDef>
): TRPCQueryHandle<TDef>;
/**
 * Switches a handle, like one a loader passed down, to a new input, like a term the
 * user is typing. While the new input maps to the handle's own query, it returns the
 * handle as is, so the first render reads what the loader started.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#switching-input
 */
export function waterfallHandle<TDef extends ResolverDef>(
  procedure: DecorateQueryProcedure<TDef>,
  handle: NoInfer<TRPCQueryHandle<TDef>>,
  switchInput: (input: NoInfer<TDef['input']>) => NoInfer<TDef['input']>,
): TRPCQueryHandle<TDef>;
export function waterfallHandle(
  procedure: unknown,
  inputOrHandle?: unknown,
  switchInput?: unknown,
): unknown {
  return waterfall({
    fn: 'waterfallHandle',
    type: 'query',
    procedure,
    inputOrHandle,
    switchInput,
  });
}

/**
 * Like `waterfallHandle`, for an infinite query.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#waterfall-handles
 */
export function waterfallInfiniteHandle<TDef extends ResolverDef>(
  procedure: DecorateInfiniteQueryProcedure<TDef>,
  input: TDef['input'],
): TRPCInfiniteQueryHandle<TDef>;
/**
 * Like `waterfallHandle`'s switch form, for an infinite query.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#switching-input
 */
export function waterfallInfiniteHandle<TDef extends ResolverDef>(
  procedure: DecorateInfiniteQueryProcedure<TDef>,
  handle: NoInfer<TRPCInfiniteQueryHandle<TDef>>,
  switchInput: (
    input: NoInfer<InfiniteHandleInput<TDef['input']>>,
  ) => NoInfer<InfiniteHandleInput<TDef['input']>>,
): TRPCInfiniteQueryHandle<TDef>;
export function waterfallInfiniteHandle(
  procedure: unknown,
  inputOrHandle: unknown,
  switchInput?: unknown,
): unknown {
  return waterfall({
    fn: 'waterfallInfiniteHandle',
    type: 'infinite',
    procedure,
    inputOrHandle,
    switchInput,
  });
}

/**
 * Options for a handle: the same options `trpc.<path>.queryOptions(input)` or
 * `trpc.<path>.infiniteQueryOptions(input, opts)` return for the handle's procedure and
 * input. Pass them to `useQuery`, `useSuspenseQuery`, `useSuspenseInfiniteQuery`, etc.
 * `trpc` is the proxy or a router on the handle's path, usually `useTRPC()`.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#reading-a-handle
 */
export function fromHandle<TDef extends ResolverDef, TData = TDef['output']>(
  trpc: DecorateRouterKeyable<NoInfer<TDef['featureFlags']>>,
  handle: TRPCQueryHandle<TDef>,
  opts?: UnusedSkipTokenTRPCQueryOptionsIn<
    NoInfer<TDef['output']>,
    TData,
    ErrorOf<TDef>,
    TDef['featureFlags']
  >,
): UnusedSkipTokenTRPCQueryOptionsOut<
  TDef['output'],
  TData,
  ErrorOf<TDef>,
  TDef['featureFlags']
>;
export function fromHandle<TDef extends ResolverDef, TData = TDef['output']>(
  trpc: DecorateRouterKeyable<NoInfer<TDef['featureFlags']>>,
  handle: TRPCInfiniteQueryHandle<TDef>,
  opts: UnusedSkipTokenTRPCInfiniteQueryOptionsIn<
    TDef['input'],
    NoInfer<TDef['output']>,
    TData,
    ErrorOf<TDef>,
    TDef['featureFlags']
  >,
): UnusedSkipTokenTRPCInfiniteQueryOptionsOut<
  TDef['input'],
  TDef['output'],
  TData,
  ErrorOf<TDef>,
  TDef['featureFlags']
>;
export function fromHandle(
  trpc: unknown,
  rawHandle: AnyTRPCHandle,
  opts?: object,
): unknown {
  const ctx = readProxy(trpc, 'fromHandle');
  const handle = readHandle(rawHandle, ctx.prefix);
  if (!ctx.path.every((segment, index) => handle.path[index] === segment)) {
    throw new Error(
      `\`fromHandle(trpc.${ctx.path.join('.')}, handle)\` got a handle for \`${handle.path.join('.')}\`, which isn't in \`${ctx.path.join('.')}\`. Pass the root proxy, \`trpc\``,
    );
  }
  const procedure = handle.path
    .slice(ctx.path.length)
    .reduce((level, segment) => level[segment], ctx.proxy);
  const options = optionsOf(procedure, handle.type)(
    handle.input,
    handle.type === 'infinite'
      ? {
          initialCursor: (rawHandle as TRPCInfiniteQueryHandle).initialCursor,
          ...opts,
        }
      : opts,
  );
  return prepareHandleRead({
    queryClient: queryClientOf(ctx),
    rawHandle,
    handle,
    options,
  });
}
