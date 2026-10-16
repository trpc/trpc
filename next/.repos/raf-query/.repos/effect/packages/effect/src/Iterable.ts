/**
 * Works with JavaScript values that implement `[Symbol.iterator]`.
 *
 * Iterables include arrays, strings, generators, sets, and custom lazy
 * sequences. The helpers in this module let code transform, search, group, and
 * fold iterable values while preserving the input as an iterable instead of
 * forcing an array first.
 *
 * @since 2.0.0
 */

import type { NonEmptyArray } from "./Array.ts"
import * as Equal from "./Equal.ts"
import { dual } from "./Function.ts"
import * as Count from "./internal/count.ts"
import * as InternalRecord from "./internal/record.ts"
import type { Option } from "./Option.ts"
import * as O from "./Option.ts"
import { isBoolean } from "./Predicate.ts"
import type * as Record from "./Record.ts"
import type { Result } from "./Result.ts"
import * as R from "./Result.ts"
import * as Tuple from "./Tuple.ts"
import type { NoInfer } from "./Types.ts"

/**
 * Creates an iterable by applying a function to consecutive integers.
 *
 * **Details**
 *
 * The function is called with each index starting from `0`. If a length is
 * provided, it is rounded down and normalized to at least `1`, with `NaN`
 * treated as `1`. If no length is specified, the iterable is infinite.
 *
 * **Example** (Generating values by index)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * // Generate first 5 even numbers
 * const evens = Iterable.makeBy((n) => n * 2, { length: 5 })
 * Array.from(evens) // => [0, 2, 4, 6, 8]
 *
 * // Generate squares
 * const squares = Iterable.makeBy((n) => n * n, { length: 4 })
 * Array.from(squares) // => [0, 1, 4, 9]
 *
 * // Infinite sequence (be careful when consuming!)
 * const naturals = Iterable.makeBy((n) => n)
 * const first10 = Iterable.take(naturals, 10)
 * Array.from(first10) // => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const makeBy = <A>(f: (i: number) => A, options?: {
  readonly length?: number
}): Iterable<A> => {
  const max = options?.length !== undefined ? Count.normalizeNonEmpty(options.length) : Infinity
  return {
    [Symbol.iterator]() {
      let i = 0
      return {
        next(): IteratorResult<A> {
          if (i < max) {
            return { value: f(i++), done: false }
          }
          return { done: true, value: undefined }
        }
      }
    }
  }
}

/**
 * Returns an iterable of integers starting at `start` and increasing by `1`.
 *
 * **Details**
 *
 * When `end` is provided and `start <= end`, both endpoints are included. When
 * `end` is omitted, the iterable is unbounded. When `start > end`, the
 * iterable contains only `start`.
 *
 * **Example** (Creating a range)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * Array.from(Iterable.range(1, 3)) // => [1, 2, 3]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const range = (start: number, end?: number): Iterable<number> => {
  if (end === undefined) {
    return makeBy((i) => start + i)
  }
  return makeBy((i) => start + i, {
    length: start <= end ? end - start + 1 : 1
  })
}

/**
 * Returns a `Iterable` containing a value repeated the specified number of times.
 *
 * **Details**
 *
 * `n` is rounded down and normalized to an integer greater than or equal to
 * `1`. `NaN` is treated as `1`.
 *
 * **Example** (Repeating a value)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * Array.from(Iterable.replicate("a", 3)) // => ["a", "a", "a"]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const replicate: {
  (n: number): <A>(a: A) => Iterable<A>
  <A>(a: A, n: number): Iterable<A>
} = dual(2, <A>(a: A, n: number): Iterable<A> => makeBy(() => a, { length: n }))

/**
 * Repeats an iterable `n` times, yielding the full contents of `self` for each
 * repetition.
 *
 * **When to use**
 *
 * Use to repeat an iterable's contents a specific number of times.
 *
 * **Details**
 *
 * The result is lazy. `n` is rounded down and normalized to at least `1`, with
 * `NaN` treated as `1`. Each repetition obtains a new iterator from `self`.
 *
 * @see {@link forever} for repeating without an upper bound
 * @see {@link replicate} for repeating a single value
 * @category constructors
 * @since 4.0.0
 */
export const repeat: {
  (n: number): <A>(self: Iterable<A>) => Iterable<A>
  <A>(self: Iterable<A>, n: number): Iterable<A>
} = dual(2, <A>(self: Iterable<A>, n: number): Iterable<A> => flatten(makeBy(() => self, { length: n })))

/**
 * Repeats an iterable without an upper bound.
 *
 * **When to use**
 *
 * Use to cycle a reusable iterable without an upper bound when a downstream
 * consumer controls how many values are taken.
 *
 * **Gotchas**
 *
 * The returned iterable is lazy and should usually be bounded with `take` or
 * another terminating consumer before materializing it.
 *
 * @see {@link repeat} for repeating an iterable a specific number of times
 * @see {@link take} for bounding the unbounded result before materializing it
 *
 * @category constructors
 * @since 4.0.0
 */
export const forever = <A>(self: Iterable<A>): Iterable<A> => repeat(self, Infinity)

/**
 * Takes a record and returns an Iterable of tuples containing its keys and values.
 *
 * **Example** (Converting a record to entries)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * const x = { a: 1, b: 2, c: 3 }
 * Array.from(Iterable.fromRecord(x)) // => [["a", 1], ["b", 2], ["c", 3]]
 * ```
 *
 * @category converting
 * @since 2.0.0
 */
export const fromRecord = <K extends string, A>(self: Readonly<Record<K, A>>): Iterable<[K, A]> => ({
  *[Symbol.iterator]() {
    for (const key in self) {
      if (Object.hasOwn(self, key)) {
        yield [key, self[key]]
      }
    }
  }
})

/**
 * Prepends an element to the front of an `Iterable`, creating a new `Iterable`.
 *
 * **Example** (Prepending an element)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * const numbers = [2, 3, 4]
 * const withOne = Iterable.prepend(numbers, 1)
 * Array.from(withOne) // => [1, 2, 3, 4]
 *
 * // Works with any iterable
 * const letters = "abc"
 * const withZ = Iterable.prepend(letters, "z")
 * Array.from(withZ) // => ["z", "a", "b", "c"]
 * ```
 *
 * @category combining
 * @since 2.0.0
 */
export const prepend: {
  <B>(head: B): <A>(self: Iterable<A>) => Iterable<A | B>
  <A, B>(self: Iterable<A>, head: B): Iterable<A | B>
} = dual(2, <A, B>(self: Iterable<A>, head: B): Iterable<A | B> => prependAll(self, [head]))

/**
 * Prepends the specified prefix iterable to the beginning of the specified iterable.
 *
 * **Example** (Prepending another iterable)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * Array.from(Iterable.prependAll([1, 2], ["a", "b"])) // => ["a", "b", 1, 2]
 * ```
 *
 * @category combining
 * @since 2.0.0
 */
export const prependAll: {
  <B>(that: Iterable<B>): <A>(self: Iterable<A>) => Iterable<A | B>
  <A, B>(self: Iterable<A>, that: Iterable<B>): Iterable<A | B>
} = dual(
  2,
  <A, B>(self: Iterable<A>, that: Iterable<B>): Iterable<A | B> => appendAll(that, self)
)

/**
 * Appends an element to the end of an `Iterable`, creating a new `Iterable`.
 *
 * **When to use**
 *
 * Use to add one element after all elements of an iterable while keeping the
 * result as a lazy `Iterable`.
 *
 * **Details**
 *
 * The result yields every element from `self` first, then yields `last` after
 * `self` is exhausted.
 *
 * **Gotchas**
 *
 * If `self` is infinite or never completes, the appended element is never
 * reached.
 *
 * **Example** (Appending an element)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * const numbers = [1, 2, 3]
 * Array.from(Iterable.append(numbers, 4)) // => [1, 2, 3, 4]
 * ```
 *
 * @see {@link prepend} for adding one element before the existing elements
 * @see {@link appendAll} for appending all elements from another iterable
 *
 * @category combining
 * @since 2.0.0
 */
export const append: {
  <B>(last: B): <A>(self: Iterable<A>) => Iterable<A | B>
  <A, B>(self: Iterable<A>, last: B): Iterable<A | B>
} = dual(2, <A, B>(self: Iterable<A>, last: B): Iterable<A | B> => appendAll(self, [last]))

/**
 * Concatenates two iterables, combining their elements.
 *
 * **When to use**
 *
 * Use to lazily concatenate two iterables while preserving order, yielding all
 * elements from `self` before `that`.
 *
 * **Details**
 *
 * The result is lazy. The iterator for `that` is not created or read until
 * `self` is exhausted.
 *
 * **Gotchas**
 *
 * If `self` is infinite or never completes, `that` is never reached.
 *
 * **Example** (Concatenating iterables)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * Array.from(Iterable.appendAll([1, 2, 3], [4, 5, 6])) // => [1, 2, 3, 4, 5, 6]
 *
 * // Works with different iterable types
 * const numbers = [1, 2]
 * const letters = "abc"
 * const mixed = Iterable.appendAll(numbers, letters)
 * Array.from(mixed) // => [1, 2, "a", "b", "c"]
 *
 * // Lazy evaluation - only consumes what's needed
 * const infinite = Iterable.range(1)
 * const finite = [0, -1, -2]
 * Array.from(Iterable.take(Iterable.appendAll(finite, infinite), 5)) // => [0, -1, -2, 1, 2]
 * ```
 *
 * @see {@link append} for appending one value instead of another iterable
 * @see {@link prependAll} for yielding another iterable before `self`
 *
 * @category combining
 * @since 2.0.0
 */
