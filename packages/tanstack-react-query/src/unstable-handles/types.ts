import type {
  FetchQueryOptions,
  GetNextPageParamFunction,
  InfiniteData,
} from '@tanstack/react-query';
import type { skipToken } from '@tanstack/react-query';
import type {
  experimental_FromDataEntry,
  experimental_InfiniteQueryEntry,
  experimental_PerItemEntry,
  experimental_QueryEntry,
  experimental_QueryProcedure,
} from '@trpc/client';
import type { coerceAsyncIterableToArray } from '@trpc/server/unstable-core-do-not-import';
import type {
  DecorateInfiniteQueryProcedure,
  DecorateQueryProcedure,
} from '../internals/createOptionsProxy';
import type {
  DefaultFeatureFlags,
  ExtractCursorType,
  FeatureFlags,
  ResolverDef,
  TRPCQueryKeyWithPrefix,
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
 * Whether a handle's entry had `skipToken` for its input, and its input if not.
 * `skipped` tells them apart: a skipped handle has no input.
 */
type HandleInput<TInput> =
  | {
      /** The query's input. The key is absent when the input is `undefined`. */
      readonly input: TInput;
      readonly skipped?: undefined;
    }
  | {
      /** None: its entry's input was `skipToken` */
      readonly input?: undefined;
      /**
       * Only for an entry whose input is `skipToken`: its query is disabled,
       * and `fromHandle()` gives options with `skipToken`. Read it with
       * `useQuery`.
       */
      readonly skipped: true;
    };

/** What a query's handle has, whether it is skipped or not */
interface TRPCQueryHandleBase<TDef extends ResolverDef> {
  /**
   * Type-only: never present at runtime. Required, so only
   * `loadHandles` creates handles.
   */
  readonly [handleDef]: TDef & { kind: 'query' };
  readonly queryKey: HandleQueryKey<TDef, TDef['input'], 'query'>;
  /**
   * Only when an `experimental_perItem()` entry is loaded for the items of
   * a list in the data: what that entry loads for an item. When the query is
   * fetched again, it loads that for its items, in the same request.
   */
  readonly experimental_perItem?: readonly PerItemQueries[];
}

/**
 * A serializable reference to a query, from `loadHandles()`.
 * Pass it to a component and read it with `fromHandle(trpc, handle)`.
 * Its `input` is there unless `skipped` is: check `skipped` before reading it.
 */
export type TRPCQueryHandle<TDef extends ResolverDef = ResolverDef> =
  TRPCQueryHandleBase<TDef> & HandleInput<TDef['input']>;

/** What an infinite query's handle has, whether it is skipped or not */
interface TRPCInfiniteQueryHandleBase<TDef extends ResolverDef> {
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
  readonly initialCursor?: NonNullable<ExtractCursorType<TDef['input']>> | null;
  /**
   * Only when an `experimental_perItem()` entry is loaded for the items of
   * every page: what that entry loads for an item. A page that is fetched
   * later then loads it for its items, in the same request.
   */
  readonly experimental_perItem?: readonly PerItemQueries[];
}

/**
 * A serializable reference to an infinite query, from `loadHandles()`.
 * Read it with `fromHandle(trpc, handle, { getNextPageParam })`.
 * Its `input`, without `cursor` and `direction`, is there unless `skipped`
 * is, as on a query's handle.
 */
export type TRPCInfiniteQueryHandle<TDef extends ResolverDef = ResolverDef> =
  TRPCInfiniteQueryHandleBase<TDef> &
    HandleInput<InfiniteHandleInput<TDef['input']>>;

/**
 * What an `experimental_perItem()` entry loads for an item: the handle of
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
  /** Type-only: never present at runtime. What `experimental_dataOf()` reads */
  readonly '~entryData': coerceAsyncIterableToArray<TDef['output']>;
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
  /** Type-only: never present at runtime. What `experimental_dataOf()` reads */
  readonly '~entryData': LoadedInfiniteData<TDef>;
}

/** Any query or infinite query entry. */
export type AnyTRPCEntry =
  | TRPCQueryEntry<any, any>
  | TRPCInfiniteQueryEntry<any, any>;

/**
 * An entry to load for every item of a list in another entry's data, from
 * `experimental_perItem()`. Its handle is a `experimental_TRPCQueryHandlePerItem`.
 */
export type experimental_TRPCEntryPerItem<
  TEntry = AnyTRPCEntry,
  TItem = unknown,
> = experimental_PerItemEntry<TEntry, TItem>;

/**
 * An entry built from the data of another entry, from
 * `experimental_dataOf(entry, (data) => entry)`. The load doesn't wait for
 * that data. Its handle is unfinished: `experimental_handleOfItem(handle, data)`
 * finishes it in the component that has the data.
 */
