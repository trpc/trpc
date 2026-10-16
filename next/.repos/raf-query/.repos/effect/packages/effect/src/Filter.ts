/**
 * Defines composable checks that can also transform values.
 *
 * A `Filter<Input, Pass, Fail>` receives an input and returns a `Result`.
 * Success means the value passed the filter, and failure means the value was
 * filtered out. Filters may also narrow or transform the passing value. This
 * module includes constructors from predicates, options, and effects, built-in
 * filters for common JavaScript values and tags, helpers for combining filters,
 * and conversions to predicates, options, and results.
 *
 * @since 4.0.0
 */
import type { Effect } from "./Effect.ts"
import * as Equal from "./Equal.ts"
import { dual } from "./Function.ts"
import * as Option from "./Option.ts"
import * as Predicate from "./Predicate.ts"
import * as Result from "./Result.ts"
import type { EqualsWith, ExcludeTag, ExtractReason, ExtractTag, ReasonTags, Tags } from "./Types.ts"

/**
 * Represents a filter function that can transform inputs to outputs or filter them out.
 *
 * **Details**
 *
 * A filter takes an input value and either returns a boxed pass value or the
 * special `fail` type to indicate the value should be filtered out.
 *
 * **Example** (Defining a positive number filter)
 *
 * ```ts import.meta.vitest
 * import { Filter, Result } from "effect"
 *
 * // A filter that only passes positive numbers
 * const positiveFilter: Filter.Filter<number> = (n) => n > 0 ? Result.succeed(n) : Result.fail(n)
 *
 * positiveFilter(5) // => Result.succeed(5)
 * positiveFilter(-3) // => Result.fail(-3)
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export interface Filter<in Input, out Pass = Input, out Fail = Input> {
  (input: Input): Result.Result<Pass, Fail>
}

/**
 * Represents an effectful filter function that can produce Effects.
 *
 * **Details**
 *
 * Similar to a regular `Filter`, but the filtering operation itself can be
 * effectful, allowing for asynchronous operations, error handling, and
 * dependency injection.
 *
 * **Example** (Defining an effectful user filter)
 *
 * ```ts import.meta.vitest
 * import { Effect, Filter, Result } from "effect"
 *
 * // An effectful filter that validates user data
 * type User = { id: string; isActive: boolean }
 * type ValidationError = { message: string }
 *
 * const validateUser: Filter.FilterEffect<
 *   string,
 *   User,
 *   User,
 *   ValidationError,
 *   never
 * > = (id) =>
 *   Effect.gen(function*() {
 *     const user: User = { id, isActive: id.length > 0 }
 *     return user.isActive ? Result.succeed(user) : Result.fail(user)
 *   })
 *
 * await Effect.runPromise(validateUser("alice")) // => Result.succeed({ id: "alice", isActive: true })
 * await Effect.runPromise(validateUser("")) // => Result.fail({ id: "", isActive: false })
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export interface FilterEffect<
  in Input,
  out Pass,
  out Fail,
  out E = never,
  out R = never
> {
  (input: Input): Effect<Result.Result<Pass, Fail>, E, R>
}

// -------------------------------------------------------------------------------------
// Constructors
// -------------------------------------------------------------------------------------

/**
 * Creates a Filter from a function that returns either a `pass` or `fail` value.
 *
 * **Details**
 *
 * This is the primary constructor for creating custom filters. The function
 * should return either `Result.succeed(value)` or `Result.fail(value)`.
 *
 * **Example** (Creating custom filters)
 *
 * ```ts import.meta.vitest
 * import { Filter, Result } from "effect"
 *
 * // Create a filter for positive numbers
 * const positiveFilter = Filter.make((n: number) => n > 0 ? Result.succeed(n) : Result.fail(n))
 *
 * // Create a filter that transforms strings to uppercase
 * const uppercaseFilter = Filter.make((s: string) =>
 *   s.length > 0 ? Result.succeed(s.toUpperCase()) : Result.fail(s)
 * )
 * positiveFilter(1) // => Result.succeed(1)
 * uppercaseFilter("ok") // => Result.succeed("OK")
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = <Input, Pass, Fail>(
  f: (input: Input) => Result.Result<Pass, Fail>
): Filter<Input, Pass, Fail> => f as any

/**
 * Creates an effectful Filter from a function that returns an Effect.
 *
 * **Details**
 *
 * This constructor is used when the filtering operation needs to perform
 * effectful computations, such as async operations, error handling, or accessing
 * services from the environment.
 *
 * **Example** (Creating effectful filters)
 *
 * ```ts import.meta.vitest
 * import { Effect, Filter, Result } from "effect"
 *
 * // Create an effectful filter that validates async
 * const asyncValidate = Filter.makeEffect((id: string) =>
 *   Effect.gen(function*() {
 *     const isValid = yield* Effect.succeed(id.length > 0)
 *     return isValid ? Result.succeed(id) : Result.fail(id)
 *   })
 * )
 *
 * await Effect.runPromise(asyncValidate("id")) // => Result.succeed("id")
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeEffect = <Input, Pass, Fail, E, R>(
  f: (input: Input) => Effect<Result.Result<Pass, Fail>, E, R>
): FilterEffect<Input, Pass, Fail, E, R> => f as any

/**
 * Transforms the failure value produced by a `Filter`, leaving successful
 * results unchanged.
 *
 * @category mapping
 * @since 4.0.0
 */
