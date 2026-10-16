/**
 * Controllable `Clock` service for tests.
 *
 * Instead of waiting for real time to pass, effects that use `Effect.sleep`,
 * timeouts, schedules, retries, and other time-based operators can be driven by
 * advancing the test clock. This makes time-based tests deterministic and fast.
 * The module also includes helpers for moving test time, temporarily using the
 * live clock, and warning when a test appears to be waiting on time without
 * advancing it.
 *
 * @since 2.0.0
 */
import * as Arr from "../Array.ts"
import * as Clock from "../Clock.ts"
import * as Data from "../Data.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import * as Fiber from "../Fiber.ts"
import { flow } from "../Function.ts"
import * as Latch from "../Latch.ts"
import * as Layer from "../Layer.ts"
import * as Order from "../Order.ts"
import * as Semaphore from "../Semaphore.ts"

/**
 * A `TestClock` simplifies deterministic and efficient testing of effects that
 * involve the passage of time.
 *
 * **Details**
 *
 * Instead of waiting for actual time to pass, `sleep` and methods implemented
 * in terms of it schedule effects to take place at a given clock time. Use
 * `adjust` and `setTime` to move clock time, and all effects scheduled to take
 * place on or before that time will automatically run in order.
 *
 * **Gotchas**
 *
 * Calls to `sleep` and methods derived from it will semantically block until
 * the time is set to on or after the time they are scheduled to run. Fork the
 * effect being tested, then adjust the clock time, and finally verify that the
 * expected effects have been performed.
 *
 * **Example** (Testing timeouts deterministically)
 *
 * Tests `Effect.timeout` using `TestClock`.
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Fiber, pipe } from "effect"
 * import { TestClock } from "effect/testing"
 *
 * const program = Effect.gen(function*() {
 *   const fiber = yield* pipe(
 *     Effect.sleep("5 minutes"),
 *     Effect.timeout("1 minute"),
 *     Effect.forkChild
 *   )
 *   yield* TestClock.adjust("1 minute")
 *   const exit = yield* Fiber.await(fiber)
 *   Exit.isFailure(exit) // => true
 * })
 *
 * await Effect.runPromise(Effect.provide(program, TestClock.layer()))
 * ```
 *
 * **Example** (Advancing time deterministically)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber } from "effect"
 * import { TestClock } from "effect/testing"
 *
 * const program = Effect.gen(function*() {
 *   let executed = false
 *
 *   // Fork an effect that sleeps for 1 hour
 *   const fiber = yield* Effect.gen(function*() {
 *     yield* Effect.sleep("1 hour")
 *     executed = true
 *   }).pipe(Effect.forkChild)
 *
 *   // Advance the test clock by 1 hour
 *   yield* TestClock.adjust("1 hour")
 *   yield* Fiber.join(fiber)
 *
 *   // The effect should now be executed
 *   executed // => true
 * })
 *
 * await Effect.runPromise(Effect.provide(program, TestClock.layer()))
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface TestClock extends Clock.Clock {
  /**
   * Increments the current clock time by the specified duration. Any effects
   * that were scheduled to occur on or before the new time will be run in
   * order.
   */
  adjust(duration: Duration.Input): Effect.Effect<void>
  /**
   * Sets the current clock time to the specified `timestamp`. Any effects that
   * were scheduled to occur on or before the new time will be run in order.
   */
  setTime(timestamp: number): Effect.Effect<void>
  /**
   * Executes the specified effect with the live `Clock` instead of the
   * `TestClock`.
   */
  withLive<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R>
}

/**
 * Namespace containing `TestClock` configuration and state types.
 *
 * **Example** (Configuring a test clock)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { TestClock } from "effect/testing"
 *
 * const program = Effect.gen(function*() {
 *   // Create a TestClock with custom options
 *   const testClock = yield* TestClock.make({
 *     warningDelay: "5 seconds"
 *   })
 *
 *   // Access the current state
 *   const currentTime = testClock.currentTimeMillisUnsafe()
 *   currentTime // => 0
 * })
 *
 * await Effect.runPromise(Effect.scoped(program))
 * ```
 *
 * @since 2.0.0
 */
export declare namespace TestClock {
  /**
   * Options used when constructing a `TestClock`. `warningDelay` controls how
   * long the live clock waits before logging a warning when a test uses time
   * without advancing the test clock.
   *
   * **Example** (Configuring the warning delay)
   *
   * ```ts import.meta.vitest
   * import { Effect } from "effect"
   * import { TestClock } from "effect/testing"
   *
   * const program = Effect.gen(function*() {
   *   // Create a TestClock with custom warning delay
   *   const testClock = yield* TestClock.make({
   *     warningDelay: "30 seconds"
   *   })
   *
   *   // Use the TestClock in your test
   *   yield* testClock.adjust("1 hour")
   *   testClock.currentTimeMillisUnsafe() // => 3_600_000
   * })
   *
   * await Effect.runPromise(Effect.scoped(program))
   * ```
   *
   * @category options
   * @since 4.0.0
   */
  export interface Options {
    /**
     * The amount of time to wait before displaying a warning message when a
     * test is using time but is not advancing the `TestClock`.
     */
    readonly warningDelay?: Duration.Input
  }

