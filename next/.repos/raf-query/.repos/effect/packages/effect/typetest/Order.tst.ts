import { Order } from "effect"
import { describe, expect, it } from "tstyche"

describe("Order", () => {
  it("Tuple", () => {
    const O = Order.Tuple([Order.Number, Order.String])
    expect(O).type.toBe<Order.Order<readonly [number, string]>>()
  })

  it("Array", () => {
    const O = Order.Array(Order.Number)
    expect(O).type.toBe<Order.Order<ReadonlyArray<number>>>()
  })

  it("Struct", () => {
    const O = Order.Struct({ a: Order.Number, b: Order.String })
    expect(O).type.toBe<Order.Order<{ readonly a: number; readonly b: string }>>()
  })
})