export const appendAll: {
  <B>(that: Iterable<B>): <A>(self: Iterable<A>) => Iterable<A | B>
  <A, B>(self: Iterable<A>, that: Iterable<B>): Iterable<A | B>
} = dual(
  2,
  <A, B>(self: Iterable<A>, that: Iterable<B>): Iterable<A | B> => ({
    [Symbol.iterator]() {
      const iterA = self[Symbol.iterator]()
      let doneA = false
      let iterB: Iterator<B>
      return {
        next() {
          if (!doneA) {
            const r = iterA.next()
            if (r.done) {
              doneA = true
              iterB = that[Symbol.iterator]()
              return iterB.next()
            }
            return r
          }
          return iterB.next()
        }
      }
    }
  })
)

/**
 * Reduces an `Iterable` from the left, keeping all intermediate results instead of only the final result.
 *
 * **Example** (Tracking running results)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * // Running sum of numbers
 * const numbers = [1, 2, 3, 4, 5]
 * const runningSum = Iterable.scan(numbers, 0, (acc, n) => acc + n)
 * Array.from(runningSum) // => [0, 1, 3, 6, 10, 15]
 *
 * // Build strings progressively
 * const letters = ["a", "b", "c"]
 * const progressive = Iterable.scan(letters, "", (acc, letter) => acc + letter)
 * Array.from(progressive) // => ["", "a", "ab", "abc"]
 *
 * // Track maximum values seen so far
 * const values = [3, 1, 4, 1, 5, 9, 2]
 * const runningMax = Iterable.scan(values, -Infinity, Math.max)
 * Array.from(runningMax) // => [-Infinity, 3, 3, 4, 4, 5, 9, 9]
 * ```
 *
 * @category folding
 * @since 2.0.0
 */
export const scan: {
  <B, A>(b: B, f: (b: B, a: A) => B): (self: Iterable<A>) => Iterable<B>
  <A, B>(self: Iterable<A>, b: B, f: (b: B, a: A) => B): Iterable<B>
} = dual(3, <A, B>(self: Iterable<A>, b: B, f: (b: B, a: A) => B): Iterable<B> => ({
  [Symbol.iterator]() {
    let acc = b
    let iterator: Iterator<A> | undefined
    function next() {
      if (iterator === undefined) {
        iterator = self[Symbol.iterator]()
        return { done: false, value: acc }
      }
      const result = iterator.next()
      if (result.done) {
        return result
      }
      acc = f(acc, result.value)
      return { done: false, value: acc }
    }
    return { next }
  }
}))

/**
 * Checks whether an `Iterable` is empty.
 *
 * **Example** (Checking for emptiness)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * Iterable.isEmpty([]) // => true
 * Iterable.isEmpty([1, 2, 3]) // => false
 * ```
 *
 * @category guards
 * @since 2.0.0
 */
export const isEmpty = <A>(self: Iterable<A>): self is Iterable<never> => {
  const iterator = self[Symbol.iterator]()
  return iterator.next().done === true
}

/**
 * Returns the number of elements in a `Iterable`.
 *
 * **Example** (Counting iterable elements)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * const numbers = [1, 2, 3, 4, 5]
 * Iterable.size(numbers) // => 5
 *
 * const empty = Iterable.empty<number>()
 * Iterable.size(empty) // => 0
 *
 * // Works with any iterable
 * const letters = "hello"
 * Iterable.size(letters) // => 5
 *
 * // Note: This consumes the entire iterable
 * const range = Iterable.range(1, 100)
 * Iterable.size(range) // => 100
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const size = <A>(self: Iterable<A>): number => {
  const iterator = self[Symbol.iterator]()
  let count = 0
  while (!iterator.next().done) {
    count++
  }
  return count
}

/**
 * Gets the first element of a `Iterable` safely, or `None` if the `Iterable` is empty.
 *
 * **Example** (Getting the first element)
 *
 * ```ts import.meta.vitest
 * import { Iterable, Option } from "effect"
 *
 * const numbers = [1, 2, 3]
 * Iterable.head(numbers) // => Option.some(1)
 *
 * const empty = Iterable.empty<number>()
 * Iterable.head(empty) // => Option.none()
 *
 * // Safe way to get first element
 * const firstEven = Iterable.head(
 *   Iterable.filter([1, 3, 4, 5], (x) => x % 2 === 0)
 * )
 * firstEven // => Option.some(4)
 *
 * // Use with Option methods
 * const doubled = Option.map(Iterable.head([5, 10, 15]), (x) => x * 2)
 * doubled // => Option.some(10)
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const head = <A>(self: Iterable<A>): Option<A> => {
  const iterator = self[Symbol.iterator]()
  const result = iterator.next()
  return result.done ? O.none() : O.some(result.value)
}

/**
 * Gets the first element of an `Iterable` without returning an `Option`.
 *
 * **When to use**
 *
 * Use when the `Iterable` is known to be non-empty and direct access to the
 * first element is preferred over handling `Option.none`.
 *
 * **Gotchas**
 *
 * Throws if the `Iterable` is empty.
 *
 * **Example** (Getting the first element unsafely)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * const numbers = [1, 2, 3]
 * Iterable.headUnsafe(numbers) // => 1
 *
 * const letters = "hello"
 * Iterable.headUnsafe(letters) // => "h"
 *
 * // Iterable.headUnsafe(Iterable.empty<number>())
 * // throws Error: "headUnsafe: empty iterable"
 *
 * // Use only when you're certain the iterable is non-empty
 * const nonEmpty = Iterable.range(1, 10)
 * Iterable.headUnsafe(nonEmpty) // => 1
 * ```
 *
 * @category getters
 * @since 4.0.0
 */
export const headUnsafe = <A>(self: Iterable<A>): A => {
  const iterator = self[Symbol.iterator]()
  const result = iterator.next()
  if (result.done) throw new Error("headUnsafe: empty iterable")
  return result.value
}

/**
 * Keeps only a max number of elements from the start of an `Iterable`, creating a new `Iterable`.
 *
 * **Details**
 *
 * `n` is rounded down and normalized to a non-negative integer. `NaN` is
 * treated as `0`.
 *
 * **Example** (Taking from the start)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * const numbers = [1, 2, 3, 4, 5]
 * const firstThree = Iterable.take(numbers, 3)
 * Array.from(firstThree) // => [1, 2, 3]
 *
 * // Taking more than available returns all elements
 * const firstTen = Iterable.take(numbers, 10)
 * Array.from(firstTen) // => [1, 2, 3, 4, 5]
 *
 * // Taking 0 or negative returns empty
 * const none = Iterable.take(numbers, 0)
 * Array.from(none) // => []
 *
 * // Useful with infinite iterables
 * const naturals = Iterable.range(1)
 * const firstFive = Iterable.take(naturals, 5)
 * Array.from(firstFive) // => [1, 2, 3, 4, 5]
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const take: {
  (n: number): <A>(self: Iterable<A>) => Iterable<A>
  <A>(self: Iterable<A>, n: number): Iterable<A>
} = dual(2, <A>(self: Iterable<A>, n: number): Iterable<A> => {
  const count = Count.normalize(n)
  return {
    [Symbol.iterator]() {
      let i = 0
      const iterator = self[Symbol.iterator]()
      return {
        next() {
          if (i < count) {
            i++
            return iterator.next()
          }
          return { done: true, value: undefined }
        }
      }
    }
  }
})

/**
 * Takes the longest initial `Iterable` prefix for which all elements satisfy the
 * specified predicate.
 *
 * **Example** (Taking while a predicate holds)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * const numbers = [2, 4, 6, 8, 3, 10, 12]
 * const evenPrefix = Iterable.takeWhile(numbers, (x) => x % 2 === 0)
 * Array.from(evenPrefix) // => [2, 4, 6, 8]
 *
 * // With index
 * const letters = ["a", "b", "c", "d", "e"]
 * const firstThreeByIndex = Iterable.takeWhile(letters, (_, i) => i < 3)
 * Array.from(firstThreeByIndex) // => ["a", "b", "c"]
 *
 * // Stops at first non-matching element
 * const mixed = [1, 3, 5, 4, 7, 9]
 * const oddPrefix = Iterable.takeWhile(mixed, (x) => x % 2 === 1)
 * Array.from(oddPrefix) // => [1, 3, 5]
 *
 * // Type refinement
 * const values: Array<string | number> = ["a", "b", "c", 1, "d"]
 * const stringPrefix = Iterable.takeWhile(
 *   values,
 *   (x): x is string => typeof x === "string"
 * )
 * Array.from(stringPrefix) // => ["a", "b", "c"]
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const takeWhile: {
  <A, B extends A>(refinement: (a: NoInfer<A>, i: number) => a is B): (self: Iterable<A>) => Iterable<B>
  <A>(predicate: (a: NoInfer<A>, i: number) => boolean): (self: Iterable<A>) => Iterable<A>
  <A, B extends A>(self: Iterable<A>, refinement: (a: A, i: number) => a is B): Iterable<B>
  <A>(self: Iterable<A>, predicate: (a: A, i: number) => boolean): Iterable<A>
} = dual(2, <A>(self: Iterable<A>, predicate: (a: A, i: number) => boolean): Iterable<A> => ({
  [Symbol.iterator]() {
    const iterator = self[Symbol.iterator]()
    let i = 0
    return {
      next() {
        const result = iterator.next()
        if (result.done || !predicate(result.value, i++)) {
          return { done: true, value: undefined }
        }
        return result
      }
    }
  }
}))

/**
 * Drops a max number of elements from the start of an `Iterable`
 *
 * **Details**
 *
 * `n` is rounded down and normalized to a non-negative integer. `NaN` is
 * treated as `0`.
 *
 * **Example** (Dropping from the start)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * const numbers = [1, 2, 3, 4, 5]
 * const withoutFirstTwo = Iterable.drop(numbers, 2)
 * Array.from(withoutFirstTwo) // => [3, 4, 5]
 *
 * // Dropping more than available returns empty
 * const withoutFirstTen = Iterable.drop(numbers, 10)
 * Array.from(withoutFirstTen) // => []
 *
 * // Dropping 0 or negative returns all elements
 * const all = Iterable.drop(numbers, 0)
 * Array.from(all) // => [1, 2, 3, 4, 5]
 *
 * // Combine with take for slicing
 * const slice = Iterable.take(Iterable.drop(numbers, 1), 3)
 * Array.from(slice) // => [2, 3, 4]
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const drop: {
  (n: number): <A>(self: Iterable<A>) => Iterable<A>
  <A>(self: Iterable<A>, n: number): Iterable<A>
} = dual(2, <A>(self: Iterable<A>, n: number): Iterable<A> => {
  const count = Count.normalize(n)
  return {
    [Symbol.iterator]() {
      const iterator = self[Symbol.iterator]()
      let i = 0
      return {
        next() {
          while (i < count) {
            const result = iterator.next()
            if (result.done) {
              return { done: true, value: undefined }
            }
            i++
          }
          return iterator.next()
        }
      }
    }
  }
})

/**
 * Returns the first element that satisfies the specified
 * predicate, or `None` if no such element exists.
 *
 * **Example** (Finding the first match)
 *
 * ```ts import.meta.vitest
 * import { Iterable, Option } from "effect"
 *
 * const numbers = [1, 3, 4, 6, 8]
 * const firstEven = Iterable.findFirst(numbers, (x) => x % 2 === 0)
 * firstEven // => Option.some(4)
 *
 * const firstGreaterThan10 = Iterable.findFirst(numbers, (x) => x > 10)
 * firstGreaterThan10 // => Option.none()
 *
 * // With index
 * const letters = ["a", "b", "c", "d"]
 * const atEvenIndex = Iterable.findFirst(letters, (_, i) => i % 2 === 0)
 * atEvenIndex // => Option.some("a")
 *
 * // Type refinement
 * const mixed: Array<string | number> = [1, "hello", 2, "world"]
 * const firstString = Iterable.findFirst(
 *   mixed,
 *   (x): x is string => typeof x === "string"
 * )
 * firstString // => Option.some("hello")
 *
 * // Transform during search
 * const findSquareRoot = Iterable.findFirst([1, 4, 9, 16], (x) => {
 *   const sqrt = Math.sqrt(x)
 *   return Number.isInteger(sqrt) ? Option.some(sqrt) : Option.none()
 * })
 * findSquareRoot // => Option.some(1)
 * ```
 *
 * @category searching
 * @since 2.0.0
 */
