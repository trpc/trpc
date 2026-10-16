import { assert, describe, it } from "@effect/vitest"
import { Cause, Deferred, Effect, Exit, Fiber, Schema } from "effect"
import * as Worker from "effect/workers/Worker"
import {
  isWorkerError,
  WorkerError,
  WorkerErrorReason,
  WorkerReceiveError,
  WorkerSendError,
  WorkerSpawnError,
  WorkerUnknownError
} from "effect/workers/WorkerError"

describe("WorkerError", () => {
  describe("reason handling", () => {
    it("delegates message from reason", () => {
      const error = new WorkerError({
        reason: new WorkerSendError({
          message: "Failed to send message to worker"
        })
      })

      assert.strictEqual(error.message, "Failed to send message to worker")
      assert.strictEqual(error.reason._tag, "WorkerSendError")
    })

    it("WorkerError delegates message and cause from reason", () => {
      const cause = new Error("boom")
      const reason = new WorkerSpawnError({
        message: "Failed to spawn worker",
        cause
      })

      assert.strictEqual(reason.message, "Failed to spawn worker")
      assert.strictEqual(reason.cause, cause)
    })
  })

  describe("isWorkerError", () => {
    it("matches wrapper only", () => {
      const wrapper = new WorkerError({
        reason: new WorkerReceiveError({
          message: "Failed to receive message"
        })
      })

      assert.isTrue(isWorkerError(wrapper))
      assert.isFalse(isWorkerError(new WorkerReceiveError({ message: "Failed to receive message" })))
      assert.isFalse(isWorkerError(new Error("regular error")))
      assert.isFalse(isWorkerError({ _tag: "WorkerError" }))
    })
  })

  describe("schema roundtrip", () => {
    it.effect("WorkerSpawnError roundtrip", () =>
      Effect.gen(function*() {
        const reason = new WorkerSpawnError({
          message: "Failed to spawn worker"
        })
        const encoded = yield* Schema.encodeEffect(WorkerSpawnError)(reason)
        const decoded = yield* Schema.decodeEffect(WorkerSpawnError)(encoded)
        assert.strictEqual(decoded._tag, "WorkerSpawnError")
        assert.strictEqual(decoded.message, "Failed to spawn worker")
      }))

    it.effect("WorkerErrorReason union roundtrip", () =>
      Effect.gen(function*() {
        const reason: WorkerErrorReason = new WorkerUnknownError({
          message: "Worker crashed unexpectedly"
        })
        const encoded = yield* Schema.encodeEffect(WorkerErrorReason)(reason)
        const decoded = yield* Schema.decodeEffect(WorkerErrorReason)(encoded)
        assert.strictEqual(decoded._tag, "WorkerUnknownError")
        assert.strictEqual(decoded.message, "Worker crashed unexpectedly")
      }))

    it.effect("WorkerError roundtrip", () =>
      Effect.gen(function*() {
        const error = new WorkerError({
          reason: new WorkerSendError({
            message: "Failed to send message"
          })
        })
        const encoded = yield* Schema.encodeEffect(WorkerError)(error)
        const decoded = yield* Schema.decodeEffect(WorkerError)(encoded)
        assert.strictEqual(decoded._tag, "WorkerError")
        assert.strictEqual(decoded.reason._tag, "WorkerSendError")
        assert.strictEqual(decoded.message, "Failed to send message")
      }))
  })

  describe("buffered sends", () => {
    it.effect("reports postMessage failures as WorkerSendError", () =>
      Effect.gen(function*() {
        const listening = yield* Deferred.make<void>()
        let emit!: (message: Worker.PlatformMessage) => void
        const platform = Worker.makePlatform<object>()({
          setup: () =>
            Effect.succeed({
              postMessage() {
                throw new Error("post failed")
              }
            }),
          listen: (options) =>
            Effect.sync(() => {
              emit = options.emit
            }).pipe(Effect.andThen(Deferred.succeed(listening, void 0)))
        })
        const worker = yield* platform.spawn(0).pipe(
          Effect.provideService(Worker.Spawner, () => ({}))
        )

        yield* worker.send("buffered")
        const run = yield* Effect.forkChild(worker.run(() => Effect.void))
        yield* Deferred.await(listening)
        yield* Effect.sync(() => emit([0]))
        const exit = yield* Fiber.await(run)

        assert(Exit.isFailure(exit))
        if (Exit.isFailure(exit)) {
          assert.isFalse(Cause.hasDies(exit.cause))
          const error = Cause.squash(exit.cause)
          assert.isTrue(isWorkerError(error))
          if (isWorkerError(error)) {
            assert.strictEqual(error.reason._tag, "WorkerSendError")
          }
        }
      }))
  })
})
