import type {
  AnyRouter,
  PipelineCallReads,
  PipelinePath,
} from '@trpc/server/unstable-core-do-not-import';
import {
  abortSignalsAnyPonyfill,
  hasOwn,
  isObject,
} from '@trpc/server/unstable-core-do-not-import';
import type { TRPCClient } from '../createTRPCClient';
import { getUntypedClient } from '../createTRPCClient';
import type { TRPCRequestOptions } from '../internals/TRPCUntypedClient';
import type { TRPCProcedureOptions } from '../internals/types';
import type {
  OperationPipeline,
  Outcome,
  PipelinedRuns,
  Settles,
} from '../links/internals/pipeline';
import {
  createOperationPipeline,
  failed,
  isUnread,
  notRun,
  outcomeOf,
  pipelineContext,
  readPipelinedRun,
  settles,
} from '../links/internals/pipeline';
import type { PriorFailure } from '../links/internals/pipelineContext';
import {
  isPipelineFallback,
  priorFailureContext,
  readsContext,
} from '../links/internals/pipelineContext';
import type { OperationContext } from '../links/types';
import type { EntryDataRef } from './dataRef';
import { entryDataRefOf } from './dataRef';
import type {
  experimental_DataEntry,
  experimental_DataOfEntry,
  experimental_PerItemEntry,
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
    | experimental_LoadEntries
    | null;
}

/** What an entry of a description loads to */
type LoadedValue<TValue> = TValue extends null
  ? null
  : TValue extends experimental_PerItemEntry<infer TReturn, any>
    ? Promise<LoadedValue<TReturn>[]>
    : TValue extends experimental_DataEntry
      ? Promise<experimental_DataOfEntry<TValue>>
      : { [K in keyof TValue]: LoadedValue<TValue[K]> };

/**
 * What `experimental_load()` returns: a promise for every entry, by its key,
 * that settles when its query is done, and `null` for a skipped one. An
 * entry per item has a promise of a list, with what the callback returned
 * loaded for every item: it resolves when the list is there, and each
 * item's entries settle by themselves.
 *
 * Experimental: it may change in a minor release.
 */
export type experimental_Loaded<TEntries> = {
  [K in keyof TEntries]: LoadedValue<TEntries[K]>;
};

/**
 * What `experimental_load()` returns, with every promise awaited
 *
 * Experimental: it may change in a minor release.
 */
export type experimental_Settled<TLoaded> =
  TLoaded extends Promise<infer TValue>
    ? experimental_Settled<TValue>
    : TLoaded extends readonly unknown[]
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
  /**
   * Its own context, which a link may route by: then it isn't pipelined, and
   * goes once what it reads is there
   */
  context: OperationContext | null;
  /**
   * Whether it isn't pipelined: it has a context of its own, or a link that
   * doesn't pipeline took an operation of it
   */
  alone: boolean;
  /** Of an infinite query: the `initialCursor` of its options */
  initialCursor: unknown;
  /**
   * The pipeline of the operation made for it as the load starts, which the
   * operations that read it name: `null` if it has none, and each run asks
   * by itself
   */
  pipeline: OperationPipeline | null;
  /**
   * The lists of the runs of that operation: its data has a run for every
   * item of them, if there are any
   */
  frame: Scope[];
  /** The outcome of that operation */
  sent: Settles<Outcome<unknown>> | null;
  /** How each run went first, by its indexes: see `tryOf()` */
  tries: Map<string, Settles<Try>>;
  /** The operation each run that asks by itself made, by its indexes */
  spawns: Map<string, Spawn>;
  /** The data of each run that has it, by its indexes */
  done: Map<string, Run>;
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

/** An operation a run made by itself, and its outcome */
interface Spawn {
  /** What the operations that read it name: `null` for one that goes alone */
  pipeline: OperationPipeline | null;
  sent: Settles<Outcome<unknown>>;
}

/**
 * How a run went in the operation made for its call: its data, the
 * operation it made by itself, or its error
 */
type Try =
  | { kind: 'data'; data: unknown }
  | { kind: 'spawn'; spawn: Spawn }
  | { kind: 'error'; error: unknown };

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

/**
 * The error of an operation that failed because one it reads did: that
 * one's, as the caller should see it
 */
