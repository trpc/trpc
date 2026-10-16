import type { NonEmptyReadonlyArray } from "effect/Array"

/** @internal */
export const isNonEmpty = <A>(a: A | ReadonlyArray<A> | undefined): a is A | NonEmptyReadonlyArray<A> =>
  a !== undefined && !(Array.isArray(a) && a.length === 0)
