import { Equivalence, Newtype, Number, Order } from "effect"
import { describe, it } from "vitest"
import { assertFalse, assertTrue, strictEqual } from "./utils/assert.ts"

interface Label extends Newtype.Newtype<"Label", string> {}
interface UserId extends Newtype.Newtype<"UserId", number> {}

const labelIso = Newtype.makeIso<Label>()
const userIdIso = Newtype.makeIso<UserId>()

describe("value", () => {
  it("returns the underlying carrier value", () => {
    const label = labelIso.set("a")
    strictEqual(Newtype.value(label), "a")
  })

  it("is an identity function at runtime", () => {
    const raw = "test"
    const label = labelIso.set(raw)
    strictEqual(Newtype.value(label), raw)
  })
})

describe("makeIso", () => {
  it("set wraps and get unwraps roundtrip", () => {
    const label = labelIso.set("roundtrip")
    strictEqual(labelIso.get(label), "roundtrip")
  })

  it("preserves the value through wrap/unwrap", () => {
    const original = "preserve"
    strictEqual(labelIso.get(labelIso.set(original)), original)
  })
})

describe("makeEquivalence", () => {
  const eq = Newtype.makeEquivalence<Label>(Equivalence.String)

  it("returns true for equal values", () => {
    assertTrue(eq(labelIso.set("a"), labelIso.set("a")))
  })

  it("returns false for different values", () => {
    assertFalse(eq(labelIso.set("a"), labelIso.set("b")))
  })
})

describe("makeOrder", () => {
  const ord = Newtype.makeOrder<UserId>(Order.Number)

  it("orders a lower carrier number before a higher one", () => {
    strictEqual(ord(userIdIso.set(1), userIdIso.set(2)), -1)
  })

  it("orders a higher carrier number after a lower one", () => {
    strictEqual(ord(userIdIso.set(2), userIdIso.set(1)), 1)
  })

  it("treats equal carrier numbers as equivalent", () => {
    strictEqual(ord(userIdIso.set(5), userIdIso.set(5)), 0)
  })
})

describe("makeCombiner", () => {
  const combiner = Newtype.makeCombiner<UserId>(Number.ReducerSum)

  it("combines two newtype values", () => {
    const result = combiner.combine(userIdIso.set(10), userIdIso.set(20))
    strictEqual(Newtype.value(result), 30)
  })
})

describe("makeReducer", () => {
  const reducer = Newtype.makeReducer<UserId>(Number.ReducerSum)

  it("reduces a collection of newtype values", () => {
    const result = reducer.combineAll([userIdIso.set(1), userIdIso.set(2), userIdIso.set(3)])
    strictEqual(Newtype.value(result), 6)
  })

  it("uses the lifted initial value for an empty collection", () => {
    const result = reducer.combineAll([])
    strictEqual(Newtype.value(result), 0)
  })

  it("combines two newtype values using the carrier reducer", () => {
    const result = reducer.combine(userIdIso.set(10), userIdIso.set(5))
    strictEqual(Newtype.value(result), 15)
  })
})
