/**
 * Works with plain JavaScript records as immutable key/value dictionaries.
 *
 * A record is an object whose keys are strings or symbols. This module includes
 * helpers for construction, lookup, updates, mapping, filtering, folding,
 * set-like combination, and typed conversions between records and iterable
 * entries. Helpers that change values return new records instead of mutating the
 * input.
 *
 * @since 2.0.0
 */

import type * as Combiner from "./Combiner.ts"
import * as Equal from "./Equal.ts"
import type { Equivalence } from "./Equivalence.ts"
import { dual, identity } from "./Function.ts"
import type { TypeLambda } from "./HKT.ts"
import * as InternalRecord from "./internal/record.ts"
import * as Option from "./Option.ts"
import * as Reducer from "./Reducer.ts"
import type { Result } from "./Result.ts"
import * as R from "./Result.ts"
import type { NoInfer } from "./Types.ts"

/**
 * Represents a readonly record with keys of type `K` and values of type `A`.
 * This is the foundational type for immutable key-value mappings in Effect.
 *
 * **Example** (Defining a readonly record type)
 *
 * ```ts import.meta.vitest
 * import type { Record } from "effect"
 *
 * // Creating a readonly record type
 * type UserRecord = Record.ReadonlyRecord<"name" | "age", string | number>
 *
 * const user: UserRecord = {
 *   name: "John",
 *   age: 30
 * }
 * user // => { name: "John", age: 30 }
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export type ReadonlyRecord<in out K extends string | symbol, out A> = {
  readonly [P in K]: A
}

/**
 * Namespace containing utility types for working with readonly records.
 * These types help with type-level operations on record keys and values.
 *
 * **Example** (Using readonly record helper types)
 *
 * ```ts import.meta.vitest
 * import type { Record } from "effect"
 *
 * // Using NonLiteralKey to convert literal keys to generic types
 * type GenericKey = Record.ReadonlyRecord.NonLiteralKey<"foo" | "bar"> // string
 *
 * // Using IntersectKeys to find common keys between record types
 * type CommonKeys = Record.ReadonlyRecord.IntersectKeys<"a" | "b", "b" | "c"> // "b"
 *
 * "key" satisfies GenericKey
 * "b" satisfies CommonKeys
 * ```
 *
 * @since 2.0.0
 */
export declare namespace ReadonlyRecord {
  type IsFiniteString<T extends string> = T extends "" ? true :
    [T] extends [`${infer Head}${infer Rest}`]
      ? string extends Head ? false : `${number}` extends Head ? false : Rest extends "" ? true : IsFiniteString<Rest>
    : false

  /**
   * Represents a type that converts literal string keys to generic string type and symbol keys to generic symbol type.
   * This is useful for maintaining type safety while allowing flexible key types in record operations.
   *
   * **Example** (Converting literal keys to non-literal keys)
   *
   * ```ts import.meta.vitest
   * import type { Record } from "effect"
   *
   * // For literal string keys, this becomes 'string'
   * type Example1 = Record.ReadonlyRecord.NonLiteralKey<"foo" | "bar"> // string
   *
   * // For symbol keys, this becomes 'symbol'
   * type Example2 = Record.ReadonlyRecord.NonLiteralKey<symbol> // symbol
   *
   * const symbol: Example2 = Symbol.for("key")
   * "key" satisfies Example1
   * symbol
   * ```
   *
   * @category models
   * @since 2.0.0
   */
  export type NonLiteralKey<K extends string | symbol> = K extends string ? IsFiniteString<K> extends true ? string : K
    : symbol

  /**
   * Represents the intersection of two key types, handling both literal and non-literal string keys.
   * This type is used in record operations that need to compute overlapping keys.
   *
   * **Example** (Intersecting record keys)
   *
   * ```ts import.meta.vitest
   * import type { Record } from "effect"
   *
   * // Intersection of literal keys
   * type Example1 = Record.ReadonlyRecord.IntersectKeys<"a" | "b", "b" | "c"> // "b"
   *
   * // Intersection with generic string
   * type Example2 = Record.ReadonlyRecord.IntersectKeys<string, "a" | "b"> // string
   *
   * "b" satisfies Example1
   * "a" satisfies Example2
   * ```
   *
   * @category models
   * @since 2.0.0
   */
  export type IntersectKeys<K1 extends string, K2 extends string> = [string] extends [K1 | K2] ?
    NonLiteralKey<K1> & NonLiteralKey<K2>
    : K1 & K2

  /**
   * Represents a record produced by grouping values under keys of type `K`.
   *
   * **Details**
   *
   * Finite string or symbol key types become optional because an input may not
   * produce every possible key. Open `string` and `symbol` key types retain their
   * record index signatures.
   *
   * @category utility types
   * @since 4.0.0
   */
  export type GroupByResult<K extends string | symbol, V> = [NonLiteralKey<K>] extends [K] ? Record<K, V>
    : Partial<Record<K, V>>
}

/**
 * Type lambda for readonly records, used in higher-kinded type operations.
 * This enables records to work with generic type constructors and functors.
 *
 * **Example** (Applying a readonly record type lambda)
 *
 * ```ts import.meta.vitest
 * import type { HKT, Record } from "effect"
 *
 * type Settings = HKT.Kind<
 *   Record.ReadonlyRecordTypeLambda<"port" | "retries">,
 *   never,
 *   never,
 *   never,
 *   number
 * >
 *
 * const defaults: Settings = {
 *   port: 3000,
 *   retries: 3
 * }
 * defaults // => { port: 3000, retries: 3 }
 * ```
 *
 * @category utility types
 * @since 2.0.0
 */
export interface ReadonlyRecordTypeLambda<K extends string = string> extends TypeLambda {
  readonly type: ReadonlyRecord<K, this["Target"]>
}

