/**
 * Stores key/value entries in a mutable hash map.
 *
 * `MutableHashMap` updates the same collection in place and supports fast
 * lookup, insertion, removal, clearing, and iteration. It combines a native
 * `Map` for ordinary JavaScript keys with hash buckets for keys that implement
 * Effect `Equal` and `Hash`, so callers can mix reference-based and structural
 * lookup in the same collection.
 *
 * @since 2.0.0
 */
import type { NonEmptyArray } from "./Array.ts"
import * as Equal from "./Equal.ts"
import { format } from "./Formatter.ts"
import { dual } from "./Function.ts"
import * as Hash from "./Hash.ts"
import { type Inspectable, NodeInspectSymbol, toJson } from "./Inspectable.ts"
import * as Option from "./Option.ts"
import type { Pipeable } from "./Pipeable.ts"
import { pipeArguments } from "./Pipeable.ts"
import { hasProperty } from "./Predicate.ts"

const TypeId = "~effect/MutableHashMap"

/**
 * A mutable hash map that stores key-value pairs and supports both referential
 * and Effect structural equality.
 *
 * **When to use**
 *
 * Use as a mutable key-value map when in-place updates are acceptable and keys
 * may rely on Effect structural equality.
 *
 * **Details**
 *
 * Operations mutate the map in place. Keys that implement `Equal` / `Hash` can
 * be looked up structurally; other keys use normal JavaScript reference or
 * primitive equality.
 *
 * **Example** (Using a mutable hash map)
 *
 * ```ts import.meta.vitest
 * import { MutableHashMap } from "effect"
 *
 * // Create a mutable hash map with string keys and number values
 * const map: MutableHashMap.MutableHashMap<string, number> = MutableHashMap
 *   .empty()
 *
 * // Add some data
 * MutableHashMap.set(map, "count", 42)
 * MutableHashMap.set(map, "total", 100)
 *
 * Array.from(map) // => [["count", 42], ["total", 100]]
 * ```
 *
 * @see {@link empty} for creating an empty mutable hash map
 * @see {@link get} for reading values by key
 * @see {@link set} for mutating entries by key
 *
 * @category models
 * @since 2.0.0
 */
export interface MutableHashMap<out K, out V> extends Iterable<[K, V]>, Pipeable, Inspectable {
  readonly [TypeId]: typeof TypeId
  readonly backing: Map<K, V>
  readonly buckets: Map<number, NonEmptyArray<K>>
}

/**
 * Checks whether the specified value is a `MutableHashMap`, `false` otherwise.
 *
 * **When to use**
 *
 * Use to narrow an unknown value before treating it as a mutable hash map.
 *
 * **Details**
 *
 * The check looks for the `MutableHashMap` runtime marker.
 *
 * **Gotchas**
 *
 * The check does not validate the key or value types carried by the map.
 *
 * @see {@link MutableHashMap} for the mutable hash map interface
 *
 * @category guards
 * @since 4.0.0
 */
export const isMutableHashMap = <K, V>(value: unknown): value is MutableHashMap<K, V> => hasProperty(value, TypeId)

