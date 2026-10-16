import * as Runtime from "@effect/doctest/Runtime"
import { assert, describe, it } from "@effect/vitest"
import { HashMap, Option } from "effect"

describe("Runtime", () => {
  it("compares Effect values with Equal.equals", () => {
    Runtime.assertEquals(Option.some(1), Option.some(1))
    Runtime.assertEquals(HashMap.make(["a", 1]), HashMap.make(["a", 1]))
  })

  it("reports unequal values", () => {
    assert.throws(() => Runtime.assertEquals(Option.some(1), Option.some(2)))
  })
})

Runtime.test("registers documentation tests", () => {
  Runtime.assertEquals(Option.none(), Option.none())
})
