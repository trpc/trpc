/**
 * Represents the result of an Effect computation as a plain value.
 *
 * An `Exit<A, E>` is either a success with an `A` or a failure with a
 * `Cause<E>`. The failure cause preserves typed errors, defects, and
 * interruptions after a workflow has finished. Use this module when completed
 * Effect results need to be inspected, transformed, filtered, or matched
 * synchronously as data.
 *
 * @since 2.0.0
 */
import type * as Cause from "./Cause.ts"
import type * as Effect from "./Effect.ts"
import * as core from "./internal/core.ts"
import * as effect from "./internal/effect.ts"
import type { Option } from "./Option.ts"
import type * as Result from "./Result.ts"
import type { NoInfer } from "./Types.ts"

const TypeId = core.ExitTypeId

/**
 * Represents the result of an Effect computation.
 *
 * **When to use**
 *
 * Use when you need to synchronously inspect whether an Effect computation
 * succeeded or failed.
 *
 * **Details**
 *
 * An `Exit<A, E>` is either `Success<A, E>` containing a value of type `A`, or
 * `Failure<A, E>` containing a `Cause<E>` describing why the computation
 * failed.
 *
 * Since `Exit` is also an `Effect`, you can yield it inside `Effect.gen`.
 *
 * **Example** (Pattern matching on an Exit)
 *
 * ```ts import.meta.vitest
 * import { Exit } from "effect"
 *
 * const success: Exit.Exit<number> = Exit.succeed(42)
 * const failure: Exit.Exit<number, string> = Exit.fail("error")
 *
 * Exit.match(success, {
 *   onSuccess: (value) => `Got value: ${value}`,
 *   onFailure: (cause) => `Got error: ${cause}`
 * }) // => "Got value: 42"
 * ```
 *
 * @see {@link Success} for the success case
 * @see {@link Failure} for the failure case
 * @see {@link match} for pattern matching
 *
 * @category models
 * @since 2.0.0
 */
export type Exit<A, E = never> = Success<A, E> | Failure<A, E>

/**
 * Namespace containing helper types shared by `Exit` values.
 *
 * **When to use**
 *
 * Use to reference helper types that describe the shared structure of `Exit`
 * values.
 *
 * @since 2.0.0
 */
export declare namespace Exit {
  /**
   * Base interface shared by both Success and Failure.
   *
   * **When to use**
   *
   * Use to describe the common protocol implemented by every `Exit` value.
   *
   * **Details**
   *
   * Every Exit is also an Effect, so you can yield it in `Effect.gen`.
   *
   * @category models
   * @since 4.0.0
   */
  export interface Proto<out A, out E = never> extends Effect.Effect<A, E> {
    readonly [TypeId]: typeof TypeId
  }
}

/**
 * A successful Exit containing a value.
 *
 * **When to use**
 *
 * Use when working with the successful branch of an `Exit` after narrowing
 * with {@link isSuccess}. Access the value via the `value` property after
 * narrowing.
 *
 * **Example** (Accessing the success value)
 *
 * ```ts import.meta.vitest
 * import { Exit } from "effect"
 *
 * const success = Exit.succeed(42)
 *
 * if (Exit.isSuccess(success)) {
 *   success.value // => 42
 * }
 * ```
 *
 * @see {@link isSuccess} to narrow an Exit to Success
 * @see {@link Failure} for the failure counterpart
 *
 * @category models
 * @since 2.0.0
 */
export interface Success<out A, out E = never> extends Exit.Proto<A, E> {
  readonly _tag: "Success"
  readonly value: A
}

/**
 * A failed Exit containing a Cause.
 *
 * **When to use**
 *
 * Use when working with the failed branch of an `Exit` after narrowing with
 * {@link isFailure}. Access the cause via the `cause` property after
 * narrowing.
 *
 * **Details**
 *
 * The `Cause<E>` may contain typed errors, defects, or interruptions.
 *
 * **Example** (Accessing the failure cause)
 *
 * ```ts import.meta.vitest
 * import { Cause, Exit } from "effect"
 *
 * const failure = Exit.fail("something went wrong")
 *
 * if (Exit.isFailure(failure)) {
 *   failure.cause // => Cause.fail("something went wrong")
 * }
 * ```
 *
 * @see {@link isFailure} to narrow an Exit to Failure
 * @see {@link Success} for the success counterpart
 *
 * @category models
 * @since 2.0.0
 */
