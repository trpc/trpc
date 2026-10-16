/**
 * Defines reusable equality functions for values of the same type.
 *
 * An `Equivalence<A>` returns `true` when two `A` values should be treated as
 * the same for a particular purpose. This module includes strict equality
 * instances for primitive types, constructors for custom comparisons, and
 * helpers for tuples, arrays, structs, records, dates, and values compared
 * through a derived field.
 *
 * @since 2.0.0
 */
import { dual } from "./Function.ts"
import type { TypeLambda } from "./HKT.ts"
import * as Reducer from "./Reducer.ts"

/**
 * Represents an equivalence relation over type `A`.
 *
 * **When to use**
 *
 * Use as a type annotation when you accept or return an equivalence function.
 *
 * **Details**
 *
 * - Returns `boolean`: `true` if values are equivalent, `false` otherwise
 * - Must satisfy reflexive, symmetric, and transitive properties
 *
 * **Example** (Defining simple number equivalence)
 *
 * ```ts import.meta.vitest
 * import type { Equivalence } from "effect"
 *
 * const numberEq: Equivalence.Equivalence<number> = (a, b) => a === b
 *
 * numberEq(1, 1) // => true
 * numberEq(1, 2) // => false
 * ```
 *
 * **Example** (Defining custom object equivalence)
 *
 * ```ts import.meta.vitest
 * import type { Equivalence } from "effect"
 *
 * interface Point {
 *   x: number
 *   y: number
 * }
 *
 * const pointEq: Equivalence.Equivalence<Point> = (a, b) =>
 *   a.x === b.x && a.y === b.y
 *
 * pointEq({ x: 1, y: 2 }, { x: 1, y: 2 }) // => true
 * ```
 *
 * @see {@link make}
 * @see {@link strictEqual}
 * @category models
 * @since 2.0.0
 */
export type Equivalence<in A> = (self: A, that: A) => boolean

/**
 * Type lambda for `Equivalence`, used for higher-kinded type operations.
 *
 * **When to use**
 *
 * Use when you need to abstract over `Equivalence` in higher-kinded type code.
 *
 * **Details**
 *
 * - Enables `Equivalence` to work with the Effect type system's HKT infrastructure
 * - Used internally for type-level computations and generic abstractions
 *
 * **Example** (Type-level usage)
 *
 * ```ts import.meta.vitest
 * import type { Equivalence, HKT } from "effect"
 *
 * // Used internally for type-level computations
 * type NumberEquivalence = HKT.Kind<
 *   Equivalence.EquivalenceTypeLambda,
 *   never,
 *   never,
 *   never,
 *   number
 * >
 * // Equivalent to: Equivalence.Equivalence<number>
 * ```
 *
 * @see {@link Equivalence}
 * @see {@link TypeLambda}
 * @category utility types
 * @since 2.0.0
 */
export interface EquivalenceTypeLambda extends TypeLambda {
  readonly type: Equivalence<this["Target"]>
}

/**
 * Creates a custom equivalence relation with an optimized reference equality check.
 *
 * **When to use**
 *
 * Use when you need an equality rule that the built-in instances and input
 * mapping helpers cannot express, and you can provide a law-abiding comparison.
 *
 * **Details**
 *
 * The returned equivalence first checks reference equality (`===`) for
 * performance. If the values are not the same reference, it falls back to the
 * provided equivalence function, which must satisfy reflexive, symmetric, and
 * transitive properties.
 *
 * **Example** (Case-insensitive string equivalence)
 *
 * ```ts import.meta.vitest
 * import { Equivalence } from "effect"
 *
 * const caseInsensitive = Equivalence.make<string>((a, b) =>
 *   a.toLowerCase() === b.toLowerCase()
 * )
 *
 * caseInsensitive("Hello", "HELLO") // => true
 * caseInsensitive("foo", "bar") // => false
 *
 * // Same reference optimization
 * const str = "test"
 * caseInsensitive(str, str) // => true
 * ```
 *
 * **Example** (Comparing numbers with tolerance)
 *
 * ```ts import.meta.vitest
 * import { Equivalence } from "effect"
 *
 * const tolerance = Equivalence.make<number>((a, b) => Math.abs(a - b) < 0.0001)
 *
 * tolerance(1.0, 1.001) // => false
 * tolerance(1.0, 1.00001) // => true
 * ```
 *
 * @see {@link strictEqual}
 * @see {@link mapInput}
 * @category constructors
 * @since 2.0.0
 */
