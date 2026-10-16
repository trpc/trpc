/**
 * Stores key/value entries in an immutable hash map.
 *
 * A `HashMap<Key, Value>` hashes keys and resolves matches with Effect's
 * structural equality rules. Lookup, insertion, removal, and transformation
 * operations return new maps, while temporary mutation helpers support efficient
 * batch updates. This module also includes constructors, iteration, conversion,
 * mapping, filtering, and reducing helpers.
 *
 * @since 2.0.0
 */

import type { Equal } from "./Equal.ts"
import type { Inspectable } from "./Inspectable.ts"
import * as internal from "./internal/hashMap.ts"
import type { Option } from "./Option.ts"
import type { Pipeable } from "./Pipeable.ts"
import type { Result } from "./Result.ts"
import type { NoInfer } from "./Types.ts"

const TypeId = internal.HashMapTypeId

/**
 * A HashMap is an immutable key-value data structure that provides efficient lookup,
 * insertion, and deletion operations. It uses a Hash Array Mapped Trie (HAMT) internally
 * for structural sharing and optimal performance.
 *
 * **Example** (Using basic HashMap operations)
 *
 * ```ts import.meta.vitest
 * import { HashMap, Option } from "effect"
 *
 * // Create a HashMap
 * const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])
 *
 * // Access values
 * HashMap.get(map, "a") // => Option.some(1)
 * HashMap.get(map, "d") // => Option.none()
 *
 * // Check if key exists
 * HashMap.has(map, "b") // => true
 *
 * // Add/update values (returns new HashMap)
 * HashMap.set(map, "d", 4) // => HashMap.make(["a", 1], ["b", 2], ["c", 3], ["d", 4])
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface HashMap<out Key, out Value> extends Iterable<[Key, Value]>, Equal, Pipeable, Inspectable {
  readonly [TypeId]: typeof TypeId
}

/**
 * The HashMap namespace contains type-level utilities and helper types
 * for working with HashMap instances.
 *
 * **Example** (Extracting HashMap types)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * // Create a concrete HashMap for type extraction
 * const inventory = HashMap.make(
 *   ["laptop", { quantity: 5, price: 999 }],
 *   ["mouse", { quantity: 20, price: 29 }]
 * )
 *
 * // Extract types for reuse
 * type ProductId = HashMap.HashMap.Key<typeof inventory> // string
 * type Product = HashMap.HashMap.Value<typeof inventory> // { quantity: number, price: number }
 * type InventoryEntry = HashMap.HashMap.Entry<typeof inventory> // [string, Product]
 *
 * // Use extracted types in functions
 * const updateInventory = (id: ProductId, product: Product) =>
 *   HashMap.set(inventory, id, product)
 *
 * const processEntry = ([id, product]: InventoryEntry) =>
 *   `${id}: ${product.quantity} @ $${product.price}`
 *
 * // Example of extracted types in action
 * const newProduct: Product = { quantity: 10, price: 199 }
 * const updatedInventory = updateInventory("tablet", newProduct)
 * processEntry(["tablet", newProduct]) // => "tablet: 10 @ $199"
 * updatedInventory // => HashMap.make(["laptop", { quantity: 5, price: 999 }], ["mouse", { quantity: 20, price: 29 }], ["tablet", newProduct])
 * ```
 *
 * @since 2.0.0
 */
export declare namespace HashMap {
  /**
   * A function that updates a value based on its current state.
   * Takes an Option representing the current value and returns an Option
   * representing the new value.
   *
   * **Example** (Updating values from Options)
   *
   * ```ts import.meta.vitest
   * import { HashMap, Option } from "effect"
   *
   * const map = HashMap.make(["a", 1], ["b", 2])
   *
   * // Increment existing value or set to 1 if not present
   * const updateFn = (option: Option.Option<number>) =>
   *   Option.isSome(option) ? Option.some(option.value + 1) : Option.some(1)
   *
   * const updated = HashMap.modifyAt(map, "a", updateFn)
   * HashMap.get(updated, "a") // => Option.some(2)
   * ```
   *
   * @category models
   * @since 2.0.0
   */
  export type UpdateFn<V> = (option: Option<V>) => Option<V>

  /**
   * This type-level utility extracts the key type `K` from a `HashMap<K, V>` type.
   *
   * **Example** (Extracting key types)
   *
   * ```ts import.meta.vitest
   * import { HashMap, Option } from "effect"
   *
   * // Create a HashMap to extract key type from
   * const userMap = HashMap.make(
   *   ["alice", { name: "Alice", age: 30 }],
   *   ["bob", { name: "Bob", age: 25 }]
   * )
   *
   * // Extract the key type (string)
   * type UserKey = HashMap.HashMap.Key<typeof userMap>
   *
   * // Use the extracted type in functions
   * const getUserById = (id: UserKey) => HashMap.get(userMap, id)
   * getUserById("alice") // => Option.some({ name: "Alice", age: 30 })
   * ```
   *
   * @category utility types
   * @since 2.0.0
   */
  export type Key<T extends HashMap<any, any>> = [T] extends [HashMap<infer _K, infer _V>] ? _K : never

