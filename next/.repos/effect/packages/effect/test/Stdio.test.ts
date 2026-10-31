import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Sink from "effect/Sink"
import * as Stdio from "effect/Stdio"
import * as Stream from "effect/Stream"

describe("Stdio", () => {
  it.effect("make defaults stderr terminal state to false", () =>
    Effect.gen(function*() {
      const stdio = Stdio.make({
        args: Effect.succeed([]),
        stdin: Stream.empty,
        stdout: () => Sink.drain,
        stderr: () => Sink.drain,
        stdoutIsTerminal: Effect.succeed(true)
      })
      assert.isFalse(yield* stdio.stderrIsTerminal)
    }))

  it.effect("layerTest defaults terminal state to false", () =>
    Effect.gen(function*() {
      const stdio = yield* Stdio.Stdio
      assert.isFalse(yield* stdio.stdinIsTerminal)
      assert.isFalse(yield* stdio.stdoutIsTerminal)
      assert.isFalse(yield* stdio.stderrIsTerminal)
    }).pipe(Effect.provide(Stdio.layerTest({}))))

  it.effect("layerTest allows terminal state overrides", () =>
    Effect.gen(function*() {
      const stdio = yield* Stdio.Stdio
      assert.isTrue(yield* stdio.stdinIsTerminal)
      assert.isTrue(yield* stdio.stdoutIsTerminal)
      assert.isTrue(yield* stdio.stderrIsTerminal)
    }).pipe(Effect.provide(Stdio.layerTest({
      stdinIsTerminal: Effect.succeed(true),
      stdoutIsTerminal: Effect.succeed(true),
      stderrIsTerminal: Effect.succeed(true)
    }))))
})
