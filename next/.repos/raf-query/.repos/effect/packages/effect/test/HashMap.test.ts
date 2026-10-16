import { Equal, Hash, HashMap, Option, Result } from "effect"
import * as fc from "fast-check"
import { describe, expect, it } from "vitest"

describe("HashMap", () => {
  describe("constructors", () => {
    it("empty", () => {
      const map = HashMap.empty<string, number>()
      expect(HashMap.isEmpty(map)).toBe(true)
      expect(HashMap.size(map)).toBe(0)
    })

    it("make", () => {
      const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])
      expect(HashMap.size(map)).toBe(3)
      expect(HashMap.get(map, "a")).toEqual(Option.some(1))
      expect(HashMap.get(map, "b")).toEqual(Option.some(2))
      expect(HashMap.get(map, "c")).toEqual(Option.some(3))
    })

    it("fromIterable", () => {
      const entries = [["a", 1], ["b", 2], ["c", 3]] as const
      const map = HashMap.fromIterable(entries)
      expect(HashMap.size(map)).toBe(3)
      expect(HashMap.get(map, "a")).toEqual(Option.some(1))
      expect(HashMap.get(map, "b")).toEqual(Option.some(2))
      expect(HashMap.get(map, "c")).toEqual(Option.some(3))
    })
  })

  describe("basic operations", () => {
    it("modifyHash stores a new key under the supplied hash", () => {
      const key = {}
      const hash = 12345
      const map = HashMap.modifyHash(HashMap.empty<object, string>(), key, hash, () => Option.some("value"))

      expect(HashMap.getHash(map, key, hash)).toEqual(Option.some("value"))
    })

    it("modifyHash removes a key using the supplied hash", () => {
      const key = {}
      const hash = 12345
      const map = HashMap.modifyHash(HashMap.empty<object, string>(), key, hash, () => Option.some("value"))
      const removed = HashMap.modifyHash(map, key, hash, () => Option.none())

      expect(HashMap.getHash(removed, key, hash)).toEqual(Option.none())
    })

    it("get - existing key", () => {
      const map = HashMap.make(["a", 1], ["b", 2])
      expect(HashMap.get(map, "a")).toEqual(Option.some(1))
      expect(HashMap.get(map, "b")).toEqual(Option.some(2))
    })

    it("get - non-existing key", () => {
      const map = HashMap.make(["a", 1], ["b", 2])
      expect(HashMap.get(map, "c")).toEqual(Option.none())
    })

    it("has - existing key", () => {
      const map = HashMap.make(["a", 1], ["b", 2])
      expect(HashMap.has(map, "a")).toBe(true)
      expect(HashMap.has(map, "b")).toBe(true)
    })

    it("has - non-existing key", () => {
      const map = HashMap.make(["a", 1], ["b", 2])
      expect(HashMap.has(map, "c")).toBe(false)
    })

    it("set - new key", () => {
      const map1 = HashMap.make(["a", 1])
      const map2 = HashMap.set(map1, "b", 2)
      expect(HashMap.size(map2)).toBe(2)
      expect(HashMap.get(map2, "a")).toEqual(Option.some(1))
      expect(HashMap.get(map2, "b")).toEqual(Option.some(2))
      // Original should be unchanged
      expect(HashMap.size(map1)).toBe(1)
      expect(HashMap.has(map1, "b")).toBe(false)
    })

    it("set - existing key", () => {
      const map1 = HashMap.make(["a", 1], ["b", 2])
      const map2 = HashMap.set(map1, "a", 10)
      expect(HashMap.size(map2)).toBe(2)
      expect(HashMap.get(map2, "a")).toEqual(Option.some(10))
      expect(HashMap.get(map2, "b")).toEqual(Option.some(2))
      // Original should be unchanged
      expect(HashMap.get(map1, "a")).toEqual(Option.some(1))
    })

    it("remove - existing key", () => {
      const map1 = HashMap.make(["a", 1], ["b", 2], ["c", 3])
      const map2 = HashMap.remove(map1, "b")
      expect(HashMap.size(map2)).toBe(2)
      expect(HashMap.has(map2, "a")).toBe(true)
      expect(HashMap.has(map2, "b")).toBe(false)
      expect(HashMap.has(map2, "c")).toBe(true)
      // Original should be unchanged
      expect(HashMap.size(map1)).toBe(3)
      expect(HashMap.has(map1, "b")).toBe(true)
    })

    it("remove - non-existing key", () => {
      const map1 = HashMap.make(["a", 1], ["b", 2])
      const map2 = HashMap.remove(map1, "c")
      expect(map1).toBe(map2) // Should return same reference
      expect(HashMap.size(map2)).toBe(2)
    })

    it("getUnsafe - existing key", () => {
      const map = HashMap.make(["a", 1], ["b", 2])
      expect(HashMap.getUnsafe(map, "a")).toBe(1)
      expect(HashMap.getUnsafe(map, "b")).toBe(2)
    })

    it("getUnsafe - non-existing key", () => {
      const map = HashMap.make(["a", 1])
      expect(() => HashMap.getUnsafe(map, "b")).toThrow("HashMap.getUnsafe: key not found")
    })
  })

  describe("iterators and getters", () => {
    it("keys", () => {
      const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])
      const keys = Array.from(HashMap.keys(map)).sort()
      expect(keys).toEqual(["a", "b", "c"])
    })

    it("values", () => {
      const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])
      const values = Array.from(HashMap.values(map)).sort()
      expect(values).toEqual([1, 2, 3])
    })

    it("toValues", () => {
      const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])
      const values = HashMap.toValues(map).sort()
      expect(values).toEqual([1, 2, 3])
    })

    it("entries", () => {
      const map = HashMap.make(["a", 1], ["b", 2])
      const entries = Array.from(HashMap.entries(map)).sort(([a], [b]) => a.localeCompare(b))
      expect(entries).toEqual([["a", 1], ["b", 2]])
    })

    it("toEntries", () => {
      const map = HashMap.make(["a", 1], ["b", 2])
      const entries = HashMap.toEntries(map).sort(([a], [b]) => a.localeCompare(b))
      expect(entries).toEqual([["a", 1], ["b", 2]])
    })

    it("Symbol.iterator", () => {
      const map = HashMap.make(["a", 1], ["b", 2])
      const entries = Array.from(map).sort(([a], [b]) => a.localeCompare(b))
      expect(entries).toEqual([["a", 1], ["b", 2]])
    })

    it("preserves traversal order across every node kind", () => {
      const expectIteration = <A>(iterator: Iterator<A>, expected: ReadonlyArray<A>) => {
        for (const value of expected) {
          expect(iterator.next()).toEqual({ done: false, value })
        }
        expect(iterator.next()).toEqual({ done: true, value: undefined })
        expect(iterator.next()).toEqual({ done: true, value: undefined })
      }

      const empty = HashMap.empty<string, number>()
      expectIteration(empty[Symbol.iterator](), [])
      expectIteration(HashMap.entries(empty), [])
      expectIteration(HashMap.keys(empty), [])
      expectIteration(HashMap.values(empty), [])

      const input = [
        ...Array.from({ length: 16 }, (_, i) => [`leaf-${17 - i}`, 17 - i, 17 - i] as const),
        ["nested-2", 65, 102] as const,
        ["collision-first", 0, 1] as const,
        ["nested-0", 1, 100] as const,
        ["collision-second", 0, 2] as const,
        ["nested-1", 33, 101] as const
      ]
      let map = empty
      for (const [key, hash, value] of input) {
        map = HashMap.modifyHash(map, key, hash, () => Option.some(value))
      }

      const expected: Array<[string, number]> = [
        ["collision-first", 1],
        ["collision-second", 2],
        ["nested-0", 100],
        ["nested-1", 101],
        ["nested-2", 102],
        ...Array.from({ length: 16 }, (_, i) => [`leaf-${i + 2}`, i + 2] as [string, number])
      ]
      expectIteration(map[Symbol.iterator](), expected)
      expectIteration(HashMap.entries(map), expected)
      expectIteration(HashMap.keys(map), expected.map(([key]) => key))
      expectIteration(HashMap.values(map), expected.map(([, value]) => value))
    })

    it("does not expose mutable collision entries", () => {
      const map = HashMap.make(["fF", 1], ["AA", 2])
      const entry = Array.from(HashMap.entries(map)).find(([key]) => key === "fF")!

      entry[1] = 99

      expect(HashMap.getUnsafe(map, "fF")).toBe(1)
    })
  })

  describe("bulk operations", () => {
    it("removeMany", () => {
      const map1 = HashMap.make(["a", 1], ["b", 2], ["c", 3], ["d", 4])
      const map2 = HashMap.removeMany(map1, ["b", "d"])
      expect(HashMap.size(map2)).toBe(2)
      expect(HashMap.has(map2, "a")).toBe(true)
      expect(HashMap.has(map2, "b")).toBe(false)
      expect(HashMap.has(map2, "c")).toBe(true)
      expect(HashMap.has(map2, "d")).toBe(false)
    })

    it("setMany", () => {
      const map1 = HashMap.make(["a", 1], ["b", 2])
      const newEntries = [["c", 3], ["d", 4], ["a", 10]] as const // "a" should be overwritten
      const map2 = HashMap.setMany(map1, newEntries)

      expect(HashMap.size(map2)).toBe(4)
      expect(HashMap.get(map2, "a")).toEqual(Option.some(10)) // overwritten
      expect(HashMap.get(map2, "b")).toEqual(Option.some(2)) // preserved
      expect(HashMap.get(map2, "c")).toEqual(Option.some(3)) // new
      expect(HashMap.get(map2, "d")).toEqual(Option.some(4)) // new
    })

    it("setMany - pipe syntax", () => {
      const map1 = HashMap.empty<string, number>()
      const map2 = HashMap.setMany([["x", 100], ["y", 200]])(map1)

      expect(HashMap.size(map2)).toBe(2)
      expect(HashMap.get(map2, "x")).toEqual(Option.some(100))
      expect(HashMap.get(map2, "y")).toEqual(Option.some(200))
    })

    it("setMany - different iterables", () => {
      const map1 = HashMap.make(["existing", 1])

      // Test with Map
      const jsMap = new Map([["from-map", 2], ["another", 3]])
      const map2 = HashMap.setMany(map1, jsMap)

      expect(HashMap.size(map2)).toBe(3)
      expect(HashMap.get(map2, "existing")).toEqual(Option.some(1))
      expect(HashMap.get(map2, "from-map")).toEqual(Option.some(2))
      expect(HashMap.get(map2, "another")).toEqual(Option.some(3))

      // Test with Set of tuples
      const setOfTuples = new Set([["from-set", 4]] as const)
      const map3 = HashMap.setMany(map2, setOfTuples)

      expect(HashMap.size(map3)).toBe(4)
      expect(HashMap.get(map3, "from-set")).toEqual(Option.some(4))
    })

    it("union", () => {
      const map1 = HashMap.make(["a", 1], ["b", 2])
      const map2 = HashMap.make(["b", 20], ["c", 3])
      const map3 = HashMap.union(map1, map2)
      expect(HashMap.size(map3)).toBe(3)
      expect(HashMap.get(map3, "a")).toEqual(Option.some(1))
      expect(HashMap.get(map3, "b")).toEqual(Option.some(20)) // map2 wins
      expect(HashMap.get(map3, "c")).toEqual(Option.some(3))
    })
  })

  describe("mapping operations", () => {
    it("map", () => {
      const map1 = HashMap.make(["a", 1], ["b", 2], ["c", 3])
      const map2 = HashMap.map(map1, (value, _key) => value * 2)
      expect(HashMap.size(map2)).toBe(3)
      expect(HashMap.get(map2, "a")).toEqual(Option.some(2))
      expect(HashMap.get(map2, "b")).toEqual(Option.some(4))
      expect(HashMap.get(map2, "c")).toEqual(Option.some(6))
    })

    it("flatMap", () => {
      const map1 = HashMap.make(["a", 1], ["b", 2])
      const map2 = HashMap.flatMap(map1, (value, key) => HashMap.make([key + "1", value], [key + "2", value * 2]))
      expect(HashMap.size(map2)).toBe(4)
      expect(HashMap.get(map2, "a1")).toEqual(Option.some(1))
      expect(HashMap.get(map2, "a2")).toEqual(Option.some(2))
      expect(HashMap.get(map2, "b1")).toEqual(Option.some(2))
      expect(HashMap.get(map2, "b2")).toEqual(Option.some(4))
    })
  })

  describe("filtering operations", () => {
    it("filter", () => {
      const map1 = HashMap.make(["a", 1], ["b", 2], ["c", 3], ["d", 4])
      const map2 = HashMap.filter(map1, (value) => value % 2 === 0)
      expect(HashMap.size(map2)).toBe(2)
      expect(HashMap.has(map2, "a")).toBe(false)
      expect(HashMap.has(map2, "b")).toBe(true)
      expect(HashMap.has(map2, "c")).toBe(false)
      expect(HashMap.has(map2, "d")).toBe(true)
    })

    it("compact", () => {
      const map1 = HashMap.make(
        ["a", Option.some(1)],
        ["b", Option.none()],
        ["c", Option.some(3)]
      )
      const map2 = HashMap.compact(map1)
      expect(HashMap.size(map2)).toBe(2)
      expect(HashMap.get(map2, "a")).toEqual(Option.some(1))
      expect(HashMap.has(map2, "b")).toBe(false)
      expect(HashMap.get(map2, "c")).toEqual(Option.some(3))
    })

    it("filterMap", () => {
      const map1 = HashMap.make(["a", 1], ["b", 2], ["c", 3], ["d", 4])
      const map2 = HashMap.filterMap(map1, (value) => value % 2 === 0 ? Result.succeed(value * 2) : Result.failVoid)
      expect(HashMap.size(map2)).toBe(2)
      expect(HashMap.get(map2, "b")).toEqual(Option.some(4))
      expect(HashMap.get(map2, "d")).toEqual(Option.some(8))
      expect(HashMap.has(map2, "a")).toBe(false)
      expect(HashMap.has(map2, "c")).toBe(false)
    })

    it("filterMap - key argument", () => {
      const map1 = HashMap.make(["a", 1], ["b", 2], ["c", 3], ["d", 4])
      const map2 = HashMap.filterMap(
        map1,
        (value, key) => key < "c" ? Result.succeed(`${key}:${value}`) : Result.failVoid
      )

      expect(HashMap.size(map2)).toBe(2)
      expect(HashMap.get(map2, "a")).toEqual(Option.some("a:1"))
      expect(HashMap.get(map2, "b")).toEqual(Option.some("b:2"))
      expect(HashMap.has(map2, "c")).toBe(false)
      expect(HashMap.has(map2, "d")).toBe(false)
    })
  })

  describe("search operations", () => {
    it("findFirst returns an entry matching both key and value", () => {
      const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])
      const result = HashMap.findFirst(map, (value) => value > 1)
      expect(result).toEqual(Option.some(["c", 3]))
    })

    it("findFirst - not found", () => {
      const map = HashMap.make(["a", 1], ["b", 2])
      const result = HashMap.findFirst(map, (value) => value > 5)
      expect(result).toEqual(Option.none())
    })

    it("some", () => {
      const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])
      expect(HashMap.some(map, (value) => value > 2)).toBe(true)
      expect(HashMap.some(map, (value) => value > 5)).toBe(false)
    })

    it("every", () => {
      const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])
      expect(HashMap.every(map, (value) => value > 0)).toBe(true)
      expect(HashMap.every(map, (value) => value > 1)).toBe(false)
    })

    it("hasBy", () => {
      const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])
      expect(HashMap.hasBy(map, (value, key) => key === "b" && value === 2)).toBe(true)
      expect(HashMap.hasBy(map, (value, key) => key === "b" && value === 5)).toBe(false)
    })
  })

  describe("modification operations", () => {
    it("modifyAt - existing key", () => {
      const map1 = HashMap.make(["a", 1], ["b", 2])
      const map2 = HashMap.modifyAt(
        map1,
        "a",
        (option) => Option.isSome(option) ? Option.some(option.value * 2) : Option.none()
      )
      expect(HashMap.get(map2, "a")).toEqual(Option.some(2))
    })

    it("modifyAt - non-existing key", () => {
      const map1 = HashMap.make(["a", 1])
      const map2 = HashMap.modifyAt(map1, "b", (option) => Option.isSome(option) ? option : Option.some(10))
      expect(HashMap.get(map2, "b")).toEqual(Option.some(10))
    })

    it("modifyAt - remove via None", () => {
      const map1 = HashMap.make(["a", 1], ["b", 2])
      const map2 = HashMap.modifyAt(map1, "a", () => Option.none())
      expect(HashMap.has(map2, "a")).toBe(false)
      expect(HashMap.has(map2, "b")).toBe(true)
    })

    it("modify", () => {
      const map1 = HashMap.make(["a", 1], ["b", 2])
      const map2 = HashMap.modify(map1, "a", (value) => value * 3)
      expect(HashMap.get(map2, "a")).toEqual(Option.some(3))
      expect(HashMap.get(map2, "b")).toEqual(Option.some(2))
    })
  })

  describe("reduction operations", () => {
    it("reduce", () => {
      const map = HashMap.make(["a", 1], ["b", 2], ["c", 3])
      const sum = HashMap.reduce(map, 0, (acc, value) => acc + value)
      expect(sum).toBe(6)
    })

    it("forEach visits each key and value", () => {
      const map = HashMap.make(["a", 1], ["b", 2])
      const collected: Array<[string, number]> = []
      HashMap.forEach(map, (value, key) => {
        collected.push([key, value])
      })
      expect(collected.sort()).toEqual([["a", 1], ["b", 2]])
    })
  })

  describe("mutation helpers", () => {
    it("mutate allows in-place modifications", () => {
      const map1 = HashMap.make(["a", 1])
      const map2 = HashMap.mutate(map1, (mutable) => {
        HashMap.set(mutable, "b", 2)
        HashMap.set(mutable, "c", 3)
      })
      // Original should be unchanged
      expect(HashMap.size(map1)).toBe(1)
      // Mutated map should have all entries
      expect(HashMap.size(map2)).toBe(3)
      expect(HashMap.get(map2, "a")).toEqual(Option.some(1))
      expect(HashMap.get(map2, "b")).toEqual(Option.some(2))
      expect(HashMap.get(map2, "c")).toEqual(Option.some(3))
    })

    it("beginMutation creates distinct mutable instance", () => {
      const map1 = HashMap.make(["a", 1])
      const mutable = HashMap.beginMutation(map1)

      // Should be different instances
      expect(map1).not.toBe(mutable)

      // Mutations on mutable should not affect original
      HashMap.set(mutable, "b", 2)
      expect(HashMap.size(map1)).toBe(1)
      expect(HashMap.size(mutable)).toBe(2)

      // endMutation returns same instance
      const immutable = HashMap.endMutation(mutable)
      expect(mutable).toBe(immutable)
    })

    it("mutations are isolated from original", () => {
      const original = HashMap.make(["a", 1], ["b", 2])
      const mutated = HashMap.mutate(original, (m) => {
        HashMap.set(m, "a", 100)
        HashMap.remove(m, "b")
        HashMap.set(m, "c", 3)
      })

      // Original unchanged
      expect(HashMap.get(original, "a")).toEqual(Option.some(1))
      expect(HashMap.get(original, "b")).toEqual(Option.some(2))
      expect(HashMap.has(original, "c")).toBe(false)

      // Mutated has changes
      expect(HashMap.get(mutated, "a")).toEqual(Option.some(100))
      expect(HashMap.has(mutated, "b")).toBe(false)
      expect(HashMap.get(mutated, "c")).toEqual(Option.some(3))
    })
  })

  describe("equality and hashing", () => {
    it("Equal.equals", () => {
      const map1 = HashMap.make(["a", 1], ["b", 2])
      const map2 = HashMap.make(["b", 2], ["a", 1]) // Different order
      const map3 = HashMap.make(["a", 1], ["b", 3]) // Different value

      expect(Equal.equals(map1, map2)).toBe(true)
      expect(Equal.equals(map1, map3)).toBe(false)
    })

    it("Hash.hash", () => {
      const map1 = HashMap.make(["a", 1], ["b", 2])
      const map2 = HashMap.make(["b", 2], ["a", 1]) // Different order

      expect(Hash.hash(map1)).toBe(Hash.hash(map2))
    })
  })

  describe("custom hash with Equal objects", () => {
    class Person implements Equal.Equal {
      constructor(readonly name: string, readonly age: number) {}

      [Equal.symbol](that: Equal.Equal): boolean {
        return that instanceof Person &&
          this.name === that.name &&
          this.age === that.age
      }

      [Hash.symbol](): number {
        return Hash.string(this.name) ^ Hash.number(this.age)
      }
    }

    it("should work with Equal objects as keys", () => {
      const person1 = new Person("Alice", 25)
      const person2 = new Person("Alice", 25) // Same data, different instance
      const person3 = new Person("Bob", 30)

      const map = HashMap.make([person1, "value1"], [person3, "value3"])

      // Should find value using structurally equal key
      expect(HashMap.get(map, person2)).toEqual(Option.some("value1"))
      expect(HashMap.has(map, person2)).toBe(true)

      // Should work with set operation
      const map2 = HashMap.set(map, person2, "updated")
      expect(HashMap.get(map2, person1)).toEqual(Option.some("updated"))
      expect(HashMap.size(map2)).toBe(2) // Should not increase size
    })
  })

  describe("regressions", () => {
    class FixedHashKey implements Equal.Equal {
      constructor(readonly id: string, readonly hash: number) {}

      [Equal.symbol](that: Equal.Equal): boolean {
        return that instanceof FixedHashKey && this.id === that.id
      }

      [Hash.symbol](): number {
        return this.hash
      }
    }

    it("keeps entries addressable when bit 31 is present in indexed leaf insert", () => {
      const bit31Key = new FixedHashKey("bit31", 31)
      const bit30Key = new FixedHashKey("bit30", 30)

      let map = HashMap.empty<FixedHashKey, string>()
      map = HashMap.set(map, bit31Key, "session1")
      map = HashMap.set(map, bit30Key, "session2")

      expect(HashMap.size(map)).toBe(2)
      expect(HashMap.get(map, bit31Key)).toEqual(Option.some("session1"))
      expect(HashMap.get(map, bit30Key)).toEqual(Option.some("session2"))
    })

    it("keeps entries addressable when mergeLeaves sees bit 31", () => {
      const collisionA = new FixedHashKey("collisionA", 31)
      const collisionB = new FixedHashKey("collisionB", 31)
      const bit30Key = new FixedHashKey("bit30", 30)

      let map = HashMap.empty<FixedHashKey, string>()
      map = HashMap.set(map, collisionA, "a")
      map = HashMap.set(map, collisionB, "b")
      map = HashMap.set(map, bit30Key, "c")

      expect(HashMap.size(map)).toBe(3)
      expect(HashMap.get(map, collisionA)).toEqual(Option.some("a"))
      expect(HashMap.get(map, collisionB)).toEqual(Option.some("b"))
      expect(HashMap.get(map, bit30Key)).toEqual(Option.some("c"))
    })

    it("keeps all inserted entries addressable across random bit-31-heavy shapes", () => {
      const entriesArbitrary = fc.array(fc.integer({ min: 0, max: 31 }), { minLength: 0, maxLength: 80 }).chain(
        (hashes) => {
          const allHashes = [31, 31, 30, ...hashes]
          return fc.uniqueArray(fc.uuid(), { minLength: allHashes.length, maxLength: allHashes.length }).map((ids) =>
            allHashes.map((hash, i) => ({ id: ids[i], hash }))
          )
        }
      )

      fc.assert(
        fc.property(entriesArbitrary, (entries) => {
          let map = HashMap.empty<FixedHashKey, string>()
          const inserted: Array<readonly [FixedHashKey, string]> = []

          for (const entry of entries) {
            const key = new FixedHashKey(entry.id, entry.hash)
            const value = `value-${entry.id}`
            map = HashMap.set(map, key, value)
            inserted.push([key, value])
          }

          expect(HashMap.size(map)).toBe(inserted.length)
          for (const [key, value] of inserted) {
            expect(HashMap.has(map, key)).toBe(true)
            expect(HashMap.get(map, key)).toEqual(Option.some(value))
          }
        }),
        { numRuns: 200 }
      )
    })
  })

  describe("type guards", () => {
    it("isHashMap", () => {
      const map = HashMap.make(["a", 1])
      const notMap = { a: 1 }

      expect(HashMap.isHashMap(map)).toBe(true)
      expect(HashMap.isHashMap(notMap)).toBe(false)
      expect(HashMap.isHashMap(null)).toBe(false)
      expect(HashMap.isHashMap(undefined)).toBe(false)
    })
  })

  describe("stress tests", () => {
    it("handles many inserts, lookups, and removals", () => {
      let map = HashMap.empty<number, string>()

      // Add many entries
      for (let i = 0; i < 1000; i++) {
        map = HashMap.set(map, i, `value${i}`)
      }

      expect(HashMap.size(map)).toBe(1000)

      // Check random entries
      for (let i = 0; i < 100; i++) {
        const key = Math.floor(Math.random() * 1000)
        expect(HashMap.get(map, key)).toEqual(Option.some(`value${key}`))
      }

      // Remove half the entries
      for (let i = 0; i < 500; i++) {
        map = HashMap.remove(map, i)
      }

      expect(HashMap.size(map)).toBe(500)

      // Verify removals
      for (let i = 0; i < 500; i++) {
        expect(HashMap.has(map, i)).toBe(false)
      }
      for (let i = 500; i < 1000; i++) {
        expect(HashMap.has(map, i)).toBe(true)
      }
    })

    it("should handle hash collisions", () => {
      // Create objects with same hash but different equality
      class CollidingKey implements Equal.Equal {
        constructor(readonly id: number) {}

        [Equal.symbol](that: Equal.Equal): boolean {
          return that instanceof CollidingKey && this.id === that.id
        }

        [Hash.symbol](): number {
          return 42 // Same hash for all instances
        }
      }

      const key1 = new CollidingKey(1)
      const key2 = new CollidingKey(2)
      const key3 = new CollidingKey(3)

      let map = HashMap.empty<CollidingKey, string>()
      map = HashMap.set(map, key1, "value1")
      map = HashMap.set(map, key2, "value2")
      map = HashMap.set(map, key3, "value3")

      expect(HashMap.size(map)).toBe(3)
      expect(HashMap.get(map, key1)).toEqual(Option.some("value1"))
      expect(HashMap.get(map, key2)).toEqual(Option.some("value2"))
      expect(HashMap.get(map, key3)).toEqual(Option.some("value3"))

      // Remove one
      map = HashMap.remove(map, key2)
      expect(HashMap.size(map)).toBe(2)
      expect(HashMap.has(map, key1)).toBe(true)
      expect(HashMap.has(map, key2)).toBe(false)
      expect(HashMap.has(map, key3)).toBe(true)
    })
  })
})
