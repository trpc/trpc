/**
 * Builds pattern matchers for TypeScript values.
 *
 * `Match` lets you add ordered cases and then finish them with a result,
 * fallback, `Option`, or exhaustive check. Use `Match.type` to define a
 * reusable matcher for a type, or `Match.value` to match one value immediately.
 * Cases can match literal values, predicates, object shapes, tags, negated
 * patterns, and common checks such as strings, numbers, records, and class
 * instances.
 *
 * @since 4.0.0
 */
import * as internal from "./internal/matcher.ts"
import type * as Option from "./Option.ts"
import type { Pipeable } from "./Pipeable.ts"
import * as Predicate from "./Predicate.ts"
import type * as Result from "./Result.ts"
import type * as T from "./Types.ts"
import type { Unify } from "./Unify.ts"

const TypeId = internal.TypeId

// The conditional must stay deferred until P is inferred. Replacing it with an
// intersection loses contextual typing for nested generic calls (microsoft/TypeScript#52864).
type Contextual<P, Fallback> = [P] extends [never] ? Fallback : P

type TagHandlers<D extends string, R, Ret> = {
  readonly [Tag in Types.Tags<D, R> & string]: (_: Extract<R, Record<D, Tag>>) => Ret
}

type PartialTagHandlers<D extends string, R, Ret> = {
  readonly [Tag in Types.Tags<D, R> & string]?: ((_: Extract<R, Record<D, Tag>>) => Ret) | undefined
}

type ValueTagHandlers<I> = {
  readonly [Tag in Types.Tags<"_tag", I> & string]: (_: Extract<I, { readonly _tag: Tag }>) => any
}

/**
 * Marker used by `Matcher` to distinguish matchers created with `Match.value`.
 *
 * @category models
 * @since 4.0.0
 */
export type ValueFlavor = "value"

/**
 * Union type for matchers created by `Match.type` and `Match.value`.
 *
 * **Details**
 *
 * A `Matcher` carries the input type, accumulated filters, remaining cases,
 * result type, and a flavor distinguishing the two matcher variants: `never`
 * for matchers created with `Match.type` and `ValueFlavor` for matchers created
 * with `Match.value`. Because the flavor never depends on the input type,
 * terminal combinators resolve even when the input contains type parameters.
 *
 * **Example** (Matching string and number values)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * // Simulated dynamic input that can be a string or a number
 * const input: string | number = "some input"
 *
 * //      ┌─── string
 * //      ▼
 * const result = Match.value(input).pipe(
 *   // Match if the value is a number
 *   Match.when(Match.number, (n) => `number: ${n}`),
 *   // Match if the value is a string
 *   Match.when(Match.string, (s) => `string: ${s}`),
 *   // Ensure all possible cases are covered
 *   Match.exhaustive
 * )
 *
 * result // => "string: some input"
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export type Matcher<
  Input,
  Filters,
  RemainingApplied,
  Result,
  Flavor,
  Return = any,
  Args extends Array<any> = []
> =
  | TypeMatcher<Input, Filters, RemainingApplied, Result, Return, Args>
  | ValueMatcher<Input, Filters, RemainingApplied, Result, Input, Return, Flavor>

/**
 * Represents a pattern matcher that operates on types rather than specific values.
 *
 * **Details**
 *
 * A `TypeMatcher` is created when using `Match.type<T>()` and allows you to define
 * patterns that will be applied to values of the specified type. It maintains
 * type-level information about the input type, applied filters, remaining cases,
 * and expected results.
 *
 * **Example** (Creating a type matcher)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * // Create a TypeMatcher for string | number
 * const matcher = Match.type<string | number>().pipe(
 *   Match.when(Match.string, (s) => `String: ${s}`),
 *   Match.when(Match.number, (n) => `Number: ${n}`),
 *   Match.exhaustive
 * )
 *
 * matcher("hello") // => "String: hello"
 * matcher(42) // => "Number: 42"
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export interface TypeMatcher<
  in Input,
  out Filters,
  out Remaining,
  out Result,
  out Return = any,
  in Args extends Array<any> = []
> extends Pipeable {
  readonly _tag: "TypeMatcher"
  readonly [TypeId]: {
    readonly _input: T.Contravariant<Input>
    readonly _filters: T.Covariant<Filters>
    readonly _remaining: T.Covariant<Remaining>
    readonly _result: T.Covariant<Result>
    readonly _return: T.Covariant<Return>
    readonly _args: T.Contravariant<Args>
  }
  readonly cases: ReadonlyArray<Case>
  readonly select: (...args: Array<any>) => unknown
  add<I, R, RA, A>(_case: Case): TypeMatcher<I, R, RA, A, Return, Args>
}

/**
 * Represents a pattern matcher that operates on a specific provided value.
 *
 * **Details**
 *
 * A `ValueMatcher` is created when using `Match.value(someValue)` and contains
 * the actual value to be matched against. It tracks both the provided value
 * and the result of applying patterns to determine matches. Its optional
 * seventh type parameter is the matcher flavor and defaults to `ValueFlavor`.
 *
 * **Example** (Creating a value matcher)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * const input = { type: "user", name: "Alice", age: 30 }
 *
 * // Create a ValueMatcher for the specific input
 * const result = Match.value(input).pipe(
 *   Match.when({ type: "user" }, (user) => `User: ${user.name}`),
 *   Match.when({ type: "admin" }, (admin) => `Admin: ${admin.name}`),
 *   Match.orElse(() => "Unknown type")
 * )
 *
 * result // => "User: Alice"
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export interface ValueMatcher<
  in Input,
  Filters,
  out Remaining,
  out Result,
  Provided,
  out Return = any,
  out Flavor = ValueFlavor
> extends Pipeable {
  readonly _tag: "ValueMatcher"
  readonly [TypeId]: {
    readonly _input: T.Contravariant<Input>
    readonly _filters: T.Covariant<Filters>
    readonly _result: T.Covariant<Result>
    readonly _return: T.Covariant<Return>
    readonly _flavor: T.Covariant<Flavor>
  }
  readonly provided: Provided
  readonly value: Result.Result<Provided, Remaining>
  add<I, R, RA, A, Provided>(_case: Case): ValueMatcher<I, R, RA, A, Provided>
}

/**
 * Represents a single pattern matching case.
 *
 * **When to use**
 *
 * Use as the common public type for code that needs to inspect, store, or pass
 * either positive or negative pattern matching cases.
 *
 * **Details**
 *
 * A `Case` can be either a positive match (`When`) or a negative match (`Not`).
 * Cases are the building blocks of pattern matching logic and determine
 * how values are tested and transformed.
 *
 * @see {@link When} for positive cases
 * @see {@link Not} for negative cases
 *
 * @category models
 * @since 4.0.0
 */
export type Case = When | Not

/**
 * Represents a positive pattern matching case.
 *
 * **Details**
 *
 * A `When` case contains the logic to test if a value matches a specific pattern
 * and the function to evaluate when the pattern matches. It's the primary
 * building block for pattern matching conditions.
 *
 * **Example** (Creating positive match cases)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * // When creates cases that match specific patterns
 * const stringMatcher = Match.type<string | number>().pipe(
 *   Match.when(Match.string, (s: string) => `Got string: ${s}`),
 *   Match.when(Match.number, (n: number) => `Got number: ${n}`),
 *   Match.exhaustive
 * )
 *
 * stringMatcher("hello") // => "Got string: hello"
 * stringMatcher(42) // => "Got number: 42"
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export interface When {
  readonly _tag: "When"
  guard(u: unknown): boolean
  evaluate(input: unknown, ...args: Array<any>): any
}

/**
 * Represents a negative pattern matching case.
 *
 * **Details**
 *
 * A `Not` case contains the logic to test if a value does NOT match a specific
 * pattern and the function to evaluate when the pattern doesn't match. It's used
 * for exclusion-based pattern matching.
 *
 * **Example** (Creating negative match cases)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * // Not creates cases that exclude specific patterns
 * const matcher = Match.type<string>().pipe(
 *   // Match any string except "forbidden"
 *   Match.not("forbidden", (s) => `Allowed: ${s}`),
 *   Match.orElse(() => "This string is forbidden")
 * )
 *
 * matcher("hello") // => "Allowed: hello"
 * matcher("forbidden") // => "This string is forbidden"
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export interface Not {
  readonly _tag: "Not"
  guard(u: unknown): boolean
  evaluate(input: unknown, ...args: Array<any>): any
}

/**
 * Creates a matcher for a specific type.
 *
 * **When to use**
 *
 * Use to build a reusable matcher function for values of a known input type.
 *
 * **Details**
 *
 * This function defines a `Matcher` that operates on a given type, allowing you
 * to specify conditions for handling different cases. Once the matcher is
 * created, you can use pattern-matching functions like {@link when} to define
 * how different values should be processed.
 *
 * **Example** (Matching Numbers and Strings)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * // Create a matcher for values that are either strings or numbers
 * //
 * //      ┌─── (u: string | number) => string
 * //      ▼
 * const match = Match.type<string | number>().pipe(
 *   // Match when the value is a number
 *   Match.when(Match.number, (n) => `number: ${n}`),
 *   // Match when the value is a string
 *   Match.when(Match.string, (s) => `string: ${s}`),
 *   // Ensure all possible cases are handled
 *   Match.exhaustive
 * )
 *
 * match(0) // => "number: 0"
 *
 * match("hello") // => "string: hello"
 * ```
 *
 * @see {@link value} for creating a matcher from a specific value.
 *
 * @category constructors
 * @since 4.0.0
 */
export const type: <I>() => Matcher<I, Types.Without<never>, I, never, never> = internal.type

