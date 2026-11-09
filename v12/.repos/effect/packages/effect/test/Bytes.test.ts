import { describe, it } from "@effect/vitest"
import { assertFalse, assertTrue, deepStrictEqual, strictEqual } from "@effect/vitest/utils"
import { Bytes } from "effect"

const b = (...bytes: Array<number>) => new Uint8Array(bytes)

describe("Bytes", () => {
  it("concat", () => {
    deepStrictEqual(Bytes.concat([]), b())
    deepStrictEqual(Bytes.concat([b(1, 2, 3, 4).subarray(1, 3), b(), b(5)]), b(2, 3, 5))

    const single = b(1, 2)
    const copy = Bytes.concat([single])
    single[0] = 9
    deepStrictEqual(copy, b(1, 2))
  })

  it("Equivalence", () => {
    assertTrue(Bytes.Equivalence(b(1, 2), b(1, 2)))
    assertFalse(Bytes.Equivalence(b(1, 2), b(1, 3)))
    assertFalse(Bytes.Equivalence(b(1, 2), b(1)))
  })

  it("Order", () => {
    strictEqual(Bytes.Order(b(1, 2), b(1, 2)), 0)
    strictEqual(Bytes.Order(b(1, 2), b(1, 3)), -1)
    strictEqual(Bytes.Order(b(2), b(1, 9)), 1)
    strictEqual(Bytes.Order(b(1), b(1, 0)), -1)
    strictEqual(Bytes.Order(b(0xff), b(0x00)), 1)
  })
})
