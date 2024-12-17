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
  const structuralSharingFunction = (a: any, b: any): any => {
    if (equalityFn(a, b)) {
      return a;
    }

    const array = isPlainArray(a) && isPlainArray(b);
    const plainObject = isPlainObject(a) && isPlainObject(b);
    const map = a instanceof Map && b instanceof Map;
    const set = a instanceof Set && b instanceof Set;

    if (array || plainObject || map) {
      const aItems = array
        ? a
        : plainObject
          ? Object.keys(a)
          : Array.from(a.keys());
      const aSize = aItems.length;
      const bItems = array
        ? b
        : plainObject
          ? Object.keys(b)
          : Array.from(b.keys());
      const bSize = bItems.length;
      const copy: any = array ? [] : plainObject ? {} : new Map();

      let equalItems = 0;

      for (let i = 0; i < bSize; i++) {
        const key = array ? i : bItems[i];
        if (
          !array &&
          a[key] === undefined &&
          b[key] === undefined &&
          aItems.includes(key)
        ) {
          copy[key] = undefined;
          equalItems++;
        } else {
          copy[key] = structuralSharingFunction(a[key], b[key]);
          if (copy[key] === a[key] && a[key] !== undefined) {
            equalItems++;
          }
        }
      }

      return aSize === bSize && equalItems === aSize ? a : copy;
    }

    if (set) {
      const copy: any = new Set();
      let equalItems = 0;
      if (a.size !== b.size) return false;
      const aItems = Array.from(a.values());
      for (const bItem of b.values()) {
        // We're doing a shallow comparison here, not a deep one.
        const aItem = aItems.find((aItem) => equalityFn(aItem, bItem));
        if (!aItem) {
          copy.add(bItem);
        } else {
          copy.add(aItem);
          equalItems++;
        }
      }
      return a.size === b.size && equalItems === a.size ? a : copy;
    }

    return b;
  };

  return structuralSharingFunction;
}

export const defaultStructuralSharingFunction =
  createStructuralSharingFunction(isEqual);

function isEqual(a: unknown, b: unknown) {
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