export const findFirst: {
  <A, B>(f: (a: NoInfer<A>, i: number) => Option<B>): (self: Iterable<A>) => Option<B>
  <A, B extends A>(refinement: (a: NoInfer<A>, i: number) => a is B): (self: Iterable<A>) => Option<B>
  <A>(predicate: (a: NoInfer<A>, i: number) => boolean): (self: Iterable<A>) => Option<A>
  <A, B>(self: Iterable<A>, f: (a: A, i: number) => Option<B>): Option<B>
  <A, B extends A>(self: Iterable<A>, refinement: (a: A, i: number) => a is B): Option<B>
  <A>(self: Iterable<A>, predicate: (a: A, i: number) => boolean): Option<A>
} = dual(
  2,
  <A>(self: Iterable<A>, f: ((a: A, i: number) => boolean) | ((a: A, i: number) => Option<A>)): Option<A> => {
    let i = 0
    for (const a of self) {
      const o = f(a, i)
      if (isBoolean(o)) {
        if (o) {
          return O.some(a)
        }
      } else {
        if (O.isSome(o)) {
          return o
        }
      }
      i++
    }
    return O.none()
  }
)

/**
 * Finds the last element for which a predicate holds.
 *
 * **Example** (Finding the last match)
 *
 * ```ts import.meta.vitest
 * import { Iterable, Option } from "effect"
 *
 * const numbers = [1, 3, 4, 6, 8, 2]
 * const lastEven = Iterable.findLast(numbers, (x) => x % 2 === 0)
 * lastEven // => Option.some(2)
 *
 * const lastGreaterThan10 = Iterable.findLast(numbers, (x) => x > 10)
 * lastGreaterThan10 // => Option.none()
 *
 * // With index
 * const letters = ["a", "b", "c", "d", "e"]
 * const lastAtEvenIndex = Iterable.findLast(letters, (_, i) => i % 2 === 0)
 * lastAtEvenIndex // => Option.some("e")
 *
 * // Type refinement
 * const mixed: Array<string | number> = [1, "hello", 2, "world", 3]
 * const lastString = Iterable.findLast(
 *   mixed,
 *   (x): x is string => typeof x === "string"
 * )
 * lastString // => Option.some("world")
 * ```
 *
 * @category searching
 * @since 2.0.0
 */
export const findLast: {
  <A, B>(f: (a: NoInfer<A>, i: number) => Option<B>): (self: Iterable<A>) => Option<B>
  <A, B extends A>(refinement: (a: NoInfer<A>, i: number) => a is B): (self: Iterable<A>) => Option<B>
  <A>(predicate: (a: NoInfer<A>, i: number) => boolean): (self: Iterable<A>) => Option<A>
  <A, B>(self: Iterable<A>, f: (a: A, i: number) => Option<B>): Option<B>
  <A, B extends A>(self: Iterable<A>, refinement: (a: A, i: number) => a is B): Option<B>
  <A>(self: Iterable<A>, predicate: (a: A, i: number) => boolean): Option<A>
} = dual(
  2,
  <A>(self: Iterable<A>, f: ((a: A, i: number) => boolean) | ((a: A, i: number) => Option<A>)): Option<A> => {
    let i = 0
    let last: Option<A> = O.none()
    for (const a of self) {
      const o = f(a, i)
      if (isBoolean(o)) {
        if (o) {
          last = O.some(a)
        }
      } else {
        if (O.isSome(o)) {
          last = o
        }
      }
      i++
    }
    return last
  }
)

/**
 * Takes two `Iterable`s and returns an `Iterable` of corresponding pairs.
 *
 * **Example** (Zipping iterables)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * const numbers = [1, 2, 3]
 * const letters = ["a", "b", "c"]
 * const zipped = Iterable.zip(numbers, letters)
 * Array.from(zipped) // => [[1, "a"], [2, "b"], [3, "c"]]
 *
 * // Different lengths - shorter one determines result length
 * const short = [1, 2]
 * const long = ["a", "b", "c", "d"]
 * const partial = Iterable.zip(short, long)
 * Array.from(partial) // => [[1, "a"], [2, "b"]]
 *
 * // Works with any iterables
 * const range = Iterable.range(1, 3)
 * const word = "abc"
 * const mixed = Iterable.zip(range, word)
 * Array.from(mixed) // => [[1, "a"], [2, "b"], [3, "c"]]
 *
 * // Create indexed pairs
 * const values = ["apple", "banana", "cherry"]
 * const indices = Iterable.range(0, 2)
 * const indexed = Iterable.zip(indices, values)
 * Array.from(indexed) // => [[0, "apple"], [1, "banana"], [2, "cherry"]]
 * ```
 *
 * @category zipping
 * @since 2.0.0
 */
export const zip: {
  <B>(that: Iterable<B>): <A>(self: Iterable<A>) => Iterable<[A, B]>
  <A, B>(self: Iterable<A>, that: Iterable<B>): Iterable<[A, B]>
} = dual(
  2,
  <A, B>(self: Iterable<A>, that: Iterable<B>): Iterable<[A, B]> => zipWith(self, that, Tuple.make)
)

/**
 * Applies a function to pairs of elements at the same index in two `Iterable`s, collecting the results. If one
 * input `Iterable` is short, excess elements of the longer `Iterable` are discarded.
 *
 * **Example** (Zipping with a combining function)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * // Add corresponding elements
 * const a = [1, 2, 3, 4]
 * const b = [10, 20, 30, 40]
 * const sums = Iterable.zipWith(a, b, (x, y) => x + y)
 * Array.from(sums) // => [11, 22, 33, 44]
 *
 * // Combine strings
 * const firstNames = ["John", "Jane", "Bob"]
 * const lastNames = ["Doe", "Smith", "Johnson"]
 * const fullNames = Iterable.zipWith(
 *   firstNames,
 *   lastNames,
 *   (first, last) => `${first} ${last}`
 * )
 * Array.from(fullNames) // => ["John Doe", "Jane Smith", "Bob Johnson"]
 *
 * // Different lengths - stops at shorter
 * const short = [1, 2]
 * const long = ["a", "b", "c", "d"]
 * const combined = Iterable.zipWith(
 *   short,
 *   long,
 *   (num, letter) => `${num}${letter}`
 * )
 * Array.from(combined) // => ["1a", "2b"]
 *
 * // Complex transformations
 * const prices = [10.99, 25.50, 5.00]
 * const quantities = [2, 1, 3]
 * const totals = Iterable.zipWith(prices, quantities, (price, qty) => {
 *   return Math.round(price * qty * 100) / 100 // round to 2 decimal places
 * })
 * Array.from(totals) // => [21.98, 25.5, 15]
 * ```
 *
 * @category zipping
 * @since 2.0.0
 */
export const zipWith: {
  <B, A, C>(that: Iterable<B>, f: (a: A, b: B) => C): (self: Iterable<A>) => Iterable<C>
  <A, B, C>(self: Iterable<A>, that: Iterable<B>, f: (a: A, b: B) => C): Iterable<C>
} = dual(3, <B, A, C>(self: Iterable<A>, that: Iterable<B>, f: (a: A, b: B) => C): Iterable<C> => ({
  [Symbol.iterator]() {
    const selfIterator = self[Symbol.iterator]()
    const thatIterator = that[Symbol.iterator]()
    return {
      next() {
        const selfResult = selfIterator.next()
        const thatResult = thatIterator.next()
        if (selfResult.done || thatResult.done) {
          return { done: true, value: undefined }
        }
        return { done: false, value: f(selfResult.value, thatResult.value) }
      }
    }
  }
}))

