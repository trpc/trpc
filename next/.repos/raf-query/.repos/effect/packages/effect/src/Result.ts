/**
 * Models a value that has already succeeded or failed.
 *
 * A `Result<A, E>` is `Success<A, E>` when a value is available and
 * `Failure<A, E>` when an error is available. It is plain data, so inspecting
 * or transforming it does not run side effects. This module includes helpers
 * for creating, checking, mapping, combining, and extracting results, plus
 * conversions to and from `Option` and nullable values.
 *
 * @since 4.0.0
 */

import * as Equivalence from "./Equivalence.ts"
import type { LazyArg } from "./Function.ts"
import { constNull, constUndefined, dual, identity } from "./Function.ts"
import type { TypeLambda } from "./HKT.ts"
import type { Inspectable } from "./Inspectable.ts"
import * as doNotation from "./internal/doNotation.ts"
import * as option_ from "./internal/option.ts"
import * as InternalRecord from "./internal/record.ts"
import * as result from "./internal/result.ts"
import type { Option } from "./Option.ts"
import type { Pipeable } from "./Pipeable.ts"
import type { Predicate, Refinement } from "./Predicate.ts"
import { isFunction } from "./Predicate.ts"
import type { Covariant, NoInfer, NotFunction } from "./Types.ts"
import type * as Unify from "./Unify.ts"
import type * as Gen from "./Utils.ts"

const TypeId = "~effect/Result"

/**
 * A value that is either `Success<A, E>` or `Failure<A, E>`.
 *
 * **When to use**
 *
 * Use when both success and failure should remain available as data and
 * `Option` would lose failure information.
 *
 * **Details**
 *
 * - Use {@link succeed} / {@link fail} to construct
 * - Use {@link match} to fold both branches
 * - Use {@link isSuccess} / {@link isFailure} to narrow the type
 *
 * `E` defaults to `never`, so `Result<number>` means a result that cannot fail.
 *
 * **Example** (Creating and matching a Result)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 *
 * Result.match(Result.succeed(42), {
 *   onSuccess: (value) => `Success: ${value}`,
 *   onFailure: (error) => `Error: ${error}`
 * }) // => "Success: 42"
 * ```
 *
 * @see {@link succeed} / {@link fail} to create values
 * @see {@link match} to fold both branches
 * @see {@link isSuccess} / {@link isFailure} for type guards
 *
 * @category models
 * @since 4.0.0
 */
export type Result<A, E = never> = Success<A, E> | Failure<A, E>

/**
 * The failure variant of {@link Result}. Wraps an error of type `E`.
 *
 * **Details**
 *
 * - Access the error via the `.failure` property
 * - Use {@link isFailure} to narrow a `Result` to `Failure`
 * - Create with {@link fail}
 *
 * **Example** (Accessing the failure value)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 *
 * const failure = Result.fail("Network error")
 *
 * if (Result.isFailure(failure)) {
 *   failure.failure // => "Network error"
 * }
 * ```
 *
 * @see {@link fail} to create a Failure
 * @see {@link isFailure} to narrow the type
 * @see {@link Success} for the other variant
 *
 * @category models
 * @since 4.0.0
 */
export interface Failure<out A, out E> extends Pipeable, Inspectable {
  readonly _tag: "Failure"
  readonly _op: "Failure"
  readonly failure: E
  readonly [TypeId]: {
    readonly _A: Covariant<E>
    readonly _E: Covariant<A>
  }
  [Symbol.iterator](): ResultIterator<Result<A, E>>
  [Unify.typeSymbol]?: unknown
  [Unify.unifySymbol]?: ResultUnify<this>
  [Unify.ignoreSymbol]?: ResultUnifyIgnore
}

/**
 * Iterator protocol used to yield a `Result` inside {@link gen}, returning the
 * success value type back to the generator.
 *
 * **When to use**
 *
 * Use when defining or typing `[Symbol.iterator]()` for `Result` values so
 * `yield*` can pass the success value type back into `Result.gen`.
 *
 * @see {@link gen} for writing generator-based `Result` code that consumes this iterator protocol
 *
 * @category generators
 * @since 4.0.0
 */
export interface ResultIterator<T extends Result<any, any>> {
  next(
    ...args: ReadonlyArray<any>
  ): IteratorResult<T, Result.Success<T>>
}

/**
 * The success variant of {@link Result}. Wraps a value of type `A`.
 *
 * **Details**
 *
 * - Access the value via the `.success` property
 * - Use {@link isSuccess} to narrow a `Result` to `Success`
 * - Create with {@link succeed}
 *
 * **Example** (Accessing the success value)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 *
 * const success = Result.succeed(42)
 *
 * if (Result.isSuccess(success)) {
 *   success.success // => 42
 * }
 * ```
 *
 * @see {@link succeed} to create a Success
 * @see {@link isSuccess} to narrow the type
 * @see {@link Failure} for the other variant
 *
 * @category models
 * @since 4.0.0
 */
export interface Success<out A, out E> extends Pipeable, Inspectable {
  readonly _tag: "Success"
  readonly _op: "Success"
  readonly success: A
  readonly [TypeId]: {
    readonly _A: Covariant<E>
    readonly _E: Covariant<A>
  }
  [Symbol.iterator](): ResultIterator<Result<A, E>>
  [Unify.typeSymbol]?: unknown
  [Unify.unifySymbol]?: ResultUnify<this>
  [Unify.ignoreSymbol]?: ResultUnifyIgnore
}

/**
 * Type-level utility for unifying `Result` types in generic contexts.
 *
 * **Details**
 *
 * This is an internal interface used by the Effect type system. You typically
 * do not need to reference it directly.
 *
 * @category models
 * @since 4.0.0
 */
export interface ResultUnify<T extends { [Unify.typeSymbol]?: any }> {
  Result?: () => T[Unify.typeSymbol] extends Result<infer A, infer E> | infer _ ? Result<A, E> : never
}

/**
 * Marker interface for ignoring unification in `Result` types.
 *
 * **Details**
 *
 * This is an internal interface used by the Effect type system. You typically
 * do not need to reference it directly.
 *
 * @category models
 * @since 4.0.0
 */
export interface ResultUnifyIgnore {}

/**
 * Higher-kinded type representation for `Result`.
 *
 * **Details**
 *
 * Used internally to integrate `Result` with generic type-class utilities
 * (e.g., `map`, `flatMap` abstractions). You typically do not need to
 * reference this directly.
 *
 * @category utility types
 * @since 4.0.0
 */
export interface ResultTypeLambda extends TypeLambda {
  readonly type: Result<this["Target"], this["Out1"]>
}

/**
 * Namespace containing type-level utilities for extracting the inner types
 * of a `Result`.
 *
 * **Example** (Extracting inner types)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 *
 * type R = Result.Result<number, string>
 *
 * // number
 * type A = Result.Result.Success<R>
 *
 * // string
 * type E = Result.Result.Failure<R>
 *
 * const success: A = 42
 * const failure: E = "error"
 * ```
 *
 * @since 4.0.0
 */
