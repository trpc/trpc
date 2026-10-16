/**
 * The standard result of comparing two values. An `Ordering` is `-1` when the
 * first value is less than the second, `0` when both values compare as equal,
 * and `1` when the first value is greater than the second. This module also
 * provides helpers for reversing an ordering, matching on the three cases, and
 * combining ordered comparison results with a reducer.
 *
 * @since 2.0.0
 */
import type { LazyArg } from "./Function.ts"
import { dual } from "./Function.ts"
import * as Reducer_ from "./Reducer.ts"

/**
 * Represents the result of comparing two values.
 *
 * **When to use**
 *
 * Use to model a normalized comparison result that is exactly less than,
 * equal to, or greater than.
 *
 * **Details**
 *
 * - `-1` indicates the first value is less than the second
 * - `0` indicates the values are equal
 * - `1` indicates the first value is greater than the second
 *
 * **Example** (Defining comparison results)
 *
 * ```ts import.meta.vitest
 * import type { Ordering } from "effect"
 *
 * // Custom comparison function
 * const compareNumbers = (a: number, b: number): Ordering.Ordering => {
 *   if (a < b) return -1
 *   if (a > b) return 1
 *   return 0
 * }
 *
 * compareNumbers(5, 10) // => -1
 * compareNumbers(10, 5) // => 1
 * compareNumbers(5, 5) // => 0
 *
 * // Using with string comparison
 * const compareStrings = (a: string, b: string): Ordering.Ordering => {
 *   return a.localeCompare(b) as Ordering.Ordering
 * }
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export type Ordering = -1 | 0 | 1

/**
 * Reverses the ordering of the input Ordering.
 * This is useful for creating descending sort orders from ascending ones.
 *
 * **When to use**
 *
 * Use to flip an ordering result when reversing sort direction or comparison
 * priority.
 *
 * **Example** (Reversing comparison order)
 *
 * ```ts import.meta.vitest
 * import { Ordering } from "effect"
 *
 * // Basic reversal
 * Ordering.reverse(1) // => -1
 * Ordering.reverse(-1) // => 1
 * Ordering.reverse(0) // => 0
 *
 * // Creating descending sort from ascending comparison
 * const compareNumbers = (a: number, b: number): Ordering.Ordering =>
 *   a < b ? -1 : a > b ? 1 : 0
 *
 * const compareDescending = (a: number, b: number): Ordering.Ordering =>
 *   Ordering.reverse(compareNumbers(a, b))
 *
 * const numbers = [3, 1, 4, 1, 5]
 * numbers.sort(compareNumbers) // [1, 1, 3, 4, 5] (ascending)
 * numbers.sort(compareDescending) // [5, 4, 3, 1, 1] (descending)
 *
 * // Useful for toggling sort direction
 * const createSorter = (ascending: boolean) => (a: number, b: number) => {
 *   const ordering = compareNumbers(a, b)
 *   return ascending ? ordering : Ordering.reverse(ordering)
 * }
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const reverse = (o: Ordering): Ordering => (o === -1 ? 1 : o === 1 ? -1 : 0)

/**
 * Matches an `Ordering` value and returns the branch selected by that ordering.
 *
 * **When to use**
 *
 * Use to branch on the three possible comparison outcomes in one expression.
 *
 * **Example** (Pattern matching on orderings)
 *
 * ```ts import.meta.vitest
 * import { Function, Ordering } from "effect"
 *
 * const toMessage = Ordering.match({
 *   onLessThan: Function.constant("less than"),
 *   onEqual: Function.constant("equal"),
 *   onGreaterThan: Function.constant("greater than")
 * })
 *
 * toMessage(-1) // => "less than"
 * toMessage(0) // => "equal"
 * toMessage(1) // => "greater than"
 * ```
 *
 * @category pattern matching
 * @since 2.0.0
 */
export const match: {
  <A, B, C = B>(
    options: {
      readonly onLessThan: LazyArg<A>
      readonly onEqual: LazyArg<B>
      readonly onGreaterThan: LazyArg<C>
    }
  ): (self: Ordering) => A | B | C
  <A, B, C = B>(
    o: Ordering,
    options: {
      readonly onLessThan: LazyArg<A>
      readonly onEqual: LazyArg<B>
      readonly onGreaterThan: LazyArg<C>
    }
  ): A | B | C
} = dual(2, <A, B, C = B>(
  self: Ordering,
  { onEqual, onGreaterThan, onLessThan }: {
    readonly onLessThan: LazyArg<A>
    readonly onEqual: LazyArg<B>
    readonly onGreaterThan: LazyArg<C>
  }
): A | B | C => self === -1 ? onLessThan() : self === 0 ? onEqual() : onGreaterThan())

/**
 * Reducer for combining `Ordering`s.
 *
 * **When to use**
 *
 * Use to combine multiple comparison results in priority order, such as
 * checking secondary criteria only when earlier criteria compare as equal.
 *
 * **Details**
 *
 * If any of the `Ordering`s is non-zero, the result is the first non-zero `Ordering`.
 * If all the `Ordering`s are zero, the result is zero.
 *
 * **Gotchas**
 *
 * `combineAll` stops consuming the iterable as soon as it finds a non-zero
 * `Ordering`.
 *
 * @category ordering
 * @since 4.0.0
 */
export const Reducer: Reducer_.Reducer<Ordering> = Reducer_.make<Ordering>(
  (self, that) => self !== 0 ? self : that,
  0,
  (collection) => {
    let ordering: Ordering = 0
    for (ordering of collection) {
      if (ordering !== 0) {
        return ordering
      }
    }
    return ordering
  }
)
