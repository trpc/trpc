/**
 * Runs schemas against real values.
 *
 * Schema parsers construct values from schema input, check whether a value
 * matches a schema, decode encoded input, and encode decoded values back to
 * their external form. This module exposes those operations through several
 * result styles, including `Effect`, `Promise`, `Exit`, `Option`, `Result`, and
 * synchronous functions that throw. It also contains the lower-level runner that
 * walks a schema AST and reports schema failures as `SchemaIssue.Issue` values.
 *
 * @since 4.0.0
 */
import * as Cause from "./Cause.ts"
import * as Effect from "./Effect.ts"
import * as Exit from "./Exit.ts"
import { effectIsExit } from "./internal/effect.ts"
import * as InternalSchemaCause from "./internal/schema/cause.ts"
import * as CompilerRegistry from "./internal/schema/compilerRegistry.ts"
import * as InternalParser from "./internal/schema/parser.ts"
import * as Option from "./Option.ts"
import * as Result from "./Result.ts"
import type * as Schema from "./Schema.ts"
import * as SchemaAST from "./SchemaAST.ts"
import * as SchemaIssue from "./SchemaIssue.ts"

/**
 * Creates an effectful maker for the schema's decoded type side.
 *
 * **When to use**
 *
 * Use to construct decoded schema values in `Effect` while preserving
 * construction failures as `SchemaIssue.Issue` values in the error channel.
 *
 * **Details**
 *
 * The returned function accepts constructor input, applies constructor defaults,
 * runs type-side validation unless checks are disabled, and fails with a
 * `SchemaIssue.Issue` when construction fails.
 *
 * @category constructors
 * @since 4.0.0
 */
export function makeEffect<S extends Schema.Constraint>(schema: S) {
  const ast = schema.ast
  let parser: ReturnType<typeof runWithCompiler<S["Type"], never>>
  return (input: S["~type.make.in"], options?: Schema.MakeOptions): Effect.Effect<S["Type"], SchemaIssue.Issue> => {
    return (parser ??= runWithCompiler<S["Type"], never>(constructorCompiler, SchemaAST.toType(ast)))(
      input,
      options?.disableChecks
        ? options?.parseOptions ? { ...options.parseOptions, disableChecks: true } : { disableChecks: true }
        : options?.parseOptions
    )
  }
}

/**
 * Creates a synchronous maker that returns `Option.some` with the constructed
 * value on success, or `Option.none` when construction fails with schema issues.
 *
 * **When to use**
 *
 * Use when you need to validate schema constructor input and only care whether
 * construction succeeds, without exposing `SchemaIssue.Issue` details.
 *
 * **Gotchas**
 *
 * Only causes made entirely of schema issues are converted to `Option.none`.
 * Causes that contain defects, interruptions, or asynchronous work at this
 * synchronous boundary throw an `Error` whose cause is the underlying `Cause`.
 *
 * @category constructors
 * @since 4.0.0
 */
export function makeOption<S extends Schema.Constraint>(schema: S) {
  const parser = makeEffect(schema)
  return (input: S["~type.make.in"], options?: Schema.MakeOptions): Option.Option<S["Type"]> => {
    const exit = Effect.runSyncExit(parser(input, options))
    if (Exit.isSuccess(exit)) {
      return Option.some(exit.value)
    }
    InternalSchemaCause.getSchemaIssueOrThrow(exit.cause, "Option adapter can only return none for schema issues")
    return Option.none()
  }
}

/**
 * Creates a synchronous maker for the schema's decoded type side.
 *
 * **When to use**
 *
 * Use to construct decoded schema values synchronously when invalid input
 * should throw an `Error` whose cause is `SchemaIssue.Issue`.
 *
 * **Details**
 *
 * The returned function constructs a value from constructor input and throws an
 * `Error` with the `SchemaIssue.Issue` in its `cause` when construction fails.
 * Schema validation failures use the generic message `"Schema validation failed"`.
 * Format the `cause` explicitly with `SchemaIssue.makeFormatterDefault()` when
 * human-readable details are needed.
 *
 * **Gotchas**
 *
 * Causes that contain defects, interruptions, or asynchronous work at this
 * synchronous boundary throw an `Error` whose cause is the underlying `Cause`,
 * instead of being converted to a schema validation error.
 *
 * @category constructors
 * @since 4.0.0
 */
export function make<S extends Schema.Constraint>(schema: S) {
  return makeConstructorSync<S["Type"], S["~type.make.in"]>(SchemaAST.toType(schema.ast))
}

/**
 * Creates a type guard that checks whether an input satisfies the schema's decoded
 * type side.
 *
 * **When to use**
 *
 * Use to build a type guard for checking the decoded side of a schema without
 * exposing issue details.
 *
 * **Details**
 *
 * The guard returns `true` on successful validation and `false` when validation
 * fails only with schema issues, without exposing issue details.
 *
 * **Gotchas**
 *
 * Only causes made entirely of schema issues are converted to `false`. Causes
 * that contain defects, interruptions, or asynchronous work at this synchronous
 * boundary throw an `Error` whose cause is the underlying `Cause`.
 *
 * @category guards
 * @since 3.10.0
 */
export function is<S extends Schema.Constraint>(schema: S): <I>(input: I) => input is I & S["Type"] {
  return _is<S["Type"]>(schema.ast)
}

