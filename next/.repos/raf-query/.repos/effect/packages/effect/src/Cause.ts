/**
 * Records the full reason an `Effect` failed.
 *
 * A `Cause<E>` can contain typed failures, unexpected defects, interruptions,
 * and annotations. Keeping those details together lets code inspect or format
 * failures without first collapsing them to a single error value. This module
 * includes the `Cause` and `Reason` data types, helpers for building and
 * checking causes, and small error types used by several Effect APIs.
 *
 * @since 2.0.0
 */
import * as Context from "./Context.ts"
import type * as Effect from "./Effect.ts"
import type { Equal } from "./Equal.ts"
import type { Fiber } from "./Fiber.ts"
import type { Inspectable } from "./Inspectable.ts"
import * as core from "./internal/core.ts"
import * as effect from "./internal/effect.ts"
import type { Option } from "./Option.ts"
import type { Pipeable } from "./Pipeable.ts"
import type { StackFrame } from "./References.ts"
import type * as Result from "./Result.ts"
import type * as Types from "./Types.ts"

/**
 * Unique brand for `Cause` values, used for runtime type checks via {@link isCause}.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: "~effect/Cause" = core.CauseTypeId

/**
 * Unique brand for `Reason` values, used for runtime type checks via {@link isReason}.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const ReasonTypeId: "~effect/Cause/Reason" = core.CauseReasonTypeId

/**
 * A structured representation of how an Effect failed.
 *
 * **When to use**
 *
 * Use to preserve the full structured failure information for an effect instead
 * of collapsing it to a single error value.
 *
 * **Details**
 *
 * Access the individual failure entries through the `reasons` array, then
 * narrow each entry with {@link isFailReason}, {@link isDieReason}, or
 * {@link isInterruptReason}.
 *
 * - Use {@link hasFails} / {@link hasDies} / {@link hasInterrupts} to test
 *   for the presence of specific reason kinds without iterating.
 * - Use {@link findError} / {@link findDefect} to extract the first value
 *   of a given kind.
 * - Use {@link combine} to merge two causes.
 *
 * `Cause` implements `Equal` — two causes with the same reasons (by value)
 * compare as equal.
 *
 * **Example** (Creating and inspecting a cause)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * Cause.fail("Something went wrong") // => Cause.fail("Something went wrong")
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface Cause<out E> extends Pipeable, Inspectable, Equal {
  readonly [TypeId]: typeof TypeId
  readonly reasons: ReadonlyArray<Reason<E>>
}

/**
 * Checks whether an arbitrary value is a `Cause`.
 *
 * **Example** (Checking the runtime type)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * Cause.isCause(Cause.fail("error")) // => true
 * Cause.isCause("not a cause") // => false
 * ```
 *
 * @category guards
 * @since 2.0.0
 */
export const isCause: (self: unknown) => self is Cause<unknown> = core.isCause

/**
 * Checks whether an arbitrary value is a `Reason` (`Fail`, `Die`, or `Interrupt`).
 *
 * **Example** (Checking the runtime type)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * const reason = Cause.fail("error").reasons[0]
 * Cause.isReason(reason) // => true
 * Cause.isReason("not a reason") // => false
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export const isReason: (self: unknown) => self is Reason<unknown> = core.isCauseReason

/**
 * A single entry inside a `Cause`'s `reasons` array.
 *
 * **Details**
 *
 * Narrow to a concrete type with {@link isFailReason}, {@link isDieReason},
 * or {@link isInterruptReason}.
 *
 * - `Fail<E>` — typed error, access via `.error`
 * - `Die` — untyped defect, access via `.defect`
 * - `Interrupt` — fiber interruption, access via `.fiberId`
 *
 * Every reason carries an `annotations` map and an `annotate` method for
 * attaching tracing metadata.
 *
 * **Example** (Narrowing a reason)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * const reason = Cause.fail("error").reasons[0]
 * if (Cause.isFailReason(reason)) {
 *   reason.error // => "error"
 * }
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export type Reason<E> = Fail<E> | Die | Interrupt

/**
 * Narrows a `Reason` to `Fail`.
 *
 * **When to use**
 *
 * Use as a predicate for `Array.filter` to pick out typed `Fail` reasons when
 * iterating over `cause.reasons`.
 *
 * **Example** (Filtering fail reasons)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * const cause = Cause.fail("error")
 * const fails = cause.reasons.filter(Cause.isFailReason)
 * fails[0].error // => "error"
 * ```
 *
 * @see {@link isDieReason} — narrow to `Die`
 * @see {@link isInterruptReason} — narrow to `Interrupt`
 *
 * @category guards
 * @since 4.0.0
 */
export const isFailReason: <E>(self: Reason<E>) => self is Fail<E> = core.isFailReason

/**
 * Narrows a `Reason` to `Die`.
 *
 * **When to use**
 *
 * Use as a predicate for `Array.filter` to pick out `Die` (defect) reasons when
 * iterating over `cause.reasons`.
 *
 * **Example** (Filtering die reasons)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * const cause = Cause.die("defect")
 * const dies = cause.reasons.filter(Cause.isDieReason)
 * dies[0].defect // => "defect"
 * ```
 *
 * @see {@link isFailReason} — narrow to `Fail`
 * @see {@link isInterruptReason} — narrow to `Interrupt`
 *
 * @category guards
 * @since 4.0.0
 */
export const isDieReason: <E>(self: Reason<E>) => self is Die = core.isDieReason

/**
 * Narrows a `Reason` to `Interrupt`.
 *
 * **When to use**
 *
 * Use as a predicate for `Array.filter` to pick out `Interrupt` reasons when
 * iterating over `cause.reasons`.
 *
 * **Example** (Filtering interrupt reasons)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * const cause = Cause.interrupt(123)
 * const interrupts = cause.reasons.filter(Cause.isInterruptReason)
 * interrupts[0].fiberId // => 123
 * ```
 *
 * @see {@link isFailReason} — narrow to `Fail`
 * @see {@link isDieReason} — narrow to `Die`
 *
 * @category guards
 * @since 4.0.0
 */
export const isInterruptReason: <E>(self: Reason<E>) => self is Interrupt = core.isInterruptReason

/**
 * Companion namespace for the `Cause` interface.
 *
 * @since 2.0.0
 */
