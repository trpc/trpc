/**
 * Builds two-way conversions used by schemas.
 *
 * A `Transformation<T, E>` describes how to decode an encoded value into a
 * decoded value and how to encode it back again. Schema APIs use
 * transformations to connect two representations, such as a string and a
 * number, a JSON value and a richer TypeScript value, or a form field and an
 * application value. This module includes transformation and middleware types,
 * constructors for pure or effectful conversions, and common conversions used
 * by the Schema module.
 *
 * @since 4.0.0
 */

import * as BigDecimal from "./BigDecimal.ts"
import * as ByteSize from "./ByteSize.ts"
import * as DateTime from "./DateTime.ts"
import * as Duration from "./Duration.ts"
import * as Effect from "./Effect.ts"
import { format, formatDate, formatJson } from "./Formatter.ts"
import { dual } from "./Function.ts"
import * as Option from "./Option.ts"
import * as Pipeable from "./Pipeable.ts"
import * as Predicate from "./Predicate.ts"
import type { ErrorOptions, Json } from "./Schema.ts"
import type * as SchemaAST from "./SchemaAST.ts"
import * as SchemaGetter from "./SchemaGetter.ts"
import * as SchemaIssue from "./SchemaIssue.ts"

/**
 * Middleware that wraps the entire parsing `Effect` pipeline for both
 * decode and encode directions.
 *
 * **When to use**
 *
 * Use when you need a schema middleware to catch or recover from parsing
 * errors (e.g. `Schema.catchDecoding`), run side effects around the parsing
 * pipeline, or access the full `Effect` rather than a single decoded value.
 *
 * **Details**
 *
 * Unlike `Transformation`, which operates on individual values via `Getter`,
 * `Middleware` receives the full `Effect` produced by the inner schema and can
 * intercept, modify, retry, or replace it.
 *
 * - `decode` receives an `Effect<Option<E>, Issue, RDE>` and returns
 *   `Effect<Option<T>, Issue, RDT>`.
 * - `encode` receives an `Effect<Option<T>, Issue, RET>` and returns
 *   `Effect<Option<E>, Issue, REE>`.
 * - `flip()` swaps the decode and encode functions, producing a
 *   `Middleware<E, T, ...>`.
 * - Middleware values implement `Pipeable`.
 *
 * Typically constructed indirectly via `Schema.middlewareDecoding` or
 * `Schema.middlewareEncoding` rather than by using `new Middleware` directly.
 *
 * **Example** (Creating a middleware that falls back on decode failure)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, SchemaIssue, SchemaTransformation } from "effect"
 *
 * const fallback = new SchemaTransformation.Middleware<string, string, never, never, never, never>(
 *   (effect) => Effect.catch(effect, () => Effect.succeed(Option.some("fallback"))),
 *   (effect) => effect
 * )
 * const issue = new SchemaIssue.InvalidValue({ message: "Missing value" })
 * await Effect.runPromise(fallback.decode(Effect.fail(issue), {})) // => Option.some("fallback")
 * ```
 *
 * @see {@link Transformation} — value-level bidirectional transformation
 *
 * @category models
 * @since 4.0.0
 */
export interface Middleware<in out T, in out E, RDE, RDT, RET, REE> extends Pipeable.Pipeable {
  readonly _tag: "Middleware"
  readonly decode: (
    effect: Effect.Effect<Option.Option<E>, SchemaIssue.Issue, RDE>,
    options: SchemaAST.ParseOptions
  ) => Effect.Effect<Option.Option<T>, SchemaIssue.Issue, RDT>
  readonly encode: (
    effect: Effect.Effect<Option.Option<T>, SchemaIssue.Issue, RET>,
    options: SchemaAST.ParseOptions
  ) => Effect.Effect<Option.Option<E>, SchemaIssue.Issue, REE>
  flip(): Middleware<E, T, RET, REE, RDE, RDT>
}

/**
 * Constructs schema middleware from its decode and encode functions.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Middleware: new<T, E, RDE, RDT, RET, REE>(
  decode: (
    effect: Effect.Effect<Option.Option<E>, SchemaIssue.Issue, RDE>,
    options: SchemaAST.ParseOptions
  ) => Effect.Effect<Option.Option<T>, SchemaIssue.Issue, RDT>,
  encode: (
    effect: Effect.Effect<Option.Option<T>, SchemaIssue.Issue, RET>,
    options: SchemaAST.ParseOptions
  ) => Effect.Effect<Option.Option<E>, SchemaIssue.Issue, REE>
) => Middleware<T, E, RDE, RDT, RET, REE> = class<in out T, in out E, RDE, RDT, RET, REE> extends Pipeable.Class {
  readonly _tag = "Middleware"
  readonly decode: (
    effect: Effect.Effect<Option.Option<E>, SchemaIssue.Issue, RDE>,
    options: SchemaAST.ParseOptions
  ) => Effect.Effect<Option.Option<T>, SchemaIssue.Issue, RDT>
  readonly encode: (
    effect: Effect.Effect<Option.Option<T>, SchemaIssue.Issue, RET>,
    options: SchemaAST.ParseOptions
  ) => Effect.Effect<Option.Option<E>, SchemaIssue.Issue, REE>

  constructor(
    decode: (
      effect: Effect.Effect<Option.Option<E>, SchemaIssue.Issue, RDE>,
      options: SchemaAST.ParseOptions
    ) => Effect.Effect<Option.Option<T>, SchemaIssue.Issue, RDT>,
    encode: (
      effect: Effect.Effect<Option.Option<T>, SchemaIssue.Issue, RET>,
      options: SchemaAST.ParseOptions
    ) => Effect.Effect<Option.Option<E>, SchemaIssue.Issue, REE>
  ) {
    super()
    this.decode = decode
    this.encode = encode
  }
  flip(): Middleware<E, T, RET, REE, RDE, RDT> {
    return new Middleware(this.encode, this.decode)
  }
}

const TypeId = "~effect/SchemaTransformation/Transformation"

/**
 * Represents a bidirectional transformation between a decoded type `T` and an encoded
 * type `E`, built from a pair of `Getter`s.
 *
 * **When to use**
 *
 * Use when you need a schema transformation that defines how a schema converts
 * between two representations.
 * - You want to compose multiple transformations into a pipeline.
 * - You want to flip a transformation to swap decode/encode.
 *
 * **Details**
 *
 * This is the primary building block for `Schema.decodeTo`, `Schema.encodeTo`,
 * `Schema.decode`, `Schema.encode`, and `Schema.link`. Each direction is a
 * `SchemaGetter.Getter` that handles optionality, failure, and Effect services.
 *
 * - Immutable — `flip()` and {@link composeTransformation} return new instances.
 * - Transformation values implement `Pipeable`.
 * - `flip()` swaps the decode and encode getters.
 * - `composeTransformation(self, other)` chains: `self.decode` then `other.decode` for decoding,
 *   `other.encode` then `self.encode` for encoding.
 *
 * **Example** (Composing two transformations)
 *
 * ```ts import.meta.vitest
 * import { SchemaTransformation } from "effect"
 *
 * const trimAndLower = SchemaTransformation.composeTransformation(
 *   SchemaTransformation.trim(),
 *   SchemaTransformation.toLowerCase()
 * )
 * trimAndLower._tag // => "Transformation"
 * ```
 *
 * @see {@link makeTransformation} — construct from `{ decode, encode }` getters
 * @see {@link transform} — construct from pure functions
 * @see {@link transformEffect} — construct from effectful functions
 * @see {@link Middleware} — effect-pipeline-level alternative
 *
 * @category models
 * @since 4.0.0
 */
export interface Transformation<in out T, in out E, RD = never, RE = never> extends Pipeable.Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly _tag: "Transformation"
  readonly decode: SchemaGetter.Getter<T, E, RD>
  readonly encode: SchemaGetter.Getter<E, T, RE>
  flip(): Transformation<E, T, RE, RD>
}