function makeIs<T>(ast: SchemaAST.AST): <I>(input: I) => input is I & T {
  if (!CompilerRegistry.compilerAdaptersEnabled) {
    const parser = asExit(run<T, never>(ast))
    return <I>(input: I): input is I & T => {
      const exit = parser(input, SchemaAST.defaultParseOptions)
      if (Exit.isSuccess(exit)) return true
      InternalSchemaCause.getSchemaIssueOrThrow(
        exit.cause,
        "Type guard adapter can only return false for schema issues"
      )
      return false
    }
  }
  const entry = CompilerRegistry.resolve(ast)
  const guard = entry.is
  if (guard !== undefined) {
    return <I>(input: I): input is I & T => {
      try {
        return guard(input, SchemaAST.defaultParseOptions)
      } catch (error) {
        InternalSchemaCause.getSchemaIssueOrThrow(
          Cause.die(error),
          "Type guard adapter can only return false for schema issues"
        )
        return false
      }
    }
  }
  const parser = entry.parser
  return <I>(input: I): input is I & T => {
    const exit = Effect.runSyncExit(parserResult<T, never>(parser(input, SchemaAST.defaultParseOptions), input))
    if (Exit.isSuccess(exit)) return true
    InternalSchemaCause.getSchemaIssueOrThrow(exit.cause, "Type guard adapter can only return false for schema issues")
    return false
  }
}

/** @internal */
export function _is<T>(ast: SchemaAST.AST) {
  const typeAST = SchemaAST.toType(ast)
  let guard: <I>(input: I) => input is I & T = <I>(input: I): input is I & T => {
    guard = makeIs<T>(typeAST)
    return guard(input)
  }
  return <I>(input: I): input is I & T => {
    return guard(input)
  }
}

/** @internal */
export function _issue<T>(ast: SchemaAST.AST) {
  const parser = run<T, never>(ast)
  return (input: unknown, options: SchemaAST.ParseOptions): SchemaIssue.Issue | undefined => {
    const exit = Effect.runSyncExit(parser(input, options))
    if (Exit.isSuccess(exit)) {
      return undefined
    }
    return InternalSchemaCause.getSchemaIssueOrThrow(exit.cause, "Issue adapter can only return schema issues")
  }
}

/**
 * Asserts that an input satisfies the schema's decoded type side.
 *
 * **When to use**
 *
 * Use to assert that an input satisfies the decoded side of a schema when schema
 * validation failures should throw an `Error` whose cause is `SchemaIssue.Issue`.
 *
 * **Details**
 *
 * The assertion returns normally when validation succeeds. When the input does
 * not satisfy the schema with a schema-only failure, it throws an `Error` with
 * the `SchemaIssue.Issue` in its `cause`.
 * Schema validation failures use the generic message `"Schema validation failed"`.
 * Format the `cause` explicitly with `SchemaIssue.makeFormatterDefault()` when
 * human-readable details are needed.
 *
 * **Gotchas**
 *
 * Causes that contain defects, interruptions, or asynchronous work at this
 * synchronous boundary throw an `Error` whose cause is the underlying `Cause`,
 * instead of being converted to a schema validation error.
 *
 * @category guards
 * @since 4.0.0
 */
export function asserts<S extends Schema.Constraint, I>(schema: S, input: I): asserts input is I & S["Type"] {
  const ast = SchemaAST.toType(schema.ast)
  const result = CompilerRegistry.resolve(ast).parser(input, SchemaAST.defaultParseOptions)
  const exit = Effect.runSyncExit(parserResult<S["Type"], never>(result, input))
  if (Exit.isFailure(exit)) {
    const issue = InternalSchemaCause.getSchemaIssueOrThrow(
      exit.cause,
      "Assertion adapter can only throw schema issues"
    )
    throw new Error("Schema validation failed", { cause: issue })
  }
}

/**
 * Creates an effectful decoder for `unknown` input.
 *
 * **When to use**
 *
 * Use when you need to decode untyped boundary input in an `Effect` whose
 * failure channel is `SchemaIssue.Issue`, while preserving transformations
 * and service requirements.
 *
 * **Details**
 *
 * The returned function succeeds with the schema's decoded `Type` or fails with a
 * `SchemaIssue.Issue`. Decoding service requirements are preserved in the returned
 * `Effect`. Parse options may be provided when creating the decoder and overridden
 * when applying it.
 *
 * @see {@link decodeEffect} for input already typed as the schema's `Encoded` type
 *
 * @category decoding
 * @since 4.0.0
 */
