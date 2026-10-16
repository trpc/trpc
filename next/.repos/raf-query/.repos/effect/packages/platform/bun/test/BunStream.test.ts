import * as BunStream from "@effect/platform-bun/BunStream"
import { assert, describe, it } from "@effect/vitest"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Stream from "effect/Stream"

describe("BunStream", () => {
  it.effect("preserves mapped failures from errored readable streams", () =>
    Effect.gen(function*() {
      const exit = yield* BunStream.fromReadableStream({
        evaluate: () =>
          new ReadableStream<number>({
            start(controller) {
              controller.error(new Error("boom"))
            }
          }),
        onError: (error) => new Error(`mapped: ${(error as Error).message}`)
      }).pipe(Stream.runDrain, Effect.exit)

      assert.isTrue(Exit.isFailure(exit))
      if (Exit.isFailure(exit)) {
        assert.isTrue(exit.cause.reasons.every(Cause.isFailReason))
        assert.deepStrictEqual(Cause.squash(exit.cause), new Error("mapped: boom"))
      }
    }))
})
