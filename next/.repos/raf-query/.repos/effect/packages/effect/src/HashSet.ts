/**
 * Stores unique values in an immutable hash set.
 *
 * A `HashSet<A>` contains at most one value for each equality class according
 * to Effect's `Equal` and `Hash` rules. Membership checks, additions, removals,
 * and set operations return new sets. This module also includes constructors,
 * union, intersection, difference, subset checks, mapping, filtering, and
 * reducing helpers.
 *
 * @since 2.0.0
 */

import type { Equal } from "./Equal.ts"
import * as Dual from "./Function.ts"
import type { Inspectable } from "./Inspectable.ts"
import * as internal from "./internal/hashSet.ts"
import type { Pipeable } from "./Pipeable.ts"
import type { Predicate, Refinement } from "./Predicate.ts"
import type { NoInfer } from "./Types.ts"

const TypeId = internal.HashSetTypeId

/**
 * A HashSet is an immutable set data structure that provides efficient storage
 * and retrieval of unique values. It uses a HashMap internally for optimal performance.
 *
 * **Example** (Creating and updating a HashSet)
 *
 * ```ts import.meta.vitest
 * import { HashSet } from "effect"
 *
 * // Create a HashSet
 * const set = HashSet.make("apple", "banana", "cherry")
 *
 * // Check membership
 * HashSet.has(set, "apple") // => true
 * HashSet.has(set, "grape") // => false
 *
 * // Add values (returns new HashSet)
 * const updated = HashSet.add(set, "grape")
 * updated // => HashSet.make("apple", "banana", "cherry", "grape")
 *
 * // Remove values (returns new HashSet)
 * const smaller = HashSet.remove(set, "banana")
 * smaller // => HashSet.make("apple", "cherry")
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface HashSet<out Value> extends Iterable<Value>, Equal, Pipeable, Inspectable {
  readonly [TypeId]: typeof TypeId
}

/**
 * The HashSet namespace contains type-level utilities and helper types
 * for working with HashSet instances.
 *
 * **Example** (Extracting value types from a HashSet)
 *
 * ```ts import.meta.vitest
 * import { HashSet } from "effect"
 *
 * // Create a concrete HashSet for type extraction
 * const fruits = HashSet.make("apple", "banana", "cherry")
 *
 * // Extract the value type for reuse
 * type Fruit = HashSet.HashSet.Value<typeof fruits> // string
 *
 * // Use extracted type in functions
 * const processFruit = (fruit: Fruit) => {
 *   return `Processing ${fruit}`
 * }
 * processFruit("apple") // => "Processing apple"
 * ```
 *
 * @since 2.0.0
 */
export declare namespace HashSet {
  /**
   * Extracts the element type from a `HashSet`.
   *
   * **Details**
   *
   * For `HashSet.HashSet<A>`, `HashSet.Value<...>` resolves to `A`.
   *
   * **Example** (Extracting a HashSet value type)
   *
   * ```ts import.meta.vitest
   * import { HashSet } from "effect"
   *
   * const numbers = HashSet.make(1, 2, 3, 4, 5)
   *
   * // Extract the value type
   * type NumberType = HashSet.HashSet.Value<typeof numbers> // number
   *
   * const processNumber = (n: NumberType) => n * 2
   * processNumber(3) // => 6
   * ```
   *
   * @category utility types
   * @since 4.0.0
   */
  export type Value<T> = T extends HashSet<infer V> ? V : never
}

/**
 * Creates an empty HashSet.
 *
 * **Example** (Creating an empty HashSet)
 *
 * ```ts import.meta.vitest
 * import { HashSet } from "effect"
 *
 * const set = HashSet.empty<string>()
 *
 * HashSet.size(set) // => 0
 * HashSet.isEmpty(set) // => true
 *
 * // Add some values
 * const withValues = HashSet.add(HashSet.add(set, "hello"), "world")
 * withValues // => HashSet.make("hello", "world")
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const empty: <V = never>() => HashSet<V> = internal.empty

/**
 * Creates a HashSet from a variable number of values.
 *
 * **Example** (Creating a HashSet from values)
 *
 * ```ts import.meta.vitest
 * import { HashSet } from "effect"
 *
 * HashSet.make("apple", "banana", "cherry") // => HashSet.make("apple", "banana", "cherry")
 *
 * HashSet.make(1, 2, 3, 2, 1) // => HashSet.make(1, 2, 3)
 *
 * HashSet.make("hello", 42, true) // => HashSet.make("hello", 42, true)
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const make: <Values extends ReadonlyArray<any>>(
  ...values: Values
) => HashSet<Values[number]> = internal.make

/**
 * Creates a HashSet from an iterable collection of values.
 *
 * **Example** (Creating a HashSet from an iterable)
 *
 * ```ts import.meta.vitest
 * import { HashSet } from "effect"
 *
 * HashSet.fromIterable(["a", "b", "c", "b", "a"]) // => HashSet.make("a", "b", "c")
 *
 * HashSet.fromIterable(new Set([1, 2, 3])) // => HashSet.make(1, 2, 3)
 *
 * HashSet.fromIterable("hello") // => HashSet.make("h", "e", "l", "o")
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromIterable: <V>(values: Iterable<V>) => HashSet<V> = internal.fromIterable

/**
 * Checks whether a value is a HashSet.
 *
 * **Example** (Checking for a HashSet)
 *
 * ```ts import.meta.vitest
 * import { HashSet } from "effect"
 *
 * const set = HashSet.make(1, 2, 3)
 * const array = [1, 2, 3]
 *
 * HashSet.isHashSet(set) // => true
 * HashSet.isHashSet(array) // => false
 * HashSet.isHashSet(null) // => false
 * ```
 *
 * @category guards
 * @since 2.0.0
 */
