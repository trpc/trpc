import type { QueryClient } from '@tanstack/react-query';
import type { skipToken } from '@tanstack/react-query';
import type { OperationPipeline } from '@trpc/client/unstable-internals';
import { pipelineContext } from '@trpc/client/unstable-internals';
import type {
  DecorateInfiniteQueryProcedure,
  DecorateQueryProcedure,
} from '../internals/createOptionsProxy';
import type {
  ResolverDef,
  TRPCQueryBaseOptions,
  TRPCQueryKey,
} from '../internals/types';
import { readQueryKey } from '../internals/utils';
import type { EntryDataRef, EntryInputRef } from './dataRef';
import {
  createEntryDataRef,
  entryDataRefOf,
  onlyAsList,
  replaceEntryDataRefs,
} from './dataRef';
import { itemPathOf } from './list';
import { dataPath } from './path';
import type {
  AnyTRPCEntry,
  DataEntry,
  DataOfEntry,
  EntryArgs,
  HandleType,
  PrefetchEntryArgs,
  TRPCEntryKind,
  TRPCInfiniteEntryOptions,
  TRPCInfiniteQueryEntry,
  TRPCQueryEntry,
  experimental_TRPCEntryFromData,
  experimental_TRPCEntryPerItem,
} from './types';
import { nothing } from './utils';

/**
 * An entry's first request, as the server can make it in another's request:
 * for an infinite query, the request of the first page.
 */
export interface EntryRequest {
  /** The procedure's path, joined by dots */
  path: string;
  /** The input, with `undefined` for every value the server fills in */
  input: unknown;
  /**
   * The `experimental_dataOf()` values the server fills in. Not a cursor that
   * `initialCursor` takes the place of, nor an infinite query's direction:
   * TanStack Query sets those, and the page would be another
   */
  serverReads: ReadonlySet<EntryInputRef>;
  /**
   * Whether its request can go in another's, or carry others' in it. Not with
   * a `trpc.context` of its own, which a link may route by; nor for an
   * infinite query that reads its whole input, to which the request adds the
   * cursor
   */
  pipelines: boolean;
}

/** Builds an entry's `EntryRequest`. Pure: it reads only what the entry was built with */
function planRequest(opts: {
  type: HandleType;
  path: string[];
  input: unknown;
  opts: unknown;
  refs: EntryInputRef[];
}): EntryRequest {
  const entryOpts = opts.opts as
    | (TRPCQueryBaseOptions & { initialCursor?: unknown })
    | undefined;
  const ownContext = Object.keys(entryOpts?.trpc?.context ?? {}).length > 0;
  let input = replaceEntryDataRefs(opts.input, [], nothing);
  let cursorFromOptions = false;
  if (opts.type === 'infinite') {
    // The first page's request, as `infiniteQueryOptions()` makes it
    const initialCursor = entryOpts?.initialCursor;
    cursorFromOptions = initialCursor != null;
    const cursor =
      initialCursor ?? (input as { cursor?: unknown } | null)?.cursor;
    input = {
      ...(input as object),
      ...(cursor !== undefined ? { cursor } : {}),
      direction: 'forward',
    };
  }
  return {
    path: opts.path.join('.'),
    input,
    serverReads: new Set(
      opts.refs.filter(
        (ref) =>
          !(ref.to[0] === 'cursor' && cursorFromOptions) &&
          !(ref.to[0] === 'direction' && opts.type === 'infinite'),
      ),
    ),
    pipelines:
      !ownContext &&
      !(
        opts.type === 'infinite' && opts.refs.some((ref) => ref.to.length === 0)
      ),
  };
}

