/**
 * Runner-side Deno platform for Effect worker handlers using the standard `MessagePort` API.
 *
 * @since 4.0.0
 */
import * as Cause from "effect/Cause"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import { identity } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Queue from "effect/Queue"
import * as Scope from "effect/Scope"
import { WorkerError, WorkerReceiveError } from "effect/workers/WorkerError"
import * as WorkerRunner from "effect/workers/WorkerRunner"

const cachedPorts = new Set<MessagePort>()
function globalHandleConnect(event: MessageEvent) {
  cachedPorts.add(event.ports[0])
}
if (typeof self !== "undefined" && "onconnect" in self) {
  self.onconnect = globalHandleConnect
}

/**
 * Creates a worker runner platform over a `MessagePort`.
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = (self: MessagePort): WorkerRunner.WorkerRunnerPlatform["Service"] => ({
  start: Effect.fnUntraced(function*<O = unknown, I = unknown>() {
    const disconnects = yield* Queue.make<number>()
    let currentPortId = 0

    const ports = new Map<number, readonly [MessagePort, Scope.Closeable]>()
    const sendUnsafe = (portId: number, message: O, transfer?: ReadonlyArray<unknown>) =>
      (ports.get(portId)?.[0] ?? self).postMessage([1, message], {
        transfer: transfer as any
      })
    const send = (portId: number, message: O, transfer?: ReadonlyArray<unknown>) =>
      Effect.sync(() => sendUnsafe(portId, message, transfer))

    const run = <A, E, R>(
      handler: (portId: number, message: I) => Effect.Effect<A, E, R> | void
    ) =>
      Effect.scopedWith(Effect.fnUntraced(function*(scope) {
        const closeLatch = Deferred.makeUnsafe<void, WorkerError>()
        const trackFiber = Fiber.runIn(scope)
        const services = yield* Effect.context<R>()
        const runFork = Effect.runForkWith(services)
        const onExit = (exit: Exit.Exit<any, E>) => {
          if (exit._tag === "Failure" && !Cause.hasInterruptsOnly(exit.cause)) {
            runFork(Effect.logError("unhandled error in worker", exit.cause))
          }
        }

        function onMessage(portId: number) {
          return function(event: MessageEvent) {
            const message = event.data as WorkerRunner.PlatformMessage<I>
            if (message[0] === 0) {
              const result = handler(portId, message[1])
              if (Effect.isEffect(result)) {
                const fiber = runFork(result)
                fiber.addObserver(onExit)
                trackFiber(fiber)
              }
            } else {
              const port = ports.get(portId)
              if (!port) {
                return
              } else if (ports.size === 1) {
                // let the last port close with the outer scope
                return Deferred.doneUnsafe(closeLatch, Exit.void)
              }
              ports.delete(portId)
              Queue.offerUnsafe(disconnects, portId)
              Effect.runFork(Scope.close(port[1], Exit.void))
            }
          }
        }
        function onMessageError(error: MessageEvent) {
          Deferred.doneUnsafe(
            closeLatch,
            new WorkerError({
              reason: new WorkerReceiveError({
                message: "An messageerror event was emitted",
                cause: error.data
              })
            })
          )
        }
        function onError(error: any) {
          Deferred.doneUnsafe(
            closeLatch,
            new WorkerError({
              reason: new WorkerReceiveError({
                message: "An error event was emitted",
                cause: error.data
              })
            })
          )
        }
        function handlePort(port: MessagePort) {
          const portScope = Scope.forkUnsafe(scope)
          const portId = currentPortId++
          ports.set(portId, [port, portScope])
          const onMsg = onMessage(portId)
          port.addEventListener("message", onMsg)
          port.addEventListener("messageerror", onMessageError)
          if ("start" in port) {
            port.start()
          }
          port.postMessage([0])
          Effect.runSync(Scope.addFinalizer(
            portScope,
            Effect.sync(() => {
              port.removeEventListener("message", onMsg)
              port.removeEventListener("messageerror", onMessageError)
              port.close()
            })
          ))
        }
        self.addEventListener("error", onError)
        let prevOnConnect: unknown | undefined
        if ("onconnect" in self) {
          prevOnConnect = self.onconnect
          self.onconnect = function(event: MessageEvent) {
            const port = (event as MessageEvent).ports[0]
            handlePort(port)
          }
          for (const port of cachedPorts) {
            handlePort(port)
          }
          cachedPorts.clear()
        } else {
          handlePort(self as any)
        }
        yield* Scope.addFinalizer(
          scope,
          Effect.sync(() => {
            self.removeEventListener("error", onError)
            if ("onconnect" in self) {
              self.close()
              self.onconnect = prevOnConnect
            }
          })
        )

        yield* Deferred.await(closeLatch)
      }))

    return identity<WorkerRunner.WorkerRunner<O, I>>({ run, send, sendUnsafe, disconnects })
  }) as any
})

/**
 * Layer that provides the worker runner platform using the global worker scope.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<WorkerRunner.WorkerRunnerPlatform> = Layer.sync(WorkerRunner.WorkerRunnerPlatform)(() =>
  make(self as unknown as MessagePort)
)

/**
 * Layer that provides the worker runner platform using the supplied `MessagePort`.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerMessagePort = (port: MessagePort): Layer.Layer<WorkerRunner.WorkerRunnerPlatform> =>
  Layer.succeed(WorkerRunner.WorkerRunnerPlatform)(make(port))