/**
 * Places a separator between members of an `Iterable`.
 *
 * **When to use**
 *
 * Use to lazily insert a separator between adjacent values.
 *
 * **Details**
 *
 * If the input is a non-empty array, the result is also a non-empty array.
 *
 * **Example** (Interspersing separators)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * // Join numbers with separator
 * const numbers = [1, 2, 3, 4]
 * const withCommas = Iterable.intersperse(numbers, ",")
 * Array.from(withCommas) // => [1, ",", 2, ",", 3, ",", 4]
 *
 * // Join words with spaces
 * const words = ["hello", "world", "from", "effect"]
 * const sentence = Iterable.intersperse(words, " ")
 * Array.from(sentence).join("") // => "hello world from effect"
 *
 * // Empty iterable remains empty
 * const empty = Iterable.empty<string>()
 * const stillEmpty = Iterable.intersperse(empty, "-")
 * Array.from(stillEmpty) // => []
 *
 * // Single element has no separators added
 * const single = [42]
 * const noSeparator = Iterable.intersperse(single, "|")
 * Array.from(noSeparator) // => [42]
 *
 * // Build CSS-like strings
 * const styles = ["color: red", "font-size: 14px", "margin: 10px"]
 * const css = Iterable.intersperse(styles, "; ")
 * Array.from(css).join("") // => "color: red; font-size: 14px; margin: 10px"
 * ```
 *
 * @category combining
 * @since 2.0.0
 */
export const intersperse: {
  <B>(middle: B): <A>(self: Iterable<A>) => Iterable<A | B>
  <A, B>(self: Iterable<A>, middle: B): Iterable<A | B>
} = dual(2, <A, B>(self: Iterable<A>, middle: B): Iterable<A | B> => ({
  [Symbol.iterator]() {
    const iterator = self[Symbol.iterator]()
    let next = iterator.next()
    let emitted = false
    return {
      next() {
        if (next.done) {
          return next
        } else if (emitted) {
          emitted = false
          return { done: false, value: middle }
        }
        emitted = true
        const result = next
        next = iterator.next()
        return result
      }
    }
  }
}))

/**
 * Returns a function that checks if an `Iterable` contains a given value using a provided `isEquivalent` function.
 *
 * **Example** (Checking membership with custom equivalence)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * // Custom equivalence for objects
 * const byId = (a: { id: number }, b: { id: number }) => a.id === b.id
 * const containsById = Iterable.containsWith(byId)
 *
 * const users = [{ id: 1 }, { id: 2 }]
 * const hasUser1 = containsById(users, { id: 1 })
 * hasUser1 // => true
 *
 * // Case-insensitive string comparison
 * const caseInsensitive = (a: string, b: string) =>
 *   a.toLowerCase() === b.toLowerCase()
 * const containsCaseInsensitive = Iterable.containsWith(caseInsensitive)
 *
 * const words = ["Hello", "World"]
 * const hasHello = containsCaseInsensitive(words, "hello")
 * hasHello // => true
 *
 * // Approximate number comparison
 * const approxEqual = (a: number, b: number) => Math.abs(a - b) < 0.1
 * const containsApprox = Iterable.containsWith(approxEqual)
 *
 * const values = [1.0, 2.0, 3.0]
 * const hasAlmostTwo = containsApprox(values, 2.05)
 * hasAlmostTwo // => true
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const containsWith = <A>(isEquivalent: (self: A, that: A) => boolean): {
  (a: A): (self: Iterable<A>) => boolean
  (self: Iterable<A>, a: A): boolean
} =>
  dual(2, (self: Iterable<A>, a: A): boolean => {
    for (const i of self) {
      if (isEquivalent(a, i)) {
        return true
      }
    }
    return false
  })

/**
 * Checks whether an iterable contains a value using Effect's default `Equal`
 * equivalence.
 *
 * **Details**
 *
 * Can be called as `contains(self, value)` or curried as
 * `contains(value)(self)`.
 *
 * **Example** (Checking membership)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * const numbers = [1, 2, 3, 4, 5]
 * Iterable.contains(numbers, 3) // => true
 * Iterable.contains(numbers, 6) // => false
 *
 * const letters = "hello"
 * Iterable.contains(letters, "l") // => true
 * Iterable.contains(letters, "x") // => false
 *
 * // Works with any iterable
 * const range = Iterable.range(1, 100)
 * Iterable.contains(range, 50) // => true
 * Iterable.contains(range, 150) // => false
 *
 * // Curried version
 * const containsThree = Iterable.contains(3)
 * containsThree([1, 2, 3]) // => true
 * containsThree([4, 5, 6]) // => false
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const contains: {
  <A>(a: A): (self: Iterable<A>) => boolean
  <A>(self: Iterable<A>, a: A): boolean
} = containsWith(Equal.asEquivalence())

/**
 * Splits an `Iterable` into length-`n` pieces. The last piece will be shorter if `n` does not evenly divide the length of
 * the `Iterable`.
 * `n` is rounded down and normalized to at least `1`; `NaN` and non-positive
 * values therefore produce singleton pieces.
 *
 * **Example** (Chunking an iterable)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9]
 * const chunks = Iterable.chunksOf(numbers, 3)
 * Array.from(chunks) // => [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
 *
 * // Last chunk can be shorter
 * const uneven = [1, 2, 3, 4, 5, 6, 7]
 * const chunks2 = Iterable.chunksOf(uneven, 3)
 * Array.from(chunks2) // => [[1, 2, 3], [4, 5, 6], [7]]
 *
 * // Chunk size larger than iterable
 * const small = [1, 2]
 * const chunks3 = Iterable.chunksOf(small, 5)
 * Array.from(chunks3) // => [[1, 2]]
 *
 * // Process data in batches
 * const data = Iterable.range(1, 100)
 * const batches = Iterable.chunksOf(data, 10)
 * const batchSums = Iterable.map(
 *   batches,
 *   (batch) => Iterable.reduce(batch, 0, (sum, n) => sum + n)
 * )
 * Array.from(Iterable.take(batchSums, 3)) // => [55, 155, 255]
 * ```
 *
 * @category splitting
 * @since 2.0.0
 */
export const chunksOf: {
  (n: number): <A>(self: Iterable<A>) => Iterable<Array<A>>
  <A>(self: Iterable<A>, n: number): Iterable<Array<A>>
} = dual(2, <A>(self: Iterable<A>, n: number): Iterable<Array<A>> => {
  const safeN = Count.normalizeNonEmpty(n)
  return ({
    [Symbol.iterator]() {
      let iterator: Iterator<A> | undefined = self[Symbol.iterator]()
      return {
        next() {
          if (iterator === undefined) {
            return { done: true, value: undefined }
          }

          const chunk: Array<A> = []
          for (let i = 0; i < safeN; i++) {
            const result = iterator.next()
            if (result.done) {
              iterator = undefined
              return chunk.length === 0 ? { done: true, value: undefined } : { done: false, value: chunk }
            }
            chunk.push(result.value)
          }

          return { done: false, value: chunk }
        }
      }
    }
  })
})

/**
 * Groups equal, consecutive elements of an `Iterable` into `NonEmptyArray`s using the provided `isEquivalent` function.
 *
 * **Example** (Grouping consecutive elements with custom equivalence)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * // Group consecutive equal numbers
 * const numbers = [1, 1, 2, 2, 2, 3, 1, 1]
 * const grouped = Iterable.groupWith(numbers, (a, b) => a === b)
 * Array.from(grouped) // => [[1, 1], [2, 2, 2], [3], [1, 1]]
 *
 * // Case-insensitive grouping of strings
 * const words = ["Apple", "APPLE", "banana", "Banana", "cherry"]
 * const caseInsensitive = (a: string, b: string) =>
 *   a.toLowerCase() === b.toLowerCase()
 * const groupedWords = Iterable.groupWith(words, caseInsensitive)
 * Array.from(groupedWords) // => [["Apple", "APPLE"], ["banana", "Banana"], ["cherry"]]
 *
 * // Group by approximate equality
 * const floats = [1.1, 1.12, 1.9, 2.01, 2.05, 3.5]
 * const approxEqual = (a: number, b: number) => Math.abs(a - b) < 0.2
 * const groupedFloats = Iterable.groupWith(floats, approxEqual)
 * Array.from(groupedFloats) // => [[1.1, 1.12], [1.9, 2.01, 2.05], [3.5]]
 *
 * // Only groups consecutive elements
 * const scattered = [1, 2, 1, 2, 1]
 * const scatteredGroups = Iterable.groupWith(scattered, (a, b) => a === b)
 * Array.from(scatteredGroups) // => [[1], [2], [1], [2], [1]]
 * ```
 *
 * @category grouping
 * @since 2.0.0
 */
export const groupWith: {
  <A>(isEquivalent: (self: A, that: A) => boolean): (self: Iterable<A>) => Iterable<NonEmptyArray<A>>
  <A>(self: Iterable<A>, isEquivalent: (self: A, that: A) => boolean): Iterable<NonEmptyArray<A>>
} = dual(
  2,
  <A>(self: Iterable<A>, isEquivalent: (self: A, that: A) => boolean): Iterable<NonEmptyArray<A>> => ({
    [Symbol.iterator]() {
      const iterator = self[Symbol.iterator]()
      let nextResult: IteratorResult<A> | undefined
      return {
        next() {
          let result: IteratorResult<A>
          if (nextResult !== undefined) {
            if (nextResult.done) {
              return { done: true, value: undefined }
            }
            result = nextResult
            nextResult = undefined
          } else {
            result = iterator.next()
            if (result.done) {
              return { done: true, value: undefined }
            }
          }
          const chunk: NonEmptyArray<A> = [result.value]

          while (true) {
            const next = iterator.next()
            if (next.done || !isEquivalent(result.value, next.value)) {
              nextResult = next
              return { done: false, value: chunk }
            }
            chunk.push(next.value)
          }
        }
      }
    }
  })
)