/**
 * Creates a new, empty record.
 *
 * **Example** (Creating an empty record)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * // Create an empty record
 * const emptyRecord = Record.empty<string, number>()
 * emptyRecord // => {}
 *
 * // The type ensures type safety for future operations
 * Record.set(emptyRecord, "count", 42) // => { count: 42 }
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const empty = <K extends string | symbol = never, V = never>(): Record<
  ReadonlyRecord.NonLiteralKey<K>,
  V
> => ({} as any)

/**
 * Determines if a mutable record is empty.
 *
 * **Example** (Checking for an empty record)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * Record.isEmptyRecord({}) // => true
 * Record.isEmptyRecord({ a: 3 }) // => false
 * ```
 *
 * @category guards
 * @since 2.0.0
 */
export const isEmptyRecord = <K extends string, A>(self: Record<K, A>): self is Record<K, never> =>
  Object.keys(self).length === 0

/**
 * Determines if a readonly record is empty.
 *
 * **Example** (Checking for an empty readonly record)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * Record.isEmptyReadonlyRecord({}) // => true
 * Record.isEmptyReadonlyRecord({ a: 3 }) // => false
 * ```
 *
 * @category guards
 * @since 2.0.0
 */
export const isEmptyReadonlyRecord: <K extends string, A>(
  self: ReadonlyRecord<K, A>
) => self is ReadonlyRecord<K, never> = isEmptyRecord

/**
 * Takes an iterable and a projection function and returns a record.
 * The projection function maps each value of the iterable to a tuple of a key and a value, which is then added to the resulting record.
 *
 * **Example** (Building a record from mapped iterable values)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * Record.fromIterableWith([1, 2, 3, 4], (a) => [String(a), a * 2]) // => { "1": 2, "2": 4, "3": 6, "4": 8 }
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromIterableWith: {
  <A, K extends string | symbol, B>(
    f: (a: A) => readonly [K, B]
  ): (self: Iterable<A>) => Record<ReadonlyRecord.NonLiteralKey<K>, B>
  <A, K extends string | symbol, B>(
    self: Iterable<A>,
    f: (a: A) => readonly [K, B]
  ): Record<ReadonlyRecord.NonLiteralKey<K>, B>
} = dual(
  2,
  <A, K extends string, B>(
    self: Iterable<A>,
    f: (a: A) => readonly [K, B]
  ): Record<ReadonlyRecord.NonLiteralKey<K>, B> => {
    const out: Record<string, B> = empty()
    for (const a of self) {
      const [k, b] = f(a)
      InternalRecord.assignProperty(out, k, b)
    }
    return out
  }
)

/**
 * Creates a new record from an iterable, utilizing the provided function to determine the key for each element.
 *
 * **Example** (Building a record keyed by iterable values)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * const users = [
 *   { id: "2", name: "name2" },
 *   { id: "1", name: "name1" }
 * ]
 *
 * Record.fromIterableBy(
 *   users,
 *   (user) => user.id
 * ) // => { "1": { id: "1", name: "name1" }, "2": { id: "2", name: "name2" } }
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromIterableBy: {
  <A, K extends string | symbol>(
    f: (a: A) => K
  ): (items: Iterable<A>) => Record<ReadonlyRecord.NonLiteralKey<K>, A>
  <A, K extends string | symbol>(
    items: Iterable<A>,
    f: (a: A) => K
  ): Record<ReadonlyRecord.NonLiteralKey<K>, A>
} = dual(
  2,
  <A, K extends string | symbol>(
    items: Iterable<A>,
    f: (a: A) => K
  ): Record<ReadonlyRecord.NonLiteralKey<K>, A> => fromIterableWith(items, (a) => [f(a), a])
)

/**
 * Builds a record from an iterable of key-value pairs.
 *
 * **Details**
 *
 * If there are conflicting keys when using `fromEntries`, the last occurrence of the key/value pair will overwrite the
 * previous ones. So the resulting record will only have the value of the last occurrence of each key.
 *
 * **Example** (Building a record from entries)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * Record.fromEntries([["a", 1], ["b", 2]]) // => { a: 1, b: 2 }
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromEntries: <Entry extends readonly [string | symbol, any]>(
  entries: Iterable<Entry>
) => Record<ReadonlyRecord.NonLiteralKey<Entry[0]>, Entry[1]> = Object.fromEntries

/**
 * Transforms the values of a record into an `Array` with a custom mapping function.
 *
 * **Example** (Collecting mapped record values)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * const x = { a: 1, b: 2, c: 3 }
 * Record.collect(x, (key, n) => [key, n]) // => [["a", 1], ["b", 2], ["c", 3]]
 * ```
 *
 * @category converting
 * @since 2.0.0
 */
export const collect: {
  <K extends string, A, B>(f: (key: K, a: A) => B): (self: ReadonlyRecord<K, A>) => Array<B>
  <K extends string, A, B>(self: ReadonlyRecord<K, A>, f: (key: K, a: A) => B): Array<B>
} = dual(
  2,
  <K extends string, A, B>(self: ReadonlyRecord<K, A>, f: (key: K, a: A) => B): Array<B> => {
    const out: Array<B> = []
    for (const key of keys(self)) {
      out.push(f(key, self[key]))
    }
    return out
  }
)

/**
 * Takes a record and returns an array of tuples containing its keys and values.
 *
 * **Example** (Converting a record to entries)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * const x = { a: 1, b: 2, c: 3 }
 * Record.toEntries(x) // => [["a", 1], ["b", 2], ["c", 3]]
 * ```
 *
 * @category converting
 * @since 2.0.0
 */
export const toEntries: <K extends string, A>(self: ReadonlyRecord<K, A>) => Array<[K, A]> = collect((
  key,
  value
) => [key, value])

