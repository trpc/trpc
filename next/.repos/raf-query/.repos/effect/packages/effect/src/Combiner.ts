/**
 * Defines reusable rules for merging two values of the same type.
 *
 * A `Combiner<A>` contains one operation, `combine(self, that)`, which returns
 * the merged value. It does not define an initial value for reducing a
 * collection; use a `Reducer` when you need that. This module includes the
 * `Combiner` interface, a constructor for custom combining logic, and common
 * combiners for choosing or ordering values.
 *
 * @since 4.0.0
 */
import type * as Order from "./Order.ts"

/**
 * Represents a strategy for combining two values of the same type `A`. A
 * `Combiner` contains a single `combine` method that takes two values and
 * returns a merged result. It does not include an identity/empty value; use
 * `Reducer` when you need one.
 *
 * **When to use**
 *
 * Use when you need to describe how two values of the same type
 * merge, pass a reusable combining strategy to library functions like
 * `Struct.makeCombiner` or `Option.makeCombinerFailFast`, or define the
 * combining step for a `Reducer`.
 *
 * **Example** (Combining numbers with addition)
 *
 * ```ts import.meta.vitest
 * import { Combiner } from "effect"
 *
 * const Sum = Combiner.make<number>((self, that) => self + that)
 *
 * Sum.combine(3, 4) // => 7
 * ```
 *
 * @see {@link make} – create a `Combiner` from a function
 * @category models
 * @since 4.0.0
 */
export interface Combiner<A> {
  /**
   * Combines two values into a new value.
   *
   * **When to use**
   *
   * Use to merge two values according to this combining strategy.
   */
  readonly combine: (self: A, that: A) => A
}

/**
 * Creates a `Combiner` from a binary function.
 *
 * **When to use**
 *
 * Use when you have a custom combining operation that is not covered by
 * the built-in constructors (`min`, `max`, `first`, `last`, `constant`).
 *
 * **Details**
 *
 * The returned combiner's `combine` method delegates to the provided function.
 * Any purity, associativity, or mutation behavior comes from that function.
 *
 * **Example** (Multiplying numbers)
 *
 * ```ts import.meta.vitest
 * import { Combiner } from "effect"
 *
 * const Product = Combiner.make<number>((self, that) => self * that)
 *
 * Product.combine(3, 5) // => 15
 * ```
 *
 * @see {@link Combiner} – the interface this creates
 * @category constructors
 * @since 4.0.0
 */
export function make<A>(combine: (self: A, that: A) => A): Combiner<A> {
  return { combine }
}

/**
 * Reverses the argument order of a combiner's `combine` method.
 *
 * **When to use**
 *
 * Use when you want the right-hand value to act as the accumulator, or need to
 * reverse a non-commutative combiner such as string concatenation.
 *
 * **Details**
 *
 * Returns a new `Combiner` where `combine(self, that)` calls the original
 * combiner as `combine(that, self)`.
 *
 * **Example** (Reversing string concatenation)
 *
 * ```ts import.meta.vitest
 * import { Combiner, String } from "effect"
 *
 * const Prepend = Combiner.flip(String.ReducerConcat)
 *
 * Prepend.combine("a", "b") // => "ba"
 * ```
 *
 * @see {@link make}
 * @category combinators
 * @since 4.0.0
 */
export function flip<A>(combiner: Combiner<A>): Combiner<A> {
  return make((self, that) => combiner.combine(that, self))
}

/**
 * Creates a `Combiner` that returns the smaller of two values according to
 * the provided `Order`.
 *
 * **When to use**
 *
 * Use when you want to accumulate the minimum value across a collection or
 * build a `Reducer` that tracks the running minimum.
 *
 * **Details**
 *
 * The combiner compares values using the given `Order`. When values are equal,
 * it returns `that` (the second argument).
 *
 * **Example** (Selecting the minimum of two numbers)
 *
 * ```ts import.meta.vitest
 * import { Combiner, Number } from "effect"
 *
 * const Min = Combiner.min(Number.Order)
 *
 * Min.combine(3, 1) // => 1
 * Min.combine(1, 3) // => 1
 * ```
 *
 * @see {@link max}
 * @category constructors
 * @since 4.0.0
 */
