import { assert, describe, expect, it } from "@effect/vitest"
import { Array, Deferred, Duration, Effect, Fiber, Pull, Random, Result, Schedule } from "effect"
import { constant, constUndefined } from "effect/Function"
import { TestClock } from "effect/testing"

describe("Schedule", () => {
  describe("constructors", () => {
    it.effect("during recurs while the duration has not elapsed", () =>
      Effect.gen(function*() {
        const step = yield* Schedule.toStep(Schedule.during("1 second"))
        const completed = yield* Pull.catchDone(
          step(0, undefined).pipe(Effect.as(false)),
          () => Effect.succeed(true)
        )

        assert.isFalse(completed)
      }))
  })

  describe("combining", () => {
    it.effect("max - outputs the slowest schedule duration", () =>
      Effect.gen(function*() {
        const schedule = Schedule.max([
          Schedule.fixed("5 seconds"),
          Schedule.exponential("5 seconds"),
          Schedule.spaced("10 seconds")
        ])
        const inputs = Array.makeBy(3, constUndefined)
        const outputs = yield* runDelays(schedule, inputs)
        assert.deepStrictEqual(outputs, [
          Duration.seconds(10),
          Duration.seconds(10),
          Duration.seconds(20)
        ])
      }))

    it.effect("max - stops when any schedule completes", () =>
      Effect.gen(function*() {
        const schedule = Schedule.max([
          Schedule.duration("1 second"),
          Schedule.spaced("5 seconds")
        ])
        const inputs = Array.makeBy(3, constUndefined)
        const outputs = yield* runDelays(schedule, inputs)
        assert.deepStrictEqual(outputs, [
          Duration.seconds(5),
          Duration.zero
        ])
      }))

    it.effect("min - outputs the fastest schedule duration", () =>
      Effect.gen(function*() {
        const schedule = Schedule.min([
          Schedule.fixed("5 seconds"),
          Schedule.exponential("5 seconds"),
          Schedule.spaced("10 seconds")
        ])
        const inputs = Array.makeBy(3, constUndefined)
        const outputs = yield* runDelays(schedule, inputs)
        assert.deepStrictEqual(outputs, [
          Duration.seconds(5),
          Duration.seconds(5),
          Duration.seconds(5)
        ])
      }))

    it.effect("min - continues after a schedule completes", () =>
      Effect.gen(function*() {
        const schedule = Schedule.min([
          Schedule.duration("1 second"),
          Schedule.spaced("5 seconds")
        ])
        const inputs = Array.makeBy(3, constUndefined)
        const outputs = yield* runDelays(schedule, inputs)
        assert.deepStrictEqual(outputs, [
          Duration.seconds(1),
          Duration.seconds(5),
          Duration.seconds(5)
        ])
      }))
  })

  describe("sequencing", () => {
    it.effect("concat - sequences self then other and merges their outputs", () =>
      Effect.gen(function*() {
        const left = Schedule.identity<string>().pipe(
          Schedule.upTo({ times: 2 }),
          Schedule.map(({ output }) => `left:${output}`)
        )
        const right = Schedule.identity<string>().pipe(
          Schedule.map(({ output }) => `right:${output}`)
        )
        const step = yield* Schedule.toStep(Schedule.concat(left, right))

        const first = yield* step(0, "a")
        const second = yield* step(0, "b")
        const third = yield* step(0, "c")

        assert.deepStrictEqual([first, second, third], [
          ["left:a", Duration.zero],
          ["left:b", Duration.zero],
          ["right:c", Duration.zero]
        ])
      }))

    it.effect("tap - provides full metadata", () =>
      Effect.gen(function*() {
        const observed: Array<Schedule.Metadata<number, string>> = []
        const schedule = Schedule.spaced(Duration.millis(250)).pipe(
          Schedule.tap((metadata: Schedule.Metadata<number, string>) =>
            Effect.sync(() => {
              observed.push(metadata)
            })
          )
        )
        const step = yield* Schedule.toStep(schedule)
        const first = yield* step(1_000, "a")
        const second = yield* step(1_250, "b")

        expect(first).toEqual([0, Duration.millis(250)])
        expect(second).toEqual([1, Duration.millis(250)])
        expect(observed).toEqual([
          {
            input: "a",
            output: 0,
            duration: Duration.millis(250),
            attempt: 1,
            start: 1_000,
            now: 1_000,
            elapsed: 0,
            elapsedSincePrevious: 0
          },
          {
            input: "b",
            output: 1,
            duration: Duration.millis(250),
            attempt: 2,
            start: 1_000,
            now: 1_250,
            elapsed: 250,
            elapsedSincePrevious: 250
          }
        ])
      }))

    it.effect("modifyDelay - provides full metadata", () =>
      Effect.gen(function*() {
        const observed: Array<Schedule.Metadata<number, string>> = []
        const schedule = Schedule.spaced(Duration.millis(250)).pipe(
          Schedule.modifyDelay((metadata: Schedule.Metadata<number, string>) =>
            Effect.sync(() => {
              observed.push(metadata)
              return Duration.sum(metadata.duration, Duration.millis(metadata.elapsedSincePrevious))
            })
          )
        )
        const step = yield* Schedule.toStep(schedule)
        const first = yield* step(1_000, "a")
        const second = yield* step(1_250, "b")

        assert.deepStrictEqual(first, [0, Duration.millis(250)])
        assert.deepStrictEqual(second, [1, Duration.millis(500)])
        assert.deepStrictEqual(observed, [
          {
            input: "a",
            output: 0,
            duration: Duration.millis(250),
            attempt: 1,
            start: 1_000,
            now: 1_000,
            elapsed: 0,
            elapsedSincePrevious: 0
          },
          {
            input: "b",
            output: 1,
            duration: Duration.millis(250),
            attempt: 2,
            start: 1_000,
            now: 1_250,
            elapsed: 250,
            elapsedSincePrevious: 250
          }
        ])
      }))

    it.effect("addDelay - provides full metadata", () =>
      Effect.gen(function*() {
        const observed: Array<Schedule.Metadata<number, string>> = []
        const schedule = Schedule.spaced(Duration.millis(250)).pipe(
          Schedule.addDelay((metadata: Schedule.Metadata<number, string>) =>
            Effect.sync(() => {
              observed.push(metadata)
              return Duration.millis(metadata.elapsedSincePrevious)
            })
          )
        )
        const step = yield* Schedule.toStep(schedule)
        const first = yield* step(1_000, "a")
        const second = yield* step(1_250, "b")

        assert.deepStrictEqual(first, [0, Duration.millis(250)])
        assert.deepStrictEqual(second, [1, Duration.millis(500)])
        assert.deepStrictEqual(observed, [
          {
            input: "a",
            output: 0,
            duration: Duration.millis(250),
            attempt: 1,
            start: 1_000,
            now: 1_000,
            elapsed: 0,
            elapsedSincePrevious: 0
          },
          {
            input: "b",
            output: 1,
            duration: Duration.millis(250),
            attempt: 2,
            start: 1_000,
            now: 1_250,
            elapsed: 250,
            elapsedSincePrevious: 250
          }
        ])
      }))

    it.effect("concatResult - sequences self then other when collecting delays", () =>
      Effect.gen(function*() {
        const left = Schedule.fixed("500 millis").pipe(
          Schedule.while(({ attempt }) => Effect.succeed(attempt <= 3))
        )
        const right = Schedule.fixed("1 second")
        const schedule = Schedule.concatResult(left, right)
        const inputs = Array.makeBy(6, constUndefined)
        const outputs = yield* runDelays(schedule, inputs)
        expect(outputs).toEqual([
          Duration.millis(500),
          Duration.millis(500),
          Duration.millis(500),
          Duration.seconds(1),
          Duration.seconds(1),
          Duration.seconds(1)
        ])
      }))

    it.effect("concatResult - includes finite other completion when collecting delays", () =>
      Effect.gen(function*() {
        const left = Schedule.fixed("500 millis").pipe(
          Schedule.while(({ attempt }) => Effect.succeed(attempt <= 2))
        )
        const right = Schedule.duration("1 second")
        const schedule = Schedule.concatResult(left, right)
        const inputs = Array.makeBy(5, constUndefined)
        const outputs = yield* runDelays(schedule, inputs)
        expect(outputs).toEqual([
          Duration.millis(500),
          Duration.millis(500),
          Duration.seconds(1),
          Duration.zero
        ])
      }))

    it.effect("concatResult - wraps self outputs as Failure and other outputs as Success", () =>
      Effect.gen(function*() {
        const left = Schedule.identity<string>().pipe(Schedule.upTo({ times: 2 }))
        const right = Schedule.identity<string>()
        const step = yield* Schedule.toStep(Schedule.concatResult(left, right))

        const first = yield* step(0, "left-1")
        const second = yield* step(0, "left-2")
        const third = yield* step(0, "right-1")

        assert.deepStrictEqual([first, second, third], [
          [Result.fail("left-1"), Duration.zero],
          [Result.fail("left-2"), Duration.zero],
          [Result.succeed("right-1"), Duration.zero]
        ])
      }))
  })

  describe("cron", () => {
    it.effect("should recur on interval matching cron expression", () =>
      Effect.gen(function*() {
        const now = new Date(2024, 0, 1, 0, 0, 35).getTime()
        // At every second minute
        const schedule = Schedule.cron("*/2 * * * *")
        const inputs = Array.makeBy(4, constUndefined)
        yield* TestClock.setTime(now)
        const [, outputs] = yield* runDelays(schedule, inputs).pipe(
          Effect.map(Array.mapAccum(now, (next, delay) => {
            const timestamp = next + Duration.toMillis(delay)
            return [timestamp, format(timestamp)]
          }))
        )
        expect(outputs).toEqual([
          "Mon Jan 01 2024 00:02:00",
          "Mon Jan 01 2024 00:04:00",
          "Mon Jan 01 2024 00:06:00",
          "Mon Jan 01 2024 00:08:00"
        ])
      }))

    it.effect("should recur on interval matching cron expression (second granularity)", () =>
      Effect.gen(function*() {
        const now = new Date(2024, 0, 1, 0, 0, 0).getTime()
        // At every third minute
        const schedule = Schedule.cron("*/3 * * * * *")
        const inputs = Array.makeBy(10, constUndefined)
        yield* TestClock.setTime(now)
        const [, outputs] = yield* runDelays(schedule, inputs).pipe(
          Effect.map(Array.mapAccum(now, (next, delay) => {
            const timestamp = next + Duration.toMillis(delay)
            return [timestamp, format(timestamp)]
          }))
        )
        expect(outputs).toEqual([
          "Mon Jan 01 2024 00:00:03",
          "Mon Jan 01 2024 00:00:06",
          "Mon Jan 01 2024 00:00:09",
          "Mon Jan 01 2024 00:00:12",
          "Mon Jan 01 2024 00:00:15",
          "Mon Jan 01 2024 00:00:18",
          "Mon Jan 01 2024 00:00:21",
          "Mon Jan 01 2024 00:00:24",
          "Mon Jan 01 2024 00:00:27",
          "Mon Jan 01 2024 00:00:30"
        ])
      }))

    it.effect("should recur at time matching cron expression", () =>
      Effect.gen(function*() {
        const now = new Date(2024, 0, 1, 0, 0, 0).getTime()
        // At 04:30 on day-of-month 5 and 15 and on Wednesday.
        const schedule = Schedule.cron("30 4 5,15 * WED")
        const inputs = Array.makeBy(6, constUndefined)
        yield* TestClock.setTime(now)
        const [, outputs] = yield* runDelays(schedule, inputs).pipe(
          Effect.map(Array.mapAccum(now, (next, delay) => {
            const timestamp = next + Duration.toMillis(delay)
            return [timestamp, format(timestamp)]
          }))
        )
        expect(outputs).toEqual([
          "Wed Jan 03 2024 04:30:00",
          "Fri Jan 05 2024 04:30:00",
          "Wed Jan 10 2024 04:30:00",
          "Mon Jan 15 2024 04:30:00",
          "Wed Jan 17 2024 04:30:00",
          "Wed Jan 24 2024 04:30:00"
        ])
      }))

    it.effect("does not fail when the test clock is adjusted to infinity", () =>
      Effect.gen(function*() {
        const latch = yield* Deferred.make<void>()
        const fiber = yield* Deferred.await(latch).pipe(
          Effect.repeat(Schedule.cron("0 0 4 8-14 * *", "UTC")),
          Effect.forkChild
        )

        yield* TestClock.adjust(Infinity)
        yield* Deferred.succeed(latch, void 0)
        yield* Fiber.join(fiber)
      }))
  })

  describe("duration", () => {
    it.effect("recurs once after the provided duration", () =>
      Effect.gen(function*() {
        const schedule = Schedule.duration(Duration.seconds(1))
        const inputs = Array.makeBy(5, constUndefined)
        const output = yield* runDelays(schedule, inputs)
        expect(output).toEqual([Duration.seconds(1), Duration.zero])
      }))
  })

  describe("once", () => {
    it.effect("recurs immediately once, then completes with void", () =>
      Effect.gen(function*() {
        const step = yield* Schedule.toStep(Schedule.once)
        const first = yield* step(0, "first")
        const second = yield* Pull.matchEffect(step(1_000, "second"), {
          onSuccess: () => Effect.succeed("unexpected success"),
          onFailure: () => Effect.succeed("unexpected failure"),
          onDone: (value) => Effect.succeed(value)
        })

        assert.deepStrictEqual(first, [undefined, Duration.zero])
        assert.isUndefined(second)
      }))

    it.effect("repeats an effect exactly once after its initial execution", () =>
      Effect.gen(function*() {
        let executions = 0
        yield* Effect.sync(() => {
          executions++
        }).pipe(Effect.repeat(Schedule.once))

        assert.strictEqual(executions, 2)
      }))
  })

  describe("upTo", () => {
    it.effect("limits by times", () =>
      Effect.gen(function*() {
        const schedule = Schedule.identity<string>().pipe(Schedule.upTo({ times: 2 }))
        const step = yield* Schedule.toStep(schedule)

        const first = yield* step(0, "a")
        const second = yield* step(0, "b")
        const third = yield* Pull.matchEffect(step(0, "c"), {
          onSuccess: () => Effect.succeed("unexpected success"),
          onFailure: () => Effect.succeed("unexpected failure"),
          onDone: (value) => Effect.succeed(value)
        })

        assert.deepStrictEqual([first, second, third], [
          ["a", Duration.zero],
          ["b", Duration.zero],
          "c"
        ])
      }))

    it.effect("limits by duration", () =>
      Effect.gen(function*() {
        const schedule = Schedule.identity<string>().pipe(Schedule.upTo({ duration: "1 second" }))
        const step = yield* Schedule.toStep(schedule)

        const first = yield* step(0, "a")
        const second = yield* step(1_000, "b")
        const third = yield* Pull.matchEffect(step(1_001, "c"), {
          onSuccess: () => Effect.succeed("unexpected success"),
          onFailure: () => Effect.succeed("unexpected failure"),
          onDone: (value) => Effect.succeed(value)
        })

        assert.deepStrictEqual([first, second, third], [
          ["a", Duration.zero],
          ["b", Duration.zero],
          "c"
        ])
      }))

    it.effect("limits by the first exhausted option", () =>
      Effect.gen(function*() {
        const schedule = Schedule.identity<string>().pipe(Schedule.upTo({ duration: "1 hour", times: 1 }))
        const step = yield* Schedule.toStep(schedule)

        const first = yield* step(0, "a")
        const second = yield* Pull.matchEffect(step(0, "b"), {
          onSuccess: () => Effect.succeed("unexpected success"),
          onFailure: () => Effect.succeed("unexpected failure"),
          onDone: (value) => Effect.succeed(value)
        })

        assert.deepStrictEqual([first, second], [["a", Duration.zero], "b"])
      }))

    it.effect("leaves the schedule unchanged when no options are specified", () =>
      Effect.gen(function*() {
        const schedule = Schedule.identity<string>().pipe(Schedule.upTo({}))
        const step = yield* Schedule.toStep(schedule)

        const first = yield* step(0, "a")
        const second = yield* step(0, "b")

        assert.deepStrictEqual([first, second], [
          ["a", Duration.zero],
          ["b", Duration.zero]
        ])
      }))
  })

  describe("jittered", () => {
    it.effect("keeps delays within 80%-120% of the original", () =>
      Effect.gen(function*() {
        const schedule = Schedule.jittered(Schedule.spaced(Duration.seconds(1)))
        const inputs = Array.makeBy(20, constUndefined)
        const output = yield* runDelays(schedule, inputs).pipe(Random.withSeed("jittered-bounds"))
        expect(output.every((delay) => {
          const millis = Duration.toMillis(delay)
          return millis >= 800 && millis <= 1200
        })).toBe(true)
      }))

    it.effect("does not change completion output", () =>
      Effect.gen(function*() {
        const schedule = Schedule.jittered(Schedule.duration(Duration.seconds(1)))
        const inputs = Array.makeBy(5, constUndefined)
        const output = yield* runDelays(schedule, inputs).pipe(Random.withSeed("jittered-completion"))
        expect(output.length).toEqual(2)
        expect(Duration.toMillis(output[0])).toBeGreaterThanOrEqual(800)
        expect(Duration.toMillis(output[0])).toBeLessThanOrEqual(1200)
        expect(output[1]).toEqual(Duration.zero)
      }))
  })

  describe("spaced", () => {
    it.effect("constant delays", () =>
      Effect.gen(function*() {
        const schedule = Schedule.spaced(Duration.seconds(1))
        const inputs = Array.makeBy(5, constUndefined)
        const output = yield* runDelays(schedule, inputs)
        expect(output).toEqual(Array.makeBy(5, constant(Duration.seconds(1))))
      }))
  })

  describe("fixed", () => {
    it.effect("constant delays", () =>
      Effect.gen(function*() {
        const schedule = Schedule.fixed(Duration.seconds(1))
        const inputs = Array.makeBy(5, constUndefined)
        const output = yield* runDelays(schedule, inputs)
        expect(output).toEqual(Array.makeBy(5, constant(Duration.seconds(1))))
      }))

    it.effect("delays until the nearest window boundary when action is slow", () =>
      Effect.gen(function*() {
        const delays: Array<Duration.Duration> = []
        const schedule = Schedule.fixed("1 seconds").pipe(
          Schedule.while(({ attempt }) => Effect.succeed(attempt <= 5)),
          Schedule.tap((metadata) =>
            Effect.sync(() => {
              delays.push(metadata.duration)
            })
          )
        )
        yield* Effect.sleep("500 millis").pipe(
          Effect.schedule(schedule),
          Effect.andThen(Effect.sync(() => delays.push(Duration.zero))),
          Effect.forkChild
        )
        yield* TestClock.setTime(Number.POSITIVE_INFINITY)
        expect(delays).toEqual([
          Duration.millis(1000),
          Duration.millis(500),
          Duration.millis(500),
          Duration.millis(500),
          Duration.millis(500),
          Duration.zero
        ])
      }))

    it.effect("matches effect v3 when action duration exceeds the interval", () =>
      Effect.gen(function*() {
        const delays: Array<Duration.Duration> = []
        const schedule = Schedule.fixed("1 seconds").pipe(
          Schedule.while(({ attempt }) => Effect.succeed(attempt <= 5)),
          Schedule.tap((metadata) =>
            Effect.sync(() => {
              delays.push(metadata.duration)
            })
          )
        )
        yield* Effect.sleep("1.5 seconds").pipe(
          Effect.schedule(schedule),
          Effect.andThen(Effect.sync(() => delays.push(Duration.zero))),
          Effect.forkChild
        )
        yield* TestClock.setTime(Number.POSITIVE_INFINITY)
        expect(delays).toEqual([
          Duration.millis(1000),
          Duration.zero,
          Duration.zero,
          Duration.zero,
          Duration.zero,
          Duration.zero
        ])
      }))
  })

  describe("windowed", () => {
    it.effect("constant delays", () =>
      Effect.gen(function*() {
        const schedule = Schedule.windowed(Duration.seconds(1))
        const inputs = Array.makeBy(5, constUndefined)
        const output = yield* runDelays(schedule, inputs)
        expect(output).toEqual(Array.makeBy(5, constant(Duration.seconds(1))))
      }))

    it.effect("delays until the nearest window boundary", () =>
      Effect.gen(function*() {
        const delays: Array<Duration.Duration> = []
        const schedule = Schedule.windowed("1 seconds").pipe(
          Schedule.while(({ attempt }) => Effect.succeed(attempt <= 5)),
          Schedule.tap((metadata) =>
            Effect.sync(() => {
              delays.push(metadata.duration)
            })
          )
        )
        yield* Effect.sleep("1.5 seconds").pipe(
          Effect.schedule(schedule),
          Effect.andThen(Effect.sync(() => delays.push(Duration.zero))),
          Effect.forkChild
        )
        yield* TestClock.setTime(Number.POSITIVE_INFINITY)
        expect(delays).toEqual([
          Duration.millis(1000),
          Duration.millis(500),
          Duration.millis(500),
          Duration.millis(500),
          Duration.millis(500),
          Duration.zero
        ])
      }))
  })
})

const run = Effect.fnUntraced(function*<A, E, R>(effect: Effect.Effect<A, E, R>) {
  const fiber = yield* Effect.forkChild(effect)
  yield* TestClock.setTime(Number.POSITIVE_INFINITY)
  return yield* Fiber.join(fiber)
})

const runDelays = <Output, Input, Error, Env>(
  schedule: Schedule.Schedule<Output, Input, Error, Env>,
  input: Iterable<Input>
) =>
  Effect.gen(function*() {
    const step = yield* Schedule.toStepWithMetadata(schedule)
    const out: Array<Duration.Duration> = []
    yield* Effect.gen(function*() {
      for (const value of input) {
        out.push((yield* step(value)).duration)
      }
    }).pipe(Pull.catchDone(() => {
      out.push(Duration.zero)
      return Effect.void
    }))
    return out
  }).pipe(run)

const format = (timestamp: number | string | Date): string => {
  const date = new Date(timestamp)
  const hours = `0${date.getHours()}`.slice(-2)
  const minutes = `0${date.getMinutes()}`.slice(-2)
  const seconds = `0${date.getSeconds()}`.slice(-2)
  return `${date.toDateString()} ${hours}:${minutes}:${seconds}`
}
