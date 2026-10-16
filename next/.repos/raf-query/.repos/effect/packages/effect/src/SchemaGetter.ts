/**
 * Builds one-way conversions used by schemas.
 *
 * A `Getter<T, E, R>` receives an optional encoded value and returns an
 * optional decoded value. It can also report a schema issue or require Effect
 * services. Schema transformations use getters to describe one direction of a
 * conversion, for example decoding a field from input data. This module
 * includes basic getters, validation helpers, pure and effectful conversions,
 * and ready-made conversions for common string, number, binary, date, form, and
 * URL-related values.
 *
 * @since 4.0.0
 */
import * as Arr from "./Array.ts"
import * as DateTime from "./DateTime.ts"
import * as Effect from "./Effect.ts"
import * as Base64 from "./encoding/Base64.ts"
import * as Base64Url from "./encoding/Base64Url.ts"
import * as Hex from "./encoding/Hex.ts"
import { dual } from "./Function.ts"
import * as InternalRecord from "./internal/record.ts"
import * as Option from "./Option.ts"
import * as Pipeable from "./Pipeable.ts"
import * as Predicate from "./Predicate.ts"
import * as Result from "./Result.ts"
import type * as Schema from "./Schema.ts"
import type * as SchemaAST from "./SchemaAST.ts"
import * as SchemaIssue from "./SchemaIssue.ts"
import * as Str from "./String.ts"

/**
 * A transformation that returns its input unchanged.
 *
 * @category models
 * @since 4.0.0
 */
export interface Passthrough extends Pipeable.Pipeable {
  readonly _tag: "Passthrough"
}

/**
 * A synchronous transformation of present values.
 *
 * @category models
 * @since 4.0.0
 */
export interface Transform<out T, in E> extends Pipeable.Pipeable {
  readonly _tag: "Transform"
  readonly transform: (input: E) => T
}

/**
 * A synchronous transformation of optional values.
 *
 * @category models
 * @since 4.0.0
 */
export interface TransformOptional<out T, in E> extends Pipeable.Pipeable {
  readonly _tag: "TransformOptional"
  readonly transform: (input: Option.Option<E>) => Option.Option<T>
}

/**
 * An effectful transformation of present values.
 *
 * @category models
 * @since 4.0.0
 */
export interface TransformEffect<out T, in E, R> extends Pipeable.Pipeable {
  readonly _tag: "TransformEffect"
  readonly transform: (
    input: E,
    options: SchemaAST.ParseOptions
  ) => Effect.Effect<T, SchemaIssue.Issue, R>
}

/**
 * An effectful transformation of optional values.
 *
 * @category models
 * @since 4.0.0
 */
export interface TransformOptionalEffect<out T, in E, R> extends Pipeable.Pipeable {
  readonly _tag: "TransformOptionalEffect"
  readonly transform: (
    input: Option.Option<E>,
    options: SchemaAST.ParseOptions
  ) => Effect.Effect<Option.Option<T>, SchemaIssue.Issue, R>
}

/**
 * Represents a composable transformation from an encoded type `E` to a decoded type `T`.
 *
 * **When to use**
 *
 * Use when you need a schema getter to build and compose custom transformations
 * for `Schema.decodeTo` or `Schema.decode`.
 *
 * **Details**
 *
 * A getter receives an `Option<E>` and produces an `Option<T>`. `Option.none()`
 * represents a missing struct field and can also omit a field from the output.
 * A getter may fail with a schema issue or require services through `R`. The
 * tagged representation distinguishes synchronous transformations from
 * transformations that return an `Effect`, allowing schema parsers to select
 * the corresponding execution path when they are built. Getter values expose
 * `pipe`; use the standalone {@link map}, {@link compose}, and {@link run}
 * functions to operate on them.
 *
 * **Example** (Creating and composing getters)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const parseNumber = SchemaGetter.transform<number, string>((s) => Number(s))
 * const double = SchemaGetter.transform<number, number>((n) => n * 2)
 * const composed = SchemaGetter.compose(parseNumber, double)
 * Effect.runSync(SchemaGetter.run(composed, Option.some("21"), {})) // => Option.some(42)
 * ```
 *
 * @see {@link passthrough} for the identity getter
 * @see {@link transform} to create a getter from a pure function
 * @see {@link transformEffect} for effectful transformation
 *
 * @category models
 * @since 4.0.0
 */
export type Getter<T, E, R = never> =
  | Passthrough
  | Transform<T, E>
  | TransformOptional<T, E>
  | TransformEffect<T, E, R>
  | TransformOptionalEffect<T, E, R>

const runGetter = <T, E, R>(
  self: Getter<T, E, R>,
  input: Option.Option<E>,
  options: SchemaAST.ParseOptions
): Effect.Effect<Option.Option<T>, SchemaIssue.Issue, R> => {
  switch (self._tag) {
    case "Passthrough":
      return Effect.succeed(input as unknown as Option.Option<T>)
    case "Transform":
      return Effect.succeed(Option.map(input, self.transform))
    case "TransformOptional":
      return Effect.succeed(self.transform(input))
    case "TransformEffect":
      return Option.isNone(input)
        ? Effect.succeedNone
        : Effect.mapEager(self.transform(input.value, options), Option.some)
    case "TransformOptionalEffect":
      return self.transform(input, options)
  }
}

/**
 * Runs a getter directly.
 *
 * **Details**
 *
 * This is a convenience API for executing a getter outside a schema. When the
 * getter belongs to a schema, use the corresponding `SchemaParser` API. The
 * result is an `Effect` for every getter variant, including synchronous ones.
 *
 * **Example** (Running a getter)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const getter = SchemaGetter.transform<number, string>(Number)
 *
 * const result = Effect.runSync(
 *   SchemaGetter.run(getter, Option.some("42"), {})
 * )
 * result // => Option.some(42)
 * ```
 *
 * @category converting
 * @since 4.0.0
 */
export const run: {
  <E>(
    input: Option.Option<E>,
    options: SchemaAST.ParseOptions
  ): <T, R>(self: Getter<T, E, R>) => Effect.Effect<Option.Option<T>, SchemaIssue.Issue, R>
  <T, E, R>(
    self: Getter<T, E, R>,
    input: Option.Option<E>,
    options: SchemaAST.ParseOptions
  ): Effect.Effect<Option.Option<T>, SchemaIssue.Issue, R>
} = dual(3, runGetter)

const makeGetter = <const A extends object>(fields: A): A & Pipeable.Pipeable =>
  Object.assign(Object.create(Pipeable.Prototype), fields)

const composeOptionalEffect = <T, E, R, T2, R2>(
  first: Getter<T, E, R>,
  second: Getter<T2, T, R2>
): Getter<T2, E, R | R2> =>
  transformOptionalEffect((input, options) =>
    Effect.flatMapEager(runGetter(first, input, options), (output) => runGetter(second, output, options))
  )

/**
 * Composes two getters by passing the output of the first to the second.
 *
 * **When to use**
 *
 * Use when a schema conversion requires multiple transformation steps.
 *
 * **Details**
 *
 * Composition forwards `Option.none()` to getters that handle optional values
 * and skips getters that operate only on present values. Composing with
 * {@link passthrough} returns the other getter unchanged. The function supports
 * both `compose(first, second)` and `first.pipe(compose(second))`.
 *
 * **Example** (Parsing and normalizing a number)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const getter = SchemaGetter.compose(
 *   SchemaGetter.transform<number, string>(Number),
 *   SchemaGetter.transform((n) => Math.max(0, n))
 * )
 *
 * Effect.runSync(SchemaGetter.run(getter, Option.some("-1"), {})) // => Option.some(0)
 * ```
 *
 * @category combining
 * @since 4.0.0
 */
