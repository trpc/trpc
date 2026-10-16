/**
 * Derives, samples, and checks generated values from Effect Schema.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Cause from "./Cause.ts"
import type * as Effect from "./Effect.ts"
import type * as Filter from "./Filter.ts"
import * as Formatter from "./Formatter.ts"
import { dual } from "./Function.ts"
import type * as Model from "./internal/arbitrary/model.ts"
import * as Internal from "./internal/arbitrary/runner.ts"
import type { Pipeable } from "./Pipeable.ts"
import { hasProperty, type Predicate, type Refinement } from "./Predicate.ts"
import type * as Schema_ from "./Schema.ts"
import type * as Types from "./Types.ts"

/**
 * Runtime type identifier for `Arbitrary` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = Internal.TypeId

/**
 * Type of the runtime identifier for `Arbitrary` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~effect/arbitrary/Arbitrary"

/**
 * Represents a pure description of values that can be generated and shrunk.
 *
 * **When to use**
 *
 * Use as the result of {@link schema}, {@link Constant}, and composition, and as the input to {@link sampleEffect} or
 * {@link checkEffect}.
 *
 * **Details**
 *
 * Arbitraries implement `Pipeable`, so data-last combinators can be composed with `.pipe(...)`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Arbitrary<out A> extends Pipeable {
  readonly [TypeId]: TypeId
  readonly "~A": Types.Covariant<A>
  /**
   * @internal
   */
  readonly gen: Model.Generator<A>
}