/**
 * Groups equal, consecutive elements of an `Iterable` into `NonEmptyArray`s.
 *
 * **Example** (Grouping consecutive elements)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * const numbers = [1, 1, 2, 2, 2, 3, 1, 1]
 * const grouped = Iterable.group(numbers)
 * Array.from(grouped) // => [[1, 1], [2, 2, 2], [3], [1, 1]]
 *
 * const letters = "aabbccaa"
 * const groupedLetters = Iterable.group(letters)
 * Array.from(groupedLetters) // => [["a", "a"], ["b", "b"], ["c", "c"], ["a", "a"]]
 *
 * // Works with objects using deep equality
 * const objects = [
 *   { type: "A", value: 1 },
 *   { type: "A", value: 1 },
 *   { type: "B", value: 2 },
 *   { type: "A", value: 1 }
 * ]
 * const groupedObjects = Iterable.group(objects)
 * Array.from(groupedObjects).length // => 3
 * // Note: Only consecutive equal objects are grouped together
 * ```
 *
 * @category grouping
 * @since 2.0.0
 */
export const group: <A>(self: Iterable<A>) => Iterable<NonEmptyArray<A>> = groupWith(
  Equal.asEquivalence()
)

/**
 * Groups all elements by the string or symbol key returned by `f`.
 *
 * **Details**
 *
 * Each property in the returned record contains a non-empty array of elements
 * that produced that key. Unlike `group`, matching elements do not need to be
 * consecutive.
 *
 * **Gotchas**
 *
 * When the key function returns a finite union of string literals or unique
 * symbols, the result preserves those keys as optional properties because the
 * input may not produce every key. Open `string` and `symbol` key types retain
 * their record index signatures.
 *
 * **Example** (Grouping by a key)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * // Group by string length
 * const words = ["a", "bb", "ccc", "dd", "eee", "f"]
 * const byLength = Iterable.groupBy(words, (word) => word.length.toString())
 * byLength // => { "1": ["a", "f"], "2": ["bb", "dd"], "3": ["ccc", "eee"] }
 *
 * // Group by first letter
 * const names = ["Alice", "Bob", "Charlie", "David", "Anna", "Betty"]
 * const byFirstLetter = Iterable.groupBy(names, (name) => name[0])
 * byFirstLetter // => { A: ["Alice", "Anna"], B: ["Bob", "Betty"], C: ["Charlie"], D: ["David"] }
 *
 * // Group by category
 * const items = [
 *   { name: "apple", category: "fruit" },
 *   { name: "carrot", category: "vegetable" },
 *   { name: "banana", category: "fruit" },
 *   { name: "broccoli", category: "vegetable" }
 * ]
 * const byCategory = Iterable.groupBy(items, (item) => item.category)
 * Object.keys(byCategory) // => ["fruit", "vegetable"]
 *
 * // Group numbers by even/odd
 * const numbers = [1, 2, 3, 4, 5, 6]
 * const evenOdd = Iterable.groupBy(numbers, (n) => n % 2 === 0 ? "even" : "odd")
 * evenOdd // => { odd: [1, 3, 5], even: [2, 4, 6] }
 * ```
 *
 * @category grouping
 * @since 2.0.0
 */
export const groupBy: {
  <A, K extends string | symbol>(
    f: (a: A) => K
  ): (self: Iterable<A>) => Record.ReadonlyRecord.GroupByResult<K, NonEmptyArray<A>>
  <A, K extends string | symbol>(
    self: Iterable<A>,
    f: (a: A) => K
  ): Record.ReadonlyRecord.GroupByResult<K, NonEmptyArray<A>>
} = dual(2, <A, K extends string | symbol>(
  self: Iterable<A>,
  f: (a: A) => K
): Record.ReadonlyRecord.GroupByResult<K, NonEmptyArray<A>> => {
  const out: Record<string | symbol, NonEmptyArray<A>> = {}
  for (const a of self) {
    const k = f(a)
    if (Object.hasOwn(out, k)) {
      out[k].push(a)
    } else {
      InternalRecord.assignProperty(out, k, [a])
    }
  }
  return out
})

const constEmpty: Iterable<never> = {
  [Symbol.iterator]() {
    return constEmptyIterator
  }
}
const constEmptyIterator: Iterator<never> = {
  next() {
    return { done: true, value: undefined }
  }
}

/**
 * Creates an empty iterable that yields no elements.
 *
 * **When to use**
 *
 * Use when you need an empty iterable as a typed "no data" value or a base
 * case for iterable operations.
 *
 * **Example** (Creating an empty iterable)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * Array.from(Iterable.empty<string>()) // => []
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const empty = <A = never>(): Iterable<A> => constEmpty

/**
 * Creates an iterable containing a single element.
 *
 * **When to use**
 *
 * Use to wrap a single value in an iterable context so it can be combined
 * with other iterable operations.
 *
 * **Example** (Wrapping a single value)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * const single = Iterable.of(42)
 * Array.from(single) // => [42]
 *
 * // Useful for creating homogeneous sequences
 * const sequences = [
 *   Iterable.of("hello"),
 *   Iterable.range(1, 3),
 *   Iterable.empty<string>()
 * ]
 *
 * // Can be used with flatMap for conditional inclusion
 * const numbers = [1, 2, 3, 4, 5]
 * const evensOnly = Iterable.flatMap(
 *   numbers,
 *   (n) => n % 2 === 0 ? Iterable.of(n) : Iterable.empty()
 * )
 * Array.from(evensOnly) // => [2, 4]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const of = <A>(a: A): Iterable<A> => [a]

/**
 * Transforms each element of an iterable using a function.
 *
 * **Details**
 *
 * This is one of the most fundamental operations for working with iterables.
 * It applies a transformation function to each element, creating a new iterable
 * with the transformed values. The operation is lazy, so elements are only
 * transformed when the iterable is consumed.
 *
 * **Example** (Mapping elements)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * // Transform numbers to their squares
 * const numbers = [1, 2, 3, 4, 5]
 * const squares = Iterable.map(numbers, (x) => x * x)
 * Array.from(squares) // => [1, 4, 9, 16, 25]
 *
 * // Use index in transformation
 * const indexed = Iterable.map(["a", "b", "c"], (char, i) => `${i}: ${char}`)
 * Array.from(indexed) // => ["0: a", "1: b", "2: c"]
 *
 * Array.from(Iterable.map(
 *   Iterable.map([1, 2, 3], (x) => x * 2),
 *   (x) => x + 1
 * )) // => [3, 5, 7]
 * ```
 *
 * @category mapping
 * @since 2.0.0
 */
export const map: {
  <A, B>(
    f: (a: NoInfer<A>, i: number) => B
  ): (self: Iterable<A>) => Iterable<B>
  <A, B>(self: Iterable<A>, f: (a: NoInfer<A>, i: number) => B): Iterable<B>
} = dual(2, <A, B>(self: Iterable<A>, f: (a: A, i: number) => B): Iterable<B> => ({
  [Symbol.iterator]() {
    const iterator = self[Symbol.iterator]()
    let i = 0
    return {
      next() {
        const result = iterator.next()
        if (result.done) {
          return { done: true, value: undefined }
        }
        return { done: false, value: f(result.value, i++) }
      }
    }
  }
}))

