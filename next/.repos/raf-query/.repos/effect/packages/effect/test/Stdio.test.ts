import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Stdio from "effect/Stdio"

describe("Stdio", () => {
  it.effect("layerTest defaults terminal state to false", () =>
    Effect.gen(function*() {
      const stdio = yield* Stdio.Stdio
      assert.isFalse(yield* stdio.stdinIsTerminal)
      assert.isFalse(yield* stdio.stdoutIsTerminal)
    }).pipe(Effect.provide(Stdio.layerTest({}))))

  it.effect("layerTest allows terminal state overrides", () =>
    Effect.gen(function*() {
      const stdio = yield* Stdio.Stdio
      assert.isTrue(yield* stdio.stdinIsTerminal)
      assert.isTrue(yield* stdio.stdoutIsTerminal)
    }).pipe(Effect.provide(Stdio.layerTest({
      stdinIsTerminal: Effect.succeed(true),
      stdoutIsTerminal: Effect.succeed(true)
    }))))
})