function ownError(error: unknown) {
  return isPipelineFallback(error) &&
    error instanceof Error &&
    error.cause !== undefined
    ? error.cause
    : error;
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
 * A copy of data: of its plain objects and arrays, and of the `Date`s, `Map`s
 * and `Set`s a transformer such as superjson makes. Anything else is kept as
 * it is. `copies` has the copy of each object copied so far, so a cycle, or
 * an object in two places, is one copy
 */
function copyData(value: unknown, copies: Map<object, unknown>): unknown {
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  if (copies.has(value)) {
    return copies.get(value);
  }
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (value instanceof Map) {
    const copy = new Map<unknown, unknown>();
    copies.set(value, copy);
    for (const [key, item] of value) {
      copy.set(copyData(key, copies), copyData(item, copies));
    }
    return copy;
  }
  if (value instanceof Set) {
    const copy = new Set<unknown>();
    copies.set(value, copy);
    for (const item of value) {
      copy.add(copyData(item, copies));
    }
    return copy;
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
  if (isPlainObject(value)) {
    const copy: Record<string, unknown> = {};
    copies.set(value, copy);
    for (const key of Object.keys(value)) {
      setOwn(copy, key, copyData(value[key], copies));
    }
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

/**
 * A copy of an input, with each value read of another call in it replaced by
 * what `onRead` gives. `to` is where a value is in the input: `null` in an
 * array, where the server can't write. Inputs are plain objects, arrays and
 * primitives: anything else is sent as it is
 */
function mapInput(opts: {
  value: unknown;
  to: string[] | null;
  onRead: (read: Ref | EntryDataRef, to: string[] | null) => unknown;
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

/** What a description loads, as its calls */
type Node =
  | { kind: 'skip' }
  | { kind: 'query'; call: Call }
  /** An entry per item: what the callback returned, for each item of `scopes` */
  | { kind: 'list'; scopes: Scope[]; item: Node }
  | { kind: 'group'; members: [key: string, node: Node][] };

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
   * A path to the items of a list in an entry's data, as the engine reads it.
   * Of an infinite query, which loads its first page, every page is that
   * page: a list of pages is a list of the one
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

  /**
   * The scopes of the list of an entry per item: those of the lists the
   * list is in, then one for each level of lists of its own. A list read of
   * an item is in that item's lists
   */
  function scopesOf(list: EntryDataRef): Scope[] {
    let scopes = scopesOfList.get(list);
    if (scopes) {
      return scopes;
    }
    const call = callFor(list.entry);
    const outer = list.itemOf ? scopesOf(list.itemOf) : call.scopes;
    // The `null`s of the item's list are its items
    const ofItem = outer.slice(call.scopes.length);
    let next = 0;
    const created: Scope[] = [];
    const path: Segment[] = [];
    for (const segment of segmentsOf(call, itemPathOf(list))) {
      if (segment !== null) {
        path.push(segment);
        continue;
      }
      const bound = list.itemOf ? ofItem[next++] : undefined;
      if (bound) {
        path.push(bound);
        continue;
      }
      const scope: Scope = { list: { call, path: [...path] } };
      call.lists.push([...path]);
      created.push(scope);
      path.push(scope);
    }
    scopes = [...outer, ...created];
    scopesOfList.set(list, scopes);
    return scopes;
  }

  /**
   * An `experimental_dataOf()` value as a place in a call's data. A value
   * read of an item has the path to its list's items in it; any other keeps
   * every page of an infinite query, as `.map()` over them reads a value for
   * each
   */
  function refOf(read: EntryDataRef): Ref {
    const call = callFor(read.entry);
    const segments = read.itemOf ? segmentsOf(call, read.path) : read.path;
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
    });
    const call: Call = {
      type: state.type,
      path: state.path.join('.'),
      input,
      blanked,
      holes,
      scopes: scopesOfReads(refs),
      context: state.context,
      alone: state.context !== null,
      initialCursor: state.initialCursor,
      pipeline: null,
      frame: [],
      sent: null,
      tries: new Map(),
      spawns: new Map(),
      done: new Map(),
      reads: [],
      lists: [],
      runs: new Map(),
    };
    callOfEntry.set(entry, call);
    calls.push(call);
    return call;
  }

  /**
   * What the operation of a call reads of the operations of the calls it
   * reads, for a link that pipelines to put it in their request: `null` if
   * no request can have it, and each of its runs asks by itself
   */
  function declare(call: Call) {
    const inner = call.scopes[call.scopes.length - 1] ?? null;
    const reads: PipelineCallReads<OperationPipeline>['reads'] = [];
    let frame: Scope[] = [];
    let readsItem = false;
    for (const { to, ref } of call.holes) {
      if (!to) {
        return null;
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
          return null;
        }
        reads.push({ kind: 'item', to, path: wirePath(path) });
        readsItem = true;
        continue;
      }
      // An item of an outer list: no request has it on its own
      if (!ref.call.pipeline || ref.path.some(isScope)) {
        return null;
      }
      const path = requestPath(ref.call, ref.path);
      if (!path) {
        return null;
      }
      reads.push({ kind: 'whole', to, from: ref.call.pipeline, path });
      if (ref.call.frame.length > frame.length) {
        frame = ref.call.frame;
      }
    }
    let each: PipelineCallReads<OperationPipeline>['each'] = null;
    // A call in a list runs for every item of it, unless what it reads does
    if (inner && (readsItem || !sameScopes(frame, call.scopes))) {
      const { list } = inner;
      const path = list.call.pipeline && requestPath(list.call, list.path);
      if (!list.call.pipeline || !path) {
        return null;
      }
      each = { from: list.call.pipeline, path };
      frame = [...list.call.frame, ...list.path.filter(isScope), inner];
    }
    if (!sameScopes(frame, call.scopes)) {
      return null;
    }
    return { reads: { each, reads }, frame };
  }

  /** An input with what it reads filled in, if every run it reads has data now */
  function knownInput(call: Call, items: Items) {
    let complete = true;
    const input = mapInput({
      value: call.input,
      to: [],
      onRead: (read) => {
        const ref = read as Ref;
        const done = ref.call.done.get(keyOf(ref.call, items));
        if (!done) {
          complete = false;
          return undefined;
        }
        return walk({ run: done, path: ref.path, items, as: 'read' }).value;
      },
    });
    return complete ? { input } : null;
  }

  /**
   * Whether a link that pipelines took an operation: one that reads it can go
   * by saying what it reads, and only then. Any other link gets inputs that
   * are filled in, so it costs nothing to a client that doesn't pipeline
   */
  function taken(pipeline: OperationPipeline) {
    return pipeline.streams !== null;
  }

  /** Whether a link that pipelines took every operation a call reads */
  function readsTaken(reads: PipelineCallReads<OperationPipeline>) {
    return (
      (!reads.each || taken(reads.each.from)) &&
      reads.reads.every((read) => read.kind === 'item' || taken(read.from))
    );
  }

  /**
   * Sends a call's operation whose context says what it reads, which only a
   * link that pipelines can send: any other would send its input with blanks.
   * A link takes an operation as it is sent, so one that a link that doesn't
   * pipeline took, such as through a `splitLink`, is aborted before it goes.
   * Then the call is alone, and `null` is returned
   */
  function sendReading(send: {
    call: Call;
    input: unknown;
    pipeline: OperationPipeline;
    context: OperationContext;
  }) {
    const abort = new AbortController();
    const sent = outcomeOf(
      untyped.query(send.call.path, send.input, {
        // `AbortSignal.any()` where there is one: the caller's signal keeps
        // no listener for each operation
        signal: opts?.signal
          ? abortSignalsAnyPonyfill([opts.signal, abort.signal])
          : abort.signal,
        context: { ...opts?.context, ...send.call.context, ...send.context },
      }),
    );
    if (taken(send.pipeline)) {
      return sent;
    }
    abort.abort();
    send.call.alone = true;
    return null;
  }

  /** Whether a link that pipelines took any operation of the load */
  function pipelined() {
    return calls.some((call) => call.pipeline && taken(call.pipeline));
  }

  /** A filled input, or a rejection that a link passes on as `blocked` */
  function inputFor(call: Call, items: Items) {
    return fill({ value: call.input, items, skip: null }).then((input) =>
      input.ok ? input.data : Promise.reject(input.error),
    );
  }

  /**
   * Once the calls a call reads, that run once, have their final data: what
   * an operation for every item waits for before it asks for its runs by
   * themselves
   */
  function sourcesReady(call: Call) {
    const sources = new Set([
      ...call.holes.map((hole) => hole.ref.call),
      ...call.frame.map((scope) => scope.list.call),
    ]);
    return allOk(
      Array.from(sources)
        .filter((source) => source.scopes.length === 0)
        .map((source) => runOf(source, new Map())),
    ).then((ready) => (ready.ok ? undefined : Promise.reject(ready.error)));
  }

  /**
   * An infinite query's first page's input, once what it reads is filled in:
   * a whole input read of another call has its `cursor` and `direction` only
   * then
   */
  function firstPage(call: Call, input: unknown) {
    return call.type === 'infinite' && call.holes.some((hole) => !hole.to)
      ? firstPageInput(input, call.initialCursor)
      : input;
  }

  /** The key of a run: the indexes of its items */
  function keyOf(call: Call, items: Items) {
    return call.scopes.map((scope) => items.get(scope)).join();
  }

  /**
   * How a run went in the operation made for its call as the load started:
   * its data, or its error. One the server didn't make, made for no such
   * item, or that failed in a request with others, makes an operation by
   * itself: a retrying link counts a run's own failure as its first attempt
   */
  function tryOf(call: Call, items: Items): Settles<Try> {
    const key = keyOf(call, items);
    let tried = call.tries.get(key);
    if (!tried) {
      tried = settles(
        async (): Promise<Try> => {
          if (!call.sent) {
            return { kind: 'spawn', spawn: spawn(call, items, null) };
          }
          const outcome = await call.sent;
          if (!outcome.ok) {
            return { kind: 'error', error: ownError(outcome.error) };
          }
          if (outcome.data === notRun) {
            // It couldn't go in the request of what it reads
            return { kind: 'spawn', spawn: spawn(call, items, null) };
          }
          if (call.frame.length === 0) {
            return { kind: 'data', data: outcome.data };
          }
          const run = await readPipelinedRun(
            outcome.data as PipelinedRuns,
            call.frame.map((scope) => items.get(scope) ?? -1),
          );
          if (run.kind === 'data') {
            return { kind: 'data', data: run.data };
          }
          if (run.kind === 'error' && run.mark !== 'source-failed') {
            // Its own error, or one the client made for a run it couldn't
            // read, which another attempt doesn't change
            return isUnread(run.error)
              ? { kind: 'error', error: run.error }
              : {
                  kind: 'spawn',
                  spawn: spawn(call, items, {
                    error: run.error,
                    replayed: false,
                  }),
                };
          }
          // A run that reads one that failed, or one the server didn't make.
          // A run it reads for the same item may make an operation by
          // itself: this one goes in its request
          await Promise.all(
            call.holes
              .filter((hole) => hole.ref.call.scopes.length > 0)
              .map((hole) => tryOf(hole.ref.call, items)),
          );
          return { kind: 'spawn', spawn: spawn(call, items, null) };
        },
        (error) => ({ kind: 'error', error }),
      );
      call.tries.set(key, tried);
    }
    return tried;
  }

  /**
   * What gets the data of a call's run in a request that may still be open:
   * the operation the run made by itself, or the operation made for a call
   * that runs once. `null` for a run of a call for every item that made none
   */
  function requestOf(call: Call, items: Items) {
    const spawned = call.spawns.get(keyOf(call, items));
    if (spawned) {
      return spawned.pipeline;
    }
    return call.scopes.length === 0 ? call.pipeline : null;
  }

  /**
   * The operation a run makes by itself, at once, so that a link that
   * retries decides on it at once. What it reads of data that is there is
   * filled in. What it reads of a request that may be open goes in that
   * request, where a link pipelines; it waits for anything else, and goes by
   * itself once that is there
   */
  function spawn(call: Call, items: Items, prior: PriorFailure | null): Spawn {
    const key = keyOf(call, items);
    const made = call.spawns.get(key);
    if (made) {
      return made;
    }
    if (call.alone || !pipelined()) {
      // A context of its own, which a link may route by, a link that doesn't
      // pipeline, or none that does: it goes alone, as it is, once all it
      // reads is there
      const alone: Spawn = {
        pipeline: null,
        sent: settles(async (): Promise<Outcome<unknown>> => {
          const filled = await fill({ value: call.input, items, skip: null });
          return filled.ok
            ? outcomeOf(
                untyped.query(
                  call.path,
                  firstPage(call, filled.data),
                  request(call, undefined),
                ),
              )
            : filled;
        }, failed),
      };
      call.spawns.set(key, alone);
      return alone;
    }
    const pipeline = createOperationPipeline();
    const reads: PipelineCallReads<OperationPipeline>['reads'] = [];
    let complete = true;
    const known = mapInput({
      value: call.input,
      to: [],
      onRead: (read, to) => {
        const ref = read as Ref;
        const done = ref.call.done.get(keyOf(ref.call, items));
        if (done) {
          return walk({ run: done, path: ref.path, items, as: 'read' }).value;
        }
        const from =
          to && !ref.path.some(isScope) ? requestOf(ref.call, items) : null;
        const path = from && requestPath(ref.call, ref.path);
        if (from && path && to) {
          reads.push({ kind: 'whole', to, from, path });
        } else {
          complete = false;
        }
        return undefined;
      },
    });
    const context: OperationContext = {
      ...pipelineContext(pipeline),
      ...(prior ? priorFailureContext(prior) : {}),
    };
    const input = firstPage(call, known);
    const sent =
      complete && reads.length === 0
        ? outcomeOf(untyped.query(call.path, input, request(call, context)))
        : sendReading({
            call,
            input,
            pipeline,
            context: {
              ...context,
              ...readsContext({
                // A read it can't put in a request: it goes once all is there
                reads: { each: null, reads: complete ? reads : [] },
                perItem: false,
                resolve: () =>
                  inputFor(call, items).then((it) => firstPage(call, it)),
                known: () => {
                  const known = knownInput(call, items);
                  return known && { input: firstPage(call, known.input) };
                },
              }),
            },
          });
    if (!sent) {
      // A link that doesn't pipeline took it: it goes alone
      return spawn(call, items, prior);
    }
    const result: Spawn = { pipeline, sent };
    call.spawns.set(key, result);
    return result;
  }

  function runOf(call: Call, items: Items) {
    const key = call.scopes.map((scope) => items.get(scope)).join();
    let run = call.runs.get(key);
    if (!run) {
      run = settles(async (): Promise<Outcome<Run>> => {
        const tried = await tryOf(call, items);
        if (tried.kind === 'error') {
          return failed(tried.error);
        }
        const outcome =
          tried.kind === 'data'
            ? { ok: true as const, data: tried.data }
            : await tried.spawn.sent;
        if (!outcome.ok) {
          return failed(ownError(outcome.error));
        }
        let data = outcome.data;
        if (call.type === 'infinite') {
          // As TanStack Query has it: its pages, and the cursor of each, as
          // it was sent. The data a cursor read is there, as the page is
          const input =
            call.holes.length === 0
              ? { ok: true as const, data: call.input }
              : await fill({ value: call.input, items, skip: null });
          const sent = input.ok ? firstPage(call, input.data) : undefined;
          data = {
            pages: [outcome.data],
            pageParams: [isPlainObject(sent) ? sent['cursor'] : undefined],
          };
        }
        const snapshot = snapshotOf(call, data);
        call.done.set(key, snapshot);
        return { ok: true, data: snapshot };
      }, failed);
      call.runs.set(key, run);
    }
    return run;
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

  /**
   * A copy of an input with what it reads filled in, for the items in
   * `items`. What `skip` reads is left `undefined`: a request fills it in
   */
  function fill(opts: {
    value: unknown;
    items: Items;
    skip: ReadonlySet<Ref> | null;
  }): Settles<Outcome<unknown>> {
    const { value, items } = opts;
    return settles(async (): Promise<Outcome<unknown>> => {
      const ref = standInOf(value);
      if (ref) {
        return opts.skip?.has(ref)
          ? { ok: true, data: undefined }
          : valueOf(ref, items, 'read');
      }
      if (Array.isArray(value)) {
        // Every index, a hole too: it is sent as `undefined` is
        return allOk(
          Array.from(value, (item) => fill({ ...opts, value: item })),
        );
      }
      if (isPlainObject(value)) {
        const keys = Object.keys(value);
        const values = await allOk(
          keys.map((key) => fill({ ...opts, value: value[key] })),
        );
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

  /**
   * What a value of a description loads: an entry, an entry per item, a
   * group, or `null` to skip. `bound` has the lists whose item is known
   * where the value is. Makes every call it needs, before any is sent
   */
  function nodeOf(
    value: unknown,
    label: string,
    bound: readonly Scope[],
  ): Node {
    if (value === null) {
      return { kind: 'skip' };
    }
    if (innerEntryOf(value)) {
      const call = callFor(value as object);
      if (!call.scopes.every((scope) => bound.includes(scope))) {
        throw new TypeError(
          bound.length === 0
            ? `experimental_load(): "${label}" reads an item of a list. Load it for every item with \`experimental_perItem()\``
            : `experimental_load(): "${label}" reads the items of a list that \`experimental_perItem()\` isn't for`,
        );
      }
      return { kind: 'query', call };
    }
    const perItem = perItemStateOf(value);
    if (perItem) {
      // Its own lists, below those whose item is known here. A list in the
      // data of an entry that runs for every item of another list is the
      // items of every one of them, in that list's order
      const scopes = scopesOf(perItem.list).filter(
        (scope) => !bound.includes(scope),
      );
      return {
        kind: 'list',
        scopes,
        item: nodeOf(perItem.entry, label, [...bound, ...scopes]),
      };
    }
    if (isPlainObject(value)) {
      return {
        kind: 'group',
        members: Object.keys(value).map((key) => [
          key,
          nodeOf(value[key], label ? `${label}.${key}` : key, bound),
        ]),
      };
    }
    throw new TypeError(
      `experimental_load(): "${label}" is no entry, such as one from \`experimental_query()\`, nor a group of them, nor \`null\``,
    );
  }

  /** What a node loads to, for the items in `items` */
  function resolve(node: Node, items: Items): unknown {
    switch (node.kind) {
      case 'skip':
        return null;
      case 'query': {
        const loaded = rejecting(
          valueOf({ call: node.call, path: [] }, items, 'data'),
        );
        // An entry that nobody reads can fail
        loaded.catch(nothing);
        return loaded;
      }
      case 'list': {
        const loaded = rejecting(
          settles(async (): Promise<Outcome<unknown[]>> => {
            const all = await itemsOf(node.scopes, items);
            if (!all.ok) {
              return all;
            }
            const list = all.data.map((item) => resolve(node.item, item));
            itemLists.add(list);
            return { ok: true, data: list };
          }, failed),
        );
        loaded.catch(nothing);
        return loaded;
      }
      case 'group': {
        const group: Record<string, unknown> = {};
        for (const [key, member] of node.members) {
          setOwn(group, key, resolve(member, items));
        }
        return group;
      }
    }
  }

  if (!isPlainObject(entries)) {
    throw new TypeError(
      `experimental_load(): expects an object of entries, got ${String(entries)}`,
    );
  }
  // Every call is made before any is sent, in the order of the entries
  const root = nodeOf(entries, '', []);
  // In one step: an operation for every call that a request can have. A
  // link that pipelines puts each one that reads others in their request
  for (const call of calls) {
    if (call.holes.length === 0 && call.scopes.length === 0) {
      call.pipeline = call.context ? null : createOperationPipeline();
      call.sent = outcomeOf(
        untyped.query(
          call.path,
          call.blanked,
          request(
            call,
            call.pipeline ? pipelineContext(call.pipeline) : undefined,
          ),
        ),
      );
      continue;
    }
    // One with a context of its own isn't pipelined: a link may route by it
    const declared = call.alone ? null : declare(call);
    if (!declared || !readsTaken(declared.reads)) {
      continue;
    }
    const pipeline = createOperationPipeline();
    call.pipeline = pipeline;
    call.frame = declared.frame;
    const perItem = declared.frame.length > 0;
    call.sent = sendReading({
      call,
      input: call.blanked,
      pipeline,
      context: {
        ...pipelineContext(pipeline),
        ...readsContext({
          reads: declared.reads,
          perItem,
          resolve: perItem
            ? () => sourcesReady(call)
            : () => inputFor(call, new Map()),
          known: () => knownInput(call, new Map()),
        }),
      },
    });
    if (!call.sent) {
      // Its runs ask by themselves, and what reads it doesn't name it
      call.pipeline = null;
      call.frame = [];
    }
  }
  // The data of each call that runs once, as soon as it arrives: what a
  // retry of a query that read it sends
  for (const call of calls) {
    if (call.sent && call.scopes.length === 0) {
      void runOf(call, new Map());
    }
  }
  if (
    isDev() &&
    !warned.has(untyped) &&
    calls.some((call) => call.pipeline?.attached) &&
    calls.some((call) => call.pipeline?.streams === false)
  ) {
    warned.add(untyped);
    // oxlint-disable-next-line no-console
    console.warn(
      "experimental_load(): the link doesn't stream its responses, so the entries in a request settle together, with the whole response. Use `httpBatchStreamLink` for each entry to settle when its query is done",
    );
  }
  return resolve(root, new Map()) as experimental_Loaded<TEntries>;
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