/**
 * Configures Schema-derived generation.
 *
 * **Details**
 *
 * `shrink` returns the immediate semantic simplifications of a failing value. Each returned candidate is validated
 * against the decoded side of the original Schema before it can reach the property.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SchemaOptions<A> {
  readonly shrink?: ((value: A) => ReadonlyArray<A>) | undefined
}

/**
 * Configures the lengths generated and preserved during shrinking by {@link array}.
 *
 * **Details**
 *
 * `minLength` defaults to zero. Generation grows with `size`, honors `minLength` even at size zero, and is capped by
 * `maxLength` when provided. Both bounds must be integers between zero and 4294967295, with `minLength <= maxLength`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ArrayOptions {
  readonly minLength?: number | undefined
  readonly maxLength?: number | undefined
}

/**
 * Checks whether a value is an `Arbitrary`.
 *
 * **When to use**
 *
 * Use when accepting both Arbitrary values and other input descriptions.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isArbitrary = (u: unknown): u is Arbitrary<unknown> => hasProperty(u, TypeId)

/**
 * Configures direct sampling from an `Arbitrary`.
 *
 * **Details**
 *
 * `size` is a local complexity scale, not a global bound on the complete value. Each unconstrained string, collection,
 * or object property observes the same size independently, while recursive branches share one recursion allowance.
 * Explicit Schema minima and required members are still honored, while explicit maxima clamp generation.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SampleOptions {
  readonly count?: number | undefined
  readonly size?: number | undefined
  readonly maxDiscards?: number | undefined
  readonly seed?: string | number | undefined
}

/**
 * Describes sampling exhaustion before the requested number of values was generated.
 *
 * **Details**
 *
 * The effective `seed` can be passed to {@link sampleEffect} to reproduce the exhausted run, including when sampling
 * originally selected a seed from the Effect `Random` service.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export interface SampleError {
  readonly _tag: "SampleError"
  readonly generated: number
  readonly discards: number
  readonly seed: string | number
}

/**
 * Opaque string token that replays a falsification and its complete shrink path.
 *
 * **When to use**
 *
 * Use with {@link CheckOptions.replay} to copy, store, and reproduce a `Falsified` result from the same
 * implementation.
 *
 * **Details**
 *
 * The token records whether the property returned `false` or failed its Effect, but does not record a typed error value
 * or input fingerprint.
 *
 * **Gotchas**
 *
 * Replay compatibility is not guaranteed across releases of this unstable module.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Replay = string

/**
 * Configures property checking, shrinking, and replay.
 *
 * **Details**
 *
 * `size` is the maximum local complexity scale. Checking starts with smaller values and grows to that size according
 * to completed runs; discarded attempts do not advance the progression. A single-run check uses the configured size.
 * Each unconstrained string, collection, or object property observes the current size independently. Recursive
 * branches instead consume one shared recursion allowance. Explicit Schema bounds and required members still apply.
 *
 * `maxShrinks` bounds the number of shrink candidates inspected after the initial failure. Candidates rejected by a
 * Schema check, `filter`, `filterMap`, or dependent generation consume the same budget even though the property is not
 * evaluated. Candidates that produce a different failure class also consume the budget. When the budget is exhausted,
 * checking returns the best shrunk input found so far. The `shrinks` field in a `Falsified` result counts only
 * candidates that were accepted as smaller failures.
 *
 * **Gotchas**
 *
 * When `replay` is present, its recorded seed, attempt, size, and shrink path control the run. The `runs`, `size`,
 * `maxDiscards`, `maxShrinks`, and `seed` options are ignored.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface CheckOptions {
  readonly runs?: number | undefined
  readonly size?: number | undefined
  readonly maxDiscards?: number | undefined
  readonly maxShrinks?: number | undefined
  readonly seed?: string | number | undefined
  readonly replay?: Replay | undefined
}

/**
 * Independent defaults for property checking and sampling, excluding replay tokens.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface GlobalOptions {
  readonly check?: Omit<CheckOptions, "replay"> | undefined
  readonly sample?: SampleOptions | undefined
}

/**
 * Replaces the defaults used by {@link checkEffect} and {@link sampleEffect}.
 *
 * **Details**
 *
 * Options are resolved once per execution: explicit non-`undefined` values, then configured defaults, then built-in
 * defaults. The supplied configuration is copied. Pass `{}` to reset it. Replay tokens retain control of replayed checks.
 *
 * **Gotchas**
 *
 * Configure defaults before starting concurrent tests. Changes affect subsequent executions, including Effects created
 * earlier, but do not affect active runs.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export const configureGlobal = Internal.configureGlobal

/**
 * Identifies a property that returned `false`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ReturnedFalse {
  readonly _tag: "ReturnedFalse"
}

/**
 * Preserves a typed failure produced by an effectful property.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PropertyError<out E> {
  readonly _tag: "PropertyError"
  readonly error: E
}

/**
 * Represents the reason a property was falsified.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type PropertyFailure<E> = ReturnedFalse | PropertyError<E>

/**
 * Reports that every requested property run passed.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Passed {
  readonly _tag: "Passed"
  readonly runs: number
  readonly discards: number
}

/**
 * Reports a generated failure and its shrunk input.
 *
 * **Details**
 *
 * `initialInput` is the generated value that first falsified the property. `shrunkInput` is the best failing value found
 * by the bounded shrink search and may be equal to `initialInput`.
 *
 * `runs` counts main property evaluations through the falsifying evaluation. It excludes evaluations performed while
 * shrinking. A replay reports one run.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Falsified<out A, out E> {
  readonly _tag: "Falsified"
  readonly initialInput: A
  readonly shrunkInput: A
  readonly failure: PropertyFailure<E>
  readonly runs: number
  readonly discards: number
  readonly shrinks: number
  readonly replay: Replay
}

/**
 * Reports that bounded generation discarded too many candidates.
 *
 * **Details**
 *
 * The effective `seed` can be passed to {@link checkEffect} to reproduce the exhausted run, including when checking
 * originally selected a seed from the Effect `Random` service.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Exhausted {
  readonly _tag: "Exhausted"
  readonly runs: number
  readonly discards: number
  readonly seed: string | number
}

/**
 * Reports that replay coordinates no longer reproduce the recorded failure class.
 *
 * **Details**
 *
 * - `PropertyPassed` means that the regenerated root passed.
 * - `ShrinkPassed` means that the root switched failure class, or that a recorded shrink either passed or switched
 *   failure class.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ReplayMismatch {
  readonly _tag: "ReplayMismatch"
  readonly reason: "AttemptDiscarded" | "PropertyPassed" | "ShrinkPathUnavailable" | "ShrinkPassed"
}

/**
 * Represents every ordinary outcome of property checking.
 *
 * **Details**
 *
 * Defects and fiber interruption are not converted to this data type and continue through the returned `Effect`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type CheckResult<A, E> = Passed | Falsified<A, E> | Exhausted | ReplayMismatch

/**
 * Formats an unsuccessful property-check result as a diagnostic message, returning `undefined` for a passed result.
 *
 * **When to use**
 *
 * Use when integrating `checkEffect` with a test runner or another reporting interface.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export function formatCheckFailure<A, E>(result: CheckResult<A, E>): string | undefined {
  switch (result._tag) {
    case "Passed":
      return undefined
    case "Falsified":
      return `Property falsified after ${result.runs} run(s) and ${result.shrinks} shrink(s)\n` +
        `Shrunk input: ${Formatter.format(result.shrunkInput, { space: 2 })}\n` +
        `${
          result.failure._tag === "ReturnedFalse"
            ? "Failure: returned false"
            : `Failure: ${
              Cause.isCause(result.failure.error)
                ? Cause.pretty(result.failure.error)
                : Formatter.format(result.failure.error, { space: 2 })
            }`
        }\n` +
        `Replay: ${result.replay}`
    case "Exhausted":
      return `Property exhausted after ${result.runs} run(s) and ${result.discards} discard(s)\n` +
        `Seed: ${Formatter.format(result.seed, { space: 2 })}`
    case "ReplayMismatch":
      return `Property replay failed: ${result.reason}`
  }
}

/**
 * Derives an `Arbitrary` from the decoded `Type` of a Schema.
 *
 * **When to use**
 *
 * Use when you want Schema-aware generation without exposing a third-party property-testing engine.
 *
 * **Details**
 *
 * When `options.shrink` is provided, generated roots still come from Schema derivation, while the callback defines the
 * complete shrink tree. Invalid candidates are skipped and count against `maxShrinks` without reaching the property.
 *
 * **Gotchas**
 *
 * Derivation is immediate and throws when the current unstable implementation cannot compile the Schema or prove a
 * finite route through a recursive component.
 *
 * A custom shrinker replaces Schema-derived shrinking. It is evaluated lazily after a property failure and must be
 * synchronous, deterministic, terminating, and free of mutation.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export function schema<S extends Schema_.Constraint>(
  schema: S,
  options?: SchemaOptions<S["Type"]>
): Arbitrary<S["Type"]> {
  return Internal.schema(schema, options)
}

/**
 * Creates an `Arbitrary` that always generates `value` and has no shrink candidates.
 *
 * **When to use**
 *
 * Use when a branch of dependent generation should produce an already constructed value.
 *
 * **Gotchas**
 *
 * Every generation returns the same value. Objects are not cloned, so properties must not mutate them.
 *
 * @see {@link flatMap} for selecting dependent Arbitraries
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export function Constant<const A>(value: A): Arbitrary<A> {
  return Internal.constant(value)
}

/**
 * Generates variable-length arrays from an existing element `Arbitrary`.
 *
 * **When to use**
 *
 * Use when generating command sequences or collections whose elements are built with Arbitrary composition.
 *
 * **Details**
 *
 * Shrinking tries removing blocks, including prefixes and interior blocks, while preserving the order and values of
 * retained elements. It also tries the elements' own shrink candidates. Length bounds remain valid during shrinking,
 * and elements share the generation budget for recursion.
 *
 * **Gotchas**
 *
 * Invalid length bounds throw a `RangeError` when this function is called. Retained objects are not cloned, so
 * properties must not mutate generated values. Bounded shrinking does not guarantee a globally minimal failure.
 *
 * **Example** (Removing irrelevant commands)
 *
 * ```ts import.meta.vitest
 * import { Arbitrary, Effect, Schema } from "effect"
 *
 * const command = Arbitrary.schema(Schema.Literals(["Add", "Reset", "Stop"]))
 * const commands = Arbitrary.array(command, { maxLength: 50 })
 * const result = await Effect.runPromise(
 *   Arbitrary.checkEffect(commands, (values) => {
 *     // The state machine fails when Reset occurs before a later Stop.
 *     const reset = values.indexOf("Reset")
 *     return reset === -1 || !values.slice(reset + 1).includes("Stop")
 *   }, { runs: 1, size: 4, seed: 0 })
 * )
 *
 * result._tag // => "Falsified"
 * if (result._tag === "Falsified") {
 *   result.initialInput // => ["Add", "Add", "Reset", "Stop"]
 *   result.shrunkInput // => ["Reset", "Stop"]
 * }
 * ```
 *
 * @see {@link ArrayOptions} for length bounds
 * @see {@link all} for fixed tuples and records of Arbitraries
 * @see {@link schema} for deriving arrays described by Schema
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const array: <A>(item: Arbitrary<A>, options?: ArrayOptions) => Arbitrary<Array<A>> = Internal.array

/**
 * Transforms every generated value and its shrink candidates.
 *
 * **When to use**
 *
 * Use when you want to derive generated values from an existing `Arbitrary` without changing its generation or shrink
 * structure.
 *
 * @stability unstable
 * @category mapping
 * @since 4.0.0
 */