export const entryState = Symbol('trpc.handleEntry');
export interface EntryState {
  kind: TRPCEntryKind;
  type: HandleType;
  /** The procedure's path */
  path: string[];
  /** The `experimental_dataOf()` values in the entry's input */
  refs: EntryInputRef[];
  /**
   * The query's options, with every `experimental_dataOf()` value in the input replaced.
   * Its requests carry `pipeline`, for a link that pipelines.
   */
  options: (opts: {
    dataOfRef: (ref: EntryDataRef) => unknown;
    pipeline: OperationPipeline | null;
  }) => any;
  /** What the entry's first request is, decided when the entry is built */
  request: EntryRequest;
  /** The `QueryClient` of the proxy that built the entry */
  queryClient: QueryClient;
}

export function createEntry(state: EntryState) {
  return { [entryState]: state };
}

export function entryStateOf(entry: unknown): EntryState | undefined {
  return (entry as { [entryState]?: EntryState } | null)?.[entryState];
}

export const entryPerItemState = Symbol('trpc.handleEntryPerItem');

/** What `experimental_entryPerItem()` returns */
export interface EntryPerItemState {
  /** The entry the callback returned, built with a stand-in for the item */
  entry: object;
  /**
   * The list whose items it is loaded for. It is a list of lists, which are
   * flattened, for every `null` in its path
   */
  list: EntryDataRef;
}

export function entryPerItemStateOf(
  value: unknown,
): EntryPerItemState | undefined {
  return (value as { [entryPerItemState]?: EntryPerItemState } | null)?.[
    entryPerItemState
  ];
}

export const entryFromDataState = Symbol('trpc.handleEntryFromData');

/** What `experimental_dataOf(entry, (data) => entry)` returns */
export interface EntryFromDataState {
  /** The entry the callback returned, built with a stand-in for the data */
  entry: object;
  /** The entry whose data it is built from, which the load doesn't wait for */
  source: object;
}

export function entryFromDataStateOf(
  value: unknown,
): EntryFromDataState | undefined {
  return (value as { [entryFromDataState]?: EntryFromDataState } | null)?.[
    entryFromDataState
  ];
}

export interface ProxyContext {
  proxy: any;
  path: string[];
  prefix: string | undefined;
}

export function readProxy(proxy: unknown, fn: string): ProxyContext {
  const queryKey = (proxy as { queryKey?: unknown } | null)?.queryKey;
  if (Array.isArray(queryKey)) {
    throw new Error(
      `\`${fn}()\` expects a tRPC options proxy or one of its procedures, got a handle for \`${readQueryKey(queryKey as TRPCQueryKey<any>).path.join('.')}\``,
    );
  }
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
  };
}

export function queryClientOf(ctx: ProxyContext): QueryClient {
  return ctx.proxy['~queryClient']();
}

export function optionsOf(
  procedure: any,
  type: HandleType,
): (input: unknown, opts: unknown) => any {
  return type === 'infinite'
    ? procedure.infiniteQueryOptions
    : procedure.queryOptions;
}

export function readRoot(trpc: unknown, fn: string) {
  const ctx = readProxy(trpc, fn);
  if (ctx.path.length > 0) {
    throw new Error(
      `\`${fn}()\` takes the root proxy, \`trpc\`, got \`trpc.${ctx.path.join('.')}\``,
    );
  }
  return ctx;
}

