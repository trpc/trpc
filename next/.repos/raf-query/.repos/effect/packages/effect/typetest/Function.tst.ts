import { Function } from "effect"
import { describe, expect, it } from "tstyche"

describe("Function", () => {
  it("memoize", () => {
    const memoized = Function.memoize((input: { readonly n: number }) => input.n)
    expect(memoized).type.toBe<(input: { readonly n: number }) => number>()

    const nullable = Function.memoize((_input: object) => null)
    expect(nullable).type.toBe<(input: object) => null>()

    expect(Function.memoize).type.not.toBeCallableWith((_input: object): undefined => undefined)
    expect(Function.memoize).type.not.toBeCallableWith((_input: object): number | undefined => undefined)
  })

  it("memoizeIdempotent", () => {
    const memoized = Function.memoizeIdempotent((input: { readonly n: number }) => input)
    expect(memoized).type.toBe<(input: { readonly n: number }) => { readonly n: number }>()

    const generic = Function.memoizeIdempotent(<A extends object>(input: A): A => input)
    type Generic = <A extends object>(input: A) => A
    expect(generic).type.toBe<Generic>()

    expect(Function.memoizeIdempotent).type.not.toBeCallableWith((_input: object): number => 1)
  })
})
