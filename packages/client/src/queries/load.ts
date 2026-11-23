import type {
  AnyRouter,
  PipelineCallReads,
  PipelinePath,
} from '@trpc/server/unstable-core-do-not-import';
import { hasOwn, isObject } from '@trpc/server/unstable-core-do-not-import';
import type { TRPCClient } from '../createTRPCClient';
import { getUntypedClient } from '../createTRPCClient';
import type { TRPCRequestOptions } from '../internals/TRPCUntypedClient';
import type { TRPCProcedureOptions } from '../internals/types';
import type {
  Outcome,
  PipelinedData,
  PipelinedRun,
  PipelineSource,
  Settles,
} from '../links/internals/pipeline';
import {
  createOperationPipeline,
  failed,
  isUnread,
  outcomeOf,
  pipeCall,
  pipelineContext,
  readPipelinedRun,
  settles,
} from '../links/internals/pipeline';
import type { OperationContext } from '../links/types';
import type { EntryDataRef } from './dataRef';
import { entryDataRefOf } from './dataRef';
import type {
  experimental_DataEntry,
  experimental_DataOfEntry,
  experimental_PerItemEntry,
  PerItemState,
  QueryEntryState,
  QueryEntryType,
} from './entry';
import { innerEntryOf, perItemStateOf, queryEntryStateOf } from './entry';
import { itemPathOf } from './path';

/**
 * `experimental_load()` sends the queries of a description. What an input
 * reads of another query's data becomes a read in a pipelined batch, and the
 * server fills it in. What a link can't pipeline, a query asks for by itself,
 * once the data it reads is there.
 */

/**
 * What `experimental_load()` takes: entries by key, or groups of them
 *
 * Experimental: it may change in a minor release.
 */
export interface experimental_LoadEntries {
  [key: string]:
    | experimental_DataEntry
    | experimental_PerItemEntry<any, any>
    | experimental_LoadEntries;
}

/**
 * What `experimental_load()` returns: a promise for every entry, by its key,
 * that settles when its query is done. An entry per item has a promise of
 * its items' promises: it resolves when the list is there, and each item
 * settles by itself.
 *
 * Experimental: it may change in a minor release.
 */
export type experimental_Loaded<TEntries> = {
  [K in keyof TEntries]: TEntries[K] extends experimental_PerItemEntry<
    infer TEntry,
    any
  >
    ? Promise<Promise<experimental_DataOfEntry<TEntry>>[]>
    : TEntries[K] extends experimental_DataEntry
      ? Promise<experimental_DataOfEntry<TEntries[K]>>
      : experimental_Loaded<TEntries[K]>;
};

/**
 * What `experimental_load()` returns, with every promise awaited
 *
 * Experimental: it may change in a minor release.
 */
export type experimental_Settled<TLoaded> =
  TLoaded extends Promise<infer TValue>
    ? experimental_Settled<TValue>
    : TLoaded extends readonly Promise<unknown>[]
      ? { [K in keyof TLoaded]: experimental_Settled<TLoaded[K]> }
      : TLoaded extends Record<string, unknown>
        ? { [K in keyof TLoaded]: experimental_Settled<TLoaded[K]> }
        : TLoaded;

/** A list's item, in a path: the item a run is for */
interface Scope {
  list: Ref;
}
/** Every item of a list, in a path: what `.map()` reads */
const every = { every: true } as const;
type Every = typeof every;
type Segment = string | Scope | Every;

/** Where a value is: the data of a call, and the keys to it */
interface Ref {
  call: Call;
  path: Segment[];
}

/** A value of an input that is read of another call, and where it goes */
interface Hole {
  /** `null` in an array: the server can't write there */
  to: string[] | null;
  ref: Ref;
}

interface Call {
  type: QueryEntryType;
  path: string;
  /** With a stand-in for each value it reads */
  input: unknown;
  /** With `undefined` for each stand-in, for the server to fill in */
  blanked: unknown;
  holes: Hole[];
  /** The lists it runs for, outer first: it runs once for each item */
  scopes: Scope[];
  /** Its own context, which a link may route by: then it goes alone */
  context: OperationContext | null;
  /** Of an infinite query: the cursor of its first page */
  firstCursor: unknown;
  /**
   * What gets every run's data in a request that is already there: its own
   * operation, or a call the server makes in another's request. `null` if
   * each run makes a request of its own
   */
  source: PipelineSource | null;
  /** The lists of `source`'s runs */
  frame: Scope[];
  /** The request of a call that reads nothing */
  sent: Settles<Outcome<unknown>> | null;
  /** What the inputs of other calls read of its data */
  reads: Segment[][];
  /** The lists in its data that an entry per item runs for */
  lists: Segment[][];
  /** The outcome of each run, by its indexes */
  runs: Map<string, Settles<Outcome<Run>>>;
}

