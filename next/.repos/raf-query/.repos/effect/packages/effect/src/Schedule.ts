/**
 * Describes policies for retrying, repeating, and pacing Effect programs.
 *
 * A `Schedule<Output, Input, Error, Env>` is stepped with an input value. Each
 * step either stops or produces an output together with the delay before the
 * next step. Schedules are used by retry, repeat, stream, and channel APIs to
 * decide when work should continue, how long to wait, and when to stop.
 *
 * @since 2.0.0
 */
import type { NonEmptyReadonlyArray } from "./Array.ts"
import * as Cause from "./Cause.ts"
import * as Context from "./Context.ts"
import * as Cron from "./Cron.ts"
import type * as DateTime from "./DateTime.ts"
import * as Duration from "./Duration.ts"
import type { Effect } from "./Effect.ts"
import { constant, dual, identity } from "./Function.ts"
import { isEffect } from "./internal/core.ts"
import * as effect from "./internal/effect.ts"
import * as random from "./internal/random.ts"
import { type Pipeable, pipeArguments } from "./Pipeable.ts"
import { hasProperty } from "./Predicate.ts"
import * as Pull from "./Pull.ts"
import * as Result from "./Result.ts"
import type { Contravariant, Covariant, Mutable, UnionToIntersection } from "./Types.ts"

const TypeId = "~effect/Schedule"

const randomNext: Effect<number> = random.Random.useSync((random) => random.nextDoubleUnsafe())

/**
 * A Schedule defines a strategy for repeating or retrying effects based on some policy.
 *
 * **Example** (Defining retry and repeat schedules)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schedule } from "effect"
 * import { TestClock } from "effect/testing"
 *
 * const executions: Array<number> = []
 * const program = Effect.sync(() => executions.push(executions.length + 1)).pipe(
 *   Effect.repeat(Schedule.recurs(2)),
 *   Effect.as(executions)
 * )
 *
 * await Effect.runPromise(Effect.provide(program, TestClock.layer())) // => [1, 2, 3]
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface Schedule<out Output, in Input = unknown, out Error = never, out Env = never>
  extends Schedule.Variance<Output, Input, Error, Env>, Pipeable
{}

/**
 * Metadata provided to schedule functions containing timing and input information.
 *
 * @category metadata
 * @since 4.0.0
 */
export interface InputMetadata<Input> {
  readonly input: Input
  readonly attempt: number
  readonly start: number
  readonly now: number
  readonly elapsed: number
  readonly elapsedSincePrevious: number
}

/**
 * Extended metadata that includes both input metadata and the output value from the schedule.
 *
 * @category metadata
 * @since 4.0.0
 */
export interface Metadata<Output = unknown, Input = unknown> extends InputMetadata<Input> {
  readonly output: Output
  readonly duration: Duration.Duration
}

/**
 * Context reference containing metadata for the currently running schedule step.
 *
 * **Details**
 *
 * Repeat, retry, stream, and channel scheduling operations provide this service
 * to effects run between schedule steps. The default value contains undefined
 * input and output values, zero duration, and zeroed timing fields before any
 * schedule step has produced metadata.
 *
 * @category services
 * @since 4.0.0
 */
export const CurrentMetadata = Context.Reference<Metadata>("effect/Schedule/CurrentMetadata", {
  defaultValue: constant({
    input: undefined,
    output: undefined,
    duration: Duration.zero,
    attempt: 0,
    start: 0,
    now: 0,
    elapsed: 0,
    elapsedSincePrevious: 0
  })
})

/**
 * The Schedule namespace contains types and utilities for working with schedules.
 *
 * @since 2.0.0
 */
export declare namespace Schedule {
  /**
   * Variance interface that defines the type parameter relationships for Schedule.
   *
   * **Example** (Understanding schedule variance)
   *
   * ```ts import.meta.vitest
   * import { Schedule } from "effect"
   *
   * const schedule: Schedule.Schedule<number, unknown, never, never> = Schedule.recurs(2)
   * Schedule.isSchedule(schedule) // => true
   * ```
   *
   * @category models
   * @since 2.0.0
   */
  export interface Variance<out Output, in Input, out Error, out Env> {
    readonly [TypeId]: VarianceStruct<Output, Input, Error, Env>
  }

  /**
   * Type-level marker used by `Schedule.Variance` to record the variance of
   * `Schedule` type parameters.
   *
   * **Details**
   *
   * This interface exists for TypeScript inference and assignability. Users
   * normally do not construct or inspect it directly.
   *
   * @category models
   * @since 4.0.0
   */
  export interface VarianceStruct<out Output, in Input, out Error, out Env> {
    readonly _Out: Covariant<Output>
    readonly _In: Contravariant<Input>
    readonly _Error: Covariant<Error>
    readonly _Env: Covariant<Env>
  }
}

/**
 * Extracts the output type from a `Schedule`.
 *
 * @category utility types
 * @since 4.0.0
 */
export type Output<S> = S extends Schedule<infer Output, any, any, any> ? Output : never

/**
 * Extracts the input type from a `Schedule`.
 *
 * @category utility types
 * @since 4.0.0
 */
export type Input<S> = S extends Schedule<any, infer Input, any, any> ? Input : never

/**
 * Extracts the error type from a `Schedule`.
 *
 * @category utility types
 * @since 4.0.0
 */
export type Error<S> = S extends Schedule<any, any, infer Error, any> ? Error : never

/**
 * Extracts the service requirements from a `Schedule`.
 *
 * @category utility types
 * @since 4.0.0
 */
export type Env<S> = S extends Schedule<any, any, any, infer Env> ? Env : never

const ScheduleProto = {
  [TypeId]: {
    _Out: identity,
    _In: identity,
    _Env: identity
  },
  pipe() {
    return pipeArguments(this, arguments)
  }
}

/**
 * Type guard that checks if a value is a Schedule.
 *
 * **Example** (Checking for schedules)
 *
 * ```ts import.meta.vitest
 * import { Schedule } from "effect"
 *
 * const schedule = Schedule.exponential("100 millis")
 * const notSchedule = { foo: "bar" }
 *
 * Schedule.isSchedule(schedule) // => true
 * Schedule.isSchedule(notSchedule) // => false
 * Schedule.isSchedule(null) // => false
 * Schedule.isSchedule(undefined) // => false
 * ```
 *
 * @category guards
 * @since 2.0.0
 */