export function decodeUnknownEffect<S extends Schema.Constraint>(
  schema: S,
  options?: SchemaAST.ParseOptions
): (
  input: unknown,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<S["Type"], SchemaIssue.Issue, S["DecodingServices"]> {
  const parser = run<S["Type"], S["DecodingServices"]>(schema.ast)
  return options === undefined
    ? parser
    : (input, overrideOptions) => parser(input, mergeParseOptions(options, overrideOptions))
}

/**
 * Creates an effectful decoder for input already typed as the schema's `Encoded`
 * type.
 *
 * **When to use**
 *
 * Use when you already have input typed as the schema's `Encoded` type and
 * need an `Effect` whose failure channel is `SchemaIssue.Issue`, while
 * preserving decoding service requirements.
 *
 * **Details**
 *
 * The returned function succeeds with the decoded `Type` or fails with a
 * `SchemaIssue.Issue`, preserving any decoding service requirements in the
 * returned `Effect`.
 *
 * @see {@link decodeUnknownEffect} for untyped boundary input
 * @see {@link encodeEffect} for the opposite direction
 *
 * @category decoding
 * @since 4.0.0
 */
export const decodeEffect: <S extends Schema.Constraint>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (
  input: S["Encoded"],
  options?: SchemaAST.ParseOptions
) => Effect.Effect<S["Type"], SchemaIssue.Issue, S["DecodingServices"]> = decodeUnknownEffect

/**
 * Creates a Promise-based decoder for `unknown` input.
 *
 * **When to use**
 *
 * Use when you need to decode untyped input with a service-free schema and
 * return a JavaScript `Promise`.
 *
 * **Details**
 *
 * The returned function resolves with the decoded `Type` on success and rejects
 * with an `Error` whose cause is a `SchemaIssue.Issue` on decoding failure.
 * Schema validation failures use the generic message `"Schema validation failed"`.
 * Format the `cause` explicitly with `SchemaIssue.makeFormatterDefault()` when
 * human-readable details are needed.
 *
 * **Gotchas**
 *
 * Causes that contain defects, interruptions, or other non-schema reasons reject
 * with an `Error` whose cause is the underlying `Cause`.
 *
 * @see {@link decodePromise} for input already typed as the schema's `Encoded` type
 * @see {@link decodeUnknownEffect} for schemas that require decoding services or when failures should remain in `Effect`
 *
 * @category decoding
 * @since 3.10.0
 */
export function decodeUnknownPromise<S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
): (input: unknown, options?: SchemaAST.ParseOptions) => Promise<S["Type"]> {
  return asPromise(decodeUnknownEffect(schema, options))
}

/**
 * Creates a Promise-based decoder for input already typed as the schema's
 * `Encoded` type.
 *
 * **When to use**
 *
 * Use when you already have input typed as the schema's `Encoded` type and need
 * decoding to return a JavaScript `Promise`.
 *
 * **Details**
 *
 * The returned function resolves with the decoded `Type` on success and rejects
 * with an `Error` whose cause is a `SchemaIssue.Issue` on decoding failure.
 * Schema validation failures use the generic message `"Schema validation failed"`.
 * Format the `cause` explicitly with `SchemaIssue.makeFormatterDefault()` when
 * human-readable details are needed.
 *
 * **Gotchas**
 *
 * Causes that contain defects, interruptions, or other non-schema reasons reject
 * with an `Error` whose cause is the underlying `Cause`.
 *
 * @see {@link decodeUnknownPromise} for untyped input returning a JavaScript `Promise`
 * @see {@link decodeEffect} for preserving decoding services and failures in `Effect`
 *
 * @category decoding
 * @since 3.10.0
 */
export function decodePromise<S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
): (input: S["Encoded"], options?: SchemaAST.ParseOptions) => Promise<S["Type"]> {
  return asPromise(decodeEffect(schema, options))
}

/**
 * Creates a synchronous decoder for `unknown` input that reports failure safely
 * as an `Exit`.
 *
 * **When to use**
 *
 * Use when you need to decode unknown input synchronously into an `Exit` whose
 * failure contains `SchemaIssue.Issue`.
 *
 * **Details**
 *
 * The returned function produces `Exit.Success` with the decoded `Type`.
 * Schema issues are represented by an `Exit.Failure` cause containing a
 * `SchemaIssue.Issue`.
 *
 * **Gotchas**
 *
 * Because this adapter runs synchronously, async decoding work can produce an
 * `Exit.Failure` with a defect cause. When the cause contains both schema
 * issues and non-schema reasons, all reasons remain in the returned `Cause`.
 *
 * @see {@link decodeExit} for input already typed as the schema's `Encoded` type
 * @see {@link decodeUnknownEffect} for preserving decoding services and failures in `Effect`
 * @see {@link decodeUnknownResult} for returning schema issues as data
 * @see {@link decodeUnknownSync} for throwing on decoding failure
 *
 * @category decoding
 * @since 4.0.0
 */
export function decodeUnknownExit<S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
): (input: unknown, options?: SchemaAST.ParseOptions) => Exit.Exit<S["Type"], SchemaIssue.Issue> {
  return asExit(decodeUnknownEffect(schema, options))
}

/**
 * Creates a synchronous decoder for input already typed as the schema's `Encoded`
 * type, reporting failure safely as an `Exit`.
 *
 * **When to use**
 *
 * Use when you need synchronous decoding of already typed `Encoded` input into
 * an `Exit` whose failure contains `SchemaIssue.Issue`.
 *
 * **Details**
 *
 * The returned function produces `Exit.Success` with the decoded `Type` or
 * `Exit.Failure` with a `SchemaIssue.Issue`.
 *
 * **Gotchas**
 *
 * Because this adapter runs synchronously, async decoding work can produce an
 * `Exit.Failure` with a defect cause. When the cause contains both schema
 * issues and non-schema reasons, all reasons remain in the returned `Cause`.
 *
 * @see {@link decodeUnknownExit} for untyped input with the same `Exit` result shape
 * @see {@link decodeEffect} for preserving decoding services and failures in `Effect`
 *
 * @category decoding
 * @since 4.0.0
 */
export const decodeExit: <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (input: S["Encoded"], options?: SchemaAST.ParseOptions) => Exit.Exit<S["Type"], SchemaIssue.Issue> =
  decodeUnknownExit