export interface Failure<out A, out E> extends Exit.Proto<A, E> {
  readonly _tag: "Failure"
  readonly cause: Cause.Cause<E>
}

/**
 * Checks whether an unknown value is an Exit.
 *
 * **When to use**
 *
 * Use to validate unknown values at system boundaries and narrow them to
 * `Exit<unknown, unknown>`.
 *
 * **Details**
 *
 * Does not inspect the contents of the Exit. Returns `true` for both Success
 * and Failure exits.
 *
 * **Example** (Checking if a value is an Exit)
 *
 * ```ts import.meta.vitest
 * import { Exit } from "effect"
 *
 * Exit.isExit(Exit.succeed(42)) // => true
 * Exit.isExit(Exit.fail("err")) // => true
 * Exit.isExit("not an exit") // => false
 * ```
 *
 * @see {@link isSuccess} to check for a successful Exit
 * @see {@link isFailure} to check for a failed Exit
 *
 * @category guards
 * @since 2.0.0
 */
export const isExit: (u: unknown) => u is Exit<unknown, unknown> = core.isExit

/**
 * Creates a successful Exit containing the given value.
 *
 * **When to use**
 *
 * Use when you need an Exit that contains a known success value.
 *
 * **Details**
 *
 * Returns a `Success<A>` with the provided value. Does not perform any
 * computation.
 *
 * **Example** (Creating a successful Exit)
 *
 * ```ts import.meta.vitest
 * import { Exit } from "effect"
 *
 * Exit.succeed(42) // => Exit.succeed(42)
 * ```
 *
 * @see {@link fail} to create a failed Exit
 * @see {@link void_ void} for a pre-allocated success with no value
 *
 * @category constructors
 * @since 2.0.0
 */
export const succeed: <A>(a: A) => Exit<A> = core.exitSucceed

/**
 * Creates a failed Exit from a Cause.
 *
 * **When to use**
 *
 * Use when you already have a `Cause<E>` and want to wrap it in an Exit
 * for advanced error handling where you need full control over the Cause
 * structure.
 *
 * **Details**
 *
 * Returns a `Failure<never, E>`. If you only have an error value, use
 * {@link fail} instead.
 *
 * **Example** (Creating a failed Exit from a Cause)
 *
 * ```ts import.meta.vitest
 * import { Cause, Exit } from "effect"
 *
 * Exit.failCause(Cause.fail("Something went wrong")) // => Exit.fail("Something went wrong")
 * ```
 *
 * @see {@link fail} to create a Failure from a plain error value
 * @see {@link die} to create a Failure from a defect
 *
 * @category constructors
 * @since 2.0.0
 */
export const failCause: <E>(cause: Cause.Cause<E>) => Exit<never, E> = core.exitFailCause

/**
 * Creates a failed Exit from a typed error value.
 *
 * **When to use**
 *
 * Use when you need to represent an expected typed failure as an `Exit`.
 *
 * **Details**
 *
 * The error is wrapped in a `Cause.Fail` internally.
 *
 * Returns a `Failure<never, E>`.
 *
 * **Example** (Creating a failed Exit)
 *
 * ```ts import.meta.vitest
 * import { Exit } from "effect"
 *
 * Exit.fail("Something went wrong") // => Exit.fail("Something went wrong")
 * ```
 *
 * @see {@link succeed} to create a successful Exit
 * @see {@link die} to create a Failure from an unexpected defect
 * @see {@link failCause} to create a Failure from a full Cause
 *
 * @category constructors
 * @since 2.0.0
 */
export const fail: <E>(e: E) => Exit<never, E> = core.exitFail

