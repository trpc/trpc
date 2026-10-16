/**
 * Computes Effect hash values and defines the interface for objects that want
 * to provide their own hash implementation. Hashes are small numeric
 * fingerprints used by Effect data structures to bucket values quickly; they
 * are not cryptographic digests and they are not proof that two values are
 * equal. The module also includes helpers for primitive, structure, array, and
 * reference-based hashes, plus functions for combining and optimizing numeric
 * hash values.
 *
 * @since 2.0.0
 */
import { dual } from "./Function.ts"
import { byReferenceInstances, getAllObjectKeys, viewBytes } from "./internal/equal.ts"
import { addBackEdge, backEdges } from "./internal/hash.ts"
import { hasProperty } from "./Predicate.ts"

/**
 * Defines the unique identifier used to identify objects that implement the Hash interface.
 *
 * **When to use**
 *
 * Use as the computed property key for the method that supplies a custom hash
 * value on a `Hash` implementor.
 *
 * @see {@link Hash} for the interface implemented with this symbol
 * @see {@link isHash} for checking whether a value implements `Hash`
 * @see {@link hash} for computing hash values
 *
 * @category symbols
 * @since 2.0.0
 */
export const symbol = "~effect/Hash"

/**
 * A type that represents an object that can be hashed.
 *
 * **When to use**
 *
 * Use to let a custom type provide its own stable hash value.
 *
 * **Details**
 *
 * Objects implementing this interface provide a method to compute their hash value,
 * which is used for efficient comparison and storage operations.
 *
 * **Example** (Implementing Hash)
 *
 * ```ts import.meta.vitest
 * import { Hash } from "effect"
 *
 * class MyClass implements Hash.Hash {
 *   constructor(private value: number) {}
 *
 *   [Hash.symbol](): number {
 *     return Hash.hash(this.value)
 *   }
 * }
 *
 * new MyClass(42)[Hash.symbol]() // => 42
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface Hash {
  [symbol](): number
}

/**
 * Computes a hash value for any given value.
 *
 * **When to use**
 *
 * Use to compute an Effect hash for primitives, collections, and hashable
 * objects.
 *
 * **Details**
 *
 * This function can hash primitives (numbers, strings, booleans, etc.) as well as
 * objects, arrays, and other complex data structures. It automatically handles
 * different types and provides a consistent hash value for equivalent inputs.
 *
 * **Gotchas**
 *
 * Objects being hashed must be treated as immutable after their first hash
 * computation. Hash results are cached, so mutating an object after hashing will
 * lead to stale cached values and broken hash-based operations. For mutable
 * objects, implement a custom `Hash` interface that hashes the object reference
 * rather than its content.
 *
 * **Example** (Hashing different values)
 *
 * ```ts import.meta.vitest
 * import { Hash } from "effect"
 *
 * Hash.hash(42) === Hash.hash(42) // => true
 * Hash.hash("hello") === Hash.hash("hello") // => true
 * Hash.hash([1, 2, 3]) === Hash.hash([1, 2, 3]) // => true
 * ```
 *
 * @category hashing
 * @since 2.0.0
 */
export const hash: <A>(self: A) => number = <A>(self: A) => {
  switch (typeof self) {
    case "number":
      return number(self)
    case "bigint":
      return string(self.toString(10))
    case "string":
      return string(self)
    case "function":
    case "object": {
      if (self === null) {
        break
      } else if (self instanceof Date) {
        if (Number.isNaN(self.getTime())) {
          return string("Invalid Date")
        }
        return string(self.toISOString())
      } else if (self instanceof RegExp) {
        return string(self.toString())
      } else {
        if (byReferenceInstances.has(self)) {
          return random(self)
        }
        const cached = hashCache.get(self)
        if (cached !== undefined) {
          return cached
        }
        if (visitedObjects.has(self)) {
          addBackEdge()
          return string("[Circular]")
        }
        visitedObjects.add(self)
        const seen = backEdges
        let h: number
        try {
          if (symbol in self) {
            h = (self as Hash)[symbol]()
          } else if (typeof self === "function") {
            h = random(self)
          } else if (self instanceof DataView) {
            h = array(viewBytes(self))
          } else if (Array.isArray(self) || ArrayBuffer.isView(self)) {
            h = array(self as any)
          } else if (self instanceof Map) {
            h = hashMap(self)
          } else if (self instanceof Set) {
            h = hashSet(self)
          } else {
            h = structure(self)
          }
        } finally {
          visitedObjects.delete(self)
        }
        // Hashes containing a back-edge depend on the entry point.
        if (seen === backEdges) {
          hashCache.set(self, h)
        }
        return h
      }
    }
  }
  return optimize(mix(string(String(self))))
}

