import { describe, it } from "@effect/vitest"
import { assertFalse, assertTrue, deepStrictEqual, strictEqual } from "@effect/vitest/utils"
import { Array as Arr, Order, pipe } from "effect"

describe("Order", () => {
  it("Struct", () => {
    const O = Order.Struct({ a: Order.String, b: Order.String })
    strictEqual(O({ a: "a", b: "b" }, { a: "a", b: "c" }), -1)
    strictEqual(O({ a: "a", b: "b" }, { a: "a", b: "b" }), 0)
    strictEqual(O({ a: "a", b: "c" }, { a: "a", b: "b" }), 1)
  })

  it("Tuple", () => {
    const O = Order.Tuple([Order.String, Order.String])
    strictEqual(O(["a", "b"], ["a", "c"]), -1)
    strictEqual(O(["a", "b"], ["a", "b"]), 0)
    strictEqual(O(["a", "b"], ["a", "a"]), 1)
    strictEqual(O(["a", "b"], ["b", "a"]), -1)
  })

  it("mapInput", () => {
    const O = Order.mapInput(Order.Number, (s: string) => s.length)
    strictEqual(O("a", "b"), 0)
    strictEqual(O("a", "bb"), -1)
    strictEqual(O("aa", "b"), 1)
  })

  it("Number compares numeric values and treats NaN as the lowest value", () => {
    const O = Order.Number
    strictEqual(O(1, 1), 0)
    strictEqual(O(1, 2), -1)
    strictEqual(O(2, 1), 1)
    strictEqual(O(0, -0), 0)

    strictEqual(O(NaN, NaN), 0)
    strictEqual(O(NaN, 1), -1)
    strictEqual(O(1, NaN), 1)
  })

  it("Date compares by timestamp", () => {
    const O = Order.Date
    strictEqual(O(new Date(0), new Date(1)), -1)
    strictEqual(O(new Date(1), new Date(1)), 0)
    strictEqual(O(new Date(1), new Date(0)), 1)
  })

  it("clamp keeps values inside inclusive bounds", () => {
    const clamp = Order.clamp(Order.Number)({ minimum: 1, maximum: 10 })
    strictEqual(clamp(2), 2)
    strictEqual(clamp(10), 10)
    strictEqual(clamp(20), 10)
    strictEqual(clamp(1), 1)
    strictEqual(clamp(-10), 1)

    strictEqual(Order.clamp(Order.Number)({ minimum: 1, maximum: 10 })(2), 2)
  })

  it("isBetween checks inclusive bounds", () => {
    const between = Order.isBetween(Order.Number)({ minimum: 1, maximum: 10 })
    assertTrue(between(2))
    assertTrue(between(10))
    assertFalse(between(20))
    assertTrue(between(1))
    assertFalse(between(-10))

    assertTrue(Order.isBetween(Order.Number)(2, { minimum: 1, maximum: 10 }))
  })

  it("flip reverses an existing order", () => {
    const O = Order.flip(Order.Number)
    strictEqual(O(1, 2), 1)
    strictEqual(O(2, 1), -1)
    strictEqual(O(2, 2), 0)
  })

  it("isLessThan returns true only for strictly smaller values", () => {
    const lessThan = Order.isLessThan(Order.Number)
    assertTrue(lessThan(0, 1))
    assertFalse(lessThan(1, 1))
    assertFalse(lessThan(2, 1))
  })

  it("isLessThanOrEqualTo returns true for smaller or equal values", () => {
    const lessThanOrEqualTo = Order.isLessThanOrEqualTo(Order.Number)
    assertTrue(lessThanOrEqualTo(0, 1))
    assertTrue(lessThanOrEqualTo(1, 1))
    assertFalse(lessThanOrEqualTo(2, 1))
  })

  it("isGreaterThan returns true only for strictly greater values", () => {
    const greaterThan = Order.isGreaterThan(Order.Number)
    assertFalse(greaterThan(0, 1))
    assertFalse(greaterThan(1, 1))
    assertTrue(greaterThan(2, 1))
  })

  it("isGreaterThanOrEqualTo returns true for greater or equal values", () => {
    const greaterThanOrEqualTo = Order.isGreaterThanOrEqualTo(Order.Number)
    assertFalse(greaterThanOrEqualTo(0, 1))
    assertTrue(greaterThanOrEqualTo(1, 1))
    assertTrue(greaterThanOrEqualTo(2, 1))
  })

  it("min", () => {
    type A = { a: number }
    const min = Order.min(
      pipe(
        Order.Number,
        Order.mapInput((a: A) => a.a)
      )
    )
    deepStrictEqual(min({ a: 1 }, { a: 2 }), { a: 1 })
    deepStrictEqual(min({ a: 2 }, { a: 1 }), { a: 1 })
    const first = { a: 1 }
    const second = { a: 1 }
    deepStrictEqual(min(first, second), first)
  })

  it("max", () => {
    type A = { a: number }
    const max = Order.max(
      pipe(
        Order.Number,
        Order.mapInput((a: A) => a.a)
      )
    )
    deepStrictEqual(max({ a: 1 }, { a: 2 }), { a: 2 })
    deepStrictEqual(max({ a: 2 }, { a: 1 }), { a: 2 })
    const first = { a: 1 }
    const second = { a: 1 }
    deepStrictEqual(max(first, second), first)
  })

  it("combineAll reuses finite criteria across comparisons", () => {
    const O = Order.combineAll([Order.Number].values())
    strictEqual(O(1, 2), -1)
    strictEqual(O(1, 2), -1)
  })

  it("combine", () => {
    type T = [number, string]
    const tuples: Array<T> = [
      [2, "c"],
      [1, "b"],
      [2, "a"],
      [1, "c"]
    ]
    const sortByFst = pipe(
      Order.Number,
      Order.mapInput((x: T) => x[0])
    )
    const sortBySnd = pipe(
      Order.String,
      Order.mapInput((x: T) => x[1])
    )
    deepStrictEqual(Arr.sort(Order.combine(sortByFst, sortBySnd))(tuples), [
      [1, "b"],
      [1, "c"],
      [2, "a"],
      [2, "c"]
    ])
    deepStrictEqual(Arr.sort(Order.combine(sortBySnd, sortByFst))(tuples), [
      [2, "a"],
      [1, "b"],
      [1, "c"],
      [2, "c"]
    ])
  })
})
