import { assert, describe, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Stream } from "effect"
import { Template } from "effect/http"
import { TestClock } from "effect/testing"

describe("Template", () => {
  it.effect("preserves template segment order", () =>
    Effect.gen(function*() {
      const fiber = yield* Stream.runCollect(
        Template.stream`a${Effect.delay(Effect.succeed("slow"), "1 second")}b${"fast"}c`
      ).pipe(Effect.forkChild)
      yield* Effect.yieldNow
      yield* TestClock.adjust("1 second")
      const chunks = yield* Fiber.join(fiber)
      assert.strictEqual(chunks.join(""), "aslowbfastc")
    }))

  it.effect("evaluates effect interpolations concurrently", () =>
    Effect.gen(function*() {
      const firstStarted = yield* Deferred.make<void>()
      const secondStarted = yield* Deferred.make<void>()
      const releaseFirst = yield* Deferred.make<void>()
      const fiber = yield* Template.stream`${
        Deferred.succeed(firstStarted, void 0).pipe(
          Effect.andThen(Deferred.await(releaseFirst)),
          Effect.as("first")
        )
      }${Deferred.succeed(secondStarted, void 0).pipe(Effect.as("second"))}`.pipe(
        Stream.runCollect,
        Effect.forkChild
      )
      yield* Deferred.await(firstStarted)
      yield* Effect.yieldNow
      assert.isTrue(yield* Deferred.isDone(secondStarted))
      yield* Deferred.succeed(releaseFirst, void 0)
      assert.deepStrictEqual(yield* Fiber.join(fiber), ["first", "second"])
    }))
})