/**
 * Constructs a bidirectional schema transformation from its decode and encode getters.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Transformation: new<T, E, RD = never, RE = never>(
  decode: SchemaGetter.Getter<T, E, RD>,
  encode: SchemaGetter.Getter<E, T, RE>
) => Transformation<T, E, RD, RE> = class<in out T, in out E, RD = never, RE = never> extends Pipeable.Class {
  readonly [TypeId] = TypeId
  readonly _tag = "Transformation"
  readonly decode: SchemaGetter.Getter<T, E, RD>
  readonly encode: SchemaGetter.Getter<E, T, RE>

  constructor(
    decode: SchemaGetter.Getter<T, E, RD>,
    encode: SchemaGetter.Getter<E, T, RE>
  ) {
    super()
    this.decode = decode
    this.encode = encode
  }
  flip(): Transformation<E, T, RE, RD> {
    return new Transformation(this.encode, this.decode)
  }
}

/**
 * Composes two schema transformations into a single bidirectional conversion.
 *
 * **When to use**
 *
 * Use when decoding and encoding require the same sequence of conversion
 * steps in opposite directions.
 *
 * **Details**
 *
 * Decoding applies `self.decode` followed by `other.decode`. Encoding applies
 * `other.encode` followed by `self.encode`. The function supports both
 * `composeTransformation(self, other)` and `composeTransformation(other)(self)`.
 *
 * **Example** (Trimming and lowercasing a string)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const transformation = SchemaTransformation.composeTransformation(
 *   SchemaTransformation.trim(),
 *   SchemaTransformation.toLowerCase()
 * )
 * const schema = Schema.String.pipe(Schema.decode(transformation))
 *
 * Schema.decodeUnknownSync(schema)("  HELLO  ") // => "hello"
 * ```
 *
 * @category combining
 * @since 4.0.0
 */
export const composeTransformation: {
  <T, T2, RD2, RE2>(
    other: Transformation<T2, T, RD2, RE2>
  ): <E, RD, RE>(self: Transformation<T, E, RD, RE>) => Transformation<T2, E, RD | RD2, RE | RE2>
  <T, E, RD, RE, T2, RD2, RE2>(
    self: Transformation<T, E, RD, RE>,
    other: Transformation<T2, T, RD2, RE2>
  ): Transformation<T2, E, RD | RD2, RE | RE2>
} = dual(2, <T, E, RD, RE, T2, RD2, RE2>(
  self: Transformation<T, E, RD, RE>,
  other: Transformation<T2, T, RD2, RE2>
): Transformation<T2, E, RD | RD2, RE | RE2> =>
  new Transformation(
    SchemaGetter.compose(self.decode, other.decode),
    SchemaGetter.compose(other.encode, self.encode)
  ))

/**
 * Returns `true` if `u` is a `Transformation` instance.
 *
 * **When to use**
 *
 * Use to check whether a value is already a schema transformation before
 * wrapping it.
 *
 * **Details**
 *
 * - Pure predicate, no side effects.
 * - Acts as a TypeScript type guard.
 *
 * **Example** (Checking a value)
 *
 * ```ts import.meta.vitest
 * import { SchemaTransformation } from "effect"
 *
 * SchemaTransformation.isTransformation(SchemaTransformation.trim()) // => true
 * SchemaTransformation.isTransformation({ decode: null, encode: null }) // => false
 * ```
 *
 * @see {@link Transformation}
 * @see {@link makeTransformation}
 *
 * @category guards
 * @since 4.0.0
 */
export function isTransformation(u: unknown): u is Transformation<any, any, unknown, unknown> {
  return Predicate.hasProperty(u, TypeId) && u[TypeId] === TypeId
}

/**
 * Constructs a `Transformation` from an object with `decode` and `encode`
 * `Getter`s. If the input is already a `Transformation`, returns it as-is.
 *
 * **When to use**
 *
 * Use when you already have schema getter instances and want to pair them into
 * a schema transformation.
 * - You want idempotent wrapping (won't double-wrap).
 *
 * **Details**
 *
 * - Returns the input unchanged if it is already a `Transformation`.
 *
 * **Example** (Wrapping existing getters)
 *
 * ```ts import.meta.vitest
 * import { SchemaGetter, SchemaTransformation } from "effect"
 *
 * const t = SchemaTransformation.makeTransformation({
 *   decode: SchemaGetter.transform<number, string>((s) => Number(s)),
 *   encode: SchemaGetter.transform<string, number>((n) => String(n))
 * })
 * t._tag // => "Transformation"
 * ```
 *
 * @see {@link transform} — simpler constructor from pure functions
 * @see {@link transformEffect} — constructor from effectful functions
 * @see {@link Transformation}
 *
 * @category constructors
 * @since 3.10.0
 */
export const makeTransformation = <T, E, RD = never, RE = never>(options: {
  readonly decode: SchemaGetter.Getter<T, E, RD>
  readonly encode: SchemaGetter.Getter<E, T, RE>
}): Transformation<T, E, RD, RE> => {
  if (isTransformation(options)) {
    return options as any
  }
  return new Transformation(options.decode, options.encode)
}

/**
 * Creates a `Transformation` from effectful decode and encode functions.
 *
 * **When to use**
 *
 * Use when you need a schema transformation that may fail or require Effect
 * services.
 *
 * **Details**
 *
 * - Each function receives the input value and `ParseOptions`.
 * - Must return an `Effect` that succeeds with the output or fails with `Issue`.
 * - Skips `None` inputs (missing keys) — functions are only called on present values.
 *
 * **Example** (Parsing a date string that can fail)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Schema, SchemaIssue, SchemaTransformation } from "effect"
 *
 * const DateFromString = Schema.String.pipe(
 *   Schema.decodeTo(
 *     Schema.Date,
 *     SchemaTransformation.transformEffect({
 *       decode: (s, options) => {
 *         const d = new Date(s)
 *         return isNaN(d.getTime())
 *           ? Effect.fail(new SchemaIssue.InvalidValue({ message: "Invalid date" }, s, options))
 *           : Effect.succeed(d)
 *       },
 *       encode: (d) => Effect.succeed(d.toISOString())
 *     })
 *   )
 * )
 * Schema.decodeSync(DateFromString)("2024-01-01").toISOString() // => "2024-01-01T00:00:00.000Z"
 * ```
 *
 * @see {@link transform} — for infallible, pure transformations
 * @see {@link transformOptional} — for transformations that handle missing keys
 * @see {@link makeTransformation} — for transformations from existing Getters
 *
 * @category transforming
 * @since 3.10.0
 */
export function transformEffect<T, E, RD = never, RE = never>(options: {
  readonly decode: (e: E, options: SchemaAST.ParseOptions) => Effect.Effect<T, SchemaIssue.Issue, RD>
  readonly encode: (t: T, options: SchemaAST.ParseOptions) => Effect.Effect<E, SchemaIssue.Issue, RE>
}): Transformation<T, E, RD, RE> {
  return new Transformation(
    SchemaGetter.transformEffect(options.decode),
    SchemaGetter.transformEffect(options.encode)
  )
}

/**
 * Creates a `Transformation` from pure (sync, infallible) decode and encode
 * functions.
 *
 * **When to use**
 *
 * Use when you need an infallible schema transformation that does not require
 * Effect services.
 *
 * **Details**
 *
 * - Each function receives the input and returns the output directly.
 * - Skips `None` inputs (missing keys) — functions are only called on present values.
 * - Does not allocate Effects internally; uses optimized sync path.
 *
 * **Example** (Converting between cents and dollars)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const CentsFromDollars = Schema.Number.pipe(
 *   Schema.decodeTo(
 *     Schema.Number,
 *     SchemaTransformation.transform({
 *       decode: (dollars) => dollars * 100,
 *       encode: (cents) => cents / 100
 *     })
 *   )
 * )
 * Schema.decodeSync(CentsFromDollars)(2.5) // => 250
 * ```
 *
 * @see {@link transformEffect} — for fallible or effectful transformations
 * @see {@link transformOptional} — for transformations that handle missing keys
 * @see {@link passthrough} — when no conversion is needed
 *
 * @category transforming
 * @since 3.10.0
 */