  /**
   * Represents the state tracked by a `TestClock`, including the current
   * millisecond timestamp and the sleeps scheduled to resume when the clock
   * reaches their target time.
   *
   * @category models
   * @since 4.0.0
   */
  export interface State {
    readonly timestamp: number
    readonly sleeps: ReadonlyArray<[number, Latch.Latch]>
  }
}

/**
 * The warning message that will be displayed if a test is using time but is
 * not advancing the `TestClock`.
 */
const warningMessage = "A test is using time, but is not advancing the test " +
  "clock, which may result in the test hanging. Use TestClock.adjust to " +
  "manually advance the time."

const defaultOptions: Required<TestClock.Options> = {
  warningDelay: "1 second"
}

const SleepOrder = Order.flip(Order.Struct({
  timestamp: Order.Number,
  sequence: Order.Number
}))

const nanosPerMilli = BigInt(1_000_000)

const millisToNanos = (millis: number): bigint => {
  const wholeMillis = Math.floor(millis)
  const fractionalNanos = Math.floor((millis - wholeMillis) * 1_000_000)
  return BigInt(wholeMillis) * nanosPerMilli + BigInt(fractionalNanos)
}

/**
 * Creates a `TestClock` with optional configuration.
 *
 * **Example** (Creating a test clock)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { TestClock } from "effect/testing"
 *
 * const program = Effect.gen(function*() {
 *   // Create a TestClock with default settings
 *   const testClock = yield* TestClock.make()
 *
 *   // Create a TestClock with custom warning delay
 *   const customTestClock = yield* TestClock.make({
 *     warningDelay: "10 seconds"
 *   })
 *
 *   // Use the TestClock to control time in tests
 *   yield* testClock.adjust("1 hour")
 *   const currentTime = testClock.currentTimeMillisUnsafe()
 *   currentTime // => 3_600_000
 * })
 *
 * await Effect.runPromise(Effect.scoped(program))
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.fnUntraced(function*(
  options?: TestClock.Options
) {
  const config = { ...defaultOptions, ...options }
  let sequence = 0
  const sleeps: Array<{
    readonly sequence: number
    readonly timestamp: number
    readonly latch: Latch.Latch
  }> = []
  const liveClock = yield* Clock.clockWith(Effect.succeed)
  const warningSemaphore = yield* Semaphore.make(1)

  let currentTimestamp: number = new Date(0).getTime()
  let currentWallNanos = BigInt(0)
  let currentMonotonicNanos = BigInt(0)
  let warningState: WarningState = WarningState.Start()

  function currentTimeMillisUnsafe(): number {
    return currentTimestamp
  }

  function currentTimeNanosUnsafe(): bigint {
    return currentWallNanos
  }

  function monotonicTimeNanosUnsafe(): bigint {
    return currentMonotonicNanos
  }

  const currentTimeMillis = Effect.sync(currentTimeMillisUnsafe)
  const currentTimeNanos = Effect.sync(currentTimeNanosUnsafe)
  const monotonicTimeNanos = Effect.sync(monotonicTimeNanosUnsafe)

  function withLive<A, E, R>(effect: Effect.Effect<A, E, R>) {
    return Effect.provideService(effect, Clock.Clock, liveClock)
  }

  /**
   * Forks a fiber that will display a warning message if a test is using time
   * but is not advancing the `TestClock`.
   */
  const warningStart = warningSemaphore.withPermits(1)(
    Effect.suspend(() => {
      if (warningState._tag === "Start") {
        return Effect.logWarning(warningMessage).pipe(
          Effect.delay(config.warningDelay),
          withLive,
          Effect.forkChild,
          Effect.interruptible,
          Effect.flatMap((fiber) =>
            Effect.sync(() => {
              warningState = WarningState.Pending({ fiber })
            })
          )
        )
      }
      return Effect.void
    })
  )
  /**
   * Cancels the warning message that is displayed if a test is using time but
   * is not advancing the `TestClock`.
   */
  const warningDone = warningSemaphore.withPermits(1)(
    Effect.suspend(() => {
      switch (warningState._tag) {
        case "Pending": {
          return Fiber.interrupt(warningState.fiber).pipe(
            Effect.andThen(Effect.sync(() => {
              warningState = WarningState.Done()
            }))
          )
        }
        case "Start":
        case "Done": {
          warningState = WarningState.Done()
          return Effect.void
        }
      }
    })
  )

  const sleep = Effect.fnUntraced(function*(duration: Duration.Duration) {
    const millis = Duration.toMillis(duration)
    const end = currentTimestamp + millis
    if (end <= currentTimestamp) return
    const latch = Latch.makeUnsafe()
    sleeps.push({
      sequence: sequence++,
      timestamp: end,
      latch
    })
    sleeps.sort(SleepOrder)
    yield* warningStart
    yield* latch.await
  })

  const runSemaphore = yield* Semaphore.make(1)
  const run = Effect.fnUntraced(function*(
    step: (currentTimestamp: number) => number,
    adjustmentNanos?: bigint
  ) {
    yield* Fiber.await(yield* Effect.forkChild(Effect.yieldNow))
    const initialWallNanos = currentWallNanos
    const initialMonotonicNanos = currentMonotonicNanos
    const endTimestamp = step(currentTimestamp)
    const advanceTo = (timestamp: number) => {
      const deltaMillis = timestamp - currentTimestamp
      if (deltaMillis > 0 && Number.isFinite(deltaMillis)) {
        currentMonotonicNanos += BigInt(Math.round(deltaMillis * 1_000_000))
      }
      if (Number.isFinite(timestamp)) {
        currentWallNanos = millisToNanos(timestamp)
      }
      currentTimestamp = timestamp
    }
    while (Arr.isArrayNonEmpty(sleeps)) {
      if (Arr.lastNonEmpty(sleeps).timestamp > endTimestamp) break
      const entry = sleeps.pop()!
      advanceTo(entry.timestamp)
      entry.latch.openUnsafe()
      yield* Effect.yieldNow
    }
    advanceTo(endTimestamp)
    if (adjustmentNanos !== undefined && Number.isFinite(endTimestamp)) {
      currentWallNanos = initialWallNanos + adjustmentNanos
      if (adjustmentNanos > BigInt(0)) {
        currentMonotonicNanos = initialMonotonicNanos + adjustmentNanos
      }
    }
  }, runSemaphore.withPermits(1))

  function adjust(input: Duration.Input) {
    const duration = Duration.fromInputUnsafe(input)
    const millis = Duration.toMillis(duration)
    const nanos = Number.isFinite(millis) ? Duration.toNanosUnsafe(duration) : undefined
    return warningDone.pipe(Effect.andThen(run((timestamp) => timestamp + millis, nanos)))
  }

  function setTime(timestamp: number) {
    return warningDone.pipe(Effect.andThen(run(() => timestamp)))
  }

  yield* Effect.addFinalizer(() => warningDone)

  return {
    currentTimeMillisUnsafe,
    currentTimeNanosUnsafe,
    monotonicTimeNanosUnsafe,
    currentTimeMillis,
    currentTimeNanos,
    monotonicTimeNanos,
    adjust,
    setTime,
    sleep,
    withLive
  }
})