export declare namespace Result {
  /**
   * Extracts the failure type `E` from `Result<A, E>`.
   *
   * @category utility types
   * @since 4.0.0
   */
  export type Failure<T extends Result<any, any>> = [T] extends [Result<infer _A, infer _E>] ? _E : never
  /**
   * Extracts the success type `A` from `Result<A, E>`.
   *
   * @category utility types
   * @since 4.0.0
   */
  export type Success<T extends Result<any, any>> = [T] extends [Result<infer _A, infer _E>] ? _A : never
}

/**
 * Creates a `Result` holding a `Success` value.
 *
 * **Details**
 *
 * - Use when you have a value and want to lift it into the `Result` type
 * - The error type `E` defaults to `never`
 *
 * **Example** (Wrapping a value)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 *
 * Result.succeed(42) // => Result.succeed(42)
 * ```
 *
 * @see {@link fail} to create a Failure
 * @see {@link void_ void} for a pre-built `Success<void>`
 *
 * @category constructors
 * @since 4.0.0
 */
export const succeed: <A>(right: A) => Result<A> = result.succeed

/**
 * Creates a `Result` holding a `Failure` value.
 *
 * **When to use**
 *
 * Use to represent a failed `Result` with a typed failure value.
 *
 * **Details**
 *
 * - The success type `A` defaults to `never`
 *
 * **Example** (Creating a failure)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 *
 * Result.fail("Something went wrong") // => Result.fail("Something went wrong")
 * ```
 *
 * @see {@link succeed} to create a Success
 * @see {@link mapError} to transform the error
 *
 * @category constructors
 * @since 4.0.0
 */
export const fail: <E>(left: E) => Result<never, E> = result.fail

const void_: Result<void> = succeed(void 0)
export {
  /**
   * Provides a pre-built successful `Result` that carries `undefined`.
   *
   * **When to use**
   *
   * Use when you need a successful `Result` value that signals completion
   * without carrying meaningful data.
   *
   * **Details**
   *
   * This is equivalent to `Result.succeed(undefined)`, but reuses a shared
   * `Success` wrapper instead of allocating one each time.
   *
   * **Example** (Referencing void results)
   *
   * ```ts import.meta.vitest
   * import { Result } from "effect"
   *
   * const result: Result.Result<void> = Result.void // => Result.succeed(undefined)
   * ```
   *
   * @see {@link succeed} to create a Success with a specific value
   *
   * @category constructors
   * @since 3.13.0
   */
  void_ as void
}

/**
 * Provides a pre-built failed `Result` whose failure value is `undefined`.
 *
 * **When to use**
 *
 * Use when you need a failed `Result` value that acts only as a control signal
 * without failure data.
 *
 * **Details**
 *
 * This is equivalent to `Result.fail(undefined)` with type
 * `Result<never, void>`, but reuses a shared `Failure` wrapper instead of
 * allocating one each time.
 *
 * **Example** (Failing without a payload)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 *
 * Result.failVoid // => Result.fail(undefined)
 * ```
 *
 * @see {@link fail} to create a Failure with a specific value
 *
 * @category constructors
 * @since 4.0.0
 */
export const failVoid: Result<never, void> = fail(void 0)

/**
 * Converts a possibly `null` or `undefined` value into a `Result`.
 *
 * **When to use**
 *
 * Use when you need `null` or `undefined` input to become a `Failure` while
 * present values remain available as `Success`.
 *
 * **Details**
 *
 * - Non-nullish values become `Success<NonNullable<A>>`
 * - `null` or `undefined` becomes `Failure<E>` using the provided function
 * - Supports both data-first and data-last (piped) usage
 * - The `onNullish` callback receives the original value
 *
 * **Example** (Handling nullable values)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 *
 * Result.fromNullishOr(1, () => "fallback") // => Result.succeed(1)
 *
 * Result.fromNullishOr(null, () => "fallback") // => Result.fail("fallback")
 * ```
 *
 * @see {@link fromOption} to convert from an Option
 * @see {@link succeed} / {@link fail} for direct construction
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromNullishOr: {
  <A, E>(onNullish: (a: A) => E): (self: A) => Result<NonNullable<A>, E>
  <A, E>(self: A, onNullish: (a: A) => E): Result<NonNullable<A>, E>
} = dual(
  2,
  <A, E>(self: A, onNullish: (a: A) => E): Result<NonNullable<A>, E> =>
    self == null ? fail(onNullish(self)) : succeed(self)
)

/**
 * Converts an `Option<A>` into a `Result<A, E>`.
 *
 * **When to use**
 *
 * Use when an existing `Option` should become a `Result`, preserving `Some` as
 * success and turning `None` into a caller-provided failure.
 *
 * **Details**
 *
 * - `Some<A>` becomes `Success<A>`
 * - `None` becomes `Failure<E>` using the provided function
 * - Supports both data-first and data-last (piped) usage
 *
 * **Example** (Converting an Option to a Result)
 *
 * ```ts import.meta.vitest
 * import { Option, Result } from "effect"
 *
 * Result.fromOption(Option.some(1), () => "missing") // => Result.succeed(1)
 *
 * Result.fromOption(Option.none(), () => "missing") // => Result.fail("missing")
 * ```
 *
 * @see {@link getSuccess} to extract the success value as an Option
 * @see {@link getFailure} to extract the failure value as an Option
 * @see {@link fromNullishOr} to build a Result from nullable values
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromOption: {
  <E>(onNone: () => E): <A>(self: Option<A>) => Result<A, E>
  <A, E>(self: Option<A>, onNone: () => E): Result<A, E>
} = result.fromOption

const try_: {
  <A, E>(
    options: {
      readonly try: LazyArg<A>
      readonly catch: (error: unknown) => E
    }
  ): Result<A, E>
  <A>(evaluate: LazyArg<A>): Result<A, unknown>
} = <A, E>(
  evaluate: LazyArg<A> | {
    readonly try: LazyArg<A>
    readonly catch: (error: unknown) => E
  }
) => {
  if (isFunction(evaluate)) {
    try {
      return succeed(evaluate())
    } catch (e) {
      return fail(e)
    }
  } else {
    try {
      return succeed(evaluate.try())
    } catch (e) {
      return fail(evaluate.catch(e))
    }
  }
}

export {
  /**
   * Wraps a synchronous computation that may throw into a `Result` safely.
   *
   * **Details**
   *
   * - If the function returns normally, the result is `Success<A>`
   * - If the function throws, the exception is caught and becomes `Failure<E>`
   * - With a single function argument, the error type is `unknown`
   * - With `{ try, catch }` options, the `catch` function maps the thrown value to `E`
   *
   * **Example** (Catching JSON parse errors)
   *
   * ```ts import.meta.vitest
   * import { Result } from "effect"
   *
   * Result.try(() => JSON.parse('{"name": "Alice"}')) // => Result.succeed({ name: "Alice" })
   *
   * const err = Result.try({
   *   try: () => JSON.parse("not json"),
   *   catch: (e) => `Parse failed: ${e}`
   * })
   * Result.isFailure(err) // => true
   * ```
   *
   * @see {@link succeed} / {@link fail} for direct construction
   * @see {@link fromNullishOr} for nullable values
   *
   * @category constructors
   * @since 2.0.0
   */
  try_ as try
}