/**
 * Creates a failed Exit from a defect (unexpected error).
 *
 * **When to use**
 *
 * Use when you need unexpected, unrecoverable errors that should not appear in
 * the typed error channel.
 *
 * **Details**
 *
 * The defect is wrapped in a `Cause.Die` internally.
 *
 * Returns a `Failure<never>` with `E = never`, since defects do not appear in
 * the typed error channel.
 *
 * **Example** (Creating a defect Exit)
 *
 * ```ts import.meta.vitest
 * import { Exit } from "effect"
 *
 * Exit.die("Unexpected error") // => Exit.die("Unexpected error")
 * ```
 *
 * @see {@link fail} to create a Failure from a typed error
 * @see {@link hasDies} to check whether an Exit contains defects
 *
 * @category constructors
 * @since 2.0.0
 */
export const die: (defect: unknown) => Exit<never> = core.exitDie

/**
 * Creates a failed Exit representing fiber interruption.
 *
 * **When to use**
 *
 * Use to signal that a fiber was interrupted.
 *
 * **Details**
 *
 * Optionally pass a fiber ID to identify which fiber was interrupted. Returns
 * a `Failure<never>` with an `Interrupt` cause.
 *
 * **Example** (Creating an interruption Exit)
 *
 * ```ts import.meta.vitest
 * import { Exit } from "effect"
 *
 * Exit.interrupt(123) // => Exit.interrupt(123)
 * ```
 *
 * @see {@link hasInterrupts} to check whether an Exit contains interruptions
 *
 * @category constructors
 * @since 2.0.0
 */
export const interrupt: (fiberId?: number | undefined) => Exit<never> = effect.exitInterrupt

const void_: Exit<void> = effect.exitVoid
export {
  /**
   * Provides a pre-allocated successful Exit with a `void` value.
   *
   * **When to use**
   *
   * Use when you need a shared successful `Exit` with no meaningful value.
   *
   * **Details**
   *
   * Equivalent to `Exit.succeed(undefined)` but shared as a single instance,
   * avoiding allocation for a common case.
   *
   * **Example** (Referencing the void Exit)
   *
   * ```ts import.meta.vitest
   * import { Exit } from "effect"
   *
   * Exit.void // => Exit.succeed(undefined)
   * ```
   *
   * @see {@link succeed} to create a success with a specific value
   * @see {@link asVoid} to discard the value of an existing Exit
   *
   * @category constructors
   * @since 2.0.0
   */
  void_ as void
}

/**
 * Checks whether an Exit is a Success.
 *
 * **When to use**
 *
 * Use as a type guard to narrow `Exit<A, E>` to `Success<A, E>` and access the
 * `value` property.
 *
 * **Example** (Narrowing to success)
 *
 * ```ts import.meta.vitest
 * import { Exit } from "effect"
 *
 * const exit = Exit.succeed(42)
 *
 * if (Exit.isSuccess(exit)) {
 *   exit.value // => 42
 * }
 * ```
 *
 * @see {@link isFailure} for the opposite check
 * @see {@link match} for exhaustive pattern matching
 *
 * @category guards
 * @since 2.0.0
 */
export const isSuccess: <A, E>(self: Exit<A, E>) => self is Success<A, E> = effect.exitIsSuccess

/**
 * Checks whether an Exit is a Failure.
 *
 * **When to use**
 *
 * Use as a type guard to narrow `Exit<A, E>` to `Failure<A, E>` and access the
 * `cause` property.
 *
 * **Example** (Narrowing to failure)
 *
 * ```ts import.meta.vitest
 * import { Cause, Exit } from "effect"
 *
 * const exit = Exit.fail("error")
 *
 * if (Exit.isFailure(exit)) {
 *   exit.cause // => Cause.fail("error")
 * }
 * ```
 *
 * @see {@link isSuccess} for the opposite check
 * @see {@link match} for exhaustive pattern matching
 *
 * @category guards
 * @since 2.0.0
 */
export const isFailure: <A, E>(self: Exit<A, E>) => self is Failure<A, E> = effect.exitIsFailure

