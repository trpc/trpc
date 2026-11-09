/**
 * @since 2.0.0
 */

import type { NonEmptyArray } from "../Array.ts"

/** @internal */
export const isArrayNonEmpty = <A>(self: ReadonlyArray<A>): self is NonEmptyArray<A> => self.length > 0

/** @internal */
export function replaceAt<A>(self: ReadonlyArray<A>, index: number, value: A): Array<A> {
  const out = self.slice()
  out[index] = value
  return out
}