export function transform<T, E>(options: {
  readonly decode: (input: E) => T
  readonly encode: (input: T) => E
}): Transformation<T, E> {
  return new Transformation(
    SchemaGetter.transform(options.decode),
    SchemaGetter.transform(options.encode)
  )
}

/**
 * Creates a `Transformation` where decode and encode operate on `Option`
 * values, giving full control over missing-key handling.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to produce or consume `Option.None`
 * for absent keys.
 * - You are working with optional struct fields.
 *
 * **Details**
 *
 * - Each function receives `Option<input>` and returns `Option<output>`.
 * - `Option.None` input means the key is absent; returning `Option.None`
 *   omits the key from the output.
 * - Pure and synchronous.
 *
 * **Example** (Converting an optional key to Option)
 *
 * ```ts import.meta.vitest
 * import { Option, Schema, SchemaTransformation } from "effect"
 *
 * const schema = Schema.Struct({
 *   a: Schema.optionalKey(Schema.Number).pipe(
 *     Schema.decodeTo(
 *       Schema.Option(Schema.Number),
 *       SchemaTransformation.transformOptional({
 *         decode: Option.some,
 *         encode: Option.flatten
 *       })
 *     )
 *   )
 * })
 * Schema.decodeSync(schema)({}).a // => Option.none()
 * ```
 *
 * @see {@link transform} — when you don't need Option-level control
 * @see {@link optionFromOptionalKey} — built-in for the common optional-key-to-Option pattern
 * @see {@link optionFromOptional} — built-in for optional (undefined) to Option
 *
 * @category transforming
 * @since 4.0.0
 */
export function transformOptional<T, E>(options: {
  readonly decode: (input: Option.Option<E>) => Option.Option<T>
  readonly encode: (input: Option.Option<T>) => Option.Option<E>
}): Transformation<T, E> {
  return new Transformation(
    SchemaGetter.transformOptional(options.decode),
    SchemaGetter.transformOptional(options.encode)
  )
}

/**
 * Transforms strings by trimming whitespace on decode.
 * Encode is passthrough (no change).
 *
 * **When to use**
 *
 * Use when you need a schema transformation to normalize user input by
 * stripping leading/trailing whitespace.
 *
 * **Details**
 *
 * Decoding applies `String.prototype.trim()`. Encoding is passthrough and
 * returns the string unchanged. This is not round-trippable if the original had
 * whitespace.
 *
 * **Example** (Trimming on decode)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const Trimmed = Schema.String.pipe(
 *   Schema.decode(SchemaTransformation.trim())
 * )
 * Schema.decodeSync(Trimmed)("  hello  ") // => "hello"
 * ```
 *
 * @see {@link toLowerCase}
 * @see {@link toUpperCase}
 * @see {@link snakeToCamel}
 *
 * @category transforming
 * @since 4.0.0
 */
export function trim(): Transformation<string, string> {
  return new Transformation(
    SchemaGetter.trim(),
    SchemaGetter.passthrough()
  )
}

/**
 * Transforms strings by converting snake_case to camelCase
 * on decode and camelCase to snake_case on encode.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to convert API field names between
 * snake_case and camelCase conventions.
 *
 * **Details**
 *
 * Decoding converts values such as `"my_field_name"` to `"myFieldName"`.
 * Encoding converts values such as `"myFieldName"` back to `"my_field_name"`.
 * The transformation is round-trippable for standard snake_case and camelCase.
 *
 * **Example** (Converting snake case to camel case)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const SnakeToCamel = Schema.String.pipe(
 *   Schema.decode(SchemaTransformation.snakeToCamel())
 * )
 * Schema.decodeSync(SnakeToCamel)("user_name") // => "userName"
 * ```
 *
 * @see {@link trim}
 * @see {@link toLowerCase}
 *
 * @category transforming
 * @since 4.0.0
 */
export function snakeToCamel(): Transformation<string, string> {
  return new Transformation(
    SchemaGetter.snakeToCamel(),
    SchemaGetter.camelToSnake()
  )
}

/**
 * Transforms strings by lowercasing on decode.
 * Encode is passthrough.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to normalize strings to lowercase
 * (e.g. email addresses).
 *
 * **Details**
 *
 * Decoding applies `String.prototype.toLowerCase()`. Encoding is passthrough.
 * This is not round-trippable if the original had uppercase characters.
 *
 * **Example** (Lowercasing on decode)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const Lowered = Schema.String.pipe(
 *   Schema.decode(SchemaTransformation.toLowerCase())
 * )
 * Schema.decodeSync(Lowered)("HELLO") // => "hello"
 * ```
 *
 * @see {@link toUpperCase}
 * @see {@link trim}
 *
 * @category transforming
 * @since 4.0.0
 */
export function toLowerCase(): Transformation<string, string> {
  return new Transformation(
    SchemaGetter.toLowerCase(),
    SchemaGetter.passthrough()
  )
}

/**
 * Transforms strings by uppercasing on decode.
 * Encode is passthrough.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to normalize strings to uppercase
 * (e.g. country codes).
 *
 * **Details**
 *
 * Decoding applies `String.prototype.toUpperCase()`. Encoding is passthrough.
 * This is not round-trippable if the original had lowercase characters.
 *
 * **Example** (Uppercasing on decode)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const Uppered = Schema.String.pipe(
 *   Schema.decode(SchemaTransformation.toUpperCase())
 * )
 * Schema.decodeSync(Uppered)("hello") // => "HELLO"
 * ```
 *
 * @see {@link toLowerCase}
 * @see {@link trim}
 *
 * @category transforming
 * @since 4.0.0
 */
export function toUpperCase(): Transformation<string, string> {
  return new Transformation(
    SchemaGetter.toUpperCase(),
    SchemaGetter.passthrough()
  )
}

/**
 * Transforms strings by capitalizing the first character on
 * decode. Encode is passthrough.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to normalize display names or
 * titles.
 *
 * **Details**
 *
 * Decoding uppercases the first character and leaves the rest unchanged.
 * Encoding is passthrough.
 *
 * **Example** (Capitalizing on decode)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const Capitalized = Schema.String.pipe(
 *   Schema.decode(SchemaTransformation.capitalize())
 * )
 * Schema.decodeSync(Capitalized)("hello") // => "Hello"
 * ```
 *
 * @see {@link uncapitalize}
 * @see {@link toUpperCase}
 *
 * @category transforming
 * @since 4.0.0
 */
export function capitalize(): Transformation<string, string> {
  return new Transformation(
    SchemaGetter.capitalize(),
    SchemaGetter.passthrough()
  )
}

/**
 * Transforms strings by lowercasing the first character on
 * decode. Encode is passthrough.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to normalize identifiers or field
 * names.
 *
 * **Details**
 *
 * Decoding lowercases the first character and leaves the rest unchanged.
 * Encoding is passthrough.
 *
 * **Example** (Uncapitalizing on decode)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const Uncapitalized = Schema.String.pipe(
 *   Schema.decode(SchemaTransformation.uncapitalize())
 * )
 * Schema.decodeSync(Uncapitalized)("Hello") // => "hello"
 * ```
 *
 * @see {@link capitalize}
 * @see {@link toLowerCase}
 *
 * @category transforming
 * @since 4.0.0
 */
export function uncapitalize(): Transformation<string, string> {
  return new Transformation(
    SchemaGetter.uncapitalize(),
    SchemaGetter.passthrough()
  )
}

/**
 * Transforms a string into a record of key-value pairs and
 * encodes a record of key-value pairs into a string.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to parse query-string-like or
 * config-file-like strings into records.
 *
 * **Details**
 *
 * Decoding splits the string by `separator` (default `","`) into pairs, then
 * splits each pair by `keyValueSeparator` (default `"="`). Encoding joins the
 * record back into a string using the same separators. The transformation is
 * round-trippable when keys and values do not contain the separators.
 *
 * **Example** (Parsing key-value pairs)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const Config = Schema.String.pipe(
 *   Schema.decodeTo(
 *     Schema.Record(Schema.String, Schema.String),
 *     SchemaTransformation.splitKeyValue({ separator: ";", keyValueSeparator: ":" })
 *   )
 * )
 * Schema.decodeSync(Config)("host:localhost;port:3000") // => { host: "localhost", port: "3000" }
 * ```
 *
 * @see {@link trim}
 * @see {@link snakeToCamel}
 *
 * @category transforming
 * @since 4.0.0
 */
