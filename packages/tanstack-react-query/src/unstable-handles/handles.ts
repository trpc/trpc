import type {
  FetchQueryOptions,
  GetNextPageParamFunction,
  QueryClient,
  QueryFunction,
  QueryFunctionContext,
} from '@tanstack/react-query';
import { hashKey, isCancelledError, skipToken } from '@tanstack/react-query';
import { isTRPCClientError, TRPCClientError } from '@trpc/client';
import type { OperationPipeline } from '@trpc/client/unstable-internals';
import {
  createOperationPipeline,
  pipelineContext,
} from '@trpc/client/unstable-internals';
import type { PipelinePath } from '@trpc/server/unstable-core-do-not-import';
import {
  bindPipelinePath,
  readPipelinePath,
} from '@trpc/server/unstable-core-do-not-import';
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
  FeatureFlags,
  ResolverDef,
  TRPCInfiniteData,
  TRPCQueryBaseOptions,
  TRPCQueryKey,
} from '../internals/types';
import { readQueryKey } from '../internals/utils';
import type { ErrorOf } from './entryError';
import { entryCause, TRPCEntryError } from './entryError';

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
 * A serializable reference to a query, from `loadHandles()`.
 * Pass it to a component and read it with `fromHandle(trpc, handle)`.
 */
export interface TRPCQueryHandle<TDef extends ResolverDef = ResolverDef> {
  /**
   * Type-only: never present at runtime. Required, so only
   * `loadHandles` creates handles.
   */
  readonly [handleDef]: TDef & { kind: 'query' };
  readonly queryKey: HandleQueryKey<TDef, TDef['input'], 'query'>;
  /** The query's input. The key is absent when the input is `undefined`. */
  readonly input: TDef['input'];
}

/**
 * A serializable reference to an infinite query, from `loadHandles()`.
 * Read it with `fromHandle(trpc, handle, { getNextPageParam })`.
 */
export interface TRPCInfiniteQueryHandle<
  TDef extends ResolverDef = ResolverDef,
