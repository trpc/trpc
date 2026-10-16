/**
 * Service and helpers for reading time and sleeping inside Effect programs.
 * The active `Clock` provides Unix time, monotonic time for measuring elapsed
 * durations, and a `sleep` operation for delaying work. Because time is
 * accessed through a service, tests can replace the clock with a controlled
 * implementation.
 *
 * @since 2.0.0
 */
import type * as Context from "./Context.ts"
import type * as Duration from "./Duration.ts"
import type { Effect } from "./Effect.ts"
import * as effect from "./internal/effect.ts"

/**
 * Represents a time-based clock which provides functionality related to time
 * and scheduling.
 *
 * **When to use**
 *
 * Use to define or provide a clock service for current-time and sleep
 * operations.
 *
 * **Example** (Reading current time)
 *
 * ```ts import.meta.vitest
 * import { Clock, Effect } from "effect"
 *
 * const testClock: Clock.Clock = {
 *   currentTimeMillisUnsafe: () => 1_000,
 *   currentTimeMillis: Effect.succeed(1_000),
 *   monotonicTimeNanosUnsafe: () => 1_000_000_000n,
 *   monotonicTimeNanos: Effect.succeed(1_000_000_000n),
 *   currentTimeNanosUnsafe: () => 1_000_000_000n,
 *   currentTimeNanos: Effect.succeed(1_000_000_000n),
 *   sleep: () => Effect.void
 * }
 *
 * const clockOperations = Effect.gen(function*() {
 *   const currentTime = yield* Clock.currentTimeMillis
 *   const currentTimeNanos = yield* Clock.currentTimeNanos
 *   return [currentTime, currentTimeNanos] as const
 * })
 *
 * await Effect.runPromise(Effect.provideService(clockOperations, Clock.Clock, testClock)) // => [1_000, 1_000_000_000n]
 * ```
 *
 * @category services
 * @since 2.0.0
 */
export interface Clock {
  /**
   * Returns the current Unix time in milliseconds unsafely.
   *
   * **When to use**
   *
   * Use to read a wall-clock timestamp synchronously when you already have a
   * `Clock` service and can accept non-effectful access.
   *
   * **Gotchas**
   *
   * The value can move backward or forward when the system wall clock is
   * corrected, so it is not suitable for measuring elapsed time.
   */
  currentTimeMillisUnsafe(): number
  /**
   * Returns the current Unix time in milliseconds.
   *
   * **When to use**
   *
   * Use to read a wall-clock timestamp through this `Clock` service in
   * `Effect`.
   *
   * **Gotchas**
   *
   * The value can move backward or forward when the system wall clock is
   * corrected, so it is not suitable for measuring elapsed time.
   */
  readonly currentTimeMillis: Effect<number>
  /**
   * Returns the current Unix time in nanoseconds unsafely.
   *
   * **When to use**
   *
   * Use to read a wall-clock timestamp synchronously when you already have a
   * `Clock` service and can accept non-effectful access.
   *
   * **Gotchas**
   *
   * The value can move backward or forward when the system wall clock is
   * corrected, so it is not suitable for measuring elapsed time.
   */
  currentTimeNanosUnsafe(): bigint
  /**
   * Returns the current Unix time in nanoseconds.
   *
   * **When to use**
   *
   * Use to read a wall-clock timestamp through this `Clock` service in
   * `Effect`.
   *
   * **Gotchas**
   *
   * The value can move backward or forward when the system wall clock is
   * corrected, so it is not suitable for measuring elapsed time.
   */
  readonly currentTimeNanos: Effect<bigint>
  /**
   * Returns the current monotonic time in nanoseconds unsafely.
   *
   * **When to use**
   *
   * Use to measure elapsed time synchronously when you already have a `Clock`
   * service and can accept non-effectful access.
   *
   * **Gotchas**
   *
   * The value has an arbitrary origin and is unsuitable for serialization. Use
   * it only to subtract readings produced by the same clock. Whether it
   * advances while the host is suspended depends on the runtime.
   *
   * @since 4.0.0
   */
  monotonicTimeNanosUnsafe(): bigint
  /**
   * Returns the current monotonic time in nanoseconds.
   *
   * **When to use**
   *
   * Use to measure elapsed time through this `Clock` service in `Effect`.
   *
   * **Gotchas**
   *
   * The value has an arbitrary origin and is unsuitable for serialization. Use
   * it only to subtract readings produced by the same clock. Whether it
   * advances while the host is suspended depends on the runtime.
   *
   * @since 4.0.0
   */
  readonly monotonicTimeNanos: Effect<bigint>
  /**
   * Asynchronously sleeps for the specified duration.
   *
   * **When to use**
   *
   * Use to delay an `Effect` workflow by a duration through this `Clock` service.
   */
  sleep(duration: Duration.Duration): Effect<void>
}

/**
 * Context reference for the active time service in the environment.
 *
 * **When to use**
 *
 * Use when you need to access or provide the full time service, including sleep
 * operations, rather than a single timestamp accessor.
 *
 * **Example** (Accessing the Clock service)
 *
 * ```ts import.meta.vitest
 * import { Clock, Effect } from "effect"
 *
 * const testClock: Clock.Clock = {
 *   currentTimeMillisUnsafe: () => 1_000,
 *   currentTimeMillis: Effect.succeed(1_000),
 *   monotonicTimeNanosUnsafe: () => 1_000_000_000n,
 *   monotonicTimeNanos: Effect.succeed(1_000_000_000n),
 *   currentTimeNanosUnsafe: () => 1_000_000_000n,
 *   currentTimeNanos: Effect.succeed(1_000_000_000n),
 *   sleep: () => Effect.void
 * }
 *
 * const program = Effect.gen(function*() {
 *   const clock = yield* Clock.Clock
 *   return clock.currentTimeMillisUnsafe()
 * })
 *
 * await Effect.runPromise(Effect.provideService(program, Clock.Clock, testClock)) // => 1_000
 * ```
 *
 * @see {@link clockWith} for using the current Clock service inside an effect
 * @see {@link currentTimeMillis} for reading the current time in milliseconds
 * @see {@link currentTimeNanos} for reading the current time in nanoseconds
 *
 * @category services
 * @since 2.0.0
 */
