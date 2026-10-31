import * as DenoStdio from "@effect/platform-deno/DenoStdio"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Stdio from "effect/Stdio"

const streams = [Deno.stdin, Deno.stdout, Deno.stderr] as const

const setIsTerminal = (stdin: boolean, stdout: boolean, stderr: boolean) =>
  Effect.sync(() => {
    Object.defineProperty(streams[0], "isTerminal", { configurable: true, value: () => stdin })
    Object.defineProperty(streams[1], "isTerminal", { configurable: true, value: () => stdout })
    Object.defineProperty(streams[2], "isTerminal", { configurable: true, value: () => stderr })
  })

const withRestoredIsTerminal = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => streams.map((stream) => Object.getOwnPropertyDescriptor(stream, "isTerminal"))),
    () => effect,
    (descriptors) =>
      Effect.sync(() => {
        streams.forEach((stream, index) => {
          const descriptor = descriptors[index]
          if (descriptor === undefined) {
            Reflect.deleteProperty(stream, "isTerminal")
          } else {
            Object.defineProperty(stream, "isTerminal", descriptor)
          }
        })
      })
  )

describe("DenoStdio", () => {
  it.effect("reads terminal state when the effects run", () =>
    withRestoredIsTerminal(
      Effect.gen(function*() {
        const stdio = yield* Stdio.Stdio

        yield* setIsTerminal(false, false, true)
        assert.deepStrictEqual(
          yield* Effect.all([stdio.stdinIsTerminal, stdio.stdoutIsTerminal, stdio.stderrIsTerminal]),
          [false, false, true]
        )

        yield* setIsTerminal(true, true, false)
        assert.deepStrictEqual(
          yield* Effect.all([stdio.stdinIsTerminal, stdio.stdoutIsTerminal, stdio.stderrIsTerminal]),
          [true, true, false]
        )
      }).pipe(Effect.provide(DenoStdio.layer))
    ))
})