export function splitKeyValue(options?: {
  readonly separator?: string | undefined
  readonly keyValueSeparator?: string | undefined
}): Transformation<Record<string, string>, string> {
  return new Transformation(
    SchemaGetter.splitKeyValue(options),
    SchemaGetter.joinKeyValue(options)
  )
}

const passthrough_ = new Transformation(
  SchemaGetter.passthrough<any>(),
  SchemaGetter.passthrough<any>()
)

/**
 * Transforms values by returning the input unchanged in both
 * directions.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to connect two schemas that share
 * the same type with no actual conversion.
 *
 * **Details**
 *
 * - Both decode and encode are no-ops.
 * - Returns a shared singleton instance (no allocation per call).
 * - By default, `T` and `E` must be the same type. Pass `{ strict: false }`
 *   to bypass the type constraint.
 *
 * **Example** (Chaining schemas with no conversion)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const schema = Schema.Trim.pipe(
 *   Schema.decodeTo(Schema.FiniteFromString, SchemaTransformation.passthrough())
 * )
 * Schema.decodeSync(schema)("1") // => 1
 * ```
 *
 * @see {@link passthroughSupertype}
 * @see {@link passthroughSubtype}
 * @see {@link transform}
 *
 * @category constructors
 * @since 4.0.0
 */
export function passthrough<T, E>(options: { readonly strict: false }): Transformation<T, E>
export function passthrough<T>(): Transformation<T, T>
export function passthrough<T>(): Transformation<T, T> {
  return passthrough_
}

/**
 * Transforms values without changing them, typed so that `T extends E`, where the decoded
 * type `T` is a subtype of the encoded type `E`.
 *
 * **When to use**
 *
 * Use when you need a no-op schema transformation whose decoded side is
 * narrower than the encoded side.
 *
 * **Details**
 *
 * Both decode and encode are no-ops and return a shared singleton
 * transformation.
 *
 * **Example** (Passing through supertypes)
 *
 * ```ts import.meta.vitest
 * import { SchemaTransformation } from "effect"
 *
 * const t: SchemaTransformation.Transformation<"a" | "b", string> =
 *   SchemaTransformation.passthroughSupertype<"a" | "b", string>()
 * ```
 *
 * @see {@link passthrough}
 * @see {@link passthroughSubtype}
 *
 * @category constructors
 * @since 4.0.0
 */
export function passthroughSupertype<T extends E, E>(): Transformation<T, E>
export function passthroughSupertype<T>(): Transformation<T, T> {
  return passthrough_
}

/**
 * Transforms values without changing them, typed so that `E extends T` — the encoded
 * type is a subtype of the decoded type.
 *
 * **When to use**
 *
 * Use when you need a no-op schema transformation whose encoded side is more
 * specific than its decoded side.
 *
 * **Details**
 *
 * - Both decode and encode are no-ops (same as {@link passthrough}).
 * - Returns a shared singleton instance.
 *
 * **Example** (Passing through subtypes)
 *
 * ```ts import.meta.vitest
 * import { SchemaTransformation } from "effect"
 *
 * const t: SchemaTransformation.Transformation<string, "a" | "b"> =
 *   SchemaTransformation.passthroughSubtype<string, "a" | "b">()
 * ```
 *
 * @see {@link passthrough}
 * @see {@link passthroughSupertype}
 *
 * @category constructors
 * @since 4.0.0
 */
export function passthroughSubtype<T, E extends T>(): Transformation<T, E>
export function passthroughSubtype<T>(): Transformation<T, T> {
  return passthrough_
}

/**
 * Decodes a `string` into a `number` and encodes a `number` back to a
 * `string`.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to parse numeric strings from APIs,
 * form data, or URL parameters.
 *
 * **Details**
 *
 * Decoding coerces the string to a number like `Number(s)`. Encoding coerces
 * the number to a string like `String(n)`. This does not validate that the
 * result is finite; combine with `Schema.Finite` or `Schema.Int` for stricter
 * checks.
 *
 * **Example** (Converting a string to a number)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const schema = Schema.String.pipe(
 *   Schema.decodeTo(Schema.Number, SchemaTransformation.numberFromString)
 * )
 * Schema.decodeSync(schema)("42") // => 42
 * ```
 *
 * @see {@link bigintFromString}
 * @see {@link transform}
 *
 * @category converting
 * @since 4.0.0
 */
export const numberFromString = new Transformation(
  SchemaGetter.Number(),
  SchemaGetter.String()
)

/**
 * Decodes a `string` into a `bigint` and encodes a `bigint` back to a
 * `string`.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to parse large integer strings
 * (e.g. database IDs, blockchain values).
 *
 * **Details**
 *
 * Decoding coerces the string to a bigint like `BigInt(s)`. Encoding coerces
 * the bigint to a string like `String(n)`. Decoding fails if the string is not
 * a valid bigint representation.
 *
 * **Example** (Converting a string to a BigInt)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const schema = Schema.String.pipe(
 *   Schema.decodeTo(Schema.BigInt, SchemaTransformation.bigintFromString)
 * )
 * Schema.decodeSync(schema)("42") // => 42n
 * ```
 *
 * @see {@link numberFromString}
 * @see {@link transform}
 *
 * @category converting
 * @since 4.0.0
 */
export const bigintFromString = new Transformation(
  SchemaGetter.BigInt(),
  SchemaGetter.String()
)

/**
 * Decodes a `string` into a `Date` and encodes a `Date` back to a `string`.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to parse date strings from APIs or
 * user input.
 *
 * **Details**
 *
 * Decoding creates a `Date` from the string like `new Date(s)`. Encoding
 * converts the `Date` to an ISO string like `date.toISOString()`, returning
 * `"Invalid Date"` for invalid dates.
 *
 * **Example** (Converting a string to a Date)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const schema = Schema.String.pipe(
 *   Schema.decodeTo(Schema.Date, SchemaTransformation.dateFromString)
 * )
 * Schema.decodeSync(schema)("2024-01-01").toISOString() // => "2024-01-01T00:00:00.000Z"
 * ```
 *
 * @see {@link dateFromMillis}
 * @see {@link dateTimeUtcFromString}
 *
 * @category converting
 * @since 4.0.0
 */
export const dateFromString: Transformation<globalThis.Date, string> = new Transformation(
  SchemaGetter.Date(),
  SchemaGetter.transform(formatDate)
)

/**
 * Decodes epoch milliseconds into a `Date` and encodes a `Date` back to epoch
 * milliseconds.
 *
 * **When to use**
 *
 * Use when you need a schema transformation for numeric timestamps represented
 * as milliseconds since the Unix epoch.
 *
 * **Details**
 *
 * Decoding creates a `Date` from the number like `new Date(ms)`. Encoding
 * returns the `Date` timestamp like `date.getTime()`.
 *
 * **Gotchas**
 *
 * This transformation does not validate date validity. `NaN`, `Infinity`, and
 * `-Infinity` decode to invalid `Date` instances.
 *
 * **Example** (Converting milliseconds to a Date)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const schema = Schema.Number.pipe(
 *   Schema.decodeTo(Schema.Date, SchemaTransformation.dateFromMillis)
 * )
 * Schema.decodeSync(schema)(0).toISOString() // => "1970-01-01T00:00:00.000Z"
 * ```
 *
 * @see {@link dateFromString}
 * @see {@link SchemaGetter.dateTimeUtcFromInput}
 *
 * @category converting
 * @since 4.0.0
 */
export const dateFromMillis: Transformation<globalThis.Date, number> = new Transformation(
  SchemaGetter.Date(),
  SchemaGetter.transform((date) => date.getTime())
)

