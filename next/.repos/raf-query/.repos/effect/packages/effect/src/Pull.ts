/**
 * Models one low-level pull step for stream-like consumers.
 *
 * A `Pull<A, E, Done, R>` is an `Effect` that can produce one `A`, fail with an
 * ordinary error `E`, or signal end-of-input with `Cause.Done<Done>`. The
 * separate done signal lets low-level consumers distinguish normal completion
 * from failure. This module includes type extractors and helpers for detecting,
 * filtering, catching, converting, and matching done signals separately from
 * ordinary failures.
 *
 * @since 4.0.0
 */
import * as Cause from "./Cause.ts"
import type { Effect } from "./Effect.ts"
import * as Exit from "./Exit.ts"
import * as Filter from "./Filter.ts"
import { dual } from "./Function.ts"
import * as internalEffect from "./internal/effect.ts"
import * as Result from "./Result.ts"

/**
 * An effectful pull step that either produces a value, fails with `E`, or
 * signals completion with `Cause.Done<Done>`.
 *
 * **When to use**
 *
 * Use to model one low-level pull step when a consumer repeatedly evaluates an
 * effect that may emit a value, fail normally, or signal normal completion
 * through `Cause.Done`.
 *
 * **Details**
 *
 * `Pull` represents completion in the error channel so low-level stream
 * consumers can distinguish ordinary failures from end-of-input and carry a
 * leftover value when needed.
 *
 * @category models
 * @since 4.0.0
 */
export interface Pull<out A, out E = never, out Done = void, out R = never>
  extends Effect<A, E | Cause.Done<Done>, R>
{}

/**
 * Extracts the success type from a Pull type.
 *
 * **When to use**
 *
 * Use to derive the value produced by an existing `Pull` when declaring
 * reusable type aliases, low-level stream helpers, or function signatures.
 *
 * @see {@link Error} for extracting the ordinary failure type
 * @see {@link Leftover} for extracting the completion leftover type
 * @see {@link Services} for extracting the required services type instead
 *
 * @category utility types
 * @since 4.0.0
 */
export type Success<P> = P extends Effect<infer _A, infer _E, infer _R> ? _A : never

/**
 * Extracts the error type from a Pull type, excluding Done errors.
 *
 * **When to use**
 *
 * Use to derive only the ordinary failure type from a `Pull` when declaring
 * wrappers or APIs that handle completion separately.
 *
 * @see {@link Success} for extracting the pulled value type instead
 * @see {@link Leftover} for extracting the completion leftover type
 * @see {@link Services} for extracting the required services type instead
 * @see {@link ExcludeDone} for excluding `Cause.Done` from an error union
 *
 * @category utility types
 * @since 4.0.0
 */
export type Error<P> = P extends Effect<infer _A, infer _E, infer _R> ? _E extends Cause.Done<infer _L> ? never : _E
  : never

/**
 * Extracts the leftover type from a Pull type.
 *
 * **When to use**
 *
 * Use to derive the completion leftover type from an existing `Pull` when
 * declaring reusable type aliases or helper signatures that preserve a pull's
 * done value.
 *
 * @see {@link Success} for extracting the pulled value type instead
 * @see {@link Error} for extracting the ordinary failure type, excluding `Cause.Done`
 * @see {@link Services} for extracting the required services type instead
 *
 * @category utility types
 * @since 4.0.0
 */
export type Leftover<P> = P extends Effect<infer _A, infer _E, infer _R> ? _E extends Cause.Done<infer _L> ? _L : never
  : never

/**
 * Extracts the service requirements (context) type from a Pull type.
 *
 * **When to use**
 *
 * Use to derive the context requirements of a generic or inferred `Pull`
 * without restating its `R` type parameter.
 *
 * @see {@link Success} for extracting the pulled value type instead
 * @see {@link Error} for extracting the ordinary failure type
 * @see {@link Leftover} for extracting the completion leftover type
 *
 * @category utility types
 * @since 4.0.0
 */
export type Services<P> = P extends Effect<infer _A, infer _E, infer _R> ? _R : never

/**
 * Excludes `Cause.Done` completion signals from an error type union.
 *
 * **When to use**
 *
 * Use to describe the ordinary error type that remains after `Cause.Done`
 * completion signals have been handled or filtered out of an error union.
 *
 * @see {@link Error} for extracting ordinary failures from a `Pull`
 * @see {@link Leftover} for extracting the completion leftover type
 *
 * @category utility types
 * @since 4.0.0
 */
export type ExcludeDone<E> = Exclude<E, Cause.Done<any>>

// -----------------------------------------------------------------------------
// Done
// -----------------------------------------------------------------------------