export const isSchedule = (u: unknown): u is Schedule<unknown, never, unknown, unknown> => hasProperty(u, TypeId)

/**
 * Creates a Schedule from a step function that returns a Pull.
 *
 * **Example** (Creating a custom schedule from a step function)
 *
 * ```ts import.meta.vitest
 * import { Cause, Duration, Effect, Schedule } from "effect"
 *
 * const schedule = Schedule.fromStep(Effect.sync(() => {
 *   let count = 0
 *
 *   return (_now: number, _input: string) => {
 *     if (count >= 3) {
 *       return Cause.done(count)
 *     }
 *     return Effect.succeed([count++, Duration.millis(100)] as [number, Duration.Duration])
 *   }
 * }))
 *
 * const program = Effect.gen(function*() {
 *   const step = yield* Schedule.toStep(schedule)
 *   const [output] = yield* step(0, "input")
 *   return output
 * })
 *
 * await Effect.runPromise(program) // => 0
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromStep = <Input, Output, EnvX, Error, ErrorX, Env>(
  step: Effect<
    (now: number, input: Input) => Pull.Pull<[Output, Duration.Duration], ErrorX, Output, EnvX>,
    Error,
    Env
  >
): Schedule<Output, Input, Error | Pull.ExcludeDone<ErrorX>, Env | EnvX> => {
  const self = Object.create(ScheduleProto)
  self.step = step
  return self
}

const metadataFn = () => {
  let n = 0
  let previous: number | undefined
  let start: number | undefined
  return <In>(now: number, input: In): InputMetadata<In> => {
    if (start === undefined) start = now
    const elapsed = now - start
    const elapsedSincePrevious = previous === undefined ? 0 : now - previous
    previous = now
    return { input, attempt: ++n, start, now, elapsed, elapsedSincePrevious }
  }
}

/**
 * Creates a Schedule from a step function that receives metadata about the schedule's execution.
 *
 * **Example** (Creating a metadata-aware schedule)
 *
 * ```ts import.meta.vitest
 * import { Cause, Duration, Effect, Schedule } from "effect"
 *
 * const firstThreeInputs = Schedule.fromStepWithMetadata(Effect.succeed((metadata: Schedule.InputMetadata<string>) => {
 *   if (metadata.attempt > 3) {
 *     return Cause.done("finished")
 *   }
 *
 *   return Effect.succeed([
 *     `attempt ${metadata.attempt}: ${metadata.input}`,
 *     Duration.millis(250)
 *   ] as [string, Duration.Duration])
 * }))
 *
 * const program = Effect.gen(function*() {
 *   const step = yield* Schedule.toStep(firstThreeInputs)
 *   const [output] = yield* step(0, "input")
 *   return output
 * })
 *
 * await Effect.runPromise(program) // => "attempt 1: input"
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromStepWithMetadata = <Input, Output, EnvX, ErrorX, Error, Env>(
  step: Effect<
    (options: InputMetadata<Input>) => Pull.Pull<[Output, Duration.Duration], ErrorX, Output, EnvX>,
    Error,
    Env
  >
): Schedule<Output, Input, Error | Pull.ExcludeDone<ErrorX>, Env | EnvX> =>
  fromStep(effect.map(step, (f) => {
    const meta = metadataFn()
    return (now, input) => f(meta(now, input))
  }))

/**
 * Extracts the step function from a Schedule.
 *
 * **Example** (Extracting a schedule step function)
 *
 * ```ts import.meta.vitest
 * import { Duration, Effect, Schedule } from "effect"
 *
 * // Extract step function from an existing schedule
 * const schedule = Schedule.exponential("100 millis").pipe(Schedule.upTo({ times: 3 }))
 *
 * const program = Effect.gen(function*() {
 *   const stepFn = yield* Schedule.toStep(schedule)
 *
 *   // Use the step function directly for custom logic. The timestamp is
 *   // supplied by the caller, so tests can pass a deterministic value.
 *   const now = 0
 *   return yield* stepFn(now, "input")
 * })
 *
 * await Effect.runPromise(program) // => [Duration.millis(100), Duration.millis(100)]
 * ```
 *
 * @category destructors
 * @since 4.0.0
 */
export const toStep = <Output, Input, Error, Env>(
  schedule: Schedule<Output, Input, Error, Env>
): Effect<
  (now: number, input: Input) => Pull.Pull<[Output, Duration.Duration], Error, Output, Env>,
  never,
  Env
> =>
  effect.catchCause(
    (schedule as any).step,
    (cause) => effect.succeed(() => effect.failCause(cause) as any)
  )

/**
 * Extracts a step function from a `Schedule` that sleeps for each computed
 * delay and returns metadata for the completed step.
 *
 * **When to use**
 *
 * Use to drive a schedule manually while preserving the computed output,
 * delay, input, attempt, and elapsed timing metadata for each step.
 *
 * **Details**
 *
 * The returned step reads the current time from `Clock` when invoked, calls the
 * schedule step with that timestamp and input, sleeps for the returned
 * duration, and then yields `Metadata`.
 *
 * @see {@link toStep} for manually supplying the timestamp and handling the returned delay yourself
 * @see {@link toStepWithSleep} for the same automatic sleeping behavior when only the schedule output is needed
 *
 * @category destructors
 * @since 4.0.0
 */
export const toStepWithMetadata = <Output, Input, Error, Env>(
  schedule: Schedule<Output, Input, Error, Env>
): Effect<
  (input: Input) => Pull.Pull<Metadata<Output, Input>, Error, Output, Env>,
  never,
  Env
> =>
  effect.clockWith((clock) =>
    effect.map(
      toStep(schedule),
      (step) => {
        const metaFn = metadataFn()
        return (input) =>
          effect.suspend(() => {
            const now = clock.currentTimeMillisUnsafe()
            return effect.flatMap(
              step(now, input),
              ([output, duration]) => {
                const meta = metaFn(now, input) as Mutable<Metadata<Output, Input>>
                meta.output = output
                meta.duration = duration
                return effect.as(effect.sleep(duration), meta)
              }
            )
          })
      }
    )
  )

