import { Equivalence, Number, pipe, Schema, String, Tuple } from "effect"
import { TestSchema } from "effect/testing"
import { deepStrictEqual, strictEqual } from "node:assert"
import { describe, it } from "vitest"

const tuple = ["a", 2, true] as [string, number, boolean]

describe("Tuple", () => {
  it("make creates a tuple from ordered values", () => {
    deepStrictEqual(Tuple.make("a", 2, true), ["a", 2, true])
  })

  it("get", () => {
    strictEqual(pipe(tuple, Tuple.get(0)), "a")
    strictEqual(pipe(tuple, Tuple.get(1)), 2)

    strictEqual(Tuple.get(tuple, 0), "a")
    strictEqual(Tuple.get(tuple, 1), 2)
  })

  it("pick", () => {
    deepStrictEqual(pipe(tuple, Tuple.pick([0, 2])), ["a", true])
    deepStrictEqual(Tuple.pick(tuple, [0, 2]), ["a", true])
  })

  it("omit", () => {
    deepStrictEqual(pipe(tuple, Tuple.omit([1])), ["a", true])
    deepStrictEqual(Tuple.omit(tuple, [1]), ["a", true])
  })

  it("evolve", () => {
    deepStrictEqual(
      pipe(
        tuple,
        Tuple.evolve([
          (s) => s.length,
          undefined,
          (b) => `b: ${b}`
        ])
      ),
      [1, 2, "b: true"]
    )
    deepStrictEqual(
      Tuple.evolve(
        tuple,
        [
          (s) => s.length,
          undefined,
          (b) => `b: ${b}`
        ] as const
      ),
      [1, 2, "b: true"]
    )
  })

  describe("renameIndices", () => {
    it("partial index mapping", () => {
      deepStrictEqual(pipe(tuple, Tuple.renameIndices(["1", "0"])), [2, "a", true])
      deepStrictEqual(Tuple.renameIndices(tuple, ["1", "0"]), [2, "a", true])
    })

    it("full index mapping", () => {
      deepStrictEqual(pipe(tuple, Tuple.renameIndices(["2", "1", "0"])), [true, 2, "a"])
      deepStrictEqual(Tuple.renameIndices(tuple, ["2", "1", "0"]), [true, 2, "a"])
    })
  })

  it("map transforms every schema element with a lambda", () => {
    const tuple = [Schema.String, Schema.Number, Schema.Boolean] as const
    TestSchema.Asserts.ast.elements.equals(pipe(tuple, Tuple.map(Schema.NullOr)), [
      Schema.NullOr(Schema.String),
      Schema.NullOr(Schema.Number),
      Schema.NullOr(Schema.Boolean)
    ])
    TestSchema.Asserts.ast.elements.equals(Tuple.map(tuple, Schema.NullOr), [
      Schema.NullOr(Schema.String),
      Schema.NullOr(Schema.Number),
      Schema.NullOr(Schema.Boolean)
    ])
  })

  it("mapPick transforms only the selected schema elements", () => {
    const tuple = [Schema.String, Schema.Number, Schema.Boolean] as const
    TestSchema.Asserts.ast.elements.equals(pipe(tuple, Tuple.mapPick([0, 2], Schema.NullOr)), [
      Schema.NullOr(Schema.String),
      Schema.Number,
      Schema.NullOr(Schema.Boolean)
    ])
    TestSchema.Asserts.ast.elements.equals(Tuple.mapPick(tuple, [0, 2], Schema.NullOr), [
      Schema.NullOr(Schema.String),
      Schema.Number,
      Schema.NullOr(Schema.Boolean)
    ])
  })

  it("mapOmit transforms every schema element except the omitted indices", () => {
    const tuple = [Schema.String, Schema.Number, Schema.Boolean] as const
    TestSchema.Asserts.ast.elements.equals(pipe(tuple, Tuple.mapOmit([1], Schema.NullOr)), [
      Schema.NullOr(Schema.String),
      Schema.Number,
      Schema.NullOr(Schema.Boolean)
    ])
    TestSchema.Asserts.ast.elements.equals(Tuple.mapOmit(tuple, [1], Schema.NullOr), [
      Schema.NullOr(Schema.String),
      Schema.Number,
      Schema.NullOr(Schema.Boolean)
    ])
  })

  it("makeCombiner combines tuple positions independently", () => {
    const C = Tuple.makeCombiner([
      Number.ReducerSum,
      String.ReducerConcat
    ])

    deepStrictEqual(C.combine([1, "a"], [2, "b"]), [3, "ab"])
  })

  it("makeReducer derives a tuple-shaped initial value and combines position-wise", () => {
    const R = Tuple.makeReducer([
      Number.ReducerSum,
      String.ReducerConcat
    ])

    deepStrictEqual(R.initialValue, [0, ""])
  })

  it("appendElement appends a single element in both data-first and data-last forms", () => {
    deepStrictEqual(pipe(Tuple.make(1, 2), Tuple.appendElement("end")), [1, 2, "end"])
    deepStrictEqual(Tuple.appendElement(Tuple.make(1, 2), "end"), [1, 2, "end"])
  })

  it("appendElements concatenates a tuple in both data-first and data-last forms", () => {
    deepStrictEqual(pipe(Tuple.make(1, 2), Tuple.appendElements(["a", "b"] as const)), [1, 2, "a", "b"])
    deepStrictEqual(Tuple.appendElements(Tuple.make(1, 2), ["a", "b"] as const), [1, 2, "a", "b"])
  })

  it("makeEquivalence compares tuple positions independently", () => {
    const eq = Tuple.makeEquivalence([
      Equivalence.strictEqual<string>(),
      Equivalence.strictEqual<number>()
    ])

    strictEqual(eq(["Alice", 30], ["Alice", 30]), true)
    strictEqual(eq(["Alice", 30], ["Bob", 30]), false)
    strictEqual(eq(["Alice", 30], ["Alice", 31]), false)
  })

  it("makeOrder orders tuple positions lexicographically", () => {
    const ord = Tuple.makeOrder([String.Order, Number.Order])

    strictEqual(ord(["Alice", 30], ["Bob", 25]), -1)
    strictEqual(ord(["Alice", 30], ["Alice", 30]), 0)
    strictEqual(ord(["Bob", 25], ["Alice", 30]), 1)
    strictEqual(ord(["Alice", 30], ["Alice", 25]), 1)
  })
})