export const mapFail: {
  <Fail, Fail2>(f: (fail: Fail) => Fail2): <Input, Pass>(self: Filter<Input, Pass, Fail>) => Filter<Input, Pass, Fail2>
  <Input, Pass, Fail, Fail2>(
    self: Filter<Input, Pass, Fail>,
    f: (fail: Fail) => Fail2
  ): Filter<Input, Pass, Fail2>
} = dual(2, <Input, Pass, Fail, Fail2>(
  self: Filter<Input, Pass, Fail>,
  f: (value: Fail) => Fail2
): Filter<Input, Pass, Fail2> =>
(input: Input): Result.Result<Pass, Fail2> => Result.mapError(self(input), f))

const try_ = <Input, Output>(f: (input: Input) => Output): Filter<Input, Output> => (input) => {
  try {
    return Result.succeed(f(input))
  } catch {
    return Result.fail(input)
  }
}

export {
  /**
   * Creates a Filter that tries to apply a function and returns `fail` on
   * error.
   *
   * @category constructors
   * @since 4.0.0
   */
  try_ as try
}

/**
 * Creates a Filter from a predicate or refinement function.
 *
 * **Details**
 *
 * This is a convenient way to create filters from boolean-returning functions.
 * When the predicate returns true, the input value is passed through unchanged.
 * When it returns false, the `fail` type is returned.
 *
 * **Example** (Creating filters from predicates)
 *
 * ```ts import.meta.vitest
 * import { Filter, Result } from "effect"
 *
 * // Create filter from predicate
 * const positiveNumbers = Filter.fromPredicate((n: number) => n > 0)
 * const nonEmptyStrings = Filter.fromPredicate((s: string) => s.length > 0)
 *
 * // Type refinement
 * const isString = Filter.fromPredicate((x: unknown): x is string =>
 *   typeof x === "string"
 * )
 * positiveNumbers(1) // => Result.succeed(1)
 * nonEmptyStrings("") // => Result.fail("")
 * isString("ok") // => Result.succeed("ok")
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromPredicate: {
  <A, B extends A>(refinement: Predicate.Refinement<A, B>): Filter<A, B, EqualsWith<A, B, A, Exclude<A, B>>>
  <A>(predicate: Predicate.Predicate<A>): Filter<A>
} = <A, B extends A = A>(predicate: Predicate.Predicate<A> | Predicate.Refinement<A, B>): Filter<A, B> => (input: A) =>
  predicate(input) ? Result.succeed(input as B) : Result.fail(input)

/**
 * Creates a `Filter` from a function that returns an `Option`; `Some(value)`
 * passes with `value`, and `None` fails with the original input.
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromPredicateOption = <A, B>(predicate: (a: A) => Option.Option<B>): Filter<A, B> => (input) => {
  const o = predicate(input)
  return o._tag === "None" ? Result.fail(input) : Result.succeed(o.value)
}

/**
 * Converts a Filter into a predicate function.
 *
 * **When to use**
 *
 * Use to reuse a `Filter` with APIs that accept only boolean predicates when
 * the pass and fail payloads are not needed.
 *
 * @see {@link toOption} for keeping passed values and discarding failure values
 * @see {@link toResult} for preserving both pass and failure values
 *
 * @category converting
 * @since 4.0.0
 */
