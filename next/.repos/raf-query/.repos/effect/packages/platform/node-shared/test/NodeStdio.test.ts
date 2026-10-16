import * as NodeStdio from "@effect/platform-node-shared/NodeStdio"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Stdio from "effect/Stdio"

const streams = [process.stdin, process.stdout] as const

const setIsTTY = (stdin: boolean, stdout: boolean) =>
  Effect.sync(() => {
    Object.defineProperty(streams[0], "isTTY", { configurable: true, value: stdin })
    Object.defineProperty(streams[1], "isTTY", { configurable: true, value: stdout })
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

        yield* setIsTTY(true, false)
        assert.deepStrictEqual(
          yield* Effect.all([stdio.stdinIsTerminal, stdio.stdoutIsTerminal]),
          [true, false]
        )

        yield* setIsTTY(false, true)
        assert.deepStrictEqual(
          yield* Effect.all([stdio.stdinIsTerminal, stdio.stdoutIsTerminal]),
          [false, true]
        )
      }).pipe(Effect.provide(NodeStdio.layer))
    ))
})
