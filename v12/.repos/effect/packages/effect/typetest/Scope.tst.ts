import { type Effect, Exit, Scope } from "effect"
import { describe, expect, it } from "tstyche"

declare const scope: Scope.Scope
declare const closeable: Scope.Closeable

describe("Scope.close", () => {
  it("accepts a closeable scope", () => {
    expect(Scope.close(closeable, Exit.void)).type.toBe<Effect.Effect<void>>()
    expect(Scope.close).type.toBeCallableWith(closeable, Exit.void)
  })

  it("rejects a scope that is not known to be closeable", () => {
    expect(Scope.close).type.not.toBeCallableWith(scope, Exit.void)
  })
})

describe("Scope.closeUnsafe", () => {
  it("accepts a closeable scope", () => {
    expect(Scope.closeUnsafe(closeable, Exit.void)).type.toBe<Effect.Effect<void, never, never> | undefined>()
    expect(Scope.closeUnsafe).type.toBeCallableWith(closeable, Exit.void)
  })

  it("rejects a scope that is not known to be closeable", () => {
    expect(Scope.closeUnsafe).type.not.toBeCallableWith(scope, Exit.void)
  })
})
