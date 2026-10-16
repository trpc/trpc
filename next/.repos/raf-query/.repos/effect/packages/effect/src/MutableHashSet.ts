/**
 * Stores unique values in a mutable hash set.
 *
 * `MutableHashSet` updates the same collection in place and supports fast
 * membership checks, insertion, removal, clearing, and iteration. It is built
 * on `MutableHashMap`: each set value is stored as a map key, so uniqueness
 * follows the same hashing and equality rules as the underlying mutable hash
 * map.
 *
 * @since 2.0.0
 */
import { format } from "./Formatter.ts"
import * as Dual from "./Function.ts"
import { type Inspectable, NodeInspectSymbol, toJson } from "./Inspectable.ts"
import * as MutableHashMap from "./MutableHashMap.ts"
import type { Pipeable } from "./Pipeable.ts"
import { pipeArguments } from "./Pipeable.ts"
import { hasProperty } from "./Predicate.ts"

const TypeId = "~effect/MutableHashSet"

/**
 * A mutable hash set for storing unique values with Effect structural equality
 * support.
 *
 * **When to use**
 *
 * Use to store and mutate a collection of unique values with Effect hashing and
 * equality semantics.
 *
 * **Details**
 *
 * Operations mutate the set in place. Values that implement `Equal` / `Hash`
 * can be de-duplicated structurally; other values use normal JavaScript
 * reference or primitive equality.
 *
 * **Example** (Using a mutable hash set)
 *
 * ```ts import.meta.vitest
 * import { MutableHashSet } from "effect"
 *
 * // Create a mutable hash set
 * const set: MutableHashSet.MutableHashSet<string> = MutableHashSet.make(
 *   "apple",
 *   "banana"
 * )
 *
 * // Add elements
 * MutableHashSet.add(set, "cherry")
 *
 * // Check if elements exist
 * MutableHashSet.has(set, "apple") // => true
 * MutableHashSet.has(set, "grape") // => false
 *
 * // Collect the iterator values
 * Array.from(set) // => ["apple", "banana", "cherry"]
 *
 * // Get size
 * MutableHashSet.size(set) // => 3
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface MutableHashSet<out V> extends Iterable<V>, Pipeable, Inspectable {
  readonly [TypeId]: typeof TypeId
  readonly keyMap: MutableHashMap.MutableHashMap<V, boolean>
}

/**
 * Checks whether the specified value is a `MutableHashSet`, `false` otherwise.
 *
 * **When to use**
 *
 * Use to narrow an unknown value before treating it as a mutable hash set.
 *
 * **Details**
 *
 * The check looks for the `MutableHashSet` runtime marker.
 *
 * **Gotchas**
 *
 * Native `Set` values do not satisfy this check.
 *
 * @see {@link MutableHashSet} for the mutable hash set interface
 *
 * @category guards
 * @since 4.0.0
 */
export const isMutableHashSet = <V>(value: unknown): value is MutableHashSet<V> => hasProperty(value, TypeId)

const MutableHashSetProto: Omit<MutableHashSet<unknown>, "keyMap"> = {
  [TypeId]: TypeId,
  [Symbol.iterator](this: MutableHashSet<unknown>): Iterator<unknown> {
    return Array.from(this.keyMap).map(([_]) => _)[Symbol.iterator]()
  },
  toString() {
    return `MutableHashSet(${format(Array.from(this))})`
  },
  toJSON() {
    return {
      _id: "MutableHashSet",
      values: toJson(Array.from(this))
    }
  },
  [NodeInspectSymbol]() {
    return this.toJSON()
  },
  pipe() {
    return pipeArguments(this, arguments)
  }
}

const fromHashMap = <V>(keyMap: MutableHashMap.MutableHashMap<V, boolean>): MutableHashSet<V> => {
  const set = Object.create(MutableHashSetProto)
  set.keyMap = keyMap
  return set
}

/**
 * Creates an empty MutableHashSet.
 *
 * **When to use**
 *
 * Use to create a fresh mutable set before adding values over time.
 *
 * **Details**
 *
 * Each call returns a new empty set backed by an empty `MutableHashMap`.
 *
 * **Example** (Creating an empty set)
 *
 * ```ts import.meta.vitest
 * import { MutableHashSet } from "effect"
 *
 * const set = MutableHashSet.empty<string>()
 *
 * // Add some values
 * MutableHashSet.add(set, "apple")
 * MutableHashSet.add(set, "banana")
 * MutableHashSet.add(set, "apple") // Duplicate, no effect
 *
 * MutableHashSet.size(set) // => 2
 * Array.from(set) // => ["apple", "banana"]
 * ```
 *
 * @see {@link make} for creating a set from explicit values
 * @see {@link fromIterable} for creating a set from an iterable of values
 * @see {@link clear} for emptying an existing mutable set
 *
 * @category constructors
 * @since 2.0.0
 */