/**
 * Checks whether a failed Exit contains typed errors (Fail reasons).
 *
 * **When to use**
 *
 * Use to distinguish typed failures from defects or interruptions.
 *
 * **Details**
 *
 * Returns `false` for successful exits. Only checks for `Fail` reasons in the
 * Cause. A Cause with only `Die` or `Interrupt` reasons returns `false`.
 *
 * **Example** (Checking for typed errors)
 *
 * ```ts import.meta.vitest
 * import { Exit } from "effect"
 *
 * Exit.hasFails(Exit.fail("err")) // => true
 * Exit.hasFails(Exit.die("bug")) // => false
 * Exit.hasFails(Exit.succeed(42)) // => false
 * ```
 *
 * @see {@link hasDies} to check for defects
 * @see {@link hasInterrupts} to check for interruptions
 *
 * @category guards
 * @since 4.0.0
 */
export const hasFails: <A, E>(self: Exit<A, E>) => self is Failure<A, E> = effect.exitHasFails

/**
 * Checks whether a failed Exit contains defects (Die reasons).
 *
 * **When to use**
 *
 * Use to check whether an `Exit` failure cause contains unexpected errors.
 *
 * **Details**
 *
 * Returns `false` for successful exits. Only checks for `Die` reasons in the
 * Cause. A Cause with only `Fail` or `Interrupt` reasons returns `false`.
 *
 * **Example** (Checking for defects)
 *
 * ```ts import.meta.vitest
 * import { Exit } from "effect"
 *
 * Exit.hasDies(Exit.die("bug")) // => true
 * Exit.hasDies(Exit.fail("err")) // => false
 * Exit.hasDies(Exit.succeed(42)) // => false
 * ```
 *
 * @see {@link hasFails} to check for typed errors
 * @see {@link hasInterrupts} to check for interruptions
 *
 * @category guards
 * @since 4.0.0
 */
export const hasDies: <A, E>(self: Exit<A, E>) => self is Failure<A, E> = effect.exitHasDies

/**
 * Checks whether a failed Exit contains interruptions (Interrupt reasons).
 *
 * **When to use**
 *
 * Use to check whether an `Exit` contains fiber interruption.
 *
 * **Details**
 *
 * Returns `false` for successful exits. Only checks for `Interrupt` reasons in
 * the Cause. A Cause with only `Fail` or `Die` reasons returns `false`.
 *
 * **Example** (Checking for interruptions)
 *
 * ```ts import.meta.vitest
 * import { Exit } from "effect"
 *
 * Exit.hasInterrupts(Exit.interrupt(1)) // => true
 * Exit.hasInterrupts(Exit.fail("err")) // => false
 * Exit.hasInterrupts(Exit.succeed(42)) // => false
 * ```
 *
 * @see {@link hasFails} to check for typed errors
 * @see {@link hasDies} to check for defects
 *
 * @category guards
 * @since 4.0.0
 */
export const hasInterrupts: <A, E>(self: Exit<A, E>) => self is Failure<A, E> = effect.exitHasInterrupts

/**
 * Extracts the Success variant from an Exit as a Result.
 *
 * **When to use**
 *
 * Use when composing Exit checks with `Filter` or other `Result`-based
 * filtering APIs and you want the full Success wrapper.
 *
 * **Details**
 *
 * Returns `Result.succeed(success)` when the Exit is a Success, or
 * `Result.fail(failure)` with the original Failure otherwise.
 *
 * **Gotchas**
 *
 * This is not an `Option` accessor or an Effect failure. A failed extraction is
 * represented as data in the `Result` failure channel.
 *
 * **Example** (Filtering for success)
 *
 * ```ts import.meta.vitest
 * import { Exit, Result } from "effect"
 *
 * Exit.filterSuccess(Exit.succeed(42)) // => Result.succeed(Exit.succeed(42))
 * ```
 *
 * @see {@link filterFailure} for the inverse
 * @see {@link filterValue} to extract the raw value instead of the Success object
 *
 * @category filtering
 * @since 4.0.0
 */