  /**
   * This type-level utility extracts the value type `V` from a `HashMap<K, V>` type.
   *
   * **Example** (Extracting value types)
   *
   * ```ts import.meta.vitest
   * import { HashMap, Option } from "effect"
   *
   * // Create a HashMap with user data
   * const userMap = HashMap.make(
   *   ["alice", { name: "Alice", age: 30, active: true }],
   *   ["bob", { name: "Bob", age: 25, active: false }]
   * )
   *
   * // Extract the value type (User object)
   * type User = HashMap.HashMap.Value<typeof userMap>
   *
   * // Use the extracted type for type-safe operations
   * const processUser = (user: User) => {
   *   return user.active ? `${user.name} (active)` : `${user.name} (inactive)`
   * }
   *
   * // The lookup has type Option<User> thanks to type extraction
   * HashMap.get(userMap, "alice") // => Option.some({ name: "Alice", age: 30, active: true })
   * processUser({ name: "Alice", age: 30, active: true }) // => "Alice (active)"
   * ```
   *
   * @category utility types
   * @since 2.0.0
   */
  export type Value<T extends HashMap<any, any>> = [T] extends [HashMap<infer _K, infer _V>] ? _V : never

  /**
   * This type-level utility extracts the entry type `[K, V]` from a `HashMap<K, V>` type.
   *
   * **Example** (Extracting entry types)
   *
   * ```ts import.meta.vitest
   * import { HashMap } from "effect"
   *
   * // Create a product catalog HashMap
   * const catalog = HashMap.make(
   *   ["laptop", { price: 999, category: "electronics" }],
   *   ["book", { price: 29, category: "education" }]
   * )
   *
   * // Extract the entry type [string, Product]
   * type CatalogEntry = HashMap.HashMap.Entry<typeof catalog>
   *
   * // Use the extracted type for processing entries
   * const processEntry = ([productId, product]: CatalogEntry) => {
   *   return `${productId}: $${product.price} (${product.category})`
   * }
   *
   * // Convert to entries, process, and sort for deterministic output
   * const descriptions = HashMap.toEntries(catalog).map(processEntry).sort()
   * descriptions // => ["book: $29 (education)", "laptop: $999 (electronics)"]
   * ```
   *
   * @category utility types
   * @since 3.9.0
   */
  export type Entry<T extends HashMap<any, any>> = [Key<T>, Value<T>]
}

/**
 * Checks whether a value is a HashMap.
 *
 * **Example** (Checking HashMap values)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * const map = HashMap.make(["a", 1], ["b", 2])
 * const notMap = { a: 1 }
 *
 * HashMap.isHashMap(map) // => true
 * HashMap.isHashMap(notMap) // => false
 * HashMap.isHashMap(null) // => false
 * ```
 *
 * @category guards
 * @since 2.0.0
 */
export const isHashMap: {
  <K, V>(u: Iterable<readonly [K, V]>): u is HashMap<K, V>
  (u: unknown): u is HashMap<unknown, unknown>
} = internal.isHashMap