/**
 * Returns the number of key/value pairs in a record.
 *
 * **Example** (Getting the record size)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * Record.size({ a: "a", b: 1, c: true }) // => 3
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const size = <K extends string, A>(self: ReadonlyRecord<K, A>): number => keys(self).length

/**
 * Checks whether a given `key` exists in a record.
 *
 * **Example** (Checking key membership)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * Record.has({ a: 1, b: 2 }, "a") // => true
 * Record.has(Record.empty<string>(), "c") // => false
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const has: {
  <K extends string | symbol>(
    key: NoInfer<K>
  ): <A>(self: ReadonlyRecord<K, A>) => boolean
  <K extends string | symbol, A>(
    self: ReadonlyRecord<K, A>,
    key: NoInfer<K>
  ): boolean
} = dual(
  2,
  <K extends string | symbol, A>(
    self: ReadonlyRecord<K, A>,
    key: NoInfer<K>
  ): boolean => Object.hasOwn(self, key)
)

/**
 * Retrieves a value at a particular key from a record safely, returning it wrapped in an `Option`.
 *
 * **Example** (Getting a value as an Option)
 *
 * ```ts import.meta.vitest
 * import { Option, Record as R } from "effect"
 *
 * const person: Record<string, unknown> = { name: "John Doe", age: 35 }
 *
 * R.get(person, "name") // => Option.some("John Doe")
 * R.get(person, "email") // => Option.none()
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const get: {
  <K extends string | symbol>(key: NoInfer<K>): <A>(self: ReadonlyRecord<K, A>) => Option.Option<A>
  <K extends string | symbol, A>(self: ReadonlyRecord<K, A>, key: NoInfer<K>): Option.Option<A>
} = dual(
  2,
  <K extends string | symbol, A>(self: ReadonlyRecord<K, A>, key: NoInfer<K>): Option.Option<A> =>
    Object.hasOwn(self, key) ? Option.some(self[key]) : Option.none()
)

/**
 * Applies a function to the element at the specified key safely, creating a new record,
 * or return `Option.none()` if the key doesn't exist.
 *
 * **Example** (Modifying a value at a key)
 *
 * ```ts import.meta.vitest
 * import { Option, Record } from "effect"
 *
 * const f = (x: number) => x * 2
 *
 * const input: Record<string, number> = { a: 3 }
 *
 * Record.modify(input, "a", f) // => Option.some({ a: 6 })
 * Record.modify(input, "b", f) // => Option.none()
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const modify: {
  <K extends string | symbol, A, B>(
    key: NoInfer<K>,
    f: (a: A) => B
  ): (self: ReadonlyRecord<K, A>) => Option.Option<Record<K, A | B>>
  <K extends string | symbol, A, B>(
    self: ReadonlyRecord<K, A>,
    key: NoInfer<K>,
    f: (a: A) => B
  ): Option.Option<Record<K, A | B>>
} = dual(
  3,
  <K extends string | symbol, A, B>(
    self: ReadonlyRecord<K, A>,
    key: NoInfer<K>,
    f: (a: A) => B
  ): Option.Option<Record<K, A | B>> => {
    if (!has(self, key)) return Option.none()
    return Option.some({ ...self, [key]: f(self[key]) })
  }
)

/**
 * Replaces the value at an existing key safely and returns the updated record in
 * `Option.some`.
 *
 * **Details**
 *
 * If the key is not present, returns `Option.none()` and leaves the record
 * unchanged.
 *
 * **Example** (Replacing a value at a key)
 *
 * ```ts import.meta.vitest
 * import { Option, Record } from "effect"
 *
 * Record.replace({ a: 1, b: 2, c: 3 }, "a", 10) // => Option.some({ a: 10, b: 2, c: 3 })
 * Record.replace(Record.empty<string>(), "a", 10) // => Option.none()
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const replace: {
  <K extends string | symbol, B>(
    key: NoInfer<K>,
    b: B
  ): <A>(self: ReadonlyRecord<K, A>) => Option.Option<Record<K, A | B>>
  <K extends string | symbol, A, B>(
    self: ReadonlyRecord<K, A>,
    key: NoInfer<K>,
    b: B
  ): Option.Option<Record<K, A | B>>
} = dual(
  3,
  <K extends string | symbol, A, B>(
    self: ReadonlyRecord<K, A>,
    key: NoInfer<K>,
    b: B
  ): Option.Option<Record<K, A | B>> => modify(self, key, () => b)
)

/**
 * Removes a key from a record.
 *
 * **When to use**
 *
 * Use to create a shallow copy of a record without one property.
 *
 * **Details**
 *
 * If the key is not present, the result is still a shallow copy of the original
 * record.
 *
 * **Example** (Removing a key)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * Record.remove({ a: 1, b: 2 }, "a") // => { b: 2 }
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const remove: {
  <K extends string | symbol, X extends K>(key: X): <A>(self: ReadonlyRecord<K, A>) => Record<Exclude<K, X>, A>
  <K extends string | symbol, A, X extends K>(self: ReadonlyRecord<K, A>, key: X): Record<Exclude<K, X>, A>
} = dual(
  2,
  <K extends string | symbol, A, X extends K>(self: ReadonlyRecord<K, A>, key: X): Record<Exclude<K, X>, A> => {
    if (!has(self, key)) {
      return { ...self }
    }
    const out = { ...self }
    delete out[key]
    return out
  }
)

/**
 * Retrieves the value of the property with the given `key` from a record safely and returns an `Option`
 * of a tuple with the value and the record with the removed property.
 * If the key is not present, returns `Option.none()`.
 *
 * **Example** (Popping a value and removing its key)
 *
 * ```ts import.meta.vitest
 * import { Option, Record } from "effect"
 *
 * const input: Record<string, number> = { a: 1, b: 2 }
 *
 * Record.pop(input, "a") // => Option.some([1, { b: 2 }])
 * Record.pop(input, "c") // => Option.none()
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const pop: {
  <K extends string | symbol, X extends K>(
    key: X
  ): <A>(self: ReadonlyRecord<K, A>) => Option.Option<[A, Record<Exclude<K, X>, A>]>
  <K extends string | symbol, A, X extends K>(
    self: ReadonlyRecord<K, A>,
    key: X
  ): Option.Option<[A, Record<Exclude<K, X>, A>]>
} = dual(2, <K extends string | symbol, A, X extends K>(
  self: ReadonlyRecord<K, A>,
  key: X
): Option.Option<[A, Record<Exclude<K, X>, A>]> =>
  has(self, key) ? Option.some([self[key], remove(self, key)]) : Option.none())

/**
 * Maps a record into another record by applying a transformation function to each of its values.
 *
 * **Example** (Mapping record values)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * const f = (n: number) => `-${n}`
 *
 * Record.map({ a: 3, b: 5 }, f) // => { a: "-3", b: "-5" }
 *
 * const g = (n: number, key: string) => `${key.toUpperCase()}-${n}`
 *
 * Record.map({ a: 3, b: 5 }, g) // => { a: "A-3", b: "B-5" }
 * ```
 *
 * @category mapping
 * @since 2.0.0
 */