/**
 * Decodes a `string` into a `Duration` and encodes a `Duration` back to a
 * parseable `string`.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to parse human-readable duration
 * strings from APIs, config, or user input.
 *
 * **Details**
 *
 * Decoding accepts any string that `Duration.fromInput` can parse, including
 * `"Infinity"` and `"-Infinity"`. Encoding returns `String(duration)`,
 * producing strings such as `"2000 millis"` or `"10 nanos"` that round-trip
 * through the parser.
 *
 * **Example** (Converting a string to a Duration)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const schema = Schema.String.pipe(
 *   Schema.decodeTo(Schema.Duration, SchemaTransformation.durationFromString)
 * )
 * String(Schema.decodeSync(schema)("5 seconds")) // => "5000 millis"
 * ```
 *
 * @see {@link durationFromNanos}
 * @see {@link durationFromMillis}
 *
 * @category transforming
 * @since 4.0.0
 */
export const durationFromString: Transformation<Duration.Duration, string> = transformEffect<
  Duration.Duration,
  string
>({
  decode: (s, options) =>
    Option.match(Duration.fromInput(s as Duration.Input), {
      onNone: () =>
        Effect.fail(
          new SchemaIssue.InvalidValue(
            { expected: "a valid Duration string" },
            s,
            options
          )
        ),
      onSome: Effect.succeed
    }),
  encode: (duration) => Effect.succeed(String(duration))
})

/**
 * Decodes a `bigint` (nanoseconds) into a `Duration` and encodes a
 * `Duration` back to `bigint` nanoseconds.
 *
 * **When to use**
 *
 * Use when you need a schema transformation for nanosecond-precision timestamps
 * or intervals.
 *
 * **Details**
 *
 * Decoding always succeeds and creates a `Duration` from nanoseconds. Encoding
 * fails with `InvalidValue` if the `Duration` cannot be represented as a
 * `bigint`, such as `Duration.infinity`.
 *
 * **Example** (Converting nanoseconds to a Duration)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const schema = Schema.BigInt.pipe(
 *   Schema.decodeTo(Schema.Duration, SchemaTransformation.durationFromNanos)
 * )
 * String(Schema.decodeSync(schema)(5n)) // => "5 nanos"
 * ```
 *
 * @see {@link durationFromMillis}
 *
 * @category transforming
 * @since 4.0.0
 */
export const durationFromNanos: Transformation<Duration.Duration, bigint> = transformEffect({
  decode: (i) => Effect.succeed(Duration.nanos(i)),
  encode: (a, options) =>
    Option.match(Duration.toNanos(a), {
      onNone: () =>
        Effect.fail(
          new SchemaIssue.InvalidValue(
            { expected: "a Duration representable as a bigint" },
            a,
            options
          )
        ),
      onSome: (nanos) => Effect.succeed(nanos)
    })
})

/**
 * Decodes a `number` of milliseconds into a `Duration` and encodes a `Duration`
 * back to milliseconds.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to decode timeouts, delays, elapsed
 * intervals, or other duration values stored as millisecond counts.
 *
 * **Details**
 *
 * Decode creates a duration from the number, and encode returns the duration
 * length in milliseconds.
 *
 * **Example** (Converting milliseconds to a Duration)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const schema = Schema.Number.pipe(
 *   Schema.decodeTo(Schema.Duration, SchemaTransformation.durationFromMillis)
 * )
 * String(Schema.decodeSync(schema)(5000)) // => "5000 millis"
 * ```
 *
 * @see {@link durationFromNanos}
 *
 * @category transforming
 * @since 4.0.0
 */
export const durationFromMillis: Transformation<Duration.Duration, number> = transform({
  decode: (i) => Duration.millis(i),
  encode: (a) => Duration.toMillis(a)
})

/**
 * Decodes a string into a `ByteSize` and encodes it as an exact string.
 *
 * @category transforming
 * @since 4.0.0
 */
export const byteSizeFromString: Transformation<ByteSize.ByteSize, string> = transformEffect({
  decode: (input, options) =>
    Option.match(ByteSize.fromString(input), {
      onNone: () =>
        Effect.fail(
          new SchemaIssue.InvalidValue(
            { expected: "a valid ByteSize string" },
            input,
            options
          )
        ),
      onSome: Effect.succeed
    }),
  encode: (byteSize) => Effect.succeed(`${byteSize} ${byteSize === BigInt(1) ? "byte" : "bytes"}`)
})

/**
 * Decodes a non-negative bigint byte count into a `ByteSize`.
 *
 * @category transforming
 * @since 4.0.0
 */
export const byteSizeFromBigInt: Transformation<ByteSize.ByteSize, bigint> = transformEffect({
  decode: (input, options) =>
    Option.match(ByteSize.fromInput(input), {
      onNone: () =>
        Effect.fail(
          new SchemaIssue.InvalidValue(
            { expected: "a non-negative bigint byte count" },
            input,
            options
          )
        ),
      onSome: Effect.succeed
    }),
  encode: (byteSize) => Effect.succeed(ByteSize.toBigInt(byteSize))
})

/**
 * Decodes a non-negative safe-integer byte count into a `ByteSize`.
 *
 * @category transforming
 * @since 4.0.0
 */
export const byteSizeFromNumber: Transformation<ByteSize.ByteSize, number> = transformEffect({
  decode: (input, options) =>
    Option.match(ByteSize.fromInput(input), {
      onNone: () =>
        Effect.fail(
          new SchemaIssue.InvalidValue(
            { expected: "a non-negative safe-integer byte count" },
            input,
            options
          )
        ),
      onSome: Effect.succeed
    }),
  encode: (byteSize, options) =>
    Option.match(ByteSize.toNumber(byteSize), {
      onNone: () =>
        Effect.fail(
          new SchemaIssue.InvalidValue(
            { expected: "a ByteSize representable as a safe integer" },
            byteSize,
            options
          )
        ),
      onSome: Effect.succeed
    })
})

type JsonError = {
  message: string
  name?: string
  stack?: string
  cause?: Json
}

const isJsonError = (input: unknown): input is JsonError =>
  Predicate.isObject(input) && typeof input["message"] === "string"

const decodeJsonError = (input: JsonError): Error => {
  const hasCause = Object.hasOwn(input, "cause")
  const err = hasCause
    ? new Error(input.message, { cause: decodeDefect(input.cause as Json) })
    : new Error(input.message)
  if (typeof input.name === "string" && input.name !== "Error") err.name = input.name
  if (typeof input.stack === "string") err.stack = input.stack
  return err
}

const encodeUnknownAsJson = (input: unknown): Json => {
  try {
    const json = formatJson(input)
    return json === undefined ? format(input) : JSON.parse(json)
  } catch {
    return format(input)
  }
}

const encodeJsonError = (
  input: Error,
  options: ErrorOptions | undefined,
  encodeDefect: (input: unknown) => Json
): JsonError => {
  const encoded: JsonError = {
    name: input.name,
    message: typeof input.message === "string" ? input.message : ""
  }
  if (options?.includeStack && typeof input.stack === "string") {
    encoded.stack = input.stack
  }
  if (!options?.excludeCause && input.cause !== undefined) {
    encoded.cause = encodeDefect(input.cause)
  }
  return encoded
}

const makeEncodeDefect = (options?: ErrorOptions): (input: unknown) => Json => {
  const seen = new WeakSet<object>()
  const encode = (input: unknown): Json => {
    if (Predicate.isError(input)) {
      if (seen.has(input)) {
        return "[Circular]"
      }
      seen.add(input)
      const encoded = encodeJsonError(input, options, encode)
      seen.delete(input)
      return encoded
    }
    return encodeUnknownAsJson(input)
  }
  return encode
}

const decodeDefect = (input: Json): unknown => isJsonError(input) ? decodeJsonError(input) : input

/** @internal */
export const errorFromJsonError = (options?: ErrorOptions): Transformation<Error, JsonError> =>
  transform({
    decode: decodeJsonError,
    encode: (input) => makeEncodeDefect(options)(input) as JsonError
  })

/** @internal */
export const defectFromJson = (options?: ErrorOptions) =>
  transform({
    decode: decodeDefect,
    encode: makeEncodeDefect(options)
  })