export declare namespace Cause {
  /**
   * Extracts the error type `E` from a `Cause<E>`.
   *
   * **Example** (Extracting the error type)
   *
   * ```ts import.meta.vitest
   * import type { Cause } from "effect"
   *
   * // string
   * type E = Cause.Cause.Error<Cause.Cause<string>>
   * ```
   *
   * @category utility types
   * @since 4.0.0
   */
  export type Error<T> = T extends Cause<infer E> ? E : never

  /**
   * Base interface shared by all reason types (`Fail`, `Die`, `Interrupt`).
   *
   * **Details**
   *
   * Every reason carries:
   * - `_tag` — discriminant string (`"Fail"`, `"Die"`, or `"Interrupt"`)
   * - `annotations` — tracing metadata attached by the runtime
   * - `annotate()` — returns a copy with additional annotations
   *
   * @category models
   * @since 4.0.0
   */
  export interface ReasonProto<Tag extends string> extends Inspectable, Equal {
    readonly [ReasonTypeId]: typeof ReasonTypeId
    readonly _tag: Tag
    readonly annotations: ReadonlyMap<string, unknown>
    annotate(annotations: Context.Context<never>, options?: {
      readonly overwrite?: boolean | undefined
    }): this
  }
}

/**
 * Companion namespace for the `Reason` type.
 *
 * @since 4.0.0
 */
export declare namespace Reason {
  /**
   * Extracts the error type `E` from a `Reason<E>`.
   *
   * **Example** (Extracting the error type)
   *
   * ```ts import.meta.vitest
   * import type { Cause } from "effect"
   *
   * // string
   * type E = Cause.Reason.Error<Cause.Reason<string>>
   * ```
   *
   * @category utility types
   * @since 4.0.0
   */
  export type Error<T> = T extends Reason<infer E> ? E : never
}

/**
 * An untyped defect — typically a programming error or an uncaught exception.
 *
 * **When to use**
 *
 * Use when inspecting `Cause` reasons that represent defects instead of typed
 * failures or interruptions.
 *
 * **Details**
 *
 * The `defect` property is `unknown` because defects are not part of the
 * typed error channel. Use {@link isDieReason} to narrow a `Reason`
 * to this type.
 *
 * **Example** (Accessing the defect)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * const cause = Cause.die("Unexpected")
 * const reason = cause.reasons[0]
 * if (Cause.isDieReason(reason)) {
 *   reason.defect // => "Unexpected"
 * }
 * ```
 *
 * @see {@link die} for constructing a cause with a single `Die` reason
 * @see {@link isDieReason} for narrowing a `Reason` to `Die`
 *
 * @category models
 * @since 2.0.0
 */
export interface Die extends Cause.ReasonProto<"Die"> {
  readonly defect: unknown
}

/**
 * A typed, expected error produced by `Effect.fail`.
 *
 * **When to use**
 *
 * Use when inspecting `Cause` reasons that represent expected failures from the
 * typed error channel.
 *
 * **Details**
 *
 * The `error` property carries the typed value `E`. Use {@link isFailReason}
 * to narrow a `Reason` to this type.
 *
 * **Example** (Accessing the error)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * const cause = Cause.fail("Something went wrong")
 * const reason = cause.reasons[0]
 * if (Cause.isFailReason(reason)) {
 *   reason.error // => "Something went wrong"
 * }
 * ```
 *
 * @see {@link fail} for constructing a cause with a single `Fail` reason
 * @see {@link isFailReason} for narrowing a `Reason` to `Fail`
 *
 * @category models
 * @since 2.0.0
 */
export interface Fail<out E> extends Cause.ReasonProto<"Fail"> {
  readonly error: E
}

/**
 * A fiber interruption signal, optionally carrying the ID of the fiber that
 * initiated the interruption.
 *
 * **Details**
 *
 * Use {@link isInterruptReason} to narrow a `Reason` to this type.
 *
 * **Example** (Accessing the fiber ID)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * const cause = Cause.interrupt(123)
 * const reason = cause.reasons[0]
 * if (Cause.isInterruptReason(reason)) {
 *   reason.fiberId // => 123
 * }
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface Interrupt extends Cause.ReasonProto<"Interrupt"> {
  readonly fiberId: number | undefined
}

/**
 * Creates a `Cause` from an array of `Reason` values.
 *
 * **When to use**
 *
 * Use when you already have individual reasons (e.g. from filtering or
 * transforming another cause's `reasons` array) and need to wrap them back
 * into a `Cause`.
 *
 * **Details**
 *
 * - Returns a new `Cause`.
 * - An empty array produces a cause equivalent to `empty`.
 *
 * **Gotchas**
 *
 * The `reasons` array is stored as provided. Treat the array as immutable
 * after passing it to this function.
 *
 * **Example** (Building a cause from reasons)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * const reasons = [
 *   Cause.makeFailReason("err1"),
 *   Cause.makeFailReason("err2")
 * ]
 * Cause.fromReasons(reasons) // => Cause.combine(Cause.fail("err1"), Cause.fail("err2"))
 * ```
 *
 * @see {@link combine} — merge two existing causes
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromReasons: <E>(
  reasons: ReadonlyArray<Reason<E>>
) => Cause<E> = core.causeFromReasons

/**
 * Represents a `Cause` with an empty `reasons` array.
 *
 * **When to use**
 *
 * Use to represent the absence of failure when constructing or combining
 * causes.
 *
 * **Details**
 *
 * Represents the absence of failure. Combining any cause with `empty` via
 * {@link combine} returns the original cause unchanged.
 *
 * **Example** (Combining with the empty cause)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * Cause.combine(Cause.empty, Cause.fail("boom")) // => Cause.fail("boom")
 * ```
 *
 * @see {@link combine} for merging causes where `empty` acts as the identity
 *
 * @category constructors
 * @since 2.0.0
 */
export const empty: Cause<never> = core.causeEmpty

/**
 * Creates a `Cause` containing a single `Fail` reason with the
 * given typed error.
 *
 * **When to use**
 *
 * Use to construct a cause from an expected typed error.
 *
 * **Example** (Creating a fail cause)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * Cause.fail("Something went wrong") // => Cause.fromReasons([Cause.makeFailReason("Something went wrong")])
 * ```
 *
 * @see {@link die} — for untyped defects
 * @see {@link interrupt} — for fiber interruptions
 *
 * @category constructors
 * @since 2.0.0
 */
export const fail: <E>(error: E) => Cause<E> = core.causeFail

