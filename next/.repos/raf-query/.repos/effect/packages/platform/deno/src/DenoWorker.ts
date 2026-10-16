/**
 * Parent-side Deno platform for Effect workers.
 *
 * @since 4.0.0
 */
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Scope from "effect/Scope"
import * as Worker from "effect/workers/Worker"
import { WorkerError, WorkerReceiveError } from "effect/workers/WorkerError"

/**
 * Creates Deno worker layers by combining the default worker platform with a spawner.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer = (
  spawn: (id: number) => globalThis.Worker | MessagePort
): Layer.Layer<Worker.WorkerPlatform | Worker.Spawner> =>
  Layer.merge(
    layerPlatform,
    Worker.layerSpawner(spawn)
  )

/**
 * Layer that provides the Deno worker platform.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerPlatform: Layer.Layer<Worker.WorkerPlatform> = Layer.succeed(Worker.WorkerPlatform)(
  Worker.makePlatform<globalThis.Worker | MessagePort>()({
    setup({ scope, worker }) {
      return Effect.as(
        Scope.addFinalizer(
          scope,
          Effect.sync(() => {
            worker.postMessage([1])
          })
        ),
        worker
      )
    },
    listen({ deferred, emit, port, scope }) {
      function onMessage(event: MessageEvent) {
        emit(event.data)
      }
      function onError(event: ErrorEvent) {
        Deferred.doneUnsafe(
          deferred,
          new WorkerError({
            reason: new WorkerReceiveError({
              message: "An error event was emitted",
              cause: event.error ?? event.message
            })
          })
        )
      }
      port.addEventListener("message", onMessage as any)
      port.addEventListener("error", onError as any)
      if ("start" in port) {
        port.start()
      }
      return Scope.addFinalizer(
        scope,
        Effect.sync(() => {
          port.removeEventListener("message", onMessage as any)
          port.removeEventListener("error", onError as any)
        })
      )
    }
  })
)