/**
 * Creates a reusable matcher from a function that selects the value to match.
 *
 * **Details**
 *
 * The compiled matcher keeps the selector's original argument list. Case
 * handlers receive the narrowed selected value followed by those arguments.
 *
 * **Example** (Creating a reusable matcher)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * const format = Match.fn((prefix: string, value: "a" | "b") => value).pipe(
 *   Match.when("a", (_value, prefix) => `${prefix}: A`),
 *   Match.when("b", (_value, prefix) => `${prefix}: B`),
 *   Match.exhaustive
 * )
 *
 * format("status", "a") // => "status: A"
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fn: <Args extends Array<any>, I>(
  select: (...args: Args) => I
) => Matcher<I, Types.Without<never>, I, never, never, any, Args> = internal.fn

/**
 * Creates a matcher from a specific value.
 *
 * **When to use**
 *
 * Use to match one concrete input immediately.
 *
 * **Details**
 *
 * This function allows you to define a `Matcher` directly from a given value,
 * rather than from a type. This is useful when working with known values,
 * enabling structured pattern matching on objects, primitives, or any data
 * structure.
 *
 * Once the matcher is created, you can use pattern-matching functions like
 * {@link when} to define how different cases should be handled.
 *
 * **Example** (Matching an Object by Property)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * const input = { name: "John", age: 30 }
 *
 * // Create a matcher for the specific object
 * const result = Match.value(input).pipe(
 *   // Match when the 'name' property is "John"
 *   Match.when(
 *     { name: "John" },
 *     (user) => `${user.name} is ${user.age} years old`
 *   ),
 *   // Provide a fallback if no match is found
 *   Match.orElse(() => "Oh, not John")
 * )
 *
 * result // => "John is 30 years old"
 * ```
 *
 * @see {@link type} for creating a matcher from a specific type.
 *
 * @category constructors
 * @since 4.0.0
 */
export const value: <const I>(
  i: I
) => Matcher<I, Types.Without<never>, I, never, ValueFlavor> = internal.value

/**
 * Creates a match function for a specific value with discriminated union handling.
 *
 * **Details**
 *
 * This function provides a convenient way to pattern match on discriminated unions
 * by providing an object that maps each `_tag` value to its corresponding handler.
 * It's similar to a switch statement but with better type safety and exhaustiveness checking.
 *
 * **Example** (Matching value tags)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * type Status = { readonly _tag: "Success"; readonly data: string }
 *
 * const success: Status = { _tag: "Success", data: "Hello" }
 *
 * // Simple valueTags usage
 * const message = Match.valueTags(success, {
 *   Success: (result) => `Success: ${result.data}`
 * })
 *
 * message // => "Success: Hello"
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const valueTags: {
  <
    const I,
    P extends
      & ValueTagHandlers<I>
      & { readonly [Tag in Exclude<keyof P, Types.Tags<"_tag", I>>]: never }
  >(
    fields: Contextual<P, ValueTagHandlers<I>>
  ): (input: I) => Unify<ReturnType<P[keyof P]>>
  <
    const I,
    P extends
      & ValueTagHandlers<I>
      & { readonly [Tag in Exclude<keyof P, Types.Tags<"_tag", I>>]: never }
  >(
    input: I,
    fields: Contextual<P, ValueTagHandlers<I>>
  ): Unify<ReturnType<P[keyof P]>>
} = internal.valueTags

/**
 * Creates a type-safe match function for discriminated unions based on `_tag` field.
 *
 * **Details**
 *
 * This function allows you to define exhaustive pattern matching for discriminated unions
 * by providing handlers for each possible `_tag` value. It ensures type safety and
 * can optionally enforce a specific return type across all branches.
 *
 * **Example** (Matching type tags)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * type Result =
 *   | { readonly _tag: "Success"; readonly data: string }
 *   | { readonly _tag: "Error"; readonly message: string }
 *   | { readonly _tag: "Loading" }
 *
 * // Create a matcher with specific return type
 * const formatResult = Match.typeTags<Result, string>()({
 *   Success: (result) => `Data: ${result.data}`,
 *   Error: (result) => `Error: ${result.message}`,
 *   Loading: () => "Loading..."
 * })
 *
 * formatResult({ _tag: "Success", data: "Hello World" }) // => "Data: Hello World"
 *
 * formatResult({ _tag: "Error", message: "Network failed" }) // => "Error: Network failed"
 *
 * // Create a matcher with inferred return type
 * const processResult = Match.typeTags<Result>()({
 *   Success: (result) => ({ type: "ok", value: result.data }),
 *   Error: (result) => ({ type: "error", error: result.message }),
 *   Loading: () => ({ type: "pending" })
 * })
 *
 * processResult({ _tag: "Loading" }) // => { type: "pending" }
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const typeTags: {
  <I, Ret>(): <
    P extends
      & {
        readonly [Tag in Types.Tags<"_tag", I> & string]: (
          _: Extract<I, { readonly _tag: Tag }>
        ) => Ret
      }
      & { readonly [Tag in Exclude<keyof P, Types.Tags<"_tag", I>>]: never }
  >(fields: P) => (input: I) => Ret
  <I>(): <
    P extends
      & {
        readonly [Tag in Types.Tags<"_tag", I> & string]: (
          _: Extract<I, { readonly _tag: Tag }>
        ) => any
      }
      & { readonly [Tag in Exclude<keyof P, Types.Tags<"_tag", I>>]: never }
  >(fields: P) => (input: I) => Unify<ReturnType<P[keyof P]>>
} = internal.typeTags

/**
 * Ensures that all branches of a matcher return a specific type.
 *
 * **Details**
 *
 * This function enforces a consistent return type across all pattern-matching
 * branches. By specifying a return type, TypeScript will check that every
 * matching condition produces a value of the expected type.
 *
 * **Important:** This function must be the first step in the matcher pipeline.
 * If used later, TypeScript will not enforce type consistency correctly.
 *
 * **Example** (Validating return type consistency)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * const match = Match.type<{ a: number } | { b: string }>().pipe(
 *   // Ensure all branches return a string
 *   Match.withReturnType<string>(),
 *   // ❌ Type error: 'number' is not assignable to type 'string'
 *   // @ts-expect-error
 *   Match.when({ a: Match.number }, (_) => _.a),
 *   // ✅ Correct: returns a string
 *   Match.when({ b: Match.string }, (_) => _.b),
 *   Match.exhaustive
 * )
 * ```
 *
 * @category utility types
 * @since 4.0.0
 */
export const withReturnType: <Ret>() => <I, F, R, A, Pr, _, Args extends Array<any>>(
  self: Matcher<I, F, R, A, Pr, _, Args>
) => [Ret] extends [[A] extends [never] ? any : A] ? Matcher<I, F, R, A, Pr, Ret, Args>
  : "withReturnType constraint does not extend Result type" = internal.withReturnType

/**
 * Defines a condition for matching values.
 *
 * **When to use**
 *
 * Use to add one positive pattern case to a `Match.type` or `Match.value`
 * pipeline when a direct value, predicate, or structured object pattern should
 * run a handler for matching input.
 *
 * **Details**
 *
 * Supports both direct value comparisons and predicate functions. If the
 * pattern matches, the associated function is executed and the matched input is
 * removed from the remaining cases tracked by the matcher.
 *
 * **Example** (Matching with values and predicates)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * // Create a matcher for objects with an "age" property
 * const match = Match.type<{ age: number }>().pipe(
 *   // Match when age is greater than 18
 *   Match.when(
 *     { age: (age: number) => age > 18 },
 *     (user: { age: number }) => `Age: ${user.age}`
 *   ),
 *   // Match when age is exactly 18
 *   Match.when({ age: 18 }, () => "You can vote"),
 *   // Fallback case for all other ages
 *   Match.orElse((user: { age: number }) => `${user.age} is too young`)
 * )
 *
 * match({ age: 20 }) // => "Age: 20"
 *
 * match({ age: 18 }) // => "You can vote"
 *
 * match({ age: 4 }) // => "4 is too young"
 * ```
 *
 * @see {@link whenOr} for handling any one of several patterns with the same handler
 * @see {@link whenAnd} for requiring all provided patterns to match before running a handler
 * @see {@link not} for handling inputs that do not match a pattern
 * @see {@link orElse} for providing a fallback when no pattern case matches
 *
 * @category defining patterns
 * @since 4.0.0
 */
export const when: <
  R,
  const P extends Types.PatternPrimitive<R> | Types.PatternBase<R>,
  Ret,
  Args extends Array<any>,
  Fn extends (_: Types.WhenMatch<R, P>, ...args: Args) => Ret
>(
  pattern: P,
  f: Fn
) => <I, F, A, Pr>(
  self: Matcher<I, F, R, A, Pr, Ret, Args>
) => Matcher<
  I,
  Types.AddWithout<F, Types.PForExclude<P>>,
  Types.ApplyFilters<I, Types.AddWithout<F, Types.PForExclude<P>>>,
  A | ReturnType<Fn>,
  Pr,
  Ret,
  Args
> = internal.when

/**
 * Matches one of multiple patterns in a single condition.
 *
 * **Details**
 *
 * This function allows defining a condition where a value matches any of the
 * provided patterns. If a match is found, the associated function is executed.
 * It simplifies cases where multiple patterns share the same handling logic.
 *
 * Unlike {@link when}, which requires separate conditions for each pattern,
 * this function enables combining them into a single statement, making the
 * matcher more concise.
 *
 * **Example** (Matching one of several patterns)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * type ErrorType =
 *   | { readonly _tag: "NetworkError"; readonly message: string }
 *   | { readonly _tag: "TimeoutError"; readonly duration: number }
 *   | { readonly _tag: "ValidationError"; readonly field: string }
 *
 * const handleError = Match.type<ErrorType>().pipe(
 *   Match.whenOr(
 *     { _tag: "NetworkError" },
 *     { _tag: "TimeoutError" },
 *     () => "Retry the request"
 *   ),
 *   Match.when({ _tag: "ValidationError" }, (_) => `Invalid field: ${_.field}`),
 *   Match.exhaustive
 * )
 *
 * handleError({ _tag: "NetworkError", message: "No connection" }) // => "Retry the request"
 *
 * handleError({ _tag: "ValidationError", field: "email" }) // => "Invalid field: email"
 * ```
 *
 * @category defining patterns
 * @since 4.0.0
 */
export const whenOr: <
  R,
  const P extends ReadonlyArray<Types.PatternPrimitive<R> | Types.PatternBase<R>>,
  Ret,
  Args extends Array<any>,
  Fn extends (_: Types.WhenMatch<R, P[number]>, ...args: Args) => Ret
>(
  ...args: [...patterns: P, f: Fn]
) => <I, F, A, Pr>(
  self: Matcher<I, F, R, A, Pr, Ret, Args>
) => Matcher<
  I,
  Types.AddWithout<F, Types.PForExclude<P[number]>>,
  Types.ApplyFilters<I, Types.AddWithout<F, Types.PForExclude<P[number]>>>,
  A | ReturnType<Fn>,
  Pr,
  Ret,
  Args
> = internal.whenOr

