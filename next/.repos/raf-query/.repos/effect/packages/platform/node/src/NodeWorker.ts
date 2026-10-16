/**
 * Parent-side Node.js support for Effect workers.
 *
 * `layerPlatform` installs the `WorkerPlatform` used by a Node program that
 * owns workers. It supports both `node:worker_threads` workers and IPC-enabled
 * child processes, routing messages through Effect's worker protocol. `layer`
 * combines that platform with a `Spawner` callback, and the platform asks
 * workers to close on scope finalization before forcefully terminating them on
 * timeout.
 *
 * @since 4.0.0
 */
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Scope from "effect/Scope"
import * as Worker from "effect/workers/Worker"
import { WorkerError, WorkerReceiveError } from "effect/workers/WorkerError"
import type * as ChildProcess from "node:child_process"
import type * as WorkerThreads from "node:worker_threads"

/**
 * Provides the Node `WorkerPlatform` for `worker_threads` workers and child
 * process workers, wiring messages, errors, and exits into Effect workers and
 * terminating the worker if graceful shutdown times out.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerPlatform: Layer.Layer<Worker.WorkerPlatform> = Layer.succeed(Worker.WorkerPlatform)(
  Worker.makePlatform<WorkerThreads.Worker | ChildProcess.ChildProcess>()({
    setup({ scope, worker }) {
      const exitDeferred = Deferred.makeUnsafe<void, WorkerError>()
      const thing = "postMessage" in worker ?
        {
          postMessage(msg: any, t?: any) {
            worker.postMessage(msg, t)
          },
          kill: () => worker.terminate(),
          worker
        } :
        {
          postMessage(msg: any, _?: any) {
            worker.send(msg)
          },
          kill: () => worker.kill("SIGKILL"),
          worker
        }
      worker.on("exit", () => {
        Deferred.doneUnsafe(exitDeferred, Exit.void)
      })
      return Effect.as(
        Scope.addFinalizer(
          scope,
          Effect.suspend(() => {
            thing.postMessage([1])
            return Deferred.await(exitDeferred)
          }).pipe(
            Effect.timeout(5000),
            Effect.catchCause(() => Effect.promise(() => Promise.resolve(thing.kill())))
          )
        ),
        thing
      )
    },
    listen({ deferred, emit, port }) {
      port.worker.on("message", (message) => {
        emit(message)
      })
      port.worker.on("messageerror", (cause) => {
        Deferred.doneUnsafe(
          deferred,
          new WorkerError({
            reason: new WorkerReceiveError({
              message: "An messageerror event was emitted",
              cause
            })
          })
        )
      })
      port.worker.on("error", (cause) => {
        Deferred.doneUnsafe(
          deferred,
          new WorkerError({
            reason: new WorkerReceiveError({
              message: "An error event was emitted",
              cause
            })
          })
        )
      })
      port.worker.on("exit", (code) => {
        Deferred.doneUnsafe(
          deferred,
          new WorkerError({
            reason: new WorkerReceiveError({
              message: "The worker has exited with code: " + code
            })
          })
        )
      })
      return Effect.void
    }
  })
)

/**
 * Provides the Node `WorkerPlatform` together with a `Worker.Spawner` created
 * from the supplied worker or child-process spawning function.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer = (
  spawn: (id: number) => WorkerThreads.Worker | ChildProcess.ChildProcess
): Layer.Layer<Worker.WorkerPlatform | Worker.Spawner> =>
  Layer.merge(
    Worker.layerSpawner(spawn),
    layerPlatform
  )