/**
 * Checks whether a value is a `Result` (either `Success` or `Failure`).
 *
 * **When to use**
 *
 * Use to validate unknown input before operating on it as a `Result`.
 *
 * **Details**
 *
 * - Returns `true` for both `Success` and `Failure` variants
 * - Acts as a TypeScript type guard, narrowing to `Result<unknown, unknown>`
 *
 * **Example** (Checking if a value is a Result)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 *
 * Result.isResult(Result.succeed(1)) // => true
 *
 * Result.isResult({ value: 1 }) // => false
 * ```
 *
 * @see {@link isSuccess} / {@link isFailure} to narrow to a specific variant
 *
 * @category guards
 * @since 4.0.0
 */
export const isResult: (input: unknown) => input is Result<unknown, unknown> = result.isResult

/**
 * Checks whether a `Result` is a `Failure`.
 *
 * **When to use**
 *
 * Use to narrow a known `Result` to the `Failure` variant.
 *
 * **Details**
 *
 * - Acts as a TypeScript type guard, narrowing to `Failure<A, E>`
 * - After narrowing, you can access `.failure` to read the error value
 *
 * **Example** (Narrowing to failure)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 *
 * const result = Result.fail("oops")
 *
 * if (Result.isFailure(result)) {
 *   result.failure // => "oops"
 * }
 * ```
 *
 * @see {@link isSuccess} for the opposite check
 * @see {@link isResult} to check if a value is any Result
 *
 * @category guards
 * @since 4.0.0
 */
export const isFailure: <A, E>(self: Result<A, E>) => self is Failure<A, E> = result.isFailure

/**
 * Checks whether a `Result` is a `Success`.
 *
 * **When to use**
 *
 * Use to narrow a known `Result` to the `Success` variant.
 *
 * **Details**
 *
 * - Acts as a TypeScript type guard, narrowing to `Success<A, E>`
 * - After narrowing, you can access `.success` to read the value
 *
 * **Example** (Narrowing to success)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 *
 * const result = Result.succeed(42)
 *
 * if (Result.isSuccess(result)) {
 *   result.success // => 42
 * }
 * ```
 *
 * @see {@link isFailure} for the opposite check
 * @see {@link isResult} to check if a value is any Result
 *
 * @category guards
 * @since 4.0.0
 */
export const isSuccess: <A, E>(self: Result<A, E>) => self is Success<A, E> = result.isSuccess

/**
 * Extracts the success value as an `Option`, discarding the failure.
 *
 * **When to use**
 *
 * Use when you need to extract the success value from a `Result` as an
 * `Option` and discard failure information.
 *
 * **Details**
 *
 * - `Success<A>` becomes `Some<A>`
 * - `Failure<E>` becomes `None`
 *
 * **Example** (Extracting the success as an Option)
 *
 * ```ts import.meta.vitest
 * import { Option, Result } from "effect"
 *
 * Result.getSuccess(Result.succeed("ok")) // => Option.some("ok")
 *
 * Result.getSuccess(Result.fail("err")) // => Option.none()
 * ```
 *
 * @see {@link getFailure} to extract the error instead
 * @see {@link fromOption} for the reverse conversion
 *
 * @category getters
 * @since 4.0.0
 */
export const getSuccess: <A, E>(self: Result<A, E>) => Option<A> = result.getSuccess

/**
 * Extracts the failure value as an `Option`, discarding the success.
 *
 * **When to use**
 *
 * Use when you need to extract the failure value from a `Result` as an
 * `Option` and discard successful values.
 *
 * **Details**
 *
 * - `Failure<E>` becomes `Some<E>`
 * - `Success<A>` becomes `None`
 *
 * **Example** (Extracting the failure as an Option)
 *
 * ```ts import.meta.vitest
 * import { Option, Result } from "effect"
 *
 * Result.getFailure(Result.succeed("ok")) // => Option.none()
 *
 * Result.getFailure(Result.fail("err")) // => Option.some("err")
 * ```
 *
 * @see {@link getSuccess} to extract the success instead
 * @see {@link fromOption} for the reverse conversion
 *
 * @category getters
 * @since 4.0.0
 */
export const getFailure: <A, E>(self: Result<A, E>) => Option<E> = result.getFailure

/**
 * Creates an `Equivalence` for comparing two `Result` values.
 *
 * **Details**
 *
 * - Two `Success` values are equal when the `success` equivalence says so
 * - Two `Failure` values are equal when the `failure` equivalence says so
 * - A `Success` and a `Failure` are never equal
 *
 * **Example** (Comparing Results for equality)
 *
 * ```ts import.meta.vitest
 * import { Equivalence, Result } from "effect"
 *
 * const eq = Result.makeEquivalence(
 *   Equivalence.strictEqual<number>(),
 *   Equivalence.strictEqual<string>()
 * )
 *
 * eq(Result.succeed(1), Result.succeed(1)) // => true
 *
 * eq(Result.succeed(1), Result.fail("x")) // => false
 * ```
 *
 * @category instances
 * @since 4.0.0
 */
export const makeEquivalence = <A, E>(
  success: Equivalence.Equivalence<A>,
  failure: Equivalence.Equivalence<E>
): Equivalence.Equivalence<Result<A, E>> =>
  Equivalence.make((x, y) =>
    isFailure(x) ?
      isFailure(y) && failure(x.failure, y.failure) :
      isSuccess(y) && success(x.success, y.success)
  )

/**
 * Transforms both the success and failure channels of a `Result`.
 *
 * **When to use**
 *
 * Use to transform both success and failure values without changing whether the
 * result succeeds or fails.
 *
 * **Details**
 *
 * - Applies `onSuccess` if the result is a `Success`
 * - Applies `onFailure` if the result is a `Failure`
 *
 * **Example** (Mapping both channels)
 *
 * ```ts import.meta.vitest
 * import { pipe, Result } from "effect"
 *
 * pipe(
 *   Result.succeed(1),
 *   Result.mapBoth({
 *     onSuccess: (n) => n + 1,
 *     onFailure: (e) => `Error: ${e}`
 *   })
 * ) // => Result.succeed(2)
 * ```
 *
 * @see {@link map} to transform only the success value
 * @see {@link mapError} to transform only the error value
 * @see {@link match} to fold into a single value
 *
 * @category mapping
 * @since 2.0.0
 */
export const mapBoth: {
  <E, E2, A, A2>(options: {
    readonly onFailure: (left: E) => E2
    readonly onSuccess: (right: A) => A2
  }): (self: Result<A, E>) => Result<A2, E2>
  <E, A, E2, A2>(self: Result<A, E>, options: {
    readonly onFailure: (left: E) => E2
    readonly onSuccess: (right: A) => A2
  }): Result<A2, E2>
} = dual(
  2,
  <E, A, E2, A2>(self: Result<A, E>, { onFailure, onSuccess }: {
    readonly onFailure: (left: E) => E2
    readonly onSuccess: (right: A) => A2
  }): Result<A2, E2> => isFailure(self) ? fail(onFailure(self.failure)) : succeed(onSuccess(self.success))
)

