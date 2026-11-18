import type { DataPath } from './path';
import { dataPath } from './path';
import { isPlainObject, nothing } from './utils';

export const entryDataRef = Symbol('trpc.entryData');

/** A `experimental_dataOf()` value: a path into the data of another entry */
export interface EntryDataRef {
  /** The entry `experimental_dataOf()` was called with */
  entry: object;
  path: DataPath;
  /**
   * For a value read from the item of an `experimental_entryPerItem()`
   * callback: the list the item is of. A value with the same path that was
   * read from the list itself, such as with `.map()`, has `null`.
   */
  itemOf: EntryDataRef | null;
  /**
   * What it is a list of, when it is the list of an entry per item:
   * - `value`: a value as it is. As a list, its items are its elements.
   * - `mapped`: what `.map()` returned, a value for every item of a list.
   * - `flat`: what `.flatMap()` returned, the items of a list in every item.
   *   The wire can read no such list into an input, so it is only the list
   *   of an `experimental_entryPerItem()` entry.
   */
  shape: 'value' | 'mapped' | 'flat';
}

export const onlyAsList =
  'A `.flatMap()` value can only be the list of `experimental_entryPerItem()`';

/** A `experimental_dataOf()` value in an entry's input */
export interface EntryInputRef extends EntryDataRef {
  /** Where it is in the input */
  to: string[];
}

export const notData =
  "A `experimental_dataOf()` value has no data until the load runs, so it can only be passed on as it is, as an entry's input or anywhere inside it";

export function createEntryDataRef(ref: EntryDataRef): unknown {
  // A function, so that `.map()` can be called on it
  return new Proxy(nothing, {
    get(_target, key) {
      if (key === entryDataRef) {
        return ref;
      }
      if (key === Symbol.toPrimitive) {
        throw new Error(
          `A \`experimental_dataOf()\` value has no data until the load runs, so it can't be made into a string or a number. Pass it as it is, as an entry's input or anywhere inside it`,
        );
      }
      if (typeof key === 'symbol') {
        return undefined;
      }
      if (ref.shape === 'flat' && key !== 'toJSON') {
        throw new Error(onlyAsList);
      }
      if (
        ref.shape === 'mapped' &&
        key !== 'map' &&
        key !== 'flatMap' &&
        key !== 'toJSON'
      ) {
        // Its path's last `null` is every item: `[0]` would read each item's `0`
        throw new Error(
          `${notData}. A \`.map()\` value is a value for every item: pass it as it is, or read the part of the item in the callback`,
        );
      }
      return createEntryDataRef({
        entry: ref.entry,
        path: dataPath([...ref.path, key]),
        itemOf: ref.itemOf,
        // Kept for `.map()` or `.flatMap()`, which is called next
        shape:
          (key === 'map' || key === 'flatMap') && ref.shape === 'mapped'
            ? 'mapped'
            : 'value',
      });
    },
    apply(_target, _thisArg, args: unknown[]) {
      const method = ref.path[ref.path.length - 1];
      if (method === 'toJSON') {
        // So that an error message can print a value that has one inside
        return '[a experimental_dataOf() value]';
      }
      const callback = args[0];
      if (
        (method !== 'map' && method !== 'flatMap') ||
        typeof callback !== 'function'
      ) {
        throw new Error(
          `${notData}. Of an array's methods, only \`.map()\` works, to read a part of every item, and \`.flatMap()\`, for the list of \`experimental_entryPerItem()\``,
        );
      }
      // The callback runs once, on a stand-in for every item. What an
      // earlier `.map()` returned already stands for every item
      const list = ref.path.slice(0, -1);
      const item = ref.shape === 'mapped' ? list : [...list, null];
      const returned = entryDataRefOf(
        callback(
          createEntryDataRef({
            entry: ref.entry,
            path: dataPath(item),
            itemOf: ref.itemOf,
            shape: 'value',
          }),
        ),
      );
      if (
        returned?.entry !== ref.entry ||
        returned.itemOf !== ref.itemOf ||
        returned.shape === 'flat' ||
        !item.every((segment, index) => returned.path[index] === segment)
      ) {
        throw new Error(
          `${notData}. A \`.${method}()\` callback must return the item or a part of it, such as \`(post) => post.authorId\`. To load an entry for every item, use \`experimental_entryPerItem()\``,
        );
      }
      // `.flatMap()`: every item's value is a list, whose items are the items
      return createEntryDataRef(
        method === 'flatMap'
          ? { ...returned, shape: 'flat' }
          : { ...returned, shape: 'mapped' },
      );
    },
  });
}

export function entryDataRefOf(value: unknown): EntryDataRef | undefined {
  return (typeof value === 'object' && value !== null) ||
    typeof value === 'function'
    ? (value as { [entryDataRef]?: EntryDataRef })[entryDataRef]
    : undefined;
}

/**
 * What stands for a value that isn't known yet, in the input of an unfinished
 * handle. It leaves no `undefined` there, which Next.js rejects in props: a key
 * is absent, and an item of an array is `null`.
 */
export const blankInput = Symbol('trpc.blankInput');

/**
 * Replaces every `experimental_dataOf()` value in an input. `to` is where
 * `value` is in it. `replace` returns the value, or `blankInput`.
 */
export function replaceEntryDataRefs(
  value: unknown,
  to: string[],
  replace: (ref: EntryInputRef) => unknown,
): unknown {
  const replaced = replaceRefs(value, to, replace);
  return replaced === blankInput ? undefined : replaced;
}

export function replaceRefs(
  value: unknown,
  to: string[],
  replace: (ref: EntryInputRef) => unknown,
): unknown {
  const ref = entryDataRefOf(value);
  if (ref) {
    return replace({ ...ref, to });
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      const replaced = replaceRefs(item, [...to, String(index)], replace);
      return replaced === blankInput ? null : replaced;
    });
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) => {
        const replaced = replaceRefs(item, [...to, key], replace);
        return replaced === blankInput ? [] : [[key, replaced]];
      }),
    );
  }
  return value;
}
