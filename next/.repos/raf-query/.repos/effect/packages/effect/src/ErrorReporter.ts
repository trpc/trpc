/**
 * Reports Effect failures to external code.
 *
 * An `ErrorReporter` receives `Cause` values from `Effect.withErrorReporting`,
 * manual `report` calls, or built-in reporting boundaries. It forwards each
 * non-interruption error to a callback, so applications can send failures to
 * logging, monitoring, or error-tracking systems. This module also includes
 * layers for installing reporters and symbols for marking errors as ignored or
 * attaching severity and attributes.
 *
 * @since 4.0.0
 */
import type * as Cause from "./Cause.ts"
import type * as Context from "./Context.ts"
import * as Effect from "./Effect.ts"
import type * as Fiber from "./Fiber.ts"
import * as effect from "./internal/effect.ts"
import * as references from "./internal/references.ts"
import * as Layer from "./Layer.ts"
import * as LogLevel from "./LogLevel.ts"
import type { Severity } from "./LogLevel.ts"
import type { ReadonlyRecord } from "./Record.ts"
import type * as Scope from "./Scope.ts"

/**
 * String literal type used as the runtime type identifier for
 * `ErrorReporter` values.
 *
 * **When to use**
 *
 * Use to refer to the runtime type identifier type in low-level integrations.
 *
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~effect/ErrorReporter"

/**
 * Runtime type identifier attached to `ErrorReporter` values.
 *
 * **Details**
 *
 * This marker is part of the runtime representation of `ErrorReporter`
 * implementations. Most code should create reporters with `make` and register
 * them with `layer`.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~effect/ErrorReporter"

/**
 * An `ErrorReporter` receives reported failures and forwards them to an
 * external system such as a logging service or error tracker.
 *
 * **When to use**
 *
 * Use as the interface for custom reporters that forward reported Effect
 * failures to logging, monitoring, or error-tracking systems.
 *
 * **Details**
 *
 * Reporting is triggered by `Effect.withErrorReporting`,
 * `ErrorReporter.report`, or built-in boundaries in the HTTP and RPC server
 * modules. Use {@link make} to create a reporter; it handles deduplication
 * and per-error annotation extraction automatically.
 *
 * @see {@link make} for creating an `ErrorReporter` from a callback
 * @see {@link layer} for registering reporters in the environment
 * @see {@link report} for manually reporting a `Cause`
 * @see {@link Effect.withErrorReporting} for reporting failures from an effect
 *
 * @category services
 * @since 4.0.0
 */
export interface ErrorReporter {
  readonly [TypeId]: TypeId
  report(options: {
    readonly cause: Cause.Cause<unknown>
    readonly fiber: Fiber.Fiber<unknown, unknown>
    readonly timestamp: bigint
  }): void
}

/**
 * Creates an `ErrorReporter` from a callback.
 *
 * **When to use**
 *
 * Use to define how reported failures are forwarded to a logging, monitoring,
 * or error-tracking backend.
 *
 * **Details**
 *
 * The returned reporter automatically deduplicates causes and individual
 * errors (the same object is never reported twice), skips interruptions,
 * and resolves the `ignore`, `severity`, and `attributes` annotations on
 * each error before invoking your callback.
 *
 * **Example** (Forwarding errors to a callback)
 *
 * ```ts import.meta.vitest
 * import { Effect, ErrorReporter } from "effect"
 *
 * const reports: Array<{ message: string; severity: string; attributes: object }> = []
 * const reporter = ErrorReporter.make(({ error, severity, attributes }) => {
 *   reports.push({ message: error.message, severity, attributes })
 * })
 *
 * const program = Effect.fail(new Error("boom")).pipe(
 *   Effect.withErrorReporting,
 *   Effect.provide(ErrorReporter.layer([reporter])),
 *   Effect.exit
 * )
 *
 * await Effect.runPromise(program)
 * reports // => [{ message: "boom", severity: "Info", attributes: {} }]
 * ```
 *
 * @see {@link layer} for registering reporters in the environment
 * @see {@link report} for manually reporting a `Cause`
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = (
  report: (options: {
    readonly cause: Cause.Cause<unknown>
    readonly error: Error
    readonly attributes: ReadonlyRecord<string, unknown>
    readonly severity: Severity
    readonly fiber: Fiber.Fiber<unknown, unknown>
    readonly timestamp: bigint
  }) => void
): ErrorReporter => {
  const reported = new WeakSet<Cause.Cause<unknown> | object>()
  return {
    [TypeId]: TypeId,
    report(options) {
      if (reported.has(options.cause)) return
      reported.add(options.cause)
      for (let i = 0; i < options.cause.reasons.length; i++) {
        const reason = options.cause.reasons[i]
        if (reason._tag === "Interrupt") continue
        const original = reason._tag === "Fail" ? reason.error : reason.defect
        const isObject = typeof original === "object" && original !== null
        if (isObject) {
          if (reported.has(original)) continue
          reported.add(original)
        }
        if (isIgnored(original)) continue
        const pretty = effect.causePrettyError(original as any, reason.annotations)
        report({
          ...options,
          error: pretty,
          severity: isObject ? getSeverity(original) : "Info",
          attributes: isObject ? getAttributes(original) : emptyAttributes
        })
      }
    }
  }
}

/**
 * Context reference that holds the set of active error reporters for the
 * current fiber. Defaults to an empty set (no reporting).
 *
 * **When to use**
 *
 * Use when you need to read or replace the current set of error reporters
 * directly.
 *
 * @category services
 * @since 4.0.0
 */
