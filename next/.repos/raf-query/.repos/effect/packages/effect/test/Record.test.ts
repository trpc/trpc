import { assertFalse, assertNone, assertSome, assertTrue, deepStrictEqual, strictEqual } from "@effect/vitest/utils"
import { Equivalence, Number as Num, Option, Record, Result } from "effect"
import { pipe } from "effect/Function"
import { describe, it } from "vitest"

describe("Record", () => {
  it("singleton", () => {
    deepStrictEqual(Record.singleton("a", 1), { a: 1 })
    deepStrictEqual(Record.singleton("__proto__", 1), { ["__proto__"]: 1 })
  })

  it("makeReducerUnion", () => {
    const R = Record.makeReducerUnion(Num.ReducerSum)

    deepStrictEqual(R.combine({ a: 1, b: 2 }, { a: 3, b: 4, c: 5 }), { a: 4, b: 6, c: 5 })
  })

  it("makeReducerIntersection", () => {
    const R = Record.makeReducerIntersection(Num.ReducerSum)

    deepStrictEqual(R.combine({ a: 1, b: 2 }, { a: 3, b: 4, c: 5 }), { a: 4, b: 6 })
  })
})

const symA = Symbol.for("a")
const symB = Symbol.for("b")
const symC = Symbol.for("c")

const stringRecord: Record<string, number> = { a: 1, [symA]: null }
const symbolRecord: Record<symbol, number> = { [symA]: 1, [symB]: 2 }