/**
 * Handles `Cause.Done` failures in an effect while leaving ordinary failures
 * in the error channel.
 *
 * **When to use**
 *
 * Use to recover from a `Cause.Done` completion signal in an effect, such as
 * turning a pull leftover value into a successful recovery effect while
 * preserving ordinary failures.
 *
 * **Details**
 *
 * The handler receives the done leftover value and may recover with a new
 * effect. Non-done errors are preserved.
 *
 * @see {@link matchEffect} for handling success, ordinary failure, and done outcomes explicitly
 * @see {@link filterDoneLeftover} for extracting a done leftover from an existing `Cause`
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchDone: {
  <E, A2, E2, R2>(f: (leftover: Cause.Done.Extract<E>) => Effect<A2, E2, R2>): <A, R>(
    self: Effect<A, E, R>
  ) => Effect<A | A2, ExcludeDone<E> | E2, R | R2>
  <A, R, E, A2, E2, R2>(
    self: Effect<A, E, R>,
    f: (leftover: Cause.Done.Extract<E>) => Effect<A2, E2, R2>
  ): Effect<A | A2, ExcludeDone<E> | E2, R | R2>
} = dual(2, <A, R, E, A2, E2, R2>(
  effect: Effect<A, E, R>,
  f: (leftover: Cause.Done.Extract<E>) => Effect<A2, E2, R2>
): Effect<A | A2, ExcludeDone<E> | E2, R | R2> =>
  internalEffect.catchCauseFilter(effect, filterDoneLeftover as any, (l: any) => f(l)) as any)

/**
 * Checks whether a Cause contains any done errors.
 *
 * **When to use**
 *
 * Use when you need to test whether a pull failure cause represents normal
 * completion and only need a boolean result.
 *
 * @see {@link isDoneFailure} for checking a single `Cause.Reason`
 * @see {@link filterDone} for extracting the `Cause.Done` value from a `Cause`
 * @see {@link filterNoDone} for selecting causes with no done failures
 *
 * @category predicates
 * @since 4.0.0
 */
export const isDoneCause = <E>(cause: Cause.Cause<E>): boolean => cause.reasons.some(isDoneFailure)

/**
 * Checks whether a `Cause.Reason` is a `Fail` reason whose error is a
 * `Cause.Done` signal.
 *
 * **When to use**
 *
 * Use when you need to identify done completion reasons while traversing
 * `cause.reasons`, before handling ordinary failures.
 *
 * @see {@link isDoneCause} for checking an entire `Cause` for any done reason
 * @see {@link filterDone} for extracting the `Cause.Done` value from a `Cause`
 *
 * @category guards
 * @since 4.0.0
 */
export const isDoneFailure = <E>(
  failure: Cause.Reason<E>
): failure is Cause.Fail<E & Cause.Done<any>> => failure._tag === "Fail" && Cause.isDone(failure.error)

/**
 * Finds a `Cause.Done` failure in a `Cause`.
 *
 * **When to use**
 *
 * Use to separate `Cause.Done` completion from ordinary causes while preserving
 * the typed done value.
 *
 * **Details**
 *
 * Returns a successful `Result` with the `Cause.Done` value when the cause
 * contains a done signal and no other failures besides interruptions. When the
 * done signal was merged with a real failure (for example a failing
 * finalizer), the `Result` fails with the remaining cause, stripped of the
 * done signal. Without a done signal the `Result` fails with the original
 * cause.
 *
 * @category filtering
 * @since 4.0.0
 */
export const filterDone: <E>(
  input: Cause.Cause<E>
) => Result.Result<Cause.Done.Only<E>, Cause.Cause<ExcludeDone<E>>> = <E>(
  cause: Cause.Cause<E>
): Result.Result<any, any> => {
  let done: Cause.Done<any> | undefined
  let hasFailure = false
  for (const reason of cause.reasons) {
    if (isDoneFailure(reason)) {
      done ??= reason.error
    } else if (reason._tag !== "Interrupt") {
      hasFailure = true
    }
  }
  if (done === undefined) return Result.fail(cause)
  return hasFailure
    ? Result.fail(Cause.fromReasons(cause.reasons.filter((reason) => !isDoneFailure(reason))))
    : Result.succeed(done)
}

/**
 * Finds a `Cause.Done` failure in a cause whose done value is not used.
 *
 * **When to use**
 *
 * Use to detect `Cause.Done` completion in a `Cause` when the completion value
 * is not part of the downstream logic.
 *
 * **Details**
 *
 * Returns a successful `Result` with the done marker when it is the only
 * failure, otherwise returns a failed `Result` with the non-done cause.
 *
 * @see {@link filterDone} for preserving the typed `Cause.Done` value when the done payload matters
 * @see {@link filterDoneLeftover} for extracting only the done leftover value
 * @see {@link filterNoDone} for the inverse filter that succeeds only when no done failure is present
 *
 * @category filtering
 * @since 4.0.0
 */
export const filterDoneVoid: <E extends Cause.Done>(
  input: Cause.Cause<E>
) => Result.Result<Cause.Done, Cause.Cause<Exclude<E, Cause.Done>>> = filterDone as any

