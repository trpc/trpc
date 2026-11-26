import type { QueryClient } from '@tanstack/react-query';
import { hashKey, skipToken } from '@tanstack/react-query';
import type {
  EntryDataRef,
  EntryInputRef,
} from '@trpc/client/unstable-internals';
import { blankInput, entryDataRefOf } from '@trpc/client/unstable-internals';
import {
  fromDataStateOf,
  perItemStateOf,
} from '@trpc/client/unstable-internals';
import type { EntryState } from './entry';
import { entryStateOf } from './entry';
import type { PerItemPlan } from './list';
import { perItemPlan } from './list';
import { isPlainObject } from './utils';

/** What built an entry, which says how a load loads it */
export type EntryBuilt =
  /** `prefetchEntry()` and the like: one query */
  | { by: 'entry' }
  /**
   * `experimental_perItem()`: a query for every item of `list`. Its
   * handle and its data are lists too
   */
  | { by: 'entryPerItem'; list: EntryDataRef }
  /**
   * `experimental_dataOf(entry, (data) => entry)`: built from the data of
   * `data`, which the load doesn't wait for, so its handle has the input
   * without it
   */
  | { by: 'dataOf'; data: object };

/** An entry to load, by its place in what `loadHandles()` was given */
export interface EntryLeaf {
  /** The keys down to the entry, joined by dots, for messages. Not to tell entries apart: `card.list` can be a key, or two */
  label: string;
  /** The keys down to the entry */
  keys: string[];
  entry: object;
  state: EntryState;
  built: EntryBuilt;
}

/**
 * An entry of a load, linked to the entries it reads: every one of them is
 * in the load. Only `linkEntries()` makes one, so a leaf of this type has
 * been checked, and what it decides is decided once, for every use.
 */
export interface LinkedLeaf extends EntryLeaf {
  /** What its input reads of other entries, and the entry of each */
  reads: readonly { ref: EntryInputRef; source: LinkedLeaf }[];
  /**
   * For an entry per item: the list, the entry it is in, and how the calls
   * for its items go with that entry's requests
   */
  list: { ref: EntryDataRef; source: LinkedLeaf; plan: PerItemPlan } | null;
  /**
   * Whether a value its input reads is left out of its handle, for
   * `experimental_handleOfItem()` to fill in: of an entry per item, a value
   * of the item; of an entry built from another's data, a value of that data
   */
  fromItem: (ref: EntryDataRef) => boolean;
  /**
   * How many of a value's path segments `experimental_handleOfItem()` reads
   * from its item, from the end: the rest is the path to the item
   */
  itemDepth: number;
  /**
   * The entries whose data its handle has in its input, which a load waits
   * for. For an entry per item or from another's data, the handle has no
   * item and none of that data: the component that has them finishes it
   */
  waited: ReadonlySet<object>;
}

/** What `loadHandles()` was given, with `skipToken` keys left out */
export type EntryTree<TLeaf = EntryLeaf> = [
  name: string,
  node: TLeaf | EntryTree<TLeaf>,
][];

/** Whether a value is something `loadHandles()` loads: an entry or `skipToken` */
export function isLoadable(value: unknown) {
  return (
    value === skipToken ||
    entryStateOf(value) !== undefined ||
    perItemStateOf(value) !== null ||
    fromDataStateOf(value) !== null
  );
}

/**
 * Whether an object is a group of entries. An object with nothing to load in
 * it is not: it is reported as it was before there were groups.
 */
export function isGroup(value: unknown): value is Record<string, unknown> {
  if (!isPlainObject(value) || entryDataRefOf(value)) {
    return false;
  }
  const members = Object.values(value);
  return (
    members.length === 0 ||
    members.some((member) => isLoadable(member) || isGroup(member))
  );
}

