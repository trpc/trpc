import { Effect, Option, SynchronizedRef } from "effect"
import { describe, expect, it } from "tstyche"

declare const ref: SynchronizedRef.SynchronizedRef<number>
declare const pf: (value: number) => Effect.Effect<readonly [string, Option.Option<number>], "failure", "dependency">

describe("SynchronizedRef.modifySomeEffect", () => {
  it("regression: callback-only currying preserves result, error, and environment", () => {
    const operation = SynchronizedRef.modifySomeEffect(pf)
    expect(operation).type.toBe<
      (self: SynchronizedRef.SynchronizedRef<number>) => Effect.Effect<string, "failure", "dependency">
    >()
    expect(ref.pipe(operation)).type.toBe<Effect.Effect<string, "failure", "dependency">>()
  })

  it("regression: infers the callback tuple without a fallback", () => {
    const result = ref.pipe(
      SynchronizedRef.modifySomeEffect((value: number) => Effect.succeed(["result", Option.some(value + 1)] as const))
    )
    expect(result).type.toBe<Effect.Effect<"result">>()
  })

  it("regression: rejects the obsolete fallback call", () => {
    expect(SynchronizedRef.modifySomeEffect).type.not.toBeCallableWith("fallback", pf)
  })

  it("control: data-first preserves result, error, and environment", () => {
    expect(SynchronizedRef.modifySomeEffect(ref, pf)).type.toBe<Effect.Effect<string, "failure", "dependency">>()
  })
})