export type experimental_TRPCEntryFromData<
  TEntry = AnyTRPCEntry,
  TData = unknown,
> = experimental_FromDataEntry<TEntry, TData>;

/**
 * A serializable reference to a query that needs an item to be finished:
 * `experimental_handleOfItem(handle, item)` gives the query's handle. From an
 * `experimental_perItem()` entry, where the item is an item of the list,
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
   * `experimental_perItem()` entry is loaded for: what that entry loads
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
   * `experimental_perItem()` entry is loaded for: what that entry loads
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
    | experimental_QueryEntry<any, any>
    | experimental_InfiniteQueryEntry<any, any>
    | typeof skipToken
    | null
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

/**
 * An infinite entry's data, as a load has it. A page without a cursor, such
 * as the first page of an entry with no first cursor, has `undefined` as its
 * page param, and one for a `null` cursor has `null`
 */
export type LoadedInfiniteData<TDef extends ResolverDef> = InfiniteData<
  TDef['output'],
  NonNullable<ExtractCursorType<TDef['input']>> | null | undefined
>;

/**
 * An entry's data, as its query has it: a procedure that yields has the list
 * that `queryOptions()` collects its values into
 */
export type DataOfEntry<TEntry> =
  TEntry extends TRPCQueryEntry<infer TDef, any>
    ? coerceAsyncIterableToArray<TDef['output']>
    : TEntry extends TRPCInfiniteQueryEntry<infer TDef, any>
      ? LoadedInfiniteData<TDef>
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

/**
 * A page param is `undefined` for a page without a cursor, such as the first
 * page of an entry with no first cursor, as in `LoadedInfiniteData`
 */
export type HandleGetNextPageParam<TDef extends ResolverDef> =
  GetNextPageParamFunction<
    NonNullable<ExtractCursorType<TDef['input']>> | null | undefined,
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
  /** The feature flags of the proxy that loads a description, such as `keyPrefix` */
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
> = HandlesOf<
  experimental_WithWait<
    TEntries extends (...args: any[]) => infer TResult ? TResult : TEntries,
    [],
    TFeatureFlags
  >
>;

export type HandleType = 'query' | 'infinite';

/**
 * The feature flags of an options proxy, read from its keys: a description
 * loaded with it has its key prefix
 */
export type FeatureFlagsOf<TProxy> = TProxy extends {
  pathKey: () => infer TKey;
}
  ? [TKey] extends [TRPCQueryKeyWithPrefix]
    ? { keyPrefix: true }
    : DefaultFeatureFlags
  : DefaultFeatureFlags;

/**
 * The `ResolverDef` of a procedure that a description's entry was built
 * with, loaded by a proxy with `TFeatureFlags`
 */
type DefOfProcedure<
  TProcedure,
  TFeatureFlags extends FeatureFlags,
> = TProcedure extends {
  '~types': {
    input: infer TInput;
    output: infer TOutput;
    errorShape: infer TErrorShape;
  };
}
  ? {
      input: TInput;
      output: TOutput;
      transformer: boolean;
      errorShape: TErrorShape;
      featureFlags: TFeatureFlags;
    }
  : TProcedure extends experimental_QueryProcedure<infer TInput, infer TOutput>
    ? {
        input: TInput;
        output: TOutput;
        transformer: boolean;
        errorShape: any;
        featureFlags: TFeatureFlags;
      }
    : never;

/** An entry as the load has it: one of a description is a prefetch entry, or an ensure entry if waited for */
type LoadedEntry<
  TEntry,
  TWaited extends boolean,
  TFeatureFlags extends FeatureFlags,
> =
  TEntry extends experimental_QueryEntry<infer TProcedure, any>
    ? TRPCQueryEntry<
        DefOfProcedure<TProcedure, TFeatureFlags>,
        TWaited extends true ? 'ensure' : 'prefetch'
      >
    : TEntry extends experimental_InfiniteQueryEntry<infer TProcedure, any>
      ? TRPCInfiniteQueryEntry<
          DefOfProcedure<TProcedure, TFeatureFlags>,
          TWaited extends true ? 'ensure' : 'prefetch'
        >
      : TEntry extends TRPCQueryEntry<infer TDef, infer TKind>
        ? TRPCQueryEntry<
            TDef,
            TWaited extends true
              ? TKind extends 'prefetch'
                ? 'ensure'
                : TKind
              : TKind
          >
        : TEntry extends TRPCInfiniteQueryEntry<infer TDef, infer TKind>
          ? TRPCInfiniteQueryEntry<
              TDef,
              TWaited extends true
                ? TKind extends 'prefetch'
                  ? 'ensure'
                  : TKind
                : TKind
            >
          : TEntry extends experimental_FromDataEntry<infer TInner, infer TData>
            ? experimental_FromDataEntry<
                LoadedEntry<TInner, TWaited, TFeatureFlags>,
                TData
              >
            : TEntry extends experimental_PerItemEntry<
                  infer TInner,
                  infer TItem
                >
              ? LoadedPerItem<TInner, TItem, TFeatureFlags>
              : TEntry extends typeof skipToken | null
                ? typeof skipToken
                : TEntry extends TRPCLoadEntries
                  ? experimental_WithWait<TEntry, [], TFeatureFlags>
                  : TEntry;