export const make = <A>(isEquivalent: (self: A, that: A) => boolean): Equivalence<A> => (self: A, that: A): boolean =>
  self === that || isEquivalent(self, that)

const isStrictEquivalent = (x: unknown, y: unknown) => x === y

/**
 * Creates an equivalence relation that uses strict equality (`===`) to compare values.
 *
 * **When to use**
 *
 * Use when you need strict equality (`===`) as the comparison.
 *
 * **Details**
 *
 * Uses JavaScript's strict equality operator (`===`). Primitives compare by
 * value. Objects compare by reference, so only the same object instance is
 * equivalent. Use this as a building block for more complex equivalences via
 * `mapInput` or `combine`.
 *
 * **Gotchas**
 *
 * `NaN !== NaN`, so `NaN` values are never considered equivalent.
 *
 * **Example** (Comparing primitive types)
 *
 * ```ts import.meta.vitest
 * import { Equivalence } from "effect"
 *
 * const strictEq = Equivalence.strictEqual<number>()
 *
 * strictEq(1, 1) // => true
 * strictEq(1, 2) // => false
 * strictEq(NaN, NaN) // => false
 * ```
 *
 * **Example** (Comparing objects by reference)
 *
 * ```ts import.meta.vitest
 * import { Equivalence } from "effect"
 *
 * const obj = { value: 42 }
 * const strictObjEq = Equivalence.strictEqual<typeof obj>()
 *
 * strictObjEq(obj, obj) // => true
 * strictObjEq(obj, { value: 42 }) // => false
 * ```
 *
 * @see {@link make}
 * @see `Equal` for structural equality
 * @category constructors
 * @since 4.0.0
 */
export const strictEqual: <A>() => Equivalence<A> = () => isStrictEquivalent

/**
 * Equivalence instance for strings using strict equality (`===`).
 *
 * **When to use**
 *
 * Use when you need to supply case-sensitive string equality.
 *
 * **Example** (Comparing strings)
 *
 * ```ts import.meta.vitest
 * import { Equivalence } from "effect"
 *
 * Equivalence.String("hello", "hello") // => true
 * Equivalence.String("hello", "world") // => false
 * ```
 *
 * @category instances
 * @since 4.0.0
 */
export const String: Equivalence<string> = isStrictEquivalent

/**
 * Equivalence instance for numbers.
 *
 * **When to use**
 *
 * Use when you need numeric equality that treats NaN as equal to itself.
 *
 * **Example** (Comparing numbers)
 *
 * ```ts import.meta.vitest
 * import { Equivalence } from "effect"
 *
 * Equivalence.Number(1, 1) // => true
 * Equivalence.Number(1, 2) // => false
 * Equivalence.Number(NaN, NaN) // => true
 * ```
 *
 * @category instances
 * @since 4.0.0
 */
export const Number: Equivalence<number> = make((self, that) =>
  globalThis.Number.isNaN(self) && globalThis.Number.isNaN(that)
)

/**
 * Equivalence instance for booleans using strict equality (`===`).
 *
 * **When to use**
 *
 * Use when you need to supply boolean equality.
 *
 * **Example** (Comparing booleans)
 *
 * ```ts import.meta.vitest
 * import { Equivalence } from "effect"
 *
 * Equivalence.Boolean(true, true) // => true
 * Equivalence.Boolean(true, false) // => false
 * ```
 *
 * @category instances
 * @since 4.0.0
 */