/**
 * Creates a new empty `HashMap`.
 *
 * **Example** (Creating an empty HashMap)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * HashMap.empty<string, number>() // => HashMap.empty()
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const empty: <K = never, V = never>() => HashMap<K, V> = internal.empty

/**
 * Constructs a new `HashMap` from an array of key/value pairs.
 *
 * **Example** (Creating a HashMap from entries)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * HashMap.make(["a", 1], ["b", 2], ["c", 3]) // => HashMap.make(["a", 1], ["b", 2], ["c", 3])
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const make: <Entries extends ReadonlyArray<readonly [any, any]>>(
  ...entries: Entries
) => HashMap<
  Entries[number] extends readonly [infer K, any] ? K : never,
  Entries[number] extends readonly [any, infer V] ? V : never
> = internal.make

/**
 * Creates a new `HashMap` from an iterable collection of key/value pairs.
 *
 * **Example** (Creating a HashMap from an iterable)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * const entries = [["a", 1], ["b", 2], ["c", 3]] as const
 * HashMap.fromIterable(entries) // => HashMap.make(["a", 1], ["b", 2], ["c", 3])
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromIterable: <K, V>(entries: Iterable<readonly [K, V]>) => HashMap<K, V> = internal.fromIterable

/**
 * Checks whether the `HashMap` contains no entries.
 *
 * **Example** (Checking for empty HashMaps)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * const emptyMap = HashMap.empty<string, number>()
 * const nonEmptyMap = HashMap.make(["a", 1])
 *
 * HashMap.isEmpty(emptyMap) // => true
 * HashMap.isEmpty(nonEmptyMap) // => false
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const isEmpty: <K, V>(self: HashMap<K, V>) => boolean = internal.isEmpty

/**
 * Looks up the value for the specified key in the `HashMap` safely using the
 * internal hashing function.
 *
 * **Example** (Looking up values)
 *
 * ```ts import.meta.vitest
 * import { HashMap, Option } from "effect"
 *
 * const map = HashMap.make(["a", 1], ["b", 2])
 *
 * HashMap.get(map, "a") // => Option.some(1)
 * HashMap.get(map, "c") // => Option.none()
 *
 * // Using pipe syntax
 * HashMap.get("b")(map) // => Option.some(2)
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const get: {
  <K1 extends K, K>(key: K1): <V>(self: HashMap<K, V>) => Option<V>
  <K1 extends K, K, V>(self: HashMap<K, V>, key: K1): Option<V>
} = internal.get

/**
 * Looks up the value for the specified key in the `HashMap` safely using a custom hash.
 *
 * **Example** (Looking up values with a hash)
 *
 * ```ts import.meta.vitest
 * import { Hash, HashMap, Option } from "effect"
 *
 * // Useful when implementing custom equality for complex keys
 * const userMap = HashMap.make(
 *   ["user123", { name: "Alice", role: "admin" }],
 *   ["user456", { name: "Bob", role: "user" }]
 * )
 *
 * // Use precomputed hash for performance in hot paths
 * const userId = "user123"
 * const precomputedHash = Hash.string(userId)
 *
 * // Lookup with custom hash (e.g., cached hash value)
 * HashMap.getHash(userMap, userId, precomputedHash) // => Option.some({ name: "Alice", role: "admin" })
 *
 * // This avoids recomputing the hash when you already have it
 * HashMap.getHash(userMap, "user999", Hash.string("user999")) // => Option.none()
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const getHash: {
  <K1 extends K, K>(key: K1, hash: number): <V>(self: HashMap<K, V>) => Option<V>
  <K1 extends K, K, V>(self: HashMap<K, V>, key: K1, hash: number): Option<V>
} = internal.getHash

/**
 * Looks up the value for the specified key in the `HashMap` unsafely using the
 * internal hashing function.
 *
 * **When to use**
 *
 * Use when reading from a `HashMap` by a key known to exist, and throwing is an
 * acceptable programming error for a missing key.
 *
 * **Gotchas**
 *
 * This function throws an error if the key is not found. Use `HashMap.get` for
 * safe access that returns `Option`.
 *
 * **Example** (Unsafely looking up values)
 *
 * ```ts import.meta.vitest
 * import { HashMap, Option } from "effect"
 *
 * const config = HashMap.make(
 *   ["api_url", "https://api.example.com"],
 *   ["timeout", "5000"],
 *   ["retries", "3"]
 * )
 *
 * // Safe: use when you're certain the key exists
 * HashMap.getUnsafe(config, "api_url") // => "https://api.example.com"
 *
 * // Preferred: use get() for uncertain keys
 * HashMap.get(config, "db_url") // => Option.none()
 *
 * // This would throw: HashMap.getUnsafe(config, "db_url")
 * // Error: "HashMap.getUnsafe: key not found"
 * ```
 *
 * @category unsafe
 * @since 4.0.0
 */
export const getUnsafe: {
  <K1 extends K, K>(key: K1): <V>(self: HashMap<K, V>) => V
  <K1 extends K, K, V>(self: HashMap<K, V>, key: K1): V
} = internal.getUnsafe

