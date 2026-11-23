/* oxlint-disable typescript/no-non-null-assertion */

import { emptyObject } from '../utils';

const isNumberString = (str: string) => /^\d+$/.test(str);

/**
 * Whether `key` can index an array of `length` items without leaving a hole.
 * One short field such as `items[1000000]` would otherwise make an array of
 * a million holes for the validator to walk, so an index that skips ahead
 * makes an object instead.
 */
function isArrayIndex(key: string, length: number) {
  return isNumberString(key) && Number(key) <= length;
}

/**
 * Whether `value` is an array or object this function built. FormData values
 * are strings and Files, so they never are.
 */
function isContainer(value: unknown): value is Record<string, any> {
  return (
    Array.isArray(value) ||
    (typeof value === 'object' &&
      value !== null &&
      Object.getPrototypeOf(value) === null)
  );
}

function set(
  obj: Record<string, any>,
  path: readonly string[],
  value: unknown,
): void {
  if (path.length > 1) {
    const newPath = [...path];
    const key = newPath.shift()!;
    const nextKey = newPath[0]!;

    if (!Object.hasOwn(obj, key)) {
      obj[key] = isArrayIndex(nextKey, 0) ? [] : emptyObject();
    } else if (!isContainer(obj[key])) {
      // An earlier field set a value here. Descending into it would reach
      // its prototype: `'x'.__proto__` is `String.prototype`.
      throw new TypeError(
        `FormData field "${key}" has a value, so it can't have nested fields`,
      );
    } else if (
      Array.isArray(obj[key]) &&
      !isArrayIndex(nextKey, obj[key].length)
    ) {
      obj[key] = Object.assign(emptyObject(), obj[key]);
    }

    set(obj[key], newPath, value);

    return;
  }
  const p = path[0]!;

  if (obj[p] === undefined) {
    obj[p] = value;
  } else if (Array.isArray(obj[p])) {
    obj[p].push(value);
  } else {
    obj[p] = [obj[p], value];
  }
}

/** @internal */
export function formDataToObject(formData: FormData) {
  const obj: Record<string, unknown> = emptyObject();

  for (const [key, value] of formData.entries()) {
    const parts = key.split(/[\.\[\]]/).filter(Boolean);
    set(obj, parts, value);
  }

  return obj;
}