export const map: {
  <K extends string, A, B>(f: (a: A, key: NoInfer<K>) => B): (self: ReadonlyRecord<K, A>) => Record<K, B>
  <K extends string, A, B>(self: ReadonlyRecord<K, A>, f: (a: A, key: NoInfer<K>) => B): Record<K, B>
} = dual(
  2,
  <K extends string, A, B>(self: ReadonlyRecord<K, A>, f: (a: A, key: NoInfer<K>) => B): Record<K, B> => {
    const out: Record<K, B> = { ...self } as any
    for (const key of keys(self)) {
      InternalRecord.assignProperty(out, key, f(self[key], key))
    }
    return out
  }
)

/**
 * Maps the keys of a `ReadonlyRecord` while preserving the corresponding values.
 *
 * **Example** (Mapping record keys)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * Record.mapKeys({ a: 3, b: 5 }, (key) => key.toUpperCase()) // => { A: 3, B: 5 }
 * ```
 *
 * @category mapping
 * @since 2.0.0
 */
export const mapKeys: {
  <K extends string, A, K2 extends string>(
    f: (key: K, a: A) => K2
  ): (self: ReadonlyRecord<K, A>) => Record<K2, A>
  <K extends string, A, K2 extends string>(
    self: ReadonlyRecord<K, A>,
    f: (key: K, a: A) => K2
  ): Record<K2, A>
} = dual(
  2,
  <K extends string, A, K2 extends string>(
    self: ReadonlyRecord<K, A>,
    f: (key: K, a: A) => K2
  ): Record<K2, A> => {
    const out: Record<K2, A> = {} as any
    for (const key of keys(self)) {
      const a = self[key]
      InternalRecord.assignProperty(out, f(key, a), a)
    }
    return out
  }
)

/**
 * Maps entries of a `ReadonlyRecord` using the provided function, allowing modification of both keys and corresponding values.
 *
 * **Example** (Mapping record entries)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * Record.mapEntries({ a: 3, b: 5 }, (a, key) => [key.toUpperCase(), a + 1]) // => { A: 4, B: 6 }
 * ```
 *
 * @category mapping
 * @since 2.0.0
 */
export const mapEntries: {
  <K extends string, A, K2 extends string, B>(
    f: (a: A, key: K) => readonly [K2, B]
  ): (self: ReadonlyRecord<K, A>) => Record<K2, B>
  <K extends string, A, K2 extends string, B>(
    self: ReadonlyRecord<K, A>,
    f: (a: A, key: K) => [K2, B]
  ): Record<K2, B>
} = dual(
  2,
  <K extends string, A, K2 extends string, B>(
    self: ReadonlyRecord<K, A>,
    f: (a: A, key: K) => [K2, B]
  ): Record<K2, B> => {
    const out = {} as Record<K2, B>
    for (const key of keys(self)) {
      const [k, b] = f(self[key], key)
      InternalRecord.assignProperty(out, k, b)
    }
    return out
  }
)

/**
 * Transforms a record by applying the function `f` to each key and value in the original record.
 * If the function succeeds, the key-value pair is included in the output record.
 *
 * **Example** (Filtering and mapping with Result)
 *
 * ```ts import.meta.vitest
 * import { Record, Result } from "effect"
 *
 * const x = { a: 1, b: 2, c: 3 }
 * const f = (a: number, key: string) => a > 2 ? Result.succeed(a * 2) : Result.failVoid
 * Record.filterMap(x, f) // => { c: 6 }
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const filterMap: {
  <K extends string, A, B, X>(
    f: (input: A, key: K) => Result<B, X>
  ): (self: ReadonlyRecord<K, A>) => Record<ReadonlyRecord.NonLiteralKey<K>, B>
  <K extends string, A, B, X>(
    self: ReadonlyRecord<K, A>,
    f: (input: A, key: K) => Result<B, X>
  ): Record<ReadonlyRecord.NonLiteralKey<K>, B>
} = dual(
  2,
  <K extends string, A, B, X>(
    self: ReadonlyRecord<K, A>,
    f: (input: A, key: K) => Result<B, X>
  ): Record<ReadonlyRecord.NonLiteralKey<K>, B> => {
    const out: Record<string, B> = empty()
    for (const key of keys(self)) {
      const result = f(self[key], key)
      if (R.isSuccess(result)) {
        InternalRecord.assignProperty(out, key, result.success)
      }
    }
    return out
  }
)

/**
 * Selects properties from a record whose values match the given predicate.
 *
 * **Example** (Filtering record values)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * const x = { a: 1, b: 2, c: 3, d: 4 }
 * Record.filter(x, (n) => n > 2) // => { c: 3, d: 4 }
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const filter: {
  <K extends string, A, B extends A>(
    refinement: (a: NoInfer<A>, key: K) => a is B
  ): (self: ReadonlyRecord<K, A>) => Record<ReadonlyRecord.NonLiteralKey<K>, B>
  <K extends string, A>(
    predicate: (A: NoInfer<A>, key: K) => boolean
  ): (self: ReadonlyRecord<K, A>) => Record<ReadonlyRecord.NonLiteralKey<K>, A>
  <K extends string, A, B extends A>(
    self: ReadonlyRecord<K, A>,
    refinement: (a: A, key: K) => a is B
  ): Record<ReadonlyRecord.NonLiteralKey<K>, B>
  <K extends string, A>(
    self: ReadonlyRecord<K, A>,
    predicate: (a: A, key: K) => boolean
  ): Record<ReadonlyRecord.NonLiteralKey<K>, A>
} = dual(
  2,
  <K extends string, A>(
    self: ReadonlyRecord<K, A>,
    predicate: (a: A, key: K) => boolean
  ): Record<ReadonlyRecord.NonLiteralKey<K>, A> => {
    const out: Record<string, A> = empty()
    for (const key of keys(self)) {
      if (predicate(self[key], key)) {
        InternalRecord.assignProperty(out, key, self[key])
      }
    }
    return out
  }
)

/**
 * Returns a new record containing only the `Some` values from a record of
 * `Option` values, preserving the original keys.
 *
 * **Example** (Extracting Some values)
 *
 * ```ts import.meta.vitest
 * import { Option, Record } from "effect"
 *
 * Record.getSomes({ a: Option.some(1), b: Option.none(), c: Option.some(2) }) // => { a: 1, c: 2 }
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const getSomes: <K extends string, A>(
  self: ReadonlyRecord<K, Option.Option<A>>
) => Record<ReadonlyRecord.NonLiteralKey<K>, A> = <K extends string, A>(
  self: ReadonlyRecord<K, Option.Option<A>>
): Record<ReadonlyRecord.NonLiteralKey<K>, A> => {
  const out: Record<string, A> = empty()
  for (const key of keys(self)) {
    const option = self[key]
    if (Option.isSome(option)) {
      InternalRecord.assignProperty(out, key, option.value)
    }
  }
  return out
}

/**
 * Returns a new record containing only the `Err` values from a record of
 * `Result` values, preserving the original keys.
 *
 * **Example** (Extracting Result failures)
 *
 * ```ts import.meta.vitest
 * import { Record, Result } from "effect"
 *
 * Record.getFailures({
 *     a: Result.succeed(1),
 *     b: Result.fail("err"),
 *     c: Result.succeed(2)
 * }) // => { b: "err" }
 * ```
 *
 * @category filtering
 * @since 4.0.0
 */