export function entry(opts: {
  fn: string;
  type: HandleType;
  kind: TRPCEntryKind;
  procedure: unknown;
  input: unknown;
  opts: unknown;
}) {
  const ctx = readProxy(opts.procedure, opts.fn);
  const refs: EntryInputRef[] = [];
  replaceEntryDataRefs(opts.input, [], (ref) => refs.push(ref));
  if (refs.some((ref) => ref.shape === 'flat')) {
    throw new Error(
      `${onlyAsList}, not a value in the input of \`${opts.fn}()\`. To read a part of every item, use \`.map()\``,
    );
  }
  const queryOpts = opts.opts as TRPCQueryBaseOptions | undefined;
  const trpcOpts = (pipeline: OperationPipeline) => ({
    ...queryOpts?.trpc,
    context: { ...queryOpts?.trpc?.context, ...pipelineContext(pipeline) },
  });
  const options = (input: unknown, pipeline: OperationPipeline | null) =>
    optionsOf(ctx.proxy, opts.type)(
      input,
      pipeline ? { ...queryOpts, trpc: trpcOpts(pipeline) } : opts.opts,
    );
  // Without `experimental_dataOf()` values, a bad input or option throws here, not in the load
  const built = refs.length === 0 ? options(opts.input, null) : null;
  return createEntry({
    type: opts.type,
    kind: opts.kind,
    path: ctx.path,
    refs,
    options: (optionsOpts) =>
      optionsOpts.pipeline === null && built
        ? built
        : options(
            replaceEntryDataRefs(opts.input, [], optionsOpts.dataOfRef),
            optionsOpts.pipeline,
          ),
    request: planRequest({
      type: opts.type,
      path: ctx.path,
      input: opts.input,
      opts: opts.opts,
      refs,
    }),
    queryClient: queryClientOf(ctx),
  });
}

/**
 * The data of another entry in the same load, to build an entry's input from.
 * Use it, or anything in it, as an input or as a value inside one.
 *
 * It holds no data when you call it: it records which part of the data you read,
 * and the load fills that in once the entry it comes from has data. So don't
 * compute with it or branch on it. To read a part of every item of an array, use
 * `.map()`: `experimental_dataOf(posts).map((post) => post.authorId)`. Its callback runs once,
 * on a stand-in for every item, and must return the item or a part of it.
 *
 * To load a query for every item, use `experimental_entryPerItem()`.
 *
 * The load waits for that data, whatever the kind of either entry, and rejects
 * with the error of the entry it comes from if that one fails. With
 * `loadHandlesSettled()`, that error is in the results instead.
 *
 * With a callback, it gives an entry that the load doesn't wait for the data
 * for: `experimental_dataOf(post, (post) => entry)`. The callback runs once,
 * on a stand-in for the data, and returns the entry. Its handle is unfinished,
 * since the data isn't known when the load returns:
 * `experimental_handleOfItem(handle, data)` finishes it, in the component
 * that has the data.
 * @example
 * ```ts
 * const post = ensureEntry(trpc.post.bySlug, { slug });
 * const [handles] = await loadHandles(trpc, {
 *   post,
 *   author: prefetchEntry(trpc.author.byId, { id: experimental_dataOf(post).authorId }),
 * });
 * ```
 * @example
 * ```ts
 * // Without waiting for the post
 * const post = prefetchEntry(trpc.post.bySlug, { slug });
 * const [handles] = await loadHandles(trpc, {
 *   post,
 *   author: experimental_dataOf(post, (post) =>
 *     prefetchEntry(trpc.author.byId, { id: post.authorId }),
 *   ),
 * });
 * // In a component that has the post
 * useSuspenseQuery(fromHandle(trpc, experimental_handleOfItem(handles.author, post)));
 * ```
 * @see https://trpc.io/docs/client/tanstack-react-query/nested-queries#data-of
 */
export function experimental_dataOf<TEntry extends DataEntry>(
  entry: TEntry,
): DataOfEntry<TEntry>;
export function experimental_dataOf<
  TEntry extends DataEntry,
  TInner extends AnyTRPCEntry,
>(
  entry: TEntry,
  entryFrom: (data: DataOfEntry<TEntry>) => TInner,
): experimental_TRPCEntryFromData<TInner, DataOfEntry<TEntry>>;
export function experimental_dataOf(
  entry: unknown,
  entryFrom?: (data: any) => unknown,
): unknown {
  if (!entryStateOf(entry) && !entryFromDataStateOf(entry)) {
    throw new Error(
      `\`experimental_dataOf()\` expects an entry from \`prefetchEntry()\`, \`fetchEntry()\` or \`ensureEntry()\`, got ${JSON.stringify(entry)}`,
    );
  }
  const source = entry as object;
  const data = createEntryDataRef({
    entry: source,
    path: dataPath([]),
    itemOf: null,
    shape: 'value',
  });
  if (entryFrom === undefined) {
    return data;
  }
  const returned = entryFrom(data);
  if (!entryStateOf(returned)) {
    throw new Error(
      `The callback of \`experimental_dataOf()\` must return an entry from \`prefetchEntry()\`, \`fetchEntry()\` or \`ensureEntry()\`, got ${JSON.stringify(returned)}`,
    );
  }
  const state: EntryFromDataState = { entry: returned as object, source };
  return { [entryFromDataState]: state };
}