export const CurrentErrorReporters: Context.Reference<ReadonlySet<ErrorReporter>> = references.CurrentErrorReporters

/**
 * Creates a `Layer` that registers one or more `ErrorReporter`s.
 *
 * **When to use**
 *
 * Use to provide one or more error reporters to effects that perform error
 * reporting.
 *
 * **Details**
 *
 * Reporters can be plain `ErrorReporter` values or effectful
 * `Effect<ErrorReporter>` values that are resolved when the layer is built. By
 * default the provided reporters **replace** any previously registered
 * reporters. Set `mergeWithExisting: true` to add them alongside existing ones.
 *
 * **Example** (Providing error reporters)
 *
 * ```ts import.meta.vitest
 * import { Effect, ErrorReporter } from "effect"
 *
 * const reports: Array<string> = []
 * const firstReporter = ErrorReporter.make(({ error, severity }) => {
 *   reports.push(`[${severity}] ${error.message}`)
 * })
 * const secondReporter = ErrorReporter.make(({ error, severity }) => {
 *   reports.push(`${severity}: ${error.message}`)
 * })
 *
 * // Replace all existing reporters
 * const ReporterLayer = ErrorReporter.layer([
 *   firstReporter,
 *   secondReporter
 * ])
 *
 * // Add to existing reporters instead of replacing
 * const ReporterMerged = ErrorReporter.layer(
 *   [secondReporter],
 *   { mergeWithExisting: true }
 * )
 *
 * const program = Effect.fail("boom").pipe(
 *   Effect.withErrorReporting,
 *   Effect.provide(ReporterLayer),
 *   Effect.exit
 * )
 *
 * await Effect.runPromise(program)
 * reports // => ["[Info] boom", "Info: boom"]
 * ```
 *
 * @see {@link make} for creating an `ErrorReporter` from a callback
 * @see {@link CurrentErrorReporters} for low-level access to the current reporters
 *
 * @category layers
 * @since 4.0.0
 */
export const layer = <
  const Reporters extends ReadonlyArray<ErrorReporter | Effect.Effect<ErrorReporter, any, any>>
>(
  reporters: Reporters,
  options?: { readonly mergeWithExisting?: boolean | undefined } | undefined
): Layer.Layer<
  never,
  Reporters extends readonly [] ? never : Effect.Error<Reporters[number]>,
  Exclude<
    Reporters extends readonly [] ? never : Effect.Services<Reporters[number]>,
    Scope.Scope
  >
> =>
  Layer.effect(
    CurrentErrorReporters,
    Effect.withFiber(Effect.fnUntraced(function*(fiber) {
      const currentReporters = new Set(
        options?.mergeWithExisting === true ? fiber.getRef(references.CurrentErrorReporters) : []
      )
      for (const reporter of reporters) {
        currentReporters.add(Effect.isEffect(reporter) ? yield* reporter : reporter)
      }
      return currentReporters
    }))
  )

