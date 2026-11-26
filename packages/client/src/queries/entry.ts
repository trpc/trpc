import type {
  AnyProcedure,
  AnyRouter,
  inferProcedureInput,
  InferrableClientTypes,
  inferTransformedProcedureOutput,
  RouterRecord,
} from '@trpc/server/unstable-core-do-not-import';
import type { OperationContext } from '../links/types';
import type { EntryDataRef, EntryInputRef } from './dataRef';
import {
  createEntryDataRef,
  entryDataRefOf,
  onlyAsList,
  replaceEntryDataRefs,
} from './dataRef';
import { dataPath, itemPathOf } from './path';

/**
 * Describing queries, apart from loading them: `experimental_query()` and
 * the functions beside it build plain values that say what to load and what
 * each input reads of another query's data. `experimental_load()` loads them
 * with a client.
 */

export type QueryEntryType = 'query' | 'infinite';

/** @internal */
export const queryEntryState = Symbol('trpc.queryEntry');

/**
 * What a description says of a query: the shared part of an entry, under
 * `queryEntryState`. An entry of another package that has it there, such as
 * a `prefetchEntry()` of TanStack Query, can be read with
 * `experimental_dataOf()` and loaded anywhere: nothing else of it is read.
 * @internal
 */
export interface QueryEntryState {
  type: QueryEntryType;
  /** The procedure's path */
  path: string[];
  /** The input as it was given, with its `experimental_dataOf()` values in it */
  input: unknown;
  /**
   * The `experimental_dataOf()` values in the input that the query reads:
   * not an infinite query's `direction`, nor a `cursor` that `initialCursor`
   * takes the place of
   */
  refs: EntryInputRef[];
  /** The entry's own context, which a link may route by. `null` for none */
  context: OperationContext | null;
  /** Of an infinite query: its first page's cursor, if it has one */
  initialCursor: unknown;
  /** Of an infinite query: the cursor of the page after a page, if given */
  getNextPageParam: ((lastPage: any) => unknown) | null;
}

/** @internal */
export function queryEntryStateOf(value: unknown): QueryEntryState | null {
  return (
    (value as { [queryEntryState]?: QueryEntryState } | null)?.[
      queryEntryState
    ] ?? null
  );
}

/** @internal */
export const perItemState = Symbol('trpc.perItem');

/**
 * What `experimental_perItem()` returns
 * @internal
 */
export interface PerItemState {
  /**
   * What the callback returned, built with a stand-in for the item: an
   * entry, an entry per item, `null`, or an object of these
   */
  entry: object | null;
  /**
   * The list whose items it is loaded for. It is a list of lists, which are
   * flattened, for every `null` in its path
   */
  list: EntryDataRef;
}

/** @internal */
export function perItemStateOf(value: unknown): PerItemState | null {
  return (
    (value as { [perItemState]?: PerItemState } | null)?.[perItemState] ?? null
  );
}

/** @internal */
export const fromDataState = Symbol('trpc.fromData');

/**
 * What `experimental_dataOf(entry, (data) => entry)` returns
 * @internal
 */
export interface FromDataState {
  /** The entry the callback returned, built with a stand-in for the data */
  entry: object;
  /**
   * The entry whose data it is built from. TanStack Query's `loadHandles()`
   * doesn't wait for it, and gives an unfinished handle
   */
  source: object;
}

/** @internal */
export function fromDataStateOf(value: unknown): FromDataState | null {
  return (
    (value as { [fromDataState]?: FromDataState } | null)?.[fromDataState] ??
    null
  );
}

/**
 * The query entry of an entry, also of one built from another's data
 * @internal
 */
export function innerEntryOf(value: unknown): object | null {
  if (queryEntryStateOf(value)) {
    return value as object;
  }
  const fromData = fromDataStateOf(value);
  return fromData ? innerEntryOf(fromData.entry) : null;
}

/**
 * The context of an entry's options, if it has one of its own: one with a
 * key, symbol keys too, as a link may route by any of them
 * @internal
 */
export function ownContext(
  context: OperationContext | undefined,
): OperationContext | null {
  return context && Reflect.ownKeys(context).length > 0 ? context : null;
}

/**
 * Whether the loader sets what an `experimental_dataOf()` value goes to, so
 * the query never reads it: an infinite query's `direction`, or a `cursor`
 * that `initialCursor` takes the place of
 * @internal
 */