export const filterSuccess: <A, E>(
  self: Exit<A, E>
) => Result.Result<Success<A>, Failure<never, E>> = effect.exitFilterSuccess

/**
 * Extracts the success value from an Exit as a Result.
 *
 * **When to use**
 *
 * Use when composing Exit checks with `Filter` or other `Result`-based
 * filtering APIs and you want the raw success value rather than the Success
 * wrapper.
 *
 * **Details**
 *
 * Returns `Result.succeed(value)` when the Exit is a Success, or
 * `Result.fail(failure)` with the original Failure otherwise.
 *
 * **Gotchas**
 *
 * This is not an `Option` accessor or an Effect failure. A failed extraction is
 * represented as data in the `Result` failure channel.
 *
 * **Example** (Filtering for the value)
 *
 * ```ts import.meta.vitest
 * import { Exit, Result } from "effect"
 *
 * Exit.filterValue(Exit.succeed(42)) // => Result.succeed(42)
 * ```
 *
 * @see {@link filterSuccess} to get the full Success object
 * @see {@link getSuccess} to get the value as an Option instead
 *
 * @category filtering
 * @since 4.0.0
 */
export const filterValue: <A, E>(self: Exit<A, E>) => Result.Result<A, Failure<never, E>> = effect.exitFilterValue

/**
 * Extracts the Failure variant from an Exit as a Result.
 *
 * **When to use**
 *
 * Use when composing Exit checks with `Filter` or other `Result`-based
 * filtering APIs and you want the full Failure wrapper.
 *
 * **Details**
 *
 * Returns `Result.succeed(failure)` when the Exit is a Failure, or
 * `Result.fail(success)` with the original Success otherwise.
 *
 * **Gotchas**
 *
 * This is not an `Option` accessor or an Effect failure. A failed extraction is
 * represented as data in the `Result` failure channel.
 *
 * **Example** (Filtering for failure)
 *
 * ```ts import.meta.vitest
 * import { Exit, Result } from "effect"
 *
 * Exit.filterFailure(Exit.fail("err")) // => Result.succeed(Exit.fail("err"))
 * ```
 *
 * @see {@link filterSuccess} for the inverse
 * @see {@link filterCause} to extract the Cause directly
 *
 * @category filtering
 * @since 4.0.0
 */
export const filterFailure: <A, E>(self: Exit<A, E>) => Result.Result<Failure<never, E>, Success<A>> =
  effect.exitFilterFailure

/**
 * Extracts the Cause from a failed Exit as a Result.
 *
 * **When to use**
 *
 * Use when composing Exit checks with `Filter` or other `Result`-based
 * filtering APIs and you want the raw Cause rather than the Failure wrapper.
 *
 * **Details**
 *
 * Returns `Result.succeed(cause)` when the Exit is a Failure, or
 * `Result.fail(success)` with the original Success otherwise.
 *
 * **Gotchas**
 *
 * This is not an `Option` accessor or an Effect failure. A failed extraction is
 * represented as data in the `Result` failure channel.
 *
 * **Example** (Filtering for the cause)
 *
 * ```ts import.meta.vitest
 * import { Cause, Exit, Result } from "effect"
 *
 * Exit.filterCause(Exit.fail("err")) // => Result.succeed(Cause.fail("err"))
 * ```
 *
 * @see {@link filterFailure} to get the full Failure object
 * @see {@link getCause} to get the Cause as an Option instead
 *
 * @category filtering
 * @since 4.0.0
 */
export const filterCause: <A, E>(self: Exit<A, E>) => Result.Result<Cause.Cause<E>, Success<A>> = effect.exitFilterCause