/**
 * Runs all registered error reporters on the current fiber for a `Cause`.
 *
 * **When to use**
 *
 * Use to report a failure for observability without failing the current fiber.
 *
 * **Example** (Reporting a cause manually)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect, ErrorReporter } from "effect"
 *
 * const messages: Array<string> = []
 * const program = Effect.gen(function*() {
 *   const cause = Cause.fail("something went wrong")
 *   yield* ErrorReporter.report(cause)
 *   return "fallback value"
 * })
 *
 * const reporter = ErrorReporter.make(({ error }) => messages.push(error.message))
 * const output = await Effect.runPromise(
 *   Effect.provide(program, ErrorReporter.layer([reporter]))
 * )
 * messages // => ["something went wrong"]
 * output // => "fallback value"
 * ```
 *
 * @category logging
 * @since 4.0.0
 */
export const report = <E>(cause: Cause.Cause<E>): Effect.Effect<void> =>
  Effect.withFiber((fiber) => {
    effect.reportCauseUnsafe(fiber, cause)
    return Effect.void
  })

/**
 * Interface that object errors can implement to control reporting behavior.
 *
 * **When to use**
 *
 * Use as the annotation contract for object errors that customize how error
 * reporting handles them.
 *
 * **Details**
 *
 * All three annotation properties are optional: `[ErrorReporter.ignore]`
 * prevents reporting when set to `true`, `[ErrorReporter.severity]` overrides
 * the default `"Info"` severity, and `[ErrorReporter.attributes]` adds extra
 * key/value pairs forwarded to reporters. The global `Error` interface is
 * augmented with `Reportable`, so these properties are available on `Error`
 * instances at the type level.
 *
 * @see {@link ignore} for the runtime annotation key that suppresses reports
 * @see {@link severity} for the runtime annotation key that overrides severity
 * @see {@link attributes} for the runtime annotation key that attaches reporter
 * metadata
 *
 * @category annotations
 * @since 4.0.0
 */
export interface Reportable {
  readonly [ignore]?: boolean
  readonly [severity]?: Severity
  readonly [attributes]?: ReadonlyRecord<string, unknown>
}

declare global {
  interface Error extends Reportable {}
}

/**
 * Defines the string property key used to mark an object error as ignored by error
 * reporting.
 *
 * **When to use**
 *
 * Use to type the property key that suppresses reporting for expected object
 * errors.
 *
 * **Details**
 *
 * Set this property to `true` on an error class or object error to prevent it
 * from being forwarded to reporters. This is useful for expected failures such
 * as HTTP 404 responses.
 *
 * @category annotations
 * @since 4.0.0
 */
export type ignore = "~effect/ErrorReporter/ignore"

/**
 * Defines the runtime property key used to mark an object error as ignored by error
 * reporting.
 *
 * **When to use**
 *
 * Use to suppress reporting for expected object errors, such as HTTP 404
 * responses.
 *
 * **Details**
 *
 * Set `error[ErrorReporter.ignore]` to `true` to prevent the error from being
 * forwarded to reporters. This is useful for expected failures such as HTTP 404
 * responses.
 *
 * **Example** (Marking errors as ignored)
 *
 * ```ts import.meta.vitest
 * import { Data, ErrorReporter } from "effect"
 *
 * class NotFoundError extends Data.TaggedError("NotFoundError")<{}> {
 *   readonly [ErrorReporter.ignore] = true
 * }
 *
 * ErrorReporter.isIgnored(new NotFoundError()) // => true
 * ```
 *
 * @see {@link isIgnored} for checking whether a value carries this annotation
 * @see {@link Reportable} for the annotation contract recognized on object
 * errors
 *
 * @category annotations
 * @since 4.0.0
 */
export const ignore: ignore = "~effect/ErrorReporter/ignore"

/**
 * Returns `true` if the given value has the `ErrorReporter.ignore` annotation
 * set to `true`.
 *
 * **When to use**
 *
 * Use to check whether an error value is annotated to be skipped before
 * forwarding it to error reporting code.
 *
 * @see {@link ignore} for the annotation key this predicate reads
 *
 * @category predicates
 * @since 4.0.0
 */
export const isIgnored = (u: unknown): boolean =>
  typeof u === "object" && u !== null && ignore in u && u[ignore] === true

/**
 * Defines the string property key used to override the severity level of an object error.
 *
 * **When to use**
 *
 * Use to type the property key that overrides the reporting severity for object
 * errors.
 *
 * **Details**
 *
 * When set to a valid `LogLevel.Severity`, the reporter callback receives this
 * value as `severity`. Missing or invalid values fall back to `"Info"`.
 *
 * @category annotations
 * @since 4.0.0
 */
export type severity = "~effect/ErrorReporter/severity"