export const toPredicate = <A, Pass, Fail>(
  self: Filter<A, Pass, Fail>
): Predicate.Predicate<A> =>
(input: A) => !Result.isFailure(self(input))

/**
 * A predefined filter that only passes through string values.
 *
 * **Example** (Filtering strings)
 *
 * ```ts import.meta.vitest
 * import { Filter, Result } from "effect"
 *
 * Filter.string("hello") // => Result.succeed("hello")
 * Filter.string(42) // => Result.fail(42)
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const string: Filter<unknown, string> = fromPredicate(Predicate.isString)

/**
 * Creates a `Filter` that passes only values strictly equal to the specified
 * value using JavaScript `===` comparison.
 *
 * **When to use**
 *
 * Use when you need a `Filter` that accepts only the exact primitive value or
 * object reference using JavaScript strict equality in a `Filter` / `Result`
 * pipeline.
 *
 * **Gotchas**
 *
 * `NaN` never passes, even when the expected value is `NaN`, and objects pass
 * only when they are the same reference.
 *
 * @see {@link equals} for structural equality when distinct values with equal
 * contents should pass
 *
 * @category constructors
 * @since 4.0.0
 */
export const equalsStrict =
  <const A, Input = unknown>(value: A): Filter<Input, A, EqualsWith<Input, A, A, Exclude<Input, A>>> => (u) =>
    (u as unknown) === value ? Result.succeed(value) : Result.fail(u as any)

/**
 * Creates a `Filter` that passes inputs whose `has(key)` method returns
 * `true` for the specified key.
 *
 * **When to use**
 *
 * Use to keep inputs that expose a `has` method, such as `Set` or `Map`, when
 * they contain a required key.
 *
 * @see {@link fromPredicate} for custom predicate filters or inputs without a
 * `has` method
 * @see {@link Predicate.hasProperty} for guarding property presence instead of
 * calling an input's `has` method
 *
 * @category constructors
 * @since 4.0.0
 */
export const has =
  <K>(key: K) => <Input extends { readonly has: (key: K) => boolean }>(input: Input): Result.Result<Input, Input> =>
    input.has(key) ? Result.succeed(input) : Result.fail(input)

/**
 * Creates a filter that only passes instances of the given constructor.
 *
 * **When to use**
 *
 * Use to narrow unknown input to values created by a specific JavaScript
 * constructor while keeping the result in the `Filter` / `Result` pipeline.
 *
 * **Details**
 *
 * The filter succeeds when the input satisfies `instanceof constructor`.
 * Otherwise it fails with the original input.
 *
 * **Gotchas**
 *
 * This uses JavaScript `instanceof` semantics, including prototype-chain and
 * realm behavior.
 *
 * @see {@link fromPredicate} for custom predicate-based narrowing
 *
 * @category constructors
 * @since 4.0.0
 */
export const instanceOf =
  <K extends new(...args: any) => any>(constructor: K) =>
  <Input>(u: Input): Result.Result<InstanceType<K>, Exclude<Input, InstanceType<K>>> =>
    u instanceof constructor ? Result.succeed(u as InstanceType<K>) : Result.fail(u) as any

/**
 * A predefined filter that only passes through number values.
 *
 * **Example** (Filtering numbers)
 *
 * ```ts import.meta.vitest
 * import { Filter, Result } from "effect"
 *
 * Filter.number(42) // => Result.succeed(42)
 * Filter.number("42") // => Result.fail("42")
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const number: Filter<unknown, number> = fromPredicate(Predicate.isNumber)

/**
 * A predefined filter that only passes through boolean values.
 *
 * **When to use**
 *
 * Use when accepting an unknown input only if it is already a boolean and you
 * want a `Filter` result rather than a plain predicate result.
 *
 * **Details**
 *
 * Implemented with `fromPredicate(Predicate.isBoolean)`, so `true` and `false`
 * succeed and non-booleans fail with the original input.
 *
 * @see {@link Predicate.isBoolean} for the underlying guard
 * @see {@link fromPredicate} for custom predicate-based filters
 *
 * @category constructors
 * @since 4.0.0
 */
export const boolean: Filter<unknown, boolean> = fromPredicate(Predicate.isBoolean)

