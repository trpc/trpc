import { Ordering } from "effect"
import { deepStrictEqual } from "node:assert"
import { describe, it } from "vitest"

describe("Ordering", () => {
  it("Reducer", () => {
    const R = Ordering.Reducer

    deepStrictEqual(R.combine(-1, 1), -1)
    deepStrictEqual(R.combine(1, -1), 1)
    deepStrictEqual(R.combine(1, 1), 1)
    deepStrictEqual(R.combine(0, 0), 0)
    deepStrictEqual(R.combine(0, 1), 1)
    deepStrictEqual(R.combine(1, 0), 1)
    deepStrictEqual(R.combine(0, -1), -1)
    deepStrictEqual(R.combine(-1, 0), -1)
  })

  it("reverse flips less-than and greater-than and leaves equal unchanged", () => {
    deepStrictEqual(Ordering.reverse(-1), 1)
    deepStrictEqual(Ordering.reverse(1), -1)
    deepStrictEqual(Ordering.reverse(0), 0)
  })

  it("match selects the branch for the ordering in both data-first and data-last forms", () => {
    const toMessage = Ordering.match({
      onLessThan: () => "less than",
      onEqual: () => "equal",
      onGreaterThan: () => "greater than"
    })

    deepStrictEqual(toMessage(-1), "less than")
    deepStrictEqual(toMessage(0), "equal")
    deepStrictEqual(toMessage(1), "greater than")

    deepStrictEqual(
      Ordering.match(1, { onLessThan: () => "l", onEqual: () => "e", onGreaterThan: () => "g" }),
      "g"
    )
  })
})