export const Boolean: Equivalence<boolean> = isStrictEquivalent

/**
 * Equivalence instance for bigints using strict equality (`===`).
 *
 * **When to use**
 *
 * Use when you need to supply bigint equality.
 *
 * **Example** (Comparing bigints)
 *
 * ```ts import.meta.vitest
 * import { Equivalence } from "effect"
 *
 * Equivalence.BigInt(1n, 1n) // => true
 * Equivalence.BigInt(1n, 2n) // => false
 * ```
 *
 * @category instances
 * @since 4.0.0
 */
export const BigInt: Equivalence<bigint> = isStrictEquivalent

/**
 * Combines two equivalence relations using logical AND.
 *
 * **When to use**
 *
 * Use when you need to combine exactly two equivalences with AND semantics.
 *
 * **Details**
 *
 * Returns `true` only if both equivalences return `true`. The comparison
 * short-circuits when the first equivalence returns `false`. The result is also
 * an equivalence that satisfies reflexive, symmetric, and transitive
 * properties.
 *
 * **Example** (Combining name and age equivalences)
 *
 * ```ts import.meta.vitest
 * import { Equivalence } from "effect"
 *
 * interface Person {
 *   name: string
 *   age: number
 * }
 *
 * const nameEquivalence = Equivalence.mapInput(
 *   Equivalence.strictEqual<string>(),
 *   (p: Person) => p.name
 * )
 *
 * const ageEquivalence = Equivalence.mapInput(
 *   Equivalence.strictEqual<number>(),
 *   (p: Person) => p.age
 * )
 *
 * const personEquivalence = Equivalence.combine(nameEquivalence, ageEquivalence)
 *
 * const person1 = { name: "Alice", age: 30 }
 * const person2 = { name: "Alice", age: 30 }
 * const person3 = { name: "Alice", age: 31 }
 *
 * personEquivalence(person1, person2) // => true
 * personEquivalence(person1, person3) // => false
 * ```
 *
 * @see {@link combineAll}
 * @see {@link mapInput}
 * @category combining
 * @since 2.0.0
 */
export const combine: {
  <A>(that: Equivalence<A>): (self: Equivalence<A>) => Equivalence<A>
  <A>(self: Equivalence<A>, that: Equivalence<A>): Equivalence<A>
} = dual(2, <A>(self: Equivalence<A>, that: Equivalence<A>): Equivalence<A> => make((x, y) => self(x, y) && that(x, y)))

/**
 * Combines multiple equivalence relations into a single equivalence using logical AND.
 *
 * **When to use**
 *
 * Use when you need to combine many `Equivalence` instances from an iterable.
 *
 * **Details**
 *
 * Returns `true` only if all equivalences in the collection return `true`. The
 * comparison stops at the first equivalence that returns `false`. Empty
 * collections return an equivalence that always returns `true`. The result is
 * also an equivalence that satisfies reflexive, symmetric, and transitive
 * properties.
 *
 * **Example** (Combining multiple field equivalences)
 *
 * ```ts import.meta.vitest
 * import { Equivalence } from "effect"
 *
 * interface Point3D {
 *   x: number
 *   y: number
 *   z: number
 * }
 *
 * const xEq = Equivalence.mapInput(
 *   Equivalence.strictEqual<number>(),
 *   (p: Point3D) => p.x
 * )
 * const yEq = Equivalence.mapInput(
 *   Equivalence.strictEqual<number>(),
 *   (p: Point3D) => p.y
 * )
 * const zEq = Equivalence.mapInput(
 *   Equivalence.strictEqual<number>(),
 *   (p: Point3D) => p.z
 * )
 *
 * const point3DEq = Equivalence.combineAll([xEq, yEq, zEq])
 *
 * const point1 = { x: 1, y: 2, z: 3 }
 * const point2 = { x: 1, y: 2, z: 3 }
 * const point3 = { x: 1, y: 2, z: 4 }
 *
 * point3DEq(point1, point2) // => true
 * point3DEq(point1, point3) // => false
 * ```
 *
 * **Example** (Handling empty collections)
 *
 * ```ts import.meta.vitest
 * import { Equivalence } from "effect"
 *
 * // Empty collection always returns true
 * const alwaysEq = Equivalence.combineAll([])
 * alwaysEq("anything", "else") // => true
 * ```
 *
 * @see {@link combine}
 * @see {@link mapInput}
 * @category combining
 * @since 2.0.0
 */