export const map: {
  <A, B>(f: (value: A) => B): (self: Arbitrary<A>) => Arbitrary<B>
  <A, B>(self: Arbitrary<A>, f: (value: A) => B): Arbitrary<B>
} = dual(2, <A, B>(self: Arbitrary<A>, f: (value: A) => B): Arbitrary<B> => Internal.map(self, f))

/**
 * Keeps generated values and shrink candidates that satisfy a predicate or refinement.
 *
 * **When to use**
 *
 * Use when a condition cannot be expressed constructively by the source Schema or after values have been transformed.
 *
 * **Gotchas**
 *
 * Rejected generated values count against `maxDiscards`. Prefer Schema checks when possible because the Schema compiler
 * may generate matching values directly.
 *
 * @see {@link filterMap} for transforming and filtering simultaneously
 * @stability unstable
 * @category filtering
 * @since 4.0.0
 */
export const filter: {
  <A, B extends A>(refinement: Refinement<A, B>): (self: Arbitrary<A>) => Arbitrary<B>
  <A>(predicate: Predicate<A>): <B extends A>(self: Arbitrary<B>) => Arbitrary<B>
  <A, B extends A>(self: Arbitrary<A>, refinement: Refinement<A, B>): Arbitrary<B>
  <A>(self: Arbitrary<A>, predicate: Predicate<A>): Arbitrary<A>
} = dual(2, <A>(self: Arbitrary<A>, predicate: Predicate<A>): Arbitrary<A> => Internal.filter(self, predicate))