/** @internal */
export function decodeUnknownOption<S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
): (input: unknown, options?: SchemaAST.ParseOptions) => Option.Option<S["Type"]> {
  return asOption(decodeUnknownEffect(schema, options))
}

/** @internal */
export const decodeOption: <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (input: S["Encoded"], options?: SchemaAST.ParseOptions) => Option.Option<S["Type"]> = decodeUnknownOption

/**
 * Creates a decoder for `unknown` input that reports failure safely as a
 * `Result`.
 *
 * **When to use**
 *
 * Use when decoding untyped boundary input and you want `SchemaIssue.Issue`
 * failures returned as data in a `Result`.
 *
 * **Details**
 *
 * The returned function produces `Result.succeed` with the decoded `Type` on
 * success or `Result.fail` with a `SchemaIssue.Issue` on decoding failure.
 *
 * **Gotchas**
 *
 * This adapter runs synchronously. Causes made entirely of schema issues become
 * `Result.fail`, but causes that contain defects, interruptions, or asynchronous
 * work at this synchronous boundary throw instead.
 *
 * @see {@link decodeResult} for input already typed as the schema's `Encoded` type
 * @see {@link decodeUnknownEffect} for effectful or service-requiring decoding
 *
 * @category decoding
 * @since 4.0.0
 */
export function decodeUnknownResult<S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
): (input: unknown, options?: SchemaAST.ParseOptions) => Result.Result<S["Type"], SchemaIssue.Issue> {
  return asResult(decodeUnknownEffect(schema, options))
}

/**
 * Creates a decoder for input already typed as the schema's `Encoded` type,
 * reporting failure safely as a `Result`.
 *
 * **When to use**
 *
 * Use when you already have input typed as the schema's `Encoded` type and want
 * schema decoding failures represented as `Result.fail` with `SchemaIssue.Issue`.
 *
 * **Details**
 *
 * The returned function produces `Result.succeed` with the decoded `Type` on
 * success or `Result.fail` with a `SchemaIssue.Issue` on decoding failure.
 *
 * **Gotchas**
 *
 * This synchronous adapter returns `Result.fail` for causes made entirely of
 * schema issues, but causes that contain defects, interruptions, or other
 * non-schema reasons throw instead.
 *
 * @see {@link decodeUnknownResult} for untyped input with the same `Result` shape
 * @see {@link decodeEffect} for effectful or service-requiring decoding
 *
 * @category decoding
 * @since 4.0.0
 */
export const decodeResult: <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (input: S["Encoded"], options?: SchemaAST.ParseOptions) => Result.Result<S["Type"], SchemaIssue.Issue> =
  decodeUnknownResult

/**
 * Creates a synchronous decoder for `unknown` input.
 *
 * **When to use**
 *
 * Use to decode untrusted or dynamically typed input at a synchronous boundary
 * where invalid data should throw an `Error` whose cause is `SchemaIssue.Issue`.
 *
 * **Details**
 *
 * The returned function returns the decoded `Type` on success and throws an
 * `Error` with the `SchemaIssue.Issue` in its `cause` on decoding failure.
 * Schema validation failures use the generic message `"Schema validation failed"`.
 * Format the `cause` explicitly with `SchemaIssue.makeFormatterDefault()` when
 * human-readable details are needed.
 *
 * **Gotchas**
 *
 * Causes that contain defects, interruptions, or asynchronous work at this
 * synchronous boundary throw an `Error` whose cause is the underlying `Cause`,
 * instead of being converted to a schema validation error.
 *
 * @see {@link decodeSync} for input already typed as the schema's `Encoded` type
 * @see {@link decodeUnknownEffect} for preserving decoding failures in `Effect`
 * @see {@link decodeUnknownResult} for returning schema issues as data
 *
 * @category decoding
 * @since 3.10.0
 */
export function decodeUnknownSync<S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
): (input: unknown, options?: SchemaAST.ParseOptions) => S["Type"] {
  return CompilerRegistry.compilerAdaptersEnabled
    ? makeSync(schema.ast, options)
    : asSync(decodeUnknownEffect(schema, options))
}

/**
 * Creates a synchronous decoder for input already typed as the schema's `Encoded`
 * type.
 *
 * **When to use**
 *
 * Use to decode values already typed as the schema's `Encoded` input when
 * decoding failure should throw an `Error` whose cause is `SchemaIssue.Issue`.
 *
 * **Details**
 *
 * The returned function returns the decoded `Type` on success and throws an
 * `Error` with the `SchemaIssue.Issue` in its `cause` on decoding failure.
 * Schema validation failures use the generic message `"Schema validation failed"`.
 * Format the `cause` explicitly with `SchemaIssue.makeFormatterDefault()` when
 * human-readable details are needed.
 *
 * **Gotchas**
 *
 * Causes that contain defects, interruptions, or asynchronous work at this
 * synchronous boundary throw an `Error` whose cause is the underlying `Cause`,
 * instead of being converted to a schema validation error.
 *
 * @see {@link decodeUnknownSync} for untrusted or dynamically typed input
 * @see {@link decodeResult} for returning schema issues as data
 * @see {@link decodeEffect} for preserving decoding failures in `Effect`
 *
 * @category decoding
 * @since 3.10.0
 */
export const decodeSync: <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (input: S["Encoded"], options?: SchemaAST.ParseOptions) => S["Type"] = decodeUnknownSync