/**
 * Matches a value that satisfies all provided patterns.
 *
 * **Details**
 *
 * This function allows defining a condition where a value must match all the
 * given patterns simultaneously. If the value satisfies every pattern, the
 * associated function is executed.
 *
 * Unlike {@link when}, which matches a single pattern at a time, this function
 * ensures that multiple conditions are met before executing the callback. It is
 * useful when checking for values that need to fulfill multiple criteria at
 * once.
 *
 * **Example** (Matching all provided patterns)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * type User = { readonly age: number; readonly role: "admin" | "user" }
 *
 * const checkUser = Match.type<User>().pipe(
 *   Match.whenAnd(
 *     { age: (n) => n >= 18 },
 *     { role: "admin" },
 *     () => "Admin access granted"
 *   ),
 *   Match.orElse(() => "Access denied")
 * )
 *
 * checkUser({ age: 20, role: "admin" }) // => "Admin access granted"
 *
 * checkUser({ age: 20, role: "user" }) // => "Access denied"
 * ```
 *
 * @category defining patterns
 * @since 4.0.0
 */
export const whenAnd: <
  R,
  const P extends ReadonlyArray<Types.PatternPrimitive<R> | Types.PatternBase<R>>,
  Ret,
  Args extends Array<any>,
  Fn extends (_: Types.WhenMatch<R, T.UnionToIntersection<P[number]>>, ...args: Args) => Ret
>(
  ...args: [...patterns: P, f: Fn]
) => <I, F, A, Pr>(
  self: Matcher<I, F, R, A, Pr, Ret, Args>
) => Matcher<
  I,
  Types.AddWithout<F, Types.PForExclude<T.UnionToIntersection<P[number]>>>,
  Types.ApplyFilters<I, Types.AddWithout<F, Types.PForExclude<T.UnionToIntersection<P[number]>>>>,
  A | ReturnType<Fn>,
  Pr,
  Ret,
  Args
> = internal.whenAnd

/**
 * Matches values based on a specified discriminant field.
 *
 * **When to use**
 *
 * Use to match one or more exact values of a discriminator field.
 *
 * **Details**
 *
 * This function is used to define pattern matching on objects that follow a
 * **discriminated union** structure, where a specific field (e.g., `type`,
 * `kind`, `_tag`) determines the variant of the object. It allows matching
 * multiple values of the discriminant and provides a function to handle the
 * matched cases.
 *
 * **Example** (Matching on a discriminator field)
 *
 * ```ts import.meta.vitest
 * import { Match, pipe } from "effect"
 *
 * const match = pipe(
 *   Match.type<
 *     { type: "A"; a: string } | { type: "B"; b: number } | {
 *       type: "C"
 *       c: boolean
 *     }
 *   >(),
 *   Match.discriminator("type")("A", "B", (_) => `A or B: ${_.type}`),
 *   Match.discriminator("type")("C", (_) => `C(${_.c})`),
 *   Match.exhaustive
 * )
 * match({ type: "A", a: "ok" }) // => "A or B: A"
 * match({ type: "C", c: true }) // => "C(true)"
 * ```
 *
 * @see {@link discriminators} for defining several discriminator handlers at once
 * @see {@link discriminatorStartsWith} for matching string discriminator values by prefix
 *
 * @category defining patterns
 * @since 4.0.0
 */
export const discriminator: <D extends string>(
  field: D
) => <R, P extends Types.Tags<D, R> & string, Ret, Fn extends (_: Extract<R, Record<D, P>>) => Ret>(
  ...pattern: [first: P, ...values: Array<P>, f: Fn]
) => <I, F, A, Pr>(
  self: Matcher<I, F, R, A, Pr, Ret>
) => Matcher<
  I,
  Types.AddWithout<F, Extract<R, Record<D, P>>>,
  Types.ApplyFilters<I, Types.AddWithout<F, Extract<R, Record<D, P>>>>,
  A | ReturnType<Fn>,
  Pr,
  Ret
> = internal.discriminator

/**
 * Matches values where a specified field starts with a given prefix.
 *
 * **When to use**
 *
 * Use to match string discriminator values by prefix instead of exact value.
 *
 * **Details**
 *
 * Instead of checking for exact matches, this helper matches values that share
 * a common prefix. For example, if the discriminant field contains hierarchical
 * names like `"A"`, `"A.A"`, and `"B"`, a single `"A"` rule can match both
 * `"A"` and `"A.A"`.
 *
 * **Example** (Matching discriminator prefixes)
 *
 * ```ts import.meta.vitest
 * import { Match, pipe } from "effect"
 *
 * const match = pipe(
 *   Match.type<{ type: "A" } | { type: "B" } | { type: "A.A" } | {}>(),
 *   Match.discriminatorStartsWith("type")("A", (_) => 1 as const),
 *   Match.discriminatorStartsWith("type")("B", (_) => 2 as const),
 *   Match.orElse((_) => 3 as const)
 * )
 *
 * match({ type: "A" }) // => 1
 * match({ type: "B" }) // => 2
 * match({ type: "A.A" }) // => 1
 * ```
 *
 * @see {@link discriminator} for matching exact discriminator values
 *
 * @category defining patterns
 * @since 4.0.0
 */
export const discriminatorStartsWith: <D extends string>(
  field: D
) => <R, P extends string, Ret, Fn extends (_: Extract<R, Record<D, `${P}${string}`>>) => Ret>(
  pattern: P,
  f: Fn
) => <I, F, A, Pr>(
  self: Matcher<I, F, R, A, Pr, Ret>
) => Matcher<
  I,
  Types.AddWithout<F, Extract<R, Record<D, `${P}${string}`>>>,
  Types.ApplyFilters<I, Types.AddWithout<F, Extract<R, Record<D, `${P}${string}`>>>>,
  A | ReturnType<Fn>,
  Pr,
  Ret
> = internal.discriminatorStartsWith

/**
 * Matches values based on a field that serves as a discriminator, mapping each
 * possible value to a corresponding handler.
 *
 * **When to use**
 *
 * Use to define several discriminator handlers at once without finalizing the
 * matcher.
 *
 * **Details**
 *
 * This function simplifies working with discriminated unions by letting you
 * define a set of handlers for each possible value of a given field. Instead of
 * chaining multiple calls to {@link discriminator}, this function allows
 * defining all possible cases at once using an object where the keys are the
 * possible values of the field, and the values are the corresponding handler
 * functions.
 *
 * **Example** (Mapping discriminator handlers)
 *
 * ```ts import.meta.vitest
 * import { Match, pipe } from "effect"
 *
 * const match = pipe(
 *   Match.type<
 *     { type: "A"; a: string } | { type: "B"; b: number } | {
 *       type: "C"
 *       c: boolean
 *     }
 *   >(),
 *   Match.discriminators("type")({
 *     A: (a) => a.a,
 *     B: (b) => b.b,
 *     C: (c) => c.c
 *   }),
 *   Match.exhaustive
 * )
 * match({ type: "A", a: "ok" }) // => "ok"
 * match({ type: "B", b: 42 }) // => 42
 * ```
 *
 * @see {@link discriminator} for adding one discriminator case to a matcher pipeline
 * @see {@link discriminatorsExhaustive} for handling every discriminator value and finalizing the matcher
 *
 * @category defining patterns
 * @since 4.0.0
 */
export const discriminators: <D extends string>(
  field: D
) => <
  R,
  Ret,
  P extends
    & PartialTagHandlers<D, R, Ret>
    & { readonly [Tag in Exclude<keyof P, Types.Tags<D, R>>]: never }
>(
  fields: Contextual<P, PartialTagHandlers<D, R, Ret>>
) => <I, F, A, Pr>(
  self: Matcher<I, F, R, A, Pr, Ret>
) => Matcher<
  I,
  Types.AddWithout<F, Extract<R, Record<D, keyof P>>>,
  Types.ApplyFilters<I, Types.AddWithout<F, Extract<R, Record<D, keyof P>>>>,
  A | ReturnType<P[keyof P] & {}>,
  Pr,
  Ret
> = internal.discriminators

/**
 * Matches values by a discriminator field and requires every possible case to
 * be handled.
 *
 * **When to use**
 *
 * Use to define an exhaustive discriminator handler map that finalizes the
 * matcher.
 *
 * **Details**
 *
 * This is the exhaustive variant of {@link discriminators}. Each possible
 * discriminator value must have a corresponding handler, so the matcher is
 * finalized directly and does not require `Match.exhaustive` at the end of the
 * pipeline.
 *
 * **Example** (Handling all discriminator cases)
 *
 * ```ts import.meta.vitest
 * import { Match, pipe } from "effect"
 *
 * const match = pipe(
 *   Match.type<
 *     { type: "A"; a: string } | { type: "B"; b: number } | {
 *       type: "C"
 *       c: boolean
 *     }
 *   >(),
 *   Match.discriminatorsExhaustive("type")({
 *     A: (a) => a.a,
 *     B: (b) => b.b,
 *     C: (c) => c.c
 *   })
 * )
 * match({ type: "C", c: true }) // => true
 * ```
 *
 * @see {@link discriminators} for defining discriminator handlers without finalizing the matcher
 *
 * @category defining patterns
 * @since 4.0.0
 */
export const discriminatorsExhaustive: <D extends string>(
  field: D
) => <
  R,
  Ret,
  P extends
    & TagHandlers<D, R, Ret>
    & { readonly [Tag in Exclude<keyof P, Types.Tags<D, R>>]: never }
>(
  fields: Contextual<P, TagHandlers<D, R, Ret>>
) => <I, F, A, Pr>(
  self: Matcher<I, F, R, A, Pr, Ret>
) => [Pr] extends [never] ? (u: I) => Unify<A | ReturnType<P[keyof P]>> : Unify<A | ReturnType<P[keyof P]>> =
  internal.discriminatorsExhaustive

/**
 * Matches discriminated union members by their `_tag` field.
 *
 * **When to use**
 *
 * Use to handle one or more `_tag` cases with the same matcher branch.
 *
 * **Details**
 *
 * This helper follows the Effect convention that discriminated unions use
 * `"_tag"` as their discriminator field. Use {@link discriminator} for a
 * different discriminator field.
 *
 * **Example** (Matching a discriminated union by tag)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * type Event =
 *   | { readonly _tag: "fetch" }
 *   | { readonly _tag: "success"; readonly data: string }
 *   | { readonly _tag: "error"; readonly error: Error }
 *   | { readonly _tag: "cancel" }
 *
 * const match = Match.type<Event>().pipe(
 *   // Match either "fetch" or "success"
 *   Match.tag("fetch", "success", () => `Ok!`),
 *   // Match "error" and extract the error message
 *   Match.tag("error", (event) => `Error: ${event.error.message}`),
 *   // Match "cancel"
 *   Match.tag("cancel", () => "Cancelled"),
 *   Match.exhaustive
 * )
 *
 * match({ _tag: "success", data: "Hello" }) // => "Ok!"
 *
 * match({ _tag: "error", error: new Error("Oops!") }) // => "Error: Oops!"
 * ```
 *
 * @category defining patterns
 * @since 4.0.0
 */