export const getFailures = <K extends string, A, E>(
  self: ReadonlyRecord<K, Result<A, E>>
): Record<ReadonlyRecord.NonLiteralKey<K>, E> => {
  const out: Record<string, E> = empty()
  for (const key of keys(self)) {
    const value = self[key]
    if (R.isFailure(value)) {
      InternalRecord.assignProperty(out, key, value.failure)
    }
  }

  return out
}

/**
 * Returns a new record containing only the `Ok` values from a record of
 * `Result` values, preserving the original keys.
 *
 * **Example** (Extracting Result successes)
 *
 * ```ts import.meta.vitest
 * import { Record, Result } from "effect"
 *
 * Record.getSuccesses({
 *     a: Result.succeed(1),
 *     b: Result.fail("err"),
 *     c: Result.succeed(2)
 * }) // => { a: 1, c: 2 }
 * ```
 *
 * @category filtering
 * @since 4.0.0
 */
export const getSuccesses = <K extends string, A, E>(
  self: ReadonlyRecord<K, Result<A, E>>
): Record<string, A> => {
  const out: Record<string, A> = empty()
  for (const key of keys(self)) {
    const value = self[key]
    if (R.isSuccess(value)) {
      InternalRecord.assignProperty(out, key, value.success)
    }
  }

  return out
}

/**
 * Applies a function to each record entry and partitions the returned `Result`
 * values into two records.
 *
 * **Details**
 *
 * Success values are collected in the first record, and failure values are
 * collected in the second record, preserving the original keys.
 *
 * **Example** (Partitioning with Result)
 *
 * ```ts import.meta.vitest
 * import { Record, Result } from "effect"
 *
 * const x = { a: 1, b: 2, c: 3 }
 * const f = (n: number) => (n % 2 === 0 ? Result.succeed(n) : Result.fail(n))
 * Record.partition(x, f) // => [{ b: 2 }, { a: 1, c: 3 }]
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const partition: {
  <K extends string, A, B, C>(
    f: (input: A, key: K) => Result<C, B>
  ): (
    self: ReadonlyRecord<K, A>
  ) => [passes: Record<ReadonlyRecord.NonLiteralKey<K>, C>, fails: Record<ReadonlyRecord.NonLiteralKey<K>, B>]
  <K extends string, A, B, C>(
    self: ReadonlyRecord<K, A>,
    f: (input: A, key: K) => Result<C, B>
  ): [passes: Record<ReadonlyRecord.NonLiteralKey<K>, C>, fails: Record<ReadonlyRecord.NonLiteralKey<K>, B>]
} = dual(
  2,
  <K extends string, A, B, C>(
    self: ReadonlyRecord<K, A>,
    f: (input: A, key: K) => Result<C, B>
  ): [passes: Record<ReadonlyRecord.NonLiteralKey<K>, C>, fails: Record<ReadonlyRecord.NonLiteralKey<K>, B>] => {
    const passes: Record<string, C> = empty()
    const fails: Record<string, B> = empty()
    for (const key of keys(self)) {
      const e = f(self[key], key)
      if (R.isFailure(e)) {
        InternalRecord.assignProperty(fails, key, e.failure)
      } else {
        InternalRecord.assignProperty(passes, key, e.success)
      }
    }
    return [passes, fails]
  }
)

/**
 * Partitions a record of `Result` values into two separate records,
 * one with the success values and one with the failure values.
 *
 * **Example** (Separating Result values)
 *
 * ```ts import.meta.vitest
 * import { Record, Result } from "effect"
 *
 * Record.separate({ a: Result.fail("e"), b: Result.succeed(1) }) // => [{ b: 1 }, { a: "e" }]
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const separate: <K extends string, A, B>(
  self: ReadonlyRecord<K, Result<B, A>>
) => [Record<ReadonlyRecord.NonLiteralKey<K>, B>, Record<ReadonlyRecord.NonLiteralKey<K>, A>] = partition(identity)

/**
 * Retrieves the keys of a given record as an array.
 *
 * **Example** (Getting record keys)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * Record.keys({ a: 1, b: 2, c: 3 }) // => ["a", "b", "c"]
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const keys = <K extends string | symbol, A>(self: ReadonlyRecord<K, A>): Array<K & string> =>
  Object.keys(self) as Array<K & string>

/**
 * Retrieves the values of a given record as an array.
 *
 * **Example** (Getting record values)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * Record.values({ a: 1, b: 2, c: 3 }) // => [1, 2, 3]
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const values = <K extends string, A>(self: ReadonlyRecord<K, A>): Array<A> => collect(self, (_, a) => a)

/**
 * Adds a new key-value pair or update an existing key's value in a record.
 *
 * **Example** (Setting a record value)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * Record.set("a", 5)({ a: 1, b: 2 }) // => { a: 5, b: 2 }
 * Record.set("c", 5)({ a: 1, b: 2 }) // => { a: 1, b: 2, c: 5 }
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const set: {
  <K extends string | symbol, K1 extends K | ((string | symbol) & {}), B>(
    key: K1,
    value: B
  ): <A>(self: ReadonlyRecord<K, A>) => Record<K | K1, A | B>
  <K extends string | symbol, A, K1 extends K | ((string | symbol) & {}), B>(
    self: ReadonlyRecord<K, A>,
    key: K1,
    value: B
  ): Record<K | K1, A | B>
} = dual(
  3,
  <K extends string | symbol, A, K1 extends K | ((string | symbol) & {}), B>(
    self: ReadonlyRecord<K, A>,
    key: K1,
    value: B
  ): Record<K | K1, A | B> => {
    return { ...self, [key]: value } as any
  }
)

/**
 * Mutates a record by assigning a value to a property.
 *
 * **When to use**
 *
 * Use when incrementally constructing a new record and copying it for every
 * property would be unnecessary.
 *
 * **Gotchas**
 *
 * This function mutates `self`. When `key` is `"__proto__"`, it creates an
 * own data property instead of changing the object's prototype.
 *
 * **Example** (Assigning an external key safely)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * const key: string = "__proto__" // Assume this comes from external input
 * const value = { polluted: true }
 *
 * const unsafe: Record<string, unknown> = {}
 * unsafe[key] = value
 * Object.getPrototypeOf(unsafe) === value // => true
 *
 * const safe: Record<string, unknown> = {}
 * Record.assignProperty(safe, key, value)
 * Object.getPrototypeOf(safe) === Object.prototype // => true
 * safe[key] === value // => true
 * ```
 *
 * @see {@link set} for an immutable update
 * @category mutations
 * @since 4.0.0
 */
