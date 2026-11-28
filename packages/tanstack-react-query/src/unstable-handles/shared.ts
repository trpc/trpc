import { skipToken } from '@tanstack/react-query';
import type { EntryDataRef } from '@trpc/client/unstable-internals';
import {
  entryDataRefOf,
  fromDataStateOf,
  perItemState,
  perItemStateOf,
  queryEntryStateOf,
} from '@trpc/client/unstable-internals';
import { entryStateOf } from './entry';
import { isPlainObject } from './utils';

/**
 * A load's entries as the load reads them, before anything starts: each query
 * is a TanStack Query entry, from `prefetchEntry()`, `fetchEntry()`,
 * `ensureEntry()` and the like, as a bare `experimental_query()` says nothing
 * of how to start it. `null` is `skipToken`, and what an entry per item
 * returns for an item is an entry per item of each entry in it, in a group of
 * the same keys. An entry that changes nothing stays the object it was.
 */
export function toTanStackEntries(
  entries: Record<string, unknown>,
): Record<string, unknown> {
  function queryEntry(value: object): object {
    if (!entryStateOf(value)) {
      const shared = queryEntryStateOf(value);
      const fn =
        shared?.type === 'infinite'
          ? 'prefetchInfiniteEntry()`, `ensureInfiniteEntry()` or `fetchInfiniteEntry()'
          : 'prefetchEntry()`, `ensureEntry()` or `fetchEntry()';
      throw new Error(
        `\`loadHandles()\` loads TanStack Query entries: build the query for "${shared?.path.join('.')}" with \`${fn}\`, which say how it starts`,
      );
    }
    return value;
  }

  function entryFor(value: object): object {
    const fromData = fromDataStateOf(value);
    const perItem = perItemStateOf(value);
    if (fromData) {
      entryFor(fromData.entry);
      entryFor(fromData.source);
      return value;
    }
    if (perItem) {
      return perItemFor(perItem.entry, perItem, value);
    }
    return queryEntryStateOf(value) ? queryEntry(value) : value;
  }

  /**
   * What an entry per item loads, for TanStack Query: an entry per item for
   * each entry the callback returned, in a group of the same keys, and
   * `skipToken` for `null`. Each loads in a request of its own per item,
   * and reads the item and the entries of the load only
   */
  function perItemFor(
    returned: object | null,
    perItem: { entry: object | null; list: EntryDataRef },
    /** The entry per item itself, kept as it is if it has one query */
    same: object | null,
  ): object {
    if (returned === null) {
      return skipToken as unknown as object;
    }
    if (perItemStateOf(returned)) {
      throw new Error(
        '`loadHandles()` loads an entry per item of a list in another entry, not of a list in an item: load the inner list with `experimental_load()`',
      );
    }
    if (fromDataStateOf(returned)) {
      throw new Error(
        '`loadHandles()` loads a query per item, not an entry built from the data of another with `experimental_dataOf(entry, (data) => entry)`: load it with `experimental_load()`',
      );
    }
    if (queryEntryStateOf(returned)) {
      if (queryEntryStateOf(returned)?.type === 'infinite') {
        throw new Error(
          '`loadHandles()` loads a query per item, not an infinite query',
        );
      }
      queryEntry(returned);
      return (
        same ?? { [perItemState]: { entry: returned, list: perItem.list } }
      );
    }
    return Object.fromEntries(
      Object.entries(returned).map(([key, member]) => [
        key,
        perItemFor(member as object | null, perItem, null),
      ]),
    );
  }

  function tree(values: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(values).map(([key, value]) => {
        if (value === null) {
          return [key, skipToken];
        }
        if (
          value === skipToken ||
          entryDataRefOf(value) ||
          typeof value !== 'object'
        ) {
          return [key, value];
        }
        if (
          queryEntryStateOf(value) ||
          fromDataStateOf(value) ||
          perItemStateOf(value)
        ) {
          return [key, entryFor(value)];
        }
        return [key, isPlainObject(value) ? tree(value) : value];
      }),
    );
  }

  return tree(entries);
}