/**
 * Creates an effectful encoder for `unknown` input.
 *
 * **When to use**
 *
 * Use when you need to encode untyped boundary input in an `Effect` whose
 * failure channel is `SchemaIssue.Issue`, while preserving service
 * requirements.
 *
 * **Details**
 *
 * The returned function succeeds with the schema's `Encoded` value or fails with a
 * `SchemaIssue.Issue`. Encoding service requirements are preserved in the returned
 * `Effect`. Parse options may be provided when creating the encoder and overridden
 * when applying it.
 *
 * @see {@link encodeEffect} for the typed-input variant when the value is already typed as the schema's decoded `Type`
 *
 * @category encoding
 * @since 4.0.0
 */
export function encodeUnknownEffect<S extends Schema.Constraint>(
  schema: S,
  options?: SchemaAST.ParseOptions
): (
  input: unknown,
  options?: SchemaAST.ParseOptions
) => Effect.Effect<S["Encoded"], SchemaIssue.Issue, S["EncodingServices"]> {
  const parser = run<S["Encoded"], S["EncodingServices"]>(SchemaAST.flip(schema.ast))
  return options === undefined
    ? parser
    : (input, overrideOptions) => parser(input, mergeParseOptions(options, overrideOptions))
}

/**
 * Creates an effectful encoder for input already typed as the schema's decoded
 * `Type`.
 *
 * **When to use**
 *
 * Use when you need to encode values already typed as the schema's decoded
 * `Type` in an `Effect` whose failure channel is `SchemaIssue.Issue`, while
 * preserving service requirements.
 *
 * **Details**
 *
 * The returned function succeeds with the schema's `Encoded` value or fails with a
 * `SchemaIssue.Issue`, preserving any encoding service requirements in the
 * returned `Effect`.
 *
 * @see {@link encodeUnknownEffect} for encoding unknown input before the value is statically typed as the schema's `Type`
 *
 * @category encoding
 * @since 4.0.0
 */
export const encodeEffect: <S extends Schema.Constraint>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (
  input: S["Type"],
  options?: SchemaAST.ParseOptions
) => Effect.Effect<S["Encoded"], SchemaIssue.Issue, S["EncodingServices"]> = encodeUnknownEffect

/**
 * Creates a Promise-based encoder for `unknown` input.
 *
 * **When to use**
 *
 * Use when you need to encode untrusted or dynamically typed values with a
 * service-free schema and return a JavaScript `Promise`.
 *
 * **Details**
 *
 * The returned function resolves with the schema's `Encoded` value on success and
 * rejects with an `Error` whose cause is a `SchemaIssue.Issue` on encoding failure.
 * Schema validation failures use the generic message `"Schema validation failed"`.
 * Format the `cause` explicitly with `SchemaIssue.makeFormatterDefault()` when
 * human-readable details are needed.
 *
 * **Gotchas**
 *
 * Causes that contain defects, interruptions, or other non-schema reasons reject
 * with an `Error` whose cause is the underlying `Cause`.
 *
 * @see {@link encodePromise} for input already typed as the schema's decoded `Type`
 * @see {@link encodeUnknownEffect} for schemas that require encoding services or when failures should remain in `Effect`
 *
 * @category encoding
 * @since 3.10.0
 */
export const encodeUnknownPromise = <S extends Schema.ConstraintEncoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
): (input: unknown, options?: SchemaAST.ParseOptions) => Promise<S["Encoded"]> =>
  asPromise(encodeUnknownEffect(schema, options))

/**
 * Creates a Promise-based encoder for input already typed as the schema's decoded
 * `Type`.
 *
 * **When to use**
 *
 * Use when you already have values typed as the schema's decoded `Type` and
 * need encoding to return a JavaScript `Promise`.
 *
 * **Details**
 *
 * The returned function resolves with the schema's `Encoded` value on success and
 * rejects with an `Error` whose cause is a `SchemaIssue.Issue` on encoding failure.
 * Schema validation failures use the generic message `"Schema validation failed"`.
 * Format the `cause` explicitly with `SchemaIssue.makeFormatterDefault()` when
 * human-readable details are needed.
 *
 * **Gotchas**
 *
 * Causes that contain defects, interruptions, or other non-schema reasons reject
 * with an `Error` whose cause is the underlying `Cause`.
 *
 * @see {@link encodeUnknownPromise} for encoding untyped input
 * @see {@link encodeEffect} for effectful encoding or schemas with encoding service requirements
 *
 * @category encoding
 * @since 3.10.0
 */
export const encodePromise: <S extends Schema.ConstraintEncoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (input: S["Type"], options?: SchemaAST.ParseOptions) => Promise<S["Encoded"]> = encodeUnknownPromise

/**
 * Creates a synchronous encoder for `unknown` input that reports failure safely
 * as an `Exit`.
 *
 * **When to use**
 *
 * Use when you need synchronous encoding of unknown input into an `Exit` whose
 * failure contains `SchemaIssue.Issue`.
 *
 * **Details**
 *
 * The returned function produces `Exit.Success` with the schema's `Encoded` value
 * or `Exit.Failure` with a `SchemaIssue.Issue`.
 *
 * **Gotchas**
 *
 * Because this adapter runs synchronously, async encoding work can produce an
 * `Exit.Failure` with a defect cause. When the cause contains both schema
 * issues and non-schema reasons, all reasons remain in the returned `Cause`.
 *
 * @see {@link encodeExit} for input already typed as the schema's decoded `Type`
 * @see {@link encodeUnknownEffect} for effectful encoding that preserves service requirements
 *
 * @category encoding
 * @since 4.0.0
 */