/**
 * Creates a `Cause` containing a single `Die` reason with the
 * given defect.
 *
 * **When to use**
 *
 * Use to construct a cause from an untyped defect or unexpected thrown value.
 *
 * **Example** (Creating a die cause)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * Cause.die("Unexpected") // => Cause.fromReasons([Cause.makeDieReason("Unexpected")])
 * ```
 *
 * @see {@link fail} — for typed errors
 * @see {@link interrupt} — for fiber interruptions
 *
 * @category constructors
 * @since 2.0.0
 */
export const die: (defect: unknown) => Cause<never> = core.causeDie

/**
 * Creates a `Cause` containing a single `Interrupt` reason,
 * optionally carrying the interrupting fiber's ID.
 *
 * **Example** (Creating an interrupt cause)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * Cause.interrupt(123) // => Cause.fromReasons([Cause.makeInterruptReason(123)])
 * ```
 *
 * @see {@link fail} — for typed errors
 * @see {@link die} — for untyped defects
 *
 * @category constructors
 * @since 2.0.0
 */
export const interrupt: (fiberId?: number | undefined) => Cause<never> = effect.causeInterrupt

/**
 * Creates a standalone `Fail` reason (not wrapped in a `Cause`).
 *
 * **When to use**
 *
 * Use when constructing a standalone typed failure reason for
 * {@link fromReasons} or direct comparison.
 *
 * **Example** (Creating a Fail reason)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * Cause.makeFailReason("error") // => Cause.fail("error").reasons[0]
 * ```
 *
 * @see {@link makeDieReason} — create a `Die` reason
 * @see {@link makeInterruptReason} — create an `Interrupt` reason
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeFailReason = <E>(error: E): Fail<E> => new core.Fail(error)

/**
 * Creates a standalone `Die` reason (not wrapped in a `Cause`).
 *
 * **When to use**
 *
 * Use when constructing a standalone defect reason for {@link fromReasons} or
 * direct comparison.
 *
 * **Example** (Creating a Die reason)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * Cause.makeDieReason("bug") // => Cause.die("bug").reasons[0]
 * ```
 *
 * @see {@link makeFailReason} — create a `Fail` reason
 * @see {@link makeInterruptReason} — create an `Interrupt` reason
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeDieReason = (defect: unknown): Die => new core.Die(defect)

/**
 * Creates a standalone `Interrupt` reason (not wrapped in a `Cause`),
 * optionally carrying the interrupting fiber's ID.
 *
 * **When to use**
 *
 * Use when constructing a standalone interrupt reason for {@link fromReasons}
 * or direct comparison.
 *
 * **Example** (Creating an Interrupt reason)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * Cause.makeInterruptReason(42) // => Cause.interrupt(42).reasons[0]
 * ```
 *
 * @see {@link makeFailReason} — create a `Fail` reason
 * @see {@link makeDieReason} — create a `Die` reason
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeInterruptReason: (fiberId?: number | undefined) => Interrupt = effect.makeInterruptReason

/**
 * Returns `true` if every reason in the cause is an `Interrupt` (and
 * there is at least one reason).
 *
 * **When to use**
 *
 * Use when you need to detect failures caused only by interruption.
 *
 * **Example** (Checking interrupt-only causes)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * Cause.hasInterruptsOnly(Cause.interrupt(123)) // => true
 * Cause.hasInterruptsOnly(Cause.fail("error")) // => false
 * Cause.hasInterruptsOnly(Cause.empty) // => false
 * ```
 *
 * @see {@link hasInterrupts} — `true` if the cause contains *any* interrupts
 *
 * @category predicates
 * @since 4.0.0
 */
export const hasInterruptsOnly: <E>(self: Cause<E>) => boolean = effect.hasInterruptsOnly

/**
 * Transforms the typed error values inside a `Cause` using the
 * provided function. Only `Fail` reasons are affected; `Die` and `Interrupt`
 * reasons pass through unchanged.
 *
 * **When to use**
 *
 * Use to transform expected typed failures while preserving defects and
 * interruptions unchanged.
 *
 * **Details**
 *
 * If at least one `Fail` reason exists, this returns a new `Cause`
 * containing the mapped failures. If the cause has no `Fail` reasons, the
 * original cause is returned unchanged.
 *
 * **Example** (Mapping errors to uppercase)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * const cause = Cause.fail("error")
 * const mapped = Cause.map(cause, (e) => e.toUpperCase())
 * const reason = mapped.reasons[0]
 * if (Cause.isFailReason(reason)) {
 *   reason.error // => "ERROR"
 * }
 * ```
 *
 * @category mapping
 * @since 2.0.0
 */
export const map: {
  <E, E2>(f: (error: Types.NoInfer<E>) => E2): (self: Cause<E>) => Cause<E2>
  <E, E2>(self: Cause<E>, f: (error: Types.NoInfer<E>) => E2): Cause<E2>
} = effect.causeMap

/**
 * Merges two causes into a single cause whose `reasons` array is the union
 * of both inputs (de-duplicated by value equality).
 *
 * **When to use**
 *
 * Use to merge independent causes into one structured failure value.
 *
 * **Details**
 *
 * - Combining with `empty` returns the other cause unchanged.
 * - If the result is structurally equal to `self`, `self` is returned
 *   (referential shortcut).
 *
 * **Example** (Combining two causes)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * const combined = Cause.combine(Cause.fail("error1"), Cause.fail("error2"))
 * combined // => Cause.fromReasons([Cause.makeFailReason("error1"), Cause.makeFailReason("error2")])
 * ```
 *
 * @see {@link fromReasons} — build a cause from an array of reasons
 * @see {@link empty} for the identity cause used when combining
 *
 * @category combining
 * @since 4.0.0
 */
export const combine: {
  <E2>(that: Cause<E2>): <E>(self: Cause<E>) => Cause<E | E2>
  <E, E2>(self: Cause<E>, that: Cause<E2>): Cause<E | E2>
} = core.causeCombine