/**
 * Extracts the first typed error value from a failed Exit as a Result.
 *
 * **When to use**
 *
 * Use when you need the first typed error from an `Exit` as a `Result` for
 * `Filter` or other `Result`-based filtering APIs.
 *
 * **Details**
 *
 * Returns `Result.succeed(error)` when the Cause contains a Fail reason, or
 * `Result.fail(exit)` with the original Exit otherwise.
 *
 * **Gotchas**
 *
 * Only finds the first Fail reason. If the Cause has multiple errors, the rest
 * are ignored.
 *
 * **Example** (Finding the first typed error)
 *
 * ```ts import.meta.vitest
 * import { Exit, Result } from "effect"
 *
 * Exit.findError(Exit.fail("not found")) // => Result.succeed("not found")
 * Exit.findError(Exit.die("bug")) // => Result.fail(Exit.die("bug"))
 * ```
 *
 * @see {@link findErrorOption} to get the error as an Option instead
 * @see {@link findDefect} to find defects instead
 *
 * @category filtering
 * @since 4.0.0
 */
export const findError: <A, E>(input: Exit<A, E>) => Result.Result<E, Exit<A, E>> = effect.exitFindError

/**
 * Extracts the first defect from a failed Exit as a Result.
 *
 * **When to use**
 *
 * Use when you need the first defect from an `Exit` as a `Result` for
 * `Filter` or other `Result`-based filtering APIs.
 *
 * **Details**
 *
 * Returns `Result.succeed(defect)` when the Cause contains a Die reason, or
 * `Result.fail(exit)` with the original Exit otherwise.
 *
 * **Gotchas**
 *
 * Only finds the first Die reason. If the Cause has multiple defects, the rest
 * are ignored.
 *
 * **Example** (Finding the first defect)
 *
 * ```ts import.meta.vitest
 * import { Exit, Result } from "effect"
 *
 * Exit.findDefect(Exit.die("boom")) // => Result.succeed("boom")
 * Exit.findDefect(Exit.fail("err")) // => Result.fail(Exit.fail("err"))
 * ```
 *
 * @see {@link findError} to find typed errors instead
 * @see {@link hasDies} to check for defects without extracting them
 *
 * @category filtering
 * @since 4.0.0
 */
export const findDefect: <A, E>(input: Exit<A, E>) => Result.Result<unknown, Exit<A, E>> = effect.exitFindDefect

/**
 * Pattern matches on an Exit, handling both success and failure cases.
 *
 * **When to use**
 *
 * Use when you need exhaustive handling of both `Exit` success and failure
 * outcomes.
 *
 * **Details**
 *
 * Calls `onSuccess` with the value if the Exit is a Success, and calls
 * `onFailure` with the Cause if the Exit is a Failure.
 *
 * **Example** (Matching on an Exit)
 *
 * ```ts import.meta.vitest
 * import { Exit } from "effect"
 *
 * Exit.match(Exit.succeed(42), {
 *   onSuccess: (value) => `Got: ${value}`,
 *   onFailure: () => "Failed"
 * }) // => "Got: 42"
 * ```
 *
 * @see {@link isSuccess} and {@link isFailure} for simple boolean checks
 *
 * @category pattern matching
 * @since 2.0.0
 */
export const match: {
  <A, E, X1, X2>(options: {
    readonly onSuccess: (a: NoInfer<A>) => X1
    readonly onFailure: (cause: Cause.Cause<NoInfer<E>>) => X2
  }): (self: Exit<A, E>) => X1 | X2
  <A, E, X1, X2>(
    self: Exit<A, E>,
    options: {
      readonly onSuccess: (a: A) => X1
      readonly onFailure: (cause: Cause.Cause<E>) => X2
    }
  ): X1 | X2
} = effect.exitMatch

/**
 * Transforms the success value of an Exit using the given function.
 *
 * **When to use**
 *
 * Use to apply a transformation to the value inside a successful Exit
 *
 * **Details**
 *
 * Failures pass through unchanged.
 *
 * Allocates a new Exit if successful.
 *
 * **Example** (Mapping over a success)
 *
 * ```ts import.meta.vitest
 * import { Exit } from "effect"
 *
 * Exit.map(Exit.succeed(21), (x) => x * 2) // => Exit.succeed(42)
 * ```
 *
 * @see {@link mapError} to transform the error
 * @see {@link mapBoth} to transform both success and error
 *
 * @category combinators
 * @since 2.0.0
 */
