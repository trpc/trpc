import * as DenoStdio from "@effect/platform-deno/DenoStdio"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Stdio from "effect/Stdio"

const streams = [Deno.stdin, Deno.stdout] as const

const setIsTerminal = (stdin: boolean, stdout: boolean) =>
  Effect.sync(() => {
    Object.defineProperty(streams[0], "isTerminal", { configurable: true, value: () => stdin })
    Object.defineProperty(streams[1], "isTerminal", { configurable: true, value: () => stdout })
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

        yield* setIsTerminal(true, false)
        assert.deepStrictEqual(
          yield* Effect.all([stdio.stdinIsTerminal, stdio.stdoutIsTerminal]),
          [true, false]
        )

        yield* setIsTerminal(false, true)
        assert.deepStrictEqual(
          yield* Effect.all([stdio.stdinIsTerminal, stdio.stdoutIsTerminal]),
          [false, true]
        )
      }).pipe(Effect.provide(DenoStdio.layer))
    ))
})