export const assignProperty: (self: object, key: PropertyKey, value: unknown) => void = InternalRecord.assignProperty

/**
 * Checks whether all the keys and values in one record are also found in another record.
 * Uses the provided equivalence function to compare values.
 *
 * **Example** (Checking subrecords with a custom equivalence)
 *
 * ```ts import.meta.vitest
 * import { Equivalence, Record } from "effect"
 *
 * const isSubrecord = Record.isSubrecordBy(
 *   Equivalence.make<string>((self, that) => self.toLowerCase() === that.toLowerCase())
 * )
 *
 * const required: Record.ReadonlyRecord<string, string> = { role: "Admin" }
 * const available: Record.ReadonlyRecord<string, string> = {
 *   role: "admin",
 *   status: "active"
 * }
 *
 * isSubrecord(required, available) // => true
 * isSubrecord({ role: "Admin", status: "inactive" }, available) // => false
 * isSubrecord(required, { role: "editor", status: "active" }) // => false
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const isSubrecordBy = <A>(equivalence: Equivalence<A>): {
  <K extends string>(that: ReadonlyRecord<K, A>): (self: ReadonlyRecord<K, A>) => boolean
  <K extends string>(self: ReadonlyRecord<K, A>, that: ReadonlyRecord<K, A>): boolean
} =>
  dual(2, <K extends string>(self: ReadonlyRecord<K, A>, that: ReadonlyRecord<K, A>): boolean => {
    for (const key of keys(self)) {
      if (!has(that, key) || !equivalence(self[key], that[key])) {
        return false
      }
    }
    return true
  })

/**
 * Checks whether the first record is a subrecord of the second record.
 *
 * **Details**
 *
 * Returns `true` when every key and value in `self` is also present in `that`.
 * Values are compared with Effect equality via `Equal.asEquivalence()`.
 *
 * **Example** (Checking subrecords)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * Record.isSubrecord({ a: 1 } as Record<string, number>, { a: 1, b: 2 }) // => true
 * Record.isSubrecord({ a: 1, b: 2 }, { a: 1 } as Record<string, number>) // => false
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const isSubrecord: {
  <K extends string, A>(that: ReadonlyRecord<K, A>): (self: ReadonlyRecord<K, A>) => boolean
  <K extends string, A>(self: ReadonlyRecord<K, A>, that: ReadonlyRecord<K, A>): boolean
} = isSubrecordBy(Equal.asEquivalence())

/**
 * Reduces a record to a single value by combining its entries with a specified function.
 *
 * **Example** (Reducing record values)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * Record.reduce({ a: 1, b: 2, c: 3 }, 0, (acc, value) => acc + value) // => 6
 * ```
 *
 * @category folding
 * @since 2.0.0
 */
export const reduce: {
  <Z, V, K extends string>(
    zero: Z,
    f: (accumulator: Z, value: V, key: K) => Z
  ): (self: ReadonlyRecord<K, V>) => Z
  <K extends string, V, Z>(self: ReadonlyRecord<K, V>, zero: Z, f: (accumulator: Z, value: V, key: K) => Z): Z
} = dual(
  3,
  <K extends string, V, Z>(
    self: ReadonlyRecord<K, V>,
    zero: Z,
    f: (accumulator: Z, value: V, key: K) => Z
  ): Z => {
    let out: Z = zero
    for (const key of keys(self)) {
      out = f(out, self[key], key)
    }
    return out
  }
)

/**
 * Checks whether all entries in a record meet a specific condition.
 *
 * **Example** (Checking every record value)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * Record.every({ a: 1, b: 2 }, (n) => n > 0) // => true
 * Record.every({ a: 1, b: -1 }, (n) => n > 0) // => false
 * ```
 *
 * @category guards
 * @since 2.0.0
 */