/**
 * Generates a random hash value for an object and caches it.
 *
 * **When to use**
 *
 * Use to hash an object by reference identity instead of structural content.
 *
 * **Details**
 *
 * This function creates a random hash value for objects that don't have their own
 * hash implementation. The hash value is cached using a WeakMap, so the same object
 * will always return the same hash value during its lifetime.
 *
 * **Example** (Hashing objects by reference)
 *
 * ```ts import.meta.vitest
 * import { Hash } from "effect"
 *
 * const obj1 = { a: 1 }
 * const obj2 = { a: 1 }
 *
 * Hash.random(obj1) === Hash.random(obj1) // => true
 *
 * typeof Hash.random(obj2) // => "number"
 * ```
 *
 * @category hashing
 * @since 2.0.0
 */
export const random: <A extends object>(self: A) => number = (self) => {
  if (!randomHashCache.has(self)) {
    randomHashCache.set(self, optimize((Math.random() * 0x100000000) | 0))
  }
  return randomHashCache.get(self)!
}

// 32-bit MurmurHash3 finalizer.
const mix = (h: number): number => {
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  return h ^ (h >>> 16)
}

/**
 * Combines two hash values into a single hash value.
 *
 * **When to use**
 *
 * Use to build a hash for a composite value by folding together hash values for
 * its parts.
 *
 * **Details**
 *
 * Supports direct and pipeable usage. Argument order affects the result.
 *
 * **Example** (Combining hash values)
 *
 * ```ts import.meta.vitest
 * import { Hash, pipe } from "effect"
 *
 * const hash1 = Hash.hash("hello")
 * const hash2 = Hash.hash("world")
 *
 * const combined = Hash.combine(hash2)(hash1)
 * combined === pipe(hash1, Hash.combine(hash2)) // => true
 * ```
 *
 * @see {@link hash} for computing hash values from arbitrary inputs
 * @see {@link structureKeys} for hashing selected object fields without manual combination
 *
 * @category hashing
 * @since 2.0.0
 */
export const combine: {
  (b: number): (self: number) => number
  (self: number, b: number): number
} = dual(2, (self: number, b: number): number => mix(Math.imul(self, 0x9e3779b1) + Math.imul(b, 0x85ebca6b)))

/**
 * Applies bit manipulation techniques to optimize a hash value.
 *
 * **When to use**
 *
 * Use to improve the bit distribution of a raw numeric hash value.
 *
 * **Details**
 *
 * This function takes a hash value and applies bitwise operations to improve
 * the distribution of hash values, reducing the likelihood of collisions.
 *
 * **Example** (Optimizing a hash value)
 *
 * ```ts import.meta.vitest
 * import { Hash } from "effect"
 *
 * Hash.optimize(1234567890) // => 160826066
 * ```
 *
 * @category hashing
 * @since 2.0.0
 */
export const optimize = (n: number): number => (n & 0xbfffffff) | ((n >>> 1) & 0x40000000)

/**
 * Checks whether a value implements the Hash interface.
 *
 * **When to use**
 *
 * Use to detect whether an unknown value provides a custom hash implementation.
 *
 * **Details**
 *
 * This function determines whether a given value has the Hash symbol property,
 * indicating that it can provide its own hash value implementation.
 *
 * **Example** (Checking for Hash support)
 *
 * ```ts import.meta.vitest
 * import { Hash } from "effect"
 *
 * class MyHashable implements Hash.Hash {
 *   [Hash.symbol]() {
 *     return 42
 *   }
 * }
 *
 * Hash.isHash(new MyHashable()) // => true
 * Hash.isHash({}) // => false
 * Hash.isHash("string") // => false
 * ```
 *
 * @category guards
 * @since 2.0.0
 */
export const isHash = (u: unknown): u is Hash => hasProperty(u, symbol)

const float64 = new DataView(new ArrayBuffer(8))

/**
 * Computes a hash value for a number.
 *
 * **When to use**
 *
 * Use to hash a JavaScript number with Effect's numeric hash semantics.
 *
 * **Details**
 *
 * Int32 values hash to themselves. Other numbers hash from their IEEE-754 bits,
 * with a canonical representation for `NaN`.
 *
 * **Example** (Hashing numbers)
 *
 * ```ts import.meta.vitest
 * import { Hash } from "effect"
 *
 * Number.isInteger(Hash.number(42)) // => true
 * Number.isInteger(Hash.number(3.14)) // => true
 * Hash.number(NaN) === Hash.number(NaN) // => true
 * Hash.number(Infinity) === Hash.number(Infinity) // => true
 * Hash.number(100) === Hash.number(100) // => true
 * ```
 *
 * @category hashing
 * @since 2.0.0
 */
export const number = (n: number) => {
  const h = n | 0
  if (h === n) {
    return optimize(h)
  }
  float64.setFloat64(0, n !== n ? NaN : n)
  return optimize(combine(float64.getInt32(0), float64.getInt32(4)))
}