export const empty = <K = never>(): MutableHashSet<K> => fromHashMap(MutableHashMap.empty())

/**
 * Creates a MutableHashSet from an iterable collection of values.
 * Duplicates are automatically removed.
 *
 * **When to use**
 *
 * Use to build a mutable hash set from any iterable of values.
 *
 * **Example** (Creating a set from an iterable)
 *
 * ```ts import.meta.vitest
 * import { MutableHashSet } from "effect"
 *
 * const values = ["apple", "banana", "apple", "cherry", "banana"]
 * const set = MutableHashSet.fromIterable(values)
 *
 * MutableHashSet.size(set) // => 3
 * Array.from(set) // => ["apple", "banana", "cherry"]
 *
 * // Works with any iterable
 * MutableHashSet.size(MutableHashSet.fromIterable(new Set([1, 2, 3]))) // => 3
 *
 * // From string characters
 * Array.from(MutableHashSet.fromIterable("hello")) // => ["h", "e", "l", "o"]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromIterable = <K = never>(keys: Iterable<K>): MutableHashSet<K> =>
  fromHashMap(MutableHashMap.fromIterable(Array.from(keys).map((k) => [k, true])))

/**
 * Creates a MutableHashSet from a variable number of values.
 * Duplicates are automatically removed.
 *
 * **When to use**
 *
 * Use to build a mutable hash set from explicit values.
 *
 * **Example** (Creating a set from values)
 *
 * ```ts import.meta.vitest
 * import { MutableHashSet } from "effect"
 *
 * const set = MutableHashSet.make("apple", "banana", "apple", "cherry")
 *
 * MutableHashSet.size(set) // => 3
 * Array.from(set) // => ["apple", "banana", "cherry"]
 *
 * // With numbers
 * const numbers = MutableHashSet.make(1, 2, 3, 2, 1)
 * MutableHashSet.size(numbers) // => 3
 * Array.from(numbers) // => [1, 2, 3]
 *
 * // Mixed types
 * MutableHashSet.size(MutableHashSet.make("hello", 42, true, "hello")) // => 3
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const make = <Keys extends ReadonlyArray<unknown>>(
  ...keys: Keys
): MutableHashSet<Keys[number]> => fromIterable(keys)

/**
 * Adds a value to the MutableHashSet, mutating the set in place.
 * If the value already exists, the set remains unchanged.
 *
 * **When to use**
 *
 * Use to insert a value into a mutable set while keeping uniqueness.
 *
 * **Example** (Adding values)
 *
 * ```ts import.meta.vitest
 * import { MutableHashSet } from "effect"
 *
 * const set = MutableHashSet.empty<string>()
 *
 * // Add new values
 * MutableHashSet.add(set, "apple")
 * MutableHashSet.add(set, "banana")
 *
 * MutableHashSet.size(set) // => 2
 * MutableHashSet.has(set, "apple") // => true
 *
 * // Add duplicate (no effect)
 * MutableHashSet.add(set, "apple")
 * MutableHashSet.size(set) // => 2
 *
 * // Pipe-able version
 * const addFruit = MutableHashSet.add("cherry")
 * addFruit(set)
 * MutableHashSet.size(set) // => 3
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const add: {
  <V>(key: V): (self: MutableHashSet<V>) => MutableHashSet<V>
  <V>(self: MutableHashSet<V>, key: V): MutableHashSet<V>
} = Dual.dual<
  <V>(key: V) => (self: MutableHashSet<V>) => MutableHashSet<V>,
  <V>(self: MutableHashSet<V>, key: V) => MutableHashSet<V>
>(2, (self, key) => (MutableHashMap.set(self.keyMap, key, true), self))

/**
 * Checks whether the MutableHashSet contains the specified value.
 *
 * **When to use**
 *
 * Use to test whether a mutable set currently contains a value.
 *
 * **Details**
 *
 * Membership follows the same hashing and equality rules as the underlying
 * `MutableHashMap`.
 *
 * **Example** (Checking for a value)
 *
 * ```ts import.meta.vitest
 * import { MutableHashSet } from "effect"
 *
 * const set = MutableHashSet.make("apple", "banana", "cherry")
 *
 * MutableHashSet.has(set, "apple") // => true
 * MutableHashSet.has(set, "grape") // => false
 *
 * // Pipe-able version
 * const hasApple = MutableHashSet.has("apple")
 * hasApple(set) // => true
 *
 * // Check after adding
 * MutableHashSet.add(set, "grape")
 * MutableHashSet.has(set, "grape") // => true
 * ```
 *
 * @see {@link add} for adding a value to the set
 * @see {@link remove} for removing a value from the set
 *
 * @category predicates
 * @since 2.0.0
 */