describe("Record", () => {
  describe("string | symbol APIs", () => {
    it("empty", () => {
      deepStrictEqual(Record.empty(), {})
    })

    it("fromIterableWith", () => {
      deepStrictEqual(Record.fromIterableWith([1, 2, 3, 4], (a) => [a === 3 ? "a" : String(a), a * 2]), {
        "1": 2,
        "2": 4,
        a: 6,
        "4": 8
      })
      deepStrictEqual(Record.fromIterableWith([1, 2, 3, 4], (a) => [a === 3 ? symA : String(a), a * 2]), {
        "1": 2,
        "2": 4,
        [symA]: 6,
        "4": 8
      })
    })

    it("fromIterableBy", () => {
      const users = [
        { id: "2", name: "name2" },
        { id: "1", name: "name1" }
      ]
      deepStrictEqual(Record.fromIterableBy(users, (user) => user.id), {
        "2": { id: "2", name: "name2" },
        "1": { id: "1", name: "name1" }
      })

      deepStrictEqual(Record.fromIterableBy(["a", symA], (s) => s), { a: "a", [symA]: symA })

      deepStrictEqual(pipe(users, Record.fromIterableBy((user) => user.id)), {
        "2": { id: "2", name: "name2" },
        "1": { id: "1", name: "name1" }
      })
    })

    it("fromEntries", () => {
      deepStrictEqual(Record.fromEntries([["1", 2], ["2", 4], ["3", 6], ["4", 8]]), {
        "1": 2,
        "2": 4,
        "3": 6,
        "4": 8
      })
      deepStrictEqual(Record.fromEntries([["1", 2], ["2", 4], ["3", 6], ["4", 8], [symA, 10], [symB, 12]]), {
        "1": 2,
        "2": 4,
        "3": 6,
        "4": 8,
        [symA]: 10,
        [symB]: 12
      })
    })

    it("has", () => {
      assertTrue(Record.has(stringRecord, "a"))
      assertFalse(Record.has(stringRecord, "c"))

      assertTrue(Record.has(symbolRecord, symA))
      assertFalse(Record.has(symbolRecord, symC))
    })

    it("get", () => {
      assertNone(pipe(Record.empty<string>(), Record.get("a")))
      assertSome(pipe(stringRecord, Record.get("a")), 1)

      assertNone(pipe(Record.empty<symbol>(), Record.get(symA)))
      assertSome(pipe(symbolRecord, Record.get(symA)), 1)
    })

    it("modify", () => {
      assertNone(pipe(Record.empty<string>(), Record.modify("a", (n) => n + 1)))
      assertSome(pipe(stringRecord, Record.modify("a", (n: number) => n + 1)), { a: 2, [symA]: null })
      assertSome(pipe(stringRecord, Record.modify("a", (n: number) => String(n))), { a: "1", [symA]: null })

      assertNone(pipe(Record.empty<symbol>(), Record.modify(symA, (n) => n + 1)))
      assertSome(pipe(symbolRecord, Record.modify(symA, (n: number) => n + 1)), { [symA]: 2, [symB]: 2 })
      assertSome(
        pipe(symbolRecord, Record.modify(symA, (n: number) => String(n))),
        { [symA]: "1", [symB]: 2 }
      )
    })

    it("replace", () => {
      assertNone(pipe(Record.empty<string>(), Record.replace("a", 2)))
      assertSome(pipe(stringRecord, Record.replace("a", 2)), { a: 2, [symA]: null })
      assertSome(pipe(stringRecord, Record.replace("a", true)), { a: true, [symA]: null })

      assertNone(pipe(Record.empty<symbol>(), Record.replace(symA, 2)))
      assertSome(pipe(symbolRecord, Record.replace(symA, 2)), { [symA]: 2, [symB]: 2 })
      assertSome(pipe(symbolRecord, Record.replace(symA, true)), { [symA]: true, [symB]: 2 })
    })

    it("remove", () => {
      deepStrictEqual(Record.remove(stringRecord, "a"), { [symA]: null })
      deepStrictEqual(Record.remove(stringRecord, "c"), stringRecord)

      deepStrictEqual(Record.remove(symbolRecord, symA), { [symB]: 2 })
      deepStrictEqual(Record.remove(symbolRecord, symC), symbolRecord)
    })

    describe("pop", () => {
      it("should return the value associated with the given key, if the key is present in the record", () => {
        const result1 = Record.pop(stringRecord, "a")
        assertSome(result1, [1, { [symA]: null }])

        const result2 = Record.pop(symbolRecord, symA)
        assertSome(result2, [1, { [symB]: 2 }])
      })

      it("should return none if the key is not present in the record", () => {
        const result1 = Record.pop(stringRecord, "c")
        assertNone(result1)

        const result2 = Record.pop(symbolRecord, symC)
        assertNone(result2)
      })
    })

    describe("set", () => {
      it("should replace an existing value", () => {
        deepStrictEqual(Record.set(stringRecord, "a", 2), { a: 2, [symA]: null })

        deepStrictEqual(Record.set(symbolRecord, symA, 2), { [symA]: 2, [symB]: 2 })
      })

      it("should add the key / value pair", () => {
        deepStrictEqual(Record.set(stringRecord, "c", 3), { a: 1, [symA]: null, c: 3 })

        deepStrictEqual(Record.set(symbolRecord, symC, 3), { [symA]: 1, [symB]: 2, [symC]: 3 })
      })
    })

    describe("assignProperty", () => {
      it("preserves __proto__ as an own property", () => {
        const record: Record<string, unknown> = {}
        const prototype = Object.getPrototypeOf(record)
        const value = { polluted: true }

        Record.assignProperty(record, "__proto__", value)

        strictEqual(Object.getPrototypeOf(record), prototype)
        assertTrue(Object.hasOwn(record, "__proto__"))
        strictEqual(record["__proto__"], value)
      })
    })

    it("singleton", () => {
      deepStrictEqual(Record.singleton("a", 1), { a: 1 })

      deepStrictEqual(Record.singleton(symA, 1), { [symA]: 1 })
    })
  })

  describe("string only APIs", () => {
    it("map", () => {
      deepStrictEqual(pipe(stringRecord, Record.map((n) => n * 2)), { a: 2, [symA]: null })
      deepStrictEqual(pipe(stringRecord, Record.map((n, k) => `${k}-${n}`)), { a: "a-1", [symA]: null })
    })

    it("collect", () => {
      const x = { a: 1, b: 2, c: 3, [symA]: null }
      deepStrictEqual(Record.collect(x, (key, n) => [key, n]), [["a", 1], ["b", 2], ["c", 3]])
    })

    it("toEntries", () => {
      const x = { a: 1, b: 2, c: 3, [symA]: null }
      deepStrictEqual(Record.toEntries(x), [["a", 1], ["b", 2], ["c", 3]])
    })

    it("filterMap", () => {
      const x: Record<string, number> = { a: 1, b: 2, c: 3, [symA]: null }
      const filtered = Record.filterMap(x, (value, key) => (value > 2 ? Result.succeed(key) : Result.failVoid))
      deepStrictEqual(filtered, { c: "c" })
    })

    it("getSomes", () => {
      const x = { a: Option.some(1), b: Option.none(), c: Option.some(2), [symA]: null }
      deepStrictEqual(Record.getSomes(x), { a: 1, c: 2 })
    })

    it("filter", () => {
      const x: Record<string, number> = { a: 1, b: 2, c: 3, d: 4, [symA]: null }
      deepStrictEqual(Record.filter(x, (value) => value > 2), { c: 3, d: 4 })
    })

    it("partition", () => {
      const f = (n: number) => (n > 2 ? Result.succeed(n + 1) : Result.fail(n - 1))
      deepStrictEqual(Record.partition({}, f), [{}, {}])
      deepStrictEqual(Record.partition({ a: 1, b: 3, [symA]: null }, f), [{ b: 4 }, { a: 0 }])
    })

    it("separate", () => {
      deepStrictEqual(
        Record.separate({ a: Result.fail("e"), b: Result.succeed(1), [symA]: null }),
        [{ b: 1 }, { a: "e" }]
      )
      // should ignore non own properties
      const o: Record.ReadonlyRecord<"a", Result.Result<number, string>> = Object.create({ a: 1 })
      deepStrictEqual(pipe(o, Record.separate), [{}, {}])
    })

    it("isEmptyRecord", () => {
      deepStrictEqual(Record.isEmptyRecord({}), true)
      deepStrictEqual(Record.isEmptyRecord({ [symA]: null }), true)
      deepStrictEqual(Record.isEmptyRecord({ a: 3 }), false)
    })

    it("isEmptyReadonlyRecord", () => {
      deepStrictEqual(Record.isEmptyReadonlyRecord({}), true)
      deepStrictEqual(Record.isEmptyReadonlyRecord({ [symA]: null }), true)
      deepStrictEqual(Record.isEmptyReadonlyRecord({ a: 3 }), false)
    })

    it("size", () => {
      deepStrictEqual(Record.size({ a: "a", b: 1, c: true, [symA]: null }), 3)
    })

    it("keys", () => {
      deepStrictEqual(Record.keys({ a: 1, b: 2, [symA]: null }), ["a", "b"])
    })

    it("values", () => {
      deepStrictEqual(Record.values({ a: 1, b: 2, [symA]: null }), [1, 2])
    })

    it("isSubrecord", () => {
      assertTrue(Record.isSubrecord(Record.empty(), {}))
      assertTrue(Record.isSubrecord(Record.empty<string>(), { a: 1 }))
      assertTrue(Record.isSubrecord({ a: 1 }, { a: 1 }))
      assertTrue(Record.isSubrecord(stringRecord, { a: 1 }))
      assertTrue(Record.isSubrecord({ a: 1 }, stringRecord))
      assertTrue(Record.isSubrecord({ a: 1 } as Record<string, number>, { a: 1, b: 2 }))
      assertTrue(Record.isSubrecord({ b: 2, a: 1 }, { a: 1, b: 2 }))
      assertFalse(Record.isSubrecord({ a: 1 }, { a: 2 }))
      assertFalse(Record.isSubrecord({ b: 2 } as Record<string, number>, { a: 1 }))
    })

    it("reduce", () => {
      // data-first
      deepStrictEqual(
        Record.reduce({ k1: "a", k2: "b", [symA]: null }, "-", (accumulator, value, key) => accumulator + key + value),
        "-k1ak2b"
      )
      // data-last
      deepStrictEqual(
        pipe(
          { k1: "a", k2: "b", [symA]: null },
          Record.reduce("-", (accumulator, value, key) => accumulator + key + value)
        ),
        "-k1ak2b"
      )
    })

    it("every", () => {
      assertTrue(Record.every((n: number) => n <= 2)({ a: 1, b: 2, [symA]: null }))
      assertFalse(Record.every((n: number) => n <= 1)({ a: 1, b: 2, [symA]: null }))
    })

    it("some", () => {
      assertTrue(Record.some((n: number) => n <= 1)({ a: 1, b: 2, [symA]: null }))
      assertFalse(Record.some((n: number) => n <= 0)({ a: 1, b: 2, [symA]: null }))
    })

    it("union", () => {
      const combine = (s1: string, s2: string) => s1 + s2
      const x: Record.ReadonlyRecord<string, string> = {
        a: "a1",
        b: "b1",
        c: "c1",
        [symA]: null
      }
      const y: Record.ReadonlyRecord<string, string> = {
        b: "b2",
        c: "c2",
        d: "d2",
        [symA]: null
      }
      deepStrictEqual(Record.union(x, {}, combine), x)
      deepStrictEqual(Record.union({}, x, combine), x)
      deepStrictEqual(Record.union(x, {}, combine), x)
      deepStrictEqual(Record.union({}, x, combine), x)
      deepStrictEqual(Record.union(x, y, combine), {
        a: "a1",
        b: "b1b2",
        c: "c1c2",
        d: "d2"
      })
    })

    it("intersection", () => {
      const combine = (s1: string, s2: string) => s1 + s2
      const x: Record.ReadonlyRecord<string, string> = {
        a: "a1",
        b: "b1",
        c: "c1",
        [symA]: null
      }
      const y: Record.ReadonlyRecord<string, string> = {
        b: "b2",
        c: "c2",
        d: "d2",
        [symA]: null
      }
      deepStrictEqual(Record.intersection(x, {}, combine), {})
      deepStrictEqual(Record.intersection({}, y, combine), {})
      deepStrictEqual(Record.intersection(x, y, combine), {
        b: "b1b2",
        c: "c1c2"
      })
    })

    it("difference", () => {
      const x: Record.ReadonlyRecord<string, string> = {
        a: "a1",
        b: "b1",
        c: "c1",
        [symA]: null
      }
      const y: Record.ReadonlyRecord<string, string> = {
        b: "b2",
        c: "c2",
        d: "d2",
        [symA]: null
      }
      deepStrictEqual(Record.difference({}, x), x)
      deepStrictEqual(Record.difference(x, {}), x)
      deepStrictEqual(Record.difference({}, x), x)
      deepStrictEqual(Record.difference(x, {}), x)
      deepStrictEqual(Record.difference(x, y), {
        a: "a1",
        d: "d2"
      })
    })

    it("makeEquivalence", () => {
      deepStrictEqual(Record.makeEquivalence(Equivalence.strictEqual<number>())({ a: 1 }, { a: 1 }), true)
      deepStrictEqual(Record.makeEquivalence(Equivalence.strictEqual<number>())({ a: 1 }, stringRecord), true)
      deepStrictEqual(Record.makeEquivalence(Equivalence.strictEqual<number>())({ a: 1 }, { a: 2 }), false)
      deepStrictEqual(Record.makeEquivalence(Equivalence.strictEqual<number>())({ a: 1 }, { b: 1 }), false)
      const noPrototypeObject = Object.create(null)
      deepStrictEqual(Record.makeEquivalence(Equivalence.strictEqual<number>())(noPrototypeObject, { b: 1 }), false)
    })

    it("mapKeys", () => {
      deepStrictEqual(pipe({ a: 1, b: 2, [symA]: null }, Record.mapKeys((key) => key.toUpperCase())), {
        A: 1,
        B: 2
      })
    })

    it("mapEntries", () => {
      deepStrictEqual(pipe(stringRecord, Record.mapEntries((a, key) => [key.toUpperCase(), a + 1])), { A: 2 })
    })

    describe("findFirst", () => {
      it("refinement/predicate", () => {
        const record = {
          a: 1,
          b: 2,
          c: 1
        }
        deepStrictEqual(
          pipe(record, Record.findFirst((v) => v < 2)),
          Option.some(["a", 1])
        )
        deepStrictEqual(
          pipe(record, Record.findFirst((v, k) => v < 2 && k !== "a")),
          Option.some(["c", 1])
        )
        assertNone(
          pipe(record, Record.findFirst((v) => v > 2))
        )
        deepStrictEqual(
          Record.findFirst(record, (v) => v < 2),
          Option.some(["a", 1])
        )
      })
    })
  })
})