export const compose: {
  <T, T2, R2>(other: Getter<T2, T, R2>): <E, R>(self: Getter<T, E, R>) => Getter<T2, E, R | R2>
  <T, E, R, T2, R2>(self: Getter<T, E, R>, other: Getter<T2, T, R2>): Getter<T2, E, R | R2>
} = dual(2, <T, E, R, T2, R2>(
  self: Getter<T, E, R>,
  other: Getter<T2, T, R2>
): Getter<T2, E, R | R2> => {
  if (self._tag === "Passthrough") return other as Getter<T2, E, R | R2>
  if (other._tag === "Passthrough") return self as unknown as Getter<T2, E, R | R2>
  switch (self._tag) {
    case "Transform": {
      switch (other._tag) {
        case "Transform":
          return transform((input: E) => other.transform(self.transform(input)))
        case "TransformOptional":
          return transformOptional((input) => other.transform(Option.map(input, self.transform)))
        case "TransformEffect":
          return transformEffect((input: E, options) => other.transform(self.transform(input), options))
        case "TransformOptionalEffect":
          return composeOptionalEffect(self, other)
      }
    }
    case "TransformOptional": {
      switch (other._tag) {
        case "Transform":
          return transformOptional((input) => Option.map(self.transform(input), other.transform))
        case "TransformOptional":
          return transformOptional((input) => other.transform(self.transform(input)))
        case "TransformEffect":
        case "TransformOptionalEffect":
          return composeOptionalEffect(self, other)
      }
    }
    case "TransformEffect": {
      switch (other._tag) {
        case "Transform":
          return transformEffect((input: E, options) =>
            Effect.mapEager(self.transform(input, options), other.transform)
          )
        case "TransformOptional":
        case "TransformOptionalEffect":
          return composeOptionalEffect(self, other)
        case "TransformEffect":
          return transformEffect((input: E, options) =>
            Effect.flatMapEager(self.transform(input, options), (output) => other.transform(output, options))
          )
      }
    }
    case "TransformOptionalEffect":
      return composeOptionalEffect(self, other)
  }
})

/**
 * Maps the output of a getter while preserving missing values.
 *
 * **When to use**
 *
 * Use to add a synchronous transformation after an existing getter.
 *
 * **Details**
 *
 * The mapping function runs only for `Option.some`. The function supports both
 * `map(self, f)` and `self.pipe(map(f))`.
 *
 * **Example** (Mapping a getter result)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const getter = SchemaGetter.transform<number, string>(Number).pipe(
 *   SchemaGetter.map((n) => n * 2)
 * )
 *
 * Effect.runSync(SchemaGetter.run(getter, Option.some("21"), {})) // => Option.some(42)
 * ```
 *
 * @category mapping
 * @since 4.0.0
 */
export const map: {
  <T, T2>(f: (value: T) => T2): <E, R>(self: Getter<T, E, R>) => Getter<T2, E, R>
  <T, E, R, T2>(self: Getter<T, E, R>, f: (value: T) => T2): Getter<T2, E, R>
} = dual(2, <T, E, R, T2>(self: Getter<T, E, R>, f: (value: T) => T2): Getter<T2, E, R> => compose(self, transform(f)))

/**
 * Creates a getter that always produces the given constant value, ignoring the input.
 *
 * **When to use**
 *
 * Use when you need a schema getter that always decodes a field to a fixed
 * value.
 *
 * **Details**
 *
 * The getter is pure and always returns `Option.some(t)` regardless of whether
 * the input is `Some` or `None`.
 *
 * **Example** (Returning a constant getter)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const alwaysZero = SchemaGetter.succeed(0)
 * Effect.runSync(SchemaGetter.run(alwaysZero, Option.none(), {})) // => Option.some(0)
 * ```
 *
 * @see {@link transform} when you need to use the input value
 * @see {@link passthrough} when you want to keep the input as-is
 *
 * @category constructors
 * @since 4.0.0
 */
export function succeed<const T, E>(t: T): Getter<T, E> {
  return transformOptional(() => Option.some(t))
}

/**
 * Creates a getter that always fails with the given issue.
 *
 * **When to use**
 *
 * Use when you need a schema getter that unconditionally rejects input.
 * - Building custom validation getters that produce specific error types.
 *
 * **Details**
 *
 * - Always fails with the `Issue` returned by `f`.
 * - The failure function receives the original `Option<E>` input and the
 *   effective `ParseOptions` for error context.
 *
 * **Example** (Defining an always-failing getter)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter, SchemaIssue } from "effect"
 *
 * const rejectAll = SchemaGetter.fail<string, string>(
 *   () => new SchemaIssue.InvalidValue({ message: "not allowed" })
 * )
 * const issue = await Effect.runPromise(
 *   Effect.flip(SchemaGetter.run(rejectAll, Option.some("x"), {}))
 * )
 * issue._tag // => "InvalidValue"
 * ```
 *
 * @see {@link forbidden} for a convenience helper for `Forbidden` issues
 * @see {@link checkEffect} to fail conditionally based on input value
 *
 * @category constructors
 * @since 4.0.0
 */
export function fail<T, E>(
  f: (oe: Option.Option<E>, options: SchemaAST.ParseOptions) => SchemaIssue.Issue
): Getter<T, E> {
  return transformOptionalEffect((oe, options) => Effect.fail(f(oe, options)))
}

/**
 * Creates a getter that always fails with a `Forbidden` issue.
 *
 * **When to use**
 *
 * Use when you need a schema getter to disallow a field or direction
 * (encode/decode) entirely.
 * - You want a clear "forbidden" error message in schema validation output.
 *
 * **Details**
 *
 * - Always fails with `SchemaIssue.Forbidden`.
 * - The message function receives the `Option<E>` input for context.
 *
 * **Example** (Forbidding a decode direction)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const noEncode = SchemaGetter.forbidden<string, number>(
 *   () => "encoding is not supported"
 * )
 * const issue = await Effect.runPromise(
 *   Effect.flip(SchemaGetter.run(noEncode, Option.some(1), {}))
 * )
 * issue._tag // => "Forbidden"
 * ```
 *
 * @see {@link fail} to fail with a custom issue type
 *
 * @category constructors
 * @since 4.0.0
 */
export function forbidden<T, E>(message: (oe: Option.Option<E>) => string): Getter<T, E> {
  return fail<T, E>((oe, options) => {
    const annotations = { message: message(oe) }
    return Option.isSome(oe)
      ? new SchemaIssue.Forbidden(annotations, oe.value, options)
      : new SchemaIssue.Forbidden(annotations)
  })
}

/**
 * Getter that always fails with a `Forbidden` issue indicating that encoding is unsupported.
 *
 * **When to use**
 *
 * Use as the encode side of a decode-only Schema transformation.
 *
 * **Details**
 *
 * Its `Getter<never, unknown>` type is assignable to every encoding getter because it accepts any input and never
 * produces an output value.
 *
 * **Example** (Rejecting encoding)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const issue = await Effect.runPromise(
 *   Effect.flip(SchemaGetter.run(SchemaGetter.forbiddenEncoding, Option.some("value"), {}))
 * )
 * issue._tag // => "Forbidden"
 * ```
 *
 * @see {@link forbidden} for a forbidden getter with a custom message
 *
 * @category constructors
 * @since 4.0.0
 */
export const forbiddenEncoding: Getter<never, unknown> = forbidden(() => "Encoding is not supported")

const passthrough_: Passthrough = makeGetter({ _tag: "Passthrough" })

/**
 * Returns the identity getter — passes the value through unchanged.
 *
 * **When to use**
 *
 * Use when you need a schema getter for one side of a `decodeTo` pair, either
 * encode or decode, to pass values through unchanged.
 *
 * **Details**
 *
 * - Pure, no allocation (singleton instance).
 * - Optimized away by {@link compose} — composing with a passthrough is free.
 * - The default overload requires `T === E`. Pass `{ strict: false }` to opt
 *   out of the type constraint.
 *
 * **Example** (Passing through identity transformations)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaGetter } from "effect"
 *
 * // No transformation needed — types already match
 * const StringToString = Schema.String.pipe(
 *   Schema.decodeTo(Schema.String, {
 *     decode: SchemaGetter.passthrough(),
 *     encode: SchemaGetter.passthrough()
 *   })
 * )
 * Schema.decodeSync(StringToString)("hello") // => "hello"
 * ```
 *
 * @see {@link passthroughSupertype} when `T extends E`
 * @see {@link passthroughSubtype} when `E extends T`
 * @see {@link transform} when you need to change the value
 *
 * @category constructors
 * @since 4.0.0
 */
export function passthrough<T, E>(options: { readonly strict: false }): Getter<T, E>
export function passthrough<T>(): Getter<T, T>
export function passthrough<T>(): Getter<T, T> {
  return passthrough_
}

/**
 * Returns the identity getter typed for the relationship `T extends E`.
 *
 * **When to use**
 *
 * Use when you need a schema getter that passes values through when the
 * decoded/output type is narrower than the encoded/input type.
 *
 * **Details**
 *
 * - Same singleton as {@link passthrough} — no allocation, optimized in composition.
 *
 * **Example** (Passing through supertypes)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * // string extends string, so this is valid
 * const g = SchemaGetter.passthroughSupertype<string, string>()
 * Effect.runSync(SchemaGetter.run(g, Option.some("hello"), {})) // => Option.some("hello")
 * ```
 *
 * @see {@link passthrough} when types are identical
 * @see {@link passthroughSubtype} when `E extends T`
 *
 * @category constructors
 * @since 4.0.0
 */
