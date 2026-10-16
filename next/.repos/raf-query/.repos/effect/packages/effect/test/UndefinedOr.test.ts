import { Number, UndefinedOr } from "effect"
import { describe, it } from "vitest"
import { strictEqual, throws } from "./utils/assert.ts"

describe("UndefinedOr", () => {
  it("map", () => {
    const f = (a: number) => a + 1
    strictEqual(UndefinedOr.map(f)(1), 2)
    strictEqual(UndefinedOr.map(1, f), 2)
    strictEqual(UndefinedOr.map(f)(undefined), undefined)
    strictEqual(UndefinedOr.map(undefined, f), undefined)
  })

  it("match", () => {
    strictEqual(UndefinedOr.match(1, { onDefined: (a) => a, onUndefined: () => 0 }), 1)
    strictEqual(UndefinedOr.match(undefined, { onDefined: (a) => a, onUndefined: () => 0 }), 0)
  })

  it("getOrThrowWith", () => {
    strictEqual(UndefinedOr.getOrThrowWith(1, () => new Error("test")), 1)
    throws(() => UndefinedOr.getOrThrowWith(undefined, () => new Error("test")), new Error("test"))
  })

  it("getOrThrow returns defined values and throws the default missing error", () => {
    strictEqual(UndefinedOr.getOrThrow(1), 1)
    throws(() => UndefinedOr.getOrThrow(undefined), new Error("getOrThrow called on a undefined"))
  })

  it("liftThrowable", () => {
    const f = (a: number) => {
      if (a === 0) {
        throw new Error("test")
      }
      return a + 1
    }
    strictEqual(UndefinedOr.liftThrowable(f)(1), 2)
    strictEqual(UndefinedOr.liftThrowable(f)(0), undefined)
  })

  it("makeReducer", () => {
    const R = UndefinedOr.makeReducer(Number.ReducerSum)

    strictEqual(R.combine(1, 2), 3)
    strictEqual(R.combine(1, undefined), 1)
    strictEqual(R.combine(undefined, 2), 2)
    strictEqual(R.combine(undefined, undefined), undefined)
  })

  it("makeReducerFailFast", () => {
    const R = UndefinedOr.makeReducerFailFast(Number.ReducerSum)

    strictEqual(R.combine(1, 2), 3)
    strictEqual(R.combine(1, undefined), undefined)
    strictEqual(R.combine(undefined, 2), undefined)
    strictEqual(R.combine(undefined, undefined), undefined)

    strictEqual(R.combine(undefined, R.initialValue), undefined)
    strictEqual(R.combine(R.initialValue, undefined), undefined)
    strictEqual(R.combine(1, R.initialValue), 1)
    strictEqual(R.combine(R.initialValue, 1), 1)

    strictEqual(R.combineAll([1, undefined, 2]), undefined)
    strictEqual(R.combineAll([1, 2]), 3)
  })
})
