import { assert, describe, it } from "@effect/vitest"
import { assertExitFailure, assertFailure, assertTrue } from "@effect/vitest/utils"
import { Cause, Data, Deferred, pipe, Ref } from "effect"
import * as Arr from "effect/Array"
import * as Channel from "effect/Channel"
import * as Chunk from "effect/Chunk"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Filter from "effect/Filter"
import * as Latch from "effect/Latch"
import * as Queue from "effect/Queue"
import * as Result from "effect/Result"
import * as Schedule from "effect/Schedule"
import * as Scheduler from "effect/Scheduler"
import * as Stream from "effect/Stream"

describe("Channel", () => {
  describe("repetition", () => {
    for (const kind of ["repeat", "forever"] as const) {
      const repeated = (source: Channel.Channel<Arr.NonEmptyArray<number>>) =>
        kind === "repeat" ? Channel.repeat(source, Schedule.forever) : Channel.forever(source)

      it.effect(kind + " work per repetition does not grow", () =>
        Effect.gen(function*() {
          const stream = Stream.fromChannel(repeated(Channel.succeed(Arr.make(1))))
          const ops = (n: number) => countOps(stream.pipe(Stream.take(n), Stream.runDrain))
          const small = yield* ops(1_000)
          const large = yield* ops(2_000)
          assert.isBelow(large / small, 2.5)
        }))
    }
  })

  describe("constructors", () => {
    it.effect("empty", () =>
      Effect.gen(function*() {
        const result = yield* Channel.empty.pipe(
          Channel.runCollect
        )
        assert.deepStrictEqual(result, [])
      }))

    it.effect("succeed", () =>
      Effect.gen(function*() {
        const result = yield* Channel.succeed(1).pipe(
          Channel.runCollect
        )
        assert.deepStrictEqual(result, [1])
      }))

    it.effect("sync", () =>
      Effect.gen(function*() {
        const result = yield* Channel.sync(() => 1).pipe(
          Channel.runCollect
        )
        assert.deepStrictEqual(result, [1])
      }))

    it.effect("end", () =>
      Effect.gen(function*() {
        let result = 0
        yield* Channel.end(42).pipe(
          Channel.mapDone((n) => {
            result = n
          }),
          Channel.runDrain
        )
        assert.strictEqual(result, 42)
      }))

    it.effect("endSync", () =>
      Effect.gen(function*() {
        let result = 0
        yield* Channel.endSync(() => 42).pipe(
          Channel.mapDone((n) => {
            result = n
          }),
          Channel.runDrain
        )
        assert.strictEqual(result, 42)
      }))

    it.effect("fromArray", () =>
      Effect.gen(function*() {
        const array = [0, 1, 2, 3, 4]
        const result = yield* Channel.runCollect(Channel.fromArray(array))
        assert.deepStrictEqual(result, array)
      }))

    it.effect("fromChunk", () =>
      Effect.gen(function*() {
        const chunk = Chunk.fromArrayUnsafe([0, 1, 2, 3, 4])
        const result = yield* Channel.runCollect(Channel.fromChunk(chunk))
        assert.deepStrictEqual(result, Chunk.toArray(chunk))
      }))

    it.effect("fromIterator", () =>
      Effect.gen(function*() {
        const result = yield* Channel.fromIterator(() => ({
          n: 0,
          next(this: { n: number }) {
            return this.n === 5
              ? { done: true, value: this.n }
              : { done: false, value: this.n++ }
          }
        })).pipe(Channel.runCollect)
        assert.deepStrictEqual(result, [0, 1, 2, 3, 4])
      }))

    it.effect("fromIteratorArray", () =>
      Effect.gen(function*() {
        function* fibonacci(): Generator<number, void, unknown> {
          let a = 0, b = 1
          for (let i = 0; i < 5; i++) {
            yield a
            ;[a, b] = [b, a + b]
          }
        }
        const result = yield* Channel.runCollect(
          Channel.fromIteratorArray(() => fibonacci(), 3)
        )
        assert.deepStrictEqual(result, [[0, 1, 1], [2, 3]])
      }))

    it.effect("fromIteratorArray - normalizes the chunk size", () =>
      Effect.gen(function*() {
        const results = yield* Effect.forEach([Number.NaN, -1, 0.5, 1.9], (chunkSize) =>
          Channel.fromIteratorArray(() =>
            [1, 2, 3][Symbol.iterator](), chunkSize).pipe(
              Channel.runCollect
            ))
        assert.deepStrictEqual(results, [
          [[1], [2], [3]],
          [[1], [2], [3]],
          [[1], [2], [3]],
          [[1], [2], [3]]
        ])
      }))

    it.effect("fromIterable", () =>
      Effect.gen(function*() {
        const set = new Set([1, 1, 2, 3])
        const result = yield* Channel.runCollect(Channel.fromIterable(set))
        assert.deepStrictEqual(result, [1, 2, 3])
      }))

    it.effect("fromIterableArray", () =>
      Effect.gen(function*() {
        const numbers = [1, 2, 3, 4, 5]
        const result = yield* Channel.runCollect(Channel.fromIterableArray(numbers))
        const resultChunked = yield* Channel.runCollect(Channel.fromIterableArray(numbers, 4))
        assert.deepStrictEqual(result, [[1, 2, 3, 4, 5]])
        assert.deepStrictEqual(resultChunked, [[1, 2, 3, 4], [5]])
      }))

    it.effect("fromIterableArray - normalizes the chunk size", () =>
      Effect.gen(function*() {
        const results = yield* Effect.forEach([Number.NaN, 0, 2.9], (chunkSize) =>
          Channel.runCollect(Channel.fromIterableArray([1, 2, 3], chunkSize)))
        assert.deepStrictEqual(results, [
          [[1], [2], [3]],
          [[1], [2], [3]],
          [[1, 2], [3]]
        ])
      }))

    it.effect("fromReadableStream", () =>
      Effect.gen(function*() {
        const result = yield* Channel.fromReadableStream({
          evaluate: () =>
            new ReadableStream<number>({
              start(controller) {
                controller.enqueue(1)
                controller.enqueue(2)
                controller.close()
              }
            }),
          onError: (error) => error
        }).pipe(Channel.runCollect)

        assert.deepStrictEqual(result, [[1], [2]])
      }))

    it.effect("fromTransformStream - surfaces write-side errors through the read side", () =>
      Effect.gen(function*() {
        const error = new Error("write failed")
        const channel = Channel.fromTransformStream<never, number, number, Error>({
          evaluate: () =>
            new TransformStream<number, number>({
              transform() {
                throw error
              }
            }),
          onError: (cause) => cause as Error
        })
        const exit = yield* Channel.fromArray([[1] as [number]]).pipe(
          Channel.pipeTo(channel),
          Channel.runDrain,
          Effect.exit
        )

        assertExitFailure(exit, Cause.fail(error))
      }))

    it.effect("acquireRelease", () =>
      Effect.gen(function*() {
        const acquired = yield* Ref.make(false)
        const released = yield* Ref.make(false)
        yield* Channel.acquireRelease(
          Ref.set(acquired, true),
          () => Ref.set(released, true)
        ).pipe(Channel.runDrain)
        assert.isTrue(yield* Ref.get(acquired))
        assert.isTrue(yield* Ref.get(released))
      }))

    it.effect("acquireUseRelease combines usage and release failures", () =>
      Effect.gen(function*() {
        const result = yield* Channel.acquireUseRelease(
          Effect.void,
          () => Channel.fail("usage failure"),
          () => Effect.die("release failure")
        ).pipe(Channel.runDrain, Effect.exit)
        assert.deepStrictEqual(
          result,
          Exit.failCause(Cause.combine(Cause.fail("usage failure"), Cause.die("release failure")))
        )
      }))

    it.effect("acquireUseRelease surfaces release failure after successful usage", () =>
      Effect.gen(function*() {
        const result = yield* Channel.acquireUseRelease(
          Effect.void,
          () => Channel.succeed(1),
          () => Effect.die("release failure")
        ).pipe(Channel.runDrain, Effect.exit)
        assert.deepStrictEqual(result, Exit.die("release failure"))
      }))
  })

  describe("destructors", () => {
    it.effect("runDrain returns the done value after emitted elements", () =>
      Effect.gen(function*() {
        const result = yield* Channel.fromArray([1]).pipe(
          Channel.concat(Channel.end("done")),
          Channel.runDrain
        )

        assert.strictEqual(result, "done")
      }))

    it.effect("mkUint8Array", () =>
      Effect.gen(function*() {
        const bytes = yield* Channel.fromArray(
          [
            [new Uint8Array([1, 2])],
            [new Uint8Array([3]), new Uint8Array([4, 5])]
          ] as const
        ).pipe(Channel.mkUint8Array)

        assert.deepStrictEqual(bytes, new Uint8Array([1, 2, 3, 4, 5]))
      }))
  })

  describe("mapping", () => {
    it.effect("map", () =>
      Effect.gen(function*() {
        const result = yield* Channel.fromArray([1, 2, 3]).pipe(
          Channel.map((n) => n + 1),
          Channel.runCollect
        )
        assert.deepStrictEqual(result, [2, 3, 4])
      }))

    it.effect("mapEffect interrupts the running effect when the channel is interrupted", () =>
      Effect.gen(function*() {
        let interrupted = false
        const latch = yield* Latch.make(false)
        const fiber = yield* Channel.succeed(1).pipe(
          Channel.mapEffect(() =>
            latch.open.pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() =>
                Effect.sync(() => {
                  interrupted = true
                })
              )
            ), { concurrency: 2 }),
          Channel.runDrain,
          Effect.forkChild
        )
        yield* Fiber.interrupt(fiber).pipe(latch.whenOpen)
        assert.isTrue(interrupted)
      }))

    it.effect("mapEffect - interrupts pending tasks on failure", () =>
      Effect.gen(function*() {
        let interrupts = 0
        const latch1 = yield* Latch.make(false)
        const latch2 = yield* Latch.make(false)
        const result = yield* Channel.fromArray([1, 2, 3]).pipe(
          Channel.mapEffect((n) => {
            if (n === 1) {
              return latch1.open.pipe(
                Effect.andThen(Effect.never),
                Effect.onInterrupt(() =>
                  Effect.sync(() => {
                    interrupts++
                  })
                )
              )
            }
            if (n === 2) {
              return latch2.open.pipe(
                Effect.andThen(Effect.never),
                Effect.onInterrupt(() =>
                  Effect.sync(() => {
                    interrupts++
                  })
                )
              )
            }
            return Effect.fail("boom").pipe(
              latch1.whenOpen,
              latch2.whenOpen
            )
          }, { concurrency: 3 }),
          Channel.runDrain,
          Effect.exit
        )
        assert.strictEqual(interrupts, 2)
        assert.deepStrictEqual(result, Exit.fail("boom"))
      }))
  })

  describe("filtering", () => {
    it.effect("filterMap with Filter", () =>
      Effect.gen(function*() {
        const filter = Filter.make((n: number) => n % 2 === 0 ? Result.succeed(n * 2) : Result.fail(n))
        const result = yield* Channel.fromArray([1, 2, 3, 4]).pipe(
          Channel.filterMap(filter),
          Channel.runCollect
        )
        assert.deepStrictEqual(result, [4, 8])
      }))

    it.effect("filterMapEffect with FilterEffect", () =>
      Effect.gen(function*() {
        const filter = Filter.makeEffect((n: number) => Effect.succeed(n > 2 ? Result.succeed(n + 1) : Result.fail(n)))
        const result = yield* Channel.fromArray([1, 2, 3, 4]).pipe(
          Channel.filterMapEffect(filter),
          Channel.runCollect
        )
        assert.deepStrictEqual(result, [4, 5])
      }))
  })

  describe("encoding", () => {
    it.effect("decodeText handles multi-byte characters split across Uint8Array boundaries", () =>
      Effect.gen(function*() {
        const bytes = new TextEncoder().encode("a🌍b")
        const chunks: ReadonlyArray<readonly [Uint8Array, ...ReadonlyArray<Uint8Array>]> = [
          [bytes.slice(0, 2)],
          [bytes.slice(2, 4), bytes.slice(4)]
        ]
        const result = yield* Channel.fromArray(chunks).pipe(
          Channel.pipeTo(Channel.decodeText()),
          Channel.runCollect
        )
        assert.strictEqual(result.flat().join(""), "a🌍b")
      }))
  })

  describe("merging", () => {
    it.effect("merge - interrupts left side if halt strategy is set to 'right'", () =>
      Effect.gen(function*() {
        const latch = yield* Latch.make(false)
        const leftQueue = yield* Queue.make<number, Cause.Done>()
        const rightQueue = yield* Queue.make<number>()
        const left = Channel.fromQueue(rightQueue)
        const right = Channel.fromQueue(leftQueue).pipe(
          Channel.ensuring(latch.open)
        )
        const fiber = yield* Channel.merge(left, right, {
          haltStrategy: "right"
        }).pipe(Channel.runCollect, Effect.forkChild)
        yield* Queue.offerAll(leftQueue, [1, 2])
        yield* Queue.end(leftQueue)
        yield* latch.await
        yield* Queue.offerAll(rightQueue, [3, 4])
        const result = yield* Fiber.join(fiber)
        assert.deepStrictEqual(result, [1, 2])
      }))

    it.effect("merge - interrupts right side if halt strategy is set to 'left'", () =>
      Effect.gen(function*() {
        const latch = yield* Latch.make(false)
        const leftQueue = yield* Queue.make<number, Cause.Done>()
        const rightQueue = yield* Queue.make<number>()
        const left = Channel.fromQueue(leftQueue).pipe(
          Channel.ensuring(latch.open)
        )
        const right = Channel.fromQueue(rightQueue)
        const fiber = yield* Channel.merge(left, right, {
          haltStrategy: "left"
        }).pipe(Channel.runCollect, Effect.forkChild)
        yield* Queue.offerAll(leftQueue, [1, 2])
        yield* Queue.end(leftQueue)
        yield* latch.await
        yield* Queue.offerAll(rightQueue, [3, 4])
        const result = yield* Fiber.join(fiber)
        assert.deepStrictEqual(result, [1, 2])
      }))

    it.effect("merge - interrupts losing side if halt strategy is set to 'either'", () =>
      Effect.gen(function*() {
        const left = Channel.fromEffect(Effect.never)
        const right = Channel.succeed(1)
        const result = yield* Channel.merge(left, right, {
          haltStrategy: "either"
        }).pipe(Channel.runCollect)
        assert.deepStrictEqual(result, [1])
      }))

    it.effect("merge - waits for both sides if halt strategy is set to 'both'", () =>
      Effect.gen(function*() {
        const left = Channel.succeed(1)
        const right = Channel.succeed(2)
        const result = yield* Channel.merge(left, right, {
          haltStrategy: "both"
        }).pipe(Channel.runCollect)
        assert.deepStrictEqual(result, [1, 2])
      }))

    it.effect("merge - prioritizes failure", () =>
      Effect.gen(function*() {
        const left = Channel.fromEffect(Effect.fail("boom"))
        const right = Channel.fromEffect(Effect.never)
        const result = yield* Channel.merge(left, right).pipe(
          Channel.runCollect,
          Effect.exit
        )
        assert.deepStrictEqual(result, Exit.fail("boom"))
      }))
  })

  describe("switchMap", () => {
    it.effect("interrupts previous channels and runs their finalizers", () =>
      Effect.gen(function*() {
        const result = yield* Channel.fromIterable([1, 2, 3]).pipe(
          Channel.switchMap((n) => n === 3 ? Channel.empty : Channel.never),
          Channel.runDrain
        )
        assert.isUndefined(result)
      }))
  })

  describe("interruptWhen", () => {
    it.effect("interrupts the current element", () =>
      Effect.gen(function*() {
        const interrupted = yield* Ref.make(false)
        const latch = yield* Deferred.make<void>()
        const halt = yield* Deferred.make<void>()
        const started = yield* Deferred.make<void>()
        const channel = Deferred.succeed(started, void 0).pipe(
          Effect.andThen(Deferred.await(latch)),
          Effect.onInterrupt(() => Ref.set(interrupted, true)),
          Channel.fromEffect,
          Channel.interruptWhen(Deferred.await(halt))
        )
        const fiber = yield* Effect.forkChild(Channel.runDrain(channel))
        yield* pipe(
          Deferred.await(started),
          Effect.andThen(Deferred.succeed(halt, void 0))
        )
        yield* Fiber.await(fiber)
        const result = yield* Ref.get(interrupted)
        assertTrue(result)
      }))

    it.effect("interruptWhen - propagates errors", () =>
      Effect.gen(function*() {
        const deferred = yield* Deferred.make<never, string>()
        const channel = Channel.fromEffect(Effect.never).pipe(
          Channel.interruptWhen(Deferred.await(deferred))
        )
        yield* Deferred.fail(deferred, "fail")
        const result = yield* Effect.result(Channel.runDrain(channel))
        assertFailure(result, "fail")
      }))
  })

  describe("conditional catch", () => {
    class HttpError extends Data.TaggedError("HttpError")<{
      readonly message: string
    }> {}

    class ValidationError extends Data.TaggedError("ValidationError")<{
      readonly field: string
    }> {}

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

    it.effect("catchDefect", () =>
      Effect.gen(function*() {
        const defect = new Error("boom")
        const recovered = yield* Channel.fromEffect(Effect.die(defect)).pipe(
          Channel.catchDefect((caught) => Channel.succeed(caught)),
          Channel.runCollect
        )
        const failed = yield* Channel.fail("failure").pipe(
          Channel.catchDefect(() => Channel.succeed("recovered")),
          Channel.runCollect,
          Effect.exit
        )
        assert.deepStrictEqual(recovered, [defect])
        assertExitFailure(failed, Cause.fail("failure"))
      }))

    it.effect("catchIf with refinement", () =>
      Effect.gen(function*() {
        const exit = yield* (Channel.fail(new ValidationError({ field: "email" })) as Channel.Channel<
          never,
          HttpError | ValidationError,
          never
        >).pipe(
          Channel.catchIf(
            (error): error is HttpError => error._tag === "HttpError",
            () => Channel.succeed("http")
          ),
          Channel.runCollect,
          Effect.exit
        )
        assertExitFailure(exit, Cause.fail(new ValidationError({ field: "email" })))
      }))

    it.effect("catchIf with predicate", () =>
      Effect.gen(function*() {
        const result = yield* Channel.fail("boom").pipe(
          Channel.catchIf((error) => error === "boom", (error) => Channel.succeed(`recovered: ${error}`)),
          Channel.runCollect
        )
        assert.deepStrictEqual(result, ["recovered: boom"])
      }))

    it.effect("catchFilter with Filter", () =>
      Effect.gen(function*() {
        const filter = Filter.make((error: string) =>
          error === "boom"
            ? Result.succeed(error)
            : Result.fail(error)
        )
        const result = yield* Channel.fail("boom").pipe(
          Channel.catchFilter(filter, (error) => Channel.succeed(`recovered: ${error}`)),
          Channel.runCollect
        )
        assert.deepStrictEqual(result, ["recovered: boom"])
      }))

    it.effect("catchCauseFilter with Filter", () =>
      Effect.gen(function*() {
        const result = yield* Channel.fail("boom").pipe(
          Channel.catchCauseFilter(
            Cause.findError as any,
            (error) => Channel.succeed(`recovered: ${error}`)
          ),
          Channel.runCollect
        )
        assert.deepStrictEqual(result, ["recovered: boom"])
      }))

    it.effect("catchTag orElse", () =>
      Effect.gen(function*() {
        const result = yield* Channel.catchTag(
          Channel.fail(new ValidationError({ field: "email" })) as Channel.Channel<
            never,
            HttpError | ValidationError,
            never
          >,
          "HttpError",
          () => Channel.succeed("http"),
          () => Channel.succeed("fallback")
        )
          .pipe(Channel.runCollect)
        assert.deepStrictEqual(result, ["fallback"])
      }))

    it.effect("catchReason orElse", () =>
      Effect.gen(function*() {
        const result = yield* Channel.fail(
          new AiError({ reason: new QuotaExceededError({ limit: 100 }) })
        ).pipe(
          Channel.catchReason(
            "AiError",
            "RateLimitError",
            (reason) => Channel.succeed(`retry: ${reason.retryAfter}`),
            (reason) => Channel.succeed(`quota: ${reason.limit}`)
          ),
          Channel.runCollect
        )
        assert.deepStrictEqual(result, ["quota: 100"])
      }))

    it.effect("catchReason ignores non-matching parent tag", () =>
      Effect.gen(function*() {
        const error = new OtherError({ message: "test" })
        const exit = yield* (Channel.fail(error) as Channel.Channel<never, AiError | OtherError, never>).pipe(
          Channel.catchReason(
            "AiError",
            "RateLimitError",
            () => Channel.succeed("no"),
            () => Channel.succeed("orElse")
          ),
          Channel.runCollect,
          Effect.exit
        )
        assertExitFailure(exit, Cause.fail(error))
      }))

    it.effect("catchReasons orElse", () =>
      Effect.gen(function*() {
        const result = yield* Channel.fail(
          new AiError({ reason: new RateLimitError({ retryAfter: 60 }) })
        ).pipe(
          Channel.catchReasons(
            "AiError",
            {
              QuotaExceededError: (reason) => Channel.succeed(`quota: ${reason.limit}`)
            },
            (reason) => Channel.succeed(`fallback: ${reason._tag}`)
          ),
          Channel.runCollect
        )
        assert.deepStrictEqual(result, ["fallback: RateLimitError"])
      }))
  })

  describe("unwrapReason", () => {
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

    it.effect("extracts reason into error channel", () =>
      Effect.gen(function*() {
        const reason = new RateLimitError({ retryAfter: 60 })
        const exit = yield* Channel.fail(new AiError({ reason })).pipe(
          Channel.unwrapReason("AiError"),
          Channel.runDrain,
          Effect.exit
        )
        assertExitFailure(exit, Cause.fail(reason))
      }))

    it.effect("extracts second reason type", () =>
      Effect.gen(function*() {
        const reason = new QuotaExceededError({ limit: 100 })
        const exit = yield* Channel.fail(new AiError({ reason })).pipe(
          Channel.unwrapReason("AiError"),
          Channel.runDrain,
          Effect.exit
        )
        assertExitFailure(exit, Cause.fail(reason))
      }))

    it.effect("preserves other errors", () =>
      Effect.gen(function*() {
        const error = new OtherError({ message: "test" })
        const exit = yield* (Channel.fail(error) as Channel.Channel<never, AiError | OtherError, never>).pipe(
          Channel.unwrapReason("AiError"),
          Channel.runDrain,
          Effect.exit
        )
        assertExitFailure(exit, Cause.fail(error))
      }))
  })
})

// The scheduler is asked whether to yield once for each fiber run-loop operation.
const countOps = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<number, E> =>
  Effect.suspend(() => {
    let ops = 0
    const scheduler: Scheduler.Scheduler = {
      executionMode: "sync",
      makeDispatcher: () => new Scheduler.MixedScheduler("sync").makeDispatcher(),
      shouldYield: () => {
        ops++
        return false
      }
    }
    return Effect.map(Effect.provideService(effect, Scheduler.Scheduler, scheduler), () => ops)
  })