/**
 * Checks whether the specified key has an entry in the `HashMap`.
 *
 * **Example** (Checking for keys)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * const map = HashMap.make(["a", 1], ["b", 2])
 *
 * HashMap.has(map, "a") // => true
 * HashMap.has(map, "c") // => false
 *
 * // Using pipe syntax
 * HashMap.has("b")(map) // => true
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const has: {
  <K1 extends K, K>(key: K1): <K, V>(self: HashMap<K, V>) => boolean
  <K1 extends K, K, V>(self: HashMap<K, V>, key: K1): boolean
} = internal.has

/**
 * Checks whether the specified key has an entry in the `HashMap` using a custom
 * hash.
 *
 * **Example** (Checking keys with a hash)
 *
 * ```ts import.meta.vitest
 * import { Hash, HashMap } from "effect"
 *
 * // Create a map with case-sensitive keys
 * const userMap = HashMap.make(
 *   ["Admin", { role: "administrator" }],
 *   ["User", { role: "standard" }]
 * )
 *
 * // Check with exact hash
 * const exactHash = Hash.string("Admin")
 * HashMap.hasHash(userMap, "Admin", exactHash) // => true
 *
 * // A matching hash does not override key equality
 * HashMap.hasHash(userMap, "admin", exactHash) // => false
 *
 * // A different hash also cannot find the existing key
 * const lowercaseHash = Hash.string("admin")
 * HashMap.hasHash(userMap, "Admin", lowercaseHash) // => false
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const hasHash: {
  <K1 extends K, K>(key: K1, hash: number): <V>(self: HashMap<K, V>) => boolean
  <K1 extends K, K, V>(self: HashMap<K, V>, key: K1, hash: number): boolean
} = internal.hasHash

/**
 * Checks whether an element matching the given predicate exists in the given `HashMap`.
 *
 * **Example** (Checking entries by predicate)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * const hm = HashMap.make([1, "a"])
 * HashMap.hasBy(hm, (value, key) => value === "a" && key === 1) // => true
 * HashMap.hasBy(hm, (value) => value === "b") // => false
 * ```
 *
 * @category predicates
 * @since 3.16.0
 */
export const hasBy: {
  <K, V>(predicate: (value: NoInfer<V>, key: NoInfer<K>) => boolean): (self: HashMap<K, V>) => boolean
  <K, V>(self: HashMap<K, V>, predicate: (value: NoInfer<V>, key: NoInfer<K>) => boolean): boolean
} = internal.hasBy

/**
 * Sets the specified key to the specified value using the internal hashing
 * function.
 *
 * **Example** (Setting a value)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * const map1 = HashMap.make(["a", 1])
 * HashMap.set(map1, "b", 2) // => HashMap.make(["a", 1], ["b", 2])
 *
 * // Original map is unchanged
 * map1 // => HashMap.make(["a", 1])
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const set: {
  <K, V>(key: K, value: V): (self: HashMap<K, V>) => HashMap<K, V>
  <K, V>(self: HashMap<K, V>, key: K, value: V): HashMap<K, V>
} = internal.set

/**
 * Returns an `IterableIterator` of the keys within the `HashMap`.
 *
 * **Example** (Iterating keys)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])
 * Array.from(HashMap.keys(map)).sort() // => ["a", "b", "c"]
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const keys: <K, V>(self: HashMap<K, V>) => IterableIterator<K> = internal.keys

/**
 * Returns an `IterableIterator` of the values within the `HashMap`.
 *
 * **Example** (Iterating values)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])
 * Array.from(HashMap.values(map)).sort() // => [1, 2, 3]
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const values: <K, V>(self: HashMap<K, V>) => IterableIterator<V> = internal.values

/**
 * Returns an `Array` of the values within the `HashMap`.
 *
 * **Example** (Converting values to an array)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * const employees = HashMap.make(
 *   ["alice", { department: "engineering", salary: 90000 }],
 *   ["bob", { department: "marketing", salary: 75000 }],
 *   ["charlie", { department: "engineering", salary: 95000 }]
 * )
 *
 * // Extract all employee records
 * const allEmployees = HashMap.toValues(employees)
 * allEmployees.length // => 3
 *
 * // Calculate total salary
 * allEmployees.reduce((sum, emp) => sum + emp.salary, 0) // => 260000
 *
 * // Filter by department
 * allEmployees.filter((emp) => emp.department === "engineering").length // => 2
 * ```
 *
 * @category getters
 * @since 3.13.0
 */
export const toValues = <K, V>(self: HashMap<K, V>): Array<V> => Array.from(values(self))