> {
  /**
   * Type-only: never present at runtime. Required, so only
   * `loadHandles` creates handles.
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

/**
 * What `loadHandles()` takes per key: an entry, TanStack Query's `skipToken`
 * to start nothing for that key, or a group: an object of the same, which gets
 * its handles and data under that key.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#conditional-queries
 */
export interface TRPCLoadEntries {
  [key: string]:
    | AnyTRPCEntry
    | typeof skipToken
    | TRPCLoadEntries
    // What `dataOf(entry).map((item) => prefetchEntry(…))` is typed as
    | readonly AnyTRPCEntry[];
}

type HandleOfEntry<TEntry> =
  TEntry extends TRPCQueryEntry<infer TDef, any>
    ? TRPCQueryHandle<TDef>
    : TEntry extends TRPCInfiniteQueryEntry<infer TDef, any>
      ? TRPCInfiniteQueryHandle<TDef>
      : TEntry extends typeof skipToken
        ? undefined
        : TEntry extends readonly (infer TItem)[]
          ? HandleOfEntry<TItem>[]
          : TEntry extends TRPCLoadEntries
            ? HandlesOf<TEntry>
            : never;

type DataOfEntry<TEntry> =
  TEntry extends TRPCQueryEntry<infer TDef, any>
    ? TDef['output']
    : TEntry extends TRPCInfiniteQueryEntry<infer TDef, any>
      ? TRPCInfiniteData<TDef['input'], TDef['output']>
      : never;

type HandlesOf<TEntries> = {
  [TKey in keyof TEntries]: HandleOfEntry<TEntries[TKey]>;
};

type DefOfEntry<TEntry> = TEntry extends {
  readonly [entryDef]: { def: infer TDef extends ResolverDef };
}
  ? TDef
  : never;

type WaitedEntry = {
  readonly [entryDef]: { kind: 'fetch' | 'ensure' };
};

/**
 * Only fetch and ensure entries are waited for, so only they have data. A
 * group keeps its key, with the data of the entries in it.
 */
type WaitedKey<TEntries, TKey extends keyof TEntries> = TEntries[TKey] extends
  | WaitedEntry
  | readonly WaitedEntry[]
  ? TKey
  : TEntries[TKey] extends
        | AnyTRPCEntry
        | typeof skipToken
        | readonly AnyTRPCEntry[]
    ? never
    : TKey;

type DataOf<TEntries extends TRPCLoadEntries> = {
  [
    TKey in keyof TEntries as WaitedKey<TEntries, TKey>
  ]: TEntries[TKey] extends AnyTRPCEntry
    ? DataOfEntry<TEntries[TKey]>
    : TEntries[TKey] extends readonly (infer TItem)[]
      ? DataOfEntry<TItem>[]
      : TEntries[TKey] extends TRPCLoadEntries
        ? DataOf<TEntries[TKey]>
        : never;
};

type ResultsOf<TEntries extends TRPCLoadEntries> = {
  [
    TKey in keyof TEntries as WaitedKey<TEntries, TKey>
  ]: TEntries[TKey] extends AnyTRPCEntry
    ? TRPCEntryResult<DefOfEntry<TEntries[TKey]>, DataOfEntry<TEntries[TKey]>>
    : TEntries[TKey] extends readonly (infer TItem)[]
      ? TRPCEntryResult<DefOfEntry<TItem>, DataOfEntry<TItem>>[]
      : TEntries[TKey] extends TRPCLoadEntries
        ? ResultsOf<TEntries[TKey]>
        : never;
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
 * for every entry, by the entry's key, and `undefined` for a `skipToken`; return them
 * from the loader. `data` has the data of every fetch and ensure entry, by the entry's key.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#loader-data
 */
export type TRPCLoadedHandles<TEntries extends TRPCLoadEntries> = readonly [
  handles: HandlesOf<TEntries>,
  data: DataOf<TEntries>,
];

/**
 * What `loadHandlesSettled()` resolves to: `[handles, results]`. `results`
 * has a `TRPCEntryResult` for every fetch and ensure entry, by the entry's key.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#errors-as-values
 */
export type TRPCSettledHandles<TEntries extends TRPCLoadEntries> = readonly [
  handles: HandlesOf<TEntries>,
  results: ResultsOf<TEntries>,
];

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

/**
 * The handles of a component's entries, for typing its props. Takes the entries,
 * or the function that builds them.
 * @example
 * ```ts
 * export const postEntries = (trpc: TRPC, id: string) => ({
 *   post: ensureEntry(trpc.post.byId, { id }),
 * });
 * function Post(props: { handles: inferHandles<typeof postEntries> }) {}
 * ```
 */
export type inferHandles<
  TEntries extends TRPCLoadEntries | ((...args: any[]) => TRPCLoadEntries),
> = HandlesOf<
  TEntries extends (...args: any[]) => infer TResult ? TResult : TEntries
>;

const notAHandle = 'Expected a tRPC handle from `loadHandles()`';

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
const entryDataRef = Symbol('trpc.entryData');

/** A `dataOf()` value: a path into the data of another entry */
interface EntryDataRef {
  /** The entry `dataOf()` was called with */
  entry: object;
  path: PipelinePath;
}

/** A `dataOf()` value in an entry's input */
interface EntryInputRef extends EntryDataRef {
  /** Where it is in the input */
  to: string[];
}

interface EntryState {
  kind: TRPCEntryKind;
  type: HandleType;
  /** The procedure's path */
  path: string[];
  /** The `dataOf()` values in the entry's input */
  refs: EntryInputRef[];
  /**
   * The query's options, with every `dataOf()` value in the input replaced.
   * Its requests carry `pipeline`, for a link that pipelines.
   */
  options: (opts: {
    dataOfRef: (ref: EntryDataRef) => unknown;
    pipeline: OperationPipeline | null;
  }) => any;
  /**
   * Calls the procedure outside the `QueryClient`, with `undefined` for every
   * `dataOf()` value in the input: the server fills them in. For an infinite
   * query, it asks for the first page.
   */
  query: (pipeline: OperationPipeline) => Promise<unknown>;
  /** The `QueryClient` of the proxy that built the entry */
  queryClient: QueryClient;
}

function createEntry(state: EntryState) {
  return { [entryState]: state };
}

const entryPerItem = Symbol('trpc.handleEntryPerItem');

/**
 * What `dataOf(entry).map((item) => prefetchEntry(…))` returns: an entry to
 * load once for every item of a list in another entry's data
 */
interface EntryPerItem {
  /** The entry the callback returned, built with a stand-in for the item */
  entry: object;
  /** The list whose items it is loaded for */
  list: EntryDataRef;
}

function entryPerItemOf(value: unknown): EntryPerItem | undefined {
  return (value as { [entryPerItem]?: EntryPerItem } | null)?.[entryPerItem];
}

function entryStateOf(entry: unknown): EntryState | undefined {
  return (entry as { [entryState]?: EntryState } | null)?.[entryState];
}

const notData =
  "A `dataOf()` value has no data until the load runs, so it can only be passed on as it is, as an entry's input or anywhere inside it";

function createEntryDataRef(ref: EntryDataRef): unknown {
  // A function, so that `.map()` can be called on it
  return new Proxy(() => undefined, {
    get(_target, key) {
      if (key === entryDataRef) {
        return ref;
      }
      if (key === Symbol.toPrimitive) {
        throw new Error(
          `A \`dataOf()\` value has no data until the load runs, so it can't be made into a string or a number. Pass it as it is, as an entry's input or anywhere inside it`,
        );
      }
      if (typeof key === 'symbol') {
        return undefined;
      }
      return createEntryDataRef({
        entry: ref.entry,
        path: [...ref.path, key],
      });
    },
    apply(_target, _thisArg, args: unknown[]) {
      const method = ref.path[ref.path.length - 1];
      const callback = args[0];
      if (method !== 'map' || typeof callback !== 'function') {
        throw new Error(
          `${notData}. Of an array's methods, only \`.map()\` works, to read a part of every item`,
        );
      }
      // The callback runs once, on a stand-in for every item
      const list = ref.path.slice(0, -1);
      const item = [...list, null];
      const returned: unknown = callback(
        createEntryDataRef({ entry: ref.entry, path: item }),
      );
      if (entryStateOf(returned)) {
        // An entry: it is loaded once for every item
        const perItem: EntryPerItem = {
          entry: returned as object,
          list: { entry: ref.entry, path: list },
        };
        return { [entryPerItem]: perItem };
      }
      const mapped = entryDataRefOf(returned);
      if (
        mapped?.entry !== ref.entry ||
        !item.every((segment, index) => mapped.path[index] === segment)
      ) {
        throw new Error(
          `${notData}. A \`.map()\` callback must return the item or a part of it, such as \`(post) => post.authorId\`, or an entry to load for every item`,
        );
      }
      return createEntryDataRef(mapped);
    },
  });
}

function entryDataRefOf(value: unknown): EntryDataRef | undefined {
  return (typeof value === 'object' && value !== null) ||
    typeof value === 'function'
    ? (value as { [entryDataRef]?: EntryDataRef })[entryDataRef]
    : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Replaces every `dataOf()` value in an input. `to` is where `value` is in it */
function replaceEntryDataRefs(
  value: unknown,
  to: string[],
  replace: (ref: EntryInputRef) => unknown,
): unknown {
  const ref = entryDataRefOf(value);
  if (ref) {
    return replace({ ...ref, to });
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      replaceEntryDataRefs(item, [...to, String(index)], replace),
    );
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceEntryDataRefs(item, [...to, key], replace),
      ]),
    );
  }
  return value;
}