/**
 * Transforms the failure channel of a `Result`, leaving the success channel unchanged.
 *
 * **When to use**
 *
 * Use to transform only the failure channel while preserving success values.
 *
 * **Details**
 *
 * - If the result is a `Failure`, applies `f` to the error and returns a new `Failure`
 * - If the result is a `Success`, returns it as-is
 *
 * **Example** (Adding context to an error)
 *
 * ```ts import.meta.vitest
 * import { pipe, Result } from "effect"
 *
 * pipe(
 *   Result.fail("not found"),
 *   Result.mapError((e) => `Error: ${e}`)
 * ) // => Result.fail("Error: not found")
 * ```
 *
 * @see {@link map} to transform only the success value
 * @see {@link mapBoth} to transform both channels
 *
 * @category mapping
 * @since 4.0.0
 */
export const mapError: {
  <E, E2>(f: (err: E) => E2): <A>(self: Result<A, E>) => Result<A, E2>
  <A, E, E2>(self: Result<A, E>, f: (err: E) => E2): Result<A, E2>
} = dual(
  2,
  <A, E, E2>(self: Result<A, E>, f: (err: E) => E2): Result<A, E2> =>
    isFailure(self) ? fail(f(self.failure)) : self as unknown as Result<A, E2>
)

/**
 * Transforms the success channel of a `Result`, leaving the failure channel unchanged.
 *
 * **When to use**
 *
 * Use to apply a transformation to the success value of a `Result` while
 * preserving any existing failure.
 *
 * **Details**
 *
 * - If the result is a `Success`, applies `f` to the value and returns a new `Success`
 * - If the result is a `Failure`, returns it as-is
 * - Use {@link flatMap} if `f` returns a `Result` (to avoid nested Results)
 *
 * **Example** (Doubling the success value)
 *
 * ```ts import.meta.vitest
 * import { pipe, Result } from "effect"
 *
 * pipe(
 *   Result.succeed(3),
 *   Result.map((n) => n * 2)
 * ) // => Result.succeed(6)
 * ```
 *
 * @see {@link mapError} to transform only the error value
 * @see {@link mapBoth} to transform both channels
 * @see {@link flatMap} when `f` returns a `Result`
 *
 * @category mapping
 * @since 2.0.0
 */
export const map: {
  <A, A2>(f: (ok: A) => A2): <E>(self: Result<A, E>) => Result<A2, E>
  <A, E, A2>(self: Result<A, E>, f: (ok: A) => A2): Result<A2, E>
} = dual(
  2,
  <A, E, A2>(self: Result<A, E>, f: (ok: A) => A2): Result<A2, E> =>
    isSuccess(self) ? succeed(f(self.success)) : self as unknown as Result<A2, E>
)

/**
 * Folds a `Result` into a single value by applying one of two functions.
 *
 * **When to use**
 *
 * Use when a `Result`'s success and failure branches should be collapsed into
 * one plain output type.
 *
 * **Details**
 *
 * - Applies `onSuccess` if the result is a `Success`
 * - Applies `onFailure` if the result is a `Failure`
 * - Both branches must return the same type (or a common supertype)
 *
 * **Example** (Folding to a string)
 *
 * ```ts import.meta.vitest
 * import { pipe, Result } from "effect"
 *
 * const format = Result.match({
 *   onSuccess: (n: number) => `Got ${n}`,
 *   onFailure: (e: string) => `Err: ${e}`
 * })
 *
 * format(Result.succeed(42)) // => "Got 42"
 *
 * format(Result.fail("timeout")) // => "Err: timeout"
 * ```
 *
 * @see {@link merge} to extract `A | E` without mapping
 * @see {@link getOrElse} to unwrap only the success with a fallback
 *
 * @category pattern matching
 * @since 2.0.0
 */
export const match: {
  <E, B, A, C = B>(options: {
    readonly onFailure: (error: E) => B
    readonly onSuccess: (ok: A) => C
  }): (self: Result<A, E>) => B | C
  <A, E, B, C = B>(self: Result<A, E>, options: {
    readonly onFailure: (error: E) => B
    readonly onSuccess: (ok: A) => C
  }): B | C
} = dual(
  2,
  <A, E, B, C = B>(self: Result<A, E>, { onFailure, onSuccess }: {
    readonly onFailure: (error: E) => B
    readonly onSuccess: (ok: A) => C
  }): B | C => isFailure(self) ? onFailure(self.failure) : onSuccess(self.success)
)

/**
 * Lifts a value into a `Result` based on a predicate or refinement.
 *
 * **When to use**
 *
 * Use to construct a `Result` from a raw value guarded by a predicate or
 * refinement.
 *
 * **Details**
 *
 * - If the predicate returns `true`, the value becomes `Success<A>`
 * - If the predicate returns `false`, `orFailWith` produces the error for `Failure<E>`
 * - Also accepts a `Refinement` to narrow the success type
 * - Supports both data-first and data-last (piped) usage
 *
 * **Example** (Validating a number)
 *
 * ```ts import.meta.vitest
 * import { pipe, Result } from "effect"
 *
 * pipe(
 *   5,
 *   Result.liftPredicate(
 *     (n: number) => n > 0,
 *     (n) => `${n} is not positive`
 *   )
 * ) // => Result.succeed(5)
 * ```
 *
 * @see {@link filterOrFail} to validate a value that is already in a `Result`
 * @see {@link fromNullishOr} for nullable-based construction
 *
 * @category constructors
 * @since 3.4.0
 */
export const liftPredicate: {
  <A, B extends A, E>(refinement: Refinement<A, B>, orFailWith: (a: A) => E): (a: A) => Result<B, E>
  <B extends A, E, A = B>(
    predicate: Predicate<A>,
    orFailWith: (a: A) => E
  ): (a: B) => Result<B, E>
  <A, E, B extends A>(
    self: A,
    refinement: Refinement<A, B>,
    orFailWith: (a: A) => E
  ): Result<B, E>
  <B extends A, E, A = B>(
    self: B,
    predicate: Predicate<A>,
    orFailWith: (a: A) => E
  ): Result<B, E>
} = dual(
  3,
  <A, E>(a: A, predicate: Predicate<A>, orFailWith: (a: A) => E): Result<A, E> =>
    predicate(a) ? succeed(a) : fail(orFailWith(a))
)

/**
 * Validates the success value of a `Result` using a predicate, failing with a
 * custom error if the predicate returns `false`.
 *
 * **When to use**
 *
 * Use to validate an already-successful `Result` value with a predicate or
 * refinement.
 *
 * **Details**
 *
 * - If the result is already a `Failure`, it is returned as-is
 * - If the predicate passes, the `Success` is returned unchanged
 * - If the predicate fails, `orFailWith` produces the error for a new `Failure`
 * - Also accepts a `Refinement` to narrow the success type
 * - The error type of the output is the union of both error types
 *
 * **Example** (Filtering a success value)
 *
 * ```ts import.meta.vitest
 * import { pipe, Result } from "effect"
 *
 * pipe(
 *   Result.succeed(0),
 *   Result.filterOrFail(
 *     (n) => n > 0,
 *     (n) => `${n} is not positive`
 *   )
 * ) // => Result.fail("0 is not positive")
 * ```
 *
 * @see {@link liftPredicate} to create a `Result` from a raw value with a predicate
 * @see {@link flatMap} for general conditional chaining
 *
 * @category filtering
 * @since 4.0.0
 */
