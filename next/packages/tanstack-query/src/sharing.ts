const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const sameTypedArray = (a: ArrayBufferView, b: ArrayBufferView) => {
  if (a.constructor !== b.constructor || a.byteLength !== b.byteLength) {
    return false;
  }
  const x = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const y = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  return x.every((byte, i) => byte === y[i]);
};

function share(prev: unknown, next: unknown): unknown {
  if (Object.is(prev, next)) return prev;
  if (typeof prev !== 'object' || typeof next !== 'object') return next;
  if (prev === null || next === null) return next;

  if (prev instanceof Date && next instanceof Date) {
    return Object.is(prev.getTime(), next.getTime()) ? prev : next;
  }
  if (prev instanceof URL && next instanceof URL) {
    return prev.href === next.href ? prev : next;
  }
  if (prev instanceof RegExp && next instanceof RegExp) {
    return prev.source === next.source && prev.flags === next.flags
      ? prev
      : next;
  }
  if (ArrayBuffer.isView(prev) && ArrayBuffer.isView(next)) {
    return sameTypedArray(prev, next) ? prev : next;
  }
  if (prev instanceof Map && next instanceof Map) {
    if (prev.size !== next.size) return next;
    for (const [key, value] of next) {
      if (!prev.has(key) || share(prev.get(key), value) !== prev.get(key)) {
        return next;
      }
    }
    return prev;
  }
  if (prev instanceof Set && next instanceof Set) {
    if (prev.size !== next.size) return next;
    for (const value of next) if (!prev.has(value)) return next;
    return prev;
  }

  const arrays = Array.isArray(prev) && Array.isArray(next);
  if (!arrays && !(isPlainObject(prev) && isPlainObject(next))) return next;
  const a = prev as Record<string | number, unknown>;
  const b = next as Record<string | number, unknown>;
  const prevKeys = arrays ? (prev as unknown[]).length : Object.keys(a).length;
  const keys = arrays ? (next as unknown[]).keys() : Object.keys(b);
  const copy = (arrays ? [] : {}) as Record<string | number, unknown>;
  let size = 0;
  let equal = 0;
  for (const key of keys) {
    size++;
    copy[key] = share(a[key], b[key]);
    if (copy[key] === a[key] && (arrays || Object.hasOwn(a, key))) equal++;
  }
  return size === prevKeys && equal === prevKeys ? prev : copy;
}

/**
 * TanStack's `structuralSharing`, extended to the types danSON carries: an
 * equal `Date`, `Map`, `Set`, `URL`, `RegExp` or typed array keeps its old
 * reference, so a refetch with equal data doesn't re-render. `queryOptions()`
 * and `infiniteOptions()` use it; pass `structuralSharing` to override.
 *
 * @example
 * ```ts
 * new QueryClient({ defaultOptions: { queries: { structuralSharing } } });
 * ```
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export const structuralSharing = <T>(prev: unknown, next: T): T =>
  share(prev, next) as T;