/**
 * Keeps a `Cause` only when it contains no `Cause.Done` failures.
 *
 * **When to use**
 *
 * Use to select ordinary failure causes for handling while leaving `Cause.Done`
 * completion causes outside that handler.
 *
 * **Details**
 *
 * Returns a successful `Result` with the cause when every failure is non-done;
 * otherwise returns a failed `Result` with the original cause.
 *
 * @see {@link filterDone} for the inverse typed done filter
 * @see {@link filterDoneVoid} for done detection when the payload is not needed
 *
 * @category filtering
 * @since 4.0.0
 */
export const filterNoDone: <E>(
  input: Cause.Cause<E>
) => Result.Result<
  Cause.Cause<ExcludeDone<E>>,
  Cause.Cause<E>
> = Filter.fromPredicate((cause: Cause.Cause<unknown>) =>
  cause.reasons.every((failure) => !isDoneFailure(failure))
) as any

/**
 * Filters a Cause to extract the leftover value from done errors.
 *
 * **When to use**
 *
 * Use to extract only the leftover value carried by a `Cause.Done` completion
 * signal.
 *
 * @category filtering
 * @since 4.0.0
 */
export const filterDoneLeftover: <E>(
  cause: Cause.Cause<E>
) => Result.Result<Cause.Done.Extract<E>, Cause.Cause<ExcludeDone<E>>> = ((cause: Cause.Cause<any>) => {
  const done = filterDone(cause)
  return Result.isFailure(done) ? done : Result.succeed(done.success.value)
}) as any

/**
 * Converts a `Cause` into an `Exit`, treating `Cause.Done` as successful
 * completion.
 *
 * **When to use**
 *
 * Use to produce an `Exit` for finalizing a low-level pull workflow when a
 * `Cause.Done` signal should be treated as success and any remaining cause
 * should fail.
 *
 * **Details**
 *
 * If the done signal is the only failure in the cause, its leftover becomes
 * the successful value. Otherwise the non-done cause becomes the failure
 * cause.
 *
 * @see {@link filterDone} for extracting the done signal without converting the cause to an `Exit`
 * @see {@link matchEffect} for handling `Pull` success, failure, and done outcomes directly
 *
 * @category converting
 * @since 4.0.0
 */
export const doneExitFromCause = <E>(cause: Cause.Cause<E>): Exit.Exit<Cause.Done.Extract<E>, ExcludeDone<E>> => {
  const halt = filterDone(cause)
  return !Result.isFailure(halt) ? Exit.succeed(halt.success.value as any) : Exit.failCause(halt.failure)
}

/**
 * Pattern matches on a Pull, handling success, failure, and done cases.
 *
 * **When to use**
 *
 * Use to handle all three `Pull` outcomes with effectful handlers.
 *
 * **Example** (Matching Pull outcomes)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect, Pull } from "effect"
 *
 * const pull = Cause.done("stream ended")
 *
 * const result = Pull.matchEffect(pull, {
 *   onSuccess: (value) => Effect.succeed(`Got value: ${value}`),
 *   onFailure: (cause) => Effect.succeed(`Got error: ${cause}`),
 *   onDone: (leftover) => Effect.succeed(`Stream halted with: ${leftover}`)
 * })
 *
 * await Effect.runPromise(result) // => "Stream halted with: stream ended"
 * ```
 *
 * @category pattern matching
 * @since 4.0.0
 */
export const matchEffect: {
  <A, E, L, AS, ES, RS, AF, EF, RF, AH, EH, RH>(options: {
    readonly onSuccess: (value: A) => Effect<AS, ES, RS>
    readonly onFailure: (failure: Cause.Cause<E>) => Effect<AF, EF, RF>
    readonly onDone: (leftover: L) => Effect<AH, EH, RH>
  }): <R>(self: Pull<A, E, L, R>) => Effect<AS | AF | AH, ES | EF | EH, R | RS | RF | RH>
  <A, E, L, R, AS, ES, RS, AF, EF, RF, AH, EH, RH>(self: Pull<A, E, L, R>, options: {
    readonly onSuccess: (value: A) => Effect<AS, ES, RS>
    readonly onFailure: (failure: Cause.Cause<E>) => Effect<AF, EF, RF>
    readonly onDone: (leftover: L) => Effect<AH, EH, RH>
  }): Effect<AS | AF | AH, ES | EF | EH, R | RS | RF | RH>
} = dual(2, <A, E, L, R, AS, ES, RS, AF, EF, RF, AH, EH, RH>(self: Pull<A, E, L, R>, options: {
  readonly onSuccess: (value: A) => Effect<AS, ES, RS>
  readonly onFailure: (failure: Cause.Cause<E>) => Effect<AF, EF, RF>
  readonly onDone: (leftover: L) => Effect<AH, EH, RH>
}): Effect<AS | AF | AH, ES | EF | EH, R | RS | RF | RH> =>
  internalEffect.matchCauseEffect(self, {
    onSuccess: options.onSuccess,
    onFailure: (cause): Effect<AS | AF | AH, ES | EF | EH, RS | RF | RH> => {
      const halt = filterDone(cause)
      return !Result.isFailure(halt) ? options.onDone(halt.success.value as L) : options.onFailure(halt.failure)
    }
  }))
