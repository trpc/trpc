/**
 * @title Creating Layers that run background tasks
 *
 * Use Layer.effectDiscard to encapsulate background tasks without a service interface.
 */
import { NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"

// Use Layer.effectDiscard when you want to create a layer that runs an effect
// but does not provide any services.
const BackgroundTask = Layer.effectDiscard(Effect.gen(function*() {
  yield* Effect.logInfo("Starting background task...")

  yield* Effect.gen(function*() {
    while (true) {
      yield* Effect.sleep("5 seconds")
      yield* Effect.logInfo("Background task running...")
    }
  }).pipe(
    Effect.onInterrupt(() => Effect.logInfo("Background task interrupted: layer scope closed")),
    Effect.forkScoped
  )
}))

// Run the background task layer. It will start when the layer is launched and
// will be automatically interrupted when the layer scope is closed (e.g. when
// the program exits).
BackgroundTask.pipe(
  Layer.launch,
  NodeRuntime.runMain
)
