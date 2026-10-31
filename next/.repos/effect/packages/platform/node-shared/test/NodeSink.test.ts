import * as NodeSink from "@effect/platform-node-shared/NodeSink"
import * as NodeStream from "@effect/platform-node-shared/NodeStream"
import { assert, describe, it } from "@effect/vitest"
import { Deferred, Effect, Exit, Fiber, Option } from "effect"
import * as Data from "effect/Data"
import * as Latch from "effect/Latch"
import * as Queue from "effect/Queue"
import * as Stream from "effect/Stream"
import { TestClock } from "effect/testing"
import { createReadStream } from "fs"
import { join } from "path"
import { Writable } from "stream"
import * as Tar from "tar"

const TEST_TARBALL = join(__dirname, "fixtures", "helloworld.tar.gz")

describe("Sink", () => {
  it.effect.each(
    [
      { mode: "failure", endOnDone: undefined },
      { mode: "interrupt", endOnDone: undefined },
      { mode: "failure", endOnDone: false },
      { mode: "interrupt", endOnDone: false }
    ] as const
  )("releases owned writables on $mode (endOnDone: $endOnDone)", ({ mode, endOnDone }) =>
    Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      const failure = new Error("upstream failed")
      const items: Array<string> = []
      const writable = new Writable({
        write(chunk, _encoding, callback) {
          items.push(chunk.toString())
          callback()
        }
      })
      yield* Effect.addFinalizer(() => Effect.sync(() => writable.destroy()))
      const fiber = yield* Stream.make("a").pipe(
        Stream.concat(Stream.fromEffect(Effect.gen(function*() {
          yield* Deferred.succeed(started, undefined)
          return yield* (mode === "failure" ? Effect.fail(failure) : Effect.never)
        }))),
        Stream.run(NodeSink.fromWritable({
          evaluate: () => writable,
          onError: (error) => error,
          endOnDone
        })),
        Effect.forkScoped
      )
      yield* Deferred.await(started)
      if (mode === "interrupt") {
        yield* Fiber.interrupt(fiber)
      }
      const exit = yield* Fiber.await(fiber)
      if (mode === "failure") {
        assert.deepEqual(exit, Exit.fail(failure))
      } else {
        assert.isTrue(Exit.hasInterrupts(exit))
      }
      assert.deepEqual(items, ["a"])
      // Assert before test-scope cleanup can release the writable for the sink.
      assert.strictEqual(writable.writableEnded || writable.destroyed, endOnDone !== false)
    }))

  it.effect.each(["already_finished", "finished_while_pulling", "finished_while_draining", "empty"] as const)(
    "settles after normal writable finish: %s",
    (phase) =>
      Effect.gen(function*() {
        const entered = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const closed = yield* Deferred.make<void>()
        const writing = yield* Deferred.make<() => void>()
        const mapped = { _tag: "WritableError" }
        const errors: Array<unknown> = []
        const writable = new Writable({
          highWaterMark: phase === "finished_while_draining" ? 1 : 16384,
          write(_chunk, _encoding, callback) {
            if (phase === "finished_while_draining") {
              // Resume the test only after write() returns and the sink waits for drain.
              queueMicrotask(() => Deferred.doneUnsafe(writing, Effect.succeed(callback)))
            } else {
              callback()
            }
          }
        })
        writable.once("close", () => Deferred.doneUnsafe(closed, Effect.void))
        yield* Effect.addFinalizer(() => Effect.sync(() => writable.destroy()))
        if (phase === "already_finished" || phase === "empty") {
          writable.end()
          yield* Deferred.await(closed)
        }
        const upstream = phase === "empty" ?
          Stream.empty :
          phase === "finished_while_pulling" ?
          Stream.fromEffect(Effect.gen(function*() {
            yield* Deferred.succeed(entered, undefined)
            yield* Deferred.await(release)
            return "a"
          })) :
          Stream.make("a", "b")
        const fiber = yield* upstream.pipe(
          Stream.run(NodeSink.fromWritable({
            evaluate: () => writable,
            onError: (error) => {
              errors.push(error)
              return mapped
            }
          })),
          Effect.exit,
          Effect.timeoutOption("1 second"),
          Effect.forkScoped
        )
        if (phase === "finished_while_pulling") {
          yield* Deferred.await(entered)
          writable.end()
          yield* Deferred.await(closed)
          yield* Deferred.succeed(release, undefined)
        } else if (phase === "finished_while_draining") {
          const completeWrite = yield* Deferred.await(writing)
          writable.end()
          yield* Effect.sync(completeWrite)
          yield* Deferred.await(closed)
        }
        // Node has finished and auto-destroyed; advance only the non-completion guard.
        yield* TestClock.adjust("1 second")
        assert.deepEqual(yield* Fiber.join(fiber), Option.some(phase === "empty" ? Exit.void : Exit.fail(mapped)))
        assert.strictEqual(errors.length, phase === "empty" ? 0 : 1)
      })
  )

  it.effect("maps write errors after the writable has finished", () =>
    Effect.gen(function*() {
      const finished = yield* Deferred.make<void>()
      const errored = yield* Deferred.make<Error>()
      const mapped = { _tag: "WritableError" }
      const errors: Array<unknown> = []
      const writable = new Writable({
        autoDestroy: false,
        write(_chunk, _encoding, callback) {
          callback()
        }
      })
      yield* Effect.addFinalizer(() => Effect.sync(() => writable.destroy()))
      writable.once("finish", () => Deferred.doneUnsafe(finished, Effect.void))
      writable.once("error", (error) => Deferred.doneUnsafe(errored, Effect.succeed(error)))
      writable.end()
      yield* Deferred.await(finished)
      const fiber = yield* Stream.make("a").pipe(
        Stream.run(NodeSink.fromWritable({
          evaluate: () => writable,
          onError: (error) => {
            errors.push(error)
            return mapped
          }
        })),
        Effect.exit,
        Effect.timeoutOption("1 second"),
        Effect.forkScoped
      )
      const error = yield* Deferred.await(errored)
      assert.strictEqual((error as NodeJS.ErrnoException).code, "ERR_STREAM_WRITE_AFTER_END")
      // Node has emitted the write error; advance only the non-completion guard.
      yield* TestClock.adjust("1 second")
      assert.deepEqual({ result: yield* Fiber.join(fiber), errors }, {
        result: Option.some(Exit.fail(mapped)),
        errors: [error]
      })
    }))

  it.effect("handles write errors until asynchronous destruction completes", () =>
    Effect.gen(function*() {
      const destroying = yield* Deferred.make<() => void>()
      const closed = yield* Deferred.make<void>()
      const error = new Error("write failed")
      const mapped = { _tag: "WritableError" }
      const errors: Array<unknown> = []
      let handled = false
      const writable = new Writable({
        write(_chunk, _encoding, callback) {
          callback(error)
        },
        destroy(error, callback) {
          Deferred.doneUnsafe(destroying, Effect.succeed(() => callback(error)))
        }
      })
      // Prevent an unhandled error from crashing the test worker, but check that
      // the sink itself still handles the event when destruction finally ends.
      writable.on("error", () => {
        handled = writable.listenerCount("error") > 1
      })
      writable.once("close", () => Deferred.doneUnsafe(closed, Effect.void))
      const fiber = yield* Stream.make("a").pipe(
        Stream.run(NodeSink.fromWritable({
          evaluate: () => writable,
          onError: (error) => {
            errors.push(error)
            return mapped
          }
        })),
        Effect.exit,
        Effect.timeoutOption("1 second"),
        Effect.forkScoped
      )
      const release = yield* Deferred.await(destroying)
      // Cross an event-loop turn with _destroy still gated, allowing callback
      // failure and any sink cleanup to run before Node emits the error.
      yield* Effect.promise(() => new Promise<void>((resolve) => setImmediate(resolve)))
      yield* Effect.sync(release)
      yield* Deferred.await(closed)
      yield* TestClock.adjust("1 second")
      assert.deepEqual({ result: yield* Fiber.join(fiber), errors }, {
        result: Option.some(Exit.fail(mapped)),
        errors: [error]
      })
      assert.isTrue(handled, "the sink must handle the delayed Node error event")
    }))

  it.effect.each(["drain", "final", "already_closed"] as const)(
    "settles when destroyed without an error: %s",
    (phase) =>
      Effect.gen(function*() {
        const entered = yield* Deferred.make<void>()
        const closed = yield* Deferred.make<void>()
        const mapped = { _tag: "WritableError" }
        const errors: Array<unknown> = []
        const writable = new Writable({
          highWaterMark: 1,
          write(_chunk, _encoding, callback) {
            if (phase === "drain") {
              queueMicrotask(() => Deferred.doneUnsafe(entered, Effect.void))
            } else {
              callback()
            }
          },
          final() {
            queueMicrotask(() => Deferred.doneUnsafe(entered, Effect.void))
          }
        })
        writable.once("close", () => Deferred.doneUnsafe(closed, Effect.void))
        yield* Effect.addFinalizer(() => Effect.sync(() => writable.destroy()))
        if (phase === "already_closed") {
          writable.destroy()
          yield* Deferred.await(closed)
        }
        const fiber = yield* Stream.make("a", "b").pipe(
          Stream.run(NodeSink.fromWritable({
            evaluate: () => writable,
            onError: (error) => {
              errors.push(error)
              return mapped
            }
          })),
          Effect.exit,
          Effect.timeoutOption("1 second"),
          Effect.forkScoped
        )
        if (phase !== "already_closed") {
          // Let the sink enter its drain/finish wait before destroying the stream.
          yield* Deferred.await(entered)
          writable.destroy()
          yield* Deferred.await(closed)
        }
        // Node has closed; advance only the virtual non-completion guard.
        yield* TestClock.adjust("1 second")
        assert.deepEqual(yield* Fiber.join(fiber), Option.some(phase === "final" ? Exit.void : Exit.fail(mapped)))
        if (phase === "final") {
          assert.deepEqual(errors, [])
        } else {
          assert.strictEqual(errors.length, 1)
          assert.strictEqual((errors[0] as NodeJS.ErrnoException).code, "ERR_STREAM_PREMATURE_CLOSE")
        }
      })
  )

  it.effect("does not resume a selected drain callback after interruption", () =>
    Effect.gen(function*() {
      const items: Array<string> = []
      const entered = yield* Deferred.make<() => void>()
      const drained = yield* Deferred.make<void>()
      const controller = new AbortController()
      const writable = new Writable({
        highWaterMark: 1,
        write(chunk, _encoding, callback) {
          items.push(chunk.toString())
          if (chunk.toString() === "a") {
            queueMicrotask(() => Deferred.doneUnsafe(entered, Effect.succeed(callback)))
          } else {
            callback()
          }
        }
      })
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          controller.abort()
          writable.destroy()
        })
      )
      writable.once("drain", () => controller.abort())
      Effect.runCallback(
        Stream.make("a", "b").pipe(
          Stream.run(NodeSink.fromWritable({ evaluate: () => writable, onError: (error) => error }))
        ),
        { signal: controller.signal, onExit: () => {} }
      )
      const release = yield* Deferred.await(entered)
      assert.deepEqual(items, ["a"])
      writable.once("drain", () => {
        queueMicrotask(() => Deferred.doneUnsafe(drained, Effect.void))
      })
      yield* Effect.sync(release)
      yield* Deferred.await(drained)
      assert.deepEqual(items, ["a"])
    }))

  it.effect.each(["normal_final", "write_error", "final_error"] as const)(
    "writable lifecycle: %s",
    (mode) =>
      Effect.gen(function*() {
        const error = new Error(mode)
        const mapped = { _tag: "WritableError", cause: error }
        const observed: Array<unknown> = []
        const mappedErrors: Array<unknown> = []
        const closed = yield* Deferred.make<void>()
        const items: Array<string> = []
        let finalized = false
        const writable = new Writable({
          write(chunk, _encoding, callback) {
            items.push(chunk.toString())
            callback(mode === "write_error" ? error : null)
          },
          final(callback) {
            finalized = true
            callback(mode === "final_error" ? error : null)
          }
        })
        // Observe Node errors without handling them on behalf of the sink.
        writable.on("error", (error) => observed.push(error))
        writable.once("close", () => Deferred.doneUnsafe(closed, Effect.void))
        yield* Effect.addFinalizer(() => Effect.sync(() => writable.destroy()))
        const fiber = yield* Stream.make("a", "b").pipe(
          Stream.run(NodeSink.fromWritable({
            evaluate: () => writable,
            onError: (error) => {
              mappedErrors.push(error)
              return mapped
            }
          })),
          Effect.exit,
          Effect.timeoutOption("1 second"),
          Effect.forkScoped
        )
        yield* Deferred.await(closed)
        // The writable has settled; advance only the virtual non-completion guard.
        yield* TestClock.adjust("1 second")
        assert.deepEqual(observed, mode === "normal_final" ? [] : [error])
        assert.strictEqual(finalized, mode !== "write_error")
        assert.deepEqual(items, mode === "write_error" ? ["a"] : ["a", "b"])
        assert.deepEqual({ result: yield* Fiber.join(fiber), mappedErrors }, {
          result: Option.some(mode === "normal_final" ? Exit.void : Exit.fail(mapped)),
          mappedErrors: mode === "normal_final" ? [] : [error]
        })
      })
  )

  it.effect.each(["error", "interrupt"] as const)(
    "cleans up finalization listeners on %s",
    (mode) =>
      Effect.gen(function*() {
        const finalizing = yield* Deferred.make<(error?: Error | null) => void>()
        const error = new Error("finalization failed")
        const writable = new Writable({
          write(_chunk, _encoding, callback) {
            callback()
          },
          final(callback) {
            queueMicrotask(() => Deferred.doneUnsafe(finalizing, Effect.succeed(callback)))
          }
        })
        const observed: Array<unknown> = []
        writable.on("error", (error) => observed.push(error))
        yield* Effect.addFinalizer(() => Effect.sync(() => writable.destroy()))
        const fiber = yield* Stream.make("a").pipe(
          Stream.run(NodeSink.fromWritable({ evaluate: () => writable, onError: (error) => error })),
          Effect.forkScoped
        )
        const release = yield* Deferred.await(finalizing)
        assert.strictEqual(writable.listenerCount("finish"), 1)
        if (mode === "error") {
          yield* Effect.sync(() => release(error))
          assert.deepEqual(yield* Fiber.await(fiber), Exit.fail(error))
        } else {
          yield* Fiber.interrupt(fiber)
        }
        assert.strictEqual(writable.listenerCount("finish"), 0)
        assert.strictEqual(writable.listenerCount("error"), 1)
        assert.deepEqual(observed, mode === "error" ? [error] : [])
        if (mode === "interrupt") {
          yield* Effect.sync(() => release())
        }
      })
  )

  it.effect("should write to a stream", () =>
    Effect.gen(function*() {
      const items: Array<string> = []
      const destroyLatch = yield* Latch.make()
      yield* Stream.make("a", "b", "c").pipe(
        Stream.run(NodeSink.fromWritable({
          evaluate: () =>
            new Writable({
              construct(callback) {
                callback()
              },
              write(chunk, _encoding, callback) {
                items.push(chunk.toString())
                callback()
              },
              destroy(_error, callback) {
                destroyLatch.openUnsafe()
                callback(null)
              }
            }),
          onError: () => "error"
        }))
      )
      assert.deepEqual(items, ["a", "b", "c"])
      yield* destroyLatch.await
    }))

  it.effect("write error", () =>
    Effect.gen(function*() {
      const items: Array<string> = []
      const sink = NodeSink.fromWritable({
        evaluate: () =>
          new Writable({
            construct(callback) {
              callback()
            },
            write(chunk, _encoding, callback) {
              items.push(chunk.toString())
              callback()
            },
            destroy(_error, callback) {
              callback(null)
            }
          }),
        onError: () => "error"
      })
      const result = yield* Stream.fail("a").pipe(Stream.run(sink), Effect.flip)
      assert.deepEqual(items, [])
      assert.strictEqual(result, "a")
    }))

  it.live("endOnClose false", () =>
    Effect.gen(function*() {
      const items: Array<string> = []
      let destroyed = false
      const sink = NodeSink.fromWritable({
        evaluate: () =>
          new Writable({
            construct(callback) {
              callback()
            },
            write(chunk, _encoding, callback) {
              items.push(chunk.toString())
              callback()
            },
            destroy(_error, callback) {
              destroyed = true
              callback(null)
            }
          }),
        onError: () => "error",
        endOnDone: false
      })
      yield* Stream.run(Stream.make("a", "b", "c"), sink)
      yield* Effect.sleep(10)
      assert.deepEqual(items, ["a", "b", "c"])
      assert.strictEqual(destroyed, false)
    }))

  it.effect("should handle non-compliant node streams", () =>
    Effect.gen(function*() {
      const stream = NodeStream.fromReadable<Uint8Array, "error">({
        evaluate: () => createReadStream(TEST_TARBALL),
        onError: () => "error"
      })
      const items = yield* entries(stream).pipe(
        Stream.flatMap((entry) =>
          NodeStream.fromReadable({
            evaluate: () => (entry as any),
            onError: (error) => new TarError({ error })
          }).pipe(
            Stream.map((content) => ({
              path: entry.path,
              content: Buffer.from(content).toString("utf-8")
            }))
          )
        ),
        Stream.runCollect
      )
      assert.deepEqual(items, [
        { path: "./tar/world.txt", content: "world\n" },
        { path: "./tar/hello.txt", content: "hello\n" }
      ])
    }))
})

class TarError extends Data.TaggedError("TarError")<{
  readonly error: unknown
}> {}

const entries = <R, E>(
  input: Stream.Stream<Uint8Array, E, R>
): Stream.Stream<Tar.ReadEntry, TarError | E, R> =>
  Effect.gen(function*() {
    const parser = new Tar.Parser()

    yield* input.pipe(
      Stream.run(
        NodeSink.fromWritable({
          evaluate: () => parser,
          onError: (error) => new TarError({ error })
        })
      ),
      Effect.forkScoped
    )

    return Stream.callback<Tar.ReadEntry, TarError>((queue) =>
      Effect.sync(() => {
        parser.on("entry", (entry) => {
          Queue.offerUnsafe(queue, entry)
        })
        parser.on("close", () => {
          Queue.endUnsafe(queue)
        })
      })
    )
  }).pipe(Stream.unwrap)
