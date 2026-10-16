/**
 * Deno helper for running a root Effect program.
 *
 * @since 4.0.0
 */

import type { Effect } from "effect/Effect"
import * as Runtime from "effect/Runtime"

/**
 * Run an Effect as the entrypoint to a Deno application.
 *
 * @category running
 * @since 4.0.0
 */

export const runMain: {
  (
    options?: {
      readonly disableErrorReporting?: boolean | undefined
      readonly teardown?: Runtime.Teardown | undefined
    }
  ): <E, A>(effect: Effect<A, E>) => void
  <E, A>(
    effect: Effect<A, E>,
    options?: {
      readonly disableErrorReporting?: boolean | undefined
      readonly teardown?: Runtime.Teardown | undefined
    }
  ): void
} = Runtime.makeRunMain(({
  fiber,
  teardown
}) => {
  let receivedSignal = false

  fiber.addObserver((exit) => {
    if (!receivedSignal) {
      Deno.removeSignalListener("SIGINT", onSigint)
      Deno.removeSignalListener("SIGTERM", onSigint)
    }

    teardown(exit, (code) => {
      if (receivedSignal || code !== 0) {
        Deno.exit(code)
      }
    })
  })

  function onSigint(): void {
    receivedSignal = true
    Deno.removeSignalListener("SIGINT", onSigint)
    Deno.removeSignalListener("SIGTERM", onSigint)
    fiber.interruptUnsafe(fiber.id)
  }

  Deno.addSignalListener("SIGINT", onSigint)
  Deno.addSignalListener("SIGTERM", onSigint)
})