/**
 * Computes a hash value for a string using the djb2 algorithm.
 *
 * **When to use**
 *
 * Use when you need a string field to contribute to a custom structural hash
 * implementation.
 *
 * **Details**
 *
 * This function implements a variation of the djb2 hash algorithm, which is
 * known for its good distribution properties and speed. It processes each
 * character of the string to produce a consistent hash value.
 *
 * **Example** (Hashing strings)
 *
 * ```ts import.meta.vitest
 * import { Hash } from "effect"
 *
 * Hash.string("hello") // => 181380007
 * Hash.string("world") // => 164394279
 * Hash.string("") // => 5381
 * Hash.string("test") === Hash.string("test") // => true
 * ```
 *
 * @category hashing
 * @since 2.0.0
 */
export const string = (str: string) => {
  let h = 5381, i = str.length
  while (i) {
    h = (h * 33) ^ str.charCodeAt(--i)
  }
  return optimize(h)
}

/**
 * Computes a hash value for an object using only the specified keys.
 *
 * **When to use**
 *
 * Use to hash an object by a selected set of property keys.
 *
 * **Details**
 *
 * This function allows you to hash an object by considering only specific keys,
 * which is useful when you want to create a hash based on a subset of an object's
 * properties.
 *
 * **Example** (Hashing selected object keys)
 *
 * ```ts import.meta.vitest
 * import { Hash } from "effect"
 *
 * const person = { name: "John", age: 30, city: "New York" }
 *
 * const hash1 = Hash.structureKeys(person, ["name", "age"])
 * const hash2 = Hash.structureKeys(person, ["name", "city"])
 *
 * hash1 // => -731887653
 * hash2 // => 148523102
 *
 * const person2 = { name: "John", age: 30, city: "Boston" }
 * const hash3 = Hash.structureKeys(person2, ["name", "age"])
 * hash1 === hash3 // => true
 * ```
 *
 * @category hashing
 * @since 2.0.0
 */
export const structureKeys = (o: object, keys: Iterable<PropertyKey>) => {
  let h = 12289
  for (const key of keys) {
    h ^= combine(hash(key), hash((o as any)[key]))
  }
  return optimize(h)
}

/**
 * Computes a structural hash for an object using Effect's object key collection.
 *
 * **When to use**
 *
 * Use to hash an object from all structural keys collected by Effect.
 *
 * **Details**
 *
 * The hash is based on the object's structural keys and their values, including
 * symbol keys and relevant prototype keys for non-plain objects.
 *
 * **Example** (Hashing object structures)
 *
 * ```ts import.meta.vitest
 * import { Hash } from "effect"
 *
 * const obj1 = { name: "John", age: 30 }
 * const obj2 = { name: "Jane", age: 25 }
 * const obj3 = { name: "John", age: 30 }
 *
 * Hash.structure(obj1) // => -731887653
 * Hash.structure(obj2) // => -222100417
 * Hash.structure(obj3) // => -731887653
 * Hash.structure(obj1) === Hash.structure(obj3) // => true
 * ```
 *
 * @category hashing
 * @since 2.0.0
 */
export const structure = <A extends object>(o: A) => structureKeys(o, getAllObjectKeys(o))

const unordered = (seed: number, f: (el: any) => number) => (iter: Iterable<any>) => {
  let h = seed
  for (const element of iter) {
    h ^= f(element)
  }
  return optimize(h)
}

/**
 * Computes a hash value for an iterable by hashing all of its elements.
 *
 * **When to use**
 *
 * Use to hash the values yielded by an iterable with Effect hash semantics.
 *
 * **Details**
 *
 * Folds element hashes with {@link combine}, so order and length affect the
 * result.
 *
 * **Gotchas**
 *
 * A hash is not an equality proof. Distinct inputs can still share a hash.
 *
 * **Example** (Hashing arrays)
 *
 * ```ts import.meta.vitest
 * import { Hash } from "effect"
 *
 * const arr1 = [1, 2, 3]
 * const arr2 = [1, 2, 3]
 * const arr3 = [3, 2, 1]
 *
 * Hash.array(arr1) === Hash.array(arr2) // => true
 * Hash.array(arr1) === Hash.array(arr3) // => false
 * ```
 *
 * @see {@link hash} for the general-purpose hash dispatcher
 *
 * @category hashing
 * @since 2.0.0
 */
export const array = <A>(arr: Iterable<A>): number => {
  let h = 6151
  for (const element of arr) {
    h = combine(h, hash(element))
  }
  return optimize(h)
}

const hashMap: <K, V>(map: Iterable<readonly [K, V]>) => number = unordered(
  string("Map"),
  ([k, v]) => combine(hash(k), hash(v))
)
const setSeed = string("Set")
const hashSet: <A>(set: Iterable<A>) => number = unordered(setSeed, (element) => combine(setSeed, hash(element)))

const randomHashCache = new WeakMap<any, number>()
const hashCache = new WeakMap<object, number>()
const visitedObjects = new WeakSet<object>()
