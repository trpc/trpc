/**
 * Reusable strategies for reducing many values into one value. A `Reducer<A>`
 * extends `Combiner.Combiner` with an `initialValue` for empty collections and
 * a `combineAll` method for folding an entire iterable. This module provides a
 * constructor for reducers and a helper for reversing the order in which values
 * are combined.
 *
 * @since 4.0.0
 */

import type * as Combiner from "./Combiner.ts"

/**
 * Represents a strategy for reducing a collection of values of type `A` into
 * a single result.
 *
 * **When to use**
 *
 * Use when you need to fold/reduce a collection into a single value.
 * - You want a reusable reducing strategy that can be passed to library
 *   functions like `Struct.makeReducer`, `Option.makeReducer`, or
 *   `Record.makeReducerUnion`.
 * - You need both the combining logic *and* a known starting value.
 *
 * **Details**
 *
 * Extends {@link Combiner.Combiner} with:
 *
 * - `initialValue` – the identity/neutral element for `combine`.
 * - `combineAll` – folds an entire `Iterable<A>` from `initialValue`.
 *
 * Many modules ship pre-built reducers:
 *
 * - `Number.ReducerSum`, `Number.ReducerMultiply`
 * - `String.ReducerConcat`
 * - `Boolean.ReducerAnd`, `Boolean.ReducerOr`
 *
 * **Example** (String concatenation reducer)
 *
 * ```ts import.meta.vitest
 * import { Reducer } from "effect"
 *
 * const Concat = Reducer.make<string>((a, b) => a + b, "")
 *
 * Concat.combineAll(["hello", " ", "world"]) // => "hello world"
 * ```
 *
 * @see {@link make} – create a `Reducer` from a function and initial value
 * @see {@link Combiner.Combiner} – parent interface without `initialValue`
 *
 * @category models
 * @since 4.0.0
 */
export interface Reducer<A> extends Combiner.Combiner<A> {
  /**
   * Neutral starting value (combining with this changes nothing).
   *
   * **When to use**
   *
   * Use to seed a reduction and represent the result of reducing an empty collection.
   */
  readonly initialValue: A

  /**
   * Combines all values in the collection, starting from `initialValue`.
   *
   * **When to use**
   *
   * Use to reduce an iterable with this reducer's initial value and combining operation.
   */
  readonly combineAll: (collection: Iterable<A>) => A
}

/**
 * Creates a `Reducer` from a `combine` function and an `initialValue`.
 *
 * **When to use**
 *
 * Use when you have a custom reducing operation not covered by a pre-built reducer.
 * - You want to provide an optimized `combineAll` (e.g. short-circuiting on
 *   a known absorbing element like `0` for multiplication).
 *
 * **Details**
 *
 * - If `combineAll` is omitted, a default left-to-right fold starting from
 *   `initialValue` is used.
 * - If `combineAll` is provided, it completely replaces the default fold.
 *
 * **Example** (Multiplying with short-circuit)
 *
 * ```ts import.meta.vitest
 * import { Reducer } from "effect"
 *
 * const Product = Reducer.make<number>(
 *   (a, b) => a * b,
 *   1,
 *   (collection) => {
 *     let acc = 1
 *     for (const n of collection) {
 *       if (n === 0) return 0
 *       acc *= n
 *     }
 *     return acc
 *   }
 * )
 *
 * Product.combineAll([2, 3, 4]) // => 24
 * Product.combineAll([2, 0, 4]) // => 0
 * ```
 *
 * @see {@link Reducer} – the interface this creates
 * @see {@link flip} – reverse the argument order
 *
 * @category constructors
 * @since 4.0.0
 */
export function make<A>(
  combine: (self: A, that: A) => A,
  initialValue: A,
  combineAll?: (collection: Iterable<A>) => A
): Reducer<A> {
  return {
    combine,
    initialValue,
    combineAll: combineAll ??
      ((collection) => {
        let out = initialValue
        for (const value of collection) {
          out = combine(out, value)
        }
        return out
      })
  }
}

/**
 * Reverses the argument order of a reducer's `combine` method.
 *
 * **When to use**
 *
 * Use when you want the right-hand value to act as the accumulator, or need to
 * reverse a non-commutative reducer such as string concatenation.
 *
 * **Details**
 *
 * - Returns a new `Reducer` where `combine(self, that)` calls the original
 *   reducer as `combine(that, self)`.
 * - The `initialValue` is preserved from the original reducer.
 * - The `combineAll` is re-derived from the flipped `combine` (using the
 *   default left-to-right fold), not carried over from the original.
 *
 * **Example** (Reversing string concatenation)
 *
 * ```ts import.meta.vitest
 * import { Reducer, String } from "effect"
 *
 * const Prepend = Reducer.flip(String.ReducerConcat)
 *
 * Prepend.combine("a", "b") // => "ba"
 * Prepend.combineAll(["a", "b", "c"]) // => "cba"
 * ```
 *
 * @see {@link make}
 * @see {@link Combiner.flip} – the same operation on a plain `Combiner`
 *
 * @category combinators
 * @since 4.0.0
 */
export function flip<A>(reducer: Reducer<A>): Reducer<A> {
  return make((self, that) => reducer.combine(that, self), reducer.initialValue)
}