/**
 * Extracts a step function from a Schedule that automatically handles sleep delays.
 *
 * **Example** (Extracting a sleeping step function)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schedule } from "effect"
 * import { TestClock } from "effect/testing"
 *
 * const schedule = Schedule.recurs(3)
 *
 * const program = Effect.gen(function*() {
 *   const stepWithSleep = yield* Schedule.toStepWithSleep(schedule)
 *
 *   return [yield* stepWithSleep("first"), yield* stepWithSleep("second")]
 * })
 *
 * await Effect.runPromise(Effect.provide(program, TestClock.layer())) // => [0, 1]
 * ```
 *
 * @category destructors
 * @since 4.0.0
 */
export const toStepWithSleep = <Output, Input, Error, Env>(
  schedule: Schedule<Output, Input, Error, Env>
): Effect<
  (input: Input) => Pull.Pull<Output, Error, Output, Env>,
  never,
  Env
> =>
  effect.map(
    toStepWithMetadata(schedule),
    (step) => (input) => effect.map(step(input), (meta) => meta.output)
  )

/**
 * Returns a new `Schedule` that adds the delay computed by the specified
 * effectful function to the next recurrence of the schedule.
 *
 * **Example** (Adding extra delay to a schedule)
 *
 * ```ts import.meta.vitest
 * import { Duration, Effect, Schedule } from "effect"
 *
 * const schedule = Schedule.recurs(1).pipe(
 *   Schedule.addDelay(() => Effect.succeed("25 millis"))
 * )
 * const program = Effect.gen(function*() {
 *   const step = yield* Schedule.toStep(schedule)
 *   const [, delay] = yield* step(0, undefined)
 *   return delay
 * })
 *
 * await Effect.runPromise(program) // => Duration.millis(25)
 * ```
 *
 * @category delays & timeouts
 * @since 2.0.0
 */
export const addDelay: {
  <Output, Input, Error2 = never, Env2 = never>(
    f: (metadata: Metadata<Output, Input>) => Effect<Duration.Input, Error2, Env2>
  ): <Error, Env>(
    self: Schedule<Output, Input, Error, Env>
  ) => Schedule<Output, Input, Error | Error2, Env | Env2>
  <Output, Input, Error, Env, Error2 = never, Env2 = never>(
    self: Schedule<Output, Input, Error, Env>,
    f: (metadata: Metadata<Output, Input>) => Effect<Duration.Input, Error2, Env2>
  ): Schedule<Output, Input, Error | Error2, Env | Env2>
} = dual(2, <Output, Input, Error, Env, Error2 = never, Env2 = never>(
  self: Schedule<Output, Input, Error, Env>,
  f: (metadata: Metadata<Output, Input>) => Effect<Duration.Input, Error2, Env2>
): Schedule<Output, Input, Error | Error2, Env | Env2> =>
  modifyDelay(
    self,
    (metadata) => effect.map(f(metadata), (d) => Duration.sum(Duration.fromInputUnsafe(d), metadata.duration))
  ))

/**
 * Returns a schedule that runs `self` to completion, then runs `other`, and
 * merges their outputs.
 *
 * **Example** (Sequencing quick and slow retries)
 *
 * ```ts import.meta.vitest
 * import { Schedule } from "effect"
 *
 * const schedule = Schedule.concat(Schedule.recurs(1), Schedule.recurs(2))
 * Schedule.isSchedule(schedule) // => true
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const concat: {
  <Output2, Input2, Error2, Env2>(
    other: Schedule<Output2, Input2, Error2, Env2>
  ): <Output, Input, Error, Env>(
    self: Schedule<Output, Input, Error, Env>
  ) => Schedule<Output | Output2, Input & Input2, Error | Error2, Env | Env2>
  <Output, Input, Error, Env, Output2, Input2, Error2, Env2>(
    self: Schedule<Output, Input, Error, Env>,
    other: Schedule<Output2, Input2, Error2, Env2>
  ): Schedule<Output | Output2, Input & Input2, Error | Error2, Env | Env2>
} = dual(2, <Output, Input, Error, Env, Output2, Input2, Error2, Env2>(
  self: Schedule<Output, Input, Error, Env>,
  other: Schedule<Output2, Input2, Error2, Env2>
): Schedule<Output | Output2, Input & Input2, Error | Error2, Env | Env2> =>
  map(concatResult(self, other), ({ output }) => effect.succeed(Result.merge(output))))

/**
 * Returns a schedule that runs `self` to completion, then runs `other`, and
 * preserves which schedule produced each output.
 *
 * **Details**
 *
 * The resulting schedule emits a `Result` to indicate which phase produced
 * each output: outputs from `self` are emitted as `Failure`, and outputs from
 * `other` are emitted as `Success`.
 *
 * **Example** (Tracking sequential schedule phases)
 *
 * ```ts import.meta.vitest
 * import { Schedule } from "effect"
 *
 * const schedule = Schedule.concatResult(Schedule.recurs(1), Schedule.recurs(2))
 * Schedule.isSchedule(schedule) // => true
 * ```
 *
 * @category sequencing
 * @since 4.0.0
 */
export const concatResult: {
  <Output2, Input2, Error2, Env2>(
    other: Schedule<Output2, Input2, Error2, Env2>
  ): <Output, Input, Error, Env>(
    self: Schedule<Output, Input, Error, Env>
  ) => Schedule<Result.Result<Output2, Output>, Input & Input2, Error | Error2, Env | Env2>
  <Output, Input, Error, Env, Output2, Input2, Error2, Env2>(
    self: Schedule<Output, Input, Error, Env>,
    other: Schedule<Output2, Input2, Error2, Env2>
  ): Schedule<Result.Result<Output2, Output>, Input & Input2, Error | Error2, Env | Env2>
} = dual(2, <Output, Input, Error, Env, Output2, Input2, Error2, Env2>(
  self: Schedule<Output, Input, Error, Env>,
  other: Schedule<Output2, Input2, Error2, Env2>
): Schedule<Result.Result<Output2, Output>, Input & Input2, Error | Error2, Env | Env2> =>
  fromStep(effect.sync(() => {
    let currentSide = 0
    let currentStep:
      | undefined
      | ((now: number, input: Input & Input2) => Pull.Pull<
        [Result.Result<Output2, Output>, Duration.Duration],
        Error | Error2,
        Result.Result<Output2, Output>,
        Env | Env2
      >)
    const left = map(self, ({ output }) => Result.fail(output))
    const right = map(other, ({ output }) => Result.succeed(output))
    return function recur(
      now,
      input
    ): Pull.Pull<
      [Result.Result<Output2, Output>, Duration.Duration],
      Error | Error2,
      Result.Result<Output2, Output>,
      Env | Env2
    > {
      if (currentStep) return currentStep(now, input)
      return toStep<
        Result.Result<Output2, Output>,
        Input & Input2,
        Error | Error2,
        Env | Env2
      >(currentSide === 0 ? left : right).pipe(
        effect.flatMap((step) => {
          currentSide++
          if (currentSide === 1) {
            currentStep = (now, input) =>
              Pull.catchDone(step(now, input), (_) => {
                currentStep = undefined
                return recur(now, input)
              })
            return currentStep(now, input)
          }
          currentStep = step
          return currentStep(now, input)
        })
      )
    }
  })))

