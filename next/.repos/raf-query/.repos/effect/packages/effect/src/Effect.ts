/**
 * Describes workflows that run only when executed by the Effect runtime.
 *
 * An `Effect<A, E, R>` can succeed with an `A`, fail with an `E`, and require
 * services `R`. Creating an effect does not perform the work; it builds a value
 * that can be composed, provided with services, retried, interrupted, run
 * concurrently, or inspected by the runtime. This module is the main API for
 * creating effects, combining them, handling failures, managing resources, and
 * running effect programs.
 *
 * @since 2.0.0
 */
import type * as Arr from "./Array.ts"
import type * as Cause from "./Cause.ts"
import type { Clock } from "./Clock.ts"
import * as Context from "./Context.ts"
import * as Duration from "./Duration.ts"
import type * as ExecutionPlan from "./ExecutionPlan.ts"
import * as Exit from "./Exit.ts"
import type { Fiber } from "./Fiber.ts"
import type * as Filter from "./Filter.ts"
import { constant, dual, type LazyArg } from "./Function.ts"
import type { TypeLambda } from "./HKT.ts"
import type { Inspectable } from "./Inspectable.ts"
import * as core from "./internal/core.ts"
import * as internal from "./internal/effect.ts"
import * as internalExecutionPlan from "./internal/executionPlan.ts"
import * as internalLayer from "./internal/layer.ts"
import * as InternalRecord from "./internal/record.ts"
import * as internalRequest from "./internal/request.ts"
import * as internalSchedule from "./internal/schedule.ts"
import type * as Layer from "./Layer.ts"
import type { Logger } from "./Logger.ts"
import type { Severity } from "./LogLevel.ts"
import * as Metric from "./Metric.ts"
import type { Option } from "./Option.ts"
import type { Pipeable } from "./Pipeable.ts"
import type * as Predicate from "./Predicate.ts"
import { CurrentLogAnnotations, CurrentLogSpans } from "./References.ts"
import type * as Request from "./Request.ts"
import type { RequestResolver } from "./RequestResolver.ts"
import type * as Result from "./Result.ts"
import type { Metadata as ScheduleMetadata, Schedule } from "./Schedule.ts"
import type { Scheduler } from "./Scheduler.ts"
import type { Scope } from "./Scope.ts"
import type {
  AnySpan,
  ParentSpan,
  Span,
  SpanLink,
  SpanOptions,
  SpanOptionsNoTrace,
  TraceOptions,
  Tracer
} from "./Tracer.ts"
import type { TxRef } from "./TxRef.ts"
import type {
  Concurrency,
  Covariant,
  EqualsWith,
  ExcludeReason,
  ExcludeTag,
  ExtractReason,
  ExtractTag,
  NarrowReason,
  NoInfer,
  OmitReason,
  ReasonOf,
  ReasonTags,
  Simplify,
  Tags,
  unassigned
} from "./Types.ts"
import type * as Unify from "./Unify.ts"

/**
 * Type-level identifier for `Effect` values.
 *
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~effect/Effect"

/**
 * Runtime identifier used to recognize `Effect` values.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = core.EffectTypeId

/**
 * The `Effect` interface defines a value that lazily describes a workflow or
 * job. The workflow requires some context `R`, and may fail with an error of
 * type `E`, or succeed with a value of type `A`.
 *
 * **When to use**
 *
 * Use when you need to represent a lazy, composable workflow that can require
 * services, fail with a typed error, or succeed with a typed value.
 *
 * **Details**
 *
 * `Effect` values model resourceful interaction with the outside world,
 * including synchronous, asynchronous, concurrent, and parallel interaction.
 * They use a fiber-based concurrency model, with built-in support for
 * scheduling, fine-grained interruption, structured concurrency, and high
 * scalability.
 *
 * To run an `Effect` value, you need a `Runtime`, which is a type that is
 * capable of executing `Effect` values.
 *
 * @category models
 * @since 2.0.0
 */
export interface Effect<out A, out E = never, out R = never> extends Pipeable, Inspectable {
  readonly [TypeId]: Variance<A, E, R>
  [Symbol.iterator](): EffectIterator<Effect<A, E, R>>
  [Unify.typeSymbol]?: unknown
  [Unify.unifySymbol]?: EffectUnify<this>
  [Unify.ignoreSymbol]?: {}
}

/**
 * Type-level unification support for `Effect` values.
 *
 * @category models
 * @since 2.0.0
 */
export interface EffectUnify<A extends { [Unify.typeSymbol]?: any }> {
  Effect?: () => A[Unify.typeSymbol] extends
    | Effect<infer A0, infer E0, infer R0>
    | infer _ ? Effect<A0, E0, R0>
    : never
}

/**
 * Type lambda used to represent `Effect` in higher-kinded APIs.
 *
 * @category utility types
 * @since 2.0.0
 */
export interface EffectTypeLambda extends TypeLambda {
  readonly type: Effect<this["Target"], this["Out1"], this["Out2"]>
}

/**
 * Variance interface for Effect, encoding the type parameters' variance.
 *
 * @category models
 * @since 2.0.0
 */
export interface Variance<A, E, R> {
  _A: Covariant<A>
  _E: Covariant<E>
  _R: Covariant<R>
}

/**
 * Extracts the success type from an `Effect`.
 *
 * **When to use**
 *
 * Use to derive the value produced by an existing effect when declaring
 * reusable type aliases, service interfaces, or function signatures.
 *
 * @see {@link Error} for extracting the failure type from the same `Effect`
 * @see {@link Services} for extracting the required services from the same `Effect`
 *
 * @category utility types
 * @since 2.0.0
 */
export type Success<T> = T extends Effect<infer _A, infer _E, infer _R> ? _A
  : never

/**
 * Extracts the error type from an `Effect`.
 *
 * **When to use**
 *
 * Use to derive the error type from an existing `Effect` type when declaring
 * helper types, wrappers, or APIs that preserve the effect's failure channel.
 *
 * **Details**
 *
 * Non-`Effect` inputs resolve to `never`.
 *
 * @see {@link Success} for extracting the success value type instead
 * @see {@link Services} for extracting the required services type instead
 *
 * @category utility types
 * @since 2.0.0
 */
export type Error<T> = T extends Effect<infer _A, infer _E, infer _R> ? _E
  : never

/**
 * Extracts the required services type from an `Effect`.
 *
 * **When to use**
 *
 * Use to derive the context requirements of a generic or inferred `Effect`
 * without restating its `R` type parameter.
 *
 * @see {@link Success} for extracting the success value type instead
 * @see {@link Error} for extracting the failure type instead
 *
 * @category utility types
 * @since 4.0.0
 */
export type Services<T> = T extends Effect<infer _A, infer _E, infer _R> ? _R
  : never

/**
 * Checks whether a value is an `Effect`.
 *
 * **Example** (Checking whether a value is an Effect)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * Effect.isEffect(Effect.succeed(1)) // => true
 * Effect.isEffect("hello") // => false
 * ```
 *
 * @category guards
 * @since 2.0.0
 */
export const isEffect: (u: unknown) => u is Effect<unknown, unknown, unknown> = core.isEffect

/**
 * Iterator interface for Effect generators, enabling Effect values to work with generator functions.
 *
 * **When to use**
 *
 * Use when defining or typing `[Symbol.iterator]()` for values typed as
 * `Effect`s so `yield*` can pass their success type back into `Effect.gen`.
 *
 * @see {@link gen} for writing generator-based `Effect` programs that consume this iterator protocol
 *
 * @category models
 * @since 4.0.0
 */
export interface EffectIterator<T extends Effect<any, any, any>> {
  next(
    ...args: ReadonlyArray<any>
  ): IteratorResult<T, Success<T>>
}

// ========================================================================
// Collecting
// ========================================================================

/**
 * Namespace containing type utilities for the `Effect.all` function, which handles
 * collecting multiple effects into various output structures.
 *
 * @category collecting
 * @since 2.0.0
 */
export declare namespace All {
  /**
   * Alias for any `Effect` value accepted by `Effect.all`.
   *
   * @category utility types
   * @since 2.0.0
   */
  export type EffectAny = Effect<any, any, any>

  /**
   * Computes the return type for `Effect.all` when collecting an iterable.
   *
   * @category utility types
   * @since 2.0.0
   */
  export type ReturnIterable<
    T extends Iterable<EffectAny>,
    Discard extends boolean,
    Mode extends boolean = false
  > = [T] extends [Iterable<Effect<infer A, infer E, infer R>>] ? Effect<
      Discard extends true ? void : Array<Mode extends true ? Result.Result<A, E> : A>,
      Mode extends true ? never : E,
      R
    >
    : never

  /**
   * Computes the return type for `Effect.all` when collecting a tuple.
   *
   * @category utility types
   * @since 2.0.0
   */
  export type ReturnTuple<
    T extends ReadonlyArray<unknown>,
    Discard extends boolean,
    Mode extends boolean = false
  > = Effect<
    Discard extends true ? void
      : T[number] extends never ? []
      : {
        -readonly [K in keyof T]: T[K] extends Effect<
          infer _A,
          infer _E,
          infer _R
        > ? Mode extends true ? Result.Result<_A, _E> : _A
          : never
      },
    Mode extends true ? never
      : T[number] extends never ? never
      : T[number] extends Effect<infer _A, infer _E, infer _R> ? _E
      : never,
    T[number] extends never ? never
      : T[number] extends Effect<infer _A, infer _E, infer _R> ? _R
      : never
  > extends infer X ? X
    : never

  /**
   * Computes the return type for `Effect.all` when collecting a record.
   *
   * @category utility types
   * @since 2.0.0
   */
  export type ReturnObject<T, Discard extends boolean, Mode extends boolean = false> = [T] extends [
    Record<string, EffectAny>
  ] ? Effect<
      Discard extends true ? void
        : {
          -readonly [K in keyof T]: [T[K]] extends [
            Effect<infer _A, infer _E, infer _R>
          ] ? Mode extends true ? Result.Result<_A, _E> : _A
            : never
        },
      Mode extends true ? never : Error<ObjectValues<T>>,
      Services<ObjectValues<T>>
    >
    : never

  /**
   * Detects whether `Effect.all` should discard collected values.
   *
   * @category utility types
   * @since 2.0.0
   */
  export type IsDiscard<A> = [Extract<A, { readonly discard: true }>] extends [
    never
  ] ? false
    : true

  /**
   * Detects whether `Effect.all` should collect results in `Result` mode.
   *
   * @category utility types
   * @since 4.0.0
   */
  export type IsResult<A> = [Extract<A, { readonly mode: "result" }>] extends [never] ? false : true

  /**
   * Computes the return type for `Effect.all` from its input and options.
   *
   * @category utility types
   * @since 2.0.0
   */
  export type Return<
    Arg extends Iterable<EffectAny> | Record<string, EffectAny>,
    O extends {
      readonly concurrency?: Concurrency | undefined
      readonly discard?: boolean | undefined
      readonly mode?: "default" | "result" | undefined
    }
  > = [Arg] extends [ReadonlyArray<EffectAny>] ? ReturnTuple<Arg, IsDiscard<O>, IsResult<O>>
    : [Arg] extends [Iterable<EffectAny>] ? ReturnIterable<Arg, IsDiscard<O>, IsResult<O>>
    : [Arg] extends [Record<string, EffectAny>] ? ReturnObject<Arg, IsDiscard<O>, IsResult<O>>
    : never

  type ObjectValues<T> = T extends unknown ? T[keyof T] : never
}

/**
 * Combines an iterable or record of effects into one effect whose success shape
 * follows the input.
 *
 * **When to use**
 *
 * Use to run a known collection of effects and collect results in the same
 * tuple, iterable, or record shape.
 *
 * **Details**
 *
 * Tuple and iterable inputs collect results in order. Record inputs collect
 * results under the same keys. By default, the combined effect fails on the
 * first failure; with concurrent execution, effects that have already started
 * may be interrupted, while effects not yet started are skipped.
 *
 * Options:
 *
 * Use `concurrency` to control sequential or concurrent execution. Use
 * `mode: "result"` to run every effect and collect each success or failure as a
 * `Result` in the same output shape. Use `discard: true` to ignore successful
 * values and return `void`.
 *
 * **Example** (Collecting tuple results in order)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const tupleOfEffects = [
 *   Effect.succeed(42),
 *   Effect.succeed("Hello")
 * ] as const
 *
 * //      ┌─── Effect<[number, string], never, never>
 * //      ▼
 * const resultsAsTuple = Effect.all(tupleOfEffects)
 *
 * await Effect.runPromise(resultsAsTuple) // => [42, "Hello"]
 * ```
 *
 * **Example** (Collecting iterable results in order)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const iterableOfEffects: Iterable<Effect.Effect<number>> = [1, 2, 3].map(
 *   Effect.succeed
 * )
 *
 * //      ┌─── Effect<number[], never, never>
 * //      ▼
 * const resultsAsArray = Effect.all(iterableOfEffects)
 *
 * await Effect.runPromise(resultsAsArray) // => [1, 2, 3]
 * ```
 *
 * **Example** (Collecting struct results by key)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const structOfEffects = {
 *   a: Effect.succeed(42),
 *   b: Effect.succeed("Hello")
 * }
 *
 * //      ┌─── Effect<{ a: number; b: string; }, never, never>
 * //      ▼
 * const resultsAsStruct = Effect.all(structOfEffects)
 *
 * await Effect.runPromise(resultsAsStruct) // => { a: 42, b: "Hello" }
 * ```
 *
 * **Example** (Collecting record results by key)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const recordOfEffects: Record<string, Effect.Effect<number>> = {
 *   key1: Effect.succeed(1),
 *   key2: Effect.succeed(2)
 * }
 *
 * //      ┌─── Effect<{ [x: string]: number; }, never, never>
 * //      ▼
 * const resultsAsRecord = Effect.all(recordOfEffects)
 *
 * await Effect.runPromise(resultsAsRecord) // => { key1: 1, key2: 2 }
 * ```
 *
 * **Example** (Stopping on the first failure)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit } from "effect"
 * const output: Array<unknown> = []
 * const record = (value: unknown) => Effect.sync(() => { output.push(value) })
 *
 * const program = Effect.all([
 *   Effect.succeed("Task1").pipe(Effect.tap(record)),
 *   Effect.fail("Task2: Oh no!").pipe(Effect.tap(record)),
 *   // Won't execute due to earlier failure
 *   Effect.succeed("Task3").pipe(Effect.tap(record))
 * ])
 *
 * const outcome = await Effect.runPromiseExit(program)
 * const observation = [output, outcome] // => [["Task1"], Exit.fail("Task2: Oh no!")]
 * ```
 *
 * @see {@link forEach} for iterating over elements and applying an effect.
 * @category collecting
 * @since 2.0.0
 */
export const all: <
  const Arg extends
    | Iterable<Effect<any, any, any>>
    | Record<string, Effect<any, any, any>>,
  O extends {
    readonly concurrency?: Concurrency | undefined
    readonly discard?: boolean | undefined
    readonly mode?: "default" | "result" | undefined
  }
>(
  arg: Arg,
  options?: O
) => All.Return<Arg, O> = internal.all

/**
 * Applies an effectful function to each element and partitions successes and
 * failures.
 *
 * **Details**
 *
 * The returned tuple is `[passes, fails]`, where `passes` contains all
 * successes and `fails` contains all failures.
 *
 * This function runs every effect and never fails. Use `concurrency` to control
 * parallelism.
 *
 * **Example** (Separating successes and failures)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const program = Effect.partition([0, 1, 2, 3], (n) =>
 *   n % 2 === 0 ? Effect.fail(`${n} is even`) : Effect.succeed(n)
 * )
 *
 * await Effect.runPromise(program) // => [[1, 3], ['0 is even', '2 is even']]
 * ```
 *
 * @category collecting
 * @since 2.0.0
 */
export const partition: {
  <A, B, E, R>(
    f: (a: A, i: number) => Effect<B, E, R>,
    options?: { readonly concurrency?: Concurrency | undefined }
  ): (elements: Iterable<A>) => Effect<[passes: Array<B>, fails: Array<E>], never, R>
  <A, B, E, R>(
    elements: Iterable<A>,
    f: (a: A, i: number) => Effect<B, E, R>,
    options?: { readonly concurrency?: Concurrency | undefined }
  ): Effect<[passes: Array<B>, fails: Array<E>], never, R>
} = internal.partition

/**
 * Reduces elements from left to right with an effectful accumulator function.
 *
 * **When to use**
 *
 * Use when each accumulation step is effectful and must run sequentially in
 * iteration order.
 *
 * **Details**
 *
 * The accumulator function receives the current accumulator, the current
 * element, and its zero-based index. The `zero` function is evaluated each
 * time the effect runs. An empty iterable succeeds with its result. If a step
 * fails, remaining elements are not processed.
 *
 * **Example** (Summing values sequentially)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.reduce(
 *   [1, 2, 3],
 *   () => 0,
 *   (total, value, index) =>
 *     Effect.sync(() => { output.push(`Adding ${value} at index ${index}`) }).pipe(
 *       Effect.as(total + value)
 *     )
 * )
 *
 * void output.push(await Effect.runPromise(program))
 * output // => ["Adding 1 at index 0", "Adding 2 at index 1", "Adding 3 at index 2", 6]
 * ```
 *
 * @category collecting
 * @since 2.0.0
 */
export const reduce: {
  <Z, A, E, R>(
    zero: LazyArg<Z>,
    f: (z: Z, a: A, i: number) => Effect<Z, E, R>
  ): (elements: Iterable<A>) => Effect<Z, E, R>
  <A, Z, E, R>(
    elements: Iterable<A>,
    zero: LazyArg<Z>,
    f: (z: Z, a: A, i: number) => Effect<Z, E, R>
  ): Effect<Z, E, R>
} = internal.reduce

/**
 * Applies an effectful function to each element and accumulates all failures.
 *
 * **Details**
 *
 * This function always evaluates every element. If at least one effect fails,
 * all failures are returned as a non-empty array and successes are discarded.
 * If all effects succeed, it returns all collected successes.
 *
 * Use `discard: true` to ignore successful values while still validating all
 * elements.
 *
 * **Example** (Validating every element)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit } from "effect"
 *
 * const program = Effect.validate([0, 1, 2, 3], (n) =>
 *   n % 2 === 0 ? Effect.fail(`${n} is even`) : Effect.succeed(n)
 * )
 *
 * await Effect.runPromiseExit(program) // => Exit.fail(["0 is even", "2 is even"])
 * ```
 *
 * @category collecting
 * @since 2.0.0
 */
export const validate: {
  <A, B, E, R>(
    f: (a: A, i: number) => Effect<B, E, R>,
    options?: {
      readonly concurrency?: Concurrency | undefined
      readonly discard?: false | undefined
    } | undefined
  ): (elements: Iterable<A>) => Effect<Array<B>, Arr.NonEmptyArray<E>, R>
  <A, B, E, R>(
    f: (a: A, i: number) => Effect<B, E, R>,
    options: {
      readonly concurrency?: Concurrency | undefined
      readonly discard: true
    }
  ): (elements: Iterable<A>) => Effect<void, Arr.NonEmptyArray<E>, R>
  <A, B, E, R>(
    elements: Iterable<A>,
    f: (a: A, i: number) => Effect<B, E, R>,
    options?: {
      readonly concurrency?: Concurrency | undefined
      readonly discard?: false | undefined
    } | undefined
  ): Effect<Array<B>, Arr.NonEmptyArray<E>, R>
  <A, B, E, R>(
    elements: Iterable<A>,
    f: (a: A, i: number) => Effect<B, E, R>,
    options: {
      readonly concurrency?: Concurrency | undefined
      readonly discard: true
    }
  ): Effect<void, Arr.NonEmptyArray<E>, R>
} = internal.validate

/**
 * Returns the first element that satisfies an effectful predicate.
 *
 * **Details**
 *
 * The predicate receives the element and its index. Evaluation short-circuits
 * as soon as an element matches.
 *
 * **Example** (Finding the first successful match)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option } from "effect"
 *
 * const program = Effect.findFirst([1, 2, 3, 4], (n) => Effect.succeed(n > 2))
 *
 * await Effect.runPromise(program) // => Option.some(3)
 * ```
 *
 * @category collecting
 * @since 2.0.0
 */
export const findFirst: {
  <A, E, R>(
    predicate: (a: NoInfer<A>, i: number) => Effect<boolean, E, R>
  ): (elements: Iterable<A>) => Effect<Option<A>, E, R>
  <A, E, R>(
    elements: Iterable<A>,
    predicate: (a: NoInfer<A>, i: number) => Effect<boolean, E, R>
  ): Effect<Option<A>, E, R>
} = internal.findFirst

/**
 * Returns the first value that passes an effectful `FilterEffect`.
 *
 * **When to use**
 *
 * Use when you need to find the first element that satisfies an effectful
 * filter returning a `Result`, which also transforms the matching element.
 *
 * **Details**
 *
 * The filter receives the element and index. Evaluation short-circuits on the
 * first `Result.succeed` and returns the transformed value in `Option.some`.
 *
 * @see {@link findFirst} for the simpler effectful predicate-based variant
 *
 * @category collecting
 * @since 4.0.0
 */
export const findFirstFilter: {
  <A, B, X, E, R>(
    filter: (input: NoInfer<A>, i: number) => Effect<Result.Result<B, X>, E, R>
  ): (elements: Iterable<A>) => Effect<Option<B>, E, R>
  <A, B, X, E, R>(
    elements: Iterable<A>,
    filter: (input: NoInfer<A>, i: number) => Effect<Result.Result<B, X>, E, R>
  ): Effect<Option<B>, E, R>
} = internal.findFirstFilter

/**
 * Executes an effectful operation for each element in an `Iterable`.
 *
 * **When to use**
 *
 * Use to traverse an iterable with an effectful function while preserving
 * element order in the collected results.
 *
 * **Details**
 *
 * The `forEach` function applies a provided operation to each element in the
 * iterable, producing a new effect that returns an array of results.
 *
 * If any effect fails, the iteration stops immediately (short-circuiting), and
 * the error is propagated.
 *
 * Concurrency:
 *
 * The `concurrency` option controls how many operations are performed
 * concurrently. By default, the operations are performed sequentially.
 *
 * Discarding Results:
 *
 * If the `discard` option is set to `true`, the intermediate results are not
 * collected, and the final result of the operation is `void`.
 *
 * **Example** (Mapping over an iterable with effects)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const result = Effect.forEach(
 *   [1, 2, 3, 4, 5],
 *   (n, index) =>
 *     Effect.sync(() => { output.push(`Currently at index ${index}`) }).pipe(Effect.as(n * 2))
 * )
 *
 * void output.push(await Effect.runPromise(result))
 * output // => ["Currently at index 0", "Currently at index 1", "Currently at index 2", "Currently at index 3", "Currently at index 4", [2, 4, 6, 8, 10]]
 * ```
 *
 * **Example** (Running effects without collecting results)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * // Apply effects but discard the results
 * const result = Effect.forEach(
 *   [1, 2, 3, 4, 5],
 *   (n, index) =>
 *     Effect.sync(() => { output.push(`Currently at index ${index}`) }).pipe(Effect.as(n * 2)),
 *   { discard: true }
 * )
 *
 * void output.push(await Effect.runPromise(result))
 * output // => ["Currently at index 0", "Currently at index 1", "Currently at index 2", "Currently at index 3", "Currently at index 4", undefined]
 * ```
 *
 * @see {@link all} for combining multiple effects into one.
 * @category collecting
 * @since 2.0.0
 */
export const forEach: {
  <A, B, E, R, S extends Iterable<A> = Iterable<A>, const Discard extends boolean = false>(
    f: (a: A, i: number) => Effect<B, E, R>,
    options?: { readonly concurrency?: Concurrency | undefined; readonly discard?: Discard | undefined } | undefined
  ): (
    self: [S] extends [never] ? Iterable<A> : S
  ) => Effect<Discard extends false ? Arr.ReadonlyArray.With<S, B> : void, E, R>
  <B, E, R, S extends Iterable<any>, const Discard extends boolean = false>(
    self: S,
    f: (a: Arr.ReadonlyArray.Infer<S>, i: number) => Effect<B, E, R>,
    options?: { readonly concurrency?: Concurrency | undefined; readonly discard?: Discard | undefined } | undefined
  ): Effect<Discard extends false ? Arr.ReadonlyArray.With<S, B> : void, E, R>
} = internal.forEach

/**
 * Returns the first element of the iterable produced by an effect, or fails
 * with `NoSuchElementError` if the iterable is empty.
 *
 * **When to use**
 *
 * Use when an effect produces a collection that must contain at least one
 * element and absence should be represented in the typed error channel.
 *
 * **Example** (Getting the first element)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option } from "effect"
 *
 * const first = await Effect.runPromise(Effect.head(Effect.succeed([1, 2, 3])))
 * first // => 1
 *
 * const empty = Effect.head(Effect.succeed([] as Array<number>)).pipe(Effect.catchNoSuchElement)
 * await Effect.runPromise(empty) // => Option.none()
 * ```
 *
 * @category collecting
 * @since 2.0.0
 */
export const head: <A, E, R>(
  self: Effect<Iterable<A>, E, R>
) => Effect<A, E | Cause.NoSuchElementError, R> = internal.head

/**
 * Executes a body effect repeatedly while a condition holds true.
 *
 * **Example** (Repeating an effectful loop)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * let counter = 0
 *
 * const program = Effect.whileLoop({
 *   while: () => counter < 5,
 *   body: () => Effect.sync(() => ++counter),
 *   step: (n) => void output.push(`Current count: ${n}`)
 * })
 *
 * await Effect.runPromise(program)
 * output // => ["Current count: 1", "Current count: 2", "Current count: 3", "Current count: 4", "Current count: 5"]
 * ```
 *
 * @category repetition
 * @since 2.0.0
 */
export const whileLoop: <A, E, R>(options: {
  readonly while: LazyArg<boolean>
  readonly body: LazyArg<Effect<A, E, R>>
  readonly step: (a: A) => void
}) => Effect<void, E, R> = internal.whileLoop

// -----------------------------------------------------------------------------
// Creating Effects
// -----------------------------------------------------------------------------

/**
 * Creates an `Effect` that represents an asynchronous computation guaranteed to
 * succeed.
 *
 * **When to use**
 *
 * Use to convert a `Promise` into an `Effect` when the async operation is
 * guaranteed to succeed and will not reject.
 *
 * **Details**
 *
 * An optional `AbortSignal` can be provided to allow for interruption of the
 * wrapped `Promise` API.
 *
 * **Gotchas**
 *
 * The `Promise` must not reject. If it rejects, the rejection is treated as a
 * defect, not as a typed failure. Use `tryPromise` when rejection is expected.
 *
 * Interruption aborts the provided `AbortSignal`, but the underlying
 * asynchronous operation only stops if it observes that signal.
 *
 * **Example** (Wrapping a non-rejecting Promise)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const succeedAsync = (message: string) =>
 *   Effect.promise<string>(() => Promise.resolve(message))
 *
 * //      ┌─── Effect<string, never, never>
 * //      ▼
 * const program = succeedAsync("Async operation completed successfully!")
 * await Effect.runPromise(program) // => "Async operation completed successfully!"
 * ```
 *
 * @see {@link tryPromise} for a version that can handle failures.
 * @category constructors
 * @since 2.0.0
 */
export const promise: <A>(
  evaluate: (signal: AbortSignal) => PromiseLike<A>
) => Effect<A> = internal.promise

/**
 * Creates an `Effect` from an asynchronous computation that may throw or
 * reject, mapping failures into the error channel.
 *
 * **When to use**
 *
 * Use when you need to perform asynchronous operations that might fail, such
 * as fetching data from an API, and want thrown exceptions or rejected promises
 * captured as Effect errors.
 *
 * **Details**
 *
 * The promise thunk is evaluated when the effect runs. If it returns a promise
 * that resolves, the resolved value becomes the success value. If the thunk
 * throws before returning a promise, or if the returned promise rejects, the
 * thrown or rejected value is mapped into the error channel.
 *
 * Passing the thunk directly maps failures to {@link Cause.UnknownError}.
 * Passing `{ try, catch }` uses `catch` to map failures to an error of type
 * `E`.
 *
 * The thunk receives an `AbortSignal` that is aborted if the effect is
 * interrupted. The underlying asynchronous operation only stops if it observes
 * that signal.
 *
 * **Gotchas**
 *
 * If `catch` throws while mapping the error, that thrown value is treated as a
 * defect. Return the error value you want in the error channel instead of
 * throwing it.
 *
 * **Example** (Wrapping a fetch request that may fail)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const getTodo = (id: number) =>
 *   Effect.tryPromise(() => Promise.resolve({ id, completed: false }))
 *
 * //      ┌─── Effect<{ id: number; completed: boolean }, UnknownError, never>
 * //      ▼
 * const program = getTodo(1)
 * await Effect.runPromise(program) // => { id: 1, completed: false }
 * ```
 *
 * **Example** (Mapping Promise rejections to a tagged error)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect } from "effect"
 *
 * class TodoFetchError extends Data.TaggedError("TodoFetchError")<{ readonly cause: unknown }> {}
 *
 * const getTodo = (id: number) =>
 *   Effect.tryPromise({
 *     try: () => Promise.reject(`Todo ${id} is unavailable`),
 *     // remap the error
 *     catch: (cause) => new TodoFetchError({ cause })
 *   })
 *
 * //      ┌─── Effect<never, TodoFetchError, never>
 * //      ▼
 * const program = Effect.flip(getTodo(1))
 * const error = await Effect.runPromise(program)
 * error._tag // => "TodoFetchError"
 * ```
 *
 * @see {@link promise} if the effectful computation is asynchronous and does not throw errors.
 * @category constructors
 * @since 2.0.0
 */
export const tryPromise: {
  <A>(options: (signal: AbortSignal) => PromiseLike<A>): Effect<A, Cause.UnknownError>
  <A, E>(
    options: { readonly try: (signal: AbortSignal) => PromiseLike<A>; readonly catch: (error: unknown) => E }
  ): Effect<A, E>
} = internal.tryPromise

/**
 * Creates an `Effect` that always succeeds with a given value.
 *
 * **When to use**
 *
 * Use when an effect should complete successfully with a specific value without any errors
 * or external dependencies.
 *
 * **Example** (Creating a successful effect)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * // Creating an effect that represents a successful scenario
 * //
 * //      ┌─── Effect<number, never, never>
 * //      ▼
 * const success = Effect.succeed(42)
 * Effect.runSync(success) // => 42
 * ```
 *
 * @see {@link fail} to create an effect that represents a failure.
 * @category constructors
 * @since 2.0.0
 */
export const succeed: <A>(value: A) => Effect<A> = internal.succeed

/**
 * Returns an effect which succeeds with `None`.
 *
 * **Example** (Succeeding with Option.none)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option } from "effect"
 *
 * const program = Effect.succeedNone
 *
 * Effect.runSync(program) // => Option.none()
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const succeedNone: Effect<Option<never>> = internal.succeedNone

/**
 * Returns an effect which succeeds with the value wrapped in a `Some`.
 *
 * **Example** (Succeeding with Option.some)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option } from "effect"
 *
 * const program = Effect.succeedSome(42)
 *
 * Effect.runSync(program) // => Option.some(42)
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const succeedSome: <A>(value: A) => Effect<Option<A>> = internal.succeedSome

/**
 * Creates an `Effect` lazily, delaying construction until it is needed.
 *
 * **When to use**
 *
 * Use when you need to defer the evaluation of an effect until it is required.
 *
 * **Details**
 *
 * `suspend` takes a thunk that represents an effect and delays creating it
 * until the suspended effect is evaluated. This is useful for optimizing
 * expensive computations, managing circular dependencies such as recursive
 * functions, and helping TypeScript unify return types when branches construct
 * different effects. Any side effects or scoped captures inside the thunk are
 * re-executed on each invocation.
 *
 * **Example** (Lazily evaluating side effects)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * let i = 0
 *
 * const bad = Effect.succeed(i++)
 *
 * const good = Effect.suspend(() => Effect.succeed(i++))
 *
 * Effect.runSync(bad) // => 0
 * Effect.runSync(bad) // => 0
 *
 * Effect.runSync(good) // => 1
 * Effect.runSync(good) // => 2
 * ```
 *
 * **Example** (Suspending recursive Fibonacci evaluation)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const blowsUp = (n: number): Effect.Effect<number> =>
 *   n < 2
 *     ? Effect.succeed(1)
 *     : Effect.zipWith(blowsUp(n - 1), blowsUp(n - 2), (a, b) => a + b)
 *
 * // console.log(Effect.runSync(blowsUp(32)))
 * // crash: JavaScript heap out of memory
 *
 * const allGood = (n: number): Effect.Effect<number> =>
 *   n < 2
 *     ? Effect.succeed(1)
 *     : Effect.zipWith(
 *         Effect.suspend(() => allGood(n - 1)),
 *         Effect.suspend(() => allGood(n - 2)),
 *         (a, b) => a + b
 *       )
 *
 * Effect.runSync(allGood(16)) // => 1597
 * ```
 *
 * **Example** (Helping TypeScript infer recursive effect types)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * //   Without suspend, TypeScript may struggle with type inference.
 * //   Inferred type:
 * //     (a: number, b: number) =>
 * //       Effect<never, Error, never> | Effect<number, never, never>
 * const withoutSuspend = (a: number, b: number) =>
 *   b === 0
 *     ? Effect.fail(new Error("Cannot divide by zero"))
 *     : Effect.succeed(a / b)
 *
 * //   Using suspend to unify return types.
 * //   Inferred type:
 * //     (a: number, b: number) => Effect<number, Error, never>
 * const withSuspend = (a: number, b: number) =>
 *   Effect.suspend(() =>
 *     b === 0
 *       ? Effect.fail(new Error("Cannot divide by zero"))
 *       : Effect.succeed(a / b)
 *   )
 *
 * Effect.runSync(withSuspend(6, 2)) // => 3
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const suspend: <A, E, R>(
  effect: LazyArg<Effect<A, E, R>>
) => Effect<A, E, R> = internal.suspend

/**
 * Creates an `Effect` that represents a synchronous side-effectful computation.
 *
 * **When to use**
 *
 * Use when you need to wrap a synchronous side-effectful operation that is not
 * expected to throw.
 *
 * **Details**
 *
 * The provided function is evaluated lazily when the effect runs.
 *
 * **Gotchas**
 *
 * The function must not throw. If it throws, the thrown value is treated as a
 * defect, not as a typed failure. Use `try` when throwing is expected.
 *
 * **Example** (Capturing synchronous logging in an Effect)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const log = (message: string) =>
 *   Effect.sync(() => {
 *     void output.push(message) // side effect
 *   })
 *
 * //      ┌─── Effect<void, never, never>
 * //      ▼
 * const program = log("Hello, World!")
 * Effect.runSync(program)
 * output // => ["Hello, World!"]
 * ```
 *
 * @see {@link try_ | try} for a version that can handle failures.
 * @category constructors
 * @since 2.0.0
 */
export const sync: <A>(thunk: LazyArg<A>) => Effect<A> = internal.sync

const void_: Effect<void> = internal.void
export {
  /**
   * Returns an effect that succeeds with `void`.
   *
   * @category constructors
   * @since 2.0.0
   */
  void_ as void
}

const undefined_: Effect<undefined> = internal.undefined
export {
  /**
   * Returns an effect that succeeds with `undefined`.
   *
   * @category constructors
   * @since 4.0.0
   */
  undefined_ as undefined
}

/**
 * Creates an `Effect` from a callback-based asynchronous API.
 *
 * **When to use**
 *
 * Use when you need to integrate APIs that complete through callbacks instead
 * of returning a `Promise`.
 *
 * **Details**
 *
 * The registration function receives a `resume` callback and, when requested,
 * an `AbortSignal`. Call `resume` at most once with the effect that should
 * complete the fiber; later calls are ignored. Return an optional cleanup
 * effect from the registration function to run if the fiber is interrupted.
 *
 * **Example** (Integrating callback APIs)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const fromCallback = (message: string) =>
 *   Effect.callback<void>((resume) => {
 *     queueMicrotask(() => {
 *       void output.push(message)
 *       resume(Effect.void)
 *     })
 *   })
 *
 * await Effect.runPromise(fromCallback("callback completed"))
 * output // => ["callback completed"]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const callback: <A, E = never, R = never>(
  register: (
    this: Scheduler,
    resume: (effect: Effect<A, E, R>) => void,
    signal: AbortSignal
  ) => void | Effect<void, never, R>
) => Effect<A, E, R> = internal.callback

/**
 * Returns an effect that will never produce anything. The moral equivalent of
 * `while(true) {}`, only without the wasted CPU cycles.
 *
 * **Example** (Creating a never-ending effect)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option } from "effect"
 *
 * const program = Effect.timeoutOption(Effect.never, 0)
 * await Effect.runPromise(program) // => Option.none()
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const never: Effect<never> = internal.never

/**
 * Effect that succeeds with an empty record `{}`, used as the starting point
 * for do notation chains.
 *
 * **Example** (Starting do notation)
 *
 * ```ts import.meta.vitest
 * import { Effect, pipe } from "effect"
 *
 * const program = pipe(
 *   Effect.Do,
 *   Effect.bind("x", () => Effect.succeed(2)),
 *   Effect.bind("y", ({ x }) => Effect.succeed(x + 1)),
 *   Effect.let("sum", ({ x, y }) => x + y)
 * )
 *
 * Effect.runSync(program) // => { x: 2, y: 3, sum: 5 }
 * ```
 *
 * @category do notation
 * @since 2.0.0
 */
export const Do: Effect<{}> = internal.Do

/**
 * Gives a name to the success value of an `Effect`, creating a single-key
 * record used in do notation pipelines.
 *
 * **When to use**
 *
 * Use to start a do-notation pipeline from an existing `Effect` when its
 * success value should become the first named field in the accumulated record.
 *
 * @see {@link Do} for starting from an empty accumulated record
 * @see {@link bind} for adding fields produced by effects
 *
 * @category do notation
 * @since 2.0.0
 */
export const bindTo: {
  <N extends string>(name: N): <A, E, R>(self: Effect<A, E, R>) => Effect<{ [K in N]: A }, E, R>
  <A, E, R, N extends string>(self: Effect<A, E, R>, name: N): Effect<{ [K in N]: A }, E, R>
} = internal.bindTo

const let_: {
  <N extends string, A extends Record<string, any>, B>(
    name: N,
    f: (a: NoInfer<A>) => B
  ): <E, R>(
    self: Effect<A, E, R>
  ) => Effect<Simplify<Omit<A, N> & Record<N, B>>, E, R>
  <A extends Record<string, any>, E, R, B, N extends string>(
    self: Effect<A, E, R>,
    name: N,
    f: (a: NoInfer<A>) => B
  ): Effect<Simplify<Omit<A, N> & Record<N, B>>, E, R>
} = internal.let

export {
  /**
   * Adds a computed plain value to the do notation record.
   *
   * **When to use**
   *
   * Use to add a derived, synchronous value to a do-notation pipeline when it
   * depends on fields already accumulated in the record and does not need to run
   * another `Effect`.
   *
   * **Details**
   *
   * The new field is added with object spreading. If the name already exists in
   * the record, the computed value replaces it in the returned type.
   *
   * @see {@link bind} for adding fields produced by effects
   * @see {@link bindTo} for naming an existing success value
   * @see {@link Do} for starting from an empty accumulated record
   * @see {@link gen} for sequencing without accumulating a record
   *
   * @category do notation
   * @since 2.0.0
   */
  let_ as let
}

/**
 * Adds an `Effect` value to the do notation record under a given name.
 *
 * **When to use**
 *
 * Use to sequence an effectful step in a do-notation pipeline when that step
 * depends on fields already accumulated in the record and its success value
 * should be stored under a name.
 *
 * **Details**
 *
 * The function receives the current record, runs the returned effect after the
 * input effect succeeds, and inserts its success value under `name`. The
 * resulting effect combines the error and service requirements of both steps.
 *
 * **Gotchas**
 *
 * Binding a name that already exists replaces that field in the resulting
 * record.
 *
 * @see {@link Do} for starting from an empty do-notation record
 * @see {@link bindTo} for naming the success value of an existing effect
 * @see {@link gen} for generator-based sequencing without accumulating a record
 *
 * @category do notation
 * @since 2.0.0
 */
export const bind: {
  <N extends string, A extends Record<string, any>, B, E2, R2>(
    name: N,
    f: (a: NoInfer<A>) => Effect<B, E2, R2>
  ): <E, R>(
    self: Effect<A, E, R>
  ) => Effect<Simplify<Omit<A, N> & Record<N, B>>, E | E2, R | R2>
  <A extends Record<string, any>, E, R, B, E2, R2, N extends string>(
    self: Effect<A, E, R>,
    name: N,
    f: (a: NoInfer<A>) => Effect<B, E2, R2>
  ): Effect<Simplify<Omit<A, N> & Record<N, B>>, E | E2, R | R2>
} = internal.bind

/**
 * Provides a way to write effectful code using generator functions, simplifying
 * control flow and error handling.
 *
 * **When to use**
 *
 * Use when you want to write effectful code that looks and behaves like
 * synchronous code, while still handling asynchronous tasks, errors, and complex
 * control flow such as loops and conditions.
 *
 * Generator functions work similarly to `async/await` but keep errors,
 * requirements, and interruption in the Effect type. You can `yield*` values
 * from effects and return the final result at the end.
 *
 * **Example** (Sequencing effects with generators)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect } from "effect"
 *
 * class DiscountRateError extends Data.TaggedError("DiscountRateError")<{}> {}
 *
 * const addServiceCharge = (amount: number) => amount + 1
 *
 * const applyDiscount = (
 *   total: number,
 *   discountRate: number
 * ): Effect.Effect<number, DiscountRateError> =>
 *   discountRate === 0
 *     ? Effect.fail(new DiscountRateError())
 *     : Effect.succeed(total - (total * discountRate) / 100)
 *
 * const fetchTransactionAmount = Effect.promise(() => Promise.resolve(100))
 *
 * const fetchDiscountRate = Effect.promise(() => Promise.resolve(5))
 *
 * export const program = Effect.gen(function*() {
 *   const transactionAmount = yield* fetchTransactionAmount
 *   const discountRate = yield* fetchDiscountRate
 *   const discountedAmount = yield* applyDiscount(
 *     transactionAmount,
 *     discountRate
 *   )
 *   const finalAmount = addServiceCharge(discountedAmount)
 *   return `Final amount to charge: ${finalAmount}`
 * })
 *
 * await Effect.runPromise(program) // => "Final amount to charge: 96"
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const gen: {
  <Eff extends Effect<any, any, any>, AEff>(
    f: () => Generator<Eff, AEff, never>
  ): Effect<
    AEff,
    [Eff] extends [never] ? never
      : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
      : never,
    [Eff] extends [never] ? never
      : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
      : never
  >
  <Self, Eff extends Effect<any, any, any>, AEff>(
    options: {
      readonly self: Self
    },
    f: (this: Self) => Generator<Eff, AEff, never>
  ): Effect<
    AEff,
    [Eff] extends [never] ? never
      : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
      : never,
    [Eff] extends [never] ? never
      : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
      : never
  >
} = internal.gen

/**
 * Type helpers for `Effect.gen` generator return signatures.
 *
 * @category constructors
 * @since 2.0.0
 */
export declare namespace gen {
  /**
   * Generator return type accepted by `Effect.gen`.
   *
   * @category constructors
   * @since 4.0.0
   */
  export type Return<A, E = never, R = never> = Generator<Effect<any, E, R>, A, any>
}

/**
 * Creates an `Effect` that represents a recoverable error.
 *
 * **When to use**
 *
 * Use to explicitly signal a recoverable error in an `Effect`.
 *
 * **Details**
 *
 * The error keeps propagating unless it is handled. You can handle tagged
 * errors with functions like {@link catchTag} or {@link catchTags}.
 *
 * **Example** (Creating a failed effect)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect } from "effect"
 *
 * class OperationFailedError extends Data.TaggedError("OperationFailedError")<{}> {}
 *
 * //      ┌─── Effect<never, OperationFailedError, never>
 * //      ▼
 * const failure = Effect.fail(
 *   new OperationFailedError()
 * )
 * Effect.runSync(Effect.flip(failure))._tag // => "OperationFailedError"
 * ```
 *
 * @see {@link succeed} to create an effect that represents a successful value.
 * @category constructors
 * @since 2.0.0
 */
export const fail: <E>(error: E) => Effect<never, E> = internal.fail

/**
 * Creates an `Effect` that represents a recoverable error using a lazy evaluation.
 *
 * **When to use**
 *
 * Use to defer computing a recoverable error value until the effect is run.
 *
 * **Details**
 *
 * The error-producing function is evaluated each time the effect is executed.
 *
 * **Example** (Lazily creating failures)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect } from "effect"
 *
 * class ProgramError extends Data.TaggedError("ProgramError")<{ readonly operation: string }> {}
 *
 * const program = Effect.failSync(() => new ProgramError({ operation: "sync" }))
 *
 * Effect.runSync(Effect.flip(program)).operation // => "sync"
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const failSync: <E>(evaluate: LazyArg<E>) => Effect<never, E> = internal.failSync

/**
 * Creates an `Effect` that represents a failure with a specific `Cause`.
 *
 * **When to use**
 *
 * Use when you already have a full `Cause` and need to preserve defects,
 * interruptions, annotations, or combined failures in the effect's failure
 * channel.
 *
 * **Details**
 *
 * This function allows you to create effects that fail with complex error
 * structures, including multiple errors, defects, interruptions, and more.
 *
 * **Example** (Failing with a full Cause)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect } from "effect"
 *
 * const program = Effect.failCause(
 *   Cause.fail("Network error")
 * )
 *
 * Effect.runSync(Effect.flip(program)) // => "Network error"
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const failCause: <E>(cause: Cause.Cause<E>) => Effect<never, E> = internal.failCause

/**
 * Creates an `Effect` that represents a failure with a `Cause` computed lazily.
 *
 * **When to use**
 *
 * Use to defer computing a full `Cause` until the effect is run.
 *
 * **Details**
 *
 * The cause-producing function is evaluated each time the effect is executed.
 *
 * **Example** (Lazily creating a Cause)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect } from "effect"
 *
 * const program = Effect.failCauseSync(() =>
 *   Cause.fail("Error computed at runtime")
 * )
 *
 * Effect.runSync(Effect.flip(program)) // => "Error computed at runtime"
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const failCauseSync: <E>(
  evaluate: LazyArg<Cause.Cause<E>>
) => Effect<never, E> = internal.failCauseSync

/**
 * Creates an effect that terminates a fiber with a specified error.
 *
 * **When to use**
 *
 * Use when you need an `Effect` to report an unrecoverable defect instead of a
 * typed error.
 *
 * **Details**
 *
 * The `die` function is used to signal a defect, which represents a critical
 * and unexpected error in the code. When invoked, it produces an effect that
 * does not handle the error and instead terminates the fiber.
 *
 * The error channel of the resulting effect is of type `never`, indicating that
 * it cannot recover from this failure.
 *
 * **Example** (Failing on division by zero)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit } from "effect"
 *
 * const defect = new Error("Cannot divide by zero")
 * const divide = (a: number, b: number) =>
 *   b === 0
 *     ? Effect.die(defect)
 *     : Effect.succeed(a / b)
 *
 * //      ┌─── Effect<number, never, never>
 * //      ▼
 * const program = divide(1, 0)
 *
 * Effect.runSyncExit(program) // => Exit.die(defect)
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const die: (defect: unknown) => Effect<never> = internal.die

const try_: {
  <A>(options: LazyArg<A>): Effect<A, Cause.UnknownError>
  <A, E>(options: {
    readonly try: LazyArg<A>
    readonly catch: (error: unknown) => E
  }): Effect<A, E>
} = internal.try

export {
  /**
   * Creates an `Effect` from a synchronous computation that may throw, mapping
   * thrown values into the error channel.
   *
   * **When to use**
   *
   * Use when you need to perform synchronous operations that might throw, such
   * as parsing JSON, and want thrown exceptions captured as Effect errors.
   *
   * **Details**
   *
   * The thunk is evaluated when the effect runs. If it returns normally, the
   * returned value becomes the success value. If it throws, the thrown value is
   * mapped into the error channel.
   *
   * Passing the thunk directly maps failures to {@link Cause.UnknownError}.
   * Passing `{ try, catch }` uses `catch` to map failures to an error of type
   * `E`.
   *
   * **Gotchas**
   *
   * If `catch` throws while mapping the error, that thrown value is treated as
   * a defect. Return the error value you want in the error channel instead of
   * throwing it.
   *
   * **Example** (Parsing JSON)
   *
   * ```ts import.meta.vitest
   * import { Effect } from "effect"
   *
   * const parseJSON = (input: string) =>
   *   Effect.try(() => JSON.parse(input))
   *
   * // Success case
   * await Effect.runPromise(parseJSON("{\"name\": \"Alice\"}")) // => { name: 'Alice' }
   *
   * // Failure case maps the thrown value to UnknownError
   * const exit = await Effect.runPromiseExit(parseJSON("invalid json"))
   * exit._tag // => "Failure"
   * ```
   *
   * **Example** (Mapping exceptions to a tagged error)
   *
   * ```ts import.meta.vitest
   * import { Data, Effect } from "effect"
   *
   * class JsonParsingError extends Data.TaggedError("JsonParsingError")<{ readonly cause: unknown }> {}
   *
   * const parseJSON = (input: string) =>
   *   Effect.try({
   *     try: () => JSON.parse(input),
   *     catch: (cause) => new JsonParsingError({ cause })
   *   })
   *
   * const error = await Effect.runPromise(Effect.flip(parseJSON("invalid json")))
   * error._tag // => "JsonParsingError"
   * ```
   *
   * @see {@link sync} if the effectful computation is synchronous and does not
   * throw errors.
   * @category constructors
   * @since 2.0.0
   */
  try_ as try
}

/**
 * Yields control back to the Effect runtime, allowing other fibers to execute.
 *
 * **Example** (Yielding to other fibers)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.gen(function*() {
 *   void output.push("Before yield")
 *   yield* Effect.yieldNow
 *   void output.push("After yield")
 * })
 *
 * await Effect.runPromise(program)
 * output // => ["Before yield", "After yield"]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const yieldNow: Effect<void> = internal.yieldNow

/**
 * Yields control back to the Effect runtime with a specified priority, allowing other fibers to execute.
 *
 * **Example** (Yielding with priority)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.gen(function*() {
 *   void output.push("High priority task")
 *   yield* Effect.yieldNowWith(10) // Higher priority
 *   void output.push("Continued after yield")
 * })
 *
 * await Effect.runPromise(program)
 * output // => ["High priority task", "Continued after yield"]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const yieldNowWith: (priority?: number) => Effect<void> = internal.yieldNowWith

/**
 * Provides access to the current fiber within an effect computation.
 *
 * **Example** (Reading the current fiber)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const program = Effect.withFiber((fiber) => Effect.succeed(typeof fiber.id))
 *
 * Effect.runSync(program) // => "number"
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const withFiber: <A, E = never, R = never>(
  evaluate: (fiber: Fiber<unknown, unknown>) => Effect<A, E, R>
) => Effect<A, E, R> = core.withFiber

/**
 * Accesses the current fiber to compute a successful value.
 *
 * **Example** (Computing a value from the current fiber)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const program = Effect.withFiberSucceed((fiber) => typeof fiber.id)
 *
 * Effect.runSync(program) // => "number"
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const withFiberSucceed: <A, R = never>(
  evaluate: (fiber: Fiber<unknown, unknown>) => A
) => Effect<A, never, R> = core.withFiberSucceed

// -----------------------------------------------------------------------------
// Conversions
// -----------------------------------------------------------------------------

/**
 * Converts a `Result` to an `Effect`.
 *
 * **Example** (Converting a Result into an Effect)
 *
 * ```ts import.meta.vitest
 * import { Effect, Result } from "effect"
 * const output: Array<unknown> = []
 *
 * const success = Result.succeed(42)
 * const failure = Result.fail("Something went wrong")
 *
 * const effect1 = Effect.fromResult(success)
 * const effect2 = Effect.fromResult(failure)
 *
 * void output.push(Effect.runSync(effect1))
 * void output.push(Effect.runSync(Effect.flip(effect2)))
 * output // => [42, "Something went wrong"]
 * ```
 *
 * @category converting
 * @since 4.0.0
 */
export const fromResult: <A, E>(result: Result.Result<A, E>) => Effect<A, E> = internal.fromResult

/**
 * Converts an `Option` into an `Effect`.
 *
 * **When to use**
 *
 * Use when absence should become a typed `NoSuchElementError` in the effect error
 * channel.
 *
 * **Details**
 *
 * `Option.some` becomes a successful effect with the contained value, while
 * `Option.none` becomes a failed effect. By default the failure is a
 * `NoSuchElementError`, but you can provide an `onNone` callback to customize
 * the error value.
 *
 * **Example** (Converting an Option into an Effect)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option } from "effect"
 * const output: Array<unknown> = []
 *
 * const some = Option.some(42)
 * const none = Option.none()
 *
 * const effect1 = Effect.fromOption(some)
 * const effect2 = Effect.fromOption(none)
 * const effect3 = Effect.fromOption(none, () => new Error("missing"))
 *
 * void output.push(Effect.runSync(effect1))
 * void output.push(Effect.runSync(Effect.flip(effect2))._tag)
 * void output.push(Effect.runSync(Effect.flip(effect3)).message)
 * output // => [42, "NoSuchElementError", "missing"]
 * ```
 *
 * @category converting
 * @since 4.0.0
 */
export const fromOption: <
  Arg extends Option<unknown> | LazyArg<unknown>,
  Rest extends [] | [onNone: LazyArg<unknown> | undefined] = []
>(
  arg: Arg & (Rest extends [] ? unknown : Option<unknown>),
  ...rest: Rest
) => [Arg] extends [Option<infer A>] ? Effect<
    A,
    Rest extends [LazyArg<infer E>] ? E
      : Rest extends [undefined] ? Cause.NoSuchElementError
      : Rest extends [LazyArg<infer E> | undefined] ? E | Cause.NoSuchElementError
      : Cause.NoSuchElementError
  >
  : [Arg] extends [LazyArg<infer E>] ? <A>(option: Option<A>) => Effect<A, E>
  : never = internal.fromOption

/**
 * Converts an `Option` of an `Effect` into an `Effect` of an `Option`.
 *
 * **When to use**
 *
 * Use when an effect should run only when an optional value is present, while
 * preserving absence as a successful `None`.
 *
 * **Details**
 *
 * - `None` becomes an effect that succeeds with `None`
 * - `Some(effect)` runs the inner effect and wraps its success value in `Some`
 * - Inner failures are preserved in the resulting effect
 *
 * **Example** (Transposing an Option of an Effect)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option } from "effect"
 *
 * const some = Option.some(Effect.succeed(42))
 *
 * //      ┌─── Effect<Option<number>, never, never>
 * //      ▼
 * const program = Effect.transposeOption(some)
 *
 * Effect.runSync(program) // => Option.some(42)
 * ```
 *
 * @category converting
 * @since 3.13.0
 */
export const transposeOption: <A = never, E = never, R = never>(
  self: Option<Effect<A, E, R>>
) => Effect<Option<A>, E, R> = internal.transposeOption

/**
 * Converts a nullable value to an `Effect`, failing with a `NoSuchElementError`
 * when the value is `null` or `undefined`.
 *
 * **Example** (Failing on nullish values)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.fn(function*(input: string | null) {
 *   const value = yield* Effect.fromNullishOr(input)
 *   yield* Effect.sync(() => { output.push(value) })
 * },
 *   Effect.catch(() => Effect.sync(() => { output.push("missing") }))
 * )
 *
 * await Effect.runPromise(program(null))
 * await Effect.runPromise(program("hello"))
 * output // => ["missing", "hello"]
 * ```
 *
 * @category converting
 * @since 4.0.0
 */
export const fromNullishOr: <A>(value: A) => Effect<NonNullable<A>, Cause.NoSuchElementError> = internal.fromNullishOr

// -----------------------------------------------------------------------------
// Mapping
// -----------------------------------------------------------------------------

/**
 * Chains effects to produce new `Effect` instances, useful for combining
 * operations that depend on previous results.
 *
 * **When to use**
 *
 * Use when you need to chain multiple effects, ensuring that each
 * step produces a new `Effect` while flattening any nested effects that may
 * occur.
 *
 * **Details**
 *
 * `flatMap` lets you sequence effects so that the result of one effect can be
 * used in the next step. It is similar to `flatMap` used with arrays but works
 * specifically with `Effect` instances, allowing you to avoid deeply nested
 * effect structures.
 *
 * Since effects are immutable, `flatMap` always returns a new effect instead of
 * changing the original one.
 *
 * **Example** (Choosing flatMap syntax variants)
 *
 * ```ts import.meta.vitest
 * import { Effect, pipe } from "effect"
 * const output: Array<unknown> = []
 *
 * const myEffect = Effect.succeed(1)
 * const transformation = (n: number) => Effect.succeed(n + 1)
 *
 * const flatMappedWithPipe = pipe(myEffect, Effect.flatMap(transformation))
 * const flatMappedWithDataFirst = Effect.flatMap(myEffect, transformation)
 * const flatMappedWithMethod = myEffect.pipe(Effect.flatMap(transformation))
 *
 * void output.push(Effect.runSync(Effect.all([
 *   flatMappedWithPipe,
 *   flatMappedWithDataFirst,
 *   flatMappedWithMethod
 * ])))
 * output // => [[2, 2, 2]]
 * ```
 *
 * **Example** (Sequencing dependent effects)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect, pipe } from "effect"
 *
 * class DiscountRateError extends Data.TaggedError("DiscountRateError")<{}> {}
 *
 * // Function to apply a discount safely to a transaction amount
 * const applyDiscount = (
 *   total: number,
 *   discountRate: number
 * ): Effect.Effect<number, DiscountRateError> =>
 *   discountRate === 0
 *     ? Effect.fail(new DiscountRateError())
 *     : Effect.succeed(total - (total * discountRate) / 100)
 *
 * // Simulated asynchronous task to fetch a transaction amount from database
 * const fetchTransactionAmount = Effect.promise(() => Promise.resolve(100))
 *
 * // Chaining the fetch and discount application using `flatMap`
 * const finalAmount = pipe(
 *   fetchTransactionAmount,
 *   Effect.flatMap((amount) => applyDiscount(amount, 5))
 * )
 *
 * await Effect.runPromise(finalAmount) // => 95
 * ```
 *
 * @see {@link tap} for a version that ignores the result of the effect.
 * @category sequencing
 * @since 2.0.0
 */
export const flatMap: {
  <A, B, E1, R1>(
    f: (a: A) => Effect<B, E1, R1>
  ): <E, R>(self: Effect<A, E, R>) => Effect<B, E1 | E, R1 | R>
  <A, E, R, B, E1, R1>(
    self: Effect<A, E, R>,
    f: (a: A) => Effect<B, E1, R1>
  ): Effect<B, E | E1, R | R1>
} = internal.flatMap

/**
 * Flattens an `Effect` that produces another `Effect` into a single effect.
 *
 * **Example** (Flattening nested effects)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const nested = Effect.succeed(Effect.succeed("hello"))
 *
 * const program = Effect.gen(function*() {
 *   const value = yield* Effect.flatten(nested)
 *   yield* Effect.sync(() => { output.push(value) })
 * })
 *
 * Effect.runSync(program)
 * output // => ["hello"]
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const flatten: <A, E, R, E2, R2>(self: Effect<Effect<A, E, R>, E2, R2>) => Effect<A, E | E2, R | R2> =
  internal.flatten

/**
 * Runs this effect and then runs another effect, optionally using the first
 * effect's success value to choose the next effect.
 *
 * **When to use**
 *
 * Use when you need one effect to run after another and the second effect may
 * depend on the first effect's success value.
 *
 * **Details**
 *
 * When the second argument is an `Effect`, the first success value is discarded
 * and the returned effect produces the second effect's value. When the second
 * argument is a function, it receives the first success value and must return
 * the next `Effect`.
 *
 * Failures or requirements from either effect are preserved in the returned
 * effect.
 *
 * **Example** (Choosing andThen syntax variants)
 *
 * ```ts import.meta.vitest
 * import { Effect, pipe } from "effect"
 * const output: Array<unknown> = []
 *
 * const myEffect = Effect.succeed(1)
 * const anotherEffect = Effect.succeed("done")
 *
 * const transformedWithPipe = pipe(myEffect, Effect.andThen(anotherEffect))
 * const transformedWithDataFirst = Effect.andThen(myEffect, anotherEffect)
 * const transformedWithMethod = myEffect.pipe(Effect.andThen(anotherEffect))
 *
 * void output.push(Effect.runSync(Effect.all([
 *   transformedWithPipe,
 *   transformedWithDataFirst,
 *   transformedWithMethod
 * ])))
 * output // => [['done', 'done', 'done']]
 * ```
 *
 * **Example** (Sequencing a discount calculation after fetching a total)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect, pipe } from "effect"
 *
 * class DiscountRateError extends Data.TaggedError("DiscountRateError")<{}> {}
 *
 * // Function to apply a discount safely to a transaction amount
 * const applyDiscount = (
 *   total: number,
 *   discountRate: number
 * ): Effect.Effect<number, DiscountRateError> =>
 *   discountRate === 0
 *     ? Effect.fail(new DiscountRateError())
 *     : Effect.succeed(total - (total * discountRate) / 100)
 *
 * // Simulated asynchronous task to fetch a transaction amount from database
 * const fetchTransactionAmount = Effect.promise(() => Promise.resolve(100))
 *
 * // Using Effect.map and Effect.flatMap
 * const result1 = pipe(
 *   fetchTransactionAmount,
 *   Effect.map((amount) => amount * 2),
 *   Effect.flatMap((amount) => applyDiscount(amount, 5))
 * )
 *
 * await Effect.runPromise(result1) // => 190
 *
 * // Using Effect.andThen
 * const result2 = pipe(
 *   fetchTransactionAmount,
 *   Effect.andThen((amount) => Effect.succeed(amount * 2)),
 *   Effect.andThen((amount) => applyDiscount(amount, 5))
 * )
 *
 * await Effect.runPromise(result2) // => 190
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const andThen: {
  <A, B, E2, R2>(
    f: (a: A) => Effect<B, E2, R2>
  ): <E, R>(self: Effect<A, E, R>) => Effect<B, E | E2, R | R2>
  <B, E2, R2>(
    f: Effect<B, E2, R2>
  ): <A, E, R>(self: Effect<A, E, R>) => Effect<B, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Effect<A, E, R>,
    f: (a: A) => Effect<B, E2, R2>
  ): Effect<B, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Effect<A, E, R>,
    f: Effect<B, E2, R2>
  ): Effect<B, E | E2, R | R2>
} = internal.andThen

/**
 * Runs a side effect with the result of an effect without changing the original
 * value.
 *
 * **When to use**
 *
 * Use when you need to run an effectful observation, such as logging or
 * tracking, while passing the original success value to the next step.
 *
 * **Details**
 *
 * `tap` works similarly to `flatMap`, but it ignores the result of the function
 * passed to it. The value from the previous effect remains available for the
 * next part of the chain. Note that if the side effect fails, the entire chain
 * will fail too.
 *
 * **Example** (Logging a step in a pipeline)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect, pipe } from "effect"
 * const output: Array<unknown> = []
 *
 * class DiscountRateError extends Data.TaggedError("DiscountRateError")<{}> {}
 *
 * // Function to apply a discount safely to a transaction amount
 * const applyDiscount = (
 *   total: number,
 *   discountRate: number
 * ): Effect.Effect<number, DiscountRateError> =>
 *   discountRate === 0
 *     ? Effect.fail(new DiscountRateError())
 *     : Effect.succeed(total - (total * discountRate) / 100)
 *
 * // Simulated asynchronous task to fetch a transaction amount from database
 * const fetchTransactionAmount = Effect.promise(() => Promise.resolve(100))
 *
 * const finalAmount = pipe(
 *   fetchTransactionAmount,
 *   // Log the fetched transaction amount
 *   Effect.tap((amount) => Effect.sync(() => { output.push(`Apply a discount to: ${amount}`) })),
 *   // `amount` is still available!
 *   Effect.flatMap((amount) => applyDiscount(amount, 5))
 * )
 *
 * void output.push(await Effect.runPromise(finalAmount))
 * output // => ["Apply a discount to: 100", 95]
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const tap: {
  <A, B, E2, R2>(
    f: (a: NoInfer<A>) => Effect<B, E2, R2>
  ): <E, R>(self: Effect<A, E, R>) => Effect<A, E | E2, R | R2>
  <B, E2, R2>(
    f: Effect<B, E2, R2>
  ): <A, E, R>(self: Effect<A, E, R>) => Effect<A, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Effect<A, E, R>,
    f: (a: NoInfer<A>) => Effect<B, E2, R2>
  ): Effect<A, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Effect<A, E, R>,
    f: Effect<B, E2, R2>
  ): Effect<A, E | E2, R | R2>
} = internal.tap

/**
 * Converts both success and failure of an `Effect` into a `Result` type.
 *
 * **When to use**
 *
 * Use when you want an `Effect`'s typed failures to be handled as `Result`
 * data while preserving the original error value.
 *
 * **Details**
 *
 * This function converts an effect that may fail into an effect that always
 * succeeds, wrapping the outcome in a `Result` type. The result will be
 * `Result.Failure` if the effect fails, containing the recoverable error, or
 * `Result.Success` if it succeeds, containing the result.
 *
 * Using this function, you can handle recoverable errors explicitly without
 * causing the effect to fail. This is particularly useful in scenarios where
 * you want to chain effects and manage both success and failure in the same
 * logical flow.
 *
 * The resulting effect cannot fail directly because all recoverable failures
 * are represented inside the `Result` type.
 *
 * **Gotchas**
 *
 * `result` only captures typed, recoverable failures. Defects and
 * interruptions are not captured inside the `Result` and still fail the
 * effect.
 *
 * **Example** (Capturing success or failure as Result)
 *
 * ```ts import.meta.vitest
 * import { Effect, Result } from "effect"
 *
 * const success = Effect.succeed(42)
 * const failure = Effect.fail("Something went wrong")
 *
 * const program1 = Effect.result(success)
 * const program2 = Effect.result(failure)
 *
 * Effect.runSync(program1) // => Result.succeed(42)
 *
 * Effect.runSync(program2) // => Result.fail("Something went wrong")
 * ```
 *
 * @see {@link option} for a version that uses `Option` instead.
 * @see {@link exit} for a version that encapsulates both recoverable errors and defects in an `Exit`.
 *
 * @category error handling
 * @since 4.0.0
 */
export const result: <A, E, R>(self: Effect<A, E, R>) => Effect<Result.Result<A, E>, never, R> = internal.result

/**
 * Converts success to `Option.some` and failure to `Option.none`.
 *
 * **When to use**
 *
 * Use when you only care whether an effect succeeds and want recoverable
 * failures represented as `Option.none`.
 *
 * **Details**
 *
 * Success values become `Option.some`, recoverable failures become
 * `Option.none`, and defects still fail the effect.
 *
 * **Gotchas**
 *
 * `option` only captures typed, recoverable failures as `Option.none`.
 * Defects and interruptions are not captured inside the `Option` and still
 * fail the effect.
 *
 * `option` also discards typed failure values. Use `result` if the failure
 * value matters.
 *
 * **Example** (Capturing success or failure as Option)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option } from "effect"
 *
 * const program = Effect.all([
 *   Effect.option(Effect.succeed(1)),
 *   Effect.option(Effect.fail("missing"))
 * ])
 *
 * Effect.runSync(program) // => [Option.some(1), Option.none()]
 * ```
 *
 * @see {@link result} for a version that uses `Result` instead.
 * @see {@link exit} for a version that encapsulates both recoverable errors and defects in an `Exit`.
 *
 * @category error handling
 * @since 2.0.0
 */
export const option: <A, E, R>(self: Effect<A, E, R>) => Effect<Option<A>, never, R> = internal.option

/**
 * Transforms an effect to encapsulate both failure and success using the `Exit`
 * data type.
 *
 * **When to use**
 *
 * Use when you need to inspect the full outcome, including typed failures, defects,
 * and interruptions.
 *
 * **Details**
 *
 * `exit` wraps an effect's success or failure inside an `Exit` type, allowing
 * you to handle both cases explicitly.
 *
 * The resulting effect cannot fail because the failure is encapsulated within
 * the `Exit.Failure` type. The error type is set to `never`, indicating that
 * the effect is structured to never fail directly.
 *
 * **Example** (Capturing completion as Exit)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit } from "effect"
 *
 * const success = Effect.succeed(42)
 * const failure = Effect.fail("Something went wrong")
 *
 * const program1 = Effect.exit(success)
 * const program2 = Effect.exit(failure)
 *
 * Effect.runSync(program1) // => Exit.succeed(42)
 *
 * Effect.runSync(program2) // => Exit.fail("Something went wrong")
 * ```
 *
 * @see {@link option} for a version that uses `Option` instead.
 * @see {@link result} for a version that uses `Result` instead.
 *
 * @category error handling
 * @since 2.0.0
 */
export const exit: <A, E, R>(
  self: Effect<A, E, R>
) => Effect<Exit.Exit<A, E>, never, R> = internal.exit

/**
 * Transforms the value inside an effect by applying a function to it.
 *
 * **When to use**
 *
 * Use to transform an effect's success value with a function that returns a
 * plain value, producing a new effect without changing the original effect's
 * typed error or context requirements.
 *
 * **Details**
 *
 * `map` takes a function and applies it to the value contained within an
 * effect, creating a new effect with the transformed value.
 *
 * It's important to note that effects are immutable, meaning that the original
 * effect is not modified. Instead, a new effect is returned with the updated
 * value.
 *
 * **Example** (Choosing map syntax variants)
 *
 * ```ts import.meta.vitest
 * import { Effect, pipe } from "effect"
 * const output: Array<unknown> = []
 *
 * const myEffect = Effect.succeed(1)
 * const transformation = (n: number) => n + 1
 *
 * const mappedWithPipe = pipe(myEffect, Effect.map(transformation))
 * const mappedWithDataFirst = Effect.map(myEffect, transformation)
 * const mappedWithMethod = myEffect.pipe(Effect.map(transformation))
 *
 * void output.push(Effect.runSync(Effect.all([
 *   mappedWithPipe,
 *   mappedWithDataFirst,
 *   mappedWithMethod
 * ])))
 * output // => [[2, 2, 2]]
 * ```
 *
 * **Example** (Adding a service charge)
 *
 * ```ts import.meta.vitest
 * import { Effect, pipe } from "effect"
 *
 * const addServiceCharge = (amount: number) => amount + 1
 *
 * const fetchTransactionAmount = Effect.promise(() => Promise.resolve(100))
 *
 * const finalAmount = pipe(
 *   fetchTransactionAmount,
 *   Effect.map(addServiceCharge)
 * )
 *
 * await Effect.runPromise(finalAmount) // => 101
 * ```
 *
 * @see {@link mapError} for a version that operates on the error channel.
 * @see {@link mapBoth} for a version that operates on both channels.
 * @see {@link flatMap} or {@link andThen} for a version that can return a new effect.
 * @category mapping
 * @since 2.0.0
 */
export const map: {
  <A, B>(f: (a: A) => B): <E, R>(self: Effect<A, E, R>) => Effect<B, E, R>
  <A, E, R, B>(self: Effect<A, E, R>, f: (a: A) => B): Effect<B, E, R>
} = internal.map

/**
 * Replaces the value inside an effect with a constant value.
 *
 * **When to use**
 *
 * Use to replace a successful value with a constant while preserving failures
 * and requirements.
 *
 * **Details**
 *
 * `as` allows you to ignore the original value inside an effect and
 * replace it with a new constant value.
 *
 * **Example** (Replacing a success value)
 *
 * ```ts import.meta.vitest
 * import { Effect, pipe } from "effect"
 *
 * // Replaces the value 5 with the constant "new value"
 * const program = pipe(Effect.succeed(5), Effect.as("new value"))
 *
 * Effect.runSync(program) // => "new value"
 * ```
 *
 * @see {@link map} for deriving the replacement value from the success value
 * @see {@link asVoid} for replacing the success value with `void`
 *
 * @category mapping
 * @since 2.0.0
 */
export const as: {
  <B>(value: B): <A, E, R>(self: Effect<A, E, R>) => Effect<B, E, R>
  <A, E, R, B>(self: Effect<A, E, R>, value: B): Effect<B, E, R>
} = internal.as

/**
 * Maps the success value of an `Effect` to `Some`, preserving failures.
 *
 * **Example** (Wrapping success in Option.some)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option } from "effect"
 *
 * const program = Effect.asSome(Effect.succeed(42))
 *
 * Effect.runSync(program) // => Option.some(42)
 * ```
 *
 * @category mapping
 * @since 2.0.0
 */
export const asSome: <A, E, R>(self: Effect<A, E, R>) => Effect<Option<A>, E, R> = internal.asSome

/**
 * Maps the success value of an `Effect` to `void`, preserving failures.
 *
 * **Example** (Discarding success values)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const program = Effect.asVoid(Effect.succeed(42))
 *
 * Effect.runSync(program) // => undefined
 * ```
 *
 * @category mapping
 * @since 2.0.0
 */
export const asVoid: <A, E, R>(self: Effect<A, E, R>) => Effect<void, E, R> = internal.asVoid

/**
 * Swaps an effect's success and failure channels.
 *
 * **When to use**
 *
 * Use to swap an `Effect`'s success and failure channels.
 *
 * **Details**
 *
 * For an `Effect<A, E, R>`, the returned effect has type `Effect<E, A, R>`.
 *
 * **Example** (Swapping success and failure channels)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * //      ┌─── Effect<number, string, never>
 * //      ▼
 * const program = Effect.fail("Oh uh!").pipe(Effect.as(2))
 *
 * //      ┌─── Effect<string, number, never>
 * //      ▼
 * const flipped = Effect.flip(program)
 * Effect.runSync(flipped) // => "Oh uh!"
 * ```
 *
 * @category mapping
 * @since 2.0.0
 */
export const flip: <A, E, R>(self: Effect<A, E, R>) => Effect<E, A, R> = internal.flip

// -----------------------------------------------------------------------------
// Zipping
// -----------------------------------------------------------------------------

/**
 * Combines two effects into a single effect, producing a tuple with the results of both effects.
 *
 * **When to use**
 *
 * Use to combine exactly two effects into a tuple.
 *
 * **Details**
 *
 * The `zip` function executes the first effect (left) and then the second effect (right).
 * Once both effects succeed, their results are combined into a tuple.
 *
 * Concurrency:
 *
 * By default, `zip` processes the effects sequentially. To execute the effects concurrently,
 * use the `{ concurrent: true }` option.
 *
 * **Example** (Combining two effects sequentially)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const task1 = Effect.succeed(1)
 * const task2 = Effect.succeed("hello")
 *
 * // Combine the two effects together
 * //
 * //      ┌─── Effect<[number, string], never, never>
 * //      ▼
 * const program = Effect.zip(task1, task2)
 *
 * Effect.runSync(program) // => [1, 'hello']
 * ```
 *
 * **Example** (Combining two effects concurrently)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const task1 = Effect.succeed(1)
 * const task2 = Effect.succeed("hello")
 *
 * // Run both effects concurrently using the concurrent option
 * const program = Effect.zip(task1, task2, { concurrent: true })
 *
 * await Effect.runPromise(program) // => [1, 'hello']
 * ```
 *
 * @see {@link zipWith} for a version that combines the results with a custom function.
 * @see {@link all} for collecting a larger structure of effects.
 *
 * @category zipping
 * @since 2.0.0
 */
export const zip: {
  <A2, E2, R2>(
    that: Effect<A2, E2, R2>,
    options?: { readonly concurrent?: boolean | undefined } | undefined
  ): <A, E, R>(self: Effect<A, E, R>) => Effect<[A, A2], E2 | E, R2 | R>
  <A, E, R, A2, E2, R2>(
    self: Effect<A, E, R>,
    that: Effect<A2, E2, R2>,
    options?: { readonly concurrent?: boolean | undefined }
  ): Effect<[A, A2], E | E2, R | R2>
} = internal.zip

/**
 * Combines two effects sequentially and applies a function to their results to
 * produce a single value.
 *
 * **When to use**
 *
 * Use when you need to run two effects sequentially and combine their results
 * with a function instead of keeping the results as a tuple.
 *
 * **Details**
 *
 * Concurrency:
 *
 * By default, the effects are run sequentially. To execute them concurrently,
 * use the `{ concurrent: true }` option.
 *
 * **Example** (Combining two success values with a function)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const task1 = Effect.succeed(1)
 * const task2 = Effect.succeed("hello")
 *
 * const task3 = Effect.zipWith(
 *   task1,
 *   task2,
 *   // Combines results into a single value
 *   (number, string) => number + string.length
 * )
 *
 * Effect.runSync(task3) // => 6
 * ```
 *
 * @category zipping
 * @since 2.0.0
 */
export const zipWith: {
  <A2, E2, R2, A, B>(
    that: Effect<A2, E2, R2>,
    f: (a: A, b: A2) => B,
    options?: { readonly concurrent?: boolean | undefined }
  ): <E, R>(self: Effect<A, E, R>) => Effect<B, E2 | E, R2 | R>
  <A, E, R, A2, E2, R2, B>(
    self: Effect<A, E, R>,
    that: Effect<A2, E2, R2>,
    f: (a: A, b: A2) => B,
    options?: { readonly concurrent?: boolean | undefined }
  ): Effect<B, E2 | E, R2 | R>
} = internal.zipWith

// -----------------------------------------------------------------------------
// Error handling
// -----------------------------------------------------------------------------

const catch_: {
  <E, A2, E2, R2>(
    f: (e: E) => Effect<A2, E2, R2>
  ): <A, R>(self: Effect<A, E, R>) => Effect<A2 | A, E2, R2 | R>
  <A, E, R, A2, E2, R2>(
    self: Effect<A, E, R>,
    f: (e: E) => Effect<A2, E2, R2>
  ): Effect<A2 | A, E2, R2 | R>
} = internal.catch_

export {
  /**
   * Handles all errors in an effect by providing a fallback effect.
   *
   * **When to use**
   *
   * Use when every recoverable error from an effect should be handled by the same
   * fallback function while unrecoverable defects remain defects.
   *
   * **Details**
   *
   * The `catch` function catches any errors that may occur during the
   * execution of an effect and allows you to handle them by specifying a fallback
   * effect. This ensures that the program continues without failing by recovering
   * from errors using the provided fallback logic.
   *
   * **Gotchas**
   *
   * `catch` only handles recoverable errors. It will not recover from
   * unrecoverable defects.
   *
   * @see {@link catchCause} for a version that can recover from both recoverable and unrecoverable errors.
   *
   * @category error handling
   * @since 4.0.0
   */
  catch_ as catch
}

/**
 * Catches and handles specific errors by their `_tag` field, which is used as a
 * discriminator.
 *
 * **When to use**
 *
 * Use when you need to recover from one specific tagged error in an effect
 * error channel.
 *
 * **Details**
 *
 * The error type must have a readonly `_tag` field. `catchTag` matches that
 * field and only handles errors with the requested tag.
 *
 * **Example** (Handling a tagged error)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * class NetworkError {
 *   readonly _tag = "NetworkError"
 *   constructor(readonly message: string) {}
 * }
 *
 * class ValidationError {
 *   readonly _tag = "ValidationError"
 *   constructor(readonly message: string) {}
 * }
 *
 * const task: Effect.Effect<string, NetworkError | ValidationError> =
 *   Effect.fail(new NetworkError("offline"))
 *
 * const program = Effect.catchTag(
 *   task,
 *   "NetworkError",
 *   (error) => Effect.succeed(`Recovered from network error: ${error.message}`)
 * )
 *
 * Effect.runSync(program) // => "Recovered from network error: offline"
 * ```
 *
 * @see {@link catchTags} for handling multiple tagged errors in one call
 * @see {@link catchIf} for recovering from errors that match a predicate
 *
 * @category error handling
 * @since 2.0.0
 */
export const catchTag: {
  <
    const K extends Tags<E> | Arr.NonEmptyReadonlyArray<Tags<E>>,
    E,
    A1,
    E1,
    R1,
    A2 = unassigned,
    E2 = never,
    R2 = never
  >(
    k: K,
    f: (e: ExtractTag<NoInfer<E>, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>) => Effect<A1, E1, R1>,
    orElse?:
      | ((e: ExcludeTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>) => Effect<A2, E2, R2>)
      | undefined
  ): <A, R>(
    self: Effect<A, E, R>
  ) => Effect<
    A | A1 | Exclude<A2, unassigned>,
    | E1
    | E2
    | (A2 extends unassigned ? ExcludeTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K> : never),
    R | R1 | R2
  >
  <
    A,
    E,
    R,
    const K extends Tags<E> | Arr.NonEmptyReadonlyArray<Tags<E>>,
    R1,
    E1,
    A1,
    A2 = unassigned,
    E2 = never,
    R2 = never
  >(
    self: Effect<A, E, R>,
    k: K,
    f: (e: ExtractTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>) => Effect<A1, E1, R1>,
    orElse?:
      | ((e: ExcludeTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>) => Effect<A2, E2, R2>)
      | undefined
  ): Effect<
    A | A1 | Exclude<A2, unassigned>,
    | E1
    | E2
    | (A2 extends unassigned ? ExcludeTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K> : never),
    R | R1 | R2
  >
} = internal.catchTag

/**
 * Handles multiple errors in a single block of code using their `_tag` field.
 *
 * **When to use**
 *
 * Use when one recovery step should handle several tagged error types by
 * matching their readonly `_tag` fields.
 *
 * **Details**
 *
 * Pass a handler table whose keys are tags, plus an optional fallback for
 * unmatched errors.
 *
 * The error type must have a readonly `_tag` field to use `catchTags`. This
 * field is used to identify and match errors.
 *
 * **Example** (Handling multiple tagged errors)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect } from "effect"
 *
 * // Define tagged error types
 * class ValidationError extends Data.TaggedError("ValidationError")<{
 *   message: string
 * }> {}
 *
 * class NetworkError extends Data.TaggedError("NetworkError")<{
 *   statusCode: number
 * }> {}
 *
 * // An effect that might fail with multiple error types
 * const program: Effect.Effect<string, ValidationError | NetworkError> =
 *   Effect.fail(new NetworkError({ statusCode: 503 }))
 *
 * // Handle multiple error types at once
 * const handled = Effect.catchTags(program, {
 *   ValidationError: (error) =>
 *     Effect.succeed(`Validation failed: ${error.message}`),
 *   NetworkError: (error) => Effect.succeed(`Network error: ${error.statusCode}`)
 * })
 *
 * Effect.runSync(handled) // => "Network error: 503"
 * ```
 *
 * @category error handling
 * @since 2.0.0
 */
export const catchTags: {
  <
    E,
    Cases extends
      & { [K in Extract<E, { _tag: string }>["_tag"]]+?: ((error: Extract<E, { _tag: K }>) => Effect<any, any, any>) }
      & (unknown extends E ? {} : { [K in Exclude<keyof Cases, Extract<E, { _tag: string }>["_tag"]>]: never }),
    A2 = unassigned,
    E2 = never,
    R2 = never
  >(
    cases: Cases,
    orElse?: ((e: Exclude<E, { _tag: keyof Cases }>) => Effect<A2, E2, R2>) | undefined
  ): <A, R>(
    self: Effect<A, E, R>
  ) => Effect<
    | A
    | Exclude<A2, unassigned>
    | {
      [K in keyof Cases]: Cases[K] extends (...args: Array<any>) => Effect<infer A, any, any> ? A : never
    }[keyof Cases],
    | E2
    | (A2 extends unassigned ? Exclude<E, { _tag: keyof Cases }> : never)
    | {
      [K in keyof Cases]: Cases[K] extends (...args: Array<any>) => Effect<any, infer E, any> ? E : never
    }[keyof Cases],
    | R
    | R2
    | {
      [K in keyof Cases]: Cases[K] extends (...args: Array<any>) => Effect<any, any, infer R> ? R : never
    }[keyof Cases]
  >
  <
    R,
    E,
    A,
    Cases extends
      & { [K in Extract<E, { _tag: string }>["_tag"]]+?: ((error: Extract<E, { _tag: K }>) => Effect<any, any, any>) }
      & (unknown extends E ? {} : { [K in Exclude<keyof Cases, Extract<E, { _tag: string }>["_tag"]>]: never }),
    A2 = unassigned,
    E2 = never,
    R2 = never
  >(
    self: Effect<A, E, R>,
    cases: Cases,
    orElse?: ((e: Exclude<E, { _tag: keyof Cases }>) => Effect<A2, E2, R2>) | undefined
  ): Effect<
    | A
    | Exclude<A2, unassigned>
    | {
      [K in keyof Cases]: Cases[K] extends (...args: Array<any>) => Effect<infer A, any, any> ? A : never
    }[keyof Cases],
    | E2
    | (A2 extends unassigned ? Exclude<E, { _tag: keyof Cases }> : never)
    | {
      [K in keyof Cases]: Cases[K] extends (...args: Array<any>) => Effect<any, infer E, any> ? E : never
    }[keyof Cases],
    | R
    | R2
    | {
      [K in keyof Cases]: Cases[K] extends (...args: Array<any>) => Effect<any, any, infer R> ? R : never
    }[keyof Cases]
  >
} = internal.catchTags

/**
 * Catches a specific reason within a tagged error.
 *
 * **When to use**
 *
 * Use to handle one nested reason inside an `Effect`'s tagged error while
 * preserving the parent error shape for unmatched reasons.
 *
 * **Details**
 *
 * Use this to handle nested error causes without removing the parent error
 * from the error channel. The handler receives the unwrapped reason.
 *
 * **Example** (Handling an error reason)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect } from "effect"
 *
 * class RateLimitError extends Data.TaggedError("RateLimitError")<{
 *   retryAfter: number
 * }> {}
 *
 * class QuotaExceededError extends Data.TaggedError("QuotaExceededError")<{
 *   limit: number
 * }> {}
 *
 * class AiError extends Data.TaggedError("AiError")<{
 *   reason: RateLimitError | QuotaExceededError
 * }> {}
 *
 * const program: Effect.Effect<string, AiError> = Effect.fail(
 *   new AiError({ reason: new RateLimitError({ retryAfter: 30 }) })
 * )
 *
 * // Handle rate limits specifically
 * const handled = program.pipe(
 *   Effect.catchReason("AiError", "RateLimitError", (reason) =>
 *     Effect.succeed(`Retry after ${reason.retryAfter}s`)
 *   )
 * )
 *
 * Effect.runSync(handled) // => "Retry after 30s"
 * ```
 *
 * @see {@link catchReasons} for handling several nested reason tags
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchReason: {
  <
    K extends Tags<E>,
    E,
    RK extends ReasonTags<ExtractTag<NoInfer<E>, K>>,
    A2,
    E2,
    R2,
    A3 = unassigned,
    E3 = never,
    R3 = never
  >(
    errorTag: K,
    reasonTag: RK,
    f: (
      reason: ExtractReason<ExtractTag<NoInfer<E>, K>, RK>,
      error: NarrowReason<ExtractTag<NoInfer<E>, K>, RK>
    ) => Effect<A2, E2, R2>,
    orElse?:
      | ((
        reasons: ExcludeReason<ExtractTag<NoInfer<E>, K>, RK>,
        error: OmitReason<ExtractTag<NoInfer<E>, K>, RK>
      ) => Effect<A3, E3, R3>)
      | undefined
  ): <A, R>(
    self: Effect<A, E, R>
  ) => Effect<
    A | A2 | Exclude<A3, unassigned>,
    ExcludeTag<E, K> | E2 | E3 | (A3 extends unassigned ? ExtractTag<E, K> : never),
    R | R2 | R3
  >
  <
    A,
    E,
    R,
    K extends Tags<E>,
    RK extends ReasonTags<ExtractTag<E, K>>,
    A2,
    E2,
    R2,
    A3 = unassigned,
    E3 = never,
    R3 = never
  >(
    self: Effect<A, E, R>,
    errorTag: K,
    reasonTag: RK,
    f: (reason: ExtractReason<ExtractTag<E, K>, RK>, error: NarrowReason<ExtractTag<E, K>, RK>) => Effect<A2, E2, R2>,
    orElse?:
      | ((reasons: ExcludeReason<ExtractTag<E, K>, RK>, error: OmitReason<ExtractTag<E, K>, RK>) => Effect<A3, E3, R3>)
      | undefined
  ): Effect<
    A | A2 | Exclude<A3, unassigned>,
    ExcludeTag<E, K> | E2 | E3 | (A3 extends unassigned ? ExtractTag<E, K> : never),
    R | R2 | R3
  >
} = internal.catchReason

/**
 * Catches multiple reasons within a tagged error using an object of handlers.
 *
 * **Example** (Handling multiple error reasons)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect } from "effect"
 *
 * class RateLimitError extends Data.TaggedError("RateLimitError")<{
 *   retryAfter: number
 * }> {}
 *
 * class QuotaExceededError extends Data.TaggedError("QuotaExceededError")<{
 *   limit: number
 * }> {}
 *
 * class AiError extends Data.TaggedError("AiError")<{
 *   reason: RateLimitError | QuotaExceededError
 * }> {}
 *
 * const program: Effect.Effect<string, AiError> = Effect.fail(
 *   new AiError({ reason: new QuotaExceededError({ limit: 100 }) })
 * )
 *
 * const handled = program.pipe(
 *   Effect.catchReasons("AiError", {
 *     RateLimitError: (reason) =>
 *       Effect.succeed(`Retry after ${reason.retryAfter}s`),
 *     QuotaExceededError: (reason) =>
 *       Effect.succeed(`Quota exceeded: ${reason.limit}`)
 *   })
 * )
 *
 * Effect.runSync(handled) // => "Quota exceeded: 100"
 * ```
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchReasons: {
  <
    K extends Tags<E>,
    E,
    Cases extends {
      [RK in ReasonTags<ExtractTag<NoInfer<E>, K>>]+?: (
        reason: ExtractReason<ExtractTag<NoInfer<E>, K>, RK>,
        error: NarrowReason<ExtractTag<NoInfer<E>, K>, RK>
      ) => Effect<any, any, any>
    },
    A2 = unassigned,
    E2 = never,
    R2 = never
  >(
    errorTag: K,
    cases: Cases,
    orElse?:
      | ((
        reason: ExcludeReason<ExtractTag<NoInfer<E>, K>, Extract<keyof Cases, string>>,
        error: OmitReason<ExtractTag<NoInfer<E>, K>, Extract<keyof Cases, string>>
      ) => Effect<A2, E2, R2>)
      | undefined
  ): <A, R>(
    self: Effect<A, E, R>
  ) => Effect<
    | A
    | Exclude<A2, unassigned>
    | {
      [RK in keyof Cases]: Cases[RK] extends (...args: Array<any>) => Effect<infer A, any, any> ? A : never
    }[keyof Cases],
    | ExcludeTag<E, K>
    | E2
    | (A2 extends unassigned ? ExtractTag<E, K> : never)
    | {
      [RK in keyof Cases]: Cases[RK] extends (...args: Array<any>) => Effect<any, infer E, any> ? E : never
    }[keyof Cases],
    | R
    | R2
    | {
      [RK in keyof Cases]: Cases[RK] extends (...args: Array<any>) => Effect<any, any, infer R> ? R : never
    }[keyof Cases]
  >
  <
    A,
    E,
    R,
    K extends Tags<E>,
    Cases extends {
      [RK in ReasonTags<ExtractTag<E, K>>]+?: (
        reason: ExtractReason<ExtractTag<E, K>, RK>,
        error: NarrowReason<ExtractTag<E, K>, RK>
      ) => Effect<any, any, any>
    },
    A2 = unassigned,
    E2 = never,
    R2 = never
  >(
    self: Effect<A, E, R>,
    errorTag: K,
    cases: Cases,
    orElse?:
      | ((
        reason: ExcludeReason<ExtractTag<NoInfer<E>, K>, Extract<keyof Cases, string>>,
        error: OmitReason<ExtractTag<NoInfer<E>, K>, Extract<keyof Cases, string>>
      ) => Effect<A2, E2, R2>)
      | undefined
  ): Effect<
    | A
    | Exclude<A2, unassigned>
    | {
      [RK in keyof Cases]: Cases[RK] extends (...args: Array<any>) => Effect<infer A, any, any> ? A : never
    }[keyof Cases],
    | ExcludeTag<E, K>
    | E2
    | (A2 extends unassigned ? ExtractTag<E, K> : never)
    | {
      [RK in keyof Cases]: Cases[RK] extends (...args: Array<any>) => Effect<any, infer E, any> ? E : never
    }[keyof Cases],
    | R
    | R2
    | {
      [RK in keyof Cases]: Cases[RK] extends (...args: Array<any>) => Effect<any, any, infer R> ? R : never
    }[keyof Cases]
  >
} = internal.catchReasons

/**
 * Type helper that keeps only error tags whose tagged error contains a tagged `reason` field.
 *
 * **When to use**
 *
 * Use to constrain custom helpers or overloads to parent error tags whose error
 * contains a tagged reason.
 *
 * **Details**
 *
 * The mapped type keeps each parent error tag whose extracted tagged error has
 * at least one reason tag, and removes tags that do not carry tagged reasons.
 *
 * @see {@link unwrapReason} for promoting nested reason errors into the error channel
 * @see {@link catchReason} for handling one nested reason tag
 * @see {@link catchReasons} for handling several nested reason tags
 *
 * @category error handling
 * @since 4.0.0
 */
export type TagsWithReason<E> = {
  [T in Tags<E>]: ReasonTags<ExtractTag<E, T>> extends never ? never : T
}[Tags<E>]

/**
 * Promotes nested reason errors into the Effect error channel, replacing
 * the parent error.
 *
 * **Example** (Extracting the reason from a tagged error)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect } from "effect"
 *
 * class RateLimitError extends Data.TaggedError("RateLimitError")<{
 *   retryAfter: number
 * }> {}
 *
 * class QuotaExceededError extends Data.TaggedError("QuotaExceededError")<{
 *   limit: number
 * }> {}
 *
 * class AiError extends Data.TaggedError("AiError")<{
 *   reason: RateLimitError | QuotaExceededError
 * }> {}
 *
 * const program: Effect.Effect<string, AiError> = Effect.fail(
 *   new AiError({ reason: new RateLimitError({ retryAfter: 30 }) })
 * )
 *
 * // Before: Effect<string, AiError>
 * // After:  Effect<string, RateLimitError | QuotaExceededError>
 * const unwrapped = program.pipe(Effect.unwrapReason("AiError"))
 * Effect.runSync(Effect.flip(unwrapped))._tag // => "RateLimitError"
 * ```
 *
 * @category error handling
 * @since 4.0.0
 */
export const unwrapReason: {
  <
    K extends TagsWithReason<E>,
    E
  >(
    errorTag: K
  ): <A, R>(self: Effect<A, E, R>) => Effect<A, ExcludeTag<E, K> | ReasonOf<ExtractTag<E, K>>, R>
  <
    A,
    E,
    R,
    K extends TagsWithReason<E>
  >(
    self: Effect<A, E, R>,
    errorTag: K
  ): Effect<A, ExcludeTag<E, K> | ReasonOf<ExtractTag<E, K>>, R>
} = internal.unwrapReason

/**
 * Handles both recoverable and unrecoverable errors by providing a recovery
 * effect.
 *
 * **When to use**
 *
 * Use when you need to recover from an `Effect` by inspecting the full `Cause`,
 * including recoverable failures, defects, and interruptions, instead of only
 * the typed error value.
 *
 * **Details**
 *
 * When to Recover from Defects:
 *
 * Defects are unexpected errors that typically shouldn't be recovered from, as
 * they often indicate serious issues. However, in some cases, such as
 * dynamically loaded plugins, controlled recovery might be needed.
 *
 * **Example** (Recovering from full failure causes)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * // An effect that might fail in different ways
 * const program = Effect.die("Something went wrong")
 *
 * // Recover from any cause (including defects)
 * const recovered = Effect.catchCause(program, (cause) => {
 *   if (Cause.hasDies(cause)) {
 *     return Effect.sync(() => { output.push("Caught defect") }).pipe(
 *       Effect.as("Recovered from defect")
 *     )
 *   }
 *   return Effect.succeed("Unknown error")
 * })
 *
 * void output.push(Effect.runSync(recovered))
 * output // => ["Caught defect", "Recovered from defect"]
 * ```
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchCause: {
  <E, A2, E2, R2>(
    f: (cause: Cause.Cause<E>) => Effect<A2, E2, R2>
  ): <A, R>(self: Effect<A, E, R>) => Effect<A2 | A, E2, R2 | R>
  <A, E, R, A2, E2, R2>(
    self: Effect<A, E, R>,
    f: (cause: Cause.Cause<E>) => Effect<A2, E2, R2>
  ): Effect<A | A2, E2, R | R2>
} = internal.catchCause

/**
 * Recovers from defects using a provided recovery function.
 *
 * **When to use**
 *
 * Use when you need to report or translate defects at integration boundaries.
 *
 * **Details**
 *
 * `catchDefect` handles unexpected defects, such as thrown exceptions or
 * values passed to `die`, without catching typed failures or interruptions.
 *
 * When to Recover from Defects:
 *
 * Defects are unexpected errors that typically should not be recovered from, as
 * they often indicate serious issues. In some cases, such as dynamically loaded
 * plugins, controlled recovery may be needed.
 *
 * **Example** (Recovering from defects)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * // An effect that might throw an unexpected error (defect)
 * const program = Effect.sync(() => {
 *   throw new Error("Unexpected error")
 * })
 *
 * // Recover from defects only
 * const recovered = Effect.catchDefect(program, (defect) => {
 *   return Effect.sync(() => { output.push(`Caught defect: ${(defect as Error).message}`) }).pipe(
 *     Effect.as("Recovered from defect")
 *   )
 * })
 *
 * void output.push(Effect.runSync(recovered))
 * output // => ["Caught defect: Unexpected error", "Recovered from defect"]
 * ```
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchDefect: {
  <A2, E2, R2>(
    f: (defect: unknown) => Effect<A2, E2, R2>
  ): <A, E, R>(self: Effect<A, E, R>) => Effect<A2 | A, E2 | E, R2 | R>
  <A, E, R, A2, E2, R2>(
    self: Effect<A, E, R>,
    f: (defect: unknown) => Effect<A2, E2, R2>
  ): Effect<A | A2, E | E2, R | R2>
} = internal.catchDefect

/**
 * Recovers from specific errors using a `Predicate` or `Refinement`.
 *
 * **When to use**
 *
 * Use when you need to recover from errors that match a condition.
 *
 * **Details**
 *
 * Use a `Refinement` for type narrowing or a `Predicate` for simple boolean
 * matching. Non-matching errors re-fail with the original cause. Defects and
 * interrupts are not caught.
 *
 * **Example** (Recovering when a predicate matches)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect, Filter } from "effect"
 *
 * class NotFound extends Data.TaggedError("NotFound")<{ id: string }> {}
 *
 * const program = Effect.fail(new NotFound({ id: "user-1" }))
 *
 * // With a refinement
 * const recovered = program.pipe(
 *   Effect.catchIf(
 *     (error): error is NotFound => error._tag === "NotFound",
 *     (error) => Effect.succeed(`missing:${error.id}`)
 *   )
 * )
 *
 * // With a Filter
 * const recovered2 = program.pipe(
 *   Effect.catchFilter(
 *     Filter.tagged("NotFound"),
 *     (error) => Effect.succeed(`missing:${error.id}`)
 *   )
 * )
 *
 * Effect.runSync(Effect.all([recovered, recovered2])) // => ['missing:user-1', 'missing:user-1']
 * ```
 *
 * @category error handling
 * @since 2.0.0
 */
export const catchIf: {
  <E, EB extends E, A2, E2, R2, A3 = unassigned, E3 = never, R3 = never>(
    refinement: Predicate.Refinement<NoInfer<E>, EB>,
    f: (e: EB) => Effect<A2, E2, R2>,
    orElse?: ((e: Exclude<E, EB>) => Effect<A3, E3, R3>) | undefined
  ): <A, R>(
    self: Effect<A, E, R>
  ) => Effect<A | A2 | Exclude<A3, unassigned>, E2 | E3 | (A3 extends unassigned ? Exclude<E, EB> : never), R | R2 | R3>
  <E, A2, E2, R2, A3 = unassigned, E3 = never, R3 = never>(
    predicate: Predicate.Predicate<NoInfer<E>>,
    f: (e: NoInfer<E>) => Effect<A2, E2, R2>,
    orElse?: ((e: NoInfer<E>) => Effect<A3, E3, R3>) | undefined
  ): <A, R>(
    self: Effect<A, E, R>
  ) => Effect<A | A2 | Exclude<A3, unassigned>, E2 | E3 | (A3 extends unassigned ? E : never), R | R2 | R3>
  <A, E, R, EB extends E, A2, E2, R2, A3 = unassigned, E3 = never, R3 = never>(
    self: Effect<A, E, R>,
    refinement: Predicate.Refinement<E, EB>,
    f: (e: EB) => Effect<A2, E2, R2>,
    orElse?: ((e: Exclude<E, EB>) => Effect<A3, E3, R3>) | undefined
  ): Effect<A | A2 | Exclude<A3, unassigned>, E2 | E3 | (A3 extends unassigned ? Exclude<E, EB> : never), R | R2 | R3>
  <A, E, R, A2, E2, R2, A3 = unassigned, E3 = never, R3 = never>(
    self: Effect<A, E, R>,
    predicate: Predicate.Predicate<E>,
    f: (e: E) => Effect<A2, E2, R2>,
    orElse?: ((e: E) => Effect<A3, E3, R3>) | undefined
  ): Effect<A | A2 | Exclude<A3, unassigned>, E2 | E3 | (A3 extends unassigned ? E : never), R | R2 | R3>
} = internal.catchIf

/**
 * Recovers from specific errors using a `Filter`.
 *
 * **When to use**
 *
 * Use to recover from typed `Effect` errors with a reusable `Filter` when
 * matching can also narrow or transform the error before choosing the recovery
 * effect.
 *
 * **Details**
 *
 * The filter runs on typed failures extracted from the `Cause`. Successful
 * filter results are passed to `f`; failed filter results are passed to
 * `orElse` when provided. Without `orElse`, the original failure cause is
 * preserved.
 *
 * @see {@link catchIf} for predicate-based recovery from typed errors
 * @see {@link catchTag} for recovering from a single tagged error
 * @see {@link catchTags} for recovering from several tagged errors
 * @see {@link catchCauseFilter} for filtering full causes instead of typed errors
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchFilter: {
  <E, EB, A2, E2, R2, X, A3 = unassigned, E3 = never, R3 = never>(
    filter: Filter.Filter<NoInfer<E>, EB, X>,
    f: (e: EB) => Effect<A2, E2, R2>,
    orElse?: ((e: X) => Effect<A3, E3, R3>) | undefined
  ): <A, R>(
    self: Effect<A, E, R>
  ) => Effect<A | A2 | Exclude<A3, unassigned>, E2 | E3 | (A3 extends unassigned ? X : never), R | R2 | R3>
  <A, E, R, EB, A2, E2, R2, X, A3 = unassigned, E3 = never, R3 = never>(
    self: Effect<A, E, R>,
    filter: Filter.Filter<NoInfer<E>, EB, X>,
    f: (e: EB) => Effect<A2, E2, R2>,
    orElse?: ((e: X) => Effect<A3, E3, R3>) | undefined
  ): Effect<A | A2 | Exclude<A3, unassigned>, E2 | E3 | (A3 extends unassigned ? X : never), R | R2 | R3>
} = internal.catchFilter

/**
 * Catches `NoSuchElementError` failures and converts them to `Option.none`.
 *
 * **When to use**
 *
 * Use when you expect missing-value failures and want them to become an
 * optional success while all other failures keep failing.
 *
 * **Details**
 *
 * Success values become `Option.some`, `NoSuchElementError` becomes
 * `Option.none`, and all other errors are preserved.
 *
 * **Example** (Recovering from missing Option values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option } from "effect"
 * const output: Array<unknown> = []
 *
 * const some = Effect.fromNullishOr(1).pipe(Effect.catchNoSuchElement)
 * const none = Effect.fromNullishOr(null).pipe(Effect.catchNoSuchElement)
 *
 * void output.push(Effect.runSync(some))
 * void output.push(Effect.runSync(none))
 * output // => [Option.some(1), Option.none()]
 * ```
 *
 * @see {@link fromOption} for converting `Option.none` into `NoSuchElementError`
 * @see {@link fromNullishOr} for converting nullish values into `NoSuchElementError`
 * @see {@link option} for converting any failure into `Option.none`
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchNoSuchElement: <A, E, R>(
  self: Effect<A, E, R>
) => Effect<Option<A>, Exclude<E, Cause.NoSuchElementError>, R> = internal.catchNoSuchElement

/**
 * Recovers from specific failures based on a predicate.
 *
 * **When to use**
 *
 * Use to recover an `Effect` from full causes selected by a predicate.
 *
 * **Details**
 *
 * This function allows you to conditionally catch and recover from failures
 * that match a specific predicate. This is useful when you want to handle
 * only certain types of errors while letting others propagate.
 *
 * **Example** (Recovering from selected causes)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const httpRequest = Effect.fail("Network Error")
 *
 * // Only catch network-related failures
 * const program = Effect.catchCauseIf(
 *   httpRequest,
 *   Cause.hasFails,
 *   (cause) =>
 *     Effect.gen(function*() {
 *       yield* Effect.sync(() => { output.push(`Caught network error: ${Cause.squash(cause)}`) })
 *       return "Fallback response"
 *     })
 * )
 *
 * void output.push(Effect.runSync(program))
 * output // => ["Caught network error: Network Error", "Fallback response"]
 * ```
 *
 * @see {@link catchCause} for recovering from every cause
 * @see {@link catchCauseFilter} for selecting full causes with a `Filter`
 * @see {@link catchIf} for predicate-based recovery from typed errors
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchCauseIf: {
  <E, B, E2, R2>(
    predicate: Predicate.Predicate<Cause.Cause<E>>,
    f: (cause: Cause.Cause<E>) => Effect<B, E2, R2>
  ): <A, R>(self: Effect<A, E, R>) => Effect<A | B, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Effect<A, E, R>,
    predicate: Predicate.Predicate<Cause.Cause<E>>,
    f: (cause: Cause.Cause<E>) => Effect<B, E2, R2>
  ): Effect<A | B, E | E2, R | R2>
} = internal.catchCauseIf

/**
 * Recovers from specific failures based on a `Filter`.
 *
 * **When to use**
 *
 * Use when you need to recover an `Effect` only from causes selected by a
 * `Filter`, while giving the recovery both the selected value and the original
 * `Cause`.
 *
 * **Details**
 *
 * The filter is applied to the full `Cause`. When it succeeds, the handler
 * receives the selected value and the original cause. When it fails, the effect
 * re-fails with the residual cause returned by the filter.
 *
 * @see {@link catchCauseIf} for predicate-based cause selection
 * @see {@link catchFilter} for filtering typed error values instead of full causes
 * @see {@link catchCause} for recovering from every cause without filtering
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchCauseFilter: {
  <E, B, E2, R2, EB, X extends Cause.Cause<any>>(
    filter: Filter.Filter<Cause.Cause<E>, EB, X>,
    f: (failure: EB, cause: Cause.Cause<E>) => Effect<B, E2, R2>
  ): <A, R>(self: Effect<A, E, R>) => Effect<A | B, Cause.Cause.Error<X> | E2, R | R2>
  <A, E, R, B, E2, R2, EB, X extends Cause.Cause<any>>(
    self: Effect<A, E, R>,
    filter: Filter.Filter<Cause.Cause<E>, EB, X>,
    f: (failure: EB, cause: Cause.Cause<E>) => Effect<B, E2, R2>
  ): Effect<A | B, Cause.Cause.Error<X> | E2, R | R2>
} = internal.catchCauseFilter

/**
 * Transforms the failure value of an effect without changing its success value.
 *
 * **When to use**
 *
 * Use to translate an `Effect`'s typed failures while leaving successful values
 * unchanged.
 *
 * **Details**
 *
 * Only the failure channel is transformed. The success channel and requirements
 * are preserved.
 *
 * **Example** (Transforming the error channel)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect } from "effect"
 *
 * class TaskError extends Data.TaggedError("TaskError")<{ readonly message: string }> {}
 *
 * //      ┌─── Effect<number, string, never>
 * //      ▼
 * const simulatedTask = Effect.fail("Oh no!").pipe(Effect.as(1))
 *
 * //      ┌─── Effect<number, TaskError, never>
 * //      ▼
 * const mapped = Effect.mapError(
 *   simulatedTask,
 *   (message) => new TaskError({ message })
 * )
 * Effect.runSync(Effect.flip(mapped)).message // => "Oh no!"
 * ```
 *
 * @see {@link map} for a version that operates on the success channel.
 * @see {@link mapBoth} for a version that operates on both channels.
 *
 * @category error handling
 * @since 2.0.0
 */
export const mapError: {
  <E, E2>(f: (e: E) => E2): <A, R>(self: Effect<A, E, R>) => Effect<A, E2, R>
  <A, E, R, E2>(self: Effect<A, E, R>, f: (e: E) => E2): Effect<A, E2, R>
} = internal.mapError

/**
 * Applies transformations to both the success and error channels of an effect.
 *
 * **When to use**
 *
 * Use to transform both success and failure channels of an `Effect` without
 * changing whether it succeeds or fails.
 *
 * **Details**
 *
 * This function takes two map functions as arguments: one for the error channel
 * and one for the success channel. You can use it when you want to modify both
 * the error and the success values without altering the overall success or
 * failure status of the effect.
 *
 * **Example** (Transforming success and failure channels)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect } from "effect"
 *
 * class TaskError extends Data.TaggedError("TaskError")<{ readonly message: string }> {}
 *
 * //      ┌─── Effect<number, string, never>
 * //      ▼
 * const simulatedTask = Effect.fail("Oh no!").pipe(Effect.as(1))
 *
 * //      ┌─── Effect<boolean, TaskError, never>
 * //      ▼
 * const modified = Effect.mapBoth(simulatedTask, {
 *   onFailure: (message) => new TaskError({ message }),
 *   onSuccess: (n) => n > 0
 * })
 * Effect.runSync(Effect.flip(modified)).message // => "Oh no!"
 * ```
 *
 * @see {@link map} for a version that operates on the success channel.
 * @see {@link mapError} for a version that operates on the error channel.
 *
 * @category mapping
 * @since 2.0.0
 */
export const mapBoth: {
  <E, E2, A, A2>(
    options: { readonly onFailure: (e: E) => E2; readonly onSuccess: (a: A) => A2 }
  ): <R>(self: Effect<A, E, R>) => Effect<A2, E2, R>
  <A, E, R, E2, A2>(
    self: Effect<A, E, R>,
    options: { readonly onFailure: (e: E) => E2; readonly onSuccess: (a: A) => A2 }
  ): Effect<A2, E2, R>
} = internal.mapBoth

/**
 * Converts typed failures from the error channel into defects, removing the
 * error type from the returned effect.
 *
 * **When to use**
 *
 * Use when you need to turn an `Effect` typed failure that represents an
 * unrecoverable bug or invalid state into a defect.
 *
 * **Example** (Converting typed failures into defects)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect, Exit } from "effect"
 *
 * class DivideByZeroError extends Data.TaggedError("DivideByZeroError")<{}> {}
 *
 * const divide = (a: number, b: number) =>
 *   b === 0
 *     ? Effect.fail(new DivideByZeroError())
 *     : Effect.succeed(a / b)
 *
 * //      ┌─── Effect<number, never, never>
 * //      ▼
 * const program = Effect.orDie(divide(1, 0))
 *
 * Effect.runSyncExit(program) // => Exit.die(new DivideByZeroError())
 * ```
 *
 * @category error handling
 * @since 2.0.0
 */
export const orDie: <A, E, R>(self: Effect<A, E, R>) => Effect<A, never, R> = internal.orDie

/**
 * Runs an effectful operation when the source effect fails, while preserving
 * the original failure when the operation succeeds.
 *
 * **Details**
 *
 * Use this for logging, metrics, or other failure-side observations. If the
 * operation passed to `tapError` fails, that error is also represented in the
 * returned effect's error channel.
 *
 * **Example** (Running effects on failure)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit } from "effect"
 * const output: Array<unknown> = []
 *
 * // Simulate a task that fails with an error
 * const task: Effect.Effect<number, string> = Effect.fail("NetworkError")
 *
 * // Use tapError to log the error message when the task fails
 * const tapping = Effect.tapError(
 *   task,
 *   (error) => Effect.sync(() => { output.push(`expected error: ${error}`) })
 * )
 *
 * void output.push(Effect.runSyncExit(tapping))
 * output // => ["expected error: NetworkError", Exit.fail("NetworkError")]
 * ```
 *
 * @category error handling
 * @since 2.0.0
 */
export const tapError: {
  <E, X, E2, R2>(
    f: (e: NoInfer<E>) => Effect<X, E2, R2>
  ): <A, R>(self: Effect<A, E, R>) => Effect<A, E | E2, R2 | R>
  <A, E, R, X, E2, R2>(
    self: Effect<A, E, R>,
    f: (e: E) => Effect<X, E2, R2>
  ): Effect<A, E | E2, R | R2>
} = internal.tapError

/**
 * Runs an effectful handler when a failure's `_tag` matches.
 *
 * **Details**
 *
 * Use this with tagged-union errors to perform side effects for one tag or a
 * list of tags. When the handler succeeds, the original failure is preserved;
 * if the handler fails, its error is also included in the returned effect.
 *
 * **Example** (Running effects for tagged failures)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect, Exit } from "effect"
 * const output: Array<unknown> = []
 *
 * class NetworkError extends Data.TaggedError("NetworkError")<{
 *   statusCode: number
 * }> {}
 *
 * class ValidationError extends Data.TaggedError("ValidationError")<{
 *   field: string
 * }> {}
 *
 * const task: Effect.Effect<number, NetworkError | ValidationError> =
 *   Effect.fail(new NetworkError({ statusCode: 504 }))
 *
 * const program = Effect.tapErrorTag(task, "NetworkError", (error) =>
 *   Effect.sync(() => { output.push(`expected error: ${error.statusCode}`) })
 * )
 *
 * void output.push(Effect.runSyncExit(program))
 * output // => ["expected error: 504", Exit.fail(new NetworkError({ statusCode: 504 }))]
 * ```
 *
 * @category error handling
 * @since 2.0.0
 */
export const tapErrorTag: {
  <const K extends Tags<E> | Arr.NonEmptyReadonlyArray<Tags<E>>, E, A1, E1, R1>(
    k: K,
    f: (e: ExtractTag<NoInfer<E>, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>) => Effect<A1, E1, R1>
  ): <A, R>(self: Effect<A, E, R>) => Effect<A, E | E1, R1 | R>
  <
    A,
    E,
    R,
    const K extends Tags<E> | Arr.NonEmptyReadonlyArray<Tags<E>>,
    R1,
    E1,
    A1
  >(
    self: Effect<A, E, R>,
    k: K,
    f: (e: ExtractTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>) => Effect<A1, E1, R1>
  ): Effect<A, E | E1, R | R1>
} = internal.tapErrorTag

/**
 * Runs an effectful operation with the full `Cause` when the source effect
 * fails.
 *
 * **When to use**
 *
 * Use when failure observation needs typed failures, defects, and interruptions
 * rather than only the typed error value.
 *
 * **Details**
 *
 * Use this to log or inspect typed failures, defects, and interruptions. When
 * the operation succeeds, the original cause is preserved. If the operation
 * fails, its error is also represented in the returned effect.
 *
 * **Example** (Observing full failure causes)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect, Exit } from "effect"
 * const output: Array<unknown> = []
 *
 * const task = Effect.fail("Something went wrong")
 *
 * const program = Effect.tapCause(
 *   task,
 *   (cause) => Effect.sync(() => { output.push(`Logging cause: ${Cause.squash(cause)}`) })
 * )
 *
 * void output.push(Effect.runSyncExit(program))
 * output // => ["Logging cause: Something went wrong", Exit.fail("Something went wrong")]
 * ```
 *
 * @category error handling
 * @since 4.0.0
 */
export const tapCause: {
  <E, X, E2, R2>(
    f: (cause: Cause.Cause<NoInfer<E>>) => Effect<X, E2, R2>
  ): <A, R>(self: Effect<A, E, R>) => Effect<A, E | E2, R2 | R>
  <A, E, R, X, E2, R2>(
    self: Effect<A, E, R>,
    f: (cause: Cause.Cause<E>) => Effect<X, E2, R2>
  ): Effect<A, E | E2, R | R2>
} = internal.tapCause

/**
 * Executes a side effect conditionally when a failed effect's cause matches a predicate.
 *
 * **Details**
 *
 * This function allows you to tap into the cause of an effect's failure only when
 * the cause matches a specific predicate. This is useful for conditional logging,
 * monitoring, or other side effects based on the type of failure.
 *
 * **Example** (Observing selected failure causes)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect, Exit } from "effect"
 * const output: Array<unknown> = []
 *
 * const task = Effect.fail("Network timeout")
 *
 * // Only log causes that contain failures (not interrupts or defects)
 * const program = Effect.tapCauseIf(
 *   task,
 *   Cause.hasFails,
 *   (cause) => Effect.sync(() => { output.push(`Logging failure cause: ${Cause.squash(cause)}`) })
 * )
 *
 * void output.push(Effect.runSyncExit(program))
 * output // => ["Logging failure cause: Network timeout", Exit.fail("Network timeout")]
 * ```
 *
 * @category error handling
 * @since 4.0.0
 */
export const tapCauseIf: {
  <E, B, E2, R2>(
    predicate: Predicate.Predicate<Cause.Cause<E>>,
    f: (cause: Cause.Cause<E>) => Effect<B, E2, R2>
  ): <A, R>(self: Effect<A, E, R>) => Effect<A, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Effect<A, E, R>,
    predicate: Predicate.Predicate<Cause.Cause<E>>,
    f: (cause: Cause.Cause<E>) => Effect<B, E2, R2>
  ): Effect<A, E | E2, R | R2>
} = internal.tapCauseIf

/**
 * Executes a side effect conditionally when a failed effect's cause passes a filter.
 *
 * **When to use**
 *
 * Use when you need to observe only failure causes selected by a `Filter`,
 * while giving the side effect both the selected value and the original
 * `Cause`.
 *
 * **Details**
 *
 * A successful filter result runs the side effect with the selected value and
 * original cause. A failed filter result skips the side effect and preserves the
 * original cause.
 *
 * @see {@link tapCauseIf} for selecting causes with a boolean predicate
 * @see {@link tapCause} for observing every failure cause
 * @see {@link catchCauseFilter} for recovering from selected causes instead of only observing them
 *
 * @category error handling
 * @since 4.0.0
 */
export const tapCauseFilter: {
  <E, B, E2, R2, EB, X extends Cause.Cause<any>>(
    filter: Filter.Filter<Cause.Cause<E>, EB, X>,
    f: (a: EB, cause: Cause.Cause<E>) => Effect<B, E2, R2>
  ): <A, R>(self: Effect<A, E, R>) => Effect<A, E | E2, R | R2>
  <A, E, R, B, E2, R2, EB, X extends Cause.Cause<any>>(
    self: Effect<A, E, R>,
    filter: Filter.Filter<Cause.Cause<E>, EB, X>,
    f: (a: EB, cause: Cause.Cause<E>) => Effect<B, E2, R2>
  ): Effect<A, E | E2, R | R2>
} = internal.tapCauseFilter

/**
 * Runs an effectful operation when the source effect dies with a defect.
 *
 * **Details**
 *
 * Use this for diagnostics such as logging unexpected thrown exceptions or
 * values passed to `die`. Recoverable failures are not handled. When the
 * operation succeeds, the original defect is preserved; if the operation fails,
 * its error is also represented in the returned effect.
 *
 * **Example** (Observing defects)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit } from "effect"
 * const output: Array<unknown> = []
 *
 * // Simulate a severe failure in the system
 * const task2: Effect.Effect<number> = Effect.die(
 *   "Something went wrong"
 * )
 *
 * // Log the defect using tapDefect
 * const tapping2 = Effect.tapDefect(
 *   task2,
 *   (defect) => Effect.sync(() => { output.push(`defect: ${defect}`) })
 * )
 *
 * void output.push(Effect.runSyncExit(tapping2))
 * output // => ["defect: Something went wrong", Exit.die("Something went wrong")]
 * ```
 *
 * @category error handling
 * @since 2.0.0
 */
export const tapDefect: {
  <B, E2, R2>(f: (defect: unknown) => Effect<B, E2, R2>): <A, E, R>(self: Effect<A, E, R>) => Effect<A, E | E2, R | R2>
  <A, E, R, B, E2, R2>(self: Effect<A, E, R>, f: (defect: unknown) => Effect<B, E2, R2>): Effect<A, E | E2, R | R2>
} = internal.tapDefect

/**
 * Retries an effect until it succeeds, discarding failures.
 *
 * **Details**
 *
 * Yields between attempts so other fibers can run.
 *
 * **Example** (Retrying until success)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * let attempts = 0
 *
 * const flaky = Effect.gen(function*() {
 *   attempts++
 *   yield* Effect.sync(() => { output.push(`Attempt ${attempts}`) })
 *   if (attempts < 3) {
 *     return yield* Effect.fail("Not ready")
 *   }
 *   return "Ready"
 * })
 *
 * const program = Effect.eventually(flaky)
 *
 * void output.push(await Effect.runPromise(program))
 * output // => ["Attempt 1", "Attempt 2", "Attempt 3", "Ready"]
 * ```
 *
 * @category repetition
 * @since 2.0.0
 */
export const eventually: <A, E, R>(self: Effect<A, E, R>) => Effect<A, never, R> = internal.eventually

// -----------------------------------------------------------------------------
// Error Handling
// -----------------------------------------------------------------------------

/**
 * Type helpers for retrying effects.
 *
 * @category error handling
 * @since 2.0.0
 */
export declare namespace Retry {
  /**
   * Computes the result type of `Effect.retry` from the original effect and retry options.
   *
   * @category error handling
   * @since 2.0.0
   */
  export type Return<R, E, A, O extends Options<E>> = Effect<
    A,
    | (O extends { schedule: Schedule<infer _O, infer _I, infer _E1, infer _R> } ? E
      : O extends { times: number } ? E
      : O extends { until: Predicate.Refinement<E, infer E2> } ? E2
      : O extends { while: Predicate.Refinement<E, infer E2> } ? Exclude<E, E2>
      : E)
    | (O extends { schedule: Schedule<infer _O, infer _I, infer E, infer _R> } ? E
      : never)
    | (O extends { while: (...args: Array<any>) => Effect<infer _A, infer E, infer _R> } ? E
      : never)
    | (O extends { until: (...args: Array<any>) => Effect<infer _A, infer E, infer _R> } ? E
      : never),
    | R
    | (O extends { schedule: Schedule<infer _O, infer _I, infer _E1, infer R> } ? R
      : never)
    | (O extends { while: (...args: Array<any>) => Effect<infer _A, infer _E, infer R> } ? R
      : never)
    | (O extends { until: (...args: Array<any>) => Effect<infer _A, infer _E, infer R> } ? R
      : never)
  > extends infer Z ? Z
    : never

  /**
   * Options that control whether and how a failing effect is retried.
   *
   * @category error handling
   * @since 2.0.0
   */
  export interface Options<E> {
    while?: ((error: E) => boolean | Effect<boolean, any, any>) | undefined
    until?: ((error: E) => boolean | Effect<boolean, any, any>) | undefined
    times?: number | undefined
    schedule?: Schedule<any, E, any, any> | undefined
  }
}

/**
 * Retries typed failures from an effect according to a retry policy.
 *
 * **When to use**
 *
 * Use when you need to rerun an effect after transient typed failures, such as
 * network issues or temporary resource unavailability.
 *
 * **Details**
 *
 * The policy can be a `Schedule`, a schedule builder, or a `Retry.Options`
 * object using `schedule`, `times`, `while`, or `until`. If a retry eventually
 * succeeds, the returned effect succeeds with that value. If the policy stops
 * while the effect is still failing, the last failure is propagated.
 *
 * **Gotchas**
 *
 * The source effect is always evaluated once before any retry policy is
 * applied. For example, `Schedule.recurs(3)` allows up to three retries after
 * the initial attempt.
 *
 * Defects and interruptions are not retried.
 *
 * **Example** (Retrying with a schedule)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect, Schedule } from "effect"
 *
 * class AttemptError extends Data.TaggedError("AttemptError")<{ readonly attempt: number }> {}
 *
 * let attempt = 0
 * const task = Effect.callback<string, AttemptError>((resume) => {
 *   attempt++
 *   if (attempt <= 2) {
 *     resume(Effect.fail(new AttemptError({ attempt })))
 *   } else {
 *     resume(Effect.succeed("Success!"))
 *   }
 * })
 *
 * const policy = Schedule.recurs(5)
 * const program = Effect.retry(task, policy)
 *
 * await Effect.runPromise(program) // => "Success!"
 * ```
 *
 * @see {@link retryOrElse} for a version that allows you to run a fallback.
 * @see {@link repeat} if your retry condition is based on successful outcomes rather than errors.
 * @category error handling
 * @since 2.0.0
 */
export const retry: {
  <E, O extends Retry.Options<E>>(options: O): <A, R>(self: Effect<A, E, R>) => Retry.Return<R, E, A, O>
  <B, E, Error, Env>(
    policy: Schedule<B, NoInfer<E>, Error, Env>
  ): <A, R>(self: Effect<A, E, R>) => Effect<A, E | Error, R | Env>
  <B, E, Error, Env>(
    builder: (
      $: <O, SE, R>(_: Schedule<O, NoInfer<E>, SE, R>) => Schedule<O, E, SE, R>
    ) => Schedule<B, NoInfer<E>, Error, Env>
  ): <A, R>(self: Effect<A, E, R>) => Effect<A, E | Error, R | Env>
  <A, E, R, O extends Retry.Options<E>>(self: Effect<A, E, R>, options: O): Retry.Return<R, E, A, O>
  <A, E, R, B, Error, Env>(
    self: Effect<A, E, R>,
    policy: Schedule<B, NoInfer<E>, Error, Env>
  ): Effect<A, E | Error, R | Env>
  <A, E, R, B, Error, Env>(
    self: Effect<A, E, R>,
    builder: (
      $: <O, SE, R>(_: Schedule<O, NoInfer<E>, SE, R>) => Schedule<O, E, SE, R>
    ) => Schedule<B, NoInfer<E>, Error, Env>
  ): Effect<A, E | Error, R | Env>
} = internalSchedule.retry

/**
 * Retries a failing effect and runs a fallback effect if retries are exhausted.
 *
 * **When to use**
 *
 * Use when you want to handle failures gracefully by specifying an alternative
 * action after repeated failures.
 *
 * **Details**
 *
 * The `Effect.retryOrElse` function attempts to retry a failing effect multiple
 * times according to a defined {@link Schedule} policy.
 *
 * If the retries are exhausted and the effect still fails, it runs a fallback
 * effect instead.
 *
 * **Example** (Falling back after retries are exhausted)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect, Schedule } from "effect"
 * const output: Array<unknown> = []
 *
 * class NetworkTimeoutError extends Data.TaggedError("NetworkTimeoutError")<{}> {}
 *
 * let attempt = 0
 * const networkRequest = Effect.gen(function*() {
 *   attempt++
 *   yield* Effect.sync(() => { output.push(`Network attempt ${attempt}`) })
 *   if (attempt < 3) {
 *     return yield* Effect.fail(new NetworkTimeoutError())
 *   }
 *   return "Network data"
 * })
 *
 * // Retry up to 2 times, then fall back to cached data
 * const program = Effect.retryOrElse(
 *   networkRequest,
 *   Schedule.recurs(2),
 *   (error, retryCount) =>
 *     Effect.gen(function*() {
 *       yield* Effect.sync(() => { output.push(`All ${retryCount} retries failed, using cache`) })
 *       return "Cached data"
 *     })
 * )
 *
 * void output.push(await Effect.runPromise(program))
 * output // => ["Network attempt 1", "Network attempt 2", "Network attempt 3", "Network data"]
 * ```
 *
 * @see {@link retry} for a version that does not run a fallback effect.
 * @category error handling
 * @since 2.0.0
 */
export const retryOrElse: {
  <A1, E, E1, R1, A2, E2, R2>(
    policy: Schedule<A1, NoInfer<E>, E1, R1>,
    orElse: (e: NoInfer<E>, out: A1) => Effect<A2, E2, R2>
  ): <A, R>(self: Effect<A, E, R>) => Effect<A | A2, E1 | E2, R | R1 | R2>
  <A, E, R, A1, E1, R1, A2, E2, R2>(
    self: Effect<A, E, R>,
    policy: Schedule<A1, NoInfer<E>, E1, R1>,
    orElse: (e: NoInfer<E>, out: A1) => Effect<A2, E2, R2>
  ): Effect<A | A2, E1 | E2, R | R1 | R2>
} = internalSchedule.retryOrElse

/**
 * Exposes an effect's full failure cause in the error channel as `Cause<E>`.
 *
 * **Details**
 *
 * Use `sandbox` when downstream error handling needs to distinguish typed
 * failures, defects, and interruptions. Use `unsandbox` to restore the original
 * typed error channel after cause-level handling.
 *
 * **Example** (Exposing failures as causes)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect } from "effect"
 *
 * const task = Effect.fail("Something went wrong")
 *
 * // Sandbox exposes the full cause as the error type
 * const program = Effect.gen(function*() {
 *   const result = yield* Effect.flip(Effect.sandbox(task))
 *   return `Caught cause: ${Cause.squash(result)}`
 * })
 *
 * Effect.runSync(program) // => "Caught cause: Something went wrong"
 * ```
 *
 * @category error handling
 * @since 2.0.0
 */
export const sandbox: <A, E, R>(
  self: Effect<A, E, R>
) => Effect<A, Cause.Cause<E>, R> = internal.sandbox

/**
 * Discards both the success and failure values of an effect.
 *
 * **When to use**
 *
 * Use when an effect should run for its side effects while both success and
 * failure values are discarded.
 *
 * **Details**
 *
 * Use the `log` option to emit the full {@link Cause} when the effect fails,
 * and `message` to prepend a custom log message.
 *
 * **Example** (Discarding success and failure values)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * //      ┌─── Effect<number, string, never>
 * //      ▼
 * const task = Effect.fail("Uh oh!").pipe(Effect.as(5))
 *
 * //      ┌─── Effect<void, never, never>
 * //      ▼
 * const program = task.pipe(Effect.ignore)
 * Effect.runSync(program) // => undefined
 * ```
 *
 * **Example** (Logging failures while ignoring results)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const task = Effect.fail("Uh oh!")
 *
 * const program = task.pipe(Effect.ignore)
 * Effect.runSync(program) // => undefined
 * ```
 *
 * @category error handling
 * @since 2.0.0
 */
export const ignore: <
  Arg extends Effect<any, any, any> | {
    readonly log?: boolean | Severity | undefined
    readonly message?: string | undefined
  } | undefined = {
    readonly log?: boolean | Severity | undefined
    readonly message?: string | undefined
  }
>(
  effectOrOptions?: Arg,
  options?: {
    readonly log?: boolean | Severity | undefined
    readonly message?: string | undefined
  } | undefined
) => [Arg] extends [Effect<infer _A, infer _E, infer _R>] ? Effect<void, never, _R>
  : <A, E, R>(self: Effect<A, E, R>) => Effect<void, never, R> = internal.ignore

/**
 * Ignores the effect's failure cause, including defects and interruptions.
 *
 * **When to use**
 *
 * Use when a best-effort effect should never fail, even from defects or
 * interruption, and optional cause logging is enough.
 *
 * **Details**
 *
 * Use the `log` option to emit the full {@link Cause} when the effect fails,
 * and `message` to prepend a custom log message.
 *
 * **Example** (Ignoring failures and logging causes)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const task = Effect.fail("boom")
 *
 * const program = task.pipe(Effect.ignoreCause)
 * Effect.runSync(program) // => undefined
 * ```
 *
 * @category error handling
 * @since 4.0.0
 */
export const ignoreCause: <
  Arg extends Effect<any, any, any> | {
    readonly log?: boolean | Severity | undefined
    readonly message?: string | undefined
  } | undefined = {
    readonly log?: boolean | Severity | undefined
    readonly message?: string | undefined
  }
>(
  effectOrOptions?: Arg,
  options?: {
    readonly log?: boolean | Severity | undefined
    readonly message?: string | undefined
  } | undefined
) => [Arg] extends [Effect<infer _A, infer _E, infer _R>] ? Effect<void, never, _R>
  : <A, E, R>(self: Effect<A, E, R>) => Effect<void, never, R> = internal.ignoreCause

/**
 * Applies an `ExecutionPlan` to an effect, retrying with step-provided resources
 * until it succeeds or the plan is exhausted.
 *
 * **Details**
 *
 * Each attempt updates `ExecutionPlan.CurrentMetadata` (attempt and step index),
 * and retry timing is derived per step (the first attempt uses the remaining
 * attempts schedule; later retries apply the step schedule at least once).
 *
 * Attempts can be observed from outside the effect by passing
 * `options.onEvent`, which receives an `ExecutionPlan.Event` before each
 * attempt and after it settles. The handler is awaited inline before and after
 * every attempt, so events are strictly ordered; keep it cheap. It cannot
 * fail, which keeps observation from changing the plan's outcome, and its
 * requirements are added to the resulting effect. Terminal events run like
 * finalizers, so they are emitted even when the attempt is interrupted.
 *
 * **Example** (Retrying with an execution plan)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, ExecutionPlan, Layer } from "effect"
 *
 * const Endpoint = Context.Service<{ url: string }>("Endpoint")
 *
 * const fetchUrl = Effect.gen(function*() {
 *   const endpoint = yield* Effect.service(Endpoint)
 *   if (endpoint.url === "bad") {
 *     return yield* Effect.fail("Unavailable")
 *   }
 *   return endpoint.url
 * })
 *
 * const plan = ExecutionPlan.make(
 *   { provide: Layer.succeed(Endpoint, { url: "bad" }), attempts: 2 },
 *   { provide: Layer.succeed(Endpoint, { url: "good" }) }
 * )
 *
 * const program = Effect.withExecutionPlan(fetchUrl, plan)
 * Effect.runSync(program) // => "good"
 * ```
 *
 * **Example** (Observing execution-plan attempts)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, ExecutionPlan, Layer } from "effect"
 *
 * const Endpoint = Context.Service<{ url: string }>("Endpoint")
 *
 * const fetchUrl = Effect.gen(function*() {
 *   const endpoint = yield* Effect.service(Endpoint)
 *   if (endpoint.url === "bad") {
 *     return yield* Effect.fail("Unavailable")
 *   }
 *   return endpoint.url
 * })
 *
 * const plan = ExecutionPlan.make(
 *   { provide: Layer.succeed(Endpoint, { url: "bad" }) },
 *   { provide: Layer.succeed(Endpoint, { url: "good" }) }
 * )
 *
 * const events: Array<string> = []
 * const program = Effect.withExecutionPlan(fetchUrl, plan, {
 *   onEvent: (event) => Effect.sync(() => events.push(`${event._tag}:${event.stepIndex}`))
 * })
 *
 * await Effect.runPromise(program) // => "good"
 *
 * events // => ["AttemptStart:0", "AttemptFailure:0", "AttemptStart:1", "AttemptSuccess:1"]
 * ```
 *
 * @category error handling
 * @since 3.16.0
 */
export const withExecutionPlan: {
  <Input, Provides, PlanE, PlanR, RX = never>(
    plan: ExecutionPlan.ExecutionPlan<{ provides: Provides; input: Input; error: PlanE; requirements: PlanR }>,
    options?: {
      readonly onEvent?: ((event: ExecutionPlan.Event<Input | PlanE>) => Effect<void, never, RX>) | undefined
    }
  ): <A, E extends Input, R>(
    effect: Effect<A, E, R>
  ) => Effect<A, E | PlanE, Exclude<R, Provides> | PlanR | RX>
  <A, E extends Input, R, Provides, Input, PlanE, PlanR, RX = never>(
    effect: Effect<A, E, R>,
    plan: ExecutionPlan.ExecutionPlan<{ provides: Provides; input: Input; error: PlanE; requirements: PlanR }>,
    options?: {
      readonly onEvent?: ((event: ExecutionPlan.Event<E | PlanE>) => Effect<void, never, RX>) | undefined
    }
  ): Effect<A, E | PlanE, Exclude<R, Provides> | PlanR | RX>
} = internalExecutionPlan.withExecutionPlan

/**
 * Runs an effect and reports any errors to the configured `ErrorReporter`s.
 *
 * **Details**
 *
 * If the `defectsOnly` option is set to `true`, only defects (unrecoverable
 * errors) will be reported, while regular failures will be ignored.
 *
 * @category error handling
 * @since 4.0.0
 */
export const withErrorReporting: <
  Arg extends Effect<any, any, any> | { readonly defectsOnly?: boolean | undefined } | undefined = {
    readonly defectsOnly?: boolean | undefined
  }
>(
  effectOrOptions: Arg,
  options?: { readonly defectsOnly?: boolean | undefined } | undefined
) => [Arg] extends [Effect<infer A, infer E, infer R>] ? Effect<A, E, R>
  : <A, E, R>(self: Effect<A, E, R>) => Effect<A, E, R> = internal.withErrorReporting

// -----------------------------------------------------------------------------
// Fallback
// -----------------------------------------------------------------------------

/**
 * Recovers from a typed failure by producing a fallback success value.
 *
 * **Details**
 *
 * If the source effect succeeds, its value is preserved. If it fails in the
 * error channel, `orElseSucceed` evaluates the fallback with that error and
 * succeeds with the returned value, removing the typed error from the returned
 * effect.
 *
 * Defects and interruptions are not recovered by this operator.
 *
 * **Example** (Replacing failures with a value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit } from "effect"
 *
 * const validate = (age: number): Effect.Effect<number, string> => {
 *   if (age < 0) {
 *     return Effect.fail("NegativeAgeError")
 *   } else if (age < 18) {
 *     return Effect.fail("IllegalAgeError")
 *   } else {
 *     return Effect.succeed(age)
 *   }
 * }
 *
 * const program = Effect.orElseSucceed(validate(-1), (error) => error === "IllegalAgeError" ? 18 : 0)
 *
 * Effect.runSyncExit(program) // => Exit.succeed(0)
 * ```
 *
 * @category error handling
 * @since 2.0.0
 */
export const orElseSucceed: {
  <E, A2>(
    f: (error: NoInfer<E>) => A2
  ): <A, R>(self: Effect<A, E, R>) => Effect<A2 | A, never, R>
  <A, E, R, A2>(
    self: Effect<A, E, R>,
    f: (error: E) => A2
  ): Effect<A | A2, never, R>
} = internal.orElseSucceed

/**
 * Runs a sequence of effects and returns the result of the first successful
 * one.
 *
 * **When to use**
 *
 * Use when you have prioritized fallback `Effect`s, such as attempting
 * multiple APIs, reading configuration from several sources, or trying
 * alternative resource locations in order.
 *
 * **Details**
 *
 * This function executes the provided effects in sequence, stopping at the
 * first success. If an effect succeeds, its result is returned immediately and
 * no further effects in the sequence are executed.
 *
 * If all effects fail, the returned effect fails with the error from the last
 * effect. If the collection is empty, the returned effect defects with an
 * `Error` whose message is `"Received an empty collection of effects"`.
 *
 * **Example** (Trying alternatives until one succeeds)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const primary = Effect.fail("primary unavailable")
 * const secondary = Effect.succeed("secondary result")
 * const tertiary = Effect.sync(() => {
 *   throw new Error("not evaluated")
 * })
 *
 * const program = Effect.firstSuccessOf([
 *   primary,
 *   secondary,
 *   tertiary
 * ])
 *
 * Effect.runSync(program) // => "secondary result"
 * ```
 *
 * @category error handling
 * @since 2.0.0
 */
export const firstSuccessOf: <Eff extends Effect<any, any, any>>(
  effects: Iterable<Eff>
) => Effect<Success<Eff>, Error<Eff>, Services<Eff>> = internal.firstSuccessOf

// -----------------------------------------------------------------------------
// Delays & timeouts
// -----------------------------------------------------------------------------

/**
 * Adds a time limit to an effect, triggering a timeout if the effect exceeds
 * the duration.
 *
 * **When to use**
 *
 * Use when you need a timeout of an `Effect` to be represented as a typed
 * failure.
 *
 * **Details**
 *
 * The `timeout` function allows you to specify a time limit for an
 * effect's execution. If the effect does not complete within the given time, a
 * `TimeoutError` is raised. This can be useful for controlling how long your
 * program waits for a task to finish, ensuring that it doesn't hang
 * indefinitely if the task takes too long.
 *
 * **Gotchas**
 *
 * If the timeout wins, the source effect is interrupted.
 *
 * **Example** (Failing when work takes too long)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const timedEffect = Effect.never.pipe(Effect.timeout(0))
 * const error = await Effect.runPromise(Effect.flip(timedEffect))
 * error._tag // => "TimeoutError"
 * ```
 *
 * @see {@link timeoutOption} for returning `Option.none` on timeout.
 * @see {@link timeoutOrElse} for a version that allows specifying both success and timeout handlers.
 *
 * @category delays & timeouts
 * @since 2.0.0
 */
export const timeout: {
  (
    duration: Duration.Input
  ): <A, E, R>(self: Effect<A, E, R>) => Effect<A, E | Cause.TimeoutError, R>
  <A, E, R>(
    self: Effect<A, E, R>,
    duration: Duration.Input
  ): Effect<A, E | Cause.TimeoutError, R>
} = internal.timeout

/**
 * Runs an effect with a time limit and represents only the timeout case as
 * `Option.none`.
 *
 * **When to use**
 *
 * Use when a timeout of an `Effect` should be handled as `Option.none`.
 *
 * **Details**
 *
 * If the source effect succeeds before the timeout, the returned effect
 * succeeds with `Option.some(value)`. If the timeout wins, the source effect is
 * interrupted and the returned effect succeeds with `Option.none`. If the
 * source effect fails before the timeout, that failure is preserved.
 *
 * **Example** (Returning None on timeout)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option } from "effect"
 *
 * const timedOutEffect = Effect.never.pipe(Effect.timeoutOption(0))
 * await Effect.runPromise(timedOutEffect) // => Option.none()
 * ```
 *
 * @see {@link timeout} for a version that raises a `TimeoutError`.
 * @see {@link timeoutOrElse} for a version that allows specifying both success and timeout handlers.
 *
 * @category delays & timeouts
 * @since 3.1.0
 */
export const timeoutOption: {
  (
    duration: Duration.Input
  ): <A, E, R>(self: Effect<A, E, R>) => Effect<Option<A>, E, R>
  <A, E, R>(
    self: Effect<A, E, R>,
    duration: Duration.Input
  ): Effect<Option<A>, E, R>
} = internal.timeoutOption

/**
 * Applies a timeout to an effect, lazily evaluating `orElse` after interrupting
 * the source if the timeout is reached.
 *
 * **Example** (Falling back on timeout)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.timeoutOrElse(Effect.never, {
 *   duration: 0,
 *   orElse: () => Effect.sync(() => { output.push("Query timed out, using cached data") }).pipe(
 *     Effect.as("Cached result")
 *   )
 * })
 *
 * void output.push(await Effect.runPromise(program))
 * output // => ["Query timed out, using cached data", "Cached result"]
 * ```
 *
 * @see {@link timeout} for failing with a `TimeoutError`.
 * @see {@link timeoutOption} for returning `Option.none` on timeout.
 *
 * @category delays & timeouts
 * @since 4.0.0
 */
export const timeoutOrElse: {
  <A2, E2, R2>(options: {
    readonly duration: Duration.Input
    readonly orElse: LazyArg<Effect<A2, E2, R2>>
  }): <A, E, R>(self: Effect<A, E, R>) => Effect<A | A2, E | E2, R | R2>
  <A, E, R, A2, E2, R2>(
    self: Effect<A, E, R>,
    options: {
      readonly duration: Duration.Input
      readonly orElse: LazyArg<Effect<A2, E2, R2>>
    }
  ): Effect<A | A2, E | E2, R | R2>
} = internal.timeoutOrElse

/**
 * Returns an effect that is delayed from this effect by the specified
 * `Duration`.
 *
 * **Example** (Delaying an effect)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.delay(Effect.sync(() => { output.push("Delayed message") }), 0)
 *
 * await Effect.runPromise(program)
 * output // => ["Delayed message"]
 * ```
 *
 * @category delays & timeouts
 * @since 2.0.0
 */
export const delay: {
  (
    duration: Duration.Input
  ): <A, E, R>(self: Effect<A, E, R>) => Effect<A, E, R>
  <A, E, R>(
    self: Effect<A, E, R>,
    duration: Duration.Input
  ): Effect<A, E, R>
} = internal.delay

/**
 * Returns an effect that suspends the current fiber for the specified duration
 * without blocking a JavaScript thread.
 *
 * **Example** (Pausing without blocking)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.gen(function*() {
 *   yield* Effect.sync(() => { output.push("Start") })
 *   yield* Effect.sleep(0)
 *   yield* Effect.sync(() => { output.push("End") })
 * })
 *
 * await Effect.runPromise(program)
 * output // => ["Start", "End"]
 * ```
 *
 * @category delays & timeouts
 * @since 2.0.0
 */
export const sleep: (duration: Duration.Input) => Effect<void> = internal.sleep

/**
 * Returns the runtime duration of an effect together with its result.
 *
 * **Details**
 *
 * The original success, failure, or interruption is preserved; only the success
 * value is paired with the duration.
 *
 * **Example** (Measuring execution time)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const [, value] = yield* Effect.timed(Effect.succeed("ok"))
 *   return value
 * })
 *
 * Effect.runSync(program) // => "ok"
 * ```
 *
 * @category delays & timeouts
 * @since 2.0.0
 */
export const timed: <A, E, R>(self: Effect<A, E, R>) => Effect<[duration: Duration.Duration, result: A], E, R> =
  internal.timed

// -----------------------------------------------------------------------------
// Racing
// -----------------------------------------------------------------------------

/**
 * Runs multiple effects concurrently and returns the first successful result.
 *
 * **When to use**
 *
 * Use when early failures should be ignored until a success occurs
 * or all effects fail.
 *
 * **Details**
 *
 * Early failures do not finish the race; `raceAll` keeps waiting until one
 * effect succeeds or every effect has failed. When one effect succeeds, the
 * remaining effects are interrupted. If every effect fails, the returned effect
 * fails with a cause containing the collected failure reasons.
 *
 * **Example** (Racing many effects)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const raced = Effect.raceAll([
 *   Effect.succeed("Fast"),
 *   Effect.never
 * ])
 * await Effect.runPromise(raced) // => "Fast"
 * ```
 *
 * @see {@link race} for a version that handles only two effects.
 * @category racing
 * @since 2.0.0
 */
export const raceAll: <Eff extends Effect<any, any, any>>(
  all: Iterable<Eff>,
  options?: {
    readonly onWinner?: (options: {
      readonly fiber: Fiber<any, any>
      readonly index: number
      readonly parentFiber: Fiber<any, any>
    }) => void
  }
) => Effect<Success<Eff>, Error<Eff>, Services<Eff>> = internal.raceAll

/**
 * Runs multiple effects concurrently and completes with the first effect to
 * finish, whether it succeeds or fails.
 *
 * **Details**
 *
 * After the first effect completes, all remaining effects are interrupted. Use
 * `raceAll` when early failures should be ignored until a success occurs or
 * all effects fail.
 *
 * **Example** (Taking the first settled result)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const raced = Effect.raceAllFirst([
 *   Effect.fail("First failed"),
 *   Effect.never
 * ])
 * await Effect.runPromise(Effect.flip(raced)) // => "First failed"
 * ```
 *
 * @category racing
 * @since 4.0.0
 */
export const raceAllFirst: <Eff extends Effect<any, any, any>>(
  all: Iterable<Eff>,
  options?: {
    readonly onWinner?: (options: {
      readonly fiber: Fiber<any, any>
      readonly index: number
      readonly parentFiber: Fiber<any, any>
    }) => void
  }
) => Effect<Success<Eff>, Error<Eff>, Services<Eff>> = internal.raceAllFirst

/**
 * Races two effects and returns the first successful result.
 *
 * **Details**
 *
 * If one effect succeeds, the other is interrupted and `onWinner` can observe the
 * winning fiber. If both fail, the race fails.
 *
 * **Example** (Racing two effects)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const fastFail = Effect.fail("fast-fail")
 * const slowSuccess = Effect.succeed("slow-success")
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Effect.race(fastFail, slowSuccess)
 *   yield* Effect.sync(() => { output.push(`winner: ${result}`) })
 * })
 *
 * await Effect.runPromise(program)
 * output // => ["winner: slow-success"]
 * ```
 *
 * @category racing
 * @since 2.0.0
 */
export const race: {
  <A2, E2, R2>(
    that: Effect<A2, E2, R2>,
    options?: {
      readonly onWinner?: (
        options: { readonly fiber: Fiber<any, any>; readonly index: number; readonly parentFiber: Fiber<any, any> }
      ) => void
    }
  ): <A, E, R>(self: Effect<A, E, R>) => Effect<A | A2, E | E2, R | R2>
  <A, E, R, A2, E2, R2>(
    self: Effect<A, E, R>,
    that: Effect<A2, E2, R2>,
    options?: {
      readonly onWinner?: (
        options: { readonly fiber: Fiber<any, any>; readonly index: number; readonly parentFiber: Fiber<any, any> }
      ) => void
    }
  ): Effect<A | A2, E | E2, R | R2>
} = internal.race

/**
 * Races two effects and returns the result of the first one to complete, whether
 * it succeeds or fails.
 *
 * **When to use**
 *
 * Use when any completion, including failure, should decide the race and
 * interrupt the losing effect.
 *
 * **Details**
 *
 * The losing effect is interrupted, and `onWinner` can observe the winning fiber.
 *
 * **Example** (Observing the winning fiber)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const fastFail = Effect.fail("fast-fail")
 * const slowSuccess = Effect.never
 *
 * const program = Effect.gen(function*() {
 *   const message = yield* Effect.match(Effect.raceFirst(fastFail, slowSuccess), {
 *     onFailure: (error) => `failed: ${error}`,
 *     onSuccess: (value) => `succeeded: ${value}`
 *   })
 *   yield* Effect.sync(() => { output.push(message) })
 * })
 *
 * await Effect.runPromise(program)
 * output // => ["failed: fast-fail"]
 * ```
 *
 * @category racing
 * @since 2.0.0
 */
export const raceFirst: {
  <A2, E2, R2>(
    that: Effect<A2, E2, R2>,
    options?: {
      readonly onWinner?: (
        options: { readonly fiber: Fiber<any, any>; readonly index: number; readonly parentFiber: Fiber<any, any> }
      ) => void
    }
  ): <A, E, R>(self: Effect<A, E, R>) => Effect<A | A2, E | E2, R | R2>
  <A, E, R, A2, E2, R2>(
    self: Effect<A, E, R>,
    that: Effect<A2, E2, R2>,
    options?: {
      readonly onWinner?: (
        options: { readonly fiber: Fiber<any, any>; readonly index: number; readonly parentFiber: Fiber<any, any> }
      ) => void
    }
  ): Effect<A | A2, E | E2, R | R2>
} = internal.raceFirst

// -----------------------------------------------------------------------------
// Filtering
// -----------------------------------------------------------------------------

/**
 * Filters elements of an iterable using a predicate, refinement, or effectful
 * predicate.
 *
 * **Example** (Filtering success values)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * // Sync predicate
 * const evens = Effect.filter([1, 2, 3, 4], (n) => n % 2 === 0)
 *
 * // Effectful predicate
 * const checked = Effect.filter([1, 2, 3], (n) => Effect.succeed(n > 1))
 *
 * void output.push(Effect.runSync(evens))
 * void output.push(Effect.runSync(checked))
 * output // => [[2, 4], [2, 3]]
 * ```
 *
 * @category collecting
 * @since 2.0.0
 */
export const filter: {
  <A, B extends A>(
    refinement: Predicate.Refinement<NoInfer<A>, B>
  ): (elements: Iterable<A>) => Effect<Array<B>>
  <A>(
    predicate: Predicate.Predicate<NoInfer<A>>
  ): (elements: Iterable<A>) => Effect<Array<A>>
  <A, E, R>(
    predicate: (a: NoInfer<A>, i: number) => Effect<boolean, E, R>,
    options?: { readonly concurrency?: Concurrency | undefined }
  ): (iterable: Iterable<A>) => Effect<Array<A>, E, R>
  <A, B extends A>(
    elements: Iterable<A>,
    refinement: Predicate.Refinement<A, B>
  ): Effect<Array<B>>
  <A>(
    elements: Iterable<A>,
    predicate: Predicate.Predicate<A>
  ): Effect<Array<A>>
  <A, E, R>(
    iterable: Iterable<A>,
    predicate: (a: NoInfer<A>, i: number) => Effect<boolean, E, R>,
    options?: { readonly concurrency?: Concurrency | undefined }
  ): Effect<Array<A>, E, R>
} = internal.filter

/**
 * Filters and maps elements of an iterable with a `Filter`.
 *
 * **When to use**
 *
 * Use when you need to filter an iterable with a `Filter` inside an `Effect`,
 * collecting each filter success value.
 *
 * **Details**
 *
 * `Result.succeed` values are collected in the returned array, and
 * `Result.fail` values are skipped.
 *
 * @see {@link filter} for keeping original elements with a boolean predicate, refinement, or effectful predicate
 * @see {@link filterMapEffect} for using an effectful `Filter`
 *
 * @category collecting
 * @since 2.0.0
 */
export const filterMap: {
  <A, B, X>(
    filter: Filter.Filter<NoInfer<A>, B, X>
  ): (elements: Iterable<A>) => Effect<Array<B>>
  <A, B, X>(
    elements: Iterable<A>,
    filter: Filter.Filter<NoInfer<A>, B, X>
  ): Effect<Array<B>>
} = internal.filterMap

/**
 * Filters and maps elements of an iterable effectfully with a `FilterEffect`.
 *
 * **When to use**
 *
 * Use when you need to filter each iterable element effectfully and transform
 * accepted elements into successful output values.
 *
 * **Details**
 *
 * `Result.succeed` values are collected in the returned array, and
 * `Result.fail` values are skipped.
 *
 * **Gotchas**
 *
 * With concurrent execution, successful values are collected in completion
 * order, not input order.
 *
 * @see {@link filterMap} for using a synchronous `Filter`
 * @see {@link filter} for keeping original elements with a predicate
 *
 * @category collecting
 * @since 4.0.0
 */
export const filterMapEffect: {
  <A, B, X, E, R>(
    filter: Filter.FilterEffect<NoInfer<A>, B, X, E, R>,
    options?: { readonly concurrency?: Concurrency | undefined }
  ): (elements: Iterable<A>) => Effect<Array<B>, E, R>
  <A, B, X, E, R>(
    elements: Iterable<A>,
    filter: Filter.FilterEffect<NoInfer<A>, B, X, E, R>,
    options?: { readonly concurrency?: Concurrency | undefined }
  ): Effect<Array<B>, E, R>
} = internal.filterMapEffect

/**
 * Filters an effect, providing an alternative effect if the predicate fails.
 *
 * **When to use**
 *
 * Use when a successful value that fails a predicate should continue with an
 * effectful fallback instead of failing the effect.
 *
 * **Details**
 *
 * This function applies a predicate to the result of an effect. If the
 * predicate evaluates to `false`, it executes the `orElse` effect instead. The
 * `orElse` effect can produce an alternative value or perform additional
 * computations.
 *
 * **Example** (Filtering with a fallback effect)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * // An effect that produces a number
 * const program = Effect.succeed(5)
 *
 * // Filter for even numbers, provide alternative for odd numbers
 * const filtered = Effect.filterOrElse(
 *   program,
 *   (n) => n % 2 === 0,
 *   (n) => Effect.succeed(`Number ${n} is odd`)
 * )
 *
 * Effect.runSync(filtered) // => "Number 5 is odd"
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const filterOrElse: {
  <A, C, E2, R2, B extends A>(
    refinement: Predicate.Refinement<NoInfer<A>, B>,
    orElse: (a: EqualsWith<A, B, NoInfer<A>, Exclude<NoInfer<A>, B>>) => Effect<C, E2, R2>
  ): <E, R>(self: Effect<A, E, R>) => Effect<B | C, E2 | E, R2 | R>
  <A, C, E2, R2>(
    predicate: Predicate.Predicate<NoInfer<A>>,
    orElse: (a: NoInfer<A>) => Effect<C, E2, R2>
  ): <E, R>(self: Effect<A, E, R>) => Effect<A | C, E2 | E, R2 | R>
  <A, E, R, C, E2, R2, B extends A>(
    self: Effect<A, E, R>,
    refinement: Predicate.Refinement<A, B>,
    orElse: (a: EqualsWith<A, B, A, Exclude<A, B>>) => Effect<C, E2, R2>
  ): Effect<B | C, E | E2, R | R2>
  <A, E, R, C, E2, R2>(
    self: Effect<A, E, R>,
    predicate: Predicate.Predicate<NoInfer<A>>,
    orElse: (a: NoInfer<A>) => Effect<C, E2, R2>
  ): Effect<A | C, E | E2, R | R2>
} = internal.filterOrElse

/**
 * Filters an effect with a `Filter`, providing an alternative effect on failure.
 *
 * **When to use**
 *
 * Use when a successful effect value should be accepted and transformed by a
 * `Filter`, while rejected values should continue with an alternative effect
 * built from the filter failure.
 *
 * **Details**
 *
 * `Result.succeed` becomes the returned success value, and `Result.fail` is
 * passed to `orElse`.
 *
 * @see {@link filterOrElse} for using a predicate and fallback effect
 * @see {@link filterMapOrFail} for failing the effect when the filter fails
 *
 * @category filtering
 * @since 4.0.0
 */
export const filterMapOrElse: {
  <A, B, X, C, E2, R2>(
    filter: Filter.Filter<NoInfer<A>, B, X>,
    orElse: (x: X) => Effect<C, E2, R2>
  ): <E, R>(self: Effect<A, E, R>) => Effect<B | C, E2 | E, R2 | R>
  <A, E, R, B, X, C, E2, R2>(
    self: Effect<A, E, R>,
    filter: Filter.Filter<NoInfer<A>, B, X>,
    orElse: (x: X) => Effect<C, E2, R2>
  ): Effect<B | C, E | E2, R | R2>
} = internal.filterMapOrElse

/**
 * Filters an effect, failing with a custom error if the predicate fails.
 *
 * **Details**
 *
 * This function applies a predicate to the result of an effect. If the
 * predicate evaluates to `false`, the effect fails with either a custom
 * error (if `orFailWith` is provided) or a `NoSuchElementError`.
 *
 * **Example** (Filtering with a custom failure)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * // An effect that produces a number
 * const program = Effect.succeed(5)
 *
 * // Filter for even numbers, fail for odd numbers
 * const filtered = Effect.filterOrFail(
 *   program,
 *   (n) => n % 2 === 0,
 *   (n) => `Expected even number, got ${n}`
 * )
 *
 * Effect.runSync(Effect.flip(filtered)) // => "Expected even number, got 5"
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const filterOrFail: {
  <A, E2, B extends A>(
    refinement: Predicate.Refinement<NoInfer<A>, B>,
    orFailWith: (a: NoInfer<A>) => E2
  ): <E, R>(self: Effect<A, E, R>) => Effect<B, E2 | E, R>
  <A, E2>(
    predicate: Predicate.Predicate<NoInfer<A>>,
    orFailWith: (a: NoInfer<A>) => E2
  ): <E, R>(self: Effect<A, E, R>) => Effect<A, E2 | E, R>
  <A, B extends A>(
    refinement: Predicate.Refinement<NoInfer<A>, B>
  ): <E, R>(self: Effect<A, E, R>) => Effect<B, Cause.NoSuchElementError | E, R>
  <A>(
    predicate: Predicate.Predicate<NoInfer<A>>
  ): <E, R>(self: Effect<A, E, R>) => Effect<A, Cause.NoSuchElementError | E, R>
  <A, E, R, E2, B extends A>(
    self: Effect<A, E, R>,
    refinement: Predicate.Refinement<NoInfer<A>, B>,
    orFailWith: (a: NoInfer<A>) => E2
  ): Effect<B, E2 | E, R>
  <A, E, R, E2>(
    self: Effect<A, E, R>,
    predicate: Predicate.Predicate<NoInfer<A>>,
    orFailWith: (a: NoInfer<A>) => E2
  ): Effect<A, E2 | E, R>
  <A, E, R, B extends A>(
    self: Effect<A, E, R>,
    refinement: Predicate.Refinement<NoInfer<A>, B>
  ): Effect<B, E | Cause.NoSuchElementError, R>
  <A, E, R>(
    self: Effect<A, E, R>,
    predicate: Predicate.Predicate<NoInfer<A>>
  ): Effect<A, E | Cause.NoSuchElementError, R>
} = internal.filterOrFail

/**
 * Filters and maps an effect with a `Filter`, failing when the filter fails.
 *
 * **When to use**
 *
 * Use when validating and transforming one effect success with a synchronous
 * `Filter`, while rejected values should fail the effect.
 *
 * **Details**
 *
 * `Result.succeed` becomes the returned success value. `Result.fail` is mapped
 * with `orFailWith` when provided, or fails with `NoSuchElementError`.
 *
 * @see {@link filterMapOrElse} for continuing with a fallback effect when the filter fails
 * @see {@link filterOrFail} for validating with a predicate instead of a `Filter`
 * @see {@link filterMap} for filtering and mapping iterable elements
 *
 * @category filtering
 * @since 4.0.0
 */
export const filterMapOrFail: {
  <A, B, X, E2>(
    filter: Filter.Filter<NoInfer<A>, B, X>,
    orFailWith: (x: X) => E2
  ): <E, R>(self: Effect<A, E, R>) => Effect<B, E2 | E, R>
  <A, B, X>(
    filter: Filter.Filter<NoInfer<A>, B, X>
  ): <E, R>(self: Effect<A, E, R>) => Effect<B, Cause.NoSuchElementError | E, R>
  <A, E, R, B, X, E2>(
    self: Effect<A, E, R>,
    filter: Filter.Filter<A, B, X>,
    orFailWith: (x: X) => E2
  ): Effect<B, E2 | E, R>
  <A, E, R, B, X>(
    self: Effect<A, E, R>,
    filter: Filter.Filter<A, B, X>
  ): Effect<B, Cause.NoSuchElementError | E, R>
} = internal.filterMapOrFail

// -----------------------------------------------------------------------------
// Conditional Operators
// -----------------------------------------------------------------------------

/**
 * Runs an effect conditionally based on the result of an effectful boolean
 * condition.
 *
 * **When to use**
 *
 * Use when you need an effectful check to decide whether another effect should
 * run while representing the skipped case explicitly.
 *
 * **Details**
 *
 * The condition effect is evaluated first. If it succeeds with `true`, the
 * source effect is run and its success value is wrapped in `Option.some`. If it
 * succeeds with `false`, the source effect is skipped and the result is
 * `Option.none`. If the condition effect fails, that failure is preserved.
 *
 * **Example** (Conditionally running an effect)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option } from "effect"
 * const output: Array<unknown> = []
 *
 * const shouldLog = true
 *
 * const program = Effect.when(
 *   Effect.sync(() => { output.push("Condition is true!") }),
 *   Effect.succeed(shouldLog)
 * )
 *
 * void output.push(Effect.runSync(program))
 * output // => ["Condition is true!", Option.some(undefined)]
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const when: {
  <E2 = never, R2 = never>(
    condition: Effect<boolean, E2, R2>
  ): <A, E, R>(self: Effect<A, E, R>) => Effect<Option<A>, E | E2, R | R2>
  <A, E, R, E2 = never, R2 = never>(
    self: Effect<A, E, R>,
    condition: Effect<boolean, E2, R2>
  ): Effect<Option<A>, E | E2, R | R2>
} = internal.when

// -----------------------------------------------------------------------------
// Pattern matching
// -----------------------------------------------------------------------------

/**
 * Handles both success and failure cases of an effect without performing side
 * effects.
 *
 * **When to use**
 *
 * Use when you need to fold an `Effect` into a value by handling success and
 * failure differently without triggering side effects.
 *
 * **Details**
 *
 * `match` lets you define custom handlers for both success and failure
 * scenarios. You provide separate functions to handle each case, allowing you
 * to process the result if the effect succeeds, or handle the error if the
 * effect fails.
 *
 * **Example** (Matching success and failure values)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect } from "effect"
 *
 * class ExampleError extends Data.TaggedError("ExampleError")<{ readonly message: string }> {}
 *
 * const success: Effect.Effect<number, ExampleError> = Effect.succeed(42)
 *
 * const program1 = Effect.match(success, {
 *   onFailure: (error) => `failure: ${error.message}`,
 *   onSuccess: (value) => `success: ${value}`
 * })
 *
 * // Run and log the result of the successful effect
 * Effect.runSync(program1) // => "success: 42"
 *
 * const failure: Effect.Effect<number, ExampleError> = Effect.fail(
 *   new ExampleError({ message: "Uh oh!" })
 * )
 *
 * const program2 = Effect.match(failure, {
 *   onFailure: (error) => `failure: ${error.message}`,
 *   onSuccess: (value) => `success: ${value}`
 * })
 *
 * // Run and log the result of the failed effect
 * Effect.runSync(program2) // => "failure: Uh oh!"
 * ```
 *
 * @see {@link matchEffect} if you need to perform side effects in the handlers.
 * @category pattern matching
 * @since 2.0.0
 */
export const match: {
  <E, A2, A, A3>(options: {
    readonly onFailure: (error: E) => A2
    readonly onSuccess: (value: A) => A3
  }): <R>(self: Effect<A, E, R>) => Effect<A2 | A3, never, R>
  <A, E, R, A2, A3>(
    self: Effect<A, E, R>,
    options: {
      readonly onFailure: (error: E) => A2
      readonly onSuccess: (value: A) => A3
    }
  ): Effect<A2 | A3, never, R>
} = internal.match

/**
 * Handles both success and failure cases of an effect without performing side
 * effects, with eager evaluation for resolved effects.
 *
 * **When to use**
 *
 * Use when you need to handle both success and failure cases of an
 * already-resolved `Effect` with optimized handling.
 *
 * **Details**
 *
 * `matchEager` works like `match` but provides better performance for resolved
 * effects (Success or Failure). When the effect is already resolved, it applies
 * the handlers immediately without fiber scheduling. For unresolved effects,
 * it falls back to the regular `match` behavior.
 *
 * **Example** (Pattern matching eagerly when possible)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Effect.matchEager(Effect.succeed(42), {
 *     onFailure: (error) => `Failed: ${error}`,
 *     onSuccess: (value) => `Success: ${value}`
 *   })
 *   void output.push(result)
 * })
 *
 * Effect.runSync(program)
 * output // => ["Success: 42"]
 * ```
 *
 * @see {@link match} for the non-eager version.
 * @see {@link matchEffect} if you need to perform side effects in the handlers.
 * @category pattern matching
 * @since 4.0.0
 */
export const matchEager: {
  <E, A2, A, A3>(options: {
    readonly onFailure: (error: E) => A2
    readonly onSuccess: (value: A) => A3
  }): <R>(self: Effect<A, E, R>) => Effect<A2 | A3, never, R>
  <A, E, R, A2, A3>(
    self: Effect<A, E, R>,
    options: {
      readonly onFailure: (error: E) => A2
      readonly onSuccess: (value: A) => A3
    }
  ): Effect<A2 | A3, never, R>
} = internal.matchEager

/**
 * Handles failures by matching the cause of failure.
 *
 * **When to use**
 *
 * Use when you need to fold an `Effect` while the failure handler inspects the
 * full `Cause`.
 *
 * **Details**
 *
 * The `matchCause` function allows you to handle failures with access to the
 * full cause of the failure within a fiber.
 *
 * **Example** (Matching on success or failure causes)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect } from "effect"
 *
 * const task = Effect.fail("Something went wrong")
 *
 * const program = Effect.matchCause(task, {
 *   onFailure: (cause) => `Failed: ${Cause.squash(cause)}`,
 *   onSuccess: (value) => `Success: ${value}`
 * })
 *
 * Effect.runSync(program) // => "Failed: Something went wrong"
 * ```
 *
 * @see {@link matchCauseEffect} if you need to perform side effects in the
 * handlers.
 * @see {@link match} if you don't need to handle the cause of the failure.
 * @category pattern matching
 * @since 2.0.0
 */
export const matchCause: {
  <E, A2, A, A3>(options: {
    readonly onFailure: (cause: Cause.Cause<E>) => A2
    readonly onSuccess: (a: A) => A3
  }): <R>(self: Effect<A, E, R>) => Effect<A2 | A3, never, R>
  <A, E, R, A2, A3>(
    self: Effect<A, E, R>,
    options: {
      readonly onFailure: (cause: Cause.Cause<E>) => A2
      readonly onSuccess: (a: A) => A3
    }
  ): Effect<A2 | A3, never, R>
} = internal.matchCause

/**
 * Handles failures by matching the cause of failure with eager evaluation.
 *
 * **When to use**
 *
 * Use when you expect an `Effect` to already be resolved and want to match the
 * `Cause` without regular effect pipeline overhead.
 *
 * **Details**
 *
 * `matchCauseEager` works like `matchCause` but provides better performance for resolved
 * effects by immediately applying the matching function instead of deferring it
 * through the effect pipeline.
 *
 * **Example** (Eagerly matching already completed effects)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const handleResult = Effect.matchCauseEager(Effect.succeed(42), {
 *   onSuccess: (value) => `Success: ${value}`,
 *   onFailure: (cause) => `Failed: ${cause}`
 * })
 * Effect.runSync(handleResult) // => "Success: 42"
 * ```
 *
 * @category pattern matching
 * @since 4.0.0
 */
export const matchCauseEager: {
  <E, A2, A, A3>(options: {
    readonly onFailure: (cause: Cause.Cause<E>) => A2
    readonly onSuccess: (value: A) => A3
  }): <R>(self: Effect<A, E, R>) => Effect<A2 | A3, never, R>
  <A, E, R, A2, A3>(
    self: Effect<A, E, R>,
    options: {
      readonly onFailure: (cause: Cause.Cause<E>) => A2
      readonly onSuccess: (value: A) => A3
    }
  ): Effect<A2 | A3, never, R>
} = internal.matchCauseEager

/**
 * Handles success or failure eagerly with effectful handlers when the effect is already resolved.
 *
 * **When to use**
 *
 * Use when you need effectful success and cause-aware failure handlers for
 * `Effect` inputs that may already be resolved.
 *
 * **Details**
 *
 * If the effect is an `Exit`, the matching handler runs immediately; otherwise it behaves like
 * {@link matchCauseEffect}.
 *
 * @see {@link matchCauseEffect} for the non-eager effectful variant
 * @see {@link matchCauseEager} for eager cause matching with pure handlers
 * @see {@link matchEffect} for effectful matching on typed failures instead of full causes
 *
 * @category pattern matching
 * @since 4.0.0
 */
export const matchCauseEffectEager: {
  <E, A2, E2, R2, A, A3, E3, R3>(
    options: {
      readonly onFailure: (cause: Cause.Cause<E>) => Effect<A2, E2, R2>
      readonly onSuccess: (a: A) => Effect<A3, E3, R3>
    }
  ): <R>(self: Effect<A, E, R>) => Effect<A2 | A3, E2 | E3, R2 | R3 | R>
  <A, E, R, A2, E2, R2, A3, E3, R3>(
    self: Effect<A, E, R>,
    options: {
      readonly onFailure: (cause: Cause.Cause<E>) => Effect<A2, E2, R2>
      readonly onSuccess: (a: A) => Effect<A3, E3, R3>
    }
  ): Effect<A2 | A3, E2 | E3, R2 | R3 | R>
} = internal.matchCauseEffectEager

/**
 * Handles failures with access to the cause and allows performing side effects.
 *
 * **When to use**
 *
 * Use when you need to fold an `Effect` with effectful success handlers and
 * `Cause`-aware failure handlers.
 *
 * **Details**
 *
 * The `matchCauseEffect` function works similarly to {@link matchCause}, but it
 * also allows you to perform additional side effects based on the failure
 * cause. This function provides access to the complete cause of the failure,
 * making it possible to differentiate between various failure types, and allows
 * you to respond accordingly while performing side effects (like logging or
 * other operations).
 *
 * **Example** (Effectfully matching on causes)
 *
 * ```ts import.meta.vitest
 * import { Cause, Data, Effect, Result } from "effect"
 * const output: Array<unknown> = []
 *
 * class TaskError extends Data.TaggedError("TaskError")<{ readonly message: string }> {}
 *
 * const task = Effect.fail(new TaskError({ message: "Task failed" }))
 *
 * const program = Effect.matchCauseEffect(task, {
 *   onFailure: (cause) =>
 *     Effect.gen(function*() {
 *       if (Cause.hasFails(cause)) {
 *         const error = Cause.findError(cause)
 *         if (Result.isSuccess(error)) {
 *           yield* Effect.sync(() => { output.push(`Handling error: ${error.success.message}`) })
 *         }
 *         return "recovered from error"
 *       } else {
 *         yield* Effect.sync(() => { output.push("Handling interruption or defect") })
 *         return "recovered from interruption/defect"
 *       }
 *     }),
 *   onSuccess: (value) =>
 *     Effect.gen(function*() {
 *       yield* Effect.sync(() => { output.push(`Success: ${value}`) })
 *       return `processed ${value}`
 *     })
 * })
 *
 * void output.push(Effect.runSync(program))
 * output // => ["Handling error: Task failed", "recovered from error"]
 * ```
 *
 * @see {@link matchCause} if you don't need side effects and only want to handle the result or failure.
 * @see {@link matchEffect} if you don't need to handle the cause of the failure.
 *
 * @category pattern matching
 * @since 2.0.0
 */
export const matchCauseEffect: {
  <E, A2, E2, R2, A, A3, E3, R3>(options: {
    readonly onFailure: (cause: Cause.Cause<E>) => Effect<A2, E2, R2>
    readonly onSuccess: (a: A) => Effect<A3, E3, R3>
  }): <R>(self: Effect<A, E, R>) => Effect<A2 | A3, E2 | E3, R2 | R3 | R>
  <A, E, R, A2, E2, R2, A3, E3, R3>(
    self: Effect<A, E, R>,
    options: {
      readonly onFailure: (cause: Cause.Cause<E>) => Effect<A2, E2, R2>
      readonly onSuccess: (a: A) => Effect<A3, E3, R3>
    }
  ): Effect<A2 | A3, E2 | E3, R2 | R3 | R>
} = internal.matchCauseEffect

/**
 * Handles both success and failure by running effectful handlers.
 *
 * **When to use**
 *
 * Use when you need to handle an `Effect`'s failure or success with handlers
 * that return effects.
 *
 * **Details**
 *
 * Use `matchEffect` when either branch needs to return an `Effect`, such as
 * performing logging, recovery, notification, or other effectful work. The
 * returned effect succeeds or fails according to the handler that is run.
 *
 * **Example** (Matching success and failure with effectful handlers)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect } from "effect"
 *
 * class ExampleError extends Data.TaggedError("ExampleError")<{ readonly message: string }> {}
 *
 * const success: Effect.Effect<number, ExampleError> = Effect.succeed(42)
 * const failure: Effect.Effect<number, ExampleError> = Effect.fail(
 *   new ExampleError({ message: "Uh oh!" })
 * )
 *
 * const program1 = Effect.matchEffect(success, {
 *   onFailure: (error) =>
 *     Effect.succeed(`failure: ${error.message}`),
 *   onSuccess: (value) =>
 *     Effect.succeed(`success: ${value}`)
 * })
 *
 * Effect.runSync(program1) // => "success: 42"
 *
 * const program2 = Effect.matchEffect(failure, {
 *   onFailure: (error) =>
 *     Effect.succeed(`failure: ${error.message}`),
 *   onSuccess: (value) =>
 *     Effect.succeed(`success: ${value}`)
 * })
 *
 * Effect.runSync(program2) // => "failure: Uh oh!"
 * ```
 *
 * @see {@link match} if you don't need side effects and only want to handle the
 * result or failure.
 * @category pattern matching
 * @since 2.0.0
 */
export const matchEffect: {
  <E, A2, E2, R2, A, A3, E3, R3>(options: {
    readonly onFailure: (e: E) => Effect<A2, E2, R2>
    readonly onSuccess: (a: A) => Effect<A3, E3, R3>
  }): <R>(self: Effect<A, E, R>) => Effect<A2 | A3, E2 | E3, R2 | R3 | R>
  <A, E, R, A2, E2, R2, A3, E3, R3>(
    self: Effect<A, E, R>,
    options: {
      readonly onFailure: (e: E) => Effect<A2, E2, R2>
      readonly onSuccess: (a: A) => Effect<A3, E3, R3>
    }
  ): Effect<A2 | A3, E2 | E3, R2 | R3 | R>
} = internal.matchEffect

// -----------------------------------------------------------------------------
// Condition checking
// -----------------------------------------------------------------------------

/**
 * Determines whether an effect fails.
 *
 * **Details**
 *
 * Defects are not converted; if the effect dies, the resulting effect dies too.
 *
 * **Example** (Checking whether an effect fails)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.gen(function*() {
 *   const failed = yield* Effect.isFailure(Effect.fail("Uh oh!"))
 *   yield* Effect.sync(() => { output.push(failed) })
 * })
 *
 * Effect.runSync(program)
 * output // => [true]
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const isFailure: <A, E, R>(self: Effect<A, E, R>) => Effect<boolean, never, R> = internal.isFailure

/**
 * Returns whether an effect completes successfully.
 *
 * **Details**
 *
 * Returns `false` for failures in the error channel, but defects still fail the
 * effect.
 *
 * **Example** (Checking whether an effect succeeds)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.gen(function*() {
 *   const ok = yield* Effect.isSuccess(Effect.succeed("done"))
 *   const failed = yield* Effect.isSuccess(Effect.fail("Uh oh"))
 *   yield* Effect.sync(() => { output.push(`ok: ${ok}`) })
 *   yield* Effect.sync(() => { output.push(`failed: ${failed}`) })
 * })
 *
 * Effect.runSync(program)
 * output // => ["ok: true", "failed: false"]
 * ```
 *
 * @category predicates
 * @since 2.0.0
 */
export const isSuccess: <A, E, R>(self: Effect<A, E, R>) => Effect<boolean, never, R> = internal.isSuccess

// -----------------------------------------------------------------------------
// Environment
// -----------------------------------------------------------------------------

/**
 * Returns the complete context.
 *
 * **When to use**
 *
 * Use to read the complete `Context` available to the current effect.
 *
 * **Details**
 *
 * This function allows you to access all services that are currently available
 * in the effect's environment. This can be useful for debugging, introspection,
 * or when you need to pass the entire context to another function.
 *
 * **Example** (Reading the full context)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Option } from "effect"
 * const output: Array<unknown> = []
 *
 * const Logger = Context.Service<{
 *   log: (msg: string) => void
 * }>("Logger")
 * const Database = Context.Service<{
 *   query: (sql: string) => string
 * }>("Database")
 *
 * const program = Effect.gen(function*() {
 *   const allServices = yield* Effect.context()
 *
 *   // Check if specific services are available
 *   const loggerOption = Context.getOption(allServices, Logger)
 *   const databaseOption = Context.getOption(allServices, Database)
 *
 *   yield* Effect.sync(() => { output.push(`Logger available: ${Option.isSome(loggerOption)}`) })
 *   yield* Effect.sync(() => { output.push(`Database available: ${Option.isSome(databaseOption)}`) })
 * })
 *
 * const context = Context.make(Logger, { log: () => {} })
 *   .pipe(Context.add(Database, { query: () => "result" }))
 *
 * const provided = Effect.provideContext(program, context)
 * Effect.runSync(provided)
 * output // => ["Logger available: true", "Database available: true"]
 * ```
 *
 * @see {@link contextWith} for deriving an effect from the complete context
 * @see {@link service} for reading one service from the context
 *
 * @category accessors
 * @since 2.0.0
 */
export const context: <R = never>() => Effect<Context.Context<R>, never, R> = internal.context

/**
 * Transforms the current context using the provided function.
 *
 * **When to use**
 *
 * Use to derive an effect from the complete `Context`.
 *
 * **Details**
 *
 * This function allows you to access the complete context and perform
 * computations based on all available services. This is useful when you need
 * to conditionally execute logic based on what services are available.
 *
 * **Example** (Deriving values from the context)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Option } from "effect"
 * const output: Array<unknown> = []
 *
 * const Logger = Context.Service<{
 *   log: (msg: string) => void
 * }>("Logger")
 * const Cache = Context.Service<{
 *   get: (key: string) => string | null
 * }>("Cache")
 *
 * const program = Effect.contextWith((services: Context.Context<Context.Service.Identifier<typeof Cache>>) => {
 *   const cacheOption = Context.getOption(services, Cache)
 *   const hasCache = Option.isSome(cacheOption)
 *
 *   if (hasCache) {
 *     return Effect.gen(function*() {
 *       const cache = yield* Effect.service(Cache)
 *       yield* Effect.sync(() => { output.push("Using cached data") })
 *       return cache.get("user:123") || "default"
 *     })
 *   } else {
 *     return Effect.gen(function*() {
 *       yield* Effect.sync(() => { output.push("No cache available, using fallback") })
 *       return "fallback data"
 *     })
 *   }
 * })
 *
 * const withCache = Effect.provideService(program, Cache, {
 *   get: () => "cached_value"
 * })
 * void output.push(Effect.runSync(withCache))
 * output // => ["Using cached data", "cached_value"]
 * ```
 *
 * @see {@link context} for reading the complete context as a value
 * @see {@link service} for reading one service from the context
 *
 * @category accessors
 * @since 2.0.0
 */
export const contextWith: <R, A, E, R2>(
  f: (context: Context.Context<R>) => Effect<A, E, R2>
) => Effect<A, E, R | R2> = internal.contextWith

/**
 * Provides dependencies to an effect using layers or a context. Use `options.local`
 * to build the layer every time; by default, layers are shared between provide
 * calls.
 *
 * **Example** (Providing dependencies with a layer)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Layer } from "effect"
 *
 * interface Database {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }
 *
 * const Database = Context.Service<Database>("Database")
 *
 * const DatabaseLayer = Layer.succeed(Database)({
 *   query: Effect.fn("Database.query")((sql: string) => Effect.succeed(`Result for: ${sql}`))
 * })
 *
 * const program = Effect.gen(function*() {
 *   const db = yield* Database
 *   return yield* db.query("SELECT * FROM users")
 * })
 *
 * const provided = Effect.provide(program, DatabaseLayer)
 *
 * await Effect.runPromise(provided) // => "Result for: SELECT * FROM users"
 * ```
 *
 * @category providing services
 * @since 2.0.0
 */
export const provide: {
  <const Layers extends [Layer.Any, ...Array<Layer.Any>]>(
    layers: Layers,
    options?: {
      readonly local?: boolean | undefined
    } | undefined
  ): <A, E, R>(
    self: Effect<A, E, R>
  ) => Effect<
    A,
    E | Layer.Error<Layers[number]>,
    Layer.Services<Layers[number]> | Exclude<R, Layer.Success<Layers[number]>>
  >
  <ROut, E2, RIn>(
    layer: Layer.Layer<ROut, E2, RIn>,
    options?: {
      readonly local?: boolean | undefined
    } | undefined
  ): <A, E, R>(
    self: Effect<A, E, R>
  ) => Effect<A, E | E2, RIn | Exclude<R, ROut>>
  <R2>(
    context: Context.Context<R2>
  ): <A, E, R>(self: Effect<A, E, R>) => Effect<A, E, Exclude<R, R2>>
  <A, E, R, const Layers extends [Layer.Any, ...Array<Layer.Any>]>(
    self: Effect<A, E, R>,
    layers: Layers,
    options?: {
      readonly local?: boolean | undefined
    } | undefined
  ): Effect<
    A,
    E | Layer.Error<Layers[number]>,
    Layer.Services<Layers[number]> | Exclude<R, Layer.Success<Layers[number]>>
  >
  <A, E, R, ROut, E2, RIn>(
    self: Effect<A, E, R>,
    layer: Layer.Layer<ROut, E2, RIn>,
    options?: {
      readonly local?: boolean | undefined
    } | undefined
  ): Effect<A, E | E2, RIn | Exclude<R, ROut>>
  <A, E, R, R2>(
    self: Effect<A, E, R>,
    context: Context.Context<R2>
  ): Effect<A, E, Exclude<R, R2>>
} = internalLayer.provide

/**
 * Provides a context to an effect, fulfilling its service requirements.
 *
 * **Details**
 *
 * This function provides multiple services at once by supplying a context
 * that contains all the required services. It removes the provided services
 * from the effect's requirements, making them available to the effect.
 *
 * **Example** (Providing a complete context)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * // Define service keys
 * const Logger = Context.Service<{
 *   log: (msg: string) => void
 * }>("Logger")
 * const Database = Context.Service<{
 *   query: (sql: string) => string
 * }>("Database")
 *
 * // Create a context with multiple services
 * const context = Context.make(Logger, { log: (message) => { output.push(message) } })
 *   .pipe(Context.add(Database, { query: () => "result" }))
 *
 * // An effect that requires both services
 * const program = Effect.gen(function*() {
 *   const logger = yield* Effect.service(Logger)
 *   const db = yield* Effect.service(Database)
 *   logger.log("Querying database")
 *   return db.query("SELECT * FROM users")
 * })
 *
 * const provided = Effect.provideContext(program, context)
 * void output.push(Effect.runSync(provided))
 * output // => ["Querying database", "result"]
 * ```
 *
 * @category providing services
 * @since 4.0.0
 */
export const provideContext: {
  <XR>(
    context: Context.Context<XR>
  ): <A, E, R>(self: Effect<A, E, R>) => Effect<A, E, Exclude<R, XR>>
  <A, E, R, XR>(
    self: Effect<A, E, R>,
    context: Context.Context<XR>
  ): Effect<A, E, Exclude<R, XR>>
} = internal.provideContext

/**
 * Runs an effect with the provided context as its complete environment.
 *
 * **When to use**
 *
 * Use when you already have a `Context` containing every service required by
 * the effect and want the wrapped effect to run with exactly that context.
 *
 * **Gotchas**
 *
 * `setContext` replaces the current context for the wrapped effect. Services
 * from an outer context are not inherited unless they are also present in the
 * context passed to `setContext`.
 *
 * **Example** (Running with a complete context)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect } from "effect"
 *
 * class Config extends Context.Service<Config, {
 *   readonly greeting: string
 * }>()("Config") {}
 *
 * const program = Effect.gen(function*() {
 *   const config = yield* Effect.service(Config)
 *   return `${config.greeting}, World!`
 * })
 *
 * const context = Context.make(Config, { greeting: "Hello" })
 *
 * const runnable = Effect.setContext(program, context)
 *
 * Effect.runSync(runnable) // => "Hello, World!"
 * ```
 *
 * @see {@link provideContext} for partially satisfying an effect's context requirements.
 * @see {@link updateContext} for deriving the required context from the current one.
 *
 * @category providing services
 * @since 4.0.0
 */
export const setContext: {
  <R>(context: Context.Context<R>): <A, E>(self: Effect<A, E, R>) => Effect<A, E>
  <A, E, R>(self: Effect<A, E, R>, context: Context.Context<R>): Effect<A, E>
} = internal.setContext

/**
 * Accesses a service from the context.
 *
 * **Example** (Accessing a required service)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect } from "effect"
 *
 * interface Database {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }
 *
 * const Database = Context.Service<Database>("Database")
 *
 * const program = Effect.gen(function*() {
 *   const db = yield* Effect.service(Database)
 *   return yield* db.query("SELECT * FROM users")
 * })
 *
 * const runnable = Effect.provideService(program, Database, {
 *   query: (sql) => Effect.succeed(`Result for: ${sql}`)
 * })
 * Effect.runSync(runnable) // => "Result for: SELECT * FROM users"
 * ```
 *
 * @category accessors
 * @since 4.0.0
 */
export const service: <I, S>(service: Context.Key<I, S>) => Effect<S, never, I> = internal.service

/**
 * Optionally accesses a service from the environment.
 *
 * **When to use**
 *
 * Use to read an optional dependency from the current context without making
 * that dependency part of the effect's required environment.
 *
 * **Details**
 *
 * This function attempts to access a service from the environment. If the
 * service is available, it returns `Some(service)`. If the service is not
 * available, it returns `None`. Unlike `service`, this function does not
 * require the service to be present in the environment.
 *
 * **Example** (Accessing an optional service)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Option } from "effect"
 * const output: Array<unknown> = []
 *
 * // Define a service key
 * const Logger = Context.Service<{
 *   log: (msg: string) => void
 * }>("Logger")
 *
 * // Use serviceOption to optionally access the logger
 * const program = Effect.gen(function*() {
 *   const maybeLogger = yield* Effect.serviceOption(Logger)
 *
 *   if (Option.isSome(maybeLogger)) {
 *     maybeLogger.value.log("Service is available")
 *   } else {
 *     void output.push("Service not available")
 *   }
 * })
 *
 * Effect.runSync(program)
 * output // => ["Service not available"]
 * ```
 *
 * @category accessors
 * @since 2.0.0
 */
export const serviceOption: <I, S>(key: Context.Key<I, S>) => Effect<Option<S>> = internal.serviceOption

/**
 * Provides part of the required context while leaving the rest unchanged.
 *
 * **Details**
 *
 * This function allows you to transform the context required by an effect,
 * providing part of the context and leaving the rest to be fulfilled later.
 *
 * **Example** (Updating the context before running)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect } from "effect"
 *
 * // Define services
 * const Logger = Context.Service<{
 *   log: (msg: string) => void
 * }>("Logger")
 * const Config = Context.Service<{
 *   name: string
 * }>("Config")
 *
 * const program = Effect.service(Config).pipe(
 *   Effect.map((config) => `Hello ${config.name}!`)
 * )
 *
 * // Transform services by providing Config while keeping Logger requirement
 * const configured = program.pipe(
 *   Effect.updateContext((context: Context.Context<Context.Service.Identifier<typeof Logger>>) =>
 *     Context.add(context, Config, { name: "World" })
 *   )
 * )
 *
 * // The effect now requires only Logger service
 * const result = Effect.provideService(configured, Logger, {
 *   log: () => {}
 * })
 * Effect.runSync(result) // => "Hello World!"
 * ```
 *
 * @category providing services
 * @since 4.0.0
 */
export const updateContext: {
  <R2, R>(
    f: (context: Context.Context<R2>) => Context.Context<NoInfer<R>>
  ): <A, E>(self: Effect<A, E, R>) => Effect<A, E, R2>
  <A, E, R, R2>(
    self: Effect<A, E, R>,
    f: (context: Context.Context<R2>) => Context.Context<NoInfer<R>>
  ): Effect<A, E, R2>
} = internal.updateContext

/**
 * Runs an effect with a service implementation transformed by the provided
 * function.
 *
 * **Details**
 *
 * The service must be available in the effect's context; `updateService`
 * replaces it for the wrapped effect with the value returned by the updater.
 *
 * **Example** (Replacing a service for one effect)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * // Define a counter service
 * const Counter = Context.Service<{ count: number }>("Counter")
 *
 * const program = Effect.gen(function*() {
 *   const updatedCounter = yield* Effect.service(Counter)
 *   yield* Effect.sync(() => { output.push(`Updated count: ${updatedCounter.count}`) })
 *   return updatedCounter.count
 * }).pipe(
 *   Effect.updateService(Counter, (counter) => ({ count: counter.count + 1 }))
 * )
 *
 * // Provide initial service and run
 * const result = Effect.provideService(program, Counter, { count: 0 })
 * void output.push(Effect.runSync(result))
 * output // => ["Updated count: 1", 1]
 * ```
 *
 * @category providing services
 * @since 2.0.0
 */
export const updateService: {
  <I, A>(
    service: Context.Key<I, A>,
    f: (value: A) => NoInfer<A>
  ): <XA, E, R>(self: Effect<XA, E, R>) => Effect<XA, E, R | I>
  <XA, E, R, I, A>(
    self: Effect<XA, E, R>,
    service: Context.Key<I, A>,
    f: (value: A) => NoInfer<A>
  ): Effect<XA, E, R | I>
} = internal.updateService

/**
 * Updates a service for the lifetime of the current scope and restores its
 * previous value when the scope closes.
 *
 * **When to use**
 *
 * Use when you need a setup effect to change a service for subsequent effects
 * in the same scope.
 *
 * **Details**
 *
 * The updater receives the currently visible service value. A
 * `Context.Service` remains in the requirements, while a `Context.Reference`
 * uses its default when no override is present and adds no service requirement.
 * The returned effect always requires `Scope`. The optional `reset` function
 * receives the original, updated, and current values when the scope closes,
 * allowing changes to be merged during restoration. It defaults to returning
 * the original value.
 *
 * **Example** (Updating a reference within a scope)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const CurrentNumber = Context.Reference<number>("CurrentNumber", {
 *   defaultValue: () => 1
 * })
 *
 * const program = Effect.gen(function*() {
 *   const before = yield* CurrentNumber
 *   const during = yield* Effect.scoped(
 *     Effect.gen(function*() {
 *       yield* Effect.updateServiceScoped(
 *         CurrentNumber,
 *         (value) => value + 1,
 *         {
 *           // Optional: when omitted, the original value is restored
 *           reset: (original, updated, current) =>
 *             Math.max(original, updated, current) + 1
 *         }
 *       )
 *       return yield* CurrentNumber
 *     })
 *   )
 *   const after = yield* CurrentNumber
 *
 *   void output.push([before, during, after])
 * })
 *
 * await Effect.runPromise(program)
 * output // => [[1, 2, 3]]
 * ```
 *
 * @see {@link updateService} for updating a service only within a wrapped effect
 *
 * @category providing services
 * @since 4.0.0
 */
export const updateServiceScoped: <I, A>(
  service: Context.Key<I, A>,
  f: (value: A) => NoInfer<A>,
  options?: {
    readonly reset?: ((original: A, updated: A, current: A) => A) | undefined
  } | undefined
) => Effect<void, never, I | Scope> = internal.updateServiceScoped

/**
 * Provides one concrete service implementation to an effect.
 *
 * **When to use**
 *
 * Use to satisfy one service requirement with an already-built implementation.
 *
 * **Details**
 *
 * The service requirement identified by the `Context.Key` is removed from the
 * effect requirements after the implementation is provided.
 *
 * **Example** (Providing a service value)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * // Define a service for configuration
 * const Config = Context.Service<{
 *   apiUrl: string
 *   timeout: number
 * }>("Config")
 *
 * const fetchData = Effect.gen(function*() {
 *   const config = yield* Effect.service(Config)
 *   yield* Effect.sync(() => { output.push(`Fetching from: ${config.apiUrl}`) })
 *   yield* Effect.sync(() => { output.push(`Timeout: ${config.timeout}ms`) })
 *   return "data"
 * })
 *
 * // Provide the service implementation
 * const program = Effect.provideService(fetchData, Config, {
 *   apiUrl: "https://api.example.com",
 *   timeout: 5000
 * })
 *
 * void output.push(Effect.runSync(program))
 * output // => ["Fetching from: https://api.example.com", "Timeout: 5000ms", "data"]
 * ```
 *
 * @see {@link provide} for providing multiple layers to an effect.
 * @see {@link provideServiceEffect} for acquiring the service implementation effectfully.
 * @see {@link provideContext} for providing a complete context.
 * @category providing services
 * @since 2.0.0
 */
export const provideService: {
  <I, S>(
    service: Context.Key<I, S>
  ): {
    (implementation: S): <A, E, R>(self: Effect<A, E, R>) => Effect<A, E, Exclude<R, I>>
    <A, E, R>(self: Effect<A, E, R>, implementation: S): Effect<A, E, Exclude<R, I>>
  }
  <I, S>(
    service: Context.Key<I, S>,
    implementation: S
  ): <A, E, R>(self: Effect<A, E, R>) => Effect<A, E, Exclude<R, I>>
  <A, E, R, I, S>(
    self: Effect<A, E, R>,
    service: Context.Key<I, S>,
    implementation: S
  ): Effect<A, E, Exclude<R, I>>
} = internal.provideService

/**
 * Provides one service to an effect using an effectful acquisition.
 *
 * **When to use**
 *
 * Use when the service implementation must be created by an effect and its
 * acquisition failure should remain in the returned effect.
 *
 * **Details**
 *
 * `provideServiceEffect` runs the acquisition effect to produce the service
 * implementation, removes that service from the wrapped effect's requirements,
 * and leaves any other requirements to be provided later. Acquisition failures
 * are included in the returned effect's error channel.
 *
 * **Example** (Providing a service with an effect)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * // Define a database connection service
 * interface DatabaseConnection {
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }
 * const Database = Context.Service<DatabaseConnection>("Database")
 *
 * // Effect that creates a database connection
 * const createConnection = Effect.gen(function*() {
 *   yield* Effect.sync(() => { output.push("Establishing database connection...") })
 *   yield* Effect.sync(() => { output.push("Database connected!") })
 *   return {
 *     query: (sql: string) => Effect.succeed(`Result for: ${sql}`)
 *   }
 * })
 *
 * const program = Effect.gen(function*() {
 *   const db = yield* Effect.service(Database)
 *   return yield* db.query("SELECT * FROM users")
 * })
 *
 * // Provide the service through an effect
 * const withDatabase = Effect.provideServiceEffect(
 *   program,
 *   Database,
 *   createConnection
 * )
 *
 * void output.push(await Effect.runPromise(withDatabase))
 * output // => ["Establishing database connection...", "Database connected!", "Result for: SELECT * FROM users"]
 * ```
 *
 * @category providing services
 * @since 2.0.0
 */
export const provideServiceEffect: {
  <I, S, E2, R2>(
    service: Context.Key<I, S>,
    acquire: Effect<NoInfer<S>, E2, R2>
  ): <A, E, R>(self: Effect<A, E, R>) => Effect<A, E | E2, Exclude<R, I> | R2>
  <A, E, R, I, S, E2, R2>(
    self: Effect<A, E, R>,
    service: Context.Key<I, S>,
    acquire: Effect<NoInfer<S>, E2, R2>
  ): Effect<A, E | E2, Exclude<R, I> | R2>
} = internal.provideServiceEffect

// -----------------------------------------------------------------------------
// Resource management & finalization
// -----------------------------------------------------------------------------

/**
 * Returns the current scope for resource management.
 *
 * **Example** (Accessing the current scope)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.gen(function*() {
 *   const currentScope = yield* Effect.scope
 *   yield* Effect.sync(() => { output.push("Got scope for resource management") })
 *
 *   // Use the scope to manually manage resources if needed
 *   const resource = yield* Effect.acquireRelease(
 *     Effect.sync(() => { output.push("Acquiring resource") }).pipe(Effect.as("resource")),
 *     () => Effect.sync(() => { output.push("Releasing resource") })
 *   )
 *
 *   return resource
 * })
 *
 * void output.push(Effect.runSync(Effect.scoped(program)))
 * output // => ["Got scope for resource management", "Acquiring resource", "Releasing resource", "resource"]
 * ```
 *
 * @category resource management
 * @since 2.0.0
 */
export const scope: Effect<Scope, never, Scope> = internal.scope

/**
 * Runs an effect with a scope that closes when the effect completes.
 *
 * **When to use**
 *
 * Use to acquire scoped resources for the duration of a single workflow.
 *
 * **Details**
 *
 * Finalizers for resources acquired inside the workflow run as soon as the
 * workflow completes, whether by success, failure, or interruption.
 *
 * **Example** (Running a scoped acquisition)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const resource = Effect.acquireRelease(
 *   Effect.sync(() => { output.push("Acquiring resource") }).pipe(Effect.as("resource")),
 *   () => Effect.sync(() => { output.push("Releasing resource") })
 * )
 *
 * const program = Effect.scoped(
 *   Effect.gen(function*() {
 *     const res = yield* resource
 *     yield* Effect.sync(() => { output.push(`Using ${res}`) })
 *     return res
 *   })
 * )
 *
 * Effect.runSync(program)
 * output // => ["Acquiring resource", "Using resource", "Releasing resource"]
 * ```
 *
 * @category resource management
 * @since 2.0.0
 */
export const scoped: <A, E, R>(
  self: Effect<A, E, R>
) => Effect<A, E, Exclude<R, Scope>> = internal.scoped

/**
 * Creates a scoped effect by providing access to the scope.
 *
 * **When to use**
 *
 * Use when resource acquisition needs direct access to the scope being created,
 * for example to register finalizers manually.
 *
 * **Example** (Working with an explicit scope)
 *
 * ```ts import.meta.vitest
 * import { Effect, Scope } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.scopedWith((scope) =>
 *   Effect.gen(function*() {
 *     yield* Effect.sync(() => { output.push("Inside scoped context") })
 *
 *     // Manually add a finalizer to the scope
 *     yield* Scope.addFinalizer(scope, Effect.sync(() => { output.push("Manual finalizer") }))
 *
 *     // Create a scoped resource
 *     const resource = yield* Effect.scoped(
 *       Effect.acquireRelease(
 *         Effect.sync(() => { output.push("Acquiring resource") }).pipe(Effect.as("resource")),
 *         () => Effect.sync(() => { output.push("Releasing resource") })
 *       )
 *     )
 *
 *     return resource
 *   })
 * )
 *
 * void output.push(Effect.runSync(program))
 * output // => ["Inside scoped context", "Acquiring resource", "Releasing resource", "Manual finalizer", "resource"]
 * ```
 *
 * @category resource management
 * @since 3.11.0
 */
export const scopedWith: <A, E, R>(
  f: (scope: Scope) => Effect<A, E, R>
) => Effect<A, E, R> = internal.scopedWith

/**
 * Constructs a scoped resource from an acquisition effect and a release
 * finalizer.
 *
 * **When to use**
 *
 * Use to acquire a scoped resource with an explicit release finalizer.
 *
 * **Details**
 *
 * If acquisition succeeds, the release finalizer is added to the current scope
 * and is guaranteed to run when that scope closes. The finalizer receives the
 * `Exit` value used to close the scope.
 *
 * By default, acquisition is protected by an uninterruptible region. Pass
 * `{ interruptible: true }` to allow the acquisition effect to be interrupted.
 *
 * **Example** (Acquiring and releasing a resource)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit } from "effect"
 * const output: Array<unknown> = []
 *
 * // Simulate a resource that needs cleanup
 * interface FileHandle {
 *   readonly path: string
 *   readonly content: string
 * }
 *
 * // Acquire a file handle
 * const acquire = Effect.gen(function*() {
 *   yield* Effect.sync(() => { output.push("Opening file") })
 *   return { path: "/tmp/file.txt", content: "file content" }
 * })
 *
 * // Release the file handle
 * const release = (handle: FileHandle, exit: Exit.Exit<unknown, unknown>) =>
 *   Effect.sync(() => { output.push(
 *     `Closing file ${handle.path} with exit: ${
 *       Exit.isSuccess(exit) ? "success" : "failure"
 *     }`
 *   ) })
 *
 * // Create a scoped resource
 * const resource = Effect.acquireRelease(acquire, release)
 *
 * // Use the resource within a scope
 * const program = Effect.scoped(
 *   Effect.gen(function*() {
 *     const handle = yield* resource
 *     yield* Effect.sync(() => { output.push(`Using file: ${handle.path}`) })
 *     return handle.content
 *   })
 * )
 *
 * void output.push(Effect.runSync(program))
 * output // => ["Opening file", "Using file: /tmp/file.txt", "Closing file /tmp/file.txt with exit: success", "file content"]
 * ```
 *
 * @see {@link acquireDisposable} for resources that implement JavaScript disposal protocols
 * @see {@link acquireUseRelease} for bracketing acquire, use, and release in one effect
 *
 * @category resource management
 * @since 2.0.0
 */
export const acquireRelease: <A, E, R, R2>(
  acquire: Effect<A, E, R>,
  release: (a: A, exit: Exit.Exit<unknown, unknown>) => Effect<unknown, never, R2>,
  options?: { readonly interruptible?: boolean }
) => Effect<A, E, R | R2 | Scope> = internal.acquireRelease

/**
 * Acquires a scoped resource that implements JavaScript disposal protocols.
 *
 * **When to use**
 *
 * Use when you work with JavaScript `Disposable` or `AsyncDisposable` resources
 * that should be closed with the surrounding scope.
 *
 * **Details**
 *
 * The resource is automatically disposed when the surrounding
 * {@link Scope} is closed, using {@link Symbol.dispose} for
 * synchronous disposables or {@link Symbol.asyncDispose} for asynchronous
 * disposables.
 *
 * This is similar to {@link acquireRelease}, but uses the standard
 * JavaScript disposal protocol instead of requiring an explicit release
 * function. It works with JavaScript `Disposable` and `AsyncDisposable`
 * resources.
 *
 * **Example** (Acquiring a disposable resource)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * class Resource implements Disposable {
 *   [Symbol.dispose]() {
 *     void output.push("disposed")
 *   }
 * }
 *
 * const program = Effect.scoped(
 *   Effect.gen(function*() {
 *     yield* Effect.acquireDisposable(Effect.succeed(new Resource()))
 *     void output.push("acquired")
 *   })
 * )
 *
 * Effect.runSync(program)
 * output // => ["acquired", "disposed"]
 * ```
 *
 * @see {@link acquireRelease} for resources that need an explicit finalizer
 *
 * @category resource management
 * @since 4.0.0
 */
export const acquireDisposable: <A extends AsyncDisposable | Disposable, E, R>(
  acquire: Effect<A, E, R>
) => Effect<A, E, R | Scope> = internal.acquireDisposable

/**
 * Runs resource acquisition, usage, and release as one bracketed effect.
 *
 * **When to use**
 *
 * Use to bracket acquire, use, and release logic in one effect.
 *
 * **Details**
 *
 * `acquireUseRelease` does the following:
 *
 *   1. Ensures that the `Effect` value that acquires the resource will not be
 *      interrupted. Note that acquisition may still fail due to internal
 *      reasons (such as an uncaught exception).
 *   2. Ensures that the `release` `Effect` value will not be interrupted,
 *      and will be executed as long as the acquisition `Effect` value
 *      successfully acquires the resource.
 *
 * During the time period between the acquisition and release of the resource,
 * the `use` `Effect` value will be executed.
 *
 * If the `release` `Effect` value fails, then the entire `Effect` value will
 * fail, even if the `use` `Effect` value succeeds. If this fail-fast behavior
 * is not desired, errors produced by the `release` `Effect` value can be caught
 * and ignored.
 *
 * **Example** (Acquiring resources with cleanup)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit } from "effect"
 * const output: Array<unknown> = []
 *
 * interface Database {
 *   readonly connection: string
 *   readonly query: (sql: string) => Effect.Effect<string>
 * }
 *
 * const program = Effect.acquireUseRelease(
 *   // Acquire - connect to database
 *   Effect.gen(function*() {
 *     yield* Effect.sync(() => { output.push("Connecting to database...") })
 *     return {
 *       connection: "db://localhost:5432",
 *       query: (sql: string) => Effect.succeed(`Result for: ${sql}`)
 *     }
 *   }),
 *   // Use - perform database operations
 *   (db) =>
 *     Effect.gen(function*() {
 *       yield* Effect.sync(() => { output.push(`Connected to ${db.connection}`) })
 *       const result = yield* db.query("SELECT * FROM users")
 *       yield* Effect.sync(() => { output.push(`Query result: ${result}`) })
 *       return result
 *     }),
 *   // Release - close database connection
 *   (db, exit) =>
 *     Effect.gen(function*() {
 *       if (Exit.isSuccess(exit)) {
 *         yield* Effect.sync(() => { output.push(`Closing connection to ${db.connection} (success)`) })
 *       } else {
 *         yield* Effect.sync(() => { output.push(`Closing connection to ${db.connection} (failure)`) })
 *       }
 *     })
 * )
 *
 * await Effect.runPromise(program)
 * output // => ["Connecting to database...", "Connected to db://localhost:5432", "Query result: Result for: SELECT * FROM users", "Closing connection to db://localhost:5432 (success)"]
 * ```
 *
 * @see {@link acquireRelease} for scoped resources whose use happens later
 *
 * @category resource management
 * @since 2.0.0
 */
export const acquireUseRelease: <Resource, E, R, A, E2, R2, E3, R3>(
  acquire: Effect<Resource, E, R>,
  use: (a: Resource) => Effect<A, E2, R2>,
  release: (a: Resource, exit: Exit.Exit<A, E2>) => Effect<void, E3, R3>
) => Effect<A, E | E2 | E3, R | R2 | R3> = internal.acquireUseRelease

/**
 * Adds a finalizer to the current scope.
 *
 * **When to use**
 *
 * Use to register low-level cleanup in the current scope.
 *
 * **Details**
 *
 * The finalizer runs when the surrounding scope is closed and receives the
 * `Exit` value used to close the scope.
 *
 * **Example** (Registering scope finalizers)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.scoped(
 *   Effect.gen(function*() {
 *     // Add a finalizer that runs when the scope closes
 *     yield* Effect.addFinalizer((exit) =>
 *       Effect.sync(() => { output.push(
 *         Exit.isSuccess(exit)
 *           ? "Cleanup: Operation completed successfully"
 *           : "Cleanup: Operation failed, cleaning up resources"
 *       ) })
 *     )
 *
 *     yield* Effect.sync(() => { output.push("Performing main operation...") })
 *
 *     // This could succeed or fail
 *     return "operation result"
 *   })
 * )
 *
 * void output.push(Effect.runSync(program))
 * output // => ["Performing main operation...", "Cleanup: Operation completed successfully", "operation result"]
 * ```
 *
 * @see {@link acquireRelease} for resource acquisition with a release finalizer
 * @see {@link ensuring} for attaching a finalizer to one effect
 *
 * @category resource management
 * @since 2.0.0
 */
export const addFinalizer: <R>(
  finalizer: (exit: Exit.Exit<unknown, unknown>) => Effect<void, never, R>
) => Effect<void, never, R | Scope> = internal.addFinalizer

/**
 * Returns an effect that, if this effect _starts_ execution, then the
 * specified `finalizer` is guaranteed to be executed, whether this effect
 * succeeds, fails, or is interrupted.
 *
 * **Details**
 *
 * For use cases that need access to the effect's result, see `onExit`.
 *
 * Finalizers offer very powerful guarantees, but they are low-level, and
 * should generally not be used for releasing resources. For higher-level
 * logic built on `ensuring`, see the `acquireRelease` family of methods.
 *
 * **Example** (Always running cleanup)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const task = Effect.gen(function*() {
 *   yield* Effect.sync(() => { output.push("Task started") })
 *   yield* Effect.sync(() => { output.push("Task completed") })
 *   return 42
 * })
 *
 * // Ensure cleanup always runs, regardless of success or failure
 * const program = Effect.ensuring(
 *   task,
 *   Effect.sync(() => { output.push("Cleanup: This always runs!") })
 * )
 *
 * void output.push(Effect.runSync(program))
 * output // => ["Task started", "Task completed", "Cleanup: This always runs!", 42]
 * ```
 *
 * @category resource management
 * @since 2.0.0
 */
export const ensuring: {
  <X, R1>(
    finalizer: Effect<X, never, R1>
  ): <A, E, R>(self: Effect<A, E, R>) => Effect<A, E, R1 | R>
  <A, E, R, X, R1>(
    self: Effect<A, E, R>,
    finalizer: Effect<X, never, R1>
  ): Effect<A, E, R1 | R>
} = internal.ensuring

/**
 * Runs the specified effect if this effect fails, providing the error to the
 * effect if it exists. The provided effect will not be interrupted.
 *
 * **Example** (Running cleanup on failure)
 *
 * ```ts import.meta.vitest
 * import { Cause, Data, Effect, Exit } from "effect"
 * const output: Array<unknown> = []
 *
 * class TaskError extends Data.TaggedError("TaskError")<{ readonly message: string }> {}
 *
 * const error = new TaskError({ message: "Something went wrong" })
 * const task = Effect.fail(error)
 *
 * const program = Effect.onError(
 *   task,
 *   (cause) => Effect.sync(() => { output.push(`Cleanup on error: ${Cause.squash(cause)}`) })
 * )
 *
 * void output.push(Effect.runSyncExit(program))
 * output // => ["Cleanup on error: TaskError: Something went wrong", Exit.fail(error)]
 * ```
 *
 * @category resource management
 * @since 2.0.0
 */
export const onError: {
  <E, X, R2>(
    cleanup: (cause: Cause.Cause<E>) => Effect<X, never, R2>
  ): <A, R>(self: Effect<A, E, R>) => Effect<A, E, R2 | R>
  <A, E, R, X, R2>(
    self: Effect<A, E, R>,
    cleanup: (cause: Cause.Cause<E>) => Effect<X, never, R2>
  ): Effect<A, E, R2 | R>
} = internal.onError

/**
 * Runs the finalizer only when this effect fails and the `Cause` matches the
 * provided predicate.
 *
 * **Example** (Running cleanup for selected failures)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect, Exit } from "effect"
 * const output: Array<unknown> = []
 *
 * const task = Effect.fail("boom")
 *
 * const program = Effect.onErrorIf(
 *   task,
 *   Cause.hasFails,
 *   (cause) =>
 *     Effect.gen(function*() {
 *       yield* Effect.sync(() => { output.push(`Cause: ${Cause.squash(cause)}`) })
 *     })
 * )
 *
 * void output.push(Effect.runSyncExit(program))
 * output // => ["Cause: boom", Exit.fail("boom")]
 * ```
 *
 * @category resource management
 * @since 4.0.0
 */
export const onErrorIf: {
  <E, XE, XR>(
    predicate: Predicate.Predicate<Cause.Cause<E>>,
    f: (cause: Cause.Cause<E>) => Effect<void, XE, XR>
  ): <A, R>(self: Effect<A, E, R>) => Effect<A, E | XE, R | XR>
  <A, E, R, XE, XR>(
    self: Effect<A, E, R>,
    predicate: Predicate.Predicate<Cause.Cause<E>>,
    f: (cause: Cause.Cause<E>) => Effect<void, XE, XR>
  ): Effect<A, E | XE, R | XR>
} = internal.onErrorIf

/**
 * Runs the finalizer only when this effect fails and the cause matches the provided `Filter`.
 *
 * **When to use**
 *
 * Use when cleanup or diagnostics should run only for failures whose full
 * `Cause` is accepted or transformed by a `Filter`, and the finalizer needs the
 * filter's pass value plus the original cause.
 *
 * @see {@link onError} for cleanup on every failure
 * @see {@link onErrorIf} for selecting failures with a boolean predicate
 * @see {@link onExitFilter} for selecting from every exit instead of only failures
 *
 * @category resource management
 * @since 4.0.0
 */
export const onErrorFilter: {
  <A, E, EB, X, XE, XR>(
    filter: Filter.Filter<Cause.Cause<E>, EB, X>,
    f: (failure: EB, cause: Cause.Cause<E>) => Effect<void, XE, XR>
  ): <R>(self: Effect<A, E, R>) => Effect<A, E | XE, R | XR>
  <A, E, R, EB, X, XE, XR>(
    self: Effect<A, E, R>,
    filter: Filter.Filter<Cause.Cause<E>, EB, X>,
    f: (failure: EB, cause: Cause.Cause<E>) => Effect<void, XE, XR>
  ): Effect<A, E | XE, R | XR>
} = internal.onErrorFilter

/**
 * Runs an optional finalizer with the effect's `Exit` value when the effect
 * completes.
 *
 * **When to use**
 *
 * Use when you are building a low-level `Effect` operator that must inspect the
 * source effect's `Exit`, may skip finalization by returning `undefined`, or
 * must choose whether finalization is forced into an uninterruptible region.
 *
 * **Details**
 *
 * This low-level operator preserves the source effect's result unless the
 * finalizer fails. If both the source effect and the finalizer fail, the two
 * causes are merged. Prefer `onExit` for normal cleanup logic.
 *
 * @see {@link onExit} for ordinary exit-aware cleanup whose finalizer always returns an effect
 *
 * @category resource management
 * @since 4.0.0
 */
export const onExitPrimitive: <A, E, R, XE = never, XR = never>(
  self: Effect<A, E, R>,
  f: (exit: Exit.Exit<A, E>) => Effect<void, XE, XR> | undefined,
  interruptible?: boolean
) => Effect<A, E | XE, R | XR> = internal.onExitPrimitive

/**
 * Ensures that a cleanup function runs whether this effect succeeds, fails, or
 * is interrupted.
 *
 * **Details**
 *
 * If both the effect and the cleanup function fail, the two causes are merged.
 *
 * **Example** (Observing every exit)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit } from "effect"
 * const output: Array<unknown> = []
 *
 * const task = Effect.succeed(42)
 *
 * const program = Effect.onExit(task, (exit) =>
 *   Effect.sync(() => { output.push(
 *     Exit.isSuccess(exit)
 *       ? `Task succeeded with: ${exit.value}`
 *       : `Task failed: ${Exit.isFailure(exit) ? exit.cause : "interrupted"}`
 *   ) }))
 *
 * void output.push(Effect.runSync(program))
 * output // => ["Task succeeded with: 42", 42]
 * ```
 *
 * @category resource management
 * @since 2.0.0
 */
export const onExit: {
  <A, E, XE = never, XR = never>(
    f: (exit: Exit.Exit<A, E>) => Effect<void, XE, XR>
  ): <R>(self: Effect<A, E, R>) => Effect<A, E | XE, R | XR>
  <A, E, R, XE = never, XR = never>(
    self: Effect<A, E, R>,
    f: (exit: Exit.Exit<A, E>) => Effect<void, XE, XR>
  ): Effect<A, E | XE, R | XR>
} = internal.onExit

/**
 * Runs the cleanup effect only when the `Exit` satisfies the provided
 * predicate.
 *
 * **Example** (Observing selected exits)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.onExitIf(
 *   Effect.succeed(42),
 *   Exit.isSuccess,
 *   (exit) =>
 *     Exit.isSuccess(exit)
 *       ? Effect.sync(() => { output.push(`Succeeded with: ${exit.value}`) })
 *       : Effect.void
 * )
 *
 * void output.push(Effect.runSync(program))
 * output // => ["Succeeded with: 42", 42]
 * ```
 *
 * @category resource management
 * @since 4.0.0
 */
export const onExitIf: {
  <A, E, XE, XR>(
    predicate: Predicate.Predicate<Exit.Exit<NoInfer<A>, NoInfer<E>>>,
    f: (exit: Exit.Exit<NoInfer<A>, NoInfer<E>>) => Effect<void, XE, XR>
  ): <R>(self: Effect<A, E, R>) => Effect<A, E | XE, R | XR>
  <A, E, R, XE, XR>(
    self: Effect<A, E, R>,
    predicate: Predicate.Predicate<Exit.Exit<NoInfer<A>, NoInfer<E>>>,
    f: (exit: Exit.Exit<NoInfer<A>, NoInfer<E>>) => Effect<void, XE, XR>
  ): Effect<A, E | XE, R | XR>
} = internal.onExitIf

/**
 * Runs the cleanup effect only when the `Exit` matches the provided `Filter`.
 *
 * **When to use**
 *
 * Use when cleanup should run only for `Exit` values selected by a `Filter`,
 * and the cleanup needs the extracted pass value together with the original
 * `Exit`.
 *
 * **Details**
 *
 * `Result.fail` skips cleanup, and `Result.succeed` runs cleanup with the
 * selected value and the original `Exit`.
 *
 * @see {@link onExit} for cleanup on every exit
 * @see {@link onExitIf} for selecting exits with a boolean predicate
 * @see {@link onErrorFilter} for selecting only failure causes
 *
 * @category resource management
 * @since 4.0.0
 */
export const onExitFilter: {
  <A, E, XE, XR, B, X>(
    filter: Filter.Filter<Exit.Exit<NoInfer<A>, NoInfer<E>>, B, X>,
    f: (b: B, exit: Exit.Exit<NoInfer<A>, NoInfer<E>>) => Effect<void, XE, XR>
  ): <R>(self: Effect<A, E, R>) => Effect<A, E | XE, R | XR>
  <A, E, R, XE, XR, B, X>(
    self: Effect<A, E, R>,
    filter: Filter.Filter<Exit.Exit<NoInfer<A>, NoInfer<E>>, B, X>,
    f: (b: B, exit: Exit.Exit<NoInfer<A>, NoInfer<E>>) => Effect<void, XE, XR>
  ): Effect<A, E | XE, R | XR>
} = internal.onExitFilter

// -----------------------------------------------------------------------------
// Caching
// -----------------------------------------------------------------------------

/**
 * Returns an effect that lazily computes a result and caches it for subsequent
 * evaluations.
 *
 * **When to use**
 *
 * Use when you need an expensive or time-consuming operation to be evaluated
 * once and reused by later callers.
 *
 * **Details**
 *
 * This function wraps an effect and ensures that its result is computed only
 * once. Once the result is computed, it is cached, meaning that subsequent
 * evaluations of the same effect will return the cached result without
 * re-executing the logic.
 *
 * Concurrent callers share the pending computation, which is interrupted only
 * once every caller waiting on it has been interrupted. Interrupted
 * computations are never cached, so the next evaluation starts a fresh
 * computation.
 *
 * **Example** (Memoizing an effect until invalidated)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 * const record = (value: unknown) => Effect.sync(() => { output.push(value) })
 *
 * let i = 1
 * const expensiveTask = Effect.sync(() => {
 *   void output.push("expensive task...")
 *   return `result ${i++}`
 * })
 *
 * const program = Effect.gen(function*() {
 *   void output.push("non-cached version:")
 *   yield* expensiveTask.pipe(Effect.andThen(record))
 *   yield* expensiveTask.pipe(Effect.andThen(record))
 *   void output.push("cached version:")
 *   const cached = yield* Effect.cached(expensiveTask)
 *   yield* cached.pipe(Effect.andThen(record))
 *   yield* cached.pipe(Effect.andThen(record))
 * })
 *
 * await Effect.runPromise(program)
 * output // => ["non-cached version:", "expensive task...", "result 1", "expensive task...", "result 2", "cached version:", "expensive task...", "result 3", "result 3"]
 * ```
 *
 * @see {@link cachedWithTTL} for a similar function that includes a
 * time-to-live duration for the cached value.
 * @see {@link cachedInvalidateWithTTL} for a similar function that includes an
 * additional effect for manually invalidating the cached value.
 * @category caching
 * @since 2.0.0
 */
export const cached: <A, E, R>(self: Effect<A, E, R>) => Effect<Effect<A, E, R>> = internal.cached

/**
 * Returns an effect that caches its result for a fixed duration or a duration
 * computed from its `Exit`, known as "timeToLive" (TTL).
 *
 * **When to use**
 *
 * Use when you need a costly effect result to be reused for a bounded duration
 * before being recomputed.
 *
 * **Details**
 *
 * This function is used to cache the result of an effect for a specified amount
 * of time. This means that the first time the effect is evaluated, its result
 * is computed and stored.
 *
 * If the effect is evaluated again within the specified `timeToLive`, the
 * cached result will be used, avoiding recomputation.
 *
 * After the specified duration has passed, the cache expires, and the effect
 * will be recomputed upon the next evaluation.
 *
 * `timeToLive` accepts a `Duration.Input` or a function from `Exit<A, E>` to
 * `Duration.Input`. The function runs once after each fresh computation,
 * including failures, so successes and failures can have different TTLs. It
 * does not run when the cache is created or when a cached result is reused.
 * Interrupted computations are never cached and do not call the function.
 *
 * The TTL starts when the computation completes. Concurrent callers share the
 * pending computation, which is interrupted only once every caller waiting on
 * it has been interrupted. The next evaluation then starts a fresh
 * computation. A zero TTL expires immediately, and an infinite TTL
 * keeps the result indefinitely.
 *
 * **Example** (Memoizing an effect with TTL)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 * const record = (value: unknown) => Effect.sync(() => { output.push(value) })
 *
 * let i = 1
 * const expensiveTask = Effect.sync(() => {
 *   void output.push("expensive task...")
 *   return `result ${i++}`
 * })
 *
 * const program = Effect.gen(function*() {
 *   const cached = yield* Effect.cachedWithTTL(expensiveTask, "1 hour")
 *   yield* cached.pipe(Effect.andThen(record))
 *   yield* cached.pipe(Effect.andThen(record))
 *   yield* cached.pipe(Effect.andThen(record))
 * })
 *
 * Effect.runSync(program)
 * output // => ["expensive task...", "result 1", "result 1", "result 1"]
 * ```
 *
 * **Example** (Caching successes while retrying failures)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit } from "effect"
 *
 * let attempts = 0
 * const task = Effect.suspend(() =>
 *   ++attempts === 1 ? Effect.fail("temporary failure") : Effect.succeed(42)
 * )
 * const program = Effect.gen(function*() {
 *   const cached = yield* task.pipe(
 *     Effect.cachedWithTTL((exit) => Exit.isSuccess(exit) ? "1 hour" : 0)
 *   )
 *   yield* Effect.exit(cached)
 *   return yield* cached
 * })
 *
 * Effect.runSync(program) // => 42
 * ```
 *
 * @see {@link cached} for a similar function that caches the result
 * indefinitely.
 * @see {@link cachedInvalidateWithTTL} for a similar function that includes an
 * additional effect for manually invalidating the cached value.
 * @category caching
 * @since 2.0.0
 */
export const cachedWithTTL: {
  <A, E>(
    timeToLive: (exit: Exit.Exit<A, E>) => Duration.Input
  ): <R>(self: Effect<A, E, R>) => Effect<Effect<A, E, R>>
  (timeToLive: Duration.Input): <A, E, R>(self: Effect<A, E, R>) => Effect<Effect<A, E, R>>
  <A, E>(
    timeToLive: Duration.Input | ((exit: Exit.Exit<A, E>) => Duration.Input)
  ): <R>(self: Effect<A, E, R>) => Effect<Effect<A, E, R>>
  <A, E, R>(
    self: Effect<A, E, R>,
    timeToLive: Duration.Input | ((exit: Exit.Exit<A, E>) => Duration.Input)
  ): Effect<Effect<A, E, R>>
} = internal.cachedWithTTL

/**
 * Creates a cached effect result for a fixed duration or a duration computed
 * from its `Exit` and allows manual invalidation before expiration.
 *
 * **When to use**
 *
 * Use when an effect result should be cached for a bounded time and callers
 * also need a manual invalidation effect to force recomputation before
 * expiration.
 *
 * **Details**
 *
 * This function behaves similarly to {@link cachedWithTTL} by caching the
 * result of an effect for a specified period of time. However, it introduces an
 * additional feature: it provides an effect that allows you to manually
 * invalidate the cached result before it naturally expires.
 *
 * This gives you more control over the cache, allowing you to refresh the
 * result when needed, even if the original cache has not yet expired.
 *
 * Once the cache is invalidated, the next time the effect is evaluated, the
 * result will be recomputed, and the cache will be refreshed.
 *
 * **Example** (Memoizing with TTL and invalidation)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 * const record = (value: unknown) => Effect.sync(() => { output.push(value) })
 *
 * let i = 1
 * const expensiveTask = Effect.sync(() => {
 *   void output.push("expensive task...")
 *   return `result ${i++}`
 * })
 *
 * const program = Effect.gen(function*() {
 *   const [cached, invalidate] = yield* Effect.cachedInvalidateWithTTL(
 *     expensiveTask,
 *     "1 hour"
 *   )
 *   yield* cached.pipe(Effect.andThen(record))
 *   yield* cached.pipe(Effect.andThen(record))
 *   yield* invalidate
 *   yield* cached.pipe(Effect.andThen(record))
 * })
 *
 * Effect.runSync(program)
 * output // => ["expensive task...", "result 1", "result 1", "expensive task...", "result 2"]
 * ```
 *
 * @see {@link cached} for a similar function that caches the result
 * indefinitely.
 * @see {@link cachedWithTTL} for a similar function that caches the result for
 * a specified duration but does not include an effect for manual invalidation.
 * @category caching
 * @since 2.0.0
 */
export const cachedInvalidateWithTTL: {
  <A, E>(
    timeToLive: (exit: Exit.Exit<A, E>) => Duration.Input
  ): <R>(self: Effect<A, E, R>) => Effect<[Effect<A, E, R>, Effect<void>]>
  (timeToLive: Duration.Input): <A, E, R>(self: Effect<A, E, R>) => Effect<[Effect<A, E, R>, Effect<void>]>
  <A, E>(
    timeToLive: Duration.Input | ((exit: Exit.Exit<A, E>) => Duration.Input)
  ): <R>(self: Effect<A, E, R>) => Effect<[Effect<A, E, R>, Effect<void>]>
  <A, E, R>(
    self: Effect<A, E, R>,
    timeToLive: Duration.Input | ((exit: Exit.Exit<A, E>) => Duration.Input)
  ): Effect<[Effect<A, E, R>, Effect<void>]>
} = internal.cachedInvalidateWithTTL

// -----------------------------------------------------------------------------
// Interruption
// -----------------------------------------------------------------------------

/**
 * Returns an effect that is immediately interrupted.
 *
 * **Example** (Creating an interrupted effect)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   return yield* Effect.interrupt
 *   yield* Effect.succeed("This won't execute and is unreachable")
 * })
 *
 * Effect.runSyncExit(program)._tag // => "Failure"
 * ```
 *
 * @category interruption
 * @since 2.0.0
 */
export const interrupt: Effect<never> = internal.interrupt

/**
 * Returns a new effect that allows the effect to be interruptible.
 *
 * **Example** (Allowing interruption)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option } from "effect"
 *
 * const program = Effect.interruptible(Effect.never).pipe(
 *   Effect.timeoutOption(0)
 * )
 * await Effect.runPromise(program) // => Option.none()
 * ```
 *
 * @category interruption
 * @since 2.0.0
 */
export const interruptible: <A, E, R>(
  self: Effect<A, E, R>
) => Effect<A, E, R> = internal.interruptible

/**
 * Runs the specified finalizer effect if this effect is interrupted.
 *
 * **Example** (Running cleanup on interruption)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber } from "effect"
 * const output: Array<unknown> = []
 *
 * const task = Effect.forever(Effect.succeed("working..."))
 *
 * const program = Effect.onInterrupt(
 *   task,
 *   () => Effect.sync(() => { output.push("Task was interrupted, cleaning up...") })
 * )
 *
 * const fiber = Effect.runFork(program)
 * await Effect.runPromise(Fiber.interrupt(fiber))
 * output // => ["Task was interrupted, cleaning up..."]
 * ```
 *
 * @category interruption
 * @since 2.0.0
 */
export const onInterrupt: {
  <XE, XR>(
    finalizer: (interruptors: ReadonlySet<number>) => Effect<void, XE, XR>
  ): <A, E, R>(self: Effect<A, E, R>) => Effect<A, E | XE, R | XR>
  <A, E, R, XE, XR>(
    self: Effect<A, E, R>,
    finalizer: (interruptors: ReadonlySet<number>) => Effect<void, XE, XR>
  ): Effect<A, E | XE, R | XR>
} = internal.onInterrupt

/**
 * Returns a new effect that disables interruption for the given effect.
 *
 * **Example** (Preventing interruption)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const criticalTask = Effect.gen(function*() {
 *   yield* Effect.sync(() => { output.push("Starting critical section...") })
 *   yield* Effect.sync(() => { output.push("Critical section completed") })
 * })
 *
 * const program = Effect.uninterruptible(criticalTask)
 *
 * Effect.runSync(program)
 * output // => ["Starting critical section...", "Critical section completed"]
 * ```
 *
 * @category interruption
 * @since 2.0.0
 */
export const uninterruptible: <A, E, R>(
  self: Effect<A, E, R>
) => Effect<A, E, R> = internal.uninterruptible

/**
 * Disables interruption and provides a restore function to restore the
 * interruptible state within the effect.
 *
 * **Example** (Restoring interruption in protected regions)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.uninterruptibleMask((restore) =>
 *   Effect.gen(function*() {
 *     yield* Effect.sync(() => { output.push("Uninterruptible phase...") })
 *     // Restore interruptibility for this part
 *     yield* restore(
 *       Effect.gen(function*() {
 *         yield* Effect.sync(() => { output.push("Interruptible phase...") })
 *       })
 *     )
 *
 *     yield* Effect.sync(() => { output.push("Back to uninterruptible") })
 *   })
 * )
 *
 * Effect.runSync(program)
 * output // => ["Uninterruptible phase...", "Interruptible phase...", "Back to uninterruptible"]
 * ```
 *
 * @category interruption
 * @since 2.0.0
 */
export const uninterruptibleMask: <A, E, R>(
  f: (
    restore: <AX, EX, RX>(effect: Effect<AX, EX, RX>) => Effect<AX, EX, RX>
  ) => Effect<A, E, R>
) => Effect<A, E, R> = internal.uninterruptibleMask

/**
 * Runs an effect in an interruptible region while providing `restore` for
 * locally restoring the previous interruptibility.
 *
 * **Example** (Controlling interruptibility locally)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.interruptibleMask((restore) =>
 *   Effect.gen(function*() {
 *     yield* Effect.sync(() => { output.push("Interruptible phase...") })
 *     // Make this part uninterruptible
 *     yield* restore(
 *       Effect.gen(function*() {
 *         yield* Effect.sync(() => { output.push("Uninterruptible phase...") })
 *       })
 *     )
 *
 *     yield* Effect.sync(() => { output.push("Back to interruptible") })
 *   })
 * )
 *
 * Effect.runSync(program)
 * output // => ["Interruptible phase...", "Uninterruptible phase...", "Back to interruptible"]
 * ```
 *
 * @category interruption
 * @since 2.0.0
 */
export const interruptibleMask: <A, E, R>(
  f: (
    restore: <AX, EX, RX>(effect: Effect<AX, EX, RX>) => Effect<AX, EX, RX>
  ) => Effect<A, E, R>
) => Effect<A, E, R> = internal.interruptibleMask

/**
 * Creates an AbortSignal that is managed by the provided scope.
 *
 * **When to use**
 *
 * Use to obtain a scope-managed `AbortSignal` for APIs that accept cancellation
 * through a signal.
 *
 * **Details**
 *
 * Each acquisition creates a fresh `AbortController`. Closing the owning scope
 * runs a finalizer that aborts the controller and the effect succeeds with the
 * controller's signal.
 *
 * **Gotchas**
 *
 * The signal is aborted when its owning scope closes, so avoid keeping it for
 * work that outlives that scope.
 *
 * @see {@link scoped} for binding resource lifetime to a scope
 *
 * @category interruption
 * @since 4.0.0
 */
export const abortSignal: Effect<AbortSignal, never, Scope> = internal.abortSignal

// -----------------------------------------------------------------------------
// Repetition & Recursion
// -----------------------------------------------------------------------------

/**
 * Type helpers for repeating effects.
 *
 * @category repetition
 * @since 2.0.0
 */
export declare namespace Repeat {
  /**
   * Computes the result type of `Effect.repeat` from the original effect and repeat options.
   *
   * @category repetition
   * @since 2.0.0
   */
  export type Return<R, E, A, O extends Options<A>> = Effect<
    O extends unknown ? "schedule" extends keyof O ? A
      : "times" extends keyof O ? A
      : O extends { until: Predicate.Refinement<A, infer B> } ? B
      : O extends { while: Predicate.Refinement<A, infer B> } ? Exclude<A, B>
      : A
      : never,
    | E
    | (O extends { schedule: Schedule<infer _Out, infer _I, infer E, infer _R> } ? E
      : never)
    | (O extends { while: (...args: Array<any>) => Effect<infer _A, infer E, infer _R> } ? E
      : never)
    | (O extends { until: (...args: Array<any>) => Effect<infer _A, infer E, infer _R> } ? E
      : never),
    | R
    | (O extends { schedule: Schedule<infer _O, infer _I, infer _E, infer R> } ? R
      : never)
    | (O extends {
      while: (...args: Array<any>) => Effect<infer _A, infer _E, infer R>
    } ? R
      : never)
    | (O extends {
      until: (...args: Array<any>) => Effect<infer _A, infer _E, infer R>
    } ? R
      : never)
  > extends infer Z ? Z
    : never

  /**
   * Options that control whether and how an effect is repeated.
   *
   * @category repetition
   * @since 2.0.0
   */
  export interface Options<A> {
    while?: ((_: A) => boolean | Effect<boolean, any, any>) | undefined
    until?: ((_: A) => boolean | Effect<boolean, any, any>) | undefined
    times?: number | undefined
    schedule?: Schedule<any, A, any, any> | undefined
  }
}

/**
 * Repeats this effect forever (until the first error).
 *
 * **Example** (Repeating forever)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option } from "effect"
 *
 * const program = Effect.forever(Effect.never).pipe(Effect.timeoutOption(0))
 * await Effect.runPromise(program) // => Option.none()
 * ```
 *
 * @category repetition
 * @since 2.0.0
 */
export const forever: <
  Arg extends Effect<any, any, any> | {
    readonly disableYield?: boolean | undefined
  } | undefined = {
    readonly disableYield?: boolean | undefined
  }
>(
  effectOrOptions?: Arg,
  options?: {
    readonly disableYield?: boolean | undefined
  } | undefined
) => [Arg] extends [Effect<infer _A, infer _E, infer _R>] ? Effect<never, _E, _R>
  : <A, E, R>(self: Effect<A, E, R>) => Effect<never, E, R> = internal.forever

/**
 * Repeats an effect based on a specified schedule or until the first failure.
 *
 * **When to use**
 *
 * Use to rerun an effect after successful executions.
 *
 * **Details**
 *
 * This function executes an effect repeatedly according to the given schedule.
 * Each repetition occurs after the initial execution of the effect, meaning
 * that the schedule determines the number of additional repetitions. For
 * example, using `Schedule.once` will result in the effect being executed twice
 * (once initially and once as part of the repetition).
 *
 * If the effect succeeds, it is repeated according to the schedule. If it
 * fails, the repetition stops immediately, and the failure is returned.
 *
 * The schedule can also specify delays between repetitions, making it useful
 * for tasks like retrying operations with backoff, periodic execution, or
 * performing a series of dependent actions.
 *
 * You can combine schedules for more advanced repetition logic, such as adding
 * delays, limiting recursions, or dynamically adjusting based on the outcome of
 * each execution.
 *
 * **Gotchas**
 *
 * The source effect is always evaluated once before the schedule is stepped.
 * The schedule controls additional repetitions, not the initial execution.
 *
 * **Example** (Repeating successful effects with a schedule)
 *
 * ```ts import.meta.vitest
 * // Success Example
 * import { Effect, Schedule } from "effect"
 * const output: Array<unknown> = []
 *
 * const action = Effect.sync(() => { output.push("success") })
 * const policy = Schedule.recurs(2)
 * const program = Effect.repeat(action, policy)
 *
 * void output.push(Effect.runSync(program))
 * output // => ["success", "success", "success", 2]
 * ```
 *
 * **Example** (Stopping repetition on failure)
 *
 * ```ts import.meta.vitest
 * // Failure Example
 * import { Effect, Schedule } from "effect"
 * const output: Array<unknown> = []
 *
 * let count = 0
 *
 * // Define a callback effect that simulates an action with possible failures
 * const action = Effect.callback<string, string>((resume) => {
 *   if (count > 1) {
 *     void output.push("failure")
 *     resume(Effect.fail("Uh oh!"))
 *   } else {
 *     count++
 *     void output.push("success")
 *     resume(Effect.succeed("yay!"))
 *   }
 * })
 *
 * const policy = Schedule.recurs(2)
 * const program = Effect.repeat(action, policy)
 *
 * void output.push((await Effect.runPromiseExit(program))._tag)
 * output // => ["success", "success", "failure", "Failure"]
 * ```
 *
 * @see {@link retry} for failure-based repetition
 * @see {@link repeatOrElse} for fallback handling when repetition fails
 *
 * @category repetition
 * @since 2.0.0
 */
export const repeat: {
  <O extends Repeat.Options<A>, A>(options: O): <E, R>(self: Effect<A, E, R>) => Repeat.Return<R, E, A, O>
  <Output, Input, Error, Env>(
    schedule: Schedule<Output, NoInfer<Input>, Error, Env>
  ): <E, R>(self: Effect<Input, E, R>) => Effect<Output, E | Error, R | Env>
  <Output, Input, Error, Env>(
    builder: (
      $: <O, E, R>(_: Schedule<O, NoInfer<Input>, E, R>) => Schedule<O, Input, E, R>
    ) => Schedule<Output, NoInfer<Input>, Error, Env>
  ): <E, R>(self: Effect<Input, E, R>) => Effect<Output, E | Error, R | Env>
  <A, E, R, O extends Repeat.Options<A>>(self: Effect<A, E, R>, options: O): Repeat.Return<R, E, A, O>
  <Input, E, R, Output, Error, Env>(
    self: Effect<Input, E, R>,
    schedule: Schedule<Output, NoInfer<Input>, Error, Env>
  ): Effect<Output, E | Error, R | Env>
  <Input, E, R, Output, Error, Env>(
    self: Effect<Input, E, R>,
    builder: (
      $: <O, E, R>(_: Schedule<O, NoInfer<Input>, E, R>) => Schedule<O, Input, E, R>
    ) => Schedule<Output, NoInfer<Input>, Error, Env>
  ): Effect<Output, E | Error, R | Env>
} = internalSchedule.repeat

/**
 * Repeats an effect according to a schedule and runs a fallback effect if
 * repetition fails before the schedule completes.
 *
 * **When to use**
 *
 * Use when successful repetitions should follow a schedule, but failures from
 * the repeated effect or schedule need an effectful fallback.
 *
 * **Details**
 *
 * If the repeated effect or schedule step fails, `orElse` receives the failure
 * and the latest schedule metadata when at least one schedule step has run;
 * otherwise it receives `None`. If the schedule completes normally, the
 * returned effect succeeds with the schedule's output.
 *
 * **Example** (Recovering after repetition stops)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Schedule } from "effect"
 * const output: Array<unknown> = []
 *
 * let attempt = 0
 * const task = Effect.gen(function*() {
 *   attempt++
 *   if (attempt <= 2) {
 *     yield* Effect.sync(() => { output.push(`Attempt ${attempt} failed`) })
 *     return yield* Effect.fail(`Error ${attempt}`)
 *   }
 *   yield* Effect.sync(() => { output.push(`Attempt ${attempt} succeeded`) })
 *   return "success"
 * })
 *
 * const program = Effect.repeatOrElse(
 *   task,
 *   Schedule.recurs(3),
 *   (error, previous) =>
 *     Effect.sync(() => { output.push(
 *       `Final failure: ${error}, after ${
 *         Option.isSome(previous) ? previous.value.attempt : 0
 *       } attempts`
 *     ) }).pipe(Effect.map(() => 0))
 * )
 *
 * void output.push(Effect.runSync(program))
 * output // => ["Attempt 1 failed", "Final failure: Error 1, after 0 attempts", 0]
 * ```
 *
 * @category repetition
 * @since 2.0.0
 */
export const repeatOrElse: {
  <R2, A, B, E, E2, E3, R3>(
    schedule: Schedule<B, A, E2, R2>,
    orElse: (error: E | E2, option: Option<ScheduleMetadata<B, A>>) => Effect<B, E3, R3>
  ): <R>(self: Effect<A, E, R>) => Effect<B, E3, R | R2 | R3>
  <A, E, R, R2, B, E2, E3, R3>(
    self: Effect<A, E, R>,
    schedule: Schedule<B, A, E2, R2>,
    orElse: (error: E | E2, option: Option<ScheduleMetadata<B, A>>) => Effect<B, E3, R3>
  ): Effect<B, E3, R | R2 | R3>
} = internalSchedule.repeatOrElse

/**
 * Returns an array of `n` identical effects.
 *
 * **When to use**
 *
 * Use when you need an array of identical effect values without running them
 * yet.
 *
 * **Details**
 *
 * This only creates the array of effects. It does not run or collect them.
 *
 * @see {@link all} for running the returned effects and collecting results
 * @see {@link replicateEffect} for repeating an effect and collecting results in one step with concurrency and discard options
 *
 * @category repetition
 * @since 2.0.0
 */
export const replicate: {
  (n: number): <A, E, R>(self: Effect<A, E, R>) => Array<Effect<A, E, R>>
  <A, E, R>(self: Effect<A, E, R>, n: number): Array<Effect<A, E, R>>
} = internal.replicate

/**
 * Performs this effect `n` times and collects results with `Effect.all` semantics.
 *
 * **When to use**
 *
 * Use when you want to run the repeated effects immediately, with optional
 * concurrency control or result discarding.
 *
 * **Details**
 *
 * Use `concurrency` to control parallelism and `discard: true` to ignore results.
 *
 * **Example** (Replicating an effect)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.gen(function*() {
 *   const results = yield* Effect.replicateEffect(3)(Effect.succeed(1))
 *   yield* Effect.sync(() => { output.push(results) })
 * })
 *
 * Effect.runSync(program)
 * output // => [[1, 1, 1]]
 * ```
 *
 * @category repetition
 * @since 2.0.0
 */
export const replicateEffect: {
  (
    n: number,
    options?: { readonly concurrency?: Concurrency | undefined; readonly discard?: false | undefined }
  ): <A, E, R>(self: Effect<A, E, R>) => Effect<Array<A>, E, R>
  (
    n: number,
    options: { readonly concurrency?: Concurrency | undefined; readonly discard: true }
  ): <A, E, R>(self: Effect<A, E, R>) => Effect<void, E, R>
  <A, E, R>(
    self: Effect<A, E, R>,
    n: number,
    options?: { readonly concurrency?: Concurrency | undefined; readonly discard?: false | undefined }
  ): Effect<Array<A>, E, R>
  <A, E, R>(
    self: Effect<A, E, R>,
    n: number,
    options: { readonly concurrency?: Concurrency | undefined; readonly discard: true }
  ): Effect<void, E, R>
} = internal.replicateEffect

/**
 * Runs an effect repeatedly according to a schedule and returns the schedule's
 * final output.
 *
 * **When to use**
 *
 * Use to rerun a successful effect according to a `Schedule` when the schedule
 * does not need a custom initial input.
 *
 * **Details**
 *
 * The schedule is first stepped with `undefined`. After each successful
 * execution, the effect's success value is fed to the schedule to decide
 * whether to run again. The returned effect fails if the effect or schedule
 * fails, and otherwise succeeds with the schedule output when the schedule
 * completes.
 *
 * **Example** (Scheduling repeated execution)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schedule } from "effect"
 * const output: Array<unknown> = []
 *
 * const task = Effect.gen(function*() {
 *   yield* Effect.sync(() => { output.push("Task executing...") })
 *   return 1
 * })
 *
 * const program = Effect.schedule(task, Schedule.recurs(2))
 *
 * void output.push(Effect.runSync(program))
 * output // => ["Task executing...", "Task executing...", 2]
 * ```
 *
 * @see {@link scheduleFrom} for a variant that allows the schedule's decision
 * to depend on the result of this effect.
 *
 * @category repetition
 * @since 2.0.0
 */
export const schedule: {
  <Output, Error, Env>(
    schedule: Schedule<Output, unknown, Error, Env>
  ): <A, E, R>(self: Effect<A, E, R>) => Effect<Output, E | Error, R | Env>
  <A, E, R, Output, Error, Env>(
    self: Effect<A, E, R>,
    schedule: Schedule<Output, unknown, Error, Env>
  ): Effect<Output, E | Error, R | Env>
} = dual(2, <A, E, R, Output, Error, Env>(
  self: Effect<A, E, R>,
  schedule: Schedule<Output, unknown, Error, Env>
): Effect<Output, E | Error, R | Env> => scheduleFrom(self, undefined, schedule))

/**
 * Runs an effect repeatedly according to a schedule that is initialized with a
 * specific schedule input.
 *
 * **Details**
 *
 * `initial` is passed to the schedule before the first execution, not to the
 * effect itself. After each successful execution, the effect's success value is
 * fed back into the schedule to decide whether to continue. The returned effect
 * succeeds with the schedule output when the schedule completes and fails if
 * the effect or schedule fails.
 *
 * **Example** (Scheduling from an initial value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schedule } from "effect"
 * const output: Array<unknown> = []
 *
 * const task = (input: number) =>
 *   Effect.gen(function*() {
 *     yield* Effect.sync(() => { output.push(`Processing: ${input}`) })
 *     return input + 1
 *   })
 *
 * // Start with 0, repeat 3 times
 * const program = Effect.scheduleFrom(
 *   task(0),
 *   0,
 *   Schedule.recurs(2)
 * )
 *
 * void output.push(Effect.runSync(program))
 * output // => ["Processing: 0", "Processing: 0", 2]
 * ```
 *
 * @category repetition
 * @since 2.0.0
 */
export const scheduleFrom: {
  <Input, Output, Error, Env>(
    initial: Input,
    schedule: Schedule<Output, Input, Error, Env>
  ): <E, R>(self: Effect<Input, E, R>) => Effect<Output, E | Error, R | Env>
  <Input, E, R, Output, Error, Env>(
    self: Effect<Input, E, R>,
    initial: Input,
    schedule: Schedule<Output, Input, Error, Env>
  ): Effect<Output, E | Error, R | Env>
} = internalSchedule.scheduleFrom

// -----------------------------------------------------------------------------
// Tracing
// -----------------------------------------------------------------------------

/**
 * Returns the current tracer from the context.
 *
 * **Example** (Accessing the current tracer)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const currentTracer = yield* Effect.tracer
 *   return typeof currentTracer.span
 * })
 *
 * Effect.runSync(program) // => "function"
 * ```
 *
 * @category tracing
 * @since 2.0.0
 */
export const tracer: Effect<Tracer> = internal.tracer

/**
 * Provides a tracer to an effect.
 *
 * **Example** (Providing a tracer)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const tracer = yield* Effect.tracer
 *   return yield* Effect.withTracer(Effect.succeed("completed"), tracer)
 * })
 *
 * Effect.runSync(program) // => "completed"
 * ```
 *
 * @category tracing
 * @since 2.0.0
 */
export const withTracer: {
  (value: Tracer): <A, E, R>(effect: Effect<A, E, R>) => Effect<A, E, R>
  <A, E, R>(effect: Effect<A, E, R>, value: Tracer): Effect<A, E, R>
} = internal.withTracer

/**
 * Enables or disables tracing for spans created by the given effect.
 *
 * **Details**
 *
 * When `enabled` is `false`, spans created inside the effect are not registered
 * with the current tracer and do not propagate as normal trace parents.
 *
 * **Example** (Enabling or disabling tracing)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const program = Effect.succeed(42).pipe(
 *   Effect.withSpan("my-span"),
 *   // the span will not be registered with the tracer
 *   Effect.withTracerEnabled(false)
 * )
 * Effect.runSync(program) // => 42
 * ```
 *
 * @category tracing
 * @since 2.0.0
 */
export const withTracerEnabled: {
  (enabled: boolean): <A, E, R>(effect: Effect<A, E, R>) => Effect<A, E, R>
  <A, E, R>(effect: Effect<A, E, R>, enabled: boolean): Effect<A, E, R>
} = internal.withTracerEnabled

/**
 * Enables or disables tracer timing for the given Effect.
 *
 * **Example** (Enabling or disabling tracing timing)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const program = Effect.succeed(42).pipe(
 *   Effect.withSpan("my-span"),
 *   // the span will not have timing information
 *   Effect.withTracerTiming(false)
 * )
 * Effect.runSync(program) // => 42
 * ```
 *
 * @category tracing
 * @since 2.0.0
 */
export const withTracerTiming: {
  (enabled: boolean): <A, E, R>(effect: Effect<A, E, R>) => Effect<A, E, R>
  <A, E, R>(effect: Effect<A, E, R>, enabled: boolean): Effect<A, E, R>
} = internal.withTracerTiming

/**
 * Adds an annotation to each span in this effect.
 *
 * **Example** (Annotating all spans)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const program = Effect.succeed("result")
 *
 * // Add single annotation
 * const annotated1 = Effect.annotateSpans(program, "user", "john")
 *
 * // Add multiple annotations
 * const annotated2 = Effect.annotateSpans(program, {
 *   operation: "data-processing",
 *   version: "1.0.0",
 *   environment: "production"
 * })
 *
 * Effect.runSync(Effect.all([annotated1, annotated2])) // => ['result', 'result']
 * ```
 *
 * @category tracing
 * @since 2.0.0
 */
export const annotateSpans: {
  (
    key: string,
    value: unknown
  ): <A, E, R>(effect: Effect<A, E, R>) => Effect<A, E, R>
  (
    values: Record<string, unknown>
  ): <A, E, R>(effect: Effect<A, E, R>) => Effect<A, E, R>
  <A, E, R>(
    effect: Effect<A, E, R>,
    key: string,
    value: unknown
  ): Effect<A, E, R>
  <A, E, R>(
    effect: Effect<A, E, R>,
    values: Record<string, unknown>
  ): Effect<A, E, R>
} = internal.annotateSpans

/**
 * Adds an annotation to the current span if available.
 *
 * **Example** (Annotating the current span)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   yield* Effect.annotateCurrentSpan("userId", "123")
 *   yield* Effect.annotateCurrentSpan({
 *     operation: "user-lookup"
 *   })
 *   return "success"
 * })
 *
 * const traced = Effect.withSpan(program, "user-operation")
 * Effect.runSync(traced) // => "success"
 * ```
 *
 * @category tracing
 * @since 2.0.0
 */
export const annotateCurrentSpan: {
  (key: string, value: unknown): Effect<void>
  (values: Record<string, unknown>): Effect<void>
} = internal.annotateCurrentSpan

/**
 * Returns the currently active local tracing span.
 *
 * **Details**
 *
 * The effect fails with `NoSuchElementError` when there is no active local
 * `Span`.
 *
 * **Example** (Reading the current span)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const span = yield* Effect.currentSpan
 *   return span.name
 * })
 *
 * const traced = Effect.withSpan(program, "my-span")
 * Effect.runSync(traced) // => "my-span"
 * ```
 *
 * @category tracing
 * @since 2.0.0
 */
export const currentSpan: Effect<Span, Cause.NoSuchElementError> = internal.currentSpan

/**
 * Returns the current parent span from the effect context.
 *
 * **Details**
 *
 * The effect succeeds with either a local span or external span when one is
 * present, and fails with `NoSuchElementError` when no parent span is
 * available.
 *
 * **Example** (Reading the parent span)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const childOperation = Effect.gen(function*() {
 *   const parentSpan = yield* Effect.currentParentSpan
 *   return parentSpan._tag
 * })
 *
 * const program = Effect.withSpan(childOperation, "child-span")
 *
 * const traced = Effect.withSpan(program, "parent-span")
 * Effect.runSync(traced) // => "Span"
 * ```
 *
 * @category tracing
 * @since 2.0.0
 */
export const currentParentSpan: Effect<AnySpan, Cause.NoSuchElementError> = internal.currentParentSpan

/**
 * Returns the tracing span annotations currently carried in the effect context.
 *
 * **Details**
 *
 * These annotations are applied to spans created inside the context, such as
 * spans created by `withSpan`, `useSpan`, or `makeSpan`.
 *
 * **Example** (Providing span annotations)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const annotations = yield* Effect.spanAnnotations
 *   return annotations
 * }).pipe(Effect.annotateSpans({ userId: "123", operation: "data-processing" }))
 *
 * Effect.runSync(program) // => { userId: '123', operation: 'data-processing' }
 * ```
 *
 * @category tracing
 * @since 2.0.0
 */
export const spanAnnotations: Effect<Readonly<Record<string, unknown>>> = internal.spanAnnotations

/**
 * Returns the tracing span links currently carried in the effect context.
 *
 * **Details**
 *
 * These links are attached to spans created inside the context. Span links
 * connect related spans without making one span the parent of another.
 *
 * **Example** (Providing span links)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   // Get the current span links
 *   const links = yield* Effect.spanLinks
 *   return links
 * })
 *
 * Effect.runSync(program).length // => 0
 * ```
 *
 * @category tracing
 * @since 2.0.0
 */
export const spanLinks: Effect<ReadonlyArray<SpanLink>> = internal.spanLinks

/**
 * Adds a link with the provided span to all spans in this effect.
 *
 * **Details**
 *
 * This is useful for connecting spans that are related but not in a direct
 * parent-child relationship. For example, you might want to link spans from
 * parallel operations or connect spans across different traces.
 *
 * **Example** (Linking one span to another span)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const program = Effect.withSpan(Effect.gen(function*() {
 *   const parentSpan = yield* Effect.currentSpan
 *   return yield* Effect.spanLinks.pipe(
 *     Effect.linkSpans(parentSpan, { relationship: "follows" })
 *   )
 * }), "parent-operation")
 *
 * Effect.runSync(program).length // => 1
 * ```
 *
 * **Example** (Linking multiple spans at once)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const span1 = yield* Effect.makeSpan("span-1")
 *   const span2 = yield* Effect.makeSpan("span-2")
 *
 *   return yield* Effect.spanLinks.pipe(
 *     Effect.linkSpans([span1, span2], {
 *       type: "dependency",
 *       source: "multiple-operations"
 *     })
 *   )
 * })
 *
 * Effect.runSync(program).length // => 2
 * ```
 *
 * @category tracing
 * @since 2.0.0
 */
export const linkSpans: {
  (
    span: AnySpan | ReadonlyArray<AnySpan>,
    attributes?: Record<string, unknown>
  ): <A, E, R>(self: Effect<A, E, R>) => Effect<A, E, R>
  <A, E, R>(
    self: Effect<A, E, R>,
    span: AnySpan | ReadonlyArray<AnySpan>,
    attributes?: Record<string, unknown>
  ): Effect<A, E, R>
} = internal.linkSpans

/**
 * Creates a new tracing span and returns it without managing its lifetime.
 *
 * **Details**
 *
 * The span is not added to the current span stack and is not ended
 * automatically. Use `withSpan`, `useSpan`, or `makeSpanScoped` when the span
 * should be installed as context or closed automatically.
 *
 * **Example** (Creating a span manually)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const span = yield* Effect.makeSpan("my-operation")
 *   return span.name
 * })
 *
 * Effect.runSync(program) // => "my-operation"
 * ```
 *
 * @category tracing
 * @since 2.0.0
 */
export const makeSpan: (name: string, options?: SpanOptionsNoTrace) => Effect<Span> = internal.makeSpan

/**
 * Create a new span for tracing, and automatically close it when the Scope
 * finalizes.
 *
 * **Details**
 *
 * The span is not added to the current span stack, so no child spans will be
 * created for it.
 *
 * **Example** (Creating a scoped standalone span)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const program = Effect.scoped(
 *   Effect.gen(function*() {
 *     const span = yield* Effect.makeSpanScoped("scoped-operation")
 *     return span.name
 *     // Span automatically closes when scope ends
 *   })
 * )
 *
 * Effect.runSync(program) // => "scoped-operation"
 * ```
 *
 * @category tracing
 * @since 2.0.0
 */
export const makeSpanScoped: (
  name: string,
  options?: SpanOptionsNoTrace | undefined
) => Effect<Span, never, Scope> = internal.makeSpanScoped

/**
 * Create a new span for tracing, and automatically close it when the effect
 * completes.
 *
 * **Details**
 *
 * The span is not added to the current span stack, so no child spans will be
 * created for it.
 *
 * **Example** (Running an effect with a standalone span)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const program = Effect.useSpan(
 *   "user-operation",
 *   (span) => Effect.succeed(`${span.name}: success`)
 * )
 * Effect.runSync(program) // => "user-operation: success"
 * ```
 *
 * @category tracing
 * @since 2.0.0
 */
export const useSpan: {
  <A, E, R>(name: string, evaluate: (span: Span) => Effect<A, E, R>): Effect<A, E, R>
  <A, E, R>(name: string, options: SpanOptionsNoTrace, evaluate: (span: Span) => Effect<A, E, R>): Effect<A, E, R>
} = internal.useSpan

/**
 * Wraps the effect with a child span for tracing.
 *
 * **Example** (Wrapping an effect in a child span)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const task = Effect.succeed("result")
 *
 * const traced = Effect.withSpan(task, "my-task", {
 *   attributes: { version: "1.0" }
 * })
 * Effect.runSync(traced) // => "result"
 * ```
 *
 * @category tracing
 * @since 2.0.0
 */
export const withSpan: {
  <Args extends ReadonlyArray<any>>(
    name: string,
    options?:
      | SpanOptionsNoTrace
      | ((...args: NoInfer<Args>) => SpanOptionsNoTrace)
      | undefined,
    traceOptions?: TraceOptions | undefined
  ): <A, E, R>(self: Effect<A, E, R>, ...args: Args) => Effect<A, E, Exclude<R, ParentSpan>>
  <A, E, R>(
    self: Effect<A, E, R>,
    name: string,
    options?: SpanOptions | undefined
  ): Effect<A, E, Exclude<R, ParentSpan>>
} = internal.withSpan

/**
 * Wraps the effect with a scoped child span for tracing.
 *
 * **Details**
 *
 * The span is ended when the Scope is finalized.
 *
 * **Example** (Creating a scoped child span)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const program = Effect.scoped(
 *   Effect.gen(function*() {
 *     const task = Effect.succeed("working")
 *     yield* Effect.withSpanScoped(task, "scoped-task")
 *     return "completed"
 *   })
 * )
 * Effect.runSync(program) // => "completed"
 * ```
 *
 * @category tracing
 * @since 2.0.0
 */
export const withSpanScoped: {
  (
    name: string,
    options?: SpanOptions
  ): <A, E, R>(
    self: Effect<A, E, R>
  ) => Effect<A, E, Exclude<R, ParentSpan> | Scope>
  <A, E, R>(
    self: Effect<A, E, R>,
    name: string,
    options?: SpanOptions
  ): Effect<A, E, Exclude<R, ParentSpan> | Scope>
} = internal.withSpanScoped

/**
 * Adds the provided span to the current span stack.
 *
 * **Example** (Setting a parent span)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const span = yield* Effect.makeSpan("parent-span")
 *   const childTask = Effect.succeed("child operation")
 *   yield* Effect.withParentSpan(childTask, span)
 *   return "completed"
 * })
 * Effect.runSync(program) // => "completed"
 * ```
 *
 * @category tracing
 * @since 2.0.0
 */
export const withParentSpan: {
  (value: AnySpan, options?: TraceOptions): <A, E, R>(self: Effect<A, E, R>) => Effect<A, E, Exclude<R, ParentSpan>>
  <A, E, R>(self: Effect<A, E, R>, value: AnySpan, options?: TraceOptions): Effect<A, E, Exclude<R, ParentSpan>>
} = internal.withParentSpan

// -----------------------------------------------------------------------------
// Batching
// -----------------------------------------------------------------------------

/**
 * Executes a request using the provided resolver.
 *
 * **When to use**
 *
 * Use when you need resolver-driven batching for a typed `Request`.
 *
 * **Example** (Executing a request through a resolver)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Request, RequestResolver } from "effect"
 * const output: Array<unknown> = []
 *
 * interface GetUser extends Request.Request<string> {
 *   readonly _tag: "GetUser"
 *   readonly id: number
 * }
 * const GetUser = Request.tagged<GetUser>("GetUser")
 *
 * const resolver = RequestResolver.make<GetUser>(
 *   Effect.fnUntraced(function*(entries) {
 *     for (const entry of entries) {
 *       yield* Request.complete(entry, Exit.succeed(`user-${entry.request.id}`))
 *     }
 *   })
 * )
 *
 * const program = Effect.gen(function*() {
 *   const name = yield* Effect.request(GetUser({ id: 1 }), resolver)
 *   yield* Effect.sync(() => { output.push(name) })
 * })
 *
 * await Effect.runPromise(program)
 * output // => ["user-1"]
 * ```
 *
 * @see {@link requestUnsafe} for the low-level entry point when you already have a `Context` and need to enqueue outside an `Effect`
 *
 * @category running
 * @since 2.0.0
 */
export const request: {
  <A extends Request.Any, EX = never, RX = never>(
    resolver: RequestResolver<A> | Effect<RequestResolver<A>, EX, RX>
  ): (self: A) => Effect<Request.Success<A>, Request.Error<A> | EX, Request.Services<A> | RX>
  <A extends Request.Any, EX = never, RX = never>(
    self: A,
    resolver: RequestResolver<A> | Effect<RequestResolver<A>, EX, RX>
  ): Effect<Request.Success<A>, Request.Error<A> | EX, Request.Services<A> | RX>
} = internalRequest.request

/**
 * Registers a request with a resolver and delivers the exit value via `onExit`.
 *
 * **When to use**
 *
 * Use when you already have a `Context` and need to enqueue a request outside
 * an `Effect` while receiving completion through `onExit`.
 *
 * **Details**
 *
 * It returns a canceler that removes the pending request entry.
 *
 * @see {@link request} for the `Effect`-returning API used for normal request execution
 *
 * @category unsafe
 * @since 4.0.0
 */
export const requestUnsafe: <A extends Request.Any>(
  self: A,
  options: {
    readonly resolver: RequestResolver<A>
    readonly onExit: (exit: Exit.Exit<Request.Success<A>, Request.Error<A>>) => void
    readonly context: Context.Context<never>
  }
) => () => void = internalRequest.requestUnsafe

// -----------------------------------------------------------------------------
// Supervision & Fiber's
// -----------------------------------------------------------------------------

/**
 * Returns an effect that forks this effect into its own separate fiber,
 * returning the fiber immediately, without waiting for it to begin executing
 * the effect.
 *
 * **Details**
 *
 * You can use the `forkChild` method whenever you want to execute an effect in a
 * new fiber, concurrently and without "blocking" the fiber executing other
 * effects. Using fibers can be tricky, so instead of using this method
 * directly, consider other higher-level methods, such as `raceWith`,
 * `zipPar`, and so forth.
 *
 * The fiber returned by this method has methods to interrupt the fiber and to
 * wait for it to finish executing the effect. See `Fiber` for more
 * information.
 *
 * Whenever you use this method to launch a new fiber, the new fiber is
 * attached to the parent fiber's scope. This means when the parent fiber
 * terminates, the child fiber will be terminated as well, ensuring that no
 * fibers leak. This behavior is called "auto supervision", and if this
 * behavior is not desired, you may use the `forkDetach` or `forkIn` methods.
 *
 * **Example** (Forking a child fiber)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber } from "effect"
 *
 * const task = Effect.succeed("result")
 *
 * const program = Effect.gen(function*() {
 *   const fiber = yield* task.pipe(Effect.forkChild)
 *   const result = yield* Fiber.join(fiber)
 *   return result
 * })
 *
 * await Effect.runPromise(program) // => "result"
 * ```
 *
 * @category forking
 * @since 4.0.0
 */
export const forkChild: <
  Arg extends Effect<any, any, any> | {
    readonly startImmediately?: boolean | undefined
    readonly uninterruptible?: boolean | "inherit" | undefined
  } | undefined = {
    readonly startImmediately?: boolean | undefined
    readonly uninterruptible?: boolean | "inherit" | undefined
  }
>(
  effectOrOptions?: Arg,
  options?: {
    readonly startImmediately?: boolean | undefined
    readonly uninterruptible?: boolean | "inherit" | undefined
  } | undefined
) => [Arg] extends [Effect<infer _A, infer _E, infer _R>] ? Effect<Fiber<_A, _E>, never, _R>
  : <A, E, R>(self: Effect<A, E, R>) => Effect<Fiber<A, E>, never, R> = internal.forkChild

/**
 * Forks the effect in the specified scope. The fiber will be interrupted
 * when the scope is closed.
 *
 * **Example** (Forking into a supplied scope)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const task = Effect.never
 *
 * const program = Effect.scoped(
 *   Effect.gen(function*() {
 *     const scope = yield* Effect.scope
 *     const fiber = yield* Effect.forkIn(task, scope)
 *     // Fiber will be interrupted when scope closes
 *     return "done"
 *   })
 * )
 *
 * await Effect.runPromise(program) // => "done"
 * ```
 *
 * @category forking
 * @since 2.0.0
 */
export const forkIn: {
  (
    scope: Scope,
    options?: {
      readonly startImmediately?: boolean | undefined
      readonly uninterruptible?: boolean | "inherit" | undefined
    }
  ): <A, E, R>(self: Effect<A, E, R>) => Effect<Fiber<A, E>, never, R>
  <A, E, R>(
    self: Effect<A, E, R>,
    scope: Scope,
    options?: {
      readonly startImmediately?: boolean | undefined
      readonly uninterruptible?: boolean | "inherit" | undefined
    }
  ): Effect<Fiber<A, E>, never, R>
} = internal.forkIn

/**
 * Forks the fiber in a `Scope`, interrupting it when the scope is closed.
 *
 * **Example** (Forking into the current scope)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const backgroundTask = Effect.never
 *
 * const program = Effect.scoped(
 *   Effect.gen(function*() {
 *     yield* backgroundTask.pipe(Effect.forkScoped)
 *
 *     // Fiber will be interrupted when scope closes
 *     return "scope completed"
 *   })
 * )
 *
 * await Effect.runPromise(program) // => "scope completed"
 * ```
 *
 * @category forking
 * @since 2.0.0
 */
export const forkScoped: <
  Arg extends Effect<any, any, any> | {
    readonly startImmediately?: boolean | undefined
    readonly uninterruptible?: boolean | "inherit" | undefined
  } | undefined = {
    readonly startImmediately?: boolean | undefined
    readonly uninterruptible?: boolean | "inherit" | undefined
  }
>(
  effectOrOptions?: Arg,
  options?: {
    readonly startImmediately?: boolean | undefined
    readonly uninterruptible?: boolean | "inherit" | undefined
  } | undefined
) => [Arg] extends [Effect<infer _A, infer _E, infer _R>] ? Effect<Fiber<_A, _E>, never, _R | Scope>
  : <A, E, R>(self: Effect<A, E, R>) => Effect<Fiber<A, E>, never, R | Scope> = internal.forkScoped

/**
 * Forks the effect into a new fiber attached to the global scope. Because the
 * new fiber is attached to the global scope, when the fiber executing the
 * returned effect terminates, the forked fiber will continue running.
 *
 * **Example** (Forking a detached fiber)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber } from "effect"
 *
 * const daemonTask = Effect.succeed("daemon result")
 *
 * const program = Effect.gen(function*() {
 *   const fiber = yield* daemonTask.pipe(Effect.forkDetach)
 *   return yield* Fiber.join(fiber)
 * })
 *
 * await Effect.runPromise(program) // => "daemon result"
 * ```
 *
 * @category forking
 * @since 4.0.0
 */
export const forkDetach: <
  Arg extends Effect<any, any, any> | {
    readonly startImmediately?: boolean | undefined
    readonly uninterruptible?: boolean | "inherit" | undefined
  } | undefined = {
    readonly startImmediately?: boolean | undefined
    readonly uninterruptible?: boolean | "inherit" | undefined
  }
>(
  effectOrOptions?: Arg,
  options?: {
    readonly startImmediately?: boolean | undefined
    readonly uninterruptible?: boolean | "inherit" | undefined
  } | undefined
) => [Arg] extends [Effect<infer _A, infer _E, infer _R>] ? Effect<Fiber<_A, _E>, never, _R>
  : <A, E, R>(self: Effect<A, E, R>) => Effect<Fiber<A, E>, never, R> = internal.forkDetach

/**
 * Waits for all child fibers forked by this effect to complete before this
 * effect completes.
 *
 * **When to use**
 *
 * Use to let an effect start child work concurrently while still delaying its
 * own completion until that child work is done.
 *
 * **Gotchas**
 *
 * Child fibers that already exist before the wrapped effect starts are not
 * awaited.
 *
 * If interrupted while awaiting child fibers after the wrapped effect fails,
 * both the original failure and the interruption are retained in the cause.
 * An enclosing uninterruptible region keeps the child wait uninterruptible.
 *
 * @see {@link forkChild} for forking child fibers that are awaited by this operator
 * @see {@link forkDetach} for forking fibers outside the child scope
 * @see {@link forkIn} for forking into an explicit scope
 * @see {@link forkScoped} for forking fibers tied to the current scope
 *
 * @category forking
 * @since 2.0.0
 */
export const awaitAllChildren: <A, E, R>(self: Effect<A, E, R>) => Effect<A, E, R> = internal.awaitAllChildren

/**
 * Accesses the fiber currently executing the effect.
 *
 * **Example** (Accessing the current fiber)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.gen(function*() {
 *   const fiber = yield* Effect.fiber
 *   yield* Effect.sync(() => { output.push(typeof fiber.id) })
 * })
 *
 * Effect.runSync(program)
 * output // => ["number"]
 * ```
 *
 * @category accessors
 * @since 4.0.0
 */
export const fiber: Effect<Fiber<unknown, unknown>> = internal.fiber

/**
 * Accesses the current fiber id executing the effect.
 *
 * **Example** (Accessing the current fiber id)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const program = Effect.fiberId.pipe(Effect.map((id) => typeof id))
 * Effect.runSync(program) // => "number"
 * ```
 *
 * @category accessors
 * @since 2.0.0
 */
export const fiberId: Effect<number> = internal.fiberId

// -----------------------------------------------------------------------------
// Running Effects
// -----------------------------------------------------------------------------

/**
 * Configuration options for running Effect programs, providing control over
 * interruption and scheduling behavior.
 *
 * **When to use**
 *
 * Use to pass cancellation, scheduler, interruptibility, and fiber-start hooks
 * when running an `Effect` at a program boundary.
 *
 * **Details**
 *
 * `signal` interrupts the fiber, `scheduler` provides the scheduler service,
 * `uninterruptible` starts the fiber uninterruptibly, and `onFiberStart`
 * receives the created fiber.
 *
 * @see {@link runFork} for starting a fiber with these options
 * @see {@link runCallback} for callback-based running with these options
 * @see {@link runPromise} for promise-based running with these options
 * @see {@link runPromiseExit} for promise-based running that returns an `Exit`
 *
 * @category running
 * @since 4.0.0
 */
export interface RunOptions {
  readonly signal?: AbortSignal | undefined
  readonly scheduler?: Scheduler | undefined
  readonly uninterruptible?: boolean | undefined
  readonly onFiberStart?: ((fiber: Fiber<unknown, unknown>) => void) | undefined
}

/**
 * Runs an effect in the background, returning a fiber that can
 * be observed or interrupted.
 *
 * **When to use**
 *
 * Use when you need to start an effect in the background and receive a fiber.
 *
 * **Example** (Running an effect in the background)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber } from "effect"
 * const output: Array<unknown> = []
 *
 * //      ┌─── Effect<number, never, never>
 * //      ▼
 * const program = Effect.sync(() => { output.push("running...") }).pipe(Effect.as("done"))
 *
 * //      ┌─── RuntimeFiber<number, never>
 * //      ▼
 * const fiber = Effect.runFork(program)
 *
 * void output.push(await Effect.runPromise(Fiber.join(fiber)))
 * output // => ["running...", "done"]
 * ```
 *
 * @category running
 * @since 2.0.0
 */
export const runFork: <A, E>(effect: Effect<A, E, never>, options?: RunOptions | undefined) => Fiber<A, E> =
  internal.runFork

/**
 * Runs an effect in the background with the provided services.
 *
 * **When to use**
 *
 * Use when an effect still requires services, you already have a `Context`, and
 * you want a background fiber.
 *
 * **Example** (Running with services in the background)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Fiber } from "effect"
 * const output: Array<unknown> = []
 *
 * interface Logger {
 *   log: (message: string) => void
 * }
 *
 * const Logger = Context.Service<Logger>("Logger")
 *
 * const services = Context.make(Logger, {
 *   log: (message) => void output.push(message)
 * })
 *
 * const program = Effect.gen(function*() {
 *   const logger = yield* Logger
 *   logger.log("Hello from service!")
 *   return "done"
 * })
 *
 * const fiber = Effect.runForkWith(services)(program)
 * void output.push(await Effect.runPromise(Fiber.join(fiber)))
 * output // => ["Hello from service!", "done"]
 * ```
 *
 * @category running
 * @since 4.0.0
 */
export const runForkWith: <R>(
  context: Context.Context<R>
) => <A, E>(effect: Effect<A, E, R>, options?: RunOptions | undefined) => Fiber<A, E> = internal.runForkWith

/**
 * Forks an effect with the provided services, registers `onExit` as a fiber observer, and returns an interruptor.
 *
 * **When to use**
 *
 * Use when embedding an effect into callback-style code with explicit services
 * and a synchronous interruptor.
 *
 * **Details**
 *
 * The returned interruptor calls `fiber.interruptUnsafe`, optionally with an interruptor id.
 *
 * **Example** (Running with services and a callback)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * interface Logger {
 *   log: (message: string) => Effect.Effect<void>
 * }
 *
 * const Logger = Context.Service<Logger>("Logger")
 *
 * const services = Context.make(Logger, {
 *   log: (message) => Effect.sync(() => { output.push(message) })
 * })
 *
 * const program = Effect.gen(function*() {
 *   const logger = yield* Logger
 *   yield* logger.log("Started")
 *   return "done"
 * })
 *
 * await new Promise<void>((resolve) => {
 *   Effect.runCallbackWith(services)(program, {
 *     onExit: (exit) => {
 *       void output.push(exit._tag)
 *       resolve()
 *     }
 *   })
 * })
 * output // => ["Started", "Success"]
 * ```
 *
 * @category running
 * @since 4.0.0
 */
export const runCallbackWith: <R>(
  context: Context.Context<R>
) => <A, E>(
  effect: Effect<A, E, R>,
  options?: (RunOptions & { readonly onExit: (exit: Exit.Exit<A, E>) => void }) | undefined
) => (interruptor?: number | undefined) => void = internal.runCallbackWith

/**
 * Runs an effect asynchronously, registering `onExit` as a fiber observer and
 * returning an interruptor.
 *
 * **Details**
 *
 * The interruptor calls `fiber.interruptUnsafe` with the optional interruptor
 * id.
 *
 * **Example** (Running with a callback)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.gen(function*() {
 *   yield* Effect.sync(() => { output.push("working") })
 *   return "done"
 * })
 *
 * await new Promise<void>((resolve) => {
 *   Effect.runCallback(program, {
 *     onExit: (exit) => {
 *       Effect.runSync(
 *         Exit.match(exit, {
 *           onFailure: () => Effect.sync(() => { output.push("failed") }),
 *           onSuccess: (value) => Effect.sync(() => { output.push(`success: ${value}`) })
 *         })
 *       )
 *       resolve()
 *     }
 *   })
 * })
 *
 * output // => ["working", "success: done"]
 * ```
 *
 * @category running
 * @since 2.0.0
 */
export const runCallback: <A, E>(
  effect: Effect<A, E, never>,
  options?: (RunOptions & { readonly onExit: (exit: Exit.Exit<A, E>) => void }) | undefined
) => (interruptor?: number | undefined) => void = internal.runCallback

/**
 * Executes an effect and returns the result as a `Promise`.
 *
 * **When to use**
 *
 * Use when you need to execute an effect and work with the
 * result using `Promise` syntax, typically for compatibility with other
 * promise-based code.
 *
 * If the effect succeeds, the promise will resolve with the result. If the
 * effect fails, the promise will reject with an error.
 *
 * **Example** (Running a successful effect as a Promise)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * await Effect.runPromise(Effect.succeed(1)) // => 1
 * ```
 *
 * **Example** (Running effects as promises)
 *
 * ```ts import.meta.vitest
 * //Example: Handling a Failing Effect as a Rejected Promise
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * await Effect.runPromise(Effect.fail("my error")).catch(() => {
 *   void output.push("rejected")
 * })
 * output // => ["rejected"]
 * ```
 *
 * @see {@link runPromiseExit} for a version that returns an `Exit` type instead of rejecting.
 * @category running
 * @since 2.0.0
 */
export const runPromise: <A, E>(
  effect: Effect<A, E>,
  options?: RunOptions | undefined
) => Promise<A> = internal.runPromise

/**
 * Executes an effect as a Promise with the provided services.
 *
 * **When to use**
 *
 * Use when you already have a `Context` and need Promise interop that rejects on
 * effect failure.
 *
 * **Example** (Running with services as a promise)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect } from "effect"
 *
 * interface Config {
 *   apiUrl: string
 * }
 *
 * const Config = Context.Service<Config>("Config")
 *
 * const context = Context.make(Config, {
 *   apiUrl: "https://api.example.com"
 * })
 *
 * const program = Effect.gen(function*() {
 *   const config = yield* Config
 *   return `Connecting to ${config.apiUrl}`
 * })
 *
 * await Effect.runPromiseWith(context)(program) // => "Connecting to https://api.example.com"
 * ```
 *
 * @category running
 * @since 4.0.0
 */
export const runPromiseWith: <R>(
  context: Context.Context<R>
) => <A, E>(effect: Effect<A, E, R>, options?: RunOptions | undefined) => Promise<A> = internal.runPromiseWith

/**
 * Runs an effect and returns a `Promise` that resolves to an `Exit`, which
 * represents the outcome (success or failure) of the effect.
 *
 * **When to use**
 *
 * Use when you need to determine if an effect succeeded
 * or failed, including any defects, and you want to work with a `Promise`.
 *
 * **Details**
 *
 * The `Exit` type represents the result of the effect. Successful effects are
 * wrapped in `Success`, and failed effects are wrapped in `Failure` with a
 * `Cause`.
 *
 * **Example** (Observing promise results as Exit)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit } from "effect"
 *
 * // Execute a successful effect and get the Exit result as a Promise
 * await Effect.runPromiseExit(Effect.succeed(1)) // => Exit.succeed(1)
 *
 * // Execute a failing effect and get the Exit result as a Promise
 * await Effect.runPromiseExit(Effect.fail("my error")) // => Exit.fail("my error")
 * ```
 *
 * @see {@link runPromise} for a version that rejects on failure.
 *
 * @category running
 * @since 2.0.0
 */
export const runPromiseExit: <A, E>(
  effect: Effect<A, E>,
  options?: RunOptions | undefined
) => Promise<Exit.Exit<A, E>> = internal.runPromiseExit

/**
 * Runs an effect and returns a Promise of Exit with provided services.
 *
 * **When to use**
 *
 * Use when you already have a `Context` and need Promise interop that preserves
 * success and failure as an `Exit`.
 *
 * **Example** (Running with services as an Exit promise)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Exit } from "effect"
 * const output: Array<unknown> = []
 *
 * interface Database {
 *   query: (sql: string) => string
 * }
 *
 * const Database = Context.Service<Database>("Database")
 *
 * const services = Context.make(Database, {
 *   query: (sql) => `Result for: ${sql}`
 * })
 *
 * const program = Effect.gen(function*() {
 *   const db = yield* Database
 *   return db.query("SELECT * FROM users")
 * })
 *
 * const exit = await Effect.runPromiseExitWith(services)(program)
 * if (Exit.isSuccess(exit)) {
 *   void output.push(`Success: ${exit.value}`)
 * }
 * output // => ["Success: Result for: SELECT * FROM users"]
 * ```
 *
 * @category running
 * @since 4.0.0
 */
export const runPromiseExitWith: <R>(
  context: Context.Context<R>
) => <A, E>(effect: Effect<A, E, R>, options?: RunOptions | undefined) => Promise<Exit.Exit<A, E>> =
  internal.runPromiseExitWith

/**
 * Executes an effect synchronously and returns its success value.
 *
 * **When to use**
 *
 * Use when you need to execute an effect that is guaranteed to complete
 * synchronously.
 *
 * **Details**
 *
 * If the effect fails, dies, is interrupted, or performs asynchronous work,
 * `runSync` throws a `FiberFailure` instead of returning a value. Use
 * `runSyncExit` when you want the failure captured as an `Exit`.
 *
 * **Example** (Running a synchronous effect)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.sync(() => {
 *   void output.push("Hello, World!")
 *   return 1
 * })
 *
 * const result = Effect.runSync(program)
 * void output.push(result)
 * output // => ["Hello, World!", 1]
 * ```
 *
 * **Example** (Throwing for failed or async effects)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * try {
 *   // Attempt to run an effect that fails
 *   Effect.runSync(Effect.fail("my error"))
 * } catch (e) {
 *   void output.push("failed effect")
 * }
 * try {
 *   // Attempt to run an effect that involves async work
 *   Effect.runSync(Effect.promise(() => Promise.resolve(1)))
 * } catch (e) {
 *   void output.push("async effect")
 * }
 * output // => ["failed effect", "async effect"]
 * ```
 *
 * @see {@link runSyncExit} for a version that returns an `Exit` type instead of
 * throwing an error.
 * @category running
 * @since 2.0.0
 */
export const runSync: <A, E>(effect: Effect<A, E>) => A = internal.runSync

/**
 * Executes an effect synchronously with provided services.
 *
 * **When to use**
 *
 * Use when you already have a `Context`, the effect is known to complete
 * synchronously, and failures should throw.
 *
 * **Example** (Running synchronously with services)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect } from "effect"
 *
 * interface MathService {
 *   add: (a: number, b: number) => number
 * }
 *
 * const MathService = Context.Service<MathService>("MathService")
 *
 * const context = Context.make(MathService, {
 *   add: (a, b) => a + b
 * })
 *
 * const program = Effect.gen(function*() {
 *   const math = yield* MathService
 *   return math.add(2, 3)
 * })
 *
 * const result = Effect.runSyncWith(context)(program)
 * result // => 5
 * ```
 *
 * @category running
 * @since 4.0.0
 */
export const runSyncWith: <R>(
  context: Context.Context<R>
) => <A, E>(effect: Effect<A, E, R>) => A = internal.runSyncWith

/**
 * Runs an effect synchronously and captures the outcome safely as an `Exit` type, which
 * represents the outcome (success or failure) of the effect.
 *
 * **When to use**
 *
 * Use to find out whether an effect succeeded or failed,
 * including any defects, without dealing with asynchronous operations.
 *
 * **Details**
 *
 * The `Exit` type represents the result of the effect. Successful effects are
 * wrapped in `Success`, and failed effects are wrapped in `Failure` with a
 * `Cause`.
 *
 * If the effect contains asynchronous operations, `runSyncExit` will
 * return an `Failure` with a `Die` cause, indicating that the effect cannot be
 * resolved synchronously.
 *
 * **Example** (Observing synchronous results as Exit)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit } from "effect"
 *
 * Effect.runSyncExit(Effect.succeed(1)) // => Exit.succeed(1)
 *
 * Effect.runSyncExit(Effect.fail("my error")) // => Exit.fail("my error")
 * ```
 *
 * **Example** (Capturing async work as a Die cause)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect, Exit } from "effect"
 *
 * const exit = Effect.runSyncExit(Effect.promise(() => Promise.resolve(1)))
 * const isAsyncDie = Exit.hasDies(exit) && exit.cause.reasons.some(
 *   (reason) => Cause.isDieReason(reason) && Cause.isAsyncFiberError(reason.defect)
 * )
 *
 * isAsyncDie // => true
 * ```
 *
 * @see {@link runSync} for a version that throws on failure.
 *
 * @category running
 * @since 2.0.0
 */
export const runSyncExit: <A, E>(effect: Effect<A, E>) => Exit.Exit<A, E> = internal.runSyncExit

/**
 * Runs an effect synchronously with provided services, returning an Exit result safely.
 *
 * **When to use**
 *
 * Use when you already have a `Context` and need a synchronous `Exit` instead of
 * throwing on failure.
 *
 * **Example** (Running synchronously with services as Exit)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Exit } from "effect"
 * const output: Array<unknown> = []
 *
 * // Define a logger service
 * const Logger = Context.Service<{
 *   log: (msg: string) => void
 * }>("Logger")
 *
 * const program = Effect.gen(function*() {
 *   const logger = yield* Effect.service(Logger)
 *   logger.log("Computing result...")
 *   return 42
 * })
 *
 * // Prepare context
 * const context = Context.make(Logger, {
 *   log: (msg) => void output.push(`[LOG] ${msg}`)
 * })
 *
 * const exit = Effect.runSyncExitWith(context)(program)
 *
 * if (Exit.isSuccess(exit)) {
 *   void output.push(`Success: ${exit.value}`)
 * } else {
 *   void output.push(`Failure: ${exit.cause}`)
 * }
 * output // => ["[LOG] Computing result...", "Success: 42"]
 * ```
 *
 * @category running
 * @since 4.0.0
 */
export const runSyncExitWith: <R>(
  context: Context.Context<R>
) => <A, E>(effect: Effect<A, E, R>) => Exit.Exit<A, E> = internal.runSyncExitWith

// -----------------------------------------------------------------------------
// Function
// -----------------------------------------------------------------------------

/**
 * Type helpers for functions built with `Effect.fn` and `Effect.fnUntraced`.
 *
 * **Details**
 *
 * Use these to describe generator-based signatures and traced or untraced variants.
 *
 * @category constructors
 * @since 3.11.0
 */
export declare namespace fn {
  /**
   * Generator return type accepted by {@link fn} and {@link fnUntraced}.
   *
   * **When to use**
   *
   * Use when you need to annotate the return type of a generator body while
   * keeping the produced function's `Effect` return type inferred.
   *
   * **Example** (Annotating an Effect function)
   *
   * ```ts import.meta.vitest
   * import { Effect } from "effect"
   *
   * const f = Effect.fnUntraced(function*(
   *   value: string
   * ): Effect.fn.Return<number> {
   *   return yield* Effect.succeed(value.length)
   * })
   *
   * //      ┌─── Effect.Effect<number>
   * //      ▼
   * const program = f("hello")
   * Effect.runSync(program) // => 5
   * ```
   *
   * **Example** (Annotating a parametric Effect function)
   *
   * ```ts import.meta.vitest
   * import { Effect } from "effect"
   *
   * const f = Effect.fnUntraced(function*<A>(
   *   value: A
   * ): Effect.fn.Return<A> {
   *   return yield* Effect.succeed(value)
   * })
   *
   * //      ┌─── Effect.Effect<string>
   * //      ▼
   * const program = f("hello")
   * Effect.runSync(program) // => "hello"
   * ```
   *
   * @category utility types
   * @since 3.19.0
   */
  export type Return<A, E = never, R = never> = Generator<Effect<any, E, R>, A, any>

  /**
   * Type of the untraced function builder used by `Effect.fnUntraced`.
   *
   * @category utility types
   * @since 3.11.0
   */
  export type Untraced = {
    <Eff extends Effect<any, any, any>, AEff, Args extends Array<any>>(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never>
    ): (...args: Args) => Effect<
      AEff,
      [Eff] extends [never] ? never
        : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
        : never,
      [Eff] extends [never] ? never
        : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
        : never
    >
    <Self, Eff extends Effect<any, any, any>, AEff, Args extends Array<any>>(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never>
    ): (this: Self, ...args: Args) => Effect<
      AEff,
      [Eff] extends [never] ? never
        : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
        : never,
      [Eff] extends [never] ? never
        : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
        : never
    >

    <Eff extends Effect<any, any, any>, AEff, Args extends Array<any>, A>(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A
    ): (...args: Args) => A
    <Self, Eff extends Effect<any, any, any>, AEff, Args extends Array<any>, A>(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A
    ): (this: Self, ...args: Args) => A
    <Eff extends Effect<any, any, any>, AEff, Args extends Array<any>, A, B>(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B
    ): (...args: Args) => B
    <Self, Eff extends Effect<any, any, any>, AEff, Args extends Array<any>, A, B>(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B
    ): (this: Self, ...args: Args) => B
    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C
    ): (...args: Args) => C
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C
    ): (this: Self, ...args: Args) => C
    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D
    >(
      body: (...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D
    ): (...args: Args) => D
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D
    ): (this: Self, ...args: Args) => D
    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E
    ): (...args: Args) => E
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E
    ): (this: Self, ...args: Args) => E
    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F
    ): (...args: Args) => F
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F
    ): (this: Self, ...args: Args) => F
    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G
    ): (...args: Args) => G
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G
    ): (this: Self, ...args: Args) => G
    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H
    ): (...args: Args) => H
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H
    ): (this: Self, ...args: Args) => H
    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I
    ): (...args: Args) => I
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I
    ): (this: Self, ...args: Args) => I
    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J
    ): (...args: Args) => J
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J
    ): (this: Self, ...args: Args) => J
    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K
    ): (...args: Args) => K
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K
    ): (this: Self, ...args: Args) => K
    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L
    ): (...args: Args) => L
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L
    ): (this: Self, ...args: Args) => L
    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M
    ): (...args: Args) => M
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M
    ): (this: Self, ...args: Args) => M
    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N
    ): (...args: Args) => N
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N
    ): (this: Self, ...args: Args) => N
    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O
    ): (...args: Args) => O
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O
    ): (this: Self, ...args: Args) => O
    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P
    ): (...args: Args) => P
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P
    ): (this: Self, ...args: Args) => P
    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P,
      Q
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P,
      q: (_: P, ...args: Args) => Q
    ): (...args: Args) => Q
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P,
      Q
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P,
      q: (_: P, ...args: Args) => Q
    ): (this: Self, ...args: Args) => Q
    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P,
      Q,
      R
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P,
      q: (_: P, ...args: Args) => Q,
      r: (_: Q, ...args: Args) => R
    ): (...args: Args) => R
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P,
      Q,
      R
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P,
      q: (_: P, ...args: Args) => Q,
      r: (_: Q, ...args: Args) => R
    ): (this: Self, ...args: Args) => R
    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P,
      Q,
      R,
      S
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P,
      q: (_: P, ...args: Args) => Q,
      r: (_: Q, ...args: Args) => R,
      s: (_: R, ...args: Args) => S
    ): (...args: Args) => S
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P,
      Q,
      R,
      S
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P,
      q: (_: P, ...args: Args) => Q,
      r: (_: Q, ...args: Args) => R,
      s: (_: R, ...args: Args) => S
    ): (this: Self, ...args: Args) => S
    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P,
      Q,
      R,
      S,
      T
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P,
      q: (_: P, ...args: Args) => Q,
      r: (_: Q, ...args: Args) => R,
      s: (_: R, ...args: Args) => S,
      t: (_: S, ...args: Args) => T
    ): (...args: Args) => T
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P,
      Q,
      R,
      S,
      T
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never>,
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P,
      q: (_: P, ...args: Args) => Q,
      r: (_: Q, ...args: Args) => R,
      s: (_: R, ...args: Args) => S,
      t: (_: S, ...args: Args) => T
    ): (this: Self, ...args: Args) => T
  }

  /**
   * Type of the traced function builder used by `Effect.fn`.
   *
   * @category utility types
   * @since 4.0.0
   */
  export type Traced = {
    <Eff extends Effect<any, any, any>, AEff, Args extends Array<any>>(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>)
    ): (...args: Args) => Effect<
      AEff,
      [Eff] extends [never] ? never
        : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
        : never,
      [Eff] extends [never] ? never
        : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
        : never
    >
    <Self, Eff extends Effect<any, any, any>, AEff, Args extends Array<any>>(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>)
    ): (this: Self, ...args: Args) => Effect<
      AEff,
      [Eff] extends [never] ? never
        : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
        : never,
      [Eff] extends [never] ? never
        : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
        : never
    >
    <Self, Eff extends Effect<any, any, any>, AEff, Args extends Array<any>>(
      options: { readonly self: Self },
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>)
    ): (...args: Args) => Effect<
      AEff,
      [Eff] extends [never] ? never
        : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
        : never,
      [Eff] extends [never] ? never
        : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
        : never
    >

    <Eff extends Effect<any, any, any>, AEff, Args extends Array<any>, A>(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A
    ): (...args: Args) => A
    <Self, Eff extends Effect<any, any, any>, AEff, Args extends Array<any>, A>(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A
    ): (this: Self, ...args: Args) => A
    <Self, Eff extends Effect<any, any, any>, AEff, Args extends Array<any>, A>(
      options: { readonly self: Self },
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A
    ): (...args: Args) => A

    <Eff extends Effect<any, any, any>, AEff, Args extends Array<any>, A, B>(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B
    ): (...args: Args) => B
    <Self, Eff extends Effect<any, any, any>, AEff, Args extends Array<any>, A, B>(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B
    ): (this: Self, ...args: Args) => B
    <Self, Eff extends Effect<any, any, any>, AEff, Args extends Array<any>, A, B>(
      options: { readonly self: Self },
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B
    ): (...args: Args) => B

    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C
    ): (...args: Args) => C
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C
    ): (this: Self, ...args: Args) => C
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C
    >(
      options: { readonly self: Self },
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C
    ): (...args: Args) => C

    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D
    ): (...args: Args) => D
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D
    ): (this: Self, ...args: Args) => D

    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D
    >(
      options: { readonly self: Self },
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D
    ): (...args: Args) => D

    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E
    ): (...args: Args) => E
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E
    ): (this: Self, ...args: Args) => E

    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E
    >(
      options: { readonly self: Self },
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E
    ): (...args: Args) => E

    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F
    ): (...args: Args) => F
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F
    ): (this: Self, ...args: Args) => F

    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F
    >(
      options: { readonly self: Self },
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F
    ): (...args: Args) => F

    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G
    ): (...args: Args) => G
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G
    ): (this: Self, ...args: Args) => G

    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G
    >(
      options: { readonly self: Self },
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G
    ): (...args: Args) => G

    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H
    ): (...args: Args) => H
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H
    ): (this: Self, ...args: Args) => H

    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H
    >(
      options: { readonly self: Self },
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H
    ): (...args: Args) => H

    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I
    ): (...args: Args) => I
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I
    ): (this: Self, ...args: Args) => I

    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I
    >(
      options: { readonly self: Self },
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I
    ): (...args: Args) => I

    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J
    ): (...args: Args) => J
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J
    ): (this: Self, ...args: Args) => J

    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J
    >(
      options: { readonly self: Self },
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J
    ): (...args: Args) => J

    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K
    ): (...args: Args) => K
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K
    ): (this: Self, ...args: Args) => K

    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K
    >(
      options: { readonly self: Self },
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K
    ): (...args: Args) => K

    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L
    ): (...args: Args) => L
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L
    ): (this: Self, ...args: Args) => L

    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L
    >(
      options: { readonly self: Self },
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L
    ): (...args: Args) => L

    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M
    ): (...args: Args) => M
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M
    ): (this: Self, ...args: Args) => M

    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M
    >(
      options: { readonly self: Self },
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M
    ): (...args: Args) => M

    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N
    ): (...args: Args) => N
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N
    ): (this: Self, ...args: Args) => N

    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N
    >(
      options: { readonly self: Self },
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N
    ): (...args: Args) => N

    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O
    ): (...args: Args) => O
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O
    ): (this: Self, ...args: Args) => O

    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O
    >(
      options: { readonly self: Self },
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O
    ): (...args: Args) => O

    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P
    ): (...args: Args) => P
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P
    ): (this: Self, ...args: Args) => P

    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P
    >(
      options: { readonly self: Self },
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P
    ): (...args: Args) => P

    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P,
      Q
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P,
      q: (_: P, ...args: Args) => Q
    ): (...args: Args) => Q
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P,
      Q
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P,
      q: (_: P, ...args: Args) => Q
    ): (this: Self, ...args: Args) => Q

    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P,
      Q
    >(
      options: { readonly self: Self },
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P,
      q: (_: P, ...args: Args) => Q
    ): (...args: Args) => Q

    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P,
      Q,
      R
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P,
      q: (_: P, ...args: Args) => Q,
      r: (_: Q, ...args: Args) => R
    ): (...args: Args) => R
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P,
      Q,
      R
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P,
      q: (_: P, ...args: Args) => Q,
      r: (_: Q, ...args: Args) => R
    ): (this: Self, ...args: Args) => R

    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P,
      Q,
      R
    >(
      options: { readonly self: Self },
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P,
      q: (_: P, ...args: Args) => Q,
      r: (_: Q, ...args: Args) => R
    ): (...args: Args) => R

    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P,
      Q,
      R,
      S
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P,
      q: (_: P, ...args: Args) => Q,
      r: (_: Q, ...args: Args) => R,
      s: (_: R, ...args: Args) => S
    ): (...args: Args) => S
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P,
      Q,
      R,
      S
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P,
      q: (_: P, ...args: Args) => Q,
      r: (_: Q, ...args: Args) => R,
      s: (_: R, ...args: Args) => S
    ): (this: Self, ...args: Args) => S

    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P,
      Q,
      R,
      S
    >(
      options: { readonly self: Self },
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P,
      q: (_: P, ...args: Args) => Q,
      r: (_: Q, ...args: Args) => R,
      s: (_: R, ...args: Args) => S
    ): (...args: Args) => S

    <
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P,
      Q,
      R,
      S,
      T
    >(
      body: (this: unassigned, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P,
      q: (_: P, ...args: Args) => Q,
      r: (_: Q, ...args: Args) => R,
      s: (_: R, ...args: Args) => S,
      t: (_: S, ...args: Args) => T
    ): (...args: Args) => T
    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P,
      Q,
      R,
      S,
      T
    >(
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P,
      q: (_: P, ...args: Args) => Q,
      r: (_: Q, ...args: Args) => R,
      s: (_: R, ...args: Args) => S,
      t: (_: S, ...args: Args) => T
    ): (this: Self, ...args: Args) => T

    <
      Self,
      Eff extends Effect<any, any, any>,
      AEff,
      Args extends Array<any>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N,
      O,
      P,
      Q,
      R,
      S,
      T
    >(
      options: { readonly self: Self },
      body: (this: Self, ...args: Args) => Generator<Eff, AEff, never> | (Eff & Effect<AEff, any, any>),
      a: (
        _: Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect<infer _A, infer _E, infer R>] ? R
            : never
        >,
        ...args: Args
      ) => A,
      b: (_: A, ...args: Args) => B,
      c: (_: B, ...args: Args) => C,
      d: (_: C, ...args: Args) => D,
      e: (_: D, ...args: Args) => E,
      f: (_: E, ...args: Args) => F,
      g: (_: F, ...args: Args) => G,
      h: (_: G, ...args: Args) => H,
      i: (_: H, ...args: Args) => I,
      j: (_: I, ...args: Args) => J,
      k: (_: J, ...args: Args) => K,
      l: (_: K, ...args: Args) => L,
      m: (_: L, ...args: Args) => M,
      n: (_: M, ...args: Args) => N,
      o: (_: N, ...args: Args) => O,
      p: (_: O, ...args: Args) => P,
      q: (_: P, ...args: Args) => Q,
      r: (_: Q, ...args: Args) => R,
      s: (_: R, ...args: Args) => S,
      t: (_: S, ...args: Args) => T
    ): (...args: Args) => T
  }
}

/**
 * Creates an Effect-returning function without tracing.
 *
 * **When to use**
 *
 * Use when you are defining a reusable Effect function whose implementation
 * would otherwise be a normal function returning {@link gen}, especially when
 * tracing spans or stack-frame capture are not needed.
 *
 * **Details**
 *
 * Compared to a plain function that returns {@link gen}, `Effect.fnUntraced`
 * reuses the generator body instead of allocating a fresh generator closure
 * around the arguments on every call. It does not record an Effect stack-frame
 * boundary and does not create tracing spans. Use {@link fn} when you need
 * those stack frames or spans. Additional arguments after the generator body
 * act like `pipe` transforms: each transform receives the previous result and
 * the original function arguments. Annotate the generator return type with
 * `Effect.fn.Return<A, E, R>` when the produced `Effect` type needs to be
 * stated explicitly.
 *
 * **Example** (Defining untraced effect functions)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const f = Effect.fnUntraced(function*(
 *   value: string
 * ) {
 *   return yield* Effect.succeed(value.length)
 * })
 *
 * //      ┌─── Effect.Effect<number>
 * //      ▼
 * const program = f("hello")
 * Effect.runSync(program) // => 5
 * ```
 *
 * **Example** (Transforming the returned Effect)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const f = Effect.fnUntraced(
 *   function*(value: string) {
 *     return yield* Effect.succeed(value.length)
 *   },
 *   (effect, value) =>
 *     effect.pipe(Effect.map((length) => `${value}: ${length}`))
 * )
 *
 * //      ┌─── Effect.Effect<string>
 * //      ▼
 * const program = f("hello")
 * Effect.runSync(program) // => "hello: 5"
 * ```
 *
 * **Example** (Annotating an untraced non-parametric function)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const f = Effect.fnUntraced(function*(
 *   value: string
 * ): Effect.fn.Return<number> {
 *   return yield* Effect.succeed(value.length)
 * })
 *
 * //      ┌─── Effect.Effect<number>
 * //      ▼
 * const program = f("hello")
 * Effect.runSync(program) // => 5
 * ```
 *
 * **Example** (Annotating an untraced parametric function)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const f = Effect.fnUntraced(function*<A>(
 *   value: A
 * ): Effect.fn.Return<A> {
 *   return yield* Effect.succeed(value)
 * })
 *
 * //      ┌─── Effect.Effect<string>
 * //      ▼
 * const program = f("hello")
 * Effect.runSync(program) // => "hello"
 * ```
 *
 * @category constructors
 * @since 3.12.0
 */
export const fnUntraced: fn.Untraced = internal.fnUntraced

/**
 * Creates a reusable traced function from an Effect body.
 *
 * **When to use**
 *
 * Use when you are defining a reusable Effect function whose implementation
 * would otherwise be a normal function returning {@link gen}, and you want
 * tracing spans or stack-frame capture.
 *
 * **Details**
 *
 * Compared to a plain function that returns {@link gen}, `Effect.fn` reuses the
 * generator body instead of allocating a fresh generator closure around the
 * arguments on every call. Call `Effect.fn(body, ...)` for a generic
 * stack-frame boundary without creating a span. Call
 * `Effect.fn("operationName", options?)(body, ...)` when that boundary should
 * have a readable operation name and the returned `Effect` should create a
 * tracing span when run. {@link SpanOptionsNoTrace} configures span metadata
 * such as attributes, links, parent or root selection, kind, sampling, and log
 * level. Additional arguments after the generator body act like `pipe`
 * transforms: each transform receives the previous result and the original
 * function arguments. When those transforms return an `Effect`, the returned
 * effect includes stack-frame metadata and, for the named form, a tracing span.
 * Generator bodies may declare a `this` parameter; pass `{ self }` before the
 * body to bind `this` when the function is created.
 *
 * **Example** (Defining traced effect functions)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const f = Effect.fn("calculateLength")(function*(value: string) {
 *   return yield* Effect.succeed(value.length)
 * })
 *
 * //      ┌─── Effect.Effect<number>
 * //      ▼
 * const program = f("hello")
 * Effect.runSync(program) // => 5
 * ```
 *
 * **Example** (Transforming the returned Effect)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const f = Effect.fn("formatLength")(
 *   function*(value: string) {
 *     return yield* Effect.succeed(value.length)
 *   },
 *   (effect, value) =>
 *     effect.pipe(Effect.map((length) => `${value}: ${length}`))
 * )
 *
 * //      ┌─── Effect.Effect<string>
 * //      ▼
 * const program = f("hello")
 * Effect.runSync(program) // => "hello: 5"
 * ```
 *
 * **Example** (Binding this)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * class Counter {
 *   count = 0
 *
 *   increment = Effect.fn("Counter.increment")(
 *     { self: this },
 *     function*(this: Counter, by: number) {
 *       this.count += by
 *       return yield* Effect.succeed(this.count)
 *     }
 *   )
 * }
 *
 * const counter = new Counter()
 *
 * //      ┌─── Effect.Effect<number>
 * //      ▼
 * const program = counter.increment(1)
 * Effect.runSync(program) // => 1
 * ```
 *
 * **Example** (Annotating a traced non-parametric function)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const f = Effect.fn("calculateLength")(function*(
 *   value: string
 * ): Effect.fn.Return<number> {
 *   return yield* Effect.succeed(value.length)
 * })
 *
 * //      ┌─── Effect.Effect<number>
 * //      ▼
 * const program = f("hello")
 * Effect.runSync(program) // => 5
 * ```
 *
 * **Example** (Annotating a traced parametric function)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const f = Effect.fn("succeed")(function*<A>(
 *   value: A
 * ): Effect.fn.Return<A> {
 *   return yield* Effect.succeed(value)
 * })
 *
 * //      ┌─── Effect.Effect<string>
 * //      ▼
 * const program = f("hello")
 * Effect.runSync(program) // => "hello"
 * ```
 *
 * @category constructors
 * @since 3.11.0
 */
export const fn: fn.Traced & {
  (name: string, options?: SpanOptionsNoTrace): fn.Traced
} = internal.fn

// ========================================================================
// Clock
// ========================================================================

/**
 * Retrieves the `Clock` service from the context and provides it to the
 * specified effectful function.
 *
 * **Example** (Accessing the Clock service)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const program = Effect.clockWith((clock) =>
 *   clock.currentTimeMillis.pipe(
 *     Effect.map(() => "Clock is available")
 *   )
 * )
 *
 * Effect.runSync(program) // => "Clock is available"
 * ```
 *
 * @category accessors
 * @since 2.0.0
 */
export const clockWith: <A, E, R>(
  f: (clock: Clock) => Effect<A, E, R>
) => Effect<A, E, R> = internal.clockWith

// ========================================================================
// Logging
// ========================================================================

/**
 * Creates a logger function that logs at the specified level.
 *
 * **Details**
 *
 * If no level is provided, the logger uses the fiber's current log level and
 * extracts any `Cause` values from the message list.
 *
 * **Example** (Logging at a dynamic level)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger, References } from "effect"
 * const output: Array<unknown> = []
 *
 * const logWarn = Effect.logWithLevel("Warn")
 *
 * const program = Effect.gen(function*() {
 *   yield* logWarn("Cache miss")
 * })
 * const logger = Logger.make<unknown, void>(({ logLevel, message }) => {
 *   void output.push(`${logLevel}: ${Array.isArray(message) ? message.map(String).join(" ") : String(message)}`)
 * })
 * const runnable = program.pipe(
 *   Effect.provideService(References.MinimumLogLevel, "Debug"),
 *   Effect.provide(Logger.layer([logger]))
 * )
 * Effect.runSync(runnable)
 * output // => ["Warn: Cache miss"]
 * ```
 *
 * @category logging
 * @since 2.0.0
 */
export const logWithLevel: (level?: Severity) => (...message: ReadonlyArray<any>) => Effect<void> =
  internal.logWithLevel

/**
 * Logs one or more messages using the default log level.
 *
 * **Example** (Logging at the default level)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.gen(function*() {
 *   const result = 2 + 2
 *   yield* Effect.log("Result:", result)
 *   return result
 * })
 *
 * const logger = Logger.make<unknown, void>(({ logLevel, message }) => {
 *   void output.push(`${logLevel}: ${Array.isArray(message) ? message.map(String).join(" ") : String(message)}`)
 * })
 * const runnable = Effect.provide(program, Logger.layer([logger]))
 * void output.push(Effect.runSync(runnable))
 * output // => ["Info: Result: 4", 4]
 * ```
 *
 * @category logging
 * @since 2.0.0
 */
export const log: (...message: ReadonlyArray<any>) => Effect<void> = internal.logWithLevel()

/**
 * Logs one or more messages at the FATAL level.
 *
 * **Example** (Logging fatal messages)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.gen(function*() {
 *   yield* Effect.logFatal("Critical system failure")
 * })
 *
 * const logger = Logger.make<unknown, void>(({ logLevel, message }) => {
 *   void output.push(`${logLevel}: ${Array.isArray(message) ? message.map(String).join(" ") : String(message)}`)
 * })
 * const runnable = Effect.provide(program, Logger.layer([logger]))
 * Effect.runSync(runnable)
 * output // => ["Fatal: Critical system failure"]
 * ```
 *
 * @category logging
 * @since 2.0.0
 */
export const logFatal: (...message: ReadonlyArray<any>) => Effect<void> = internal.logWithLevel("Fatal")

/**
 * Logs one or more messages at the WARNING level.
 *
 * **Example** (Logging warnings)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.gen(function*() {
 *   yield* Effect.logWarning("API rate limit approaching")
 * })
 *
 * const logger = Logger.make<unknown, void>(({ logLevel, message }) => {
 *   void output.push(`${logLevel}: ${Array.isArray(message) ? message.map(String).join(" ") : String(message)}`)
 * })
 * Effect.runSync(Effect.provide(program, Logger.layer([logger])))
 * output // => ["Warn: API rate limit approaching"]
 * ```
 *
 * @category logging
 * @since 2.0.0
 */
export const logWarning: (...message: ReadonlyArray<any>) => Effect<void> = internal.logWithLevel("Warn")

/**
 * Logs one or more messages at the ERROR level.
 *
 * **Example** (Logging errors)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.gen(function*() {
 *   yield* Effect.logError("Database connection failed")
 * })
 *
 * const logger = Logger.make<unknown, void>(({ logLevel, message }) => {
 *   void output.push(`${logLevel}: ${Array.isArray(message) ? message.map(String).join(" ") : String(message)}`)
 * })
 * Effect.runSync(Effect.provide(program, Logger.layer([logger])))
 * output // => ["Error: Database connection failed"]
 * ```
 *
 * @category logging
 * @since 2.0.0
 */
export const logError: (...message: ReadonlyArray<any>) => Effect<void> = internal.logWithLevel("Error")

/**
 * Logs one or more messages at the INFO level.
 *
 * **Example** (Logging information)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.gen(function*() {
 *   yield* Effect.logInfo("Application starting up")
 * })
 *
 * const logger = Logger.make<unknown, void>(({ logLevel, message }) => {
 *   void output.push(`${logLevel}: ${Array.isArray(message) ? message.map(String).join(" ") : String(message)}`)
 * })
 * Effect.runSync(Effect.provide(program, Logger.layer([logger])))
 * output // => ["Info: Application starting up"]
 * ```
 *
 * @category logging
 * @since 2.0.0
 */
export const logInfo: (...message: ReadonlyArray<any>) => Effect<void> = internal.logWithLevel("Info")

/**
 * Logs one or more messages at the DEBUG level.
 *
 * **Example** (Logging debug messages)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger, References } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.gen(function*() {
 *   yield* Effect.logDebug("Debug mode enabled")
 * })
 *
 * const logger = Logger.make<unknown, void>(({ logLevel, message }) => {
 *   void output.push(`${logLevel}: ${Array.isArray(message) ? message.map(String).join(" ") : String(message)}`)
 * })
 * const runnable = program.pipe(
 *   Effect.provideService(References.MinimumLogLevel, "Debug"),
 *   Effect.provide(Logger.layer([logger]))
 * )
 * Effect.runSync(runnable)
 * output // => ["Debug: Debug mode enabled"]
 * ```
 *
 * @category logging
 * @since 2.0.0
 */
export const logDebug: (...message: ReadonlyArray<any>) => Effect<void> = internal.logWithLevel("Debug")

/**
 * Logs one or more messages at the TRACE level.
 *
 * **Example** (Logging trace messages)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger, References } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.gen(function*() {
 *   yield* Effect.logTrace("Entering function processData")
 * })
 *
 * const logger = Logger.make<unknown, void>(({ logLevel, message }) => {
 *   void output.push(`${logLevel}: ${Array.isArray(message) ? message.map(String).join(" ") : String(message)}`)
 * })
 * const runnable = program.pipe(
 *   Effect.provideService(References.MinimumLogLevel, "Trace"),
 *   Effect.provide(Logger.layer([logger]))
 * )
 * Effect.runSync(runnable)
 * output // => ["Trace: Entering function processData"]
 * ```
 *
 * @category logging
 * @since 2.0.0
 */
export const logTrace: (...message: ReadonlyArray<any>) => Effect<void> = internal.logWithLevel("Trace")

/**
 * Adds a logger to the set of loggers which will output logs for this effect.
 *
 * **Example** (Adding a logger to an effect)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 * const output: Array<unknown> = []
 *
 * // Create a custom logger that logs to the console
 * const customLogger = Logger.make<unknown, void>(({ message }) =>
 *   void output.push(`[CUSTOM]: ${Array.isArray(message) ? message.map(String).join(" ") : String(message)}`)
 * )
 *
 * const program = Effect.gen(function*() {
 *   yield* Effect.log("This will go to both default and custom logger")
 *   return "completed"
 * })
 *
 * // Add the custom logger to the effect
 * const programWithLogger = Effect.withLogger(program, customLogger)
 *
 * Effect.runSync(Effect.provide(programWithLogger, Logger.layer([])))
 * output // => ["[CUSTOM]: This will go to both default and custom logger"]
 * ```
 *
 * @category logging
 * @since 4.0.0
 */
export const withLogger: {
  <Output>(
    logger: Logger<unknown, Output>
  ): <A, E, R>(effect: Effect<A, E, R>) => Effect<A, E, R>
  <A, E, R, Output>(
    effect: Effect<A, E, R>,
    logger: Logger<unknown, Output>
  ): Effect<A, E, R>
} = dual(2, <A, E, R, Output>(
  effect: Effect<A, E, R>,
  logger: Logger<unknown, Output>
): Effect<A, E, R> =>
  internal.updateService(
    effect,
    internal.CurrentLoggers,
    (loggers) => new Set([...loggers, logger])
  ))

/**
 * Adds an annotation to each log line in this effect.
 *
 * **Example** (Adding log annotations)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.gen(function*() {
 *   yield* Effect.log("Starting operation")
 * })
 *
 * // Add annotations to all log messages
 * const annotatedProgram = Effect.annotateLogs(program, {
 *   userId: "user123",
 *   operation: "data-processing"
 * })
 *
 * // Also supports single key-value annotations
 * const singleAnnotated = Effect.annotateLogs(program, "requestId", "req-456")
 *
 * const logger = Logger.make<unknown, void>(({ message }) =>
 *   void output.push(Array.isArray(message) ? message.join(" ") : String(message))
 * )
 * const run = (effect: Effect.Effect<void>) =>
 *   Effect.runSync(Effect.provide(effect, Logger.layer([logger])))
 * run(annotatedProgram)
 * run(singleAnnotated)
 * output // => ["Starting operation", "Starting operation"]
 * ```
 *
 * @category logging
 * @since 2.0.0
 */
export const annotateLogs: {
  (
    key: string,
    value: unknown
  ): <A, E, R>(effect: Effect<A, E, R>) => Effect<A, E, R>
  (
    values: Record<string, unknown>
  ): <A, E, R>(effect: Effect<A, E, R>) => Effect<A, E, R>
  <A, E, R>(
    effect: Effect<A, E, R>,
    key: string,
    value: unknown
  ): Effect<A, E, R>
  <A, E, R>(
    effect: Effect<A, E, R>,
    values: Record<string, unknown>
  ): Effect<A, E, R>
} = dual(
  (args) => isEffect(args[0]),
  <A, E, R>(
    effect: Effect<A, E, R>,
    ...args: [Record<string, unknown>] | [key: string, value: unknown]
  ): Effect<A, E, R> =>
    internal.updateService(effect, CurrentLogAnnotations, (annotations) => {
      const newAnnotations = args.length === 1 ? { ...annotations, ...args[0] } : { ...annotations }
      if (args.length === 1) {
        return newAnnotations
      } else {
        InternalRecord.assignProperty(newAnnotations, args[0], args[1])
      }
      return newAnnotations
    })
)

/**
 * Adds log annotations to the current scope.
 *
 * **When to use**
 *
 * Use to attach log annotations that last until the current scope closes.
 *
 * **Details**
 *
 * This differs from `annotateLogs`, which only annotates a specific effect.
 * `annotateLogsScoped` updates annotations for the entire current `Scope` and
 * restores the previous annotations when the scope closes.
 *
 * **Example** (Adding scoped log annotations)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.scoped(
 *   Effect.gen(function*() {
 *     yield* Effect.log("before")
 *     yield* Effect.annotateLogsScoped({ requestId: "req-123" })
 *     yield* Effect.log("inside scope")
 *   })
 * )
 *
 * const logger = Logger.make<unknown, void>(({ message }) =>
 *   void output.push(Array.isArray(message) ? message.join(" ") : String(message))
 * )
 * Effect.runSync(Effect.provide(program, Logger.layer([logger])))
 * output // => ["before", "inside scope"]
 * ```
 *
 * @see {@link annotateLogs} for annotating one effect
 *
 * @category logging
 * @since 3.1.0
 */
export const annotateLogsScoped: {
  (key: string, value: unknown): Effect<void, never, Scope>
  (values: Record<string, unknown>): Effect<void, never, Scope>
} = internal.annotateLogsScoped

/**
 * Adds a span to each log line in this effect.
 *
 * **Example** (Adding a log span)
 *
 * ```ts import.meta.vitest
 * import { Effect, Logger } from "effect"
 * const output: Array<unknown> = []
 *
 * const databaseOperation = Effect.gen(function*() {
 *   yield* Effect.log("Connecting to database")
 *   yield* Effect.log("Executing query")
 *   yield* Effect.log("Processing results")
 *   return "data"
 * })
 *
 * const httpRequest = Effect.gen(function*() {
 *   yield* Effect.log("Making HTTP request")
 *   const data = yield* Effect.withLogSpan(databaseOperation, "db-operation")
 *   yield* Effect.log("Sending response")
 *   return data
 * })
 *
 * const program = Effect.withLogSpan(httpRequest, "http-handler")
 *
 * const logger = Logger.make<unknown, void>(({ message }) =>
 *   void output.push(Array.isArray(message) ? message.join(" ") : String(message))
 * )
 * void output.push(Effect.runSync(Effect.provide(program, Logger.layer([logger]))))
 * output // => ["Making HTTP request", "Connecting to database", "Executing query", "Processing results", "Sending response", "data"]
 * ```
 *
 * @category logging
 * @since 2.0.0
 */
export const withLogSpan: {
  (label: string): <A, E, R>(effect: Effect<A, E, R>) => Effect<A, E, R>
  <A, E, R>(effect: Effect<A, E, R>, label: string): Effect<A, E, R>
} = dual(
  2,
  <A, E, R>(effect: Effect<A, E, R>, label: string): Effect<A, E, R> =>
    internal.flatMap(internal.currentTimeMillis, (now) =>
      internal.updateService(effect, CurrentLogSpans, (spans) => {
        const span: [label: string, timestamp: number] = [label, now]
        return [span, ...spans]
      }))
)

// -----------------------------------------------------------------------------
// Metrics
// -----------------------------------------------------------------------------

/**
 * Updates a metric after each effect execution, optionally mapping its `Exit` to
 * the metric's input.
 *
 * **Example** (Counting executions)
 *
 * ```ts import.meta.vitest
 * import { Effect, Metric } from "effect"
 *
 * const counter = Metric.counter("effect_executions", {
 *   description: "Counts effect executions"
 * }).pipe(Metric.withConstantInput(1))
 *
 * const program = Effect.succeed("Hello").pipe(
 *   Effect.track(counter)
 * )
 *
 * Effect.runSync(program)
 * Effect.runSync(Metric.value(counter)).count // => 1
 * ```
 *
 * **Example** (Mapping exits)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Metric } from "effect"
 *
 * const exitTracker = Metric.frequency("exit_types", {
 *   description: "Tracks success/failure/defect counts"
 * })
 *
 * const mapExitToString = (exit: Exit.Exit<string, Error>) => {
 *   if (Exit.isSuccess(exit)) return "success"
 *   if (Exit.isFailure(exit)) return "failure"
 *   return "defect"
 * }
 *
 * const effect = Effect.succeed("result").pipe(
 *   Effect.track(exitTracker, mapExitToString)
 * )
 * Effect.runSync(effect)
 * Effect.runSync(Metric.value(exitTracker)).occurrences.get("success") // => 1
 * ```
 *
 * @category metrics
 * @since 4.0.0
 */
export const track: {
  <Input, State, E, A>(
    metric: Metric.Metric<Input, State>,
    f: (exit: Exit.Exit<A, E>) => Input
  ): <E2 extends E, R>(self: Effect<A, E2, R>) => Effect<A, E2, R>
  <State, E, A>(
    metric: Metric.Metric<Exit.Exit<NoInfer<A>, NoInfer<E>>, State>
  ): <R>(self: Effect<A, E, R>) => Effect<A, E, R>
  <A, E, R, Input, State>(
    self: Effect<A, E, R>,
    metric: Metric.Metric<Input, State>,
    f: (exit: Exit.Exit<A, E>) => Input
  ): Effect<A, E, R>
  <A, E, R, State>(
    self: Effect<A, E, R>,
    metric: Metric.Metric<Exit.Exit<NoInfer<A>, NoInfer<E>>, State>
  ): Effect<A, E, R>
} = dual(
  (args) => isEffect(args[0]),
  <A, E, R, Input, State>(
    self: Effect<A, E, R>,
    metric: Metric.Metric<Input, State>,
    f: (exit: Exit.Exit<A, E>) => Input
  ): Effect<A, E, R> =>
    onExit(self, (exit) => {
      const input = f === undefined ? exit : f(exit)
      return Metric.update(metric, input as any)
    })
)

/**
 * Updates the provided `Metric` every time the wrapped `Effect` succeeds with
 * a value.
 *
 * **Details**
 *
 * Also accepts an optional function which can be used to map the success value
 * of the `Effect` into a valid `Input` for the `Metric`.
 *
 * **Example** (Counting successful results)
 *
 * ```ts import.meta.vitest
 * import { Effect, Metric } from "effect"
 *
 * const successCounter = Metric.counter("successes").pipe(
 *   Metric.withConstantInput(1)
 * )
 *
 * const program = Effect.succeed(42).pipe(
 *   Effect.trackSuccesses(successCounter)
 * )
 *
 * Effect.runSync(program)
 * Effect.runSync(Metric.value(successCounter)).count // => 1
 * ```
 *
 * **Example** (Mapping successes before tracking)
 *
 * ```ts import.meta.vitest
 * import { Effect, Metric } from "effect"
 *
 * // Track successful request sizes
 * const requestSizeGauge = Metric.gauge("request_size_bytes")
 *
 * const program = Effect.succeed("Hello World!").pipe(
 *   Effect.trackSuccesses(requestSizeGauge, (value: string) => value.length)
 * )
 *
 * Effect.runSync(program)
 * Effect.runSync(Metric.value(requestSizeGauge)).value // => 12
 * ```
 *
 * @category metrics
 * @since 4.0.0
 */
export const trackSuccesses: {
  <Input, State, A>(
    metric: Metric.Metric<Input, State>,
    f: (value: A) => Input
  ): <E, R>(self: Effect<A, E, R>) => Effect<A, E, R>
  <State, A>(
    metric: Metric.Metric<NoInfer<A>, State>
  ): <E, R>(self: Effect<A, E, R>) => Effect<A, E, R>
  <A, E, R, Input, State>(
    self: Effect<A, E, R>,
    metric: Metric.Metric<Input, State>,
    f: (value: A) => Input
  ): Effect<A, E, R>
  <A, E, R, State>(
    self: Effect<A, E, R>,
    metric: Metric.Metric<NoInfer<A>, State>
  ): Effect<A, E, R>
} = dual(
  (args) => isEffect(args[0]),
  <A, E, R, Input, State>(
    self: Effect<A, E, R>,
    metric: Metric.Metric<Input, State>,
    f: ((value: A) => Input) | undefined
  ): Effect<A, E, R> =>
    tap(self, (value) => {
      const input = f === undefined ? value : f(value)
      return Metric.update(metric, input as any)
    })
)

/**
 * Updates the provided `Metric` every time the wrapped `Effect` fails with an
 * **expected** error.
 *
 * **Details**
 *
 * Also accepts an optional function which can be used to map the error value
 * of the `Effect` into a valid `Input` for the `Metric`.
 *
 * **Example** (Counting expected failures)
 *
 * ```ts import.meta.vitest
 * import { Effect, Metric } from "effect"
 *
 * const errorCounter = Metric.counter("errors").pipe(
 *   Metric.withConstantInput(1)
 * )
 *
 * const program = Effect.fail("Network timeout").pipe(
 *   Effect.trackErrors(errorCounter)
 * )
 *
 * Effect.runSyncExit(program)
 * Effect.runSync(Metric.value(errorCounter)).count // => 1
 * ```
 *
 * **Example** (Mapping errors before tracking)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect, Metric } from "effect"
 *
 * class ConnectionFailedError extends Data.TaggedError("ConnectionFailedError")<{}> {}
 *
 * // Track error types using frequency metric
 * const errorTypeFrequency = Metric.frequency("error_types")
 *
 * const program = Effect.fail(new ConnectionFailedError()).pipe(
 *   Effect.trackErrors(errorTypeFrequency, (error: ConnectionFailedError) => error._tag)
 * )
 *
 * Effect.runSyncExit(program)
 * Effect.runSync(Metric.value(errorTypeFrequency)).occurrences.get("ConnectionFailedError") // => 1
 * ```
 *
 * @category metrics
 * @since 4.0.0
 */
export const trackErrors: {
  <Input, State, E>(
    metric: Metric.Metric<Input, State>,
    f: (error: E) => Input
  ): <A, R>(self: Effect<A, E, R>) => Effect<A, E, R>
  <State, E>(
    metric: Metric.Metric<NoInfer<E>, State>
  ): <A, R>(self: Effect<A, E, R>) => Effect<A, E, R>
  <A, E, R, Input, State>(
    self: Effect<A, E, R>,
    metric: Metric.Metric<Input, State>,
    f: (error: E) => Input
  ): Effect<A, E, R>
  <A, E, R, State>(
    self: Effect<A, E, R>,
    metric: Metric.Metric<NoInfer<E>, State>
  ): Effect<A, E, R>
} = dual(
  (args) => isEffect(args[0]),
  <A, E, R, Input, State>(
    self: Effect<A, E, R>,
    metric: Metric.Metric<Input, State>,
    f: ((error: E) => Input) | undefined
  ): Effect<A, E, R> =>
    tapError(self, (error) => {
      const input = f === undefined ? error : f(error)
      return Metric.update(metric, input as any)
    })
)

/**
 * Updates the provided `Metric` every time the wrapped `Effect` fails with an
 * **unexpected** error (i.e. a defect).
 *
 * **Details**
 *
 * Also accepts an optional function which can be used to map the defect value
 * of the `Effect` into a valid `Input` for the `Metric`.
 *
 * **Example** (Counting defects)
 *
 * ```ts import.meta.vitest
 * import { Effect, Metric } from "effect"
 *
 * const defectCounter = Metric.counter("defects").pipe(
 *   Metric.withConstantInput(1)
 * )
 *
 * const program = Effect.die("Critical system failure").pipe(
 *   Effect.trackDefects(defectCounter)
 * )
 *
 * Effect.runSyncExit(program)
 * Effect.runSync(Metric.value(defectCounter)).count // => 1
 * ```
 *
 * **Example** (Mapping defects before tracking)
 *
 * ```ts import.meta.vitest
 * import { Effect, Metric } from "effect"
 *
 * // Track defect types using frequency metric
 * const defectTypeFrequency = Metric.frequency("defect_types")
 *
 * const program = Effect.die(new Error("Null pointer exception")).pipe(
 *   Effect.trackDefects(defectTypeFrequency, (defect: unknown) => {
 *     if (defect instanceof Error) return defect.constructor.name
 *     return typeof defect
 *   })
 * )
 *
 * Effect.runSyncExit(program)
 * Effect.runSync(Metric.value(defectTypeFrequency)).occurrences.get("Error") // => 1
 * ```
 *
 * @category metrics
 * @since 4.0.0
 */
export const trackDefects: {
  <Input, State>(
    metric: Metric.Metric<Input, State>,
    f: (defect: unknown) => Input
  ): <A, E, R>(self: Effect<A, E, R>) => Effect<A, E, R>
  <State, E>(
    metric: Metric.Metric<unknown, State>
  ): <A, R>(self: Effect<A, E, R>) => Effect<A, E, R>
  <A, E, R, Input, State>(
    self: Effect<A, E, R>,
    metric: Metric.Metric<Input, State>,
    f: (defect: unknown) => Input
  ): Effect<A, E, R>
  <A, E, R, State>(
    self: Effect<A, E, R>,
    metric: Metric.Metric<unknown, State>
  ): Effect<A, E, R>
} = dual(
  (args) => isEffect(args[0]),
  (self, metric, f) =>
    tapDefect(self, (defect) => {
      const input = f === undefined ? defect : f(defect)
      return Metric.update(metric, input)
    })
)

/**
 * Updates the provided `Metric` with the `Duration` of time (in nanoseconds)
 * that the wrapped `Effect` took to complete.
 *
 * **Details**
 *
 * Also accepts an optional function which can be used to map the `Duration`
 * that the wrapped `Effect` took to complete into a valid `Input` for the
 * `Metric`.
 *
 * **Example** (Recording execution duration)
 *
 * ```ts import.meta.vitest
 * import { Effect, Metric } from "effect"
 *
 * const executionTimer = Metric.timer("execution_time")
 *
 * const program = Effect.succeed("done").pipe(
 *   Effect.trackDuration(executionTimer)
 * )
 *
 * Effect.runSync(program)
 * Effect.runSync(Metric.value(executionTimer)).count // => 1
 * ```
 *
 * **Example** (Mapping duration before tracking)
 *
 * ```ts import.meta.vitest
 * import { Effect, Metric } from "effect"
 *
 * // Track execution time in milliseconds using custom mapping
 * const durationGauge = Metric.gauge("execution_millis")
 *
 * const program = Effect.succeed("done").pipe(
 *   Effect.trackDuration(durationGauge, () => 1)
 * )
 *
 * Effect.runSync(program)
 * Effect.runSync(Metric.value(durationGauge)).value // => 1
 * ```
 *
 * @category metrics
 * @since 4.0.0
 */
export const trackDuration: {
  <Input, State>(
    metric: Metric.Metric<Input, State>,
    f: (duration: Duration.Duration) => Input
  ): <A, E, R>(self: Effect<A, E, R>) => Effect<A, E, R>
  <State, E>(
    metric: Metric.Metric<Duration.Duration, State>
  ): <A, R>(self: Effect<A, E, R>) => Effect<A, E, R>
  <A, E, R, Input, State>(
    self: Effect<A, E, R>,
    metric: Metric.Metric<Input, State>,
    f: (duration: Duration.Duration) => Input
  ): Effect<A, E, R>
  <A, E, R, State>(
    self: Effect<A, E, R>,
    metric: Metric.Metric<Duration.Duration, State>
  ): Effect<A, E, R>
} = dual(
  (args) => isEffect(args[0]),
  <A, E, R, Input, State>(
    self: Effect<A, E, R>,
    metric: Metric.Metric<Input, State>,
    f: ((duration: Duration.Duration) => Input) | undefined
  ): Effect<A, E, R> =>
    clockWith((clock) => {
      const startTime = clock.monotonicTimeNanosUnsafe()
      return onExit(self, () => {
        const endTime = clock.monotonicTimeNanosUnsafe()
        const duration = Duration.subtract(
          Duration.fromInputUnsafe(endTime),
          Duration.fromInputUnsafe(startTime)
        )
        const input = f === undefined ? duration : f(duration)
        return Metric.update(metric, input as any)
      })
    })
)

// -----------------------------------------------------------------------------
// Transactions
// -----------------------------------------------------------------------------

/**
 * Service that holds the current transaction state.
 *
 * **Details**
 *
 * It includes a journal that stores non-committed changes to `TxRef` values and
 * a retry flag that records whether the transaction should be retried.
 *
 * **Example** (Building transactions)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * // Transaction class for software transactional memory operations
 * const txEffect = Effect.gen(function*() {
 *   const tx = yield* Effect.Transaction
 *   // Use transaction for coordinated state changes
 *   return "Transaction complete"
 * })
 *
 * const runnable = Effect.provideService(txEffect, Effect.Transaction, {
 *   retry: false,
 *   journal: new Map()
 * })
 * Effect.runSync(runnable) // => "Transaction complete"
 * ```
 *
 * @category transactions
 * @since 4.0.0
 */
export class Transaction extends Context.Service<
  Transaction,
  {
    retry: boolean
    readonly journal: Map<
      TxRef<any>,
      {
        readonly version: number
        value: any
        written: boolean
      }
    >
  }
>()("effect/Effect/Transaction") {}

/**
 * Defines a transaction boundary. Transactions are "all or nothing" with respect to changes
 * made to transactional values (i.e. TxRef) that occur within the transaction body.
 *
 * **Details**
 *
 * If called inside an active transaction, `tx` composes with the current transaction and reuses
 * its journal and retry state instead of creating a nested boundary.
 *
 * Effect transactions are optimistic with retry. A transaction is retried when
 * its body explicitly calls `Effect.txRetry` and any accessed transactional
 * value changes, or when any accessed transactional value changes because a
 * different transaction commits before the current one.
 *
 * The outermost `tx` call creates the transaction boundary and commits or rolls back the full
 * composed transaction.
 *
 * **Example** (Running a transaction)
 *
 * ```ts import.meta.vitest
 * import { Effect, TxRef } from "effect"
 * const output: Array<unknown> = []
 *
 * const program = Effect.gen(function*() {
 *   const ref1 = yield* TxRef.make(0)
 *   const ref2 = yield* TxRef.make(0)
 *
 *   // Nested tx calls compose into the same transaction
 *   yield* Effect.tx(Effect.gen(function*() {
 *     yield* TxRef.set(ref1, 10)
 *     yield* Effect.tx(TxRef.set(ref2, 20))
 *     const sum = (yield* TxRef.get(ref1)) + (yield* TxRef.get(ref2))
 *     void output.push(`Transaction sum: ${sum}`)
 *   }))
 *
 *   void output.push(`Final ref1: ${yield* TxRef.get(ref1)}`)
 *   void output.push(`Final ref2: ${yield* TxRef.get(ref2)}`)
 * })
 *
 * Effect.runSync(program)
 * output // => ["Transaction sum: 30", "Final ref1: 10", "Final ref2: 20"]
 * ```
 *
 * @category transactions
 * @since 4.0.0
 */
export const tx = <A, E, R>(
  effect: Effect<A, E, R>
): Effect<A, E, Exclude<R, Transaction>> =>
  withFiber((fiber) => {
    let state = Context.getOrUndefined(fiber.context, Transaction)
    if (state) {
      return effect as Effect<A, E, Exclude<R, Transaction>>
    }
    // Create transaction state only at the outermost boundary
    state = { journal: new Map(), retry: false }
    let result: Exit.Exit<A, E> | undefined
    return uninterruptibleMask((restore) =>
      flatMap(
        whileLoop({
          while: () => !result,
          body: constant(
            restore(effect).pipe(
              provideService(Transaction, state),
              tapCause(() => {
                if (!state.retry) return void_
                return restore(awaitPendingTransaction(state))
              }),
              exit
            )
          ),
          step(exit: Exit.Exit<A, E>) {
            if (state.retry || !isTransactionConsistent(state)) {
              return clearTransaction(state)
            }
            if (Exit.isSuccess(exit)) {
              commitTransaction(fiber, state)
            } else {
              clearTransaction(state)
            }
            result = exit
          }
        }),
        () => result!
      )
    )
  })

const isTransactionConsistent = (state: Transaction["Service"]) => {
  for (const [ref, { version }] of state.journal) {
    if (ref.version !== version) {
      return false
    }
  }
  return true
}

const awaitPendingTransaction = (state: Transaction["Service"]) =>
  callback<void>((resume) => {
    // Validate the read set and register the waiter in one synchronous step.
    // A commit that landed after the reads has already signalled its waiters
    // and will not signal this one, so a stale read set reruns immediately.
    if (!isTransactionConsistent(state)) {
      return resume(void_)
    }
    const key = {}
    const refs = Array.from(state.journal.keys())
    const clearPending = () => {
      for (const clear of refs) {
        clear.pending.delete(key)
      }
    }
    const onCall = () => {
      clearPending()
      resume(void_)
    }
    for (const ref of refs) {
      ref.pending.set(key, onCall)
    }
    return sync(clearPending)
  })

function commitTransaction(fiber: Fiber<unknown, unknown>, state: Transaction["Service"]) {
  for (const [ref, { value, written }] of state.journal) {
    if (!written) continue
    if (!Object.is(value, ref.value)) {
      ref.version = ref.version + 1
      ref.value = value
    }
    for (const pending of ref.pending.values()) {
      fiber.currentDispatcher.scheduleTask(pending, 0)
    }
    ref.pending.clear()
  }
}

function clearTransaction(state: Transaction["Service"]) {
  state.retry = false
  state.journal.clear()
}

/**
 * Retries the current transaction by signaling that it must be retried.
 *
 * **Details**
 *
 * NOTE: the transaction retries on any change to transactional values (i.e. TxRef) accessed in its body.
 *
 * **Example** (Retrying transactions)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect, TxRef } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const ref = yield* TxRef.make(0)
 *   const update = yield* Deferred.make<void>()
 *
 *   yield* Effect.forkChild(
 *     Deferred.await(update).pipe(Effect.andThen(Effect.tx(TxRef.set(ref, 1))))
 *   )
 *
 *   return yield* Effect.tx(Effect.gen(function*() {
 *     const value = yield* TxRef.get(ref)
 *     if (value === 0) {
 *       yield* Deferred.succeed(update, undefined)
 *       return yield* Effect.txRetry
 *     }
 *     return value
 *   }))
 * })
 *
 * await Effect.runPromise(program) // => 1
 * ```
 *
 * @category transactions
 * @since 4.0.0
 */
export const txRetry: Effect<never, never, Transaction> = flatMap(
  Transaction,
  (state) => {
    state.retry = true
    return interrupt
  }
)
/**
 * Type helpers for converting callback-based functions into `Effect` functions.
 *
 * @category converting
 * @since 4.0.0
 */
export declare namespace Effectify {
  interface Callback<E, A> {
    (err: E, a?: A): void
  }

  type ArgsWithCallback<Args extends Array<any>, E, A> = [...args: Args, cb: Callback<E, A>]

  type WithoutNull<A> = unknown extends A ? void : Exclude<A, null | undefined>

  /**
   * Converts a callback-based function type into an `Effect`-returning function type.
   *
   * @category utility types
   * @since 4.0.0
   */
  export type Effectify<T, E> = T extends {
    (...args: ArgsWithCallback<infer Args1, infer _E1, infer A1>): infer _R1
    (...args: ArgsWithCallback<infer Args2, infer _E2, infer A2>): infer _R2
    (...args: ArgsWithCallback<infer Args3, infer _E3, infer A3>): infer _R3
    (...args: ArgsWithCallback<infer Args4, infer _E4, infer A4>): infer _R4
    (...args: ArgsWithCallback<infer Args5, infer _E5, infer A5>): infer _R5
    (...args: ArgsWithCallback<infer Args6, infer _E6, infer A6>): infer _R6
    (...args: ArgsWithCallback<infer Args7, infer _E7, infer A7>): infer _R7
    (...args: ArgsWithCallback<infer Args8, infer _E8, infer A8>): infer _R8
    (...args: ArgsWithCallback<infer Args9, infer _E9, infer A9>): infer _R9
    (...args: ArgsWithCallback<infer Args10, infer _E10, infer A10>): infer _R10
  } ? {
      (...args: Args1): Effect<WithoutNull<A1>, E>
      (...args: Args2): Effect<WithoutNull<A2>, E>
      (...args: Args3): Effect<WithoutNull<A3>, E>
      (...args: Args4): Effect<WithoutNull<A4>, E>
      (...args: Args5): Effect<WithoutNull<A5>, E>
      (...args: Args6): Effect<WithoutNull<A6>, E>
      (...args: Args7): Effect<WithoutNull<A7>, E>
      (...args: Args8): Effect<WithoutNull<A8>, E>
      (...args: Args9): Effect<WithoutNull<A9>, E>
      (...args: Args10): Effect<WithoutNull<A10>, E>
    }
    : T extends {
      (...args: ArgsWithCallback<infer Args1, infer _E1, infer A1>): infer _R1
      (...args: ArgsWithCallback<infer Args2, infer _E2, infer A2>): infer _R2
      (...args: ArgsWithCallback<infer Args3, infer _E3, infer A3>): infer _R3
      (...args: ArgsWithCallback<infer Args4, infer _E4, infer A4>): infer _R4
      (...args: ArgsWithCallback<infer Args5, infer _E5, infer A5>): infer _R5
      (...args: ArgsWithCallback<infer Args6, infer _E6, infer A6>): infer _R6
      (...args: ArgsWithCallback<infer Args7, infer _E7, infer A7>): infer _R7
      (...args: ArgsWithCallback<infer Args8, infer _E8, infer A8>): infer _R8
      (...args: ArgsWithCallback<infer Args9, infer _E9, infer A9>): infer _R9
    } ? {
        (...args: Args1): Effect<WithoutNull<A1>, E>
        (...args: Args2): Effect<WithoutNull<A2>, E>
        (...args: Args3): Effect<WithoutNull<A3>, E>
        (...args: Args4): Effect<WithoutNull<A4>, E>
        (...args: Args5): Effect<WithoutNull<A5>, E>
        (...args: Args6): Effect<WithoutNull<A6>, E>
        (...args: Args7): Effect<WithoutNull<A7>, E>
        (...args: Args8): Effect<WithoutNull<A8>, E>
        (...args: Args9): Effect<WithoutNull<A9>, E>
      }
    : T extends {
      (...args: ArgsWithCallback<infer Args1, infer _E1, infer A1>): infer _R1
      (...args: ArgsWithCallback<infer Args2, infer _E2, infer A2>): infer _R2
      (...args: ArgsWithCallback<infer Args3, infer _E3, infer A3>): infer _R3
      (...args: ArgsWithCallback<infer Args4, infer _E4, infer A4>): infer _R4
      (...args: ArgsWithCallback<infer Args5, infer _E5, infer A5>): infer _R5
      (...args: ArgsWithCallback<infer Args6, infer _E6, infer A6>): infer _R6
      (...args: ArgsWithCallback<infer Args7, infer _E7, infer A7>): infer _R7
      (...args: ArgsWithCallback<infer Args8, infer _E8, infer A8>): infer _R8
    } ? {
        (...args: Args1): Effect<WithoutNull<A1>, E>
        (...args: Args2): Effect<WithoutNull<A2>, E>
        (...args: Args3): Effect<WithoutNull<A3>, E>
        (...args: Args4): Effect<WithoutNull<A4>, E>
        (...args: Args5): Effect<WithoutNull<A5>, E>
        (...args: Args6): Effect<WithoutNull<A6>, E>
        (...args: Args7): Effect<WithoutNull<A7>, E>
        (...args: Args8): Effect<WithoutNull<A8>, E>
      }
    : T extends {
      (...args: ArgsWithCallback<infer Args1, infer _E1, infer A1>): infer _R1
      (...args: ArgsWithCallback<infer Args2, infer _E2, infer A2>): infer _R2
      (...args: ArgsWithCallback<infer Args3, infer _E3, infer A3>): infer _R3
      (...args: ArgsWithCallback<infer Args4, infer _E4, infer A4>): infer _R4
      (...args: ArgsWithCallback<infer Args5, infer _E5, infer A5>): infer _R5
      (...args: ArgsWithCallback<infer Args6, infer _E6, infer A6>): infer _R6
      (...args: ArgsWithCallback<infer Args7, infer _E7, infer A7>): infer _R7
    } ? {
        (...args: Args1): Effect<WithoutNull<A1>, E>
        (...args: Args2): Effect<WithoutNull<A2>, E>
        (...args: Args3): Effect<WithoutNull<A3>, E>
        (...args: Args4): Effect<WithoutNull<A4>, E>
        (...args: Args5): Effect<WithoutNull<A5>, E>
        (...args: Args6): Effect<WithoutNull<A6>, E>
        (...args: Args7): Effect<WithoutNull<A7>, E>
      }
    : T extends {
      (...args: ArgsWithCallback<infer Args1, infer _E1, infer A1>): infer _R1
      (...args: ArgsWithCallback<infer Args2, infer _E2, infer A2>): infer _R2
      (...args: ArgsWithCallback<infer Args3, infer _E3, infer A3>): infer _R3
      (...args: ArgsWithCallback<infer Args4, infer _E4, infer A4>): infer _R4
      (...args: ArgsWithCallback<infer Args5, infer _E5, infer A5>): infer _R5
      (...args: ArgsWithCallback<infer Args6, infer _E6, infer A6>): infer _R6
    } ? {
        (...args: Args1): Effect<WithoutNull<A1>, E>
        (...args: Args2): Effect<WithoutNull<A2>, E>
        (...args: Args3): Effect<WithoutNull<A3>, E>
        (...args: Args4): Effect<WithoutNull<A4>, E>
        (...args: Args5): Effect<WithoutNull<A5>, E>
        (...args: Args6): Effect<WithoutNull<A6>, E>
      }
    : T extends {
      (...args: ArgsWithCallback<infer Args1, infer _E1, infer A1>): infer _R1
      (...args: ArgsWithCallback<infer Args2, infer _E2, infer A2>): infer _R2
      (...args: ArgsWithCallback<infer Args3, infer _E3, infer A3>): infer _R3
      (...args: ArgsWithCallback<infer Args4, infer _E4, infer A4>): infer _R4
      (...args: ArgsWithCallback<infer Args5, infer _E5, infer A5>): infer _R5
    } ? {
        (...args: Args1): Effect<WithoutNull<A1>, E>
        (...args: Args2): Effect<WithoutNull<A2>, E>
        (...args: Args3): Effect<WithoutNull<A3>, E>
        (...args: Args4): Effect<WithoutNull<A4>, E>
        (...args: Args5): Effect<WithoutNull<A5>, E>
      }
    : T extends {
      (...args: ArgsWithCallback<infer Args1, infer _E1, infer A1>): infer _R1
      (...args: ArgsWithCallback<infer Args2, infer _E2, infer A2>): infer _R2
      (...args: ArgsWithCallback<infer Args3, infer _E3, infer A3>): infer _R3
      (...args: ArgsWithCallback<infer Args4, infer _E4, infer A4>): infer _R4
    } ? {
        (...args: Args1): Effect<WithoutNull<A1>, E>
        (...args: Args2): Effect<WithoutNull<A2>, E>
        (...args: Args3): Effect<WithoutNull<A3>, E>
        (...args: Args4): Effect<WithoutNull<A4>, E>
      }
    : T extends {
      (...args: ArgsWithCallback<infer Args1, infer _E1, infer A1>): infer _R1
      (...args: ArgsWithCallback<infer Args2, infer _E2, infer A2>): infer _R2
      (...args: ArgsWithCallback<infer Args3, infer _E3, infer A3>): infer _R3
    } ? {
        (...args: Args1): Effect<WithoutNull<A1>, E>
        (...args: Args2): Effect<WithoutNull<A2>, E>
        (...args: Args3): Effect<WithoutNull<A3>, E>
      }
    : T extends {
      (...args: ArgsWithCallback<infer Args1, infer _E1, infer A1>): infer _R1
      (...args: ArgsWithCallback<infer Args2, infer _E2, infer A2>): infer _R2
    } ? {
        (...args: Args1): Effect<WithoutNull<A1>, E>
        (...args: Args2): Effect<WithoutNull<A2>, E>
      }
    : T extends {
      (...args: ArgsWithCallback<infer Args1, infer _E1, infer A1>): infer _R1
    } ? {
        (...args: Args1): Effect<WithoutNull<A1>, E>
      }
    : never

  /**
   * Extracts the callback error type from a callback-based function type.
   *
   * @category utility types
   * @since 4.0.0
   */
  export type EffectifyError<T> = T extends {
    (...args: ArgsWithCallback<infer _Args1, infer E1, infer _A1>): infer _R1
    (...args: ArgsWithCallback<infer _Args2, infer E2, infer _A2>): infer _R2
    (...args: ArgsWithCallback<infer _Args3, infer E3, infer _A3>): infer _R3
    (...args: ArgsWithCallback<infer _Args4, infer E4, infer _A4>): infer _R4
    (...args: ArgsWithCallback<infer _Args5, infer E5, infer _A5>): infer _R5
    (...args: ArgsWithCallback<infer _Args6, infer E6, infer _A6>): infer _R6
    (...args: ArgsWithCallback<infer _Args7, infer E7, infer _A7>): infer _R7
    (...args: ArgsWithCallback<infer _Args8, infer E8, infer _A8>): infer _R8
    (...args: ArgsWithCallback<infer _Args9, infer E9, infer _A9>): infer _R9
    (...args: ArgsWithCallback<infer _Args10, infer E10, infer _A10>): infer _R10
  } ? NonNullable<E1 | E2 | E3 | E4 | E5 | E6 | E7 | E8 | E9 | E10>
    : T extends {
      (...args: ArgsWithCallback<infer _Args1, infer E1, infer _A1>): infer _R1
      (...args: ArgsWithCallback<infer _Args2, infer E2, infer _A2>): infer _R2
      (...args: ArgsWithCallback<infer _Args3, infer E3, infer _A3>): infer _R3
      (...args: ArgsWithCallback<infer _Args4, infer E4, infer _A4>): infer _R4
      (...args: ArgsWithCallback<infer _Args5, infer E5, infer _A5>): infer _R5
      (...args: ArgsWithCallback<infer _Args6, infer E6, infer _A6>): infer _R6
      (...args: ArgsWithCallback<infer _Args7, infer E7, infer _A7>): infer _R7
      (...args: ArgsWithCallback<infer _Args8, infer E8, infer _A8>): infer _R8
      (...args: ArgsWithCallback<infer _Args9, infer E9, infer _A9>): infer _R9
    } ? NonNullable<E1 | E2 | E3 | E4 | E5 | E6 | E7 | E8 | E9>
    : T extends {
      (...args: ArgsWithCallback<infer _Args1, infer E1, infer _A1>): infer _R1
      (...args: ArgsWithCallback<infer _Args2, infer E2, infer _A2>): infer _R2
      (...args: ArgsWithCallback<infer _Args3, infer E3, infer _A3>): infer _R3
      (...args: ArgsWithCallback<infer _Args4, infer E4, infer _A4>): infer _R4
      (...args: ArgsWithCallback<infer _Args5, infer E5, infer _A5>): infer _R5
      (...args: ArgsWithCallback<infer _Args6, infer E6, infer _A6>): infer _R6
      (...args: ArgsWithCallback<infer _Args7, infer E7, infer _A7>): infer _R7
      (...args: ArgsWithCallback<infer _Args8, infer E8, infer _A8>): infer _R8
    } ? NonNullable<E1 | E2 | E3 | E4 | E5 | E6 | E7 | E8>
    : T extends {
      (...args: ArgsWithCallback<infer _Args1, infer E1, infer _A1>): infer _R1
      (...args: ArgsWithCallback<infer _Args2, infer E2, infer _A2>): infer _R2
      (...args: ArgsWithCallback<infer _Args3, infer E3, infer _A3>): infer _R3
      (...args: ArgsWithCallback<infer _Args4, infer E4, infer _A4>): infer _R4
      (...args: ArgsWithCallback<infer _Args5, infer E5, infer _A5>): infer _R5
      (...args: ArgsWithCallback<infer _Args6, infer E6, infer _A6>): infer _R6
      (...args: ArgsWithCallback<infer _Args7, infer E7, infer _A7>): infer _R7
    } ? NonNullable<E1 | E2 | E3 | E4 | E5 | E6 | E7>
    : T extends {
      (...args: ArgsWithCallback<infer _Args1, infer E1, infer _A1>): infer _R1
      (...args: ArgsWithCallback<infer _Args2, infer E2, infer _A2>): infer _R2
      (...args: ArgsWithCallback<infer _Args3, infer E3, infer _A3>): infer _R3
      (...args: ArgsWithCallback<infer _Args4, infer E4, infer _A4>): infer _R4
      (...args: ArgsWithCallback<infer _Args5, infer E5, infer _A5>): infer _R5
      (...args: ArgsWithCallback<infer _Args6, infer E6, infer _A6>): infer _R6
    } ? NonNullable<E1 | E2 | E3 | E4 | E5 | E6>
    : T extends {
      (...args: ArgsWithCallback<infer _Args1, infer E1, infer _A1>): infer _R1
      (...args: ArgsWithCallback<infer _Args2, infer E2, infer _A2>): infer _R2
      (...args: ArgsWithCallback<infer _Args3, infer E3, infer _A3>): infer _R3
      (...args: ArgsWithCallback<infer _Args4, infer E4, infer _A4>): infer _R4
      (...args: ArgsWithCallback<infer _Args5, infer E5, infer _A5>): infer _R5
    } ? NonNullable<E1 | E2 | E3 | E4 | E5>
    : T extends {
      (...args: ArgsWithCallback<infer _Args1, infer E1, infer _A1>): infer _R1
      (...args: ArgsWithCallback<infer _Args2, infer E2, infer _A2>): infer _R2
      (...args: ArgsWithCallback<infer _Args3, infer E3, infer _A3>): infer _R3
      (...args: ArgsWithCallback<infer _Args4, infer E4, infer _A4>): infer _R4
    } ? NonNullable<E1 | E2 | E3 | E4>
    : T extends {
      (...args: ArgsWithCallback<infer _Args1, infer E1, infer _A1>): infer _R1
      (...args: ArgsWithCallback<infer _Args2, infer E2, infer _A2>): infer _R2
      (...args: ArgsWithCallback<infer _Args3, infer E3, infer _A3>): infer _R3
    } ? NonNullable<E1 | E2 | E3>
    : T extends {
      (...args: ArgsWithCallback<infer _Args1, infer E1, infer _A1>): infer _R1
      (...args: ArgsWithCallback<infer _Args2, infer E2, infer _A2>): infer _R2
    } ? NonNullable<E1 | E2>
    : T extends {
      (...args: ArgsWithCallback<infer _Args1, infer E1, infer _A1>): infer _R1
    } ? NonNullable<E1>
    : never
}

type EffectifyArgs<F extends (...args: Array<any>) => any> = Parameters<F> extends [...infer Args, any] ? Args
  : Parameters<F>

/**
 * Converts an error-first callback API into a function that returns an
 * `Effect`.
 *
 * **Details**
 *
 * The original function is called with the supplied arguments plus a final
 * callback. A non-null callback error fails the returned effect, while a
 * successful callback value becomes the effect success. Use `onError` to map
 * callback errors and `onSyncError` to turn synchronous throws into typed
 * failures; otherwise synchronous throws become defects.
 *
 * **Example** (Converting callbacks to effects)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const uppercase = (
 *   input: string,
 *   callback: (error: Error | null, value?: string) => void
 * ) => queueMicrotask(() => callback(null, input.toUpperCase()))
 *
 * const effectfulUppercase = Effect.effectify(uppercase)
 * const program = effectfulUppercase("hello")
 *
 * await Effect.runPromise(program) // => "HELLO"
 * ```
 *
 * **Example** (Mapping callback errors to typed failures)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const fail = (
 *   input: string,
 *   callback: (error: Error | null, value?: string) => void
 * ) => queueMicrotask(() => callback(new Error("unavailable")))
 *
 * const effectfulFail = Effect.effectify(
 *   fail,
 *   (error, args) => new Error(`Failed to process ${args[0]}: ${error.message}`)
 * )
 *
 * const program = Effect.flip(effectfulFail("hello"))
 *
 * const error = await Effect.runPromise(program)
 * error.message // => "Failed to process hello: unavailable"
 * ```
 *
 * @category converting
 * @since 4.0.0
 */
export const effectify: {
  <F extends (...args: Array<any>) => any>(fn: F): Effectify.Effectify<F, Effectify.EffectifyError<F>>
  <F extends (...args: Array<any>) => any, E>(
    fn: F,
    onError: (error: Effectify.EffectifyError<F>, args: EffectifyArgs<F>) => E
  ): Effectify.Effectify<F, E>
  <F extends (...args: Array<any>) => any, E, E2>(
    fn: F,
    onError: (error: Effectify.EffectifyError<F>, args: EffectifyArgs<F>) => E,
    onSyncError: (error: unknown, args: EffectifyArgs<F>) => E2
  ): Effectify.Effectify<F, E | E2>
} =
  (<A>(fn: Function, onError?: (e: any, args: any) => any, onSyncError?: (e: any, args: any) => any) =>
  (...args: Array<any>) =>
    callback<A, globalThis.Error>((resume) => {
      try {
        fn(...args, (err: globalThis.Error | null, result: A) => {
          if (err) {
            resume(fail(onError ? onError(err, args) : err))
          } else {
            resume(succeed(result))
          }
        })
      } catch (err) {
        resume(onSyncError ? fail(onSyncError(err, args)) : die(err))
      }
    })) as any

// -----------------------------------------------------------------------------
// Type constraints
// -----------------------------------------------------------------------------

/**
 * Ensures that an effect's success type extends a given type `A`.
 *
 * **Details**
 *
 * This helper is checked at compile time and does not change the effect's
 * runtime behavior.
 *
 * **Example** (Constraining the success type)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * // Define a constraint that the success type must be a number
 * const satisfiesNumber = Effect.satisfiesSuccessType<number>()
 *
 * // This works - Effect<42, never, never> extends Effect<number, never, never>
 * const validEffect = satisfiesNumber(Effect.succeed(42))
 * Effect.runSync(validEffect) // => 42
 *
 * // This would cause a TypeScript compilation error:
 * // const invalidEffect = satisfiesNumber(Effect.succeed("string"))
 * //                                      ^^^^^^^^^^^^^^^^^^^^^^
 * // Type 'string' is not assignable to type 'number'
 * ```
 *
 * @category utility types
 * @since 4.0.0
 */
export const satisfiesSuccessType = <A>() => <A2 extends A, E, R>(effect: Effect<A2, E, R>): Effect<A2, E, R> => effect

/**
 * Ensures that an effect's error type extends a given type `E`.
 *
 * **Details**
 *
 * This helper is checked at compile time and does not change the effect's
 * runtime behavior.
 *
 * **Example** (Constraining the error type)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect } from "effect"
 *
 * class ValidationError extends Data.TaggedError("ValidationError")<{}> {}
 *
 * // Define a constraint that the error type must be a ValidationError
 * const satisfiesError = Effect.satisfiesErrorType<ValidationError>()
 *
 * // This works - Effect<number, ValidationError, never> extends the constrained type
 * const validEffect = satisfiesError(Effect.fail(new ValidationError()))
 * Effect.runSync(Effect.flip(validEffect))._tag // => "ValidationError"
 *
 * // This would cause a TypeScript compilation error:
 * // const invalidEffect = satisfiesError(Effect.fail("string error"))
 * //                                     ^^^^^^^^^^^^^^^^^^^^^^^^^^^
 * // Type 'string' is not assignable to type 'ValidationError'
 * ```
 *
 * @category utility types
 * @since 4.0.0
 */
export const satisfiesErrorType = <E>() => <A, E2 extends E, R>(effect: Effect<A, E2, R>): Effect<A, E2, R> => effect

/**
 * Ensures that an effect's requirements type extends a given type `R`.
 *
 * **Details**
 *
 * This helper is checked at compile time and does not change the effect's
 * runtime behavior.
 *
 * **Example** (Constraining the services type)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * // Define a constraint that requires a string as the requirements type
 * const satisfiesStringServices = Effect.satisfiesServicesType<string>()
 *
 * // This works - effect requires string
 * const validEffect: Effect.Effect<number, never, "config"> = Effect.succeed(42)
 * const constrainedEffect = satisfiesStringServices(validEffect)
 *
 * // This would cause a TypeScript compilation error if uncommented:
 * // const invalidEffect: Effect.Effect<number, never, number> = Effect.succeed(42)
 * // const constrainedInvalid = satisfiesStringServices(invalidEffect)
 * ```
 *
 * @category utility types
 * @since 4.0.0
 */
export const satisfiesServicesType = <R>() => <A, E, R2 extends R>(effect: Effect<A, E, R2>): Effect<A, E, R2> => effect

/**
 * Applies `map` eagerly when an effect is already resolved.
 *
 * **When to use**
 *
 * Use when an already-resolved effect should apply a success transformation
 * immediately while pending effects still use regular mapping.
 *
 * **Details**
 *
 * Success effects apply the mapping function immediately. Failure effects pass
 * through unchanged, and pending effects fall back to regular `map` behavior.
 *
 * **Example** (Mapping already completed effects)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * // For resolved effects, the mapping is applied immediately
 * const resolved = Effect.succeed(5)
 * const mapped = Effect.mapEager(resolved, (n) => n * 2) // Applied eagerly
 *
 * // For pending effects, behaves like regular map
 * const pending = Effect.delay(Effect.succeed(5), 0)
 * const mappedPending = Effect.mapEager(pending, (n) => n * 2) // Uses regular map
 *
 * await Effect.runPromise(Effect.all([mapped, mappedPending])) // => [10, 10]
 * ```
 *
 * @category mapping
 * @since 4.0.0
 */
export const mapEager: {
  <A, B>(f: (a: A) => B): <E, R>(self: Effect<A, E, R>) => Effect<B, E, R>
  <A, E, R, B>(self: Effect<A, E, R>, f: (a: A) => B): Effect<B, E, R>
} = internal.mapEager

/**
 * Applies `mapError` eagerly when an effect is already resolved.
 *
 * **When to use**
 *
 * Use when an already-resolved failed effect should apply an error
 * transformation immediately while pending effects still use regular error
 * mapping.
 *
 * **Details**
 *
 * Success effects pass through unchanged because there is no error to
 * transform. Failure effects apply the mapping function immediately, and
 * pending effects fall back to regular `mapError` behavior.
 *
 * **Example** (Mapping errors eagerly when possible)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * // For resolved failure effects, the error mapping is applied immediately
 * const failed = Effect.fail("original error")
 * const mapped = Effect.mapErrorEager(failed, (err: string) => `mapped: ${err}`) // Applied eagerly
 *
 * // For pending effects, behaves like regular mapError
 * const pending = Effect.delay(Effect.fail("error"), 0)
 * const mappedPending = Effect.mapErrorEager(
 *   pending,
 *   (err: string) => `mapped: ${err}`
 * ) // Uses regular mapError
 *
 * void output.push(await Effect.runPromise(Effect.all([
 *   Effect.flip(mapped),
 *   Effect.flip(mappedPending)
 * ])))
 * output // => [['mapped: original error', 'mapped: error']]
 * ```
 *
 * @category error handling
 * @since 4.0.0
 */
export const mapErrorEager: {
  <E, E2>(f: (e: E) => E2): <A, R>(self: Effect<A, E, R>) => Effect<A, E2, R>
  <A, E, R, E2>(self: Effect<A, E, R>, f: (e: E) => E2): Effect<A, E2, R>
} = internal.mapErrorEager

/**
 * Applies `mapBoth` eagerly when an effect is already resolved.
 *
 * **When to use**
 *
 * Use when an already-resolved effect should transform either success or
 * failure immediately while pending effects still use regular channel mapping.
 *
 * **Details**
 *
 * Success effects apply `onSuccess` immediately, and failure effects apply
 * `onFailure` immediately. Pending effects fall back to regular `mapBoth`
 * behavior.
 *
 * **Example** (Mapping both channels eagerly when possible)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * // For resolved effects, the appropriate mapping is applied immediately
 * const success = Effect.succeed(5)
 * const mapped = Effect.mapBothEager(success, {
 *   onFailure: (err: string) => `Failed: ${err}`,
 *   onSuccess: (n: number) => n * 2
 * }) // onSuccess applied eagerly
 *
 * const failure = Effect.fail("error")
 * const mappedError = Effect.mapBothEager(failure, {
 *   onFailure: (err: string) => `Failed: ${err}`,
 *   onSuccess: (n: number) => n * 2
 * }) // onFailure applied eagerly
 *
 * void output.push(Effect.runSync(mapped))
 * void output.push(Effect.runSync(Effect.flip(mappedError)))
 * output // => [10, "Failed: error"]
 * ```
 *
 * @category mapping
 * @since 4.0.0
 */
export const mapBothEager: {
  <E, E2, A, A2>(
    options: { readonly onFailure: (e: E) => E2; readonly onSuccess: (a: A) => A2 }
  ): <R>(self: Effect<A, E, R>) => Effect<A2, E2, R>
  <A, E, R, E2, A2>(
    self: Effect<A, E, R>,
    options: { readonly onFailure: (e: E) => E2; readonly onSuccess: (a: A) => A2 }
  ): Effect<A2, E2, R>
} = internal.mapBothEager

/**
 * Applies `flatMap` eagerly when an effect is already resolved.
 *
 * **When to use**
 *
 * Use when an already-resolved successful effect should bind immediately to the
 * next effect while pending effects still use regular flat mapping.
 *
 * **Details**
 *
 * Success effects apply the flatMap function immediately. Failure effects pass
 * through unchanged, and pending effects fall back to regular `flatMap`
 * behavior.
 *
 * **Example** (Flat mapping eagerly when possible)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * // For resolved effects, the flatMap is applied immediately
 * const resolved = Effect.succeed(5)
 * const flatMapped = Effect.flatMapEager(resolved, (n) => Effect.succeed(n * 2)) // Applied eagerly
 *
 * // For pending effects, behaves like regular flatMap
 * const pending = Effect.delay(Effect.succeed(5), 0)
 * const flatMappedPending = Effect.flatMapEager(
 *   pending,
 *   (n) => Effect.succeed(n * 2)
 * ) // Uses regular flatMap
 *
 * await Effect.runPromise(Effect.all([flatMapped, flatMappedPending])) // => [10, 10]
 * ```
 *
 * @category sequencing
 * @since 4.0.0
 */
export const flatMapEager: {
  <A, B, E2, R2>(f: (a: A) => Effect<B, E2, R2>): <E, R>(self: Effect<A, E, R>) => Effect<B, E | E2, R | R2>
  <A, E, R, B, E2, R2>(self: Effect<A, E, R>, f: (a: A) => Effect<B, E2, R2>): Effect<B, E | E2, R | R2>
} = internal.flatMapEager

/**
 * Applies `catch` eagerly when an effect is already resolved.
 *
 * **When to use**
 *
 * Use when an already-resolved failed effect should recover immediately while
 * pending effects still use regular error recovery.
 *
 * **Details**
 *
 * Success effects pass through unchanged because there is no error to catch.
 * Failure effects apply the catch function immediately, and pending effects
 * fall back to regular `catch` behavior.
 *
 * **Example** (Catching failures eagerly when possible)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * const output: Array<unknown> = []
 *
 * // For resolved failure effects, the catch function is applied immediately
 * const failed = Effect.fail("original error")
 * const recovered = Effect.catchEager(
 *   failed,
 *   (err: string) => Effect.succeed(`recovered from: ${err}`)
 * ) // Applied eagerly
 *
 * // For success effects, returns success as-is
 * const success = Effect.succeed(42)
 * const unchanged = Effect.catchEager(
 *   success,
 *   (err: string) => Effect.succeed(`recovered from: ${err}`)
 * ) // Returns success as-is
 *
 * // For pending effects, behaves like regular catch
 * const pending = Effect.delay(Effect.fail("error"), 0)
 * const recoveredPending = Effect.catchEager(
 *   pending,
 *   (err: string) => Effect.succeed(`recovered from: ${err}`)
 * ) // Uses regular catch
 *
 * void output.push(await Effect.runPromise(Effect.all([
 *   recovered,
 *   unchanged,
 *   recoveredPending
 * ])))
 * output // => [['recovered from: original error', 42, 'recovered from: error']]
 * ```
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchEager: {
  <E, B, E2, R2>(
    f: (e: NoInfer<E>) => Effect<B, E2, R2>
  ): <A, R>(self: Effect<A, E, R>) => Effect<A | B, E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Effect<A, E, R>,
    f: (e: NoInfer<E>) => Effect<B, E2, R2>
  ): Effect<A | B, E2, R | R2>
} = internal.catchEager

/**
 * Creates untraced function effects with eager evaluation optimization.
 *
 * **Details**
 *
 * Executes generator functions eagerly when all yielded effects are synchronous,
 * stopping at the first async effect and deferring to normal execution.
 *
 * **Example** (Defining eager untraced effect functions)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 *
 * const computation = Effect.fnUntracedEager(function*() {
 *   yield* Effect.succeed(1)
 *   yield* Effect.succeed(2)
 *   return "computed eagerly"
 * })
 *
 * const effect = computation() // Executed immediately if all effects are sync
 * Effect.runSync(effect) // => "computed eagerly"
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fnUntracedEager: fn.Untraced = internal.fnUntracedEager
