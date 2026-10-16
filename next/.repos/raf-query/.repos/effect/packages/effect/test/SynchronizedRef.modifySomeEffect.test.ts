import { assert, describe, it } from "@effect/vitest"
import { Effect, Option, SynchronizedRef } from "effect"

describe("SynchronizedRef.modifySomeEffect", () => {
  it.effect("supports callback-only currying", () =>
    Effect.gen(function*() {
      const ref = yield* SynchronizedRef.make(1)
      const result = yield* SynchronizedRef.modifySomeEffect((value: number) =>
        Effect.succeed(["updated", Option.some(value + 1)] as const)
      )(ref)

      assert.strictEqual(result, "updated")
      assert.strictEqual(yield* SynchronizedRef.get(ref), 2)
    }))

  it.effect("preserves the value for Option.none", () =>
    Effect.gen(function*() {
      const ref = yield* SynchronizedRef.make(1)
      const result = yield* SynchronizedRef.modifySomeEffect((_: number) =>
        Effect.succeed(["unchanged", Option.none<number>()] as const)
      )(ref)

      assert.strictEqual(result, "unchanged")
      assert.strictEqual(yield* SynchronizedRef.get(ref), 1)
    }))
})