/**
 * Combines schedules by recurring while all schedules want to recur, using the
 * maximum delay between recurrences and outputting that maximum delay.
 *
 * **When to use**
 *
 * Use when a combined policy should continue only while every schedule still
 * recurs, and should wait for the slowest schedule between recurrences.
 *
 * **Example** (Combining retry schedules by their maximum delay)
 *
 * ```ts import.meta.vitest
 * import { Schedule } from "effect"
 *
 * const schedule = Schedule.max([Schedule.fixed("5 seconds"), Schedule.spaced("10 seconds")])
 * Schedule.isSchedule(schedule) // => true
 * ```
 *
 * @category combining
 * @since 4.0.0
 */
export const max = <
  const Schedules extends NonEmptyReadonlyArray<
    Schedule<any, any, any, any>
  >
>(
  schedules: Schedules
): Schedule<
  Duration.Duration,
  UnionToIntersection<
    Input<Schedules[number]>
  >,
  Error<Schedules[number]>,
  Env<Schedules[number]>
> =>
  fromStep(effect.map(
    effect.all(schedules.map(toStep)),
    (steps) => (now, input) =>
      effect.flatMap(
        effect.forEach(steps, (step) =>
          Pull.matchEffect(step(now, input as never), {
            onSuccess: (result) => effect.succeed(result[1]),
            onDone: () => effect.undefined,
            onFailure: effect.failCause
          })),
        (results) => {
          const duration = maxDuration(results)
          if (duration === undefined) {
            return Cause.done(Duration.zero)
          }
          return effect.succeed([duration, duration] as [Duration.Duration, Duration.Duration])
        }
      )
  ))

const maxDuration = (results: ReadonlyArray<Duration.Duration | undefined>): Duration.Duration | undefined => {
  let max = results[0]
  for (let i = 1; i < results.length; i++) {
    max = results[i] && max && Duration.max(max, results[i]!)
    if (max === undefined) break
  }

  return max
}

/**
 * Returns a new `Schedule` that recurs on the specified `Cron` schedule and
 * outputs the duration between recurrences.
 *
 * **Example** (Scheduling work with cron expressions)
 *
 * ```ts import.meta.vitest
 * import { Schedule } from "effect"
 *
 * const everyMinute = Schedule.cron("* * * * *")
 * Schedule.isSchedule(everyMinute) // => true
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const cron: {
  (expression: Cron.Cron): Schedule<Duration.Duration, unknown, Cron.CronParseError>
  (expression: string, tz?: string | DateTime.TimeZone): Schedule<Duration.Duration, unknown, Cron.CronParseError>
} = (expression: string | Cron.Cron, tz?: string | DateTime.TimeZone) => {
  const parsed = Cron.isCron(expression) ? Result.succeed(expression) : Cron.parse(expression, tz)
  return fromStep(effect.map(effect.fromResult(parsed), (cron) => (now, _) => {
    if (now === Number.POSITIVE_INFINITY) {
      return Cause.done(Duration.zero)
    }
    return effect.sync(() => {
      const next = Cron.next(cron, now).getTime()
      const duration = Duration.millis(next - now)
      return [duration, duration]
    })
  }))
}

/**
 * Returns a schedule that recurs once after the specified duration.
 *
 * **When to use**
 *
 * Use when you need a schedule that recurs once after a fixed delay.
 *
 * **Details**
 *
 * The schedule outputs the configured duration for its first recurrence and
 * then completes.
 *
 * **Example** (Recurring once after a duration)
 *
 * ```ts import.meta.vitest
 * import { Schedule } from "effect"
 *
 * Schedule.isSchedule(Schedule.duration("1 second")) // => true
 * ```
 *
 * @see {@link during} for recurring until a duration has elapsed
 *
 * @category constructors
 * @since 2.0.0
 */
export const duration = (durationInput: Duration.Input): Schedule<Duration.Duration> => {
  const duration = Duration.fromInputUnsafe(durationInput)
  return fromStepWithMetadata(effect.succeed((meta) =>
    meta.attempt === 1
      ? effect.succeed([duration, duration])
      : Cause.done(Duration.zero)
  ))
}

/**
 * Returns a new `Schedule` that will always recur, but only during the
 * specified `duration` of time.
 *
 * **When to use**
 *
 * Use to bound a repeating or retrying schedule by elapsed time.
 *
 * **Example** (Repeating work during a duration)
 *
 * ```ts import.meta.vitest
 * import { Schedule } from "effect"
 *
 * Schedule.isSchedule(Schedule.during("5 seconds")) // => true
 * ```
 *
 * @see {@link duration} for one delayed recurrence
 *
 * @category constructors
 * @since 4.0.0
 */
export const during = (duration: Duration.Input): Schedule<Duration.Duration> => {
  const durationMillis = Duration.toMillis(duration)
  return fromStepWithMetadata(
    effect.succeed((meta) => {
      const elapsed = Duration.millis(meta.elapsed)
      return meta.elapsed > durationMillis
        ? Cause.done(elapsed)
        : effect.succeed([elapsed, Duration.zero])
    })
  )
}

/**
 * Combines schedules by recurring while at least one schedule wants to recur,
 * using the minimum delay between recurrences and outputting that minimum delay.
 *
 * **When to use**
 *
 * Use when a combined policy should continue while any schedule still recurs,
 * and should wait for the fastest schedule between recurrences.
 *
 * **Example** (Combining retry schedules by their minimum delay)
 *
 * ```ts import.meta.vitest
 * import { Schedule } from "effect"
 *
 * const schedule = Schedule.min([Schedule.fixed("5 seconds"), Schedule.spaced("10 seconds")])
 * Schedule.isSchedule(schedule) // => true
 * ```
 *
 * @category combining
 * @since 4.0.0
 */