export function passthroughSupertype<T extends E, E>(): Getter<T, E>
export function passthroughSupertype<T>(): Getter<T, T> {
  return passthrough_
}

/**
 * Returns the identity getter, typed for when the encoded type `E` is a subtype of `T`.
 *
 * **When to use**
 *
 * Use when you need a schema getter that passes values through without
 * `{ strict: false }` for an encoded type that narrows the decoded type.
 *
 * **Details**
 *
 * - Same singleton as {@link passthrough} — no allocation, optimized in composition.
 *
 * **Example** (Passing through subtypes)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * // "hello" extends string, so E extends T
 * const g = SchemaGetter.passthroughSubtype<string, "hello">()
 * Effect.runSync(SchemaGetter.run(g, Option.some("hello"), {})) // => Option.some("hello")
 * ```
 *
 * @see {@link passthrough} when types are identical
 * @see {@link passthroughSupertype} when `T extends E`
 *
 * @category constructors
 * @since 4.0.0
 */
export function passthroughSubtype<T, E extends T>(): Getter<T, E>
export function passthroughSubtype<T>(): Getter<T, T> {
  return passthrough_
}

/**
 * Creates a getter that fails with `MissingKey` if the input is absent (`Option.None`).
 *
 * **When to use**
 *
 * Use when you need a schema getter to require a struct field in the encoded
 * input and report a missing key error when it is absent.
 *
 * **Details**
 *
 * - When input is `None`, fails with `SchemaIssue.MissingKey`.
 * - When input is `Some`, passes it through unchanged.
 * - Optional `annotations` customize the error message for the missing key.
 *
 * **Example** (Defining a required struct field)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const mustExist = SchemaGetter.required<string>()
 * const issue = await Effect.runPromise(
 *   Effect.flip(SchemaGetter.run(mustExist, Option.none(), {}))
 * )
 * issue._tag // => "MissingKey"
 * ```
 *
 * @see {@link withDefault} to substitute a default for undefined values
 *
 * @category validation
 * @since 4.0.0
 */
export function required<T, E extends T = T>(annotations?: Schema.Annotations.Key<T>): Getter<T, E> {
  return transformOptionalEffect((input) =>
    Option.isNone(input) ? Effect.fail(new SchemaIssue.MissingKey(annotations)) : Effect.succeed(input)
  )
}

/**
 * Creates a getter that validates a value using an effectful check function.
 *
 * **When to use**
 *
 * Use when you need a schema getter to validate a decoded value (e.g. check a
 * constraint or call an external service).
 * - The validation may be asynchronous or require Effect services.
 *
 * **Details**
 *
 * - Only runs when input is `Some` — `None` passes through.
 * - The check function returns a validation result:
 *   - `undefined` or `true` — value is valid, passes through.
 *   - `false` or a `string` — value is invalid, fails with an `Issue`.
 *   - An `Issue` object — fails with that issue directly.
 *   - `{ path, issue }` — fails with a nested path issue (`issue` may be a
 *     message string or a full {@link SchemaIssue.Issue}).
 * - Does not transform the value — input and output types are the same.
 *
 * **Example** (Validating effectfully)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const nonNegative = SchemaGetter.checkEffect<number>((n) =>
 *   Effect.succeed(n >= 0 ? undefined : "must be non-negative")
 * )
 * await Effect.runPromise(SchemaGetter.run(nonNegative, Option.some(1), {})) // => Option.some(1)
 * ```
 *
 * @see {@link transform} when you need to change the value, not just validate
 * @see {@link fail} for unconditional failure
 *
 * @category validation
 * @since 4.0.0
 */
export function checkEffect<T, R = never>(
  f: (input: T, options: SchemaAST.ParseOptions) => Effect.Effect<
    undefined | boolean | Schema.FilterIssue,
    never,
    R
  >
): Getter<T, T, R> {
  return transformEffect((t, options) => {
    return f(t, options).pipe(Effect.flatMapEager((out) => {
      const issue = SchemaIssue.makeSingle(out, t, options)
      return issue ?
        Effect.fail(issue) :
        Effect.succeed(t)
    }))
  })
}

/**
 * Creates a getter that applies a pure function to present values.
 *
 * **When to use**
 *
 * Use when you need a schema getter for a pure, infallible transformation
 * between types.
 * - Building encode/decode pairs for `Schema.decodeTo`.
 *
 * **Details**
 *
 * - This is the most commonly used constructor.
 * - Transforms `Some(e)` to `Some(f(e))` and leaves `None` unchanged.
 * - Skips `None` inputs — only called when a value is present.
 * - Never fails.
 *
 * **Example** (Transforming strings to numbers)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaGetter } from "effect"
 *
 * const NumberFromString = Schema.String.pipe(
 *   Schema.decodeTo(Schema.Number, {
 *     decode: SchemaGetter.transform((s) => Number(s)),
 *     encode: SchemaGetter.transform((n) => String(n))
 *   })
 * )
 * Schema.decodeSync(NumberFromString)("42") // => 42
 * ```
 *
 * @see {@link transformEffect} when the transformation returns an `Effect`
 * @see {@link transformOptional} when you need to handle `None` inputs
 * @see {@link passthrough} when no transformation is needed
 *
 * @category transforming
 * @since 4.0.0
 */
export function transform<T, E>(f: (e: E) => T): Getter<T, E> {
  return makeGetter({ _tag: "Transform", transform: f })
}

/**
 * Creates a getter that applies an effectful transformation to present values.
 *
 * **When to use**
 *
 * Use when you need a schema getter for a transformation that may fail, require
 * Effect services, or run asynchronously.
 *
 * **Details**
 *
 * - Skips `None` inputs — only called when a value is present.
 * - On success, wraps the result in `Some`.
 * - On failure, propagates the `Issue`.
 *
 * **Example** (Parsing with failure)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter, SchemaIssue } from "effect"
 *
 * const safeParseInt = SchemaGetter.transformEffect<number, string>(
 *   (s, options) => {
 *     const n = parseInt(s, 10)
 *     return isNaN(n)
 *       ? Effect.fail(new SchemaIssue.InvalidValue({ message: "not an integer" }, s, options))
 *       : Effect.succeed(n)
 *   }
 * )
 * await Effect.runPromise(SchemaGetter.run(safeParseInt, Option.some("42"), {})) // => Option.some(42)
 * ```
 *
 * @see {@link transform} when transformation cannot fail
 * @see {@link transformOptionalEffect} when you need full `Option` control over the output
 *
 * @category transforming
 * @since 4.0.0
 */
export function transformEffect<T, E, R = never>(
  f: (e: E, options: SchemaAST.ParseOptions) => Effect.Effect<T, SchemaIssue.Issue, R>
): Getter<T, E, R> {
  return makeGetter({ _tag: "TransformEffect", transform: f })
}

/**
 * Creates a getter that transforms the full `Option` — both present and absent values.
 *
 * **When to use**
 *
 * Use when you need a schema getter to handle both `Some` and `None` cases.
 *
 * **Details**
 *
 * The getter is pure and never fails. It receives the full `Option<E>` and
 * must return `Option<T>`, so it can turn a present value into absent or an
 * absent value into present.
 *
 * **Example** (Filtering out empty strings)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const skipEmpty = SchemaGetter.transformOptional<string, string>((o) =>
 *   Option.filter(o, (s) => s.length > 0)
 * )
 * Effect.runSync(SchemaGetter.run(skipEmpty, Option.some(""), {})) // => Option.none()
 * ```
 *
 * @see {@link transform} when you only need to transform present values
 * @see {@link omit} when you always want `None`
 *
 * @category transforming
 * @since 4.0.0
 */
export function transformOptional<T, E>(f: (oe: Option.Option<E>) => Option.Option<T>): Getter<T, E> {
  return makeGetter({ _tag: "TransformOptional", transform: f })
}

/**
 * Creates a getter that effectfully transforms the full `Option`.
 *
 * @category transforming
 * @since 4.0.0
 */
export function transformOptionalEffect<T, E, R = never>(
  f: (
    input: Option.Option<E>,
    options: SchemaAST.ParseOptions
  ) => Effect.Effect<Option.Option<T>, SchemaIssue.Issue, R>
): Getter<T, E, R> {
  return makeGetter({ _tag: "TransformOptionalEffect", transform: f })
}