/**
 * A predefined filter that only passes through `bigint` primitive values.
 *
 * **When to use**
 *
 * Use to keep primitive big integer values from unknown input while staying in
 * the composable `Filter` / `Result` pipeline.
 *
 * **Details**
 *
 * Implemented with `fromPredicate(Predicate.isBigInt)`, so values where
 * `typeof input === "bigint"` succeed and all other inputs fail with the
 * original input.
 *
 * **Gotchas**
 *
 * This filter does not coerce numbers or strings; `1n` passes while `1` fails.
 *
 * @see {@link number} for JavaScript `number` values
 * @see {@link Predicate.isBigInt} for the underlying guard
 *
 * @category constructors
 * @since 4.0.0
 */
export const bigint: Filter<unknown, bigint> = fromPredicate(Predicate.isBigInt)

/**
 * A predefined filter that only passes through Symbol values.
 *
 * @category constructors
 * @since 4.0.0
 */
export const symbol: Filter<unknown, symbol> = fromPredicate(Predicate.isSymbol)

/**
 * A predefined filter that only passes through Date objects.
 *
 * **When to use**
 *
 * Use when you need to narrow unknown input to JavaScript `Date` instances with
 * a reusable `Filter`.
 *
 * **Details**
 *
 * Implemented with `fromPredicate(Predicate.isDate)`, so passing values return
 * `Result.succeed(input)` and failing values return `Result.fail(input)`.
 *
 * **Gotchas**
 *
 * The check uses `instanceof Date`, so invalid `Date` objects still pass; the
 * filter does not validate the timestamp.
 *
 * @see {@link Predicate.isDate} for the underlying guard
 * @see {@link instanceOf} for constructor-based filtering
 * @see {@link fromPredicate} for custom date checks
 *
 * @category constructors
 * @since 4.0.0
 */
export const date: Filter<unknown, Date> = fromPredicate(Predicate.isDate)

/**
 * Creates a filter that checks if an input is tagged with a specific tag.
 *
 * **When to use**
 *
 * Use to keep only the matching member of a `_tag`-discriminated union while
 * staying in a composable `Filter` / `Result` pipeline.
 *
 * **Details**
 *
 * The filter succeeds when `Predicate.isTagged(input, tag)` returns `true`.
 * Otherwise it fails with the original input.
 *
 * **Gotchas**
 *
 * This only checks `_tag`; it does not validate the rest of the variant fields.
 *
 * @see {@link Predicate.isTagged} for the underlying boolean guard when a
 * `Filter` result is not needed
 * @see {@link reason} for extracting a nested reason variant from tagged errors
 *
 * @category constructors
 * @since 4.0.0
 */
export const tagged: {
  <Input>(): <const Tag extends Tags<Input>>(tag: Tag) => Filter<Input, ExtractTag<Input, Tag>, ExcludeTag<Input, Tag>>
  <Input, const Tag extends Tags<Input>>(
    tag: Tag
  ): Filter<Input, ExtractTag<Input, Tag>, ExcludeTag<Input, Tag>>
  <const Tag extends string>(
    tag: Tag
  ): <Input>(input: Input) => Result.Result<ExtractTag<Input, Tag>, ExcludeTag<Input, Tag>>
} = function() {
  return arguments.length === 0 ? taggedImpl : taggedImpl(arguments[0] as any)
} as any

const taggedImpl =
  <const Tag extends string>(tag: Tag) =>
  <Input>(input: Input): Result.Result<ExtractTag<Input, Tag>, ExcludeTag<Input, Tag>> =>
    Predicate.isTagged(input, tag) ? Result.succeed(input as any) : Result.fail(input as ExcludeTag<Input, Tag>)

/**
 * Creates a filter that extracts a reason from a tagged error.
 *
 * @category constructors
 * @since 4.0.0
 */
export const reason: {
  <Input>(): <const Tag extends Tags<Input>, const ReasonTag extends ReasonTags<ExtractTag<Input, Tag>>>(
    tag: Tag,
    reasonTag: ReasonTag
  ) => Filter<Input, ExtractReason<ExtractTag<Input, Tag>, ReasonTag>, Input>
  <Input, const Tag extends Tags<Input>, const ReasonTag extends ReasonTags<ExtractTag<Input, Tag>>>(
    tag: Tag,
    reasonTag: ReasonTag
  ): Filter<Input, ExtractReason<ExtractTag<Input, Tag>, ReasonTag>, Input>
  <const Tag extends string, const ReasonTag extends string>(
    tag: Tag,
    reasonTag: ReasonTag
  ): <Input>(input: Input) => Result.Result<ExtractReason<ExtractTag<Input, Tag>, ReasonTag>, Input>
} = function() {
  return arguments.length === 0 ? reasonImpl : reasonImpl(arguments[0] as any, arguments[1] as any)
} as any