export const has: {
  <V>(key: V): (self: MutableHashSet<V>) => boolean
  <V>(self: MutableHashSet<V>, key: V): boolean
} = Dual.dual<
  <V>(key: V) => (self: MutableHashSet<V>) => boolean,
  <V>(self: MutableHashSet<V>, key: V) => boolean
>(2, (self, key) => MutableHashMap.has(self.keyMap, key))

/**
 * Removes the specified value from the MutableHashSet, mutating the set in place.
 * If the value doesn't exist, the set remains unchanged.
 *
 * **When to use**
 *
 * Use to delete a value from a mutable set if it is present.
 *
 * **Example** (Removing a value)
 *
 * ```ts import.meta.vitest
 * import { MutableHashSet } from "effect"
 *
 * const set = MutableHashSet.make("apple", "banana", "cherry")
 *
 * MutableHashSet.size(set) // => 3
 *
 * // Remove existing value
 * MutableHashSet.remove(set, "banana")
 * MutableHashSet.size(set) // => 2
 * MutableHashSet.has(set, "banana") // => false
 *
 * // Remove non-existent value (no effect)
 * MutableHashSet.remove(set, "grape")
 * MutableHashSet.size(set) // => 2
 *
 * // Pipe-able version
 * const removeFruit = MutableHashSet.remove("apple")
 * removeFruit(set)
 * MutableHashSet.size(set) // => 1
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const remove: {
  <V>(key: V): (self: MutableHashSet<V>) => MutableHashSet<V>
  <V>(self: MutableHashSet<V>, key: V): MutableHashSet<V>
} = Dual.dual<
  <V>(key: V) => (self: MutableHashSet<V>) => MutableHashSet<V>,
  <V>(self: MutableHashSet<V>, key: V) => MutableHashSet<V>
>(2, (self, key) => (MutableHashMap.remove(self.keyMap, key), self))

/**
 * Returns the number of unique values in the MutableHashSet.
 *
 * **When to use**
 *
 * Use to read how many unique values are currently stored in the set.
 *
 * **Example** (Checking set size)
 *
 * ```ts import.meta.vitest
 * import { MutableHashSet } from "effect"
 *
 * const set = MutableHashSet.empty<string>()
 * MutableHashSet.size(set) // => 0
 *
 * MutableHashSet.add(set, "apple")
 * MutableHashSet.add(set, "banana")
 * MutableHashSet.add(set, "apple") // Duplicate
 * MutableHashSet.size(set) // => 2
 *
 * MutableHashSet.remove(set, "apple")
 * MutableHashSet.size(set) // => 1
 *
 * MutableHashSet.clear(set)
 * MutableHashSet.size(set) // => 0
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const size = <V>(self: MutableHashSet<V>): number => MutableHashMap.size(self.keyMap)

/**
 * Removes all values from the MutableHashSet, mutating the set in place.
 * The set becomes empty after this operation.
 *
 * **When to use**
 *
 * Use to empty a mutable set while keeping the same set instance.
 *
 * **Example** (Clearing all values)
 *
 * ```ts import.meta.vitest
 * import { MutableHashSet } from "effect"
 *
 * const set = MutableHashSet.make("apple", "banana", "cherry")
 *
 * MutableHashSet.size(set) // => 3
 *
 * // Clear all values
 * MutableHashSet.clear(set)
 *
 * MutableHashSet.size(set) // => 0
 * MutableHashSet.has(set, "apple") // => false
 * Array.from(set) // => []
 *
 * // Can still add new values after clearing
 * MutableHashSet.add(set, "new")
 * MutableHashSet.size(set) // => 1
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const clear = <V>(self: MutableHashSet<V>): MutableHashSet<V> => (MutableHashMap.clear(self.keyMap), self)