/**
 * Defines the runtime property key used to override the severity level of an object error.
 *
 * **When to use**
 *
 * Use to annotate object errors with the severity reporter callbacks should
 * receive.
 *
 * **Details**
 *
 * Set `error[ErrorReporter.severity]` to a valid `LogLevel.Severity` value.
 * Missing or invalid values fall back to `"Info"`.
 *
 * **Example** (Setting error severity annotations)
 *
 * ```ts import.meta.vitest
 * import { Data, ErrorReporter } from "effect"
 *
 * class DeprecationWarning extends Data.TaggedError("DeprecationWarning")<{}> {
 *   readonly [ErrorReporter.severity] = "Warn" as const
 * }
 *
 * ErrorReporter.getSeverity(new DeprecationWarning()) // => "Warn"
 * ```
 *
 * @see {@link getSeverity} for reading the severity stored under this key
 * @see {@link Reportable} for the annotation contract recognized on object
 * errors
 *
 * @category annotations
 * @since 4.0.0
 */
export const severity: severity = "~effect/ErrorReporter/severity"

/**
 * Reads the `ErrorReporter.severity` annotation from an error object,
 * falling back to `"Info"` when the annotation is unset or invalid.
 *
 * **When to use**
 *
 * Use to inspect the severity that reporter callbacks will receive for an
 * object error.
 *
 * @see {@link severity} for the annotation key used to override severity
 * @see {@link Reportable} for the annotation properties recognized on object errors
 *
 * @category annotations
 * @since 4.0.0
 */
export const getSeverity = (error: object): Severity => {
  if (severity in error && LogLevel.values.includes(error[severity] as Severity)) {
    return error[severity] as Severity
  }
  return "Info"
}

/**
 * Defines the string property key used to attach extra key/value metadata to an object
 * error report.
 *
 * **When to use**
 *
 * Use to type the property key that attaches metadata to object error reports.
 *
 * **Details**
 *
 * Reporters receive these attributes alongside the error, making it easy to
 * include contextual information such as user IDs, request IDs, or other
 * domain-specific debugging data.
 *
 * @category annotations
 * @since 4.0.0
 */
export type attributes = "~effect/ErrorReporter/attributes"

/**
 * Defines the runtime property key used to attach extra key/value metadata to an object
 * error report.
 *
 * **When to use**
 *
 * Use to attach domain metadata to object errors so reporter callbacks receive
 * it with the reported failure.
 *
 * **Details**
 *
 * Set `error[ErrorReporter.attributes]` to a record of metadata that should be
 * forwarded to reporters alongside the error.
 *
 * **Example** (Setting error attributes)
 *
 * ```ts import.meta.vitest
 * import { Data, ErrorReporter } from "effect"
 *
 * class PaymentError extends Data.TaggedError("PaymentError")<{
 *   readonly orderId: string
 * }> {
 *   readonly [ErrorReporter.attributes] = {
 *     orderId: this.orderId
 *   }
 * }
 *
 * ErrorReporter.getAttributes(new PaymentError({ orderId: "order-123" })) // => { orderId: "order-123" }
 * ```
 *
 * @see {@link ignore} for suppressing reports for expected object errors
 * @see {@link severity} for overriding reporter severity
 * @see {@link getAttributes} for reading the metadata stored under this key
 * @see {@link Reportable} for the annotation contract recognized on object
 * errors
 *
 * @category annotations
 * @since 4.0.0
 */
export const attributes: attributes = "~effect/ErrorReporter/attributes"

/**
 * Reads the `ErrorReporter.attributes` annotation from an error object,
 * returning an empty record when unset.
 *
 * **When to use**
 *
 * Use to inspect the attributes that reporter callbacks will receive for an
 * object error.
 *
 * **Details**
 *
 * Returns the value stored under `ErrorReporter.attributes`, or the module's
 * shared empty record when the annotation is absent.
 *
 * **Gotchas**
 *
 * The annotation value is returned as-is; this helper does not validate or
 * clone it.
 *
 * @see {@link attributes} for the annotation key used to attach metadata
 * @see {@link Reportable} for the annotation properties recognized on object errors
 *
 * @category annotations
 * @since 4.0.0
 */
export const getAttributes = (error: object): ReadonlyRecord<string, unknown> => {
  return attributes in error ? error[attributes] as any : emptyAttributes
}

const emptyAttributes: ReadonlyRecord<string, unknown> = {}