/**
 * Creates a `Layer` which constructs a `TestClock`.
 *
 * **Example** (Providing a test clock layer)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { TestClock } from "effect/testing"
 *
 * // Create a TestClock layer
 * const testClockLayer = TestClock.layer()
 *
 * // Create a TestClock layer with custom options
 * const customTestClockLayer = TestClock.layer({
 *   warningDelay: "5 seconds"
 * })
 *
 * const program = Effect.gen(function*() {
 *   // Use the layer in your program
 *   yield* TestClock.adjust("1 hour")
 *   return yield* TestClock.testClockWith((testClock) =>
 *     Effect.succeed(testClock.currentTimeMillisUnsafe())
 *   )
 * })
 *
 * await Effect.runPromise(Effect.provide(program, testClockLayer)) // => 3_600_000
 * await Effect.runPromise(Effect.provide(program, customTestClockLayer)) // => 3_600_000
 * ```
 *
 * @category layers
 * @since 4.0.0
 */
export const layer: (options?: TestClock.Options) => Layer.Layer<TestClock> = flow(
  make,
  Layer.effect(Clock.Clock)
) as any

/**
 * Retrieves the `TestClock` service for this test and uses it to run the
 * specified workflow.
 *
 * **Example** (Accessing the test clock)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { TestClock } from "effect/testing"
 *
 * const program = Effect.gen(function*() {
 *   // Use testClockWith to access the TestClock instance
 *   const currentTime = yield* TestClock.testClockWith((testClock) =>
 *     Effect.succeed(testClock.currentTimeMillisUnsafe())
 *   )
 *
 *   // Adjust time using the TestClock instance
 *   yield* TestClock.testClockWith((testClock) => testClock.adjust("2 hours"))
 *
 *   currentTime // => 0
 * })
 *
 * await Effect.runPromise(Effect.provide(program, TestClock.layer()))
 * ```
 *
 * @category testing
 * @since 2.0.0
 */
