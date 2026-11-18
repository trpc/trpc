import type { QueryClient } from '@tanstack/react-query';
import { hashKey, skipToken } from '@tanstack/react-query';
import type { EntryDataRef, EntryInputRef } from './dataRef';
import { blankInput, entryDataRefOf } from './dataRef';
import type { EntryState } from './entry';
import {
  entryFromDataStateOf,
  entryPerItemStateOf,
  entryStateOf,
} from './entry';
import type { PerItemPlan } from './list';
import { perItemPlan } from './list';
import { isPlainObject } from './utils';

/** What built an entry, which says how a load loads it */
export type EntryBuilt =
  /** `prefetchEntry()` and the like: one query */
  | { by: 'entry' }
  /**
   * `experimental_entryPerItem()`: a query for every item of `list`. Its
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
    entryPerItemStateOf(value) !== undefined ||
    entryFromDataStateOf(value) !== undefined
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
    const perItem = entryPerItemStateOf(entry);
    const fromData = entryFromDataStateOf(entry);
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
          itemRequest: leaf.state.request,
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
 * Every symbol a context has had, by its number. A context's symbols are
 * module constants, so the map stays small
 */
const symbolIds = new Map<symbol, number>();

/** A symbol as a string that no other symbol and no string key has */
function describeSymbol(symbol: symbol) {
  const registered = Symbol.keyFor(symbol);
  if (registered !== undefined) {
    return `symbol.for:${registered}`;
  }
  let id = symbolIds.get(symbol);
  if (id === undefined) {
    id = symbolIds.size;
    symbolIds.set(symbol, id);
  }
  return `symbol:${id}`;
}

/**
 * An entry's own `trpc.context` as a value with JSON, symbol keys and all.
 * Two symbols with the same description differ. A value with no JSON, such
 * as a function, is described by its type
 */
function describeContext(
  context: Readonly<Record<PropertyKey, unknown>> | null,
): unknown {
  if (context === null) {
    return null;
  }
  return Reflect.ownKeys(context)
    .map((key) => {
      const value = context[key];
      let described: unknown;
      if (typeof value === 'symbol') {
        described = describeSymbol(value);
      } else {
        try {
          described = hashKey([value]);
        } catch {
          described = describeOption(value);
        }
      }
      return [
        typeof key === 'symbol' ? describeSymbol(key) : `string:${key}`,
        described,
      ] as const;
    })
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * What the entries of a load are: the procedure, input and kind of each, how
 * its query starts, and where it reads another's data. Two loads with the same
 * description start the same queries.
 */
export function describeEntries(opts: {
  queryClient: QueryClient;
  entries: Record<string, unknown>;
}) {
  const tree = readEntries({ ...opts, keys: [] });
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
      queryKey: options.queryKey,
      // `skipToken` and no input have the same query key
      skipped: options.queryFn === skipToken,
      // Not all of the options: `meta` can hold what has no JSON, or what is
      // new on every render
      options: startOptions.map((name) => describeOption(options[name])),
      // A cursor can be a bigint, which has no JSON. Tagged with its type,
      // so that a bigint and a string that reads like it differ
      firstCursor:
        typeof firstCursor === 'bigint'
          ? ['bigint', String(firstCursor)]
          : firstCursor === undefined
            ? ['none']
            : ['value', firstCursor],
      reads: leaf.state.refs.map((ref) => [ref.to, describeRef(ref)]),
      // Where its requests go, and so whether they can go in another's
      context: describeContext(leaf.state.context),
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
  return hashKey(describeTree(tree));
}