export const filterOrFail: {
  <A, B extends A, E2>(
    refinement: Refinement<NoInfer<A>, B>,
    orFailWith: (value: NoInfer<A>) => E2
  ): <E>(self: Result<A, E>) => Result<B, E2 | E>
  <A, E2>(
    predicate: Predicate<NoInfer<A>>,
    orFailWith: (value: NoInfer<A>) => E2
  ): <E>(self: Result<A, E>) => Result<A, E2 | E>
  <A, E, B extends A, E2>(
    self: Result<A, E>,
    refinement: Refinement<A, B>,
    orFailWith: (value: A) => E2
  ): Result<B, E | E2>
  <A, E, E2>(self: Result<A, E>, predicate: Predicate<A>, orFailWith: (value: A) => E2): Result<A, E | E2>
} = dual(3, <A, E, E2>(
  self: Result<A, E>,
  predicate: Predicate<A>,
  orFailWith: (value: A) => E2
): Result<A, E | E2> => flatMap(self, (a) => predicate(a) ? succeed(a) : fail(orFailWith(a))))

/**
 * Unwraps a `Result` into `A | E` by returning the inner value regardless
 * of whether it is a success or failure.
 *
 * **Details**
 *
 * - `Success<A>` returns `A`
 * - `Failure<E>` returns `E`
 * - Useful when both channels share a compatible type
 *
 * **Example** (Extracting the inner value)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 *
 * Result.merge(Result.succeed(42)) // => 42
 *
 * Result.merge(Result.fail("error")) // => "error"
 * ```
 *
 * @see {@link match} to map each branch to a common type
 * @see {@link getOrElse} to provide a fallback for failures
 *
 * @category getters
 * @since 2.0.0
 */
export const merge: <A, E>(self: Result<A, E>) => E | A = match({ onFailure: identity, onSuccess: identity })

/**
 * Extracts the success value, or computes a fallback from the error.
 *
 * **When to use**
 *
 * Use when you need the success value from a `Result`, with a fallback computed
 * from the failure value.
 *
 * **Details**
 *
 * - `Success<A>` returns the inner value
 * - `Failure<E>` applies `onFailure` to the error and returns the result
 * - The return type is `A | A2` (union of both branches)
 *
 * **Example** (Providing a fallback)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 *
 * Result.getOrElse(Result.succeed(1), () => 0) // => 1
 *
 * Result.getOrElse(Result.fail("err"), () => 0) // => 0
 * ```
 *
 * @see {@link getOrNull} / {@link getOrUndefined} for simpler fallbacks
 * @see {@link getOrThrow} to throw on failure
 * @see {@link match} to map both branches
 * @see {@link orElse} to recover with another Result instead of unwrapping
 *
 * @category getters
 * @since 2.0.0
 */
export const getOrElse: {
  <E, A2>(onFailure: (err: E) => A2): <A>(self: Result<A, E>) => A2 | A
  <A, E, A2>(self: Result<A, E>, onFailure: (err: E) => A2): A | A2
} = dual(
  2,
  <A, E, A2>(self: Result<A, E>, onFailure: (err: E) => A2): A | A2 =>
    isFailure(self) ? onFailure(self.failure) : self.success
)

/**
 * Extracts the success value, or returns `null` on failure.
 *
 * **When to use**
 *
 * Use when you need to pass failed `Result` values to APIs that represent
 * absence as `null`.
 *
 * **Details**
 *
 * - `Success<A>` returns `A`
 * - `Failure<E>` returns `null`
 *
 * **Example** (Unwrapping to nullable)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 *
 * Result.getOrNull(Result.succeed(1)) // => 1
 *
 * Result.getOrNull(Result.fail("err")) // => null
 * ```
 *
 * @see {@link getOrUndefined} to return `undefined` instead
 * @see {@link getOrElse} for a custom fallback
 *
 * @category getters
 * @since 2.0.0
 */
export const getOrNull: <A, E>(self: Result<A, E>) => A | null = getOrElse(constNull)

/**
 * Extracts the success value, or returns `undefined` on failure.
 *
 * **When to use**
 *
 * Use when you need to pass failed `Result` values to APIs that represent
 * absence as `undefined`.
 *
 * **Details**
 *
 * - `Success<A>` returns `A`
 * - `Failure<E>` returns `undefined`
 *
 * **Example** (Unwrapping to optional)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 *
 * Result.getOrUndefined(Result.succeed(1)) // => 1
 *
 * Result.getOrUndefined(Result.fail("err")) // => undefined
 * ```
 *
 * @see {@link getOrNull} to return `null` instead
 * @see {@link getOrElse} for a custom fallback
 *
 * @category getters
 * @since 2.0.0
 */
export const getOrUndefined: <A, E>(self: Result<A, E>) => A | undefined = getOrElse(constUndefined)

/**
 * Extracts the success value or throws a custom error derived from the failure.
 *
 * **When to use**
 *
 * Use when converting a `Result` into a thrown exception with a custom error
 * message or error type.
 *
 * **Details**
 *
 * - `Success<A>` returns `A`
 * - `Failure<E>` throws the value returned by `onFailure(e)`
 *
 * **Example** (Throwing a custom error)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 *
 * Result.getOrThrowWith(Result.succeed(1), () => new Error("fail")) // => 1
 *
 * const failure = Result.try({
 *   try: () => Result.getOrThrowWith(
 *     Result.fail("oops"),
 *     (error) => new Error(`Unexpected: ${error}`)
 *   ),
 *   catch: (error) => (error as Error).message
 * })
 * Result.merge(failure) // => "Unexpected: oops"
 * ```
 *
 * @see {@link getOrThrow} to throw the raw failure value
 * @see {@link getOrElse} for a non-throwing alternative
 *
 * @category getters
 * @since 2.0.0
 */
export const getOrThrowWith: {
  <E>(onFailure: (err: E) => unknown): <A>(self: Result<A, E>) => A
  <A, E>(self: Result<A, E>, onFailure: (err: E) => unknown): A
} = dual(2, <A, E>(self: Result<A, E>, onFailure: (err: E) => unknown): A => {
  if (isSuccess(self)) {
    return self.success
  }
  throw onFailure(self.failure)
})

/**
 * Extracts the success value or throws the raw failure value `E`.
 *
 * **When to use**
 *
 * Use when unchecked boundaries should turn failures into thrown exceptions.
 *
 * **Details**
 *
 * - `Success<A>` returns `A`
 * - `Failure<E>` throws `E` directly
 * - Use {@link getOrThrowWith} for a custom error object
 *
 * **Example** (Unwrapping or throwing)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 *
 * Result.getOrThrow(Result.succeed(1)) // => 1
 *
 * const failure = Result.try(() => Result.getOrThrow(Result.fail("error")))
 * Result.merge(failure) // => "error"
 * ```
 *
 * @see {@link getOrThrowWith} for custom error mapping
 * @see {@link getOrElse} for a non-throwing alternative
 *
 * @category getters
 * @since 2.0.0
 */
export const getOrThrow: <A, E>(self: Result<A, E>) => A = getOrThrowWith(identity)