/**
 * Returns an `IterableIterator` of the entries within the `HashMap`.
 *
 * **Example** (Iterating entries)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * // Create a configuration map
 * const config = HashMap.make(
 *   ["database.host", "localhost"],
 *   ["database.port", "5432"],
 *   ["cache.enabled", "true"]
 * )
 *
 * // Sort the derived array for deterministic output
 * const settings = Array.from(HashMap.entries(config))
 *   .sort(([left], [right]) => left.localeCompare(right))
 *   .map(([key, value]) => `Setting ${key} = ${value}`)
 *
 * settings // => ["Setting cache.enabled = true", "Setting database.host = localhost", "Setting database.port = 5432"]
 *
 * // Convert to array when you need all entries at once
 * Array.from(HashMap.entries(config)).length // => 3
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const entries: <K, V>(self: HashMap<K, V>) => IterableIterator<[K, V]> = internal.entries

/**
 * Returns an `Array<[K, V]>` of the entries within the `HashMap`.
 *
 * **Example** (Converting entries to an array)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * const gameScores = HashMap.make(
 *   ["alice", 1250],
 *   ["bob", 980],
 *   ["charlie", 1100]
 * )
 *
 * // Convert to entries for processing
 * const scoreEntries = HashMap.toEntries(gameScores)
 *
 * // Sort by score (descending)
 * const leaderboard = scoreEntries
 *   .sort(([, a], [, b]) => b - a)
 *   .map(([player, score], rank) => `${rank + 1}. ${player}: ${score}`)
 *
 * leaderboard // => ["1. alice: 1250", "2. charlie: 1100", "3. bob: 980"]
 *
 * // Convert back to HashMap if needed
 * HashMap.fromIterable(scoreEntries) // => HashMap.make(["alice", 1250], ["charlie", 1100], ["bob", 980])
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const toEntries = <K, V>(self: HashMap<K, V>): Array<[K, V]> => Array.from(entries(self))

/**
 * Returns the number of entries within the `HashMap`.
 *
 * **Example** (Getting the size)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * const emptyMap = HashMap.empty<string, number>()
 * const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])
 *
 * HashMap.size(emptyMap) // => 0
 * HashMap.size(map) // => 3
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const size: <K, V>(self: HashMap<K, V>) => number = internal.size

/**
 * Creates a transient mutable `HashMap` for efficient batched updates.
 *
 * **Details**
 *
 * Apply updates to the returned map, then call `endMutation` to finish the
 * mutation window and use the result as an immutable `HashMap`.
 *
 * **Example** (Beginning batch mutation)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * const map = HashMap.make(["a", 1])
 *
 * // Begin mutation for efficient batch operations
 * const mutable = HashMap.beginMutation(map)
 *
 * // Multiple operations are now more efficient
 * HashMap.set(mutable, "b", 2)
 * HashMap.set(mutable, "c", 3)
 * HashMap.remove(mutable, "a")
 *
 * // End mutation to get final immutable result
 * HashMap.endMutation(mutable) // => HashMap.make(["b", 2], ["c", 3])
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const beginMutation: <K, V>(self: HashMap<K, V>) => HashMap<K, V> = internal.beginMutation

/**
 * Marks the `HashMap` as immutable, completing the mutation cycle.
 *
 * **Example** (Ending batch mutation)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * // Start with an existing map
 * const original = HashMap.make(["x", 10], ["y", 20])
 *
 * // Begin mutation for batch operations
 * const mutable = HashMap.beginMutation(original)
 *
 * // Perform multiple efficient operations
 * HashMap.set(mutable, "z", 30)
 * HashMap.remove(mutable, "x")
 * HashMap.set(mutable, "w", 40)
 *
 * // End mutation to get final immutable result
 * HashMap.endMutation(mutable) // => HashMap.make(["y", 20], ["z", 30], ["w", 40])
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const endMutation: <K, V>(self: HashMap<K, V>) => HashMap<K, V> = internal.endMutation

/**
 * Runs a batch of updates against a transient mutable copy of the `HashMap`
 * and returns the finalized immutable result.
 *
 * **Details**
 *
 * The callback may call mutation-oriented helpers such as `set` and `remove`
 * on the transient map.
 *
 * **Example** (Applying batched mutations)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * const map1 = HashMap.make(["a", 1])
 * const map2 = HashMap.mutate(map1, (mutable) => {
 *   HashMap.set(mutable, "b", 2)
 *   HashMap.set(mutable, "c", 3)
 * })
 * map2 // => HashMap.make(["a", 1], ["b", 2], ["c", 3])
 * ```
 *
 * @category mutations
 * @since 2.0.0
 */
export const mutate: {
  <K, V>(f: (self: HashMap<K, V>) => void): (self: HashMap<K, V>) => HashMap<K, V>
  <K, V>(self: HashMap<K, V>, f: (self: HashMap<K, V>) => void): HashMap<K, V>
} = internal.mutate

