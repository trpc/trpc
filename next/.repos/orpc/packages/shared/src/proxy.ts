import type { Value } from './value'
import { getOrBind } from '@standard-server/shared'
import { value } from './value'

/**
 * Creates a proxy that overlays a `partial` object on top of a `target`.
 *
 * - Properties from `partial` take precedence.
 * - Properties not present in `partial` fall back to the resolved `target`.
 * - Methods are bound to the proxy to ensure a consistent `this` context.
 *
 * Useful for overriding specific properties of an object while delegating
 * all other access to the original target without needing to know its full structure.
 */
export function override<T extends object, U extends object>(
  target: Value<T>,
  partial: U,
): U & Omit<T, keyof U> {
  const proxy = new Proxy(typeof target === 'function' ? partial : target, {
    get(_, prop) {
      const targetValue = prop in partial ? partial : value(target)
      return getOrBind(targetValue, prop)
    },
    has(_, prop) {
      return Reflect.has(partial, prop) || Reflect.has(value(target), prop)
    },
  })

  return proxy as any
}