export function isReplaced(
  opts: { type: QueryEntryType; cursorFromOptions: boolean },
  ref: EntryInputRef,
) {
  return (
    opts.type === 'infinite' &&
    ((ref.to[0] === 'cursor' && opts.cursorFromOptions) ||
      ref.to[0] === 'direction')
  );
}

/**
 * The `experimental_dataOf()` values in an input, and the ones its query
 * reads. Throws for a value that can't be in an input
 * @internal
 */
export function readInputRefs(opts: {
  fn: string;
  type: QueryEntryType;
  input: unknown;
  cursorFromOptions: boolean;
}) {
  const all: EntryInputRef[] = [];
  replaceEntryDataRefs(opts.input, [], (ref) => all.push(ref));
  if (all.some((ref) => ref.shape === 'flat')) {
    throw new Error(
      `${onlyAsList}, not a value in the input of \`${opts.fn}()\`. To read a part of every item, use \`.map()\``,
    );
  }
  return {
    all,
    read: all.filter((ref) => !isReplaced(opts, ref)),
  };
}

/**
 * The path of a procedure of a tRPC client, or of the options proxy of
 * `@trpc/tanstack-react-query`. Both are proxies whose `toString()` names
 * the path, as `tRPC.proxy(post.byId)`: reading it costs a client nothing
 * @internal
 */
export function procedurePathOf(procedure: unknown, fn: string): string[] {
  const named =
    typeof procedure === 'function'
      ? /^tRPC\.proxy\((.+)\)$/.exec(String(procedure))
      : null;
  if (!named?.[1]) {
    throw new Error(
      `\`${fn}()\` expects a procedure of a tRPC client or of a tRPC options proxy, such as \`trpc.post.byId\`, got ${String(procedure)}`,
    );
  }
  return named[1].split('.');
}

declare const queryEntryDef: unique symbol;

/**
 * What a procedure is, as `experimental_query()` reads its types: one of a
 * tRPC client, which has `.query()`, or one of the options proxy of
 * `@trpc/tanstack-react-query`, which has `~types`
 *
 * Experimental: it may change in a minor release.
 */
export type experimental_QueryProcedure<TInput = any, TOutput = any> =
  | {
      query: (input: TInput, opts?: any) => Promise<TOutput>;
    }
  | {
      '~types': { input: TInput; output: TOutput };
    };

type InputOf<TProcedure> = TProcedure extends {
  '~types': { input: infer TInput };
}
  ? TInput
  : TProcedure extends { query: (input: infer TInput, ...args: any[]) => any }
    ? TInput
    : never;

type OutputOf<TProcedure> = TProcedure extends {
  '~types': { output: infer TOutput };
}
  ? TOutput
  : TProcedure extends {
        query: (...args: any[]) => Promise<infer TOutput>;
      }
    ? TOutput
    : never;

/**
 * A query, from `experimental_query()`. Creating it starts nothing.
 *
 * Experimental: it may change in a minor release.
 */
export interface experimental_QueryEntry<
  TProcedure = experimental_QueryProcedure,
  TData = unknown,
> {
  /** Type-only: never present at runtime */
  readonly [queryEntryDef]: {
    type: 'query';
    procedure: TProcedure;
    data: TData;
  };
}

/**
 * The data of an infinite query, as a load has it: its pages, and the cursor
 * of each. A load fetches the first page, whose cursor is `initialCursor`, or
 * the input's `cursor`: `undefined` without either, as TanStack Query has it.
 *
 * Experimental: it may change in a minor release.
 */
export interface experimental_InfiniteData<TPage, TCursor> {
  pages: TPage[];
  pageParams: TCursor[];
}

type CursorOf<TInput> = TInput extends { cursor?: infer TCursor }
  ? NonNullable<TCursor> | null
  : never;

/**
 * An infinite query, from `experimental_infiniteQuery()`. Creating it starts
 * nothing.
 *
 * Experimental: it may change in a minor release.
 */
export interface experimental_InfiniteQueryEntry<
  TProcedure = experimental_QueryProcedure,
  TData = unknown,
> {
  /** Type-only: never present at runtime */
  readonly [queryEntryDef]: {
    type: 'infinite';
    procedure: TProcedure;
    data: TData;
  };
}

/**
 * An entry for every item of a list, from `experimental_perItem()`
 *
 * Experimental: it may change in a minor release.
 */
export interface experimental_PerItemEntry<TEntry = unknown, TItem = unknown> {
  /** Type-only: never present at runtime */
  readonly [queryEntryDef]: { type: 'perItem'; entry: TEntry; item: TItem };
}