export const map: {
  <A, B>(f: (a: A) => B): <E>(self: Exit<A, E>) => Exit<B, E>
  <A, E, B>(self: Exit<A, E>, f: (a: A) => B): Exit<B, E>
} = effect.exitMap

/**
 * Transforms the typed error of a failed Exit using the given function.
 *
 * **When to use**
 *
 * Use to remap typed errors while preserving the Exit structure
 *
 * **Details**
 *
 * Successes pass through unchanged.
 *
 * Allocates a new Exit if the error is transformed.
 *
 * **Gotchas**
 *
 * Only transforms typed errors (Fail reasons). If the Cause contains only
 * defects or interruptions, the failure passes through unchanged.
 *
 * **Example** (Mapping over an error)
 *
 * ```ts import.meta.vitest
 * import { Exit } from "effect"
 *
 * Exit.mapError(Exit.fail("bad input"), (error) => error.toUpperCase()) // => Exit.fail("BAD INPUT")
 * ```
 *
 * @see {@link map} to transform the success value
 * @see {@link mapBoth} to transform both success and error
 *
 * @category combinators
 * @since 2.0.0
 */
export const mapError: {
  <E, E2>(f: (a: NoInfer<E>) => E2): <A>(self: Exit<A, E>) => Exit<A, E2>
  <A, E, E2>(self: Exit<A, E>, f: (a: NoInfer<E>) => E2): Exit<A, E2>
} = effect.exitMapError

/**
 * Transforms both the success value and typed error of an Exit.
 *
 * **When to use**
 *
 * Use when you need to remap both channels in one step.
 *
 * **Details**
 *
 * `onSuccess` transforms the value if the Exit is a Success. `onFailure`
 * transforms the typed error if the Exit is a Failure with a Fail reason.
 * Allocates a new Exit.
 *
 * **Gotchas**
 *
 * If the Cause contains only defects or interruptions, the failure passes
 * through unchanged.
 *
 * **Example** (Mapping both channels)
 *
 * ```ts import.meta.vitest
 * import { Exit } from "effect"
 *
 * Exit.mapBoth(Exit.succeed(42), {
 *   onSuccess: (x) => String(x),
 *   onFailure: (error: string) => error.toUpperCase()
 * }) // => Exit.succeed("42")
 * ```
 *
 * @see {@link map} to transform only the success value
 * @see {@link mapError} to transform only the error
 *
 * @category combinators
 * @since 2.0.0
 */
export const mapBoth: {
  <E, E2, A, A2>(
    options: { readonly onFailure: (e: E) => E2; readonly onSuccess: (a: A) => A2 }
  ): (self: Exit<A, E>) => Exit<A2, E2>
  <A, E, E2, A2>(
    self: Exit<A, E>,
    options: { readonly onFailure: (e: E) => E2; readonly onSuccess: (a: A) => A2 }
  ): Exit<A2, E2>
} = effect.exitMapBoth

/**
 * Discards the success value of an Exit, replacing it with `void`.
 *
 * **When to use**
 *
 * Use when you need to discard a successful `Exit` value while preserving
 * whether the `Exit` succeeded or failed.
 *
 * **Details**
 *
 * Failures pass through unchanged.
 *
 * Allocates a new Exit if successful.
 *
 * **Example** (Discarding the success value)
 *
 * ```ts import.meta.vitest
 * import { Exit } from "effect"
 *
 * Exit.asVoid(Exit.succeed(42)) // => Exit.succeed(undefined)
 * ```
 *
 * @see {@link void_ void} for a pre-allocated void success
 * @see {@link asVoidAll} to combine multiple exits into a single void Exit
 *
 * @category combinators
 * @since 2.0.0
 */
export const asVoid: <A, E>(self: Exit<A, E>) => Exit<void, E> = effect.exitAsVoid

