import * as NodeStdio from "@effect/platform-node-shared/NodeStdio"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Stdio from "effect/Stdio"

const streams = [process.stdin, process.stdout, process.stderr] as const

const setIsTTY = (stdin: boolean, stdout: boolean, stderr: boolean | undefined) =>
  Effect.sync(() => {
    Object.defineProperty(streams[0], "isTTY", { configurable: true, value: stdin })
    Object.defineProperty(streams[1], "isTTY", { configurable: true, value: stdout })
    Object.defineProperty(streams[2], "isTTY", { configurable: true, value: stderr })
  })

const withRestoredIsTTY = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => streams.map((stream) => Object.getOwnPropertyDescriptor(stream, "isTTY"))),
    () => effect,
    (descriptors) =>
      Effect.sync(() => {
        streams.forEach((stream, index) => {
          const descriptor = descriptors[index]
          if (descriptor === undefined) {
            Reflect.deleteProperty(stream, "isTTY")
          } else {
            Object.defineProperty(stream, "isTTY", descriptor)
          }
        })
      })
  )

describe("NodeStdio", () => {
  it.effect("reads terminal state when the effects run", () =>
    withRestoredIsTTY(
      Effect.gen(function*() {
        const stdio = yield* Stdio.Stdio

        yield* setIsTTY(false, false, true)
        assert.deepStrictEqual(
          yield* Effect.all([stdio.stdinIsTerminal, stdio.stdoutIsTerminal, stdio.stderrIsTerminal]),
          [false, false, true]
        )

        yield* setIsTTY(true, true, false)
        assert.deepStrictEqual(
          yield* Effect.all([stdio.stdinIsTerminal, stdio.stdoutIsTerminal, stdio.stderrIsTerminal]),
          [true, true, false]
        )
        yield* setIsTTY(false, true, undefined)
        assert.isFalse(yield* stdio.stderrIsTerminal)
      }).pipe(Effect.provide(NodeStdio.layer))
    ))
})