/**
 * Collapses a `Cause` into a single `unknown` value, picking the "most
 * important" failure in this order:
 *
 * **When to use**
 *
 * Use to collapse a structured cause to the single value that synchronous and
 * promise runners would throw.
 *
 * **Details**
 *
 * 1. First `Fail` error (the `E` value)
 * 2. First `Die` defect
 * 3. A generic `Error("All fibers interrupted without error")` for interrupt-only causes
 * 4. A generic `Error("Empty cause")` for `empty`
 *
 * This is the function used by `Effect.runPromise` and `Effect.runSync` to
 * decide what to throw.
 *
 * **Gotchas**
 *
 * This function is lossy. Use {@link prettyErrors} or iterate `cause.reasons`
 * when you need all failures.
 *
 * **Example** (Squashing a cause)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * Cause.squash(Cause.fail("error")) // => "error"
 * Cause.squash(Cause.die("defect")) // => "defect"
 * ```
 *
 * @see {@link prettyErrors} — non-lossy conversion to `Array<Error>`
 * @see {@link pretty} — human-readable string rendering
 *
 * @category destructors
 * @since 2.0.0
 */
export const squash: <E>(self: Cause<E>) => unknown = effect.causeSquash

/**
 * Returns `true` if the cause contains at least one `Fail` reason.
 *
 * **When to use**
 *
 * Use to check whether a cause includes typed failures before extracting,
 * mapping, or rendering them.
 *
 * **Example** (Checking for typed errors)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * Cause.hasFails(Cause.fail("error")) // => true
 * Cause.hasFails(Cause.die("defect")) // => false
 * ```
 *
 * @see {@link hasDies} — check for defects
 * @see {@link hasInterrupts} — check for interruptions
 *
 * @category predicates
 * @since 4.0.0
 */
export const hasFails: <E>(self: Cause<E>) => boolean = effect.hasFails

/**
 * Returns a `Result` whose success value is the first `Fail` reason in
 * the cause, including its annotations. If the cause has no `Fail` reason, the
 * failure value is the original cause narrowed to `Cause<never>`, because it
 * contains no typed error reasons.
 *
 * **When to use**
 *
 * Use when you need the full `Fail` reason from a `Cause`, including
 * annotations.
 *
 * **Example** (Extracting the first Fail reason)
 *
 * ```ts import.meta.vitest
 * import { Cause, Result } from "effect"
 *
 * Cause.findFail(Cause.fail("error")) // => Result.succeed(Cause.makeFailReason("error"))
 * ```
 *
 * @see {@link findError} — extract the unwrapped `E` value
 * @see {@link findDie} — extract the first `Die` reason
 *
 * @category filtering
 * @since 4.0.0
 */
export const findFail: <E>(self: Cause<E>) => Result.Result<Fail<E>, Cause<never>> = effect.findFail

/**
 * Returns a `Result` whose success value is the first typed error value `E`
 * from a `Fail` reason in the cause. If the cause has no `Fail` reason,
 * the failure value is the original cause narrowed to `Cause<never>`, because
 * it contains no typed error reasons.
 *
 * **When to use**
 *
 * Use when you need the first typed error value from a `Cause` as a `Result`
 * that preserves the original cause when no match is found.
 *
 * **Example** (Extracting the first error value)
 *
 * ```ts import.meta.vitest
 * import { Cause, Result } from "effect"
 *
 * Cause.findError(Cause.fail("error")) // => Result.succeed("error")
 * ```
 *
 * @see {@link findFail} — extract the full `Fail` reason
 * @see {@link findErrorOption} — `Option`-based variant
 *
 * @category filtering
 * @since 4.0.0
 */
export const findError: <E>(self: Cause<E>) => Result.Result<E, Cause<never>> = effect.findError

/**
 * Returns the first typed error value `E` from a cause wrapped in
 * `Option.some`, or `Option.none` if no `Fail` reason exists.
 *
 * **When to use**
 *
 * Use when you need the first typed error value from a `Cause` as an `Option`,
 * discarding the original cause.
 *
 * **Example** (Extracting an error as Option)
 *
 * ```ts import.meta.vitest
 * import { Cause, Option } from "effect"
 *
 * Cause.findErrorOption(Cause.fail("error")) // => Option.some("error")
 * Cause.findErrorOption(Cause.die("defect")) // => Option.none()
 * ```
 *
 * @see {@link findError} — `Result`-based variant
 *
 * @category filtering
 * @since 4.0.0
 */
export const findErrorOption: <E>(input: Cause<E>) => Option<E> = effect.findErrorOption

/**
 * Returns `true` if the cause contains at least one `Die` reason.
 *
 * **When to use**
 *
 * Use to check whether a cause includes defects before extracting or rendering
 * them.
 *
 * **Example** (Checking for defects)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * Cause.hasDies(Cause.die("defect")) // => true
 * Cause.hasDies(Cause.fail("error")) // => false
 * ```
 *
 * @see {@link hasFails} — check for typed errors
 * @see {@link hasInterrupts} — check for interruptions
 *
 * @category predicates
 * @since 4.0.0
 */
export const hasDies: <E>(self: Cause<E>) => boolean = effect.hasDies

/**
 * Returns a `Result` whose success value is the first `Die` reason in
 * the cause, including its annotations. If the cause has no `Die` reason, the
 * failure value is the original cause.
 *
 * **When to use**
 *
 * Use when you need the full `Die` reason from a `Cause`, including
 * annotations.
 *
 * **Example** (Extracting the first Die reason)
 *
 * ```ts import.meta.vitest
 * import { Cause, Result } from "effect"
 *
 * Cause.findDie(Cause.die("defect")) // => Result.succeed(Cause.makeDieReason("defect"))
 * ```
 *
 * @see {@link findDefect} — extract the unwrapped defect value
 * @see {@link findFail} — extract the first `Fail` reason
 *
 * @category filtering
 * @since 4.0.0
 */
export const findDie: <E>(self: Cause<E>) => Result.Result<Die, Cause<E>> = effect.findDie

/**
 * Returns a `Result` whose success value is the first defect value from a
 * `Die` reason in the cause. If the cause has no `Die` reason, the
 * failure value is the original cause.
 *
 * **When to use**
 *
 * Use when you need the first defect value from a `Cause` as a `Result`,
 * without the full `Die` reason.
 *
 * **Example** (Extracting the first defect)
 *
 * ```ts import.meta.vitest
 * import { Cause, Result } from "effect"
 *
 * Cause.findDefect(Cause.die("defect")) // => Result.succeed("defect")
 * ```
 *
 * @see {@link findDie} — extract the full `Die` reason
 * @see {@link findError} — extract the first typed error
 *
 * @category filtering
 * @since 4.0.0
 */
export const findDefect: <E>(self: Cause<E>) => Result.Result<unknown, Cause<E>> = effect.findDefect