export const min = <
  const Schedules extends NonEmptyReadonlyArray<
    Schedule<any, any, any, any>
  >
>(
  schedules: Schedules
): Schedule<
  Duration.Duration,
  UnionToIntersection<
    Input<Schedules[number]>
  >,
  Error<Schedules[number]>,
  Env<Schedules[number]>
> =>
  fromStep(effect.map(
    effect.all(schedules.map(toStep)),
    (steps) => (now, input) =>
      effect.flatMap(
        effect.forEach(steps, (step) =>
          Pull.matchEffect(step(now, input as never), {
            onSuccess: (result) => effect.succeed(result[1]),
            onDone: () => effect.undefined,
            onFailure: effect.failCause
          })),
        (results) => {
          const duration = minDuration(results)
          if (duration === undefined) {
            return Cause.done(Duration.zero)
          }
          return effect.succeed([duration, duration] as [Duration.Duration, Duration.Duration])
        }
      )
  ))

const minDuration = (results: ReadonlyArray<Duration.Duration | undefined>): Duration.Duration | undefined => {
  let min: Duration.Duration | undefined = undefined
  for (let i = 0; i < results.length; i++) {
    const duration = results[i]
    if (duration !== undefined) {
      min = min === undefined ? duration : Duration.min(min, duration)
    }
  }

  return min
}

/**
 * Schedule that always recurs, but will wait a certain amount between
 * repetitions, given by `base * factor.pow(n)`, where `n` is the number of
 * repetitions so far. Returns the current duration between recurrences.
 *
 * **Example** (Retrying with exponential backoff)
 *
 * ```ts import.meta.vitest
 * import { Duration, Effect, Schedule } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const step = yield* Schedule.toStep(Schedule.exponential("100 millis"))
 *   return yield* step(0, undefined)
 * })
 *
 * await Effect.runPromise(program) // => [Duration.millis(100), Duration.millis(100)]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const exponential = (
  base: Duration.Input,
  factor: number = 2
): Schedule<Duration.Duration> => {
  const baseMillis = Duration.toMillis(Duration.fromInputUnsafe(base))
  return fromStepWithMetadata(effect.succeed((meta) => {
    const duration = Duration.millis(baseMillis * Math.pow(factor, meta.attempt - 1))
    return effect.succeed([duration, duration])
  }))
}

/**
 * Schedule that always recurs, increasing delays by summing the preceding
 * two delays (similar to the Fibonacci sequence). Returns the current
 * duration between recurrences.
 *
 * **Example** (Retrying with Fibonacci backoff)
 *
 * ```ts import.meta.vitest
 * import { Duration, Effect, Schedule } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const step = yield* Schedule.toStep(Schedule.fibonacci("100 millis"))
 *   return yield* step(0, undefined)
 * })
 *
 * await Effect.runPromise(program) // => [Duration.millis(100), Duration.millis(100)]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fibonacci = (one: Duration.Input): Schedule<Duration.Duration> => {
  const oneMillis = Duration.toMillis(Duration.fromInputUnsafe(one))
  return fromStep(effect.sync(() => {
    let a = 0
    let b = oneMillis
    return constant(effect.sync(() => {
      const next = a + b
      a = b
      b = next
      const duration = Duration.millis(next)
      return [duration, duration]
    }))
  }))
}

/**
 * Returns a `Schedule` that recurs on the specified fixed `interval` and
 * outputs the number of repetitions of the schedule so far.
 *
 * **When to use**
 *
 * Use when recurrences should stay aligned to a regular cadence.
 *
 * **Gotchas**
 *
 * If the action run between recurrences takes longer than the interval, the
 * next recurrence happens immediately, but missed intervals are not replayed.
 *
 * ```text
 * |-----interval-----|-----interval-----|-----interval-----|
 * |---------action--------||action|-----|action|-----------|
 * ```
 *
 * **Example** (Repeating on fixed intervals)
 *
 * ```ts import.meta.vitest
 * import { Duration, Effect, Schedule } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const step = yield* Schedule.toStep(Schedule.fixed("1 second"))
 *   return yield* step(0, undefined)
 * })
 *
 * await Effect.runPromise(program) // => [0, Duration.seconds(1)]
 * ```
 *
 * @see {@link spaced} for delaying after each action completes
 *
 * @category constructors
 * @since 2.0.0
 */
export const fixed = (interval: Duration.Input): Schedule<number> => {
  const window = Duration.toMillis(Duration.fromInputUnsafe(interval))
  return fromStepWithMetadata(effect.sync(() => {
    let start = 0
    let lastRun = 0
    return (meta) =>
      effect.sync(() => {
        if (window === 0) {
          return [meta.attempt - 1, Duration.zero] as const
        }
        if (meta.attempt === 1) {
          start = meta.now
          lastRun = meta.now + window
          return [0, Duration.millis(window)] as const
        }
        const runningBehind = meta.now > (lastRun + window)
        const boundary = window - ((meta.now - start) % window)
        const delay = runningBehind ? 0 : boundary === 0 ? window : boundary
        lastRun = runningBehind ? meta.now : meta.now + delay
        return [meta.attempt - 1, Duration.millis(delay)] as const
      })
  }))
}

/**
 * Returns a new `Schedule` that maps each schedule decision to a new output
 * using the full schedule metadata.
 *
 * **Details**
 *
 * The callback receives the schedule input, output, selected delay duration,
 * current attempt, and elapsed timing information. Return either a plain value
 * or an `Effect` that produces the new output.
 *
 * **Example** (Mapping schedule outputs)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schedule } from "effect"
 *
 * const countSchedule = Schedule.recurs(5).pipe(
 *   Schedule.map(({ output: count }) => Effect.succeed(`Execution #${count + 1}`))
 * )
 * const program = Effect.gen(function*() {
 *   const step = yield* Schedule.toStep(countSchedule)
 *   const [output] = yield* step(0, undefined)
 *   return output
 * })
 *
 * await Effect.runPromise(program) // => "Execution #1"
 * ```
 *
 * @category mapping
 * @since 2.0.0
 */