/**
 * A run's data as it arrived: the one place data enters, and all that is read
 * of it. A change the caller makes to the data changes neither what an input
 * reads nor which item a run is for.
 */
interface Run {
  /** As the caller gets it, and can change it */
  data: unknown;
  /** A copy of what other calls' inputs read */
  read: unknown;
  /**
   * The items of each list an entry per item runs for, by where the list is:
   * see `listKey()`. The items are the caller's
   */
  lists: ReadonlyMap<string, readonly unknown[]>;
}

/** The indexes of the items a run is for, by list */
type Items = Map<Scope, number>;

/** What a stand-in in a call's input reads */
const standIns = /* @__PURE__ */ new WeakMap<object, Ref>();
/** What `experimental_settle()` awaits the items of */
const itemLists = /* @__PURE__ */ new WeakSet<object>();
const warned = /* @__PURE__ */ new WeakSet<object>();

/**
 * Written so that a bundler replaces `process.env.NODE_ENV`, and the warning
 * goes from a production build. Without `process`, it isn't development
 */
function isDev() {
  try {
    return (process.env as { NODE_ENV?: string }).NODE_ENV !== 'production';
  } catch {
    return false;
  }
}

function nothing() {
  // For a promise that nothing may read
}

function standInOf(value: unknown) {
  return isObject(value) ? (standIns.get(value) ?? null) : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isScope(segment: Segment): segment is Scope {
  return typeof segment !== 'string' && segment !== every;
}

function sameScopes(a: readonly Scope[], b: readonly Scope[]) {
  return a.length === b.length && a.every((scope, index) => scope === b[index]);
}

/** A path as the server reads it, with a `null` for each list's items */
function wirePath(path: readonly Segment[]): PipelinePath {
  return path.map((segment) => (typeof segment === 'string' ? segment : null));
}

/**
 * A path in a call's data as a path in the result of its request: the data
 * of a query, or the first page of an infinite query. `null` for what isn't
 * in that result
 */
function requestPath(call: Call, path: readonly Segment[]) {
  if (call.type === 'query') {
    return wirePath(path);
  }
  return path[0] === 'pages' && path[1] === '0'
    ? wirePath(path.slice(2))
    : null;
}

/** Sets a key as an own property, also one named `__proto__` */
function setOwn(record: Record<string, unknown>, key: string, value: unknown) {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/**
 * A copy of data, also of the plain objects, arrays, Dates, Maps and Sets in
 * it, as a transformer can carry them. `copies` has the copy of each object
 * copied so far, so a cycle, or an object in two places, is one copy, as a
 * transformer that keeps them gives them
 */
function copyData(value: unknown, copies: Map<object, unknown>): unknown {
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  if (copies.has(value)) {
    return copies.get(value);
  }
  if (Array.isArray(value)) {
    // Each hole stays one
    const copy = new Array<unknown>(value.length);
    copies.set(value, copy);
    value.forEach((item, index) => {
      copy[index] = copyData(item, copies);
    });
    return copy;
  }
  if (value instanceof Map) {
    const copy = new Map<unknown, unknown>();
    copies.set(value, copy);
    for (const [key, item] of Array.from(Map.prototype.entries.call(value))) {
      copy.set(copyData(key, copies), copyData(item, copies));
    }
    return copy;
  }
  if (value instanceof Set) {
    const copy = new Set<unknown>();
    copies.set(value, copy);
    for (const item of Array.from(Set.prototype.values.call(value))) {
      copy.add(copyData(item, copies));
    }
    return copy;
  }
  if (isPlainObject(value)) {
    const copy: Record<string, unknown> = {};
    copies.set(value, copy);
    for (const key of Object.keys(value)) {
      setOwn(copy, key, copyData(value[key], copies));
    }
    return copy;
  }
  if (value instanceof Date) {
    const copy = new Date(Date.prototype.getTime.call(value));
    copies.set(value, copy);
    return copy;
  }
  return value;
}

/**
 * A copy of what `paths` read of data, and nothing else: a later change to
 * the data doesn't change what a query that asks by itself sends
 */
function copyReads(value: unknown, paths: readonly Segment[][]): unknown {
  if (paths.some((path) => path.length === 0)) {
    return copyData(value, new Map());
  }
  if (paths.length === 0 || typeof value !== 'object' || value === null) {
    return value;
  }
  const array = Array.isArray(value);
  const byKey = new Map<string, Segment[][]>();
  for (const [segment, ...rest] of paths) {
    const keys =
      segment === undefined
        ? []
        : typeof segment === 'string'
          ? [segment]
          : array
            ? Array.from(value.keys(), String)
            : [];
    for (const key of keys) {
      if (hasOwn(value, key)) {
        byKey.set(key, [...(byKey.get(key) ?? []), rest]);
      }
    }
  }
  // Read as `valueOf()` reads it: own keys, and each item by its index
  const copy: Record<string, unknown> = array
    ? (new Array(value.length) as unknown as Record<string, unknown>)
    : {};
  for (const [key, rest] of byKey) {
    if (!(array && key === 'length')) {
      setOwn(
        copy,
        key,
        copyReads((value as Record<string, unknown>)[key], rest),
      );
    }
  }
  return copy;
}

/** Where a list is in a run's data: its keys, and the index of each item */
function listKey(at: readonly (string | number)[]) {
  return JSON.stringify(at);
}

/**
 * The items of every list at the places `paths` take as lists, each as it is
 * now, into `lists`. `at` is where `value` is
 */
function recordLists(opts: {
  value: unknown;
  paths: readonly Segment[][];
  at: readonly (string | number)[];
  lists: Map<string, readonly unknown[]>;
}) {
  const { value, at } = opts;
  for (const [segment, ...rest] of opts.paths) {
    if (segment === undefined) {
      if (Array.isArray(value)) {
        opts.lists.set(listKey(at), [...value]);
      }
    } else if (typeof segment === 'string') {
      if (hasOwn(value, segment)) {
        recordLists({
          ...opts,
          value: (value as Record<string, unknown>)[segment],
          paths: [rest],
          at: [...at, segment],
        });
      }
    } else if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        recordLists({
          ...opts,
          value: item,
          paths: [rest],
          at: [...at, index],
        });
      }
    }
  }
}

