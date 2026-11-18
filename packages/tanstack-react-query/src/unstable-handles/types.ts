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
  ExtractCursorType,
  ResolverDef,
  TRPCInfiniteData,
  TRPCQueryBaseOptions,
} from '../internals/types';
import type { TRPCEntryError } from './entryError';

export declare const handleDef: unique symbol;
export declare const entryDef: unique symbol;

export type InfiniteHandleInput<TInput> = TInput extends object
  ? Omit<TInput, 'cursor' | 'direction'>
  : TInput;

/**
 * The input of an unfinished handle: the parts that come from an item or the
 * data aren't there yet. A key may be absent, an item of an array `null`, and
 * the whole input `undefined`. `experimental_handleOfItem()` fills them in.
 */
export type UnfinishedInput<TInput> = UnfinishedPart<TInput> | undefined;
type UnfinishedPart<TInput> = TInput extends readonly (infer TItem)[]
  ? (UnfinishedPart<TItem> | null)[]
  : TInput extends (...args: any[]) => unknown
    ? TInput
    : TInput extends object
      ? { [TKey in keyof TInput]?: UnfinishedPart<TInput[TKey]> }
      : TInput;

/**
 * A plain tuple typed with the procedure's input. TanStack Router's serializability check
 * rejects `unknown` inputs and `DataTag`-ged keys, so handles in `beforeLoad` need this shape.
 */
export type HandleQueryKey<
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
  /**
   * Only when an `experimental_entryPerItem()` entry is loaded for the items of
   * a list in the data: what that entry loads for an item. When the query is
   * fetched again, it loads that for its items, in the same request.
   */
  readonly experimental_perItem?: readonly PerItemQueries[];
  /**
   * Only for an entry whose input is `skipToken`: its query is disabled, and
   * `fromHandle()` gives options with `skipToken`. Read it with `useQuery`.
   */
  readonly skipped?: true;
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
  /** Only for an entry whose input is `skipToken`, as on a query's handle */
  readonly skipped?: true;
  /**
   * Only when an `experimental_entryPerItem()` entry is loaded for the items of
   * every page: what that entry loads for an item. A page that is fetched
   * later then loads it for its items, in the same request.
   */
  readonly experimental_perItem?: readonly PerItemQueries[];
}

/**
 * What an `experimental_entryPerItem()` entry loads for an item: the handle of
 * that entry, and where the list of items is in one request's result.
 */
export interface PerItemQueries extends experimental_TRPCQueryHandlePerItem<
  any,
  any
> {
  /** The list in a query's data, or in a page of an infinite query */
  readonly list: readonly string[];
  /** What of each element of the list the item is: `[]` for the element */
  readonly itemRead: readonly string[];
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

export declare const entryPerItemDef: unique symbol;

/**
 * An entry to load for every item of a list in another entry's data, from
 * `experimental_entryPerItem()`. Its handle is a `experimental_TRPCQueryHandlePerItem`.
 * @see https://trpc.io/docs/client/tanstack-react-query/nested-queries#entry-per-item
 */
export interface experimental_TRPCEntryPerItem<
  TEntry = AnyTRPCEntry,
  TItem = unknown,
> {
  /** Type-only: never present at runtime. */
  readonly [entryPerItemDef]: { entry: TEntry; item: TItem };
}

export declare const entryFromDataDef: unique symbol;

/**
 * An entry built from the data of another entry, from
 * `experimental_dataOf(entry, (data) => entry)`. The load doesn't wait for
 * that data. Its handle is unfinished: `experimental_handleOfItem(handle, data)`
 * finishes it in the component that has the data.
 * @see https://trpc.io/docs/client/tanstack-react-query/nested-queries#without-waiting
 */
export interface experimental_TRPCEntryFromData<
  TEntry = AnyTRPCEntry,
  TData = unknown,
> {
  /** Type-only: never present at runtime. */
  readonly [entryFromDataDef]: { entry: TEntry; data: TData };
}

/**
 * A serializable reference to a query that needs an item to be finished:
 * `experimental_handleOfItem(handle, item)` gives the query's handle. From an
 * `experimental_entryPerItem()` entry, where the item is an item of the list,
 * or from `experimental_dataOf(entry, (data) => entry)`, where it is that
 * entry's data.
 * @see https://trpc.io/docs/client/tanstack-react-query/nested-queries#entry-per-item
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
  readonly queryKey: HandleQueryKey<
    TDef,
    UnfinishedInput<TDef['input']>,
    'query'
  >;
  /** The query's input, without the parts that come from an item */
  readonly input: UnfinishedInput<TDef['input']>;
  /** Where each part of an item goes in the input */
  readonly itemInputs: readonly {
    readonly to: string[];
    readonly path: (string | null)[];
  }[];
  /**
   * Only when its query's data has a list that an
   * `experimental_entryPerItem()` entry is loaded for: what that entry loads
   * for an item. The finished handle keeps it.
   */
  readonly experimental_perItem?: readonly PerItemQueries[];
  /** Only for an entry whose input is `skipToken`: every item's query is disabled */
  readonly skipped?: true;
}

