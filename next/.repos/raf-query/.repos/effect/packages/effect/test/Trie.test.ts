import { describe, it } from "@effect/vitest"
import { assertNone, assertSome, deepStrictEqual, strictEqual, throws } from "@effect/vitest/utils"
import * as Equal from "effect/Equal"
import { pipe } from "effect/Function"
import * as Hash from "effect/Hash"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as Trie from "effect/Trie"

describe("Trie", () => {
  it("equality rejects tries with different numbers of entries after a hash collision", () => {
    // Makes the "a" entry collide with the empty trie.
    const value = {
      [Hash.symbol]: () => -1520130700
    }
    const empty = Trie.empty<typeof value>()
    const nonEmpty = Trie.make(["a", value])

    strictEqual(Hash.hash(empty), Hash.hash(nonEmpty))
    strictEqual(Equal.equals(empty, nonEmpty), false, "tries with different sizes must not be equal")
  })

  it("toString renders entries in iteration order", () => {
    const trie = pipe(
      Trie.empty<number>(),
      Trie.insert("a", 0),
      Trie.insert("b", 1)
    )

    strictEqual(
      String(trie),
      `Trie([["a",0],["b",1]])`
    )
  })

  it("toJSON renders tagged entries", () => {
    const trie = pipe(
      Trie.empty<number>(),
      Trie.insert("a", 0),
      Trie.insert("b", 1)
    )

    deepStrictEqual(trie.toJSON(), { _id: "Trie", values: [["a", 0], ["b", 1]] })
  })

  it("inspect renders the JSON representation", () => {
    if (typeof window !== "undefined") {
      return
    }
    // oxlint-disable-next-line @typescript-eslint/no-require-imports
    const { inspect } = require("node:util")

    const trie = pipe(
      Trie.empty<number>(),
      Trie.insert("a", 0),
      Trie.insert("b", 1)
    )

    deepStrictEqual(inspect(trie), inspect({ _id: "Trie", values: [["a", 0], ["b", 1]] }))
  })

  it("iterates no entries for an empty trie", () => {
    const trie = Trie.empty<string>()

    strictEqual(Trie.size(trie), 0)
    deepStrictEqual(Array.from(trie), [])
  })

  it("insert returns new tries and orders entries by key", () => {
    const trie1 = Trie.empty<number>().pipe(
      Trie.insert("call", 0)
    )

    const trie2 = trie1.pipe(Trie.insert("me", 1))
    const trie3 = trie2.pipe(Trie.insert("mind", 2))
    const trie4 = trie3.pipe(Trie.insert("mid", 3))

    deepStrictEqual(Array.from(trie1), [["call", 0]])
    deepStrictEqual(Array.from(trie2), [["call", 0], ["me", 1]])
    deepStrictEqual(Array.from(trie3), [["call", 0], ["me", 1], ["mind", 2]])
    deepStrictEqual(Array.from(trie4), [["call", 0], ["me", 1], ["mid", 3], ["mind", 2]])
  })

  it("insert replaces a key without mutating or growing the original", () => {
    const before = Trie.make(["a", 1])
    const after = Trie.insert(before, "a", 2)

    deepStrictEqual(
      [Array.from(before), Trie.size(before), Array.from(after), Trie.size(after)],
      [[["a", 1]], 1, [["a", 2]], 1],
      "replacement must be immutable and preserve size"
    )
  })

  it("fromIterable preserves an empty iterable", () => {
    const iterable: Array<[string, number]> = []
    const trie = Trie.fromIterable(iterable)
    deepStrictEqual(Array.from(trie), iterable)
  })

  it("make builds a trie from entry pairs", () => {
    const trie = Trie.make(["ca", 0], ["me", 1])
    deepStrictEqual(Array.from(trie), [["ca", 0], ["me", 1]])
    strictEqual(Equal.equals(Trie.fromIterable([["ca", 0], ["me", 1]]), trie), true)
  })

  it("fromIterable builds the same trie as make", () => {
    const iterable: Array<[string, number]> = [["ca", 0], ["me", 1]]
    const trie = Trie.fromIterable(iterable)
    deepStrictEqual(Array.from(trie), iterable)
    strictEqual(Equal.equals(Trie.make(["ca", 0], ["me", 1]), trie), true)
  })

  it("fromIterable orders entries by key", () => {
    const iterable: Array<readonly [string, number]> = [["call", 0], ["me", 1], ["mind", 2], ["mid", 3]]
    const trie = Trie.fromIterable(iterable)
    deepStrictEqual(Array.from(trie), [["call", 0], ["me", 1], ["mid", 3], ["mind", 2]])
  })

  it("fromIterable preserves already sorted entries", () => {
    const iterable: Array<[string, number]> = [["a", 0], ["b", 1]]
    const trie = Trie.fromIterable(iterable)
    deepStrictEqual(Array.from(trie), iterable)
  })

  it("fromIterable accepts a single entry", () => {
    const iterable: Array<[string, number]> = [["a", 0]]
    const trie = Trie.fromIterable(iterable)
    deepStrictEqual(Array.from(trie), iterable)
  })

  it("fromIterable orders keys when one key is a prefix", () => {
    const iterable: Array<[string, number]> = [["shells", 0], ["she", 1]]
    const trie = Trie.fromIterable(iterable)
    deepStrictEqual(Array.from(trie), [["she", 1], ["shells", 0]])
  })

  it("size counts stored keys", () => {
    const trie = Trie.empty<number>().pipe(
      Trie.insert("a", 0),
      Trie.insert("b", 1)
    )

    strictEqual(Trie.size(trie), 2)
  })

  it("isEmpty distinguishes empty and populated tries", () => {
    const trie = Trie.empty<number>()
    const trie1 = trie.pipe(Trie.insert("ma", 0))
    strictEqual(Trie.isEmpty(trie), true)
    strictEqual(Trie.isEmpty(trie1), false)
  })

  it("get returns Some only for exact keys", () => {
    const trie = Trie.empty<number>().pipe(
      Trie.insert("call", 0),
      Trie.insert("me", 1),
      Trie.insert("mind", 2),
      Trie.insert("mid", 3)
    )
    assertSome(Trie.get(trie, "call"), 0)
    assertSome(Trie.get(trie, "me"), 1)
    assertSome(Trie.get(trie, "mind"), 2)
    assertSome(Trie.get(trie, "mid"), 3)
    assertNone(Trie.get(trie, "cale"))
    assertNone(Trie.get(trie, "ma"))
    assertNone(Trie.get(trie, "midn"))
    assertNone(Trie.get(trie, "mea"))
  })

  it("stores undefined values", () => {
    const trie = Trie.make(["a", undefined])

    strictEqual(Trie.size(trie), 1)
    strictEqual(Option.isSome(Trie.get(trie, "a")), true, "an inserted undefined value must remain present")
    deepStrictEqual(Array.from(trie), [["a", undefined]])
  })

  it("get distinguishes complete keys from prefixes", () => {
    const trie = Trie.empty<number>().pipe(
      Trie.insert("shells", 0),
      Trie.insert("sells", 1),
      Trie.insert("she", 2)
    )

    assertNone(Trie.get(trie, "sell"))
    assertSome(Trie.get(trie, "sells"), 1)
    assertNone(Trie.get(trie, "shell"))
    assertSome(Trie.get(trie, "she"), 2)
  })

  it("has returns true only for exact keys", () => {
    const trie = Trie.empty<number>().pipe(
      Trie.insert("call", 0),
      Trie.insert("me", 1),
      Trie.insert("mind", 2),
      Trie.insert("mid", 3)
    )
    strictEqual(Trie.has(trie, "call"), true)
    strictEqual(Trie.has(trie, "me"), true)
    strictEqual(Trie.has(trie, "mind"), true)
    strictEqual(Trie.has(trie, "mid"), true)
    strictEqual(Trie.has(trie, "cale"), false)
    strictEqual(Trie.has(trie, "ma"), false)
    strictEqual(Trie.has(trie, "midn"), false)
    strictEqual(Trie.has(trie, "mea"), false)
  })

  it("getUnsafe returns the value or throws when the key is missing", () => {
    const trie = Trie.empty<number>().pipe(
      Trie.insert("call", 0),
      Trie.insert("me", 1)
    )
    throws(() => Trie.getUnsafe(trie, "mae"))
  })

  it("remove deletes a key without mutating the original trie", () => {
    const trie = Trie.empty<number>().pipe(
      Trie.insert("call", 0),
      Trie.insert("me", 1),
      Trie.insert("mind", 2),
      Trie.insert("mid", 3)
    )

    const trie1 = trie.pipe(Trie.remove("call"))
    const trie2 = trie1.pipe(Trie.remove("mea"))

    deepStrictEqual(Trie.get(trie, "call"), Option.some(0))
    deepStrictEqual(Trie.get(trie1, "call"), Option.none())
    deepStrictEqual(Trie.get(trie2, "call"), Option.none())

    deepStrictEqual(Array.from(trie), [["call", 0], ["me", 1], ["mid", 3], ["mind", 2]])
    deepStrictEqual(Array.from(trie1), [["me", 1], ["mid", 3], ["mind", 2]])
    deepStrictEqual(Array.from(trie2), [["me", 1], ["mid", 3], ["mind", 2]])
  })

  it("remove preserves a valued prefix", () => {
    const trie = Trie.make(["ab", 1], ["abc", 2]).pipe(Trie.remove("abc"))

    deepStrictEqual(Array.from(trie), [["ab", 1]], "valued prefix should remain after removing its extension")
  })

  it("keys returns keys in sorted order", () => {
    const trie = Trie.empty<number>().pipe(
      Trie.insert("cab", 0),
      Trie.insert("abc", 1),
      Trie.insert("bca", 2)
    )

    const result = Array.from(Trie.keys(trie))
    deepStrictEqual(result, ["abc", "bca", "cab"])
  })

  it("keys orders nested prefixes alphabetically", () => {
    const trie = Trie.make(
      ["abc", 0],
      ["bac", 0],
      ["b", 0],
      ["ca", 0],
      ["cac", 0],
      ["c", 0],
      ["abb", 0],
      ["ba", 0],
      ["a", 0],
      ["bca", 0],
      ["cab", 0],
      ["dca", 0],
      ["ab", 0],
      ["adc", 0]
    )

    const result = Array.from(Trie.keys(trie))
    deepStrictEqual(result, [
      "a",
      "ab",
      "abb",
      "abc",
      "adc",
      "b",
      "ba",
      "bac",
      "bca",
      "c",
      "ca",
      "cab",
      "cac",
      "dca"
    ])
  })

  it("values follow key iteration order", () => {
    const trie = Trie.empty<number>().pipe(
      Trie.insert("call", 0),
      Trie.insert("me", 1),
      Trie.insert("and", 2)
    )

    const result = Array.from(Trie.values(trie))
    deepStrictEqual(result, [2, 0, 1])
  })

  it("entries iterates key-value pairs in sorted order", () => {
    const trie = Trie.empty<number>().pipe(
      Trie.insert("call", 0),
      Trie.insert("me", 1)
    )

    const result = Array.from(Trie.entries(trie))
    deepStrictEqual(result, [["call", 0], ["me", 1]])
  })

  it("toEntries returns a sorted entry array", () => {
    const trie = Trie.empty<number>().pipe(
      Trie.insert("call", 0),
      Trie.insert("me", 1)
    )

    const result = Trie.toEntries(trie)
    deepStrictEqual(result, [["call", 0], ["me", 1]])
  })

  it("keysWithPrefix returns matching keys in sorted order", () => {
    const trie = Trie.empty<number>().pipe(
      Trie.insert("she", 0),
      Trie.insert("shells", 1),
      Trie.insert("sea", 2),
      Trie.insert("sells", 3),
      Trie.insert("by", 4),
      Trie.insert("the", 5),
      Trie.insert("sea", 6),
      Trie.insert("shore", 7)
    )

    const result = Array.from(Trie.keysWithPrefix(trie, "she"))
    deepStrictEqual(result, ["she", "shells"])
  })

  it("valuesWithPrefix returns matching values in key order", () => {
    const trie = pipe(
      Trie.empty<number>(),
      Trie.insert("shells", 0),
      Trie.insert("sells", 1),
      Trie.insert("sea", 2),
      Trie.insert("she", 3)
    )

    const result = Array.from(Trie.valuesWithPrefix(trie, "she"))
    deepStrictEqual(result, [3, 0])
  })

  it("entriesWithPrefix returns matching entries in key order", () => {
    const trie = pipe(
      Trie.empty<number>(),
      Trie.insert("shells", 0),
      Trie.insert("sells", 1),
      Trie.insert("sea", 2),
      Trie.insert("she", 3)
    )

    const result = Array.from(Trie.entriesWithPrefix(trie, "she"))
    deepStrictEqual(result, [["she", 3], ["shells", 0]])
  })

  it("toEntriesWithPrefix returns matching entries as an array", () => {
    const trie = Trie.empty<number>().pipe(
      Trie.insert("shells", 0),
      Trie.insert("sells", 1),
      Trie.insert("sea", 2),
      Trie.insert("she", 3)
    )

    const result = Trie.toEntriesWithPrefix(trie, "she")
    deepStrictEqual(result, [["she", 3], ["shells", 0]])
  })

  it("longestPrefixOf returns the longest stored key that prefixes the input", () => {
    const trie = Trie.empty<number>().pipe(
      Trie.insert("shells", 0),
      Trie.insert("sells", 1),
      Trie.insert("she", 2)
    )

    assertNone(Trie.longestPrefixOf(trie, "sell"))
    assertSome(Trie.longestPrefixOf(trie, "sells"), ["sells", 1])
    assertSome(Trie.longestPrefixOf(trie, "shell"), ["she", 2])
    assertSome(Trie.longestPrefixOf(trie, "shellsort"), ["shells", 0])
  })

  it("longestPrefixOf ignores valued sibling nodes that do not match the input", () => {
    const trie = Trie.make(["a", 1], ["b", 2])

    strictEqual(
      Option.isNone(Trie.longestPrefixOf(trie, "c")),
      true,
      "a non-matching sibling must not be reported as a prefix"
    )
  })

  it("map transforms values and can use keys", () => {
    const trie = Trie.empty<number>().pipe(
      Trie.insert("shells", 0),
      Trie.insert("sells", 1),
      Trie.insert("she", 2)
    )

    const trieMapV = Trie.empty<number>().pipe(
      Trie.insert("shells", 1),
      Trie.insert("sells", 2),
      Trie.insert("she", 3)
    )

    const trieMapK = Trie.empty<number>().pipe(
      Trie.insert("shells", 6),
      Trie.insert("sells", 5),
      Trie.insert("she", 3)
    )

    strictEqual(Equal.equals(Trie.map(trie, (v) => v + 1), trieMapV), true)
    strictEqual(Equal.equals(Trie.map(trie, (_, k) => k.length), trieMapK), true)
  })

  it("filter keeps entries by value or key", () => {
    const trie = Trie.empty<number>().pipe(
      Trie.insert("shells", 0),
      Trie.insert("sells", 1),
      Trie.insert("she", 2)
    )

    const trieMapV = Trie.empty<number>().pipe(
      Trie.insert("she", 2)
    )

    const trieMapK = Trie.empty<number>().pipe(
      Trie.insert("shells", 0),
      Trie.insert("sells", 1)
    )

    strictEqual(Equal.equals(Trie.filter(trie, (v) => v > 1), trieMapV), true)
    strictEqual(Equal.equals(Trie.filter(trie, (_, k) => k.length > 3), trieMapK), true)
  })

  it("filterMap keeps Result successes and can use keys", () => {
    const trie = Trie.empty<number>().pipe(
      Trie.insert("shells", 0),
      Trie.insert("sells", 1),
      Trie.insert("she", 2)
    )

    const trieMapV = Trie.empty<number>().pipe(
      Trie.insert("she", 2)
    )

    const trieMapK = Trie.empty<number>().pipe(
      Trie.insert("shells", 0),
      Trie.insert("sells", 1)
    )

    strictEqual(Equal.equals(Trie.filterMap(trie, (v) => v > 1 ? Result.succeed(v) : Result.failVoid), trieMapV), true)
    strictEqual(
      Equal.equals(Trie.filterMap(trie, (v, k) => k.length > 3 ? Result.succeed(v) : Result.failVoid), trieMapK),
      true
    )
  })

  it("compact keeps Some values", () => {
    const trie = Trie.empty<Option.Option<number>>().pipe(
      Trie.insert("shells", Option.some(0)),
      Trie.insert("sells", Option.none()),
      Trie.insert("she", Option.some(2))
    )

    const trieMapV = Trie.empty<number>().pipe(
      Trie.insert("shells", 0),
      Trie.insert("she", 2)
    )

    strictEqual(Equal.equals(Trie.compact(trie), trieMapV), true)
  })

  it("modify updates an existing key and ignores a missing key", () => {
    const trie = Trie.empty<number>().pipe(
      Trie.insert("shells", 0),
      Trie.insert("sells", 1),
      Trie.insert("she", 2)
    )

    deepStrictEqual(trie.pipe(Trie.modify("she", (v) => v + 10), Trie.get("she")), Option.some(12))
    strictEqual(Equal.equals(trie.pipe(Trie.modify("me", (v) => v)), trie), true)
  })

  it("removeMany deletes all matching keys", () => {
    const trie = Trie.empty<number>().pipe(
      Trie.insert("shells", 0),
      Trie.insert("sells", 1),
      Trie.insert("she", 2)
    )

    strictEqual(
      Equal.equals(trie.pipe(Trie.removeMany(["she", "sells"])), Trie.empty<number>().pipe(Trie.insert("shells", 0))),
      true
    )
  })

  it("insertMany inserts all entries", () => {
    const trie = Trie.empty<number>().pipe(
      Trie.insert("shells", 0),
      Trie.insert("sells", 1),
      Trie.insert("she", 2)
    )

    const trieInsert = Trie.empty<number>().pipe(
      Trie.insert("shells", 0),
      Trie.insertMany(
        [["sells", 1], ["she", 2]]
      )
    )

    strictEqual(
      Equal.equals(trie, trieInsert),
      true
    )
  })

  it("reduce visits entries in key order", () => {
    const trie = Trie.empty<number>().pipe(
      Trie.insert("shells", 0),
      Trie.insert("sells", 1),
      Trie.insert("she", 2)
    )

    strictEqual(
      trie.pipe(
        Trie.reduce(0, (acc, n) => acc + n)
      ),
      3
    )
    strictEqual(
      trie.pipe(
        Trie.reduce(10, (acc, n) => acc + n)
      ),
      13
    )
    strictEqual(
      trie.pipe(
        Trie.reduce("", (acc, _, key) => acc + key)
      ),
      "sellssheshells"
    )
  })

  it("forEach", () => {
    let value = 0

    Trie.empty<number>().pipe(
      Trie.insert("shells", 0),
      Trie.insert("sells", 1),
      Trie.insert("she", 2),
      Trie.forEach((n, key) => {
        value += n + key.length
      })
    )

    strictEqual(value, 17)
  })

  it("Equal compares tries by entries", () => {
    strictEqual(
      Equal.equals(Trie.empty<number>(), Trie.empty<number>()),
      true
    )
    strictEqual(
      Equal.equals(
        Trie.make(["call", 0], ["me", 1]),
        Trie.make(["call", 0], ["me", 1])
      ),
      true
    )
  })
})