export const combineAll = <A>(collection: Iterable<Equivalence<A>>): Equivalence<A> =>
  make((x, y) => {
    for (const equivalence of collection) {
      if (!equivalence(x, y)) {
        return false
      }
    }
    return true
  })

/**
 * Transforms an equivalence relation by mapping the input values before comparison.
 *
 * **When to use**
 *
 * Use when you need an equivalence for one type by comparing a derived value.
 *
 * **Details**
 *
 * - Applies the transformation function to both values before comparing
 * - The transformation function should be pure and have no side effects
 * - The resulting equivalence compares the transformed values using the provided equivalence
 * - The result is also an equivalence that satisfies reflexive, symmetric, and transitive properties
 * - Useful for comparing by one property or normalizing values before
 *   comparison, such as case-insensitive strings
 *
 * **Example** (Deriving equivalence from an object property)
 *
 * ```ts import.meta.vitest
 * import { Equivalence } from "effect"
 *
 * interface User {
 *   id: number
 *   name: string
 *   email: string
 * }
 *
 * // Create equivalence based on user ID only
 * const userByIdEq = Equivalence.mapInput(
 *   Equivalence.strictEqual<number>(),
 *   (user: User) => user.id
 * )
 *
 * const user1 = { id: 1, name: "Alice", email: "alice@example.com" }
 * const user2 = { id: 1, name: "Alice Smith", email: "alice.smith@example.com" }
 * const user3 = { id: 2, name: "Bob", email: "bob@example.com" }
 *
 * userByIdEq(user1, user2) // => true
 * userByIdEq(user1, user3) // => false
 * ```
 *
 * **Example** (Case-insensitive string equivalence)
 *
 * ```ts import.meta.vitest
 * import { Equivalence } from "effect"
 *
 * const caseInsensitiveEq = Equivalence.mapInput(
 *   Equivalence.strictEqual<string>(),
 *   (s: string) => s.toLowerCase()
 * )
 *
 * caseInsensitiveEq("Hello", "HELLO") // => true
 * caseInsensitiveEq("Hello", "World") // => false
 * ```
 *
 * @see {@link combine}
 * @see {@link Struct}
 * @category mapping
 * @since 2.0.0
 */
export const mapInput: {
  <B, A>(f: (b: B) => A): (self: Equivalence<A>) => Equivalence<B>
  <A, B>(self: Equivalence<A>, f: (b: B) => A): Equivalence<B>
} = dual(
  2,
  <A, B>(self: Equivalence<A>, f: (b: B) => A): Equivalence<B> => make((x, y) => self(f(x), f(y)))
)