export function encodeUnknownExit<S extends Schema.ConstraintEncoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
): (input: unknown, options?: SchemaAST.ParseOptions) => Exit.Exit<S["Encoded"], SchemaIssue.Issue> {
  return asExit(encodeUnknownEffect(schema, options))
}

/**
 * Creates a synchronous encoder for input already typed as the schema's decoded
 * `Type`, reporting failure safely as an `Exit`.
 *
 * **When to use**
 *
 * Use when you need synchronous encoding of already typed schema values into
 * an `Exit` whose failure contains `SchemaIssue.Issue`.
 *
 * **Details**
 *
 * The returned function produces `Exit.Success` with the schema's `Encoded` value
 * or `Exit.Failure` with a `SchemaIssue.Issue`.
 *
 * **Gotchas**
 *
 * Because this adapter runs synchronously, async encoding work can produce an
 * `Exit.Failure` with a defect cause. When the cause contains both schema
 * issues and non-schema reasons, all reasons remain in the returned `Cause`.
 *
 * @see {@link encodeUnknownExit} for unknown input with the same `Exit` result shape
 * @see {@link encodeEffect} for effectful encoding that preserves service requirements
 *
 * @category encoding
 * @since 4.0.0
 */
export const encodeExit: <S extends Schema.ConstraintEncoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (input: S["Type"], options?: SchemaAST.ParseOptions) => Exit.Exit<S["Encoded"], SchemaIssue.Issue> =
  encodeUnknownExit

/** @internal */
export function encodeUnknownOption<S extends Schema.ConstraintEncoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
): (input: unknown, options?: SchemaAST.ParseOptions) => Option.Option<S["Encoded"]> {
  return asOption(encodeUnknownEffect(schema, options))
}

/** @internal */
export const encodeOption: <S extends Schema.ConstraintEncoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (input: S["Type"], options?: SchemaAST.ParseOptions) => Option.Option<S["Encoded"]> = encodeUnknownOption

/**
 * Creates an encoder for `unknown` input that reports failure safely as a
 * `Result`.
 *
 * **When to use**
 *
 * Use when encoding values from an unknown or dynamically typed boundary
 * synchronously, and you want `SchemaIssue.Issue` failures returned as `Result`
 * data.
 *
 * **Details**
 *
 * The returned function produces `Result.succeed` with the schema's `Encoded`
 * value on success or `Result.fail` with a `SchemaIssue.Issue` on encoding
 * failure.
 *
 * **Gotchas**
 *
 * This adapter runs synchronously. Causes made entirely of schema issues become
 * `Result.fail`, but causes that contain defects, interruptions, or asynchronous
 * work at this synchronous boundary throw instead.
 *
 * @see {@link encodeResult} for input already typed as the schema's decoded `Type`
 * @see {@link encodeUnknownEffect} for effectful encoding, including schemas with encoding service requirements
 *
 * @category encoding
 * @since 4.0.0
 */
export function encodeUnknownResult<S extends Schema.ConstraintEncoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
): (input: unknown, options?: SchemaAST.ParseOptions) => Result.Result<S["Encoded"], SchemaIssue.Issue> {
  return asResult(encodeUnknownEffect(schema, options))
}

/**
 * Creates an encoder for input already typed as the schema's decoded `Type`,
 * reporting failure safely as a `Result`.
 *
 * **When to use**
 *
 * Use when you already have input typed as the schema's decoded `Type` and want
 * encoding failures returned as `Result.fail` with `SchemaIssue.Issue`.
 *
 * **Details**
 *
 * The returned function produces `Result.succeed` with the schema's `Encoded`
 * value on success or `Result.fail` with a `SchemaIssue.Issue` on encoding
 * failure.
 *
 * **Gotchas**
 *
 * This synchronous adapter returns `Result.fail` for causes made entirely of
 * schema issues, but causes that contain defects, interruptions, or other
 * non-schema reasons throw instead.
 *
 * @see {@link encodeUnknownResult} for the same `Result` shape when the input is not already typed
 *
 * @category encoding
 * @since 4.0.0
 */
export const encodeResult: <S extends Schema.ConstraintEncoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (input: S["Type"], options?: SchemaAST.ParseOptions) => Result.Result<S["Encoded"], SchemaIssue.Issue> =
  encodeUnknownResult

/**
 * Creates a synchronous encoder for `unknown` input.
 *
 * **When to use**
 *
 * Use when you need to encode values from untyped input in synchronous code and
 * want encoding failures to throw an `Error` whose cause is `SchemaIssue.Issue`.
 *
 * **Details**
 *
 * The returned function returns the schema's `Encoded` value on success and throws
 * an `Error` with the `SchemaIssue.Issue` in its `cause` on encoding failure.
 * Schema validation failures use the generic message `"Schema validation failed"`.
 * Format the `cause` explicitly with `SchemaIssue.makeFormatterDefault()` when
 * human-readable details are needed.
 *
 * **Gotchas**
 *
 * Causes that contain defects, interruptions, or asynchronous work at this
 * synchronous boundary throw an `Error` whose cause is the underlying `Cause`,
 * instead of being converted to a schema validation error.
 *
 * @see {@link encodeSync} for input already typed as the schema's decoded `Type`
 * @see {@link encodeUnknownEffect} for effectful encoding that preserves service requirements
 *
 * @category encoding
 * @since 3.10.0
 */