/**
 * Applies a function to each element in an Iterable and returns a new Iterable containing the concatenated mapped elements.
 *
 * **Example** (Flat mapping iterables)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * // Expand each number to a range
 * const numbers = [1, 2, 3]
 * const expanded = Iterable.flatMap(numbers, (n) => Iterable.range(1, n))
 * Array.from(expanded) // => [1, 1, 2, 1, 2, 3]
 *
 * // Split strings into characters
 * const words = ["hi", "bye"]
 * const chars = Iterable.flatMap(words, (word) => word)
 * Array.from(chars) // => ["h", "i", "b", "y", "e"]
 *
 * // Conditional expansion with empty iterables
 * const values = [1, 2, 3, 4, 5]
 * const evenMultiples = Iterable.flatMap(
 *   values,
 *   (n) => n % 2 === 0 ? [n, n * 2, n * 3] : []
 * )
 * Array.from(evenMultiples) // => [2, 4, 6, 4, 8, 12]
 *
 * // Use index in transformation
 * const letters = ["a", "b", "c"]
 * const indexed = Iterable.flatMap(
 *   letters,
 *   (letter, i) => Iterable.replicate(letter, i + 1)
 * )
 * Array.from(indexed) // => ["a", "b", "b", "c", "c", "c"]
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const flatMap: {
  <A, B>(
    f: (a: NoInfer<A>, i: number) => Iterable<B>
  ): (self: Iterable<A>) => Iterable<B>
  <A, B>(self: Iterable<A>, f: (a: NoInfer<A>, i: number) => Iterable<B>): Iterable<B>
} = dual(
  2,
  <A, B>(self: Iterable<A>, f: (a: A, i: number) => Iterable<B>): Iterable<B> => flatten(map(self, f))
)

/**
 * Flattens an Iterable of Iterables into a single Iterable
 *
 * **Example** (Flattening nested iterables)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * // Flatten nested arrays
 * const nested = [[1, 2], [3, 4], [5, 6]]
 * const flat = Iterable.flatten(nested)
 * Array.from(flat) // => [1, 2, 3, 4, 5, 6]
 *
 * // Flatten different iterable types
 * const mixed: Array<Iterable<string>> = ["ab", "cd"]
 * const flatMixed = Iterable.flatten(mixed)
 * Array.from(flatMixed) // => ["a", "b", "c", "d"]
 *
 * // Flatten deeply nested (only one level)
 * const deepNested = [[[1, 2]], [[3, 4]]]
 * const oneLevelFlat = Iterable.flatten(deepNested)
 * Array.from(oneLevelFlat) // => [[1, 2], [3, 4]]
 * // [[1, 2], [3, 4]] (still contains arrays)
 *
 * // Empty iterables are handled correctly
 * const withEmpty = [[1, 2], [], [3, 4], []]
 * const flatWithEmpty = Iterable.flatten(withEmpty)
 * Array.from(flatWithEmpty) // => [1, 2, 3, 4]
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const flatten = <A>(self: Iterable<Iterable<A>>): Iterable<A> => ({
  [Symbol.iterator]() {
    const outerIterator = self[Symbol.iterator]()
    let innerIterator: Iterator<A> | undefined
    function next() {
      while (true) {
        if (innerIterator === undefined) {
          const next = outerIterator.next()
          if (next.done) {
            return next
          }
          innerIterator = next.value[Symbol.iterator]()
        }
        const result = innerIterator.next()
        if (!result.done) {
          return result
        }
        innerIterator = undefined
      }
    }
    return { next }
  }
})

/**
 * Transforms elements of an iterable using a function that returns a `Result`, keeping only successful values.
 *
 * **Details**
 *
 * This combines mapping and filtering in a single operation. The function is
 * applied to each element, and only elements that result in `Result.succeed`
 * are included in the result.
 *
 * **Example** (Filtering and transforming Result values)
 *
 * ```ts import.meta.vitest
 * import { Iterable, Result } from "effect"
 *
 * // Parse strings to numbers, keeping only valid ones
 * const strings = ["1", "2", "invalid", "4", "not-a-number"]
 * const numbers = Iterable.filterMap(strings, (s) => {
 *   const num = parseInt(s)
 *   return isNaN(num) ? Result.failVoid : Result.succeed(num)
 * })
 * Array.from(numbers) // => [1, 2, 4]
 *
 * // Extract specific properties from objects
 * const users = [
 *   { name: "Alice", age: 25, email: "alice@example.com" },
 *   { name: "Bob", age: 17, email: undefined },
 *   { name: "Charlie", age: 30, email: "charlie@example.com" },
 *   { name: "David", age: 16, email: undefined }
 * ]
 * const adultEmails = Iterable.filterMap(
 *   users,
 *   (user) =>
 *     user.age >= 18 && user.email ? Result.succeed(user.email) : Result.failVoid
 * )
 * Array.from(adultEmails) // => ["alice@example.com", "charlie@example.com"]
 *
 * // Use index in transformation
 * const items = ["a", "b", "c", "d", "e"]
 * const evenIndexItems = Iterable.filterMap(
 *   items,
 *   (item, i) => i % 2 === 0 ? Result.succeed(`${i}: ${item}`) : Result.failVoid
 * )
 * Array.from(evenIndexItems) // => ["0: a", "2: c", "4: e"]
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const filterMap: {
  <A, B, X>(f: (input: A, i: number) => Result<B, X>): (self: Iterable<A>) => Iterable<B>
  <A, B, X>(self: Iterable<A>, f: (input: A, i: number) => Result<B, X>): Iterable<B>
} = dual(
  2,
  <A, B, X>(self: Iterable<A>, f: (input: A, i: number) => Result<B, X>): Iterable<B> => ({
    [Symbol.iterator]() {
      const iterator = self[Symbol.iterator]()
      let i = 0
      return {
        next() {
          let result = iterator.next()
          while (!result.done) {
            const next = f(result.value, i++)
            if (R.isSuccess(next)) {
              return { done: false, value: next.success }
            }
            result = iterator.next()
          }
          return { done: true, value: undefined }
        }
      }
    }
  })
)

/**
 * Transforms all elements of the `Iterable` for as long as the specified function succeeds.
 *
 * **Example** (Filtering and transforming until failure)
 *
 * ```ts import.meta.vitest
 * import { Iterable, Result } from "effect"
 *
 * // Parse numbers until we hit an invalid one
 * const strings = ["1", "2", "3", "invalid", "4", "5"]
 * const numbers = Iterable.filterMapWhile(strings, (s) => {
 *   const num = parseInt(s)
 *   return isNaN(num) ? Result.failVoid : Result.succeed(num)
 * })
 * Array.from(numbers) // => [1, 2, 3]
 *
 * // Take elements while they meet a condition and transform them
 * const values = [2, 4, 6, 7, 8, 10]
 * const doubledEvens = Iterable.filterMapWhile(
 *   values,
 *   (n) => n % 2 === 0 ? Result.succeed(n * 2) : Result.failVoid
 * )
 * Array.from(doubledEvens) // => [4, 8, 12]
 *
 * // Process with index until condition fails
 * const letters = ["a", "b", "c", "d", "e"]
 * const indexedUntilC = Iterable.filterMapWhile(
 *   letters,
 *   (letter, i) => letter !== "c" ? Result.succeed(`${i}: ${letter}`) : Result.failVoid
 * )
 * Array.from(indexedUntilC) // => ["0: a", "1: b"]
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const filterMapWhile: {
  <A, B, X>(f: (input: A, i: number) => Result<B, X>): (self: Iterable<A>) => Iterable<B>
  <A, B, X>(self: Iterable<A>, f: (input: A, i: number) => Result<B, X>): Iterable<B>
} = dual(2, <A, B, X>(self: Iterable<A>, f: (input: A, i: number) => Result<B, X>) => ({
  [Symbol.iterator]() {
    const iterator = self[Symbol.iterator]()
    let i = 0
    return {
      next() {
        const result = iterator.next()
        if (result.done) {
          return { done: true, value: undefined }
        }
        const next = f(result.value, i++)
        if (R.isSuccess(next)) {
          return { done: false, value: next.success }
        }
        return { done: true, value: undefined }
      }
    }
  }
}))

/**
 * Retrieves the `Some` values from an `Iterable` of `Option`s.
 *
 * **Example** (Extracting Some values)
 *
 * ```ts import.meta.vitest
 * import { Iterable, Option } from "effect"
 *
 * Array.from(Iterable.getSomes([Option.some(1), Option.none(), Option.some(2)])) // => [1, 2]
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const getSomes = <A>(self: Iterable<Option<A>>): Iterable<A> => {
  return {
    [Symbol.iterator]() {
      const iterator = self[Symbol.iterator]()
      return {
        next() {
          let result = iterator.next()
          while (!result.done) {
            if (O.isSome(result.value)) {
              return { done: false, value: result.value.value }
            }
            result = iterator.next()
          }
          return { done: true, value: undefined }
        }
      }
    }
  }
}

/**
 * Returns a lazy iterable containing the failure values from an iterable of
 * `Result`s, skipping successful results.
 *
 * **Example** (Extracting failures)
 *
 * ```ts import.meta.vitest
 * import { Iterable, Result } from "effect"
 *
 * Array.from(Iterable.getFailures([
 *   Result.succeed(1),
 *   Result.fail("err"),
 *   Result.succeed(2)
 * ])) // => ["err"]
 * ```
 *
 * @category filtering
 * @since 4.0.0
 */
export const getFailures = <R0, L>(self: Iterable<Result<R0, L>>): Iterable<L> => {
  return {
    [Symbol.iterator]() {
      const iterator = self[Symbol.iterator]()
      return {
        next() {
          let result = iterator.next()
          while (!result.done) {
            if (R.isFailure(result.value)) {
              return { done: false, value: result.value.failure }
            }
            result = iterator.next()
          }
          return { done: true, value: undefined }
        }
      }
    }
  }
}

/**
 * Returns a lazy iterable containing the success values from an iterable of
 * `Result`s, skipping failed results.
 *
 * **Example** (Extracting successes)
 *
 * ```ts import.meta.vitest
 * import { Iterable, Result } from "effect"
 *
 * Array.from(Iterable.getSuccesses([
 *   Result.succeed(1),
 *   Result.fail("err"),
 *   Result.succeed(2)
 * ])) // => [1, 2]
 * ```
 *
 * @category filtering
 * @since 4.0.0
 */
export const getSuccesses = <R0, L>(self: Iterable<Result<R0, L>>): Iterable<R0> => {
  return {
    [Symbol.iterator]() {
      const iterator = self[Symbol.iterator]()
      return {
        next() {
          let result = iterator.next()
          while (!result.done) {
            if (R.isSuccess(result.value)) {
              return { done: false, value: result.value.success }
            }
            result = iterator.next()
          }
          return { done: true, value: undefined }
        }
      }
    }
  }
}