/**
 * Makes the first fetch of a query use the result of a pipelined request that
 * is already on its way, which was sent before the query's key was known.
 */
function withPipelinedResult(opts: {
  options: any;
  result: Promise<unknown>;
  /** Whether the request failed without running, so it has to be made again */
  unresolved: () => boolean;
  /**
   * Whether the pipelined request is the one this fetch would make: the server
   * filled in the input this client did, because the data of every entry this
   * one reads is the result of the request the server read
   */
  sameInput: (context: QueryFunctionContext<any, any>) => boolean;
  /** Called when the query takes the pipelined result as its data */
  onUsed: () => void;
}) {
  const queryFn: QueryFunction<any, any, any> = opts.options.queryFn;
  let result: Promise<unknown> | null = opts.result;
  return {
    ...opts.options,
    queryFn: (context: QueryFunctionContext<any, any>) => {
      const pipelined = result;
      result = null;
      if (!pipelined || !opts.sameInput(context)) {
        return queryFn(context);
      }
      return pipelined.then(
        (data) => {
          opts.onUsed();
          return data;
        },
        (error: unknown) => {
          // The request never ran, such as when the entry it reads failed and was retried
          if (opts.unresolved()) {
            return queryFn(context);
          }
          throw error;
        },
      );
    },
  };
}