export function encodeUnknownSync<S extends Schema.ConstraintEncoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
): (input: unknown, options?: SchemaAST.ParseOptions) => S["Encoded"] {
  return CompilerRegistry.compilerAdaptersEnabled
    ? makeSync(SchemaAST.flip(schema.ast), options)
    : asSync(encodeUnknownEffect(schema, options))
}

/**
 * Creates a synchronous encoder for input already typed as the schema's decoded
 * `Type`.
 *
 * **When to use**
 *
 * Use to encode already typed schema values synchronously when encoding failure
 * should throw an `Error` whose cause is `SchemaIssue.Issue`.
 *
 * **Details**
 *
 * The returned function returns the schema's `Encoded` value on success and throws
 * an `Error` with the `SchemaIssue.Issue` in its `cause` on encoding failure.
 * Schema validation failures use the generic message `"Schema validation failed"`.
 * Format the `cause` explicitly with `SchemaIssue.makeFormatterDefault()` when
 * human-readable details are needed.
 *
 * **Gotchas**
 *
 * Causes that contain defects, interruptions, or asynchronous work at this
 * synchronous boundary throw an `Error` whose cause is the underlying `Cause`,
 * instead of being converted to a schema validation error.
 *
 * @see {@link encodeUnknownSync} for unknown input with the same throwing boundary
 * @see {@link encodeResult} for returning schema issues as data
 * @see {@link encodeEffect} for effectful encoding that preserves service requirements
 *
 * @category encoding
 * @since 3.10.0
 */
export const encodeSync: <S extends Schema.ConstraintEncoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (input: S["Type"], options?: SchemaAST.ParseOptions) => S["Encoded"] = encodeUnknownSync

const mergeParseOptions = (
  options: SchemaAST.ParseOptions,
  overrideOptions: SchemaAST.ParseOptions | undefined
): SchemaAST.ParseOptions => overrideOptions ? { ...options, ...overrideOptions } : options

const getValue = (value: unknown): Effect.Effect<any, SchemaIssue.Issue> => {
  if (value === InternalParser.missing) {
    return Effect.fail(new SchemaIssue.InvalidValue())
  }
  return Effect.succeed(value)
}

/** @internal */
export function run<T, R>(ast: SchemaAST.AST) {
  return runWithCompiler<T, R>(normalCompiler, ast)
}

function parserResult<T, R>(
  result: Effect.Effect<unknown, SchemaIssue.Issue, any>,
  input: unknown
): Effect.Effect<T, SchemaIssue.Issue, R> {
  if (result === InternalParser.sameExit) {
    return Effect.succeed(input) as Effect.Effect<T, SchemaIssue.Issue, R>
  }
  if (!effectIsExit(result)) {
    return Effect.flatMapEager(result, getValue)
  }
  return (result as InternalParser.Success<unknown, SchemaIssue.Issue>)[InternalParser.args] ===
      InternalParser.missing
    ? getValue(InternalParser.missing)
    : result as Effect.Effect<T, SchemaIssue.Issue, R>
}

function runWithCompiler<T, R>(compiler: Compiler, ast: SchemaAST.AST) {
  let parser: Parser
  return (input: unknown, options?: SchemaAST.ParseOptions): Effect.Effect<T, SchemaIssue.Issue, R> => {
    const result = (parser ??= compiler(ast))(
      input,
      options ?? SchemaAST.defaultParseOptions
    )
    if (result === InternalParser.sameExit) {
      return Effect.succeed(input) as Effect.Effect<T, SchemaIssue.Issue, R>
    }
    if (!effectIsExit(result)) {
      return Effect.flatMapEager(result, getValue)
    }
    return (result as InternalParser.Success<unknown, SchemaIssue.Issue>)[InternalParser.args] ===
        InternalParser.missing
      ? getValue(InternalParser.missing)
      : result as Effect.Effect<T, SchemaIssue.Issue, R>
  }
}

function asPromise<T, E>(
  parser: (input: E, options?: SchemaAST.ParseOptions) => Effect.Effect<T, SchemaIssue.Issue>
): (input: E, options?: SchemaAST.ParseOptions) => Promise<T> {
  return (input: E, options?: SchemaAST.ParseOptions) =>
    Effect.runPromiseExit(parser(input, options)).then((exit) => {
      if (Exit.isSuccess(exit)) {
        return exit.value
      }
      const issue = InternalSchemaCause.getSchemaIssueOrThrow(
        exit.cause,
        "Promise adapter can only reject schema issues"
      )
      throw new Error("Schema validation failed", { cause: issue })
    })
}

function asExit<T, E, R>(
  parser: (input: E, options?: SchemaAST.ParseOptions) => Effect.Effect<T, SchemaIssue.Issue, R>
): (input: E, options?: SchemaAST.ParseOptions) => Exit.Exit<T, SchemaIssue.Issue> {
  return (input: E, options?: SchemaAST.ParseOptions) => Effect.runSyncExit(parser(input, options) as any)
}

/** @internal */
export function asOption<T, E, R>(
  parser: (input: E, options?: SchemaAST.ParseOptions) => Effect.Effect<T, SchemaIssue.Issue, R>
): (input: E, options?: SchemaAST.ParseOptions) => Option.Option<T> {
  const parserExit = asExit(parser)
  return (input: E, options?: SchemaAST.ParseOptions) => {
    const exit = parserExit(input, options)
    if (Exit.isSuccess(exit)) {
      return Option.some(exit.value)
    }
    InternalSchemaCause.getSchemaIssueOrThrow(exit.cause, "Option adapter can only return none for schema issues")
    return Option.none()
  }
}