export const every: {
  <A, K extends string, B extends A>(
    refinement: (value: A, key: K) => value is B
  ): (self: ReadonlyRecord<K, A>) => self is ReadonlyRecord<K, B>
  <A, K extends string>(predicate: (value: A, key: K) => boolean): (self: ReadonlyRecord<K, A>) => boolean
  <A, K extends string, B extends A>(
    self: ReadonlyRecord<K, A>,
    refinement: (value: A, key: K) => value is B
  ): self is ReadonlyRecord<K, B>
  <K extends string, A>(self: ReadonlyRecord<K, A>, predicate: (value: A, key: K) => boolean): boolean
} = dual(
  2,
  <A, K extends string, B extends A>(
    self: ReadonlyRecord<K, A>,
    refinement: (value: A, key: K) => value is B
  ): self is ReadonlyRecord<K, B> => {
    for (const key of keys(self)) {
      if (!refinement(self[key], key)) {
        return false
      }
    }
    return true
  }
)

/**
 * Checks whether any entry in a record meets a specific condition.
 *
 * **Example** (Checking for any matching value)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * Record.some({ a: 1, b: 2 }, (n) => n > 1) // => true
 * Record.some({ a: 1, b: 2 }, (n) => n > 2) // => false
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const some: {
  <A, K extends string>(predicate: (value: A, key: K) => boolean): (self: ReadonlyRecord<K, A>) => boolean
  <K extends string, A>(self: ReadonlyRecord<K, A>, predicate: (value: A, key: K) => boolean): boolean
} = dual(
  2,
  <K extends string, A>(self: ReadonlyRecord<K, A>, predicate: (value: A, key: K) => boolean): boolean => {
    for (const key of keys(self)) {
      if (predicate(self[key], key)) {
        return true
      }
    }
    return false
  }
)

/**
 * Merges two records, preserving entries that exist in either of the records.
 * For keys that exist in both records, the provided combine function is used to merge the values.
 *
 * **Example** (Merging records with union)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * Record.union({ a: 1, b: 2 }, { b: 3, c: 4 }, (a, b) => a + b) // => { a: 1, b: 5, c: 4 }
 * ```
 *
 * @category combining
 * @since 2.0.0
 */
export const union: {
  <K1 extends string, A, B, C>(
    that: ReadonlyRecord<K1, B>,
    combine: (selfValue: A, thatValue: B) => C
  ): <K0 extends string>(self: ReadonlyRecord<K0, A>) => Record<K0 | K1, A | B | C>
  <K0 extends string, A, K1 extends string, B, C>(
    self: ReadonlyRecord<K0, A>,
    that: ReadonlyRecord<K1, B>,
    combine: (selfValue: A, thatValue: B) => C
  ): Record<K0 | K1, A | B | C>
} = dual(
  3,
  <K0 extends string, A, K1 extends string, B, C>(
    self: ReadonlyRecord<K0, A>,
    that: ReadonlyRecord<K1, B>,
    combine: (selfValue: A, thatValue: B) => C
  ): Record<K0 | K1, A | B | C> => {
    if (isEmptyRecord(self)) {
      return { ...that } as any
    }
    if (isEmptyRecord(that)) {
      return { ...self } as any
    }
    const out: Record<string, A | B | C> = empty()
    for (const key of keys(self)) {
      if (has(that, key as any)) {
        InternalRecord.assignProperty(out, key, combine(self[key], that[key as unknown as K1]))
      } else {
        InternalRecord.assignProperty(out, key, self[key])
      }
    }
    for (const key of keys(that)) {
      if (!has(out, key)) {
        InternalRecord.assignProperty(out, key, that[key])
      }
    }
    return out
  }
)

/**
 * Merges two records, retaining only the entries that exist in both records.
 * For intersecting keys, the provided combine function is used to merge the values.
 *
 * **Example** (Merging intersecting keys)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * Record.intersection({ a: 1, b: 2 }, { b: 3, c: 4 }, (a, b) => a + b) // => { b: 5 }
 * ```
 *
 * @category combining
 * @since 2.0.0
 */
export const intersection: {
  <K1 extends string, A, B, C>(
    that: ReadonlyRecord<K1, B>,
    combine: (selfValue: A, thatValue: B) => C
  ): <K0 extends string>(self: ReadonlyRecord<K0, A>) => Record<ReadonlyRecord.IntersectKeys<K0, K1>, C>
  <K0 extends string, A, K1 extends string, B, C>(
    self: ReadonlyRecord<K0, A>,
    that: ReadonlyRecord<K1, B>,
    combine: (selfValue: A, thatValue: B) => C
  ): Record<ReadonlyRecord.IntersectKeys<K0, K1>, C>
} = dual(
  3,
  <K0 extends string, A, K1 extends string, B, C>(
    self: ReadonlyRecord<K0, A>,
    that: ReadonlyRecord<K1, B>,
    combine: (selfValue: A, thatValue: B) => C
  ): Record<ReadonlyRecord.IntersectKeys<K0, K1>, C> => {
    const out: Record<string, C> = empty()
    if (isEmptyRecord(self) || isEmptyRecord(that)) {
      return out
    }
    for (const key of keys(self)) {
      if (has(that, key as any)) {
        InternalRecord.assignProperty(out, key, combine(self[key], that[key as unknown as K1]))
      }
    }
    return out
  }
)

/**
 * Merges two records, preserving only the entries that are unique to each record.
 * Keys that exist in both records are excluded from the result.
 *
 * **Example** (Keeping keys unique to each record)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * Record.difference({ a: 1, b: 2 }, { b: 3, c: 4 }) // => { a: 1, c: 4 }
 * ```
 *
 * @category combining
 * @since 2.0.0
 */