export const map: {
  <Input, Output, Output2, Error2 = never, Env2 = never>(
    f: (metadata: Metadata<Output, Input>) => Output2 | Effect<Output2, Error2, Env2>
  ): <Error, Env>(
    self: Schedule<Output, Input, Error, Env>
  ) => Schedule<Output2, Input, Error | Error2, Env | Env2>
  <Output, Input, Error, Env, Output2, Error2 = never, Env2 = never>(
    self: Schedule<Output, Input, Error, Env>,
    f: (metadata: Metadata<Output, Input>) => Output2 | Effect<Output2, Error2, Env2>
  ): Schedule<Output2, Input, Error | Error2, Env | Env2>
} = dual(2, <Output, Input, Error, Env, Output2, Error2 = never, Env2 = never>(
  self: Schedule<Output, Input, Error, Env>,
  f: (metadata: Metadata<Output, Input>) => Output2 | Effect<Output2, Error2, Env2>
): Schedule<Output2, Input, Error | Error2, Env | Env2> =>
  fromStep(effect.map(toStep(self), (step) => {
    const meta = metadataFn()
    return (now, input) =>
      Pull.matchEffect(step(now, input), {
        onSuccess: ([output, duration]) => {
          const result = f({ ...meta(now, input), output, duration })
          if (!isEffect(result)) return effect.succeed([result, duration] as [Output2, Duration.Duration])
          return effect.map(result, (output) => [output, duration] as [Output2, Duration.Duration])
        },
        onFailure: effect.failCause<Error>,
        onDone: (output) => {
          const result = f({ ...meta(now, input), output, duration: Duration.zero })
          if (!isEffect(result)) return Cause.done(result as Output2)
          return effect.flatMap(result, Cause.done)
        }
      })
  })))

/**
 * Returns a new `Schedule` that modifies the delay of the next recurrence
 * of the schedule using the specified effectful function.
 *
 * **Example** (Modifying delays from schedule metadata)
 *
 * ```ts import.meta.vitest
 * import { Duration, Effect, Schedule } from "effect"
 *
 * const schedule = Schedule.spaced("10 millis").pipe(
 *   Schedule.modifyDelay(({ duration }) => Effect.succeed(Duration.times(duration, 2)))
 * )
 * const program = Effect.gen(function*() {
 *   const step = yield* Schedule.toStep(schedule)
 *   const [, delay] = yield* step(0, undefined)
 *   return delay
 * })
 *
 * await Effect.runPromise(program) // => Duration.millis(20)
 * ```
 *
 * @category delays & timeouts
 * @since 2.0.0
 */
export const modifyDelay: {
  <Output, Input, Error2 = never, Env2 = never>(
    f: (
      metadata: Metadata<Output, Input>
    ) => Effect<Duration.Input, Error2, Env2>
  ): <Error, Env>(
    self: Schedule<Output, Input, Error, Env>
  ) => Schedule<Output, Input, Error | Error2, Env | Env2>
  <Output, Input, Error, Env, Error2 = never, Env2 = never>(
    self: Schedule<Output, Input, Error, Env>,
    f: (
      metadata: Metadata<Output, Input>
    ) => Effect<Duration.Input, Error2, Env2>
  ): Schedule<Output, Input, Error | Error2, Env | Env2>
} = dual(2, <Output, Input, Error, Env, Error2 = never, Env2 = never>(
  self: Schedule<Output, Input, Error, Env>,
  f: (
    metadata: Metadata<Output, Input>
  ) => Effect<Duration.Input, Error2, Env2>
): Schedule<Output, Input, Error | Error2, Env | Env2> =>
  fromStep(effect.map(toStep(self), (step) => {
    const meta = metadataFn()
    return (now, input) =>
      effect.flatMap(
        step(now, input),
        ([output, duration]) =>
          effect.map(f({ ...meta(now, input), output, duration }), (replacement) => [
            output,
            Duration.fromInputUnsafe(replacement)
          ])
      )
  })))

/**
 * Returns a new `Schedule` that randomly adjusts each recurrence delay.
 *
 * **When to use**
 *
 * Use to add random variation to an existing schedule's recurrence delays while
 * preserving its output and completion behavior.
 *
 * **Details**
 *
 * Each recurrence delay is scaled by a random factor between `0.8` and `1.2`.
 *
 * @see {@link modifyDelay} for replacing recurrence delays with a custom effectful transformation
 *
 * @category delays & timeouts
 * @since 2.0.0
 */
export const jittered = <Output, Input, Error, Env>(
  self: Schedule<Output, Input, Error, Env>
): Schedule<Output, Input, Error, Env> =>
  modifyDelay(self, ({ duration }) =>
    effect.map(randomNext, (random) => {
      const millis = Duration.toMillis(duration)
      return Duration.millis(millis * 0.8 * (1 - random) + millis * 1.2 * random)
    }))

/**
 * Returns a new `Schedule` that outputs the inputs of the specified schedule.
 *
 * **Example** (Passing inputs through as outputs)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schedule } from "effect"
 *
 * const inputSchedule = Schedule.passthrough(
 *   Schedule.exponential("100 millis").pipe(Schedule.upTo({ times: 3 }))
 * )
 * const program = Effect.gen(function*() {
 *   const step = yield* Schedule.toStep(inputSchedule)
 *   const [output] = yield* step(0, "input")
 *   return output
 * })
 *
 * await Effect.runPromise(program) // => "input"
 * ```
 *
 * @category mapping
 * @since 2.0.0
 */
export const passthrough = <Output, Input, Error, Env>(
  self: Schedule<Output, Input, Error, Env>
): Schedule<Input, Input, Error, Env> =>
  fromStep(effect.map(toStep(self), (step) => (now, input) =>
    Pull.matchEffect(step(now, input), {
      onSuccess: (result) => effect.succeed([input, result[1]]),
      onFailure: effect.failCause,
      onDone: () => Cause.done(input)
    })))

/**
 * Returns a `Schedule` which can only be stepped the specified number of
 * `times` before it terminates.
 *
 * **When to use**
 *
 * Use when you need a counter schedule with no additional delay.
 *
 * **Gotchas**
 *
 * `recurs(n)` counts schedule recurrences, not the first evaluation of the
 * effect being repeated or retried. For retrying, this means one initial
 * attempt plus at most `n` retries.
 *
 * **Example** (Limiting recurrences)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schedule } from "effect"
 * import { TestClock } from "effect/testing"
 *
 * const executions: Array<number> = []
 * const program = Effect.sync(() => executions.push(executions.length + 1)).pipe(
 *   Effect.repeat(Schedule.recurs(3)),
 *   Effect.as(executions)
 * )
 *
 * await Effect.runPromise(Effect.provide(program, TestClock.layer())) // => [1, 2, 3, 4]
 * ```
 *
 * @see {@link upTo} for limiting an existing schedule
 *
 * @category constructors
 * @since 2.0.0
 */
