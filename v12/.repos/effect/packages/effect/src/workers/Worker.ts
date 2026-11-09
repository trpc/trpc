/**
 * Client-side worker primitives shared by browser, Node, and Bun adapters.
 *
 * This module defines the platform-neutral `Worker` client, the `WorkerPlatform`
 * service that creates workers by numeric id, and the `Spawner` service used to
 * find platform-specific worker instances. `makePlatform` wraps platform setup
 * and listen hooks into a `WorkerPlatform`, buffers outgoing messages until the
 * worker is ready, runs incoming messages with Effect handlers, and ties worker
 * cleanup to scope lifetime.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import type * as Deferred from "../Deferred.ts"
import * as Effect from "../Effect.ts"
import * as FiberSet from "../FiberSet.ts"
import * as Latch from "../Latch.ts"
import * as Layer from "../Layer.ts"
import * as Scope from "../Scope.ts"
import { WorkerError, WorkerSendError } from "./WorkerError.ts"

/**
 * Service that spawns effect `Worker` instances for numeric worker ids using
 * the configured `Spawner`.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class WorkerPlatform extends Context.Service<WorkerPlatform, {
  readonly spawn: <O = unknown, I = unknown>(
    id: number
  ) => Effect.Effect<Worker<O, I>, WorkerError, Spawner>
}>()("effect/workers/Worker/WorkerPlatform") {}

/**
 * Effect-based worker abstraction that can send input messages and run a
 * long-lived handler for output messages, failing with `WorkerError` or handler
 * errors.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Worker<O = unknown, I = unknown> {
  readonly send: (
    message: I,
    transfers?: ReadonlyArray<unknown>
  ) => Effect.Effect<void, WorkerError>
  readonly run: <A, E, R>(
    handler: (message: O) => Effect.Effect<A, E, R>,
    options?:
      | {
        readonly onSpawn?: Effect.Effect<void> | undefined
      }
      | undefined
  ) => Effect.Effect<never, E | WorkerError, R>
}

/**
 * Wraps platform-specific send and run functions into a `Worker`, translating
 * platform ready/data messages and running the optional `onSpawn` effect when
 * the worker reports readiness.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeUnsafe = (options: {
  readonly send: (
    message: unknown,
    transfers?: ReadonlyArray<unknown>
  ) => Effect.Effect<void, WorkerError>
  readonly run: <A, E, R>(
    handler: (message: PlatformMessage) => Effect.Effect<A, E, R>
  ) => Effect.Effect<never, E | WorkerError, R>
}): Worker<any, any> => ({
  send: options.send,
  run(handler, options_) {
    const onSpawn = options_?.onSpawn ?? Effect.void
    return options.run((msg) => {
      if (msg[0] === 0) return onSpawn
      return handler(msg[1])
    })
  }
})

/**
 * Internal worker platform protocol message: `[0]` signals readiness and
 * `[1, payload]` carries data.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type PlatformMessage = readonly [ready: 0] | readonly [data: 1, unknown]

/**
 * Phantom identifier for the service that maps worker ids to platform-specific
 * worker instances.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Spawner {
  readonly _: unique symbol
}

/**
 * Service tag for the worker `SpawnerFn`.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const Spawner: Context.Service<
  Spawner,
  SpawnerFn<unknown>
> = Context.Service("effect/workers/Worker/Spawner")

/**
 * Function that creates or locates a platform-specific worker instance for a
 * numeric worker id.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SpawnerFn<W = unknown> {
  (id: number): W
}

/**
 * Creates a layer that provides a worker `Spawner` service from a `SpawnerFn`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerSpawner: <W = unknown>(
  spawner: SpawnerFn<W>
) => Layer.Layer<Spawner> = Layer.succeed(Spawner)

/**
 * Creates a `WorkerPlatform` from platform-specific setup and listen hooks,
 * buffering sent messages until the worker is ready and scoping port cleanup to
 * the worker run.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makePlatform = <W>() =>
<
  P extends {
    readonly postMessage: (message: any, transfers?: any | undefined) => void
  }
>(options: {
  readonly setup: (options: {
    readonly worker: W
    readonly scope: Scope.Scope
  }) => Effect.Effect<P, WorkerError>
  readonly listen: (options: {
    readonly port: P
    readonly emit: (data: any) => void
    readonly deferred: Deferred.Deferred<never, WorkerError>
    readonly scope: Scope.Scope
  }) => Effect.Effect<void>
}): WorkerPlatform["Service"] =>
  WorkerPlatform.of({
    spawn<O, I>(id: number) {
      return Effect.gen(function*() {
        const spawn = (yield* Spawner) as SpawnerFn<W>
        let currentPort: P | undefined
        const buffer: Array<[unknown, ReadonlyArray<unknown> | undefined]> = []
        const sendToPort = (port: P, message: unknown, transfers?: ReadonlyArray<unknown>) =>
          Effect.try({
            try: () => port.postMessage([0, message], transfers as any),
            catch: (cause) =>
              new WorkerError({
                reason: new WorkerSendError({
                  message: "Failed to send message to worker",
                  cause
                })
              })
          })

        const run = <A, E, R>(
          handler: (_: O) => Effect.Effect<A, E, R>,
          opts?: { readonly onSpawn?: Effect.Effect<void> | undefined }
        ) =>
          Effect.uninterruptibleMask((restore) =>
            Effect.scopedWith(
              Effect.fnUntraced(function*(scope) {
                const port = yield* options.setup({
                  worker: spawn(id),
                  scope
                })
                yield* Scope.addFinalizer(
                  scope,
                  Effect.sync(() => {
                    currentPort = undefined
                  })
                )
                const fiberSet = yield* FiberSet.make<
                  any,
                  WorkerError | E
                >().pipe(Scope.provide(scope))
                const run = yield* FiberSet.runtime(fiberSet)<R>()
                const ready = Latch.makeUnsafe()
                yield* options.listen({
                  port,
                  scope,
                  emit(data: PlatformMessage) {
                    if (data[0] === 0) {
                      if (opts?.onSpawn) {
                        run(Effect.ensuring(opts.onSpawn, ready.open))
                      } else {
                        ready.openUnsafe()
                      }
                      return
                    }
                    run(handler(data[1] as O))
                  },
                  deferred: fiberSet.deferred as any
                })
                // Fail fast if the worker dies before signalling readiness,
                // and allow interruption while waiting for the handshake.
                yield* restore(Effect.raceFirst(ready.await, FiberSet.join(fiberSet)))
                currentPort = port
                if (buffer.length > 0) {
                  for (const [message, transfers] of buffer) {
                    yield* sendToPort(port, message, transfers)
                  }
                  buffer.length = 0
                }
                return (yield* restore(FiberSet.join(fiberSet))) as never
              })
            )
          )

        const send = (message: I, transfers?: ReadonlyArray<unknown>) =>
          Effect.suspend(() => {
            if (currentPort === undefined) {
              buffer.push([message, transfers])
              return Effect.void
            }
            return sendToPort(currentPort, message, transfers)
          })

        return { run, send }
      })
    }
  })