/**
 * Transforms accepted generated values and discards rejected values.
 *
 * **When to use**
 *
 * Use when transformation and validation need to happen in one step after constructing an `Arbitrary`.
 *
 * **Gotchas**
 *
 * Failed filters discard generated roots and count against `maxDiscards`. Failures are not exposed in sampling or
 * checking results.
 *
 * @see {@link map} for transformations that cannot reject
 * @see {@link filter} for retaining original values that satisfy a condition
 * @stability unstable
 * @category filtering
 * @since 4.0.0
 */
export const filterMap: {
  <A, B, X>(f: Filter.Filter<A, B, X>): (self: Arbitrary<A>) => Arbitrary<B>
  <A, B, X>(self: Arbitrary<A>, f: Filter.Filter<A, B, X>): Arbitrary<B>
} = dual(
  2,
  <A, B, X>(self: Arbitrary<A>, f: Filter.Filter<A, B, X>): Arbitrary<B> => Internal.filterMap(self, f)
)

/**
 * Sequentially selects an `Arbitrary` from a generated value.
 *
 * **When to use**
 *
 * Use when the domain or shape of a generated value depends on another generated value.
 *
 * **Details**
 *
 * Shrinking first tries smaller source values and regenerates their dependent Arbitraries. It then shrinks the
 * selected dependent value. After a dependent shrink is selected, source shrinking is closed for that branch.
 *
 * **Gotchas**
 *
 * The callback must be synchronous, deterministic, and terminating. It can be evaluated again during shrinking and
 * replay. Deriving a Schema inside the callback also repeats that derivation, so precompile finite dependent
 * Arbitraries when possible.
 *
 * @see {@link map} for total transformations that do not select another Arbitrary
 * @see {@link Constant} for dependent branches that return an existing value
 * @stability unstable
 * @category sequencing
 * @since 4.0.0
 */