export function min<A>(order: Order.Order<A>): Combiner<A> {
  return make((self, that) => order(self, that) === -1 ? self : that)
}

/**
 * Creates a `Combiner` that returns the larger of two values according to
 * the provided `Order`.
 *
 * **When to use**
 *
 * Use when you want to accumulate the maximum value across a collection or
 * build a `Reducer` that tracks the running maximum.
 *
 * **Details**
 *
 * The combiner compares values using the given `Order`. When values are equal,
 * it returns `that` (the second argument).
 *
 * **Example** (Selecting the maximum of two numbers)
 *
 * ```ts import.meta.vitest
 * import { Combiner, Number } from "effect"
 *
 * const Max = Combiner.max(Number.Order)
 *
 * Max.combine(3, 1) // => 3
 * Max.combine(1, 3) // => 3
 * ```
 *
 * @see {@link min}
 * @category constructors
 * @since 4.0.0
 */
export function max<A>(order: Order.Order<A>): Combiner<A> {
  return make((self, that) => order(self, that) === 1 ? self : that)
}

/**
 * Creates a `Combiner` that always returns the first (left) argument.
 *
 * **When to use**
 *
 * Use when you want "first write wins" semantics while merging values.
 *
 * **Details**
 *
 * `combine(self, that)` returns `self` and ignores `that`.
 *
 * **Example** (Keeping the first value)
 *
 * ```ts import.meta.vitest
 * import { Combiner } from "effect"
 *
 * const First = Combiner.first<number>()
 *
 * First.combine(1, 2) // => 1
 * ```
 *
 * @see {@link last}
 * @category constructors
 * @since 4.0.0
 */
export function first<A>(): Combiner<A> {
  return make((self, _) => self)
}

/**
 * Creates a `Combiner` that always returns the last (right) argument.
 *
 * **When to use**
 *
 * Use when you want "last write wins" semantics while merging values.
 *
 * **Details**
 *
 * `combine(self, that)` returns `that` and ignores `self`.
 *
 * **Example** (Keeping the last value)
 *
 * ```ts import.meta.vitest
 * import { Combiner } from "effect"
 *
 * const Last = Combiner.last<number>()
 *
 * Last.combine(1, 2) // => 2
 * ```
 *
 * @see {@link first}
 * @category constructors
 * @since 4.0.0
 */
export function last<A>(): Combiner<A> {
  return make((_, that) => that)
}

/**
 * Creates a `Combiner` that ignores both arguments and always returns the
 * given constant value.
 *
 * **When to use**
 *
 * Use when you need a combiner that always returns a fixed value, including
 * when a generic API requires a combiner but the result is predetermined.
 *
 * **Details**
 *
 * `combine(self, that)` returns the constant `a` and ignores both arguments.
 *
 * **Example** (Always returning zero)
 *
 * ```ts import.meta.vitest
 * import { Combiner } from "effect"
 *
 * const Zero = Combiner.constant(0)
 *
 * Zero.combine(42, 99) // => 0
 * ```
 *
 * @see {@link first}
 * @see {@link last}
 * @category constructors
 * @since 4.0.0
 */
export function constant<A>(a: A): Combiner<A> {
  return make(() => a)
}

/**
 * Wraps a `Combiner` so that a separator value is inserted between every
 * pair of combined elements.
 *
 * **When to use**
 *
 * Use when you need to inject a fixed separator between accumulated values,
 * such as when building delimited strings, paths, or CSV-like output by
 * repeated combination.
 *
 * **Details**
 *
 * `intercalate(middle)(combiner).combine(self, that)` is equivalent to
 * `combiner.combine(self, combiner.combine(middle, that))`. This function is
 * curried: first provide the separator, then the base combiner.
 *
 * **Example** (Joining strings with a separator)
 *
 * ```ts import.meta.vitest
 * import { Combiner, String } from "effect"
 *
 * const commaSep = Combiner.intercalate(",")(String.ReducerConcat)
 *
 * commaSep.combine("a", "b") // => "a,b"
 * ```
 *
 * @see {@link make}
 * @category combinators
 * @since 4.0.0
 */
export function intercalate<A>(middle: A) {
  return (combiner: Combiner<A>): Combiner<A> =>
    make((self, that) => combiner.combine(self, combiner.combine(middle, that)))
}
