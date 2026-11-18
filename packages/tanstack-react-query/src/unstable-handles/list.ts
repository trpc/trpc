import type { PipelinePath } from '@trpc/server/unstable-core-do-not-import';
import {
  bindPipelinePath,
  readPipelinePath,
} from '@trpc/server/unstable-core-do-not-import';
import type { EntryDataRef } from './dataRef';
import type { HandleType } from './types';

/**
 * A path in an entry's data as a path in the result of its request. That
 * result is the data of a query, and the first page of an infinite query.
 */
export function requestPath(opts: {
  type: HandleType;
  path: PipelinePath;
  /** Whether it is the path of an item of a list that is flattened */
  item: boolean;
}): PipelinePath | null {
  if (opts.type === 'query') {
    return opts.path;
  }
  const [pages, page] = opts.path;
  return pages === 'pages' && (page === '0' || (opts.item && page === null))
    ? opts.path.slice(2)
    : null;
}

/**
 * The path to the items of the list an entry per item is for, with a `null`
 * for each level of lists, as the server walks it. What `.map()` returned is
 * a value for every item already. Any other list's items are its elements.
 */
export function itemPathOf(list: EntryDataRef): PipelinePath {
  return list.mapped ? list.path : [...list.path, null];
}

/**
 * How the server runs a call for every item at `itemPath`: over the list
 * before its last `null`, reading `itemRead` of each element to get the item.
 * For `["posts", null, "authorId"]`, the list is `["posts"]` and the item is
 * each post's `["authorId"]`.
 */
export function serverList(itemPath: PipelinePath) {
  const last = itemPath.lastIndexOf(null);
  return {
    each: itemPath.slice(0, last),
    itemRead: itemPath.slice(last + 1) as string[],
  };
}

/**
 * The list whose elements are the items at `itemPath`, if there is one
 * level of lists: `["items", null]` is the elements of `["items"]`
 */
export function listOfElements(itemPath: PipelinePath): string[] | null {
  return itemPath.indexOf(null) === itemPath.length - 1
    ? (itemPath.slice(0, -1) as string[])
    : null;
}

/** An item of a list: where it is, by its index at each `null` of the path */
export interface ListItem {
  indexes: number[];
  /** The path to it, with each `null` in place of its index */
  path: string[];
}

/**
 * Every item at `itemPath` in `data`, in the order the server runs them.
 * What isn't a list where the path has a `null` has no items. A `null` item
 * is an item like any other.
 */
export function itemsAt(data: unknown, itemPath: PipelinePath): ListItem[] {
  const at = itemPath.indexOf(null);
  if (at === -1) {
    return [{ indexes: [], path: itemPath as string[] }];
  }
  const list = readPipelinePath(data, itemPath.slice(0, at), null);
  if (!Array.isArray(list)) {
    return [];
  }
  return list.flatMap((_, index) =>
    itemsAt(data, bindPipelinePath(itemPath, index)).map((item) => ({
      indexes: [index, ...item.indexes],
      path: item.path,
    })),
  );
}