/**
 * Creates a getter that always returns `None`, effectively omitting the value from output.
 *
 * **When to use**
 *
 * Use when you need a schema getter to exclude a field during decoding or
 * encoding.
 *
 * **Details**
 *
 * - Always returns `Option.None` regardless of input.
 * - Never fails.
 *
 * **Example** (Omitting a field during encoding)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const omitField = SchemaGetter.omit<string>()
 * Effect.runSync(SchemaGetter.run(omitField, Option.some("hidden"), {})) // => Option.none()
 * ```
 *
 * @see {@link transformOptional} when you want conditional omission
 * @see {@link forbidden} when you want to fail instead of silently omit
 *
 * @category filtering
 * @since 4.0.0
 */
export function omit<T>(): Getter<never, T> {
  return transformOptional(() => Option.none())
}

/**
 * Creates a getter that replaces `undefined` values with a default.
 *
 * **When to use**
 *
 * Use when you need a schema getter to provide a fallback for a field that may
 * be `undefined` in the encoded input.
 *
 * **Details**
 *
 * - If the input is `Some(undefined)` or `None`, produces `Some(T)`.
 * - If the input is `Some(value)` where value is not `undefined`, passes it through.
 * - `defaultValue` is an `Effect` that will be executed each time a default is needed.
 *
 * **Example** (Providing a default value for an optional field)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const withZero = SchemaGetter.withDefault(Effect.succeed(0))
 * await Effect.runPromise(SchemaGetter.run(withZero, Option.some(undefined), {})) // => Option.some(0)
 * ```
 *
 * @see {@link transformOptionalEffect} for custom effectful missing-key handling
 * @see {@link required} when absent input should fail instead of using a default
 *
 * @category transforming
 * @since 4.0.0
 */
export function withDefault<T, R = never>(
  defaultValue: Effect.Effect<T, SchemaIssue.Issue, R>
): Getter<T, T | undefined, R> {
  return transformOptionalEffect((o) => {
    const filtered = Option.filter(o, Predicate.isNotUndefined)
    return Option.isSome(filtered) ? Effect.succeed(filtered) : Effect.mapEager(defaultValue, Option.some)
  })
}

/**
 * Coerces any value to a `string` using the global `String()` constructor.
 *
 * **When to use**
 *
 * Use when you need a schema getter to coerce a present encoded value to a
 * string with `String()`.
 *
 * **Details**
 *
 * The getter is pure, never fails, and delegates to `globalThis.String`.
 *
 * **Example** (Coercing to a string)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const toString = SchemaGetter.String<number>()
 * Effect.runSync(SchemaGetter.run(toString, Option.some(42), {})) // => Option.some("42")
 * ```
 *
 * @see {@link transform} for custom string conversions
 *
 * @category converting
 * @since 4.0.0
 */
export function String<E>(): Getter<string, E> {
  return transform(globalThis.String)
}

/**
 * Coerces any value to a `number` using the global `Number()` constructor.
 *
 * **When to use**
 *
 * Use when you need a schema getter to coerce a present encoded value to a
 * number with `Number()`.
 *
 * **Details**
 *
 * The getter is pure, never fails, and delegates to `globalThis.Number`. It may
 * produce `NaN` for non-numeric inputs.
 *
 * **Example** (Coercing to a number)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const toNumber = SchemaGetter.Number<string>()
 * Effect.runSync(SchemaGetter.run(toNumber, Option.some("42"), {})) // => Option.some(42)
 * ```
 *
 * @see {@link transformEffect} for effectful or validated number parsing
 *
 * @category converting
 * @since 4.0.0
 */
export function Number<E>(): Getter<number, E> {
  return transform(globalThis.Number)
}

/**
 * Coerces any value to a `boolean` using the global `Boolean()` constructor.
 *
 * **When to use**
 *
 * Use when you need a schema getter to coerce a present encoded value to a
 * boolean with `Boolean()`.
 *
 * **Details**
 *
 * The getter is pure, never fails, and delegates to `globalThis.Boolean`.
 *
 * **Example** (Coercing to a boolean)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const toBool = SchemaGetter.Boolean<string>()
 * Effect.runSync(SchemaGetter.run(toBool, Option.some("true"), {})) // => Option.some(true)
 * ```
 *
 * @category converting
 * @since 4.0.0
 */
export function Boolean<E>(): Getter<boolean, E> {
  return transform(globalThis.Boolean)
}

/**
 * Coerces a value to `bigint` using the global `BigInt()` constructor.
 *
 * **When to use**
 *
 * Use when you need a schema getter to convert a present string, number, or
 * boolean value to `bigint`.
 *
 * **Details**
 *
 * - Delegates to `globalThis.BigInt`.
 * - Throws at runtime if the input cannot be converted (e.g. non-numeric string).
 *
 * **Example** (Coercing to a bigint)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const toBigInt = SchemaGetter.BigInt<string>()
 * Effect.runSync(SchemaGetter.run(toBigInt, Option.some("42"), {})) // => Option.some(42n)
 * ```
 *
 * @category converting
 * @since 4.0.0
 */
export function BigInt<E extends string | number | bigint | boolean>(): Getter<bigint, E> {
  return transform(globalThis.BigInt)
}

/**
 * Coerces a value to a `Date` using `new Date(input)`.
 *
 * **When to use**
 *
 * Use when you need a schema getter to coerce a present string, number, or
 * existing date object into a new date object.
 *
 * **Details**
 *
 * - Delegates to `new globalThis.Date(input)`.
 * - Does not validate the result — may produce an invalid Date.
 *
 * **Example** (Coercing to a Date)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const toDate = SchemaGetter.Date<string>()
 * const result = Effect.runSync(SchemaGetter.run(toDate, Option.some("1970-01-01"), {}))
 * Option.map(result, (date) => date.toISOString()) // => Option.some("1970-01-01T00:00:00.000Z")
 * ```
 *
 * @see {@link dateTimeUtcFromInput} for validated DateTime parsing
 *
 * @category converting
 * @since 4.0.0
 */
export function Date<E extends string | number | Date>(): Getter<Date, E> {
  return transform((u) => new globalThis.Date(u))
}

/**
 * Strips whitespace from both ends of a string.
 *
 * **Details**
 *
 * - Pure, delegates to `String.trim`.
 *
 * **Example** (Trimming whitespace)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const trimmed = SchemaGetter.trim<string>()
 * Effect.runSync(SchemaGetter.run(trimmed, Option.some("  hello  "), {})) // => Option.some("hello")
 * ```
 *
 * @category transforming
 * @since 4.0.0
 */
export function trim<E extends string>(): Getter<string, E> {
  return transform(Str.trim)
}

/**
 * Capitalizes the first character of a string.
 *
 * **Details**
 *
 * - Pure, delegates to `String.capitalize`.
 *
 * **Example** (Capitalizing a string)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const cap = SchemaGetter.capitalize<string>()
 * Effect.runSync(SchemaGetter.run(cap, Option.some("hello"), {})) // => Option.some("Hello")
 * ```
 *
 * @category transforming
 * @since 4.0.0
 */
export function capitalize<E extends string>(): Getter<string, E> {
  return transform(Str.capitalize)
}

/**
 * Uncapitalizes the first character of a string.
 *
 * **Details**
 *
 * - Pure, delegates to `String.uncapitalize`.
 *
 * **Example** (Uncapitalizing a string)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const uncap = SchemaGetter.uncapitalize<string>()
 * Effect.runSync(SchemaGetter.run(uncap, Option.some("Hello"), {})) // => Option.some("hello")
 * ```
 *
 * @category transforming
 * @since 4.0.0
 */
export function uncapitalize<E extends string>(): Getter<string, E> {
  return transform(Str.uncapitalize)
}

/**
 * Converts a `snake_case` string to `camelCase`.
 *
 * **Details**
 *
 * - Pure, delegates to `String.snakeToCamel`.
 *
 * **Example** (Converting snake case to camel case)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const toCamel = SchemaGetter.snakeToCamel<string>()
 * Effect.runSync(SchemaGetter.run(toCamel, Option.some("user_name"), {})) // => Option.some("userName")
 * ```
 *
 * @see {@link camelToSnake} for the inverse operation
 *
 * @category transforming
 * @since 4.0.0
 */
export function snakeToCamel<E extends string>(): Getter<string, E> {
  return transform(Str.snakeToCamel)
}