export const testClockWith = <A, E, R>(
  f: (testClock: TestClock) => Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> => Effect.withFiber((fiber) => f(fiber.getRef(Clock.Clock) as TestClock))

/**
 * Accesses a `TestClock` instance in the context and increments the time
 * by the specified duration, running any actions scheduled for on or before
 * the new time in order.
 *
 * **Example** (Advancing the test clock)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber } from "effect"
 * import { TestClock } from "effect/testing"
 *
 * const program = Effect.gen(function*() {
 *   let executed = false
 *
 *   // Fork an effect that sleeps for 30 minutes
 *   const fiber = yield* Effect.gen(function*() {
 *     yield* Effect.sleep("30 minutes")
 *     executed = true
 *   }).pipe(Effect.forkChild)
 *
 *   // Advance the clock by 30 minutes
 *   yield* TestClock.adjust("30 minutes")
 *   yield* Fiber.join(fiber)
 *
 *   // The effect should now be executed
 *   executed // => true
 * })
 *
 * await Effect.runPromise(Effect.provide(program, TestClock.layer()))
 * ```
 *
 * @category testing
 * @since 2.0.0
 */
export const adjust = (duration: Duration.Input): Effect.Effect<void> =>
  testClockWith((testClock) => testClock.adjust(duration))

/**
 * Sets the current clock time to the specified `timestamp`. Any effects that
 * were scheduled to occur on or before the new time will be run in order.
 *
 * **Example** (Setting the test clock time)
 *
 * ```ts import.meta.vitest
 * import { Duration, Effect, Fiber } from "effect"
 * import { TestClock } from "effect/testing"
 *
 * const program = Effect.gen(function*() {
 *   let executed = false
 *
 *   // Fork an effect that sleeps for 2 hours
 *   const fiber = yield* Effect.gen(function*() {
 *     yield* Effect.sleep("2 hours")
 *     executed = true
 *   }).pipe(Effect.forkChild)
 *
 *   // Set the clock to a specific timestamp (2 hours from epoch)
 *   const targetTime = Duration.toMillis(Duration.hours(2))
 *   yield* TestClock.setTime(targetTime)
 *   yield* Fiber.join(fiber)
 *
 *   // The effect should now be executed
 *   executed // => true
 * })
 *
 * await Effect.runPromise(Effect.provide(program, TestClock.layer()))
 * ```
 *
 * @category testing
 * @since 2.0.0
 */
export const setTime = (timestamp: number): Effect.Effect<void> =>
  testClockWith((testClock) => testClock.setTime(timestamp))

/**
 * Executes the specified effect with the live `Clock` instead of the
 * `TestClock`.
 *
 * **Example** (Running with the live clock)
 *
 * ```ts import.meta.vitest
 * import { Clock, Effect } from "effect"
 * import { TestClock } from "effect/testing"
 *
 * const program = Effect.gen(function*() {
 *   // Get the current test time (starts at epoch)
 *   const testTime = yield* Clock.currentTimeMillis
 *   testTime // => 0
 *
 *   // Get the actual system time using withLive
 *   const realTime = yield* TestClock.withLive(Clock.currentTimeMillis)
 *   Number.isFinite(realTime) // => true
 *
 *   // Advance test time
 *   yield* TestClock.adjust("1 hour")
 *
 *   // Test time is now 1 hour ahead
 *   const newTestTime = yield* Clock.currentTimeMillis
 *   newTestTime // => 3_600_000
 * })
 *
 * await Effect.runPromise(Effect.provide(program, TestClock.layer()))
 * ```
 *
 * @category testing
 * @since 4.0.0
 */
export const withLive = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  testClockWith((testClock) => testClock.withLive(effect))

/**
 * `WarningState` describes the state of the warning message that is displayed
 * if a test is using time but is not advancing the `TestClock`.
 *
 * The possible states are:
 *   - `Start` if a test has not used time yet
 *   - `Pending` if a test has used time but has not adjusted the `TestClock`
 *   - `Done` if a test has adjusted the `TestClock` or the warning message
 *     has already been displayed.
 */
type WarningState = Data.TaggedEnum<{
  /**
   * The `WarningState` which indicates that a test has not yet used time.
   */
  readonly Start: {}
  /**
   * The `WarningState` which indicates that a test has used time but has not
   * adjusted the `TestClock`.
   *
   * The `Pending` state also includes a reference to the fiber that will
   * display the warning message.
   */
  readonly Pending: {
    readonly fiber: Fiber.Fiber<void, unknown>
  }
  /**
   * The `WarningState` which indicates that a test has used time, or that the
   * warning message has already been displayed.
   */
  readonly Done: {}
}>
const WarningState = Data.taggedEnum<WarningState>()