/** A run's data as it arrives, before the caller can change it */
function snapshotOf(call: Call, data: unknown): Run {
  const lists = new Map<string, readonly unknown[]>();
  recordLists({ value: data, paths: call.lists, at: [], lists });
  return { data, read: copyReads(data, call.reads), lists };
}

/** What `path` leads to in `value`, with every item of a list for `every` */
function readEvery(value: unknown, path: readonly Segment[]): unknown {
  const at = path.indexOf(every);
  if (at === -1) {
    let read = value;
    for (const segment of path) {
      read = hasOwn(read, segment as string)
        ? (read as Record<string, unknown>)[segment as string]
        : undefined;
    }
    return read;
  }
  const list = readEvery(value, path.slice(0, at));
  return Array.isArray(list)
    ? Array.from(list, (item) => readEvery(item, path.slice(at + 1)))
    : undefined;
}

/**
 * What `path` leads to in a run, through the items of its lists as they
 * arrived: `read` for what an input reads, `data` for what the caller gets.
 * `list` has the items of what it leads to, if that is a list
 */
function walk(opts: {
  run: Run;
  path: readonly Segment[];
  items: Items;
  as: 'data' | 'read';
}) {
  let value = opts.run[opts.as];
  const at: (string | number)[] = [];
  for (const [index, segment] of opts.path.entries()) {
    if (segment === every) {
      return { value: readEvery(value, opts.path.slice(index)), list: [] };
    }
    let key: string | number;
    if (isScope(segment)) {
      // What an input reads is a copy as it arrived already, items and all
      if (opts.as === 'data') {
        value = opts.run.lists.get(listKey(at)) ?? value;
      }
      key = opts.items.get(segment) ?? -1;
    } else {
      key = segment as string;
    }
    at.push(key);
    value = hasOwn(value, String(key))
      ? (value as Record<string, unknown>)[key]
      : undefined;
  }
  return {
    value,
    list:
      opts.run.lists.get(listKey(at)) ?? (Array.isArray(value) ? value : []),
  };
}

/**
 * The public end of an outcome: a promise that rejects if its unit failed.
 * Nothing inside awaits one
 */
function rejecting<TData>(outcome: Settles<Outcome<TData>>): Promise<TData> {
  return outcome.then((it) => (it.ok ? it.data : Promise.reject(it.error)));
}

/**
 * The data of every outcome, or the first failure as it arrives: a failure
 * doesn't wait for the others
 */
function allOk<TData>(
  outcomes: readonly Settles<Outcome<TData>>[],
): Settles<Outcome<TData[]>> {
  return settles(
    () =>
      new Promise<Outcome<TData[]>>((resolve) => {
        const data: TData[] = [];
        let left = outcomes.length;
        if (left === 0) {
          resolve({ ok: true, data });
        }
        for (const [index, outcome] of outcomes.entries()) {
          void outcome.then((it) => {
            if (!it.ok) {
              resolve(it);
              return;
            }
            data[index] = it.data;
            left--;
            if (left === 0) {
              resolve({ ok: true, data });
            }
          });
        }
      }),
    failed,
  );
}

