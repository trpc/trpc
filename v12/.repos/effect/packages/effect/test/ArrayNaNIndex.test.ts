import { assert, describe, it } from "@effect/vitest"
import { Array as Arr, Option } from "effect"

const input = [1, 2, 3]

describe("Array NaN indexes", () => {
  it("rejects NaN in get", () => {
    assert.deepStrictEqual(Arr.get(input, Number.NaN), Option.none())
  })

  it("rejects NaN in getUnsafe", () => {
    assert.throws(() => Arr.getUnsafe(input, Number.NaN), /Index out of bounds/)
  })

  it("rejects NaN in insertAt", () => {
    assert.deepStrictEqual(Arr.insertAt(input, Number.NaN, 4), Option.none())
  })

  it("rejects NaN in replace", () => {
    assert.deepStrictEqual(Arr.replace(input, Number.NaN, 4), Option.none())
  })

  it("rejects NaN in modify", () => {
    assert.deepStrictEqual(Arr.modify(input, Number.NaN, (n) => n * 2), Option.none())
  })

  it("treats removing NaN as an out-of-bounds no-op", () => {
    assert.deepStrictEqual(Arr.remove(input, Number.NaN), input)
  })
})

describe("Array fractional indexes", () => {
  it("floors the index in replace", () => {
    assert.deepStrictEqual(Arr.replace(input, 1.5, 4), Option.some([1, 4, 3]))
  })

  it("floors the index in modify", () => {
    assert.deepStrictEqual(Arr.modify(input, 1.5, (n) => n * 2), Option.some([1, 4, 3]))
  })
})
