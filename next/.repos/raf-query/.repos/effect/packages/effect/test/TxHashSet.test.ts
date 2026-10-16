import { assert, describe, it } from "@effect/vitest"
import { Effect, Equal, Hash, HashSet, TxHashSet } from "effect"

class TestValue implements Equal.Equal {
  constructor(readonly value: string) {}

  [Equal.symbol](other: unknown): boolean {
    return other instanceof TestValue && this.value === other.value
  }

  [Hash.symbol](): number {
    return Hash.string(this.value)
  }

  toString(): string {
    return `TestValue(${this.value})`
  }
}

describe("TxHashSet", () => {
  describe("constructors", () => {
    it.effect("empty creates an empty TxHashSet", () =>
      Effect.tx(Effect.gen(function*() {
        const txSet = yield* TxHashSet.empty<string>()
        const size = yield* TxHashSet.size(txSet)
        const isEmpty = yield* TxHashSet.isEmpty(txSet)

        assert.strictEqual(size, 0)
        assert.strictEqual(isEmpty, true)
      })))

    it.effect("make creates TxHashSet from values", () =>
      Effect.tx(Effect.gen(function*() {
        const txSet = yield* TxHashSet.make("a", "b", "c")
        const size = yield* TxHashSet.size(txSet)

        assert.strictEqual(size, 3)
        assert.strictEqual(yield* TxHashSet.has(txSet, "a"), true)
        assert.strictEqual(yield* TxHashSet.has(txSet, "b"), true)
        assert.strictEqual(yield* TxHashSet.has(txSet, "c"), true)
        assert.strictEqual(yield* TxHashSet.has(txSet, "d"), false)
      })))

    it.effect("make removes duplicates", () =>
      Effect.tx(Effect.gen(function*() {
        const txSet = yield* TxHashSet.make("a", "b", "a", "c", "b")
        const size = yield* TxHashSet.size(txSet)

        assert.strictEqual(size, 3)
      })))

    it.effect("fromIterable creates TxHashSet from iterable", () =>
      Effect.tx(Effect.gen(function*() {
        const txSet = yield* TxHashSet.fromIterable(["x", "y", "z", "x", "y"])
        const size = yield* TxHashSet.size(txSet)

        assert.strictEqual(size, 3)
        assert.strictEqual(yield* TxHashSet.has(txSet, "x"), true)
        assert.strictEqual(yield* TxHashSet.has(txSet, "y"), true)
        assert.strictEqual(yield* TxHashSet.has(txSet, "z"), true)
      })))

    it.effect("fromHashSet creates TxHashSet from HashSet", () =>
      Effect.tx(Effect.gen(function*() {
        const hashSet = HashSet.make("foo", "bar", "baz")
        const txSet = yield* TxHashSet.fromHashSet(hashSet)
        const size = yield* TxHashSet.size(txSet)

        assert.strictEqual(size, 3)
        assert.strictEqual(yield* TxHashSet.has(txSet, "foo"), true)
        assert.strictEqual(yield* TxHashSet.has(txSet, "bar"), true)
        assert.strictEqual(yield* TxHashSet.has(txSet, "baz"), true)
      })))
  })

  describe("type guards", () => {
    it.effect("isTxHashSet identifies TxHashSet instances", () =>
      Effect.tx(Effect.gen(function*() {
        const txSet = yield* TxHashSet.make(1, 2, 3)
        const hashSet = HashSet.make(1, 2, 3)
        const array = [1, 2, 3]

        assert.strictEqual(TxHashSet.isTxHashSet(txSet), true)
        assert.strictEqual(TxHashSet.isTxHashSet(hashSet), false)
        assert.strictEqual(TxHashSet.isTxHashSet(array), false)
        assert.strictEqual(TxHashSet.isTxHashSet(null), false)
        assert.strictEqual(TxHashSet.isTxHashSet(undefined), false)
      })))
  })

  describe("basic operations", () => {
    it.effect("add adds values to TxHashSet", () =>
      Effect.tx(Effect.gen(function*() {
        const txSet = yield* TxHashSet.make("a", "b")

        yield* TxHashSet.add(txSet, "c")
        assert.strictEqual(yield* TxHashSet.size(txSet), 3)
        assert.strictEqual(yield* TxHashSet.has(txSet, "c"), true)

        // Adding existing value has no effect
        yield* TxHashSet.add(txSet, "a")
        assert.strictEqual(yield* TxHashSet.size(txSet), 3)
      })))

    it.effect("remove removes values from TxHashSet", () =>
      Effect.tx(Effect.gen(function*() {
        const txSet = yield* TxHashSet.make("a", "b", "c")

        const removed = yield* TxHashSet.remove(txSet, "b")
        assert.strictEqual(removed, true)
        assert.strictEqual(yield* TxHashSet.size(txSet), 2)
        assert.strictEqual(yield* TxHashSet.has(txSet, "b"), false)

        // Removing non-existent value returns false
        const notRemoved = yield* TxHashSet.remove(txSet, "d")
        assert.strictEqual(notRemoved, false)
        assert.strictEqual(yield* TxHashSet.size(txSet), 2)
      })))

    it.effect("has checks for value existence", () =>
      Effect.tx(Effect.gen(function*() {
        const txSet = yield* TxHashSet.make("apple", "banana", "cherry")

        assert.strictEqual(yield* TxHashSet.has(txSet, "apple"), true)
        assert.strictEqual(yield* TxHashSet.has(txSet, "grape"), false)
      })))

    it.effect("size returns correct count", () =>
      Effect.tx(Effect.gen(function*() {
        const empty = yield* TxHashSet.empty<string>()
        assert.strictEqual(yield* TxHashSet.size(empty), 0)

        const small = yield* TxHashSet.make("a", "b")
        assert.strictEqual(yield* TxHashSet.size(small), 2)

        const fromIterable = yield* TxHashSet.fromIterable(["x", "y", "z", "x", "y"])
        assert.strictEqual(yield* TxHashSet.size(fromIterable), 3)
      })))

    it.effect("isEmpty and isNonEmpty check the set", () =>
      Effect.tx(Effect.gen(function*() {
        const empty = yield* TxHashSet.empty<string>()
        assert.strictEqual(yield* TxHashSet.isEmpty(empty), true)
        assert.strictEqual(yield* TxHashSet.isNonEmpty(empty), false)

        const nonEmpty = yield* TxHashSet.make("a")
        assert.strictEqual(yield* TxHashSet.isEmpty(nonEmpty), false)
        assert.strictEqual(yield* TxHashSet.isNonEmpty(nonEmpty), true)
      })))

    it.effect("clear removes all values", () =>
      Effect.tx(Effect.gen(function*() {
        const txSet = yield* TxHashSet.make("a", "b", "c")
        assert.strictEqual(yield* TxHashSet.size(txSet), 3)

        yield* TxHashSet.clear(txSet)
        assert.strictEqual(yield* TxHashSet.size(txSet), 0)
        assert.strictEqual(yield* TxHashSet.isEmpty(txSet), true)
      })))
  })

  describe("set operations", () => {
    it.effect("union combines two sets", () =>
      Effect.tx(Effect.gen(function*() {
        const set1 = yield* TxHashSet.make("a", "b")
        const set2 = yield* TxHashSet.make("b", "c")
        const combined = yield* TxHashSet.union(set1, set2)

        const values = yield* TxHashSet.toHashSet(combined)
        const sortedValues = Array.from(values).sort()
        assert.deepStrictEqual(sortedValues, ["a", "b", "c"])
        assert.strictEqual(yield* TxHashSet.size(combined), 3)
      })))

    it.effect("intersection finds common elements", () =>
      Effect.tx(Effect.gen(function*() {
        const set1 = yield* TxHashSet.make("a", "b", "c")
        const set2 = yield* TxHashSet.make("b", "c", "d")
        const common = yield* TxHashSet.intersection(set1, set2)

        const values = yield* TxHashSet.toHashSet(common)
        const sortedValues = Array.from(values).sort()
        assert.deepStrictEqual(sortedValues, ["b", "c"])
        assert.strictEqual(yield* TxHashSet.size(common), 2)
      })))

    it.effect("difference finds elements only in first set", () =>
      Effect.tx(Effect.gen(function*() {
        const set1 = yield* TxHashSet.make("a", "b", "c")
        const set2 = yield* TxHashSet.make("b", "d")
        const diff = yield* TxHashSet.difference(set1, set2)

        const values = yield* TxHashSet.toHashSet(diff)
        const sortedValues = Array.from(values).sort()
        assert.deepStrictEqual(sortedValues, ["a", "c"])
        assert.strictEqual(yield* TxHashSet.size(diff), 2)
      })))

    it.effect("isSubset checks subset relationship", () =>
      Effect.tx(Effect.gen(function*() {
        const small = yield* TxHashSet.make("a", "b")
        const large = yield* TxHashSet.make("a", "b", "c", "d")
        const other = yield* TxHashSet.make("x", "y")

        assert.strictEqual(yield* TxHashSet.isSubset(small, large), true)
        assert.strictEqual(yield* TxHashSet.isSubset(large, small), false)
        assert.strictEqual(yield* TxHashSet.isSubset(small, other), false)
        assert.strictEqual(yield* TxHashSet.isSubset(small, small), true)
      })))
  })

  describe("query operations", () => {
    it.effect("some tests if any element satisfies predicate", () =>
      Effect.tx(Effect.gen(function*() {
        const numbers = yield* TxHashSet.make(1, 2, 3, 4, 5)

        assert.strictEqual(yield* TxHashSet.some(numbers, (n) => n > 3), true)
        assert.strictEqual(yield* TxHashSet.some(numbers, (n) => n > 10), false)

        const empty = yield* TxHashSet.empty<number>()
        assert.strictEqual(yield* TxHashSet.some(empty, (n) => n > 0), false)
      })))

    it.effect("every tests if all elements satisfy predicate", () =>
      Effect.tx(Effect.gen(function*() {
        const numbers = yield* TxHashSet.make(2, 4, 6, 8)

        assert.strictEqual(yield* TxHashSet.every(numbers, (n) => n % 2 === 0), true)
        assert.strictEqual(yield* TxHashSet.every(numbers, (n) => n > 5), false)

        const empty = yield* TxHashSet.empty<number>()
        assert.strictEqual(yield* TxHashSet.every(empty, (n) => n > 0), true) // vacuously true
      })))
  })

  describe("functional operations", () => {
    it.effect("map transforms values", () =>
      Effect.tx(Effect.gen(function*() {
        const numbers = yield* TxHashSet.make(1, 2, 3)
        const doubled = yield* TxHashSet.map(numbers, (n) => n * 2)

        const values = yield* TxHashSet.toHashSet(doubled)
        const sortedValues = Array.from(values).sort()
        assert.deepStrictEqual(sortedValues, [2, 4, 6])
        assert.strictEqual(yield* TxHashSet.size(doubled), 3)
      })))

    it.effect("map can reduce size with duplicate results", () =>
      Effect.tx(Effect.gen(function*() {
        const strings = yield* TxHashSet.make("apple", "banana", "cherry")
        const lengths = yield* TxHashSet.map(strings, (s) => s.length)

        const values = yield* TxHashSet.toHashSet(lengths)
        const sortedValues = Array.from(values).sort()
        assert.deepStrictEqual(sortedValues, [5, 6]) // apple=5, banana=6, cherry=6
      })))

    it.effect("filter keeps only matching values", () =>
      Effect.tx(Effect.gen(function*() {
        const numbers = yield* TxHashSet.make(1, 2, 3, 4, 5, 6)
        const evens = yield* TxHashSet.filter(numbers, (n) => n % 2 === 0)

        const values = yield* TxHashSet.toHashSet(evens)
        const sortedValues = Array.from(values).sort()
        assert.deepStrictEqual(sortedValues, [2, 4, 6])
        assert.strictEqual(yield* TxHashSet.size(evens), 3)
      })))

    it.effect("reduce accumulates values", () =>
      Effect.tx(Effect.gen(function*() {
        const numbers = yield* TxHashSet.make(1, 2, 3, 4, 5)
        const sum = yield* TxHashSet.reduce(numbers, 0, (acc, n) => acc + n)

        assert.strictEqual(sum, 15)

        const strings = yield* TxHashSet.make("a", "b", "c")
        const concatenated = yield* TxHashSet.reduce(strings, "", (acc, s) => acc + s)

        // Order may vary, but all letters should be present
        assert.strictEqual(concatenated.length, 3)
        assert.strictEqual(concatenated.includes("a"), true)
        assert.strictEqual(concatenated.includes("b"), true)
        assert.strictEqual(concatenated.includes("c"), true)
      })))
  })

  describe("conversions", () => {
    it.effect("toHashSet creates immutable snapshot", () =>
      Effect.tx(Effect.gen(function*() {
        const txSet = yield* TxHashSet.make("x", "y", "z")
        const hashSet = yield* TxHashSet.toHashSet(txSet)

        assert.strictEqual(HashSet.size(hashSet), 3)
        assert.strictEqual(HashSet.has(hashSet, "y"), true)

        // hashSet is a snapshot - modifications to txSet don't affect it
        yield* TxHashSet.add(txSet, "w")
        assert.strictEqual(HashSet.size(hashSet), 3) // unchanged
        assert.strictEqual(yield* TxHashSet.size(txSet), 4)
      })))
  })

  describe("custom Equal objects", () => {
    it.effect("works with custom Equal implementations", () =>
      Effect.tx(Effect.gen(function*() {
        const txSet = yield* TxHashSet.make(
          new TestValue("alice"),
          new TestValue("bob"),
          new TestValue("charlie")
        )

        assert.strictEqual(yield* TxHashSet.size(txSet), 3)
        assert.strictEqual(yield* TxHashSet.has(txSet, new TestValue("alice")), true)
        assert.strictEqual(yield* TxHashSet.has(txSet, new TestValue("dave")), false)

        // Adding duplicate based on Equal should have no effect
        yield* TxHashSet.add(txSet, new TestValue("alice"))
        assert.strictEqual(yield* TxHashSet.size(txSet), 3)

        // Removing should work with Equal
        const removed = yield* TxHashSet.remove(txSet, new TestValue("bob"))
        assert.strictEqual(removed, true)
        assert.strictEqual(yield* TxHashSet.size(txSet), 2)
        assert.strictEqual(yield* TxHashSet.has(txSet, new TestValue("bob")), false)
      })))
  })

  describe("transactional behavior", () => {
    it.effect("operations are atomic within transactions", () =>
      Effect.tx(Effect.gen(function*() {
        const txSet = yield* TxHashSet.make("a", "b", "c")

        const hasCherry = yield* TxHashSet.has(txSet, "c")
        if (hasCherry) {
          yield* TxHashSet.remove(txSet, "c")
          yield* TxHashSet.add(txSet, "orange")
        }
        yield* TxHashSet.add(txSet, "grape")

        assert.strictEqual(yield* TxHashSet.size(txSet), 4)
        assert.strictEqual(yield* TxHashSet.has(txSet, "c"), false)
        assert.strictEqual(yield* TxHashSet.has(txSet, "orange"), true)
        assert.strictEqual(yield* TxHashSet.has(txSet, "grape"), true)
      })))

    it.effect("multiple set operations work together", () =>
      Effect.tx(Effect.gen(function*() {
        const set1 = yield* TxHashSet.make("a", "b", "c")
        const set2 = yield* TxHashSet.make("c", "d", "e")

        yield* TxHashSet.add(set1, "f")
        yield* TxHashSet.remove(set2, "d")

        const intersection = yield* TxHashSet.intersection(set1, set2)
        const commonSize = yield* TxHashSet.size(intersection)

        if (commonSize > 0) {
          yield* TxHashSet.add(set1, "shared")
          yield* TxHashSet.add(set2, "shared")
        }

        assert.strictEqual(yield* TxHashSet.has(set1, "f"), true)
        assert.strictEqual(yield* TxHashSet.has(set1, "shared"), true)
        assert.strictEqual(yield* TxHashSet.has(set2, "d"), false)
        assert.strictEqual(yield* TxHashSet.has(set2, "shared"), true)
      })))
  })

  describe("stress testing", () => {
    it.effect("handles large number of operations", () =>
      Effect.tx(Effect.gen(function*() {
        const txSet = yield* TxHashSet.empty<number>()

        // Add 1000 numbers
        for (let i = 0; i < 1000; i++) {
          yield* TxHashSet.add(txSet, i)
        }

        assert.strictEqual(yield* TxHashSet.size(txSet), 1000)

        // Check random elements
        assert.strictEqual(yield* TxHashSet.has(txSet, 500), true)
        assert.strictEqual(yield* TxHashSet.has(txSet, 999), true)
        assert.strictEqual(yield* TxHashSet.has(txSet, 1000), false)

        // Remove half the elements
        for (let i = 0; i < 500; i++) {
          yield* TxHashSet.remove(txSet, i)
        }

        assert.strictEqual(yield* TxHashSet.size(txSet), 500)
        assert.strictEqual(yield* TxHashSet.has(txSet, 250), false)
        assert.strictEqual(yield* TxHashSet.has(txSet, 750), true)
      })))

    it.effect("functional operations work with large sets", () =>
      Effect.tx(Effect.gen(function*() {
        const numbers = yield* TxHashSet.fromIterable(Array.from({ length: 100 }, (_, i) => i))

        const evens = yield* TxHashSet.filter(numbers, (n) => n % 2 === 0)
        assert.strictEqual(yield* TxHashSet.size(evens), 50)

        const doubled = yield* TxHashSet.map(evens, (n) => n * 2)
        assert.strictEqual(yield* TxHashSet.size(doubled), 50)

        const sum = yield* TxHashSet.reduce(evens, 0, (acc, n) => acc + n)
        assert.strictEqual(sum, 2450) // sum of even numbers 0 to 98
      })))
  })

  describe("edge cases", () => {
    it.effect("handles empty set operations correctly", () =>
      Effect.tx(Effect.gen(function*() {
        const empty1 = yield* TxHashSet.empty<string>()
        const empty2 = yield* TxHashSet.empty<string>()
        const nonEmpty = yield* TxHashSet.make("a", "b")

        const emptyUnion = yield* TxHashSet.union(empty1, empty2)
        assert.strictEqual(yield* TxHashSet.size(emptyUnion), 0)

        const nonEmptyUnion = yield* TxHashSet.union(empty1, nonEmpty)
        assert.strictEqual(yield* TxHashSet.size(nonEmptyUnion), 2)

        const emptyIntersection = yield* TxHashSet.intersection(empty1, nonEmpty)
        assert.strictEqual(yield* TxHashSet.size(emptyIntersection), 0)

        assert.strictEqual(yield* TxHashSet.isSubset(empty1, nonEmpty), true)
        assert.strictEqual(yield* TxHashSet.isSubset(nonEmpty, empty1), false)
      })))

    it.effect("handles single element sets", () =>
      Effect.tx(Effect.gen(function*() {
        const single = yield* TxHashSet.make("only")

        assert.strictEqual(yield* TxHashSet.size(single), 1)
        assert.strictEqual(yield* TxHashSet.has(single, "only"), true)
        assert.strictEqual(yield* TxHashSet.isEmpty(single), false)

        yield* TxHashSet.clear(single)
        assert.strictEqual(yield* TxHashSet.size(single), 0)
        assert.strictEqual(yield* TxHashSet.isEmpty(single), true)
      })))
  })
})