/**
 * Returns the original `Result` if it is a `Success`, otherwise applies
 * `that` to the error and returns the resulting `Result`.
 *
 * **When to use**
 *
 * Use when a failure should recover into another `Result` while keeping
 * successes unchanged.
 *
 * **Details**
 *
 * - `Success<A>` is returned unchanged
 * - `Failure<E>` calls `that(e)` to produce a new `Result`
 *
 * **Example** (Recovering from a failure)
 *
 * ```ts import.meta.vitest
 * import { pipe, Result } from "effect"
 *
 * pipe(
 *   Result.fail("primary failed"),
 *   Result.orElse(() => Result.succeed(99))
 * ) // => Result.succeed(99)
 * ```
 *
 * @see {@link getOrElse} to unwrap with a fallback value (not a Result)
 * @see {@link mapError} to transform the error without recovering
 *
 * @category error handling
 * @since 2.0.0
 */
export const orElse: {
  <E, A2, E2>(that: (err: E) => Result<A2, E2>): <A>(self: Result<A, E>) => Result<A | A2, E2>
  <A, E, A2, E2>(self: Result<A, E>, that: (err: E) => Result<A2, E2>): Result<A | A2, E2>
} = dual(
  2,
  <A, E, A2, E2>(self: Result<A, E>, that: (err: E) => Result<A2, E2>): Result<A | A2, E2> =>
    isFailure(self) ? that(self.failure) : succeed(self.success)
)

/**
 * Chains a function that returns a `Result` onto a successful value.
 *
 * **When to use**
 *
 * Use to sequence `Result`-returning computations that should short-circuit on
 * failure.
 *
 * **Details**
 *
 * - If `self` is a `Success`, applies `f` to the value and returns the resulting `Result`
 * - If `self` is a `Failure`, short-circuits and returns it unchanged
 * - The error types are merged into a union (`E | E2`)
 * - This is the monadic `bind` / `>>=` for `Result`
 *
 * **Example** (Validating sequentially)
 *
 * ```ts import.meta.vitest
 * import { pipe, Result } from "effect"
 *
 * pipe(
 *   Result.succeed(5),
 *   Result.flatMap((n) =>
 *     n > 0 ? Result.succeed(n * 2) : Result.fail("not positive")
 *   )
 * ) // => Result.succeed(10)
 * ```
 *
 * @see {@link andThen} for a more flexible variant that also accepts plain values
 * @see {@link map} when `f` does not return a `Result`
 *
 * @category sequencing
 * @since 2.0.0
 */
export const flatMap: {
  <A, A2, E2>(f: (a: A) => Result<A2, E2>): <E>(self: Result<A, E>) => Result<A2, E | E2>
  <A, E, A2, E2>(self: Result<A, E>, f: (a: A) => Result<A2, E2>): Result<A2, E | E2>
} = dual(
  2,
  <A, E, A2, E2>(self: Result<A, E>, f: (a: A) => Result<A2, E2>): Result<A2, E | E2> =>
    isFailure(self) ? fail(self.failure) : f(self.success)
)

/**
 * Provides a flexible variant of {@link flatMap} that accepts multiple input shapes.
 *
 * **When to use**
 *
 * Use to sequence a next step that may be a `Result`, a function, or a plain
 * value.
 *
 * **Details**
 *
 * The second argument can be:
 * - A function `(a: A) => Result<A2, E2>` (same as `flatMap`)
 * - A function `(a: A) => A2` (auto-wrapped in `succeed`)
 * - A `Result<A2, E2>` value (ignores the success of `self`)
 * - A plain value `A2` (auto-wrapped in `succeed`, ignores `self`)
 *
 * If `self` is a `Failure`, the second argument is never evaluated.
 *
 * **Example** (Chaining Result values with different argument types)
 *
 * ```ts import.meta.vitest
 * import { pipe, Result } from "effect"
 *
 * // With a function returning a Result
 * const a = pipe(
 *   Result.succeed(1),
 *   Result.andThen((n) => Result.succeed(n + 1))
 * ) // => Result.succeed(2)
 *
 * // With a plain mapping function
 * const b = pipe(
 *   Result.succeed(1),
 *   Result.andThen((n) => n + 1)
 * ) // => Result.succeed(2)
 *
 * // With a constant value
 * const c = pipe(Result.succeed(1), Result.andThen("done")) // => Result.succeed("done")
 * ```
 *
 * @see {@link flatMap} for the stricter variant (function returning Result only)
 * @see {@link map} when you always return a plain value
 *
 * @category sequencing
 * @since 2.0.0
 */
export const andThen: {
  <A, A2, E2>(f: (a: A) => Result<A2, E2>): <E>(self: Result<A, E>) => Result<A2, E | E2>
  <A2, E2>(f: Result<A2, E2>): <A, E>(self: Result<A, E>) => Result<A2, E | E2>
  <A, A2>(f: (a: A) => A2): <E>(self: Result<A, E>) => Result<A2, E>
  <A2>(right: NotFunction<A2>): <A, E>(self: Result<A, E>) => Result<A2, E>
  <A, E, A2, E2>(self: Result<A, E>, f: (a: A) => Result<A2, E2>): Result<A2, E | E2>
  <A, E, A2, E2>(self: Result<A, E>, f: Result<A2, E2>): Result<A2, E | E2>
  <A, E, A2>(self: Result<A, E>, f: (a: A) => A2): Result<A2, E>
  <A, E, A2>(self: Result<A, E>, f: NotFunction<A2>): Result<A2, E>
} = dual(
  2,
  <A, E, A2, E2>(
    self: Result<A, E>,
    f: ((a: A) => Result<A2, E2> | A2) | Result<A2, E2> | A2
  ): Result<A2, E | E2> =>
    flatMap(self, (a) => {
      const out = isFunction(f) ? f(a) : f
      return isResult(out) ? out : succeed(out)
    })
)

/**
 * Collects a structure of `Result`s into a single `Result` of collected values.
 *
 * **When to use**
 *
 * Use to collect independent `Result` values into one `Result` while preserving
 * the original structure.
 *
 * **Details**
 *
 * Accepts:
 * - A tuple/array: returns `Result` with a tuple/array of success values
 * - A struct (record): returns `Result` with a struct of success values
 * - An iterable: returns `Result` with an array of success values
 *
 * Short-circuits on the first `Failure` encountered; later elements are not inspected.
 *
 * **Example** (Collecting a tuple and a struct)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 *
 * // Tuple
 * Result.all([Result.succeed(1), Result.succeed("two")]) // => Result.succeed([1, "two"])
 *
 * // Struct
 * Result.all({ x: Result.succeed(1), y: Result.fail("err") }) // => Result.fail("err")
 * ```
 *
 * @see {@link flatMap} for chaining two Results sequentially
 * @see {@link gen} for generator-based composition of multiple Results
 *
 * @category sequencing
 * @since 2.0.0
 */
// @ts-expect-error
export const all: <const I extends Iterable<Result<any, any>> | Record<string, Result<any, any>>>(
  input: I
) => [I] extends [ReadonlyArray<Result<any, any>>] ? Result<
    { -readonly [K in keyof I]: [I[K]] extends [Result<infer R, any>] ? R : never },
    I[number] extends never ? never : [I[number]] extends [Result<any, infer L>] ? L : never
  >
  : [I] extends [Iterable<Result<infer R, infer L>>] ? Result<Array<R>, L>
  : Result<
    { -readonly [K in keyof I]: [I[K]] extends [Result<infer R, any>] ? R : never },
    I[keyof I] extends never ? never : [I[keyof I]] extends [Result<any, infer L>] ? L : never
  > = (
    input: Iterable<Result<any, any>> | Record<string, Result<any, any>>
  ): Result<any, any> => {
    if (Symbol.iterator in input) {
      const out: Array<Result<any, any>> = []
      for (const e of input) {
        if (isFailure(e)) {
          return e
        }
        out.push(e.success)
      }
      return succeed(out)
    }

    const out: Record<string, any> = {}
    for (const key of Object.keys(input)) {
      const e = input[key]
      if (isFailure(e)) {
        return e
      }
      InternalRecord.assignProperty(out, key, e.success)
    }
    return succeed(out)
  }