const reasonImpl =
  <const Tag extends string, const ReasonTag extends string>(tag: Tag, reasonTag: ReasonTag) =>
  <Input>(input: Input): Result.Result<ExtractTag<Input, Tag>, ExcludeTag<Input, Tag>> => {
    if (
      Predicate.isTagged(input, tag) && Predicate.hasProperty(input, "reason") &&
      Predicate.isTagged(input.reason, reasonTag)
    ) {
      return Result.succeed(input.reason as any)
    }
    return Result.fail(input as any)
  }

/**
 * Creates a filter that only passes values equal to the specified value using structural equality.
 *
 * **When to use**
 *
 * Use to accept inputs that are structurally equal to a known expected value
 * while staying in a composable `Filter` / `Result` pipeline.
 *
 * **Details**
 *
 * Delegates to `Equal.equals`. On success it returns `Result.succeed(value)`;
 * on failure it returns `Result.fail(input)`.
 *
 * @see {@link equalsStrict} for JavaScript `===` matching instead of structural
 * equality
 * @see {@link Equal.equals} for the underlying structural equality semantics
 *
 * @category constructors
 * @since 4.0.0
 */
export const equals =
  <const A, Input = unknown>(value: A): Filter<Input, A, EqualsWith<Input, A, A, Exclude<Input, A>>> => (u) =>
    Equal.equals(u, value) ? Result.succeed(value) : Result.fail(u as any)

/**
 * Combines two filters with logical OR semantics.
 *
 * @category combinators
 * @since 4.0.0
 */
export const or: {
  <Input2, Pass2, Fail2>(
    that: Filter<Input2, Pass2, Fail2>
  ): <Input1, Pass2, Fail2>(self: Filter<Input1, Pass2>) => Filter<Input1 & Input2, Pass2 | Pass2, Fail2>
  <Input1, Pass1, Fail1, Input2, Pass2, Fail2>(
    self: Filter<Input1, Pass1, Fail1>,
    that: Filter<Input2, Pass2, Fail2>
  ): Filter<Input1 & Input2, Pass1 | Pass2, Fail2>
} = dual(2, <Input1, Pass1, Fail1, Input2, Pass2, Fail2>(
  self: Filter<Input1, Pass1, Fail1>,
  that: Filter<Input2, Pass2, Fail2>
): Filter<Input1 & Input2, Pass1 | Pass2, Fail2> =>
(input) => {
  const selfResult = self(input)
  return Result.isSuccess(selfResult) ? selfResult as Result.Result<Pass1> : that(input)
})

/**
 * Combines two filters and applies a function to their results.
 *
 * **When to use**
 *
 * Use to combine two filters with a custom function to merge their outputs.
 *
 * **Details**
 *
 * Both filters must succeed (not return `fail`) for the combination to succeed.
 * If both filters pass, their outputs are combined using the provided function.
 *
 * @see {@link zip} for combining two filters into a tuple
 *
 * @category combinators
 * @since 4.0.0
 */
export const zipWith: {
  <PassL, InputR, PassR, FailR, A>(
    right: Filter<InputR, PassR, FailR>,
    f: (left: PassL, right: PassR) => A
  ): <InputL, FailL>(left: Filter<InputL, PassL, FailL>) => Filter<InputL & InputR, A, FailL | FailR>
  <InputL, PassL, FailL, InputR, PassR, FailR, A>(
    left: Filter<InputL, PassL, FailL>,
    right: Filter<InputR, PassR, FailR>,
    f: (left: PassL, right: PassR) => A
  ): Filter<InputL & InputR, A, FailL | FailR>
} = dual(3, <InputL, PassL, FailL, InputR, PassR, FailR, A>(
  left: Filter<InputL, PassL, FailL>,
  right: Filter<InputR, PassR, FailR>,
  f: (left: PassL, right: PassR) => A
): Filter<InputL & InputR, A, FailL | FailR> =>
(input) => {
  const leftResult = left(input)
  if (Result.isFailure(leftResult)) return leftResult as Result.Result<never, FailL | FailR>
  const rightResult = right(input)
  if (Result.isFailure(rightResult)) return rightResult as Result.Result<never, FailL | FailR>
  return Result.succeed(f(leftResult.success, rightResult.success))
})