export const tag: <
  R,
  P extends Types.Tags<"_tag", R> & string,
  Ret,
  Args extends Array<any>,
  Fn extends (_: Extract<R, Record<"_tag", P>>, ...args: Args) => Ret
>(
  ...pattern: [first: P, ...values: Array<P>, f: Fn]
) => <I, F, A, Pr>(
  self: Matcher<I, F, R, A, Pr, Ret, Args>
) => Matcher<
  I,
  Types.AddWithout<F, Extract<R, Record<"_tag", P>>>,
  Types.ApplyFilters<I, Types.AddWithout<F, Extract<R, Record<"_tag", P>>>>,
  ReturnType<Fn> | A,
  Pr,
  Ret,
  Args
> = internal.tag

/**
 * Matches values where the `_tag` field starts with a given prefix.
 *
 * **Details**
 *
 * This function allows you to match on values in a **discriminated union**
 * based on whether the `_tag` field starts with a specified prefix. It is
 * useful for handling hierarchical or namespaced tags, where multiple related
 * cases share a common prefix.
 *
 * **Example** (Matching tag prefixes)
 *
 * ```ts import.meta.vitest
 * import { Match, pipe } from "effect"
 *
 * const match = pipe(
 *   Match.type<{ _tag: "A" } | { _tag: "B" } | { _tag: "A.A" } | {}>(),
 *   Match.tagStartsWith("A", (_) => 1 as const),
 *   Match.tagStartsWith("B", (_) => 2 as const),
 *   Match.orElse((_) => 3 as const)
 * )
 *
 * match({ _tag: "A" }) // => 1
 * match({ _tag: "B" }) // => 2
 * match({ _tag: "A.A" }) // => 1
 * ```
 *
 * @category defining patterns
 * @since 4.0.0
 */
export const tagStartsWith: <
  R,
  P extends string,
  Ret,
  Fn extends (_: Extract<R, Record<"_tag", `${P}${string}`>>) => Ret
>(
  pattern: P,
  f: Fn
) => <I, F, A, Pr>(
  self: Matcher<I, F, R, A, Pr, Ret>
) => Matcher<
  I,
  Types.AddWithout<F, Extract<R, Record<"_tag", `${P}${string}`>>>,
  Types.ApplyFilters<I, Types.AddWithout<F, Extract<R, Record<"_tag", `${P}${string}`>>>>,
  ReturnType<Fn> | A,
  Pr,
  Ret
> = internal.tagStartsWith

/**
 * Matches values based on their `_tag` field, mapping each tag to a
 * corresponding handler.
 *
 * **Details**
 *
 * This function provides a way to handle discriminated unions by mapping `_tag`
 * values to specific functions. Each handler receives the matched value and
 * returns a transformed result. If all possible tags are handled, you can
 * enforce exhaustiveness using `Match.exhaustive` to ensure no case is missed.
 *
 * **Example** (Mapping tag handlers)
 *
 * ```ts import.meta.vitest
 * import { Match, pipe } from "effect"
 *
 * const match = pipe(
 *   Match.type<
 *     { _tag: "A"; a: string } | { _tag: "B"; b: number } | {
 *       _tag: "C"
 *       c: boolean
 *     }
 *   >(),
 *   Match.tags({
 *     A: (a) => a.a,
 *     B: (b) => b.b,
 *     C: (c) => c.c
 *   }),
 *   Match.exhaustive
 * )
 * match({ _tag: "A", a: "ok" }) // => "ok"
 * ```
 *
 * @category defining patterns
 * @since 4.0.0
 */
export const tags: <
  R,
  Ret,
  P extends
    & PartialTagHandlers<"_tag", R, Ret>
    & { readonly [Tag in Exclude<keyof P, Types.Tags<"_tag", R>>]: never }
>(
  fields: Contextual<P, PartialTagHandlers<"_tag", R, Ret>>
) => <I, F, A, Pr>(
  self: Matcher<I, F, R, A, Pr, Ret>
) => Matcher<
  I,
  Types.AddWithout<F, Extract<R, Record<"_tag", keyof P>>>,
  Types.ApplyFilters<I, Types.AddWithout<F, Extract<R, Record<"_tag", keyof P>>>>,
  A | ReturnType<P[keyof P] & {}>,
  Pr,
  Ret
> = internal.tags

/**
 * Matches values based on their `_tag` field and requires handling of all
 * possible cases.
 *
 * **Details**
 *
 * This function is designed for **discriminated unions** where every possible
 * `_tag` value must have a corresponding handler. Unlike {@link tags}, this
 * function ensures **exhaustiveness**, meaning all cases must be explicitly
 * handled. If a `_tag` value is missing from the mapping, TypeScript will
 * report an error.
 *
 * **Example** (Handling all tag cases)
 *
 * ```ts import.meta.vitest
 * import { Match, pipe } from "effect"
 *
 * const match = pipe(
 *   Match.type<
 *     { _tag: "A"; a: string } | { _tag: "B"; b: number } | {
 *       _tag: "C"
 *       c: boolean
 *     }
 *   >(),
 *   Match.tagsExhaustive({
 *     A: (a) => a.a,
 *     B: (b) => b.b,
 *     C: (c) => c.c
 *   })
 * )
 * match({ _tag: "B", b: 42 }) // => 42
 * ```
 *
 * @category defining patterns
 * @since 4.0.0
 */
export const tagsExhaustive: <
  R,
  Ret,
  P extends
    & TagHandlers<"_tag", R, Ret>
    & { readonly [Tag in Exclude<keyof P, Types.Tags<"_tag", R>>]: never }
>(
  fields: Contextual<P, TagHandlers<"_tag", R, Ret>>
) => <I, F, A, Pr>(
  self: Matcher<I, F, R, A, Pr, Ret>
) => [Pr] extends [never] ? (u: I) => Unify<A | ReturnType<P[keyof P]>> : Unify<A | ReturnType<P[keyof P]>> =
  internal.tagsExhaustive

/**
 * Creates a pattern that excludes a specific value while allowing all others.
 *
 * **When to use**
 *
 * Use to add a negative pattern case for inputs that should match when another
 * pattern does not.
 *
 * **Details**
 *
 * Any excluded value bypasses the provided function and continues matching
 * through later cases.
 *
 * **Example** (Ignoring a specific value)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * // Create a matcher for string or number values
 * const match = Match.type<string | number>().pipe(
 *   // Match any value except "hi", returning "ok"
 *   Match.not("hi", () => "ok"),
 *   // Fallback case for when the value is "hi"
 *   Match.orElse(() => "fallback")
 * )
 *
 * match("hello") // => "ok"
 *
 * match("hi") // => "fallback"
 * ```
 *
 * @see {@link when} for adding a positive pattern case
 *
 * @category defining patterns
 * @since 4.0.0
 */
export const not: <
  R,
  const P extends Types.PatternPrimitive<R> | Types.PatternBase<R>,
  Ret,
  Args extends Array<any>,
  Fn extends (_: Types.NotMatch<R, P>, ...args: Args) => Ret
>(
  pattern: P,
  f: Fn
) => <I, F, A, Pr>(
  self: Matcher<I, F, R, A, Pr, Ret, Args>
) => Matcher<
  I,
  Types.AddOnly<F, Types.WhenMatch<R, P>>,
  Types.ApplyFilters<I, Types.AddOnly<F, Types.WhenMatch<R, P>>>,
  A | ReturnType<Fn>,
  Pr,
  Ret,
  Args
> = internal.not

/**
 * Matches non-empty strings.
 *
 * **When to use**
 *
 * Use to match strings whose length is greater than zero.
 *
 * **Details**
 *
 * This predicate matches any string that contains at least one character,
 * effectively filtering out empty strings ("").
 *
 * **Example** (Matching non-empty strings)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * const processInput = Match.type<string>()
 *   .pipe(
 *     Match.when(Match.nonEmptyString, (str) => `Valid input: ${str}`),
 *     Match.orElse(() => "Input cannot be empty")
 *   )
 *
 * processInput("hello") // => "Valid input: hello"
 *
 * processInput("") // => "Input cannot be empty"
 *
 * processInput("   ") // => "Valid input:    "
 * ```
 *
 * @see {@link string} for matching any string
 *
 * @category guards
 * @since 4.0.0
 */
export const nonEmptyString: SafeRefinement<string, never> = internal.nonEmptyString

/**
 * Matches a specific set of literal values (e.g., `Match.is("a", 42, true)`).
 *
 * **When to use**
 *
 * Use to match one of several literal primitive or null values.
 *
 * **Details**
 *
 * This function creates a predicate that matches any of the provided literal values.
 * It's useful for matching against multiple specific values in a single pattern.
 *
 * **Example** (Matching literal values)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * const handleStatus = Match.type<string | number>()
 *   .pipe(
 *     Match.when(Match.is("success", "ok", 200), () => "Operation successful"),
 *     Match.when(Match.is("error", "failed", 500), () => "Operation failed"),
 *     Match.when(Match.is(0, false, null), () => "Falsy value"),
 *     Match.orElse((value) => `Unknown status: ${value}`)
 *   )
 *
 * handleStatus("success") // => "Operation successful"
 *
 * handleStatus(200) // => "Operation successful"
 *
 * handleStatus("failed") // => "Operation failed"
 *
 * handleStatus(0) // => "Falsy value"
 *
 * handleStatus("pending") // => "Unknown status: pending"
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export const is: <
  Literals extends ReadonlyArray<string | number | bigint | boolean | null>
>(...literals: Literals) => SafeRefinement<Literals[number]> = internal.is

/**
 * Matches values of type `string`.
 *
 * **Details**
 *
 * This predicate refines unknown values to strings, allowing pattern matching
 * on string types. It's commonly used in type-based matchers to handle string cases.
 *
 * **Example** (Matching string values)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * const processValue = Match.type<string | number | boolean>().pipe(
 *   Match.when(Match.string, (str) => `String: ${str.toUpperCase()}`),
 *   Match.when(Match.number, (num) => `Number: ${num * 2}`),
 *   Match.when(Match.boolean, (bool) => `Boolean: ${bool ? "yes" : "no"}`),
 *   Match.exhaustive
 * )
 *
 * processValue("hello") // => "String: HELLO"
 * processValue(42) // => "Number: 84"
 * processValue(true) // => "Boolean: yes"
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export const string: Predicate.Refinement<unknown, string> = Predicate.isString

/**
 * Matches values of type `number`.
 *
 * **When to use**
 *
 * Use to match primitive number values, including `NaN` and infinities.
 *
 * **Details**
 *
 * This predicate refines unknown values to numbers, allowing pattern matching
 * on numeric types. It matches all number values including integers, floats,
 * `Infinity`, `-Infinity`, and `NaN`.
 *
 * **Example** (Matching number values)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * const categorizeNumber = Match.type<unknown>().pipe(
 *   Match.when(Match.number, (num) => {
 *     if (Number.isNaN(num)) return "Not a number"
 *     if (!Number.isFinite(num)) return "Infinite"
 *     if (Number.isInteger(num)) return `Integer: ${num}`
 *     return `Float: ${num.toFixed(2)}`
 *   }),
 *   Match.orElse(() => "Not a number type")
 * )
 *
 * categorizeNumber(42) // => "Integer: 42"
 * categorizeNumber(3.14) // => "Float: 3.14"
 * categorizeNumber(NaN) // => "Not a number"
 * categorizeNumber("hello") // => "Not a number type"
 * ```
 *
 * @see {@link bigint} for matching primitive bigint values
 *
 * @category guards
 * @since 4.0.0
 */