/**
 * Creates an equivalence for tuples with heterogeneous element types.
 *
 * **When to use**
 *
 * Use when you need an `Equivalence` for fixed-length tuples with per-position
 * equivalences.
 *
 * **Details**
 *
 * Tuples must have the same length; different lengths are never equivalent.
 * Each equivalence is applied to the corresponding element position. The result
 * returns `true` only if all elements are equivalent according to their
 * respective equivalences, and it also satisfies reflexive, symmetric, and
 * transitive properties.
 *
 * **Example** (Comparing homogeneous tuples)
 *
 * ```ts import.meta.vitest
 * import { Equivalence } from "effect"
 *
 * const stringTupleEq = Equivalence.Tuple([
 *   Equivalence.strictEqual<string>(),
 *   Equivalence.strictEqual<string>(),
 *   Equivalence.strictEqual<string>()
 * ])
 *
 * const tuple1 = ["hello", "world", "test"] as const
 * const tuple2 = ["hello", "world", "test"] as const
 * const tuple3 = ["hello", "world", "different"] as const
 *
 * stringTupleEq(tuple1, tuple2) // => true
 * stringTupleEq(tuple1, tuple3) // => false
 * ```
 *
 * **Example** (Comparing tuples with custom equivalences)
 *
 * ```ts import.meta.vitest
 * import { Equivalence } from "effect"
 *
 * const caseInsensitive = Equivalence.mapInput(
 *   Equivalence.strictEqual<string>(),
 *   (s: string) => s.toLowerCase()
 * )
 *
 * const customTupleEq = Equivalence.Tuple([
 *   caseInsensitive,
 *   caseInsensitive,
 *   caseInsensitive
 * ])
 *
 * customTupleEq(["Hello", "World", "Test"], ["HELLO", "WORLD", "TEST"]) // => true
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export function Tuple<const Elements extends ReadonlyArray<Equivalence<any>>>(
  elements: Elements
): Equivalence<{ readonly [I in keyof Elements]: [Elements[I]] extends [Equivalence<infer A>] ? A : never }> {
  return make((self, that) => {
    if (self.length !== that.length) {
      return false
    }
    for (let i = 0; i < self.length; i++) {
      if (!elements[i](self[i], that[i])) {
        return false
      }
    }
    return true
  })
}

/**
 * @since 4.0.0
 */
function Array_<A>(item: Equivalence<A>): Equivalence<ReadonlyArray<A>> {
  return make((self, that) => {
    if (self.length !== that.length) return false

    for (let i = 0; i < self.length; i++) {
      if (!item(self[i], that[i])) return false
    }

    return true
  })
}
export {
  /**
   * Creates an equivalence for arrays where all elements are compared using the same equivalence.
   *
   * **When to use**
   *
   * Use when you need to compare arrays with one equivalence for every element.
   *
   * **Details**
   *
   * - Requires arrays to have the same length; different lengths are never equivalent
   * - Compares elements positionally, such as index `0` with index `0`
   * - Returns `true` only if all corresponding elements are equivalent
   * - Empty arrays are considered equivalent
   * - The result is also an equivalence that satisfies reflexive, symmetric, and transitive properties
   *
   * **Example** (Comparing number arrays)
   *
   * ```ts import.meta.vitest
   * import { Equivalence } from "effect"
   *
   * const numberArrayEq = Equivalence.Array(Equivalence.strictEqual<number>())
   *
   * numberArrayEq([1, 2, 3], [1, 2, 3]) // => true
   * numberArrayEq([1, 2, 3], [1, 2, 4]) // => false
   * numberArrayEq([1, 2], [1, 2, 3]) // => false
   * ```
   *
   * **Example** (Case-insensitive string array)
   *
   * ```ts import.meta.vitest
   * import { Equivalence } from "effect"
   *
   * const caseInsensitive = Equivalence.mapInput(
   *   Equivalence.strictEqual<string>(),
   *   (s: string) => s.toLowerCase()
   * )
   * const stringArrayEq = Equivalence.Array(caseInsensitive)
   *
   * stringArrayEq(["Hello", "World"], ["HELLO", "WORLD"]) // => true
   * stringArrayEq(["Hello"], ["Hi"]) // => false
   * stringArrayEq([], []) // => true
   * ```
   *
   * @see {@link Tuple}
   * @see {@link Record}
   * @category combinators
   * @since 4.0.0
   */
  Array_ as Array
}