/**
 * Sets or removes the specified key using an update function.
 *
 * **Details**
 *
 * The update function receives `Some(value)` when the key exists or `None`
 * when it does not. Returning `Some(newValue)` stores the value, and returning
 * `None` removes the key or leaves it absent.
 *
 * **Example** (Updating values with Options)
 *
 * ```ts import.meta.vitest
 * import { HashMap, Option } from "effect"
 *
 * const map = HashMap.make(["a", 1], ["b", 2])
 *
 * // Increment existing value or set to 1 if not present
 * const updateFn = (option: Option.Option<number>) =>
 *   Option.isSome(option) ? Option.some(option.value + 1) : Option.some(1)
 *
 * const updated = HashMap.modifyAt(map, "a", updateFn)
 * HashMap.get(updated, "a") // => Option.some(2)
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const modifyAt: {
  <K, V>(key: K, f: HashMap.UpdateFn<V>): (self: HashMap<K, V>) => HashMap<K, V>
  <K, V>(self: HashMap<K, V>, key: K, f: HashMap.UpdateFn<V>): HashMap<K, V>
} = internal.modifyAt

/**
 * Sets or removes the specified key using a precomputed hash and an update
 * function.
 *
 * **Details**
 *
 * The update function receives `Some(value)` when the key exists or `None`
 * when it does not. Returning `Some(newValue)` stores the value, and returning
 * `None` removes the key or leaves it absent.
 *
 * **Example** (Updating values with a hash)
 *
 * ```ts import.meta.vitest
 * import { Hash, HashMap, Option } from "effect"
 *
 * // Useful when working with precomputed hashes for performance
 * const counters = HashMap.make(["downloads", 100], ["views", 250])
 *
 * // Cache hash computation for frequently accessed keys
 * const metricKey = "downloads"
 * const cachedHash = Hash.string(metricKey)
 *
 * // Update function that increments counter or initializes to 1
 * const incrementCounter = (current: Option.Option<number>) =>
 *   Option.isSome(current) ? Option.some(current.value + 1) : Option.some(1)
 *
 * // Use cached hash for efficient updates in loops
 * const updated = HashMap.modifyHash(
 *   counters,
 *   metricKey,
 *   cachedHash,
 *   incrementCounter
 * )
 * HashMap.get(updated, "downloads") // => Option.some(101)
 *
 * // Add new metric with precomputed hash
 * const newMetric = "clicks"
 * const clicksHash = Hash.string(newMetric)
 * const withClicks = HashMap.modifyHash(
 *   updated,
 *   newMetric,
 *   clicksHash,
 *   incrementCounter
 * )
 * HashMap.get(withClicks, "clicks") // => Option.some(1)
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const modifyHash: {
  <K, V>(key: K, hash: number, f: HashMap.UpdateFn<V>): (self: HashMap<K, V>) => HashMap<K, V>
  <K, V>(self: HashMap<K, V>, key: K, hash: number, f: HashMap.UpdateFn<V>): HashMap<K, V>
} = internal.modifyHash

/**
 * Updates the value of the specified key within the `HashMap` if it exists.
 *
 * **Example** (Modifying existing values)
 *
 * ```ts import.meta.vitest
 * import { HashMap, Option } from "effect"
 *
 * const map1 = HashMap.make(["a", 1], ["b", 2])
 * const map2 = HashMap.modify(map1, "a", (value) => value * 3)
 *
 * HashMap.get(map2, "a") // => Option.some(3)
 * HashMap.get(map2, "b") // => Option.some(2)
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const modify: {
  <K, V>(key: K, f: (v: V) => V): (self: HashMap<K, V>) => HashMap<K, V>
  <K, V>(self: HashMap<K, V>, key: K, f: (v: V) => V): HashMap<K, V>
} = internal.modify

/**
 * Combines two `HashMap`s into one.
 *
 * **Details**
 *
 * Entries from `that` are inserted into `self`; when both maps contain an
 * equal key, the value from `that` replaces the value from `self`.
 *
 * **Example** (Combining HashMaps)
 *
 * ```ts import.meta.vitest
 * import { HashMap, Option } from "effect"
 *
 * const map1 = HashMap.make(["a", 1], ["b", 2])
 * const map2 = HashMap.make(["b", 20], ["c", 3])
 * const union = HashMap.union(map1, map2)
 *
 * union // => HashMap.make(["a", 1], ["b", 20], ["c", 3])
 * HashMap.get(union, "b") // => Option.some(20)
 * ```
 *
 * @category combining
 * @since 2.0.0
 */
export const union: {
  <K1, V1>(that: HashMap<K1, V1>): <K0, V0>(self: HashMap<K0, V0>) => HashMap<K1 | K0, V1 | V0>
  <K0, V0, K1, V1>(self: HashMap<K0, V0>, that: HashMap<K1, V1>): HashMap<K0 | K1, V0 | V1>
} = internal.union