function startEntry(opts: {
  queryClient: QueryClient;
  state: EntryState;
  options: any;
}) {
  const { queryClient, options } = opts;
  if (opts.state.type === 'infinite') {
    switch (opts.state.kind) {
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
  switch (opts.state.kind) {
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
    path: state.path.join('.'),
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

/** An entry to load, by its place in what `loadHandles()` was given */
interface EntryLeaf {
  /** The keys down to the entry, joined by dots */
  key: string;
  entry: object;
  state: EntryState;
  /**
   * For an entry from `dataOf(entry).map()`: the list it is loaded for every
   * item of. Its handle and its data are then lists too
   */
  each: EntryDataRef | null;
}

/** What `loadHandles()` was given, with `skipToken` keys left out */
type EntryTree = [name: string, node: EntryLeaf | EntryTree][];

function readEntries(opts: {
  queryClient: QueryClient;
  entries: Record<string, unknown>;
  /** The keys down to `entries` */
  keys: string[];
}): EntryTree {
  return Object.entries(opts.entries).flatMap(([name, entry]): EntryTree => {
    if (entry === skipToken) {
      return [];
    }
    const keys = [...opts.keys, name];
    const key = keys.join('.');
    const perItem = entryPerItemOf(entry);
    const state = entryStateOf(perItem ? perItem.entry : entry);
    if (state) {
      if (state.queryClient !== opts.queryClient) {
        throw new Error(
          `The entry for "${key}" was built with a proxy for another QueryClient than the root proxy that loads it`,
        );
      }
      return [
        [
          name,
          { key, entry: entry as object, state, each: perItem?.list ?? null },
        ],
      ];
    }
    if (isPlainObject(entry) && !entryDataRefOf(entry)) {
      return [
        [
          name,
          readEntries({ queryClient: opts.queryClient, entries: entry, keys }),
        ],
      ];
    }
    throw new Error(
      `Expected an entry from \`prefetchEntry()\`, \`fetchEntry()\` or \`ensureEntry()\`, \`skipToken\`, or an object of them, for "${key}", got ${JSON.stringify(entry)}`,
    );
  });
}

function leavesOf(tree: EntryTree): EntryLeaf[] {
  return tree.flatMap(([, node]) =>
    Array.isArray(node) ? leavesOf(node) : [node],
  );
}

function mapEntryTree(
  tree: EntryTree,
  map: (leaf: EntryLeaf) => [value: unknown] | [],
): Record<string, unknown> {
  // A skipped key is absent rather than `undefined`: Next.js rejects `undefined` in props
  return Object.fromEntries(
    tree.flatMap(([name, node]) => {
      if (Array.isArray(node)) {
        return [[name, mapEntryTree(node, map)]];
      }
      return map(node).map((value) => [name, value]);
    }),
  );
}

interface EntryLoad {
  leaf: EntryLeaf;
  /**
   * Goes with the query's request when another entry reads its data, or it reads
   * another's. A link that pipelines marks it, and then the entries that read
   * this one are sent in the same batch.
   */
  pipeline: OperationPipeline | null;
  /**
   * Whether the query's data is the result of the request `pipeline` went with,
   * which is what the server read for the entries that read this one. It isn't
   * when the cache had the data.
   */
  dataIsPipelined: () => boolean;
  /**
   * The query's options. Waits for the data its input reads with `dataOf()`.
   * For an entry per item, the options of every item's query
   */
  options: Promise<any>;
  /** Settles like the `QueryClient` method the entry is named after */
  promise: Promise<unknown>;
  /** The query's data, also for a prefetch entry */
  data: Promise<unknown>;
}

async function startEntries(opts: {
  queryClient: QueryClient;
  entries: Record<string, unknown>;
  /** Resolve each waited entry to a `TRPCEntryResult` instead of rejecting */
  settle: boolean;
}) {
  const { queryClient } = opts;
  const tree = readEntries({ queryClient, entries: opts.entries, keys: [] });
  const leaves = leavesOf(tree);
  const leafOfEntry = new Map(leaves.map((leaf) => [leaf.entry, leaf]));
  // Checked for every entry before any query starts
  const sourcesOfLeaf = new Map(
    leaves.map((leaf) => [
      leaf,
      [...leaf.state.refs, ...(leaf.each ? [leaf.each] : [])].map((ref) => {
        const source = leafOfEntry.get(ref.entry);
        if (!source) {
          throw new Error(
            `The entry for "${leaf.key}" reads the data of an entry with \`dataOf()\` that isn't in this load. Add that entry to the load`,
          );
        }
        return source;
      }),
    ]),
  );
  const readLeaves = new Set([...sourcesOfLeaf.values()].flat());
  const loads = new Map<EntryLeaf, EntryLoad>();
  // An entry only reads entries built before it, so this can't loop
  function loadOf(leaf: EntryLeaf): EntryLoad {
    const existing = loads.get(leaf);
    if (existing) {
      return existing;
    }
    const { state } = leaf;
    const sources = new Map(
      (sourcesOfLeaf.get(leaf) ?? []).map((source) => [
        source.entry,
        loadOf(source),
      ]),
    );
    if (leaf.each) {
      const load = loadPerItem({ leaf, list: leaf.each, sources });
      loads.set(leaf, load);
      return load;
    }

    const start = (options: any) =>
      startEntry({ queryClient, state, options }).catch((error: unknown) => {
        throw toEntryError(leaf.key, state, error);
      });
    let pipeline: OperationPipeline | null = null;
    let dataIsPipelined = () => false;
    let options: Promise<any>;
    let promise: Promise<unknown>;
    if (sources.size === 0) {
      let built = state.options({ dataOfRef: () => undefined, pipeline: null });
      if (
        // Only a query's data is one request's result, which the server can read
        state.type === 'query' &&
        readLeaves.has(leaf) &&
        // An ensure entry resolves to cached data, not to the result of its refetch
        (state.kind !== 'ensure' ||
          queryClient.getQueryData(built.queryKey) === undefined)
      ) {
        const sent = createOperationPipeline([]);
        pipeline = sent;
        built = state.options({ dataOfRef: () => undefined, pipeline: sent });
        dataIsPipelined = () => sent.accepted;
      }
      options = Promise.resolve(built);
      // The query starts now, not a tick later
      promise = start(built);
    } else {
      // If the requests of everything this entry reads just went to a link that
      // pipelines, send this one in the same batch. The server fills in its input
      const reads = state.refs.flatMap((ref) => {
        const from = sources.get(ref.entry)?.pipeline;
        return from?.accepted ? [{ to: ref.to, from, path: ref.path }] : [];
      });
      let pipelined: {
        pipeline: OperationPipeline;
        result: Promise<unknown>;
      } | null = null;
      if (
        reads.length === state.refs.length &&
        // An infinite query's request adds the cursor to its input, an object
        (state.type === 'query' || state.refs.every((ref) => ref.to.length > 0))
      ) {
        const sent = createOperationPipeline(reads);
        // For an infinite query, this is the request of its first page
        const result = state.query(sent);
        // Used only if the query fetches once its key is known
        result.catch(() => undefined);
        if (!sent.accepted) {
          // It went to another link than the entries it reads
          sent.unresolved = true;
        }
        pipelined = { pipeline: sent, result };
        if (state.type === 'query') {
          // An infinite query's data is its pages, which no one request returns,
          // so the server can't read it for the entries that read this one
          pipeline = sent;
        }
      }
      const request = pipelined;
      options = Promise.all(
        [...sources].map(async ([entry, source]) => {
          return [entry, await source.data] as const;
        }),
      ).then((resolved) => {
        const dataOfEntry = new Map(resolved);
        const filled = state.options({
          dataOfRef: (ref) =>
            readPipelinePath(dataOfEntry.get(ref.entry), ref.path),
          pipeline: null,
        });
        if (!request) {
          return filled;
        }
        // An ensure entry resolves to cached data, even if it also refetches
        const resolvesToCache =
          state.kind === 'ensure' &&
          queryClient.getQueryData(filled.queryKey) !== undefined;
        return withPipelinedResult({
          options: filled,
          result: request.result,
          unresolved: () => request.pipeline.unresolved,
          sameInput: (context) =>
            // The pipelined request was for the first page
            (state.type !== 'infinite' ||
              (context.direction === 'forward' &&
                Object.is(context.pageParam, filled.initialPageParam))) &&
            [...sources.values()].every((source) => source.dataIsPipelined()),
          onUsed: () => {
            dataIsPipelined = () => !resolvesToCache;
          },
        });
      });
      // When a source fails, its error is this entry's too: it never started
      promise = options.then(start);
    }
    const data =
      state.kind === 'prefetch'
        ? promise.then(async () => {
            // A prefetch resolves to nothing and never rejects
            const query = queryClient.getQueryState((await options).queryKey);
            if (query?.data === undefined) {
              throw toEntryError(leaf.key, state, query?.error);
            }
            return query.data;
          })
        : promise;
    // Only an entry that reads it with `dataOf()` waits for it
    data.catch(() => undefined);
    const load: EntryLoad = {
      leaf,
      pipeline,
      dataIsPipelined: () => dataIsPipelined(),
      options,
      promise,
      data,
    };
    loads.set(leaf, load);
    return load;
  }

  /** Loads an entry from `dataOf(entry).map()`: a query for every item of a list */
  function loadPerItem(perItem: {
    leaf: EntryLeaf;
    list: EntryDataRef;
    sources: Map<object, EntryLoad>;
  }): EntryLoad {
    const { leaf, list, sources } = perItem;
    const { state } = leaf;
    const item = [...list.path, null];
    const readsItem = (ref: EntryDataRef) =>
      ref.entry === list.entry &&
      item.every((segment, index) => ref.path[index] === segment);

    // If the requests of everything it reads just went to a link that
    // pipelines, send one request that the server runs once for every item
    const reads = state.refs.flatMap((ref) => {
      const from = sources.get(ref.entry)?.pipeline;
      return from?.accepted
        ? [{ to: ref.to, from, path: ref.path, each: readsItem(ref) }]
        : [];
    });
    let request: {
      pipeline: OperationPipeline;
      /** A `{ result }` or an `{ error }` for every item */
      results: Promise<unknown>;
    } | null = null;
    if (
      state.type === 'query' &&
      reads.length === state.refs.length &&
      reads.some((read) => read.each)
    ) {
      const sent = createOperationPipeline(reads);
      const results = state.query(sent);
      results.catch(() => undefined);
      if (!sent.accepted) {
        sent.unresolved = true;
      }
      request = { pipeline: sent, results };
    }
    const pipelined = request;

    const items = Promise.all(
      [...sources].map(async ([entry, source]) => {
        return [entry, await source.data] as const;
      }),
    ).then((resolved) => {
      const dataOfEntry = new Map(resolved);
      const listData = readPipelinePath(dataOfEntry.get(list.entry), list.path);
      const length = Array.isArray(listData) ? listData.length : 0;
      return Array.from({ length }, (_, index) => {
        const filled = state.options({
          dataOfRef: (ref) =>
            readPipelinePath(
              dataOfEntry.get(ref.entry),
              readsItem(ref) ? bindPipelinePath(ref.path, index) : ref.path,
            ),
          pipeline: null,
        });
        let options = filled;
        if (pipelined) {
          let missing = false;
          const result = pipelined.results.then((results) => {
            const envelope: unknown = Array.isArray(results)
              ? results[index]
              : undefined;
            if (isPlainObject(envelope) && isPlainObject(envelope['result'])) {
              return envelope['result']['data'];
            }
            if (isPlainObject(envelope) && envelope['error']) {
              throw TRPCClientError.from({ error: envelope['error'] } as any);
            }
            missing = true;
            throw new Error(`The server sent no result for item ${index}`);
          });
          result.catch(() => undefined);
          options = withPipelinedResult({
            options: filled,
            result,
            unresolved: () => pipelined.pipeline.unresolved || missing,
            sameInput: () =>
              [...sources.values()].every((source) => source.dataIsPipelined()),
            onUsed: () => undefined,
          });
        }
        const key = `${leaf.key}.${index}`;
        return {
          options,
          promise: startEntry({ queryClient, state, options }).catch(
            (error: unknown) => {
              throw toEntryError(key, state, error);
            },
          ),
        };
      });
    });
    const promise = items.then((loaded) =>
      Promise.all(
        loaded.map((load) =>
          opts.settle ? settleLoad(load.promise) : load.promise,
        ),
      ),
    );
    // A prefetch entry's load isn't waited for
    promise.catch(() => undefined);
    return {
      leaf,
      // Nothing reads the data of an entry that is a list of queries
      pipeline: null,
      dataIsPipelined: () => false,
      options: items.then((loaded) => loaded.map((load) => load.options)),
      promise,
      data: promise,
    };
  }

  const allLoads = leaves.map(loadOf);
  const waited = allLoads.filter((load) => load.leaf.state.kind !== 'prefetch');
  const [results, options] = await Promise.all([
    Promise.all(
      waited.map((load) =>
        // An entry per item settles every item itself
        opts.settle && !load.leaf.each
          ? settleLoad(load.promise)
          : load.promise,
      ),
    ),
    // Every handle needs its input, so also wait for the data that prefetch entries read
    Promise.all(allLoads.map((load) => load.options)),
  ]);

  const optionsOfLeaf = new Map(
    allLoads.map((load, index) => [load.leaf, options[index]]),
  );
  const resultOfLeaf = new Map(
    waited.map((load, index) => [load.leaf, results[index]]),
  );
  const handles = mapEntryTree(tree, (leaf) => {
    const loaded = optionsOfLeaf.get(leaf);
    return [
      leaf.each
        ? (loaded as any[]).map((item) => toHandle(item, leaf.state.type))
        : toHandle(loaded, leaf.state.type),
    ];
  });
  const data = mapEntryTree(tree, (leaf) =>
    resultOfLeaf.has(leaf) ? [resultOfLeaf.get(leaf)] : [],
  );
  return [handles, data] as const;
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
          `[@trpc/tanstack-react-query] The handle for "${path.join('.')}" is being fetched again during server rendering. ` +
            `Unless its data is stale, the query it refers to isn't in this QueryClient. ` +
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
function refetchRejectedHydration(
  queryClient: QueryClient,
  type: HandleType,
  options: any,
) {
  const enabled =
    typeof options.enabled === 'function'
      ? options.enabled
      : () => options.enabled;
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
    enabled(query) === false ||
    watchedHydrations.has(promise)
  ) {
    return;
  }
  watchedHydrations.add(promise);
  promise.catch((error: unknown) => {
    if (
      isTRPCClientError(error) ||
      isCancelledError(error) ||
      query.state.fetchStatus !== 'idle' ||
      enabled(query) === false
    ) {
      return;
    }
    const defaulted = queryClient.defaultQueryOptions(options);
    // Older query-core versions take the infinite behavior from the fetch's
    // options, so `query.fetch` would store a bare page there.
    // `fetchInfiniteQuery` skips retries unless asked, unlike a query's fetch
    // in the browser, which retries 3 times by default.
    const refetch =
      type === 'infinite'
        ? queryClient.fetchInfiniteQuery({
            ...options,
            retry: defaulted.retry ?? 3,
          })
        : query.fetch(defaulted);
    refetch.catch(() => {
      // surfaces through the query's state
    });
  });
}

function prepareHandleRead<TOptions extends { queryFn?: unknown }>(opts: {
  queryClient: QueryClient;
  handle: ReturnType<typeof readHandle>;
  options: TOptions;
}): TOptions {
  const { options } = opts;
  if (
    globalThis.process?.env?.['NODE_ENV'] !== 'production' &&
    typeof options.queryFn === 'function'
  ) {
    options.queryFn = warnIfNotHydrated(
      opts.handle.path,
      options.queryFn as QueryFunction<any, any, any>,
    );
  }
  refetchRejectedHydration(opts.queryClient, opts.handle.type, options);
  return options;
}

interface ProxyContext {
  proxy: any;
  path: string[];
  prefix: string | undefined;
}

function readProxy(proxy: unknown, fn: string): ProxyContext {
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

function readRoot(trpc: unknown, fn: string) {
  const ctx = readProxy(trpc, fn);
  if (ctx.path.length > 0) {
    throw new Error(
      `\`${fn}()\` takes the root proxy, \`trpc\`, got \`trpc.${ctx.path.join('.')}\``,
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
  const ctx = readProxy(opts.procedure, opts.fn);
  const refs: EntryInputRef[] = [];
  replaceEntryDataRefs(opts.input, [], (ref) => refs.push(ref));
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
  // Without `dataOf()` values, a bad input or option throws here, not in the load
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
    query: (pipeline) => {
      let input = replaceEntryDataRefs(opts.input, [], () => undefined);
      if (opts.type === 'infinite') {
        // The first page's request, as `infiniteQueryOptions()` makes it
        const cursor =
          (opts.opts as { initialCursor?: unknown } | undefined)
            ?.initialCursor ?? (input as { cursor?: unknown } | null)?.cursor;
        input = {
          ...(input as object),
          ...(cursor !== undefined ? { cursor } : {}),
          direction: 'forward',
        };
      }
      return ctx.proxy['~query'](input, {
        context: trpcOpts(pipeline).context,
      });
    },
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
 * `.map()`: `dataOf(posts).map((post) => post.authorId)`. Its callback runs once,
 * on a stand-in for every item, and must return the item or a part of it.
 *
 * A `.map()` callback can also return an entry, to load a query for every item:
 * `dataOf(posts).map((post) => prefetchEntry(trpc.author.byId, { id: post.authorId }))`.
 * The load then gives a list of handles, one for every item.
 *
 * The load waits for that data, whatever the kind of either entry, and rejects
 * with the error of the entry it comes from if that one fails.
 * @example
 * ```ts
 * const post = ensureEntry(trpc.post.bySlug, { slug });
 * const [handles] = await loadHandles(trpc, {
 *   post,
 *   author: prefetchEntry(trpc.author.byId, { id: dataOf(post).authorId }),
 * });
 * ```
 */
export function dataOf<TEntry extends AnyTRPCEntry>(
  entry: TEntry,
): DataOfEntry<TEntry> {
  if (!entryStateOf(entry)) {
    throw new Error(
      `\`dataOf()\` expects an entry from \`prefetchEntry()\`, \`fetchEntry()\` or \`ensureEntry()\`, got ${JSON.stringify(entry)}`,
    );
  }
  return createEntryDataRef({ entry, path: [] }) as any;
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
 * Put TanStack Query's `skipToken` in place of an entry to start nothing for that
 * key: its handle is `undefined`, and `data` has no key for it.
 *
 * Takes the root of an options proxy, from `createTRPCOptionsProxy` or `useTRPC()`.
 * Call it in a route loader, a server component or an event handler, not during
 * render: every render would start the entries again.
 * @example
 * ```ts
 * const [handles, data] = await loadHandles(trpc, {
 *   comments: prefetchInfiniteEntry(trpc.post.comments, { postId: id }),
 *   post: ensureEntry(trpc.post.byId, { id }),
 *   draft: viewer.isAdmin ? prefetchEntry(trpc.post.draftById, { id }) : skipToken,
 * });
 * if (!data.post.published) throw notFound();
 * return handles;
 * ```
 * @see https://trpc.io/docs/client/tanstack-react-query/handles
 */
export function loadHandles<
  TFeatureFlags extends FeatureFlags,
  TEntries extends TRPCLoadEntries,
>(
  trpc: DecorateRouterKeyable<TFeatureFlags>,
  entries: TEntries,
): Promise<TRPCLoadedHandles<TEntries>> {
  return startEntries({
    queryClient: queryClientOf(readRoot(trpc, 'loadHandles')),
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
  TFeatureFlags extends FeatureFlags,
  TEntries extends TRPCLoadEntries,
>(
  trpc: DecorateRouterKeyable<TFeatureFlags>,
  entries: TEntries,
): Promise<TRPCSettledHandles<TEntries>> {
  return startEntries({
    queryClient: queryClientOf(readRoot(trpc, 'loadHandlesSettled')),
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
  procedure: DecorateQueryProcedure<TDef>,
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
    handle,
    options,
  });
}
