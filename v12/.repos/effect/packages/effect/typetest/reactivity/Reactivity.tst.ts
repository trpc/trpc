import { Effect, hole } from "effect"
import { Reactivity } from "effect/reactivity"
import { describe, expect, it } from "tstyche"

describe("Reactivity", () => {
  it("accepts any keys when no keys are declared", () => {
    const effect = Effect.succeed(1)
    const keys = hole<ReadonlyArray<unknown>>()

    expect(Reactivity.invalidate).type.toBeCallableWith(keys)
    expect(Reactivity.invalidate).type.toBeCallableWith({ anything: [1, { id: 1 }] })
    expect(Reactivity.mutation).type.toBeCallableWith(effect, keys)
    expect(Reactivity.query).type.toBeCallableWith(effect, keys)
    expect(Reactivity.stream).type.toBeCallableWith(effect, keys)
  })
})