export const isHashSet: {
  <V>(u: Iterable<V>): u is HashSet<V>
  (u: unknown): u is HashSet<unknown>
} = internal.isHashSet

/**
 * Adds a value to the HashSet, returning a new HashSet.
 *
 * **Example** (Adding values to a HashSet)
 *
 * ```ts import.meta.vitest
 * import { HashSet } from "effect"
 *
 * const set = HashSet.make("a", "b")
 * const withC = HashSet.add(set, "c")
 *
 * set // => HashSet.make("a", "b")
 * withC // => HashSet.make("a", "b", "c")
 * HashSet.has(withC, "c") // => true
 *
 * // Adding existing value has no effect
 * HashSet.add(set, "a") // => HashSet.make("a", "b")
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const add: {
  <V>(value: V): (self: HashSet<V>) => HashSet<V>
  <V>(self: HashSet<V>, value: V): HashSet<V>
} = Dual.dual<
  <V>(value: V) => (self: HashSet<V>) => HashSet<V>,
  <V>(self: HashSet<V>, value: V) => HashSet<V>
>(2, internal.add)

/**
 * Checks whether the HashSet contains the specified value.
 *
 * **Example** (Checking HashSet membership)
 *
 * ```ts import.meta.vitest
 * import { Equal, Hash, HashSet } from "effect"
 *
 * // Works with any type that implements Equal
 *
 * const set = HashSet.make("apple", "banana", "cherry")
 *
 * HashSet.has(set, "apple") // => true
 * HashSet.has(set, "grape") // => false
 *
 * class Person implements Equal.Equal {
 *   constructor(readonly name: string) {}
 *
 *   [Equal.symbol](other: unknown) {
 *     return other instanceof Person && this.name === other.name
 *   }
 *
 *   [Hash.symbol](): number {
 *     return Hash.string(this.name)
 *   }
 * }
 *
 * const people = HashSet.make(new Person("Alice"), new Person("Bob"))
 * HashSet.has(people, new Person("Alice")) // => true
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const has: {
  <V>(value: V): (self: HashSet<V>) => boolean
  <V>(self: HashSet<V>, value: V): boolean
} = Dual.dual<
  <V>(value: V) => (self: HashSet<V>) => boolean,
  <V>(self: HashSet<V>, value: V) => boolean
>(2, internal.has)

/**
 * Removes a value from the HashSet, returning a new HashSet.
 *
 * **Example** (Removing values from a HashSet)
 *
 * ```ts import.meta.vitest
 * import { HashSet } from "effect"
 *
 * const set = HashSet.make("a", "b", "c")
 * const withoutB = HashSet.remove(set, "b")
 *
 * set // => HashSet.make("a", "b", "c")
 * withoutB // => HashSet.make("a", "c")
 * HashSet.has(withoutB, "b") // => false
 *
 * // Removing non-existent value has no effect
 * HashSet.remove(set, "d") // => HashSet.make("a", "b", "c")
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const remove: {
  <V>(value: V): (self: HashSet<V>) => HashSet<V>
  <V>(self: HashSet<V>, value: V): HashSet<V>
} = Dual.dual<
  <V>(value: V) => (self: HashSet<V>) => HashSet<V>,
  <V>(self: HashSet<V>, value: V) => HashSet<V>
>(2, internal.remove)

/**
 * Returns the number of values in the HashSet.
 *
 * **Example** (Getting the HashSet size)
 *
 * ```ts import.meta.vitest
 * import { HashSet } from "effect"
 *
 * HashSet.size(HashSet.empty<string>()) // => 0
 *
 * HashSet.size(HashSet.make("a", "b")) // => 2
 *
 * HashSet.size(HashSet.fromIterable(["x", "y", "z", "x", "y"])) // => 3
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const size: <V>(self: HashSet<V>) => number = internal.size

/**
 * Checks whether the HashSet is empty.
 *
 * **Example** (Checking whether a HashSet is empty)
 *
 * ```ts import.meta.vitest
 * import { HashSet } from "effect"
 *
 * HashSet.isEmpty(HashSet.empty<string>()) // => true
 *
 * HashSet.isEmpty(HashSet.make("a")) // => false
 * ```
 *
 * @category predicates
 * @since 4.0.0
 */