/**
 * Decodes `T | null` into `Option<T>` and encodes `Option<T>` back to
 * `T | null`.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to convert nullable API fields to
 * `Option`.
 *
 * **Details**
 *
 * Decoding maps `null` to `Option.none()` and non-null values to
 * `Option.some(value)`. Encoding maps `Option.none()` to `null` and
 * `Option.some(value)` to `value`. The transformation is pure and synchronous.
 *
 * **Example** (Converting nullable values to an Option)
 *
 * ```ts import.meta.vitest
 * import { Option, Schema, SchemaTransformation } from "effect"
 *
 * const schema = Schema.NullOr(Schema.String).pipe(
 *   Schema.decodeTo(
 *     Schema.Option(Schema.String),
 *     SchemaTransformation.optionFromNullOr()
 *   )
 * )
 * Schema.decodeSync(schema)(null) // => Option.none()
 * ```
 *
 * @see {@link optionFromNullishOr}
 *
 * @category transforming
 * @since 4.0.0
 */
export function optionFromNullOr<T>(): Transformation<Option.Option<T>, T | null> {
  return transform({
    decode: Option.fromNullOr,
    encode: Option.getOrNull
  })
}

/**
 * Decodes `T | undefined` into `Option<T>` and encodes `Option.none()` back to
 * `undefined`.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to convert API fields that use
 * `undefined` for absence to `Option`.
 *
 * **Details**
 *
 * Decoding maps `undefined` to `Option.none()` and non-undefined values to
 * `Option.some(value)`. Encoding maps `Option.none()` to `undefined` and
 * `Option.some(value)` to `value`. The transformation is pure and synchronous.
 *
 * **Example** (Converting undefined-or values to an Option)
 *
 * ```ts import.meta.vitest
 * import { Option, Schema, SchemaTransformation } from "effect"
 *
 * const schema = Schema.UndefinedOr(Schema.String).pipe(
 *   Schema.decodeTo(
 *     Schema.Option(Schema.String),
 *     SchemaTransformation.optionFromUndefinedOr()
 *   )
 * )
 * Schema.decodeSync(schema)(undefined) // => Option.none()
 * ```
 *
 * @see {@link optionFromOptionalKey}
 * @see {@link optionFromOptional}
 *
 * @category transforming
 * @since 4.0.0
 */
export function optionFromUndefinedOr<T>(): Transformation<Option.Option<T>, T | undefined> {
  return transform({
    decode: Option.fromUndefinedOr,
    encode: Option.getOrUndefined
  })
}

/**
 * Decodes `T | null | undefined` into `Option<T>` and encodes `Option<T>`
 * back to `T | null` or `T | undefined` depending on the provided
 * `options.onNoneEncoding` (defaults to `undefined`).
 *
 * **When to use**
 *
 * Use when you need a schema transformation to convert nullish API fields to
 * `Option` when both `null` and `undefined` represent absence.
 *
 * **Details**
 *
 * Decoding maps `null` and `undefined` to `Option.none()` and all other values
 * to `Option.some(value)`. Encoding maps `Option.none()` to `null` or
 * `undefined` according to `options.onNoneEncoding`, and maps
 * `Option.some(value)` to `value`. The transformation is pure and synchronous.
 *
 * **Example** (Converting nullish values to an Option and encoding None as null)
 *
 * ```ts import.meta.vitest
 * import { Option, Schema, SchemaTransformation } from "effect"
 *
 * const schema = Schema.NullishOr(Schema.String).pipe(
 *   Schema.decodeTo(
 *     Schema.Option(Schema.String),
 *     SchemaTransformation.optionFromNullishOr({ onNoneEncoding: null })
 *   )
 * )
 * Schema.encodeSync(schema)(Option.none()) // => null
 * ```
 *
 * @see {@link optionFromNullOr}
 * @see {@link optionFromUndefinedOr}
 *
 * @category transforming
 * @since 4.0.0
 */
export function optionFromNullishOr<T>(
  options?: {
    onNoneEncoding: null | undefined
  }
): Transformation<Option.Option<T>, T | null | undefined> {
  return transform({
    decode: Option.fromNullishOr,
    encode: options?.onNoneEncoding === null ? Option.getOrNull : Option.getOrUndefined
  })
}

/**
 * Decodes an optional struct key into `Option<T>` and encodes `Option<T>`
 * back to an optional key.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to convert optional struct keys
 * (declared with `Schema.optionalKey`) to `Option` values.
 *
 * **Details**
 *
 * Decoding maps an absent key (`None`) to `Some(None)` and a present key
 * (`Some(v)`) to `Some(Some(v))`. Encoding maps `Some(None)` to `None` to omit
 * the key, and maps `Some(Some(v))` to `Some(v)`. This uses
 * `transformOptional` under the hood.
 *
 * **Example** (Converting an optional key to an Option)
 *
 * ```ts import.meta.vitest
 * import { Option, Schema, SchemaTransformation } from "effect"
 *
 * const schema = Schema.Struct({
 *   name: Schema.optionalKey(Schema.String).pipe(
 *     Schema.decodeTo(
 *       Schema.Option(Schema.String),
 *       SchemaTransformation.optionFromOptionalKey()
 *     )
 *   )
 * })
 * Schema.decodeSync(schema)({}).name // => Option.none()
 * ```
 *
 * @see {@link optionFromOptional}
 * @see {@link optionFromUndefinedOr}
 * @see {@link transformOptional}
 *
 * @category transforming
 * @since 4.0.0
 */
export function optionFromOptionalKey<T>(): Transformation<Option.Option<T>, T> {
  return transformOptional({
    decode: Option.some,
    encode: Option.flatten
  })
}

/**
 * Decodes optional values into `Option<T>` and encodes `Option.none()` back to
 * an omitted optional value.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to convert optional (possibly
 * `undefined`) values to `Option`.
 *
 * **Details**
 *
 * Decoding maps an absent or `undefined` value to `Some(None)` and a present
 * value to `Some(Some(v))`. Encoding maps `Some(None)` to `None` to omit the
 * value, and maps `Some(Some(v))` to `Some(v)`. This uses
 * `transformOptional` under the hood and filters out `undefined` on decode.
 *
 * **Example** (Converting an optional value to an Option)
 *
 * ```ts import.meta.vitest
 * import { Option, Schema, SchemaTransformation } from "effect"
 *
 * const schema = Schema.Struct({
 *   age: Schema.optional(Schema.Number).pipe(
 *     Schema.decodeTo(
 *       Schema.Option(Schema.Number),
 *       SchemaTransformation.optionFromOptional()
 *     )
 *   )
 * })
 * Schema.decodeSync(schema)({ age: undefined }).age // => Option.none()
 * ```
 *
 * @see {@link optionFromOptionalKey}
 * @see {@link optionFromUndefinedOr}
 * @see {@link transformOptional}
 *
 * @category transforming
 * @since 4.0.0
 */
export function optionFromOptional<T>(): Transformation<Option.Option<T>, T | undefined> {
  return transformOptional<Option.Option<T>, T | undefined>({
    decode: (ot) => ot.pipe(Option.filter(Predicate.isNotUndefined), Option.some),
    encode: Option.flatten
  })
}

/**
 * Decodes a `string` into a `URL` and encodes a `URL` back to its `href`
 * string.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to parse URL strings from user
 * input or API responses.
 *
 * **Details**
 *
 * Decoding checks `URL.canParse(s)` and fails with `InvalidValue` if the string
 * is not a valid URL. Encoding returns `url.href`.
 *
 * **Example** (Converting a string to a URL)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const schema = Schema.String.pipe(
 *   Schema.decodeTo(Schema.URL, SchemaTransformation.urlFromString)
 * )
 * Schema.decodeSync(schema)("https://example.com/path").href // => "https://example.com/path"
 * ```
 *
 * @see {@link numberFromString}
 * @see {@link transformEffect}
 *
 * @category transforming
 * @since 4.0.0
 */