/**
 * Converts a `camelCase` string to `snake_case`.
 *
 * **Details**
 *
 * - Pure, delegates to `String.camelToSnake`.
 *
 * **Example** (Converting camel case to snake case)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const toSnake = SchemaGetter.camelToSnake<string>()
 * Effect.runSync(SchemaGetter.run(toSnake, Option.some("userName"), {})) // => Option.some("user_name")
 * ```
 *
 * @see {@link snakeToCamel} for the inverse operation
 *
 * @category transforming
 * @since 4.0.0
 */
export function camelToSnake<E extends string>(): Getter<string, E> {
  return transform(Str.camelToSnake)
}

/**
 * Converts a string to lowercase.
 *
 * **Details**
 *
 * - Pure, delegates to `String.toLowerCase`.
 *
 * **Example** (Converting to lowercase)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const lower = SchemaGetter.toLowerCase<string>()
 * Effect.runSync(SchemaGetter.run(lower, Option.some("HELLO"), {})) // => Option.some("hello")
 * ```
 *
 * @see {@link toUpperCase} for the inverse operation
 *
 * @category transforming
 * @since 4.0.0
 */
export function toLowerCase<E extends string>(): Getter<string, E> {
  return transform(Str.toLowerCase)
}

/**
 * Converts a string to uppercase.
 *
 * **Details**
 *
 * - Pure, delegates to `String.toUpperCase`.
 *
 * **Example** (Converting to uppercase)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const upper = SchemaGetter.toUpperCase<string>()
 * Effect.runSync(SchemaGetter.run(upper, Option.some("hello"), {})) // => Option.some("HELLO")
 * ```
 *
 * @see {@link toLowerCase} for the inverse operation
 *
 * @category transforming
 * @since 4.0.0
 */
export function toUpperCase<E extends string>(): Getter<string, E> {
  return transform(Str.toUpperCase)
}

type ParseJsonOptions = {
  readonly reviver?: Parameters<typeof JSON.parse>[1]
}

/**
 * Parses a JSON string into a value.
 *
 * **When to use**
 *
 * Use when you need a schema getter to parse a present encoded JSON string
 * during decoding.
 *
 * **Details**
 *
 * - Skips `None` inputs.
 * - Without `reviver`: returns `Schema.MutableJson` (typed JSON).
 * - With `reviver`: returns `unknown` (reviver may produce arbitrary values).
 * - On parse failure, fails with `SchemaIssue.InvalidValue` whose `expected`
 *   annotation is `"a valid JSON string"`. Its default message includes the
 *   reported input when `reportInput` is enabled.
 *
 * **Example** (Parsing JSON)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const parse = SchemaGetter.parseJson<string>()
 * const result = await Effect.runPromise(SchemaGetter.run(parse, Option.some("{\"a\":1}"), {}))
 * result // => Option.some({ a: 1 })
 * ```
 *
 * @see {@link stringifyJson} for the inverse operation
 *
 * @category decoding
 * @since 4.0.0
 */
export function parseJson<E extends string>(): Getter<Schema.MutableJson, E>
export function parseJson<E extends string>(options: ParseJsonOptions): Getter<unknown, E>
export function parseJson<E extends string>(options?: ParseJsonOptions | undefined): Getter<unknown, E> {
  return transformEffect((input, parseOptions) =>
    Effect.try({
      try: () => JSON.parse(input, options?.reviver),
      catch: () =>
        new SchemaIssue.InvalidValue(
          { expected: "a valid JSON string" },
          input,
          parseOptions
        )
    })
  )
}

/**
 * Replacer function or property allowlist accepted by `JSON.stringify`.
 *
 * @category utility types
 * @since 4.0.0
 */
export type JsonReplacer =
  | ((this: any, key: string, value: any) => any)
  | Array<string | number>
  | null

type StringifyJsonOptions = {
  readonly replacer?: JsonReplacer | undefined
  readonly space?: Parameters<typeof JSON.stringify>[2]
}

/**
 * Stringifies a present value using `JSON.stringify`.
 *
 * **When to use**
 *
 * Use when you need a schema getter to serialize a present decoded value to
 * JSON text during encoding.
 *
 * **Details**
 *
 * - Skips `None` inputs.
 * - If `JSON.stringify` throws or returns `undefined`, fails with
 *   `SchemaIssue.InvalidValue`.
 * - Supports optional `replacer` and `space` options, matching
 *   `JSON.stringify`.
 *
 * **Example** (Stringifying JSON)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const stringify = SchemaGetter.stringifyJson()
 * const result = await Effect.runPromise(SchemaGetter.run(stringify, Option.some({ a: 1 }), {}))
 * result // => Option.some("{\"a\":1}")
 * ```
 *
 * @see {@link parseJson} for the inverse operation
 *
 * @category encoding
 * @since 4.0.0
 */
export function stringifyJson(options?: StringifyJsonOptions): Getter<string, unknown> {
  return transformEffect((input, parseOptions) =>
    Effect.try({
      try: () => {
        const output = JSON.stringify(input, options?.replacer as any, options?.space)
        if (output === undefined) {
          throw new TypeError("Value cannot be represented as JSON")
        }
        return output
      },
      catch: () =>
        new SchemaIssue.InvalidValue(
          { expected: "a JSON-serializable value" },
          input,
          parseOptions
        )
    })
  )
}

/**
 * Parses a string into a record of key-value pairs.
 *
 * **When to use**
 *
 * Use when you need a schema getter to parse a present encoded string that
 * contains delimited key-value pairs (e.g. `"a=1,b=2"`).
 *
 * **Details**
 *
 * The getter is pure and never fails. It splits the string by `separator`
 * (default `,`) and then each pair by `keyValueSeparator` (default `=`). Pairs
 * missing a key or value are silently skipped.
 *
 * **Example** (Parsing a key-value string)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const parse = SchemaGetter.splitKeyValue<string>()
 * const result = Effect.runSync(SchemaGetter.run(parse, Option.some("a=1,b=2"), {}))
 * result // => Option.some({ a: "1", b: "2" })
 * ```
 *
 * @see {@link joinKeyValue} for the inverse operation
 * @see {@link split} to split into an array of strings
 *
 * @category splitting
 * @since 4.0.0
 */
export function splitKeyValue<E extends string>(options?: {
  readonly separator?: string | undefined
  readonly keyValueSeparator?: string | undefined
}): Getter<Record<string, string>, E> {
  const separator = options?.separator ?? ","
  const keyValueSeparator = options?.keyValueSeparator ?? "="
  return transform((input) =>
    input.split(separator).reduce((acc, pair) => {
      const [key, value] = pair.split(keyValueSeparator)
      if (key && value) {
        InternalRecord.assignProperty(acc, key, value)
      }
      return acc
    }, {} as Record<string, string>)
  )
}

/**
 * Joins a record of key-value pairs into a delimited string.
 *
 * **When to use**
 *
 * Use when you need a schema getter to serialize a present decoded record as a
 * delimited key-value string.
 *
 * **Details**
 *
 * The getter is pure and never fails. It joins entries with `separator`
 * (default `,`) and joins each key and value with `keyValueSeparator` (default
 * `=`).
 *
 * **Example** (Joining key-value records)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const join = SchemaGetter.joinKeyValue()
 * const result = Effect.runSync(SchemaGetter.run(join, Option.some({ a: "1", b: "2" }), {}))
 * result // => Option.some("a=1,b=2")
 * ```
 *
 * @see {@link splitKeyValue} for the inverse operation
 *
 * @category combining
 * @since 4.0.0
 */
export function joinKeyValue<E extends Record<PropertyKey, string>>(options?: {
  readonly separator?: string | undefined
  readonly keyValueSeparator?: string | undefined
}): Getter<string, E> {
  const separator = options?.separator ?? ","
  const keyValueSeparator = options?.keyValueSeparator ?? "="
  return transform((input) =>
    Object.entries(input).map(([key, value]) => `${key}${keyValueSeparator}${value}`).join(separator)
  )
}

/**
 * Splits a string into an array of strings by a separator.
 *
 * **When to use**
 *
 * Use when you need a schema getter to split a present encoded string
 * containing a delimited list, such as CSV values.
 *
 * **Details**
 *
 * The getter is pure and never fails. It splits by `separator` (default `,`).
 * An empty string produces an empty array, not `[""]`.
 *
 * **Example** (Splitting a comma-separated string)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const splitComma = SchemaGetter.split<string>()
 * const result = Effect.runSync(SchemaGetter.run(splitComma, Option.some("a,b,c"), {}))
 * result // => Option.some(["a", "b", "c"])
 * ```
 *
 * @see {@link splitKeyValue} when values are key-value pairs
 *
 * @category splitting
 * @since 4.0.0
 */