/**
 * Filters an iterable to only include elements that match a predicate.
 *
 * **Details**
 *
 * This function creates a new iterable containing only the elements for which
 * the predicate function returns true. Like map, this operation is lazy and
 * elements are only tested when the iterable is consumed.
 *
 * **Example** (Filtering elements)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * // Filter even numbers
 * const numbers = [1, 2, 3, 4, 5, 6]
 * const evens = Iterable.filter(numbers, (x) => x % 2 === 0)
 * Array.from(evens) // => [2, 4, 6]
 *
 * // Filter with index
 * const items = ["a", "b", "c", "d"]
 * const oddPositions = Iterable.filter(items, (_, i) => i % 2 === 1)
 * Array.from(oddPositions) // => ["b", "d"]
 *
 * // Type refinement
 * const mixed: Array<string | number> = ["hello", 42, "world", 100]
 * const onlyStrings = Iterable.filter(
 *   mixed,
 *   (x): x is string => typeof x === "string"
 * )
 * Array.from(onlyStrings) // => ["hello", "world"]
 *
 * // Combine with map
 * const processed = Iterable.map(
 *   Iterable.filter([1, 2, 3, 4, 5], (x) => x > 2),
 *   (x) => x * 10
 * )
 * Array.from(processed) // => [30, 40, 50]
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const filter: {
  <A, B extends A>(refinement: (a: NoInfer<A>, i: number) => a is B): (self: Iterable<A>) => Iterable<B>
  <A>(predicate: (a: NoInfer<A>, i: number) => boolean): (self: Iterable<A>) => Iterable<A>
  <A, B extends A>(self: Iterable<A>, refinement: (a: A, i: number) => a is B): Iterable<B>
  <A>(self: Iterable<A>, predicate: (a: A, i: number) => boolean): Iterable<A>
} = dual(
  2,
  <A>(self: Iterable<A>, predicate: (a: A, i: number) => boolean): Iterable<A> => ({
    [Symbol.iterator]() {
      const iterator = self[Symbol.iterator]()
      let i = 0
      return {
        next() {
          let result = iterator.next()
          while (!result.done) {
            if (predicate(result.value, i++)) {
              return { done: false, value: result.value }
            }
            result = iterator.next()
          }
          return { done: true, value: undefined }
        }
      }
    }
  })
)

/**
 * Transforms elements using a function that may return null or undefined, filtering out the null/undefined results.
 *
 * **When to use**
 *
 * Use when working with APIs or functions that return nullable values,
 * providing a clean way to filter out null or undefined while transforming.
 *
 * **Example** (Flat mapping nullable results)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * // Extract valid elements from nullable function results
 * const data = ["1", "2", "invalid", "4"]
 * const parsed = Iterable.flatMapNullishOr(data, (s) => {
 *   const num = parseInt(s)
 *   return isNaN(num) ? null : num * 2
 * })
 * Array.from(parsed) // => [2, 4, 8]
 *
 * // Safe property access
 * const objects = [
 *   { nested: { value: 10 } },
 *   { nested: null },
 *   { nested: { value: 20 } },
 *   {}
 * ]
 * const values = Iterable.flatMapNullishOr(objects, (obj) => obj.nested?.value)
 * Array.from(values) // => [10, 20]
 *
 * // Working with Map.get (returns undefined for missing keys)
 * const map = new Map([
 *   ["a", 1],
 *   ["b", 2],
 *   ["c", 3]
 * ])
 * const keys = ["a", "x", "b", "y", "c"]
 * const foundValues = Iterable.flatMapNullishOr(keys, (key) => map.get(key))
 * Array.from(foundValues) // => [1, 2, 3]
 * ```
 *
 * @category sequencing
 * @since 4.0.0
 */
export const flatMapNullishOr: {
  <A, B>(f: (a: A) => B): (self: Iterable<A>) => Iterable<NonNullable<B>>
  <A, B>(self: Iterable<A>, f: (a: A) => B): Iterable<NonNullable<B>>
} = dual(
  2,
  <A, B>(self: Iterable<A>, f: (a: A) => B): Iterable<NonNullable<B>> =>
    filterMap(self, (a) => {
      const b = f(a)
      return b == null ? R.failVoid : R.succeed(b)
    })
)

/**
 * Checks whether a predicate holds true for some `Iterable` element.
 *
 * **Example** (Checking whether some element matches)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * const numbers = [1, 3, 5, 7, 8]
 * const hasEven = Iterable.some(numbers, (x) => x % 2 === 0)
 * hasEven // => true
 *
 * const allOdd = [1, 3, 5, 7]
 * const hasEvenInAllOdd = Iterable.some(allOdd, (x) => x % 2 === 0)
 * hasEvenInAllOdd // => false
 *
 * // With index
 * const letters = ["a", "b", "c"]
 * const hasElementAtIndex2 = Iterable.some(letters, (_, i) => i === 2)
 * hasElementAtIndex2 // => true
 *
 * // Early termination - stops at first match
 * const infiniteOdds = Iterable.filter(Iterable.range(1), (x) => x % 2 === 1)
 * const hasEvenInInfiniteOdds = Iterable.some(
 *   Iterable.take(infiniteOdds, 1000),
 *   (x) => x % 2 === 0
 * )
 * hasEvenInInfiniteOdds // => false
 *
 * // Type guard usage
 * const mixed: Array<string | number> = [1, 2, "hello"]
 * const hasString = Iterable.some(
 *   mixed,
 *   (x): x is string => typeof x === "string"
 * )
 * hasString // => true
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const some: {
  <A>(predicate: (a: A, i: number) => boolean): (self: Iterable<A>) => boolean
  <A>(self: Iterable<A>, predicate: (a: A, i: number) => boolean): boolean
} = dual(
  2,
  <A>(self: Iterable<A>, predicate: (a: A, i: number) => boolean): boolean => {
    let i = 0
    for (const a of self) {
      if (predicate(a, i++)) {
        return true
      }
    }
    return false
  }
)

/**
 * Generates an iterable by repeatedly applying a function that produces the
 * next element and state.
 *
 * **Details**
 *
 * This is useful for creating iterables from a generating function that
 * maintains state. The function should return `Option.some([value, nextState])`
 * to continue or `Option.none()` to stop.
 *
 * **Example** (Unfolding state into values)
 *
 * ```ts import.meta.vitest
 * import { Iterable, Option } from "effect"
 *
 * // Generate Fibonacci sequence
 * const fibonacci = Iterable.unfold([0, 1], ([a, b]) => Option.some([a, [b, a + b]]))
 * const first10Fib = Iterable.take(fibonacci, 10)
 * Array.from(first10Fib) // => [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
 *
 * // Generate powers of 2 up to a limit
 * const powersOf2 = Iterable.unfold(1, (n) => n <= 1000 ? Option.some([n, n * 2]) : Option.none())
 * Array.from(powersOf2) // => [1, 2, 4, 8, 16, 32, 64, 128, 256, 512]
 *
 * // Generate countdown
 * const countdown = Iterable.unfold(5, (n) => n > 0 ? Option.some([n, n - 1]) : Option.none())
 * Array.from(countdown) // => [5, 4, 3, 2, 1]
 *
 * // Generate collatz sequence
 * const collatz = Iterable.unfold(7, (n) => {
 *   if (n === 1) return Option.none()
 *   const next = n % 2 === 0 ? n / 2 : n * 3 + 1
 *   return Option.some([n, next])
 * })
 * Array.from(collatz) // => [7, 22, 11, 34, 17, 52, 26, 13, 40, 20, 10, 5, 16, 8, 4, 2]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const unfold = <B, A>(b: B, f: (b: B) => Option<readonly [A, B]>): Iterable<A> => ({
  [Symbol.iterator]() {
    let next = b
    return {
      next() {
        const ab = f(next)
        if (O.isNone(ab)) {
          return { done: true, value: undefined }
        }
        const [a, b] = ab.value
        next = b
        return { done: false, value: a }
      }
    }
  }
})

/**
 * Iterates over the `Iterable`, applying `f` to each element.
 *
 * **Example** (Iterating with side effects)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * // Collect each visited element
 * const numbers = [1, 2, 3, 4, 5]
 * const visited: Array<number> = []
 * Iterable.forEach(numbers, (n) => visited.push(n))
 * visited // => [1, 2, 3, 4, 5]
 *
 * // Use index in the callback
 * const letters = ["a", "b", "c"]
 * const indexed: Array<string> = []
 * Iterable.forEach(letters, (letter, i) => {
 *   indexed.push(`${i}: ${letter}`)
 * })
 * indexed // => ["0: a", "1: b", "2: c"]
 *
 * // Side effects with any iterable
 * const results: Array<number> = []
 * Iterable.forEach(Iterable.range(1, 5), (n) => {
 *   results.push(n * n)
 * })
 * results // => [1, 4, 9, 16, 25]
 *
 * // Process in chunks
 * const data = Iterable.chunksOf([1, 2, 3, 4, 5, 6], 2)
 * const processed: Array<Array<number>> = []
 * Iterable.forEach(data, (chunk) => {
 *   processed.push(Array.from(chunk))
 * })
 * processed // => [[1, 2], [3, 4], [5, 6]]
 * ```
 *
 * @category traversing
 * @since 2.0.0
 */
export const forEach: {
  <A>(f: (a: A, i: number) => void): (self: Iterable<A>) => void
  <A>(self: Iterable<A>, f: (a: A, i: number) => void): void
} = dual(2, <A>(self: Iterable<A>, f: (a: A, i: number) => void): void => {
  let i = 0
  for (const a of self) {
    f(a, i++)
  }
})

/**
 * Reduces an iterable to a single value by applying a function to each element and accumulating the result.
 *
 * **Details**
 *
 * This function applies a reducing function against an accumulator and each element
 * of the iterable (from left to right) to reduce it to a single value.
 *
 * **Example** (Reducing an iterable)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * // Sum all numbers
 * const numbers = [1, 2, 3, 4, 5]
 * const sum = Iterable.reduce(numbers, 0, (acc, n) => acc + n)
 * sum // => 15
 *
 * // Find maximum value
 * const values = [3, 1, 4, 1, 5, 9, 2]
 * Iterable.reduce(values, -Infinity, (max, value) => Math.max(max, value)) // => 9
 *
 * // Build an object from key-value pairs
 * const pairs = [["a", 1], ["b", 2], ["c", 3]] as const
 * const obj = Iterable.reduce(
 *   pairs,
 *   {} as Record<string, number>,
 *   (acc, [key, value]) => {
 *     acc[key] = value
 *     return acc
 *   }
 * )
 * obj // => { a: 1, b: 2, c: 3 }
 *
 * // Use index in the reducer
 * const letters = ["a", "b", "c"]
 * const indexed = Iterable.reduce(
 *   letters,
 *   [] as Array<string>,
 *   (acc, letter, i) => {
 *     acc.push(`${i}: ${letter}`)
 *     return acc
 *   }
 * )
 * indexed // => ["0: a", "1: b", "2: c"]
 * ```
 *
 * @category folding
 * @since 2.0.0
 */
export const reduce: {
  <B, A>(b: B, f: (b: B, a: A, i: number) => B): (self: Iterable<A>) => B
  <A, B>(self: Iterable<A>, b: B, f: (b: B, a: A, i: number) => B): B
} = dual(3, <A, B>(self: Iterable<A>, b: B, f: (b: B, a: A, i: number) => B): B => {
  if (Array.isArray(self)) {
    return self.reduce(f, b)
  }
  let i = 0
  let result = b
  for (const n of self) {
    result = f(result, n, i++)
  }
  return result
})