export const number: Predicate.Refinement<unknown, number> = Predicate.isNumber

/**
 * Matches any value without restrictions.
 *
 * **When to use**
 *
 * Use to define an explicit catch-all pattern when the handler should receive
 * the unmatched value.
 *
 * **Details**
 *
 * This predicate matches every input, including `undefined`, `null`, objects,
 * primitives, and functions.
 *
 * **Gotchas**
 *
 * `Match.any` should usually be last because cases are checked in order and
 * the first matching case wins.
 *
 * **Example** (Matching any remaining value)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * const describeValue = Match.type<unknown>()
 *   .pipe(
 *     Match.when(Match.string, (str) => `String: ${str}`),
 *     Match.when(Match.number, (num) => `Number: ${num}`),
 *     Match.when(Match.boolean, (bool) => `Boolean: ${bool}`),
 *     Match.when(Match.any, (value) => `Other: ${typeof value}`),
 *     Match.exhaustive
 *   )
 *
 * describeValue("hello") // => "String: hello"
 *
 * describeValue(42) // => "Number: 42"
 *
 * describeValue([1, 2, 3]) // => "Other: object"
 *
 * describeValue(null) // => "Other: object"
 * ```
 *
 * @see {@link defined} for matching only non-nullish values
 * @see {@link orElse} for providing a fallback after earlier cases
 *
 * @category guards
 * @since 4.0.0
 */
export const any: SafeRefinement<unknown, any> = internal.any

/**
 * Matches any defined (non-null and non-undefined) value.
 *
 * **When to use**
 *
 * Use to exclude only `null` and `undefined` from a match branch.
 *
 * **Details**
 *
 * This predicate matches values that are neither `null` nor `undefined`,
 * effectively filtering out nullish values while preserving all other types.
 *
 * **Example** (Matching defined values)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * const processValue = Match.type<string | number | null | undefined>()
 *   .pipe(
 *     Match.when(Match.defined, (value) => `Defined value: ${value}`),
 *     Match.orElse(() => "Value is null or undefined")
 *   )
 *
 * processValue("hello") // => "Defined value: hello"
 *
 * processValue(42) // => "Defined value: 42"
 *
 * processValue(0) // => "Defined value: 0"
 *
 * processValue("") // => "Defined value: "
 *
 * processValue(null) // => "Value is null or undefined"
 *
 * processValue(undefined) // => "Value is null or undefined"
 * ```
 *
 * @see {@link any} for matching every value without excluding nullish inputs
 *
 * @category guards
 * @since 4.0.0
 */
export const defined: <A>(u: A) => u is A & {} = internal.defined

/**
 * Matches values of type `boolean`.
 *
 * **When to use**
 *
 * Use to match primitive boolean values.
 *
 * **Details**
 *
 * This predicate refines unknown values to booleans, allowing pattern matching
 * on boolean types. It only matches the primitive boolean values `true` and `false`.
 *
 * **Example** (Matching boolean values)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * const describeTruthiness = Match.type<unknown>().pipe(
 *   Match.when(
 *     Match.boolean,
 *     (bool) => bool ? "Definitely true" : "Definitely false"
 *   ),
 *   Match.when(0, () => "Falsy number"),
 *   Match.when("", () => "Empty string"),
 *   Match.when(Match.null, () => "Null value"),
 *   Match.orElse(() => "Some other truthy value")
 * )
 *
 * describeTruthiness(true) // => "Definitely true"
 * describeTruthiness(false) // => "Definitely false"
 * describeTruthiness(0) // => "Falsy number"
 * describeTruthiness(1) // => "Some other truthy value"
 * ```
 *
 * @see {@link is} for matching specific literal boolean values
 *
 * @category guards
 * @since 4.0.0
 */
export const boolean: Predicate.Refinement<unknown, boolean> = Predicate.isBoolean

const _undefined: Predicate.Refinement<unknown, undefined> = Predicate.isUndefined
export {
  /**
   * Matches the value `undefined`.
   *
   * **When to use**
   *
   * Use when a matcher should handle only inputs with no defined value.
   *
   * **Details**
   *
   * This refinement is backed by `Predicate.isUndefined`, which checks
   * `input === undefined`.
   *
   * @see {@link defined} for matching non-nullish values
   * @see {@link is} for matching literal values
   *
   * @category guards
   * @since 4.0.0
   */
  _undefined as undefined
}

const _null: Predicate.Refinement<unknown, null> = Predicate.isNull
export {
  /**
   * Matches the value `null`.
   *
   * **When to use**
   *
   * Use to handle only the `null` literal in a match branch.
   *
   * **Details**
   *
   * This refinement is backed by `Predicate.isNull`, which checks
   * `input === null`.
   *
   * @see {@link defined} for matching non-nullish values
   * @see {@link is} for matching literal values
   *
   * @category guards
   * @since 4.0.0
   */
  _null as null
}

/**
 * Matches values of type `bigint`.
 *
 * **When to use**
 *
 * Use to match primitive bigint values.
 *
 * **Details**
 *
 * This predicate refines unknown values to bigints, allowing pattern matching
 * on bigint types. BigInts are used for representing integers with arbitrary precision.
 *
 * **Example** (Matching bigint values)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * const processLargeNumber = Match.type<unknown>().pipe(
 *   Match.when(Match.bigint, (big) => {
 *     if (big > 9007199254740991n) {
 *       return `Large integer: ${big.toString()}`
 *     }
 *     return `BigInt: ${big.toString()}`
 *   }),
 *   Match.when(Match.number, (num) => `Regular number: ${num}`),
 *   Match.orElse(() => "Not a numeric type")
 * )
 *
 * processLargeNumber(123n) // => "BigInt: 123"
 * processLargeNumber(9007199254740992n) // => "Large integer: 9007199254740992"
 * processLargeNumber(123) // => "Regular number: 123"
 * processLargeNumber("123") // => "Not a numeric type"
 * ```
 *
 * @see {@link number} for matching primitive number values
 *
 * @category guards
 * @since 4.0.0
 */
export const bigint: Predicate.Refinement<unknown, bigint> = Predicate.isBigInt

/**
 * Matches values of type `symbol`.
 *
 * **Details**
 *
 * This predicate refines unknown values to symbols, allowing pattern matching
 * on symbol types. Symbols are unique identifiers that are often used as
 * object keys or for creating private properties.
 *
 * **Example** (Matching symbol values)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * const mySymbol = Symbol("my-symbol")
 * const globalSymbol = Symbol.for("global-symbol")
 *
 * const handleSymbol = Match.type<unknown>().pipe(
 *   Match.when(Match.symbol, (sym) => {
 *     const description = sym.description
 *     if (description) {
 *       return `Symbol with description: ${description}`
 *     }
 *     return "Symbol without description"
 *   }),
 *   Match.orElse(() => "Not a symbol")
 * )
 *
 * handleSymbol(mySymbol) // => "Symbol with description: my-symbol"
 * handleSymbol(Symbol()) // => "Symbol without description"
 * handleSymbol("string") // => "Not a symbol"
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export const symbol: Predicate.Refinement<unknown, symbol> = Predicate.isSymbol

/**
 * Matches values that are instances of `Date`.
 *
 * **When to use**
 *
 * Use to match `Date` instances.
 *
 * **Details**
 *
 * This predicate refines unknown values to Date instances, allowing pattern
 * matching on Date objects. It only matches actual Date instances, not
 * date strings or timestamps.
 *
 * **Example** (Matching Date instances)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * const processDateValue = Match.type<unknown>().pipe(
 *   Match.when(Match.date, (date) => {
 *     if (isNaN(date.getTime())) {
 *       return "Invalid date"
 *     }
 *     return `Date: ${date.toISOString().split("T")[0]}`
 *   }),
 *   Match.when(Match.string, (str) => `Date string: ${str}`),
 *   Match.orElse(() => "Not a date-related value")
 * )
 *
 * processDateValue(new Date("2024-01-01")) // => "Date: 2024-01-01"
 * processDateValue(new Date("invalid")) // => "Invalid date"
 * processDateValue("2024-01-01") // => "Date string: 2024-01-01"
 * processDateValue(1704067200000) // => "Not a date-related value"
 * ```
 *
 * @see {@link instanceOf} for matching instances of any constructor
 *
 * @category guards
 * @since 4.0.0
 */
export const date: Predicate.Refinement<unknown, Date> = Predicate.isDate