export function split<E extends string>(options?: {
  readonly separator?: string | undefined
}): Getter<ReadonlyArray<string>, E> {
  const separator = options?.separator ?? ","
  return transform((input) => input === "" ? [] : input.split(separator))
}

/**
 * Encodes a `Uint8Array` or string to a Base64 string.
 *
 * **Details**
 *
 * The getter is pure and never fails.
 *
 * **Example** (Encoding to Base64)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const encode = SchemaGetter.encodeBase64<Uint8Array>()
 * const result = Effect.runSync(SchemaGetter.run(encode, Option.some(new Uint8Array([1, 2, 3])), {}))
 * result // => Option.some("AQID")
 * ```
 *
 * @see {@link decodeBase64} for the inverse operation to `Uint8Array`
 * @see {@link decodeBase64String} for the inverse operation to `string`
 * @see {@link encodeBase64Url} for the URL-safe variant
 *
 * @category encoding
 * @since 4.0.0
 */
export function encodeBase64<E extends Uint8Array | string>(): Getter<string, E> {
  return transform(Base64.encode)
}

/**
 * Encodes a `Uint8Array` or string to a URL-safe Base64 string.
 *
 * **Details**
 *
 * The getter is pure and never fails.
 *
 * **Example** (Encoding to Base64Url)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const encode = SchemaGetter.encodeBase64Url<Uint8Array>()
 * const result = Effect.runSync(SchemaGetter.run(encode, Option.some(new Uint8Array([251, 255])), {}))
 * result // => Option.some("-_8")
 * ```
 *
 * @see {@link decodeBase64Url} for the inverse operation to `Uint8Array`
 * @see {@link decodeBase64UrlString} for the inverse operation to `string`
 * @see {@link encodeBase64} for the standard Base64 variant
 *
 * @category encoding
 * @since 4.0.0
 */
export function encodeBase64Url<E extends Uint8Array | string>(): Getter<string, E> {
  return transform(Base64Url.encode)
}

/**
 * Encodes a `Uint8Array` or string to a hexadecimal string.
 *
 * **Details**
 *
 * The getter is pure and never fails.
 *
 * **Example** (Encoding to hex)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const encode = SchemaGetter.encodeHex<Uint8Array>()
 * const result = Effect.runSync(SchemaGetter.run(encode, Option.some(new Uint8Array([1, 2, 3])), {}))
 * result // => Option.some("010203")
 * ```
 *
 * @see {@link decodeHex} for the inverse operation to `Uint8Array`
 * @see {@link decodeHexString} for the inverse operation to `string`
 *
 * @category encoding
 * @since 4.0.0
 */
export function encodeHex<E extends Uint8Array | string>(): Getter<string, E> {
  return transform(Hex.encode)
}

/**
 * Decodes a Base64 string to a `Uint8Array`.
 *
 * **Details**
 *
 * - Fails with `SchemaIssue.InvalidValue` if the input is not valid Base64.
 *
 * **Example** (Decoding Base64 to bytes)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const decode = SchemaGetter.decodeBase64<string>()
 * const result = await Effect.runPromise(SchemaGetter.run(decode, Option.some("AQID"), {}))
 * Option.map(result, Array.from) // => Option.some([1, 2, 3])
 * ```
 *
 * @see {@link decodeBase64String} to decode to `string` instead
 * @see {@link encodeBase64} for the inverse operation
 *
 * @category decoding
 * @since 4.0.0
 */
export function decodeBase64<E extends string>(): Getter<Uint8Array, E> {
  return transformEffect((input, options) =>
    Effect.mapErrorEager(
      Effect.fromResult(Base64.decode(input)),
      () =>
        new SchemaIssue.InvalidValue(
          { expected: "a valid Base64 string" },
          input,
          options
        )
    )
  )
}

/**
 * Decodes a Base64 string to a UTF-8 `string`.
 *
 * **Details**
 *
 * - Fails with `SchemaIssue.InvalidValue` if the input is not valid Base64.
 *
 * **Example** (Decoding Base64 to string)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const decode = SchemaGetter.decodeBase64String<string>()
 * const result = await Effect.runPromise(SchemaGetter.run(decode, Option.some("aGVsbG8="), {}))
 * result // => Option.some("hello")
 * ```
 *
 * @see {@link decodeBase64} to decode to `Uint8Array` instead
 * @see {@link encodeBase64} for the inverse operation
 *
 * @category decoding
 * @since 4.0.0
 */
export function decodeBase64String<E extends string>(): Getter<string, E> {
  return transformEffect((input, options) =>
    Result.match(Base64.decodeString(input), {
      onFailure: () =>
        Effect.fail(
          new SchemaIssue.InvalidValue(
            { expected: "a valid Base64 string" },
            input,
            options
          )
        ),
      onSuccess: Effect.succeed
    })
  )
}

/**
 * Decodes a URL-safe Base64 string to a `Uint8Array`.
 *
 * **Details**
 *
 * - Fails with `SchemaIssue.InvalidValue` if the input is not valid Base64Url.
 *
 * **Example** (Decoding Base64Url to bytes)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const decode = SchemaGetter.decodeBase64Url<string>()
 * const result = await Effect.runPromise(SchemaGetter.run(decode, Option.some("-_8="), {}))
 * Option.map(result, Array.from) // => Option.some([251, 255])
 * ```
 *
 * @see {@link decodeBase64UrlString} to decode to `string` instead
 * @see {@link encodeBase64Url} for the inverse operation
 *
 * @category decoding
 * @since 4.0.0
 */
export function decodeBase64Url<E extends string>(): Getter<Uint8Array, E> {
  return transformEffect((input, options) =>
    Result.match(Base64Url.decode(input), {
      onFailure: () =>
        Effect.fail(
          new SchemaIssue.InvalidValue(
            { expected: "a valid Base64Url string" },
            input,
            options
          )
        ),
      onSuccess: Effect.succeed
    })
  )
}

/**
 * Decodes a URL-safe Base64 string to a UTF-8 `string`.
 *
 * **Details**
 *
 * - Fails with `SchemaIssue.InvalidValue` if the input is not valid Base64Url.
 *
 * **Example** (Decoding Base64Url to string)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const decode = SchemaGetter.decodeBase64UrlString<string>()
 * const result = await Effect.runPromise(SchemaGetter.run(decode, Option.some("aGVsbG8"), {}))
 * result // => Option.some("hello")
 * ```
 *
 * @see {@link decodeBase64Url} to decode to `Uint8Array` instead
 * @see {@link encodeBase64Url} for the inverse operation
 *
 * @category decoding
 * @since 4.0.0
 */
export function decodeBase64UrlString<E extends string>(): Getter<string, E> {
  return transformEffect((input, options) =>
    Result.match(Base64Url.decodeString(input), {
      onFailure: () =>
        Effect.fail(
          new SchemaIssue.InvalidValue(
            { expected: "a valid Base64Url string" },
            input,
            options
          )
        ),
      onSuccess: Effect.succeed
    })
  )
}

/**
 * Decodes a hexadecimal string to a `Uint8Array`.
 *
 * **Details**
 *
 * - Fails with `SchemaIssue.InvalidValue` if the input is not valid hex.
 *
 * **Example** (Decoding hex to bytes)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const decode = SchemaGetter.decodeHex<string>()
 * const result = await Effect.runPromise(SchemaGetter.run(decode, Option.some("010203"), {}))
 * Option.map(result, Array.from) // => Option.some([1, 2, 3])
 * ```
 *
 * @see {@link decodeHexString} to decode to `string` instead
 * @see {@link encodeHex} for the inverse operation
 *
 * @category decoding
 * @since 4.0.0
 */
export function decodeHex<E extends string>(): Getter<Uint8Array, E> {
  return transformEffect((input, options) =>
    Result.match(Hex.decode(input), {
      onFailure: () =>
        Effect.fail(
          new SchemaIssue.InvalidValue(
            { expected: "a valid hexadecimal string" },
            input,
            options
          )
        ),
      onSuccess: Effect.succeed
    })
  )
}