/**
 * Swaps the success and failure channels of a `Result`.
 *
 * **When to use**
 *
 * Use to swap channels when failure-focused operations are easier through
 * success-oriented combinators.
 *
 * **Details**
 *
 * - `Success<A>` becomes `Failure<A>` (i.e., `Result<E, A>`)
 * - `Failure<E>` becomes `Success<E>` (i.e., `Result<E, A>`)
 * - Useful when you want to apply success-oriented operations (like `map`)
 *   to the error channel, then flip back
 *
 * **Example** (Swapping channels)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 *
 * Result.flip(Result.succeed(42)) // => Result.fail(42)
 *
 * Result.flip(Result.fail("error")) // => Result.succeed("error")
 * ```
 *
 * @see {@link mapError} to transform the error without swapping
 *
 * @category transforming
 * @since 2.0.0
 */
export const flip = <A, E>(self: Result<A, E>): Result<E, A> =>
  isFailure(self) ? succeed(self.failure) : fail(self.success)

/**
 * Provides generator-based syntax for composing `Result` values sequentially.
 *
 * **When to use**
 *
 * Use when you need generator syntax to compose sequential `Result`
 * computations instead of nested `flatMap` calls.
 *
 * **Details**
 *
 * - Use `yield*` to unwrap a `Result` inside the generator; if any yielded
 *   `Result` is a `Failure`, the generator short-circuits and returns that failure
 * - The return value of the generator is wrapped in `Success`
 * - Evaluated eagerly and synchronously (unlike `Effect.gen`)
 *
 * **Example** (Composing multiple Results)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 *
 * Result.gen(function*() {
 *   const a = yield* Result.succeed(1)
 *   const b = yield* Result.succeed(2)
 *   return a + b
 * }) // => Result.succeed(3)
 * ```
 *
 * @see {@link flatMap} for point-free sequential composition
 * @see {@link all} to collect multiple independent Results
 *
 * @category generators
 * @since 2.0.0
 */
export const gen: Gen.Gen<ResultTypeLambda> = (...args) => {
  const f = args.length === 1 ? args[0] : args[1].bind(args[0])
  const iterator = f()
  let state: IteratorResult<any> = iterator.next()
  while (!state.done) {
    const current = state.value
    if (isFailure(current)) {
      return current
    }
    state = iterator.next(current.success as never)
  }
  return succeed(state.value) as any
}

// -------------------------------------------------------------------------------------
// do notation
// -------------------------------------------------------------------------------------

/**
 * Provides the starting point for the "do notation" simulation with `Result`.
 *
 * **When to use**
 *
 * Use to start a `Result` do-notation pipeline from an empty successful record
 * before adding named fields from `Result`-producing computations and pure
 * computed values.
 *
 * **Details**
 *
 * Creates a `Result<{}>` (success with an empty object). Use with
 * {@link bind} to add `Result`-producing fields and {@link let_ let}
 * to add pure computed fields.
 *
 * **Example** (Building an object step by step)
 *
 * ```ts import.meta.vitest
 * import { pipe, Result } from "effect"
 *
 * pipe(
 *   Result.Do,
 *   Result.bind("x", () => Result.succeed(2)),
 *   Result.bind("y", () => Result.succeed(3)),
 *   Result.let("sum", ({ x, y }) => x + y)
 * ) // => Result.succeed({ x: 2, y: 3, sum: 5 })
 * ```
 *
 * @see {@link bind} to add Result-producing fields
 * @see {@link let_ let} to add pure computed fields
 * @see {@link gen} for an alternative generator-based syntax
 * @see {@link bindTo} for starting a do-notation chain from an existing Result
 *
 * @category constructors
 * @since 2.0.0
 */
export const Do: Result<{}> = succeed({})

/**
 * Adds a named field to the do-notation accumulator by running a `Result`-producing
 * function that receives the current accumulated object.
 *
 * **When to use**
 *
 * Use when you need to add a `Result`-producing step to a `Result`
 * do-notation pipeline and store its successful value under a named field in
 * the accumulated object.
 *
 * **Details**
 *
 * - Short-circuits on the first `Failure`
 * - The field name must not collide with existing keys
 * - Use {@link let_ let} for pure (non-Result) computed fields
 *
 * **Example** (Binding Result values)
 *
 * ```ts import.meta.vitest
 * import { pipe, Result } from "effect"
 *
 * pipe(
 *   Result.Do,
 *   Result.bind("x", () => Result.succeed(2)),
 *   Result.bind("y", ({ x }) => Result.succeed(x + 3))
 * ) // => Result.succeed({ x: 2, y: 5 })
 * ```
 *
 * @see {@link Do} to start the do-notation chain
 * @see {@link let_ let} for pure computed fields
 * @see {@link bindTo} to wrap an initial Result into a named field
 *
 * @category sequencing
 * @since 2.0.0
 */
export const bind: {
  <N extends string, A extends object, B, L2>(
    name: Exclude<N, keyof A>,
    f: (a: NoInfer<A>) => Result<B, L2>
  ): <L1>(self: Result<A, L1>) => Result<{ [K in N | keyof A]: K extends keyof A ? A[K] : B }, L1 | L2>
  <A extends object, L1, N extends string, B, L2>(
    self: Result<A, L1>,
    name: Exclude<N, keyof A>,
    f: (a: NoInfer<A>) => Result<B, L2>
  ): Result<{ [K in N | keyof A]: K extends keyof A ? A[K] : B }, L1 | L2>
} = doNotation.bind<ResultTypeLambda>(map, flatMap)

/**
 * Wraps the success value of a `Result` into a named field, producing a
 * `Result<Record<N, A>>`.
 *
 * **When to use**
 *
 * Use to name the success value of an existing `Result` before continuing a
 * do-notation pipeline.
 *
 * **Details**
 *
 * This is typically used to start a do-notation chain from an existing
 * `Result`.
 *
 * **Example** (Wrapping a value into a named field)
 *
 * ```ts import.meta.vitest
 * import { pipe, Result } from "effect"
 *
 * pipe(
 *   Result.succeed(42),
 *   Result.bindTo("answer")
 * ) // => Result.succeed({ answer: 42 })
 * ```
 *
 * @see {@link Do} to start from an empty object
 * @see {@link bind} to add more fields
 *
 * @category mapping
 * @since 2.0.0
 */
export const bindTo: {
  <N extends string>(name: N): <R, L>(self: Result<R, L>) => Result<Record<N, R>, L>
  <R, L, N extends string>(self: Result<R, L>, name: N): Result<Record<N, R>, L>
} = doNotation.bindTo<ResultTypeLambda>(map)

