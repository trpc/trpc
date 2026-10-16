import { Combiner, Number, String } from "effect"
import { describe, it } from "vitest"
import { strictEqual } from "./utils/assert.ts"

describe("Combiner", () => {
  it("flip", () => {
    const C = Combiner.flip(String.ReducerConcat)
    strictEqual(C.combine("a", "b"), "ba")
  })

  it("min", () => {
    const C = Combiner.min(Number.Order)
    strictEqual(C.combine(1, 2), 1)
    strictEqual(C.combine(2, 1), 1)
  })

  it("max", () => {
    const C = Combiner.max(Number.Order)
    strictEqual(C.combine(1, 2), 2)
    strictEqual(C.combine(2, 1), 2)
  })

  it("first", () => {
    const C = Combiner.first<number>()
    strictEqual(C.combine(1, 2), 1)
  })

  it("last", () => {
    const C = Combiner.last<number>()
    strictEqual(C.combine(1, 2), 2)
  })

  it("constant", () => {
    const C = Combiner.constant(0)
    strictEqual(C.combine(1, 2), 0)
  })

  it("intercalate", () => {
    const C = Combiner.intercalate("+")(String.ReducerConcat)
    strictEqual(C.combine("a", "b"), "a+b")
  })
})
