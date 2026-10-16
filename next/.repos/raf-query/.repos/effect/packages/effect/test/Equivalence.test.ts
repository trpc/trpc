import { describe, it } from "@effect/vitest"
import { assertFalse, assertTrue } from "@effect/vitest/utils"
import { Equivalence, pipe } from "effect"

describe("Equivalence", () => {
  it("String", () => {
    assertTrue(Equivalence.String("a", "a"))
    assertFalse(Equivalence.String("a", "b"))
  })

  it("Number", () => {
    assertTrue(Equivalence.Number(1, 1))
    assertFalse(Equivalence.Number(1, 2))
    assertTrue(Equivalence.Number(NaN, NaN))
    assertFalse(Equivalence.Number(NaN, 1))
    assertFalse(Equivalence.Number(1, NaN))
    assertTrue(Equivalence.Number(0, -0))
  })

  it("Boolean", () => {
    assertTrue(Equivalence.Boolean(true, true))
    assertTrue(Equivalence.Boolean(false, false))
    assertFalse(Equivalence.Boolean(true, false))
    assertFalse(Equivalence.Boolean(false, true))
  })

  it("BigInt", () => {
    assertTrue(Equivalence.BigInt(1n, 1n))
    assertFalse(Equivalence.BigInt(1n, 2n))
  })

  it("mapInput", () => {
    interface Person {
      readonly name: string
      readonly age: number
    }
    const eqPerson = pipe(Equivalence.strictEqual<string>(), Equivalence.mapInput((p: Person) => p.name))
    assertTrue(eqPerson({ name: "a", age: 1 }, { name: "a", age: 2 }))
    assertTrue(eqPerson({ name: "a", age: 1 }, { name: "a", age: 1 }))
    assertFalse(eqPerson({ name: "a", age: 1 }, { name: "b", age: 1 }))
    assertFalse(eqPerson({ name: "a", age: 1 }, { name: "b", age: 2 }))
  })

  it("combine", () => {
    type T = readonly [string, number, boolean]
    const E0: Equivalence.Equivalence<T> = Equivalence.mapInput((x: T) => x[0])(Equivalence.strictEqual<string>())
    const E1: Equivalence.Equivalence<T> = Equivalence.mapInput((x: T) => x[1])(Equivalence.strictEqual<number>())
    const eqE0E1 = Equivalence.combine(E0, E1)
    assertTrue(eqE0E1(["a", 1, true], ["a", 1, true]))
    assertTrue(eqE0E1(["a", 1, true], ["a", 1, false]))
    assertFalse(eqE0E1(["a", 1, true], ["b", 1, true]))
    assertFalse(eqE0E1(["a", 1, true], ["a", 2, false]))
  })

  it("combineAll", () => {
    type T = readonly [string, number, boolean]
    const E0: Equivalence.Equivalence<T> = Equivalence.mapInput((x: T) => x[0])(Equivalence.strictEqual<string>())
    const E1: Equivalence.Equivalence<T> = Equivalence.mapInput((x: T) => x[1])(Equivalence.strictEqual<number>())
    const E2: Equivalence.Equivalence<T> = Equivalence.mapInput((x: T) => x[2])(Equivalence.strictEqual<boolean>())
    const eqE0E1E2 = Equivalence.combineAll([E0, E1, E2])
    assertTrue(eqE0E1E2(["a", 1, true], ["a", 1, true]))
    assertFalse(eqE0E1E2(["a", 1, true], ["b", 1, true]))
    assertFalse(eqE0E1E2(["a", 1, true], ["a", 2, true]))
    assertFalse(eqE0E1E2(["a", 1, true], ["a", 1, false]))
  })

  it("Tuple", () => {
    const eq = Equivalence.Tuple([Equivalence.strictEqual<string>(), Equivalence.strictEqual<number>()])

    assertTrue(eq(["a", 1], ["a", 1]))
    assertFalse(eq(["a", 1], ["c", 1]))
    assertFalse(eq(["a", 1], ["a", 2]))
  })

  it("Array", () => {
    const eq = Equivalence.Array(Equivalence.strictEqual<number>())

    assertTrue(eq([], []))
    assertTrue(eq([1, 2, 3], [1, 2, 3]))
    assertFalse(eq([1, 2, 3], [1, 2, 4]))
    assertFalse(eq([1, 2, 3], [1, 2]))
  })

  describe("Struct", () => {
    it("string keys", () => {
      const eq = Equivalence.Struct({
        a: Equivalence.strictEqual<string>(),
        b: Equivalence.strictEqual<number>()
      })

      assertTrue(eq({ a: "a", b: 1 }, { a: "a", b: 1 }))
      assertFalse(eq({ a: "a", b: 1 }, { a: "c", b: 1 }))
      assertFalse(eq({ a: "a", b: 1 }, { a: "a", b: 2 }))
    })

    it("symbol keys", () => {
      const a = Symbol.for("a")
      const b = Symbol.for("b")
      const eq = Equivalence.Struct({
        [a]: Equivalence.strictEqual<string>(),
        [b]: Equivalence.strictEqual<number>()
      })

      assertTrue(eq({ [a]: "a", [b]: 1 }, { [a]: "a", [b]: 1 }))
      assertFalse(eq({ [a]: "a", [b]: 1 }, { [a]: "c", [b]: 1 }))
      assertFalse(eq({ [a]: "a", [b]: 1 }, { [a]: "a", [b]: 2 }))
    })

    it("mixed keys", () => {
      const b = Symbol.for("b")
      const eq = Equivalence.Struct({
        a: Equivalence.strictEqual<string>(),
        [b]: Equivalence.strictEqual<number>()
      })

      assertTrue(eq({ a: "a", [b]: 1 }, { a: "a", [b]: 1 }))
      assertFalse(eq({ a: "a", [b]: 1 }, { a: "c", [b]: 1 }))
      assertFalse(eq({ a: "a", [b]: 1 }, { a: "a", [b]: 2 }))
    })
  })

  describe("Record", () => {
    it("string keys", () => {
      const eq = Equivalence.Record(Equivalence.strictEqual<number>())

      assertTrue(eq({ a: 1, b: 2 }, { a: 1, b: 2 }))
      assertFalse(eq({ a: 1, b: 2 }, { a: 1, b: 3 }))
      assertFalse(eq({ a: 1, b: 2 }, { a: 1 }))
      assertFalse(eq({ a: 1 }, { a: 1, b: 2 }))
    })

    it("symbol keys", () => {
      const a = Symbol.for("a")
      const b = Symbol.for("b")
      const eq = Equivalence.Record(Equivalence.strictEqual<number>())

      assertTrue(eq({ [a]: 1, [b]: 2 }, { [a]: 1, [b]: 2 }))
      assertFalse(eq({ [a]: 1, [b]: 2 }, { [a]: 1, [b]: 3 }))
      assertFalse(eq({ [a]: 1, [b]: 2 }, { [a]: 1 }))
      assertFalse(eq({ [a]: 1 }, { [a]: 1, [b]: 2 }))
    })

    it("mixed keys", () => {
      const b = Symbol.for("b")
      const eq = Equivalence.Record(Equivalence.strictEqual<number>())

      assertTrue(eq({ a: 1, [b]: 2 }, { a: 1, [b]: 2 }))
      assertFalse(eq({ a: 1, [b]: 2 }, { a: 1, [b]: 3 }))
      assertFalse(eq({ a: 1, [b]: 2 }, { a: 1 }))
      assertFalse(eq({ a: 1 }, { a: 1, [b]: 2 }))
    })
  })

  it("Date", () => {
    const d1 = new Date("2020-01-01T00:00:00.000Z")
    const d2 = new Date("2020-01-01T00:00:00.000Z")
    const d3 = new Date("2021-01-01T00:00:00.000Z")

    assertTrue(Equivalence.Date(d1, d2))
    assertFalse(Equivalence.Date(d1, d3))
    assertTrue(Equivalence.Date(d1, d1))

    const invalid1 = new Date("foo")
    const invalid2 = new Date("bar")

    assertTrue(Equivalence.Date(invalid1, invalid2))
    assertFalse(Equivalence.Date(invalid1, d1))
    assertFalse(Equivalence.Date(d1, invalid2))
  })
})
