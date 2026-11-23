import type { EntryDataRef } from '@trpc/client/unstable-internals';
import type {
  DataPath,
  ItemPath,
  RequestPath,
} from '@trpc/client/unstable-internals';
import { itemPathOf } from '@trpc/client/unstable-internals';
import type { PipelinePath } from '@trpc/server/unstable-core-do-not-import';
import {
  bindPipelinePath,
  readPipelinePath,
} from '@trpc/server/unstable-core-do-not-import';
import type { EntryRequest } from './entry';
import type { HandleType } from './types';

/**
 * A path in an entry's data as a path in the result of its request. That
 * result is the data of a query, and the first page of an infinite query.
 */
export function requestPath(opts: {
  type: HandleType;
  path: DataPath | ItemPath;
  /**
   * Whether it is the path of the items of a list in every page, which the
   * request of any page has. Else only the first page's request has it
   */
  item: boolean;
}): RequestPath | null {
  if (opts.type === 'query') {
    return opts.path as PipelinePath as RequestPath;
  }
  const [pages, page] = opts.path;
  return pages === 'pages' && (page === '0' || (opts.item && page === null))
    ? (opts.path.slice(2) as RequestPath)
    : null;
}

/**
 * How the server runs a call for every item at `itemPath`: over the list
 * before its last `null`, reading `itemRead` of each element to get the item.
 * For `["posts", null, "authorId"]`, the list is `["posts"]` and the item is
 * each post's `["authorId"]`.
 */
export function serverList(itemPath: ItemPath) {
  const last = itemPath.lastIndexOf(null);
  return {
    each: itemPath.slice(0, last) as DataPath,
    itemRead: itemPath.slice(last + 1) as string[],
  };
}

/**
 * How the calls of an entry per item go with its list's requests, decided
 * once, for the first load and for a later fetch of the list alike
 */
export interface PerItemPlan {
  /** The path to the items, with a `null` for each level of lists */
  itemPath: ItemPath;
  /**
   * The server's list in the first request of the list's entry: of an
   * infinite query, its first page. `null` if it isn't there, or the calls
   * can't go in that request
   */
  first: RequestPath | null;
  /**
   * What a later fetch of the list, such as the next page, loads the items'
   * queries with: the list in the result of any one of its requests, and what
   * of each element the item is. `null` for a list of lists, a list in the
   * first page only, or calls that can't go in the list's request
   */
  later: { list: string[]; itemRead: string[] } | null;
}

export function perItemPlan(opts: {
  list: EntryDataRef;
  /** The type of the list's entry */
  listType: HandleType;
  /** How the list's entry's first request goes */
  listRequest: EntryRequest;
  /** How the entry per item's requests go */
  itemRequest: EntryRequest;
}): PerItemPlan {
  const itemPath = itemPathOf(opts.list);
  // The calls go in the list's requests only if both take part in pipelining
  if (
    opts.listRequest.kind !== 'pipelined' ||
    opts.itemRequest.kind !== 'pipelined'
  ) {
    return { itemPath, first: null, later: null };
  }
  const { each, itemRead } = serverList(itemPath);
  // In every page's request: not a list of the first page only
  const inAnyPage =
    opts.listType === 'query'
      ? each
      : each[0] === 'pages' && each[1] === null
        ? each.slice(2)
        : null;
  return {
    itemPath,
    first: requestPath({ type: opts.listType, path: each, item: true }),
    later:
      inAnyPage && !inAnyPage.includes(null)
        ? { list: inAnyPage as string[], itemRead }
        : null,
  };
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
export function itemsAt(data: unknown, itemPath: ItemPath): ListItem[] {
  const at = itemPath.indexOf(null);
  if (at === -1) {
    return [{ indexes: [], path: itemPath as string[] }];
  }
  const list = readPipelinePath(data, itemPath.slice(0, at), null);
  if (!Array.isArray(list)) {
    return [];
  }
  return list.flatMap((_, index) =>
    itemsAt(data, bindPipelinePath(itemPath, index) as ItemPath).map(
      (item) => ({
        indexes: [index, ...item.indexes],
        path: item.path,
      }),
    ),
  );
}
