import { assert, describe, it } from "@effect/vitest"
import * as Clock from "effect/Clock"
import * as Console from "effect/Console"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Scheduler from "effect/Scheduler"
import * as TestClock from "effect/testing/TestClock"
import * as TestConsole from "effect/testing/TestConsole"
import { vi } from "vitest"

describe("TestClock", () => {
  describe("warnings", { concurrent: false }, () => {
    for (const warning of ["not advancing the test clock", "still running without suspending"] as const) {
      it.effect(`warnings bypass TestConsole - ${warning}`, () =>
        Effect.gen(function*() {
          const output: Array<unknown> = []
          yield* Effect.acquireRelease(
            Effect.sync(() =>
              (["log", "warn", "error"] as const).map((method) =>
                vi.spyOn(globalThis.console, method).mockImplementation((...args) => {
                  output.push(...args)
                })
              )
            ),
            (spies) => Effect.sync(() => spies.forEach((spy) => spy.mockRestore()))
          )
          yield* Console.log("ordinary output")
          yield* Effect.sleep("1 minute").pipe(
            Effect.andThen(
              warning === "still running without suspending" ? Effect.forever(Effect.yieldNow) : Effect.void
            ),
            Effect.forkChild
          )
          if (warning === "still running without suspending") {
            yield* TestClock.adjust("1 minute")
          }
          const containsWarning = (lines: ReadonlyArray<unknown>) =>
            lines.some((line) => String(line).includes(warning))
          // Stop when the diagnostic reaches either destination, rather than timing out on the regression.
          const captured = yield* Effect.gen(function*() {
            while (true) {
              const lines = yield* TestConsole.logLines
              if (containsWarning(output) || containsWarning(lines)) return lines
              yield* Effect.sleep("10 millis")
            }
          }).pipe(Effect.timeout("3 seconds"), TestClock.withLive)
          assert.deepStrictEqual(captured, ["ordinary output"])
          assert.isTrue(containsWarning(output))
        }))
    }
  })

  for (const cancellation of ["interrupted sleep", "successful timeout"] as const) {
    it.effect(`adjust - skips the cancelled deadline (${cancellation})`, () =>
      Effect.gen(function*() {
        const testClock = yield* TestClock.make()
        if (cancellation === "interrupted sleep") {
          const sleeper = yield* testClock.sleep(Duration.minutes(1)).pipe(
            Effect.forkChild({ startImmediately: true })
          )
          yield* Effect.yieldNow
          yield* Fiber.interrupt(sleeper)
        } else {
          yield* Effect.timeout(Effect.yieldNow, "1 minute").pipe(
            Effect.provideService(Clock.Clock, testClock)
          )
        }

        // Record the clock whenever adjustment yields to other fibers
        const observed = new Set<number>()
        yield* Effect.sync(() => observed.add(testClock.currentTimeMillisUnsafe())).pipe(
          Effect.andThen(Effect.yieldNow),
          Effect.forever,
          Effect.forkChild
        )
        yield* testClock.adjust("2 minutes")
        assert.isFalse(observed.has(60_000))
      }))
  }

  it.effect("sleep - does not require passage of wall time", () =>
    Effect.gen(function*() {
      let elapsed = false
      yield* Effect.sync(() => {
        elapsed = true
      }).pipe(Effect.delay("10 hours"), Effect.forkChild)
      yield* TestClock.adjust("11 hours")
      assert.isTrue(elapsed)
    }))

  it.effect("sleep - delays effects until time is adjusted", () =>
    Effect.gen(function*() {
      let elapsed = false
      const fiber = yield* Effect.sync(() => {
        elapsed = true
      }).pipe(Effect.delay("10 hours"), Effect.forkChild)
      yield* TestClock.adjust("9 hours")
      assert.isUndefined(fiber.pollUnsafe())
      yield* TestClock.adjust("11 hours")
      assert.deepStrictEqual(fiber.pollUnsafe(), Exit.void)
      assert.isTrue(elapsed)
    }))

  it.effect("sleep - handles multiple sleeps", () =>
    Effect.gen(function*() {
      let message = ""
      yield* Effect.sync(() => {
        message += "World!"
      }).pipe(Effect.delay("3 hours"), Effect.forkScoped)
      yield* Effect.sync(() => {
        message += "Hello, "
      }).pipe(Effect.delay("1 hour"), Effect.forkScoped)
      yield* TestClock.adjust("1 hour")
      assert.strictEqual(message, "Hello, ")
      yield* TestClock.adjust("4 hours")
      assert.strictEqual(message, "Hello, World!")
    }))

  it.effect("setTime - sleep correctly handles new set time", () =>
    Effect.gen(function*() {
      let elapsed = false
      yield* Effect.sync(() => {
        elapsed = true
      }).pipe(Effect.delay("10 hours"), Effect.forkChild)
      assert.isFalse(elapsed)
      yield* TestClock.setTime(Duration.toMillis(Duration.hours(11)))
      assert.isTrue(elapsed)
    }))

  it.effect("setTime - floors nanoseconds for fractional millisecond instants", () =>
    Effect.gen(function*() {
      const testClock = yield* TestClock.make()
      yield* testClock.setTime(199023438.0000004)
      assert.strictEqual(testClock.currentTimeNanosUnsafe(), 199023438000000n)
    }))

  it.effect("setTime - preserves wall-clock nanoseconds for large timestamps", () =>
    Effect.gen(function*() {
      const testClock = yield* TestClock.make()
      const timestamp = 1_000_000_000_001
      yield* testClock.setTime(timestamp)
      assert.strictEqual(testClock.currentTimeNanosUnsafe(), BigInt(timestamp) * 1_000_000n)
    }))

  it.effect("adjust - advances wall and monotonic time", () =>
    Effect.gen(function*() {
      const testClock = yield* TestClock.make()
      yield* testClock.adjust("1 second")
      assert.strictEqual(testClock.currentTimeMillisUnsafe(), 1_000)
      assert.strictEqual(testClock.monotonicTimeNanosUnsafe(), 1_000_000_000n)
      assert.strictEqual(yield* testClock.monotonicTimeNanos, 1_000_000_000n)
    }))

  it.effect("adjust - preserves precision for nanosecond durations beyond Number.MAX_SAFE_INTEGER", () =>
    Effect.gen(function*() {
      const testClock = yield* TestClock.make()
      const nanos = 999_999_999_999_999_000n
      yield* testClock.adjust(Duration.nanos(nanos))
      assert.strictEqual(testClock.monotonicTimeNanosUnsafe(), nanos)
      assert.strictEqual(testClock.currentTimeNanosUnsafe(), nanos)
    }))

  it.effect("adjust - keeps nanosecond access total after infinite durations", () =>
    Effect.gen(function*() {
      for (const duration of [Duration.infinity, Duration.negativeInfinity]) {
        const testClock = yield* TestClock.make()
        yield* testClock.adjust(duration)
        assert.strictEqual(typeof (yield* testClock.currentTimeNanos), "bigint")
      }
    }))

  it.effect("setTime - advances monotonic time only when moving forward", () =>
    Effect.gen(function*() {
      const testClock = yield* TestClock.make()
      yield* testClock.setTime(2_000)
      assert.strictEqual(testClock.monotonicTimeNanosUnsafe(), 2_000_000_000n)
      yield* testClock.setTime(500)
      assert.strictEqual(testClock.currentTimeMillisUnsafe(), 500)
      assert.strictEqual(testClock.monotonicTimeNanosUnsafe(), 2_000_000_000n)
      yield* testClock.setTime(1_000)
      assert.strictEqual(testClock.monotonicTimeNanosUnsafe(), 2_500_000_000n)
    }))

  it.effect("setTime - preserves nanosecond precision for far-future timestamps", () =>
    Effect.gen(function*() {
      const testClock = yield* TestClock.make()
      const farFuture = 1_000_000_000_000
      yield* testClock.setTime(farFuture)
      const before = testClock.monotonicTimeNanosUnsafe()
      yield* testClock.setTime(farFuture + 1)
      assert.strictEqual(testClock.monotonicTimeNanosUnsafe() - before, 1_000_000n)
    }))

  it.effect("adjust - advances monotonic time to intermediate sleep deadlines", () =>
    Effect.gen(function*() {
      const testClock = yield* TestClock.make()
      let observed = 0n
      yield* Effect.gen(function*() {
        yield* testClock.sleep(Duration.seconds(1))
        observed = yield* testClock.monotonicTimeNanos
      }).pipe(Effect.forkChild)
      yield* testClock.adjust("2 seconds")
      assert.strictEqual(observed, 1_000_000_000n)
      assert.strictEqual(testClock.monotonicTimeNanosUnsafe(), 2_000_000_000n)
    }))

  it.effect("adjust - runs sleeps registered after a yield", () =>
    Effect.gen(function*() {
      let ticks = 0
      const fiber = yield* Effect.sleep("1 second").pipe(
        Effect.andThen(Effect.sync(() => {
          ticks++
        })),
        Effect.andThen(Effect.yieldNow),
        Effect.forever,
        Effect.forkChild
      )
      yield* TestClock.adjust("5 seconds")
      yield* Fiber.interrupt(fiber)
      assert.strictEqual(ticks, 5)
    }))

  it.effect("setTime - runs sleeps registered after a fork and join", () =>
    Effect.gen(function*() {
      let ticks = 0
      const fiber = yield* Effect.sleep("1 second").pipe(
        Effect.andThen(Effect.sync(() => {
          ticks++
        })),
        Effect.andThen(Effect.forkChild(Effect.yieldNow).pipe(Effect.flatMap(Fiber.join))),
        Effect.forever,
        Effect.forkChild
      )
      yield* TestClock.setTime(5_000)
      yield* Fiber.interrupt(fiber)
      assert.strictEqual(ticks, 5)
    }))

  it.effect("adjust - completes when a nested clock wakes a busy fiber", () =>
    Effect.gen(function*() {
      let later = false
      yield* Effect.sleep("1 second").pipe(
        Effect.andThen(Effect.forever(Effect.yieldNow)),
        Effect.forkChild
      )
      yield* Effect.sleep("2 seconds").pipe(
        Effect.andThen(Effect.sync(() => {
          later = true
        })),
        Effect.forkChild
      )
      yield* TestClock.adjust("5 seconds")
      assert.isTrue(later)
    }).pipe(Effect.provide(TestClock.layer({ warningDelay: "10 millis" }))))

  it.effect("adjust - waits for woken fibers when the advancing fiber yields on its operation budget", () =>
    Effect.gen(function*() {
      let done = false
      yield* Effect.sleep("1 second").pipe(
        Effect.andThen(Effect.yieldNow),
        Effect.andThen(Effect.sync(() => {
          done = true
        })),
        Effect.forkChild
      )
      yield* TestClock.adjust("1 second")
      assert.isTrue(done)
    }).pipe(
      Effect.provide(TestClock.layer({ warningDelay: Duration.infinity })),
      Effect.provideService(Scheduler.MaxOpsBeforeYield, 4)
    ))

  // `it.effect` and `it.live` provide an ambient Scope, defeating the #2244 regression guard.
  it("layer - can adjust when provided without an ambient Scope", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust("1 second")
    }).pipe(
      Effect.provide(TestClock.layer({})),
      Effect.runPromise
    ))
})