/**
 * An entry built from another entry's data, from
 * `experimental_dataOf(entry, (data) => entry)`. TanStack Query's
 * `loadHandles()` doesn't wait for that data; `experimental_load()` loads it
 * as it loads the entry the callback returns.
 *
 * Experimental: it may change in a minor release.
 */
export interface experimental_FromDataEntry<TEntry = unknown, TData = unknown> {
  /** Type-only: never present at runtime */
  readonly [queryEntryDef]: { type: 'fromData'; entry: TEntry; data: TData };
}

/**
 * Any entry `experimental_dataOf()` can read: one from this package, or one
 * of another package that has its data in its type, as TanStack Query's do
 *
 * Experimental: it may change in a minor release.
 */
export type experimental_DataEntry<TData = any> =
  | QueryDataEntry<TData>
  | experimental_FromDataEntry<QueryDataEntry<TData>, any>;

/** An entry of one query whose data is `TData`, of this package or another */
type QueryDataEntry<TData> =
  | { readonly [queryEntryDef]: { type: 'query' | 'infinite'; data: TData } }
  | { readonly '~entryData': TData };

/**
 * An entry's data, as an `experimental_dataOf()` value has it
 *
 * Experimental: it may change in a minor release.
 */
export type experimental_DataOfEntry<TEntry> = TEntry extends {
  readonly [queryEntryDef]: { type: 'query' | 'infinite'; data: infer TData };
}
  ? TData
  : TEntry extends experimental_FromDataEntry<infer TInner, any>
    ? experimental_DataOfEntry<TInner>
    : TEntry extends { readonly '~entryData': infer TData }
      ? TData
      : never;

type QueryArgs<TProcedure, TOpts> =
  undefined extends InputOf<TProcedure>
    ? [input?: InputOf<TProcedure>, opts?: TOpts]
    : [input: InputOf<TProcedure>, opts?: TOpts];

/**
 * Options of an entry
 *
 * Experimental: it may change in a minor release.
 */
export interface experimental_QueryEntryOptions {
  /**
   * The context of the query's operation. An entry with a context of its
   * own isn't pipelined, as a link may route by it: no other query goes in
   * its request as a call, nor it in another's, and what it reads of another
   * entry is filled in before it is sent. A batch link still batches it with
   * other queries, as it does any query
   */
  context?: OperationContext;
}

/**
 * Options of an infinite entry
 *
 * Experimental: it may change in a minor release.
 */
export interface experimental_InfiniteQueryEntryOptions<
  TCursor,
  TPage,
> extends experimental_QueryEntryOptions {
  /** The first page's cursor. Without it, the input's `cursor` is */
  initialCursor?: TCursor;
  /**
   * The cursor of the page after `lastPage`. A load fetches the first page
   * only; TanStack Query uses it to fetch the next
   */
  getNextPageParam?: (lastPage: TPage) => TCursor | null | undefined;
}

/**
 * A copy of an input as it is now, with its `experimental_dataOf()` values
 * in it: a later change to the object doesn't change the query, and a getter
 * in it runs once. Inputs are plain objects, arrays and primitives. `within`
 * has the objects and arrays it is in: one in itself is a cycle, which the
 * engine can't walk, so it throws
 */
