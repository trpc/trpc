import type { PipelinePath } from '@trpc/server/unstable-core-do-not-import';

declare const pathKind: unique symbol;

/**
 * A path in an entry's data, as a `experimental_dataOf()` value reads it. A
 * `null` is every item of a list there.
 */
export type DataPath = PipelinePath & { readonly [pathKind]: 'data' };

/** A path to the items of a list, with a `null` for each level of lists */
export type ItemPath = PipelinePath & { readonly [pathKind]: 'item' };

export function dataPath(path: PipelinePath): DataPath {
  return path as DataPath;
}

/**
 * The path to the items of the list an entry per item is for, with a `null`
 * for each level of lists, as the server walks it. What `.map()` returned is
 * a value for every item already. Any other list's items are its elements.
 */
export function itemPathOf(list: {
  path: DataPath;
  shape: 'value' | 'mapped' | 'flat';
}): ItemPath {
  return (
    list.shape === 'mapped' ? list.path : [...list.path, null]
  ) as ItemPath;
}