export const urlFromString: Transformation<URL, string> = transformEffect<URL, string>({
  decode: (s, options) =>
    URL.canParse(s)
      ? Effect.succeed(new URL(s))
      : Effect.fail(
        new SchemaIssue.InvalidValue(
          { expected: "a valid URL string" },
          s,
          options
        )
      ),
  encode: (url) => Effect.succeed(url.href)
})

/**
 * Decodes a `string` into a `BigDecimal` and encodes a `BigDecimal` back to
 * its string representation.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to parse decimal number strings
 * from APIs or user input.
 *
 * **Details**
 *
 * Decoding calls `BigDecimal.fromString(s)` and fails with `InvalidValue` if
 * the string is not a valid `BigDecimal` representation. Encoding returns
 * `BigDecimal.format(bd)`.
 *
 * @category transforming
 * @since 4.0.0
 */
export const bigDecimalFromString: Transformation<BigDecimal.BigDecimal, string> = transformEffect<
  BigDecimal.BigDecimal,
  string
>({
  decode: (s, options) => {
    const result = BigDecimal.fromString(s)
    return Option.isNone(result)
      ? Effect.fail(
        new SchemaIssue.InvalidValue(
          { expected: "a valid BigDecimal string" },
          s,
          options
        )
      )
      : Effect.succeed(result.value)
  },
  encode: (bd) => Effect.succeed(BigDecimal.format(bd))
})

/**
 * Decodes a Base64-encoded `string` into a `Uint8Array` and encodes a
 * `Uint8Array` back to a Base64 string.
 *
 * **When to use**
 *
 * Use when you need a schema transformation for binary data transmitted as
 * Base64 strings (e.g. file uploads, API payloads).
 *
 * **Details**
 *
 * Decoding parses the Base64 string into bytes. Encoding writes the byte array
 * as a Base64 string.
 *
 * **Example** (Converting Base64 to a Uint8Array)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const schema = Schema.String.pipe(
 *   Schema.decodeTo(Schema.Uint8Array, SchemaTransformation.uint8ArrayFromBase64String)
 * )
 * Array.from(Schema.decodeSync(schema)("AQID")) // => [1, 2, 3]
 * ```
 *
 * @see {@link fromJsonString}
 * @see `Schema.Uint8ArrayFromBase64` - a ready-made schema wrapping this transformation.
 *
 * @category encoding
 * @since 4.0.0
 */
export const uint8ArrayFromBase64String: Transformation<Uint8Array<ArrayBufferLike>, string> = new Transformation(
  SchemaGetter.decodeBase64(),
  SchemaGetter.encodeBase64()
)

/**
 * Decodes a Base64-encoded `string` into a UTF-8 `string` and encodes a
 * UTF-8 `string` back to a Base64 string.
 *
 * **When to use**
 *
 * Use when you need a schema transformation for text data transmitted as Base64
 * strings.
 *
 * **Details**
 *
 * Decoding parses the Base64 string into a UTF-8 string. Encoding writes the
 * string as a Base64 string.
 *
 * **Example** (Converting Base64 to a string)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const schema = Schema.String.pipe(
 *   Schema.decodeTo(Schema.String, SchemaTransformation.stringFromBase64String)
 * )
 * Schema.decodeSync(schema)("aGVsbG8=") // => "hello"
 * ```
 *
 * @see {@link uint8ArrayFromBase64String}
 * @see `Schema.StringFromBase64` - a ready-made schema wrapping this transformation.
 *
 * @category encoding
 * @since 4.0.0
 */
export const stringFromBase64String: Transformation<string, string> = new Transformation(
  SchemaGetter.decodeBase64String(),
  SchemaGetter.encodeBase64()
)

/**
 * Decodes a base64 (URL) encoded `string` into a UTF-8 `string` and encodes it back.
 *
 * **When to use**
 *
 * Use when you need a schema transformation for text data transmitted as Base64
 * URL-safe strings.
 *
 * **Details**
 *
 * Decoding parses the Base64 URL string into a UTF-8 string. Encoding writes
 * the string as a Base64 URL string.
 *
 * **Example** (Converting Base64Url to a string)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const schema = Schema.String.pipe(
 *   Schema.decodeTo(Schema.String, SchemaTransformation.stringFromBase64UrlString)
 * )
 * Schema.decodeSync(schema)("aGVsbG8") // => "hello"
 * ```
 *
 * @see {@link stringFromBase64String}
 * @see `Schema.StringFromBase64Url` - a ready-made schema wrapping this transformation.
 *
 * @category encoding
 * @since 4.0.0
 */
export const stringFromBase64UrlString: Transformation<string, string> = new Transformation(
  SchemaGetter.decodeBase64UrlString(),
  SchemaGetter.encodeBase64Url()
)

/**
 * Decodes a hex encoded `string` into a UTF-8 `string` and encodes it back.
 *
 * **When to use**
 *
 * Use when you need a schema transformation for text data transmitted as
 * hexadecimal strings.
 *
 * **Details**
 *
 * Decoding parses the hex string into a UTF-8 string. Encoding writes the
 * string as a hex string.
 *
 * **Example** (Converting hex to a string)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const schema = Schema.String.pipe(
 *   Schema.decodeTo(Schema.String, SchemaTransformation.stringFromHexString)
 * )
 * Schema.decodeSync(schema)("68656c6c6f") // => "hello"
 * ```
 *
 * @see {@link stringFromBase64String}
 * @see `Schema.StringFromHex` - a ready-made schema wrapping this transformation.
 *
 * @category encoding
 * @since 4.0.0
 */
export const stringFromHexString: Transformation<string, string> = new Transformation(
  SchemaGetter.decodeHexString(),
  SchemaGetter.encodeHex()
)

/**
 * Decodes a URI component encoded string into a UTF-8 string and encodes a
 * UTF-8 string into a URI component encoded string.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to store structured data in URL
 * query parameters or fragments, such as composing with `Schema.parseJson` to
 * round-trip JSON through a URL.
 *
 * **Details**
 *
 * Decoding calls `decodeURIComponent` and fails if the input contains malformed
 * percent-encoding sequences. Encoding calls `encodeURIComponent`.
 *
 * **Example** (Defining a URI component schema)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const schema = Schema.String.pipe(
 *   Schema.decodeTo(Schema.String, SchemaTransformation.stringFromUriComponent)
 * )
 * Schema.decodeSync(schema)("hello%20world") // => "hello world"
 * ```
 *
 * @see {@link stringFromBase64String}
 * @see `Schema.StringFromUriComponent` - a ready-made schema wrapping this transformation.
 *
 * @category encoding
 * @since 4.0.0
 */
export const stringFromUriComponent: Transformation<string, string> = new Transformation(
  SchemaGetter.decodeUriComponent(),
  SchemaGetter.encodeUriComponent()
)

/**
 * Decodes a JSON string with `JSON.parse` and encodes a value with
 * `JSON.stringify`.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to decode JSON stored or
 * transmitted as a string, usually before composing with another schema that
 * validates the parsed structure.
 *
 * **Details**
 *
 * The `reviver` option is passed to `JSON.parse` during decoding. The
 * `replacer` and `space` options are passed to `JSON.stringify` during
 * encoding. Decode fails with `InvalidValue` for invalid JSON, and encode can
 * fail with `InvalidValue` when `JSON.stringify` cannot serialize the value.
 *
 * **Example** (Parsing JSON)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const schema = Schema.String.pipe(
 *   Schema.decodeTo(Schema.Unknown, SchemaTransformation.fromJsonString())
 * )
 * Schema.decodeSync(schema)("{\"ok\":true}") // => { ok: true }
 * ```
 *
 * @see {@link uint8ArrayFromBase64String}
 * @see {@link fromFormData}
 *
 * @category decoding
 * @since 4.0.0
 */
export function fromJsonString(options?: {
  readonly reviver?: Parameters<typeof JSON.parse>[1] | undefined
  readonly replacer?: SchemaGetter.JsonReplacer | undefined
  readonly space?: Parameters<typeof JSON.stringify>[2] | undefined
}): Transformation<unknown, string> {
  return new Transformation(
    SchemaGetter.parseJson(options ?? {}),
    SchemaGetter.stringifyJson(options)
  )
}