/**
 * Returns `true` if the cause contains at least one `Interrupt` reason.
 *
 * **Example** (Checking for interruptions)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * Cause.hasInterrupts(Cause.interrupt(123)) // => true
 * Cause.hasInterrupts(Cause.fail("error")) // => false
 * ```
 *
 * @see {@link hasInterruptsOnly} — `true` only when *all* reasons are interrupts
 * @see {@link hasFails} — check for typed errors
 * @see {@link hasDies} — check for defects
 *
 * @category predicates
 * @since 4.0.0
 */
export const hasInterrupts: <E>(self: Cause<E>) => boolean = effect.hasInterrupts

/**
 * Returns a `Result` whose success value is the first `Interrupt` reason
 * in the cause, including its annotations. If the cause has no `Interrupt`
 * reason, the failure value is the original cause.
 *
 * **When to use**
 *
 * Use when you need the first `Interrupt` reason from a `Cause`, including the
 * fiber ID and annotations.
 *
 * **Example** (Extracting the first interrupt)
 *
 * ```ts import.meta.vitest
 * import { Cause, Result } from "effect"
 *
 * Cause.findInterrupt(Cause.interrupt(42)) // => Result.succeed(Cause.makeInterruptReason(42))
 * ```
 *
 * @see {@link interruptors} — collect all interrupting fiber IDs as a `Set`
 *
 * @category filtering
 * @since 4.0.0
 */
export const findInterrupt: <E>(self: Cause<E>) => Result.Result<Interrupt, Cause<E>> = effect.findInterrupt

/**
 * Collects the defined fiber IDs from all `Interrupt` reasons in the
 * cause into a `ReadonlySet`. Interrupt reasons without a `fiberId` are
 * ignored. Returns an empty set when the cause has no interrupting fiber IDs.
 *
 * **When to use**
 *
 * Use when you need interrupting fiber IDs as a set, with absence represented
 * as an empty set.
 *
 * **Example** (Collecting interruptors)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * const cause = Cause.combine(
 *   Cause.interrupt(1),
 *   Cause.interrupt(2)
 * )
 *
 * Cause.interruptors(cause) // => new Set([1, 2])
 * ```
 *
 * @see {@link filterInterruptors} — `Result`-based variant
 *
 * @category getters
 * @since 2.0.0
 */
export const interruptors: <E>(self: Cause<E>) => ReadonlySet<number> = effect.causeInterruptors

/**
 * Returns a `Result` whose success value is the set of defined fiber IDs from
 * the cause's `Interrupt` reasons. If the cause has no `Interrupt`
 * reason, the failure value is the original cause.
 *
 * **When to use**
 *
 * Use when you need absence of interrupt reasons to fail with the original
 * cause.
 *
 * **Gotchas**
 *
 * Interrupt reasons without a `fiberId` still count as interrupts, so the
 * function succeeds with an empty `Set` when every interrupt reason has an
 * undefined fiber ID.
 *
 * **Example** (Extracting interruptors with Result)
 *
 * ```ts import.meta.vitest
 * import { Cause, Result } from "effect"
 *
 * Cause.filterInterruptors(Cause.interrupt(1)) // => Result.succeed(new Set([1]))
 * ```
 *
 * @see {@link interruptors} — always-succeeding variant
 *
 * @category filtering
 * @since 4.0.0
 */
export const filterInterruptors: <E>(self: Cause<E>) => Result.Result<Set<number>, Cause<E>> =
  effect.causeFilterInterruptors

/**
 * Converts a `Cause` into an `Array<Error>` suitable for logging or
 * rethrowing.
 *
 * **When to use**
 *
 * Use to convert every renderable failure in a cause into individual `Error`
 * values before logging or rethrowing.
 *
 * **Details**
 *
 * Each `Fail` and `Die` reason is converted into a standard
 * `Error`:
 *
 * - **Objects / Error instances** — `message`, `name`, `stack`, and `cause`
 *   are preserved. Extra enumerable properties are copied. Stack traces are
 *   cleaned up and enriched with span annotations when available.
 * - **Strings** — used directly as the `Error` message.
 * - **Other primitives** (`null`, `undefined`, numbers, …) — wrapped in an
 *   `Error` with message `"Unknown error: <value>"`.
 *
 * `Interrupt` reasons are collected separately. If the cause contains
 * **only** interrupts (no `Fail` or `Die`), a single `InterruptError` is
 * returned whose `cause` lists the interrupting fiber IDs.
 *
 * An empty cause returns an empty array.
 *
 * **Example** (Converting a cause to errors)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * Cause.prettyErrors(Cause.fail(new Error("boom")))[0].message // => "boom"
 * ```
 *
 * @see {@link pretty} — renders the cause as a single string
 * @see {@link squash} — lossy collapse to a single thrown value
 *
 * @category formatting
 * @since 3.2.0
 */
export const prettyErrors: <E>(self: Cause<E>, options?: {
  readonly includeCauseInStack?: boolean | undefined
}) => Array<Error> = effect.causePrettyErrors

/**
 * Formats a `Cause` as a human-readable string for logging or debugging.
 *
 * **When to use**
 *
 * Use to render a whole cause as one human-readable string for logs or
 * diagnostics.
 *
 * **Details**
 *
 * Delegates to {@link prettyErrors} to convert each reason to an `Error`,
 * then joins their stack traces with newlines. Nested `Error.cause` chains
 * are rendered inline with indentation:
 *
 * ```text
 * ErrorName: message
 *     at ...
 *     at ... {
 *   [cause]: NestedError: message
 *       at ...
 * }
 * ```
 *
 * Span annotations are appended to the relevant stack frames when available.
 *
 * **Gotchas**
 *
 * Rendering an empty cause produces an empty string because there are no
 * errors to render.
 *
 * **Example** (Rendering a cause)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * Cause.pretty(Cause.fail("something went wrong")).includes("something went wrong") // => true
 * ```
 *
 * @see {@link prettyErrors} — get the individual `Error` instances
 *
 * @category formatting
 * @since 2.0.0
 */
export const pretty: <E>(cause: Cause<E>) => string = effect.causePretty

