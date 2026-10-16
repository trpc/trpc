import { assert, describe, it } from "@effect/vitest"
import { Deferred, Effect, Exit, Fiber } from "effect"
import * as Worker from "effect/workers/Worker"
import { isWorkerError, WorkerError, WorkerReceiveError } from "effect/workers/WorkerError"

interface TestPort {
  readonly postMessage: (message: any, transfers?: any) => void
}

const testPort: TestPort = { postMessage: () => {} }

const makePlatform = (
  onListen: (options: {
    readonly emit: (data: any) => void
    readonly deferred: Deferred.Deferred<never, WorkerError>
  }) => void
) =>
  Worker.makePlatform<TestPort>()({
    setup: ({ worker }) => Effect.succeed(worker),
    listen: ({ deferred, emit }) => Effect.sync(() => onListen({ deferred, emit }))
  })

const spawnerLayer = Worker.layerSpawner(() => testPort)

const exitError = new WorkerError({
  reason: new WorkerReceiveError({ message: "The worker has exited with code: 1" })
})

describe("Worker", () => {
  it.effect("run fails when the worker exits before the ready message", () =>
    Effect.gen(function*() {
      const platform = makePlatform(({ deferred }) => {
        Deferred.doneUnsafe(deferred, exitError)
      })
      const worker = yield* platform.spawn(0)
      const error = yield* Effect.flip(worker.run(() => Effect.void))
      assert.isTrue(isWorkerError(error))
    }).pipe(Effect.provide(spawnerLayer)))

  it.effect("run fails when the worker exits while waiting for ready", () =>
    Effect.gen(function*() {
      let deferred: Deferred.Deferred<never, WorkerError> | undefined
      const platform = makePlatform((options) => {
        deferred = options.deferred
      })
      const worker = yield* platform.spawn(0)
      const fiber = yield* Effect.forkChild(
        worker.run(() => Effect.void),
        { startImmediately: true }
      )
      assert.isUndefined(fiber.pollUnsafe())

      Deferred.doneUnsafe(deferred!, exitError)
      const exit = yield* Fiber.await(fiber)
      assert.isTrue(Exit.isFailure(exit))
    }).pipe(Effect.provide(spawnerLayer)))

  it.effect("run is interruptible while waiting for ready", () =>
    Effect.gen(function*() {
      const platform = makePlatform(() => {})
      const worker = yield* platform.spawn(0)
      const fiber = yield* Effect.forkChild(
        worker.run(() => Effect.void),
        { startImmediately: true }
      )
      assert.isUndefined(fiber.pollUnsafe())

      yield* Fiber.interrupt(fiber)
      const exit = yield* Fiber.await(fiber)
      assert.isTrue(Exit.hasInterrupts(exit))
    }).pipe(Effect.provide(spawnerLayer)))

  it.effect("run still fails on worker exit after ready", () =>
    Effect.gen(function*() {
      let deferred: Deferred.Deferred<never, WorkerError> | undefined
      const platform = makePlatform((options) => {
        deferred = options.deferred
        options.emit([0])
      })
      const worker = yield* platform.spawn(0)
      const fiber = yield* Effect.forkChild(
        worker.run(() => Effect.void),
        { startImmediately: true }
      )
      assert.isUndefined(fiber.pollUnsafe())

      Deferred.doneUnsafe(deferred!, exitError)
      const exit = yield* Fiber.await(fiber)
      assert.isTrue(Exit.isFailure(exit))
    }).pipe(Effect.provide(spawnerLayer)))
})