/** Whether one of the checks is `true`, as soon as one is */
function anyTrue(checks: readonly Settles<boolean>[]): Promise<boolean> {
  return new Promise((resolve) => {
    let left = checks.length;
    if (left === 0) {
      resolve(false);
    }
    for (const check of checks) {
      void check.then((it) => {
        left--;
        if (it || left === 0) {
          resolve(it);
        }
      });
    }
  });
}

/**
 * Whether a value that isn't a plain object, an array or a Date has a
 * stand-in or an `experimental_dataOf()` value in it. `seen` keeps a cycle from looping
 */
function hasStandIn(value: unknown, seen: WeakSet<object>): boolean {
  if (standInOf(value) || entryDataRefOf(value)) {
    return true;
  }
  // A typed array or `DataView` holds bytes only
  if (
    typeof value !== 'object' ||
    value === null ||
    ArrayBuffer.isView(value) ||
    seen.has(value)
  ) {
    return false;
  }
  seen.add(value);
  const values =
    value instanceof Map
      ? [...value.keys(), ...value.values()]
      : value instanceof Set
        ? [...value]
        : Object.values(value);
  return values.some((it) => hasStandIn(it, seen));
}

/**
 * A copy of an input, with each value read of another call in it replaced by
 * what `onRead` gives. `to` is where a value is in the input: `null` in an
 * array, where the server can't write. `copies` has the copy of each `Map`
 * and `Set` copied in this pass: one in two places of the input is one copy,
 * as a transformer that keeps references carries it
 */
function mapInput(opts: {
  value: unknown;
  to: string[] | null;
  onRead: (read: Ref | EntryDataRef, to: string[] | null) => unknown;
  copies: Map<object, unknown>;
}): unknown {
  const { value, to } = opts;
  const read = standInOf(value) ?? entryDataRefOf(value);
  if (read) {
    return opts.onRead(read, to);
  }
  if (Array.isArray(value)) {
    return value.map((item) => mapInput({ ...opts, value: item, to: null }));
  }
  if (isPlainObject(value)) {
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      setOwn(
        copy,
        key,
        mapInput({ ...opts, value: value[key], to: to && [...to, key] }),
      );
    }
    return copy;
  }
  if (value instanceof Date) {
    // The time it holds, as `structuredClone()` reads it, not an override
    return new Date(Date.prototype.getTime.call(value));
  }
  // Sent as it is, with nothing filled in
  if (isObject(value) && hasStandIn(value, new WeakSet())) {
    throw new TypeError(
      'experimental_load(): an input can have `experimental_dataOf()` values in plain objects, arrays and Dates, not in an instance of a class',
    );
  }
  // A Map or a Set, as a transformer carries them, is read as it is now, as
  // a plain object is. An instance of another class is sent as it is
  if (isObject(value)) {
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto === Map.prototype || proto === Set.prototype) {
      return copyData(value, opts.copies);
    }
  }
  return value;
}

/**
 * The input of an infinite query's first page, as TanStack Query's
 * `infiniteQueryOptions()` sends it: without `direction` from the input, and
 * with `initialCursor` in place of the input's `cursor`
 */
function firstPageInput(input: unknown, initialCursor: unknown) {
  if (!isPlainObject(input)) {
    return input;
  }
  const { cursor: inputCursor, direction: _direction, ...rest } = input;
  const cursor = initialCursor ?? inputCursor;
  return {
    ...rest,
    ...(cursor !== undefined ? { cursor } : {}),
    direction: 'forward',
  };
}

/**
 * The entries of a description, and the key of each, with the entries of a
 * group under its key
 */
function readLeaves(
  entries: Record<string, unknown>,
  at: string[],
): { group: string[]; key: string; entry: object }[] {
  if (!isPlainObject(entries)) {
    throw new TypeError(
      `experimental_load(): expects an object of entries, got ${String(entries)}`,
    );
  }
  return Object.keys(entries).flatMap((key) => {
    const value = entries[key];
    if (innerEntryOf(value) || perItemStateOf(value)) {
      return [{ group: at, key, entry: value as object }];
    }
    if (isPlainObject(value)) {
      return readLeaves(value, [...at, key]);
    }
    throw new TypeError(
      `experimental_load(): "${[...at, key].join('.')}" is no entry, such as one from \`experimental_query()\`, nor a group of them`,
    );
  });
}