/**
 * A serializable reference to an infinite query that needs the data of the
 * entry it was built from to be finished, from
 * `experimental_dataOf(entry, (data) => entry)`.
 * `experimental_handleOfItem(handle, data)` gives the query's handle.
 * @see https://trpc.io/docs/client/tanstack-react-query/nested-queries#without-waiting
 */
export interface experimental_TRPCInfiniteQueryHandlePerItem<
  TDef extends ResolverDef = ResolverDef,
  TItem = unknown,
> {
  /**
   * Type-only: never present at runtime. Required, so only
   * `loadHandles` creates handles.
   */
  readonly [handleDef]: TDef & { kind: 'infinitePerItem'; item: TItem };
  /** The query's key, without the parts of the input that come from the data */
  readonly queryKey: HandleQueryKey<
    TDef,
    UnfinishedInput<InfiniteHandleInput<TDef['input']>>,
    'infinite'
  >;
  /** The query's input, without the parts that come from the data */
  readonly input: UnfinishedInput<InfiniteHandleInput<TDef['input']>>;
  readonly initialCursor?: NonNullable<ExtractCursorType<TDef['input']>> | null;
  /** Where each part of the data goes in the input */
  readonly itemInputs: readonly {
    readonly to: string[];
    readonly path: (string | null)[];
  }[];
  /**
   * Only when its query's pages have a list that an
   * `experimental_entryPerItem()` entry is loaded for: what that entry loads
   * for an item. The finished handle keeps it.
   */
  readonly experimental_perItem?: readonly PerItemQueries[];
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
    | experimental_TRPCEntryFromData<any, any>
    | TRPCLoadEntries;
}

export type HandleOfEntry<TEntry> =
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
          : TEntry extends experimental_TRPCEntryFromData<
                infer TInner,
                infer TData
              >
            ? TInner extends TRPCQueryEntry<infer TDef, any>
              ? experimental_TRPCQueryHandlePerItem<TDef, TData>
              : TInner extends TRPCInfiniteQueryEntry<infer TDef, any>
                ? experimental_TRPCInfiniteQueryHandlePerItem<TDef, TData>
                : never
            : TEntry extends TRPCLoadEntries
              ? HandlesOf<TEntry>
              : never;

export type DataOfEntry<TEntry> =
  TEntry extends TRPCQueryEntry<infer TDef, any>
    ? TDef['output']
    : TEntry extends TRPCInfiniteQueryEntry<infer TDef, any>
      ? TRPCInfiniteData<TDef['input'], TDef['output']>
      : TEntry extends experimental_TRPCEntryFromData<infer TInner, any>
        ? DataOfEntry<TInner>
        : never;

export type HandlesOf<TEntries> = {
  [TKey in keyof TEntries]: HandleOfEntry<TEntries[TKey]>;
};

export type DefOfEntry<TEntry> = TEntry extends {
  readonly [entryDef]: { def: infer TDef extends ResolverDef };
}
  ? TDef
  : never;

export type WaitedEntry = {
  readonly [entryDef]: { kind: 'fetch' | 'ensure' };
};

/**
 * Whether an entry is waited for: only fetch and ensure entries are, so only
 * they have data. A group is, with the data of the entries in it. For a union,
 * such as `isAdmin ? fetchEntry(…) : skipToken`, it is a union too.
 */