export const isEmpty: <V>(self: HashSet<V>) => boolean = internal.isEmpty

/**
 * Creates the union of two HashSets.
 *
 * **Example** (Combining HashSets)
 *
 * ```ts import.meta.vitest
 * import { HashSet } from "effect"
 *
 * HashSet.union(HashSet.make("a", "b"), HashSet.make("b", "c")) // => HashSet.make("a", "b", "c")
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const union: {
  <V1>(that: HashSet<V1>): <V0>(self: HashSet<V0>) => HashSet<V1 | V0>
  <V0, V1>(self: HashSet<V0>, that: HashSet<V1>): HashSet<V0 | V1>
} = Dual.dual<
  <V1>(that: HashSet<V1>) => <V0>(self: HashSet<V0>) => HashSet<V1 | V0>,
  <V0, V1>(self: HashSet<V0>, that: HashSet<V1>) => HashSet<V0 | V1>
>(2, internal.union)

/**
 * Creates the intersection of two HashSets.
 *
 * **Example** (Finding common HashSet values)
 *
 * ```ts import.meta.vitest
 * import { HashSet } from "effect"
 *
 * HashSet.intersection(HashSet.make("a", "b", "c"), HashSet.make("b", "c", "d")) // => HashSet.make("b", "c")
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const intersection: {
  <V1>(that: HashSet<V1>): <V0>(self: HashSet<V0>) => HashSet<V1 & V0>
  <V0, V1>(self: HashSet<V0>, that: HashSet<V1>): HashSet<V0 & V1>
} = Dual.dual<
  <V1>(that: HashSet<V1>) => <V0>(self: HashSet<V0>) => HashSet<V1 & V0>,
  <V0, V1>(self: HashSet<V0>, that: HashSet<V1>) => HashSet<V0 & V1>
>(2, internal.intersection)

/**
 * Creates the difference of two HashSets (elements in the first set that are not in the second).
 *
 * **Example** (Finding HashSet differences)
 *
 * ```ts import.meta.vitest
 * import { HashSet } from "effect"
 *
 * HashSet.difference(HashSet.make("a", "b", "c"), HashSet.make("b", "d")) // => HashSet.make("a", "c")
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const difference: {
  <V1>(that: HashSet<V1>): <V0>(self: HashSet<V0>) => HashSet<V0>
  <V0, V1>(self: HashSet<V0>, that: HashSet<V1>): HashSet<V0>
} = Dual.dual<
  <V1>(that: HashSet<V1>) => <V0>(self: HashSet<V0>) => HashSet<V0>,
  <V0, V1>(self: HashSet<V0>, that: HashSet<V1>) => HashSet<V0>
>(2, internal.difference)

/**
 * Checks whether a HashSet is a subset of another HashSet.
 *
 * **Example** (Checking subset relationships)
 *
 * ```ts import.meta.vitest
 * import { HashSet } from "effect"
 *
 * const small = HashSet.make("a", "b")
 * const large = HashSet.make("a", "b", "c", "d")
 * const other = HashSet.make("x", "y")
 *
 * HashSet.isSubset(small, large) // => true
 * HashSet.isSubset(large, small) // => false
 * HashSet.isSubset(small, other) // => false
 * HashSet.isSubset(small, small) // => true
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const isSubset: {
  <V1>(that: HashSet<V1>): <V0>(self: HashSet<V0>) => boolean
  <V0, V1>(self: HashSet<V0>, that: HashSet<V1>): boolean
} = Dual.dual<
  <V1>(that: HashSet<V1>) => <V0>(self: HashSet<V0>) => boolean,
  <V0, V1>(self: HashSet<V0>, that: HashSet<V1>) => boolean
>(2, internal.isSubset)

/**
 * Maps each value in the HashSet using the provided function.
 *
 * **Example** (Mapping HashSet values)
 *
 * ```ts import.meta.vitest
 * import { HashSet } from "effect"
 *
 * const numbers = HashSet.make(1, 2, 3)
 * const doubled = HashSet.map(numbers, (n) => n * 2)
 *
 * doubled // => HashSet.make(2, 4, 6)
 *
 * // Mapping can reduce size if function produces duplicates
 * const strings = HashSet.make("apple", "banana", "cherry")
 * const lengths = HashSet.map(strings, (s) => s.length)
 * lengths // => HashSet.make(5, 6)
 * ```
 *
 * @category mapping
 * @since 2.0.0
 */
