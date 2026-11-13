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

declare const entryPerItemDef: unique symbol;

/**
 * An entry to load for every item of a list in another entry's data, from
 * `experimental_entryPerItem()`. Its handle is a `experimental_TRPCQueryHandlePerItem`.
 * @see https://trpc.io/docs/client/tanstack-react-query/dependent-queries#entry-per-item
 */
export interface experimental_TRPCEntryPerItem<
  TEntry = AnyTRPCEntry,
  TItem = unknown,
> {
  /** Type-only: never present at runtime. */
  readonly [entryPerItemDef]: { entry: TEntry; item: TItem };
}

/**
 * A serializable reference to the query of every item of a list, from an
 * `experimental_entryPerItem()` entry. `experimental_handleOfItem(handle, item)` gives one item's handle.
 * @see https://trpc.io/docs/client/tanstack-react-query/dependent-queries#entry-per-item
 */
export interface experimental_TRPCQueryHandlePerItem<
  TDef extends ResolverDef = ResolverDef,
  TItem = unknown,
> {
  /**
   * Type-only: never present at runtime. Required, so only
   * `loadHandles` creates handles.
   */
  readonly [handleDef]: TDef & { kind: 'perItem'; item: TItem };
  /** The query's key, without the parts of the input that come from an item */
  readonly queryKey: HandleQueryKey<TDef, TDef['input'], 'query'>;
  /** The query's input, without the parts that come from an item */
  readonly input: TDef['input'];
  /** Where each part of an item goes in the input */
  readonly itemInputs: readonly {
    readonly to: string[];
    readonly path: (string | null)[];
  }[];
}

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
    | experimental_TRPCEntryPerItem<any, any>
    | TRPCLoadEntries;
}

type HandleOfEntry<TEntry> =
  TEntry extends TRPCQueryEntry<infer TDef, any>
    ? TRPCQueryHandle<TDef>
    : TEntry extends TRPCInfiniteQueryEntry<infer TDef, any>
      ? TRPCInfiniteQueryHandle<TDef>
      : TEntry extends typeof skipToken
        ? undefined
        : TEntry extends experimental_TRPCEntryPerItem<
              TRPCQueryEntry<infer TDef, any>,
              infer TItem
            >
          ? experimental_TRPCQueryHandlePerItem<TDef, TItem>
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
  | experimental_TRPCEntryPerItem<WaitedEntry, any>
  ? TKey
  : TEntries[TKey] extends
        | AnyTRPCEntry
        | typeof skipToken
        | experimental_TRPCEntryPerItem<any, any>
    ? never
    : TKey;

type DataOf<TEntries extends TRPCLoadEntries> = {
  [
    TKey in keyof TEntries as WaitedKey<TEntries, TKey>
  ]: TEntries[TKey] extends AnyTRPCEntry
    ? DataOfEntry<TEntries[TKey]>
    : TEntries[TKey] extends experimental_TRPCEntryPerItem<infer TEntry, any>
      ? DataOfEntry<TEntry>[]
      : TEntries[TKey] extends TRPCLoadEntries
        ? DataOf<TEntries[TKey]>
        : never;
};