export const Clock: Context.Reference<Clock> = effect.ClockRef

/**
 * Accesses the current Clock service and uses it to run the provided function.
 *
 * **When to use**
 *
 * Use when you need the full Clock service interface to perform multiple time
 * operations or call unsafe variants within a single effect.
 *
 * **Example** (Accessing the current Clock service)
 *
 * ```ts import.meta.vitest
 * import { Clock, Effect } from "effect"
 *
 * const testClock: Clock.Clock = {
 *   currentTimeMillisUnsafe: () => 1_000,
 *   currentTimeMillis: Effect.succeed(1_000),
 *   monotonicTimeNanosUnsafe: () => 1_000_000_000n,
 *   monotonicTimeNanos: Effect.succeed(1_000_000_000n),
 *   currentTimeNanosUnsafe: () => 1_000_000_000n,
 *   currentTimeNanos: Effect.succeed(1_000_000_000n),
 *   sleep: () => Effect.void
 * }
 *
 * const program = Clock.clockWith((clock) => Effect.sync(() => clock.currentTimeMillisUnsafe()))
 *
 * await Effect.runPromise(Effect.provideService(program, Clock.Clock, testClock)) // => 1_000
 * ```
 *
 * @see {@link Clock} for the service reference
 * @see {@link currentTimeMillis} for convenience accessor that returns milliseconds
 * @see {@link currentTimeNanos} for convenience accessor that returns nanoseconds
 * @category accessors
 * @since 2.0.0
 */
export const clockWith: <A, E, R>(f: (clock: Clock) => Effect<A, E, R>) => Effect<A, E, R> = effect.clockWith

/**
 * Returns an Effect that succeeds with the current Unix time in milliseconds.
 *
 * **When to use**
 *
 * Use to create wall-clock timestamps from the active `Clock` service with
 * millisecond precision.
 *
 * **Gotchas**
 *
 * The value can move backward or forward when the system wall clock is
 * corrected, so it is not suitable for measuring elapsed time.
 *
 * **Example** (Reading milliseconds)
 *
 * ```ts import.meta.vitest
 * import { Clock, Effect } from "effect"
 *
 * const testClock: Clock.Clock = {
 *   currentTimeMillisUnsafe: () => 1_000,
 *   currentTimeMillis: Effect.succeed(1_000),
 *   monotonicTimeNanosUnsafe: () => 1_000_000_000n,
 *   monotonicTimeNanos: Effect.succeed(1_000_000_000n),
 *   currentTimeNanosUnsafe: () => 1_000_000_000n,
 *   currentTimeNanos: Effect.succeed(1_000_000_000n),
 *   sleep: () => Effect.void
 * }
 *
 * await Effect.runPromise(Effect.provideService(Clock.currentTimeMillis, Clock.Clock, testClock)) // => 1_000
 * ```
 *
 * @see {@link currentTimeNanos} for nanosecond precision
 * @see {@link monotonicTimeNanos} for measuring elapsed time
 * @see {@link clockWith} for accessing the full Clock service
 *
 * @category accessors
 * @since 2.0.0
 */
export const currentTimeMillis: Effect<number> = effect.currentTimeMillis

/**
 * Returns an Effect that succeeds with the current Unix time in nanoseconds.
 *
 * **When to use**
 *
 * Use to create wall-clock timestamps from the active `Clock` service with
 * nanosecond precision.
 *
 * **Gotchas**
 *
 * The value can move backward or forward when the system wall clock is
 * corrected, so it is not suitable for measuring elapsed time.
 * The live clock allows up to one second of drift from `Date.now()` before
 * re-anchoring.
 *
 * **Example** (Reading nanoseconds)
 *
 * ```ts import.meta.vitest
 * import { Clock, Effect } from "effect"
 *
 * const testClock: Clock.Clock = {
 *   currentTimeMillisUnsafe: () => 1_000,
 *   currentTimeMillis: Effect.succeed(1_000),
 *   monotonicTimeNanosUnsafe: () => 1_000_000_000n,
 *   monotonicTimeNanos: Effect.succeed(1_000_000_000n),
 *   currentTimeNanosUnsafe: () => 1_000_000_000n,
 *   currentTimeNanos: Effect.succeed(1_000_000_000n),
 *   sleep: () => Effect.void
 * }
 *
 * await Effect.runPromise(Effect.provideService(Clock.currentTimeNanos, Clock.Clock, testClock)) // => 1_000_000_000n
 * ```
 *
 * @see {@link monotonicTimeNanos} for measuring elapsed time
 *
 * @category accessors
 * @since 2.0.0
 */
export const currentTimeNanos: Effect<bigint> = effect.currentTimeNanos

/**
 * Returns an Effect that succeeds with the current monotonic time in
 * nanoseconds.
 *
 * **When to use**
 *
 * Use to measure elapsed time by subtracting two readings.
 *
 * **Gotchas**
 *
 * The value has an arbitrary origin and is unsuitable for serialization. Use
 * it only to subtract readings produced by the same clock. Whether it advances
 * while the host is suspended depends on the runtime.
 *
 * @see {@link currentTimeNanos} for Unix wall-clock timestamps
 *
 * @category accessors
 * @since 4.0.0
 */
export const monotonicTimeNanos: Effect<bigint> = effect.monotonicTimeNanos