const let_: {
  <N extends string, R extends object, B>(
    name: Exclude<N, keyof R>,
    f: (r: NoInfer<R>) => B
  ): <L>(self: Result<R, L>) => Result<{ [K in N | keyof R]: K extends keyof R ? R[K] : B }, L>
  <R extends object, L, N extends string, B>(
    self: Result<R, L>,
    name: Exclude<N, keyof R>,
    f: (r: NoInfer<R>) => B
  ): Result<{ [K in N | keyof R]: K extends keyof R ? R[K] : B }, L>
} = doNotation.let_<ResultTypeLambda>(map)

export {
  /**
   * Adds a named field to the do-notation accumulator by computing a pure
   * (non-Result) value from the current accumulated object.
   *
   * **When to use**
   *
   * Use when you need to add a derived field that cannot fail inside a
   * do-notation pipeline.
   *
   * **Details**
   *
   * - Use {@link bind} when the computation returns a `Result`
   * - The field name must not collide with existing keys
   *
   * **Example** (Adding a computed field)
   *
   * ```ts import.meta.vitest
   * import { pipe, Result } from "effect"
   *
   * pipe(
   *   Result.Do,
   *   Result.bind("x", () => Result.succeed(2)),
   *   Result.bind("y", () => Result.succeed(3)),
   *   Result.let("sum", ({ x, y }) => x + y)
   * ) // => Result.succeed({ x: 2, y: 3, sum: 5 })
   * ```
   *
   * @see {@link Do} to start the do-notation chain
   * @see {@link bind} for Result-producing fields
   *
   * @category mapping
   * @since 2.0.0
   */
  let_ as let
}

/**
 * Transforms `Option<Result<A, E>>` into `Result<Option<A>, E>`.
 *
 * **When to use**
 *
 * Use when optional absence should be treated as a successful `None`, while an
 * inner `Result` failure should still fail the whole result.
 *
 * **Details**
 *
 * - `None` becomes `Success(None)`
 * - `Some(Success(a))` becomes `Success(Some(a))`
 * - `Some(Failure(e))` becomes `Failure(e)`
 *
 * **Example** (Transposing an Option of a Result)
 *
 * ```ts import.meta.vitest
 * import { Option, Result } from "effect"
 *
 * Result.transposeOption(Option.some(Result.succeed(42))) // => Result.succeed(Option.some(42))
 *
 * Result.transposeOption(Option.none<Result.Result<number, string>>()) // => Result.succeed(Option.none())
 * ```
 *
 * @see {@link transposeMapOption} to map and transpose in one step
 *
 * @category transposing
 * @since 3.14.0
 */
export const transposeOption = <A = never, E = never>(
  self: Option<Result<A, E>>
): Result<Option<A>, E> => {
  return option_.isNone(self) ? succeedNone : map(self.value, option_.some)
}

/**
 * Maps an `Option` value with a `Result`-producing function, then transposes
 * the structure from `Option<Result<B, E>>` to `Result<Option<B>, E>`.
 *
 * **When to use**
 *
 * Use when an optional value should be validated only when present, preserving
 * absence as a successful `None`.
 *
 * **Details**
 *
 * - `None` becomes `Success(None)` (the function is never called)
 * - `Some(a)` where `f(a)` is `Success(b)` becomes `Success(Some(b))`
 * - `Some(a)` where `f(a)` is `Failure(e)` becomes `Failure(e)`
 *
 * **Example** (Mapping and transposing in one step)
 *
 * ```ts import.meta.vitest
 * import { Option, Result } from "effect"
 *
 * const parse = (s: string) =>
 *   isNaN(Number(s))
 *     ? Result.fail("not a number" as const)
 *     : Result.succeed(Number(s))
 *
 * Result.transposeMapOption(Option.some("42"), parse) // => Result.succeed(Option.some(42))
 *
 * Result.transposeMapOption(Option.none(), parse) // => Result.succeed(Option.none())
 * ```
 *
 * @see {@link transposeOption} when the Option already contains a Result
 *
 * @category transposing
 * @since 3.15.0
 */
export const transposeMapOption = dual<
  <A, B, E = never>(
    f: (self: A) => Result<B, E>
  ) => (self: Option<A>) => Result<Option<B>, E>,
  <A, B, E = never>(
    self: Option<A>,
    f: (self: A) => Result<B, E>
  ) => Result<Option<B>, E>
>(2, (self, f) => option_.isNone(self) ? succeedNone : map(f(self.value), option_.some))

/**
 * Provides a pre-built `Result<Option<never>>` that succeeds with `None`.
 *
 * **When to use**
 *
 * Use when an optional success should be absent, such as the `None` branch of
 * `transposeOption` or `transposeMapOption`.
 *
 * **Details**
 *
 * This is equivalent to `Result.succeed(Option.none())`, but reuses a shared
 * `Success` wrapper instead of allocating one each time.
 *
 * **Example** (Succeeding with None)
 *
 * ```ts import.meta.vitest
 * import { Option, Result } from "effect"
 *
 * Result.succeedNone // => Result.succeed(Option.none())
 * ```
 *
 * @see {@link succeedSome} for the `Some` counterpart
 * @see {@link transposeOption} to transpose an Option that already contains a Result
 * @see {@link transposeMapOption} to map and transpose an Option in one step
 *
 * @category constructors
 * @since 4.0.0
 */
export const succeedNone = succeed(option_.none)

/**
 * Creates a `Result<Option<A>>` that succeeds with `Some(a)`.
 *
 * **Details**
 *
 * - Equivalent to `Result.succeed(Option.some(a))`
 * - Useful with {@link transposeOption} patterns
 *
 * **Example** (Wrapping a value in Some inside a Result)
 *
 * ```ts import.meta.vitest
 * import { Option, Result } from "effect"
 *
 * Result.succeedSome(42) // => Result.succeed(Option.some(42))
 * ```
 *
 * @see {@link succeedNone} for the `None` counterpart
 *
 * @category constructors
 * @since 4.0.0
 */
export const succeedSome = <A, E = never>(a: A): Result<Option<A>, E> => succeed(option_.some(a))

/**
 * Runs a side-effect on the success value without altering the `Result`.
 *
 * **Details**
 *
 * - If the result is a `Success`, calls `f` with the value (return value is ignored)
 * - If the result is a `Failure`, `f` is not called
 * - Returns the original `Result` unchanged (same reference)
 * - Useful for logging, debugging, or performing mutations outside the Result chain
 *
 * **Example** (Logging a success value)
 *
 * ```ts import.meta.vitest
 * import { pipe, Result } from "effect"
 *
 * const values: Array<number> = []
 * const result = pipe(
 *   Result.succeed(42),
 *   Result.tap((n) => values.push(n))
 * )
 *
 * values // => [42]
 * result // => Result.succeed(42)
 * ```
 *
 * @see {@link map} to transform the success value
 *
 * @category mapping
 * @since 4.0.0
 */
export const tap: {
  <A>(f: (a: A) => void): <E>(self: Result<A, E>) => Result<A, E>
  <A, E>(self: Result<A, E>, f: (a: A) => void): Result<A, E>
} = dual(
  2,
  <A, E>(self: Result<A, E>, f: (a: A) => void): Result<A, E> => {
    if (isSuccess(self)) {
      f(self.success)
    }
    return self
  }
)