export const flatMap: {
  <A, B>(f: (value: A) => Arbitrary<B>): (self: Arbitrary<A>) => Arbitrary<B>
  <A, B>(self: Arbitrary<A>, f: (value: A) => Arbitrary<B>): Arbitrary<B>
} = dual(2, <A, B>(self: Arbitrary<A>, f: (value: A) => Arbitrary<B>): Arbitrary<B> => Internal.flatMap(self, f))

/**
 * Combines Arbitraries into one `Arbitrary` whose generated value mirrors the input shape.
 *
 * **When to use**
 *
 * Use when you need to generate several independent values together.
 *
 * **Details**
 *
 * Accepts a tuple or array, an iterable, or a record of Arbitraries. Tuple positions and record keys are preserved in
 * the generated value. Members are generated in a randomized internal order so recursive members share the generation
 * budget fairly, while shrinking changes one member at a time.
 *
 * **Gotchas**
 *
 * Iterable inputs are consumed when `all` is called. If any member discards a generated root, the complete generated
 * value is discarded.
 *
 * @see {@link array} for variable-length arrays that shrink by removing elements
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export function all<const Input extends Iterable<Arbitrary<any>> | Record<string, Arbitrary<any>>>(
  input: Input
): Arbitrary<
  [Input] extends [ReadonlyArray<Arbitrary<any>>] ? {
      -readonly [K in keyof Input]: [Input[K]] extends [Arbitrary<infer A>] ? A : never
    }
    : [Input] extends [Iterable<Arbitrary<infer A>>] ? Array<A>
    : [Input] extends [Record<string, Arbitrary<any>>] ? {
        -readonly [K in keyof Input]: [Input[K]] extends [Arbitrary<infer A>] ? A : never
      }
    : never
> {
  return Internal.all(input)
}

/**
 * Generates a bounded collection of values from an `Arbitrary`.
 *
 * **When to use**
 *
 * Use when you need generated examples without running a property.
 *
 * @stability unstable
 * @category running
 * @since 4.0.0
 */
export function sampleEffect<A>(
  self: Arbitrary<A>,
  options?: SampleOptions
): Effect.Effect<ReadonlyArray<A>, SampleError> {
  return Internal.sampleEffect(self, options)
}

/**
 * Checks a pure or effectful property and shrinks the first falsification.
 *
 * **When to use**
 *
 * Use when you want deterministic, interruptible property checking with typed property failures and replay.
 *
 * **Details**
 *
 * Returning `false` and failing an Effect are shrinkable falsifications. Shrinking preserves which of these two
 * failure classes caused the initial falsification. Typed error values may change while shrinking and are not compared
 * for equality. Defects and interruption continue through the returned Effect instead of becoming `CheckResult`
 * values.
 *
 * **Gotchas**
 *
 * Properties must treat generated values as immutable. The runner does not clone values before evaluation, so
 * mutation can change reported shrunk inputs or interfere with shrinking and replay.
 *
 * A property must also produce the same outcome for the same input and initial environment. The runner may evaluate
 * it repeatedly and does not restore mutable services between evaluations. Stateful properties should acquire and
 * release an independent fixture inside each evaluation.
 *
 * @stability unstable
 * @category running
 * @since 4.0.0
 */
export function checkEffect<A, E = never, R = never>(
  self: Arbitrary<A>,
  property: (value: A) => boolean | Effect.Effect<boolean, E, R>,
  options?: CheckOptions
): Effect.Effect<CheckResult<A, E>, never, R> {
  return Internal.checkEffect(self, property, options)
}