/**
 * Base interface for error classes that can be yielded directly inside
 * `Effect.gen`. Yielding one of these errors fails the generator with that
 * error as the typed failure value.
 *
 * **Details**
 *
 * All built-in error classes in this module (`NoSuchElementError`,
 * `TimeoutError`, `IllegalArgumentError`, `ExceededCapacityError`,
 * `AsyncFiberError`, and `UnknownError`) implement this interface.
 *
 * **Example** (Yielding an error in Effect.gen)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect, Exit } from "effect"
 *
 * const error = new Cause.NoSuchElementError("not found")
 *
 * const program = Effect.gen(function*() {
 *   return yield* error // fails the effect with NoSuchElementError
 * })
 *
 * await Effect.runPromiseExit(program) // => Exit.fail(error)
 * ```
 *
 * @category errors
 * @since 2.0.0
 */
export interface YieldableError extends Error, Pipeable, Inspectable {
  readonly [Effect.TypeId]: Effect.Variance<never, this, never>
  [Symbol.iterator](): Effect.EffectIterator<Effect.Effect<never, this, never>>
}

/**
 * Checks whether an arbitrary value is a `NoSuchElementError`.
 *
 * **Example** (Checking the runtime type)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * Cause.isNoSuchElementError(new Cause.NoSuchElementError()) // => true
 * Cause.isNoSuchElementError("nope") // => false
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export const isNoSuchElementError: (u: unknown) => u is NoSuchElementError = core.isNoSuchElementError

/**
 * Unique brand for `NoSuchElementError`.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const NoSuchElementErrorTypeId: "~effect/Cause/NoSuchElementError" = core.NoSuchElementErrorTypeId

/**
 * An error indicating that an expected value was absent.
 *
 * **When to use**
 *
 * Use to model APIs that intentionally turn absence into an error.
 *
 * **Details**
 *
 * Used by APIs that convert absence into an exception or effect failure, such
 * as `Option.getOrThrow`. Implements `YieldableError` so it can be
 * yielded directly in `Effect.gen`.
 *
 * **Gotchas**
 *
 * Prefer APIs that return `Option` or a typed failure when absence is an
 * expected case. This error is mainly for APIs that intentionally turn absence
 * into a thrown value or failed effect.
 *
 * @category errors
 * @since 4.0.0
 */
export interface NoSuchElementError extends YieldableError {
  readonly [NoSuchElementErrorTypeId]: typeof NoSuchElementErrorTypeId
  readonly _tag: "NoSuchElementError"
}

/**
 * Constructs a `NoSuchElementError` with an optional message.
 *
 * **When to use**
 *
 * Use to create the error value for APIs that intentionally fail when an
 * expected element is absent.
 *
 * **Example** (Creating a NoSuchElementError)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * new Cause.NoSuchElementError("Element not found").message // => "Element not found"
 * ```
 *
 * @see {@link isNoSuchElementError} for checking unknown values
 *
 * @category constructors
 * @since 4.0.0
 */
export const NoSuchElementError: new(message?: string) => NoSuchElementError = core.NoSuchElementError

/**
 * Checks whether an arbitrary value is a `Done` signal.
 *
 * **Example** (Checking the runtime type)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * Cause.isDone(Cause.Done()) // => true
 * Cause.isDone("not done") // => false
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export const isDone: (u: unknown) => u is Done<any> = core.isDone

/**
 * Unique brand for `Done` values.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const DoneTypeId: "~effect/Cause/Done" = core.DoneTypeId

/**
 * A graceful completion signal for queues and streams.
 *
 * **When to use**
 *
 * Use to model normal producer completion through a stream or queue error
 * channel.
 *
 * **Details**
 *
 * `Done` indicates that a producer has finished normally — no more elements
 * will arrive. It is distinct from an error or interruption; it represents
 * successful completion. The optional `value` field can carry a final
 * leftover payload.
 *
 * **Example** (Signaling queue completion)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect, Queue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* Queue.bounded<number, Cause.Done>(10)
 *   yield* Queue.offer(queue, 1)
 *   yield* Queue.end(queue)
 *
 *   yield* Queue.take(queue)
 *   const result = yield* Effect.flip(Queue.take(queue))
 *   return Cause.isDone(result)
 * })
 *
 * await Effect.runPromise(program) // => true
 * ```
 *
 * @category errors
 * @since 4.0.0
 */
export interface Done<A = void> {
  readonly [DoneTypeId]: typeof DoneTypeId
  readonly _tag: "Done"
  readonly value: A
}

/**
 * Companion namespace for the `Done` interface.
 *
 * @since 4.0.0
 */
export declare namespace Done {
  /**
   * Extracts the value type `A` from a `Done<A>` that may be nested in an
   * error union.
   *
   * @category utility types
   * @since 4.0.0
   */
  export type Extract<E> = E extends Done<infer L> ? L : never

  /**
   * Filters a type union to only keep `Done` members.
   *
   * @category filtering
   * @since 4.0.0
   */
  export type Only<E> = E extends Done<infer L> ? Done<L> : never
}

/**
 * Creates a `Done` signal with an optional value.
 *
 * **When to use**
 *
 * Use when you need to construct a low-level pull completion signal directly.
 *
 * @see {@link done} — create a failing `Effect` with `Done`
 *
 * @category constructors
 * @since 4.0.0
 */
export const Done: <A = void>(value?: A) => Done<A> = core.Done

/**
 * Creates an Effect that fails with a `Done` error. Shorthand for
 * `Effect.fail(Cause.Done(value))`.
 *
 * **When to use**
 *
 * Use when you model stream or queue completion through the error channel.
 *
 * **Example** (Failing with Done)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect, Exit } from "effect"
 *
 * const program = Cause.done("finished")
 *
 * await Effect.runPromiseExit(program) // => Exit.fail(Cause.Done("finished"))
 * ```
 *
 * @see {@link Done} — create the signal value without an Effect
 *
 * @category constructors
 * @since 4.0.0
 */
export const done: <A = void>(value?: A) => Effect.Effect<never, Done<A>> = core.done

/**
 * Unique brand for `TimeoutError`.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const TimeoutErrorTypeId: "~effect/Cause/TimeoutError" = effect.TimeoutErrorTypeId

/**
 * Checks whether an arbitrary value is a `TimeoutError`.
 *
 * **Example** (Checking the runtime type)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * Cause.isTimeoutError(new Cause.TimeoutError()) // => true
 * Cause.isTimeoutError("nope") // => false
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export const isTimeoutError: (u: unknown) => u is TimeoutError = effect.isTimeoutError

/**
 * An error indicating that an operation exceeded its time limit.
 *
 * **Details**
 *
 * Produced by `Effect.timeout` and related APIs. Implements
 * `YieldableError`.
 *
 * @category errors
 * @since 4.0.0
 */