const MutableHashMapProto: Omit<MutableHashMap<unknown, unknown>, "backing" | "buckets" | "bucketsSize"> = {
  [TypeId]: TypeId,
  [Symbol.iterator](this: MutableHashMap<unknown, unknown>): Iterator<[unknown, unknown]> {
    return this.backing[Symbol.iterator]()
  },
  toString() {
    return `MutableHashMap(${format(Array.from(this))})`
  },
  toJSON() {
    return {
      _id: "MutableHashMap",
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

/**
 * Creates an empty MutableHashMap.
 *
 * **When to use**
 *
 * Use to create a fresh mutable map before adding entries over time.
 *
 * **Details**
 *
 * Each call returns a new empty map instance.
 *
 * **Example** (Creating an empty map)
 *
 * ```ts import.meta.vitest
 * import { MutableHashMap } from "effect"
 *
 * const map = MutableHashMap.empty<string, number>()
 *
 * // Add some entries
 * MutableHashMap.set(map, "key1", 42)
 * MutableHashMap.set(map, "key2", 100)
 *
 * MutableHashMap.size(map) // => 2
 * ```
 *
 * @see {@link make} for creating a map from explicit entries
 * @see {@link fromIterable} for creating a map from an iterable of entries
 *
 * @category constructors
 * @since 2.0.0
 */
export const empty = <K, V>(): MutableHashMap<K, V> => {
  const self = Object.create(MutableHashMapProto)
  self.backing = new Map()
  self.buckets = new Map()
  return self
}

/**
 * Creates a MutableHashMap from a variable number of key-value pairs.
 *
 * **When to use**
 *
 * Use to create a mutable hash map from explicit entries known at the call site.
 *
 * **Example** (Creating a map from entries)
 *
 * ```ts import.meta.vitest
 * import { MutableHashMap, Option } from "effect"
 *
 * const map = MutableHashMap.make(
 *   ["key1", 42],
 *   ["key2", 100],
 *   ["key3", 200]
 * )
 *
 * MutableHashMap.get(map, "key1") // => Option.some(42)
 * MutableHashMap.size(map) // => 3
 * ```
 *
 * @see {@link empty} for creating an empty map
 * @see {@link fromIterable} for creating a map from an iterable of entries
 *
 * @category constructors
 * @since 2.0.0
 */
export const make: <Entries extends Array<readonly [any, any]>>(
  ...entries: Entries
) => MutableHashMap<
  Entries[number] extends readonly [infer K, any] ? K : never,
  Entries[number] extends readonly [any, infer V] ? V : never
> = (...entries) => fromIterable(entries)

/**
 * Creates a MutableHashMap from an iterable collection of key-value pairs.
 *
 * **When to use**
 *
 * Use to create a mutable hash map from an existing iterable of entries.
 *
 * **Example** (Creating a map from an iterable)
 *
 * ```ts import.meta.vitest
 * import { MutableHashMap, Option } from "effect"
 *
 * const entries = [
 *   ["apple", 1],
 *   ["banana", 2],
 *   ["cherry", 3]
 * ] as const
 *
 * const map = MutableHashMap.fromIterable(entries)
 *
 * MutableHashMap.get(map, "banana") // => Option.some(2)
 * MutableHashMap.size(map) // => 3
 *
 * // Works with any iterable
 * const fromMap = MutableHashMap.fromIterable(new Map([["x", 10], ["y", 20]]))
 * MutableHashMap.get(fromMap, "x") // => Option.some(10)
 * ```
 *
 * @see {@link make} for creating a map from explicit entries
 * @see {@link empty} for creating an empty map
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromIterable = <K, V>(entries: Iterable<readonly [K, V]>): MutableHashMap<K, V> => {
  const self = empty<K, V>()
  for (const [key, value] of entries) {
    set(self, key, value)
  }
  return self
}

/**
 * Looks up a key in the `MutableHashMap` safely.
 *
 * **When to use**
 *
 * Use to safely read a `MutableHashMap` value for a key as an `Option`.
 *
 * **Details**
 *
 * Returns `Some(value)` when an equal key is present and `None` when the key is
 * absent.
 *
 * **Example** (Getting a value)
 *
 * ```ts import.meta.vitest
 * import { MutableHashMap, Option } from "effect"
 *
 * const map = MutableHashMap.make(["key1", 42], ["key2", 100])
 *
 * MutableHashMap.get(map, "key1") // => Option.some(42)
 * MutableHashMap.get(map, "key3") // => Option.none()
 *
 * // Pipe-able version
 * MutableHashMap.get("key1")(map) // => Option.some(42)
 * ```
 *
 * @see {@link has} for checking only whether a key is present
 * @see {@link set} for inserting or replacing a value by key
 *
 * @category getters
 * @since 2.0.0
 */
export const get: {
  <K>(key: K): <V>(self: MutableHashMap<K, V>) => Option.Option<V>
  <K, V>(self: MutableHashMap<K, V>, key: K): Option.Option<V>
} = dual<
  <K>(key: K) => <V>(self: MutableHashMap<K, V>) => Option.Option<V>,
  <K, V>(self: MutableHashMap<K, V>, key: K) => Option.Option<V>
>(2, <K, V>(self: MutableHashMap<K, V>, key: K): Option.Option<V> => {
  if (self.backing.has(key)) {
    return Option.some(self.backing.get(key)!)
  } else if (isSimpleKey(key)) {
    return Option.none()
  }
  const hash = Hash.hash(key)
  const bucket = self.buckets.get(hash)
  if (bucket === undefined) {
    return Option.none()
  }
  return getFromBucket(self, bucket, key)
})

const isSimpleKey = (u: unknown): boolean => typeof u !== "object" && typeof u !== "function"

/**
 * Returns an iterable over the keys in the `MutableHashMap`.
 *
 * **When to use**
 *
 * Use to iterate over the keys currently stored in a mutable hash map.
 *
 * **Example** (Reading keys)
 *
 * ```ts import.meta.vitest
 * import { MutableHashMap } from "effect"
 *
 * const map = MutableHashMap.make(
 *   ["apple", 1],
 *   ["banana", 2],
 *   ["cherry", 3]
 * )
 *
 * Array.from(MutableHashMap.keys(map)) // => ["apple", "banana", "cherry"]
 * ```
 *
 * @see {@link values} for iterating over stored values
 * @see {@link has} for checking one key without iterating
 *
 * @category getters
 * @since 3.8.0
 */
export const keys = <K, V>(self: MutableHashMap<K, V>): Iterable<K> => self.backing.keys()

/**
 * Returns an iterable over the values in the `MutableHashMap`.
 *
 * **When to use**
 *
 * Use to iterate over the values currently stored in a mutable hash map.
 *
 * **Example** (Reading values)
 *
 * ```ts import.meta.vitest
 * import { MutableHashMap } from "effect"
 *
 * const map = MutableHashMap.make(
 *   ["apple", 1],
 *   ["banana", 2],
 *   ["cherry", 3]
 * )
 *
 * const allValues = Array.from(MutableHashMap.values(map)) // => [1, 2, 3]
 *
 * // Useful for calculations
 * allValues.reduce((sum, value) => sum + value, 0) // => 6
 *
 * // Filter values
 * allValues.filter((value) => value > 1) // => [2, 3]
 * ```
 *
 * @see {@link keys} for iterating over stored keys
 *
 * @category getters
 * @since 3.8.0
 */
export const values = <K, V>(self: MutableHashMap<K, V>): Iterable<V> => self.backing.values()

const getFromBucket = <K, V>(
  self: MutableHashMap<K, V>,
  bucket: NonEmptyArray<K>,
  key: K
): Option.Option<V> => {
  for (let i = 0, len = bucket.length; i < len; i++) {
    if (Equal.equals(key, bucket[i])) {
      const refKey = bucket[i]
      return Option.some(self.backing.get(refKey)!)
    }
  }
  return Option.none()
}

/**
 * Checks whether the MutableHashMap contains the specified key.
 *
 * **When to use**
 *
 * Use to test whether a key is present in a `MutableHashMap` without reading
 * its value.
 *
 * **Example** (Checking for a key)
 *
 * ```ts import.meta.vitest
 * import { MutableHashMap } from "effect"
 *
 * const map = MutableHashMap.make(["key1", 42], ["key2", 100])
 *
 * MutableHashMap.has(map, "key1") // => true
 * MutableHashMap.has(map, "key3") // => false
 *
 * // Pipe-able version
 * MutableHashMap.has("key1")(map) // => true
 * ```
 *
 * @see {@link get} for reading the value as an `Option`
 *
 * @category predicates
 * @since 2.0.0
 */
export const has: {
  <K>(key: K): <V>(self: MutableHashMap<K, V>) => boolean
  <K, V>(self: MutableHashMap<K, V>, key: K): boolean
} = dual<
  <K>(key: K) => <V>(self: MutableHashMap<K, V>) => boolean,
  <K, V>(self: MutableHashMap<K, V>, key: K) => boolean
>(2, (self, key) => Option.isSome(get(self, key)))

/**
 * Sets a key-value pair in the MutableHashMap, mutating the map in place.
 * If the key already exists, its value is updated.
 *
 * **When to use**
 *
 * Use to insert a new `MutableHashMap` entry or replace an existing entry in
 * place.
 *
 * **Example** (Setting key-value pairs)
 *
 * ```ts import.meta.vitest
 * import { MutableHashMap, Option } from "effect"
 *
 * const map = MutableHashMap.empty<string, number>()
 *
 * // Add new entries
 * MutableHashMap.set(map, "key1", 42)
 * MutableHashMap.set(map, "key2", 100)
 *
 * MutableHashMap.get(map, "key1") // => Option.some(42)
 * MutableHashMap.size(map) // => 2
 *
 * // Update existing entry
 * MutableHashMap.set(map, "key1", 999)
 * MutableHashMap.get(map, "key1") // => Option.some(999)
 *
 * // Pipe-able version
 * MutableHashMap.set("key3", 300)(map)
 * MutableHashMap.size(map) // => 3
 * ```
 *
 * @see {@link modify} for updating an existing value with a function
 * @see {@link modifyAt} for setting or removing based on the current optional value
 * @see {@link remove} for deleting an entry by key
 *
 * @category mutations
 * @since 2.0.0
 */
export const set: {
  <K, V>(key: K, value: V): (self: MutableHashMap<K, V>) => MutableHashMap<K, V>
  <K, V>(self: MutableHashMap<K, V>, key: K, value: V): MutableHashMap<K, V>
} = dual<
  <K, V>(key: K, value: V) => (self: MutableHashMap<K, V>) => MutableHashMap<K, V>,
  <K, V>(self: MutableHashMap<K, V>, key: K, value: V) => MutableHashMap<K, V>
>(3, <K, V>(self: MutableHashMap<K, V>, key: K, value: V) => {
  if (self.backing.has(key) || isSimpleKey(key)) {
    self.backing.set(key, value)
    return self
  }
  const hash = Hash.hash(key)
  const bucket = self.buckets.get(hash)
  if (bucket === undefined) {
    self.buckets.set(hash, [key])
    self.backing.set(key, value)
    return self
  }

  let refKey = getRefKey(bucket, key)
  if (refKey === undefined) {
    bucket.push(key)
    refKey = key
  }
  self.backing.set(refKey, value)
  return self
})

const getRefKey = <K>(
  bucket: NonEmptyArray<K>,
  key: K
) => {
  for (let i = 0, len = bucket.length; i < len; i++) {
    if (Equal.equals(key, bucket[i])) {
      return bucket[i]
    }
  }
}

/**
 * Updates the value of the specified key within the MutableHashMap if it exists.
 * If the key doesn't exist, the map remains unchanged.
 *
 * **When to use**
 *
 * Use to transform an existing `MutableHashMap` value in place without
 * inserting missing keys.
 *
 * **Example** (Modifying existing values)
 *
 * ```ts import.meta.vitest
 * import { MutableHashMap, Option } from "effect"
 *
 * const map = MutableHashMap.make(["count", 5], ["total", 100])
 *
 * // Increment existing value
 * MutableHashMap.modify(map, "count", (n) => n + 1)
 * MutableHashMap.get(map, "count") // => Option.some(6)
 *
 * // Double existing value
 * MutableHashMap.modify(map, "total", (n) => n * 2)
 * MutableHashMap.get(map, "total") // => Option.some(200)
 *
 * // Try to modify non-existent key (no effect)
 * MutableHashMap.modify(map, "missing", (n) => n + 1)
 * MutableHashMap.has(map, "missing") // => false
 *
 * // Pipe-able version
 * MutableHashMap.modify("count", (n: number) => n + 1)(map)
 * MutableHashMap.get(map, "count") // => Option.some(7)
 * ```
 *
 * @see {@link set} for inserting or replacing a value directly
 * @see {@link modifyAt} for handling both missing and existing keys
 *
 * @category mutations
 * @since 2.0.0
 */
export const modify: {
  <K, V>(key: K, f: (v: V) => V): (self: MutableHashMap<K, V>) => MutableHashMap<K, V>
  <K, V>(self: MutableHashMap<K, V>, key: K, f: (v: V) => V): MutableHashMap<K, V>
} = dual<
  <K, V>(key: K, f: (v: V) => V) => (self: MutableHashMap<K, V>) => MutableHashMap<K, V>,
  <K, V>(self: MutableHashMap<K, V>, key: K, f: (v: V) => V) => MutableHashMap<K, V>
>(3, <K, V>(self: MutableHashMap<K, V>, key: K, f: (v: V) => V) => {
  const hasKey = self.backing.has(key)
  if (hasKey || isSimpleKey(key)) {
    if (hasKey) {
      self.backing.set(key, f(self.backing.get(key)!))
    }
    return self
  }
  const hash = Hash.hash(key)
  const bucket = self.buckets.get(hash)
  if (bucket === undefined) {
    return self
  }

  const refKey = getRefKey(bucket, key)
  if (refKey === undefined) {
    return self
  }
  self.backing.set(refKey, f(self.backing.get(refKey)!))
  return self
})

/**
 * Updates or removes the specified key using a function from the current
 * optional value to the next optional value.
 *
 * **When to use**
 *
 * Use to decide whether to insert, update, or remove a key based on its current
 * optional value.
 *
 * **Example** (Updating or removing a key)
 *
 * ```ts import.meta.vitest
 * import { MutableHashMap, Option } from "effect"
 *
 * const map = MutableHashMap.make(["count", 5])
 *
 * // Update existing key
 * MutableHashMap.modifyAt(
 *   map,
 *   "count",
 *   (option) => Option.map(option, (n) => n * 2)
 * )
 * MutableHashMap.get(map, "count") // => Option.some(10)
 *
 * // Add new key
 * MutableHashMap.modifyAt(
 *   map,
 *   "new",
 *   (option) => Option.isNone(option) ? Option.some(42) : option
 * )
 * MutableHashMap.get(map, "new") // => Option.some(42)
 *
 * // Remove key by returning None
 * MutableHashMap.modifyAt(map, "count", () => Option.none())
 * MutableHashMap.get(map, "count") // => Option.none()
 *
 * // Conditional update
 * MutableHashMap.modifyAt(
 *   map,
 *   "new",
 *   (option) => Option.filter(option, (n) => n > 50) // Remove if <= 50
 * )
 * MutableHashMap.get(map, "new") // => Option.none()
 * ```
 *
 * @see {@link modify} for updating only when the key already exists
 * @see {@link set} for inserting or replacing directly
 * @see {@link remove} for deleting directly
 *
 * @category mutations
 * @since 2.0.0
 */
export const modifyAt: {
  <K, V>(key: K, f: (value: Option.Option<V>) => Option.Option<V>): (self: MutableHashMap<K, V>) => MutableHashMap<K, V>
  <K, V>(self: MutableHashMap<K, V>, key: K, f: (value: Option.Option<V>) => Option.Option<V>): MutableHashMap<K, V>
} = dual<
  <K, V>(
    key: K,
    f: (value: Option.Option<V>) => Option.Option<V>
  ) => (self: MutableHashMap<K, V>) => MutableHashMap<K, V>,
  <K, V>(
    self: MutableHashMap<K, V>,
    key: K,
    f: (value: Option.Option<V>) => Option.Option<V>
  ) => MutableHashMap<K, V>
>(3, (self, key, f) => {
  const current = get(self, key)
  const result = f(current)
  if (Option.isNone(result)) {
    if (Option.isSome(current)) {
      remove(self, key)
    }
    return self
  }
  set(self, key, result.value)
  return self
})

/**
 * Removes the specified key from the MutableHashMap, mutating the map in place.
 * If the key doesn't exist, the map remains unchanged.
 *
 * **When to use**
 *
 * Use to delete one key from a mutable hash map in place.
 *
 * **Example** (Removing a key)
 *
 * ```ts import.meta.vitest
 * import { MutableHashMap } from "effect"
 *
 * const map = MutableHashMap.make(
 *   ["key1", 42],
 *   ["key2", 100],
 *   ["key3", 200]
 * )
 *
 * MutableHashMap.size(map) // => 3
 *
 * // Remove existing key
 * MutableHashMap.remove(map, "key2")
 * MutableHashMap.size(map) // => 2
 * MutableHashMap.has(map, "key2") // => false
 *
 * // Remove non-existent key (no effect)
 * MutableHashMap.remove(map, "nonexistent")
 * MutableHashMap.size(map) // => 2
 *
 * // Pipe-able version
 * MutableHashMap.remove("key1")(map)
 * MutableHashMap.size(map) // => 1
 * ```
 *
 * @see {@link clear} for removing all entries
 * @see {@link modifyAt} for conditionally removing based on the current value
 *
 * @category mutations
 * @since 2.0.0
 */
export const remove: {
  <K>(key: K): <V>(self: MutableHashMap<K, V>) => MutableHashMap<K, V>
  <K, V>(self: MutableHashMap<K, V>, key: K): MutableHashMap<K, V>
} = dual<
  <K>(key: K) => <V>(self: MutableHashMap<K, V>) => MutableHashMap<K, V>,
  <K, V>(self: MutableHashMap<K, V>, key: K) => MutableHashMap<K, V>
>(2, <K, V>(self: MutableHashMap<K, V>, key_: K) => {
  if (isSimpleKey(key_)) {
    self.backing.delete(key_)
    return self
  }

  const hash = Hash.hash(key_)
  const bucket = self.buckets.get(hash)
  if (bucket === undefined) {
    return self
  }
  for (let i = 0, len = bucket.length; i < len; i++) {
    const bkey = bucket[i]
    if (bkey === key_ || Equal.equals(key_, bkey)) {
      self.backing.delete(bkey)
      bucket.splice(i, 1)
      break
    }
  }
  if (bucket.length === 0) {
    self.buckets.delete(hash)
  }
  return self
})

/**
 * Removes all key-value pairs from the MutableHashMap, mutating the map in place.
 * The map becomes empty after this operation.
 *
 * **When to use**
 *
 * Use to empty a mutable hash map while keeping the same map instance.
 *
 * **Example** (Clearing all entries)
 *
 * ```ts import.meta.vitest
 * import { MutableHashMap } from "effect"
 *
 * const map = MutableHashMap.make(
 *   ["key1", 42],
 *   ["key2", 100],
 *   ["key3", 200]
 * )
 *
 * MutableHashMap.size(map) // => 3
 *
 * // Clear all entries
 * MutableHashMap.clear(map)
 *
 * MutableHashMap.size(map) // => 0
 * MutableHashMap.has(map, "key1") // => false
 *
 * // Can still add new entries after clearing
 * MutableHashMap.set(map, "new", 999)
 * Array.from(map) // => [["new", 999]]
 * ```
 *
 * @see {@link remove} for deleting one key
 * @see {@link empty} for creating a fresh empty map
 *
 * @category mutations
 * @since 2.0.0
 */
export const clear = <K, V>(self: MutableHashMap<K, V>) => {
  self.backing.clear()
  self.buckets.clear()
  return self
}

/**
 * Returns the number of key-value pairs in the MutableHashMap.
 *
 * **When to use**
 *
 * Use to read how many entries are currently stored in the mutable hash map.
 *
 * **Example** (Checking map size)
 *
 * ```ts import.meta.vitest
 * import { MutableHashMap } from "effect"
 *
 * const map = MutableHashMap.empty<string, number>()
 * MutableHashMap.size(map) // => 0
 *
 * MutableHashMap.set(map, "key1", 42)
 * MutableHashMap.set(map, "key2", 100)
 * MutableHashMap.size(map) // => 2
 *
 * MutableHashMap.remove(map, "key1")
 * MutableHashMap.size(map) // => 1
 *
 * MutableHashMap.clear(map)
 * MutableHashMap.size(map) // => 0
 * ```
 *
 * @see {@link isEmpty} for checking whether the map has no entries
 *
 * @category getters
 * @since 2.0.0
 */
export const size = <K, V>(self: MutableHashMap<K, V>): number => self.backing.size

/**
 * Returns `true` when the `MutableHashMap` contains no key-value pairs.
 *
 * **When to use**
 *
 * Use to branch on whether a mutable map currently has any entries.
 *
 * @see {@link size} for reading the exact number of entries
 *
 * @category predicates
 * @since 2.0.0
 */
export const isEmpty = <K, V>(self: MutableHashMap<K, V>): boolean => self.backing.size === 0

/**
 * Runs a callback for each key-value pair in the `MutableHashMap`.
 *
 * **When to use**
 *
 * Use to run a synchronous side-effecting callback for every key-value pair in
 * an existing mutable map.
 *
 * **Details**
 *
 * Iteration follows the backing map's order. The callback receives the value
 * first and the key second, matching `Map.prototype.forEach`.
 *
 * @see {@link keys} for iterating only keys
 * @see {@link values} for iterating only values
 *
 * @category traversing
 * @since 2.0.0
 */
export const forEach: {
  <K, V>(f: (value: V, key: K) => void): (self: MutableHashMap<K, V>) => void
  <K, V>(self: MutableHashMap<K, V>, f: (value: V, key: K) => void): void
} = dual(2, <K, V>(self: MutableHashMap<K, V>, f: (value: V, key: K) => void) => {
  self.backing.forEach(f)
})