/**
 * Creates an equivalence for objects by comparing their properties using provided equivalences.
 *
 * **When to use**
 *
 * Use when you need an `Equivalence` for objects with known, fixed property
 * names.
 *
 * **Details**
 *
 * Compares only the properties specified in the struct definition; other
 * properties are ignored. String and symbol keys are supported via
 * `Reflect.ownKeys`. The result returns `true` only if all specified properties
 * are equivalent according to their equivalences, and it also satisfies
 * reflexive, symmetric, and transitive properties.
 *
 * **Example** (Comparing structs with different equivalences per field)
 *
 * ```ts import.meta.vitest
 * import { Equivalence } from "effect"
 *
 * interface Person {
 *   name: string
 *   age: number
 *   email: string
 * }
 *
 * const caseInsensitive = Equivalence.mapInput(
 *   Equivalence.strictEqual<string>(),
 *   (s: string) => s.toLowerCase()
 * )
 *
 * const personEq = Equivalence.Struct({
 *   name: caseInsensitive,
 *   age: Equivalence.strictEqual<number>(),
 *   email: caseInsensitive
 * })
 *
 * const person1 = { name: "Alice", age: 30, email: "alice@example.com" }
 * const person2 = { name: "ALICE", age: 30, email: "ALICE@EXAMPLE.COM" }
 * const person3 = { name: "Alice", age: 31, email: "alice@example.com" }
 *
 * personEq(person1, person2) // => true
 * personEq(person1, person3) // => false
 * ```
 *
 * **Example** (Comparing specific fields)
 *
 * ```ts import.meta.vitest
 * import { Equivalence } from "effect"
 *
 * const nameAgeEq = Equivalence.Struct({
 *   name: Equivalence.strictEqual<string>(),
 *   age: Equivalence.strictEqual<number>()
 * })
 *
 * // Only compares name and age, ignores other properties
 * const obj1 = { name: "Alice", age: 30, extra: "ignored" }
 * const obj2 = { name: "Alice", age: 30, extra: "different" }
 * nameAgeEq(obj1, obj2) // => true
 * ```
 *
 * @see {@link Record}
 * @see {@link mapInput}
 * @see {@link combine}
 * @category combinators
 * @since 4.0.0
 */
export function Struct<R extends Record<string, Equivalence<any>>>(
  fields: R
): Equivalence<{ readonly [K in keyof R]: [R[K]] extends [Equivalence<infer A>] ? A : never }> {
  const keys: Array<any> = Reflect.ownKeys(fields)
  return make((self, that) => {
    for (const key of keys) {
      if (!fields[key](self[key], that[key])) return false
    }
    return true
  })
}