export interface TimeoutError extends YieldableError {
  readonly [TimeoutErrorTypeId]: typeof TimeoutErrorTypeId
  readonly _tag: "TimeoutError"
}

/**
 * Constructs a `TimeoutError` with an optional message.
 *
 * **Example** (Creating a TimeoutError)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * new Cause.TimeoutError("Operation timed out").message // => "Operation timed out"
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const TimeoutError: new(message?: string) => TimeoutError = effect.TimeoutError

/**
 * Unique brand for `IllegalArgumentError`.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const IllegalArgumentErrorTypeId: "~effect/Cause/IllegalArgumentError" = effect.IllegalArgumentErrorTypeId

/**
 * Checks whether an arbitrary value is an `IllegalArgumentError`.
 *
 * **Example** (Checking the runtime type)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * Cause.isIllegalArgumentError(new Cause.IllegalArgumentError()) // => true
 * Cause.isIllegalArgumentError("nope") // => false
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export const isIllegalArgumentError: (u: unknown) => u is IllegalArgumentError = effect.isIllegalArgumentError

/**
 * An error indicating that a function received an argument that violates
 * its contract (e.g. negative where positive was expected).
 *
 * **Details**
 *
 * Implements `YieldableError`.
 *
 * @category errors
 * @since 4.0.0
 */
export interface IllegalArgumentError extends YieldableError {
  readonly [IllegalArgumentErrorTypeId]: typeof IllegalArgumentErrorTypeId
  readonly _tag: "IllegalArgumentError"
}

/**
 * Constructs an `IllegalArgumentError` with an optional message.
 *
 * **Example** (Creating an IllegalArgumentError)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * new Cause.IllegalArgumentError("Invalid argument").message // => "Invalid argument"
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const IllegalArgumentError: new(message?: string) => IllegalArgumentError = effect.IllegalArgumentError

/**
 * Checks whether an arbitrary value is an `ExceededCapacityError`.
 *
 * **Example** (Checking the runtime type)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * Cause.isExceededCapacityError(new Cause.ExceededCapacityError()) // => true
 * Cause.isExceededCapacityError("nope") // => false
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export const isExceededCapacityError: (u: unknown) => u is ExceededCapacityError = effect.isExceededCapacityError

/**
 * Unique brand for `ExceededCapacityError`.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const ExceededCapacityErrorTypeId: "~effect/Cause/ExceededCapacityError" = effect.ExceededCapacityErrorTypeId

/**
 * An error indicating that a bounded resource (queue, pool, semaphore, etc.)
 * has exceeded its capacity.
 *
 * **When to use**
 *
 * Use to model bounded-resource failures where an operation cannot proceed
 * because capacity has been exhausted.
 *
 * **Details**
 *
 * Implements `YieldableError`.
 *
 * @category errors
 * @since 4.0.0
 */
export interface ExceededCapacityError extends YieldableError {
  readonly [ExceededCapacityErrorTypeId]: typeof ExceededCapacityErrorTypeId
  readonly _tag: "ExceededCapacityError"
}

/**
 * Constructs an `ExceededCapacityError` with an optional message.
 *
 * **When to use**
 *
 * Use to create the error value for bounded-resource capacity failures.
 *
 * **Example** (Creating an ExceededCapacityError)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * new Cause.ExceededCapacityError("Queue full").message // => "Queue full"
 * ```
 *
 * @see {@link isExceededCapacityError} for checking unknown values
 *
 * @category constructors
 * @since 4.0.0
 */
export const ExceededCapacityError: new(message?: string) => ExceededCapacityError = effect.ExceededCapacityError

/**
 * Unique brand present on `AsyncFiberError` values and used by
 * `isAsyncFiberError` for runtime checks.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const AsyncFiberErrorTypeId: "~effect/Cause/AsyncFiberError" = effect.AsyncFiberErrorTypeId

/**
 * Checks whether an arbitrary value is an `AsyncFiberError`.
 *
 * **Example** (Checking the runtime type)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect } from "effect"
 *
 * const fiber = Effect.runFork(Effect.void)
 *
 * const error = new Cause.AsyncFiberError(fiber)
 * Cause.isAsyncFiberError(error) // => true
 * Cause.isAsyncFiberError("nope") // => false
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export const isAsyncFiberError: (u: unknown) => u is AsyncFiberError = effect.isAsyncFiberError

/**
 * An error that occurs when trying to run an async fiber with Effect.runSync.
 *
 * **When to use**
 *
 * Use to inspect failures produced when synchronous runners encounter an effect
 * that cannot complete synchronously.
 *
 * **Details**
 *
 * The `fiber` property stores the fiber that could not be synchronously
 * resolved. This error implements `YieldableError`.
 *
 * **Example** (Accessing the fiber)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect } from "effect"
 *
 * const fiber = Effect.runFork(Effect.void)
 *
 * const value = new Cause.AsyncFiberError(fiber)
 * const isSameFiber = value.fiber === fiber
 * isSameFiber // => true
 * ```
 *
 * @category errors
 * @since 4.0.0
 */
export interface AsyncFiberError extends YieldableError {
  readonly [AsyncFiberErrorTypeId]: typeof AsyncFiberErrorTypeId
  readonly _tag: "AsyncFiberError"
  readonly fiber: Fiber<unknown, unknown>
}

/**
 * Constructs an `AsyncFiberError` for a fiber that could not be resolved
 * synchronously.
 *
 * **When to use**
 *
 * Use to create the error value for a fiber that could not be completed by a
 * synchronous runner.
 *
 * **Example** (Creating an AsyncFiberError)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect } from "effect"
 *
 * const fiber = Effect.runFork(Effect.void)
 *
 * new Cause.AsyncFiberError(fiber).message // => "An asynchronous Effect was executed with Effect.runSync"
 * ```
 *
 * @see {@link isAsyncFiberError} for checking unknown values
 *
 * @category constructors
 * @since 4.0.0
 */
export const AsyncFiberError: new(fiber: Fiber<unknown, unknown>) => AsyncFiberError = effect.AsyncFiberError

