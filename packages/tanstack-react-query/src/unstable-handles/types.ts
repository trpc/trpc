import type {
  FetchQueryOptions,
  GetNextPageParamFunction,
} from '@tanstack/react-query';
import type { skipToken } from '@tanstack/react-query';
import type {
  DecorateInfiniteQueryProcedure,
  DecorateQueryProcedure,
} from '../internals/createOptionsProxy';
import type {
  AnyTRPCQueryKey,
  ExtractCursorType,
  ResolverDef,
  TRPCInfiniteData,
  TRPCQueryBaseOptions,
} from '../internals/types';
import type { TRPCEntryError } from './entryError';

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
export type AnyTRPCHandle =
  | TRPCQueryHandle<ResolverDef>
  | TRPCInfiniteQueryHandle<ResolverDef>;

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
  | TRPCQueryEntry<ResolverDef, TRPCEntryKind>
  | TRPCInfiniteQueryEntry<ResolverDef, TRPCEntryKind>;

/**
 * What `loadHandles()` takes per key: an entry, or TanStack Query's
 * `skipToken` to start nothing for that key.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#conditional-queries
 */
export type TRPCLoadEntries = Record<string, AnyTRPCEntry | typeof skipToken>;

type HandleOfEntry<TEntry> =
  TEntry extends TRPCQueryEntry<infer TDef, TRPCEntryKind>
    ? TRPCQueryHandle<TDef>
    : TEntry extends TRPCInfiniteQueryEntry<infer TDef, TRPCEntryKind>
      ? TRPCInfiniteQueryHandle<TDef>
      : TEntry extends typeof skipToken
        ? undefined
        : never;

type DataOfEntry<TEntry> =
  TEntry extends TRPCQueryEntry<infer TDef, TRPCEntryKind>
    ? TDef['output']
    : TEntry extends TRPCInfiniteQueryEntry<infer TDef, TRPCEntryKind>
      ? TRPCInfiniteData<TDef['input'], TDef['output']>
      : never;

type HandlesOf<TEntries extends TRPCLoadEntries> = {
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

type DataOf<TEntries extends TRPCLoadEntries> = {
  [TKey in keyof TEntries as WaitedKey<TEntries, TKey>]: DataOfEntry<
    TEntries[TKey]
  >;
};

type ResultsOf<TEntries extends TRPCLoadEntries> = {
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

export type EntryArgs<TDef extends ResolverDef> =
  undefined extends TDef['input']
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
export type inferQueryHandle<
  // Not `ResolverDef`: a procedure's options take its own input, so another
  // procedure's aren't assignable to them
  TProcedure extends DecorateQueryProcedure<any>,
> =
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

export type HandleType = 'query' | 'infinite';

/**
 * The options the options proxy builds for an entry, or for reading a handle.
 * The proxy has no types here, so neither have they, but for what is read
 */
export interface EntryQueryOptions {
  queryKey: AnyTRPCQueryKey;
  queryFn?: unknown;
  enabled?: unknown;
  /** The first page's cursor, of an infinite query */
  initialPageParam?: unknown;
  [option: string]: unknown;
}