/**
 * Matches non-null objects other than arrays.
 *
 * **When to use**
 *
 * Use to match broad non-null, non-array object values.
 *
 * **Details**
 *
 * This predicate uses `Predicate.isObject`: it returns `true` for values whose
 * runtime type is `"object"`, are not `null`, and are not arrays. It can match
 * `Date`, `RegExp`, and class instances; use `instanceOf` or a more specific
 * pattern when those cases need to be distinguished.
 *
 * **Example** (Matching record objects)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * const analyzeValue = Match.type<unknown>().pipe(
 *   Match.when(Match.record, (obj) => {
 *     const keys = Object.keys(obj)
 *     const valueCount = keys.length
 *     return `Object with ${valueCount} properties: [${keys.join(", ")}]`
 *   }),
 *   Match.when(
 *     Match.instanceOf(Array),
 *     (arr) => `Array with ${arr.length} items`
 *   ),
 *   Match.orElse(() => "Not an object")
 * )
 *
 * analyzeValue({ name: "Alice", age: 30 }) // => "Object with 2 properties: [name, age]"
 * analyzeValue([1, 2, 3]) // => "Array with 3 items"
 * analyzeValue(null) // => "Not an object"
 * analyzeValue("hello") // => "Not an object"
 * ```
 *
 * @see {@link instanceOf} for matching a specific constructor
 *
 * @category guards
 * @since 4.0.0
 */
export const record: Predicate.Refinement<unknown, { [x: PropertyKey]: unknown }> = Predicate.isObject

/**
 * Matches instances of a given class.
 *
 * **When to use**
 *
 * Use to match values that are instances of a constructor with type-safe
 * narrowing.
 *
 * **Details**
 *
 * This predicate checks if a value is an instance of the specified constructor,
 * providing type-safe matching for class instances and built-in objects.
 *
 * **Example** (Matching class instances)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * class CustomError extends Error {
 *   constructor(message: string, public code: number) {
 *     super(message)
 *   }
 * }
 *
 * const handleValue = Match.type<unknown>()
 *   .pipe(
 *     Match.when(
 *       Match.instanceOf(CustomError),
 *       (err) => `Custom error: ${err.message} (code: ${err.code})`
 *     ),
 *     Match.when(
 *       Match.instanceOf(Error),
 *       (err) => `Standard error: ${err.message}`
 *     ),
 *     Match.when(
 *       Match.instanceOf(Array),
 *       (arr) => `Array with ${arr.length} items`
 *     ),
 *     Match.when(
 *       Match.instanceOf(Map),
 *       (map) => `Map with ${map.size} entries`
 *     ),
 *     Match.orElse((value) => `Other: ${typeof value}`)
 *   )
 *
 * handleValue(new CustomError("Failed", 404)) // => "Custom error: Failed (code: 404)"
 * handleValue(new Error("Generic error")) // => "Standard error: Generic error"
 * handleValue([1, 2, 3]) // => "Array with 3 items"
 * handleValue(new Map([["count", 1]])) // => "Map with 1 entries"
 * ```
 *
 * @see {@link instanceOfUnsafe} for constructor matching without the same type-safety guarantee
 * @see {@link record} for matching broad non-null, non-array objects
 *
 * @category guards
 * @since 4.0.0
 */
export const instanceOf: <A extends abstract new(...args: any) => any>(
  constructor: A
) => SafeRefinement<InstanceType<A>, never> = internal.instanceOf

/**
 * Checks whether a value is an instance of a constructor without type-safe narrowing.
 *
 * **When to use**
 *
 * Use when you need constructor matching to use the unsafe refinement type.
 *
 * **Details**
 *
 * This predicate checks if a value is an instance of the specified constructor
 * but doesn't provide the same type safety guarantees as the regular `instanceOf`.
 * Use this when you need more flexibility but understand the type safety implications.
 *
 * **Example** (Matching class instances unsafely)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * class CustomError extends Error {
 *   constructor(message: string, public code: number) {
 *     super(message)
 *   }
 * }
 *
 * // When you need to match instances but handle type narrowing manually
 * const handleError = Match.type<unknown>().pipe(
 *   Match.when(Match.instanceOfUnsafe(CustomError), (err: any) => {
 *     // Manual type assertion needed
 *     const customErr = err as CustomError
 *     return `Custom error ${customErr.code}: ${customErr.message}`
 *   }),
 *   Match.orElse(() => "Not a CustomError")
 * )
 * handleError(new CustomError("failed", 500)) // => "Custom error 500: failed"
 * ```
 *
 * @see {@link instanceOf} for type-safe constructor matching
 *
 * @category guards
 * @since 4.0.0
 */
export const instanceOfUnsafe: <A extends abstract new(...args: any) => any>(
  constructor: A
) => SafeRefinement<InstanceType<A>, InstanceType<A>> = internal.instanceOf

/**
 * Provides a fallback value when no patterns match.
 *
 * **When to use**
 *
 * Use to finalize a matcher with a fallback for unmatched input.
 *
 * **Details**
 *
 * This function ensures that a matcher always returns a valid result, even if
 * no defined patterns match. It acts as a default case, similar to the
 * `default` clause in a `switch` statement or the final `else` in an `if-else`
 * chain.
 *
 * **Example** (Providing a default value when no patterns match)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * // Create a matcher for string or number values
 * const match = Match.type<string | number>().pipe(
 *   // Match when the value is "a"
 *   Match.when("a", () => "ok"),
 *   // Fallback when no patterns match
 *   Match.orElse(() => "fallback")
 * )
 *
 * match("a") // => "ok"
 *
 * match("b") // => "fallback"
 * ```
 *
 * @see {@link option} for finalizing unmatched input as `Option.none`
 * @see {@link result} for returning unmatched input as a `Result` failure
 * @see {@link orElseAbsurd} for finalizing when unmatched input should be impossible
 *
 * @category completion
 * @since 4.0.0
 */
export const orElse: <RA, Ret, Args extends Array<any>, F extends (_: RA, ...args: Args) => Ret>(
  f: F
) => <I, R, A, Pr>(
  self: Matcher<I, R, RA, A, Pr, Ret, Args>
) => [Pr] extends [never] ? [Args] extends [[]] ? (input: I) => Unify<ReturnType<F> | A>
  : (...args: Args) => Unify<ReturnType<F> | A>
  : Unify<ReturnType<F> | A> = internal.orElse

// TODO(4.0): Rename to "orThrow"? Like Result.getOrThrow
/**
 * Returns a matcher that throws an error if no pattern matches.
 *
 * **When to use**
 *
 * Use to finalize a matcher when every remaining unmatched case should be
 * impossible.
 *
 * **Details**
 *
 * This function finalizes a matcher by ensuring that if no patterns match, an
 * error is thrown. It is useful when all cases should be covered, and any
 * unexpected input should trigger an error instead of returning a default
 * value.
 *
 * When used, this function removes the need for an explicit fallback case and
 * ensures that an unmatched value is never silently ignored.
 *
 * **Example** (Throwing on unmatched input)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * const strictMatcher = Match.type<"a" | "b">().pipe(
 *   Match.when("a", () => "Found A"),
 *   Match.when("b", () => "Found B"),
 *   // Will throw if input is neither "a" nor "b"
 *   Match.orElseAbsurd
 * )
 *
 * strictMatcher("a") // => "Found A"
 * strictMatcher("b") // => "Found B"
 *
 * // This would throw an error at runtime:
 * // strictMatcher("c" as any) // throws
 * ```
 *
 * @see {@link exhaustive} for compile-time exhaustive matcher finalization
 * @see {@link orElse} for providing a fallback for unmatched input
 *
 * @category completion
 * @since 4.0.0
 */
export const orElseAbsurd: <I, R, RA, A, Pr, Ret, Args extends Array<any>>(
  self: Matcher<I, R, RA, A, Pr, Ret, Args>
) => [Pr] extends [never] ? [Args] extends [[]] ? (input: I) => Unify<A> : (...args: Args) => Unify<A> : Unify<A> =
  internal.orElseAbsurd

/**
 * Wraps the match result in a `Result`, distinguishing matched and unmatched
 * cases.
 *
 * **Details**
 *
 * This function ensures that the result of a matcher is always wrapped in an
 * `Result`, allowing clear differentiation between successful matches
 * (`Ok(value)`) and cases where no pattern matched (`Err(unmatched
 * value)`).
 *
 * This approach is particularly useful when handling optional values or when an
 * unmatched case should be explicitly handled rather than returning a default
 * value or throwing an error.
 *
 * **Example** (Extracting a user role with `Match.result`)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * type User = { readonly role: "admin" | "editor" | "viewer" }
 *
 * // Create a matcher to extract user roles
 * const getRole = Match.type<User>().pipe(
 *   Match.when({ role: "admin" }, () => "Has full access"),
 *   Match.when({ role: "editor" }, () => "Can edit content"),
 *   Match.result // Wrap the result in an Result
 * )
 *
 * getRole({ role: "admin" })._tag // => "Success"
 *
 * getRole({ role: "viewer" })._tag // => "Failure"
 * ```
 *
 * @category completion
 * @since 4.0.0
 */
export const result: <I, F, R, A, Pr, Ret, Args extends Array<any>>(
  self: Matcher<I, F, R, A, Pr, Ret, Args>
) => [Pr] extends [never] ? [Args] extends [[]] ? (input: I) => Result.Result<Unify<A>, R>
  : (...args: Args) => Result.Result<Unify<A>, R>
  : Result.Result<Unify<A>, R> = internal.result

/**
 * Wraps the match result in an `Option`, representing an optional match.
 *
 * **When to use**
 *
 * Use to finalize a matcher when unmatched input is expected and should become
 * `Option.none`.
 *
 * **Details**
 *
 * This function ensures that the result of a matcher is wrapped in an `Option`,
 * making it easy to handle cases where no pattern matches. If a match is found,
 * it returns `Some(value)`, otherwise, it returns `None`.
 *
 * This is useful in cases where a missing match is expected and should be
 * handled explicitly rather than throwing an error or returning a default
 * value.
 *
 * **Example** (Extracting a user role with `Match.option`)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * type User = { readonly role: "admin" | "editor" | "viewer" }
 *
 * // Create a matcher to extract user roles
 * const getRole = Match.type<User>().pipe(
 *   Match.when({ role: "admin" }, () => "Has full access"),
 *   Match.when({ role: "editor" }, () => "Can edit content"),
 *   Match.option // Wrap the result in an Option
 * )
 *
 * getRole({ role: "admin" })._tag // => "Some"
 *
 * getRole({ role: "viewer" })._tag // => "None"
 * ```
 *
 * @see {@link result} for preserving unmatched input as a `Result` failure
 * @see {@link orElse} for replacing unmatched input with a fallback value
 *
 * @category completion
 * @since 4.0.0
 */
export const option: <I, F, R, A, Pr, Ret, Args extends Array<any>>(
  self: Matcher<I, F, R, A, Pr, Ret, Args>
) => [Pr] extends [never] ? [Args] extends [[]] ? (input: I) => Option.Option<Unify<A>>
  : (...args: Args) => Option.Option<Unify<A>>
  : Option.Option<Unify<A>> = internal.option