/**
 * Unique brand for `UnknownError`.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const UnknownErrorTypeId: "~effect/Cause/UnknownError" = effect.UnknownErrorTypeId

/**
 * Checks whether an arbitrary value is an `UnknownError`.
 *
 * **Example** (Checking the runtime type)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * Cause.isUnknownError(new Cause.UnknownError("x")) // => true
 * Cause.isUnknownError("nope") // => false
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export const isUnknownError: (u: unknown) => u is UnknownError = effect.isUnknownError

/**
 * A wrapper for errors whose type is not statically known.
 *
 * **Details**
 *
 * Used when a thrown or rejected value is not represented by a more specific
 * typed error. The original value is stored in the `cause` property inherited
 * from `Error`. Implements `YieldableError`.
 *
 * @category errors
 * @since 4.0.0
 */
export interface UnknownError extends YieldableError {
  readonly [UnknownErrorTypeId]: typeof UnknownErrorTypeId
  readonly _tag: "UnknownError"
}

/**
 * Constructs an `UnknownError`. The first argument is the original
 * cause (stored in `Error.cause`); the second is an optional human-readable
 * message.
 *
 * **Example** (Creating an UnknownError)
 *
 * ```ts import.meta.vitest
 * import { Cause } from "effect"
 *
 * new Cause.UnknownError({ raw: true }, "Unexpected value").message // => "Unexpected value"
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const UnknownError: new(cause: unknown, message?: string) => UnknownError = effect.UnknownError

/**
 * Attaches metadata to every reason in a `Cause`.
 *
 * **When to use**
 *
 * Use to attach diagnostic metadata to every reason in a cause.
 *
 * **Details**
 *
 * Annotations are stored as a `Context` on each reason and can be
 * retrieved later via {@link reasonAnnotations} or {@link annotations}.
 * The runtime uses this to attach stack traces and spans.
 *
 * - Returns a new `Cause`.
 * - By default, existing keys are preserved. Pass `{ overwrite: true }` to
 *   replace them.
 *
 * **Example** (Annotating a cause)
 *
 * ```ts import.meta.vitest
 * import { Cause, Context } from "effect"
 *
 * class RequestId extends Context.Service<RequestId, string>()("RequestId") {}
 *
 * const annotated = Cause.annotate(Cause.fail("error"), Context.make(RequestId, "req-1"))
 * Context.getOrUndefined(Cause.annotations(annotated), RequestId) // => "req-1"
 * ```
 *
 * @see {@link annotations} for reading merged annotations from a cause
 * @see {@link reasonAnnotations} for reading annotations from a single reason
 *
 * @category annotations
 * @since 4.0.0
 */
export const annotate: {
  (
    annotations: Context.Context<never>,
    options?: { readonly overwrite?: boolean | undefined }
  ): <E>(self: Cause<E>) => Cause<E>
  <E>(
    self: Cause<E>,
    annotations: Context.Context<never>,
    options?: { readonly overwrite?: boolean | undefined }
  ): Cause<E>
} = core.causeAnnotate

/**
 * Reads the annotations from a single `Reason` as a `Context`.
 *
 * **When to use**
 *
 * Use when you need tracing metadata (e.g. `StackTrace`) from
 * a specific reason rather than the whole cause.
 *
 * **Example** (Reading reason annotations)
 *
 * ```ts import.meta.vitest
 * import { Cause, Context } from "effect"
 *
 * class RequestId extends Context.Service<RequestId, string>()("RequestId") {}
 *
 * const reason = Cause.makeFailReason("error")
 * const annotated = reason.annotate(Context.make(RequestId, "req-1"))
 *
 * Context.getOrUndefined(Cause.reasonAnnotations(annotated), RequestId) // => "req-1"
 * ```
 *
 * @see {@link annotations} — merged annotations from all reasons in a cause
 *
 * @category annotations
 * @since 4.0.0
 */
export const reasonAnnotations: <E>(self: Reason<E>) => Context.Context<never> = effect.reasonAnnotations

/**
 * Reads the merged annotations from all reasons in a `Cause`.
 *
 * **When to use**
 *
 * Use to read diagnostic metadata merged from the whole cause.
 *
 * **Gotchas**
 *
 * When multiple reasons contain the same annotation key, the value from the
 * later reason wins.
 *
 * **Example** (Reading merged annotations)
 *
 * ```ts import.meta.vitest
 * import { Cause, Context } from "effect"
 *
 * class RequestId extends Context.Service<RequestId, string>()("RequestId") {}
 *
 * const cause = Cause.annotate(
 *   Cause.fail("error"),
 *   Context.make(RequestId, "req-1")
 * )
 *
 * Context.getOrUndefined(Cause.annotations(cause), RequestId) // => "req-1"
 * ```
 *
 * @see {@link reasonAnnotations} — annotations from a single reason
 *
 * @category annotations
 * @since 4.0.0
 */
export const annotations: <E>(self: Cause<E>) => Context.Context<never> = effect.causeAnnotations

/**
 * Context annotation used to store the stack frame captured at the point of failure.
 *
 * **When to use**
 *
 * Use to read the failure stack-frame annotation from a `Reason` when building
 * diagnostics, logging, or custom cause renderers.
 *
 * **Details**
 *
 * The runtime annotates every reason with this when a stack frame is
 * available. Retrieve it via
 * `Context.get(Cause.reasonAnnotations(reason), Cause.StackTrace)`.
 *
 * @see {@link reasonAnnotations} for reading annotations from a single reason
 * @see {@link annotations} for reading merged annotations from a cause
 * @see {@link InterruptorStackTrace} for the interrupt-specific stack-frame annotation
 *
 * @category services
 * @since 4.0.0
 */
export class StackTrace extends Context.Service<StackTrace, StackFrame>()("effect/Cause/StackTrace") {}

/**
 * Context annotation used to store the stack frame captured at the point of
 * interruption.
 *
 * **When to use**
 *
 * Use when you need the stack-frame annotation used by interrupt-only cause
 * rendering.
 *
 * **Details**
 *
 * Similar to `StackTrace` but specific to `Interrupt` reasons.
 *
 * @see {@link StackTrace} for stack frames attached to failures
 * @see {@link reasonAnnotations} for reading annotations from a single reason
 * @see {@link annotate} for attaching annotations to a cause
 *
 * @category services
 * @since 4.0.0
 */
export class InterruptorStackTrace
  extends Context.Service<InterruptorStackTrace, StackFrame>()("effect/Cause/InterruptorStackTrace")
{}