/**
 * Decodes a hexadecimal string to a UTF-8 `string`.
 *
 * **Details**
 *
 * - Fails with `SchemaIssue.InvalidValue` if the input is not valid hex.
 *
 * **Example** (Decoding hex to string)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const decode = SchemaGetter.decodeHexString<string>()
 * const result = await Effect.runPromise(SchemaGetter.run(decode, Option.some("68656c6c6f"), {}))
 * result // => Option.some("hello")
 * ```
 *
 * @see {@link decodeHex} to decode to `Uint8Array` instead
 * @see {@link encodeHex} for the inverse operation
 *
 * @category decoding
 * @since 4.0.0
 */
export function decodeHexString<E extends string>(): Getter<string, E> {
  return transformEffect((input, options) =>
    Result.match(Hex.decodeString(input), {
      onFailure: () =>
        Effect.fail(
          new SchemaIssue.InvalidValue(
            { expected: "a valid hexadecimal string" },
            input,
            options
          )
        ),
      onSuccess: Effect.succeed
    })
  )
}

/**
 * Encodes a present string using `encodeURIComponent`.
 *
 * **Details**
 *
 * - Skips `None` inputs.
 * - May throw a `URIError` for malformed surrogate pairs; this exception is not
 *   converted into an `Issue`.
 *
 * **Example** (Encoding a URI component)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const encode = SchemaGetter.encodeUriComponent<string>()
 * const result = Effect.runSync(SchemaGetter.run(encode, Option.some("hello world"), {}))
 * result // => Option.some("hello%20world")
 * ```
 *
 * @see {@link decodeUriComponent} for the inverse operation
 *
 * @category encoding
 * @since 4.0.0
 */
export function encodeUriComponent<E extends string>(): Getter<string, E> {
  return transform(encodeURIComponent)
}

/**
 * Decodes a URI component encoded string using `decodeURIComponent`.
 *
 * **Details**
 *
 * - Fails with `SchemaIssue.InvalidValue` if the input contains malformed percent-encoding sequences.
 *
 * **Example** (Decoding a URI component)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const decode = SchemaGetter.decodeUriComponent<string>()
 * const result = await Effect.runPromise(SchemaGetter.run(decode, Option.some("hello%20world"), {}))
 * result // => Option.some("hello world")
 * ```
 *
 * @see {@link encodeUriComponent} for the inverse operation
 *
 * @category decoding
 * @since 4.0.0
 */
export function decodeUriComponent<E extends string>(): Getter<string, E> {
  return transformEffect((input, options) => {
    try {
      return Effect.succeed(globalThis.decodeURIComponent(input))
    } catch {
      return Effect.fail(
        new SchemaIssue.InvalidValue(
          { expected: "a valid URI component" },
          input,
          options
        )
      )
    }
  })
}

/**
 * Parses a `DateTime.Input` value into a `DateTime.Utc`.
 *
 * **When to use**
 *
 * Use when you need a schema getter to decode a present encoded date/time value
 * to a `DateTime.Utc`.
 *
 * **Details**
 *
 * - Accepted input includes existing `DateTime` values, partial date/time parts,
 *   instant objects, zoned instant objects, JavaScript `Date` instances, epoch
 *   milliseconds, and date strings.
 * - Converts successfully parsed values to UTC.
 * - Fails with `SchemaIssue.InvalidValue` if the input cannot be parsed as a valid
 *   `DateTime`.
 *
 * **Example** (Parsing DateTime)
 *
 * ```ts import.meta.vitest
 * import { DateTime, Effect, Option, SchemaGetter } from "effect"
 *
 * const parseDate = SchemaGetter.dateTimeUtcFromInput<string>()
 * const result = await Effect.runPromise(
 *   SchemaGetter.run(parseDate, Option.some("2024-01-01T00:00:00Z"), {})
 * )
 * Option.map(result, DateTime.toEpochMillis) // => Option.some(1704067200000)
 * ```
 *
 * @see {@link Date} for a simpler coercion to `Date` (no validation)
 *
 * @category converting
 * @since 4.0.0
 */
export function dateTimeUtcFromInput<E extends DateTime.DateTime.Input>(): Getter<DateTime.Utc, E> {
  return transformEffect((input, options) => {
    return Option.match(DateTime.make(input), {
      onNone: () =>
        Effect.fail(
          new SchemaIssue.InvalidValue({ message: "Invalid DateTime input" }, input, options)
        ),
      onSome: (dt) => Effect.succeed(DateTime.toUtc(dt))
    })
  })
}

/**
 * Decodes a `FormData` object into a nested tree structure using bracket-path notation.
 *
 * **When to use**
 *
 * Use when you need a schema getter to parse `FormData` from HTTP requests into
 * structured objects.
 *
 * **Details**
 *
 * The getter is pure and never fails. It interprets bracket-path keys such as
 * `user[name]` and `items[0]` to build nested objects or arrays, and each leaf
 * value is a `string` or `Blob`.
 *
 * **Example** (Decoding FormData)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const decode = SchemaGetter.decodeFormData()
 * const formData = new FormData()
 * formData.append("user[name]", "Alice")
 * const result = Effect.runSync(SchemaGetter.run(decode, Option.some(formData), {}))
 * result // => Option.some({ user: { name: "Alice" } })
 * ```
 *
 * @see {@link encodeFormData} for the corresponding encoder
 * @see {@link makeTreeRecord} for the underlying bracket-path parser
 * @see {@link decodeURLSearchParams} for the URLSearchParams variant
 *
 * @category decoding
 * @since 4.0.0
 */
export function decodeFormData(): Getter<Schema.TreeRecord<string | Blob>, FormData> {
  return transform((input) => makeTreeRecord(Array.from(input.entries())))
}

const collectFormDataEntries = collectBracketPathEntries((value): value is string | Blob =>
  typeof value === "string" || (typeof Blob !== "undefined" && value instanceof Blob)
)

/**
 * Encodes a nested object into a `FormData` instance using bracket-path notation.
 *
 * **When to use**
 *
 * Use when you need a schema getter to serialize structured data to `FormData`
 * for HTTP requests.
 *
 * **Details**
 *
 * The getter is pure and never fails. It flattens nested objects or arrays into
 * bracket-path keys such as `user[name]` and `items[0]`. Non-object inputs
 * produce an empty `FormData`.
 *
 * **Example** (Encoding to FormData)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const encode = SchemaGetter.encodeFormData()
 * const result = Effect.runSync(SchemaGetter.run(encode, Option.some({ name: "Alice" }), {}))
 * Option.map(result, (formData) => formData.get("name")) // => Option.some("Alice")
 * ```
 *
 * @see {@link decodeFormData} for the corresponding decoder
 * @see {@link collectBracketPathEntries} for the underlying flattener
 * @see {@link encodeURLSearchParams} for the URLSearchParams variant
 *
 * @category encoding
 * @since 4.0.0
 */
export function encodeFormData(): Getter<FormData, unknown> {
  return transform((input) => {
    const out = new FormData()
    if (typeof input === "object" && input !== null) {
      const entries = collectFormDataEntries(input)
      entries.forEach(([key, value]) => {
        out.append(key, value)
      })
    }
    return out
  })
}

/**
 * Decodes a `URLSearchParams` object into a nested tree structure using bracket-path notation.
 *
 * **When to use**
 *
 * Use when you need a schema getter to parse query parameters from URLs into
 * structured objects.
 *
 * **Details**
 *
 * The getter is pure and never fails. It interprets bracket-path keys such as
 * `user[name]` and `items[0]` to build nested objects or arrays, and each leaf
 * value is a `string`.
 *
 * **Example** (Decoding URLSearchParams)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const decode = SchemaGetter.decodeURLSearchParams()
 * const params = new URLSearchParams("user[name]=Alice")
 * const result = Effect.runSync(SchemaGetter.run(decode, Option.some(params), {}))
 * result // => Option.some({ user: { name: "Alice" } })
 * ```
 *
 * @see {@link encodeURLSearchParams} for the corresponding encoder
 * @see {@link makeTreeRecord} for the underlying bracket-path parser
 * @see {@link decodeFormData} for the FormData variant
 *
 * @category decoding
 * @since 4.0.0
 */
export function decodeURLSearchParams(): Getter<Schema.TreeRecord<string>, URLSearchParams> {
  return transform((input) => makeTreeRecord(Array.from(input.entries())))
}

const collectURLSearchParamsEntries = collectBracketPathEntries(Predicate.isString)