export const recurs = (times: number): Schedule<number> =>
  while_(forever, ({ attempt }) => effect.succeed(attempt <= times))

/**
 * Returns a schedule that recurs continuously, each repetition spaced the
 * specified duration from the last run.
 *
 * **When to use**
 *
 * Use when each delay should start after the previous action completes.
 *
 * **Example** (Repeating with fixed spacing)
 *
 * ```ts import.meta.vitest
 * import { Duration, Effect, Schedule } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const step = yield* Schedule.toStep(Schedule.spaced("2 seconds"))
 *   return yield* step(0, undefined)
 * })
 *
 * await Effect.runPromise(program) // => [0, Duration.seconds(2)]
 * ```
 *
 * @see {@link fixed} for recurrence aligned to a regular cadence
 *
 * @category constructors
 * @since 2.0.0
 */
export const spaced = (duration: Duration.Input): Schedule<number> => {
  const decoded = Duration.fromInputUnsafe(duration)
  return fromStepWithMetadata(effect.succeed((meta) => effect.succeed([meta.attempt - 1, decoded])))
}

/**
 * Returns a new `Schedule` that allows execution of an effectful function for
 * every decision of the schedule, but does not alter the inputs and outputs of
 * the schedule.
 *
 * **Details**
 *
 * The callback receives the full schedule metadata, including the input, output,
 * computed delay duration, current attempt, and elapsed timing information.
 *
 * **Example** (Tapping schedule metadata)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schedule } from "effect"
 *
 * const attempts: Array<number> = []
 * const monitoredSchedule = Schedule.recurs(2).pipe(
 *   Schedule.tap((metadata) => Effect.sync(() => attempts.push(metadata.attempt)))
 * )
 * const program = Effect.gen(function*() {
 *   const step = yield* Schedule.toStep(monitoredSchedule)
 *   const [output] = yield* step(0, undefined)
 *   return { attempts, output }
 * })
 *
 * await Effect.runPromise(program) // => { attempts: [1], output: 0 }
 * ```
 *
 * @category sequencing
 * @since 4.0.0
 */
export const tap: {
  <Output, Input, X, Error2, Env2>(
    f: (metadata: Metadata<Output, Input>) => Effect<X, Error2, Env2>
  ): <Error, Env>(
    self: Schedule<Output, Input, Error, Env>
  ) => Schedule<Output, Input, Error | Error2, Env | Env2>
  <Output, Input, Error, Env, X, Error2, Env2>(
    self: Schedule<Output, Input, Error, Env>,
    f: (metadata: Metadata<Output, Input>) => Effect<X, Error2, Env2>
  ): Schedule<Output, Input, Error | Error2, Env | Env2>
} = dual(2, <Output, Input, Error, Env, X, Error2, Env2>(
  self: Schedule<Output, Input, Error, Env>,
  f: (metadata: Metadata<Output, Input>) => Effect<X, Error2, Env2>
): Schedule<Output, Input, Error | Error2, Env | Env2> =>
  fromStep(effect.map(toStep(self), (step) => {
    const meta = metadataFn()
    return (now, input) =>
      effect.tap(step(now, input), ([output, duration]) => f({ ...meta(now, input), output, duration }))
  })))

/**
 * Returns a new `Schedule` that limits an existing schedule by elapsed
 * duration, number of outputs, or both.
 *
 * **When to use**
 *
 * Use to bound an existing schedule while preserving its output and delay
 * behavior. When both `duration` and `times` are specified, the schedule
 * stops as soon as either limit is reached.
 *
 * **Gotchas**
 *
 * The `times` option limits schedule outputs. When used with repeat or retry,
 * the effect is evaluated once before the schedule is stepped, so the total
 * number of evaluations can be one greater than the configured number of
 * outputs.
 *
 * The `duration` option is based on the elapsed time observed by the schedule
 * step. Long-running effects can cause the duration limit to be detected on the
 * following schedule step.
 *
 * **Example** (Limiting by duration and recurrence count)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schedule } from "effect"
 * import { TestClock } from "effect/testing"
 *
 * const executions: Array<number> = []
 * const schedule = Schedule.forever.pipe(Schedule.upTo({ times: 2 }))
 * const program = Effect.sync(() => executions.push(executions.length + 1)).pipe(
 *   Effect.repeat(schedule),
 *   Effect.as(executions)
 * )
 *
 * await Effect.runPromise(Effect.provide(program, TestClock.layer())) // => [1, 2, 3]
 * ```
 *
 * @category filtering
 * @since 4.0.0
 */
export const upTo: {
  (options: {
    readonly duration?: Duration.Input | undefined
    readonly times?: number | undefined
  }): <Output, Input, Error, Env>(
    self: Schedule<Output, Input, Error, Env>
  ) => Schedule<Output, Input, Error, Env>
  <Output, Input, Error, Env>(
    self: Schedule<Output, Input, Error, Env>,
    options: {
      readonly duration?: Duration.Input | undefined
      readonly times?: number | undefined
    }
  ): Schedule<Output, Input, Error, Env>
} = dual(2, <Output, Input, Error, Env>(
  self: Schedule<Output, Input, Error, Env>,
  options: {
    readonly duration?: Duration.Input | undefined
    readonly times?: number | undefined
  }
): Schedule<Output, Input, Error, Env> => {
  const duration = options.duration === undefined ? undefined : Duration.fromInputUnsafe(options.duration)
  return while_(self, ({ attempt, elapsed }) =>
    effect.succeed(
      (options.times === undefined || attempt <= options.times) &&
        (duration === undefined || Duration.isLessThanOrEqualTo(Duration.millis(elapsed), duration))
    ))
})

