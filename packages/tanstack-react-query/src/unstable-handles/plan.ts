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
import { isPlainObject } from './utils';

/** An entry to load, by its place in what `loadHandles()` was given */
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
  /**
   * What its input reads of other entries, and the entry of each. A load
   * fills it in as it begins
   */
  reads: { ref: EntryInputRef; source: EntryLeaf }[];
  /** The list of an entry per item, and the entry it is in. A load fills it in as it begins */
  list: { ref: EntryDataRef; source: EntryLeaf } | null;
}

/** What `loadHandles()` was given, with `skipToken` keys left out */
export type EntryTree = [name: string, node: EntryLeaf | EntryTree][];

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
            reads: [],
            list: null,
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

export function leavesOf(tree: EntryTree): EntryLeaf[] {
  return tree.flatMap(([, node]) =>
    Array.isArray(node) ? leavesOf(node) : [node],
  );
}

export function mapEntryTree(
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

/**
 * The entries whose data an entry's handle has in its input, which a load
 * waits for. For an entry per item or from another's data, the handle has no
 * item and none of that data: the component that has them finishes it.
 */
export function waitedByHandle(leaf: EntryLeaf): Set<object> {
  const { list } = leaf;
  const from = leaf.built.by === 'dataOf' ? leaf.built.data : null;
  return new Set([
    // It waits for the list if the load does. So not for a list from a
    // prefetch entry
    ...(list && list.source.state.kind !== 'prefetch'
      ? [list.source.entry]
      : []),
    ...leaf.reads
      .filter(({ ref, source }) =>
        // For an entry per item: another part of the list than the item
        list ? ref.itemOf !== list.ref : source.entry !== from,
      )
      .map((read) => read.source.entry),
  ]);
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
 * An entry's own `trpc.context` as a value with JSON, symbol keys and all.
 * A value with no JSON, such as a function, is described by its type
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
      try {
        described = hashKey([value]);
      } catch {
        described = describeOption(value);
      }
      return [String(key), described] as const;
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
      // A cursor can be a bigint, which has no JSON
      firstCursor:
        typeof firstCursor === 'bigint' ? `${firstCursor}n` : firstCursor,
      reads: leaf.state.refs.map((ref) => [ref.to, describeRef(ref)]),
      // Where its requests go, and so whether they can go in another's
      context: describeContext(leaf.state.request.context),
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