/**
 * Encodes a nested object into a `URLSearchParams` instance using bracket-path notation.
 *
 * **When to use**
 *
 * Use when you need a schema getter to serialize structured data to query
 * parameters for URLs.
 *
 * **Details**
 *
 * The getter is pure and never fails. It flattens nested objects or arrays into
 * bracket-path keys. Non-object inputs produce an empty `URLSearchParams`.
 *
 * **Example** (Encoding to URLSearchParams)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaGetter } from "effect"
 *
 * const encode = SchemaGetter.encodeURLSearchParams()
 * const result = Effect.runSync(SchemaGetter.run(encode, Option.some({ name: "Alice" }), {}))
 * Option.map(result, (params) => params.toString()) // => Option.some("name=Alice")
 * ```
 *
 * @see {@link decodeURLSearchParams} for the corresponding decoder
 * @see {@link collectBracketPathEntries} for the underlying flattener
 * @see {@link encodeFormData} for the FormData variant
 *
 * @category encoding
 * @since 4.0.0
 */
export function encodeURLSearchParams(): Getter<URLSearchParams, unknown> {
  return transform((input) => {
    if (typeof input === "object" && input !== null) {
      return new URLSearchParams(collectURLSearchParamsEntries(input))
    }
    return new URLSearchParams()
  })
}

function bracketPathToTokens(bracketPath: string): Array<string | number> {
  // real empty path (from append("", value))
  if (bracketPath === "") {
    return [""]
  }

  const replaced = bracketPath.replace(/\[(.*?)\]/g, ".$1")
  const parts = replaced.split(".")
  // if bracket path started with "[...]" we get ".foo" => ["", "foo"]; drop the synthetic first ""
  const start = replaced.startsWith(".") ? 1 : 0

  return parts
    .slice(start)
    .map((part) => (Arr.isCanonicalArrayIndex(part) ? globalThis.Number(part) : part))
}

/**
 * Builds a nested tree object from a list of bracket-path entries.
 *
 * **When to use**
 *
 * Use when you need a schema getter to parse FormData or URLSearchParams
 * entries into structured objects.
 * - You have flat key-value pairs with bracket-path keys that need nesting.
 *
 * **Details**
 *
 * - A bracket path is a string like `"user[address][city]"` that describes nested
 *   object/array structure.
 * - Interprets bracket paths and constructs the corresponding nested object.
 * - Builds and returns a nested object from the input entries.
 * - Supported syntax:
 *   - `"foo"` → object key `"foo"`
 *   - `"foo[bar]"` → nested `{ foo: { bar: ... } }`
 *   - `"foo[0]"` → array index `{ foo: [value] }`
 *   - `"foo[]"` → append to array `foo`
 *   - `""` → real empty key
 * - Numeric bracket segments become array indices only when they are valid
 *   JavaScript array-index strings; otherwise they remain object keys.
 * - Duplicate keys for the same path are merged into arrays.
 * - If a structural path conflicts with a previous leaf or a different container
 *   type, the later structural path replaces the conflicting value.
 * - The notation has no escaping for `.`, `[` or `]`, so keys containing these
 *   delimiters cannot be round-tripped without changing their structure.
 *
 * **Example** (Building a tree from bracket paths)
 *
 * ```ts import.meta.vitest
 * import { SchemaGetter } from "effect"
 *
 * SchemaGetter.makeTreeRecord([
 *   ["user[name]", "Alice"],
 *   ["user[tags][]", "admin"],
 *   ["user[tags][]", "editor"]
 * ]) // => { user: { name: "Alice", tags: ["admin", "editor"] } }
 * ```
 *
 * @see {@link collectBracketPathEntries} for flattening trees into bracket-path entries
 * @see {@link decodeFormData} for a higher-level FormData decoder
 * @see {@link decodeURLSearchParams} for a higher-level URLSearchParams decoder
 *
 * @category constructors
 * @since 4.0.0
 */
export function makeTreeRecord<A>(
  bracketPathEntries: ReadonlyArray<readonly [bracketPath: string, value: A]>
): Schema.TreeRecord<A> {
  const out: any = {}
  const containers = new WeakSet<object>()
  const duplicates = new WeakSet<object>()

  function getOrCreateContainer(self: any, key: PropertyKey, shouldBeArray: boolean): any {
    const current = Object.hasOwn(self, key) ? self[key] : undefined
    if (containers.has(current) && Array.isArray(current) === shouldBeArray) {
      return current
    }
    const container = shouldBeArray ? [] : {}
    containers.add(container)
    InternalRecord.assignProperty(self, key, container)
    return container
  }

  bracketPathEntries.forEach(([key, value]) => {
    const tokens = bracketPathToTokens(key)
    let cur: any = out
    tokens.forEach((token, i) => {
      const isLast = i === tokens.length - 1

      // We are inside an array and see "[]" (empty token) => append
      if (Array.isArray(cur) && token === "") {
        if (isLast) {
          cur.push(value)
        } else {
          // bracket path: "foo[][bar]" => push a new element and descend into it
          const next = tokens[i + 1]
          const shouldBeArray = typeof next === "number" || next === ""
          const index = cur.length
          cur = getOrCreateContainer(cur, index, shouldBeArray)
        }
      } else if (isLast) {
        // If we're setting a value at a path that already exists
        // convert it to an array to support multiple values for the same key
        const hasOwn = Object.hasOwn(cur, token)
        if (hasOwn && Array.isArray(cur[token]) && (containers.has(cur[token]) || duplicates.has(cur[token]))) {
          cur[token].push(value)
        } else if (hasOwn) {
          const values = [cur[token], value]
          duplicates.add(values)
          InternalRecord.assignProperty(cur, token, values)
        } else {
          InternalRecord.assignProperty(cur, token, value)
        }
      } else {
        const next = tokens[i + 1]
        // if next is a number OR "" (from []), we are building an array
        const shouldBeArray = typeof next === "number" || next === ""
        cur = getOrCreateContainer(cur, token, shouldBeArray)
      }
    })
  })
  return out
}

/**
 * Flattens a nested object into bracket-path entries, filtering leaf values by a type guard.
 *
 * **When to use**
 *
 * Use when you need a schema getter to serialize structured objects to flat
 * key-value entries.
 * - Building custom `FormData` or `URLSearchParams` encoders.
 *
 * **Details**
 *
 * - Takes a nested object and produces flat `[bracketPath, value]` pairs suitable for
 *   `FormData` or `URLSearchParams`.
 * - Returns a curried function: first call provides the leaf type guard, second call provides the object.
 * - Recursively traverses objects and arrays.
 * - If all elements of an array are leaves, encodes them as multiple entries with the same key
 *   (e.g. `tags=a&tags=b`). Otherwise uses indexed bracket paths (e.g. `items[0]`, `items[1]`).
 * - Non-leaf values that aren't objects or arrays are silently skipped.
 * - Empty arrays and objects produce no entries, and path delimiters in property
 *   names are not escaped. The resulting format is therefore lossy.
 *
 * **Example** (Flattening an object to bracket paths)
 *
 * ```ts import.meta.vitest
 * import { Predicate, SchemaGetter } from "effect"
 *
 * const collectStrings = SchemaGetter.collectBracketPathEntries(Predicate.isString)
 * const entries = collectStrings({ user: { name: "Alice", tags: ["admin", "editor"] } })
 *
 * entries // => [["user[name]", "Alice"], ["user[tags]", "admin"], ["user[tags]", "editor"]]
 * ```
 *
 * @see {@link makeTreeRecord} for building trees from bracket-path entries
 * @see {@link encodeFormData} for a higher-level FormData encoder
 * @see {@link encodeURLSearchParams} for a higher-level URLSearchParams encoder
 *
 * @category converting
 * @since 4.0.0
 */
export function collectBracketPathEntries<A>(isLeaf: (value: unknown) => value is A) {
  return (input: object): Array<[bracketPath: string, value: A]> => {
    const bracketPathEntries: Array<[string, A]> = []

    function append(key: string, value: unknown): void {
      if (isLeaf(value)) {
        bracketPathEntries.push([key, value])
      } else if (Array.isArray(value)) {
        // If all values are leaves, encode as multiple entries with the same key
        const allLeaves = value.every(isLeaf)
        if (allLeaves) {
          value.forEach((v) => {
            bracketPathEntries.push([key, v])
          })
        } else {
          value.forEach((v, i) => {
            append(`${key}[${i}]`, v)
          })
        }
      } else if (typeof value === "object" && value !== null) {
        for (const [k, v] of Object.entries(value)) {
          append(`${key}[${k}]`, v)
        }
      }
    }

    for (const [key, value] of Object.entries(input)) {
      append(key, value)
    }

    return bracketPathEntries
  }
}
