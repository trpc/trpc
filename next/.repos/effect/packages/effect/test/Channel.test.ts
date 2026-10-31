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
    const source = Channel.succeed(Arr.make(1))
    for (
      const [kind, channel] of Object.entries({
        repeat: Channel.repeat(source, Schedule.forever),
        forever: Channel.forever(source),
        retry: Channel.retry(Channel.concat(source, Channel.fail("boom")), Schedule.forever)
      })
    ) {
      it.effect(kind + " work per repetition does not grow", () =>
        Effect.gen(function*() {
          const stream = Stream.fromChannel(channel)
          const ops = (n: number) => countOps(stream.pipe(Stream.take(n), Stream.runDrain))
          const small = yield* ops(1_000)
          const large = yield* ops(2_000)
          assert.isBelow(large / small, 2.5)
        }))
    }

    it.effect("retry closes schedule resources with the channel", () =>
      Effect.gen(function*() {
        const events: Array<string> = []
        let attempts = 0
        const flaky = Channel.suspend(() => {
          if (attempts++ === 0) return Channel.fail("boom")
          events.push("second attempt")
          return Channel.succeed(1)
        })
        const schedule = Schedule.tap(
          Schedule.forever,
          () => Effect.addFinalizer(() => Effect.sync(() => events.push("schedule finalizer")))
        )
        const result = yield* Channel.runCollect(Channel.retry(flaky, schedule))
        events.push("run completed")
        assert.deepStrictEqual(result, [1])
        assert.deepStrictEqual(events, ["second attempt", "schedule finalizer", "run completed"])
      }))
  })

  describe("constructors", () => {
    it.live("fromAsyncIterable awaits idle iterator cleanup on early close", () =>
      Effect.gen(function*() {
        let finalized = false
        async function* source() {
          try {
            yield [1] as const
            yield [2] as const
          } finally {
            await new Promise((resolve) => setTimeout(resolve, 10))
            finalized = true
          }
        }
        yield* Channel.fromAsyncIterable(source(), (error) => error).pipe(
          Stream.fromChannel,
          Stream.take(1),
          Stream.runDrain
        )
        assert.strictEqual(finalized, true)
      }))

    for (
      const [name, constructor] of [["callback", Channel.callback], ["callbackArray", Channel.callbackArray]] as const
    ) {
      it.live(`${name} propagates registration effect failures`, () =>
        Effect.gen(function*() {
          const exit = yield* constructor(() => Effect.fail("setup failed")).pipe(
            Channel.runDrain,
            Effect.timeout("500 millis"),
            Effect.exit
          )
          assert.deepStrictEqual(exit, Exit.fail("setup failed"))
        }))
    }

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

    it.effect("fromReadableStream - surfaces cancellation failures and releases the lock", () =>
      Effect.gen(function*() {
        const error = new Error("cancel failed")
        const readable = new ReadableStream<number>({
          start(controller) {
            controller.enqueue(1)
          },
          cancel() {
            return Promise.reject(error)
          }
        })
        const exit = yield* Channel.fromReadableStream({
          evaluate: () => readable,
          onError: (error) => error
        }).pipe(
          Channel.mapEffect(() => Effect.fail("downstream failed")),
          Channel.runDrain,
          Effect.exit
        )

        assertExitFailure(exit, Cause.combine(Cause.die("downstream failed"), Cause.die(error)))
        assert.isFalse(readable.locked)
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

    it.effect("fromTransformStream - preserves upstream errors while a read is pending", () =>
      Effect.gen(function*() {
        const channel = Channel.fromTransformStream<string, number, number, Error>({
          evaluate: () => new TransformStream<number, number>(),
          onError: () => new Error("transform failed")
        })
        const exit = yield* Channel.fail("upstream failed").pipe(
          Channel.pipeTo(channel),
          Channel.runDrain,
          Effect.exit
        )

        assertExitFailure(exit, Cause.fail("upstream failed"))
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

    it.effect("acquireUseRelease releases resource when interrupted during acquisition", () =>
      Effect.gen(function*() {
        const started = yield* Deferred.make<void>()
        const gate = yield* Deferred.make<void>()
        const released: Array<number> = []
        const acquire = Effect.gen(function*() {
          yield* Deferred.succeed(started, undefined)
          yield* Deferred.await(gate)
          return 1
        })
        const fiber = yield* Effect.forkChild(Channel.runDrain(Channel.acquireUseRelease(
          acquire,
          () => Channel.never,
          (resource) =>
            Effect.sync(() => {
              released.push(resource)
            })
        )))
        yield* Deferred.await(started)
        yield* Effect.forkChild(Fiber.interrupt(fiber), { startImmediately: true })
        yield* Deferred.succeed(gate, undefined)
        const exit = yield* Fiber.await(fiber)
        assert.isTrue(Exit.hasInterrupts(exit))
        assert.deepStrictEqual(released, [1])
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
          Exit.failCause(Cause.combine(Cause.die("usage failure"), Cause.die("release failure")))
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

    it.effect("decodeText decodes a truncated character at the end of the input", () =>
      Effect.gen(function*() {
        const result = yield* Channel.fromArray([[Uint8Array.of(0xC3)]] as const).pipe(
          Channel.pipeTo(Channel.decodeText()),
          Channel.runCollect
        )
        assert.strictEqual(result.flat().join(""), "\uFFFD")
      }))

    it.effect("decodeText dies on a truncated final character with fatal enabled", () =>
      Effect.gen(function*() {
        const exit = yield* Channel.fromArray([[Uint8Array.of(0xC3)]] as const).pipe(
          Channel.pipeTo(Channel.decodeText(undefined, { fatal: true })),
          Channel.runCollect,
          Effect.exit
        )
        assert.isTrue(Exit.hasDies(exit))
      }))
  })

  describe("merging", () => {
    for (const kind of ["mergeAll", "concurrent flatMap"] as const) {
      const flatten = <E>(inner: Channel.Channel<number, E>) =>
        kind === "mergeAll"
          ? Channel.succeed(inner).pipe(Channel.mergeAll({ concurrency: 1 }))
          : Channel.succeed(1).pipe(Channel.flatMap(() => inner, { concurrency: 2 }))

      it.effect(`${kind} surfaces inner release failure after successful usage`, () =>
        Effect.gen(function*() {
          const inner = Channel.acquireRelease(Effect.succeed(1), () => Effect.die("release failure"))
          const result = yield* flatten(inner).pipe(Channel.runCollect, Effect.exit)
          assert.deepStrictEqual(result, Exit.die("release failure"))
        }))

      it.effect(`${kind} combines inner usage and release failures`, () =>
        Effect.gen(function*() {
          const inner = Channel.acquireRelease(Effect.succeed(1), () => Effect.die("release failure")).pipe(
            Channel.mapEffect(() => Effect.fail("usage failure"))
          )
          const result = yield* flatten(inner).pipe(Channel.runCollect, Effect.exit)
          assert.deepStrictEqual(
            result,
            Exit.failCause(Cause.combine(Cause.fail("usage failure"), Cause.die("release failure")))
          )
        }))
    }

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

    it.live("merge - propagates a finalizer defect after the other side completes", () =>
      Effect.gen(function*() {
        const left = Channel.acquireRelease(Effect.succeed(1), () => Effect.die("release defect"))
        const result = yield* Channel.merge(left, Channel.empty).pipe(
          Channel.runCollect,
          Effect.timeout("500 millis"),
          Effect.exit
        )
        assert.deepStrictEqual(result, Exit.die("release defect"))
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

  describe("typed recovery with mixed causes", () => {
    class MixedError extends Data.TaggedError("MixedError") {}
    const error = new MixedError()
    const defect = new Error("boom")
    const recovered = Channel.succeed("recovered")
    const failOnce = (self: Channel.Channel<never, MixedError, never>) => {
      let attempts = 0
      return Channel.suspend(() => attempts++ === 0 ? self : Channel.succeed("retried"))
    }
    const recoveries: Record<
      string,
      (self: Channel.Channel<never, MixedError, never>) => Channel.Channel<unknown, unknown, unknown>
    > = {
      catch: (self) => Channel.catch(self, () => recovered),
      catchTag: (self) => Channel.catchTag(self, "MixedError", () => recovered),
      catchIf: (self) => Channel.catchIf(self, () => true, () => recovered),
      catchFilter: (self) => Channel.catchFilter(self, Result.succeed, () => recovered),
      ignore: (self) => Channel.ignore(self),
      retry: (self) => Channel.retry(failOnce(self), Schedule.recurs(1))
    }
    const failWith = (...reasons: Array<Cause.Reason<MixedError>>) => Channel.failCause(Cause.fromReasons(reasons))
    const reasonsOf = (exit: Exit.Exit<unknown, unknown>) =>
      Exit.isSuccess(exit) ? exit : exit.cause.reasons.map((reason) =>
        reason._tag === "Fail"
          ? ["Fail", reason.error]
          : reason._tag === "Die"
          ? ["Die", reason.defect]
          : ["Interrupt", reason.fiberId]
      )

    it.effect("defects take precedence over typed errors", () =>
      Effect.gen(function*() {
        for (const [name, recover] of Object.entries({ ...recoveries, orDie: Channel.orDie })) {
          const failAndDie = yield* recover(failWith(Cause.makeFailReason(error), Cause.makeDieReason(defect))).pipe(
            Channel.runDrain,
            Effect.exit
          )
          assert.deepStrictEqual(reasonsOf(failAndDie), [["Die", error], ["Die", defect]], name)

          const failInterruptAndDie = yield* recover(failWith(
            Cause.makeFailReason(error),
            Cause.makeInterruptReason(1),
            Cause.makeDieReason(defect)
          )).pipe(Channel.runDrain, Effect.exit)
          assert.deepStrictEqual(
            reasonsOf(failInterruptAndDie),
            [["Die", error], ["Interrupt", 1], ["Die", defect]],
            name
          )
        }
      }))

    it.effect("interrupts beside a typed error do not block recovery", () =>
      Effect.gen(function*() {
        for (const [name, recover] of Object.entries(recoveries)) {
          const exit = yield* recover(failWith(Cause.makeFailReason(error), Cause.makeInterruptReason(1))).pipe(
            Channel.runDrain,
            Effect.exit
          )
          assert.isTrue(Exit.isSuccess(exit), name)
        }
      }))

    it.effect("error mapping keeps defects and interrupts", () =>
      Effect.gen(function*() {
        const exit = yield* failWith(
          Cause.makeFailReason(error),
          Cause.makeInterruptReason(1),
          Cause.makeDieReason(defect)
        ).pipe(Channel.mapError(() => "mapped"), Channel.runDrain, Effect.exit)
        assert.deepStrictEqual(reasonsOf(exit), [["Fail", "mapped"], ["Interrupt", 1], ["Die", defect]])
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
