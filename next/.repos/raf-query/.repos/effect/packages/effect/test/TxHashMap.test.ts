import { assert, describe, it } from "@effect/vitest"
import { Effect, Hash, HashMap, Option, Result, TxHashMap } from "effect"

describe("TxHashMap", () => {
  describe("constructors", () => {
    it.effect("empty", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.empty<string, number>()
        const isEmpty = yield* TxHashMap.isEmpty(txMap)
        const size = yield* TxHashMap.size(txMap)

        assert.strictEqual(isEmpty, true)
        assert.strictEqual(size, 0)
      })))

    it.effect("make", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(["a", 1], ["b", 2], ["c", 3])
        const size = yield* TxHashMap.size(txMap)
        const a = yield* TxHashMap.get(txMap, "a")
        const b = yield* TxHashMap.get(txMap, "b")
        const c = yield* TxHashMap.get(txMap, "c")

        assert.strictEqual(size, 3)
        assert.deepStrictEqual(a, Option.some(1))
        assert.deepStrictEqual(b, Option.some(2))
        assert.deepStrictEqual(c, Option.some(3))
      })))

    it.effect("fromIterable", () =>
      Effect.tx(Effect.gen(function*() {
        const entries = [["a", 1], ["b", 2], ["c", 3]] as const
        const txMap = yield* TxHashMap.fromIterable(entries)
        const size = yield* TxHashMap.size(txMap)
        const a = yield* TxHashMap.get(txMap, "a")
        const b = yield* TxHashMap.get(txMap, "b")
        const c = yield* TxHashMap.get(txMap, "c")

        assert.strictEqual(size, 3)
        assert.deepStrictEqual(a, Option.some(1))
        assert.deepStrictEqual(b, Option.some(2))
        assert.deepStrictEqual(c, Option.some(3))
      })))
  })

  describe("basic operations", () => {
    it.effect("get - existing key", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(["a", 1], ["b", 2])
        const a = yield* TxHashMap.get(txMap, "a")
        const b = yield* TxHashMap.get(txMap, "b")

        assert.deepStrictEqual(a, Option.some(1))
        assert.deepStrictEqual(b, Option.some(2))
      })))

    it.effect("get - non-existing key", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(["a", 1], ["b", 2])
        const c = yield* TxHashMap.get(txMap, "c")

        assert.deepStrictEqual(c, Option.none())
      })))

    it.effect("has - existing key", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(["a", 1], ["b", 2])
        const hasA = yield* TxHashMap.has(txMap, "a")
        const hasB = yield* TxHashMap.has(txMap, "b")

        assert.strictEqual(hasA, true)
        assert.strictEqual(hasB, true)
      })))

    it.effect("has - non-existing key", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(["a", 1], ["b", 2])
        const hasC = yield* TxHashMap.has(txMap, "c")

        assert.strictEqual(hasC, false)
      })))

    it.effect("set - new key", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(["a", 1], ["b", 2])
        yield* TxHashMap.set(txMap, "c", 3)

        const size = yield* TxHashMap.size(txMap)
        const c = yield* TxHashMap.get(txMap, "c")

        assert.strictEqual(size, 3)
        assert.deepStrictEqual(c, Option.some(3))
      })))

    it.effect("set - existing key", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(["a", 1], ["b", 2])
        yield* TxHashMap.set(txMap, "a", 10)

        const size = yield* TxHashMap.size(txMap)
        const a = yield* TxHashMap.get(txMap, "a")

        assert.strictEqual(size, 2) // size unchanged
        assert.deepStrictEqual(a, Option.some(10))
      })))

    it.effect("remove - existing key", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(["a", 1], ["b", 2], ["c", 3])
        const removed = yield* TxHashMap.remove(txMap, "b")

        const size = yield* TxHashMap.size(txMap)
        const hasB = yield* TxHashMap.has(txMap, "b")

        assert.strictEqual(removed, true)
        assert.strictEqual(size, 2)
        assert.strictEqual(hasB, false)
      })))

    it.effect("remove - non-existing key", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(["a", 1], ["b", 2])
        const removed = yield* TxHashMap.remove(txMap, "c")

        const size = yield* TxHashMap.size(txMap)

        assert.strictEqual(removed, false)
        assert.strictEqual(size, 2)
      })))

    it.effect("clear", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(["a", 1], ["b", 2], ["c", 3])
        yield* TxHashMap.clear(txMap)

        const size = yield* TxHashMap.size(txMap)
        const isEmpty = yield* TxHashMap.isEmpty(txMap)

        assert.strictEqual(size, 0)
        assert.strictEqual(isEmpty, true)
      })))
  })

  describe("query operations", () => {
    it.effect("size", () =>
      Effect.tx(Effect.gen(function*() {
        const empty = yield* TxHashMap.empty<string, number>()
        const small = yield* TxHashMap.make(["a", 1])
        const large = yield* TxHashMap.make(["a", 1], ["b", 2], ["c", 3], ["d", 4])

        assert.strictEqual(yield* TxHashMap.size(empty), 0)
        assert.strictEqual(yield* TxHashMap.size(small), 1)
        assert.strictEqual(yield* TxHashMap.size(large), 4)
      })))

    it.effect("isEmpty", () =>
      Effect.tx(Effect.gen(function*() {
        const empty = yield* TxHashMap.empty<string, number>()
        const nonEmpty = yield* TxHashMap.make(["a", 1])

        assert.strictEqual(yield* TxHashMap.isEmpty(empty), true)
        assert.strictEqual(yield* TxHashMap.isEmpty(nonEmpty), false)
      })))

    it.effect("isNonEmpty", () =>
      Effect.tx(Effect.gen(function*() {
        const empty = yield* TxHashMap.empty<string, number>()
        const nonEmpty = yield* TxHashMap.make(["a", 1])

        assert.strictEqual(yield* TxHashMap.isNonEmpty(empty), false)
        assert.strictEqual(yield* TxHashMap.isNonEmpty(nonEmpty), true)
      })))
  })

  describe("advanced operations", () => {
    it.effect("modify - existing key", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(["counter", 5])
        const oldValue = yield* TxHashMap.modify(txMap, "counter", (n) => n * 2)
        const newValue = yield* TxHashMap.get(txMap, "counter")

        assert.deepStrictEqual(oldValue, Option.some(5))
        assert.deepStrictEqual(newValue, Option.some(10))
      })))

    it.effect("modify - non-existing key", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.empty<string, number>()
        const oldValue = yield* TxHashMap.modify(txMap, "counter", (n) => n * 2)
        const size = yield* TxHashMap.size(txMap)

        assert.deepStrictEqual(oldValue, Option.none())
        assert.strictEqual(size, 0)
      })))

    it.effect("modifyAt - insert new value", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(["a", 1])
        yield* TxHashMap.modifyAt(txMap, "b", () => Option.some(2))

        const size = yield* TxHashMap.size(txMap)
        const b = yield* TxHashMap.get(txMap, "b")

        assert.strictEqual(size, 2)
        assert.deepStrictEqual(b, Option.some(2))
      })))

    it.effect("modifyAt - remove existing value", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(["a", 1], ["b", 2])
        yield* TxHashMap.modifyAt(txMap, "a", () => Option.none())

        const size = yield* TxHashMap.size(txMap)
        const hasA = yield* TxHashMap.has(txMap, "a")

        assert.strictEqual(size, 1)
        assert.strictEqual(hasA, false)
      })))

    it.effect("keys", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(["a", 1], ["b", 2], ["c", 3])
        const keys = yield* TxHashMap.keys(txMap)

        assert.deepStrictEqual(keys.sort(), ["a", "b", "c"])
      })))

    it.effect("values", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(["a", 1], ["b", 2], ["c", 3])
        const values = yield* TxHashMap.values(txMap)

        assert.deepStrictEqual(values.sort(), [1, 2, 3])
      })))

    it.effect("entries", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(["a", 1], ["b", 2])
        const entries = yield* TxHashMap.entries(txMap)

        assert.deepStrictEqual(entries.sort(), [["a", 1], ["b", 2]])
      })))

    it.effect("snapshot", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(["a", 1], ["b", 2])
        const snapshot = yield* TxHashMap.snapshot(txMap)

        // Modify the TxHashMap after taking snapshot
        yield* TxHashMap.set(txMap, "c", 3)

        // Snapshot should be unchanged
        assert.strictEqual(HashMap.size(snapshot), 2)
        assert.deepStrictEqual(HashMap.get(snapshot, "a"), Option.some(1))
        assert.deepStrictEqual(HashMap.get(snapshot, "b"), Option.some(2))
        assert.deepStrictEqual(HashMap.get(snapshot, "c"), Option.none())

        // Original should be modified
        assert.strictEqual(yield* TxHashMap.size(txMap), 3)
      })))
  })

  describe("bulk operations", () => {
    it.effect("union", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(["a", 1], ["b", 2])
        const other = HashMap.make(["b", 20], ["c", 3]) // "b" should be overwritten

        yield* TxHashMap.union(txMap, other)

        const size = yield* TxHashMap.size(txMap)
        const a = yield* TxHashMap.get(txMap, "a")
        const b = yield* TxHashMap.get(txMap, "b")
        const c = yield* TxHashMap.get(txMap, "c")

        assert.strictEqual(size, 3)
        assert.deepStrictEqual(a, Option.some(1))
        assert.deepStrictEqual(b, Option.some(20)) // overwritten
        assert.deepStrictEqual(c, Option.some(3))
      })))

    it.effect("removeMany", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(["a", 1], ["b", 2], ["c", 3], ["d", 4])
        yield* TxHashMap.removeMany(txMap, ["b", "d"])

        const size = yield* TxHashMap.size(txMap)
        const hasA = yield* TxHashMap.has(txMap, "a")
        const hasB = yield* TxHashMap.has(txMap, "b")
        const hasC = yield* TxHashMap.has(txMap, "c")
        const hasD = yield* TxHashMap.has(txMap, "d")

        assert.strictEqual(size, 2)
        assert.strictEqual(hasA, true)
        assert.strictEqual(hasB, false)
        assert.strictEqual(hasC, true)
        assert.strictEqual(hasD, false)
      })))

    it.effect("setMany", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(["a", 1], ["b", 2])
        const newEntries = [["c", 3], ["d", 4], ["a", 10]] as const // "a" should be overwritten

        yield* TxHashMap.setMany(txMap, newEntries)

        const size = yield* TxHashMap.size(txMap)
        const a = yield* TxHashMap.get(txMap, "a")
        const b = yield* TxHashMap.get(txMap, "b")
        const c = yield* TxHashMap.get(txMap, "c")
        const d = yield* TxHashMap.get(txMap, "d")

        assert.strictEqual(size, 4)
        assert.deepStrictEqual(a, Option.some(10)) // overwritten
        assert.deepStrictEqual(b, Option.some(2)) // preserved
        assert.deepStrictEqual(c, Option.some(3)) // new
        assert.deepStrictEqual(d, Option.some(4)) // new
      })))
  })

  describe("transactional semantics", () => {
    it.effect("single operations are automatically transactional", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(["counter", 0])

        // These operations should be individually atomic
        yield* TxHashMap.set(txMap, "counter", 1)
        yield* TxHashMap.modify(txMap, "counter", (n) => n + 1)

        const result = yield* TxHashMap.get(txMap, "counter")
        assert.deepStrictEqual(result, Option.some(2))
      })))

    it.effect("multi-step operations commit together", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(["a", 1], ["b", 2])

        // Multi-step operations
        const currentA = yield* TxHashMap.get(txMap, "a")
        if (Option.isSome(currentA)) {
          yield* TxHashMap.set(txMap, "a", currentA.value * 10)
          yield* TxHashMap.remove(txMap, "b")
          yield* TxHashMap.set(txMap, "c", 3)
        }

        const a = yield* TxHashMap.get(txMap, "a")
        const hasB = yield* TxHashMap.has(txMap, "b")
        const c = yield* TxHashMap.get(txMap, "c")
        const size = yield* TxHashMap.size(txMap)

        assert.deepStrictEqual(a, Option.some(10))
        assert.strictEqual(hasB, false)
        assert.deepStrictEqual(c, Option.some(3))
        assert.strictEqual(size, 2)
      })))
  })

  describe("pipe syntax", () => {
    it.effect("supports data-last operations", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.empty<string, number>()

        // Test data-last pipe operations
        yield* Effect.flatMap(TxHashMap.set(txMap, "a", 1), () => Effect.void)
        yield* Effect.flatMap(TxHashMap.set(txMap, "b", 2), () => Effect.void)

        const result = yield* TxHashMap.get(txMap, "a")
        const size = yield* TxHashMap.size(txMap)

        assert.deepStrictEqual(result, Option.some(1))
        assert.strictEqual(size, 2)
      })))
  })

  describe("Phase 1: Essential Functions", () => {
    it.effect("isTxHashMap should correctly identify TxHashMap instances", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(["key", "value"])

        // Positive cases
        assert.strictEqual(TxHashMap.isTxHashMap(txMap), true)

        // Negative cases
        assert.strictEqual(TxHashMap.isTxHashMap({}), false)
        assert.strictEqual(TxHashMap.isTxHashMap(null), false)
        assert.strictEqual(TxHashMap.isTxHashMap(undefined), false)
        assert.strictEqual(TxHashMap.isTxHashMap("string"), false)
        assert.strictEqual(TxHashMap.isTxHashMap(42), false)
        assert.strictEqual(TxHashMap.isTxHashMap([]), false)
        assert.strictEqual(TxHashMap.isTxHashMap(new Map()), false)
      })))

    it.effect("getHash should lookup values using custom hash", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(
          ["user123", { name: "Alice", role: "admin" }],
          ["user456", { name: "Bob", role: "user" }]
        )

        const userId = "user123"
        const hash = Hash.string(userId)

        // Test data-first
        const user1 = yield* TxHashMap.getHash(txMap, userId, hash)
        assert.deepStrictEqual(user1, Option.some({ name: "Alice", role: "admin" }))

        // Test data-last
        const user2 = yield* txMap.pipe(TxHashMap.getHash(userId, hash))
        assert.deepStrictEqual(user2, Option.some({ name: "Alice", role: "admin" }))

        // Test non-existent key
        const notFound = yield* TxHashMap.getHash(txMap, "user999", Hash.string("user999"))
        assert.deepStrictEqual(notFound, Option.none())

        // Test with wrong hash (may not find the value due to hash mismatch)
        const wrongHash = yield* TxHashMap.getHash(txMap, userId, Hash.string("different"))
        assert.deepStrictEqual(wrongHash, Option.none())
      })))

    it.effect("hasHash should check existence using custom hash", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(
          ["admin", { read: true, write: true }],
          ["user", { read: true, write: false }]
        )

        const role = "admin"
        const hash = Hash.string(role)

        // Test data-first
        const hasAdmin1 = yield* TxHashMap.hasHash(txMap, role, hash)
        assert.strictEqual(hasAdmin1, true)

        // Test data-last
        const hasAdmin2 = yield* txMap.pipe(TxHashMap.hasHash(role, hash))
        assert.strictEqual(hasAdmin2, true)

        // Test non-existent key
        const hasGuest = yield* TxHashMap.hasHash(txMap, "guest", Hash.string("guest"))
        assert.strictEqual(hasGuest, false)

        // Test with empty map
        const emptyMap = yield* TxHashMap.empty<string, { read: boolean }>()
        const hasInEmpty = yield* TxHashMap.hasHash(emptyMap, "admin", hash)
        assert.strictEqual(hasInEmpty, false)
      })))

    it.effect("getHash and hasHash should work together", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(
          ["session_abc", { userId: "user1", active: true }],
          ["session_def", { userId: "user2", active: false }]
        )

        const sessionId = "session_abc"
        const hash = Hash.string(sessionId)

        // Check existence first
        const exists = yield* TxHashMap.hasHash(txMap, sessionId, hash)
        assert.strictEqual(exists, true)

        // Then get the value
        const session = yield* TxHashMap.getHash(txMap, sessionId, hash)
        assert.deepStrictEqual(session, Option.some({ userId: "user1", active: true }))

        // Test non-existent session
        const invalidSessionId = "session_xyz"
        const invalidHash = Hash.string(invalidSessionId)

        const invalidExists = yield* TxHashMap.hasHash(txMap, invalidSessionId, invalidHash)
        assert.strictEqual(invalidExists, false)

        const invalidSession = yield* TxHashMap.getHash(txMap, invalidSessionId, invalidHash)
        assert.deepStrictEqual(invalidSession, Option.none())
      })))

    it.effect("hash functions should work correctly", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(["key1", "value1"])
        const hash = Hash.string("key2")

        // Add a new key-value pair
        yield* TxHashMap.set(txMap, "key2", "value2")

        // Check with hash functions
        const exists = yield* TxHashMap.hasHash(txMap, "key2", hash)
        assert.strictEqual(exists, true)

        const value = yield* TxHashMap.getHash(txMap, "key2", hash)
        assert.deepStrictEqual(value, Option.some("value2"))

        // Verify changes persisted after transaction
        const finalExists = yield* TxHashMap.hasHash(txMap, "key2", hash)
        assert.strictEqual(finalExists, true)
      })))
  })

  describe("Phase 2: Functional Programming Operations", () => {
    it.effect("map should transform values while preserving keys", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(
          ["user1", { name: "Alice", age: 25 }],
          ["user2", { name: "Bob", age: 30 }],
          ["user3", { name: "Charlie", age: 35 }]
        )

        // Test data-first: extract names
        const nameMap = yield* TxHashMap.map(txMap, (user) => user.name)

        const alice = yield* TxHashMap.get(nameMap, "user1")
        const bob = yield* TxHashMap.get(nameMap, "user2")
        const charlie = yield* TxHashMap.get(nameMap, "user3")

        assert.deepStrictEqual(alice, Option.some("Alice"))
        assert.deepStrictEqual(bob, Option.some("Bob"))
        assert.deepStrictEqual(charlie, Option.some("Charlie"))

        // Test data-last: increment ages
        const ageMap = yield* txMap.pipe(TxHashMap.map((user, key) => ({ ...user, age: user.age + 1, key })))

        const updatedAlice = yield* TxHashMap.get(ageMap, "user1")
        assert.deepStrictEqual(updatedAlice, Option.some({ name: "Alice", age: 26, key: "user1" }))
      })))

    it.effect("filter should keep only matching entries", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(
          ["apple", { price: 1.50, category: "fruit" }],
          ["carrot", { price: 0.80, category: "vegetable" }],
          ["banana", { price: 2.00, category: "fruit" }],
          ["lettuce", { price: 1.20, category: "vegetable" }]
        )

        // Test data-first: filter fruits
        const fruitMap = yield* TxHashMap.filter(txMap, (item) => item.category === "fruit")

        const size = yield* TxHashMap.size(fruitMap)
        const hasApple = yield* TxHashMap.has(fruitMap, "apple")
        const hasBanana = yield* TxHashMap.has(fruitMap, "banana")
        const hasCarrot = yield* TxHashMap.has(fruitMap, "carrot")

        assert.strictEqual(size, 2)
        assert.strictEqual(hasApple, true)
        assert.strictEqual(hasBanana, true)
        assert.strictEqual(hasCarrot, false)

        // Test data-last: filter expensive items
        const expensiveMap = yield* txMap.pipe(TxHashMap.filter((item) => item.price > 1.50))
        const expensiveSize = yield* TxHashMap.size(expensiveMap)
        assert.strictEqual(expensiveSize, 1) // only banana
      })))

    it.effect("reduce should fold over all entries", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(
          ["item1", 10],
          ["item2", 20],
          ["item3", 30]
        )

        // Test data-first: sum all values
        const sum = yield* TxHashMap.reduce(txMap, 0, (acc, value) => acc + value)
        assert.strictEqual(sum, 60)

        // Test data-last: count entries with key info
        const info = yield* txMap.pipe(
          TxHashMap.reduce({ count: 0, keys: [] as Array<string> }, (acc, _, key) => ({
            count: acc.count + 1,
            keys: [...acc.keys, key]
          }))
        )

        assert.strictEqual(info.count, 3)
        assert.deepStrictEqual(info.keys.sort(), ["item1", "item2", "item3"])

        // Test with empty map
        const emptyMap = yield* TxHashMap.empty<string, number>()
        const emptySum = yield* TxHashMap.reduce(emptyMap, 0, (acc, value) => acc + value)
        assert.strictEqual(emptySum, 0)
      })))

    it.effect("filterMap should filter and transform in one operation", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(
          ["valid1", "10"],
          ["invalid", "not-a-number"],
          ["valid2", "20"],
          ["empty", ""],
          ["valid3", "30"]
        )

        // Test data-first: parse numbers, filter out invalid ones
        const numberMap = yield* TxHashMap.filterMap(txMap, (value) => {
          const num = parseInt(value, 10)
          return isNaN(num) ? Result.failVoid : Result.succeed(num)
        })

        const size = yield* TxHashMap.size(numberMap)
        const val1 = yield* TxHashMap.get(numberMap, "valid1")
        const val2 = yield* TxHashMap.get(numberMap, "valid2")
        const val3 = yield* TxHashMap.get(numberMap, "valid3")
        const invalid = yield* TxHashMap.get(numberMap, "invalid")

        assert.strictEqual(size, 3)
        assert.deepStrictEqual(val1, Option.some(10))
        assert.deepStrictEqual(val2, Option.some(20))
        assert.deepStrictEqual(val3, Option.some(30))
        assert.deepStrictEqual(invalid, Option.none())

        // Test data-last: extract emails from user objects
        const userMap = yield* TxHashMap.make(
          ["user1", { name: "Alice", email: "alice@example.com" }],
          ["user2", { name: "Bob" }], // no email
          ["user3", { name: "Charlie", email: "charlie@example.com" }]
        )

        const emailMap = yield* userMap.pipe(
          TxHashMap.filterMap(
            (user, key) => "email" in user ? Result.succeed(`${key}:${user.email}`) : Result.failVoid
          )
        )

        const emailSize = yield* TxHashMap.size(emailMap)
        const user1Email = yield* TxHashMap.get(emailMap, "user1")
        const user2Email = yield* TxHashMap.get(emailMap, "user2")
        const user3Email = yield* TxHashMap.get(emailMap, "user3")

        assert.strictEqual(emailSize, 2)
        assert.deepStrictEqual(user1Email, Option.some("user1:alice@example.com"))
        assert.deepStrictEqual(user2Email, Option.none())
        assert.deepStrictEqual(user3Email, Option.some("user3:charlie@example.com"))
      })))

    it.effect("hasBy should check if any entry matches predicate", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(
          ["admin", { role: "admin", active: true }],
          ["user1", { role: "user", active: true }],
          ["user2", { role: "user", active: false }]
        )

        // Test data-first: check for admin users
        const hasAdmin = yield* TxHashMap.hasBy(txMap, (user) => user.role === "admin")
        assert.strictEqual(hasAdmin, true)

        const hasGuest = yield* TxHashMap.hasBy(txMap, (user) => user.role === "guest")
        assert.strictEqual(hasGuest, false)

        // Test data-last: check for inactive users
        const hasInactive = yield* txMap.pipe(TxHashMap.hasBy((user) => !user.active))
        assert.strictEqual(hasInactive, true)

        // Test with empty map
        const emptyMap = yield* TxHashMap.empty<string, { role: string }>()
        const hasAny = yield* TxHashMap.hasBy(emptyMap, () => true)
        assert.strictEqual(hasAny, false)
      })))

    it.effect("findFirst should return first matching entry", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(
          ["session1", { userId: "user1", loginTime: "09:00" }],
          ["session2", { userId: "user2", loginTime: "10:00" }],
          ["session3", { userId: "user1", loginTime: "11:00" }]
        )

        // Test data-first: find user1's first session
        const user1Session = yield* TxHashMap.findFirst(txMap, (session) => session.userId === "user1")
        assert.deepStrictEqual(
          user1Session,
          Option.some<[string, { userId: string; loginTime: string }]>([
            "session3",
            { userId: "user1", loginTime: "11:00" }
          ])
        )

        // Test data-last: find session not belonging to user1 or user2
        const otherSession = yield* txMap.pipe(
          TxHashMap.findFirst((session) => session.userId !== "user1" && session.userId !== "user2")
        )
        assert.deepStrictEqual(otherSession, Option.none())

        // Test with empty map
        const emptyMap = yield* TxHashMap.empty<string, { userId: string }>()
        const notFound = yield* TxHashMap.findFirst(emptyMap, () => true)
        assert.deepStrictEqual(notFound, Option.none())
      })))

    it.effect("some should check if any entry matches predicate", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(
          ["order1", { status: "pending", amount: 100 }],
          ["order2", { status: "completed", amount: 250 }],
          ["order3", { status: "pending", amount: 50 }]
        )

        // Test data-first: check if any order is completed
        const hasCompleted = yield* TxHashMap.some(txMap, (order) => order.status === "completed")
        assert.strictEqual(hasCompleted, true)

        const hasCancelled = yield* TxHashMap.some(txMap, (order) => order.status === "cancelled")
        assert.strictEqual(hasCancelled, false)

        // Test data-last: check if any order exceeds amount
        const hasLargeOrder = yield* txMap.pipe(TxHashMap.some((order) => order.amount > 200))
        assert.strictEqual(hasLargeOrder, true)

        const hasVeryLargeOrder = yield* txMap.pipe(TxHashMap.some((order) => order.amount > 1000))
        assert.strictEqual(hasVeryLargeOrder, false)

        // Test with empty map
        const emptyMap = yield* TxHashMap.empty<string, { status: string }>()
        const emptyResult = yield* TxHashMap.some(emptyMap, () => true)
        assert.strictEqual(emptyResult, false)
      })))

    it.effect("every should check if all entries match predicate", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(
          ["task1", { completed: true, priority: "high" }],
          ["task2", { completed: true, priority: "medium" }],
          ["task3", { completed: true, priority: "low" }]
        )

        // Test data-first: check if all tasks are completed
        const allCompleted = yield* TxHashMap.every(txMap, (task) => task.completed)
        assert.strictEqual(allCompleted, true)

        const allHighPriority = yield* TxHashMap.every(txMap, (task) => task.priority === "high")
        assert.strictEqual(allHighPriority, false)

        // Add an incomplete task
        yield* TxHashMap.set(txMap, "task4", { completed: false, priority: "high" })

        // Test data-last: now not all tasks are completed
        const stillAllCompleted = yield* txMap.pipe(TxHashMap.every((task) => task.completed))
        assert.strictEqual(stillAllCompleted, false)

        // Test that all tasks have a priority
        const allHavePriority = yield* txMap.pipe(TxHashMap.every((task) => Boolean(task.priority)))
        assert.strictEqual(allHavePriority, true)

        // Test with empty map (vacuous truth)
        const emptyMap = yield* TxHashMap.empty<string, { completed: boolean }>()
        const emptyResult = yield* TxHashMap.every(emptyMap, () => false)
        assert.strictEqual(emptyResult, true) // empty set satisfies all predicates
      })))

    it.effect("functional operations should work correctly", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(
          ["item1", { price: 10, discount: 0 }],
          ["item2", { price: 20, discount: 0 }],
          ["item3", { price: 30, discount: 0 }]
        )

        // Apply bulk discount
        const discountedMap = yield* TxHashMap.map(txMap, (item) => ({
          ...item,
          discount: 0.1,
          discountedPrice: item.price * 0.9
        }))

        // Filter expensive items
        const expensiveItems = yield* TxHashMap.filter(discountedMap, (item) => item.price > 15)

        // Calculate total savings
        const totalSavings = yield* TxHashMap.reduce(
          expensiveItems,
          0,
          (acc, item) => acc + (item.price - item.discountedPrice)
        )

        // Verify operations worked correctly
        const expensiveSize = yield* TxHashMap.size(expensiveItems)
        assert.strictEqual(expensiveSize, 2) // item2 and item3

        assert.strictEqual(totalSavings, 5) // (20 + 30) * 0.1 = 5

        // Check that all expensive items have discount
        const allDiscounted = yield* TxHashMap.every(expensiveItems, (item) => item.discount > 0)
        assert.strictEqual(allDiscounted, true)
      })))
  })

  describe("Phase 3: Specialized Operations", () => {
    it.effect("forEach should execute side effects for each entry", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(
          ["user1", { name: "Alice", status: "active" }],
          ["user2", { name: "Bob", status: "inactive" }],
          ["user3", { name: "Charlie", status: "active" }]
        )

        // Collect side effects
        const processed: Array<{ user: string; name: string; status: string }> = []

        // Test data-first: process all users
        yield* TxHashMap.forEach(txMap, (userData, userId) =>
          Effect.sync(() => {
            processed.push({ user: userId, name: userData.name, status: userData.status })
          }))

        assert.strictEqual(processed.length, 3)
        assert.strictEqual(processed.filter((p) => p.status === "active").length, 2)

        // Test data-last: process only active users
        const activeUsers: Array<string> = []
        yield* txMap.pipe(
          TxHashMap.forEach((userData, userId) =>
            userData.status === "active"
              ? Effect.sync(() => activeUsers.push(userId))
              : Effect.void
          )
        )

        assert.strictEqual(activeUsers.length, 2)
        assert.deepStrictEqual(activeUsers.sort(), ["user1", "user3"])
      })))

    it.effect("flatMap should transform and flatten TxHashMaps", () =>
      Effect.tx(Effect.gen(function*() {
        const departments = yield* TxHashMap.make(
          ["eng", ["alice", "bob"]],
          ["sales", ["charlie"]]
        )

        // Transform departments into individual employee records
        const employees = yield* TxHashMap.flatMap(
          departments,
          (members, dept) =>
            Effect.gen(function*() {
              const empMap = yield* TxHashMap.empty<string, { department: string; role: string }>()
              for (let i = 0; i < members.length; i++) {
                const member = members[i]
                const role = i === 0 ? "lead" : "member"
                yield* TxHashMap.set(empMap, member, { department: dept, role })
              }
              return empMap
            })
        )

        const size = yield* TxHashMap.size(employees)
        assert.strictEqual(size, 3)

        const alice = yield* TxHashMap.get(employees, "alice")
        assert.deepStrictEqual(alice, Option.some({ department: "eng", role: "lead" }))

        const bob = yield* TxHashMap.get(employees, "bob")
        assert.deepStrictEqual(bob, Option.some({ department: "eng", role: "member" }))

        const charlie = yield* TxHashMap.get(employees, "charlie")
        assert.deepStrictEqual(charlie, Option.some({ department: "sales", role: "lead" }))
      })))

    it.effect("compact should remove None values and unwrap Some values", () =>
      Effect.tx(Effect.gen(function*() {
        const optionalData = yield* TxHashMap.make<string, Option.Option<{ value: number }>>(
          ["valid1", Option.some({ value: 10 })],
          ["invalid1", Option.none()],
          ["valid2", Option.some({ value: 20 })],
          ["invalid2", Option.none()],
          ["valid3", Option.some({ value: 30 })]
        )

        // Compact to remove None values
        const compacted = yield* TxHashMap.compact(optionalData)

        const size = yield* TxHashMap.size(compacted)
        assert.strictEqual(size, 3)

        const valid1 = yield* TxHashMap.get(compacted, "valid1")
        assert.deepStrictEqual(valid1, Option.some({ value: 10 }))

        const valid2 = yield* TxHashMap.get(compacted, "valid2")
        assert.deepStrictEqual(valid2, Option.some({ value: 20 }))

        const valid3 = yield* TxHashMap.get(compacted, "valid3")
        assert.deepStrictEqual(valid3, Option.some({ value: 30 }))

        const invalid1 = yield* TxHashMap.get(compacted, "invalid1")
        assert.deepStrictEqual(invalid1, Option.none())

        const invalid2 = yield* TxHashMap.get(compacted, "invalid2")
        assert.deepStrictEqual(invalid2, Option.none())
      })))

    it.effect("toEntries should return all entries as array", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(
          ["a", 1],
          ["b", 2],
          ["c", 3]
        )

        const entriesArray = yield* TxHashMap.toEntries(txMap)
        assert.strictEqual(entriesArray.length, 3)

        // Sort for consistent comparison
        const sortedEntries = entriesArray.sort(([a], [b]) => a.localeCompare(b))
        assert.deepStrictEqual(sortedEntries, [["a", 1], ["b", 2], ["c", 3]])

        // Verify it's the same as regular entries
        const regularEntries = yield* TxHashMap.entries(txMap)
        const sortedRegular = regularEntries.sort(([a], [b]) => a.localeCompare(b))
        assert.deepStrictEqual(sortedEntries, sortedRegular)
      })))

    it.effect("toValues should return all values as array", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make(
          ["x", { price: 100 }],
          ["y", { price: 200 }],
          ["z", { price: 300 }]
        )

        const valuesArray = yield* TxHashMap.toValues(txMap)
        assert.strictEqual(valuesArray.length, 3)

        // Sort for consistent comparison
        const sortedValues = valuesArray.sort((a, b) => a.price - b.price)
        assert.deepStrictEqual(sortedValues, [{ price: 100 }, { price: 200 }, { price: 300 }])

        // Verify it's the same as regular values
        const regularValues = yield* TxHashMap.values(txMap)
        const sortedRegular = regularValues.sort((a, b) => a.price - b.price)
        assert.deepStrictEqual(sortedValues, sortedRegular)
      })))

    it.effect("specialized operations should work correctly", () =>
      Effect.tx(Effect.gen(function*() {
        const txMap = yield* TxHashMap.make<string, Option.Option<number>>(
          ["a", Option.some(1)],
          ["b", Option.none()],
          ["c", Option.some(3)]
        )

        // Add more data
        yield* TxHashMap.set(txMap, "d", Option.some(4))
        yield* TxHashMap.set(txMap, "e", Option.none())

        // Compact the map
        const compacted = yield* TxHashMap.compact(txMap)
        const compactedSize = yield* TxHashMap.size(compacted)
        assert.strictEqual(compactedSize, 3) // a, c, d

        // Use forEach for side effects
        const sum = { value: 0 }
        yield* TxHashMap.forEach(compacted, (value) =>
          Effect.sync(() => {
            sum.value += value
          }))
        assert.strictEqual(sum.value, 8) // 1 + 3 + 4

        // Test toValues and toEntries
        const values = yield* TxHashMap.toValues(compacted)
        const entries = yield* TxHashMap.toEntries(compacted)

        assert.strictEqual(values.length, 3)
        assert.strictEqual(entries.length, 3)
      })))
  })
})