export const difference: {
  <K1 extends string, B>(
    that: ReadonlyRecord<K1, B>
  ): <K0 extends string, A>(self: ReadonlyRecord<K0, A>) => Record<K0 | K1, A | B>
  <K0 extends string, A, K1 extends string, B>(
    self: ReadonlyRecord<K0, A>,
    that: ReadonlyRecord<K1, B>
  ): Record<K0 | K1, A | B>
} = dual(2, <K0 extends string, A, K1 extends string, B>(
  self: ReadonlyRecord<K0, A>,
  that: ReadonlyRecord<K1, B>
): Record<K0 | K1, A | B> => {
  if (isEmptyRecord(self)) {
    return { ...that } as any
  }
  if (isEmptyRecord(that)) {
    return { ...self } as any
  }
  const out = {} as Record<K0 | K1, A | B>
  for (const key of keys(self)) {
    if (!has(that, key as any)) {
      InternalRecord.assignProperty(out, key, self[key])
    }
  }
  for (const key of keys(that)) {
    if (!has(self, key as any)) {
      InternalRecord.assignProperty(out, key, that[key])
    }
  }
  return out
})

/**
 * Create an `Equivalence` for records using the provided `Equivalence` for values.
 * Two records are considered equivalent if they have the same keys and their corresponding values are equivalent.
 *
 * **Example** (Comparing records with a value equivalence)
 *
 * ```ts import.meta.vitest
 * import { Equal, Record } from "effect"
 *
 * const recordEquivalence = Record.makeEquivalence(Equal.asEquivalence<number>())
 *
 * recordEquivalence({ a: 1, b: 2 }, { a: 1, b: 2 }) // => true
 * recordEquivalence({ a: 1, b: 2 }, { a: 1, b: 3 }) // => false
 * ```
 *
 * @category instances
 * @since 4.0.0
 */
export const makeEquivalence = <K extends string, A>(
  equivalence: Equivalence<A>
): Equivalence<ReadonlyRecord<K, A>> => {
  const is = isSubrecordBy(equivalence)
  return (self, that) => is(self, that) && is(that, self)
}

/**
 * Create a non-empty record from a single element.
 *
 * **Example** (Creating a singleton record)
 *
 * ```ts import.meta.vitest
 * import { Record } from "effect"
 *
 * Record.singleton("a", 1) // => { a: 1 }
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const singleton = <K extends string | symbol, A>(key: K, value: A): Record<K, A> => ({
  [key]: value
} as any)

/**
 * Creates a `Reducer` for combining `Record`s using union, with values for keys that exist in both records combined
 * using the provided `Combiner`.
 *
 * **When to use**
 *
 * Use to build a reusable reducer for accumulating many records into one
 * union-shaped record, preserving keys from every input and combining
 * overlapping values with the supplied combiner.
 *
 * **Details**
 *
 * The returned reducer uses `Record.union` for combine and an empty record as
 * `initialValue`, so the default `combineAll` folds from `{}` and accumulates
 * keys from each input record.
 *
 * @see {@link union} for one-off record merging with the same union semantics
 * @see {@link makeReducerIntersection} for a reducer that keeps only keys present on both sides
 *
 * @category combining
 * @since 4.0.0
 */
export function makeReducerUnion<K extends string, A>(combiner: Combiner.Combiner<A>): Reducer.Reducer<Record<K, A>> {
  return Reducer.make<Record<K, A>>(
    (self, that) => union(self, that, combiner.combine),
    {} as Record<K, A>
  )
}

/**
 * Creates a `Reducer` whose `combine` operation intersects two records and
 * combines values for keys present in both records.
 *
 * **When to use**
 *
 * Use to build a `Reducer` that combines records by retaining only keys shared
 * by both inputs and combining matching values with a `Combiner`.
 *
 * **Gotchas**
 *
 * The reducer's `initialValue` is an empty record. Because intersection with
 * an empty record is empty, the default `combineAll` folds from `{}` and
 * therefore produces `{}` for ordinary non-empty inputs.
 *
 * @see {@link makeReducerUnion} for a reducer that preserves keys from either input record
 * @see {@link intersection} for applying the shared-key merge to one pair of records
 *
 * @category combining
 * @since 4.0.0
 */
export function makeReducerIntersection<K extends string, A>(
  combiner: Combiner.Combiner<A>
): Reducer.Reducer<Record<K, A>> {
  return Reducer.make(
    (self, that) => intersection(self, that, combiner.combine) as any,
    {} as Record<K, A>
  )
}

/**
 * Returns the first entry that satisfies the specified
 * predicate, or `None` if no such entry exists.
 *
 * **Example** (Finding the first matching entry)
 *
 * ```ts import.meta.vitest
 * import { Option, Record } from "effect"
 *
 * const record = { a: 1, b: 2, c: 3 }
 * Record.findFirst(
 *   record,
 *   (value, key) => value > 1 && key !== "b"
 * ) // => Option.some(["c", 3])
 * ```
 *
 * @category searching
 * @since 3.14.0
 */
export const findFirst: {
  <K extends string | symbol, V, V2 extends V>(
    refinement: (value: NoInfer<V>, key: NoInfer<K>) => value is V2
  ): (self: ReadonlyRecord<K, V>) => Option.Option<[K, V2]>
  <K extends string | symbol, V>(
    predicate: (value: NoInfer<V>, key: NoInfer<K>) => boolean
  ): (self: ReadonlyRecord<K, V>) => Option.Option<[K, V]>
  <K extends string | symbol, V, V2 extends V>(
    self: ReadonlyRecord<K, V>,
    refinement: (value: NoInfer<V>, key: NoInfer<K>) => value is V2
  ): Option.Option<[K, V2]>
  <K extends string | symbol, V>(
    self: ReadonlyRecord<K, V>,
    predicate: (value: NoInfer<V>, key: NoInfer<K>) => boolean
  ): Option.Option<[K, V]>
} = dual(
  2,
  <K extends string | symbol, V>(
    self: ReadonlyRecord<K, V>,
    f: (value: V, key: K) => boolean
  ): Option.Option<[K, V]> => {
    const k = keys(self)
    for (let i = 0; i < k.length; i++) {
      const key = k[i]
      if (f(self[key], key)) {
        return Option.some([key, self[key]])
      }
    }
    return Option.none()
  }
)