export function readEntries(opts: {
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
    const perItem = perItemStateOf(entry);
    const fromData = fromDataStateOf(entry);
    const state = entryStateOf(perItem?.entry ?? fromData?.entry ?? entry);
    if (state) {
      if (state.queryClient !== opts.queryClient) {
        throw new Error(
          `The entry for "${key}" was built with a proxy for another QueryClient than the root proxy that loads it`,
        );
      }
      return [
        [
          name,
          {
            label: key,
            keys,
            entry: entry as object,
            state,
            built: perItem
              ? { by: 'entryPerItem', list: perItem.list }
              : fromData
                ? { by: 'dataOf', data: fromData.source }
                : { by: 'entry' },
          },
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

export function leavesOf<TLeaf>(tree: EntryTree<TLeaf>): TLeaf[] {
  return tree.flatMap(([, node]) =>
    Array.isArray(node) ? leavesOf(node) : [node],
  );
}

export function mapEntryTree<TLeaf>(
  tree: EntryTree<TLeaf>,
  map: (leaf: TLeaf) => [value: unknown] | [],
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

/** A load's entries, linked: each to the entries it reads */
export interface LinkedEntries {
  tree: EntryTree<LinkedLeaf>;
  leaves: LinkedLeaf[];
  /** The entries whose data another entry reads */
  read: ReadonlySet<LinkedLeaf>;
}

/**
 * Links every entry to the entries it reads, before any query starts. The
 * one place that checks that each of them is in the load.
 */
export function linkEntries(tree: EntryTree): LinkedEntries {
  // What an entry reads is an entry that is one query: `experimental_dataOf()`
  // takes no entry per item
  const leafOfEntry = new Map(
    leavesOf(tree)
      .filter((leaf) => leaf.built.by !== 'entryPerItem')
      .map((leaf) => [leaf.entry, leaf]),
  );
  const linked = new Map<EntryLeaf, LinkedLeaf>();
  // An entry only reads entries built before it, so this can't loop
  const link = (leaf: EntryLeaf): LinkedLeaf => {
    const existing = linked.get(leaf);
    if (existing) {
      return existing;
    }
    const sourceOf = (ref: EntryDataRef) => {
      const source = leafOfEntry.get(ref.entry);
      if (!source) {
        throw new Error(
          `The entry for "${leaf.label}" reads the data of an entry with \`experimental_dataOf()\` that isn't in this load. Add that entry to the load`,
        );
      }
      return link(source);
    };
    const reads = leaf.state.refs.map((ref) => ({
      ref,
      source: sourceOf(ref),
    }));
    const { built } = leaf;
    let list: LinkedLeaf['list'] = null;
    let fromItem: LinkedLeaf['fromItem'] = () => false;
    let itemDepth = 0;
    if (built.by === 'entryPerItem') {
      const source = sourceOf(built.list);
      list = {
        ref: built.list,
        source,
        plan: perItemPlan({
          list: built.list,
          listType: source.state.type,
          listRequest: source.state.request,
          // Its calls go in no request of another client's, which another
          // server answers
          itemRequest:
            source.state.transport === leaf.state.transport
              ? leaf.state.request
              : { kind: 'alone' },
        }),
      };
      // Not by its path: the whole list, read with `.map()`, has the same one
      fromItem = (ref) => ref.itemOf === built.list;
      itemDepth = list.plan.itemPath.length;
    } else if (built.by === 'dataOf') {
      fromItem = (ref) => ref.entry === built.data;
    }
    const waited = new Set([
      // It waits for the list if the load does. So not for a list from a
      // prefetch entry
      ...(list && list.source.state.kind !== 'prefetch'
        ? [list.source.entry]
        : []),
      ...reads
        .filter(({ ref }) => !fromItem(ref))
        .map((read) => read.source.entry),
    ]);
    const result: LinkedLeaf = {
      ...leaf,
      reads,
      list,
      fromItem,
      itemDepth,
      waited,
    };
    linked.set(leaf, result);
    return result;
  };
  const mapTree = (nodes: EntryTree): EntryTree<LinkedLeaf> =>
    nodes.map(([name, node]) => [
      name,
      Array.isArray(node) ? mapTree(node) : link(node),
    ]);
  const linkedTree = mapTree(tree);
  const leaves = leavesOf(linkedTree);
  return {
    tree: linkedTree,
    leaves,
    read: new Set(
      leaves.flatMap((leaf) => [
        ...leaf.reads.map((read) => read.source),
        ...(leaf.list ? [leaf.list.source] : []),
      ]),
    ),
  };
}

/** The options of an entry that say how a load starts its query */
export const startOptions = [
  'staleTime',
  'retry',
  'retryDelay',
  'gcTime',
  'pages',
  // Whether there is one: without it, an infinite query loads no page after
  // its first, and a load with `pages` fails
  'getNextPageParam',
] as const;

/**
 * A start option as a string. `undefined` and `Infinity` have no JSON, and
 * would read the same as `null`. Which function an option is isn't compared: an
 * inline one is new on every render
 */
export function describeOption(value: unknown) {
  return typeof value === 'function'
    ? 'function'
    : `${typeof value}:${String(value)}`;
}

/**
 * The number of the next symbol that no live load has. Never one an earlier
 * symbol had: a load that is still kept may have its number in its key
 */
const nextSymbolId = { value: 0 };

/**
 * The numbers of the symbols a description has, which aren't registered
 * with `Symbol.for()`. Not held by the module: a symbol, such as one of a
 * session, can be new for each load. Not every runtime can hold a symbol
 * weakly
 */
interface SymbolIds {
  /** Of the symbols in the descriptions of the live loads, which keep them */
  known: ReadonlyMap<symbol, number>;
  /** Of the symbols in this description */
  used: Map<symbol, number>;
}

/** A symbol as a string that no other symbol and no string key has */
function describeSymbol(symbol: symbol, ids: SymbolIds) {
  const registered = Symbol.keyFor(symbol);
  if (registered !== undefined) {
    return `symbol.for:${registered}`;
  }
  const id =
    ids.used.get(symbol) ?? ids.known.get(symbol) ?? nextSymbolId.value++;
  ids.used.set(symbol, id);
  return `symbol:${id}`;
}

/**
 * Every object a description has told apart by which one it is, such as a
 * function in a context, by its number. Held weakly: an inline function is
 * new on every render
 */
const objectIds = new WeakMap<object, number>();
const nextObjectId = { value: 0 };

/** Which object a value is, as a number that no other object has */
function idOf(value: object) {
  let id = objectIds.get(value);
  if (id === undefined) {
    id = nextObjectId.value++;
    objectIds.set(value, id);
  }
  return id;
}

/**
 * A function as a string that no other function has: a link can route by
 * which function a context has
 */
function describeFunction(fn: object) {
  return `function:${idOf(fn)}`;
}

/**
 * An object's own keys, symbols too, each tagged so that no string key reads
 * like a symbol, with what `describe` makes of its value, in the order of
 * their tags. Sorted, as TanStack Query hashes a query key's objects: the
 * order of a plain object's keys tells no two descriptions apart, in an input
 * or a context, so a link must not route by it. A Map's or a Set's members
 * keep their order
 */
function describeKeys(
  object: Readonly<Record<PropertyKey, unknown>>,
  describe: (member: unknown) => unknown,
  ids: SymbolIds,
) {
  return Reflect.ownKeys(object)
    .map(
      (key) =>
        [
          typeof key === 'symbol' ? describeSymbol(key, ids) : `string:${key}`,
          describe(object[key]),
        ] as const,
    )
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * A value as one with JSON that no other value has. JSON reads `undefined`
 * and a hole as `null`, `-0` as `0` and a date as its string, and has no
 * bigint, and has a Map or a Set as `{}`: a transformer, or a link, can tell
 * each of them apart. Each value is tagged with its type, so that no value
 * reads like another's tag. A Map and a Set are described by their members,
 * in their order. A function is described by which function it is, as a
 * symbol is. A value that isn't a plain object, an array, a Map or a
 * Set, such as a class instance, is described
 * as JSON writes it, or by its type if it has no JSON
 */
function describeValue(
  value: unknown,
  /** The objects and arrays `value` is in, so that one in itself ends */
  within: readonly object[],
  ids: SymbolIds,
): unknown {
  switch (typeof value) {
    case 'undefined':
      return ['undefined'];
    case 'bigint':
      return ['bigint', String(value)];
    case 'number':
      // `NaN` and `Infinity` have no JSON either
      return ['number', Object.is(value, -0) ? '-0' : String(value)];
    case 'symbol':
      return ['symbol', describeSymbol(value, ids)];
    case 'function':
      return ['function', describeFunction(value)];
    case 'string':
    case 'boolean':
      return ['value', value];
    case 'object':
      break;
  }
  if (value === null) {
    return ['value', null];
  }
  // By the object it goes back to: a link can route by which one that is
  const back = within.indexOf(value);
  if (back !== -1) {
    return ['circular', back];
  }
  const inside = [...within, value];
  if (value instanceof Date) {
    return ['date', String(value.getTime())];
  }
  if (Array.isArray(value)) {
    return [
      'array',
      Array.from({ length: value.length }, (_, index) =>
        index in value ? describeValue(value[index], inside, ids) : ['hole'],
      ),
    ];
  }
  // A link can route by what a Map or a Set has, which JSON leaves out
  if (value instanceof Map) {
    return [
      'map',
      Array.from(value, ([key, member]) => [
        describeValue(key, inside, ids),
        describeValue(member, inside, ids),
      ]),
    ];
  }
  if (value instanceof Set) {
    return [
      'set',
      Array.from(value, (member) => describeValue(member, inside, ids)),
    ];
  }
  if (isPlainObject(value)) {
    // Symbol keys too: a link can route by them, at any level
    return [
      'object',
      describeKeys(value, (member) => describeValue(member, inside, ids), ids),
    ];
  }
  try {
    return ['instance', hashKey([value])];
  } catch {
    return ['instance', describeOption(value)];
  }
}

/**
 * An entry's own `trpc.context` as a value with JSON, symbol keys and all.
 * Two symbols with the same description differ, and so do two functions:
 * a link can route by a callback in it
 */
function describeContext(
  context: Readonly<Record<PropertyKey, unknown>> | null,
  ids: SymbolIds,
): unknown {
  if (context === null) {
    return null;
  }
  return describeKeys(context, (member) => describeValue(member, [], ids), ids);
}

/**
 * What the entries of a load are: the procedure, input and kind of each, how
 * its query starts, and where it reads another's data. Two loads with the same
 * description start the same queries.
 */
export function describeEntries(opts: {
  queryClient: QueryClient;
  entries: Record<string, unknown>;
  /**
   * The number of each symbol that a live load's description has: the same
   * symbol gets the same number
   */
  symbolIds: ReadonlyMap<symbol, number>;
}) {
  const ids: SymbolIds = { known: opts.symbolIds, used: new Map() };
  const tree = readEntries({
    queryClient: opts.queryClient,
    entries: opts.entries,
    keys: [],
  });
  const keysOfEntry = new Map(
    leavesOf(tree).map((leaf) => [leaf.entry, leaf.keys]),
  );
  /** Where a `experimental_dataOf()` value reads: the entry's keys, the path, and the list it is an item of */
  const describeRef = (ref: EntryDataRef): unknown => [
    keysOfEntry.get(ref.entry) ?? null,
    ref.path,
    // `.map()` and `.flatMap()` of one path are lists of other items
    ref.shape,
    ref.itemOf ? describeRef(ref.itemOf) : null,
  ];
  const describeLeaf = (leaf: EntryLeaf) => {
    // What the input reads is a hole in it, and listed apart, so that no
    // value in the input can read the same as a read
    const options = leaf.state.options({
      dataOfRef: () => blankInput,
      pipeline: null,
    });
    const firstCursor: unknown = options.initialPageParam;
    return {
      kind: leaf.state.kind,
      type: leaf.state.type,
      // As the cache hashes it, with the `queryKeyHashFn` it is set up
      // with: the keys it tells apart are other queries
      queryHash: opts.queryClient.defaultQueryOptions(options).queryHash,
      // `skipToken` and no input have the same query key
      skipped: options.queryFn === skipToken,
      // Not all of the options: `meta` can hold what has no JSON, or what is
      // new on every render
      options: startOptions.map((name) => describeOption(options[name])),
      // A cursor can be a bigint, or have one in it, which has no JSON
      firstCursor: describeValue(firstCursor, [], ids),
      reads: leaf.state.refs.map((ref) => [ref.to, describeRef(ref)]),
      // Where its requests go, and so whether they can go in another's
      context: describeContext(leaf.state.context, ids),
      // The client or router they go through: the same for every proxy of it
      transport: idOf(leaf.state.transport as object),
      built:
        leaf.built.by === 'entryPerItem'
          ? [leaf.built.by, describeRef(leaf.built.list)]
          : leaf.built.by === 'dataOf'
            ? [leaf.built.by, keysOfEntry.get(leaf.built.data) ?? null]
            : [leaf.built.by],
    };
  };
  // In the shape of the entries, which is the shape of their handles: a group
  // is a list, also an empty one, and an entry is not
  const describeTree = (nodes: EntryTree): unknown[] =>
    nodes.map(([name, node]) => [
      name,
      Array.isArray(node) ? describeTree(node) : describeLeaf(node),
    ]);
  return {
    key: hashKey(describeTree(tree)),
    /** The number of each symbol it has, which a load of it keeps */
    symbols: ids.used,
  };
}
