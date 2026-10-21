/**
 * What TanStack Query does so keys don't depend on property order and
 * refetched values keep the parts that didn't change (`@tanstack/query-core`'s
 * `hashKey` and `replaceEqualDeep`).
 */

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const isPlainArray = (value: unknown): value is unknown[] =>
  Array.isArray(value) && value.length === Object.keys(value).length;

/** The same value with plain objects' keys sorted, at any depth. */
export const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isPlainObject(value)) return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort())
    sorted[key] = sortKeys(value[key]);
  return sorted;
};

/**
 * `prev` when `next` is deeply equal to it; otherwise `next` with each part
 * deeply equal to `prev`'s part replaced by it. Shares plain objects and
 * arrays, like TanStack's, and `Date`s with the same time, which a progressive JSON
 * response revives as new objects each time. `Map`s, `Set`s and class
 * instances compare by identity.
 */
export function replaceEqualDeep<T>(prev: unknown, next: T, depth = 0): T {
  if (prev === next) return prev as T;
  if (prev instanceof Date && next instanceof Date) {
    return (prev.getTime() === next.getTime() ? prev : next) as T;
  }
  if (depth > 500) return next;
  const array = isPlainArray(prev) && isPlainArray(next);
  if (!array && !(isPlainObject(prev) && isPlainObject(next))) return next;
  const a = prev as Record<string | number, unknown>;
  const b = next as Record<string | number, unknown>;
  const aKeys = array ? (prev as unknown[]).map((_, i) => i) : Object.keys(a);
  const bKeys = array ? (next as unknown[]).map((_, i) => i) : Object.keys(b);
  const copy = (array ? [] : {}) as Record<string | number, unknown>;
  let equal = 0;
  for (const key of bKeys) {
    const shared = replaceEqualDeep(a[key], b[key], depth + 1);
    copy[key] = shared;
    if (
      shared === a[key] &&
      (array ? (key as number) < aKeys.length : Object.hasOwn(a, key))
    )
      equal++;
  }
  return (
    aKeys.length === bKeys.length && equal === aKeys.length ? prev : copy
  ) as T;
}
