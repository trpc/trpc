import type { PipelinePath } from '@trpc/server/unstable-core-do-not-import';
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

/** An item of the list of an `experimental_entryPerItem()` entry */
export interface ListItem {
  /** The indexes down to it, one for every list on the way */
  indexes: number[];
  /**
   * Whether it is an element of the innermost list. A list made with
   * `.map()` of values that are no lists has those values as its items.
   */
  element: boolean;
  /**
   * Its index in the element it is in, where the list's path has no wildcard
   * and that element is a list: a list of lists, as the types take it.
   * `null` otherwise
   */
  inner: number | null;
}

/**
 * The items of a list whose path has `depth` wildcards, so that it is a list
 * of lists `depth` times down to the values at its path. A list with no
 * wildcard whose elements are lists has their elements as its items.
 */
export function itemsOfList(list: unknown, depth: number): ListItem[] {
  if (depth > 0 || !Array.isArray(list)) {
    return itemsOfLevels(list, depth);
  }
  return list.flatMap((element: unknown, index): ListItem[] =>
    Array.isArray(element)
      ? element.map((_, inner) => ({ indexes: [index], element: true, inner }))
      : [{ indexes: [index], element: true, inner: null }],
  );
}

/** The items of a list whose path has `depth` wildcards */
export function itemsOfLevels(list: unknown, depth: number): ListItem[] {
  if (!Array.isArray(list)) {
    return [];
  }
  if (depth === 0) {
    return list.map((_, index) => ({
      indexes: [index],
      element: true,
      inner: null,
    }));
  }
  return list.flatMap((inner: unknown, index) => {
    // A `null` is an item like any other: it gets a query
    const items: ListItem[] =
      depth > 1 || Array.isArray(inner)
        ? itemsOfLevels(inner, depth - 1)
        : [{ indexes: [], element: false, inner: null }];
    return items.map((item) => ({
      ...item,
      indexes: [index, ...item.indexes],
    }));
  });
}
