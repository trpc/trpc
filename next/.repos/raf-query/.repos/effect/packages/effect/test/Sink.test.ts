import { describe, it } from "@effect/vitest"
import {
  assertExitFailure,
  assertExitSuccess,
  assertNone,
  assertSome,
  deepStrictEqual,
  strictEqual
} from "@effect/vitest/utils"
import { Array, Cause, Deferred, Duration, Effect, Fiber, Option, Ref, Result, Sink, Stream } from "effect"
import { constTrue, pipe } from "effect/Function"
import { TestClock } from "effect/testing"

describe("Sink", () => {
  describe("constructors", () => {
    it.effect("fromWritableStream - aborts instead of closing on upstream failure", () =>
      Effect.gen(function*() {
        const error = new Error("upstream failed")
        let abortReason: unknown = undefined
        let closes = 0
        const writable = new WritableStream<number>({
          close() {
            closes++
          },
          abort(reason) {
            abortReason = reason
          }
        })
        const exit = yield* Stream.make(1).pipe(
          Stream.concat(Stream.fail(error)),
          Stream.run(Sink.fromWritableStream({
            evaluate: () => writable,
            onError: (cause) => cause
          })),
          Effect.exit
        )

        assertExitFailure(exit, Cause.fail(error))
        strictEqual(closes, 0)
        deepStrictEqual(Cause.squash(abortReason as Cause.Cause<Error>), error)
      }))

    it.effect("fromWritableStream - aborts instead of closing on interruption", () =>
      Effect.gen(function*() {
        const started = yield* Deferred.make<void>()
        let abortReason: unknown = undefined
        let closes = 0
        const writable = new WritableStream<number>({
          close() {
            closes++
          },
          abort(reason) {
            abortReason = reason
          }
        })
        const sink = Sink.fromWritableStream({
          evaluate: () => writable,
          onError: (cause) => cause
        })
        const fiber = yield* Stream.fromEffect(
          Deferred.succeed(started, void 0).pipe(Effect.andThen(Effect.never))
        ).pipe(
          Stream.run(sink),
          Effect.forkChild
        )

        yield* Deferred.await(started)
        yield* Fiber.interrupt(fiber)

        strictEqual(closes, 0)
        strictEqual(abortReason === undefined, false)
      }))
  })

  describe("reduceWhile", () => {
    it.effect("empty", () =>
      Effect.gen(function*() {
        const result = yield* Stream.empty.pipe(
          Stream.transduce(Sink.reduceWhile<number, number>(() => 0, constTrue, (x, y) => x + y)),
          Stream.runCollect
        )
        deepStrictEqual(result, [0])
      }))

    it.effect("termination in the middle", () =>
      Effect.gen(function*() {
        const result = yield* Stream.range(1, 9).pipe(
          Stream.run(Sink.reduceWhile<number, number>(() => 0, (n) => n <= 5, (x, y) => x + y))
        )
        strictEqual(result, 6)
      }))

    it.effect("immediate termination", () =>
      Effect.gen(function*() {
        const result = yield* Stream.range(1, 9).pipe(
          Stream.run(Sink.reduceWhile<number, number>(() => 0, (n) => n <= -1, (x, y) => x + y))
        )
        strictEqual(result, 0)
      }))

    it.effect("no termination", () =>
      Effect.gen(function*() {
        const result = yield* Stream.range(1, 9).pipe(
          Stream.run(Sink.reduceWhile<number, number>(() => 0, (n) => n <= 500, (x, y) => x + y))
        )
        strictEqual(result, 45)
      }))
  })

  describe("reduceWhileArray", () => {
    it.effect("applies the reducer once per non-empty input array", () =>
      Effect.gen(function*() {
        const result = yield* Stream.fromArrays([1, 2, 3]).pipe(
          Stream.run(Sink.reduceWhileArray(() => 0, constTrue, (count) => count + 1))
        )

        strictEqual(result, 1, "the reducer must run once for each input array")
      }))
  })

  describe("reduceWhileEffect", () => {
    it.effect("short circuits", () =>
      Effect.gen(function*() {
        const empty: Stream.Stream<number> = Stream.empty
        const single = Stream.make(1)
        const double = Stream.make(1, 2)
        const failed = Stream.fail("Ouch")
        const run = <E>(stream: Stream.Stream<number, E>) =>
          Ref.make(Array.empty<number>()).pipe(
            Effect.flatMap((ref) =>
              stream.pipe(
                Stream.transduce(Sink.reduceWhileEffect(
                  () => 0,
                  constTrue,
                  (_, y: number) => Effect.as(Ref.update(ref, Array.append(y)), 30)
                )),
                Stream.runCollect,
                Effect.flatMap((exit) =>
                  Ref.get(ref).pipe(
                    Effect.map((result) => [exit, result])
                  )
                )
              )
            ),
            Effect.exit
          )
        const result1 = yield* run(empty)
        const result2 = yield* run(single)
        const result3 = yield* run(double)
        const result4 = yield* run(failed)
        assertExitSuccess(result1, [[0], []])
        assertExitSuccess(result2, [[30], [1]])
        assertExitSuccess(result3, [[30], [1, 2]])
        assertExitFailure(result4, Cause.fail("Ouch"))
      }))
  })

  describe("reduce", () => {
    it.effect("equivalence with Array.reduce", () =>
      Effect.gen(function*() {
        const stream = Stream.range(1, 9)
        const result1 = yield* stream.pipe(Stream.run(Sink.reduce(() => "", (s, n) => s + `${n}`)))
        const result2 = yield* stream.pipe(
          Stream.runCollect,
          Effect.map(Array.reduce("", (s, n) => s + `${n}`))
        )
        strictEqual(result1, result2)
      }))
  })

  describe("foldUntil", () => {
    it.effect("normalizes the maximum element count", () =>
      Effect.gen(function*() {
        const results = yield* Effect.forEach([Number.NaN, -1, 0, 0.5, 1.9, 2.9], (max) =>
          Stream.make(1, 2, 3).pipe(
            Stream.run(Sink.foldUntil(() => 0, max, (count) => Effect.succeed(count + 1)))
          ))
        deepStrictEqual(results, [0, 0, 0, 0, 1, 2])
      }))

    it.effect("zero normalized counts do not evaluate the upstream", () =>
      Effect.gen(function*() {
        let initializations = 0
        const sink = Sink.foldUntil(
          () => {
            initializations++
            return 42
          },
          Number.NaN,
          (state: number) => Effect.succeed(state + 1)
        )

        strictEqual(initializations, 0)
        const result = yield* Stream.fromEffect(Effect.die("upstream evaluated")).pipe(Stream.run(sink))
        strictEqual(result, 42)
        strictEqual(initializations, 1)
      }))
  })

  describe("take", () => {
    it.effect("normalizes the element count", () =>
      Effect.gen(function*() {
        const results = yield* Effect.all([
          Stream.make(1, 2, 3).pipe(Stream.run(Sink.take(Number.NaN))),
          Stream.make(1, 2, 3).pipe(Stream.run(Sink.take(-1))),
          Stream.make(1, 2, 3).pipe(Stream.run(Sink.take(1.9)))
        ])
        deepStrictEqual(results, [[], [], [1]])
      }))

    it.effect("respects the given limit", () =>
      Effect.gen(function*() {
        const stream = Stream.make(1, 2, 3, 4).pipe(
          Stream.transduce(Sink.take<number>(3))
        )
        const result = yield* Stream.runCollect(stream)
        deepStrictEqual(
          result,
          [[1, 2, 3], [4]]
        )
      }))

    it.effect("produces empty trailing chunks", () =>
      Effect.gen(function*() {
        const stream = Stream.make(1, 2, 3, 4).pipe(
          Stream.transduce(Sink.take<number>(4))
        )
        const result = yield* Stream.runCollect(stream)
        deepStrictEqual(
          result,
          [[1, 2, 3, 4], []]
        )
      }))

    it.effect("produces an empty chunk for empty input", () =>
      Effect.gen(function*() {
        const stream = Stream.empty.pipe(
          Stream.transduce(Sink.take<number>(3))
        )
        const result = yield* Stream.runCollect(stream)
        deepStrictEqual(result, [[]])
      }))
  })

  describe("takeWhile", () => {
    it.effect("takeWhile", () =>
      Effect.gen(function*() {
        const result = yield* Stream.make(1, 2, 3, 4).pipe(
          Stream.run(Sink.takeWhile((n) => n < 3))
        )
        deepStrictEqual(result, [1, 2])
      }))

    it.effect("takeWhileFilter", () =>
      Effect.gen(function*() {
        const result = yield* Stream.make(1, 2, 3, 4).pipe(
          Stream.run(Sink.takeWhileFilter((n) => n < 3 ? Result.succeed(n * 2) : Result.failVoid))
        )
        deepStrictEqual(result, [2, 4])
      }))

    it.effect("takeWhileFilter consumes the first failing input", () =>
      Effect.gen(function*() {
        const result = yield* Stream.make(1, 2, 3, 4).pipe(
          Stream.transduce(Sink.takeWhileFilter((n) => n < 3 ? Result.succeed(n) : Result.failVoid)),
          Stream.runCollect
        )
        deepStrictEqual(result, [[1, 2], [], []])
      }))

    it.effect("takeWhileEffect", () =>
      Effect.gen(function*() {
        const result = yield* Stream.make(1, 2, 3, 4).pipe(
          Stream.run(Sink.takeWhileEffect((n) => Effect.succeed(n < 3)))
        )
        deepStrictEqual(result, [1, 2])
      }))

    it.effect("takeWhileFilterEffect", () =>
      Effect.gen(function*() {
        const result = yield* Stream.make(1, 2, 3, 4).pipe(
          Stream.run(Sink.takeWhileFilterEffect((n) => Effect.succeed(n < 3 ? Result.succeed(n + 1) : Result.failVoid)))
        )
        deepStrictEqual(result, [2, 3])
      }))

    it.effect("takeWhileFilterEffect consumes the first failing input", () =>
      Effect.gen(function*() {
        const result = yield* Stream.make(1, 2, 3, 4).pipe(
          Stream.transduce(
            Sink.takeWhileFilterEffect((n) => Effect.succeed(n < 3 ? Result.succeed(n) : Result.failVoid))
          ),
          Stream.runCollect
        )
        deepStrictEqual(result, [[1, 2], [], []])
      }))
  })

  describe("withDuration", () => {
    it.effect("uses monotonic time when wall time moves backward", () =>
      Effect.gen(function*() {
        yield* TestClock.setTime(1_000)
        const [, duration] = yield* Stream.empty.pipe(
          Stream.run(
            Sink.fromEffect(Effect.gen(function*() {
              yield* TestClock.adjust("100 millis")
              yield* TestClock.setTime(0)
            })).pipe(Sink.withDuration)
          )
        )

        strictEqual(Duration.toMillis(duration), 100)
      }))
  })

  describe("flatMap", () => {
    it.effect("preserves leftovers when the next sink consumes no input", () =>
      Effect.gen(function*() {
        const sink = Sink.take<number>(1).pipe(
          Sink.flatMap(() => Sink.take<number>(0)),
          Sink.flatMap(() => Sink.collect<number>())
        )
        const result = yield* Stream.fromArrays([1, 2, 3], [4, 5]).pipe(Stream.run(sink))
        deepStrictEqual(result, [2, 3, 4, 5], "pending leftovers should be preserved")
      }))

    it.effect("flatMap - empty input", () =>
      Effect.gen(function*() {
        const sink = pipe(Sink.head<number>(), Sink.flatMap(Sink.succeed))
        const result = yield* pipe(Stream.empty, Stream.run(sink))
        assertNone(result)
      }))

    it.effect("flatMap - non-empty input", () =>
      Effect.gen(function*() {
        const sink = pipe(Sink.head<number>(), Sink.flatMap(Sink.succeed))
        const result = yield* pipe(Stream.make(1, 2, 3), Stream.run(sink))
        assertSome(result, 1)
      }))

    it.effect("flatMap - with leftovers", () =>
      Effect.gen(function*() {
        const chunks = Array.make(
          Array.make(1, 2),
          Array.make(3, 4, 5),
          Array.empty<number>(),
          Array.make(7, 8, 9, 10)
        )
        const sink = pipe(
          Sink.head<number>(),
          Sink.flatMap((head) =>
            pipe(
              Sink.count,
              Sink.map((count) => [head, count] as const)
            )
          )
        )
        const [option, count] = yield* pipe(Stream.fromArrays(...chunks), Stream.run(sink))
        deepStrictEqual(option, Array.head(Array.flatten(chunks)))
        strictEqual(
          count + Option.match(option, {
            onNone: () => 0,
            onSome: () => 1
          }),
          chunks.flat().length
        )
      }))
  })
})