/**
 * Removes the entry for the specified key in the `HashMap` using the internal
 * hashing function.
 *
 * **Example** (Removing a key)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * const map1 = HashMap.make(["a", 1], ["b", 2], ["c", 3])
 * const map2 = HashMap.remove(map1, "b")
 *
 * map2 // => HashMap.make(["a", 1], ["c", 3])
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const remove: {
  <K>(key: K): <V>(self: HashMap<K, V>) => HashMap<K, V>
  <K, V>(self: HashMap<K, V>, key: K): HashMap<K, V>
} = internal.remove

/**
 * Removes all entries in the `HashMap` which have the specified keys.
 *
 * **Example** (Removing multiple keys)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * const map1 = HashMap.make(["a", 1], ["b", 2], ["c", 3], ["d", 4])
 * const map2 = HashMap.removeMany(map1, ["b", "d"])
 *
 * map2 // => HashMap.make(["a", 1], ["c", 3])
 * ```
 *
 * @category transforming
 * @since 2.0.0
 */
export const removeMany: {
  <K>(keys: Iterable<K>): <V>(self: HashMap<K, V>) => HashMap<K, V>
  <K, V>(self: HashMap<K, V>, keys: Iterable<K>): HashMap<K, V>
} = internal.removeMany

/**
 * Sets multiple key-value pairs in the `HashMap`.
 *
 * **Example** (Setting multiple entries)
 *
 * ```ts import.meta.vitest
 * import { HashMap, Option } from "effect"
 *
 * const map1 = HashMap.make(["a", 1], ["b", 2])
 * const newEntries = [["c", 3], ["d", 4], ["a", 10]] as const // "a" will be overwritten
 * const map2 = HashMap.setMany(map1, newEntries)
 *
 * map2 // => HashMap.make(["a", 10], ["b", 2], ["c", 3], ["d", 4])
 * HashMap.get(map2, "a") // => Option.some(10)
 * ```
 *
 * @category transforming
 * @since 4.0.0
 */
export const setMany: {
  <K, V>(entries: Iterable<readonly [K, V]>): (self: HashMap<K, V>) => HashMap<K, V>
  <K, V>(self: HashMap<K, V>, entries: Iterable<readonly [K, V]>): HashMap<K, V>
} = internal.setMany

/**
 * Maps over the entries of the `HashMap` using the specified function.
 *
 * **Example** (Mapping values)
 *
 * ```ts import.meta.vitest
 * import { HashMap, Option } from "effect"
 *
 * const map1 = HashMap.make(["a", 1], ["b", 2], ["c", 3])
 * const map2 = HashMap.map(map1, (value, key) => `${key}:${value * 2}`)
 *
 * HashMap.get(map2, "a") // => Option.some("a:2")
 * HashMap.get(map2, "b") // => Option.some("b:4")
 * ```
 *
 * @category mapping
 * @since 2.0.0
 */
export const map: {
  <A, V, K>(f: (value: V, key: K) => A): (self: HashMap<K, V>) => HashMap<K, A>
  <K, V, A>(self: HashMap<K, V>, f: (value: V, key: K) => A): HashMap<K, A>
} = internal.map

/**
 * Maps each entry to a `HashMap` and flattens the results.
 *
 * **Gotchas**
 *
 * The hash and equality behavior of both maps have to be the same.
 *
 * **Example** (Flat mapping values)
 *
 * ```ts import.meta.vitest
 * import { HashMap, Option } from "effect"
 *
 * const map1 = HashMap.make(["a", 1], ["b", 2])
 * const map2 = HashMap.flatMap(
 *   map1,
 *   (value, key) => HashMap.make([key + "1", value], [key + "2", value * 2])
 * )
 *
 * map2 // => HashMap.make(["a1", 1], ["a2", 2], ["b1", 2], ["b2", 4])
 * HashMap.get(map2, "b2") // => Option.some(4)
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const flatMap: {
  <A, K, B>(f: (value: A, key: K) => HashMap<K, B>): (self: HashMap<K, A>) => HashMap<K, B>
  <K, A, B>(self: HashMap<K, A>, f: (value: A, key: K) => HashMap<K, B>): HashMap<K, B>
} = internal.flatMap

/**
 * Applies the specified function to the entries of the `HashMap`.
 *
 * **Example** (Iterating with side effects)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * const map = HashMap.make(["a", 1], ["b", 2])
 * const collected: Array<[string, number]> = []
 *
 * HashMap.forEach(map, (value, key) => {
 *   collected.push([key, value])
 * })
 *
 * collected.sort() // => [["a", 1], ["b", 2]]
 * ```
 *
 * @category traversing
 * @since 2.0.0
 */
export const forEach: {
  <V, K>(f: (value: V, key: K) => void): (self: HashMap<K, V>) => void
  <V, K>(self: HashMap<K, V>, f: (value: V, key: K) => void): void
} = internal.forEach

/**
 * Reduces the specified state over the entries of the `HashMap`.
 *
 * **Example** (Reducing values)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])
 * HashMap.reduce(map, 0, (acc, value) => acc + value) // => 6
 * ```
 *
 * @category folding
 * @since 2.0.0
 */
