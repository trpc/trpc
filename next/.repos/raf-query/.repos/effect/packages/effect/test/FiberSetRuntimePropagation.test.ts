import { describe, it } from "@effect/vitest"
import { assertTrue } from "@effect/vitest/utils"
import { Deferred, Effect, Fiber, FiberSet } from "effect"

describe("FiberSet.runtime interruption propagation", () => {
  it.effect("records external interruption when enabled", () =>
    Effect.gen(function*() {
      const set = yield* FiberSet.make()
      const run = yield* FiberSet.runtime(set)()
      const fiber = run(Effect.never, { propagateInterruption: true })

      yield* Fiber.interrupt(fiber)

      assertTrue(yield* Deferred.isDone(set.deferred), "external interruption should be recorded")
    }))
})