/**
 * Creates an equivalence for objects by comparing all properties using the same equivalence.
 *
 * **When to use**
 *
 * Use when you need to compare records with the same equivalence for every
 * property value.
 *
 * **Details**
 *
 * - Compares all properties present in both objects
 * - Requires both objects to have the same set of keys; different keys result in `false`
 * - All property values must be equivalent according to the provided equivalence
 * - Supports both string and symbol keys via `Reflect.ownKeys`
 * - Empty objects are considered equivalent
 * - The result is also an equivalence that satisfies reflexive, symmetric, and transitive properties
 *
 * **Example** (Defining records with string values)
 *
 * ```ts import.meta.vitest
 * import { Equivalence } from "effect"
 *
 * const stringRecordEq = Equivalence.Record(Equivalence.strictEqual<string>())
 *
 * const record1 = { a: "hello", b: "world" }
 * const record2 = { a: "hello", b: "world" }
 * const record3 = { a: "hello", b: "different" }
 * const record4 = { a: "hello" } // missing key 'b'
 *
 * stringRecordEq(record1, record2) // => true
 * stringRecordEq(record1, record3) // => false
 * stringRecordEq(record1, record4) // => false
 * ```
 *
 * **Example** (Defining records with number values)
 *
 * ```ts import.meta.vitest
 * import { Equivalence } from "effect"
 *
 * const numberRecordEq = Equivalence.Record(Equivalence.strictEqual<number>())
 *
 * const scores1 = { alice: 100, bob: 85 }
 * const scores2 = { alice: 100, bob: 85 }
 * const scores3 = { alice: 100, bob: 90 }
 *
 * numberRecordEq(scores1, scores2) // => true
 * numberRecordEq(scores1, scores3) // => false
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export function Record<A>(value: Equivalence<A>): Equivalence<Record<PropertyKey, A>> {
  return make((self, that) => {
    const selfKeys = Reflect.ownKeys(self)
    const thatKeys = Reflect.ownKeys(that)

    if (selfKeys.length !== thatKeys.length) return false

    for (const key of selfKeys) {
      if (!Object.hasOwn(that, key) || !value(self[key], that[key])) {
        return false
      }
    }

    return true
  })
}

/**
 * Creates a `Reducer` for combining `Equivalence` instances, useful for aggregating equivalences in collections.
 *
 * **When to use**
 *
 * Use when you need a reducer that combines equivalences.
 *
 * **Details**
 *
 * Returns a reducer that combines equivalences using `combine`. The identity
 * element for empty collections is an equivalence that always returns `true`.
 * The reducer uses `combineAll` for collections of equivalences and can be used
 * with fold operations.
 *
 * **Example** (Creating a Reducer)
 *
 * ```ts import.meta.vitest
 * import { Equivalence } from "effect"
 *
 * const reducer = Equivalence.makeReducer<number>()
 * const equivalences = [
 *   Equivalence.strictEqual<number>(),
 *   Equivalence.make<number>((a, b) => Math.abs(a - b) < 1)
 * ]
 *
 * const combined = reducer.combineAll(equivalences)
 * // Combined equivalence requires both conditions to be true
 * combined(1, 1) // => true
 * combined(1, 1.5) // => false
 * ```
 *
 * @see {@link combine} Combine two equivalences
 * @see {@link combineAll} Combine multiple equivalences
 * @see {@link Reducer} Reducer type for collection operations
 * @category constructors
 * @since 4.0.0
 */
export function makeReducer<A>() {
  return Reducer.make<Equivalence<A>>(
    combine,
    () => true,
    combineAll
  )
}

/**
 * Equivalence instance for `Date` objects that compares their `getTime()` values using `Equivalence.Number`.
 *
 * **When to use**
 *
 * Use when you need an `Equivalence` for JavaScript date objects by their
 * millisecond timestamp.
 *
 * **Details**
 *
 * Different `Date` instances that represent the same millisecond timestamp are equivalent. Because `Equivalence.Number`
 * treats `NaN` as equal to `NaN`, two invalid `Date` values are also considered equivalent.
 *
 * **Example** (Comparing Date values)
 *
 * ```ts import.meta.vitest
 * import { Equivalence } from "effect"
 *
 * const d1 = new Date("2020-01-01T00:00:00.000Z")
 * const d2 = new Date("2020-01-01T00:00:00.000Z")
 * const d3 = new Date("2021-01-01T00:00:00.000Z")
 * const invalidDate1 = new Date("foo")
 * const invalidDate2 = new Date("bar")
 *
 * Equivalence.Date(d1, d2) // => true
 * Equivalence.Date(d1, d3) // => false
 * Equivalence.Date(invalidDate1, invalidDate2) // => true
 * Equivalence.Date(invalidDate1, d1) // => false
 * ```
 *
 * **Example** (Comparing reference and value equality)
 *
 * ```ts import.meta.vitest
 * import { Equivalence } from "effect"
 *
 * const d1 = new Date(0)
 * const d2 = new Date(0)
 *
 * d1 === d2 // => false
 * Equivalence.Date(d1, d2) // => true
 * ```
 *
 * @see {@link Number} for the numeric equivalence applied to each `Date#getTime()` result
 * @see {@link mapInput} for deriving an equivalence by mapping inputs before comparison
 * @see {@link strictEqual} for reference equality when two values must be the same object
 * @category instances
 * @since 2.0.0
 */
export const Date: Equivalence<Date> = mapInput(
  Number,
  (d: Date) => d.getTime()
)