export const map: {
  <V, U>(f: (value: V) => U): (self: HashSet<V>) => HashSet<U>
  <V, U>(self: HashSet<V>, f: (value: V) => U): HashSet<U>
} = Dual.dual<
  <V, U>(f: (value: V) => U) => (self: HashSet<V>) => HashSet<U>,
  <V, U>(self: HashSet<V>, f: (value: V) => U) => HashSet<U>
>(2, internal.map)

/**
 * Filters the HashSet keeping only values that satisfy the predicate.
 *
 * **Example** (Filtering HashSet values)
 *
 * ```ts import.meta.vitest
 * import { HashSet } from "effect"
 *
 * HashSet.filter(HashSet.make(1, 2, 3, 4, 5, 6), (n) => n % 2 === 0) // => HashSet.make(2, 4, 6)
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const filter: {
  <V, U extends V>(refinement: Refinement<NoInfer<V>, U>): (self: HashSet<V>) => HashSet<U>
  <V>(predicate: Predicate<NoInfer<V>>): (self: HashSet<V>) => HashSet<V>
  <V, U extends V>(self: HashSet<V>, refinement: Refinement<V, U>): HashSet<U>
  <V>(self: HashSet<V>, predicate: Predicate<V>): HashSet<V>
} = Dual.dual<
  {
    <V, U extends V>(refinement: Refinement<NoInfer<V>, U>): (self: HashSet<V>) => HashSet<U>
    <V>(predicate: Predicate<NoInfer<V>>): (self: HashSet<V>) => HashSet<V>
  },
  {
    <V, U extends V>(self: HashSet<V>, refinement: Refinement<V, U>): HashSet<U>
    <V>(self: HashSet<V>, predicate: Predicate<V>): HashSet<V>
  }
>(2, internal.filter)

/**
 * Checks whether at least one value in the HashSet satisfies the predicate.
 *
 * **Example** (Testing whether some values match)
 *
 * ```ts import.meta.vitest
 * import { HashSet } from "effect"
 *
 * const numbers = HashSet.make(1, 2, 3, 4, 5)
 *
 * HashSet.some(numbers, (n) => n > 3) // => true
 * HashSet.some(numbers, (n) => n > 10) // => false
 *
 * HashSet.some(HashSet.empty<number>(), (n) => n > 0) // => false
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const some: {
  <V>(predicate: Predicate<V>): (self: HashSet<V>) => boolean
  <V>(self: HashSet<V>, predicate: Predicate<V>): boolean
} = Dual.dual<
  <V>(predicate: Predicate<V>) => (self: HashSet<V>) => boolean,
  <V>(self: HashSet<V>, predicate: Predicate<V>) => boolean
>(2, internal.some)

/**
 * Checks whether all values in the HashSet satisfy the predicate.
 *
 * **Example** (Testing whether every value matches)
 *
 * ```ts import.meta.vitest
 * import { HashSet } from "effect"
 *
 * const numbers = HashSet.make(2, 4, 6, 8)
 *
 * HashSet.every(numbers, (n) => n % 2 === 0) // => true
 * HashSet.every(numbers, (n) => n > 5) // => false
 *
 * HashSet.every(HashSet.empty<number>(), (n) => n > 0) // => true
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const every: {
  <V>(predicate: Predicate<V>): (self: HashSet<V>) => boolean
  <V>(self: HashSet<V>, predicate: Predicate<V>): boolean
} = Dual.dual<
  <V>(predicate: Predicate<V>) => (self: HashSet<V>) => boolean,
  <V>(self: HashSet<V>, predicate: Predicate<V>) => boolean
>(2, internal.every)

/**
 * Reduces the HashSet to a single value by iterating through the values and applying an accumulator function.
 *
 * **Example** (Reducing HashSet values)
 *
 * ```ts import.meta.vitest
 * import { HashSet } from "effect"
 *
 * const numbers = HashSet.make(1, 2, 3, 4, 5)
 * HashSet.reduce(numbers, 0, (acc, n) => acc + n) // => 15
 * ```
 *
 * @category folding
 * @since 2.0.0
 */
export const reduce: {
  <V, U>(zero: U, f: (accumulator: U, value: V) => U): (self: HashSet<V>) => U
  <V, U>(self: HashSet<V>, zero: U, f: (accumulator: U, value: V) => U): U
} = Dual.dual<
  <V, U>(zero: U, f: (accumulator: U, value: V) => U) => (self: HashSet<V>) => U,
  <V, U>(self: HashSet<V>, zero: U, f: (accumulator: U, value: V) => U) => U
>(3, internal.reduce)