function copyInput(value: unknown, within: readonly object[]): unknown {
  if (entryDataRefOf(value) || typeof value !== 'object' || value === null) {
    return value;
  }
  if (within.includes(value)) {
    throw new TypeError(
      "An entry's input has a cycle: an object or an array is inside itself. Pass one without, or query it without `experimental_load()`",
    );
  }
  const inside = [...within, value];
  if (Array.isArray(value)) {
    // Each hole stays one
    const copy = new Array<unknown>(value.length);
    value.forEach((item, index) => {
      copy[index] = copyInput(item, inside);
    });
    return copy;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto === Object.prototype || proto === null) {
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      // As an own key, also `__proto__`
      Object.defineProperty(copy, key, {
        value: copyInput((value as Record<string, unknown>)[key], inside),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return copy;
  }
  return value;
}

function queryEntry(opts: {
  fn: string;
  type: QueryEntryType;
  procedure: unknown;
  input: unknown;
  context: OperationContext | undefined;
  initialCursor: unknown;
  getNextPageParam: ((lastPage: any) => unknown) | null;
}) {
  const path = procedurePathOf(opts.procedure, opts.fn);
  const input = copyInput(opts.input, []);
  const cursorFromOptions =
    opts.type === 'infinite' && opts.initialCursor != null;
  const refs = readInputRefs({
    fn: opts.fn,
    type: opts.type,
    input,
    cursorFromOptions,
  });
  const state: QueryEntryState = {
    type: opts.type,
    path,
    input,
    refs: refs.read,
    context: ownContext(opts.context),
    initialCursor: opts.initialCursor,
    getNextPageParam: opts.getNextPageParam,
  };
  return { [queryEntryState]: state };
}

/**
 * A query to load. Its input, or any value inside it, can be data of another
 * entry, from `experimental_dataOf()`. Creating it starts nothing: load it
 * with `experimental_load()`.
 *
 * Experimental: it may change in a minor release.
 * @see https://trpc.io/docs/client/vanilla/nested-queries
 * @example
 * ```ts
 * const post = experimental_query(trpc.post.bySlug, { slug });
 * const author = experimental_query(trpc.author.byId, {
 *   id: experimental_dataOf(post).authorId,
 * });
 * const res = experimental_load(client, { post, author });
 * ```
 */
export function experimental_query<
  TProcedure extends experimental_QueryProcedure,
>(
  procedure: TProcedure,
  ...args: QueryArgs<TProcedure, experimental_QueryEntryOptions>
): experimental_QueryEntry<TProcedure, OutputOf<TProcedure>>;
export function experimental_query(
  procedure: unknown,
  input?: unknown,
  opts?: experimental_QueryEntryOptions,
): unknown {
  return queryEntry({
    fn: 'experimental_query',
    type: 'query',
    procedure,
    input,
    context: opts?.context,
    initialCursor: undefined,
    getNextPageParam: null,
  });
}

/**
 * An infinite query to load: a procedure whose input has a `cursor`. A load
 * fetches its first page; its data has `pages` and `pageParams`, as TanStack
 * Query's infinite queries do.
 *
 * Experimental: it may change in a minor release.
 * @see https://trpc.io/docs/client/vanilla/nested-queries#infinite
 */
export function experimental_infiniteQuery<
  TProcedure extends experimental_QueryProcedure<{ cursor?: any }, any>,
>(
  procedure: TProcedure,
  input: InputOf<TProcedure>,
  opts?: experimental_InfiniteQueryEntryOptions<
    CursorOf<InputOf<TProcedure>>,
    OutputOf<TProcedure>
  >,
): experimental_InfiniteQueryEntry<
  TProcedure,
  experimental_InfiniteData<
    OutputOf<TProcedure>,
    CursorOf<InputOf<TProcedure>> | undefined
  >
> {
  return queryEntry({
    fn: 'experimental_infiniteQuery',
    type: 'infinite',
    procedure,
    input,
    context: opts?.context,
    initialCursor: opts?.initialCursor,
    getNextPageParam: opts?.getNextPageParam ?? null,
  }) as any;
}

/**
 * The data of another entry, to build an entry's input from. Use it, or
 * anything in it, as an input or as a value inside one.
 *
 * It holds no data when you call it: it records which part of the data you
 * read, and the load fills that in once the entry it comes from has data. So
 * don't compute with it or branch on it. To read a part of every item of an
 * array, use `.map()`: `experimental_dataOf(posts).map((post) => post.id)`.
 *
 * With a callback, it gives an entry built from the data:
 * `experimental_dataOf(post, (post) => entry)`. The callback runs once, on a
 * stand-in for the data. TanStack Query's `loadHandles()` doesn't wait for
 * the data for it, and gives an unfinished handle; `experimental_load()`
 * loads it as it loads the entry the callback returns.
 *
 * Experimental: it may change in a minor release.
 * @see https://trpc.io/docs/client/vanilla/nested-queries
 */
export function experimental_dataOf<TEntry extends experimental_DataEntry>(
  entry: TEntry,
): experimental_DataOfEntry<TEntry>;
export function experimental_dataOf<
  TEntry extends experimental_DataEntry,
  // A query's entry: not one `experimental_dataOf()` built with a callback
  TInner extends QueryDataEntry<any>,
>(
  entry: TEntry,
  entryFrom: (data: experimental_DataOfEntry<TEntry>) => TInner,
): experimental_FromDataEntry<TInner, experimental_DataOfEntry<TEntry>>;
export function experimental_dataOf(
  entry: unknown,
  entryFrom?: (data: any) => unknown,
): unknown {
  if (!innerEntryOf(entry)) {
    throw new Error(
      `\`experimental_dataOf()\` expects an entry, such as one from \`experimental_query()\`, got ${JSON.stringify(entry)}`,
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
  if (!queryEntryStateOf(returned)) {
    throw new Error(
      `The callback of \`experimental_dataOf()\` must return a query's entry, such as one from \`experimental_query()\`, got ${JSON.stringify(returned)}`,
    );
  }
  const state: FromDataState = { entry: returned as object, source };
  return { [fromDataState]: state };
}

/**
 * What `experimental_perItem()`'s callback returns for an item: an entry, an
 * entry per item of a list in it, an object of these, or `null` to skip
 *
 * Experimental: it may change in a minor release.
 */
export type experimental_ItemEntries =
  | experimental_DataEntry
  | experimental_PerItemEntry<any, any>
  | null
  | { [key: string]: experimental_ItemEntries };

/** Whether a value is what `experimental_perItem()`'s callback can return */
function isItemEntries(value: unknown): boolean {
  if (value === null || perItemStateOf(value)) {
    return true;
  }
  const inner = innerEntryOf(value);
  if (inner) {
    return true;
  }
  if (typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return (
    (proto === Object.prototype || proto === null) &&
    Object.values(value).every(isItemEntries)
  );
}

/**
 * What to load for every item of a list in another entry's data. The
 * callback runs once, on a stand-in for every item, and returns an entry, or
 * an object of entries: entries that read each other, and entries per item
 * of a list in the item, nest.
 *
 * The list is an `experimental_dataOf()` value. Its items are its elements,
 * or, for a list from `.map()`, the values the callback returned. For the
 * items of every list in a list, use `.flatMap()`:
 * `experimental_dataOf(posts).pages.flatMap((page) => page.items)`.
 *
 * Experimental: it may change in a minor release.
 * @see https://trpc.io/docs/client/vanilla/nested-queries#per-item
 * @example
 * ```ts
 * experimental_perItem(experimental_dataOf(posts).items, (post) => {
 *   const author = experimental_query(trpc.author.byId, { id: post.authorId });
 *   return {
 *     author,
 *     team: experimental_query(trpc.team.byId, {
 *       id: experimental_dataOf(author).teamId,
 *     }),
 *   };
 * });
 * ```
 */
export function experimental_perItem<
  TItem,
  TReturn extends experimental_ItemEntries,
>(
  items: readonly TItem[],
  entries: (item: TItem) => TReturn,
): experimental_PerItemEntry<TReturn, TItem> {
  const list = entryDataRefOf(items);
  if (!list) {
    throw new Error(
      `\`experimental_perItem()\` expects a list from \`experimental_dataOf()\`, such as \`experimental_dataOf(posts).items\`, got ${JSON.stringify(items)}`,
    );
  }
  const returned = entries(
    createEntryDataRef({
      entry: list.entry,
      path: dataPath(itemPathOf(list)),
      itemOf: list,
      shape: 'value',
    }) as TItem,
  );
  if (!isItemEntries(returned)) {
    throw new Error(
      `The callback of \`experimental_perItem()\` must return an entry, such as one from \`experimental_query()\`, or an object of entries, got ${JSON.stringify(returned)}`,
    );
  }
  const state: PerItemState = { entry: returned as object, list };
  return { [perItemState]: state } as any;
}

type QueryProcedureRecord<
  TRoot extends InferrableClientTypes,
  TRecord extends RouterRecord,
> = {
  [
    K in keyof TRecord as TRecord[K] extends AnyProcedure
      ? TRecord[K]['_def']['type'] extends 'query'
        ? K
        : never
      : K
  ]: TRecord[K] extends AnyProcedure
    ? experimental_QueryProcedure<
        inferProcedureInput<TRecord[K]>,
        inferTransformedProcedureOutput<TRoot, TRecord[K]>
      >
    : TRecord[K] extends RouterRecord
      ? QueryProcedureRecord<TRoot, TRecord[K]>
      : never;
};

/**
 * The query procedures of a router, as a description of queries takes them:
 * a tRPC client and an options proxy of `@trpc/tanstack-react-query` are both
 * one, so the same description loads with either.
 *
 * Experimental: it may change in a minor release.
 * @example
 * ```ts
 * function postQueries(trpc: experimental_QueryProcedures<AppRouter>, slug: string) {
 *   return { post: experimental_query(trpc.post.bySlug, { slug }) };
 * }
 * ```
 */
export type experimental_QueryProcedures<TRouter extends AnyRouter> =
  QueryProcedureRecord<
    {
      transformer: TRouter['_def']['_config']['$types']['transformer'];
      errorShape: TRouter['_def']['_config']['$types']['errorShape'];
    },
    TRouter['_def']['record']
  >;