const while_: {
  <Input, Output, Meta extends Metadata<Output, Input>>(
    predicate: (
      metadata: Metadata<Output, Input>
    ) => metadata is Meta
  ): <Error, Env>(
    self: Schedule<Output, Input, Error, Env>
  ) => Schedule<Meta["output"], Meta["input"], Error, Env>
  <Input, Output, Error2 = never, Env2 = never>(
    predicate: (
      metadata: Metadata<Output, Input>
    ) => boolean | Effect<boolean, Error2, Env2>
  ): <Error, Env>(
    self: Schedule<Output, Input, Error, Env>
  ) => Schedule<Output, Input, Error | Error2, Env | Env2>
  <Output, Input, Error, Env, Meta extends Metadata<Output, Input>>(
    self: Schedule<Output, Input, Error, Env>,
    predicate: (
      metadata: Metadata<Output, Input>
    ) => metadata is Meta
  ): Schedule<Meta["output"], Meta["input"], Error, Env>
  <Output, Input, Error, Env, Error2 = never, Env2 = never>(
    self: Schedule<Output, Input, Error, Env>,
    predicate: (
      metadata: Metadata<Output, Input>
    ) => boolean | Effect<boolean, Error2, Env2>
  ): Schedule<Output, Input, Error | Error2, Env | Env2>
} = dual(2, <Output, Input, Error, Env, Error2 = never, Env2 = never>(
  self: Schedule<Output, Input, Error, Env>,
  predicate: (
    metadata: Metadata<Output, Input>
  ) => boolean | Effect<boolean, Error2, Env2>
): Schedule<Output, Input, Error | Error2, Env | Env2> =>
  fromStep(effect.map(toStep(self), (step) => {
    const meta = metadataFn()
    return (now, input) =>
      effect.flatMap(step(now, input), (result) => {
        const [output, duration] = result
        const eff = predicate({ ...meta(now, input), output, duration })
        return effect.flatMap(
          isEffect(eff) ? eff : effect.succeed(eff),
          (check) => (check ? effect.succeed(result) : Cause.done(output))
        )
      })
  })))

export {
  /**
   * Returns a new schedule that continues while the predicate returns `true`.
   *
   * **When to use**
   *
   * Use to stop an existing schedule based on its full metadata, such as the
   * current input, output, attempt, delay, or elapsed time.
   *
   * **Details**
   *
   * The predicate receives `Metadata`, may return `boolean` or an
   * `Effect<boolean, ...>`, preserves the output and delay when it returns
   * `true`, and stops the schedule when it returns `false`.
   *
   * @see {@link upTo} for stopping after a fixed number of schedule outputs
   *
   * @category filtering
   * @since 4.0.0
   */
  while_ as while
}

/**
 * Schedule that divides the timeline to `interval`-long windows, and sleeps
 * until the nearest window boundary every time it recurs.
 *
 * **Details**
 *
 * For example, `Schedule.windowed("10 seconds")` would produce a schedule as
 * follows:
 *
 * ```text
 *      10s        10s        10s       10s
 * |----------|----------|----------|----------|
 * |action------|sleep---|act|-sleep|action----|
 * ```
 *
 * **Example** (Repeating on aligned windows)
 *
 * ```ts import.meta.vitest
 * import { Duration, Effect, Schedule } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const step = yield* Schedule.toStep(Schedule.windowed("5 seconds"))
 *   return yield* step(0, undefined)
 * })
 *
 * await Effect.runPromise(program) // => [0, Duration.seconds(5)]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const windowed = (interval: Duration.Input): Schedule<number> => {
  const window = Duration.toMillis(Duration.fromInputUnsafe(interval))
  return fromStepWithMetadata(effect.succeed((meta) =>
    effect.sync(() => [
      meta.attempt - 1,
      window === 0 ? Duration.zero : Duration.millis(window - (meta.elapsed % window))
    ])
  ))
}

/**
 * Returns a new `Schedule` that will recur forever.
 *
 * **Details**
 *
 * The output of the schedule is the current count of its repetitions thus far
 * (i.e. `0, 1, 2, ...`).
 *
 * **Example** (Repeating forever)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schedule } from "effect"
 * import { TestClock } from "effect/testing"
 *
 * const executions: Array<number> = []
 * const schedule = Schedule.forever.pipe(Schedule.upTo({ times: 2 }))
 * const program = Effect.sync(() => executions.push(executions.length + 1)).pipe(
 *   Effect.repeat(schedule),
 *   Effect.as(executions)
 * )
 *
 * await Effect.runPromise(Effect.provide(program, TestClock.layer())) // => [1, 2, 3]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const forever: Schedule<number> = spaced(Duration.zero)

/**
 * Returns a schedule that recurs immediately once, then completes.
 *
 * **Details**
 *
 * The output of both the recurrence and completion is `void`. When used with
 * `Effect.repeat`, the effect runs twice in total: once initially and once
 * after the schedule recurs.
 *
 * @category constructors
 * @since 4.0.0
 */
export const once: Schedule<void> = map(recurs(1), () => void 0)

const constIdentity = fromStep(
  effect.succeed((_now, input: unknown) => effect.succeed([input, Duration.zero] as [unknown, Duration.Duration]))
)

const identity_ = <A>(): Schedule<A, A> => constIdentity as Schedule<A, A>

export {
  /**
   * Creates a schedule that always recurs, passing inputs directly as outputs.
   *
   * **When to use**
   *
   * Use when you need an infinite schedule that preserves input values as
   * outputs.
   *
   * **Details**
   *
   * This schedule runs indefinitely, returning each input value as its output
   * without modification. It effectively acts as a pass-through that simply
   * echoes its input values at each step.
   *
   * @see {@link forever} for an infinite schedule that returns incrementing step counts
   * @category constructors
   * @since 2.0.0
   */
  identity_ as identity
}

/**
 * Sets the input type of the provided schedule without altering its behavior.
 *
 * **When to use**
 *
 * Use to adapt a schedule that does not depend on its input values.
 *
 * **Details**
 *
 * This helper is checked at compile time and does not change the schedule's
 * runtime behavior.
 *
 * **Example** (Setting a schedule input type)
 *
 * ```ts import.meta.vitest
 * import { Schedule } from "effect"
 *
 * const schedule = Schedule.recurs(3).pipe(
 *   Schedule.setInputType<string>()
 * )
 * Schedule.isSchedule(schedule) // => true
 * ```
 *
 * @category utility types
 * @since 4.0.0
 */
export const setInputType =
  <T>() => <Output, Error, Env>(self: Schedule<Output, T, Error, Env>): Schedule<Output, T, Error, Env> => self