/**
 * Completes a matcher that handles every remaining input case.
 *
 * **When to use**
 *
 * Use to require TypeScript to reject incomplete matcher definitions before the
 * matcher is turned into a function.
 *
 * **Details**
 *
 * If any case is still unmatched, the matcher does not type-check as
 * exhaustive.
 *
 * **Example** (Ensuring all cases are covered)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * // Create a matcher for string or number values
 * const match = Match.type<string | number>().pipe(
 *   // Match when the value is a number
 *   Match.when(Match.number, (n) => `number: ${n}`),
 *   // Mark the match as exhaustive, ensuring all cases are handled
 *   // TypeScript will throw an error if any case is missing
 *   // @ts-expect-error Type 'string' is not assignable to type 'never'
 *   Match.exhaustive
 * )
 * ```
 *
 * @category completion
 * @since 4.0.0
 */
export const exhaustive: <I, F, A, Pr, Ret, Args extends Array<any>>(
  self: Matcher<I, F, never, A, Pr, Ret, Args>
) => [Pr] extends [never] ? [Args] extends [[]] ? (u: I) => Unify<A> : (...args: Args) => Unify<A> : Unify<A> =
  internal.exhaustive

const SafeRefinementId = "~effect/Match/SafeRefinement"

/**
 * A safe refinement that narrows types without runtime errors.
 *
 * **Details**
 *
 * `SafeRefinement` provides a way to refine types in pattern matching while
 * maintaining type safety. Unlike regular predicates, safe refinements can
 * transform the matched value's type without throwing runtime errors.
 *
 * **Example** (Using safe refinements)
 *
 * ```ts import.meta.vitest
 * import { Match } from "effect"
 *
 * // Built-in safe refinements
 * const processValue = Match.type<unknown>().pipe(
 *   Match.when(Match.string, (s) => s.toUpperCase()),
 *   Match.when(Match.number, (n) => n * 2),
 *   Match.when(Match.defined, (value) => `Defined: ${value}`),
 *   Match.orElse(() => "Undefined or null")
 * )
 *
 * processValue("hello") // => "HELLO"
 * processValue(21) // => 42
 * processValue(true) // => "Defined: true"
 * processValue(null) // => "Undefined or null"
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export interface SafeRefinement<in A, out R = A> {
  readonly [SafeRefinementId]: (a: A) => R
}

const Fail = Symbol.for("effect/Fail")
type Fail = typeof Fail

/**
 * A namespace containing utility types for Match operations.
 *
 * **Details**
 *
 * This namespace provides advanced type-level utilities used internally by the
 * Match module to perform complex pattern matching, type narrowing, and filter
 * application. These types enable the sophisticated type inference that makes
 * pattern matching both type-safe and ergonomic.
 *
 * @since 4.0.0
 */
export declare namespace Types {
  /**
   * Computes the matched type when a pattern P is applied to type R.
   *
   * **Details**
   *
   * This utility type determines what type a value will have after successfully
   * matching against a pattern. It handles refinements, predicates, and complex
   * object patterns to provide accurate type narrowing.
   *
   * **Example** (Computing matched types)
   *
   * ```ts import.meta.vitest
   * import type { Match } from "effect"
   *
   * // WhenMatch computes the narrowed type after pattern matching
   * type StringMatch = Match.Types.WhenMatch<string | number, typeof Match.string>
   * // Result: string
   *
   * type ObjectMatch = Match.Types.WhenMatch<
   *   { type: "user"; name: string } | {
   *     type: "admin"
   *     permissions: Array<string>
   *   },
   *   { type: "user" }
   * >
   * // Result: { type: "user"; name: string }
   * ```
   *
   * @category utility types
   * @since 4.0.0
   */
  export type WhenMatch<R, P> =
    // check for any
    [0] extends [1 & R] ? ResolvePred<P> :
      P extends SafeRefinement<infer SP, never> ? SP
      : P extends Predicate.Refinement<infer _R, infer RP>
      // try to narrow refinement
        ? [Extract<R, RP>] extends [infer X] ? [X] extends [never]
            // fallback to original refinement
            ? RP
          : X
        : never
      : P extends PredicateA<infer PP> ? PP
      : ExtractMatch<R, P>

  /**
   * Computes the remaining type when a pattern P is excluded from type R.
   *
   * **Details**
   *
   * This utility type determines what type remains after a `Match.not` pattern
   * excludes certain values. It's the complement of `WhenMatch`, calculating
   * what's left after removing the matched portion.
   *
   * **Example** (Computing unmatched types)
   *
   * ```ts import.meta.vitest
   * import type { Match } from "effect"
   *
   * // NotMatch computes what remains after exclusion
   * type NotString = Match.Types.NotMatch<
   *   string | number | boolean,
   *   typeof Match.string
   * >
   * // Result: number | boolean
   *
   * type NotSpecificValue = Match.Types.NotMatch<"a" | "b" | "c", "a">
   * // Result: "b" | "c"
   * ```
   *
   * @category utility types
   * @since 4.0.0
   */
  export type NotMatch<R, P> = Exclude<R, ExtractMatch<R, PForNotMatch<P>>>

  type PForNotMatch<P> = [ToInvertedRefinement<P>] extends [infer X] ? X
    : never

  /**
   * Resolves a pattern to its matched type for use in type computations.
   *
   * **Details**
   *
   * This utility type processes patterns (predicates, refinements, objects)
   * and resolves them to their corresponding matched types. It's used internally
   * to compute type transformations during pattern matching.
   *
   * **Example** (Resolving match patterns)
   *
   * ```ts import.meta.vitest
   * import type { Match } from "effect"
   *
   * // PForMatch resolves patterns to their matched types
   * type StringPattern = Match.Types.PForMatch<typeof Match.string>
   * // Result: string
   *
   * type ObjectPattern = Match.Types.PForMatch<{ name: string }>
   * // Result: { name: string }
   * ```
   *
   * @category utility types
   * @since 4.0.0
   */
  export type PForMatch<P> = [ResolvePred<P>] extends [infer X] ? X
    : never

  /**
   * Computes the excluded type when a pattern P is used for exclusion.
   *
   * **Details**
   *
   * This utility type determines what should be excluded from a union type
   * when a pattern is used in filtering operations. It transforms patterns
   * into their exclusion-safe representations.
   *
   * **Example** (Computing excluded patterns)
   *
   * ```ts import.meta.vitest
   * import type { Match } from "effect"
   *
   * // PForExclude computes what to exclude from type operations
   * type ExcludeString = Match.Types.PForExclude<typeof Match.string>
   * // Used internally to filter out string types
   *
   * type ExcludeObject = Match.Types.PForExclude<{ type: "admin" }>
   * // Used internally to filter out admin objects
   * ```
   *
   * @category utility types
   * @since 4.0.0
   */
  export type PForExclude<P> = [SafeRefinementR<ToSafeRefinement<P>>] extends [infer X] ? X
    : never

  // utilities
  type PredicateA<A> = Predicate.Predicate<A> | Predicate.Refinement<A, A>

  type SafeRefinementR<A> = A extends never ? never
    : A extends SafeRefinement<infer _, infer R> ? R
    : A extends Function ? A
    : A extends Record<string, any> ? { [K in keyof A]: SafeRefinementR<A[K]> }
    : A

  type ResolvePred<A, Input = any> = A extends never ? never
    : A extends SafeRefinement<infer _A, infer _R> ? _A
    : A extends Predicate.Refinement<Input, infer P> ? P
    : A extends Predicate.Predicate<infer P> ? P
    : A extends Record<string, any> ? { [K in keyof A]: ResolvePred<A[K]> }
    : A

  type ToSafeRefinement<A> = A extends never ? never
    : A extends Predicate.Refinement<any, infer P> ? SafeRefinement<P, P>
    : A extends Predicate.Predicate<infer P> ? SafeRefinement<P, never>
    : A extends SafeRefinement<any> ? A
    : A extends Record<string, any> ? { [K in keyof A]: ToSafeRefinement<A[K]> }
    : NonLiteralsTo<A, never>

  type ToInvertedRefinement<A> = A extends never ? never
    : A extends Predicate.Refinement<any, infer P> ? SafeRefinement<P>
    : A extends Predicate.Predicate<infer _P> ? SafeRefinement<never>
    : A extends SafeRefinement<infer _A, infer _R> ? SafeRefinement<_R>
    : A extends Record<string, any> ? { [K in keyof A]: ToInvertedRefinement<A[K]> }
    : NonLiteralsTo<A, never>

  type NonLiteralsTo<A, T> = [A] extends [string | number | boolean | bigint] ? [string] extends [A] ? T
    : [number] extends [A] ? T
    : [boolean] extends [A] ? T
    : [bigint] extends [A] ? T
    : A
    : A

  /**
   * Defines the structure for complex object and array patterns.
   *
   * **Details**
   *
   * This type represents patterns that can match against complex data structures
   * like objects and arrays. It supports nested pattern matching and partial
   * object matching, enabling sophisticated pattern compositions.
   *
   * **Example** (Describing complex object patterns)
   *
   * ```ts import.meta.vitest
   * import { Match } from "effect"
   *
   * // PatternBase enables complex object patterns
   * type UserPattern = Match.Types.PatternBase<{
   *   name: string
   *   age: number
   *   role: "admin" | "user"
   * }>
   * // Allows: { name?: string | Predicate, age?: number | Predicate, ... }
   *
   * // Example usage:
   * const result = Match.value({ name: "Alice", age: 30, role: "admin" as const }).pipe(
   *   Match.when(
   *     { age: (n: number) => n >= 18, role: "admin" },
   *     (user: { name: string; age: number; role: "admin" }) =>
   *       `Admin: ${user.name}`
   *   ),
   *   Match.orElse(() => "Not an adult admin")
   * )
   * result // => "Admin: Alice"
   * ```
   *
   * @category utility types
   * @since 4.0.0
   */
  export type PatternBase<A> = A extends ReadonlyArray<infer _T> ? ReadonlyArray<any> | PatternPrimitive<A>
    : A extends Record<string, any> ? Partial<
        { [K in keyof A]: PatternPrimitive<A[K] & {}> | PatternBase<A[K] & {}> }
      >
    : never