/**
 * An entry to load for every item of a list in another entry's data. The
 * callback runs once, on a stand-in for every item, and returns the entry.
 *
 * The load gives one handle for it. `experimental_handleOfItem(handle, item)` is the handle
 * of an item's query, also for an item that loaded later, such as one on a
 * later page.
 *
 * The list is a `experimental_dataOf()` value. Its items are its elements, or,
 * for a list from `.map()`, the values the callback returned. For the items of
 * every list in a list, such as of every page of an infinite query, use
 * `.flatMap()`: `experimental_dataOf(posts).pages.flatMap((page) => page.items)`.
 * @example
 * ```ts
 * const posts = ensureEntry(trpc.post.list);
 * const [handles] = await loadHandles(trpc, {
 *   posts,
 *   authors: experimental_entryPerItem(experimental_dataOf(posts), (post) =>
 *     prefetchEntry(trpc.author.byId, { id: post.authorId }),
 *   ),
 * });
 * // In a component, for one post
 * useSuspenseQuery(fromHandle(trpc, experimental_handleOfItem(handles.authors, post)));
 * ```
 * @see https://trpc.io/docs/client/tanstack-react-query/nested-queries#entry-per-item
 */
export function experimental_entryPerItem<
  TItem,
  TDef extends ResolverDef,
  TKind extends TRPCEntryKind,
>(
  items: readonly TItem[],
  entry: (item: TItem) => TRPCQueryEntry<TDef, TKind>,
): experimental_TRPCEntryPerItem<TRPCQueryEntry<TDef, TKind>, TItem>;
export function experimental_entryPerItem(
  items: unknown,
  entry: (item: any) => unknown,
): unknown {
  const list = entryDataRefOf(items);
  if (!list) {
    throw new Error(
      `\`experimental_entryPerItem()\` expects a list from \`experimental_dataOf()\`, such as \`experimental_dataOf(posts).items\`, got ${JSON.stringify(items)}`,
    );
  }
  const returned = entry(
    createEntryDataRef({
      entry: list.entry,
      path: dataPath(itemPathOf(list)),
      itemOf: list,
      shape: 'value',
    }),
  );
  if (entryStateOf(returned)?.type !== 'query') {
    throw new Error(
      `The callback of \`experimental_entryPerItem()\` must return an entry from \`prefetchEntry()\`, \`fetchEntry()\` or \`ensureEntry()\`, got ${JSON.stringify(returned)}`,
    );
  }
  const state: EntryPerItemState = { entry: returned as object, list };
  return { [entryPerItemState]: state };
}

/**
 * An entry for `loadHandles()` that starts the query without waiting, like
 * `queryClient.prefetchQuery`. It never makes the load reject: errors surface where
 * the handle is read. Creating the entry starts nothing.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#prefetch
 */
export function prefetchEntry<TDef extends ResolverDef>(
  procedure: DecorateQueryProcedure<TDef>,
  ...args: PrefetchEntryArgs<TDef>
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
  procedure: DecorateQueryProcedure<TDef>,
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
  procedure: DecorateQueryProcedure<TDef>,
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
  procedure: DecorateInfiniteQueryProcedure<TDef>,
  input: TDef['input'] | typeof skipToken,
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
  procedure: DecorateInfiniteQueryProcedure<TDef>,
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
  procedure: DecorateInfiniteQueryProcedure<TDef>,
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
