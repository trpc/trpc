/**
 * Whether two values are the same data, for `dedupeLink` to tell
 * identical calls apart. Plain objects (in any key order), arrays, `Map`s,
 * `Set`s, `Date`s, `URL`s, `URLSearchParams`, `Headers`, `RegExp`s and
 * typed arrays compare by content. Anything else, such as a class instance,
 * a `File` or a function, equals only itself: a wrong "no" costs a request,
 * a wrong "yes" hands a caller another call's result.
 * @internal
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  return equal(a, b, new Map());
}

const isPlain = (proto: unknown) =>
  proto === Object.prototype || proto === null;

function sameBytes(a: ArrayBufferView, b: ArrayBufferView): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const y = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  return x.every((byte, i) => byte === y[i]);
}

function equal(
  a: unknown,
  b: unknown,
  seen: Map<object, Set<object>>,
): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (a === null || b === null) return false;
  const proto = Object.getPrototypeOf(a);
  if (proto !== Object.getPrototypeOf(b)) return false;

  // A cycle compares equal once both sides loop back to a pair being compared.
  let pairs = seen.get(a);
  if (pairs?.has(b)) return true;
  if (!pairs) seen.set(a, (pairs = new Set()));
  pairs.add(b);

  if (a instanceof Date) return Object.is(a.getTime(), (b as Date).getTime());
  if (a instanceof URL || a instanceof URLSearchParams) {
    return String(a) === String(b as URL);
  }
  if (a instanceof RegExp) {
    return a.source === (b as RegExp).source && a.flags === (b as RegExp).flags;
  }
  if (a instanceof Headers) return equal([...a], [...(b as Headers)], seen);
  if (ArrayBuffer.isView(a)) return sameBytes(a, b as ArrayBufferView);
  if (a instanceof ArrayBuffer) {
    return sameBytes(new Uint8Array(a), new Uint8Array(b as ArrayBuffer));
  }
  if (a instanceof Map) {
    const other = b as Map<unknown, unknown>;
    if (a.size !== other.size) return false;
    for (const [key, value] of a) {
      if (!other.has(key) || !equal(value, other.get(key), seen)) return false;
    }
    return true;
  }
  if (a instanceof Set) {
    const other = b as Set<unknown>;
    if (a.size !== other.size) return false;
    for (const value of a) if (!other.has(value)) return false;
    return true;
  }
  if (Array.isArray(a)) {
    const other = b as unknown[];
    if (a.length !== other.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (i in a !== i in other || !equal(a[i], other[i], seen)) return false;
    }
    return true;
  }
  if (!isPlain(proto)) return false;
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = Object.keys(x);
  if (keys.length !== Object.keys(y).length) return false;
  return keys.every(
    (key) => Object.hasOwn(y, key) && equal(x[key], y[key], seen),
  );
}