function asResult<T, E, R>(
  parser: (input: E, options?: SchemaAST.ParseOptions) => Effect.Effect<T, SchemaIssue.Issue, R>
): (input: E, options?: SchemaAST.ParseOptions) => Result.Result<T, SchemaIssue.Issue> {
  const parserExit = asExit(parser)
  return (input: E, options?: SchemaAST.ParseOptions) => {
    const exit = parserExit(input, options)
    if (Exit.isSuccess(exit)) {
      return Result.succeed(exit.value)
    }
    return Result.fail(
      InternalSchemaCause.getSchemaIssueOrThrow(exit.cause, "Result adapter can only return schema issues")
    )
  }
}

function makeSync<T>(
  ast: SchemaAST.AST,
  options?: SchemaAST.ParseOptions
): (input: unknown, options?: SchemaAST.ParseOptions) => T {
  let run: ((input: unknown, options?: SchemaAST.ParseOptions) => T) | undefined
  return (input, overrideOptions) =>
    (run ??= makeSyncEntry<T>(CompilerRegistry.resolve(ast), options))(input, overrideOptions)
}

function makeSyncEntry<T>(
  entry: CompilerRegistry.Entry,
  options?: SchemaAST.ParseOptions
): (input: unknown, options?: SchemaAST.ParseOptions) => T {
  const decode = entry.decode
  let detailed: ((input: unknown, options?: SchemaAST.ParseOptions) => T) | undefined
  const run = decode === undefined
    ? (input: unknown, parseOptions = SchemaAST.defaultParseOptions): T =>
      (detailed ??= makeDetailedSync<T>(entry))(input, parseOptions)
    : (input: unknown, parseOptions = SchemaAST.defaultParseOptions): T => {
      if (input === InternalParser.missing) {
        return (detailed ??= makeDetailedSync<T>(entry))(input, parseOptions)
      }
      let output: unknown
      try {
        output = decode(input, parseOptions)
      } catch (error) {
        InternalSchemaCause.getSchemaIssueOrThrow(Cause.die(error), "Sync adapter can only throw schema issues")
        throw error
      }
      if (output !== CompilerRegistry.invalid) return output as T
      return (detailed ??= makeDetailedSync<T>(entry))(input, parseOptions)
    }
  return options === undefined
    ? run
    : (input, overrideOptions) => run(input, mergeParseOptions(options, overrideOptions))
}

function makeDetailedSync<T>(
  entry: CompilerRegistry.Entry
): (input: unknown, options?: SchemaAST.ParseOptions) => T {
  return asSync(runWithCompiler<T, never>(() => entry.decodeEffect, entry.ast))
}

function asSync<T, E>(
  parser: (input: E, options?: SchemaAST.ParseOptions) => Effect.Effect<T, SchemaIssue.Issue>
): (input: E, options?: SchemaAST.ParseOptions) => T {
  const parserExit = asExit(parser)
  return (input: E, options?: SchemaAST.ParseOptions) => {
    const exit = parserExit(input, options)
    if (Exit.isSuccess(exit)) {
      return exit.value
    }
    const issue = InternalSchemaCause.getSchemaIssueOrThrow(exit.cause, "Sync adapter can only throw schema issues")
    throw new Error("Schema validation failed", { cause: issue })
  }
}

function runSync<T>(effect: Effect.Effect<T, SchemaIssue.Issue>, message: string): T {
  const exit = Effect.runSyncExit(effect)
  if (Exit.isSuccess(exit)) {
    return exit.value
  }
  const issue = InternalSchemaCause.getSchemaIssueOrThrow(exit.cause, message)
  throw new Error("Schema validation failed", { cause: issue })
}

function makeConstructorSync<T, E>(
  ast: SchemaAST.AST
): (input: E, options?: Schema.MakeOptions) => T {
  let entry: CompilerRegistry.Entry | undefined
  let parser: Parser | undefined
  return (input, options) => {
    entry ??= CompilerRegistry.resolve(ast)
    const parseOptions = options?.disableChecks
      ? options.parseOptions ? { ...options.parseOptions, disableChecks: true } : { disableChecks: true }
      : options?.parseOptions ?? SchemaAST.defaultParseOptions
    const make = entry.make
    if (make !== undefined && input !== InternalParser.missing) {
      let output: unknown
      try {
        output = make(input, parseOptions)
      } catch (error) {
        InternalSchemaCause.getSchemaIssueOrThrow(Cause.die(error), "Constructor adapter can only throw schema issues")
        throw error
      }
      if (output !== CompilerRegistry.invalid && output !== InternalParser.missing) return output as T
    }
    const result = (parser ??= entry.makeEffect)(input, parseOptions)
    return runSync(parserResult<T, never>(result, input), "Constructor adapter can only throw schema issues")
  }
}

/** @internal */
export interface Parser {
  (
    input: unknown,
    options: SchemaAST.ParseOptions
  ): Effect.Effect<unknown, SchemaIssue.Issue, any>
}

/** @internal */
export interface Compiler {
  (ast: SchemaAST.AST): Parser
}

const normalCompiler: Compiler = (ast) => CompilerRegistry.resolve(ast).parser
const constructorCompiler: Compiler = (ast) => CompilerRegistry.resolve(ast).makeEffect