/**
 * Loads the entries of a description, as one request where the link
 * pipelines. Returns at once, with a promise for every entry, by its key,
 * that settles when its query is done and rejects by itself if it fails. An
 * entry per item has a promise of its items' promises.
 *
 * An entry that another one reads with `experimental_dataOf()` is loaded
 * also when it isn't in `entries`.
 *
 * Experimental: it may change in a minor release.
 * @see https://trpc.io/docs/client/vanilla/nested-queries
 *
 * @example
 * ```ts
 * const post = experimental_query(client.post.bySlug, { slug });
 * const res = experimental_load(client, {
 *   post,
 *   author: experimental_query(client.author.byId, {
 *     id: experimental_dataOf(post).authorId,
 *   }),
 * });
 * const author = await res.author;
 * ```
 */
export function experimental_load<
  TRouter extends AnyRouter,
  TEntries extends experimental_LoadEntries,
>(
  client: TRPCClient<TRouter>,
  entries: TEntries,
  opts?: TRPCProcedureOptions,
): experimental_Loaded<TEntries> {
  const untyped = getUntypedClient(client);
  const request = (call: Call, pipeline: TRPCRequestOptions['context']) => ({
    signal: opts?.signal,
    context: { ...opts?.context, ...call.context, ...pipeline },
  });
  const calls: Call[] = [];
  const callOfEntry = new Map<object, Call>();
  /** The lists of an entry per item, one for each level of lists */
  const scopesOfList = new Map<EntryDataRef, Scope[]>();

  /**
   * A path in an entry's data, as the engine reads it. Of an infinite query,
   * which loads its first page, every page is that page
   */
  function segmentsOf(call: Call, path: PipelinePath): (string | null)[] {
    const segments = [...path];
    if (
      call.type === 'infinite' &&
      segments[0] === 'pages' &&
      segments.length > 1
    ) {
      segments[1] ??= '0';
    }
    return segments;
  }

  /** The scopes of the list of an entry per item */
  function scopesOf(list: EntryDataRef): Scope[] {
    let scopes = scopesOfList.get(list);
    if (scopes) {
      return scopes;
    }
    if (list.itemOf !== null) {
      throw new TypeError(
        'experimental_load(): the list of `experimental_perItem()` is read of the data of an entry, not of an item',
      );
    }
    const call = callFor(list.entry);
    const created: Scope[] = [];
    const path: Segment[] = [];
    for (const segment of segmentsOf(call, itemPathOf(list))) {
      if (segment === null) {
        const scope: Scope = { list: { call, path: [...path] } };
        call.lists.push([...path]);
        created.push(scope);
        path.push(scope);
      } else {
        path.push(segment);
      }
    }
    scopes = [...call.scopes, ...created];
    scopesOfList.set(list, scopes);
    return scopes;
  }

  /** An `experimental_dataOf()` value as a place in a call's data */
  function refOf(read: EntryDataRef): Ref {
    const call = callFor(read.entry);
    const segments = segmentsOf(call, read.path);
    // The `null`s of an item's list are its items; any other is every item
    const itemScopes = read.itemOf ? scopesOf(read.itemOf) : [];
    const own = itemScopes.slice(call.scopes.length);
    let next = 0;
    return {
      call,
      path: segments.map((segment) => segment ?? own[next++] ?? every),
    };
  }

  /**
   * The scopes of a call: the lists of the items it reads, outer first. A
   * call reads the items of one list, and of the lists that one is in
   */
  function scopesOfReads(refs: readonly Ref[]): Scope[] {
    let scopes: Scope[] = [];
    for (const ref of refs) {
      const read = [...ref.call.scopes, ...ref.path.filter(isScope)];
      const [longer, shorter] =
        read.length > scopes.length ? [read, scopes] : [scopes, read];
      if (!shorter.every((scope, index) => longer[index] === scope)) {
        throw new TypeError(
          'experimental_load(): an entry reads the items of two lists. An entry per item reads the items of one list',
        );
      }
      scopes = longer;
    }
    return scopes;
  }

  /**
   * The call of an entry, made once, after the calls of what it reads. An
   * entry built from another's data, with `experimental_dataOf(entry, fn)`,
   * is the entry its callback returned: the same call
   */
  function callFor(entry: object): Call {
    const made = callOfEntry.get(entry);
    if (made) {
      return made;
    }
    const inner = innerEntryOf(entry);
    if (inner && inner !== entry) {
      const call = callFor(inner);
      callOfEntry.set(entry, call);
      return call;
    }
    const state: QueryEntryState | null = queryEntryStateOf(entry);
    if (!state) {
      throw new TypeError(
        `experimental_load(): \`experimental_dataOf()\` reads an entry, such as one from \`experimental_query()\`, got ${JSON.stringify(entry)}`,
      );
    }
    // Read once, as it is now: a later change to the object doesn't change
    // the call, and the request and a query that asks by itself agree
    const raw =
      state.type === 'infinite'
        ? firstPageInput(state.input, state.initialCursor)
        : state.input;
    const refs: Ref[] = [];
    const input = mapInput({
      value: raw,
      to: [],
      onRead: (read) => {
        const ref = 'call' in read ? read : refOf(read);
        refs.push(ref);
        const standIn = {};
        standIns.set(standIn, ref);
        return standIn;
      },
      copies: new Map(),
    });
    const holes: Hole[] = [];
    const blanked = mapInput({
      value: input,
      to: [],
      onRead: (read, to) => {
        const ref = read as Ref;
        holes.push({
          // An infinite query's whole input, which the server can't write
          // `cursor` and `direction` into
          to: state.type === 'infinite' && to?.length === 0 ? null : to,
          ref,
        });
        ref.call.reads.push(ref.path);
        return undefined;
      },
      copies: new Map(),
    });
    const inputCursor = isPlainObject(state.input)
      ? state.input['cursor']
      : undefined;
    const call: Call = {
      type: state.type,
      path: state.path.join('.'),
      input,
      blanked,
      holes,
      scopes: scopesOfReads(refs),
      context: state.context,
      firstCursor:
        state.initialCursor ??
        (entryDataRefOf(inputCursor) ? undefined : inputCursor),
      source: null,
      frame: [],
      sent: null,
      reads: [],
      lists: [],
      runs: new Map(),
    };
    callOfEntry.set(entry, call);
    calls.push(call);
    return call;
  }

  /**
   * Has the server make the call in the request of what it reads, if that
   * request hasn't gone and the link pipelines. Its input is filled in there.
   */
  function pipe(call: Call) {
    if (call.context) {
      // A link may route it by its context: it goes alone
      return;
    }
    const inner = call.scopes[call.scopes.length - 1] ?? null;
    const reads: PipelineCallReads<PipelineSource>['reads'] = [];
    let frame: Scope[] = [];
    let readsItem = false;
    for (const { to, ref } of call.holes) {
      if (!to) {
        return;
      }
      const item = inner && [...inner.list.path, inner];
      if (
        inner &&
        item &&
        ref.call === inner.list.call &&
        item.every((segment, index) => ref.path[index] === segment)
      ) {
        const path = ref.path.slice(item.length);
        if (path.some(isScope)) {
          return;
        }
        reads.push({ kind: 'item', to, path: wirePath(path) });
        readsItem = true;
        continue;
      }
      // An item of an outer list: no request has it on its own
      if (!ref.call.source || ref.path.some(isScope)) {
        return;
      }
      const path = requestPath(ref.call, ref.path);
      if (!path) {
        return;
      }
      reads.push({ kind: 'whole', to, from: ref.call.source, path });
      if (ref.call.frame.length > frame.length) {
        frame = ref.call.frame;
      }
    }
    let each: PipelineCallReads<PipelineSource>['each'] = null;
    // A call in a list runs for every item of it, unless what it reads does
    if (inner && (readsItem || !sameScopes(frame, call.scopes))) {
      const { list } = inner;
      const path = list.call.source && requestPath(list.call, list.path);
      if (!list.call.source || !path) {
        return;
      }
      each = { from: list.call.source, path };
      frame = [...list.call.frame, ...list.path.filter(isScope), inner];
    }
    if (!sameScopes(frame, call.scopes)) {
      return;
    }
    const piped = pipeCall({
      path: call.path,
      input: call.blanked,
      reads: { each, reads },
    });
    if (piped) {
      call.source = piped;
      call.frame = frame;
    }
  }

  function runOf(call: Call, items: Items) {
    const key = call.scopes.map((scope) => items.get(scope)).join();
    let run = call.runs.get(key);
    if (!run) {
      run = settles(async (): Promise<Outcome<Run>> => {
        const outcome = await startRun(call, items);
        if (!outcome.ok) {
          return outcome;
        }
        // An infinite query's data, as TanStack Query has it: its pages
        const data =
          call.type === 'infinite'
            ? { pages: [outcome.data], pageParams: [call.firstCursor] }
            : outcome.data;
        return { ok: true, data: snapshotOf(call, data) };
      }, failed);
      call.runs.set(key, run);
    }
    return run;
  }

  /**
   * A run's data, from the outcome of what gets it: its own request, or the
   * call the server made. One the server didn't make, or made for no such
   * item, asks by itself, once the data it reads is there
   */
  function startRun(call: Call, items: Items): Settles<Outcome<unknown>> {
    if (call.sent) {
      return call.sent;
    }
    const { source } = call;
    return settles(async (): Promise<Outcome<unknown>> => {
      if (source && 'owner' in source) {
        const settled = await source.settled;
        if (settled.status === 'ran') {
          if (!settled.outcome.ok) {
            return settled.outcome;
          }
          const run = await readRun(
            settled.outcome.data,
            call.frame.map((scope) => items.get(scope) ?? -1),
          );
          if (run.kind === 'data') {
            return { ok: true, data: run.data };
          }
          // A run that reads a run the server didn't make, or that failed,
          // doesn't run: the server sends an error in its place. It asks by
          // itself, as a call does whose source failed
          if (
            run.kind === 'error' &&
            !(await blockedBySource(call, items, run))
          ) {
            return failed(run.error);
          }
        }
      }
      const input = await fill(call.input, items);
      if (!input.ok) {
        return input;
      }
      return outcomeOf(
        untyped.query(
          call.path,
          // A whole input that was read: its first page's, once it is there
          call.type === 'infinite' && call.holes.some((hole) => !hole.to)
            ? firstPageInput(input.data, undefined)
            : input.data,
          request(call, undefined),
        ),
      );
    }, failed);
  }

  /**
   * Whether a run's error is what the server sends in place of a run that
   * reads one it didn't make, or that failed: an error the server marked
   * `source-failed` beside it, in its envelope, and a call the run reads
   * that the server refused or that failed on the server, for the run's
   * items. What a run reads is what its input reads, and the list it runs
   * for, which is in a call's data too. Any other error is the run's own, at
   * once, whatever its code or its `data`. The server sends a failed source
   * before the runs that read it, so this resolves at the first one, and
   * doesn't wait for a source still to come. An error the client made, such
   * as for a result it couldn't deserialize, doesn't say the server didn't
   * run it
   */
  function blockedBySource(
    call: Call,
    items: Items,
    run: Extract<PipelinedRun, { kind: 'error' }>,
  ) {
    if (run.mark !== 'source-failed') {
      return Promise.resolve(false);
    }
    const sources = new Set([
      ...call.holes.map((hole) => hole.ref.call),
      ...call.frame.map((scope) => scope.list.call),
    ]);
    return anyTrue(
      Array.from(sources, (source) =>
        settles(
          async () => {
            const from = source.source;
            // An operation of its own: its request's outcome
            if (!from || !('owner' in from)) {
              const sent = await source.sent;
              return sent ? !sent.ok : false;
            }
            const settled = await from.settled;
            if (settled.status === 'not-run') {
              return true;
            }
            if (!settled.outcome.ok) {
              return !isUnread(settled.outcome.error);
            }
            const run = await readRun(
              settled.outcome.data,
              source.frame.map((scope) => items.get(scope) ?? -1),
            );
            return run.kind === 'error'
              ? !isUnread(run.error)
              : run.kind !== 'data';
          },
          () => false,
        ),
      ),
    );
  }

  /** The run at `indexes` of a call's data */
  async function readRun(data: PipelinedData, indexes: readonly number[]) {
    return data.kind === 'each'
      ? readPipelinedRun(data.runs, indexes)
      : ({ kind: 'data', data: data.data } as const);
  }

  function valueOf(
    ref: Ref,
    items: Items,
    as: 'data' | 'read',
  ): Settles<Outcome<unknown>> {
    return settles(async (): Promise<Outcome<unknown>> => {
      const run = await runOf(ref.call, items);
      return run.ok
        ? {
            ok: true,
            data: walk({ run: run.data, path: ref.path, items, as }).value,
          }
        : run;
    }, failed);
  }

  function fill(value: unknown, items: Items): Settles<Outcome<unknown>> {
    return settles(async (): Promise<Outcome<unknown>> => {
      const ref = standInOf(value);
      if (ref) {
        return valueOf(ref, items, 'read');
      }
      if (Array.isArray(value)) {
        // Every index, a hole too: it is sent as `undefined` is
        return allOk(Array.from(value, (item) => fill(item, items)));
      }
      if (isPlainObject(value)) {
        const keys = Object.keys(value);
        const values = await allOk(keys.map((key) => fill(value[key], items)));
        if (!values.ok) {
          return values;
        }
        const filled: Record<string, unknown> = {};
        keys.forEach((key, index) => {
          setOwn(filled, key, values.data[index]);
        });
        return { ok: true, data: filled };
      }
      return { ok: true, data: value };
    }, failed);
  }

  /**
   * The items of every level of the lists `scopes` are, as they arrived:
   * each as the indexes of its items. Rejects if a list's call failed
   */
  function itemsOf(
    scopes: readonly Scope[],
    items: Items,
  ): Settles<Outcome<Items[]>> {
    return settles(async (): Promise<Outcome<Items[]>> => {
      const [scope, ...rest] = scopes;
      if (!scope) {
        return { ok: true, data: [items] };
      }
      const run = await runOf(scope.list.call, items);
      if (!run.ok) {
        return run;
      }
      const { list } = walk({
        run: run.data,
        path: scope.list.path,
        items,
        as: 'data',
      });
      const levels = await allOk(
        list.map((_item, index) =>
          itemsOf(rest, new Map(items).set(scope, index)),
        ),
      );
      return levels.ok ? { ok: true, data: levels.data.flat() } : levels;
    }, failed);
  }

  /** An entry per item's promise of its items' promises */
  function loadPerItem(state: PerItemState): Promise<Promise<unknown>[]> {
    const scopes = scopesOf(state.list);
    const call = callFor(state.entry);
    if (!call.scopes.every((scope, index) => scopes[index] === scope)) {
      throw new TypeError(
        'experimental_load(): the entry of `experimental_perItem()` reads the items of another list',
      );
    }
    if (callFor(state.list.entry).scopes.length > 0) {
      throw new TypeError(
        'experimental_load(): the list of `experimental_perItem()` is in the data of an entry that reads an item. Its items are in more than one list',
      );
    }
    return rejecting(
      settles(async (): Promise<Outcome<Promise<unknown>[]>> => {
        const all = await itemsOf(scopes, new Map());
        if (!all.ok) {
          return all;
        }
        const loaded = all.data.map((items) => {
          const item = rejecting(valueOf({ call, path: [] }, items, 'data'));
          // An item that nobody reads can fail
          item.catch(nothing);
          return item;
        });
        itemLists.add(loaded);
        return { ok: true, data: loaded };
      }, failed),
    );
  }

  // Every call is made before any is sent, in the order of the entries
  const leaves = readLeaves(entries, []).map((leaf) => {
    const perItem = perItemStateOf(leaf.entry);
    if (perItem) {
      scopesOf(perItem.list);
      callFor(perItem.entry);
      return { ...leaf, load: () => loadPerItem(perItem) };
    }
    const call = callFor(leaf.entry);
    if (call.scopes.length > 0) {
      throw new TypeError(
        `experimental_load(): "${[...leaf.group, leaf.key].join('.')}" reads an item of a list. Load it for every item with \`experimental_perItem()\``,
      );
    }
    return {
      ...leaf,
      load: () => rejecting(valueOf({ call, path: [] }, new Map(), 'data')),
    };
  });
  // In one step: the link takes the queries that read nothing into a batch,
  // and the calls that read them go in its request
  for (const call of calls) {
    if (call.holes.length === 0 && call.scopes.length === 0) {
      const pipeline = call.context ? null : createOperationPipeline();
      call.sent = outcomeOf(
        untyped.query(
          call.path,
          call.blanked,
          request(call, pipeline ? pipelineContext(pipeline) : undefined),
        ),
      );
      call.source = pipeline;
    } else {
      pipe(call);
    }
  }
  if (
    isDev() &&
    !warned.has(untyped) &&
    calls.some((call) => call.source && 'owner' in call.source) &&
    calls.some(
      (call) =>
        call.source &&
        !('owner' in call.source) &&
        call.source.streams === false,
    )
  ) {
    warned.add(untyped);
    // oxlint-disable-next-line no-console
    console.warn(
      "experimental_load(): the link doesn't stream its responses, so the entries in a request settle together, with the whole response. Use `httpBatchStreamLink` for each entry to settle when its query is done",
    );
  }
  const result: Record<string, unknown> = {};
  for (const leaf of leaves) {
    let group = result;
    for (const key of leaf.group) {
      if (!hasOwn(group, key)) {
        setOwn(group, key, {});
      }
      group = group[key] as Record<string, unknown>;
    }
    const loaded = leaf.load();
    // An entry that nobody reads can fail
    loaded.catch(nothing);
    setOwn(group, leaf.key, loaded);
  }
  return result as experimental_Loaded<TEntries>;
}

async function settle(value: unknown): Promise<unknown> {
  const awaited = await value;
  if (itemLists.has(awaited as object)) {
    return Promise.all((awaited as unknown[]).map(settle));
  }
  if (value !== awaited) {
    return awaited;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    const settled = await Promise.all(keys.map((key) => settle(value[key])));
    const resolved: Record<string, unknown> = {};
    keys.forEach((key, index) => {
      setOwn(resolved, key, settled[index]);
    });
    return resolved;
  }
  return value;
}

/**
 * Awaits every promise of `experimental_load()`'s result, the items of an
 * entry per item too, so that each is a value. Rejects if one does.
 *
 * Experimental: it may change in a minor release.
 * @see https://trpc.io/docs/client/vanilla/nested-queries
 */
export async function experimental_settle<TLoaded>(
  loaded: TLoaded,
): Promise<experimental_Settled<TLoaded>> {
  return (await settle(loaded)) as experimental_Settled<TLoaded>;
}