  /**
   * Defines primitive patterns that can match simple values.
   *
   * **Details**
   *
   * This type represents the building blocks of pattern matching: predicates,
   * literal values, and safe refinements. These are the atomic patterns that
   * can be composed into more complex matching logic.
   *
   * @category utility types
   * @since 4.0.0
   */
  export type PatternPrimitive<A> = PredicateA<A> | A | SafeRefinement<any>

  /**
   * Represents a filter that excludes specific types from a union.
   *
   * **Details**
   *
   * `Without` is used internally to track which types should be excluded
   * from consideration during pattern matching. It helps implement the
   * type-level logic for `Match.not` and other exclusion operations.
   *
   * **Example** (Tracking excluded types)
   *
   * ```ts import.meta.vitest
   * import { Match } from "effect"
   *
   * // Without is used internally when you write:
   * const match = Match.type<string | number | boolean>().pipe(
   *   Match.not(Match.string, (value) => `not string: ${value}`),
   *   // At this point, type system uses Without<string> to track exclusion
   *   Match.orElse(() => "was a string")
   * )
   * match(42) // => "not string: 42"
   * ```
   *
   * @category utility types
   * @since 4.0.0
   */
  export interface Without<out X> {
    readonly _tag: "Without"
    readonly _X: X
  }

  /**
   * Represents a filter that includes only specific types from a union.
   *
   * **Details**
   *
   * `Only` is used internally to track which types should be exclusively
   * considered during pattern matching. It helps implement the type-level
   * logic for positive matches and type narrowing.
   *
   * **Example** (Tracking included types)
   *
   * ```ts import.meta.vitest
   * import { Match } from "effect"
   *
   * // Only is used internally when you write:
   * const match = Match.type<string | number | boolean>().pipe(
   *   Match.when(Match.string, (s) => `string: ${s}`),
   *   // At this point, type system uses Only<string> for the match
   *   Match.orElse((value) => `not string: ${value}`)
   * )
   * match("ok") // => "string: ok"
   * ```
   *
   * @category utility types
   * @since 4.0.0
   */
  export interface Only<out X> {
    readonly _tag: "Only"
    readonly _X: X
  }

  /**
   * Adds a type to the exclusion filter, expanding what should be filtered out.
   *
   * **Details**
   *
   * This utility type manages the accumulation of excluded types during
   * pattern matching. When multiple exclusions are applied, it combines
   * them into a single filter representation.
   *
   * **Example** (Accumulating excluded types)
   *
   * ```ts import.meta.vitest
   * import { Match } from "effect"
   *
   * // AddWithout is used when combining multiple exclusions:
   * const match = Match.type<string | number | boolean | null>().pipe(
   *   Match.not(Match.string, () => "not string"),
   *   Match.not(Match.number, () => "not number"),
   *   // Type system uses AddWithout to combine exclusions
   *   Match.orElse(() => "was string or number")
   * )
   * match(true) // => "not string"
   * ```
   *
   * @category utility types
   * @since 4.0.0
   */
  export type AddWithout<A, X> = [A] extends [Without<infer WX>] ? Without<X | WX>
    : [A] extends [Only<infer OX>] ? Only<Exclude<OX, X>>
    : never

  /**
   * Adds a type to the inclusion filter, refining what should be included.
   *
   * **Details**
   *
   * This utility type manages the refinement of included types during
   * pattern matching. It ensures that only the most specific type
   * constraints are maintained when multiple positive matches are applied.
   *
   * **Example** (Refining included types)
   *
   * ```ts import.meta.vitest
   * import { Match } from "effect"
   *
   * // AddOnly is used when refining positive matches:
   * const match = Match.type<{ type: "user" | "admin"; name: string }>().pipe(
   *   Match.when({ type: "admin" }, (admin) => admin.name),
   *   // Type system uses AddOnly to refine the constraint
   *   Match.orElse(() => "not admin")
   * )
   * match({ type: "admin", name: "Alice" }) // => "Alice"
   * ```
   *
   * @category utility types
   * @since 4.0.0
   */
  export type AddOnly<A, X> = [A] extends [Without<infer WX>] ? [X] extends [WX] ? never
    : Only<X>
    : [A] extends [Only<infer OX>] ? [X] extends [OX] ? Only<X>
      : never
    : never

  /**
   * Applies accumulated filters to an input type, producing the final narrowed type.
   *
   * **Details**
   *
   * This utility type takes the collected inclusion/exclusion filters and
   * applies them to the input type to compute the final narrowed result.
   * It's the culmination of the type-level filtering process.
   *
   * **Example** (Applying accumulated filters)
   *
   * ```ts import.meta.vitest
   * import type { Match } from "effect"
   *
   * // ApplyFilters computes the final narrowed type:
   * type Result = Match.Types.ApplyFilters<
   *   string | number | boolean,
   *   Match.Types.Only<string>
   * >
   * // Result: string
   *
   * type ExclusionResult = Match.Types.ApplyFilters<
   *   string | number | boolean,
   *   Match.Types.Without<string>
   * >
   * // Result: number | boolean
   * ```
   *
   * @category utility types
   * @since 4.0.0
   */
  export type ApplyFilters<I, A> = A extends Only<infer X> ? X
    : A extends Without<infer X> ? Exclude<I, X>
    : never

  /**
   * Extracts tag values from a discriminated union based on a discriminant field.
   *
   * **Details**
   *
   * This utility type extracts the possible values of a discriminant field
   * from a union type. It's used internally to implement tag-based pattern
   * matching for discriminated unions.
   *
   * **Example** (Extracting discriminator tags)
   *
   * ```ts import.meta.vitest
   * import type { Match } from "effect"
   *
   * type Events =
   *   | { _tag: "click"; x: number; y: number }
   *   | { _tag: "keypress"; key: string }
   *   | { _tag: "scroll"; delta: number }
   *
   * type EventTags = Match.Types.Tags<"_tag", Events>
   * // Result: "click" | "keypress" | "scroll"
   *
   * type CustomTags = Match.Types.Tags<
   *   "type",
   *   | { type: "user"; name: string }
   *   | { type: "admin"; permissions: Array<string> }
   * >
   * // Result: "user" | "admin"
   * ```
   *
   * @category utility types
   * @since 4.0.0
   */
  export type Tags<D extends string, P> = P extends Record<D, infer X> ? X : never

  /**
   * Converts an array type to an intersection of its element types.
   *
   * **Details**
   *
   * This utility type takes an array of types and converts them into a single
   * intersection type. It's used internally when multiple patterns need to
   * be satisfied simultaneously (like in `Match.whenAnd`).
   *
   * **Example** (Converting arrays to intersections)
   *
   * ```ts import.meta.vitest
   * import type { Match } from "effect"
   *
   * type Combined = Match.Types.ArrayToIntersection<[
   *   { name: string },
   *   { age: number },
   *   { active: boolean }
   * ]>
   * // Result: { name: string } & { age: number } & { active: boolean }
   * //         = { name: string; age: number; active: boolean }
   *
   * // This type utility enables complex type intersections
   * // Complex type operations are handled by this utility type
   * // for advanced pattern matching scenarios
   * ```
   *
   * @category utility types
   * @since 4.0.0
   */
  export type ArrayToIntersection<A extends ReadonlyArray<any>> = T.UnionToIntersection<
    A[number]
  >

  /**
   * Extracts and narrows the matched type from an input type given a pattern.
   *
   * **Details**
   *
   * This is the core type utility that performs the actual type extraction
   * and narrowing logic. It handles the complex type-level computation that
   * determines what type results from applying a pattern to an input type.
   *
   * **Example** (Extracting matched types)
   *
   * ```ts import.meta.vitest
   * import { Match } from "effect"
   *
   * type StringExtract = Match.Types.ExtractMatch<
   *   string | number | boolean,
   *   typeof Match.string
   * >
   * // Result: string
   *
   * type ObjectExtract = Match.Types.ExtractMatch<
   *   { type: "user"; name: string } | { type: "admin"; role: string },
   *   { type: "user" }
   * >
   * // Result: { type: "user"; name: string }
   *
   * // This powers the type narrowing in:
   * Match.when(Match.string, (s) => s.toUpperCase())
   * //                      ^^^ s is correctly typed as string
   * ```
   *
   * @category utility types
   * @since 4.0.0
   */
  export type ExtractMatch<I, P> = [ExtractAndNarrow<I, P>] extends [infer EI] ? EI
    : never

  type Replace<A, B> = A extends Function ? A
    : A extends Record<string | number, any> ? { [K in keyof A]: K extends keyof B ? Replace<A[K], B[K]> : A[K] }
    : [B] extends [A] ? B
    : A

  type MaybeReplace<I, P> = [P] extends [I] ? P
    : [I] extends [P] ? Replace<I, P>
    : Fail

  type BuiltInObjects =
    | Function
    | Date
    | RegExp
    | Generator
    | { readonly [Symbol.toStringTag]: string }

  type IsPlainObject<T> = T extends BuiltInObjects ? false
    : T extends Record<string, any> ? true
    : false

  type Simplify<A> = { [K in keyof A]: A[K] } & {}

  type ExtractAndNarrow<Input, P> = P extends Predicate.Refinement<infer _In, infer _Out> ?
    _Out extends Input ? Extract<_Out, Input>
    : Extract<Input, _Out> :
    P extends SafeRefinement<infer _In, infer _R> ? [0] extends [1 & _R] ? Input
      : _In extends Input ? Extract<_In, Input>
      : Extract<Input, _In>
    : P extends Predicate.Predicate<infer _In> ? Extract<Input, _In>
    : Input extends infer I ? Exclude<
        I extends ReadonlyArray<any> ? P extends ReadonlyArray<any> ? {
              readonly [K in keyof I]: K extends keyof P ? ExtractAndNarrow<I[K], P[K]>
                : I[K]
            } extends infer R ? Fail extends R[keyof R] ? never
              : R
            : never
          : never
          : IsPlainObject<I> extends true ? string extends keyof I ? I extends P ? I
              : never
            : symbol extends keyof I ? I extends P ? I
              : never
            : Simplify<
              & { [RK in Extract<keyof I, keyof P>]-?: ExtractAndNarrow<I[RK], P[RK]> }
              & Omit<I, keyof P>
            > extends infer R ? keyof P extends NonFailKeys<R> ? R
              : never
            : never
          : MaybeReplace<I, P> extends infer R ? [I] extends [R] ? I
            : R
          : never,
        Fail
      > :
    never

  type NonFailKeys<A> = keyof A & {} extends infer K ? K extends keyof A ? A[K] extends Fail ? never : K
    : never :
    never
}