export type IsWaited<TEntry> = TEntry extends
  | WaitedEntry
  | experimental_TRPCEntryPerItem<WaitedEntry, any>
  | experimental_TRPCEntryFromData<WaitedEntry, any>
  ? true
  : TEntry extends
        | AnyTRPCEntry
        | typeof skipToken
        | experimental_TRPCEntryPerItem<any, any>
        | experimental_TRPCEntryFromData<any, any>
    ? false
    : true;

/** A key whose entry is always waited for */
export type WaitedKey<TEntries, TKey extends keyof TEntries> = [
  IsWaited<TEntries[TKey]>,
] extends [true]
  ? TKey
  : never;

/** A key whose entry is waited for unless it is a `skipToken`: it may have no data */
export type MaybeWaitedKey<TEntries, TKey extends keyof TEntries> = [
  IsWaited<TEntries[TKey]>,
] extends [true]
  ? never
  : true extends IsWaited<TEntries[TKey]>
    ? TKey
    : never;

/** One object type out of an intersection of them, to read in a tooltip */
export type Flatten<TObject> = { [TKey in keyof TObject]: TObject[TKey] };

export type DataOfValue<TEntry> = TEntry extends
  | AnyTRPCEntry
  | experimental_TRPCEntryFromData<any, any>
  ? DataOfEntry<TEntry>
  : TEntry extends experimental_TRPCEntryPerItem<infer TInner, any>
    ? DataOfEntry<TInner>[]
    : TEntry extends TRPCLoadEntries
      ? DataOf<TEntry>
      : never;

export type DataOf<TEntries extends TRPCLoadEntries> = Flatten<
  {
    [TKey in keyof TEntries as WaitedKey<TEntries, TKey>]: DataOfValue<
      TEntries[TKey]
    >;
  } & {
    [TKey in keyof TEntries as MaybeWaitedKey<TEntries, TKey>]?: DataOfValue<
      TEntries[TKey]
    >;
  }
>;

export type ResultOfValue<TEntry> = TEntry extends AnyTRPCEntry
  ? TRPCEntryResult<DefOfEntry<TEntry>, DataOfEntry<TEntry>>
  : TEntry extends experimental_TRPCEntryFromData<infer TInner, any>
    ? TRPCEntryResult<DefOfEntry<TInner>, DataOfEntry<TInner>>
    : TEntry extends experimental_TRPCEntryPerItem<infer TInner, any>
      ? TRPCEntryResult<DefOfEntry<TInner>, DataOfEntry<TInner>>[]
      : TEntry extends TRPCLoadEntries
        ? ResultsOf<TEntry>
        : never;

export type ResultsOf<TEntries extends TRPCLoadEntries> = Flatten<
  {
    [TKey in keyof TEntries as WaitedKey<TEntries, TKey>]: ResultOfValue<
      TEntries[TKey]
    >;
  } & {
    [TKey in keyof TEntries as MaybeWaitedKey<TEntries, TKey>]?: ResultOfValue<
      TEntries[TKey]
    >;
  }
>;

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

export type HandleGetNextPageParam<TDef extends ResolverDef> =
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

/** A prefetch entry's arguments: its input can be `skipToken`, to start nothing */
export type PrefetchEntryArgs<TDef extends ResolverDef> =
  undefined extends TDef['input']
    ? [input?: TDef['input'] | typeof skipToken, opts?: TRPCEntryOptions]
    : [input: TDef['input'] | typeof skipToken, opts?: TRPCEntryOptions];

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
 * @see https://trpc.io/docs/client/tanstack-react-query/nested-queries#groups
 */
export type experimental_inferHandles<
  TEntries extends TRPCLoadEntries | ((...args: any[]) => TRPCLoadEntries),
> = HandlesOf<
  TEntries extends (...args: any[]) => infer TResult ? TResult : TEntries
>;

export type HandleType = 'query' | 'infinite';

/** What `experimental_dataOf()` takes: an entry, also one built from another's data */
export type DataEntry = AnyTRPCEntry | experimental_TRPCEntryFromData<any, any>;
