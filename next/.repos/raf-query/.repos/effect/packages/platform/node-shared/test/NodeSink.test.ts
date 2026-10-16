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
