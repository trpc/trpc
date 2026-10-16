import { isPlainObject } from './object'

export function isDeepEqual(a: unknown, b: unknown): boolean {
  return isDeepEqualInternal(a, b, new WeakMap())
}

function isDeepEqualInternal(
  a: unknown,
  b: unknown,
  visited: WeakMap<object, WeakSet<object>>,
): boolean {
  if (Object.is(a, b)) {
    return true
  }

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) {
      return false
    }
  }
  else if (!isPlainObject(a) || !isPlainObject(b)) {
    // Anything else (primitives, Date, RegExp, Map, Set, class instances, ...) is only equal when Object.is above matched:
    // non-plain objects keep their state outside own enumerable keys, so they cannot be compared structurally
    return false
  }

  const aRecord = a as Record<string, unknown>
  const bRecord = b as Record<string, unknown>

  const visitedMatches = visited.get(a)

  if (visitedMatches?.has(b)) {
    return true
  }

  if (visitedMatches) {
    visitedMatches.add(b)
  }
  else {
    visited.set(a, new WeakSet([b]))
  }

  const aKeys = Object.keys(aRecord).filter(k => aRecord[k] !== undefined)
  const bKeys = Object.keys(bRecord).filter(k => bRecord[k] !== undefined)

  if (aKeys.length !== bKeys.length) {
    return false
  }

  for (const key of aKeys) {
    if (!Object.hasOwn(bRecord, key)) {
      return false
    }

    if (!isDeepEqualInternal(aRecord[key], bRecord[key], visited)) {
      return false
    }
  }

  return true
}
