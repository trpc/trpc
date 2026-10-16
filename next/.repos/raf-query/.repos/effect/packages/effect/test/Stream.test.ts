/* oxlint-disable no-restricted-syntax */
import { assert, describe, it } from "@effect/vitest"
import { assertExitFailure, assertSuccess, assertTrue, deepStrictEqual, strictEqual } from "@effect/vitest/utils"
import {
  Array,
  ByteSize,
  Cause,
  Channel,
  Clock,
  Context,
  Data,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  Latch,
  Logger,
  type LogLevel,
  Option,
  type Pull,
  Queue,
  Ref,
  References,
  Result,
  Schedule,
  Scheduler,
  Schema,
  Scope,
  Sink,
  Stream,
  String as Str
} from "effect"
import { isReadonlyArrayNonEmpty, type NonEmptyArray } from "effect/Array"
import { constTrue, constVoid, pipe } from "effect/Function"
import { TestClock } from "effect/testing"
import * as fc from "fast-check"
import { assertCauseFail, assertFailure } from "./utils/assert.ts"
import { chunkCoordination } from "./utils/chunkCoordination.ts"

describe("Stream", () => {
  describe("callback", () => {
    it.effect("with take", () =>
      Effect.gen(function*() {
        const array = [1, 2, 3, 4, 5]
        const result = yield* Stream.callback<number>((mb) =>
          Effect.sync(() => {
            array.forEach((n) => {
              Queue.offerUnsafe(mb, n)
            })
          })
        ).pipe(
          Stream.take(array.length),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, array)
      }))

    it.effect("with cleanup", () =>
      Effect.gen(function*() {
        let cleanup = false
        const latch = yield* Latch.make()
        const fiber = yield* Stream.callback<void>(Effect.fnUntraced(function*(mb) {
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              cleanup = true
            })
          )
          yield* Queue.offer(mb, void 0)
        })).pipe(
          Stream.tap(() => latch.open),
          Stream.runDrain,
          Effect.forkChild
        )
        yield* latch.await
        yield* Fiber.interrupt(fiber)
        assert.isTrue(cleanup)
      }))

    it.effect("signals the end of the stream", () =>
      Effect.gen(function*() {
        const result = yield* Stream.callback<number>((mb) => {
          Queue.endUnsafe(mb)
          return Effect.void
        }).pipe(Stream.runCollect)
        assert.isTrue(result.length === 0)
      }))

    it.effect("handles errors", () =>
      Effect.gen(function*() {
        const error = new Error("boom")
        const result = yield* Stream.callback<number, Error>((mb) => {
          Queue.failCauseUnsafe(mb, Cause.fail(error))
          return Effect.void
        }).pipe(
          Stream.runCollect,
          Effect.exit
        )
        assert.deepStrictEqual(result, Exit.fail(error))
      }))

    it.effect("handles defects", () =>
      Effect.gen(function*() {
        const error = new Error("boom")
        const result = yield* Stream.callback<number, Error>(() => {
          throw error
        }).pipe(
          Stream.runCollect,
          Effect.exit
        )
        assert.deepStrictEqual(result, Exit.die(error))
      }))

    it.effect("backpressure", () =>
      Effect.gen(function*() {
        let count = 0
        let offered = 0
        let done = false
        const pull = yield* Stream.callback<number>((mb) =>
          Effect.forEach(
            [1, 2, 3, 4, 5, 6, 7],
            Effect.fnUntraced(function*(n) {
              count++
              yield* Queue.offer(mb, n)
              offered++
            }),
            { concurrency: "unbounded" }
          ).pipe(
            Effect.tap(() => Effect.sync(() => done = true))
          ), { bufferSize: 2 }).pipe(Stream.toPull)
        yield* Effect.yieldNow
        assert.strictEqual(count, 7)
        assert.strictEqual(offered, 2)
        assert.isFalse(done)
        yield* pull
        assert.strictEqual(offered, 4)
        assert.isFalse(done)
      }))
  })

  describe("destructors", () => {
    const withScopeFinalizer = <A, E, R>(
      self: Stream.Stream<A, E, R>,
      finalizer: (exit: Exit.Exit<unknown, unknown>) => Effect.Effect<unknown>
    ): Stream.Stream<A, E, R> =>
      Stream.fromChannel(
        Channel.fromTransform((upstream, scope) =>
          Effect.andThen(
            Scope.addFinalizerExit(scope, finalizer),
            Channel.toTransform(Stream.toChannel(self))(upstream, scope)
          )
        )
      )

    it.effect("mkArrayBuffer - concatenates Uint8Array chunks", () =>
      Effect.gen(function*() {
        const buffer = yield* Stream.make(
          new Uint8Array([1, 2]),
          new Uint8Array([3, 4])
        ).pipe(Stream.mkArrayBuffer)

        assert.deepStrictEqual([...new Uint8Array(buffer)], [1, 2, 3, 4])
      }))

    it.effect("runForEachWhile continues across chunk boundaries", () =>
      Effect.gen(function*() {
        const seen: Array<number> = []
        yield* Stream.fromArrays([1, 2], [3, 4]).pipe(
          Stream.runForEachWhile((n) =>
            Effect.sync(() => {
              seen.push(n)
              return true
            })
          )
        )
        assert.deepStrictEqual(seen, [1, 2, 3, 4])
      }))

    it.effect("runForEachWhile stops when predicate returns false", () =>
      Effect.gen(function*() {
        const seen: Array<number> = []
        yield* Stream.fromArrays([1, 2, 3], [4, 5]).pipe(
          Stream.runForEachWhile((n) =>
            Effect.sync(() => {
              seen.push(n)
              return n < 3
            })
          )
        )
        assert.deepStrictEqual(seen, [1, 2, 3])
      }))

    it.effect("toAsyncIterable - return interrupts an in-flight pull", () =>
      Effect.gen(function*() {
        const started = yield* Deferred.make<void>()
        let interrupted = false
        const iterator = Stream.toAsyncIterable(
          Stream.fromEffect(
            Effect.andThen(
              Deferred.succeed(started, void 0),
              Effect.never
            ).pipe(
              Effect.onInterrupt(() =>
                Effect.sync(() => {
                  interrupted = true
                })
              )
            )
          )
        )[Symbol.asyncIterator]()

        const pending = iterator.next()
        yield* Deferred.await(started)
        const result = yield* Effect.promise(() => iterator.return!(undefined))
        const pendingResult = yield* Effect.promise(() => pending)

        assert.deepStrictEqual(result, { done: true, value: undefined })
        assert.deepStrictEqual(pendingResult, { done: true, value: undefined })
        assert.isTrue(interrupted)
      }))

    it.effect("toAsyncIterable - return does not reject an unawaited in-flight next", () =>
      Effect.gen(function*() {
        let interrupted = false
        const iterator = Stream.toAsyncIterable(
          Stream.fromEffect(
            Effect.never.pipe(
              Effect.onInterrupt(() =>
                Effect.sync(() => {
                  interrupted = true
                })
              )
            )
          )
        )[Symbol.asyncIterator]()

        iterator.next()
        const result = yield* Effect.promise(() => iterator.return!(undefined))
        yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

        assert.deepStrictEqual(result, { done: true, value: undefined })
        assert.isTrue(interrupted)
      }))

    it.effect("toAsyncIterable - early for await exit interrupts the producer", () =>
      Effect.gen(function*() {
        let interrupted = false
        const iterable = Stream.toAsyncIterable(
          Stream.callback<number>((queue) =>
            Effect.andThen(
              Queue.offer(queue, 1),
              Effect.never
            ).pipe(
              Effect.onInterrupt(() =>
                Effect.sync(() => {
                  interrupted = true
                })
              )
            )
          )
        )

        yield* Effect.promise(async () => {
          for await (const _ of iterable) {
            break
          }
        })

        assert.isTrue(interrupted)
      }))

    it.effect("toAsyncIterable - return is idempotent without an in-flight pull", () =>
      Effect.gen(function*() {
        const iterator = Stream.toAsyncIterable(Stream.make(1))[Symbol.asyncIterator]()

        const first = yield* Effect.promise(() => iterator.return!(undefined))
        const second = yield* Effect.promise(() => iterator.return!(undefined))
        const next = yield* Effect.promise(() => iterator.next())

        assert.deepStrictEqual(first, { done: true, value: undefined })
        assert.deepStrictEqual(second, { done: true, value: undefined })
        assert.deepStrictEqual(next, { done: true, value: undefined })
      }))

    it.effect("toAsyncIterable - natural completion closes the scope with a successful exit", () =>
      Effect.gen(function*() {
        const finalizerExits: Array<Exit.Exit<unknown, unknown>> = []
        const stream = withScopeFinalizer(
          Stream.make(1, 2),
          (exit) =>
            Effect.sync(() => {
              finalizerExits.push(exit)
            })
        )
        const values = yield* Effect.promise(async () => {
          const values: Array<number> = []
          for await (const value of Stream.toAsyncIterable(stream)) {
            values.push(value)
          }
          return values
        })

        assert.deepStrictEqual(values, [1, 2])
        assert.deepStrictEqual(finalizerExits, [Exit.void])
      }))

    it.effect("toAsyncIterable - stream failure is forwarded to the scope", () =>
      Effect.gen(function*() {
        const streamError = new Error("stream failure")
        const finalizerError = new Error("finalizer failure")
        const finalizerExits: Array<Exit.Exit<unknown, unknown>> = []
        const capturedLogs: Array<unknown> = []
        const testLogger = Logger.make<unknown, void>((options) => {
          capturedLogs.push(options.message)
        })
        const stream = withScopeFinalizer(
          Stream.fail(streamError),
          (exit) =>
            Effect.andThen(
              Effect.sync(() => {
                finalizerExits.push(exit)
              }),
              Effect.die(finalizerError)
            )
        )

        const thrown = yield* Effect.gen(function*() {
          const iterable = yield* Stream.toAsyncIterableEffect(stream)
          return yield* Effect.promise(() => iterable[Symbol.asyncIterator]().next().catch((error) => error))
        }).pipe(Effect.withLogger(testLogger))

        assert.strictEqual(thrown, streamError)
        assert.deepStrictEqual(finalizerExits, [Exit.fail(streamError)])
        assert.strictEqual(capturedLogs.length, 1)
      }))

    it.effect("toAsyncIterable - throw forwards a failure exit and preserves its error", () =>
      Effect.gen(function*() {
        const thrownError = new Error("thrown failure")
        const finalizerError = new Error("finalizer failure")
        const finalizerExits: Array<Exit.Exit<unknown, unknown>> = []
        const capturedLogs: Array<unknown> = []
        const testLogger = Logger.make<unknown, void>((options) => {
          capturedLogs.push(options.message)
        })
        const stream = withScopeFinalizer(
          Stream.make(1),
          (exit) =>
            Effect.andThen(
              Effect.sync(() => {
                finalizerExits.push(exit)
              }),
              Effect.die(finalizerError)
            )
        )

        const thrown = yield* Effect.gen(function*() {
          const iterator = (yield* Stream.toAsyncIterableEffect(stream))[Symbol.asyncIterator]()
          yield* Effect.promise(() => iterator.next())
          return yield* Effect.promise(() => iterator.throw!(thrownError).catch((error) => error))
        }).pipe(Effect.withLogger(testLogger))

        assert.strictEqual(thrown, thrownError)
        assert.deepStrictEqual(finalizerExits, [Exit.die(thrownError)])
        assert.strictEqual(capturedLogs.length, 1)
      }))

    it.effect("toAsyncIterable - throw interrupts an in-flight pull", () =>
      Effect.gen(function*() {
        const started = yield* Deferred.make<void>()
        let interrupted = false
        const iterator = Stream.toAsyncIterable(
          Stream.fromEffect(
            Effect.andThen(
              Deferred.succeed(started, void 0),
              Effect.never
            ).pipe(
              Effect.onInterrupt(() =>
                Effect.sync(() => {
                  interrupted = true
                })
              )
            )
          )
        )[Symbol.asyncIterator]()
        const error = new Error("boom")

        const pending = iterator.next()
        yield* Deferred.await(started)
        const thrown = yield* Effect.promise(() => iterator.throw!(error).catch((error) => error))
        const pendingResult = yield* Effect.promise(() => pending)

        assert.strictEqual(thrown, error)
        assert.deepStrictEqual(pendingResult, { done: true, value: undefined })
        assert.isTrue(interrupted)
      }))
  })

  describe("constructors", () => {
    class Greeter extends Context.Service<Greeter, {
      readonly greet: (name: string) => string
    }>()("Greeter") {}

    it.effect("range - min less than max", () =>
      Effect.gen(function*() {
        const result = yield* Stream.range(1, 3).pipe(Stream.runCollect)
        assert.deepStrictEqual(result, [1, 2, 3])
      }))

    it.effect("range - zero chunk size does not change the emitted range", () =>
      Effect.gen(function*() {
        const result = yield* Stream.range(1, 3, 0).pipe(
          Stream.take(4),
          Stream.runCollect
        )

        assert.deepStrictEqual(result, [1, 2, 3])
      }))

    it.effect("range - normalizes the chunk size without changing emitted values", () =>
      Effect.gen(function*() {
        const results = yield* Effect.forEach([Number.NaN, 0, 2.9], (chunkSize) =>
          Stream.range(1, 5, chunkSize).pipe(
            Stream.chunks,
            Stream.runCollect
          ))
        assert.deepStrictEqual(results, [
          [[1], [2], [3], [4], [5]],
          [[1], [2], [3], [4], [5]],
          [[1, 2], [3, 4], [5]]
        ])
      }))

    it.effect("service", () =>
      Effect.gen(function*() {
        const result = yield* Stream.service(Greeter).pipe(
          Stream.map((greeter) => greeter.greet("World")),
          Stream.provideService(Greeter, {
            greet: (name) => `Hello, ${name}!`
          }),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, ["Hello, World!"])
      }))

    it.effect("serviceOption - some", () =>
      Effect.gen(function*() {
        const result = yield* Stream.serviceOption(Greeter).pipe(
          Stream.map((option) => Option.map(option, (greeter) => greeter.greet("World"))),
          Stream.provideService(Greeter, {
            greet: (name) => `Hello, ${name}!`
          }),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, [Option.some("Hello, World!")])
      }))

    it.effect("serviceOption - none", () =>
      Effect.gen(function*() {
        const result = yield* Stream.serviceOption(Greeter).pipe(Stream.runCollect)
        assert.deepStrictEqual(result, [Option.none()])
      }))

    it.effect("range - min greater than max", () =>
      Effect.gen(function*() {
        const result = yield* Stream.range(4, 3).pipe(Stream.runCollect)
        assert.deepStrictEqual(result, [])
      }))

    it.effect("range - min equal to max", () =>
      Effect.gen(function*() {
        const result = yield* Stream.range(3, 3).pipe(Stream.runCollect)
        assert.deepStrictEqual(result, [3])
      }))

    it.effect("fromIteratorSucceed - normalizes the chunk size", () =>
      Effect.gen(function*() {
        const results = yield* Effect.forEach([Number.NaN, -1, 1.9], (maxChunkSize) =>
          Stream.fromIteratorSucceed([1, 2, 3][Symbol.iterator](), maxChunkSize).pipe(
            Stream.chunks,
            Stream.runCollect
          ))
        assert.deepStrictEqual(results, [
          [[1], [2], [3]],
          [[1], [2], [3]],
          [[1], [2], [3]]
        ])
      }))

    it.effect("fromIterable - emits array as one chunk by default", () =>
      Effect.gen(function*() {
        const result = yield* Stream.fromIterable([1, 2, 3, 4]).pipe(
          Stream.chunks,
          Stream.runCollect
        )
        assert.deepStrictEqual(result, [[1, 2, 3, 4]])
      }))

    it.effect("fromIterable - supports chunkSize option", () =>
      Effect.gen(function*() {
        const result = yield* Stream.fromIterable([1, 2, 3, 4, 5], { chunkSize: 2 }).pipe(
          Stream.chunks,
          Stream.runCollect
        )
        assert.deepStrictEqual(result, [[1, 2], [3, 4], [5]])
      }))

    it.effect("fromIterable - normalizes the chunk size", () =>
      Effect.gen(function*() {
        const results = yield* Effect.forEach([Number.NaN, 0, 2.9], (chunkSize) =>
          Stream.fromIterable([1, 2, 3], { chunkSize }).pipe(
            Stream.chunks,
            Stream.runCollect
          ))
        assert.deepStrictEqual(results, [
          [[1], [2], [3]],
          [[1], [2], [3]],
          [[1, 2], [3]]
        ])
      }))

    it.effect("scoped - provides scope to fromEffect pull effects", () =>
      Effect.gen(function*() {
        const releases = yield* Ref.make(0)
        const result = yield* Stream.fromEffect(
          Effect.acquireRelease(
            Effect.succeed("resource"),
            () => Ref.update(releases, (n) => n + 1)
          )
        ).pipe(
          Stream.scoped,
          Stream.runCollect
        )

        assert.deepStrictEqual(result, ["resource"])
        assert.strictEqual(yield* Ref.get(releases), 1)
      }))

    it.effect("scoped - provides scope to sequential mapEffect pull effects", () =>
      Effect.gen(function*() {
        const releases = yield* Ref.make(0)
        const result = yield* Stream.fromIterable([1, 2]).pipe(
          Stream.mapEffect((n) =>
            Effect.acquireRelease(
              Effect.succeed(n * 2),
              () => Ref.update(releases, (count) => count + 1)
            )
          ),
          Stream.scoped,
          Stream.runCollect
        )

        assert.deepStrictEqual(result, [2, 4])
        assert.strictEqual(yield* Ref.get(releases), 2)
      }))

    it.effect("fromReadableStream - errored streams fail with the mapped error, not a finalizer defect", () =>
      Effect.gen(function*() {
        const exit = yield* Stream.fromReadableStream({
          evaluate: () =>
            new ReadableStream<number>({
              start(controller) {
                controller.error(new Error("boom"))
              }
            }),
          onError: (error) => new Error(`mapped: ${(error as Error).message}`)
        }).pipe(Stream.runDrain, Effect.exit)

        assertTrue(Exit.isFailure(exit))
        if (Exit.isFailure(exit)) {
          assertTrue(exit.cause.reasons.every(Cause.isFailReason))
          deepStrictEqual(Cause.squash(exit.cause), new Error("mapped: boom"))
        }
      }))
  })

  describe("encoding", () => {
    it.effect("decodeText handles multi-byte characters split across chunks", () =>
      Effect.gen(function*() {
        const bytes = new TextEncoder().encode("🌍")
        const result = yield* Stream.make(bytes.slice(0, 2), bytes.slice(2)).pipe(
          Stream.decodeText(),
          Stream.mkString
        )
        assert.strictEqual(result, "🌍")
      }))

    it.effect("decodeText handles mixed ASCII and multi-byte characters across chunks", () =>
      Effect.gen(function*() {
        const bytes = new TextEncoder().encode("Hello 🌍!")
        const split = 8
        const result = yield* Stream.make(bytes.slice(0, split), bytes.slice(split)).pipe(
          Stream.decodeText(),
          Stream.mkString
        )
        assert.strictEqual(result, "Hello 🌍!")
      }))

    describe("splitLines", () => {
      const splitLines = (chunks: ReadonlyArray<string>) =>
        Stream.fromIterable(chunks).pipe(
          Stream.splitLines,
          Stream.runCollect
        )

      it.effect("handles an empty stream", () =>
        Effect.gen(function*() {
          const result = yield* splitLines([])
          assert.deepStrictEqual(result, [])
        }))

      it.effect("handles empty chunks and repeated line feeds", () =>
        Effect.gen(function*() {
          const result = yield* splitLines(["", "a\n\n", "", "b\n", ""])
          assert.deepStrictEqual(result, ["a", "", "b"])
        }))

      it.effect("handles line feeds across chunks", () =>
        Effect.gen(function*() {
          const result = yield* splitLines(["a\nb", "\nc\n", "d"])
          assert.deepStrictEqual(result, ["a", "b", "c", "d"])
        }))

      it.effect("handles carriage return / line feed pairs across chunks", () =>
        Effect.gen(function*() {
          const result = yield* splitLines(["a\r", "\nb\r", "\nc"])
          assert.deepStrictEqual(result, ["a", "b", "c"])
        }))

      it.effect("emits a carriage-return-terminated line before pulling upstream again", () =>
        Effect.gen(function*() {
          const result = yield* Stream.succeed("a\r").pipe(
            Stream.concat(Stream.fail("boom")),
            Stream.splitLines,
            Stream.take(1),
            Stream.runCollect,
            Effect.result
          )
          assert.deepStrictEqual(result, Result.succeed(["a"]))
        }))

      it.effect("emits the final line when the stream does not end with a newline", () =>
        Effect.gen(function*() {
          const result = yield* splitLines(["a\nb\nc\n", "d\ne"])
          assert.deepStrictEqual(result, ["a", "b", "c", "d", "e"])
        }))

      it.effect("does not pull upstream again after flushing the final line", () =>
        Effect.gen(function*() {
          let pulls = 0
          const stream = Stream.fromPull(Effect.sync(() => {
            const pull = Effect.suspend(
              (): Pull.Pull<Array.NonEmptyReadonlyArray<string>, string> => {
                pulls++
                switch (pulls) {
                  case 1:
                    return Effect.succeed(Array.of("a"))
                  case 2:
                    return Cause.done()
                  default:
                    return Effect.fail("pulled after done")
                }
              }
            )
            return pull
          }))

          const result = yield* stream.pipe(
            Stream.splitLines,
            Stream.runCollect
          )

          assert.deepStrictEqual(result, ["a"])
          assert.strictEqual(pulls, 2)
        }))

      it.effect("handles standalone carriage returns within a chunk", () =>
        Effect.gen(function*() {
          const result = yield* splitLines(["a\rb\rc"])
          assert.deepStrictEqual(result, ["a", "b", "c"])
        }))

      it.effect("handles standalone carriage returns across chunk boundaries", () =>
        Effect.gen(function*() {
          const result = yield* splitLines(["a\r", "b\r", "c"])
          assert.deepStrictEqual(result, ["a", "b", "c"])
        }))

      it.effect.prop(
        "matches String.linesIterator regardless of chunk boundaries",
        {
          chunks: Schema.Array(
            Schema.String.check(Schema.isPattern(/^[ab\n\r]*$/), Schema.isMaxLength(8))
          ).check(Schema.isMaxLength(8))
        },
        Effect.fnUntraced(function*({ chunks }) {
          const result = yield* splitLines(chunks)
          const expected = globalThis.Array.from(Str.linesIterator(chunks.join("")))
          assert.deepStrictEqual(result, expected)
        })
      )
    })
  })

  describe("filtering", () => {
    it.effect("filterMap", () =>
      Effect.gen(function*() {
        const result = yield* Stream.make(1, 2, 3, 4).pipe(
          Stream.filterMap((n) => n % 2 === 0 ? Result.succeed(n + 10) : Result.failVoid),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, [12, 14])
      }))

    it.effect("filterMapEffect", () =>
      Effect.gen(function*() {
        const result = yield* Stream.make(1, 2, 3, 4).pipe(
          Stream.filterMapEffect((n) => Effect.succeed(n % 2 === 0 ? Result.succeed(n + 1) : Result.failVoid)),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, [3, 5])
      }))
  })

  describe("taking", () => {
    it.effect("limitBytes - does not evaluate the fallback below the limit", () =>
      Effect.gen(function*() {
        let evaluated = false
        const chunks = [new Uint8Array([1, 2]), new Uint8Array([3, 4])]
        const result = yield* Stream.fromIterable(chunks).pipe(
          Stream.limitBytes("5 B", () => {
            evaluated = true
            return Stream.empty
          }),
          Stream.runCollect
        )

        assert.deepStrictEqual(result, chunks)
        assert.isFalse(evaluated)
      }))

    it.effect("limitBytes - does not evaluate the fallback at the limit", () =>
      Effect.gen(function*() {
        let evaluated = false
        const chunks = [new Uint8Array([1, 2]), new Uint8Array([3, 4])]
        const result = yield* Stream.fromIterable(chunks).pipe(
          Stream.limitBytes(ByteSize.bytes(4), () => {
            evaluated = true
            return Stream.empty
          }),
          Stream.runCollect
        )

        assert.deepStrictEqual(result, chunks)
        assert.isFalse(evaluated)
      }))

    it.effect("limitBytes - drops the crossing chunk and switches to the fallback", () =>
      Effect.gen(function*() {
        const first = new Uint8Array([1, 2])
        const crossing = new Uint8Array([3, 4, 5, 6])
        const after = new Uint8Array([7])
        const fallback = new Uint8Array([8, 9])
        const result = yield* Stream.make(first, crossing, after).pipe(
          Stream.limitBytes(ByteSize.bytes(5), () => Stream.succeed(fallback)),
          Stream.runCollect
        )

        assert.deepStrictEqual(result, [first, fallback])
      }))

    it.effect("take - pulls the first `n` values from a stream", () =>
      Effect.gen(function*() {
        const result = yield* Stream.range(1, 5).pipe(
          Stream.take(3),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, [1, 2, 3])
      }))

    it.effect("take - rounds positive fractional counts down", () =>
      Effect.gen(function*() {
        const results = yield* Effect.forEach([0.5, 1.9, 2.9], (n) =>
          Stream.make(1, 2, 3).pipe(
            Stream.take(n),
            Stream.runCollect
          ))
        assert.deepStrictEqual(results, [[], [1], [1, 2]])
      }))

    it.effect("take - short-circuits stream evaluation", () =>
      Effect.gen(function*() {
        const result = yield* Stream.succeed(1).pipe(
          Stream.concat(Stream.never),
          Stream.take(1),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, [1])
      }))

    it.effect("take - taking 0 short-circuits stream evaluation", () =>
      Effect.gen(function*() {
        const result = yield* Stream.never.pipe(
          Stream.take(0),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, [])
      }))

    it.effect("take - treating NaN as a non-positive count", () =>
      Effect.gen(function*() {
        const result = yield* Stream.make(1, 2, 3).pipe(
          Stream.take(Number.NaN),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, [])
      }))

    it.effect("take - NaN short-circuits stream evaluation", () =>
      Effect.gen(function*() {
        const result = yield* Stream.never.pipe(
          Stream.take(Number.NaN),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, [])
      }))

    it.effect("takeUntil - takes elements until a predicate is satisfied", () =>
      Effect.gen(function*() {
        const result = yield* Stream.range(1, 5).pipe(
          Stream.takeUntil((n) => n % 3 === 0),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, [1, 2, 3])
      }))

    it.effect("takeWhile - takes elements while a predicate is satisfied", () =>
      Effect.gen(function*() {
        const result = yield* Stream.range(1, 5).pipe(
          Stream.takeWhile((n) => n % 3 !== 0),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, [1, 2])
      }))

    it.effect("takeWhileFilter - takes elements while a filter succeeds", () =>
      Effect.gen(function*() {
        const result = yield* Stream.range(1, 5).pipe(
          Stream.takeWhileFilter((n) => n < 3 ? Result.succeed(n + 10) : Result.failVoid),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, [11, 12])
      }))

    it.effect("takeUntilEffect - takes elements until an effectful predicate is satisfied", () =>
      Effect.gen(function*() {
        const result = yield* Stream.range(1, 5).pipe(
          Stream.takeUntilEffect((n) => Effect.succeed(n % 3 === 0)),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, [1, 2, 3])
      }))

    it.effect("takeWhileEffect - takes elements while an effectful predicate is satisfied", () =>
      Effect.gen(function*() {
        const result = yield* Stream.range(1, 5).pipe(
          Stream.takeWhileEffect((n) => Effect.succeed(n % 3 !== 0)),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, [1, 2])
      }))

    it.effect("takeRight", () =>
      Effect.gen(function*() {
        const take = 3
        const stream = Stream.range(1, 5)
        const { result1, result2 } = yield* (Effect.all({
          result1: pipe(stream, Stream.takeRight(take), Stream.runCollect),
          result2: pipe(Stream.runCollect(stream), Effect.map(Array.takeRight(take)))
        }))
        deepStrictEqual(result1, result2)
      }))

    it.effect("takeRight - normalizes the element count", () =>
      Effect.gen(function*() {
        const results = yield* Effect.forEach([Number.NaN, -1, 0.5, 1.9, 2.9], (n) =>
          Stream.make(1, 2, 3).pipe(
            Stream.takeRight(n),
            Stream.runCollect
          ))
        assert.deepStrictEqual(results, [[], [], [], [3], [2, 3]])
      }))

    it.effect("takeRight - zero normalized counts do not evaluate the upstream", () =>
      Effect.gen(function*() {
        const result = yield* Stream.fromEffect(Effect.die("upstream evaluated")).pipe(
          Stream.takeRight(Number.NaN),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, [])
      }))
  })

  describe("pagination", () => {
    it.effect("paginate", () =>
      Effect.gen(function*() {
        const s: readonly [ReadonlyArray<number>, Array<number>] = [[0], [1, 2, 3, 4, 5]]
        const pageSize = 2
        const result = yield* Stream.paginate(s, ([chunk, nums]) =>
          nums.length === 0 ?
            Effect.succeed([chunk, Option.none<readonly [ReadonlyArray<number>, Array<number>]>()] as const) :
            Effect.succeed(
              [
                chunk,
                Option.some(
                  [
                    nums.slice(0, pageSize),
                    nums.slice(pageSize)
                  ] as const
                )
              ] as const
            )).pipe(Stream.runCollect)
        assert.deepStrictEqual(result, [0, 1, 2, 3, 4, 5])
      }))
  })

  describe("error handling", () => {
    it.effect("catch", () =>
      Effect.gen(function*() {
        let error: string | undefined = undefined
        const results = yield* Stream.make(1, 2, 3).pipe(
          Stream.concat(Stream.fail("boom")),
          Stream.catch((error_) => {
            error = error_
            return Stream.make(4, 5, 6)
          }),
          Stream.runCollect
        )
        assert.deepStrictEqual(results, [1, 2, 3, 4, 5, 6])
        assert.strictEqual(error, "boom")
      }))

    it.effect("tapCause preserves failures", () =>
      Effect.gen(function*() {
        const exit = yield* Stream.fail("boom").pipe(
          Stream.tapCause(() => Effect.void),
          Stream.runCollect,
          Effect.exit
        )
        assertExitFailure(exit, Cause.fail("boom"))
      }))

    it.effect("tapCause preserves defects", () =>
      Effect.gen(function*() {
        const defect = new Error("boom")
        const exit = yield* Stream.die(defect).pipe(
          Stream.tapCause(() => Effect.void),
          Stream.runCollect,
          Effect.exit
        )
        assertExitFailure(exit, Cause.die(defect))
      }))

    it.effect("catchDefect", () =>
      Effect.gen(function*() {
        const defect = new Error("boom")
        const recovered = yield* Stream.die(defect).pipe(
          Stream.catchDefect((caught) => Stream.succeed(caught)),
          Stream.runCollect
        )
        const failed = yield* Stream.fail("failure").pipe(
          Stream.catchDefect(() => Stream.succeed("recovered")),
          Stream.runCollect,
          Effect.exit
        )
        assert.deepStrictEqual(recovered, [defect])
        assertExitFailure(failed, Cause.fail("failure"))
      }))

    it.effect("catchIf with refinement", () =>
      Effect.gen(function*() {
        interface ErrorA {
          readonly _tag: "ErrorA"
        }
        interface ErrorB {
          readonly _tag: "ErrorB"
        }
        const stream: Stream.Stream<never, ErrorA | ErrorB> = Stream.fail({ _tag: "ErrorB" as const })
        const result = yield* pipe(
          stream,
          Stream.catchIf((error): error is ErrorA => error._tag === "ErrorA", () => Stream.succeed("ok")),
          Stream.runCollect,
          Effect.exit
        )
        assert.deepStrictEqual(result, Exit.fail({ _tag: "ErrorB" as const }))
      }))

    it.effect("catchIf with refinement orElse", () =>
      Effect.gen(function*() {
        interface ErrorA {
          readonly _tag: "ErrorA"
        }
        interface ErrorB {
          readonly _tag: "ErrorB"
        }
        const result = yield* (Stream.fail({ _tag: "ErrorB" as const }) as Stream.Stream<never, ErrorA | ErrorB>).pipe(
          Stream.catchIf(
            (error): error is ErrorA => error._tag === "ErrorA",
            () => Stream.succeed("caught"),
            () => Stream.succeed("fallback")
          ),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, ["fallback"])
      }))

    it.effect("catchIf with predicate", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.fail("boom" as string | number),
          Stream.catchIf(
            (e) => typeof e === "string",
            (e) => Stream.succeed(`caught: ${e}`)
          ),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, ["caught: boom"])
      }))

    it.effect("catchIf predicate no match", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.fail(42 as string | number),
          Stream.catchIf(
            (e) => typeof e === "string",
            () => Stream.succeed("caught")
          ),
          Stream.runCollect,
          Effect.exit
        )
        assert.deepStrictEqual(result, Exit.fail(42))
      }))

    it.effect("catchIf with filter input", () =>
      Effect.gen(function*() {
        const matched = yield* Stream.catchFilter(
          Stream.fail("boom" as string | number),
          (e: string | number) => typeof e === "string" ? Result.succeed(e.length) : Result.fail(`fallback: ${e}`),
          (length) => Stream.succeed(`caught: ${length}`),
          (failure) => Stream.succeed(failure)
        ).pipe(Stream.runCollect)
        const unmatched = yield* Stream.catchFilter(
          Stream.fail(42 as string | number),
          (e: string | number) => typeof e === "string" ? Result.succeed(e.length) : Result.fail(`fallback: ${e}`),
          (length) => Stream.succeed(`caught: ${length}`),
          (failure) => Stream.succeed(failure)
        ).pipe(Stream.runCollect)
        assert.deepStrictEqual(matched, ["caught: 4"])
        assert.deepStrictEqual(unmatched, ["fallback: 42"])
      }))

    it.effect("catchCauseFilter", () =>
      Effect.gen(function*() {
        const recovered = yield* Stream.fail("boom").pipe(
          Stream.catchCauseFilter(
            (cause) => Cause.hasFails(cause) ? Result.succeed(Cause.squash(cause)) : Result.fail(cause),
            (failure) => Stream.succeed(`recovered: ${failure}`)
          ),
          Stream.runCollect
        )
        assert.deepStrictEqual(recovered, ["recovered: boom"])
      }))

    it.effect("catchTag orElse", () =>
      Effect.gen(function*() {
        class HttpError extends Data.TaggedError("HttpError")<{
          readonly message: string
        }> {}
        class ValidationError extends Data.TaggedError("ValidationError")<{
          readonly field: string
        }> {}
        const result = yield* Stream.catchTag(
          Stream.fail(new ValidationError({ field: "email" })) as Stream.Stream<never, HttpError | ValidationError>,
          "HttpError",
          () => Stream.succeed("http"),
          () => Stream.succeed("fallback")
        ).pipe(Stream.runCollect)
        assert.deepStrictEqual(result, ["fallback"])
      }))

    describe("ignore", () => {
      type IgnoreOptions = { readonly log?: boolean | LogLevel.Severity }

      const makeTestLogger = () => {
        const capturedLogs: Array<{
          readonly logLevel: LogLevel.LogLevel
          readonly cause: Cause.Cause<unknown>
        }> = []
        const testLogger = Logger.make<unknown, void>((options) => {
          capturedLogs.push({ logLevel: options.logLevel, cause: options.cause })
        })
        return { capturedLogs, testLogger }
      }

      const runIgnore = (options?: IgnoreOptions, currentLogLevel: LogLevel.Severity = "Info") =>
        Effect.gen(function*() {
          const { capturedLogs, testLogger } = makeTestLogger()
          const program = options === undefined
            ? Stream.fail("boom").pipe(Stream.ignore, Stream.runDrain)
            : Stream.fail("boom").pipe(Stream.ignore(options), Stream.runDrain)
          yield* program.pipe(
            Effect.provide(Logger.layer([testLogger])),
            Effect.provideService(References.MinimumLogLevel, "Trace"),
            Effect.provideService(References.CurrentLogLevel, currentLogLevel)
          )
          return capturedLogs
        })

      it.effect("does not log when log is omitted", () =>
        Effect.gen(function*() {
          const logs = yield* runIgnore()
          assert.strictEqual(logs.length, 0)
        }))

      it.effect("does not log when log is false", () =>
        Effect.gen(function*() {
          const logs = yield* runIgnore({ log: false })
          assert.strictEqual(logs.length, 0)
        }))

      it.effect("logs with the current level when log is true", () =>
        Effect.gen(function*() {
          const logs = yield* runIgnore({ log: true }, "Warn")
          assert.strictEqual(logs.length, 1)
          assert.strictEqual(logs[0].logLevel, "Warn")
          assertCauseFail(logs[0].cause, "boom")
        }))

      it.effect("logs with the provided level when log is a LogLevel", () =>
        Effect.gen(function*() {
          const logs = yield* runIgnore({ log: "Error" }, "Warn")
          assert.strictEqual(logs.length, 1)
          assert.strictEqual(logs[0].logLevel, "Error")
          assertCauseFail(logs[0].cause, "boom")
        }))
    })

    describe("catchReason", () => {
      class RateLimitError extends Data.TaggedError("RateLimitError")<{
        readonly retryAfter: number
      }> {}

      class QuotaExceededError extends Data.TaggedError("QuotaExceededError")<{
        readonly limit: number
      }> {}

      class AiError extends Data.TaggedError("AiError")<{
        readonly reason: RateLimitError | QuotaExceededError
      }> {}

      class OtherError extends Data.TaggedError("OtherError")<{
        readonly message: string
      }> {}

      it.effect("catches matching reason - handler succeeds", () =>
        Effect.gen(function*() {
          const result = yield* Stream.fail(
            new AiError({ reason: new RateLimitError({ retryAfter: 60 }) })
          ).pipe(
            Stream.catchReason("AiError", "RateLimitError", (r) => Stream.succeed(`retry: ${r.retryAfter}`)),
            Stream.runCollect
          )
          assert.deepStrictEqual(result, ["retry: 60"])
        }))

      it.effect("catches matching reason - handler fails", () =>
        Effect.gen(function*() {
          const reason = new RateLimitError({ retryAfter: 60 })
          const error = new OtherError({ message: "handled" })
          const exit = yield* Stream.fail(new AiError({ reason })).pipe(
            Stream.catchReason("AiError", "RateLimitError", () => Stream.fail(error)),
            Stream.runCollect,
            Effect.exit
          )
          assertExitFailure(exit, Cause.fail(error))
        }))

      it.effect("ignores non-matching reason", () =>
        Effect.gen(function*() {
          const reason = new QuotaExceededError({ limit: 100 })
          const error = new AiError({ reason })
          const exit = yield* Stream.fail(error).pipe(
            Stream.catchReason("AiError", "RateLimitError", () => Stream.succeed("no")),
            Stream.runCollect,
            Effect.exit
          )
          assertExitFailure(exit, Cause.fail(error))
        }))

      it.effect("handles non-matching reason with orElse", () =>
        Effect.gen(function*() {
          const result = yield* Stream.fail(
            new AiError({ reason: new QuotaExceededError({ limit: 100 }) })
          ).pipe(
            Stream.catchReason(
              "AiError",
              "RateLimitError",
              (reason) => Stream.succeed(`retry: ${reason.retryAfter}`),
              (reason) => Stream.succeed(`quota: ${reason.limit}`)
            ),
            Stream.runCollect
          )
          assert.deepStrictEqual(result, ["quota: 100"])
        }))

      it.effect("ignores non-matching parent tag", () =>
        Effect.gen(function*() {
          const error = new OtherError({ message: "test" })
          const exit = yield* (Stream.fail(error) as Stream.Stream<never, AiError | OtherError>).pipe(
            Stream.catchReason("AiError", "RateLimitError", () => Stream.succeed("no")),
            Stream.runCollect,
            Effect.exit
          )
          assertExitFailure(exit, Cause.fail(error))
        }))

      it.effect("orElse ignores non-matching parent tag", () =>
        Effect.gen(function*() {
          const error = new OtherError({ message: "test" })
          const exit = yield* (Stream.fail(error) as Stream.Stream<never, AiError | OtherError>).pipe(
            Stream.catchReason(
              "AiError",
              "RateLimitError",
              () => Stream.succeed("no"),
              () => Stream.succeed("fallback")
            ),
            Stream.runCollect,
            Effect.exit
          )
          assertExitFailure(exit, Cause.fail(error))
        }))
    })

    describe("catchReasons", () => {
      class RateLimitError extends Data.TaggedError("RateLimitError")<{
        readonly retryAfter: number
      }> {}

      class QuotaExceededError extends Data.TaggedError("QuotaExceededError")<{
        readonly limit: number
      }> {}

      class AiError extends Data.TaggedError("AiError")<{
        readonly reason: RateLimitError | QuotaExceededError
      }> {}

      it.effect("catches matching reason", () =>
        Effect.gen(function*() {
          const result = yield* Stream.fail(
            new AiError({ reason: new RateLimitError({ retryAfter: 60 }) })
          ).pipe(
            Stream.catchReasons("AiError", {
              RateLimitError: (r) => Stream.succeed(`retry: ${r.retryAfter}`)
            }),
            Stream.runCollect
          )
          assert.deepStrictEqual(result, ["retry: 60"])
        }))

      it.effect("ignores non-matching reason", () =>
        Effect.gen(function*() {
          const reason = new QuotaExceededError({ limit: 100 })
          const error = new AiError({ reason })
          const exit = yield* Stream.fail(error).pipe(
            Stream.catchReasons("AiError", {
              RateLimitError: () => Stream.succeed("no")
            }),
            Stream.runCollect,
            Effect.exit
          )
          assertExitFailure(exit, Cause.fail(error))
        }))

      it.effect("handles non-matching reason with orElse", () =>
        Effect.gen(function*() {
          const result = yield* Stream.fail(
            new AiError({ reason: new RateLimitError({ retryAfter: 60 }) })
          ).pipe(
            Stream.catchReasons(
              "AiError",
              {
                QuotaExceededError: (reason) => Stream.succeed(`quota: ${reason.limit}`)
              },
              (reason) => Stream.succeed(`fallback: ${reason._tag}`)
            ),
            Stream.runCollect
          )
          assert.deepStrictEqual(result, ["fallback: RateLimitError"])
        }))
    })

    describe("ignoreCause", () => {
      type IgnoreCauseOptions = { readonly log?: boolean | LogLevel.Severity }

      const makeTestLogger = () => {
        const capturedLogs: Array<{
          readonly logLevel: LogLevel.LogLevel
          readonly cause: Cause.Cause<unknown>
        }> = []
        const testLogger = Logger.make<unknown, void>((options) => {
          capturedLogs.push({ logLevel: options.logLevel, cause: options.cause })
        })
        return { capturedLogs, testLogger }
      }

      const runIgnoreCause = (
        options?: IgnoreCauseOptions,
        currentLogLevel: LogLevel.Severity = "Info"
      ) =>
        Effect.gen(function*() {
          const stream: Stream.Stream<never, string, never> = Stream.fail("boom")
          const program: Effect.Effect<Array<never>, never, never> = options === undefined
            ? stream.pipe(Stream.ignoreCause, Stream.runCollect)
            : stream.pipe(Stream.ignoreCause(options), Stream.runCollect)
          yield* Effect.scope
          const { capturedLogs, testLogger } = makeTestLogger()
          yield* program.pipe(
            Effect.withLogger(testLogger),
            Effect.provideService(References.MinimumLogLevel, "Trace"),
            Effect.provideService(References.CurrentLogLevel, currentLogLevel)
          )
          return capturedLogs
        })

      it.effect("does not log when log is omitted", () =>
        Effect.gen(function*() {
          const logs = yield* runIgnoreCause()
          assert.strictEqual(logs.length, 0)
        }))

      it.effect("does not log when log is false", () =>
        Effect.gen(function*() {
          const logs = yield* runIgnoreCause({ log: false })
          assert.strictEqual(logs.length, 0)
        }))

      it.effect("logs with the current level when log is true", () =>
        Effect.gen(function*() {
          const logs = yield* runIgnoreCause({ log: true }, "Warn")
          assert.strictEqual(logs.length, 1)
          assert.strictEqual(logs[0].logLevel, "Warn")
          assertCauseFail(logs[0].cause, "boom")
        }))

      it.effect("logs with the provided level when log is a LogLevel", () =>
        Effect.gen(function*() {
          const logs = yield* runIgnoreCause({ log: "Error" }, "Warn")
          assert.strictEqual(logs.length, 1)
          assert.strictEqual(logs[0].logLevel, "Error")
          assertCauseFail(logs[0].cause, "boom")
        }))
    })
  })

  describe("scanning", () => {
    it.effect("scan emits the initial state for Stream.empty", () =>
      Effect.gen(function*() {
        const result = yield* Stream.empty.pipe(
          Stream.scan(() => 0, (acc, curr: number) => acc + curr),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, [0])
      }))

    it.effect("scan", () =>
      Effect.gen(function*() {
        const stream = Stream.make(1, 2, 3, 4, 5)
        const { result1, result2 } = yield* Effect.all({
          result1: stream.pipe(Stream.scan(() => 0, (acc, curr) => acc + curr), Stream.runCollect),
          result2: Stream.runCollect(stream).pipe(
            Effect.map((chunk) => Array.scan(chunk, 0, (acc, curr) => acc + curr))
          )
        })
        assert.deepStrictEqual(result1, result2)
      }))

    it.effect("scanEffect", () =>
      Effect.gen(function*() {
        const result = yield* Stream.make(1, 2, 3, 4, 5).pipe(
          Stream.scanEffect(() => 0, (acc, curr) => Effect.succeed(acc + curr)),
          Stream.runCollect
        )

        assert.deepStrictEqual(result, Array.scan([1, 2, 3, 4, 5], 0, (acc, curr) => acc + curr))
      }))

    it.effect("mapAccumArrayEffect data-first", () =>
      Effect.gen(function*() {
        const result = yield* Stream.mapAccumArrayEffect(
          Stream.make(1, 2, 3),
          () => 0,
          (sum, values) => Effect.succeed([sum + values.length, values] as const)
        ).pipe(Stream.runCollect)

        assert.deepStrictEqual(result, [1, 2, 3])
      }))
  })

  describe("grouping", () => {
    it.effect("groupBy", () =>
      Effect.gen(function*() {
        const stream = Stream.make(1, 2, 3, 4, 5)
        const grouped = yield* stream.pipe(
          Stream.groupByKey((n) => n % 2 === 0 ? "even" : "odd"),
          Stream.mapEffect(
            Effect.fnUntraced(function*([key, stream]) {
              return [key, yield* Stream.runCollect(stream)] as const
            }),
            { concurrency: "unbounded" }
          ),
          Stream.runCollect
        )
        assert.deepStrictEqual(grouped, [
          ["odd", [1, 3, 5]],
          ["even", [2, 4]]
        ])
      }))
  })

  describe("concat", () => {
    class CountingScheduler extends Scheduler.MixedScheduler {
      ops = 0
      override shouldYield() {
        this.ops++
        return false
      }
    }

    it.effect("work per part does not grow with the length of a chain", () =>
      Effect.gen(function*() {
        const countOps = (n: number, nest: "left" | "right") => {
          let stream: Stream.Stream<number> = Stream.make(0)
          for (let i = 1; i < n; i++) {
            stream = nest === "left" ? Stream.concat(stream, Stream.make(i)) : Stream.concat(Stream.make(i), stream)
          }
          const scheduler = new CountingScheduler("sync")
          return Stream.runDrain(stream).pipe(
            Effect.provideService(Scheduler.Scheduler, scheduler),
            Effect.map(() => scheduler.ops)
          )
        }
        for (const nest of ["left", "right"] as const) {
          const small = yield* countOps(1_000, nest)
          const large = yield* countOps(2_000, nest)
          assertTrue(small > 1_000, `${nest}: operations were counted`)
          assertTrue(large / small < 2.5, `${nest}: doubling the chain multiplied the work by ${large / small}`)
        }
      }))

    it.effect("runs nested chains in order, closing each part before the next starts", () =>
      Effect.gen(function*() {
        const log: Array<string> = []
        const part = (name: string) =>
          Stream.fromEffect(Effect.sync(() => {
            log.push(`start ${name}`)
            return name
          })).pipe(Stream.ensuring(Effect.sync(() => log.push(`end ${name}`))))
        const stream = Stream.concat(
          Stream.concat(part("a"), Stream.concat(part("b"), part("c"))),
          Stream.concat(part("d"), part("e"))
        )
        const expectedLog = ["a", "b", "c", "d", "e"].flatMap((name) => [`start ${name}`, `end ${name}`])
        for (const run of ["first run", "second run"]) {
          log.length = 0
          deepStrictEqual(yield* Stream.runCollect(stream), ["a", "b", "c", "d", "e"], run)
          deepStrictEqual(log, expectedLog, run)
        }
      }))

    it.effect("runs a copy of a chain with its own channel", () =>
      Effect.gen(function*() {
        const chain = Stream.concat(Stream.make("a"), Stream.make("b"))
        const copy: Stream.Stream<string> = { ...chain, channel: Stream.make("copy").channel }
        deepStrictEqual(yield* Stream.runCollect(Stream.concat(copy, Stream.make("z"))), ["copy", "z"])
      }))
  })

  describe("flattening", () => {
    it.effect("flatten supports dropping parens in pipe", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.make(
            Stream.make(1, 2),
            Stream.make(3, 4)
          ),
          Stream.flatten,
          Stream.runCollect
        )
        assert.deepStrictEqual(result, [1, 2, 3, 4])
      }))

    it.effect("flattenEffect supports dropping parens in pipe", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.make(
            Effect.succeed(1),
            Effect.succeed(2),
            Effect.succeed(3)
          ),
          Stream.flattenEffect,
          Stream.runCollect
        )
        assert.deepStrictEqual(result, [1, 2, 3])
      }))
  })

  const testOuterFailure = (
    combinator: "flatMap" | "switchMap",
    inner: "never" | "slow"
  ) =>
    Effect.gen(function*() {
      const started = yield* Latch.make(false)
      const failing = yield* Deferred.make<void>()
      const finalized = yield* Ref.make(0)
      const outer = Stream.concat(
        Stream.make(1),
        Stream.fromEffect(
          started.await.pipe(
            Effect.andThen(Deferred.succeed(failing, void 0)),
            Effect.andThen(Effect.fail("boom"))
          )
        )
      )
      const makeInner = () => {
        started.openUnsafe()
        return (inner === "never" ? Stream.never : Stream.fromEffect(Effect.sleep(Duration.hours(1)))).pipe(
          Stream.ensuring(Ref.update(finalized, (n) => n + 1))
        )
      }
      const stream = combinator === "flatMap"
        ? Stream.flatMap(outer, makeInner, { concurrency: 2 })
        : Stream.switchMap(outer, makeInner)
      const fiber = yield* stream.pipe(
        Stream.runDrain,
        Effect.forkChild
      )
      yield* Deferred.await(failing)

      const result = yield* Fiber.await(fiber)
      assert.deepStrictEqual(result, Exit.fail("boom"))
      assert.strictEqual(yield* Ref.get(finalized), 1)
    })

  describe("flatMap", () => {
    it.effect("releases each inner stream before starting the next", () =>
      Effect.gen(function*() {
        const log: Array<string> = []
        const resource = (n: number) =>
          Stream.unwrap(Effect.map(
            Effect.acquireRelease(
              Effect.sync(() => log.push(`acquire ${n}`)),
              () => Effect.sync(() => log.push(`release ${n}`))
            ),
            () => Stream.make(n)
          ))
        const result = yield* Stream.make(1, 2, 3).pipe(
          Stream.flatMap((n) => n % 2 === 0 ? Stream.make(n) : resource(n)),
          Stream.tap((n) => Effect.sync(() => log.push(`emit ${n}`))),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, [1, 2, 3])
        assert.deepStrictEqual(log, [
          "acquire 1",
          "emit 1",
          "release 1",
          "emit 2",
          "acquire 3",
          "emit 3",
          "release 3"
        ])
      }))

    it.effect("an inner stream that closes its scope does not affect the next one", () =>
      Effect.gen(function*() {
        const log: Array<string> = []
        const closesScope = Stream.fromChannel(
          Channel.fromTransform((upstream, scope) =>
            Effect.andThen(
              // flatMap supplies a Closeable scope to each inner channel.
              Scope.close(scope as Scope.Closeable, Exit.void),
              Channel.toTransform(Stream.toChannel(Stream.make(0)))(upstream, scope)
            )
          )
        )
        const resource = Stream.unwrap(Effect.map(
          Effect.acquireRelease(
            Effect.sync(() => log.push("acquire")),
            () => Effect.sync(() => log.push("release"))
          ),
          () => Stream.make(1)
        ))
        const result = yield* Stream.make(0, 1).pipe(
          Stream.flatMap((n) => n === 0 ? closesScope : resource),
          Stream.tap((n) => Effect.sync(() => log.push(`emit ${n}`))),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, [0, 1])
        assert.deepStrictEqual(log, ["emit 0", "acquire", "emit 1", "release"])
      }))

    it.effect("interrupts all inner streams when the outer fails at the concurrency limit", () =>
      Effect.gen(function*() {
        const latch = yield* Latch.make()
        const finalized = yield* Ref.make(0)
        const outer = Stream.concat(
          Stream.make(1, 2),
          Stream.flatMap(Stream.fromEffect(latch.await), () => Stream.fail("boom"))
        )
        const result = yield* Stream.flatMap(
          outer,
          () =>
            Stream.flatMap(Stream.fromEffect(latch.open), () => Stream.never).pipe(
              Stream.ensuring(Ref.update(finalized, (n) => n + 1))
            ),
          { concurrency: 2 }
        ).pipe(
          Stream.runDrain,
          Effect.exit
        )

        assert.deepStrictEqual(result, Exit.fail("boom"))
        assert.strictEqual(yield* Ref.get(finalized), 2)
      }))

    it.effect("releases a permit after a successful saturated pull", () =>
      Effect.gen(function*() {
        const gate = yield* Deferred.make<void>()
        const outer = Stream.concat(
          Stream.make(1, 2),
          Stream.fromEffect(Deferred.succeed(gate, void 0).pipe(Effect.as(3)))
        )
        const result = yield* Stream.flatMap(
          outer,
          (n) => n === 3 ? Stream.make(3) : Stream.fromEffect(Deferred.await(gate).pipe(Effect.as(n))),
          { concurrency: 2 }
        ).pipe(Stream.runCollect)

        assert.deepStrictEqual([...result].sort(), [1, 2, 3])
      }))

    it.effect("preserves an outer element when a permit arrives during a pull", () =>
      Effect.gen(function*() {
        const probing = yield* Deferred.make<void>()
        const gate = yield* Deferred.make<void>()
        const innerGate = yield* Deferred.make<void>()
        const innerCompleted = yield* Deferred.make<void>()
        const outer = Stream.concat(
          Stream.make(1, 2),
          Stream.fromEffect(
            Deferred.succeed(probing, void 0).pipe(
              Effect.andThen(Deferred.await(gate)),
              Effect.as(3)
            )
          )
        )
        const fiber = yield* Stream.flatMap(
          outer,
          (n) =>
            n === 3
              ? Stream.make(3)
              : Stream.fromEffect(Deferred.await(innerGate).pipe(Effect.as(n))).pipe(
                Stream.ensuring(Deferred.succeed(innerCompleted, void 0))
              ),
          { concurrency: 2 }
        ).pipe(
          Stream.runCollect,
          Effect.forkChild
        )
        yield* Deferred.await(probing)
        yield* Deferred.succeed(innerGate, void 0)
        yield* Deferred.await(innerCompleted)
        yield* Deferred.succeed(gate, void 0)

        const result = yield* Fiber.join(fiber)
        assert.deepStrictEqual([...result].sort(), [1, 2, 3])
      }))

    it.effect(
      "fails promptly and interrupts slow inner streams when the outer stream fails",
      () => testOuterFailure("flatMap", "slow")
    )
  })

  describe("mapEffect with concurrency", () => {
    for (const unordered of [false, true]) {
      it.effect(`fails when the mapping function throws (unordered: ${unordered})`, () =>
        Effect.gen(function*() {
          const boom = new Error("boom")
          const fiber = yield* Stream.make(1, 2).pipe(
            Stream.mapEffect((n) => {
              if (n === 1) return Effect.never
              throw boom
            }, { concurrency: 2, unordered }),
            Stream.runDrain,
            Effect.timeoutOption("1 second"),
            Effect.exit,
            Effect.forkChild
          )
          yield* TestClock.adjust("1 second")
          assertExitFailure(yield* Fiber.join(fiber), Cause.die(boom))
        }))
    }
  })

  describe("switchMap", () => {
    it.effect(
      "interrupts a never-ending inner stream when the outer stream fails",
      () => testOuterFailure("switchMap", "never")
    )

    it.effect(
      "fails promptly and interrupts a slow inner stream when the outer stream fails",
      () => testOuterFailure("switchMap", "slow")
    )
  })

  it.effect.prop(
    "rechunk",
    {
      chunks: Schema.Array(Schema.Array(Schema.Int)).check(Schema.isMinLength(1)),
      size: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))
    },
    Effect.fnUntraced(function*({ chunks, size }) {
      const actual = yield* Stream.fromArray(chunks).pipe(
        Stream.filter((chunk): chunk is NonEmptyArray<number> => isReadonlyArrayNonEmpty(chunk)),
        Stream.flattenArray,
        Stream.rechunk(size),
        Stream.chunks,
        Stream.runCollect
      )
      const expected = chunks.flat()
      assert.deepStrictEqual(actual, grouped(expected, size))
    })
  )

  it.effect.each([
    { size: 200001, lengths: [200000] },
    { size: 200000, lengths: [200000] },
    { size: 199999, lengths: [199999, 1] }
  ])("rechunk preserves a large source chunk with target $size", ({ lengths, size }) =>
    Effect.gen(function*() {
      const values = Array.makeBy(200000, (i) => i)
      const actual = yield* Stream.fromArray(values).pipe(
        Stream.rechunk(size),
        Stream.chunks,
        Stream.runCollect
      )
      assert.deepStrictEqual(actual.map((chunk) => chunk.length), lengths)
      assert.deepStrictEqual(actual.flat(), values)
    }))

  it.effect("rechunk preserves large input split across source chunks", () =>
    Effect.gen(function*() {
      const values = Array.makeBy(200001, (i) => i)
      const actual = yield* Stream.fromArrays(values.slice(0, 1), values.slice(1)).pipe(
        Stream.rechunk(200002),
        Stream.chunks,
        Stream.runCollect
      )
      assert.deepStrictEqual(actual.map((chunk) => chunk.length), [200001])
      assert.deepStrictEqual(actual.flat(), values)
    }))

  it.effect("rechunk and grouped normalize their chunk size", () =>
    Effect.gen(function*() {
      const counts = [Number.NaN, 0.5, 1.9, 2.9]
      const rechunked = yield* Effect.forEach(counts, (n) =>
        Stream.make(1, 2, 3).pipe(
          Stream.rechunk(n),
          Stream.chunks,
          Stream.runCollect
        ))
      const groupedResults = yield* Effect.forEach(counts, (n) =>
        Stream.make(1, 2, 3).pipe(
          Stream.grouped(n),
          Stream.runCollect
        ))
      const expected: typeof rechunked = [
        [[1], [2], [3]],
        [[1], [2], [3]],
        [[1], [2], [3]],
        [[1, 2], [3]]
      ]
      assert.deepStrictEqual(rechunked, expected)
      assert.deepStrictEqual(groupedResults, expected)
    }))

  describe("transduce", () => {
    it.effect("no remainder", () =>
      Effect.gen(function*() {
        const result = yield* Stream.make(1, 2, 3, 4).pipe(
          Stream.transduce(Sink.reduceWhile(() => 100, (n) => n % 2 === 0, (acc, n) => acc + n)),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, [101, 105, 104])
      }))

    it.effect("with a sink that always signals more", () =>
      Effect.gen(function*() {
        const result = yield* Stream.make(1, 2, 3).pipe(
          Stream.transduce(Sink.reduceWhile(() => 0, constTrue, (acc, n) => acc + n)),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, [6])
      }))

    it.effect("propagates scope error", () =>
      Effect.gen(function*() {
        const result = yield* Stream.make(1, 2, 3).pipe(
          Stream.transduce(Sink.fail("Woops")),
          Stream.runCollect,
          Effect.result
        )
        assertFailure(result, "Woops")
      }))
  })

  describe("buffer", () => {
    it.effect("maintains elements and ordering", () =>
      Effect.gen(function*() {
        const chunks = Array.make(
          Array.range(0, 3),
          Array.range(2, 5),
          Array.range(3, 7)
        )
        const result = yield* Stream.fromArrays(...chunks).pipe(
          Stream.buffer({ capacity: 2 }),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, chunks.flat())
      }))

    it.effect("stream with a failure", () =>
      Effect.gen(function*() {
        const result = yield* Stream.range(0, 9).pipe(
          Stream.concat(Stream.fail("boom")),
          Stream.buffer({ capacity: 2 }),
          Stream.runCollect,
          Effect.exit
        )
        assertExitFailure(result, Cause.fail("boom"))
      }))

    it.effect("fast producer progresses independently", () =>
      Effect.gen(function*() {
        const arr = Array.empty<number>()
        const latch = yield* Deferred.make<void>()
        const stream = Stream.range(1, 4).pipe(
          Stream.tap(Effect.fnUntraced(function*(n) {
            arr.push(n)
            if (n === 4) {
              yield* Deferred.succeed(latch, void 0)
            }
          })),
          Stream.buffer({ capacity: 2 })
        )
        const result1 = yield* stream.pipe(Stream.take(2), Stream.runCollect)
        yield* Deferred.await(latch)
        assert.deepStrictEqual(result1, [1, 2])
        assert.deepStrictEqual(arr, [1, 2, 3, 4])
      }))
  })

  describe("bufferArray - suspend", () => {
    it.effect("maintains elements and ordering", () =>
      Effect.gen(function*() {
        const chunks = Array.make(
          Array.range(0, 3),
          Array.range(2, 5),
          Array.range(3, 7)
        )
        const result = yield* Stream.fromArrays(...chunks).pipe(
          Stream.bufferArray({ capacity: 2 }),
          Stream.runCollect
        )
        assert.deepStrictEqual(result, chunks.flat())
      }))

    it.effect("stream with a failure", () =>
      Effect.gen(function*() {
        const error = "boom"
        const result = yield* Stream.range(0, 9).pipe(
          Stream.concat(Stream.fail(error)),
          Stream.bufferArray({ capacity: 2 }),
          Stream.runCollect,
          Effect.exit
        )
        assertExitFailure(result, Cause.fail(error))
      }))

    it.effect("fast producer progresses independently", () =>
      Effect.gen(function*() {
        const arr = Array.empty<number>()
        const latch = yield* Deferred.make<void>()
        const stream = Stream.range(1, 4).pipe(
          Stream.tap(Effect.fnUntraced(function*(n) {
            arr.push(n)
            if (n === 4) {
              yield* Deferred.succeed(latch, void 0)
            }
          })),
          Stream.bufferArray({ capacity: 2 })
        )
        const result1 = yield* stream.pipe(Stream.take(2), Stream.runCollect)
        yield* Deferred.await(latch)
        assert.deepStrictEqual(result1, [1, 2])
        assert.deepStrictEqual(arr, [1, 2, 3, 4])
      }))
  })

  describe("bufferArray - dropping", () => {
    it.effect("buffers a stream with a failure", () =>
      Effect.gen(function*() {
        const error = "boom"
        const result = yield* Stream.range(1, 1_000).pipe(
          Stream.concat(Stream.fail(error)),
          Stream.concat(Stream.range(1_001, 2_000)),
          Stream.bufferArray({ capacity: 2, strategy: "dropping" }),
          Stream.runCollect,
          Effect.exit
        )
        assert.deepStrictEqual(result, Exit.fail(error))
      }))

    it.effect("fast producer progress independently", () =>
      Effect.gen(function*() {
        const arr = Array.empty<number>()
        const latch1 = yield* Deferred.make<void>()
        const latch2 = yield* Deferred.make<void>()
        const latch3 = yield* Deferred.make<void>()
        const latch4 = yield* Deferred.make<void>()
        const stream1 = Stream.make(0).pipe(
          Stream.concat(
            Stream.fromEffect(Deferred.await(latch1)).pipe(
              Stream.flatMap(() =>
                Stream.range(1, 16).pipe(
                  Stream.rechunk(1),
                  Stream.ensuring(Deferred.succeed(latch2, void 0))
                )
              )
            )
          )
        )
        const stream2 = Stream.fromEffect(Deferred.await(latch3)).pipe(
          Stream.flatMap(() =>
            Stream.range(17, 24).pipe(
              Stream.rechunk(1),
              Stream.ensuring(Deferred.succeed(latch4, void 0))
            )
          )
        )
        const stream3 = Stream.make(-1)
        const stream = stream1.pipe(
          Stream.concat(stream2),
          Stream.concat(stream3),
          Stream.bufferArray({ capacity: 8, strategy: "dropping" })
        )
        const { result1, result2, result3 } = yield* Stream.toPull(stream).pipe(
          Effect.flatMap((pull) =>
            Effect.gen(function*() {
              const result1 = yield* pull
              yield* Deferred.succeed(latch1, void 0)
              yield* Deferred.await(latch2)
              yield* pull.pipe(
                Effect.tap((chunk) =>
                  Effect.sync(() => {
                    arr.push(...chunk)
                  })
                ),
                Effect.repeat({ times: 7 })
              )
              const result2 = arr.slice()
              yield* Deferred.succeed(latch3, void 0)
              yield* Deferred.await(latch4)
              yield* pull.pipe(
                Effect.tap((chunk) =>
                  Effect.sync(() => {
                    arr.push(...chunk)
                  })
                ),
                Effect.repeat({ times: 7 })
              )
              const result3 = arr.slice()
              return { result1, result2, result3 }
            })
          ),
          Effect.scoped
        )
        const expected1 = Array.of(0)
        const expected2 = [1, 2, 3, 4, 5, 6, 7, 8]
        const expected3 = [1, 2, 3, 4, 5, 6, 7, 8, 17, 18, 19, 20, 21, 22, 23, 24]
        assert.deepStrictEqual(result1, expected1)
        assert.deepStrictEqual(result2, expected2)
        assert.deepStrictEqual(result3, expected3)
      }))

    it.effect("buffers a stream with a failure", () =>
      Effect.gen(function*() {
        const error = "boom"
        const result = yield* pipe(
          Stream.range(1, 1_000),
          Stream.concat(Stream.fail(error)),
          Stream.concat(Stream.range(1_000, 2_000)),
          Stream.buffer({ capacity: 2, strategy: "dropping" }),
          Stream.runCollect,
          Effect.exit
        )
        assert.deepStrictEqual(result, Exit.fail(error))
      }))

    it.effect("fast producer progress independently", () =>
      Effect.gen(function*() {
        const ref = yield* Ref.make(Array.empty<number>())
        const latch1 = yield* Deferred.make<void>()
        const latch2 = yield* Deferred.make<void>()
        const latch3 = yield* Deferred.make<void>()
        const latch4 = yield* Deferred.make<void>()
        const stream1 = pipe(
          Stream.make(0),
          Stream.concat(
            pipe(
              Stream.fromEffect(Deferred.await(latch1)),
              Stream.flatMap(() =>
                pipe(
                  Stream.range(1, 17),
                  Stream.rechunk(1),
                  Stream.ensuring(Deferred.succeed(latch2, void 0))
                )
              )
            )
          )
        )
        const stream2 = pipe(
          Stream.fromEffect(Deferred.await(latch3)),
          Stream.flatMap(() =>
            pipe(
              Stream.range(17, 24),
              Stream.rechunk(1),
              Stream.ensuring(Deferred.succeed(latch4, void 0))
            )
          )
        )
        const stream3 = Stream.make(-1)
        const stream = pipe(
          stream1,
          Stream.concat(stream2),
          Stream.concat(stream3),
          Stream.buffer({ capacity: 8, strategy: "dropping" })
        )
        const { result1, result2, result3 } = yield* pipe(
          Stream.toPull(stream),
          Effect.flatMap((pull) =>
            Effect.gen(function*() {
              const result1 = yield* pull
              yield* Deferred.succeed(latch1, void 0)
              yield* Deferred.await(latch2)
              yield* pipe(
                pull,
                Effect.flatMap((chunk) => Ref.update(ref, Array.appendAll(chunk)))
              )
              const result2 = yield* Ref.get(ref)
              yield* Deferred.succeed(latch3, void 0)
              yield* Deferred.await(latch4)
              yield* pipe(
                pull,
                Effect.flatMap((chunk) => Ref.update(ref, Array.appendAll(chunk)))
              )
              const result3 = yield* (Ref.get(ref))
              return { result1, result2, result3 }
            })
          ),
          Effect.scoped
        )
        const expected1 = [0] as const
        const expected2 = [1, 2, 3, 4, 5, 6, 7, 8]
        const expected3 = [1, 2, 3, 4, 5, 6, 7, 8, 17, 18, 19, 20, 21, 22, 23, 24]
        deepStrictEqual(result1, expected1)
        deepStrictEqual(result2, expected2)
        deepStrictEqual(result3, expected3)
      }))
  })

  describe("bufferArray - sliding", () => {
    it.effect("buffers a stream with a failure", () =>
      Effect.gen(function*() {
        const error = "boom"
        const result = yield* Stream.range(1, 1_000).pipe(
          Stream.concat(Stream.fail(error)),
          Stream.concat(Stream.range(1_001, 2_000)),
          Stream.bufferArray({ capacity: 2, strategy: "sliding" }),
          Stream.runCollect,
          Effect.exit
        )
        assertExitFailure(result, Cause.fail(error))
      }))

    it.effect("fast producer progress independently", () =>
      Effect.gen(function*() {
        const ref = yield* Ref.make(Array.empty<number>())

        const latch1 = yield* Deferred.make<void>()
        const latch2 = yield* Deferred.make<void>()
        const latch3 = yield* Deferred.make<void>()
        const latch4 = yield* Deferred.make<void>()
        const latch5 = yield* Deferred.make<void>()
        const stream1 = Stream.make(0).pipe(
          Stream.concat(
            pipe(
              Stream.fromEffect(Deferred.await(latch1)),
              Stream.flatMap(() =>
                pipe(
                  Stream.range(1, 16),
                  Stream.rechunk(1),
                  Stream.ensuring(Deferred.succeed(latch2, void 0))
                )
              )
            )
          )
        )
        const stream2 = pipe(
          Stream.fromEffect(Deferred.await(latch3)),
          Stream.flatMap(() =>
            pipe(
              Stream.range(17, 25),
              Stream.rechunk(1),
              Stream.ensuring(Deferred.succeed(latch4, void 0))
            )
          )
        )
        const stream3 = pipe(
          Stream.fromEffect(Deferred.await(latch5)),
          Stream.flatMap(() => Stream.make(-1))
        )
        const stream = pipe(
          stream1,
          Stream.concat(stream2),
          Stream.concat(stream3),
          Stream.bufferArray({ capacity: 8, strategy: "sliding" })
        )
        const { result1, result2, result3 } = yield* pipe(
          Stream.toPull(stream),
          Effect.flatMap((pull) =>
            Effect.gen(function*() {
              const result1 = yield* pull
              yield* Deferred.succeed(latch1, void 0)
              yield* Deferred.await(latch2)
              yield* pipe(
                pull,
                Effect.flatMap((chunk) => Ref.update(ref, Array.appendAll(chunk))),
                Effect.repeat({ times: 7 })
              )
              const result2 = yield* Ref.get(ref)
              yield* Deferred.succeed(latch3, void 0)
              yield* Deferred.await(latch4)
              yield* pipe(
                pull,
                Effect.flatMap((chunk) => Ref.update(ref, Array.appendAll(chunk))),
                Effect.repeat({ times: 7 })
              )
              const result3 = yield* (Ref.get(ref))
              return { result1, result2, result3 }
            })
          ),
          Effect.scoped
        )
        const expected1 = [0]
        const expected2 = [9, 10, 11, 12, 13, 14, 15, 16]
        const expected3 = [9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25]
        assert.deepStrictEqual(Array.fromIterable(result1), expected1)
        assert.deepStrictEqual(Array.fromIterable(result2), expected2)
        assert.deepStrictEqual(Array.fromIterable(result3), expected3)
      }))

    it.effect("buffers a stream with a failure", () =>
      Effect.gen(function*() {
        const error = "boom"
        const result = yield* pipe(
          Stream.range(1, 1_000),
          Stream.concat(Stream.fail(error)),
          Stream.concat(Stream.range(1_001, 2_000)),
          Stream.buffer({ capacity: 2, strategy: "sliding" }),
          Stream.runCollect,
          Effect.exit
        )
        deepStrictEqual(result, Exit.fail(error))
      }))

    it.effect("fast producer progress independently", () =>
      Effect.gen(function*() {
        const ref = yield* Ref.make(Array.empty<number>())
        const latch1 = yield* Deferred.make<void>()
        const latch2 = yield* Deferred.make<void>()
        const latch3 = yield* Deferred.make<void>()
        const latch4 = yield* Deferred.make<void>()
        const stream1 = pipe(
          Stream.make(0),
          Stream.concat(
            pipe(
              Stream.fromEffect(Deferred.await(latch1)),
              Stream.flatMap(() =>
                pipe(
                  Stream.range(1, 16),
                  Stream.rechunk(1),
                  Stream.ensuring(Deferred.succeed(latch2, void 0))
                )
              )
            )
          )
        )
        const stream2 = pipe(
          Stream.fromEffect(Deferred.await(latch3)),
          Stream.flatMap(() =>
            pipe(
              Stream.range(17, 24),
              Stream.rechunk(1),
              Stream.ensuring(Deferred.succeed(latch4, void 0))
            )
          )
        )
        const stream3 = Stream.make(-1)
        const stream = pipe(
          stream1,
          Stream.concat(stream2),
          Stream.concat(stream3),
          Stream.buffer({ capacity: 8, strategy: "sliding" })
        )
        const { result1, result2, result3 } = yield* pipe(
          Stream.toPull(stream),
          Effect.flatMap((pull) =>
            Effect.gen(function*() {
              const result1 = yield* pull
              yield* Deferred.succeed(latch1, void 0)
              yield* Deferred.await(latch2)
              yield* pipe(
                pull,
                Effect.flatMap((chunk) => Ref.update(ref, Array.appendAll(chunk)))
              )
              const result2 = yield* (Ref.get(ref))
              yield* (Deferred.succeed(latch3, void 0))
              yield* (Deferred.await(latch4))
              yield* pipe(
                pull,
                Effect.flatMap((chunk) => Ref.update(ref, Array.appendAll(chunk))),
                Effect.repeat({ times: 7 })
              )
              const result3 = yield* (Ref.get(ref))
              return { result1, result2, result3 }
            })
          ),
          Effect.scoped
        )
        const expected1 = [0] as const
        const expected2 = [9, 10, 11, 12, 13, 14, 15, 16]
        const expected3 = [9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, -1]
        deepStrictEqual(result1, expected1)
        deepStrictEqual(result2, expected2)
        deepStrictEqual(result3, expected3)
      }))

    it.effect("propagates defects", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.fromEffect(Effect.die("boom")),
          Stream.buffer({ capacity: 1, strategy: "sliding" }),
          Stream.runDrain,
          Effect.exit
        )
        deepStrictEqual(result, Exit.die("boom"))
      }))
  })

  describe("buffer - unbounded", () => {
    it.effect("buffer - buffers the stream", () =>
      Effect.gen(function*() {
        const chunk = Array.range(0, 10)
        const result = yield* pipe(
          Stream.fromIterable(chunk),
          Stream.buffer({ capacity: "unbounded" }),
          Stream.runCollect
        )
        deepStrictEqual(result, chunk)
      }))

    it.effect("buffers a stream with a failure", () =>
      Effect.gen(function*() {
        const error = "boom"
        const result = yield* pipe(
          Stream.range(0, 9),
          Stream.concat(Stream.fail(error)),
          Stream.buffer({ capacity: "unbounded" }),
          Stream.runCollect,
          Effect.exit
        )
        deepStrictEqual(result, Exit.fail(error))
      }))

    it.effect("fast producer progress independently", () =>
      Effect.gen(function*() {
        const ref = yield* Ref.make(Array.empty<number>())
        const latch = yield* Deferred.make<void>()
        const stream = pipe(
          Stream.range(1, 999),
          Stream.tap((n) =>
            pipe(
              Ref.update(ref, Array.append(n)),
              Effect.andThen(pipe(Deferred.succeed(latch, void 0), Effect.when(Effect.sync(() => n === 999))))
            )
          ),
          Stream.rechunk(999),
          Stream.buffer({ capacity: "unbounded" })
        )
        const result1 = yield* pipe(stream, Stream.take(2), Stream.runCollect)
        yield* Deferred.await(latch)
        const result2 = yield* Ref.get(ref)
        deepStrictEqual(result1, [1, 2])
        deepStrictEqual(result2, Array.range(1, 999))
      }))
  })

  describe("share", () => {
    it.effect("sequenced", () =>
      Effect.gen(function*() {
        const sharedStream = yield* Stream.fromSchedule(Schedule.spaced("1 seconds")).pipe(
          Stream.share({ capacity: 16 })
        )

        const firstFiber = yield* sharedStream.pipe(
          Stream.take(1),
          Stream.run(Sink.collect()),
          Effect.forkChild({ startImmediately: true })
        )

        yield* TestClock.adjust("1 seconds")

        const first = yield* Fiber.join(firstFiber)
        deepStrictEqual(first, [0])

        const secondFiber = yield* sharedStream.pipe(
          Stream.take(1),
          Stream.run(Sink.collect()),
          Effect.forkChild({ startImmediately: true })
        )

        yield* TestClock.adjust("1 seconds")

        const second = yield* Fiber.join(secondFiber)
        deepStrictEqual(second, [0])
      }))

    it.effect("sequenced with idleTimeToLive", () =>
      Effect.gen(function*() {
        const sharedStream = yield* Stream.fromSchedule(Schedule.spaced("1 seconds")).pipe(
          Stream.share({
            capacity: 16,
            idleTimeToLive: "1 second"
          })
        )

        const firstFiber = yield* sharedStream.pipe(
          Stream.take(1),
          Stream.run(Sink.collect()),
          Effect.forkChild({ startImmediately: true })
        )

        yield* TestClock.adjust("1 seconds")

        const first = yield* Fiber.join(firstFiber)
        deepStrictEqual(first, [0])

        const secondFiber = yield* sharedStream.pipe(
          Stream.take(1),
          Stream.run(Sink.collect()),
          Effect.forkChild({ startImmediately: true })
        )

        yield* TestClock.adjust("1 seconds")

        const second = yield* Fiber.join(secondFiber)
        deepStrictEqual(second, [1])
      }))

    it.effect("ends a consumer that starts after the shared upstream has ended", () =>
      Effect.gen(function*() {
        const sharedStream = yield* Stream.share(Stream.make(1, 2, 3), {
          capacity: 16,
          idleTimeToLive: "1 minute"
        })
        yield* Stream.runDrain(sharedStream)

        deepStrictEqual(yield* Stream.runCollect(sharedStream), [])
      }))

    it.effect("parallel", () =>
      Effect.gen(function*() {
        const sharedStream = yield* Stream.fromSchedule(Schedule.spaced("1 seconds")).pipe(
          Stream.share({ capacity: 16 })
        )

        const fiber1 = yield* sharedStream.pipe(
          Stream.take(1),
          Stream.run(Sink.collect()),
          Effect.forkChild({ startImmediately: true })
        )
        const fiber2 = yield* sharedStream.pipe(
          Stream.take(2),
          Stream.run(Sink.collect()),
          Effect.forkChild({ startImmediately: true })
        )

        yield* TestClock.adjust("2 seconds")

        const [result1, result2] = yield* Fiber.joinAll([fiber1, fiber2])

        deepStrictEqual(result1, [0])
        deepStrictEqual(result2, [0, 1])
      }))
  })

  describe("raceAll", () => {
    it.effect("sync", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.raceAll(
            Stream.make(0, 1, 2, 3),
            Stream.make(4, 5, 6, 7),
            Stream.make(7, 8, 9, 10)
          ),
          Stream.runCollect
        )
        deepStrictEqual(result, [0, 1, 2, 3])
      }))

    it.effect("async", () =>
      Effect.gen(function*() {
        const fiber = yield* pipe(
          Stream.raceAll(
            Stream.fromSchedule(Schedule.spaced("1 second")),
            Stream.fromSchedule(Schedule.spaced("2 second"))
          ),
          Stream.take(5),
          Stream.runCollect,
          Effect.forkScoped
        )
        yield* TestClock.adjust("5 second")
        const result = yield* Fiber.join(fiber)
        deepStrictEqual(result, [0, 1, 2, 3, 4])
      }))

    it.effect("combined async + sync", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.raceAll(
            Stream.fromSchedule(Schedule.spaced("1 second")),
            Stream.make(0, 1, 2, 3)
          ),
          Stream.runCollect
        )
        deepStrictEqual(result, [0, 1, 2, 3])
      }))

    it.effect("combined sync + async", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.raceAll(
            Stream.make(0, 1, 2, 3),
            Stream.fromSchedule(Schedule.spaced("1 second"))
          ),
          Stream.runCollect
        )
        deepStrictEqual(result, [0, 1, 2, 3])
      }))
  })

  it.effect("onStart", () =>
    Effect.gen(function*() {
      let counter = 0
      const result = yield* pipe(
        Stream.make(1, 1),
        Stream.onStart(Effect.sync(() => counter++)),
        Stream.runCollect
      )
      strictEqual(counter, 1)
      deepStrictEqual(result, [1, 1])
    }))

  it.effect("onEnd", () =>
    Effect.gen(function*() {
      let counter = 0
      const result = yield* pipe(
        Stream.make(1, 2, 3),
        Stream.onEnd(Effect.sync(() => counter++)),
        Stream.runCollect
      )
      strictEqual(counter, 1)
      deepStrictEqual(result, [1, 2, 3])
    }))

  describe("groupAdjacentBy", () => {
    it.effect("one big chunk", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.fromIterable([
            { code: 1, message: "A" },
            { code: 1, message: "B" },
            { code: 1, message: "D" },
            { code: 2, message: "C" }
          ]),
          Stream.groupAdjacentBy((x) => x.code),
          Stream.runCollect
        )
        deepStrictEqual(
          result.map(([, chunk]) => chunk),
          [
            [
              { code: 1, message: "A" },
              { code: 1, message: "B" },
              { code: 1, message: "D" }
            ],
            [
              { code: 2, message: "C" }
            ]
          ]
        )
      }))

    it.effect("several single element chunks", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.fromArrays(
            [{ code: 1, message: "A" }],
            [{ code: 1, message: "B" }],
            [{ code: 1, message: "D" }],
            [{ code: 2, message: "C" }]
          ),
          Stream.groupAdjacentBy((x) => x.code),
          Stream.runCollect
        )
        deepStrictEqual(
          result.map(([, chunk]) => chunk),
          [
            [
              { code: 1, message: "A" },
              { code: 1, message: "B" },
              { code: 1, message: "D" }
            ],
            [
              { code: 2, message: "C" }
            ]
          ]
        )
      }))

    it.effect("group across chunks", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.fromArrays(
            [{ code: 1, message: "A" }, { code: 1, message: "B" }],
            [{ code: 1, message: "D" }, { code: 2, message: "C" }]
          ),
          Stream.groupAdjacentBy((x) => x.code),
          Stream.runCollect
        )
        deepStrictEqual(
          result.map(([, chunk]) => chunk),
          [
            [
              { code: 1, message: "A" },
              { code: 1, message: "B" },
              { code: 1, message: "D" }
            ],
            [
              { code: 2, message: "C" }
            ]
          ]
        )
      }))
  })

  describe("aggregateWithin", () => {
    it.effect("does not step the schedule while upstream is idle", () =>
      Effect.gen(function*() {
        let steps = 0
        const schedule = Schedule.spaced("10 millis").pipe(
          Schedule.tap(() => Effect.sync(() => steps++))
        )
        const fiber = yield* Stream.never.pipe(
          Stream.aggregateWithin(Sink.take(25), schedule),
          Stream.runDrain,
          Effect.forkChild({ startImmediately: true })
        )
        yield* TestClock.adjust("1 second")
        assert.strictEqual(steps, 0)
        yield* Fiber.interrupt(fiber)
      }))

    it.effect("schedule exhaustion drains sink leftovers without pulling more upstream", () =>
      Effect.gen(function*() {
        let pulls = 0
        const result = yield* Stream.make(1, 2, 3, 4, 5).pipe(
          Stream.concat(Stream.fromEffect(Effect.sync(() => ++pulls))),
          Stream.aggregateWithin(
            Sink.take(2).pipe(Sink.mapEffect((batch) => Effect.as(Effect.yieldNow, batch))),
            Schedule.forever.pipe(Schedule.upTo({ times: 0 }))
          ),
          Stream.runCollect
        )

        assert.strictEqual(pulls, 0)
        assert.deepStrictEqual(result, [[1, 2], [3, 4], [5]])
      }))

    it.effect("groupedWithin starts each window at its first element", () =>
      Effect.gen(function*() {
        const queue = yield* Queue.unbounded<number>()
        const batches: Array<[number, ReadonlyArray<number>]> = []
        yield* Stream.fromQueue(queue).pipe(
          Stream.groupedWithin(10, "100 millis"),
          Stream.runForEach((batch) =>
            Effect.flatMap(Clock.currentTimeMillis, (now) => Effect.sync(() => batches.push([now, batch])))
          ),
          Effect.forkChild({ startImmediately: true })
        )

        yield* TestClock.adjust("1030 millis")
        yield* Queue.offer(queue, 1)
        yield* TestClock.adjust("50 millis")
        yield* Queue.offer(queue, 2)
        yield* TestClock.adjust("1000 millis")
        yield* Queue.offer(queue, 3)
        yield* TestClock.adjust("100 millis")

        deepStrictEqual(batches, [[1130, [1, 2]], [2180, [3]]])
      }))

    it.effect("groupedWithin does not emit empty arrays when upstream is idle", () =>
      Effect.gen(function*() {
        const fiber = yield* Stream.never.pipe(
          Stream.groupedWithin(25, "50 millis"),
          Stream.take(5),
          Stream.runCollect,
          Effect.forkChild({ startImmediately: true })
        )
        yield* TestClock.adjust("1 second")
        assert.isUndefined(fiber.pollUnsafe())
      }))

    it.effect("groupedWithin normalizes the chunk size", () =>
      Effect.gen(function*() {
        const results = yield* Effect.forEach([Number.NaN, 0.5, 1.9, 2.9], (n) =>
          Stream.make(1, 2, 3).pipe(
            Stream.groupedWithin(n, "1 hour"),
            Stream.runCollect
          ))
        assert.deepStrictEqual(results, [
          [[1], [2], [3]],
          [[1], [2], [3]],
          [[1], [2], [3]],
          [[1, 2], [3]]
        ])
      }))

    it.effect("groupedWithin flushes final partial batch on upstream end without waiting for the schedule", () =>
      Effect.gen(function*() {
        const result = yield* Stream.make(1, 2, 3, 4, 5).pipe(
          Stream.groupedWithin(3, "1 second"),
          Stream.runCollect
        )
        deepStrictEqual(result, [[1, 2, 3], [4, 5]])
      }))

    it.effect("groupedWithin flushes partial batch when the schedule elapses while upstream is idle", () =>
      Effect.gen(function*() {
        const fiber = yield* Stream.make(1, 2, 3, 4, 5).pipe(
          Stream.concat(Stream.never),
          Stream.groupedWithin(3, "1 second"),
          Stream.take(2),
          Stream.runCollect,
          Effect.forkChild({ startImmediately: true })
        )
        yield* TestClock.adjust("1 second")
        const result = yield* Fiber.join(fiber)
        deepStrictEqual(result, [[1, 2, 3], [4, 5]])
      }))

    it.effect("simple example", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.make(1, 1, 1, 1, 2, 2),
          Stream.aggregateWithin(
            pipe(
              Sink.fold(
                () => [[] as Array<number>, true] as readonly [Array<number>, boolean],
                (tuple) => tuple[1],
                ([array], curr: number) =>
                  Effect.succeed<readonly [Array<number>, boolean]>(
                    curr === 1 ? [[curr, ...array], true] : [[curr, ...array], false]
                  )
              ),
              Sink.map((tuple) => tuple[0])
            ),
            Schedule.spaced(Duration.minutes(30))
          ),
          Stream.runCollect
        )
        deepStrictEqual(result, [[2, 1, 1, 1, 1], [2]])
      }))

    it.effect("fails fast", () =>
      Effect.gen(function*() {
        const queue = yield* Queue.unbounded<number>()
        yield* pipe(
          Stream.range(1, 9),
          Stream.tap((n) =>
            pipe(
              Effect.fail("Boom"),
              Effect.when(Effect.sync(() => n === 6)),
              Effect.andThen(Queue.offer(queue, n))
            )
          ),
          Stream.aggregateWithin(
            Sink.foldUntil(constVoid, 5, () => Effect.void),
            Schedule.forever
          ),
          Stream.runDrain,
          Effect.catch(() => Effect.void)
        )
        const result = yield* Queue.takeAll(queue)
        yield* Queue.shutdown(queue)
        deepStrictEqual(result, [1, 2, 3, 4, 5])
      }))

    it.effect("error propagation #1", () =>
      Effect.gen(function*() {
        const error = new Error("Boom")
        const result = yield* pipe(
          Stream.make(1, 1, 1, 1),
          Stream.aggregateWithin(
            Sink.die(error),
            Schedule.spaced(Duration.minutes(30))
          ),
          Stream.runCollect,
          Effect.exit
        )
        deepStrictEqual(result, Exit.die(error))
      }))

    it.effect("error propagation #2", () =>
      Effect.gen(function*() {
        const error = new Error("Boom")
        const result = yield* pipe(
          Stream.make(1, 1),
          Stream.aggregateWithin(
            Sink.fold(() => [], constTrue, () => Effect.die(error)),
            Schedule.spaced(Duration.minutes(30))
          ),
          Stream.runCollect,
          Effect.exit
        )
        deepStrictEqual(result, Exit.die(error))
      }))

    it.effect("interruption propagation #1", () =>
      Effect.gen(function*() {
        const latch = yield* Deferred.make<void>()
        const ref = yield* Ref.make(false)
        const sink = Sink.fold(Array.empty<number>, constTrue, (acc, curr: number) => {
          if (curr === 1) {
            acc.push(curr)
            return Effect.succeed(acc)
          }
          return pipe(
            Deferred.succeed(latch, void 0),
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() => Ref.set(ref, true))
          )
        })
        const fiber = yield* pipe(
          Stream.make(1, 1, 2),
          Stream.aggregateWithin(sink, Schedule.spaced(Duration.minutes(30))),
          Stream.runCollect,
          Effect.forkScoped
        )
        yield* Deferred.await(latch)
        yield* Fiber.interrupt(fiber)
        const result = yield* Ref.get(ref)
        assertTrue(result)
      }))

    it.effect("interruption propagation #2", () =>
      Effect.gen(function*() {
        const ref = yield* Ref.make(false)
        const sink = Sink.fromEffect(
          Effect.never.pipe(
            Effect.onInterrupt(() => Ref.set(ref, true))
          )
        )
        const fiber = yield* Stream.make(1, 1, 2).pipe(
          Stream.aggregateWithin(sink, Schedule.spaced(Duration.minutes(30))),
          Stream.runCollect,
          Effect.forkScoped({ startImmediately: true })
        )
        yield* Fiber.interrupt(fiber)
        const result = yield* Ref.get(ref)
        assertTrue(result)
      }))

    // it.effect("leftover handling", () =>
    //   Effect.gen(function*() {
    //     const input = [1, 2, 2, 3, 2, 3]
    //     const fiber = yield* pipe(
    //       Stream.fromIterable(input),
    //       Stream.aggregateWithin(
    //         Sink.foldWeighted({
    //           initial: Chunk.empty<number>(),
    //           maxCost: 4,
    //           cost: (_, n) => n,
    //           body: (acc, curr) => Chunk.append(acc, curr)
    //         }),
    //         Schedule.spaced(Duration.millis(100))
    //       ),
    //       Stream.flattenIterable,
    //       Stream.runCollect,
    //       Effect.forkScoped
    //     )
    //     yield* TestClock.adjust(Duration.minutes(31))
    //     const result = yield* Fiber.join(fiber)
    //     deepStrictEqual(result, input)
    //   }))
  })

  describe("debounce", () => {
    it.effect("should drop earlier chunks within waitTime", () =>
      Effect.gen(function*() {
        const coordination = yield* chunkCoordination([
          [1],
          [3, 4],
          [5],
          [6, 7]
        ])
        const stream = pipe(
          coordination.stream,
          Stream.chunks,
          Stream.debounce(Duration.seconds(1))
        )
        const fiber = yield* pipe(stream, Stream.runCollect, Effect.forkScoped)
        yield* coordination.offer
        yield* pipe(
          Effect.sleep(Duration.millis(500)),
          Effect.andThen(coordination.offer),
          Effect.forkScoped
        )
        yield* pipe(
          Effect.sleep(Duration.seconds(2)),
          Effect.andThen(coordination.offer),
          Effect.forkScoped
        )
        yield* pipe(
          Effect.sleep(Duration.millis(2500)),
          Effect.andThen(coordination.offer),
          Effect.forkScoped
        )
        yield* TestClock.adjust(Duration.millis(3500))
        const result = yield* Fiber.join(fiber)
        deepStrictEqual(
          result,
          [[3, 4], [6, 7]]
        )
      }))

    it.effect("should take latest chunk within waitTime", () =>
      Effect.gen(function*() {
        const coordination = yield* chunkCoordination([
          [1, 2],
          [3, 4],
          [5, 6]
        ])
        const stream = pipe(
          coordination.stream,
          Stream.chunks,
          Stream.debounce(Duration.seconds(1))
        )
        const fiber = yield* pipe(stream, Stream.runCollect, Effect.forkScoped)
        yield* pipe(
          coordination.offer,
          Effect.andThen(coordination.offer),
          Effect.andThen(coordination.offer)
        )
        yield* TestClock.adjust(Duration.seconds(1))
        const result = yield* Fiber.join(fiber)
        deepStrictEqual(result, [[5, 6]])
      }))

    it.effect("should work properly with parallelization", () =>
      Effect.gen(function*() {
        const coordination = yield* chunkCoordination([
          [1],
          [2],
          [3]
        ])
        const stream = pipe(
          coordination.stream,
          Stream.chunks,
          Stream.debounce(Duration.seconds(1))
        )
        const fiber = yield* pipe(stream, Stream.runCollect, Effect.forkScoped)
        yield* Effect.all([
          coordination.offer,
          coordination.offer,
          coordination.offer
        ], { concurrency: 3, discard: true })
        yield* TestClock.adjust(Duration.seconds(1))
        const result = yield* Fiber.join(fiber)
        deepStrictEqual(result, [[3]])
      }))

    it.effect("should handle empty chunks properly", () =>
      Effect.gen(function*() {
        const fiber = yield* pipe(
          Stream.make(1, 2, 3),
          Stream.tap(() => Effect.sleep(Duration.millis(500))),
          Stream.debounce(Duration.seconds(1)),
          Stream.runCollect,
          Effect.forkScoped({ startImmediately: true })
        )
        yield* TestClock.adjust(Duration.seconds(3))
        const result = yield* Fiber.join(fiber)
        deepStrictEqual(result, [3])
      }))

    it.effect("should fail immediately", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.fromEffect(Effect.fail(Option.none())),
          Stream.debounce(Duration.infinity),
          Stream.runCollect,
          Effect.exit
        )
        assertExitFailure(result, Cause.fail(Option.none()))
      }))

    it.effect("should work with empty streams", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.empty,
          Stream.debounce(Duration.seconds(5)),
          Stream.runCollect
        )
        assertTrue(result.length === 0)
      }))

    it.effect("should pick last element from every chunk", () =>
      Effect.gen(function*() {
        const fiber = yield* pipe(
          Stream.make(1, 2, 3),
          Stream.debounce(Duration.seconds(1)),
          Stream.runCollect,
          Effect.forkScoped
        )
        yield* TestClock.adjust(Duration.seconds(1))
        const result = yield* Fiber.join(fiber)
        deepStrictEqual(result, [3])
      }))

    it.effect("should interrupt fibers properly", () =>
      Effect.gen(function*() {
        const coordination = yield* chunkCoordination([
          [1],
          [2],
          [3]
        ])
        const fiber = yield* pipe(
          coordination.stream,
          Stream.chunks,
          Stream.tap(() => coordination.proceed),
          Stream.flattenArray,
          Stream.debounce(Duration.millis(200)),
          // Stream.interruptWhen(Effect.never),
          Stream.take(1),
          Stream.runCollect,
          Effect.forkScoped
        )
        yield* pipe(
          coordination.offer,
          Effect.andThen(TestClock.adjust(Duration.millis(100))),
          Effect.andThen(coordination.awaitNext),
          Effect.repeat({ times: 2 })
        )
        yield* TestClock.adjust(Duration.millis(100))
        const result = yield* Fiber.join(fiber)
        deepStrictEqual(result, [3])
      }))

    it.effect("should interrupt children fiber on stream interruption", () =>
      Effect.gen(function*() {
        const ref = yield* (Ref.make(false))
        const fiber = yield* pipe(
          Stream.fromEffect(Effect.void),
          Stream.concat(Stream.fromEffect(pipe(
            Effect.never,
            Effect.onInterrupt(() => Ref.set(ref, true))
          ))),
          Stream.debounce(Duration.millis(800)),
          Stream.runDrain,
          Effect.forkScoped
        )
        yield* TestClock.adjust(Duration.minutes(1))
        yield* Fiber.interrupt(fiber)
        const result = yield* Ref.get(ref)
        assertTrue(result)
      }))
  })

  describe("throttle", () => {
    it.effect("throttleEnforce - free elements", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.make(1, 2, 3, 4),
          Stream.throttle({
            cost: () => 0,
            units: 0,
            duration: Duration.infinity,
            strategy: "enforce"
          }),
          Stream.runCollect
        )
        deepStrictEqual(result, [1, 2, 3, 4])
      }))

    it.effect("throttleEnforce - no bandwidth", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.make(1, 2, 3, 4),
          Stream.throttle({
            cost: () => 1,
            units: 0,
            duration: Duration.infinity,
            strategy: "enforce"
          }),
          Stream.runCollect
        )
        assertTrue(result.length === 0)
      }))

    it.effect("throttleEnforce - refill bucket tokens", () =>
      Effect.gen(function*() {
        const fiber = yield* pipe(
          Stream.fromSchedule(Schedule.spaced(Duration.millis(100))),
          Stream.take(10),
          Stream.throttle({
            cost: () => 1,
            units: 1,
            duration: Duration.millis(200),
            strategy: "enforce"
          }),
          Stream.runCollect,
          Effect.forkScoped
        )
        yield* TestClock.adjust(Duration.seconds(1))
        const result = yield* Fiber.join(fiber)
        deepStrictEqual(result, [0, 2, 4, 6, 8])
      }))

    it.effect("throttleShape", () =>
      Effect.gen(function*() {
        const queue = yield* Queue.unbounded<number>()
        const fiber = yield* pipe(
          Stream.fromQueue(queue),
          Stream.throttle({
            strategy: "shape",
            cost: (arr) => arr.reduce((a, b) => a + b, 0),
            units: 1,
            duration: Duration.seconds(1)
          }),
          Stream.toPull,
          Effect.flatMap((pull) =>
            Effect.gen(function*() {
              yield* Queue.offer(queue, 1)
              const result1 = yield* pull
              yield* Queue.offer(queue, 2)
              const result2 = yield* pull
              yield* Effect.sleep(Duration.seconds(4))
              yield* Queue.offer(queue, 3)
              const result3 = yield* pull
              return [result1, result2, result3] as const
            })
          ),
          Effect.scoped,
          Effect.forkScoped
        )
        yield* TestClock.adjust(Duration.seconds(8))
        const result = yield* Fiber.join(fiber)
        deepStrictEqual(result, [[1], [2], [3]])
      }))

    it.effect("throttleShape - infinite bandwidth", () =>
      Effect.gen(function*() {
        const queue = yield* Queue.unbounded<number>()
        const result = yield* pipe(
          Stream.fromQueue(queue),
          Stream.throttle({
            strategy: "shape",
            cost: () => 100_000,
            units: 1,
            duration: Duration.zero
          }),
          Stream.toPull,
          Effect.flatMap((pull) =>
            Effect.gen(function*() {
              yield* Queue.offer(queue, 1)
              const result1 = yield* pull
              yield* Queue.offer(queue, 2)
              const result2 = yield* pull
              return [result1, result2] as const
            })
          ),
          Effect.scoped
        )
        deepStrictEqual(result, [[1], [2]])
      }))

    it.effect("throttleShape - with burst", () =>
      Effect.gen(function*() {
        const queue = yield* Queue.unbounded<number>()
        const fiber = yield* pipe(
          Stream.fromQueue(queue),
          Stream.throttle({
            strategy: "shape",
            cost: (arr) => arr.reduce((a, b) => a + b, 0),
            units: 1,
            duration: Duration.seconds(1),
            burst: 2
          }),
          Stream.toPull,
          Effect.flatMap((pull) =>
            Effect.gen(function*() {
              yield* Queue.offer(queue, 1)
              const result1 = yield* pull
              yield* TestClock.adjust(Duration.seconds(2))
              yield* Queue.offer(queue, 2)
              const result2 = yield* pull
              yield* TestClock.adjust(Duration.seconds(4))
              yield* Queue.offer(queue, 3)
              const result3 = yield* pull
              return [result1, result2, result3] as const
            })
          ),
          Effect.scoped,
          Effect.forkScoped
        )
        const result = yield* Fiber.join(fiber)
        deepStrictEqual(result, [[1], [2], [3]])
      }))

    it.effect("throttleShape - free elements", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.make(1, 2, 3, 4),
          Stream.throttle({
            strategy: "shape",
            cost: () => 0,
            units: 1,
            duration: Duration.infinity
          }),
          Stream.runCollect
        )
        deepStrictEqual(result, [1, 2, 3, 4])
      }))

    it.effect("throttleShape - keeps the rate when sleeps end early", () =>
      Effect.gen(function*() {
        const clock = yield* Clock.Clock
        const earlyClock: Clock.Clock = {
          ...clock,
          monotonicTimeNanosUnsafe: () => (1n << 80n) + clock.monotonicTimeNanosUnsafe(),
          sleep: (duration) => clock.sleep(Duration.millis(Duration.toMillis(duration) - 1))
        }
        const fiber = yield* pipe(
          Stream.range(1, 3),
          Stream.rechunk(1),
          Stream.throttle({
            strategy: "shape",
            cost: (arr) => arr.length,
            units: 1,
            duration: Duration.seconds(1)
          }),
          Stream.mapEffect(() => clock.currentTimeMillis),
          Stream.runCollect,
          Effect.provideService(Clock.Clock, earlyClock),
          Effect.forkScoped
        )
        yield* TestClock.adjust(Duration.seconds(3))
        const timestamps = yield* Fiber.join(fiber)
        deepStrictEqual(timestamps, [0, 999, 1999], "Early wake-ups must not accumulate rate drift")
      }))

    it.effect("throttleShape - is not affected by wall clock changes", () =>
      Effect.gen(function*() {
        const clock = yield* Clock.Clock
        let offset = 0
        const shiftedClock: Clock.Clock = {
          ...clock,
          currentTimeMillisUnsafe: () => clock.currentTimeMillisUnsafe() + offset
        }
        const fiber = yield* pipe(
          Stream.range(1, 2),
          Stream.rechunk(1),
          Stream.throttle({
            strategy: "shape",
            cost: (arr) => arr.length,
            units: 1,
            duration: Duration.seconds(1)
          }),
          Stream.tap((n) =>
            Effect.sync(() => {
              if (n === 1) offset = -5000
            })
          ),
          Stream.mapEffect(() => clock.currentTimeMillis),
          Stream.runCollect,
          Effect.provideService(Clock.Clock, shiftedClock),
          Effect.forkScoped
        )
        yield* TestClock.adjust(Duration.seconds(6))
        const timestamps = yield* Fiber.join(fiber)
        deepStrictEqual(timestamps, [0, 1000], "Wall clock changes must not affect the refill rate")
      }))
  })

  describe("zipping", () => {
    it.effect("zipWith - combines elements point-wise", () =>
      Effect.gen(function*() {
        const stream1 = Stream.make(1, 2, 3)
        const stream2 = Stream.make("a", "b", "c")
        const result = yield* Stream.zipWith(stream1, stream2, (n, s) => `${n}-${s}`).pipe(
          Stream.runCollect
        )
        assert.deepStrictEqual(result, ["1-a", "2-b", "3-c"])
      }))

    it.effect("zipWith - stops when shortest stream ends", () =>
      Effect.gen(function*() {
        const stream1 = Stream.make(1, 2, 3, 4, 5, 6)
        const stream2 = Stream.make("a", "b", "c")
        const result = yield* Stream.zipWith(stream1, stream2, (n, s) => `${n}-${s}`).pipe(
          Stream.runCollect
        )
        assert.deepStrictEqual(result, ["1-a", "2-b", "3-c"])
      }))

    it.effect("zipWith - does not pull too much when one stream ends", () =>
      Effect.gen(function*() {
        const left = Stream.fromArrays([1, 2], [3, 4], [5]).pipe(
          Stream.concat(Stream.fail("boom"))
        )
        const right = Stream.fromArrays(["a", "b"], ["c"])
        const result = yield* Stream.zipWith(left, right, (n, s) => [n, s] as const).pipe(
          Stream.runCollect
        )
        assert.deepStrictEqual(result, [[1, "a"], [2, "b"], [3, "c"]])
      }))

    it.effect("zipWith - prioritizes failures", () =>
      Effect.gen(function*() {
        const result = yield* Stream.zipWith(
          Stream.never,
          Stream.fail("Ouch"),
          (a, b) => [a, b]
        ).pipe(
          Stream.runCollect,
          Effect.exit
        )
        assertExitFailure(result, Cause.fail("Ouch"))
      }))

    it.effect("zipWith - handles exceptions", () =>
      Effect.gen(function*() {
        const error = new Error("Ouch")
        const result = yield* Stream.make(1).pipe(
          Stream.flatMap(() =>
            Stream.sync(() => {
              throw error
            })
          ),
          Stream.zipWith(Stream.make(1), (a, b) => [a, b]),
          Stream.runCollect,
          Effect.exit
        )
        assertExitFailure(result, Cause.die(error))
      }))

    it.effect("zipWith - handles empty streams", () =>
      Effect.gen(function*() {
        const result1 = yield* Stream.zipWith(
          Stream.empty,
          Stream.make(1, 2, 3),
          (a, b) => [a, b]
        ).pipe(Stream.runCollect)

        const result2 = yield* Stream.zipWith(
          Stream.make(1, 2, 3),
          Stream.empty,
          (a, b) => [a, b]
        ).pipe(Stream.runCollect)

        assert.strictEqual(result1.length, 0)
        assert.strictEqual(result2.length, 0)
      }))

    it.effect.prop(
      "zipWith - equivalence with array operations",
      {
        left: Schema.Array(Schema.Int),
        right: Schema.Array(Schema.Int)
      },
      Effect.fnUntraced(function*({ left, right }) {
        const stream = Stream.zipWith(
          Stream.fromIterable(left),
          Stream.fromIterable(right),
          (a, b) => a + b
        )
        const result = yield* Stream.runCollect(stream)

        const minLength = Math.min(left.length, right.length)
        const expected = Array.empty<number>()
        for (let i = 0; i < minLength; i++) {
          expected.push(left[i] + right[i])
        }

        assert.deepStrictEqual(result, expected)
      })
    )

    describe("zipWithArray", () => {
      it.effect("basic zipping with equal length streams", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2, 3)
          const stream2 = Stream.make("a", "b", "c")
          const result = yield* Stream.zipWithArray(stream1, stream2, (left, right) => {
            const minLength = Math.min(left.length, right.length)
            const output = Array.makeBy(minLength, (i: number) => [left[i], right[i]] as const)
            return [output, left.slice(minLength), right.slice(minLength)]
          }).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, [[1, "a"], [2, "b"], [3, "c"]])
        }))

      it.effect("left stream shorter than right", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2, 3)
          const stream2 = Stream.make("a", "b", "c", "d", "e")
          const result = yield* Stream.zipWithArray(stream1, stream2, (left, right) => {
            const minLength = Math.min(left.length, right.length)
            const output = Array.makeBy(minLength, (i: number) => [left[i], right[i]] as const)
            return [output, left.slice(minLength), right.slice(minLength)]
          }).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, [[1, "a"], [2, "b"], [3, "c"]])
        }))

      it.effect("right stream shorter than left", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2, 3, 4, 5)
          const stream2 = Stream.make("a", "b", "c")
          const result = yield* Stream.zipWithArray(stream1, stream2, (left, right) => {
            const minLength = Math.min(left.length, right.length)
            const output = Array.makeBy(minLength, (i: number) => [left[i], right[i]] as const)
            return [output, left.slice(minLength), right.slice(minLength)]
          }).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, [[1, "a"], [2, "b"], [3, "c"]])
        }))

      it.effect("multiple arrays from each stream", () =>
        Effect.gen(function*() {
          const stream1 = Stream.fromArrays([1, 2], [3, 4], [5, 6])
          const stream2 = Stream.fromArrays(["a", "b"], ["c", "d"], ["e", "f"])
          const result = yield* Stream.zipWithArray(stream1, stream2, (left, right) => {
            const minLength = Math.min(left.length, right.length)
            const output = Array.makeBy(minLength, (i: number) => [left[i], right[i]] as const)
            return [output, left.slice(minLength), right.slice(minLength)]
          }).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, [[1, "a"], [2, "b"], [3, "c"], [4, "d"], [5, "e"], [6, "f"]])
        }))

      it.effect("handles leftover elements correctly", () =>
        Effect.gen(function*() {
          const stream1 = Stream.fromArrays([1, 2, 3], [4, 5])
          const stream2 = Stream.fromArrays(["a", "b"], ["c", "d", "e"])
          let leftLeftovers = 0
          let rightLeftovers = 0

          const result = yield* Stream.zipWithArray(stream1, stream2, (left, right) => {
            const minLength = Math.min(left.length, right.length)
            const output = Array.makeBy(minLength, (i: number) => [left[i], right[i]] as const)
            const leftSlice = left.slice(minLength)
            const rightSlice = right.slice(minLength)
            if (leftSlice.length > 0) {
              leftLeftovers++
            } else if (rightSlice.length > 0) {
              rightLeftovers++
            }
            return [output, leftSlice, rightSlice]
          }).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, [[1, "a"], [2, "b"], [3, "c"], [4, "d"], [5, "e"]])
          assert.isTrue(leftLeftovers > 0 || rightLeftovers > 0)
        }))

      it.effect("error propagation from left stream", () =>
        Effect.gen(function*() {
          const result = yield* Stream.zipWithArray(
            Stream.make(1, 2).pipe(Stream.concat(Stream.fail("boom"))),
            Stream.make("a", "b", "c"),
            (left, right) => {
              const minLength = Math.min(left.length, right.length)
              const output = Array.makeBy(minLength, (i: number) => [left[i], right[i]] as const)
              return [output, [], []]
            }
          ).pipe(Stream.runCollect, Effect.exit)

          assertExitFailure(result, Cause.fail("boom"))
        }))

      // Keep the left stream alive: once either side ends, later errors from the other side are not observed.
      it.effect("error propagation from right stream", () =>
        Effect.gen(function*() {
          const result = yield* Stream.zipWithArray(
            Stream.fromArrays([1, 2, 3], [4]),
            Stream.make("a", "b").pipe(Stream.concat(Stream.fail("boom"))),
            (left, right) => {
              const minLength = Math.min(left.length, right.length)
              const output = Array.makeBy(minLength, (i: number) => [left[i], right[i]] as const)
              return [output, [], []]
            }
          ).pipe(Stream.runCollect, Effect.exit)

          assertExitFailure(result, Cause.fail("boom"))
        }))

      it.effect("handles empty streams", () =>
        Effect.gen(function*() {
          const result1 = yield* Stream.zipWithArray(
            Stream.empty,
            Stream.make(1, 2, 3),
            (left, right) => {
              return [Array.of([left[0], right[0]] as const), [], []]
            }
          ).pipe(Stream.runCollect)

          const result2 = yield* Stream.zipWithArray(
            Stream.make(1, 2, 3),
            Stream.empty,
            (left, right) => {
              return [Array.of([left[0], right[0]] as const), [], []]
            }
          ).pipe(Stream.runCollect)

          assert.strictEqual(result1.length, 0)
          assert.strictEqual(result2.length, 0)
        }))

      it.effect("processes arrays of different sizes within streams", () =>
        Effect.gen(function*() {
          const stream1 = Stream.fromArrays([1], [2, 3, 4], [5])
          const stream2 = Stream.fromArrays([10, 20], [30], [40, 50])
          const result = yield* Stream.zipWithArray(stream1, stream2, (left, right) => {
            const minLength = Math.min(left.length, right.length)
            const output = Array.makeBy(minLength, (i: number) => [left[i], right[i]] as const)
            return [output, left.slice(minLength), right.slice(minLength)]
          }).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, [[1, 10], [2, 20], [3, 30], [4, 40], [5, 50]])
        }))

      it.effect("custom array-level logic - take pairs", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2, 3, 4)
          const stream2 = Stream.make(10, 20, 30, 40)
          const result = yield* Stream.zipWithArray(stream1, stream2, (left, right) => {
            const pairs = Math.min(Math.floor(left.length / 2), Math.floor(right.length / 2))
            const output = Array.makeBy(pairs, (i: number) => {
              return [left[i * 2], left[i * 2 + 1], right[i * 2], right[i * 2 + 1]] as const
            })

            const leftUsed = pairs * 2
            const rightUsed = pairs * 2
            const leftLeftover = left.slice(leftUsed)
            const rightLeftover = right.slice(rightUsed)

            return [output, leftLeftover, rightLeftover]
          }).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, [[1, 2, 10, 20], [3, 4, 30, 40]])
        }))

      it.effect("does not pull too much when one stream ends", () =>
        Effect.gen(function*() {
          const left = Stream.fromArrays([1, 2], [3, 4], [5]).pipe(
            Stream.concat(Stream.fail("boom"))
          )
          const right = Stream.fromArrays(["a", "b"], ["c"])
          const result = yield* Stream.zipWithArray(left, right, (leftArr, rightArr) => {
            const minLength = Math.min(leftArr.length, rightArr.length)
            const output = Array.makeBy(minLength, (i: number) => [leftArr[i], rightArr[i]] as const)
            return [output, leftArr.slice(minLength), rightArr.slice(minLength)]
          }).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, [[1, "a"], [2, "b"], [3, "c"]])
        }))
    })

    describe("zip", () => {
      it.effect("zips two streams into tuples", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2, 3)
          const stream2 = Stream.make("a", "b", "c")
          const result = yield* Stream.zip(stream1, stream2).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, [[1, "a"], [2, "b"], [3, "c"]])
        }))

      it.effect("terminates when left stream ends first", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2)
          const stream2 = Stream.make("a", "b", "c", "d")
          const result = yield* Stream.zip(stream1, stream2).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, [[1, "a"], [2, "b"]])
        }))

      it.effect("terminates when right stream ends first", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2, 3, 4)
          const stream2 = Stream.make("a", "b")
          const result = yield* Stream.zip(stream1, stream2).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, [[1, "a"], [2, "b"]])
        }))

      it.effect("handles empty left stream", () =>
        Effect.gen(function*() {
          const stream1 = Stream.empty
          const stream2 = Stream.make("a", "b", "c")
          const result = yield* Stream.zip(stream1, stream2).pipe(Stream.runCollect)

          assert.strictEqual(result.length, 0)
        }))

      it.effect("handles empty right stream", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2, 3)
          const stream2 = Stream.empty
          const result = yield* Stream.zip(stream1, stream2).pipe(Stream.runCollect)

          assert.strictEqual(result.length, 0)
        }))

      it.effect("propagates errors from left stream", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2).pipe(Stream.concat(Stream.fail("boom")))
          const stream2 = Stream.make("a", "b", "c")
          const result = yield* Stream.zip(stream1, stream2).pipe(Stream.runCollect, Effect.exit)

          assertExitFailure(result, Cause.fail("boom"))
        }))

      it.effect("propagates errors from right stream", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2, 3)
          const stream2 = Stream.make("a", "b").pipe(Stream.concat(Stream.fail("ouch")))
          const result = yield* Stream.zip(stream1, stream2).pipe(Stream.runCollect, Effect.exit)

          assertExitFailure(result, Cause.fail("ouch"))
        }))

      it.effect("works with pipe syntax", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2, 3)
          const stream2 = Stream.make("a", "b", "c")
          const result = yield* stream1.pipe(Stream.zip(stream2), Stream.runCollect)

          assert.deepStrictEqual(result, [[1, "a"], [2, "b"], [3, "c"]])
        }))
    })

    describe("zipLeft", () => {
      it.effect("keeps only left values", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2, 3)
          const stream2 = Stream.make("a", "b", "c")
          const result = yield* Stream.zipLeft(stream1, stream2).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, [1, 2, 3])
        }))

      it.effect("terminates when left stream ends first", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2)
          const stream2 = Stream.make("a", "b", "c", "d")
          const result = yield* Stream.zipLeft(stream1, stream2).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, [1, 2])
        }))

      it.effect("terminates when right stream ends first", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2, 3, 4)
          const stream2 = Stream.make("a", "b")
          const result = yield* Stream.zipLeft(stream1, stream2).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, [1, 2])
        }))

      it.effect("handles empty left stream", () =>
        Effect.gen(function*() {
          const stream1 = Stream.empty
          const stream2 = Stream.make("a", "b", "c")
          const result = yield* Stream.zipLeft(stream1, stream2).pipe(Stream.runCollect)

          assert.strictEqual(result.length, 0)
        }))

      it.effect("handles empty right stream", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2, 3)
          const stream2 = Stream.empty
          const result = yield* Stream.zipLeft(stream1, stream2).pipe(Stream.runCollect)

          assert.strictEqual(result.length, 0)
        }))

      it.effect("propagates errors from left stream", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2).pipe(Stream.concat(Stream.fail("boom")))
          const stream2 = Stream.make("a", "b", "c")
          const result = yield* Stream.zipLeft(stream1, stream2).pipe(Stream.runCollect, Effect.exit)

          assertExitFailure(result, Cause.fail("boom"))
        }))

      it.effect("propagates errors from right stream", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2, 3)
          const stream2 = Stream.make("a", "b").pipe(Stream.concat(Stream.fail("ouch")))
          const result = yield* Stream.zipLeft(stream1, stream2).pipe(Stream.runCollect, Effect.exit)

          assertExitFailure(result, Cause.fail("ouch"))
        }))

      it.effect("works with pipe syntax", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2, 3)
          const stream2 = Stream.make("a", "b", "c")
          const result = yield* stream1.pipe(Stream.zipLeft(stream2), Stream.runCollect)

          assert.deepStrictEqual(result, [1, 2, 3])
        }))

      it.effect("consumes right stream elements", () =>
        Effect.gen(function*() {
          let rightPulled = 0
          const stream1 = Stream.make(1, 2, 3)
          const stream2 = Stream.make("a", "b", "c").pipe(
            Stream.tap(() =>
              Effect.sync(() => {
                rightPulled++
              })
            )
          )
          const result = yield* Stream.zipLeft(stream1, stream2).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, [1, 2, 3])
          assert.strictEqual(rightPulled, 3)
        }))
    })

    describe("zipRight", () => {
      it.effect("keeps only right values", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2, 3)
          const stream2 = Stream.make("a", "b", "c")
          const result = yield* Stream.zipRight(stream1, stream2).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, ["a", "b", "c"])
        }))

      it.effect("terminates when left stream ends first", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2)
          const stream2 = Stream.make("a", "b", "c", "d")
          const result = yield* Stream.zipRight(stream1, stream2).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, ["a", "b"])
        }))

      it.effect("terminates when right stream ends first", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2, 3, 4)
          const stream2 = Stream.make("a", "b")
          const result = yield* Stream.zipRight(stream1, stream2).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, ["a", "b"])
        }))

      it.effect("handles empty left stream", () =>
        Effect.gen(function*() {
          const stream1 = Stream.empty
          const stream2 = Stream.make("a", "b", "c")
          const result = yield* Stream.zipRight(stream1, stream2).pipe(Stream.runCollect)

          assert.strictEqual(result.length, 0)
        }))

      it.effect("handles empty right stream", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2, 3)
          const stream2 = Stream.empty
          const result = yield* Stream.zipRight(stream1, stream2).pipe(Stream.runCollect)

          assert.strictEqual(result.length, 0)
        }))

      it.effect("propagates errors from left stream", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2).pipe(Stream.concat(Stream.fail("boom")))
          const stream2 = Stream.make("a", "b", "c")
          const result = yield* Stream.zipRight(stream1, stream2).pipe(Stream.runCollect, Effect.exit)

          assertExitFailure(result, Cause.fail("boom"))
        }))

      it.effect("propagates errors from right stream", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2, 3)
          const stream2 = Stream.make("a", "b").pipe(Stream.concat(Stream.fail("ouch")))
          const result = yield* Stream.zipRight(stream1, stream2).pipe(Stream.runCollect, Effect.exit)

          assertExitFailure(result, Cause.fail("ouch"))
        }))

      it.effect("works with pipe syntax", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make(1, 2, 3)
          const stream2 = Stream.make("a", "b", "c")
          const result = yield* stream1.pipe(Stream.zipRight(stream2), Stream.runCollect)

          assert.deepStrictEqual(result, ["a", "b", "c"])
        }))

      it.effect("consumes left stream elements", () =>
        Effect.gen(function*() {
          let leftPulled = 0
          const stream1 = Stream.make(1, 2, 3).pipe(
            Stream.tap(() =>
              Effect.sync(() => {
                leftPulled++
              })
            )
          )
          const stream2 = Stream.make("a", "b", "c")
          const result = yield* Stream.zipRight(stream1, stream2).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, ["a", "b", "c"])
          assert.strictEqual(leftPulled, 3)
        }))
    })

    describe("zipFlatten", () => {
      it.effect("flattens tuples when zipping", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make([1, "a"] as const, [2, "b"] as const, [3, "c"] as const)
          const stream2 = Stream.make("x", "y", "z")
          const result = yield* Stream.zipFlatten(stream1, stream2).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, [[1, "a", "x"], [2, "b", "y"], [3, "c", "z"]])
        }))

      it.effect("works with single element tuples", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make([1] as const, [2] as const, [3] as const)
          const stream2 = Stream.make("a", "b", "c")
          const result = yield* Stream.zipFlatten(stream1, stream2).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, [[1, "a"], [2, "b"], [3, "c"]])
        }))

      it.effect("works with larger tuples", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make([1, 2, 3] as const, [4, 5, 6] as const)
          const stream2 = Stream.make("a", "b")
          const result = yield* Stream.zipFlatten(stream1, stream2).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, [[1, 2, 3, "a"], [4, 5, 6, "b"]])
        }))

      it.effect("terminates when left stream ends first", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make([1, "a"] as const, [2, "b"] as const)
          const stream2 = Stream.make("x", "y", "z", "w")
          const result = yield* Stream.zipFlatten(stream1, stream2).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, [[1, "a", "x"], [2, "b", "y"]])
        }))

      it.effect("terminates when right stream ends first", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make([1, "a"] as const, [2, "b"] as const, [3, "c"] as const, [4, "d"] as const)
          const stream2 = Stream.make("x", "y")
          const result = yield* Stream.zipFlatten(stream1, stream2).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, [[1, "a", "x"], [2, "b", "y"]])
        }))

      it.effect("handles empty left stream", () =>
        Effect.gen(function*() {
          const stream1 = Stream.empty
          const stream2 = Stream.make("a", "b", "c")
          const result = yield* Stream.zipFlatten(stream1, stream2).pipe(Stream.runCollect)

          assert.strictEqual(result.length, 0)
        }))

      it.effect("handles empty right stream", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make([1, "a"] as const, [2, "b"] as const)
          const stream2 = Stream.empty
          const result = yield* Stream.zipFlatten(stream1, stream2).pipe(Stream.runCollect)

          assert.strictEqual(result.length, 0)
        }))

      it.effect("propagates errors from left stream", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make([1, "a"] as const, [2, "b"] as const).pipe(Stream.concat(Stream.fail("boom")))
          const stream2 = Stream.make("x", "y", "z")
          const result = yield* Stream.zipFlatten(stream1, stream2).pipe(Stream.runCollect, Effect.exit)

          assertExitFailure(result, Cause.fail("boom"))
        }))

      it.effect("propagates errors from right stream", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make([1, "a"] as const, [2, "b"] as const, [3, "c"] as const)
          const stream2 = Stream.make("x", "y").pipe(Stream.concat(Stream.fail("ouch")))
          const result = yield* Stream.zipFlatten(stream1, stream2).pipe(Stream.runCollect, Effect.exit)

          assertExitFailure(result, Cause.fail("ouch"))
        }))

      it.effect("works with pipe syntax", () =>
        Effect.gen(function*() {
          const stream1 = Stream.make([1, "a"] as const, [2, "b"] as const, [3, "c"] as const)
          const stream2 = Stream.make("x", "y", "z")
          const result = yield* stream1.pipe(Stream.zipFlatten(stream2), Stream.runCollect)

          assert.deepStrictEqual(result, [[1, "a", "x"], [2, "b", "y"], [3, "c", "z"]])
        }))
    })

    describe("zipWithIndex", () => {
      it.effect("zips stream with indices starting at 0", () =>
        Effect.gen(function*() {
          const stream = Stream.make("a", "b", "c", "d")
          const result = yield* Stream.zipWithIndex(stream).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, [["a", 0], ["b", 1], ["c", 2], ["d", 3]])
        }))

      it.effect("handles empty stream", () =>
        Effect.gen(function*() {
          const stream = Stream.empty
          const result = yield* Stream.zipWithIndex(stream).pipe(Stream.runCollect)

          assert.strictEqual(result.length, 0)
        }))

      it.effect("handles single element stream", () =>
        Effect.gen(function*() {
          const stream = Stream.make("a")
          const result = yield* Stream.zipWithIndex(stream).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, [["a", 0]])
        }))

      it.effect("preserves order", () =>
        Effect.gen(function*() {
          const stream = Stream.make(5, 4, 3, 2, 1)
          const result = yield* Stream.zipWithIndex(stream).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, [[5, 0], [4, 1], [3, 2], [2, 3], [1, 4]])
        }))

      it.effect("works with numbers", () =>
        Effect.gen(function*() {
          const stream = Stream.make(10, 20, 30)
          const result = yield* Stream.zipWithIndex(stream).pipe(Stream.runCollect)

          assert.deepStrictEqual(result, [[10, 0], [20, 1], [30, 2]])
        }))

      it.effect("propagates errors", () =>
        Effect.gen(function*() {
          const stream = Stream.make(1, 2, 3).pipe(Stream.concat(Stream.fail("boom")))
          const result = yield* Stream.zipWithIndex(stream).pipe(Stream.runCollect, Effect.exit)

          assertExitFailure(result, Cause.fail("boom"))
        }))

      it.effect("works with pipe syntax", () =>
        Effect.gen(function*() {
          const stream = Stream.make("x", "y", "z")
          const result = yield* stream.pipe(Stream.zipWithIndex, Stream.runCollect)

          assert.deepStrictEqual(result, [["x", 0], ["y", 1], ["z", 2]])
        }))

      it.effect("index increments correctly for large streams", () =>
        Effect.gen(function*() {
          const stream = Stream.range(0, 99)
          const result = yield* Stream.zipWithIndex(stream).pipe(Stream.runCollect)

          assert.strictEqual(result.length, 100)
          assert.deepStrictEqual(result[0], [0, 0])
          assert.deepStrictEqual(result[99], [99, 99])
        }))
    })

    describe("zipLatest", () => {
      it.effect("combines streams with latest values", () =>
        Effect.gen(function*() {
          const result = yield* Stream.zipLatest(
            Stream.make(1, 2, 3),
            Stream.make("a", "b", "c", "d")
          ).pipe(Stream.runCollect)

          // Both streams emit, latest values are paired
          assert.isTrue(result.length > 0)
          assert.isTrue(result.every((item) => Array.isArray(item) && item.length === 2))
        }))

      it.effect("waits for both streams to emit before producing output", () =>
        Effect.gen(function*() {
          const queue1 = yield* Queue.unbounded<number>()
          const queue2 = yield* Queue.unbounded<string>()

          const fiber = yield* Effect.forkScoped(
            Stream.zipLatest(
              Stream.fromQueue(queue1),
              Stream.fromQueue(queue2)
            ).pipe(Stream.take(3), Stream.runCollect)
          )

          yield* Queue.offer(queue1, 1)
          yield* Queue.offer(queue2, "a")
          yield* Queue.offer(queue1, 2)
          yield* Queue.offer(queue2, "b")
          yield* Queue.offer(queue1, 3)

          const result = yield* Fiber.join(fiber)

          assert.isTrue(result.length > 0)
        }))

      it.effect("propagates errors from left stream", () =>
        Effect.gen(function*() {
          const result = yield* Stream.zipLatest(
            Stream.make(1, 2).pipe(Stream.concat(Stream.fail("boom"))),
            Stream.make("a", "b", "c")
          ).pipe(Stream.runCollect, Effect.exit)

          assertExitFailure(result, Cause.fail("boom"))
        }))

      it.effect("propagates errors from right stream", () =>
        Effect.gen(function*() {
          const result = yield* Stream.zipLatest(
            Stream.make(1, 2, 3),
            Stream.make("a", "b").pipe(Stream.concat(Stream.fail("ouch")))
          ).pipe(Stream.runCollect, Effect.exit)

          assertExitFailure(result, Cause.fail("ouch"))
        }))

      it.effect("terminates when left stream ends", () =>
        Effect.gen(function*() {
          const result = yield* Stream.zipLatest(
            Stream.make(1, 2),
            Stream.make("a", "b", "c", "d", "e")
          ).pipe(Stream.runCollect)

          // Should terminate when left stream (1, 2) ends
          assert.isTrue(result.length > 0)
        }))

      it.effect("terminates when right stream ends", () =>
        Effect.gen(function*() {
          const result = yield* Stream.zipLatest(
            Stream.make(1, 2, 3, 4, 5),
            Stream.make("a", "b")
          ).pipe(Stream.runCollect)

          // Should terminate when right stream ("a", "b") ends
          assert.isTrue(result.length > 0)
        }))

      it.effect("works with pipe syntax", () =>
        Effect.gen(function*() {
          const result = yield* Stream.make(1, 2, 3).pipe(
            Stream.zipLatest(Stream.make("a", "b", "c")),
            Stream.runCollect
          )

          assert.isTrue(result.length > 0)
        }))

      it.effect("basic synchronous example", () =>
        Effect.gen(function*() {
          const result = yield* Stream.zipLatest(
            Stream.make(1, 2, 3),
            Stream.make("a", "b", "c")
          ).pipe(Stream.runCollect)

          // Both streams emit synchronously, latest values are paired
          assert.isTrue(result.length > 0)
          assert.isTrue(result.every((item) => Array.isArray(item) && item.length === 2))
        }))
    })

    describe("zipLatestWith", () => {
      it.effect("transforms combined values", () =>
        Effect.gen(function*() {
          const result = yield* Stream.zipLatestWith(
            Stream.make(1, 2, 3),
            Stream.make(10, 20, 30),
            (n, m) => n * m
          ).pipe(Stream.runCollect)

          assert.isTrue(result.length > 0)
          assert.isTrue(result.every((item) => typeof item === "number"))
        }))

      it.effect("combines with custom function", () =>
        Effect.gen(function*() {
          const result = yield* Stream.zipLatestWith(
            Stream.make(1, 2, 3),
            Stream.make("a", "b", "c"),
            (n, s) => `${n}-${s}`
          ).pipe(Stream.runCollect)

          assert.isTrue(result.length > 0)
          assert.isTrue(result.every((item) => typeof item === "string" && item.includes("-")))
        }))

      it.effect("propagates errors from left stream", () =>
        Effect.gen(function*() {
          const result = yield* Stream.zipLatestWith(
            Stream.make(1, 2).pipe(Stream.concat(Stream.fail("boom"))),
            Stream.make("a", "b", "c"),
            (n, s) => `${n}-${s}`
          ).pipe(Stream.runCollect, Effect.exit)

          assertExitFailure(result, Cause.fail("boom"))
        }))

      it.effect("propagates errors from right stream", () =>
        Effect.gen(function*() {
          const result = yield* Stream.zipLatestWith(
            Stream.make(1, 2, 3),
            Stream.make("a", "b").pipe(Stream.concat(Stream.fail("ouch"))),
            (n, s) => `${n}-${s}`
          ).pipe(Stream.runCollect, Effect.exit)

          assertExitFailure(result, Cause.fail("ouch"))
        }))

      it.effect("terminates when left stream ends", () =>
        Effect.gen(function*() {
          const result = yield* Stream.zipLatestWith(
            Stream.make(1, 2),
            Stream.make(10, 20, 30, 40),
            (n, m) => n + m
          ).pipe(Stream.runCollect)

          assert.isTrue(result.length > 0)
        }))

      it.effect("terminates when right stream ends", () =>
        Effect.gen(function*() {
          const result = yield* Stream.zipLatestWith(
            Stream.make(1, 2, 3, 4),
            Stream.make(10, 20),
            (n, m) => n + m
          ).pipe(Stream.runCollect)

          assert.isTrue(result.length > 0)
        }))

      it.effect("works with pipe syntax", () =>
        Effect.gen(function*() {
          const result = yield* Stream.make(1, 2, 3).pipe(
            Stream.zipLatestWith(
              Stream.make(10, 20, 30),
              (n, m) => n + m
            ),
            Stream.runCollect
          )

          assert.isTrue(result.length > 0)
        }))

      it.effect("basic synchronous example", () =>
        Effect.gen(function*() {
          const result = yield* Stream.zipLatestWith(
            Stream.make(1, 2, 3),
            Stream.make(10, 20, 30),
            (a, b) => a + b
          ).pipe(Stream.runCollect)

          assert.isTrue(result.length > 0)
          assert.isTrue(result.every((item) => typeof item === "number"))
        }))

      it.effect("string concatenation example", () =>
        Effect.gen(function*() {
          const result = yield* Stream.zipLatestWith(
            Stream.make("Alice", "Bob", "Charlie"),
            Stream.make("Smith", "Jones"),
            (first, last) => `${first} ${last}`
          ).pipe(Stream.runCollect)

          assert.isTrue(result.length > 0)
          assert.isTrue(result.every((item) => typeof item === "string" && item.includes(" ")))
        }))
    })
  })

  describe("tapSink", () => {
    it.effect("sink that is done after stream", () =>
      Effect.gen(function*() {
        const ref = yield* Ref.make(0)
        const sink = Sink.forEach((i: number) => Ref.update(ref, (n) => i + n))
        const result = yield* pipe(
          Stream.make(1, 1, 2, 3, 5, 8),
          Stream.tapSink(sink),
          Stream.runCollect
        )
        const sum = yield* (Ref.get(ref))
        strictEqual(sum, 20)
        deepStrictEqual(result, [1, 1, 2, 3, 5, 8])
      }))

    it.effect("sink that is done before stream", () =>
      Effect.gen(function*() {
        const ref = yield* Ref.make(0)
        const sink = pipe(
          Sink.take<number>(3),
          Sink.map(Array.reduce(0, (x, y) => x + y)),
          Sink.mapEffect((i) => Ref.update(ref, (n) => n + i))
        )
        const result = yield* pipe(
          Stream.make(1, 1, 2, 3, 5, 8),
          Stream.rechunk(1),
          Stream.tapSink(sink),
          Stream.runCollect
        )
        const sum = yield* (Ref.get(ref))
        strictEqual(sum, 4)
        deepStrictEqual(result, [1, 1, 2, 3, 5, 8])
      }))

    it.effect("sink that fails before stream", () =>
      Effect.gen(function*() {
        const sink = Sink.fail("error")
        const result = yield* pipe(
          Stream.make(1, 2, 3),
          Stream.tapSink(sink),
          Stream.runCollect,
          Effect.flip
        )
        strictEqual(result, "error")
      }))

    it.effect("does not read ahead", () =>
      Effect.gen(function*() {
        const ref = yield* Ref.make(0)
        const sink = Sink.forEach((i: number) => Ref.update(ref, (n) => i + n))
        yield* pipe(
          Stream.make(1, 2, 3, 4, 5),
          Stream.rechunk(1),
          Stream.forever,
          Stream.tapSink(sink),
          Stream.take(3),
          Stream.runDrain
        )
        const result = yield* Ref.get(ref)
        strictEqual(result, 6)
      }))
  })

  describe("dropping", () => {
    it.effect("drop - simple example", () =>
      Effect.gen(function*() {
        const n = 2
        const stream = Stream.make(1, 2, 3, 4, 5)
        const { result1, result2 } = yield* (Effect.all({
          result1: pipe(stream, Stream.drop(n), Stream.runCollect),
          result2: pipe(stream, Stream.runCollect, Effect.map(Array.drop(n)))
        }))
        deepStrictEqual(result1, result2)
      }))

    it.effect("drop - normalizes the count independently of upstream chunking", () =>
      Effect.gen(function*() {
        const counts = [Number.NaN, 0.5, 1.9, 2.9]
        const results = yield* Effect.forEach([
          Stream.make(1, 2, 3),
          Stream.fromArrays([1], [2], [3])
        ], (stream) =>
          Effect.forEach(counts, (n) =>
            stream.pipe(
              Stream.drop(n),
              Stream.runCollect
            )))
        assert.deepStrictEqual(results, [
          [[1, 2, 3], [1, 2, 3], [2, 3], [3]],
          [[1, 2, 3], [1, 2, 3], [2, 3], [3]]
        ])
      }))

    it.effect("drop - does not swallow errors", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.fail("Ouch"),
          Stream.concat(Stream.make(1)),
          Stream.drop(1),
          Stream.runDrain,
          Effect.result
        )
        assertFailure(result, "Ouch")
      }))

    it.effect("dropRight - simple example", () =>
      Effect.gen(function*() {
        const n = 2
        const stream = Stream.make(1, 2, 3, 4, 5)
        const { result1, result2 } = yield* (Effect.all({
          result1: pipe(stream, Stream.dropRight(n), Stream.runCollect),
          result2: pipe(stream, Stream.runCollect, Effect.map(Array.dropRight(n)))
        }))
        deepStrictEqual(result1, result2)
      }))

    it.effect("dropRight - normalizes the element count", () =>
      Effect.gen(function*() {
        const results = yield* Effect.forEach([Number.NaN, 0.5, 1.9, 2.9], (n) =>
          Stream.make(1, 2, 3).pipe(
            Stream.dropRight(n),
            Stream.runCollect
          ))
        assert.deepStrictEqual(results, [[1, 2, 3], [1, 2, 3], [1, 2], [1]])
      }))

    it.effect("dropRight - does not swallow errors", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.make(1),
          Stream.concat(Stream.fail("Ouch")),
          Stream.dropRight(1),
          Stream.runDrain,
          Effect.result
        )
        assertFailure(result, "Ouch")
      }))

    it.effect("dropUntil", () =>
      Effect.gen(function*() {
        const stream = Stream.make(1, 2, 3, 4, 5)
        const f = (n: number) => n < 3
        const { result1, result2 } = yield* (Effect.all({
          result1: pipe(stream, Stream.dropUntil(f), Stream.runCollect),
          result2: pipe(
            Stream.runCollect(stream),
            Effect.map((chunk) => pipe(chunk, Array.dropWhile((n) => !f(n)), Array.drop(1)))
          )
        }))
        deepStrictEqual(result1, result2)
      }))

    it.effect("dropWhile", () =>
      Effect.gen(function*() {
        const stream = Stream.make(1, 2, 3, 4, 5)
        const f = (n: number) => n < 3
        const { result1, result2 } = yield* (Effect.all({
          result1: pipe(stream, Stream.dropWhile(f), Stream.runCollect),
          result2: pipe(stream, Stream.runCollect, Effect.map(Array.dropWhile(f)))
        }))
        deepStrictEqual(result1, result2)
      }))

    it.effect("dropWhileFilter", () =>
      Effect.gen(function*() {
        const result = yield* Stream.make(1, 2, 3, 4, 5).pipe(
          Stream.dropWhileFilter((n) => n < 3 ? Result.succeed(n) : Result.failVoid),
          Stream.runCollect
        )
        deepStrictEqual(result, [3, 4, 5])
      }))

    it.effect("dropWhile - short circuits", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.make(1),
          Stream.concat(Stream.fail("Ouch")),
          Stream.take(1),
          Stream.dropWhile(constTrue),
          Stream.runDrain,
          Effect.result
        )
        assertSuccess(result, void 0)
      }))
  })

  describe("haltWhen", () => {
    it.effect("halts after the current element in the documentation example", () =>
      Effect.gen(function*() {
        const halt = yield* Deferred.make<void>()
        const values = yield* Stream.fromArray([1, 2, 3]).pipe(
          Stream.tap((value) => value === 2 ? Deferred.succeed(halt, void 0) : Effect.void),
          Stream.haltWhen(Deferred.await(halt)),
          Stream.runCollect
        )
        assert.deepStrictEqual(values, [1, 2])
      }))

    it.effect("halts a synchronous upstream before the next chunk", () =>
      Effect.gen(function*() {
        const halt = yield* Deferred.make<void>()
        const values = yield* Stream.fromArrays([1], [2], [3], [4]).pipe(
          Stream.tap((value) => value === 2 ? Deferred.succeed(halt, void 0) : Effect.void),
          Stream.haltWhen(Deferred.await(halt)),
          Stream.runCollect
        )
        assert.deepStrictEqual(values, [1, 2])
      }))

    it.effect("halts after the current element", () =>
      Effect.gen(function*() {
        const ref = yield* Ref.make(false)
        const latch = yield* Deferred.make<void>()
        const halt = yield* Deferred.make<void>()
        yield* pipe(
          Deferred.await(latch),
          Effect.onInterrupt(() => Ref.set(ref, true)),
          Stream.fromEffect,
          Stream.haltWhen(Deferred.await(halt)),
          Stream.runDrain,
          Effect.forkChild
        )
        yield* Deferred.succeed(halt, void 0)
        yield* Deferred.succeed(latch, void 0)
        const result = yield* Ref.get(ref)
        assert.strictEqual(result, false)
      }))

    it.effect("propagates errors", () =>
      Effect.gen(function*() {
        const halt = yield* Deferred.make<void, string>()
        yield* Deferred.fail(halt, "fail")
        const result = yield* pipe(
          Stream.make(0),
          Stream.forever,
          Stream.haltWhen(Deferred.await(halt)),
          Stream.runDrain,
          Effect.flip
        )
        assert.strictEqual(result, "fail")
      }))
  })

  describe("intersperse", () => {
    it.effect("intersperse - several values", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.make(1, 2, 3, 4),
          Stream.map(String),
          Stream.intersperse("."),
          Stream.runCollect
        )
        deepStrictEqual(result, ["1", ".", "2", ".", "3", ".", "4"])
      }))

    it.effect("intersperseAffixes - several values", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.make(1, 2, 3, 4),
          Stream.map(String),
          Stream.intersperseAffixes({ start: "[", middle: ".", end: "]" }),
          Stream.runCollect
        )
        deepStrictEqual(result, ["[", "1", ".", "2", ".", "3", ".", "4", "]"])
      }))

    it.effect("intersperse - single value", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.make(1),
          Stream.map(String),
          Stream.intersperse("."),
          Stream.runCollect
        )
        deepStrictEqual(result, ["1"])
      }))

    it.effect("intersperseAffixes - single value", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.make(1),
          Stream.map(String),
          Stream.intersperseAffixes({ start: "[", middle: ".", end: "]" }),
          Stream.runCollect
        )
        deepStrictEqual(result, ["[", "1", "]"])
      }))

    it.effect("intersperse - several from repeat effect (ZIO #3729)", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.fromEffectRepeat(Effect.succeed(42)),
          Stream.map(String),
          Stream.take(4),
          Stream.intersperse("."),
          Stream.runCollect
        )
        deepStrictEqual(result, ["42", ".", "42", ".", "42", ".", "42"])
      }))

    it.effect("intersperse - several from repeat effect chunk single element (ZIO #3729)", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.fromIterableEffectRepeat(Effect.succeed(Array.of(42))),
          Stream.map(String),
          Stream.intersperse("."),
          Stream.take(4),
          Stream.runCollect
        )
        deepStrictEqual(result, ["42", ".", "42", "."])
      }))
  })

  describe("interleave", () => {
    it.effect("interleave", () =>
      Effect.gen(function*() {
        const stream1 = Stream.make(2, 3)
        const stream2 = Stream.make(5, 6, 7)
        const result = yield* pipe(
          stream1,
          Stream.interleave(stream2),
          Stream.runCollect
        )
        deepStrictEqual(result, [2, 5, 3, 6, 7])
      }))

    it.effect("interleaveWith", () =>
      Effect.gen(function*() {
        const interleave = (
          bools: ReadonlyArray<boolean>,
          numbers1: ReadonlyArray<number>,
          numbers2: ReadonlyArray<number>
        ): ReadonlyArray<number> =>
          pipe(
            Array.head(bools),
            Option.map((head) => {
              if (head) {
                if (Array.isReadonlyArrayNonEmpty(numbers1)) {
                  const head = pipe(numbers1, Array.getUnsafe(0))
                  const tail = pipe(numbers1, Array.drop(1))
                  return pipe(
                    interleave(pipe(bools, Array.drop(1)), tail, numbers2),
                    Array.prepend(head)
                  )
                }
                if (Array.isReadonlyArrayNonEmpty(numbers2)) {
                  return interleave(pipe(bools, Array.drop(1)), Array.empty<number>(), numbers2)
                }
                return Array.empty<number>()
              }
              if (Array.isReadonlyArrayNonEmpty(numbers2)) {
                const head = pipe(numbers2, Array.getUnsafe(0))
                const tail = pipe(numbers2, Array.drop(1))
                return pipe(
                  interleave(pipe(bools, Array.drop(1)), numbers1, tail),
                  Array.prepend(head)
                )
              }
              if (Array.isReadonlyArrayNonEmpty(numbers1)) {
                return interleave(pipe(bools, Array.drop(1)), numbers1, Array.empty<number>())
              }
              return Array.empty<number>()
            }),
            Option.getOrElse(() => Array.empty<number>())
          )
        const boolStream = Stream.make(true, true, false, true, false)
        const stream1 = Stream.make(1, 2, 3, 4, 5)
        const stream2 = Stream.make(4, 5, 6, 7, 8)
        const interleavedStream = yield* pipe(
          stream1,
          Stream.interleaveWith(stream2, boolStream),
          Stream.runCollect
        )
        const bools = yield* (Stream.runCollect(boolStream))
        const numbers1 = yield* (Stream.runCollect(stream1))
        const numbers2 = yield* (Stream.runCollect(stream2))
        const interleavedChunks = interleave(bools, numbers1, numbers2)
        deepStrictEqual(interleavedStream, interleavedChunks)
      }))
  })

  describe("merge", () => {
    it.effect("data-first with options", () =>
      Effect.gen(function*() {
        const result = yield* Stream.runCollect(
          Stream.merge(Stream.make(1), Stream.never, { haltStrategy: "left" })
        )
        deepStrictEqual(result, [1])
      }))

    it.effect("data-last with options", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.make(1),
          Stream.merge(Stream.never, { haltStrategy: "left" }),
          Stream.runCollect
        )
        deepStrictEqual(result, [1])
      }))
  })

  describe("partition", () => {
    it.effect("defaults to a capacity of 16", () =>
      Effect.gen(function*() {
        let pulled = 0
        yield* Stream.range(0, 31).pipe(
          Stream.rechunk(1),
          Stream.tap(() =>
            Effect.sync(() => {
              pulled++
            })
          ),
          Stream.partition(Result.succeed)
        )
        yield* TestClock.adjust(0)
        // Sixteen elements are buffered; the next offer is blocked.
        assert.strictEqual(pulled, 17)
      }).pipe(Effect.scoped))

    it.effect("values", () =>
      Effect.gen(function*() {
        const { result1, result2 } = yield* pipe(
          Stream.range(0, 5),
          Stream.partition((n) => n % 2 === 0 ? Result.succeed(n) : Result.fail(n)),
          Effect.flatMap(([evens, odds]) =>
            Effect.all({
              result1: Stream.runCollect(evens),
              result2: Stream.runCollect(odds)
            })
          ),
          Effect.scoped
        )
        deepStrictEqual(result1, [0, 2, 4])
        deepStrictEqual(result2, [1, 3, 5])
      }))

    it.effect("errors", () =>
      Effect.gen(function*() {
        const { result1, result2 } = yield* pipe(
          Stream.make(0),
          Stream.concat(Stream.fail("boom")),
          Stream.partition((n) => n % 2 === 0 ? Result.succeed(n) : Result.fail(n)),
          Effect.flatMap(([evens, odds]) =>
            Effect.all({
              result1: Effect.flip(Stream.runCollect(evens)),
              result2: Effect.flip(Stream.runCollect(odds))
            })
          ),
          Effect.scoped
        )
        assert.strictEqual(result1, "boom")
        assert.strictEqual(result2, "boom")
      }))

    it.effect("backpressure", () =>
      Effect.gen(function*() {
        const { result1, result2, result3 } = yield* pipe(
          Stream.range(0, 5),
          Stream.partition((n) => n % 2 === 0 ? Result.succeed(n) : Result.fail(n), { capacity: 1 }),
          Effect.flatMap(([evens, odds]) =>
            Effect.gen(function*() {
              const ref = yield* Ref.make(Array.empty<number>())
              const latch = yield* Deferred.make<void>()
              const fiber = yield* pipe(
                evens,
                Stream.tap((n) =>
                  pipe(
                    Ref.update(ref, Array.prepend(n)),
                    Effect.andThen(
                      pipe(
                        Deferred.succeed(latch, void 0),
                        Effect.when(Effect.sync(() => n === 2))
                      )
                    )
                  )
                ),
                Stream.runDrain,
                Effect.forkChild
              )
              yield* Deferred.await(latch)
              const result1 = yield* Ref.get(ref)
              const result2 = yield* Stream.runCollect(odds)
              yield* Fiber.await(fiber)
              const result3 = yield* Ref.get(ref)
              return { result1, result2, result3 }
            })
          ),
          Effect.scoped
        )
        deepStrictEqual(result1, [2, 0])
        deepStrictEqual(result2, [1, 3, 5])
        deepStrictEqual(result3, [4, 2, 0])
      }))
  })

  describe("partition", () => {
    it.effect("partitionEffect - allows repeated runs without hanging", () =>
      Effect.gen(function*() {
        const stream = pipe(
          Stream.fromIterable(Array.empty<number>()),
          Stream.partitionEffect((n) => Effect.succeed(n % 2 === 0 ? Result.succeed(n) : Result.fail(n))),
          Effect.map(([passes, fails]) => pipe(fails, Stream.mergeResult(passes))),
          Effect.flatMap(Stream.runCollect),
          Effect.scoped
        )
        const result = yield* pipe(
          Effect.all(Array.makeBy(100, () => stream)),
          Effect.as(0)
        )
        strictEqual(result, 0)
      }))

    it.effect("partitionEffect - values", () =>
      Effect.gen(function*() {
        const { result1, result2 } = yield* pipe(
          Stream.range(0, 5),
          Stream.partitionEffect((n) => Effect.succeed(n % 2 === 0 ? Result.succeed(n + 10) : Result.fail(`odd:${n}`))),
          Effect.flatMap(([passes, fails]) =>
            Effect.all({
              result1: Stream.runCollect(passes),
              result2: Stream.runCollect(fails)
            })
          ),
          Effect.scoped
        )
        deepStrictEqual(result1, [10, 12, 14])
        deepStrictEqual(result2, ["odd:1", "odd:3", "odd:5"])
      }))

    it.effect("partitionQueue - values", () =>
      Effect.gen(function*() {
        const { result1, result2 } = yield* pipe(
          Stream.range(0, 5),
          Stream.partitionQueue((n) => n % 2 === 0 ? Result.succeed(n + 1) : Result.fail(`odd:${n}`)),
          Effect.flatMap(([passes, fails]) =>
            Effect.all({
              result1: Stream.runCollect(Stream.fromQueue(passes)),
              result2: Stream.runCollect(Stream.fromQueue(fails))
            })
          ),
          Effect.scoped
        )
        deepStrictEqual(result1, [1, 3, 5])
        deepStrictEqual(result2, ["odd:1", "odd:3", "odd:5"])
      }))

    it.effect("partition - values", () =>
      Effect.gen(function*() {
        const { result1, result2 } = yield* pipe(
          Stream.range(0, 5),
          Stream.partition((n) => n % 2 === 0 ? Result.succeed(n) : Result.fail(n)),
          Effect.flatMap(([evens, odds]) =>
            Effect.all({
              result1: Stream.runCollect(evens),
              result2: Stream.runCollect(odds)
            })
          ),
          Effect.scoped
        )
        deepStrictEqual(result1, [0, 2, 4])
        deepStrictEqual(result2, [1, 3, 5])
      }))

    it.effect("partition - errors", () =>
      Effect.gen(function*() {
        const { result1, result2 } = yield* pipe(
          Stream.make(0),
          Stream.concat(Stream.fail("boom")),
          Stream.partition((n) => n % 2 === 0 ? Result.succeed(n) : Result.fail(n)),
          Effect.flatMap(([evens, odds]) =>
            Effect.all({
              result1: Effect.flip(Stream.runCollect(evens)),
              result2: Effect.flip(Stream.runCollect(odds))
            })
          ),
          Effect.scoped
        )
        assert.strictEqual(result1, "boom")
        assert.strictEqual(result2, "boom")
      }))

    it.effect("partition - backpressure", () =>
      Effect.gen(function*() {
        const { result1, result2, result3 } = yield* pipe(
          Stream.range(0, 5),
          Stream.partition((n) => (n % 2 === 0 ? Result.succeed(n) : Result.fail(n)), { capacity: 1 }),
          Effect.flatMap(([evens, odds]) =>
            Effect.gen(function*() {
              const ref = yield* Ref.make(Array.empty<number>())
              const latch = yield* (Deferred.make<void>())
              const fiber = yield* pipe(
                evens,
                Stream.tap((n) =>
                  pipe(
                    Ref.update(ref, Array.prepend(n)),
                    Effect.andThen(
                      pipe(
                        Deferred.succeed(latch, void 0),
                        Effect.when(Effect.sync(() => n === 2))
                      )
                    )
                  )
                ),
                Stream.runDrain,
                Effect.forkChild
              )
              yield* (Deferred.await(latch))
              const result1 = yield* (Ref.get(ref))
              const result2 = yield* (Stream.runCollect(odds))
              yield* (Fiber.await(fiber))
              const result3 = yield* (Ref.get(ref))
              return { result1, result2, result3 }
            })
          ),
          Effect.scoped
        )
        deepStrictEqual(result1, [2, 0])
        deepStrictEqual(result2, [1, 3, 5])
        deepStrictEqual(result3, [4, 2, 0])
      }))

    it.effect("partition with Filter", () =>
      Effect.gen(function*() {
        const { evens, odds } = yield* pipe(
          Stream.range(0, 5),
          Stream.partition((n: number) => n % 2 === 0 ? Result.succeed(n) : Result.fail(n)),
          Effect.flatMap(([pass, fail]) =>
            Effect.all({
              evens: Stream.runCollect(pass),
              odds: Stream.runCollect(fail)
            })
          ),
          Effect.scoped
        )
        deepStrictEqual(evens, [0, 2, 4])
        deepStrictEqual(odds, [1, 3, 5])
      }))
  })

  describe("peel", () => {
    it.effect("peel", () =>
      Effect.gen(function*() {
        const sink = Sink.take<number>(3)
        const [peeled, rest] = yield* pipe(
          Stream.fromArrays(Array.range(1, 3), Array.range(4, 6)),
          Stream.peel(sink),
          Effect.flatMap(([peeled, rest]) =>
            pipe(
              Stream.runCollect(rest),
              Effect.map((rest) => [peeled, rest])
            )
          ),
          Effect.scoped
        )
        deepStrictEqual(peeled, [1, 2, 3])
        deepStrictEqual(rest, [4, 5, 6])
      }))

    it.effect("peel - propagates errors", () =>
      Effect.gen(function*() {
        const stream = Stream.fromEffectRepeat(Effect.fail("fail"))
        const sink = Sink.fold<ReadonlyArray<number>, number>(
          Array.empty,
          constTrue,
          (acc, n) => Effect.succeed(Array.append(acc, n))
        )
        const result = yield* pipe(
          stream,
          Stream.peel(sink),
          Effect.exit,
          Effect.scoped
        )
        deepStrictEqual(result, Exit.fail("fail"))
      }))
  })

  describe("repeat", () => {
    it.effect("repeat", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.make(1),
          Stream.repeat(Schedule.recurs(4)),
          Stream.runCollect
        )
        deepStrictEqual(result, [1, 1, 1, 1, 1])
      }))

    // it.effect("tick", () =>
    //   Effect.gen(function*() {
    //     const fiber = yield* pipe(
    //       Stream.tick("10 millis"),
    //       Stream.take(2),
    //       Stream.runCollect,
    //       Effect.fork
    //     )
    //     yield* (TestClock.adjust(Duration.millis(50)))
    //     const result = yield* (Fiber.join(fiber))
    //     deepStrictEqual(Array.from(result), [undefined, undefined])
    //   }))

    it.effect("repeat - short circuits", () =>
      Effect.gen(function*() {
        const ref = yield* Ref.make(Array.empty<number>())
        const fiber = yield* pipe(
          Stream.fromEffect(Ref.update(ref, Array.prepend(1))),
          Stream.repeat(Schedule.spaced(Duration.millis(10))),
          Stream.take(2),
          Stream.runDrain,
          Effect.forkChild
        )
        yield* TestClock.adjust(Duration.millis(50))
        yield* Fiber.join(fiber)
        const result = yield* Ref.get(ref)
        deepStrictEqual(result, [1, 1])
      }))

    // it.effect("repeat - Schedule.CurrentIterationMetadata", () =>
    //   Effect.gen(function*() {
    //     const ref = yield* (Ref.make(Chunk.empty<undefined | Schedule.IterationMetadata>()))
    //     const fiber = yield* pipe(
    //       Stream.fromEffect(
    //         Schedule.CurrentIterationMetadata.pipe(
    //           Effect.flatMap((currentIterationMetadata) => Ref.update(ref, Chunk.append(currentIterationMetadata)))
    //         )
    //       ),
    //       Stream.repeat(Schedule.exponential(Duration.millis(10))),
    //       Stream.runDrain,
    //       Effect.fork
    //     )
    //
    //     yield* (TestClock.adjust(Duration.millis(70)))
    //     yield* (Fiber.interrupt(fiber))
    //     const result = yield* (Ref.get(ref))
    //     deepStrictEqual(Array.from(result), [
    //       {
    //         elapsed: Duration.zero,
    //         elapsedSincePrevious: Duration.zero,
    //         input: undefined,
    //         output: undefined,
    //         now: 0,
    //         recurrence: 0,
    //         start: 0
    //       },
    //       {
    //         elapsed: Duration.zero,
    //         elapsedSincePrevious: Duration.zero,
    //         input: undefined,
    //         output: Duration.millis(10),
    //         now: 0,
    //         recurrence: 1,
    //         start: 0
    //       },
    //       {
    //         elapsed: Duration.millis(10),
    //         elapsedSincePrevious: Duration.millis(10),
    //         input: undefined,
    //         output: Duration.millis(20),
    //         now: 10,
    //         recurrence: 2,
    //         start: 0
    //       },
    //       {
    //         elapsed: Duration.millis(30),
    //         elapsedSincePrevious: Duration.millis(20),
    //         input: undefined,
    //         output: Duration.millis(40),
    //         now: 30,
    //         recurrence: 3,
    //         start: 0
    //       }
    //     ])
    //   }))

    it.effect("repeat - does not swallow errors on a repetition", () =>
      Effect.gen(function*() {
        const ref = yield* (Ref.make(0))
        const result = yield* pipe(
          Stream.fromEffect(pipe(
            Ref.getAndUpdate(ref, (n) => n + 1),
            Effect.flatMap((n) => n <= 2 ? Effect.succeed(n) : Effect.fail("boom"))
          )),
          Stream.repeat(Schedule.recurs(3)),
          Stream.runDrain,
          Effect.exit
        )
        deepStrictEqual(result, Exit.fail("boom"))
      }))

    it.effect("repeatElements - simple", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.make("A", "B", "C"),
          Stream.repeatElements(Schedule.recurs(1)),
          Stream.runCollect
        )
        deepStrictEqual(result, ["A", "A", "B", "B", "C", "C"])
      }))

    it.effect("repeatElements - short circuits in a schedule", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.make("A", "B", "C"),
          Stream.repeatElements(Schedule.recurs(1)),
          Stream.take(4),
          Stream.runCollect
        )
        deepStrictEqual(result, ["A", "A", "B", "B"])
      }))

    it.effect("repeatElements - short circuits after schedule", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.make("A", "B", "C"),
          Stream.repeatElements(Schedule.recurs(1)),
          Stream.take(3),
          Stream.runCollect
        )
        deepStrictEqual(result, ["A", "A", "B"])
      }))
  })

  describe("retry", () => {
    it.effect("retry - retries a failing stream", () =>
      Effect.gen(function*() {
        const ref = yield* Ref.make(0)
        const stream = pipe(
          Stream.fromEffect(Ref.getAndUpdate(ref, (n) => n + 1)),
          Stream.concat(Stream.fail(Option.none()))
        )
        const result = yield* pipe(
          stream,
          Stream.retry(Schedule.forever),
          Stream.take(2),
          Stream.runCollect
        )
        deepStrictEqual(Array.fromIterable(result), [0, 1])
      }))

    it.effect("retry - cleans up resources before restarting the stream", () =>
      Effect.gen(function*() {
        const ref = yield* Ref.make(0)
        const stream = pipe(
          Effect.addFinalizer(() => Ref.getAndUpdate(ref, (n) => n + 1)),
          Effect.as(
            pipe(
              Stream.fromEffect(Ref.get(ref)),
              Stream.concat(Stream.fail(Option.none()))
            )
          ),
          Stream.unwrap
        )
        const result = yield* pipe(
          stream,
          Stream.retry(Schedule.forever),
          Stream.take(2),
          Stream.runCollect
        )
        deepStrictEqual(result, [0, 1])
      }))

    it.effect("retry - retries a failing stream according to a schedule", () =>
      Effect.gen(function*() {
        const ref = yield* Ref.make(Array.empty<number>())
        const stream = pipe(
          Stream.fromEffect(
            pipe(
              Clock.currentTimeMillis,
              Effect.flatMap((n) => Ref.update(ref, Array.prepend(n)))
            )
          ),
          Stream.flatMap(() => Stream.fail(Option.none()))
        )
        const fiber = yield* pipe(
          stream,
          Stream.retry(Schedule.exponential(Duration.seconds(1))),
          Stream.take(3),
          Stream.runDrain,
          Effect.forkChild
        )
        yield* TestClock.adjust(Duration.seconds(1))
        yield* TestClock.adjust(Duration.seconds(2))
        yield* Fiber.interrupt(fiber)
        const result = yield* pipe(Ref.get(ref), Effect.map(Array.map((n) => new Date(n).getSeconds())))
        deepStrictEqual(Array.fromIterable(result), [3, 1, 0])
      }))

    it.effect("retry - reset the schedule after a successful pull", () =>
      Effect.gen(function*() {
        const times = yield* Ref.make(Array.empty<number>())
        const ref = yield* Ref.make(0)
        const effect = pipe(
          Clock.currentTimeMillis,
          Effect.flatMap((time) =>
            pipe(
              Ref.update(times, Array.prepend(time / 1000)),
              Effect.andThen(Ref.updateAndGet(ref, (n) => n + 1))
            )
          )
        )
        const stream = pipe(
          Stream.fromEffect(effect),
          Stream.flatMap((attempt) =>
            attempt === 3 || attempt === 5 ?
              Stream.succeed(attempt) :
              Stream.fail(Option.none())
          ),
          Stream.forever
        )
        const fiber = yield* pipe(
          stream,
          Stream.retry(Schedule.exponential(Duration.seconds(1))),
          Stream.take(2),
          Stream.runDrain,
          Effect.forkChild
        )
        yield* TestClock.adjust(Duration.seconds(1))
        yield* TestClock.adjust(Duration.seconds(2))
        yield* TestClock.adjust(Duration.seconds(1))
        yield* Fiber.join(fiber)
        const result = yield* Ref.get(times)
        deepStrictEqual(result, [4, 3, 3, 1, 0])
      }))

    it.effect("retry - Schedule.CurrentMetadata", () =>
      Effect.gen(function*() {
        const metadata = yield* Ref.make(Array.empty<undefined | Schedule.Metadata>())
        const fiber = yield* pipe(
          Stream.fail(1),
          Stream.tapError(Effect.fnUntraced(function*(_) {
            const currentMeta = yield* Schedule.CurrentMetadata
            yield* Ref.update(metadata, Array.append(currentMeta))
          })),
          Stream.retry(Schedule.exponential(Duration.seconds(1))),
          Stream.runDrain,
          Effect.forkChild({ startImmediately: true })
        )
        yield* TestClock.adjust(Duration.seconds(7))
        yield* Fiber.interrupt(fiber)
        const result = yield* Ref.get(metadata)
        deepStrictEqual(result, [
          {
            elapsed: 0,
            elapsedSincePrevious: 0,
            input: undefined,
            output: undefined,
            now: 0,
            attempt: 0,
            start: 0,
            duration: Duration.zero
          },
          {
            elapsed: 0,
            elapsedSincePrevious: 0,
            input: 1,
            output: Duration.millis(1000),
            now: 0,
            attempt: 1,
            start: 0,
            duration: Duration.millis(1000)
          },
          {
            elapsed: 1000,
            elapsedSincePrevious: 1000,
            input: 1,
            output: Duration.millis(2000),
            now: 1000,
            attempt: 2,
            start: 0,
            duration: Duration.millis(2000)
          },
          {
            elapsed: 3000,
            elapsedSincePrevious: 2000,
            input: 1,
            output: Duration.millis(4000),
            now: 3000,
            attempt: 3,
            start: 0,
            duration: Duration.millis(4000)
          }
        ])
      }))
  })

  describe("schedule", () => {
    it.effect("schedule", () =>
      Effect.gen(function*() {
        const start = yield* Clock.currentTimeMillis
        const fiber = yield* pipe(
          Stream.range(1, 8),
          Stream.schedule(Schedule.fixed(Duration.millis(100))),
          Stream.mapEffect((n) =>
            pipe(
              Clock.currentTimeMillis,
              Effect.map((now) => [n, now - start] as const)
            )
          ),
          Stream.runCollect,
          Effect.forkChild
        )
        yield* TestClock.adjust(Duration.millis(800))
        const result = yield* Fiber.join(fiber)
        deepStrictEqual(result, [
          [1, 100],
          [2, 200],
          [3, 300],
          [4, 400],
          [5, 500],
          [6, 600],
          [7, 700],
          [8, 800]
        ])
      }))
  })

  describe("sliding", () => {
    it.effect("sliding and slidingSize normalize window and step sizes", () =>
      Effect.gen(function*() {
        const counts = [Number.NaN, 0.5, 1.9, 2.9]
        const windows = yield* Effect.forEach(counts, (n) =>
          Stream.make(1, 2, 3).pipe(
            Stream.sliding(n),
            Stream.runCollect
          ))
        const steps = yield* Effect.forEach(counts, (n) =>
          Stream.make(1, 2, 3).pipe(
            Stream.slidingSize(2, n),
            Stream.runCollect
          ))

        assert.deepStrictEqual(windows, [
          [[1], [2], [3]],
          [[1], [2], [3]],
          [[1], [2], [3]],
          [[1, 2], [2, 3]]
        ])
        assert.deepStrictEqual(steps, [
          [[1, 2], [2, 3]],
          [[1, 2], [2, 3]],
          [[1, 2], [2, 3]],
          [[1, 2], [3]]
        ])
      }))

    it.effect("sliding - returns a sliding window", () =>
      Effect.gen(function*() {
        const stream0 = Stream.fromArrays(
          Array.empty<number>(),
          Array.make(1),
          Array.empty<number>(),
          Array.make(2, 3, 4, 5)
        )
        const stream1 = pipe(
          Stream.empty,
          Stream.concat(Stream.make(1)),
          Stream.concat(Stream.empty),
          Stream.concat(Stream.make(2)),
          Stream.concat(Stream.make(3, 4, 5))
        )
        const stream2 = pipe(
          Stream.make(1),
          Stream.concat(Stream.empty),
          Stream.concat(Stream.make(2)),
          Stream.concat(Stream.empty),
          Stream.concat(Stream.make(3, 4, 5))
        )
        const stream3 = pipe(
          Stream.make(1),
          Stream.concat(Stream.make(2)),
          Stream.concat(Stream.make(3, 4, 5))
        )
        const result1 = yield* pipe(
          Stream.make(1, 2, 3, 4, 5),
          Stream.sliding(2),
          Stream.runCollect
        )
        const result2 = yield* pipe(
          stream0,
          Stream.sliding(2),
          Stream.runCollect
        )
        const result3 = yield* pipe(
          stream1,
          Stream.sliding(2),
          Stream.runCollect
        )
        const result4 = yield* pipe(
          stream2,
          Stream.sliding(2),
          Stream.runCollect
        )
        const result5 = yield* pipe(
          stream3,
          Stream.sliding(2),
          Stream.runCollect
        )
        const expected = [[1, 2], [2, 3], [3, 4], [4, 5]]
        deepStrictEqual(result1, expected as any)
        deepStrictEqual(result2, expected as any)
        deepStrictEqual(result3, expected as any)
        deepStrictEqual(result4, expected as any)
        deepStrictEqual(result5, expected as any)
      }))

    it.effect("sliding - returns all elements if chunkSize is greater than the size of the stream", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.range(1, 5),
          Stream.sliding(6),
          Stream.runCollect
        )
        deepStrictEqual(result, [[1, 2, 3, 4, 5]])
      }))

    it.effect("sliding - is mostly equivalent to ZStream#grouped when stepSize and chunkSize are equal", () =>
      Effect.gen(function*() {
        const stream = Stream.range(1, 5)
        const { result1, result2 } = yield* (Effect.all({
          result1: pipe(stream, Stream.slidingSize(3, 3), Stream.runCollect),
          result2: pipe(stream, Stream.grouped(3), Stream.runCollect)
        }))
        deepStrictEqual(result1, result2)
      }))

    it.effect("slidingSize is independent of upstream chunk boundaries", () =>
      Effect.gen(function*() {
        const result = yield* Effect.all([
          Stream.make(1, 2, 3, 4, 5),
          Stream.fromArrays([1, 2], [3, 4, 5]),
          Stream.fromArrays([1], [2], [3], [4], [5]),
          Stream.fromArrays([1], [2], [3], [4])
        ].map((stream) => stream.pipe(Stream.slidingSize(2, 3), Stream.runCollect)))

        deepStrictEqual(result, [
          [[1, 2], [4, 5]],
          [[1, 2], [4, 5]],
          [[1, 2], [4, 5]],
          [[1, 2], [4]]
        ])
      }))

    it.effect("sliding - fails if upstream produces an error", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.make(1, 2, 3),
          Stream.concat(Stream.fail("Ouch")),
          Stream.concat(Stream.make(4, 5)),
          Stream.sliding(2),
          Stream.runCollect,
          Effect.flip
        )
        assert.strictEqual(result, "Ouch")
      }))

    it.effect("sliding - should return an empty chunk when the stream is empty", () =>
      Effect.gen(function*() {
        const result = yield* pipe(Stream.empty, Stream.sliding(2), Stream.runCollect)
        deepStrictEqual(result, [])
      }))

    it.effect("sliding - emits elements properly when a failure occurs", () =>
      Effect.gen(function*() {
        const ref = yield* Ref.make(Array.empty<Array.NonEmptyReadonlyArray<number>>())
        const streamChunks = Stream.fromArrays(
          Array.range(1, 4),
          Array.range(5, 7),
          Array.of(8)
        )
        const stream = pipe(
          streamChunks,
          Stream.concat(Stream.fail("Ouch")),
          Stream.slidingSize(3, 3)
        )
        const either = yield* pipe(
          stream,
          Stream.mapEffect((chunk) => Ref.update(ref, Array.append(chunk))),
          Stream.runCollect,
          Effect.flip
        )
        const result = yield* (Ref.get(ref))
        assert.strictEqual(either, "Ouch")
        deepStrictEqual(result, [[1, 2, 3], [4, 5, 6], [7, 8]])
      }))
  })

  describe("split", () => {
    it.effect("split - should split properly", () =>
      Effect.gen(function*() {
        const chunks = Array.make(
          Array.range(1, 2),
          Array.range(3, 4),
          Array.range(5, 6),
          Array.make(7, 8, 9),
          Array.of(10)
        )
        const { result1, result2 } = yield* (Effect.all({
          result1: pipe(
            Stream.range(0, 9),
            Stream.split((n) => n % 4 === 0),
            Stream.runCollect
          ),
          result2: pipe(
            Stream.fromArrays(...chunks),
            Stream.split((n) => n % 3 === 0),
            Stream.runCollect
          )
        }))
        deepStrictEqual(
          result1,
          [[1, 2, 3], [5, 6, 7], [9]]
        )
        deepStrictEqual(
          result2,
          [[1, 2], [4, 5], [7, 8], [10]]
        )
      }))

    it.effect("split - is equivalent to identity when the predicate is not satisfied", () =>
      Effect.gen(function*() {
        const stream = Stream.range(1, 10)
        const { result1, result2 } = yield* (Effect.all({
          result1: pipe(stream, Stream.split((n) => n % 11 === 0), Stream.runCollect),
          result2: pipe(
            Stream.runCollect(stream),
            Effect.map((chunk) => pipe(Array.of(chunk), Array.filter(Array.isArrayNonEmpty)))
          )
        }))
        deepStrictEqual(result1, [Array.range(1, 10)])
        deepStrictEqual(result1, result2)
      }))

    it.effect("split - should output empty chunk when stream is empty", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.empty,
          Stream.split((n: number) => n % 11 === 0),
          Stream.runCollect
        )
        deepStrictEqual(result, [])
      }))
  })

  describe("timeout", () => {
    it.effect("timeoutOrElse - succeed", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.succeed(1),
          Stream.timeoutOrElse({
            duration: Duration.infinity,
            orElse: () => Stream.succeed(-1)
          }),
          Stream.runCollect
        )
        deepStrictEqual(result, [1])
      }))

    it.effect("timeoutOrElse - should switch streams", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.range(0, 4),
          Stream.tap(() => Effect.sleep(Duration.infinity)),
          Stream.timeoutOrElse({
            duration: Duration.zero,
            orElse: () => Stream.succeed(4)
          }),
          Stream.runCollect
        )
        deepStrictEqual(result, [4])
      }))

    it.effect("timeoutOrElse - should not apply timeout after switch", () =>
      Effect.gen(function*() {
        const fiber = yield* pipe(
          Stream.never,
          Stream.timeoutOrElse({
            duration: Duration.zero,
            orElse: () =>
              Stream.succeed(1).pipe(
                Stream.tap(() => Effect.sleep(Duration.seconds(1)))
              )
          }),
          Stream.runCollect,
          Effect.forkChild({ startImmediately: true })
        )
        yield* TestClock.adjust(Duration.seconds(1))
        const result = yield* Fiber.join(fiber)
        deepStrictEqual(result, [1])
      }))

    it.effect("timeout - succeed", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.succeed(1),
          Stream.timeout(Duration.infinity),
          Stream.runCollect
        )
        deepStrictEqual(result, [1])
      }))

    it.effect("timeout - should end the stream", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.range(0, 4),
          Stream.tap(() => Effect.sleep(Duration.infinity)),
          Stream.timeout(Duration.zero),
          Stream.runCollect
        )
        deepStrictEqual(result, [])
      }))
  })

  describe("when", () => {
    it.effect("when - returns the stream if the condition is satisfied", () =>
      Effect.gen(function*() {
        const stream = Stream.make(1, 2, 3, 4, 5)
        const { result1, result2 } = yield* (Effect.all({
          result1: pipe(stream, Stream.when(Effect.succeed(true)), Stream.runCollect),
          result2: Stream.runCollect(stream)
        }))
        deepStrictEqual(result1, result2)
      }))

    it.effect("when - returns an empty stream if the condition is not satisfied", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.make(1, 2, 3, 4, 5),
          Stream.when(Effect.succeed(false)),
          Stream.runCollect
        )
        deepStrictEqual(result, [])
      }))

    it.effect("when - dies if the condition throws an exception", () =>
      Effect.gen(function*() {
        const error = "boom"
        const result = yield* pipe(
          Stream.make(1, 2, 3),
          Stream.when(Effect.sync(() => {
            throw error
          })),
          Stream.runDrain,
          Effect.exit
        )
        deepStrictEqual(result, Exit.die(error))
      }))

    it.effect("when - returns the stream if the effectful condition is satisfied", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.make(1, 2, 3, 4, 5),
          Stream.when(Effect.succeed(true)),
          Stream.runCollect
        )
        deepStrictEqual(result, [1, 2, 3, 4, 5])
      }))

    it.effect("when - returns an empty stream if the effectful condition is not satisfied", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.make(1, 2, 3, 4, 5),
          Stream.when(Effect.succeed(false)),
          Stream.runCollect
        )
        deepStrictEqual(result, [])
      }))

    it.effect("when - fails if the effectful condition fails", () =>
      Effect.gen(function*() {
        const error = "boom"
        const result = yield* pipe(
          Stream.make(1, 2, 3),
          Stream.when(Effect.fail(error)),
          Stream.runDrain,
          Effect.exit
        )
        deepStrictEqual(result, Exit.fail(error))
      }))
  })

  describe("zipWithNext", () => {
    it.effect("zipWithNext", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.make(1, 2, 3),
          Stream.zipWithNext,
          Stream.runCollect
        )
        deepStrictEqual(result, [
          [1, Option.some(2)],
          [2, Option.some(3)],
          [3, Option.none()]
        ])
      }))

    it.effect("zipWithNext - should work with multiple chunks", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.fromArrays([1], [2], [3]),
          Stream.zipWithNext,
          Stream.runCollect
        )
        deepStrictEqual(result, [
          [1, Option.some(2)],
          [2, Option.some(3)],
          [3, Option.none()]
        ])
      }))

    it.effect("zipWithNext - should work with an empty stream", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.empty,
          Stream.zipWithNext,
          Stream.runCollect
        )
        deepStrictEqual(result, [])
      }))

    it.effect("zipWithPrevious - should zip with previous element for a single chunk", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.make(1, 2, 3),
          Stream.zipWithPrevious,
          Stream.runCollect
        )
        deepStrictEqual(result, [
          [Option.none(), 1],
          [Option.some(1), 2],
          [Option.some(2), 3]
        ])
      }))

    it.effect("zipWithPrevious - should work with multiple chunks", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.fromArrays([1], [2], [3]),
          Stream.zipWithPrevious,
          Stream.runCollect
        )
        deepStrictEqual(result, [
          [Option.none(), 1],
          [Option.some(1), 2],
          [Option.some(2), 3]
        ])
      }))

    it.effect("zipWithPrevious - should work with an empty stream", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.empty,
          Stream.zipWithPrevious,
          Stream.runCollect
        )
        deepStrictEqual(result, [])
      }))

    it("zipWithPrevious - should output same values as first element plus zipping with init", () =>
      fc.assert(fc.asyncProperty(fc.array(fc.array(fc.integer())), async (chunks) => {
        const stream = Stream.fromArrays(...chunks)
        const { result1, result2 } = await Effect.runPromise(Effect.all({
          result1: pipe(
            stream,
            Stream.zipWithPrevious,
            Stream.runCollect
          ),
          result2: pipe(
            Stream.make(Option.none()),
            Stream.concat(pipe(stream, Stream.map(Option.some))),
            Stream.zip(stream),
            Stream.runCollect
          )
        }))
        deepStrictEqual(result1, result2)
      })))

    it.effect("zipWithPreviousAndNext", () =>
      Effect.gen(function*() {
        const result = yield* pipe(
          Stream.make(1, 2, 3),
          Stream.zipWithPreviousAndNext,
          Stream.runCollect
        )
        deepStrictEqual(result, [
          [Option.none(), 1, Option.some(2)],
          [Option.some(1), 2, Option.some(3)],
          [Option.some(2), 3, Option.none()]
        ])
      }))

    it("zipWithPreviousAndNext - should output same values as zipping with both previous and next element", () =>
      fc.assert(fc.asyncProperty(fc.array(fc.array(fc.integer()), { minLength: 0, maxLength: 5 }), async (chunks) => {
        const stream = Stream.fromArrays(...chunks)
        const previous = pipe(
          Stream.make(Option.none()),
          Stream.concat(pipe(stream, Stream.map(Option.some)))
        )
        const next = pipe(
          stream,
          Stream.drop(1),
          Stream.map(Option.some),
          Stream.concat(Stream.make(Option.none()))
        )
        const { result1, result2 } = await pipe(
          Effect.all({
            result1: pipe(
              stream,
              Stream.zipWithPreviousAndNext,
              Stream.runCollect
            ),
            result2: pipe(
              previous,
              Stream.zip(stream),
              Stream.zipFlatten(next),
              Stream.runCollect
            )
          }),
          Effect.runPromise
        )
        deepStrictEqual(result1, result2)
      })))
  })

  describe("broadcast", () => {
    it.effect("ends a subscriber that subscribes after the upstream has ended", () =>
      Effect.gen(function*() {
        const stream = yield* Stream.broadcast(Stream.fromArrays([1], [2], [3]), { capacity: 8, replay: 2 })
        yield* Stream.runDrain(stream)

        deepStrictEqual(yield* Stream.runCollect(stream), [2, 3])
      }))

    it.effect("fails a subscriber that subscribes after the upstream has failed", () =>
      Effect.gen(function*() {
        const stream = yield* Stream.broadcast(Stream.fail("boom"), { capacity: 8 })
        yield* Effect.exit(Stream.runDrain(stream))

        deepStrictEqual(yield* Effect.exit(Stream.runCollect(stream)), Exit.fail("boom"))
      }))
  })

  describe("broadcastN", () => {
    it.effect("normalizes the number of downstream streams", () =>
      Effect.gen(function*() {
        const results = yield* Effect.forEach([Number.NaN, -1, 0.5, 1.9, 2.9], (n) =>
          Stream.empty.pipe(
            Stream.broadcastN({ n, capacity: 1 }),
            Effect.map((streams) => streams.length)
          ))
        assert.deepStrictEqual(results, [0, 0, 0, 1, 2])
      }))

    it.effect("fans out to a fixed number of streams", () =>
      Effect.gen(function*() {
        const [left, right] = yield* Stream.make(1, 2, 3).pipe(
          Stream.broadcastN({ n: 2, capacity: 4 })
        )

        const result = yield* Effect.all([
          Stream.runCollect(left),
          Stream.runCollect(right)
        ], { concurrency: "unbounded" })

        assert.deepStrictEqual(result, [[1, 2, 3], [1, 2, 3]])
      }))

    it.effect("ends a subscriber whose end a full dropping buffer would have dropped", () =>
      Effect.gen(function*() {
        const [stream] = yield* Stream.broadcastN(Stream.make(1, 2, 3), { n: 1, capacity: 1, strategy: "dropping" })
        // Let the upstream fill the single slot and end before the subscriber pulls.
        yield* Effect.yieldNow

        deepStrictEqual(yield* Stream.runCollect(stream), [1, 2, 3])
      }))

    it.effect("propagates failures to all downstream streams", () =>
      Effect.gen(function*() {
        const [left, right] = yield* Stream.fail("boom").pipe(
          Stream.broadcastN({ n: 2, capacity: 4 })
        )

        const result = yield* Effect.all([
          Stream.runCollect(left).pipe(Effect.exit),
          Stream.runCollect(right).pipe(Effect.exit)
        ], { concurrency: "unbounded" })

        assert.deepStrictEqual(result, [Exit.fail("boom"), Exit.fail("boom")])
      }))
  })

  describe("fromEventListener", () => {
    it.effect("subscribes and emits events", () =>
      Effect.gen(function*() {
        const target = new EventTarget()

        const dispatchEvents = Effect.gen(function*() {
          yield* Effect.yieldNow
          target.dispatchEvent(new CustomEvent("test", { detail: 1 }))
          target.dispatchEvent(new CustomEvent("test", { detail: 2 }))
          target.dispatchEvent(new CustomEvent("test", { detail: 3 }))
          target.dispatchEvent(new CustomEvent("test", { detail: 4 }))
        })

        const stream = Stream.fromEventListener<CustomEvent>(target, "test")

        const [result] = yield* Effect.all([
          stream.pipe(
            Stream.map((event) => event.detail),
            // take is required because the stream will never terminate on its own
            Stream.take(4),
            Stream.runCollect
          ),
          dispatchEvents
        ], { concurrency: "unbounded" })

        assert.deepStrictEqual(result, [1, 2, 3, 4])
      }))

    it.effect("ends after the first event with once: true", () =>
      Effect.gen(function*() {
        const target = new EventTarget()

        const dispatchEvents = Effect.gen(function*() {
          yield* Effect.yieldNow
          target.dispatchEvent(new CustomEvent("test", { detail: 1 }))
          target.dispatchEvent(new CustomEvent("test", { detail: 2 }))
        })

        const stream = Stream.fromEventListener<CustomEvent>(target, "test", { once: true })

        const [result] = yield* Effect.all([
          stream.pipe(
            Stream.map((event) => event.detail),
            Stream.runCollect
          ),
          dispatchEvents
        ], { concurrency: "unbounded" })

        assert.deepStrictEqual(result, [1])
      }))
  })
})

const grouped = <A>(arr: Array<A>, size: number): Array<NonEmptyArray<A>> => {
  const builder: Array<NonEmptyArray<A>> = []
  for (let i = 0; i < arr.length; i = i + size) {
    builder.push(arr.slice(i, i + size) as NonEmptyArray<A>)
  }
  return builder
}