/**
 * Decodes a `FormData` instance into a nested record using bracket-path keys and
 * encodes object-like values back into `FormData`.
 *
 * **When to use**
 *
 * Use when you need a schema transformation for form or multipart payloads
 * whose keys, such as `user[name]` or `items[0]`, should become nested data.
 *
 * **Details**
 *
 * Decode preserves string and `Blob` leaves. Encode flattens nested objects and
 * arrays into bracket-path entries and returns an empty `FormData` for
 * non-object inputs.
 *
 * **Example** (Decoding FormData)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const schema = Schema.instanceOf(FormData).pipe(
 *   Schema.decodeTo(Schema.Unknown, SchemaTransformation.fromFormData)
 * )
 * const formData = new FormData()
 * formData.append("user[name]", "Alice")
 * Schema.decodeSync(schema)(formData) // => { user: { name: "Alice" } }
 * ```
 *
 * @see {@link fromURLSearchParams}
 * @see {@link fromJsonString}
 *
 * @category decoding
 * @since 4.0.0
 */
export const fromFormData = new Transformation<unknown, FormData>(
  SchemaGetter.decodeFormData(),
  SchemaGetter.encodeFormData()
)

/**
 * Decodes `URLSearchParams` into a nested record using bracket-path keys and
 * encodes object-like values back into `URLSearchParams`.
 *
 * **When to use**
 *
 * Use when you need a schema transformation for query strings whose keys, such
 * as `filter[name]` or `items[0]`, should become nested data.
 *
 * **Details**
 *
 * Decode produces string leaves. Encode flattens nested objects and arrays into
 * bracket-path entries and returns empty `URLSearchParams` for non-object
 * inputs.
 *
 * **Example** (Decoding URLSearchParams)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const schema = Schema.instanceOf(URLSearchParams).pipe(
 *   Schema.decodeTo(Schema.Unknown, SchemaTransformation.fromURLSearchParams)
 * )
 * Schema.decodeSync(schema)(new URLSearchParams("user[name]=Alice")) // => { user: { name: "Alice" } }
 * ```
 *
 * @see {@link fromFormData}
 * @see {@link fromJsonString}
 *
 * @category decoding
 * @since 4.0.0
 */
export const fromURLSearchParams = new Transformation<unknown, URLSearchParams>(
  SchemaGetter.decodeURLSearchParams(),
  SchemaGetter.encodeURLSearchParams()
)

/**
 * Decodes a numeric time-zone offset in milliseconds into a
 * `DateTime.TimeZone.Offset` and encodes it back to the offset number.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to represent fixed-offset time
 * zones with numeric millisecond offsets.
 *
 * **Details**
 *
 * Decode uses `DateTime.zoneMakeOffset`; encode returns the offset's `offset`
 * field.
 *
 * @see {@link timeZoneFromString} for IANA or offset string encodings
 * @see {@link timeZoneNamedFromString} for IANA named-zone strings
 *
 * @category transforming
 * @since 4.0.0
 */
export const timeZoneOffsetFromNumber: Transformation<DateTime.TimeZone.Offset, number> = transform<
  DateTime.TimeZone.Offset,
  number
>({
  decode: (n) => DateTime.zoneMakeOffset(n),
  encode: (tz) => tz.offset
})

/**
 * Decodes an IANA time-zone identifier string into a
 * `DateTime.TimeZone.Named` and encodes a named time zone back to its `id`.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to accept only IANA time-zone
 * identifier strings and produce `DateTime.TimeZone.Named` values.
 *
 * **Details**
 *
 * Decode fails with `InvalidValue` when the string is not a valid IANA time-zone
 * identifier.
 *
 * @see {@link timeZoneFromString} for time-zone strings that may be either IANA identifiers or offset strings
 *
 * @category transforming
 * @since 4.0.0
 */
export const timeZoneNamedFromString: Transformation<DateTime.TimeZone.Named, string> = transformEffect<
  DateTime.TimeZone.Named,
  string
>({
  decode: (s, options) => {
    return Option.match(DateTime.zoneMakeNamed(s), {
      onNone: () =>
        Effect.fail(
          new SchemaIssue.InvalidValue(
            { expected: "a valid IANA time zone" },
            s,
            options
          )
        ),
      onSome: Effect.succeed
    })
  },
  encode: (tz) => Effect.succeed(tz.id)
})

/**
 * Decodes a string into a `DateTime.TimeZone` and encodes a time zone back to
 * its string representation.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to accept either an IANA time-zone
 * identifier or an offset string and produce a general `DateTime.TimeZone`.
 *
 * **Details**
 *
 * Accepted decode inputs include valid IANA identifiers and offset strings such
 * as `"+03:00"`. Decode fails with `InvalidValue` when the string cannot be
 * parsed as a time zone.
 *
 * @see {@link timeZoneNamedFromString} for IANA named-zone strings only
 * @see {@link timeZoneOffsetFromNumber} for fixed-offset zones encoded as numbers
 *
 * @category transforming
 * @since 4.0.0
 */
export const timeZoneFromString: Transformation<DateTime.TimeZone, string> = transformEffect<
  DateTime.TimeZone,
  string
>({
  decode: (s, options) => {
    return Option.match(DateTime.zoneFromString(s), {
      onNone: () =>
        Effect.fail(
          new SchemaIssue.InvalidValue(
            { expected: "a valid time zone" },
            s,
            options
          )
        ),
      onSome: Effect.succeed
    })
  },
  encode: (tz) => Effect.succeed(DateTime.zoneToString(tz))
})

/**
 * Decodes a date-time string into a `DateTime.Utc` and encodes it back to an ISO
 * string.
 *
 * **When to use**
 *
 * Use when you need a schema transformation to decode date-time strings to a
 * normalized `DateTime.Utc` and encode back as a UTC ISO string.
 *
 * **Details**
 *
 * Decode accepts strings supported by `DateTime.make`, converts the result to
 * UTC, and fails with `InvalidValue` when parsing fails. Encode uses
 * `DateTime.formatIso`.
 *
 * @see {@link dateFromString} for decoding into JavaScript `Date`
 * @see {@link dateTimeZonedFromString} for ISO strings that should preserve zoned date-time information
 *
 * @category transforming
 * @since 4.0.0
 */
export const dateTimeUtcFromString: Transformation<DateTime.Utc, string> = transformEffect<
  DateTime.Utc,
  string
>({
  decode: (s, options) => {
    return Option.match(DateTime.make(s), {
      onNone: () =>
        Effect.fail(
          new SchemaIssue.InvalidValue(
            { expected: "a valid UTC DateTime string" },
            s,
            options
          )
        ),
      onSome: (result) => Effect.succeed(DateTime.toUtc(result))
    })
  },
  encode: (utc) => Effect.succeed(DateTime.formatIso(utc))
})

/**
 * Decodes a zoned date-time string into a `DateTime.Zoned` and encodes it back
 * to an ISO zoned string.
 *
 * **When to use**
 *
 * Use when you need a schema transformation for ISO zoned date-time strings
 * that decode to `DateTime.Zoned` and encode with `DateTime.formatIsoZoned`.
 *
 * **Details**
 *
 * Decode uses `DateTime.makeZonedFromString` and fails with `InvalidValue` when
 * the input is not a valid zoned date-time. Encode uses
 * `DateTime.formatIsoZoned`.
 *
 * @see {@link dateTimeUtcFromString} for date-time strings that should decode to `DateTime.Utc` and encode as UTC ISO strings
 *
 * @category transforming
 * @since 4.0.0
 */
export const dateTimeZonedFromString: Transformation<DateTime.Zoned, string> = transformEffect<
  DateTime.Zoned,
  string
>({
  decode: (s, options) => {
    return Option.match(DateTime.makeZonedFromString(s), {
      onNone: () =>
        Effect.fail(
          new SchemaIssue.InvalidValue(
            { expected: "a valid Zoned DateTime string" },
            s,
            options
          )
        ),
      onSome: Effect.succeed
    })
  },
  encode: (zoned) => Effect.succeed(DateTime.formatIsoZoned(zoned))
})