export const reduce: {
  <Z, V, K>(zero: Z, f: (accumulator: Z, value: V, key: K) => Z): (self: HashMap<K, V>) => Z
  <K, V, Z>(self: HashMap<K, V>, zero: Z, f: (accumulator: Z, value: V, key: K) => Z): Z
} = internal.reduce

/**
 * Filters entries out of a `HashMap` using the specified predicate.
 *
 * **Example** (Filtering entries)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * const map1 = HashMap.make(["a", 1], ["b", 2], ["c", 3], ["d", 4])
 * const map2 = HashMap.filter(map1, (value) => value % 2 === 0)
 *
 * map2 // => HashMap.make(["b", 2], ["d", 4])
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const filter: {
  <K, A>(f: (a: NoInfer<A>, k: K) => boolean): (self: HashMap<K, A>) => HashMap<K, A>
  <K, A>(self: HashMap<K, A>, f: (a: A, k: K) => boolean): HashMap<K, A>
} = internal.filter

/**
 * Filters out `None` values from a `HashMap` of `Options`s.
 *
 * **Example** (Compacting Option values)
 *
 * ```ts import.meta.vitest
 * import { HashMap, Option } from "effect"
 *
 * const map1 = HashMap.make(
 *   ["a", Option.some(1)],
 *   ["b", Option.none()],
 *   ["c", Option.some(3)]
 * )
 * const map2 = HashMap.compact(map1)
 *
 * map2 // => HashMap.make(["a", 1], ["c", 3])
 * HashMap.get(map2, "a") // => Option.some(1)
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const compact: <K, A>(self: HashMap<K, Option<A>>) => HashMap<K, A> = internal.compact

/**
 * Maps over the entries of the `HashMap` using the specified filter and keeps
 * only successful results.
 *
 * **Example** (Filtering and mapping Results)
 *
 * ```ts import.meta.vitest
 * import { HashMap, Option, Result } from "effect"
 *
 * const map1 = HashMap.make(["a", 1], ["b", 2], ["c", 3], ["d", 4])
 * const map2 = HashMap.filterMap(
 *   map1,
 *   (value) => value % 2 === 0 ? Result.succeed(value * 2) : Result.failVoid
 * )
 *
 * map2 // => HashMap.make(["b", 4], ["d", 8])
 * HashMap.get(map2, "b") // => Option.some(4)
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const filterMap: {
  <A, K, B, X>(f: (input: A, key: K) => Result<B, X>): (self: HashMap<K, A>) => HashMap<K, B>
  <K, A, B, X>(self: HashMap<K, A>, f: (input: A, key: K) => Result<B, X>): HashMap<K, B>
} = internal.filterMap

/**
 * Returns the first element that satisfies the specified
 * predicate, or `None` if no such element exists.
 *
 * **Example** (Finding the first matching entry)
 *
 * ```ts import.meta.vitest
 * import { HashMap, Option } from "effect"
 *
 * const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])
 * HashMap.findFirst(map, (value, key) => key === "b" && value > 1) // => Option.some(["b", 2])
 * ```
 *
 * @category searching
 * @since 2.0.0
 */
export const findFirst: {
  <K, A>(predicate: (a: NoInfer<A>, k: K) => boolean): (self: HashMap<K, A>) => Option<[K, A]>
  <K, A>(self: HashMap<K, A>, predicate: (a: A, k: K) => boolean): Option<[K, A]>
} = internal.findFirst

/**
 * Checks whether any entry in a hashmap meets a specific condition.
 *
 * **Example** (Checking for any matching entry)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])
 *
 * HashMap.some(map, (value) => value > 2) // => true
 * HashMap.some(map, (value) => value > 5) // => false
 * ```
 *
 * @category predicates
 * @since 3.13.0
 */
export const some: {
  <K, A>(predicate: (a: NoInfer<A>, k: K) => boolean): (self: HashMap<K, A>) => boolean
  <K, A>(self: HashMap<K, A>, predicate: (a: A, k: K) => boolean): boolean
} = internal.some

/**
 * Checks whether all entries in a hashmap meets a specific condition.
 *
 * **Example** (Checking all entries)
 *
 * ```ts import.meta.vitest
 * import { HashMap } from "effect"
 *
 * const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])
 *
 * HashMap.every(map, (value) => value > 0) // => true
 * HashMap.every(map, (value) => value > 1) // => false
 * ```
 *
 * @category predicates
 * @since 3.14.0
 */
export const every: {
  <K, A>(predicate: (a: NoInfer<A>, k: K) => boolean): (self: HashMap<K, A>) => boolean
  <K, A>(self: HashMap<K, A>, predicate: (a: A, k: K) => boolean): boolean
} = internal.every
