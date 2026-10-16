import { Equivalence } from "effect"
import { describe, expect, it } from "tstyche"

describe("Equivalence", () => {
  it("Tuple", () => {
    const E = Equivalence.Tuple([Equivalence.strictEqual<number>(), Equivalence.strictEqual<string>()])
    expect(E).type.toBe<Equivalence.Equivalence<readonly [number, string]>>()
  })

  it("Array", () => {
    const E = Equivalence.Array(Equivalence.strictEqual<number>())
    expect(E).type.toBe<Equivalence.Equivalence<ReadonlyArray<number>>>()
  })

  it("Struct", () => {
    const E = Equivalence.Struct({ a: Equivalence.strictEqual<number>(), b: Equivalence.strictEqual<string>() })
    expect(E).type.toBe<Equivalence.Equivalence<{ readonly a: number; readonly b: string }>>()
  })
})