/**
 * Combines multiple Exit values into a single `Exit<void, E>`.
 *
 * **When to use**
 *
 * Use to validate that all exits in a collection succeeded
 *
 * **Details**
 *
 * If all exits are successful, this returns a void success. If any exit is a
 * failure, this returns a single failure with all error causes combined.
 *
 * Iterates over the entire collection. Collects all failure causes, not just
 * the first.
 *
 * **Example** (Combining exits)
 *
 * ```ts import.meta.vitest
 * import { Exit } from "effect"
 *
 * Exit.asVoidAll([Exit.succeed(1), Exit.succeed(2), Exit.succeed(3)]) // => Exit.succeed(undefined)
 * Exit.asVoidAll([Exit.succeed(1), Exit.fail("err"), Exit.succeed(3)]) // => Exit.fail("err")
 * ```
 *
 * @see {@link asVoid} to discard the value of a single Exit
 *
 * @category combinators
 * @since 4.0.0
 */
export const asVoidAll: <I extends Iterable<Exit<any, any>>>(
  exits: I
) => Exit<void, I extends Iterable<Exit<infer _A, infer _E>> ? _E : never> = effect.exitAsVoidAll

/**
 * Returns the success value of an Exit as an Option.
 *
 * **When to use**
 *
 * Use when you need the success value from an `Exit` as an `Option` instead of
 * pattern matching.
 *
 * **Details**
 *
 * Returns `Option.some(value)` for a Success and `Option.none()` for a Failure.
 *
 * **Example** (Getting the success value)
 *
 * ```ts import.meta.vitest
 * import { Exit, Option } from "effect"
 *
 * Exit.getSuccess(Exit.succeed(42)) // => Option.some(42)
 * Exit.getSuccess(Exit.fail("err")) // => Option.none()
 * ```
 *
 * @see {@link getCause} to extract the Cause of a failure
 * @see {@link filterValue} for filter-pipeline usage
 *
 * @category getters
 * @since 4.0.0
 */
export const getSuccess: <A, E>(self: Exit<A, E>) => Option<A> = effect.exitGetSuccess

/**
 * Returns the Cause of a failed Exit as an Option.
 *
 * **When to use**
 *
 * Use when you need the failure `Cause` from an `Exit` as an `Option` instead
 * of pattern matching.
 *
 * **Details**
 *
 * Returns `Option.some(cause)` for a Failure and `Option.none()` for a Success.
 *
 * **Example** (Getting the failure cause)
 *
 * ```ts import.meta.vitest
 * import { Cause, Exit, Option } from "effect"
 *
 * Exit.getCause(Exit.fail("err")) // => Option.some(Cause.fail("err"))
 * Exit.getCause(Exit.succeed(42)) // => Option.none()
 * ```
 *
 * @see {@link getSuccess} to extract the success value
 * @see {@link filterCause} for filter-pipeline usage
 *
 * @category getters
 * @since 4.0.0
 */
export const getCause: <A, E>(self: Exit<A, E>) => Option<Cause.Cause<E>> = effect.exitGetCause

/**
 * Returns the first typed error from a failed Exit as an Option.
 *
 * **When to use**
 *
 * Use when you need the first typed error from an `Exit` as an `Option`,
 * ignoring successes and non-typed failures.
 *
 * **Details**
 *
 * Returns `Option.some(error)` if the Cause contains a Fail reason. Successes,
 * defect-only failures, and interrupt-only failures return `Option.none()`.
 *
 * **Gotchas**
 *
 * Only finds the first Fail reason. If the Cause has multiple typed errors,
 * the rest are ignored.
 *
 * **Example** (Getting the first error)
 *
 * ```ts import.meta.vitest
 * import { Exit, Option } from "effect"
 *
 * Exit.findErrorOption(Exit.fail("err")) // => Option.some("err")
 * Exit.findErrorOption(Exit.die("bug")) // => Option.none()
 * Exit.findErrorOption(Exit.succeed(42)) // => Option.none()
 * ```
 *
 * @see {@link findError} for filter-pipeline usage
 * @see {@link getCause} to get the full Cause as an Option
 *
 * @category getters
 * @since 4.0.0
 */
export const findErrorOption: <A, E>(self: Exit<A, E>) => Option<E> = effect.exitFindErrorOption