/**
 * Deduplicates adjacent elements that are identical using the provided `isEquivalent` function.
 *
 * **Example** (Deduplicating adjacent elements with custom equivalence)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * // Remove adjacent duplicates with custom equality
 * const numbers = [1, 1, 2, 2, 3, 1, 1]
 * const dedupedNumbers = Iterable.dedupeAdjacentWith(numbers, (a, b) => a === b)
 * Array.from(dedupedNumbers) // => [1, 2, 3, 1]
 *
 * // Case-insensitive deduplication
 * const words = ["Hello", "HELLO", "world", "World", "test"]
 * const caseInsensitive = (a: string, b: string) =>
 *   a.toLowerCase() === b.toLowerCase()
 * const dedupedWords = Iterable.dedupeAdjacentWith(words, caseInsensitive)
 * Array.from(dedupedWords) // => ["Hello", "world", "test"]
 *
 * // Deduplication by object property
 * const users = [
 *   { id: 1, name: "Alice" },
 *   { id: 1, name: "Alice Updated" }, // different name, same id
 *   { id: 2, name: "Bob" },
 *   { id: 2, name: "Bob" },
 *   { id: 3, name: "Charlie" }
 * ]
 * const byId = (a: typeof users[0], b: typeof users[0]) => a.id === b.id
 * const dedupedUsers = Iterable.dedupeAdjacentWith(users, byId)
 * Array.from(dedupedUsers, (user) => user.id) // => [1, 2, 3]
 *
 * // Approximate numeric equality
 * const floats = [1.0, 1.01, 1.02, 2.0, 2.01, 3.0]
 * const approxEqual = (a: number, b: number) => Math.abs(a - b) < 0.1
 * const dedupedFloats = Iterable.dedupeAdjacentWith(floats, approxEqual)
 * Array.from(dedupedFloats) // => [1, 2, 3]
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const dedupeAdjacentWith: {
  <A>(isEquivalent: (self: A, that: A) => boolean): (self: Iterable<A>) => Iterable<A>
  <A>(self: Iterable<A>, isEquivalent: (self: A, that: A) => boolean): Iterable<A>
} = dual(2, <A>(self: Iterable<A>, isEquivalent: (self: A, that: A) => boolean): Iterable<A> => ({
  [Symbol.iterator]() {
    const iterator = self[Symbol.iterator]()
    let first = true
    let last: A
    function next(): IteratorResult<A> {
      const result = iterator.next()
      if (result.done) {
        return { done: true, value: undefined }
      }
      if (first) {
        first = false
        last = result.value
        return result
      }
      const current = result.value
      if (isEquivalent(last, current)) {
        return next()
      }
      last = current
      return result
    }
    return { next }
  }
}))

/**
 * Deduplicates adjacent elements that are identical.
 *
 * **Example** (Deduplicating adjacent elements)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * // Remove adjacent duplicate numbers
 * const numbers = [1, 1, 2, 2, 2, 3, 1, 1]
 * const deduped = Iterable.dedupeAdjacent(numbers)
 * Array.from(deduped) // => [1, 2, 3, 1]
 *
 * // Remove adjacent duplicate characters
 * const letters = "aabbccaa"
 * const dedupedLetters = Iterable.dedupeAdjacent(letters)
 * Array.from(dedupedLetters) // => ["a", "b", "c", "a"]
 *
 * // Works with objects using deep equality
 * const objects = [
 *   { type: "A" },
 *   { type: "A" },
 *   { type: "B" },
 *   { type: "B" },
 *   { type: "A" }
 * ]
 * const dedupedObjects = Iterable.dedupeAdjacent(objects)
 * Array.from(dedupedObjects, (object) => object.type) // => ["A", "B", "A"]
 *
 * // Clean up streaming data
 * const sensorData = [100, 100, 100, 101, 101, 102, 102, 102, 100]
 * const cleanedData = Iterable.dedupeAdjacent(sensorData)
 * Array.from(cleanedData) // => [100, 101, 102, 100]
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const dedupeAdjacent: <A>(self: Iterable<A>) => Iterable<A> = dedupeAdjacentWith(Equal.asEquivalence())

/**
 * Zips this Iterable crosswise with the specified Iterable using the specified combiner.
 *
 * **Example** (Combining cartesian products)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * // Create coordinate pairs
 * const xs = [1, 2]
 * const ys = ["a", "b", "c"]
 * const coordinates = Iterable.cartesianWith(xs, ys, (x, y) => `(${x},${y})`)
 * Array.from(coordinates) // => ["(1,a)", "(1,b)", "(1,c)", "(2,a)", "(2,b)", "(2,c)"]
 *
 * // Generate all combinations of options
 * const sizes = ["S", "M", "L"]
 * const colors = ["red", "blue"]
 * const products = Iterable.cartesianWith(
 *   sizes,
 *   colors,
 *   (size, color) => ({ size, color })
 * )
 * Array.from(products, ({ color, size }) => `${size}:${color}`) // => ["S:red", "S:blue", "M:red", "M:blue", "L:red", "L:blue"]
 *
 * // Mathematical operations on all pairs
 * const a = [1, 2, 3]
 * const b = [10, 20]
 * const mathProducts = Iterable.cartesianWith(a, b, (x, y) => x * y)
 * Array.from(mathProducts) // => [10, 20, 20, 40, 30, 60]
 *
 * // Create test data combinations
 * const userTypes = ["admin", "user"]
 * const features = ["read", "write", "delete"]
 * const testCases = Iterable.cartesianWith(
 *   userTypes,
 *   features,
 *   (user, feature) => `${user}_can_${feature}`
 * )
 * Array.from(testCases) // => ["admin_can_read", "admin_can_write", "admin_can_delete", "user_can_read", "user_can_write", "user_can_delete"]
 * ```
 *
 * @category combining
 * @since 2.0.0
 */
export const cartesianWith: {
  <A, B, C>(that: Iterable<B>, f: (a: A, b: B) => C): (self: Iterable<A>) => Iterable<C>
  <A, B, C>(self: Iterable<A>, that: Iterable<B>, f: (a: A, b: B) => C): Iterable<C>
} = dual(
  3,
  <A, B, C>(self: Iterable<A>, that: Iterable<B>, f: (a: A, b: B) => C): Iterable<C> => ({
    [Symbol.iterator]() {
      const cache: Array<B> = []
      let iterator: Iterator<B> | undefined
      let done = false
      const replay: Iterable<B> = {
        [Symbol.iterator]() {
          let index = 0
          return {
            next(): IteratorResult<B> {
              if (index < cache.length) {
                return { done: false, value: cache[index++] }
              }
              if (done) {
                return { done: true, value: undefined }
              }
              iterator ??= that[Symbol.iterator]()
              const result = iterator.next()
              if (result.done) {
                done = true
                return { done: true, value: undefined }
              }
              cache.push(result.value)
              index++
              return result
            }
          }
        }
      }
      return flatMap(self, (a) => map(replay, (b) => f(a, b)))[Symbol.iterator]()
    }
  })
)

/**
 * Zips this Iterable crosswise with the specified Iterable.
 *
 * **Example** (Generating cartesian pairs)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * // All pairs of numbers and letters
 * const numbers = [1, 2, 3]
 * const letters = ["a", "b"]
 * const pairs = Iterable.cartesian(numbers, letters)
 * Array.from(pairs) // => [[1, "a"], [1, "b"], [2, "a"], [2, "b"], [3, "a"], [3, "b"]]
 *
 * // Generate coordinate grid
 * const x = [0, 1, 2]
 * const y = [0, 1]
 * const grid = Iterable.cartesian(x, y)
 * Array.from(grid) // => [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1]]
 *
 * // All combinations for testing
 * const browsers = ["chrome", "firefox"]
 * const devices = ["desktop", "mobile", "tablet"]
 * const testMatrix = Iterable.cartesian(browsers, devices)
 * Array.from(testMatrix, ([browser, device]) => `${browser}:${device}`) // => ["chrome:desktop", "chrome:mobile", "chrome:tablet", "firefox:desktop", "firefox:mobile", "firefox:tablet"]
 *
 * // Empty iterable results in empty cartesian product
 * const empty = Iterable.empty<number>()
 * const withEmpty = Iterable.cartesian([1, 2], empty)
 * Array.from(withEmpty) // => []
 * ```
 *
 * @category combining
 * @since 2.0.0
 */
export const cartesian: {
  <B>(that: Iterable<B>): <A>(self: Iterable<A>) => Iterable<[A, B]>
  <A, B>(self: Iterable<A>, that: Iterable<B>): Iterable<[A, B]>
} = dual(
  2,
  <A, B>(self: Iterable<A>, that: Iterable<B>): Iterable<[A, B]> => cartesianWith(self, that, (a, b) => [a, b])
)

/**
 * Computes how many elements of the iterable pass the given predicate.
 *
 * **Example** (Counting matching elements)
 *
 * ```ts import.meta.vitest
 * import { Iterable } from "effect"
 *
 * Iterable.countBy([1, 2, 3, 4, 5], (n) => n % 2 === 0) // => 2
 * ```
 *
 * @category folding
 * @since 3.16.0
 */
export const countBy: {
  <A>(predicate: (a: NoInfer<A>, i: number) => boolean): (self: Iterable<A>) => number
  <A>(self: Iterable<A>, predicate: (a: A, i: number) => boolean): number
} = dual(
  2,
  <A>(
    self: Iterable<A>,
    f: (a: A, i: number) => boolean
  ): number => {
    let count = 0
    let i = 0
    for (const a of self) {
      if (f(a, i)) {
        count++
      }
      i++
    }
    return count
  }
)
