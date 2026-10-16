/**
 * Node-compatible process runner for Effect programs.
 *
 * This module provides the shared `runMain` implementation used by
 * Node-compatible platform packages. It runs one Effect as the main process
 * fiber, interrupts that fiber on `SIGINT` or `SIGTERM`, and delegates final
 * exit-code handling to the configured teardown.
 *
 * @since 4.0.0
 */
import type { Effect } from "effect/Effect"
import * as Runtime from "effect/Runtime"

/**
 * Runs an Effect as the Node process main program, interrupting the fiber on
 * `SIGINT` or `SIGTERM` and invoking the configured teardown to determine the
 * process exit code.
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
    process.removeListener("SIGINT", onSigint)
    process.removeListener("SIGTERM", onSigint)
    teardown(exit, (code) => {
      if (receivedSignal || code !== 0) {
        process.exit(code)
      }
    })
  })

  function onSigint() {
    receivedSignal = true
    fiber.interruptUnsafe(fiber.id)
  }

  process.on("SIGINT", onSigint)
  process.on("SIGTERM", onSigint)
})
