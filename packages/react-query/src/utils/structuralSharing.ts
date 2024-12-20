/**
 * Inspired by @tanstack/query-core utils.ts
 * Modified to support Date, Map, Set and NaN comparisons
 *
 * This function returns `a` if `b` is deeply equal.
 * If not, it will replace any deeply equal children of `b` with those of `a`.
 */
export function createStructuralSharingFunction(
  equalityFn: (a: unknown, b: unknown) => boolean,
) {
  const structuralSharingFunction = (prev: any, next: any): any => {
    if (equalityFn(prev, next)) {
      return prev;
    }

    const array = isPlainArray(prev) && isPlainArray(next);
    const plainObject = isPlainObject(prev) && isPlainObject(next);
    const map = prev instanceof Map && next instanceof Map;
    const set = prev instanceof Set && next instanceof Set;

    if (array || plainObject || map) {
      const aItems = array
        ? prev
        : plainObject
          ? Object.keys(prev)
          : Array.from(prev.keys());
      const aSize = aItems.length;
      const bItems = array
        ? next
        : plainObject
          ? Object.keys(next)
          : Array.from(next.keys());
      const bSize = bItems.length;
      const copy: any = array ? [] : plainObject ? {} : new Map();

      let equalItems = 0;

      for (let i = 0; i < bSize; i++) {
        const key = array ? i : bItems[i];
        if (
          !array &&
          prev[key] === undefined &&
          next[key] === undefined &&
          aItems.includes(key)
        ) {
          copy[key] = undefined;
          equalItems++;
        } else {
          copy[key] = structuralSharingFunction(prev[key], next[key]);
          if (copy[key] === prev[key] && prev[key] !== undefined) {
            equalItems++;
          }
        }
      }

      return aSize === bSize && equalItems === aSize ? prev : copy;
    }

    if (set) {
      const copy: any = new Set();
      let equalItems = 0;
      if (prev.size !== next.size) return false;
      const aItems = Array.from(prev.values());
      for (const bItem of next.values()) {
        // We're doing a shallow comparison here, not a deep one.
        const aItem = aItems.find((aItem) => equalityFn(aItem, bItem));
        if (!aItem) {
          copy.add(bItem);
        } else {
          copy.add(aItem);
          equalItems++;
        }
      }
      return prev.size === next.size && equalItems === prev.size ? prev : copy;
    }

    return next;
  };

  return structuralSharingFunction;
}

export const defaultStructuralSharingFunction =
  createStructuralSharingFunction(isEqual);

export function isEqual(a: unknown, b: unknown) {
  if (a === b) return true;
  if (Object.is(a, b)) return true;
  if (a === undefined || b === undefined || a === null || b === null)
    return false;
  if (a.constructor !== b.constructor) return false;
  if (a.constructor === RegExp)
    // @ts-expect-error typescript does not infer type from constructor comparison
    return a.source === b.source && a.flags === b.flags;
  if (a.valueOf !== Object.prototype.valueOf)
    return a.valueOf() === b.valueOf();
  if (a.toString !== Object.prototype.toString)
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return a.toString() === b.toString();
  return false;
}

function isPlainArray(value: unknown) {
  return Array.isArray(value) && value.length === Object.keys(value).length;
}

// Copied from: https://github.com/jonschlinkert/is-plain-object
function isPlainObject(o: any): o is object {
  if (!hasObjectPrototype(o)) {
    return false;
  }

  // If has no constructor
  const ctor = o.constructor;
  if (ctor === undefined) {
    return true;
  }

  // If has modified prototype
  const prot = ctor.prototype;
  if (!hasObjectPrototype(prot)) {
    return false;
  }

  // If constructor does not have an Object-specific method
  if (!prot.hasOwnProperty('isPrototypeOf')) {
    return false;
  }

  // Most likely a plain Object
  return true;
}

function hasObjectPrototype(o: any): boolean {
  return Object.prototype.toString.call(o) === '[object Object]';
}
