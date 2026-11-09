/**
 * @title Running effects with NodeRuntime and BunRuntime
 *
 * Use `NodeRuntime.runMain` to run an Effect program as your process entrypoint.
 */
import { BunRuntime } from "@effect/platform-bun"
import { NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"

const Worker = Layer.effectDiscard(Effect.gen(function*() {
  yield* Effect.logInfo("Starting worker...")
  yield* Effect.forkScoped(Effect.gen(function*() {
    while (true) {
      yield* Effect.logInfo("Working...")
      yield* Effect.sleep("1 second")
    }
  }))
}))

const program = Layer.launch(Worker)

// `runMain` installs SIGINT / SIGTERM handlers and interrupts running fibers
// for graceful shutdown.
NodeRuntime.runMain(program, {
  // Disable automatic error reporting if your app already centralizes it.
  disableErrorReporting: true
})

// Bun has the same API shape:
BunRuntime.runMain(program, { disableErrorReporting: true })