/**
 * Combines two filters into a tuple of their results.
 *
 * **Details**
 *
 * Both filters must succeed for the combination to succeed. If both pass, their
 * outputs are combined into a tuple.
 *
 * **Example** (Zipping filters)
 *
 * ```ts import.meta.vitest
 * import { Filter, Result } from "effect"
 *
 * const positiveNumbers = Filter.fromPredicate((n: number) => n > 0)
 * const evenNumbers = Filter.fromPredicate((n: number) => n % 2 === 0)
 *
 * const positiveAndEven = Filter.zip(positiveNumbers, evenNumbers)
 * positiveAndEven(2) // => Result.succeed([2, 2])
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const zip: {
  <InputR, PassR, FailR>(
    right: Filter<InputR, PassR, FailR>
  ): <InputL, PassL, FailL>(
    left: Filter<InputL, PassL, FailL>
  ) => Filter<InputL & InputR, [PassL, PassR], FailL | FailR>
  <InputL, PassL, FailL, InputR, PassR, FailR>(
    left: Filter<InputL, PassL, FailL>,
    right: Filter<InputR, PassR, FailR>
  ): Filter<InputL & InputR, [PassL, PassR], FailL | FailR>
} = dual(2, <InputL, PassL, FailL, InputR, PassR, FailR>(
  left: Filter<InputL, PassL, FailL>,
  right: Filter<InputR, PassR, FailR>
): Filter<InputL & InputR, [PassL, PassR], FailL | FailR> =>
  zipWith(left, right, (leftResult, rightResult) => [leftResult, rightResult]))

/**
 * Combines two filters but only returns the result of the left filter.
 *
 * **Example** (Keeping the left filter result)
 *
 * ```ts import.meta.vitest
 * import { Filter, Result } from "effect"
 *
 * const positiveNumbers = Filter.fromPredicate((n: number) => n > 0)
 * const evenNumbers = Filter.fromPredicate((n: number) => n % 2 === 0)
 *
 * const positiveEven = Filter.andLeft(positiveNumbers, evenNumbers)
 * positiveEven(2) // => Result.succeed(2)
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const andLeft: {
  <InputR, PassR, FailR>(
    right: Filter<InputR, PassR, FailR>
  ): <InputL, PassL, FailL>(
    left: Filter<InputL, PassL, FailL>
  ) => Filter<InputL & InputR, PassL, FailL | FailR>
  <InputL, PassL, FailL, InputR, PassR, FailR>(
    left: Filter<InputL, PassL, FailL>,
    right: Filter<InputR, PassR, FailR>
  ): Filter<InputL & InputR, PassL, FailL | FailR>
} = dual(2, <InputL, PassL, FailL, InputR, PassR, FailR>(
  left: Filter<InputL, PassL, FailL>,
  right: Filter<InputR, PassR, FailR>
): Filter<InputL & InputR, PassL, FailL | FailR> => zipWith(left, right, (leftResult) => leftResult))

/**
 * Combines two filters but only returns the result of the right filter.
 *
 * **Example** (Keeping the right filter result)
 *
 * ```ts import.meta.vitest
 * import { Filter, Result } from "effect"
 *
 * const positiveNumbers = Filter.fromPredicate((n: number) => n > 0)
 * const doubleNumbers = Filter.make((n: number) =>
 *   n > 0 ? Result.succeed(n * 2) : Result.fail(n)
 * )
 *
 * const positiveDoubled = Filter.andRight(positiveNumbers, doubleNumbers)
 * positiveDoubled(2) // => Result.succeed(4)
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const andRight: {
  <InputR, PassR, FailR>(
    right: Filter<InputR, PassR, FailR>
  ): <InputL, PassL, FailL>(
    left: Filter<InputL, PassL, FailL>
  ) => Filter<InputL & InputR, PassR, FailL | FailR>
  <InputL, PassL, FailL, InputR, PassR, FailR>(
    left: Filter<InputL, PassL, FailL>,
    right: Filter<InputR, PassR, FailR>
  ): Filter<InputL & InputR, PassR, FailL | FailR>
} = dual(2, <InputL, PassL, FailL, InputR, PassR, FailR>(
  left: Filter<InputL, PassL, FailL>,
  right: Filter<InputR, PassR, FailR>
): Filter<InputL & InputR, PassR, FailL | FailR> => zipWith(left, right, (_, rightResult) => rightResult))

/**
 * Composes two filters sequentially, feeding the output of the first into the second.
 *
 * **Example** (Composing filters)
 *
 * ```ts import.meta.vitest
 * import { Filter, Result } from "effect"
 *
 * const stringFilter = Filter.string
 * const nonEmptyUpper = Filter.make((s: string) =>
 *   s.length > 0 ? Result.succeed(s.toUpperCase()) : Result.fail(s)
 * )
 *
 * const stringToUpper = Filter.compose(stringFilter, nonEmptyUpper)
 * stringToUpper("hello") // => Result.succeed("HELLO")
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const compose: {
  <PassL, PassR, FailR>(
    right: Filter<PassL, PassR, FailR>
  ): <InputL, FailL>(left: Filter<InputL, PassL, FailL>) => Filter<InputL, PassR, FailL | FailR>
  <InputL, PassL, FailL, PassR, FailR>(
    left: Filter<InputL, PassL, FailL>,
    right: Filter<PassL, PassR, FailR>
  ): Filter<InputL, PassR, FailL | FailR>
} = dual(2, <InputL, PassL, FailL, PassR, FailR>(
  left: Filter<InputL, PassL, FailL>,
  right: Filter<PassL, PassR, FailR>
): Filter<InputL, PassR, FailL | FailR> =>
(input) => {
  const leftOut = left(input)
  if (Result.isFailure(leftOut)) return leftOut as Result.Result<never, FailL | FailR>
  return right(leftOut.success)
})

/**
 * Composes two filters sequentially, passing the successful output of the first
 * filter to the second.
 *
 * **Details**
 *
 * If either filter fails, the returned filter fails with the original input
 * instead of the intermediate failure value.
 *
 * @category combinators
 * @since 4.0.0
 */