/**
 * An entry per item as the load has it: what the callback returned for an
 * item, as an entry per item of each entry in it, in a group of the same keys.
 * An entry built from the data of another loads with `experimental_load()`
 * only
 */
type LoadedPerItem<
  TReturn,
  TItem,
  TFeatureFlags extends FeatureFlags,
> = TReturn extends null
  ? typeof skipToken
  : TReturn extends experimental_FromDataEntry<any, any>
    ? never
    : TReturn extends
          | experimental_QueryEntry<any, any>
          | experimental_InfiniteQueryEntry<any, any>
          | AnyTRPCEntry
      ? experimental_PerItemEntry<
          LoadedEntry<TReturn, false, TFeatureFlags>,
          TItem
        >
      : {
          [TKey in keyof TReturn]: LoadedPerItem<
            TReturn[TKey],
            TItem,
            TFeatureFlags
          >;
        };

/** Whether a type is one string, not a union of them */
type IsOneKey<TKey, TAll = TKey> = TKey extends unknown
  ? [TAll] extends [TKey]
    ? true
    : false
  : never;

/**
 * The keys a fixed `wait` list has for sure: each place's that can be only
 * that key. A place of `'post' | 'author'` may be either
 */
type SureKeys<TWait extends readonly string[]> = {
  [TIndex in keyof TWait]: [IsOneKey<TWait[TIndex]>] extends [true]
    ? TWait[TIndex]
    : never;
}[number];

/**
 * Whether a `wait` list has a key: `true` if every list of its type has it,
 * and `boolean` if one may not, such as a list of any length or one with a
 * place that may be another key
 */
type WaitsFor<TWait extends readonly string[], TKey> = TWait extends unknown
  ? TKey extends TWait[number]
    ? number extends TWait['length']
      ? boolean
      : TKey extends SureKeys<TWait>
        ? true
        : boolean
    : false
  : never;

/**
 * An entry as the load has it, waited for or not. For `boolean`, either:
 * then its data may be there
 */
type LoadedAs<
  TEntry,
  TWaited extends boolean,
  TFeatureFlags extends FeatureFlags,
> = TWaited extends true
  ? LoadedEntry<TEntry, true, TFeatureFlags>
  : LoadedEntry<TEntry, false, TFeatureFlags>;

/**
 * A load's entries as TanStack Query entries: each entry of a description,
 * from `experimental_query()` and the like, is a prefetch entry, and the
 * entry of each key in the `wait` list an ensure entry. A description's
 * entry has the key prefix of the proxy that loads it, by its `TFeatureFlags`
 */
export type experimental_WithWait<
  TEntries,
  TWait extends readonly string[],
  TFeatureFlags extends FeatureFlags,
> = {
  [TKey in keyof TEntries]: LoadedAs<
    TEntries[TKey],
    WaitsFor<TWait, TKey>,
    TFeatureFlags
  >;
};

/** A key whose entry is of one query, which a load can wait for */
export type experimental_WaitableKey<TEntries> = {
  [TKey in keyof TEntries & string]: TEntries[TKey] extends
    | AnyTRPCEntry
    | experimental_QueryEntry<any, any>
    | experimental_InfiniteQueryEntry<any, any>
    | experimental_FromDataEntry<any, any>
    ? TKey
    : never;
}[keyof TEntries & string];

/**
 * The `wait` list of a load's options, as its type has it. Options whose
 * `wait` may be absent may wait for none of its keys: their data may be
 * there
 */
export type WaitOf<TOpts> = TOpts extends {
  wait: infer TWait extends readonly string[];
}
  ? TWait
  : TOpts extends { wait?: infer TWait }
    ? Extract<TWait, readonly string[]> | []
    : [];

/**
 * Options of `loadHandles()` and `loadHandlesSettled()`
 * @see https://trpc.io/docs/client/tanstack-react-query/nested-queries#wait
 */
export interface TRPCLoadOptions<
  TEntries,
  TWait extends readonly experimental_WaitableKey<TEntries>[],
> {
  /**
   * The keys of the entries to wait for, as if each were an ensure entry: the
   * load resolves once they have data, `data` has it, and an entry that reads
   * them with `experimental_dataOf()` gets a finished handle. A list whose
   * keys aren't known, such as one of any length, has its data as optional
   */
  wait?: TWait;
}