type ResultsOf<TEntries extends TRPCLoadEntries> = {
  [
    TKey in keyof TEntries as WaitedKey<TEntries, TKey>
  ]: TEntries[TKey] extends AnyTRPCEntry
    ? TRPCEntryResult<DefOfEntry<TEntries[TKey]>, DataOfEntry<TEntries[TKey]>>
    : TEntries[TKey] extends experimental_TRPCEntryPerItem<infer TEntry, any>
      ? TRPCEntryResult<DefOfEntry<TEntry>, DataOfEntry<TEntry>>[]
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
 * function Post(props: { handles: experimental_inferHandles<typeof postEntries> }) {}
 * ```
 * @see https://trpc.io/docs/client/tanstack-react-query/dependent-queries#groups
 */
export type experimental_inferHandles<
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

/** A `experimental_dataOf()` value: a path into the data of another entry */
interface EntryDataRef {
  /** The entry `experimental_dataOf()` was called with */
  entry: object;
  path: PipelinePath;
}

/** A `experimental_dataOf()` value in an entry's input */
interface EntryInputRef extends EntryDataRef {
  /** Where it is in the input */
  to: string[];
}

interface EntryState {
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
  /**
   * Calls the procedure outside the `QueryClient`, with `undefined` for every
   * `experimental_dataOf()` value in the input: the server fills them in. For an infinite
   * query, it asks for the first page.
   */
  query: (pipeline: OperationPipeline) => Promise<unknown>;
  /** The `QueryClient` of the proxy that built the entry */
  queryClient: QueryClient;
}

function createEntry(state: EntryState) {
  return { [entryState]: state };
}

function entryStateOf(entry: unknown): EntryState | undefined {
  return (entry as { [entryState]?: EntryState } | null)?.[entryState];
}

const entryPerItemState = Symbol('trpc.handleEntryPerItem');

/** What `experimental_entryPerItem()` returns */
interface EntryPerItemState {
  /** The entry the callback returned, built with a stand-in for the item */
  entry: object;
  /**
   * The list whose items it is loaded for. It is a list of lists, which are
   * flattened, for every `null` in its path
   */
  list: EntryDataRef;
}

function entryPerItemStateOf(value: unknown): EntryPerItemState | undefined {
  return (value as { [entryPerItemState]?: EntryPerItemState } | null)?.[
    entryPerItemState
  ];
}

const notData =
  "A `experimental_dataOf()` value has no data until the load runs, so it can only be passed on as it is, as an entry's input or anywhere inside it";

function createEntryDataRef(ref: EntryDataRef): unknown {
  // A function, so that `.map()` can be called on it
  return new Proxy(() => undefined, {
    get(_target, key) {
      if (key === entryDataRef) {
        return ref;
      }
      if (key === Symbol.toPrimitive) {
        throw new Error(
          `A \`experimental_dataOf()\` value has no data until the load runs, so it can't be made into a string or a number. Pass it as it is, as an entry's input or anywhere inside it`,
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
      if (method === 'toJSON') {
        // So that an error message can print a value that has one inside
        return '[a experimental_dataOf() value]';
      }
      const callback = args[0];
      if (method !== 'map' || typeof callback !== 'function') {
        throw new Error(
          `${notData}. Of an array's methods, only \`.map()\` works, to read a part of every item`,
        );
      }
      // The callback runs once, on a stand-in for every item
      const item = [...ref.path.slice(0, -1), null];
      const mapped = entryDataRefOf(
        callback(createEntryDataRef({ entry: ref.entry, path: item })),
      );
      if (
        mapped?.entry !== ref.entry ||
        !item.every((segment, index) => mapped.path[index] === segment)
      ) {
        throw new Error(
          `${notData}. A \`.map()\` callback must return the item or a part of it, such as \`(post) => post.authorId\`. To load an entry for every item, use \`experimental_entryPerItem()\``,
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

/** Replaces every `experimental_dataOf()` value in an input. `to` is where `value` is in it */
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
   * filled in the same input as this client did
   */
  sameInput: (context: QueryFunctionContext<any, any>) => Promise<boolean>;
}) {
  const queryFn: QueryFunction<any, any, any> = opts.options.queryFn;
  let result: Promise<unknown> | null = opts.result;
  return {
    ...opts.options,
    queryFn: async (context: QueryFunctionContext<any, any>) => {
      const pipelined = result;
      result = null;
      if (
        !pipelined ||
        // If what the server read can't be read here, such as a failed request
        !(await opts.sameInput(context).catch(() => false))
      ) {
        return queryFn(context);
      }
      try {
        return await pipelined;
      } catch (error) {
        // The request never ran, such as when the entry it reads failed and was retried
        if (opts.unresolved()) {
          return queryFn(context);
        }
        throw error;
      }
    },
  };
}

/**
 * A path in an entry's data as a path in the result of its request. That
 * result is the data of a query, and the first page of an infinite query.
 */
function requestPath(opts: {
  type: HandleType;
  path: PipelinePath;
  /** Whether it is the path of an item of a list that is flattened */
  item: boolean;
}): PipelinePath | null {
  if (opts.type === 'query') {
    return opts.path;
  }
  const [pages, page] = opts.path;
  return pages === 'pages' && (page === '0' || (opts.item && page === null))
    ? opts.path.slice(2)
    : null;
}

/**
 * The indexes of every item of a list, which is a list of lists `depth` times
 */
function itemIndexes(list: unknown, depth: number): number[][] {
  if (!Array.isArray(list)) {
    return [];
  }
  if (depth === 0) {
    return list.map((_, index) => [index]);
  }
  return list.flatMap((inner: unknown, index) =>
    itemIndexes(inner, depth - 1).map((rest) => [index, ...rest]),
  );
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
   * For an entry from `experimental_dataOf(entry).map()`: the list it is loaded for every
   * item of. Its handle and its data are then lists too
   */
  each: EntryDataRef | null;
}

/** What `loadHandles()` was given, with `skipToken` keys left out */
type EntryTree = [name: string, node: EntryLeaf | EntryTree][];

/** Whether a value is something `loadHandles()` loads: an entry or `skipToken` */
function isLoadable(value: unknown) {
  return (
    value === skipToken ||
    entryStateOf(value) !== undefined ||
    entryPerItemStateOf(value) !== undefined
  );
}

/**
 * Whether an object is a group of entries. An object with nothing to load in
 * it is not: it is reported as it was before there were groups.
 */
function isGroup(value: unknown): value is Record<string, unknown> {
  if (!isPlainObject(value) || entryDataRefOf(value)) {
    return false;
  }
  const members = Object.values(value);
  return (
    members.length === 0 ||
    members.some((member) => isLoadable(member) || isGroup(member))
  );
}

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
    const perItem = entryPerItemStateOf(entry);
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
    if (isGroup(entry)) {
      return [
        [
          name,
          readEntries({ queryClient: opts.queryClient, entries: entry, keys }),
        ],
      ];
    }
    throw new Error(
      `Expected an entry from \`prefetchEntry()\`, \`fetchEntry()\` or \`ensureEntry()\`, or \`skipToken\`, for "${key}", got ${JSON.stringify(entry)}`,
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
   * The result of the request `pipeline` went with, in the shape of the
   * query's data. It is what the server read for the entries that read this one
   */
  requestData: Promise<unknown> | null;
  /**
   * The query's options. Waits for the data its input reads with `experimental_dataOf()`.
   * For an entry per item, its handle
   */
  options: Promise<any>;
  /** Settles like the `QueryClient` method the entry is named after */
  promise: Promise<unknown>;
  /** The query's data, also for a prefetch entry */
  data: Promise<unknown>;
}

/** In place of the options of an entry that couldn't start */
const notStarted = Symbol('trpc.handleEntryNotStarted');

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
            `The entry for "${leaf.key}" reads the data of an entry with \`experimental_dataOf()\` that isn't in this load. Add that entry to the load`,
          );
        }
        return source;
      }),
    ]),
  );
  const readLeaves = new Set([...sourcesOfLeaf.values()].flat());
  const waitedKeys = new Set(
    leaves
      .filter((leaf) => leaf.state.kind !== 'prefetch')
      .map((leaf) => leaf.key),
  );
  /**
   * Whether an entry couldn't start because an entry it reads failed, and
   * `loadHandlesSettled()` has that failure in its results. The entry then
   * has no handle. A failed prefetch entry has no result, so it still rejects
   */
  const isSettledFailure = (error: unknown) =>
    opts.settle && error instanceof TRPCEntryError && waitedKeys.has(error.key);

  /** The data of the entries an entry reads, by entry */
  const dataOfSources = (
    sources: Map<object, EntryLoad>,
    read: (source: EntryLoad) => Promise<unknown> | null,
  ) =>
    Promise.all(
      [...sources].map(async ([entry, source]) => {
        return [entry, await read(source)] as const;
      }),
    ).then((resolved) => new Map(resolved));

  /**
   * Sends an entry's request in the batch of the entries it reads, if their
   * requests just went to a link that pipelines. The server fills in its input
   */
  function sendPipelined(pipelined: {
    state: EntryState;
    sources: Map<object, EntryLoad>;
    /** Whether a `experimental_dataOf()` value is an item of the list an entry is loaded for */
    readsItem: (ref: EntryDataRef) => boolean;
  }) {
    const { state } = pipelined;
    const reads = state.refs.flatMap((ref) => {
      const source = pipelined.sources.get(ref.entry);
      const each = pipelined.readsItem(ref);
      const path = source
        ? requestPath({
            type: source.leaf.state.type,
            path: ref.path,
            item: each,
          })
        : null;
      return source?.pipeline?.accepted && path
        ? [{ to: ref.to, from: source.pipeline, path, each }]
        : [];
    });
    if (
      reads.length !== state.refs.length ||
      // An infinite query's request adds the cursor to its input, an object
      (state.type === 'infinite' &&
        state.refs.some((ref) => ref.to.length === 0))
    ) {
      return null;
    }
    const pipeline = createOperationPipeline(reads);
    // For an infinite query, this is the request of its first page
    const result = state.query(pipeline);
    // Used only if the query fetches once its key is known
    result.catch(() => undefined);
    if (!pipeline.accepted) {
      // It went to another link than the entries it reads
      pipeline.unresolved = true;
    }
    return { pipeline, result };
  }

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
    let requestData: Promise<unknown> | null = null;
    let options: Promise<any>;
    let promise: Promise<unknown>;
    if (sources.size === 0) {
      let built = state.options({ dataOfRef: () => undefined, pipeline: null });
      if (readLeaves.has(leaf) && typeof built.queryFn === 'function') {
        // Another entry reads this one: its request can take part in pipelining
        const sent = createOperationPipeline([]);
        pipeline = sent;
        built = state.options({ dataOfRef: () => undefined, pipeline: sent });
        const queryFn: QueryFunction<any, any, any> = built.queryFn;
        let first: Promise<unknown> | null = null;
        const request = new Promise<unknown>((resolve) => {
          built = {
            ...built,
            queryFn: (context: QueryFunctionContext<any, any>) => {
              const result = Promise.resolve(queryFn(context));
              if (!first) {
                // Its first request is the one a link takes into a batch. For
                // an infinite query, it is the first page
                first = result;
                resolve(
                  state.type === 'infinite'
                    ? result.then((page) => ({
                        pages: [page],
                        pageParams: [context.pageParam],
                      }))
                    : result,
                );
              }
              return result;
            },
          };
        });
        request.catch(() => undefined);
        requestData = request;
      }
      options = Promise.resolve(built);
      // The query starts now, not a tick later
      promise = start(built);
    } else {
      const request = sendPipelined({ state, sources, readsItem: () => false });
      if (request && state.type === 'query') {
        // An infinite query's data is its pages, which no one request returns,
        // so the server can't read it for the entries that read this one
        pipeline = request.pipeline;
        requestData = request.result;
      }
      options = dataOfSources(sources, (source) => source.data).then((data) => {
        const fill = (dataOfEntry: Map<object, unknown>) =>
          state.options({
            dataOfRef: (ref) =>
              readPipelinePath(dataOfEntry.get(ref.entry), ref.path),
            pipeline: null,
          });
        const filled = fill(data);
        if (!request) {
          return filled;
        }
        return withPipelinedResult({
          options: filled,
          result: request.result,
          unresolved: () => request.pipeline.unresolved,
          sameInput: async (context) =>
            // The pipelined request was for the first page
            (state.type !== 'infinite' ||
              (context.direction === 'forward' &&
                Object.is(context.pageParam, filled.initialPageParam))) &&
            hashKey(filled.queryKey) ===
              hashKey(
                fill(
                  await dataOfSources(sources, (source) => source.requestData),
                ).queryKey,
              ),
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
    // Only an entry that reads it with `experimental_dataOf()` waits for it
    data.catch(() => undefined);
    const load: EntryLoad = {
      leaf,
      pipeline,
      requestData,
      options,
      promise,
      data,
    };
    loads.set(leaf, load);
    return load;
  }

  /** Loads an entry from `experimental_entryPerItem()`: a query for every item of a list */
  function loadPerItem(perItem: {
    leaf: EntryLeaf;
    list: EntryDataRef;
    sources: Map<object, EntryLoad>;
  }): EntryLoad {
    const { leaf, list, sources } = perItem;
    const { state } = leaf;
    const item = [...list.path, null];
    const depth = list.path.filter((segment) => segment === null).length;
    const readsItem = (ref: EntryDataRef) =>
      ref.entry === list.entry &&
      item.every((segment, index) => ref.path[index] === segment);
    /** The items of the list in an entry's data, as the indexes down to each */
    const itemsOf = (dataOfEntry: Map<object, unknown>) =>
      itemIndexes(
        readPipelinePath(dataOfEntry.get(list.entry), list.path),
        depth,
      );
    const optionsOfItem = (
      dataOfEntry: Map<object, unknown>,
      indexes: number[],
    ) =>
      state.options({
        dataOfRef: (ref) =>
          readPipelinePath(
            dataOfEntry.get(ref.entry),
            readsItem(ref)
              ? indexes.reduce<PipelinePath>(bindPipelinePath, ref.path)
              : ref.path,
          ),
        pipeline: null,
      });

    // One request, which the server runs once for every item. Its result is a
    // `{ result }` or an `{ error }` for every item
    const request = sendPipelined({ state, sources, readsItem });

    const loaded = dataOfSources(sources, (source) => source.data).then(
      (data) => {
        // The handle has the input without the item's parts, and where they go
        const handle = {
          ...toHandle(
            state.options({
              dataOfRef: (ref) =>
                readsItem(ref)
                  ? undefined
                  : readPipelinePath(data.get(ref.entry), ref.path),
              pipeline: null,
            }),
            state.type,
          ),
          itemInputs: state.refs
            .filter(readsItem)
            .map((ref) => ({ to: ref.to, path: ref.path.slice(item.length) })),
        };
        /** The key of every item's query, with the input the server filled in */
        const serverKeys = request
          ? dataOfSources(sources, (source) => source.requestData).then(
              (serverData) =>
                itemsOf(serverData).map((indexes) =>
                  hashKey(optionsOfItem(serverData, indexes).queryKey),
                ),
            )
          : null;
        serverKeys?.catch(() => undefined);

        const items = itemsOf(data).map((indexes, index) => {
          let options = optionsOfItem(data, indexes);
          if (request && serverKeys) {
            const key = hashKey(options.queryKey);
            let missing = false;
            const result = request.result.then((results) => {
              const envelope: unknown = Array.isArray(results)
                ? results[index]
                : undefined;
              if (
                isPlainObject(envelope) &&
                isPlainObject(envelope['result'])
              ) {
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
              options,
              result,
              unresolved: () => request.pipeline.unresolved || missing,
              sameInput: async () => (await serverKeys)[index] === key,
            });
          }
          const itemKey = `${leaf.key}.${index}`;
          return startEntry({ queryClient, state, options }).catch(
            (error: unknown) => {
              throw toEntryError(itemKey, state, error);
            },
          );
        });
        return { handle, items };
      },
    );
    const promise = loaded.then(
      (load) =>
        Promise.all(
          load.items.map((itemPromise) =>
            opts.settle ? settleLoad(itemPromise) : itemPromise,
          ),
        ),
      (error: unknown) => {
        if (isSettledFailure(error)) {
          // Without the list, there are no items to have results
          return [];
        }
        throw error;
      },
    );
    // A prefetch entry's load isn't waited for
    promise.catch(() => undefined);
    return {
      leaf,
      // Nothing reads the data of an entry that is a list of queries
      pipeline: null,
      requestData: null,
      options: loaded.then((load) => load.handle),
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
    Promise.all(
      allLoads.map((load) =>
        load.options.catch((error: unknown) => {
          if (isSettledFailure(error)) {
            return notStarted;
          }
          throw error;
        }),
      ),
    ),
  ]);

  const optionsOfLeaf = new Map(
    allLoads.map((load, index) => [load.leaf, options[index]]),
  );
  const resultOfLeaf = new Map(
    waited.map((load, index) => [load.leaf, results[index]]),
  );
  const handles = mapEntryTree(tree, (leaf) => {
    const loaded = optionsOfLeaf.get(leaf);
    if (loaded === notStarted) {
      return [];
    }
    // An entry per item has its handle already
    return [leaf.each ? loaded : toHandle(loaded, leaf.state.type)];
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
 * `.map()`: `experimental_dataOf(posts).map((post) => post.authorId)`. Its callback runs once,
 * on a stand-in for every item, and must return the item or a part of it.
 *
 * To load a query for every item, use `experimental_entryPerItem()`.
 *
 * The load waits for that data, whatever the kind of either entry, and rejects
 * with the error of the entry it comes from if that one fails. With
 * `loadHandlesSettled()`, that error is in the results instead.
 * @example
 * ```ts
 * const post = ensureEntry(trpc.post.bySlug, { slug });
 * const [handles] = await loadHandles(trpc, {
 *   post,
 *   author: prefetchEntry(trpc.author.byId, { id: experimental_dataOf(post).authorId }),
 * });
 * ```
 * @see https://trpc.io/docs/client/tanstack-react-query/dependent-queries#data-of
 */
export function experimental_dataOf<TEntry extends AnyTRPCEntry>(
  entry: TEntry,
): DataOfEntry<TEntry> {
  if (!entryStateOf(entry)) {
    throw new Error(
      `\`experimental_dataOf()\` expects an entry from \`prefetchEntry()\`, \`fetchEntry()\` or \`ensureEntry()\`, got ${JSON.stringify(entry)}`,
    );
  }
  return createEntryDataRef({ entry, path: [] }) as any;
}

/**
 * An entry to load for every item of a list in another entry's data. The
 * callback runs once, on a stand-in for every item, and returns the entry.
 *
 * The load gives one handle for it. `experimental_handleOfItem(handle, item)` is the handle
 * of an item's query, also for an item that loaded later, such as one on a
 * later page.
 *
 * The list is a `experimental_dataOf()` value. A list of lists works too, such as the items
 * of every page of an infinite query:
 * `experimental_dataOf(posts).pages.map((page) => page.items)`.
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
 * @see https://trpc.io/docs/client/tanstack-react-query/dependent-queries#entry-per-item
 */
export function experimental_entryPerItem<
  TItem,
  TDef extends ResolverDef,
  TKind extends TRPCEntryKind,
>(
  items: readonly (readonly TItem[])[],
  entry: (item: TItem) => TRPCQueryEntry<TDef, TKind>,
): experimental_TRPCEntryPerItem<TRPCQueryEntry<TDef, TKind>, TItem>;
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
    createEntryDataRef({ entry: list.entry, path: [...list.path, null] }),
  );
  if (entryStateOf(returned)?.type !== 'query') {
    throw new Error(
      `The callback of \`experimental_entryPerItem()\` must return an entry from \`prefetchEntry()\`, \`fetchEntry()\` or \`ensureEntry()\`, got ${JSON.stringify(returned)}`,
    );
  }
  const state: EntryPerItemState = { entry: returned as object, list };
  return { [entryPerItemState]: state };
}

function withInputAt(input: unknown, to: readonly string[], value: unknown) {
  const [key, ...rest] = to;
  if (key === undefined) {
    return value;
  }
  const container: object = Array.isArray(input)
    ? [...input]
    : { ...(input as object | undefined) };
  // Not an assignment, which would set the prototype for a `__proto__` key
  Object.defineProperty(container, key, {
    value: withInputAt((input as any)?.[key], rest, value),
    writable: true,
    enumerable: true,
    configurable: true,
  });
  return container;
}

/**
 * The handle of one item's query, from the handle of an `experimental_entryPerItem()` entry.
 * Read it with `fromHandle(trpc, handle)`, like any handle.
 *
 * It works for any item of the list's kind, also one the load didn't have, such
 * as an item on a later page. Its query then loads when it is read.
 * @example
 * ```tsx
 * <AuthorName author={experimental_handleOfItem(handles.authors, post)} />
 * ```
 * @see https://trpc.io/docs/client/tanstack-react-query/dependent-queries#entry-per-item
 */
export function experimental_handleOfItem<TDef extends ResolverDef, TItem>(
  handle: experimental_TRPCQueryHandlePerItem<TDef, TItem>,
  item: NoInfer<TItem>,
): TRPCQueryHandle<TDef> {
  const perItem = handle as unknown as {
    queryKey?: unknown[];
    input?: unknown;
    itemInputs?: { to: string[]; path: PipelinePath }[];
  };
  if (!Array.isArray(perItem.queryKey) || !Array.isArray(perItem.itemInputs)) {
    throw new Error(
      `Expected the handle of an \`experimental_entryPerItem()\` entry, got ${JSON.stringify(handle)}`,
    );
  }
  const input = perItem.itemInputs.reduce(
    (filled, itemInput) =>
      withInputAt(filled, itemInput.to, readPipelinePath(item, itemInput.path)),
    perItem.input,
  );
  const args = perItem.queryKey[perItem.queryKey.length - 1] as object;
  return {
    queryKey: [...perItem.queryKey.slice(0, -1), { ...args, input }],
    ...(input !== undefined && { input }),
  } as any;
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
 * When an entry fails, the entries that read its data with `experimental_dataOf()` can't
 * start: they have no handle, and their result is the same error. So check the
 * results before you return the handles. If the failed entry is a prefetch entry,
 * which has no result, the load rejects with its error.
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