export const composePassthrough: {
  <InputL, PassL, PassR, FailR>(
    right: Filter<PassL, PassR, FailR>
  ): <FailL>(left: Filter<InputL, PassL, FailL>) => Filter<InputL, PassR, InputL>
  <InputL, PassL, FailL, PassR, FailR>(
    left: Filter<InputL, PassL, FailL>,
    right: Filter<PassL, PassR, FailR>
  ): Filter<InputL, PassR, InputL>
} = dual(2, <InputL, PassL, FailL, PassR, FailR>(
  left: Filter<InputL, PassL, FailL>,
  right: Filter<PassL, PassR, FailR>
): Filter<InputL, PassR, InputL> =>
(input) => {
  const leftOut = left(input)
  if (Result.isFailure(leftOut)) return Result.fail(input)
  const rightOut = right(leftOut.success)
  if (Result.isFailure(rightOut)) return Result.fail(input)
  return rightOut as Result.Result<PassR>
})

/**
 * Converts a `Filter` into a function that returns `Some` for passed values
 * and `None` for filtered-out values.
 *
 * **When to use**
 *
 * Use when adapting a `Filter` to `Option`-based code where passed values
 * become `Some` and filtered-out inputs become `None`.
 *
 * @see {@link toResult} for keeping the filter failure value
 * @see {@link toPredicate} for plain boolean pass/fail checks
 *
 * @category converting
 * @since 4.0.0
 */
export const toOption = <A, Pass, Fail>(
  self: Filter<A, Pass, Fail>
): (input: A) => Option.Option<Pass> =>
(input: A) => {
  const result = self(input)
  return Result.isFailure(result) ? Option.none() : Option.some(result.success)
}

/**
 * Converts a `Filter` into a function that returns the underlying
 * `Result.Result` for each input.
 *
 * **When to use**
 *
 * Use to adapt a `Filter` to APIs that expect a plain function returning
 * `Result`, while preserving both the pass value and the failure value.
 *
 * @see {@link toOption} for keeping only passed values
 * @see {@link toPredicate} for plain boolean pass/fail checks
 *
 * @category converting
 * @since 4.0.0
 */
export const toResult = <A, Pass, Fail>(
  self: Filter<A, Pass, Fail>
): (input: A) => Result.Result<Pass, Fail> =>
(input: A) => {
  const result = self(input)
  return Result.isFailure(result) ? Result.fail(result.failure) : Result.succeed(result.success)
}
