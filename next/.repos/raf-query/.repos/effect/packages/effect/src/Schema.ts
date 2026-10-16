/**
 * Describes data shapes and how unknown input becomes trusted values.
 *
 * A schema can validate input, decode it into an application type, and encode
 * that value back to another representation. This module contains the main
 * schema, codec, decoder, and encoder APIs, together with schemas for common
 * JavaScript values and Effect data types. It also supports refinements,
 * transformations, defaults, classes, JSON Schema generation, test data
 * generation, formatting, equivalence, optics, and differs derived from schema
 * definitions.
 *
 * @since 4.0.0
 */

import * as Arr from "./Array.ts"
import * as BigDecimal_ from "./BigDecimal.ts"
import type * as Brand from "./Brand.ts"
import * as ByteSize_ from "./ByteSize.ts"
import * as Cause_ from "./Cause.ts"
import * as Chunk_ from "./Chunk.ts"
import * as Data from "./Data.ts"
import * as DateTime from "./DateTime.ts"
import type { Differ } from "./Differ.ts"
import * as Duration_ from "./Duration.ts"
import * as Effect from "./Effect.ts"
import * as Base64 from "./encoding/Base64.ts"
import * as Equal from "./Equal.ts"
import type * as Equivalence from "./Equivalence.ts"
import * as Exit_ from "./Exit.ts"
import type { Formatter } from "./Formatter.ts"
import { format, formatPropertyKey } from "./Formatter.ts"
import { identity } from "./Function.ts"
import type * as Graph_ from "./Graph.ts"
import * as HashMap_ from "./HashMap.ts"
import * as HashSet_ from "./HashSet.ts"
import * as Cookies_ from "./http/Cookies.ts"
import * as Headers_ from "./http/Headers.ts"
import * as UrlParams_ from "./http/UrlParams.ts"
import * as core from "./internal/core.ts"
import { effectIsExit } from "./internal/effect.ts"
import * as InternalGraph from "./internal/graph.ts"
import * as InternalRecord from "./internal/record.ts"
import * as InternalAnnotations from "./internal/schema/annotations.ts"
import * as InternalMake from "./internal/schema/make.ts"
import * as InternalStandardSchema from "./internal/schema/standardSchema.ts"
import * as InternalToCodec from "./internal/schema/toCodec.ts"
import * as InternalToDifferJsonPatch from "./internal/schema/toDifferJsonPatch.ts"
import * as InternalToEncoderXml from "./internal/schema/toEncoderXml.ts"
import * as InternalEquivalence from "./internal/schema/toEquivalence.ts"
import * as InternalToFormatter from "./internal/schema/toFormatter.ts"
import * as InternalToIso from "./internal/schema/toIso.ts"
import * as InternalToJsonSchemaDocument from "./internal/schema/toJsonSchemaDocument.ts"
import * as InternalToRepresentation from "./internal/schema/toRepresentation.ts"
import { isSchemaError as isSchemaErrorInternal, SchemaErrorTypeId } from "./internal/schemaError.ts"
import { getStackTraceLimit, setStackTraceLimit } from "./internal/stackTraceLimit.ts"
import type * as JsonPatch from "./JsonPatch.ts"
import type * as JsonSchema from "./JsonSchema.ts"
import * as IpInterface_ from "./net/IpInterface.ts"
import * as IpNetwork_ from "./net/IpNetwork.ts"
import * as NetAddress_ from "./net/NetAddress.ts"
import { remainder } from "./Number.ts"
import type * as Optic_ from "./Optic.ts"
import * as Option_ from "./Option.ts"
import * as Order from "./Order.ts"
import * as Pipeable from "./Pipeable.ts"
import * as Predicate from "./Predicate.ts"
import * as Record_ from "./Record.ts"
import * as Redacted_ from "./Redacted.ts"
import * as RegExp_ from "./RegExp.ts"
import * as Result_ from "./Result.ts"
import * as SchemaAST from "./SchemaAST.ts"
import * as SchemaGetter from "./SchemaGetter.ts"
import * as SchemaIssue from "./SchemaIssue.ts"
import * as SchemaParser from "./SchemaParser.ts"
import type * as SchemaRepresentation from "./SchemaRepresentation.ts"
import * as SchemaTransformation from "./SchemaTransformation.ts"
import type { StandardJSONSchemaV1, StandardSchemaV1 } from "./StandardSchema.ts"
import type { Assign, Lambda, Mutable, Simplify } from "./Struct.ts"
import * as Struct_ from "./Struct.ts"
import type { IsUnion, RequiredKeys } from "./Types.ts"
import type { Unify } from "./Unify.ts"

const TypeId = InternalMake.TypeId
/**
 * Whether a schema field is required or optional within a struct.
 *
 * @see {@link optionalKey} — mark a struct field as optional
 * @see {@link optional} — mark a struct field as optional with `| undefined`
 *
 * @category models
 * @since 4.0.0
 */
export type Optionality = "required" | "optional"
/**
 * Whether a schema field is readonly or mutable within a struct.
 *
 * @see {@link mutableKey} — mark a struct field as mutable
 *
 * @category models
 * @since 4.0.0
 */
export type Mutability = "readonly" | "mutable"
/**
 * Whether a schema field has a constructor default value.
 *
 * @see {@link withConstructorDefault} — add a default to a schema field
 * @see {@link tag} — creates a literal field with a constructor default
 *
 * @category models
 * @since 4.0.0
 */
export type ConstructorDefault = "no-default" | "with-default"
/**
 * Options for `makeEffect`, `make`, and Class constructors.
 *
 * **When to use**
 *
 * Use when passing `disableChecks: true` to skip validation when you trust the
 * data. Pass `parseOptions` to control parsing behavior.
 *
 * @see {@link BottomWithoutNew.makeEffect}
 * @see {@link BottomWithoutNew.make}
 *
 * @category options
 * @since 3.13.4
 */
export interface MakeOptions {
  /**
   * The parse options to use for the schema.
   */
  readonly parseOptions?: SchemaAST.ParseOptions | undefined
  /**
   * Whether to disable validation for the schema.
   */
  readonly disableChecks?: boolean | undefined

  /** @internal */
  readonly "~payload"?: {
    readonly token: unknown
    readonly value: unknown
  }
}
/**
 * The fully-parameterized schema interface without a construct signature.
 * Exposes all 14 type parameters controlling type inference, mutability,
 * optionality, services, and transformation behavior.
 *
 * **When to use**
 *
 * Use as the base for schema interfaces that provide a specialized construct
 * signature.
 *
 * @category models
 * @since 4.0.0
 */
export interface BottomWithoutNew<
  out T,
  out E,
  out RD,
  out RE,
  out Ast extends SchemaAST.AST,
  out Rebuild extends Top,
  out TypeMakeIn = T,
  out Iso = T,
  in out TypeParameters extends ReadonlyArray<Constraint> = readonly [],
  out TypeMake = TypeMakeIn,
  out TypeMutability extends Mutability = "readonly",
  out TypeOptionality extends Optionality = "required",
  out TypeConstructorDefault extends ConstructorDefault = "no-default",
  out EncodedMutability extends Mutability = "readonly",
  out EncodedOptionality extends Optionality = "required"
> extends Pipeable.Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly "ast": Ast
  readonly "Rebuild": Rebuild
  readonly "~type.parameters": TypeParameters
  readonly "Type": T
  readonly "Encoded": E
  readonly "DecodingServices": RD
  readonly "EncodingServices": RE
  readonly "~type.make.in": TypeMakeIn
  readonly "~type.make": TypeMake
  readonly "~type.constructor.default": TypeConstructorDefault
  readonly "Iso": Iso
  readonly "~type.mutability": TypeMutability
  readonly "~type.optionality": TypeOptionality
  readonly "~encoded.mutability": EncodedMutability
  readonly "~encoded.optionality": EncodedOptionality
  annotate(annotations: Annotations.Bottom<this["Type"], this["~type.parameters"]>): this["Rebuild"]
  annotateKey(annotations: Annotations.Key<this["Type"]>): this["Rebuild"]
  check(...checks: readonly [SchemaAST.Check<this["Type"]>, ...Array<SchemaAST.Check<this["Type"]>>]): this["Rebuild"]
  rebuild(ast: this["ast"]): this["Rebuild"]
  /**
   * Constructs a value from the make input representation synchronously.
   *
   * **When to use**
   *
   * Use when constructor input is trusted or when validation failure
   * should abort with a thrown `Error`.
   *
   * **Details**
   *
   * Applies constructor defaults and type-side validation according to
   * `MakeOptions`.
   *
   * **Gotchas**
   *
   * Throws an `Error` with the schema issue in its `cause` when validation
   * fails. Schema validation failures use the generic message
   * `"Schema validation failed"`; format the `cause` explicitly with
   * `SchemaIssue.makeFormatterDefault()` when human-readable details are needed.
   * Causes that contain defects, interruptions, or other non-schema reasons
   * throw with the underlying `Cause` attached instead.
   *
   * @see {@link BottomWithoutNew.makeOption} — construct synchronously and discard validation details
   * @see {@link BottomWithoutNew.makeEffect} — construct through `Effect` when validation failure should stay in the error channel
   */
  make(input: this["~type.make.in"], options?: MakeOptions): this["Type"]
  /**
   * Constructs a value from the make input representation, returning `Option.none`
   * when validation fails.
   *
   * **When to use**
   *
   * Use when you only need to know whether construction succeeds
   * and do not need validation details.
   *
   * **Details**
   *
   * Applies constructor defaults and type-side validation according to
   * `MakeOptions`.
   *
   * **Gotchas**
   *
   * Only causes made entirely of schema issues are converted to `None`. Causes
   * that contain defects, interruptions, or other non-schema reasons throw
   * instead.
   *
   * @see {@link BottomWithoutNew.make} — construct synchronously when validation failure should throw
   * @see {@link BottomWithoutNew.makeEffect} — construct through `Effect` when validation details should stay in the error channel
   */
  makeOption(input: this["~type.make.in"], options?: MakeOptions): Option_.Option<this["Type"]>
  /**
   * Constructs a value from the make input representation, returning validation
   * failures in the `Effect` error channel.
   *
   * **When to use**
   *
   * Use when construction must compose with other `Effect` operations or when
   * the result supplies a nested constructor default. Otherwise, use
   * {@link BottomWithoutNew.make} when invalid construction should throw.
   *
   * **Details**
   *
   * `SchemaParser` uses `SchemaIssue.Issue` as its canonical structured failure,
   * and this method exposes the same representation directly. Keeping the issue
   * unwrapped lets an enclosing schema attach its own path when the effect is
   * used with {@link withConstructorDefault}. It also avoids allocating a
   * `SchemaError` and keeps its formatting path out of the resulting bundle.
   *
   * **Gotchas**
   *
   * Unlike the decoding helpers in `Schema`, validation failures are not wrapped
   * in `SchemaError`. Map the issue to `SchemaError` or to a domain-specific error
   * when a wrapped error is needed at the application boundary.
   *
   * @see {@link BottomWithoutNew.make} — construct synchronously when validation failure should throw
   * @see {@link BottomWithoutNew.makeOption} — construct synchronously and discard validation details
   */
  makeEffect(input: this["~type.make.in"], options?: MakeOptions): Effect.Effect<this["Type"], SchemaIssue.Issue>
}
/**
 * Fully-parameterized base interface for schemas that can be extended directly
 * by TypeScript classes.
 *
 * **When to use**
 *
 * Use as the base for concrete schema interfaces whose runtime values support
 * `class ... extends schema`.
 *
 * **Details**
 *
 * Extends {@link BottomWithoutNew} with a construct signature that accepts `never`. The
 * signature enables class extension without making ordinary schemas directly
 * constructible.
 *
 * @see {@link BottomWithoutNew} for the schema protocol without a construct signature
 *
 * @category utility types
 * @since 4.0.0
 */
export interface Bottom<
  out T,
  out E,
  out RD,
  out RE,
  out Ast extends SchemaAST.AST,
  out Rebuild extends Top,
  out TypeMakeIn = T,
  out Iso = T,
  in out TypeParameters extends ReadonlyArray<Constraint> = readonly [],
  out TypeMake = TypeMakeIn,
  out TypeMutability extends Mutability = "readonly",
  out TypeOptionality extends Optionality = "required",
  out TypeConstructorDefault extends ConstructorDefault = "no-default",
  out EncodedMutability extends Mutability = "readonly",
  out EncodedOptionality extends Optionality = "required"
> extends
  BottomWithoutNew<
    T,
    E,
    RD,
    RE,
    Ast,
    Rebuild,
    TypeMakeIn,
    Iso,
    TypeParameters,
    TypeMake,
    TypeMutability,
    TypeOptionality,
    TypeConstructorDefault,
    EncodedMutability,
    EncodedOptionality
  >
{
  new(_: never): {}
}
/**
 * Lazy `BottomWithoutNew` variant for schema implementations that
 * compute their public views on demand.
 *
 * **When to use**
 *
 * Use as the base for lazy schema interfaces that provide a specialized
 * construct signature.
 *
 * **Details**
 *
 * The laziness is purely type-level; runtime behavior is unchanged.
 * `BottomLazyWithoutNew` keeps the structural operations inherited from
 * `BottomWithoutNew`, but erases the expensive schema views to
 * `unknown`. Concrete schema interfaces can then redeclare the precise views
 * they expose. This keeps wide schemas such as `Struct` and `Union` cheaper when
 * generic code reads a single view, while preserving their exact public types.
 *
 * @see {@link BottomWithoutNew} for the fully parameterized schema interface when every
 * view must be supplied directly.
 *
 * @category utility types
 * @since 4.0.0
 */
export interface BottomLazyWithoutNew<
  out Ast extends SchemaAST.AST,
  out Rebuild extends Top,
  in out TypeParameters extends ReadonlyArray<Constraint> = readonly [],
  out TypeMutability extends Mutability = "readonly",
  out TypeOptionality extends Optionality = "required",
  out TypeConstructorDefault extends ConstructorDefault = "no-default",
  out EncodedMutability extends Mutability = "readonly",
  out EncodedOptionality extends Optionality = "required"
> extends
  BottomWithoutNew<
    unknown,
    unknown,
    unknown,
    unknown,
    Ast,
    Rebuild,
    unknown,
    unknown,
    TypeParameters,
    unknown,
    TypeMutability,
    TypeOptionality,
    TypeConstructorDefault,
    EncodedMutability,
    EncodedOptionality
  >
{}
/**
 * Lazy `Bottom` variant for schemas that can be extended directly by TypeScript
 * classes.
 *
 * **When to use**
 *
 * Use as the base for concrete lazy schema interfaces whose runtime values
 * support `class ... extends schema`.
 *
 * **Details**
 *
 * Extends {@link BottomLazyWithoutNew} with a construct signature that accepts `never`.
 * The signature enables class extension without making ordinary schemas
 * directly constructible.
 *
 * @see {@link BottomLazyWithoutNew} for the lazy schema protocol without a construct signature
 *
 * @category utility types
 * @since 4.0.0
 */
export interface BottomLazy<
  out Ast extends SchemaAST.AST,
  out Rebuild extends Top,
  in out TypeParameters extends ReadonlyArray<Constraint> = readonly [],
  out TypeMutability extends Mutability = "readonly",
  out TypeOptionality extends Optionality = "required",
  out TypeConstructorDefault extends ConstructorDefault = "no-default",
  out EncodedMutability extends Mutability = "readonly",
  out EncodedOptionality extends Optionality = "required"
> extends
  BottomLazyWithoutNew<
    Ast,
    Rebuild,
    TypeParameters,
    TypeMutability,
    TypeOptionality,
    TypeConstructorDefault,
    EncodedMutability,
    EncodedOptionality
  >
{
  new(_: never): {}
}
/**
 * Type-level representation returned by {@link declareConstructor}.
 *
 * @category constructors
 * @since 4.0.0
 */
export interface declareConstructor<T, E, TypeParameters extends ReadonlyArray<Constraint>, Iso = T> extends
  Bottom<
    T,
    E,
    TypeParameters[number]["DecodingServices"],
    TypeParameters[number]["EncodingServices"],
    SchemaAST.Declaration,
    declareConstructor<T, E, TypeParameters, Iso>,
    T,
    Iso,
    TypeParameters
  >
{}
/**
 * Creates a schema for a **parametric** type (a generic container such as
 * `Array<A>`, `Option<A>`, etc.) by accepting a list of type-parameter schemas
 * and a decoder factory.
 *
 * **When to use**
 *
 * Use when you are defining a schema for a generic container whose validation
 * depends on one or more type-parameter schemas.
 *
 * **Details**
 *
 * The outer call `declareConstructor<T, E, Iso>()` fixes the decoded type `T`,
 * the encoded type `E`, and the optional iso type. The inner call receives:
 * - `typeParameters` — the concrete schemas for each type variable
 * - `run` — a factory that, given resolved codecs for each type parameter,
 *   returns a parsing function `(u, ast, options) => Effect<T, Issue>`
 * - `annotations` — optional metadata
 *
 * @see {@link declare} for creating schemas for non-parametric types.
 *
 * **Example** (Schema for a parametric `Box<A>` type)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema, SchemaIssue, SchemaParser } from "effect"
 *
 * interface Box<A> {
 *   readonly value: A
 * }
 *
 * const isBox = (u: unknown): u is Box<unknown> =>
 *   typeof u === "object" && u !== null && "value" in u
 *
 * const Box = <A extends Schema.Constraint>(item: A) =>
 *   Schema.declareConstructor<Box<A["Type"]>, Box<A["Encoded"]>>()(
 *     [item],
 *     ([itemCodec]) =>
 *       (u, ast, options) => {
 *         if (!isBox(u)) {
 *           return Effect.fail(new SchemaIssue.InvalidType(ast, u, options))
 *         }
 *         return Effect.map(
 *           SchemaParser.decodeUnknownEffect(itemCodec)(u.value, options),
 *           (value) => ({ value })
 *         )
 *       }
 *   )
 *
 * const schema = Box(Schema.Number)
 * Effect.runSync(Schema.decodeUnknownEffect(schema)({ value: 1 })) // => { value: 1 }
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export function declareConstructor<T, E = T, Iso = T>() {
  return <const TypeParameters extends ReadonlyArray<Constraint>>(
    typeParameters: TypeParameters,
    run: (
      typeParameters: {
        readonly [K in keyof TypeParameters]: Codec<TypeParameters[K]["Type"], TypeParameters[K]["Encoded"]>
      }
    ) => (
      u: unknown,
      self: SchemaAST.Declaration,
      options: SchemaAST.ParseOptions
    ) => Effect.Effect<T, SchemaIssue.Issue>,
    annotations?: Annotations.Declaration<T, TypeParameters>
  ): declareConstructor<T, E, TypeParameters, Iso> => {
    return make(
      new SchemaAST.Declaration(
        typeParameters.map(SchemaAST.getAST),
        (typeParameters) => run(typeParameters.map((ast) => make(ast)) as any),
        annotations
      )
    )
  }
}
/**
 * Type-level representation returned by {@link declare}.
 *
 * @category constructors
 * @since 3.13.3
 */
export interface declare<T, Iso = T> extends declareConstructor<T, T, readonly [], Iso> {
  readonly "Rebuild": declare<T, Iso>
}
/**
 * Creates a schema for a **non-parametric** opaque type using a type-guard
 * function. The schema accepts any unknown value and succeeds when `is` returns
 * `true`, failing with an `InvalidType` issue otherwise.
 *
 * **When to use**
 *
 * Use when you are defining a schema for an opaque type with no type parameters
 * and validation can be expressed as a type guard.
 *
 * **Example** (Defining a schema for a custom `UserId` branded type)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * type UserId = string & { readonly _tag: "UserId" }
 *
 * const isUserId = (u: unknown): u is UserId =>
 *   typeof u === "string" && u.startsWith("user_")
 *
 * const UserId = Schema.declare<UserId>(isUserId, {
 *   title: "UserId",
 *   description: "A user identifier starting with 'user_'"
 * })
 * Schema.decodeUnknownSync(UserId)("user_123") // => "user_123"
 * ```
 *
 * @see {@link declareConstructor} for creating schemas for parametric types.
 *
 * @category constructors
 * @since 3.10.0
 */
export function declare<T, Iso = T>(
  is: (u: unknown) => u is T,
  annotations?: Annotations.Declaration<T> | undefined
): declare<T, Iso> {
  return declareConstructor<T, T, Iso>()(
    [],
    () => (input, ast, options) =>
      is(input) ?
        Effect.succeed(input) :
        Effect.fail(new SchemaIssue.InvalidType(ast, input, options)),
    annotations
  )
}
/**
 * Returns a schema widened to the fully-parameterized {@link Bottom} interface,
 * making all 14 type parameters visible to TypeScript.
 *
 * **Details**
 *
 * Normally, concrete schema interfaces (e.g. `Schema<string>`) hide most type
 * parameters. `revealBottom` is useful when writing generic utilities that need
 * to inspect or propagate the complete set of type parameters.
 *
 * **Example** (Inspecting all type parameters of a schema)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const schema = Schema.String
 *
 * // Widen to Bottom to access all 14 type parameters
 * const bottom = Schema.revealBottom(schema)
 *
 * // `bottom` now exposes Type, Encoded, DecodingServices, EncodingServices,
 * // ast, Rebuild, ~type.make.in, Iso, ~type.parameters, etc.
 * type T = typeof bottom["Type"]     // string
 * type E = typeof bottom["Encoded"]  // string
 * ```
 *
 * @category utility types
 * @since 4.0.0
 */
export function revealBottom<S extends Top>(
  bottom: S
): Bottom<
  S["Type"],
  S["Encoded"],
  S["DecodingServices"],
  S["EncodingServices"],
  S["ast"],
  S["Rebuild"],
  S["~type.make.in"],
  S["Iso"],
  S["~type.parameters"],
  S["~type.make"],
  S["~type.mutability"],
  S["~type.optionality"],
  S["~type.constructor.default"],
  S["~encoded.mutability"],
  S["~encoded.optionality"]
> {
  return bottom
}
/**
 * Adds metadata annotations to a schema without changing its runtime behavior.
 * This is the pipeable (curried) counterpart of the `.annotate` method.
 *
 * **Details**
 *
 * Annotations provide extra context used by documentation generators, JSON
 * Schema converters, error formatters, and other tooling. Common keys include
 * `title`, `description`, `examples`, `message`, and `identifier`.
 *
 * **Example** (Adding a title and description)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const Age = Schema.Natural.pipe(
 *   Schema.annotate({
 *     title: "Age",
 *     description: "A non-negative integer representing age in years"
 *   })
 * )
 * Schema.resolveAnnotations(Age)?.title // => "Age"
 * ```
 *
 * @see {@link annotateEncoded} to annotate the encoded side instead.
 *
 * @category annotations
 * @since 4.0.0
 */
export function annotate<S extends Top>(annotations: Annotations.Bottom<S["Type"], S["~type.parameters"]>) {
  return (self: S) => self.annotate(annotations)
}
/**
 * Adds metadata annotations to the **encoded** side of a schema without
 * changing its runtime behavior. This is the encoded-side counterpart of
 * `annotate`, which targets the decoded (Type) side.
 *
 * **Details**
 *
 * Internally the schema is flipped so that `Encoded` becomes `Type`,
 * annotated, and then flipped back.
 *
 * **Example** (Adding a title to the encoded representation)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const schema = Schema.NumberFromString.pipe(
 *   Schema.annotateEncoded({
 *     title: "my title"
 *   })
 * )
 *
 * Schema.toEncoded(schema).ast.annotations?.title // => "my title"
 * ```
 *
 * @see {@link annotate} to annotate the type side instead.
 *
 * @category annotations
 * @since 4.0.0
 */
export function annotateEncoded<S extends Top>(annotations: Annotations.Bottom<S["Encoded"], readonly []>) {
  return (self: S): S["Rebuild"] => flip(flip(self).annotate(annotations))
}
/**
 * Adds key-level annotations to a schema field. This is the pipeable
 * (curried) counterpart of the `.annotateKey` method.
 *
 * **Details**
 *
 * Key annotations apply to a field's position inside a `Struct` or `Tuple`
 * rather than to the field's value type. They can carry a
 * `messageMissingKey` to customise the error shown when the field is absent,
 * as well as standard documentation fields such as `title`, `description`,
 * and `examples`.
 *
 * **Example** (Customizing the missing-key message for a required field)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const schema = Schema.Struct({
 *   username: Schema.String.pipe(
 *     Schema.annotateKey({
 *       description: "The username used to log in",
 *       messageMissingKey: "Username is required"
 *     })
 *   )
 * })
 * schema.fields.username.ast.context?.annotations?.messageMissingKey // => "Username is required"
 * ```
 *
 * @category annotations
 * @since 4.0.0
 */
export function annotateKey<S extends Top>(annotations: Annotations.Key<S["Type"]>) {
  return (self: S): S["Rebuild"] => {
    return self.rebuild(SchemaAST.annotateKey(self.ast, annotations))
  }
}
/**
 * The existential "any schema" type — all type parameters are erased to `unknown`.
 *
 * **Details**
 *
 * Use `Top` as a constraint when writing generic utilities that must accept *any*
 * schema regardless of its `Type`, `Encoded`, or service requirements. It is the
 * widest possible schema type and therefore gives you the least static information.
 *
 * In user code prefer the narrower interfaces:
 * - {@link Schema}`<T>` — when you only care about the decoded type
 * - {@link Codec}`<T, E, RD, RE>` — when you need the encoded type and service requirements
 * - {@link ConstraintDecoder}`<T, RD>` — for decode-only APIs
 * - {@link ConstraintEncoder}`<E, RE>` — for encode-only APIs
 *
 * @category models
 * @since 4.0.0
 */
export interface Top extends
  Bottom<
    unknown,
    unknown,
    unknown,
    unknown,
    SchemaAST.AST,
    Top,
    unknown,
    unknown,
    any, // this is because TypeParameters is invariant
    unknown,
    Mutability,
    Optionality,
    ConstructorDefault,
    Mutability,
    Optionality
  >
{}
/**
 * Lightweight structural constraint for APIs that accept schema values but only
 * read their data and type-level views.
 *
 * **When to use**
 *
 * Use when you need to constrain a generic value to be a schema, but the API
 * only reads properties such as `ast`, `Type`, `Encoded`, service
 * requirements, constructor input views, or modifier flags.
 *
 * **Details**
 *
 * `Constraint` keeps the schema type identifier and the property surface needed
 * by schema constructors, while avoiding the full `Bottom` protocol. Use
 * {@link Top} when an API calls schema methods such as `annotate`, `check`,
 * `rebuild`, `make`, or `makeEffect`.
 *
 * @see {@link Top} for the complete schema protocol.
 *
 * @category models
 * @since 4.0.0
 */
export interface Constraint {
  readonly [TypeId]: typeof TypeId
  readonly "ast": SchemaAST.AST

  readonly "Type": unknown
  readonly "Encoded": unknown
  readonly "DecodingServices": unknown
  readonly "EncodingServices": unknown

  readonly "~type.parameters": any
  readonly "~type.make.in": unknown
  readonly "~type.make": unknown
  readonly "Iso": unknown

  readonly "~type.optionality": Optionality
  readonly "~type.mutability": Mutability
  readonly "~type.constructor.default": ConstructorDefault
  readonly "~encoded.optionality": Optionality
  readonly "~encoded.mutability": Mutability
}
/**
 * Lightweight structural constraint for APIs that need codec type views but do
 * not need the full schema protocol.
 *
 * **When to use**
 *
 * Use when you need to preserve decoded type, encoded type, and service
 * requirements for a schema value, but the API does not call schema methods
 * such as `annotate`, `check`, `rebuild`, `make`, or `makeEffect`.
 *
 * @see {@link Constraint} for the generic lightweight schema constraint.
 * @see {@link Codec} for the full schema protocol with codec type views.
 *
 * @category models
 * @since 4.0.0
 */
export interface ConstraintCodec<out T, out E = T, out RD = never, out RE = never> extends Constraint {
  readonly "Type": T
  readonly "Encoded": E
  readonly "DecodingServices": RD
  readonly "EncodingServices": RE
}
/**
 * Lightweight structural constraint for APIs that need decoder type views but
 * do not need the full schema protocol.
 *
 * **When to use**
 *
 * Use when you need to preserve a schema's decoded type and decoding services,
 * but the API does not constrain the encoded type, encoding services, or call
 * schema methods such as `annotate`, `check`, `rebuild`, `make`, or
 * `makeEffect`.
 *
 * @see {@link ConstraintCodec} for APIs that need both decoded and encoded codec views.
 * @see {@link Codec} for the full schema protocol with codec type views.
 *
 * @category models
 * @since 4.0.0
 */
export interface ConstraintDecoder<out T, out RD = never> extends ConstraintCodec<T, unknown, RD, unknown> {}
/**
 * Lightweight structural constraint for APIs that need encoder type views but
 * do not need the full schema protocol.
 *
 * **When to use**
 *
 * Use when you need to preserve a schema's encoded type and encoding services,
 * but the API does not constrain the decoded type, decoding services, or call
 * schema methods such as `annotate`, `check`, `rebuild`, `make`, or
 * `makeEffect`.
 *
 * @see {@link ConstraintCodec} for APIs that need both decoded and encoded codec views.
 * @see {@link Codec} for the full schema protocol with codec type views.
 *
 * @category models
 * @since 4.0.0
 */
export interface ConstraintEncoder<out E, out RE = never> extends ConstraintCodec<unknown, E, unknown, RE> {}
/**
 * Lightweight structural constraint for APIs that need schema views and the
 * rebuilt schema type, but do not call the full schema protocol.
 *
 * **When to use**
 *
 * Use when an API needs to read `Rebuild` in addition to the schema views
 * exposed by {@link Constraint}, but does not call methods such as `annotate`,
 * `check`, `rebuild`, `make`, or `makeEffect`.
 *
 * @category models
 * @since 4.0.0
 */
export interface ConstraintRebuildable extends Constraint {
  readonly "Rebuild": Constraint
}
/**
 * Namespace of type-level helpers for {@link Schema}.
 *
 * @since 3.10.0
 */
export declare namespace Schema {
  /**
   * Extracts the decoded `Type` from a schema.
   *
   * **Example** (Extracting the decoded type)
   *
   * ```ts import.meta.vitest
   * import { Schema } from "effect"
   *
   * const Person = Schema.Struct({ name: Schema.String, age: Schema.Number })
   * type Person = Schema.Schema.Type<typeof Person>
   * // { readonly name: string; readonly age: number }
   * ```
   *
   * @category utility types
   * @since 3.10.0
   */
  type Type<S> = S extends {
    readonly "Type": infer T
  } ? T :
    never
}
/**
 * A typed view of a schema that tracks only the decoded (output) type `T`.
 *
 * **Details**
 *
 * Use `Schema<T>` as a constraint when you want to accept "any schema that
 * decodes to `T`" and do not need to know or constrain the encoded
 * representation, required services, or any other type parameters.
 *
 * This is a structural interface — concrete schema values are produced by the
 * constructors in this module (e.g. {@link Struct}, {@link String}, {@link Number}).
 * When you also need the encoded type or service requirements, use {@link Codec}.
 *
 * **Example** (Accepting any schema decoding to `string`)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const accept = (_schema: Schema.Schema<string>): void => {}
 *
 * accept(Schema.String)
 * accept(Schema.NonEmptyString)
 * ```
 *
 * @see {@link Codec} — also tracks Encoded, DecodingServices, EncodingServices
 * @see {@link Schema.Type} — extract the decoded type at the type level
 *
 * @category models
 * @since 3.10.0
 */
export interface Schema<out T> extends Top {
  readonly "Type": T
  readonly "Rebuild": Schema<T>
}
/**
 * Namespace of type-level helpers for {@link Codec}.
 *
 * @since 4.0.0
 */
export declare namespace Codec {
  /**
   * Extracts the encoded (`Encoded`) type from a schema.
   *
   * **Example** (Extracting the encoded type)
   *
   * ```ts import.meta.vitest
   * import { Schema } from "effect"
   *
   * const schema = Schema.NumberFromString
   * type Enc = Schema.Codec.Encoded<typeof schema>
   * // string
   * ```
   *
   * @category utility types
   * @since 3.10.0
   */
  type Encoded<S> = S extends {
    readonly "Encoded": infer E
  } ? E :
    never
  /**
   * Extracts the Effect services required during *decoding* from a schema.
   *
   * **Example** (Checking decoding service requirements)
   *
   * ```ts import.meta.vitest
   * import { Schema } from "effect"
   *
   * const schema = Schema.String
   * type RD = Schema.Codec.DecodingServices<typeof schema>
   * // never
   * ```
   *
   * @category utility types
   * @since 4.0.0
   */
  type DecodingServices<S> = S extends {
    readonly "DecodingServices": infer R
  } ? R :
    never
  /**
   * Extracts the Effect services required during *encoding* from a schema.
   *
   * **Example** (Checking encoding service requirements)
   *
   * ```ts import.meta.vitest
   * import { Schema } from "effect"
   *
   * const schema = Schema.String
   * type RE = Schema.Codec.EncodingServices<typeof schema>
   * // never
   * ```
   *
   * @category utility types
   * @since 4.0.0
   */
  type EncodingServices<S> = S extends {
    readonly "EncodingServices": infer R
  } ? R :
    never
}
/**
 * A schema that tracks the decoded type `T`, the encoded type `E`, and the
 * Effect services required during decoding (`RD`) and encoding (`RE`).
 *
 * **Details**
 *
 * Use `Codec<T, E, RD, RE>` when you need to preserve full type information
 * about a schema — both what it decodes to and what it serializes from/to.
 * Most concrete schemas produced by this module implement `Codec`.
 *
 * For APIs that only need one direction, prefer the narrower views:
 * - {@link Decoder}`<T, RD>` — decode-only
 * - {@link Encoder}`<E, RE>` — encode-only
 * - {@link Schema}`<T>` — type-only (no encoded representation)
 *
 * **Example** (Accepting a codec that decodes to `number` from `string`)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const serialize = <T>(codec: Schema.Codec<T, string>, value: T): string =>
 *   Schema.encodeSync(codec)(value)
 *
 * serialize(Schema.NumberFromString, 42) // => "42"
 * ```
 *
 * @see {@link Codec.Encoded} — extract the encoded type
 * @see {@link Codec.DecodingServices} — extract required decoding services
 * @see {@link Codec.EncodingServices} — extract required encoding services
 * @see {@link revealCodec} — helper to make TypeScript infer the full Codec type
 *
 * @category models
 * @since 4.0.0
 */
export interface Codec<out T, out E = T, out RD = never, out RE = never> extends Schema<T> {
  readonly "Encoded": E
  readonly "DecodingServices": RD
  readonly "EncodingServices": RE
  readonly "Rebuild": Codec<T, E, RD, RE>
}
/**
 * A schema that tracks the decoded type `T` and the Effect services required
 * during decoding (`RD`).
 *
 * **When to use**
 *
 * Use when you need to preserve a schema's decoded type and decoding service
 * requirements, but do not need to constrain its encoded representation or
 * encoding services.
 *
 * @see {@link Codec} for preserving both decoded and encoded type information.
 * @see {@link Encoder} for the encode-only view.
 *
 * @category models
 * @since 4.0.0
 */
export interface Decoder<out T, out RD = never> extends Schema<T> {
  readonly "Encoded": unknown
  readonly "DecodingServices": RD
  readonly "EncodingServices": unknown
  readonly "Rebuild": Decoder<T, RD>
}
/**
 * A schema that tracks the encoded type `E` and the Effect services required
 * during encoding (`RE`).
 *
 * **When to use**
 *
 * Use when you need to preserve a schema's encoded type and encoding service
 * requirements, but do not need to constrain its decoded representation or
 * decoding services.
 *
 * @see {@link Codec} for preserving both decoded and encoded type information.
 * @see {@link Decoder} for the decode-only view.
 *
 * @category models
 * @since 4.0.0
 */
export interface Encoder<out E, out RE = never> extends Schema<unknown> {
  readonly "Encoded": E
  readonly "DecodingServices": unknown
  readonly "EncodingServices": RE
  readonly "Rebuild": Encoder<E, RE>
}
/**
 * Returns a codec widened to the full {@link Codec} interface, prompting
 * TypeScript to infer all four type parameters (`T`, `E`, `RD`, `RE`).
 *
 * **Details**
 *
 * When a schema is stored in a variable typed as `Schema<T>` or `Top`, the
 * encoded type and service requirements are erased. Passing the value through
 * `revealCodec` recovers those parameters without any runtime cost.
 *
 * **Example** (Recovering encoded type from a schema variable)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const schema: Schema.Schema<number> = Schema.NumberFromString
 *
 * // Without revealCodec, Encoded is unknown
 * const codec = Schema.revealCodec(schema)
 * type Enc = typeof codec["Encoded"] // string
 * ```
 *
 * @category utility types
 * @since 4.0.0
 */
export function revealCodec<T, E, RD, RE>(codec: Codec<T, E, RD, RE>) {
  return codec
}
/**
 * A schema that additionally supports optic (lens/prism) operations.
 *
 * **Details**
 *
 * `Optic<T, Iso>` extends {@link Schema}`<T>` with an `Iso` type that
 * describes the isomorphic counterpart used by the optic layer. Crucially,
 * decoding and encoding require *no* Effect services (`DecodingServices` and
 * `EncodingServices` are both `never`), which means the optic can operate
 * purely without an Effect runtime.
 *
 * Most primitive schemas (e.g. `Schema.String`, `Schema.Number`) implement
 * `Optic` automatically. You normally interact with this interface through
 * {@link Optic_} utilities rather than constructing it directly.
 *
 * @category models
 * @since 4.0.0
 */
export interface Optic<out T, out Iso> extends Schema<T> {
  readonly "Iso": Iso
  readonly "DecodingServices": never
  readonly "EncodingServices": never
  readonly "Rebuild": Optic<T, Iso>
}
/**
 * Error thrown or returned when schema decoding or encoding fails.
 *
 * **Details**
 *
 * The `issue` field contains a structured {@link SchemaIssue.Issue} tree describing
 * every validation failure, including the path to the problematic value and
 * the expected type or constraint. The `message` field renders the issue tree
 * with the default formatter.
 *
 * **Gotchas**
 *
 * Parsing with `reportInput: true` adds an enumerable `input` field to
 * value-bearing issues. Built-in messages may include reported input, and
 * custom annotations or messages are not sanitized.
 *
 * **Example** (Inspecting a SchemaError)
 *
 * ```ts import.meta.vitest
 * import { Result, Schema } from "effect"
 *
 * const result = Schema.decodeUnknownResult(Schema.Number)("not a number")
 * const message = Result.isFailure(result) ? result.failure.message : ""
 * message // => "Expected number"
 * ```
 *
 * @see {@link isSchemaError} for narrowing unknown values
 * @category errors
 * @since 4.0.0
 */
export class SchemaError extends Data.TaggedError("SchemaError")<{
  readonly issue: SchemaIssue.Issue
}> {
  readonly [SchemaErrorTypeId]: typeof SchemaErrorTypeId = SchemaErrorTypeId
  constructor(issue: SchemaIssue.Issue) {
    const stackTraceLimit = getStackTraceLimit()
    setStackTraceLimit(0)
    try {
      super({ issue })
    } finally {
      setStackTraceLimit(stackTraceLimit)
    }
  }
  override get message() {
    return SchemaIssue.defaultFormatter(this.issue)
  }
  override toString() {
    return `SchemaError(${this.message})`
  }
}
/**
 * Returns `true` if `u` is a {@link SchemaError}.
 *
 * **When to use**
 *
 * Use when you need to narrow an unknown value to `SchemaError`.
 *
 * **Example** (Narrowing Schema errors)
 *
 * ```ts import.meta.vitest
 * import { Result, Schema } from "effect"
 *
 * const result = Result.try(() => Schema.decodeUnknownSync(Schema.Number)("oops"))
 * const error: unknown = Result.isFailure(result) ? result.failure : undefined
 * Schema.isSchemaError(error) // => true
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export function isSchemaError(u: unknown): u is SchemaError {
  return isSchemaErrorInternal(u)
}

function fromIssueEffect<A, R>(
  self: Effect.Effect<A, SchemaIssue.Issue, R>
): Effect.Effect<A, SchemaError, R> {
  if (effectIsExit(self)) {
    return fromIssueExit(self as Exit_.Exit<A, SchemaIssue.Issue>)
  }
  return Effect.catchCause(
    self,
    (cause) => Effect.failCauseSync(() => Cause_.map(cause, (issue) => new SchemaError(issue)))
  )
}

function fromIssueExit<A>(exit: Exit_.Exit<A, SchemaIssue.Issue>): Exit_.Exit<A, SchemaError> {
  return Exit_.isSuccess(exit)
    ? exit as unknown as Exit_.Exit<A, SchemaError>
    : Exit_.failCause(Cause_.map(exit.cause, (issue) => new SchemaError(issue)))
}

function getSchemaErrorOrThrow(
  cause: Cause_.Cause<SchemaError>,
  message: string
): SchemaError {
  let schemaError: SchemaError | undefined
  for (const reason of cause.reasons) {
    if (!Cause_.isFailReason(reason) || !isSchemaError(reason.error)) {
      throw new globalThis.Error(message, { cause })
    }
    schemaError ??= reason.error
  }
  if (schemaError === undefined) {
    throw new globalThis.Error(message, { cause })
  }
  return schemaError
}

function runSchemaErrorPromise<A>(
  self: Effect.Effect<A, SchemaError>
): Promise<A> {
  return Effect.runPromiseExit(self).then((exit) => {
    if (Exit_.isSuccess(exit)) {
      return exit.value
    }
    throw getSchemaErrorOrThrow(exit.cause, "Promise adapter can only reject schema errors")
  })
}

function runSchemaErrorSync<A>(
  self: Effect.Effect<A, SchemaError>
): A {
  const exit = Effect.runSyncExit(self)
  if (Exit_.isSuccess(exit)) {
    return exit.value
  }
  throw getSchemaErrorOrThrow(exit.cause, "Sync adapter can only throw schema errors")
}
/**
 * Returns a "Standard Schema" object conforming to the [Standard Schema
 * v1](https://standardschema.dev/) specification.
 *
 * **Details**
 *
 * This function creates a schema whose `validate` method attempts to decode and
 * validate the provided input synchronously. If the underlying `Schema`
 * includes any asynchronous components (e.g., asynchronous message resolutions
 * or checks), then validation will necessarily return a `Promise` instead.
 *
 * **Example** (Creating a standard schema from a regular schema)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * // Define custom hook functions for error formatting
 * const leafHook = (issue: any) => {
 *   switch (issue._tag) {
 *     case "InvalidType":
 *       return "Expected different type"
 *     case "InvalidValue":
 *       return "Invalid value provided"
 *     case "MissingKey":
 *       return "Required property missing"
 *     case "UnexpectedKey":
 *       return "Unexpected property found"
 *     case "Forbidden":
 *       return "Operation not allowed"
 *     case "OneOf":
 *       return "Multiple valid options available"
 *     default:
 *       return "Validation error"
 *   }
 * }
 *
 * // Create a standard schema from a regular schema
 * const PersonSchema = Schema.Struct({
 *   name: Schema.NonEmptyString,
 *   age: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 150 }))
 * })
 *
 * const standardSchema = Schema.toStandardSchemaV1(PersonSchema, {
 *   leafHook
 * })
 *
 * // The standard schema can be used with any Standard Schema v1 compatible library
 * const validResult = standardSchema["~standard"].validate({
 *   name: "Alice",
 *   age: 30
 * })
 * const invalidResult = standardSchema["~standard"].validate({
 *   name: "",
 *   age: 200
 * })
 *
 * if (validResult instanceof Promise || invalidResult instanceof Promise) {
 *   throw new Error("Expected synchronous validation")
 * }
 * if ("value" in validResult) {
 *   validResult.value // => { name: "Alice", age: 30 }
 * }
 * invalidResult.issues?.map((issue) => issue.path) // => [["name"], ["age"]]
 * ```
 *
 * @category converting
 * @since 4.0.0
 */
export function toStandardSchemaV1<S extends ConstraintDecoder<unknown>>(
  self: S,
  options?: {
    readonly leafHook?: SchemaIssue.LeafHook | undefined
    readonly checkHook?: SchemaIssue.CheckHook | undefined
    readonly parseOptions?: SchemaAST.ParseOptions | undefined
  }
): StandardSchemaV1<S["Encoded"], S["Type"]> & S {
  return InternalStandardSchema.toStandardSchemaV1(self, options)
}
/**
 * Converts a schema to an experimental Standard JSON Schema V1 representation.
 *
 * **Details**
 *
 * https://github.com/standard-schema/standard-schema/pull/134
 *
 * @category converting
 * @since 4.0.0
 */
export function toStandardJSONSchemaV1<S extends Constraint>(
  self: S
): StandardJSONSchemaV1<S["Encoded"], S["Type"]> & S {
  return InternalStandardSchema.toStandardJSONSchemaV1(self)
}
/**
 * Creates a type guard function that checks if a value conforms to a given
 * schema.
 *
 * **Details**
 *
 * This function returns a predicate that performs a type-safe check, narrowing
 * the type of the input value if the check passes. The predicate returns `false`
 * for schema mismatches.
 *
 * **Gotchas**
 *
 * Only causes made entirely of schema issues are converted to `false`. Causes
 * that contain defects, interruptions, or other non-schema reasons throw
 * instead.
 *
 * **Example** (Defining a basic type guard)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const isString = Schema.is(Schema.String)
 *
 * isString("hello") // => true
 * isString(42) // => false
 *
 * // Type narrowing in action
 * const value: unknown = "hello"
 * if (isString(value)) {
 *   // value is now typed as string
 *   value.toUpperCase() // => "HELLO"
 * }
 * ```
 *
 * @category guards
 * @since 3.10.0
 */
export const is: typeof SchemaParser.is = SchemaParser.is
/**
 * Creates an assertion function that throws an error if the input does not match
 * the schema.
 *
 * **When to use**
 *
 * Use to validate unknown input at runtime while narrowing the value with a
 * TypeScript assertion signature.
 *
 * **Details**
 *
 * The input is narrowed if the assertion succeeds. If schema validation fails,
 * the assertion throws an `Error` whose cause is `SchemaIssue.Issue`.
 * Schema validation failures use the generic message `"Schema validation failed"`.
 * Format the `cause` explicitly with `SchemaIssue.makeFormatterDefault()` when
 * human-readable details are needed.
 *
 * **Gotchas**
 *
 * Causes that contain defects, interruptions, or other non-schema reasons throw
 * with the underlying `Cause` attached instead of being converted to schema
 * validation errors.
 *
 * **Example** (Asserting and narrowing an input)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaIssue } from "effect"
 *
 * const input: unknown = "hello"
 *
 * // This will pass silently (no return value) and narrow input to string
 * Schema.asserts(Schema.String, input)
 * input.toUpperCase() // => "HELLO"
 *
 * // This will throw an error
 * try {
 *   const invalid: unknown = 123
 *   Schema.asserts(Schema.String, invalid)
 * } catch (error) {
 *   if (error instanceof Error) {
 *     SchemaIssue.isIssue(error.cause) // => true
 *   }
 * }
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export const asserts: <S extends Constraint, I>(schema: S, input: I) => asserts input is I & S["Type"] =
  SchemaParser.asserts
/**
 * Decodes an `unknown` input against a schema, returning an `Effect` that
 * succeeds with the decoded value or fails with a {@link SchemaError}.
 *
 * **When to use**
 *
 * Use when you need to decode unknown input in an `Effect` whose failure
 * channel is `SchemaError`.
 *
 * **Details**
 *
 * Prefer {@link decodeEffect} when the input is already typed as the schema's
 * `Encoded` type.
 * Options may be provided either when creating the decoder or when applying it;
 * application options override creation options.
 *
 * @see {@link SchemaParser.decodeUnknownEffect} for the adapter that fails with `SchemaIssue.Issue` directly
 *
 * @category decoding
 * @since 4.0.0
 */
export function decodeUnknownEffect<S extends Constraint>(schema: S, options?: SchemaAST.ParseOptions) {
  const parser = SchemaParser.decodeUnknownEffect(schema, options)
  return (
    input: unknown,
    options?: SchemaAST.ParseOptions
  ): Effect.Effect<S["Type"], SchemaError, S["DecodingServices"]> => {
    return fromIssueEffect(parser(input, options))
  }
}
/**
 * Decodes a typed input (the schema's `Encoded` type) against a schema,
 * returning an `Effect` that succeeds with the decoded value or fails with a
 * {@link SchemaError}.
 *
 * **When to use**
 *
 * Use when you need to decode input already typed as the schema's `Encoded`
 * type in an `Effect` whose failure channel is `SchemaError`.
 *
 * **Details**
 *
 * For `unknown` input use {@link decodeUnknownEffect}.
 * Options may be provided either when creating the decoder or when applying it;
 * application options override creation options.
 *
 * @see {@link SchemaParser.decodeEffect} for the adapter that fails with `SchemaIssue.Issue` directly
 *
 * @category decoding
 * @since 4.0.0
 */
export const decodeEffect: <S extends Constraint>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (
  input: S["Encoded"],
  options?: SchemaAST.ParseOptions
) => Effect.Effect<S["Type"], SchemaError, S["DecodingServices"]> = decodeUnknownEffect
/**
 * Decodes an `unknown` input against a schema synchronously, returning an
 * `Exit` that is either a `Success` with the decoded value or a `Failure`.
 *
 * **When to use**
 *
 * Use when you need to decode unknown input into an `Exit` and capture schema
 * mismatches as `SchemaError`.
 *
 * **Details**
 *
 * Only usable with schemas that have no `DecodingServices` requirement. Prefer
 * {@link decodeExit} when the input is already typed as the schema's `Encoded`
 * type.
 * Options may be provided either when creating the decoder or when applying it;
 * application options override creation options.
 * Schema mismatches are represented by a `Failure` cause containing
 * `SchemaError`.
 *
 * **Gotchas**
 *
 * Schema issue fail reasons are wrapped as `SchemaError`. Defects,
 * interruptions, and other non-schema reasons remain in the returned `Cause`,
 * including when they are mixed with schema issues.
 *
 * @see {@link SchemaParser.decodeUnknownExit} for the adapter whose failure contains `SchemaIssue.Issue` directly
 *
 * @category decoding
 * @since 4.0.0
 */
export function decodeUnknownExit<S extends ConstraintDecoder<unknown>>(schema: S, options?: SchemaAST.ParseOptions) {
  const parser = SchemaParser.decodeUnknownExit(schema, options)
  return (input: unknown, options?: SchemaAST.ParseOptions): Exit_.Exit<S["Type"], SchemaError> => {
    return fromIssueExit(parser(input, options))
  }
}
/**
 * Decodes a typed input (the schema's `Encoded` type) against a schema
 * synchronously, returning an `Exit` that is either a `Success` with the decoded
 * value or a `Failure`.
 *
 * **When to use**
 *
 * Use when you need to decode already typed `Encoded` input into an `Exit` and
 * capture schema mismatches as `SchemaError`.
 *
 * **Details**
 *
 * Only usable with schemas that have no `DecodingServices` requirement. For
 * `unknown` input use {@link decodeUnknownExit}.
 * Options may be provided either when creating the decoder or when applying it;
 * application options override creation options.
 * Schema mismatches are represented by a `Failure` cause containing
 * `SchemaError`.
 *
 * **Gotchas**
 *
 * Schema issue fail reasons are wrapped as `SchemaError`. Defects,
 * interruptions, and other non-schema reasons remain in the returned `Cause`,
 * including when they are mixed with schema issues.
 *
 * @see {@link SchemaParser.decodeExit} for the adapter whose failure contains `SchemaIssue.Issue` directly
 *
 * @category decoding
 * @since 4.0.0
 */
export const decodeExit: <S extends ConstraintDecoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (input: S["Encoded"], options?: SchemaAST.ParseOptions) => Exit_.Exit<S["Type"], SchemaError> = decodeUnknownExit
/**
 * Decodes an `unknown` input against a schema, returning an `Option` that is
 * `Some` with the decoded value on success or `None` for schema mismatches.
 *
 * **When to use**
 *
 * Use when you do not know the input type statically and only need to know
 * whether decoding succeeded.
 *
 * **Details**
 *
 * Prefer this over {@link decodeUnknownExit} or {@link decodeUnknownEffect}
 * when you don't need error details. For input already typed as the schema's
 * `Encoded` type use {@link decodeOption}.
 * Options may be provided either when creating the decoder or when applying it;
 * application options override creation options.
 *
 * **Gotchas**
 *
 * Only causes made entirely of schema issues are converted to `None`. Causes
 * that contain defects, interruptions, or other non-schema reasons throw
 * instead.
 *
 * @category decoding
 * @since 3.10.0
 */
export const decodeUnknownOption: <S extends ConstraintDecoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (input: unknown, options?: SchemaAST.ParseOptions) => Option_.Option<S["Type"]> = SchemaParser.decodeUnknownOption
/**
 * Decodes a typed input (the schema's `Encoded` type) against a schema,
 * returning an `Option` that is `Some` with the decoded value on success or
 * `None` for schema mismatches.
 *
 * **When to use**
 *
 * Use when you already have input typed as the schema's `Encoded` type and
 * only need to know whether decoding succeeded.
 *
 * **Details**
 *
 * For `unknown` input use {@link decodeUnknownOption}.
 * Options may be provided either when creating the decoder or when applying it;
 * application options override creation options.
 *
 * **Gotchas**
 *
 * Only causes made entirely of schema issues are converted to `None`. Causes
 * that contain defects, interruptions, or other non-schema reasons throw
 * instead.
 *
 * @category decoding
 * @since 3.10.0
 */
export const decodeOption: <S extends ConstraintDecoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (input: S["Encoded"], options?: SchemaAST.ParseOptions) => Option_.Option<S["Type"]> = SchemaParser.decodeOption
/**
 * Decodes an `unknown` input against a schema, returning a `Result` that
 * succeeds with the decoded value or fails with a {@link SchemaError} for schema
 * mismatches.
 *
 * **When to use**
 *
 * Use when you do not know the input type statically and want schema mismatches
 * returned as `Result.fail` with `SchemaError`.
 *
 * **Details**
 *
 * For input already typed as the schema's `Encoded` type use
 * {@link decodeResult}.
 * Options may be provided either when creating the decoder or when applying it;
 * application options override creation options.
 * Schema mismatches are returned as `Result.fail` with `SchemaError`.
 *
 * **Gotchas**
 *
 * Only causes made entirely of schema issues are returned as `Result.fail`.
 * Causes that contain defects, interruptions, or other non-schema reasons throw
 * instead.
 *
 * @see {@link SchemaParser.decodeUnknownResult} for the adapter that fails with `SchemaIssue.Issue` directly
 *
 * @category decoding
 * @since 4.0.0
 */
export function decodeUnknownResult<S extends ConstraintDecoder<unknown>>(schema: S, options?: SchemaAST.ParseOptions) {
  const parser = SchemaParser.decodeUnknownResult(schema, options)
  return (input: unknown, options?: SchemaAST.ParseOptions): Result_.Result<S["Type"], SchemaError> => {
    return Result_.mapError(parser(input, options), (issue) => new SchemaError(issue))
  }
}
/**
 * Decodes a typed input (the schema's `Encoded` type) against a schema,
 * returning a `Result` that succeeds with the decoded value or fails with a
 * {@link SchemaError} for schema mismatches.
 *
 * **When to use**
 *
 * Use when you already have input typed as the schema's `Encoded` type and want
 * schema mismatches returned as `Result.fail` with `SchemaError`.
 *
 * **Details**
 *
 * For `unknown` input use {@link decodeUnknownResult}.
 * Options may be provided either when creating the decoder or when applying it;
 * application options override creation options.
 * Schema mismatches are returned as `Result.fail` with `SchemaError`.
 *
 * **Gotchas**
 *
 * Only causes made entirely of schema issues are returned as `Result.fail`.
 * Causes that contain defects, interruptions, or other non-schema reasons throw
 * instead.
 *
 * @see {@link SchemaParser.decodeResult} for the adapter that fails with `SchemaIssue.Issue` directly
 *
 * @category decoding
 * @since 4.0.0
 */
export const decodeResult: <S extends ConstraintDecoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (input: S["Encoded"], options?: SchemaAST.ParseOptions) => Result_.Result<S["Type"], SchemaError> =
  decodeUnknownResult
/**
 * Decodes an `unknown` input against a schema, returning a `Promise` that
 * resolves with the decoded value or rejects with a {@link SchemaError} for
 * schema mismatches.
 *
 * **When to use**
 *
 * Use when you need decoding of unknown input to return a JavaScript `Promise`
 * that rejects with `SchemaError` for schema mismatches.
 *
 * **Details**
 *
 * For input already typed as the schema's `Encoded` type use
 * {@link decodePromise}.
 * Options may be provided either when creating the decoder or when applying it;
 * application options override creation options.
 *
 * **Gotchas**
 *
 * Non-schema failures may reject with a runtime failure instead of
 * `SchemaError`.
 *
 * @see {@link SchemaParser.decodeUnknownPromise} for the adapter that rejects with an `Error` whose cause is `SchemaIssue.Issue`
 *
 * @category decoding
 * @since 3.10.0
 */
export function decodeUnknownPromise<S extends ConstraintDecoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
) {
  const parser = decodeUnknownEffect(schema, options)
  return (input: unknown, options?: SchemaAST.ParseOptions): Promise<S["Type"]> => {
    return runSchemaErrorPromise(parser(input, options))
  }
}
/**
 * Decodes a typed input (the schema's `Encoded` type) against a schema,
 * returning a `Promise` that resolves with the decoded value or rejects with a
 * {@link SchemaError} for schema mismatches.
 *
 * **When to use**
 *
 * Use when you already have input typed as the schema's `Encoded` type and
 * need decoding to return a JavaScript `Promise` that rejects with
 * `SchemaError` for schema mismatches.
 *
 * **Details**
 *
 * For `unknown` input use `decodeUnknownPromise`.
 * Options may be provided either when creating the decoder or when applying it;
 * application options override creation options.
 *
 * **Gotchas**
 *
 * Non-schema failures may reject with a runtime failure instead of
 * `SchemaError`.
 *
 * @see {@link SchemaParser.decodePromise} for the adapter that rejects with an `Error` whose cause is `SchemaIssue.Issue`
 *
 * @category decoding
 * @since 3.10.0
 */
export const decodePromise: <S extends ConstraintDecoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (input: S["Encoded"], options?: SchemaAST.ParseOptions) => Promise<S["Type"]> = decodeUnknownPromise
/**
 * Decodes an `unknown` input against a schema synchronously, returning the
 * decoded value or throwing a {@link SchemaError} for schema mismatches.
 *
 * **When to use**
 *
 * Use when you need to validate unknown data at a synchronous boundary and want
 * schema mismatches to throw `SchemaError`.
 *
 * **Details**
 *
 * For input already typed as the schema's `Encoded` type use `decodeSync`.
 * Only service-free schemas can be decoded synchronously. For alternatives that
 * do not throw on schema mismatches, see `decodeUnknownOption`,
 * `decodeUnknownExit`, or `decodeUnknownEffect`. Options may be provided either
 * when creating the decoder or when applying it; application options override
 * creation options.
 *
 * **Gotchas**
 *
 * Non-schema failures may throw a runtime failure instead of `SchemaError`.
 *
 * **Example** (Decoding with a transformation schema)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const NumberFromString = Schema.NumberFromString
 *
 * Schema.decodeUnknownSync(NumberFromString)("42") // => 42
 * ```
 *
 * @see {@link SchemaParser.decodeUnknownSync} for the adapter that throws an `Error` whose cause is `SchemaIssue.Issue`
 *
 * @category decoding
 * @since 4.0.0
 */
export function decodeUnknownSync<S extends ConstraintDecoder<unknown>>(schema: S, options?: SchemaAST.ParseOptions) {
  const parser = decodeUnknownEffect(schema, options)
  return (input: unknown, options?: SchemaAST.ParseOptions): S["Type"] => {
    return runSchemaErrorSync(parser(input, options))
  }
}
/**
 * Decodes a typed input (the schema's `Encoded` type) against a schema
 * synchronously, returning the decoded value or throwing a {@link SchemaError}
 * for schema mismatches.
 *
 * **When to use**
 *
 * Use when you already have input typed as the schema's `Encoded` type and
 * want schema mismatches to throw `SchemaError` synchronously.
 *
 * **Details**
 *
 * For `unknown` input use `decodeUnknownSync`.
 * Only service-free schemas can be decoded synchronously. Options may be
 * provided either when creating the decoder or when applying it; application
 * options override creation options.
 *
 * **Gotchas**
 *
 * Non-schema failures may throw a runtime failure instead of `SchemaError`.
 *
 * @see {@link SchemaParser.decodeSync} for the adapter that throws an `Error` whose cause is `SchemaIssue.Issue`
 *
 * @category decoding
 * @since 4.0.0
 */
export const decodeSync: <S extends ConstraintDecoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (input: S["Encoded"], options?: SchemaAST.ParseOptions) => S["Type"] = decodeUnknownSync
/**
 * Encodes an `unknown` input against a schema, returning an `Effect` that
 * succeeds with the encoded value or fails with a {@link SchemaError}.
 *
 * **When to use**
 *
 * Use when you need to encode unknown input in an `Effect` whose failure
 * channel is `SchemaError`.
 *
 * **Details**
 *
 * Prefer {@link encodeEffect} when the value is already typed as the schema's
 * `Type`.
 * Options may be provided either when creating the encoder or when applying it;
 * application options override creation options.
 *
 * **Example** (Encoding a value to a string)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema } from "effect"
 *
 * const NumberFromString = Schema.NumberFromString
 *
 * await Effect.runPromise(Schema.encodeUnknownEffect(NumberFromString)(42)) // => "42"
 * ```
 *
 * @see {@link SchemaParser.encodeUnknownEffect} for the adapter that fails with `SchemaIssue.Issue` directly
 *
 * @category encoding
 * @since 4.0.0
 */
export function encodeUnknownEffect<S extends Constraint>(schema: S, options?: SchemaAST.ParseOptions) {
  const parser = SchemaParser.encodeUnknownEffect(schema, options)
  return (
    input: unknown,
    options?: SchemaAST.ParseOptions
  ): Effect.Effect<S["Encoded"], SchemaError, S["EncodingServices"]> => {
    return fromIssueEffect(parser(input, options))
  }
}
/**
 * Encodes a typed input (the schema's `Type`) against a schema, returning an
 * `Effect` that succeeds with the encoded value or fails with a
 * {@link SchemaError}.
 *
 * **When to use**
 *
 * Use when you need to encode input already typed as the schema's `Type` in
 * an `Effect` whose failure channel is `SchemaError`.
 *
 * **Details**
 *
 * For `unknown` input use {@link encodeUnknownEffect}.
 * Options may be provided either when creating the encoder or when applying it;
 * application options override creation options.
 *
 * @see {@link SchemaParser.encodeEffect} for the adapter that fails with `SchemaIssue.Issue` directly
 *
 * @category encoding
 * @since 4.0.0
 */
export const encodeEffect: <S extends Constraint>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (
  input: S["Type"],
  options?: SchemaAST.ParseOptions
) => Effect.Effect<S["Encoded"], SchemaError, S["EncodingServices"]> = encodeUnknownEffect
/**
 * Encodes an `unknown` input against a schema synchronously, returning an
 * `Exit` that is either a `Success` with the encoded value or a `Failure`.
 *
 * **When to use**
 *
 * Use when you need to encode unknown input into an `Exit` and capture schema
 * mismatches as `SchemaError`.
 *
 * **Details**
 *
 * Only usable with schemas that have no `EncodingServices` requirement. Prefer
 * {@link encodeExit} when the value is already typed as the schema's `Type`.
 * Options may be provided either when creating the encoder or when applying it;
 * application options override creation options.
 * Schema mismatches are represented by a `Failure` cause containing
 * `SchemaError`.
 *
 * **Gotchas**
 *
 * Schema issue fail reasons are wrapped as `SchemaError`. Defects,
 * interruptions, and other non-schema reasons remain in the returned `Cause`,
 * including when they are mixed with schema issues.
 *
 * @see {@link SchemaParser.encodeUnknownExit} for the adapter whose failure contains `SchemaIssue.Issue` directly
 *
 * @category encoding
 * @since 4.0.0
 */
export function encodeUnknownExit<S extends ConstraintEncoder<unknown>>(schema: S, options?: SchemaAST.ParseOptions) {
  const parser = SchemaParser.encodeUnknownExit(schema, options)
  return (input: unknown, options?: SchemaAST.ParseOptions): Exit_.Exit<S["Encoded"], SchemaError> => {
    return fromIssueExit(parser(input, options))
  }
}
/**
 * Encodes a typed input (the schema's `Type`) against a schema synchronously,
 * returning an `Exit` that is either a `Success` with the encoded value or a
 * `Failure`.
 *
 * **When to use**
 *
 * Use when you need to encode already typed schema values into an `Exit` and
 * capture schema mismatches as `SchemaError`.
 *
 * **Details**
 *
 * Only usable with schemas that have no `EncodingServices` requirement. For
 * `unknown` input use {@link encodeUnknownExit}.
 * Options may be provided either when creating the encoder or when applying it;
 * application options override creation options.
 * Schema mismatches are represented by a `Failure` cause containing
 * `SchemaError`.
 *
 * **Gotchas**
 *
 * Schema issue fail reasons are wrapped as `SchemaError`. Defects,
 * interruptions, and other non-schema reasons remain in the returned `Cause`,
 * including when they are mixed with schema issues.
 *
 * @see {@link SchemaParser.encodeExit} for the adapter whose failure contains `SchemaIssue.Issue` directly
 *
 * @category encoding
 * @since 4.0.0
 */
export const encodeExit: <S extends ConstraintEncoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (input: S["Type"], options?: SchemaAST.ParseOptions) => Exit_.Exit<S["Encoded"], SchemaError> = encodeUnknownExit
/**
 * Encodes an `unknown` input against a schema, returning an `Option` that is
 * `Some` with the encoded value on success or `None` for schema mismatches.
 *
 * **When to use**
 *
 * Use when you do not know the input type statically and only need to know
 * whether encoding succeeded.
 *
 * **Details**
 *
 * Prefer this over {@link encodeUnknownExit} or {@link encodeUnknownEffect}
 * when you don't need error details. For values already typed as the schema's
 * `Type` use {@link encodeOption}.
 * Options may be provided either when creating the encoder or when applying it;
 * application options override creation options.
 *
 * **Gotchas**
 *
 * Only causes made entirely of schema issues are converted to `None`. Causes
 * that contain defects, interruptions, or other non-schema reasons throw
 * instead.
 *
 * @category encoding
 * @since 3.10.0
 */
export const encodeUnknownOption: <S extends ConstraintEncoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (input: unknown, options?: SchemaAST.ParseOptions) => Option_.Option<S["Encoded"]> =
  SchemaParser.encodeUnknownOption
/**
 * Encodes a typed input (the schema's `Type`) against a schema, returning an
 * `Option` that is `Some` with the encoded value on success or `None` for schema
 * mismatches.
 *
 * **When to use**
 *
 * Use when you already have a value typed as the schema's `Type` and only need
 * to know whether encoding succeeded.
 *
 * **Details**
 *
 * For `unknown` input use {@link encodeUnknownOption}.
 * Options may be provided either when creating the encoder or when applying it;
 * application options override creation options.
 *
 * **Gotchas**
 *
 * Only causes made entirely of schema issues are converted to `None`. Causes
 * that contain defects, interruptions, or other non-schema reasons throw
 * instead.
 *
 * @category encoding
 * @since 3.10.0
 */
export const encodeOption: <S extends ConstraintEncoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (input: S["Type"], options?: SchemaAST.ParseOptions) => Option_.Option<S["Encoded"]> = SchemaParser.encodeOption
/**
 * Encodes an `unknown` input against a schema, returning a `Result` that
 * succeeds with the encoded value or fails with a {@link SchemaError} for schema
 * mismatches.
 *
 * **When to use**
 *
 * Use when you do not know the input type statically and want schema mismatches
 * returned as `Result.fail` with `SchemaError`.
 *
 * **Details**
 *
 * For values already typed as the schema's `Type` use {@link encodeResult}.
 * Options may be provided either when creating the encoder or when applying it;
 * application options override creation options.
 * Schema mismatches are returned as `Result.fail` with `SchemaError`.
 *
 * **Gotchas**
 *
 * Only causes made entirely of schema issues are returned as `Result.fail`.
 * Causes that contain defects, interruptions, or other non-schema reasons throw
 * instead.
 *
 * @see {@link SchemaParser.encodeUnknownResult} for the adapter that fails with `SchemaIssue.Issue` directly
 *
 * @category encoding
 * @since 4.0.0
 */
export function encodeUnknownResult<S extends ConstraintEncoder<unknown>>(schema: S, options?: SchemaAST.ParseOptions) {
  const parser = SchemaParser.encodeUnknownResult(schema, options)
  return (input: unknown, options?: SchemaAST.ParseOptions): Result_.Result<S["Encoded"], SchemaError> => {
    return Result_.mapError(parser(input, options), (issue) => new SchemaError(issue))
  }
}
/**
 * Encodes a typed input (the schema's `Type`) against a schema, returning a
 * `Result` that succeeds with the encoded value or fails with a
 * {@link SchemaError} for schema mismatches.
 *
 * **When to use**
 *
 * Use when you already have a value typed as the schema's `Type` and want schema
 * mismatches returned as `Result.fail` with `SchemaError`.
 *
 * **Details**
 *
 * For `unknown` input use {@link encodeUnknownResult}.
 * Options may be provided either when creating the encoder or when applying it;
 * application options override creation options.
 * Schema mismatches are returned as `Result.fail` with `SchemaError`.
 *
 * **Gotchas**
 *
 * Only causes made entirely of schema issues are returned as `Result.fail`.
 * Causes that contain defects, interruptions, or other non-schema reasons throw
 * instead.
 *
 * @see {@link SchemaParser.encodeResult} for the adapter that fails with `SchemaIssue.Issue` directly
 *
 * @category encoding
 * @since 4.0.0
 */
export const encodeResult: <S extends ConstraintEncoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (input: S["Type"], options?: SchemaAST.ParseOptions) => Result_.Result<S["Encoded"], SchemaError> =
  encodeUnknownResult
/**
 * Encodes an `unknown` input against a schema, returning a `Promise` that
 * resolves with the encoded value or rejects with a {@link SchemaError} for
 * schema mismatches.
 *
 * **When to use**
 *
 * Use when you need encoding of unknown input to return a JavaScript `Promise`
 * that rejects with `SchemaError` for schema mismatches.
 *
 * **Details**
 *
 * For values already typed as the schema's `Type` use {@link encodePromise}.
 * Options may be provided either when creating the encoder or when applying it;
 * application options override creation options.
 *
 * **Gotchas**
 *
 * Non-schema failures may reject with a runtime failure instead of
 * `SchemaError`.
 *
 * @see {@link SchemaParser.encodeUnknownPromise} for the adapter that rejects with an `Error` whose cause is `SchemaIssue.Issue`
 *
 * @category encoding
 * @since 3.10.0
 */
export function encodeUnknownPromise<S extends ConstraintEncoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
) {
  const parser = encodeUnknownEffect(schema, options)
  return (input: unknown, options?: SchemaAST.ParseOptions): Promise<S["Encoded"]> => {
    return runSchemaErrorPromise(parser(input, options))
  }
}
/**
 * Encodes a typed input (the schema's `Type`) against a schema, returning a
 * `Promise` that resolves with the encoded value or rejects with a
 * {@link SchemaError} for schema mismatches.
 *
 * **When to use**
 *
 * Use when you already have a value typed as the schema's `Type` and need
 * encoding to return a JavaScript `Promise` that rejects with `SchemaError` for
 * schema mismatches.
 *
 * **Details**
 *
 * For `unknown` input use {@link encodeUnknownPromise}.
 * Options may be provided either when creating the encoder or when applying it;
 * application options override creation options.
 *
 * **Gotchas**
 *
 * Non-schema failures may reject with a runtime failure instead of
 * `SchemaError`.
 *
 * @see {@link SchemaParser.encodePromise} for the adapter that rejects with an `Error` whose cause is `SchemaIssue.Issue`
 *
 * @category encoding
 * @since 3.10.0
 */
export const encodePromise: <S extends ConstraintEncoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (input: S["Type"], options?: SchemaAST.ParseOptions) => Promise<S["Encoded"]> = encodeUnknownPromise
/**
 * Encodes an `unknown` input against a schema synchronously, throwing a
 * {@link SchemaError} for schema mismatches.
 *
 * **When to use**
 *
 * Use when you need to serialize unknown data at a synchronous boundary and
 * want schema mismatches to throw `SchemaError`.
 *
 * **Details**
 *
 * For alternatives that do not throw on schema mismatches, see
 * {@link encodeUnknownOption}, {@link encodeUnknownExit}, or
 * {@link encodeUnknownEffect}. For values already typed as the schema's `Type`
 * use {@link encodeSync}. Options may be provided either when creating the
 * encoder or when applying it; application options override creation options.
 *
 * **Gotchas**
 *
 * Non-schema failures may throw a runtime failure instead of `SchemaError`.
 *
 * @see {@link SchemaParser.encodeUnknownSync} for the adapter that throws an `Error` whose cause is `SchemaIssue.Issue`
 *
 * @category encoding
 * @since 4.0.0
 */
export function encodeUnknownSync<S extends ConstraintEncoder<unknown>>(schema: S, options?: SchemaAST.ParseOptions) {
  const parser = encodeUnknownEffect(schema, options)
  return (input: unknown, options?: SchemaAST.ParseOptions): S["Encoded"] => {
    return runSchemaErrorSync(parser(input, options) as Effect.Effect<S["Encoded"], SchemaError>)
  }
}
/**
 * Encodes a typed input (the schema's `Type`) against a schema synchronously,
 * throwing a {@link SchemaError} for schema mismatches.
 *
 * **When to use**
 *
 * Use when you already have a value typed as the schema's `Type` and want
 * schema mismatches to throw `SchemaError` synchronously.
 *
 * **Details**
 *
 * For `unknown` input use {@link encodeUnknownSync}.
 * Options may be provided either when creating the encoder or when applying it;
 * application options override creation options.
 *
 * **Gotchas**
 *
 * Non-schema failures may throw a runtime failure instead of `SchemaError`.
 *
 * @see {@link SchemaParser.encodeSync} for the adapter that throws an `Error` whose cause is `SchemaIssue.Issue`
 *
 * @category encoding
 * @since 4.0.0
 */
export const encodeSync: <S extends ConstraintEncoder<unknown>>(
  schema: S,
  options?: SchemaAST.ParseOptions
) => (input: S["Type"], options?: SchemaAST.ParseOptions) => S["Encoded"] = encodeUnknownSync
/**
 * Creates a schema from an AST (Abstract Syntax Tree) node.
 *
 * **Details**
 *
 * This is the fundamental constructor for all schemas in the Effect Schema
 * library. It takes an AST node and wraps it in a fully-typed schema that
 * preserves all type information and provides the complete schema API.
 *
 * The `make` function is used internally to create all primitive schemas like
 * `String`, `Number`, `Boolean`, etc., as well as more complex schemas. It's
 * the bridge between the untyped AST representation and the strongly-typed
 * schema.
 *
 * @category constructors
 * @since 3.10.0
 */
export const make: <S extends Constraint>(ast: S["ast"], options?: object) => S = InternalMake.make
/**
 * Checks whether a value is a `Schema`.
 *
 * @category guards
 * @since 3.10.0
 */
export function isSchema(u: unknown): u is Top {
  return Predicate.hasProperty(u, TypeId) && u[TypeId] === TypeId
}
/**
 * Type-level representation returned by {@link optionalKey}.
 *
 * @category models
 * @since 4.0.0
 */
export interface optionalKey<S extends Constraint> extends
  BottomLazy<
    S["ast"],
    optionalKey<S>,
    S["~type.parameters"],
    S["~type.mutability"],
    "optional",
    S["~type.constructor.default"],
    S["~encoded.mutability"],
    "optional"
  >
{
  readonly "Type": S["Type"]
  readonly "Encoded": S["Encoded"]
  readonly "DecodingServices": S["DecodingServices"]
  readonly "EncodingServices": S["EncodingServices"]
  readonly "~type.make.in": S["~type.make.in"]
  readonly "~type.make": S["~type.make"]
  readonly "Iso": S["Iso"]
  readonly schema: S
}
interface optionalKeyLambda extends Lambda {
  <S extends Constraint>(self: S): optionalKey<S>
  readonly "~lambda.out": this["~lambda.in"] extends Constraint ? optionalKey<this["~lambda.in"]> : never
}
/**
 * Creates an exact optional key schema for struct fields. Unlike `optional`,
 * this creates exact optional properties (not `| undefined`) that can be
 * completely omitted from the object.
 *
 * **Example** (Creating a struct with optional key)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const schema = Schema.Struct({
 *   name: Schema.String,
 *   age: Schema.optionalKey(Schema.Number)
 * })
 *
 * // Type: { readonly name: string; readonly age?: number }
 * type Person = typeof schema["Type"]
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const optionalKey: optionalKeyLambda = Struct_.lambda<optionalKeyLambda>((schema) =>
  make(SchemaAST.optionalKey(schema.ast), { schema })
)
interface requiredKeyLambda extends Lambda {
  <S extends Constraint>(self: optionalKey<S>): S
  readonly "~lambda.out": this["~lambda.in"] extends optionalKey<Constraint> ? this["~lambda.in"]["schema"]
    : "Error: schema not eligible for requiredKey"
}
/**
 * Reverses `optionalKey` and returns the inner required schema.
 *
 * **When to use**
 *
 * Use to remove optional-key wrapping from a schema field that was previously
 * wrapped with {@link optionalKey}.
 *
 * @category combinators
 * @since 4.0.0
 */
export const requiredKey: requiredKeyLambda = Struct_.lambda<requiredKeyLambda>((self) => self.schema)
/**
 * Type-level representation returned by {@link optional}.
 *
 * @category models
 * @since 3.10.0
 */
export interface optional<S extends Constraint> extends optionalKey<UndefinedOr<S>> {
  readonly "Rebuild": optional<S>
}
interface optionalLambda extends Lambda {
  <S extends Constraint>(self: S): optional<S>
  readonly "~lambda.out": this["~lambda.in"] extends Constraint ? optional<this["~lambda.in"]> : never
}
/**
 * Marks a struct field as optional, allowing the key to be absent or
 * `undefined`.
 *
 * **Details**
 *
 * The resulting property may be absent or explicitly set to `undefined`.
 * Equivalent to `optionalKey(UndefinedOr(S))`.
 *
 * Use {@link optionalKey} instead if you want exact optional semantics (absent
 * only, not `undefined`).
 *
 * **Example** (Defining an optional field accepting undefined)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const schema = Schema.Struct({
 *   name: Schema.String,
 *   age: Schema.optional(Schema.Number)
 * })
 *
 * // { readonly name: string; readonly age?: number | undefined }
 * type Person = typeof schema.Type
 * ```
 *
 * @category combinators
 * @since 3.10.0
 */
export const optional: optionalLambda = Struct_.lambda<optionalLambda>((self) => {
  const schema = UndefinedOr(self)
  return make(SchemaAST.optional(self.ast), { schema })
})
interface requiredLambda extends Lambda {
  <S extends Constraint>(self: optional<S>): S
  readonly "~lambda.out": this["~lambda.in"] extends optional<Constraint> ? this["~lambda.in"]["schema"]["members"][0]
    : "Error: schema not eligible for required"
}
/**
 * Reverses `optional` and returns the inner schema.
 *
 * **When to use**
 *
 * Use to remove optional wrapping from a schema field that was previously
 * wrapped with {@link optional}.
 *
 * **Details**
 *
 * This also unwraps the `UndefinedOr` member added by `optional`.
 *
 * @category combinators
 * @since 3.10.0
 */
export const required: requiredLambda = Struct_.lambda<requiredLambda>((self) => self.schema.members[0])
/**
 * Type-level representation returned by {@link mutableKey}.
 *
 * @category models
 * @since 4.0.0
 */
export interface mutableKey<S extends Constraint> extends
  BottomLazy<
    S["ast"],
    mutableKey<S>,
    S["~type.parameters"],
    "mutable",
    S["~type.optionality"],
    S["~type.constructor.default"],
    "mutable",
    S["~encoded.optionality"]
  >
{
  readonly "Type": S["Type"]
  readonly "Encoded": S["Encoded"]
  readonly "DecodingServices": S["DecodingServices"]
  readonly "EncodingServices": S["EncodingServices"]
  readonly "~type.make.in": S["~type.make.in"]
  readonly "~type.make": S["~type.make"]
  readonly "Iso": S["Iso"]
  readonly schema: S
}
interface mutableKeyLambda extends Lambda {
  <S extends Constraint>(self: S): mutableKey<S>
  readonly "~lambda.out": this["~lambda.in"] extends Constraint ? mutableKey<this["~lambda.in"]> : never
}
/**
 * Makes a struct field mutable (removes the `readonly` modifier on the property).
 * Use {@link readonlyKey} to reverse.
 *
 * @category combinators
 * @since 4.0.0
 */
export const mutableKey: mutableKeyLambda = Struct_.lambda<mutableKeyLambda>((schema) =>
  make(SchemaAST.mutableKey(schema.ast), { schema })
)
interface readonlyKeyLambda extends Lambda {
  <S extends Constraint>(self: mutableKey<S>): S
  readonly "~lambda.out": this["~lambda.in"] extends mutableKey<Constraint> ? this["~lambda.in"]["schema"]
    : "Error: schema not eligible for readonlyKey"
}
/**
 * Reverses `mutableKey` and returns the inner readonly schema.
 *
 * **When to use**
 *
 * Use to remove mutable-key wrapping from a schema field that was previously
 * wrapped with {@link mutableKey}.
 *
 * @category combinators
 * @since 4.0.0
 */
export const readonlyKey: readonlyKeyLambda = Struct_.lambda<readonlyKeyLambda>((self) => self.schema)
/**
 * Type-level representation returned by {@link toType}.
 *
 * @category transforming
 * @since 4.0.0
 */
export interface toType<S extends Constraint> extends
  BottomLazy<
    S["ast"],
    toType<S>,
    S["~type.parameters"],
    S["~type.mutability"],
    S["~type.optionality"],
    S["~type.constructor.default"],
    S["~encoded.mutability"],
    S["~encoded.optionality"]
  >
{
  readonly "Type": S["Type"]
  readonly "Encoded": S["Type"]
  readonly "DecodingServices": never
  readonly "EncodingServices": never
  readonly "~type.make.in": S["~type.make.in"]
  readonly "~type.make": S["~type.make"]
  readonly "Iso": S["Iso"]
  readonly schema: S
}
interface toTypeLambda extends Lambda {
  <S extends Constraint>(self: S): toType<S>
  readonly "~lambda.out": this["~lambda.in"] extends Constraint ? toType<this["~lambda.in"]> : never
}
/**
 * Extracts the type-side schema: sets `Encoded` to equal the decoded `Type`,
 * discarding the encoding transformation path.
 *
 * @category transforming
 * @since 4.0.0
 */
export const toType: toTypeLambda = Struct_.lambda<toTypeLambda>((schema) =>
  make(SchemaAST.toType(schema.ast), { schema })
)
/**
 * Type-level representation returned by {@link toEncoded}.
 *
 * @category transforming
 * @since 4.0.0
 */
export interface toEncoded<S extends Constraint> extends
  BottomLazy<
    SchemaAST.AST,
    toEncoded<S>,
    ReadonlyArray<Constraint>,
    S["~type.mutability"],
    S["~type.optionality"],
    S["~type.constructor.default"],
    S["~encoded.mutability"],
    S["~encoded.optionality"]
  >
{
  readonly "Type": S["Encoded"]
  readonly "Encoded": S["Encoded"]
  readonly "DecodingServices": never
  readonly "EncodingServices": never
  readonly "~type.make.in": S["Encoded"]
  readonly "~type.make": S["Encoded"]
  readonly "Iso": S["Encoded"]
  readonly schema: S
}
interface toEncodedLambda extends Lambda {
  <S extends Constraint>(self: S): toEncoded<S>
  readonly "~lambda.out": this["~lambda.in"] extends Constraint ? toEncoded<this["~lambda.in"]> : never
}
/**
 * Extracts the encoded-side schema: sets `Type` to equal the `Encoded`,
 * discarding the decoding transformation path.
 *
 * @category transforming
 * @since 4.0.0
 */
export const toEncoded: toEncodedLambda = Struct_.lambda<toEncodedLambda>((schema) =>
  make(SchemaAST.toEncoded(schema.ast), { schema })
)
const FlipTypeId = "~effect/Schema/flip"
/**
 * Type-level representation returned by {@link flip}.
 *
 * @category transforming
 * @since 4.0.0
 */
export interface flip<S extends Top> extends
  BottomLazy<
    SchemaAST.AST,
    flip<S>,
    ReadonlyArray<Constraint>,
    S["~encoded.mutability"],
    S["~encoded.optionality"],
    ConstructorDefault,
    S["~type.mutability"],
    S["~type.optionality"]
  >
{
  readonly "Type": S["Encoded"]
  readonly "Encoded": S["Type"]
  readonly "DecodingServices": S["EncodingServices"]
  readonly "EncodingServices": S["DecodingServices"]
  readonly "~type.make.in": S["Encoded"]
  readonly "~type.make": S["Encoded"]
  readonly "Iso": S["Encoded"]
  readonly [FlipTypeId]: typeof FlipTypeId
  readonly schema: S
}

function isFlip$(schema: Top): schema is flip<any> {
  return Predicate.hasProperty(schema, FlipTypeId) && schema[FlipTypeId] === FlipTypeId
}
/**
 * Swaps the decoded and encoded sides of a schema.
 *
 * **When to use**
 *
 * Use to invert a schema transformation direction.
 *
 * **Details**
 *
 * Calling `flip` twice returns the original schema.
 *
 * **Example** (Flipping a number-from-string schema)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * // NumberFromString: decodes string → number
 * const flipped = Schema.flip(Schema.NumberFromString)
 * Schema.decodeSync(flipped)(42) // => "42"
 * ```
 *
 * @category transforming
 * @since 4.0.0
 */
export function flip<S extends Top>(schema: S): S extends flip<infer F> ? F["Rebuild"] : flip<S>
export function flip<S extends Top>(schema: S): flip<S> {
  if (isFlip$(schema)) {
    return schema.schema.rebuild(SchemaAST.flip(schema.ast))
  }
  return make(SchemaAST.flip(schema.ast), { [FlipTypeId]: FlipTypeId, schema })
}
/**
 * Type-level representation returned by {@link Literal}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Literal<L extends SchemaAST.LiteralValue>
  extends Bottom<L, L, never, never, SchemaAST.Literal, Literal<L>>
{
  readonly literal: L
  transform<L2 extends SchemaAST.LiteralValue>(to: L2): decodeTo<Literal<L2>, Literal<L>>
}
/**
 * Creates a schema for a single literal value (string, number, bigint, boolean, or null).
 *
 * **Example** (Defining a string literal)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const schema = Schema.Literal("hello")
 * // Type: Schema.Literal<"hello">
 * Schema.decodeSync(schema)("hello") // => "hello"
 * ```
 *
 * @see {@link Literals} for a schema that represents a union of literals.
 * @see {@link tag} for a schema that represents a literal value that can be
 * used as a discriminator field in tagged unions and has a constructor default.
 * @category constructors
 * @since 3.10.0
 */
export function Literal<L extends SchemaAST.LiteralValue>(literal: L): Literal<L> {
  const out = make<Literal<L>>(new SchemaAST.Literal(literal), {
    literal,
    transform<L2 extends SchemaAST.LiteralValue>(to: L2): decodeTo<Literal<L2>, Literal<L>> {
      return out.pipe(decodeTo(Literal(to), {
        decode: SchemaGetter.transform(() => to),
        encode: SchemaGetter.transform(() => literal)
      }))
    }
  })
  return out
}
/**
 * Namespace for {@link TemplateLiteral} helper types.
 *
 * @since 3.10.0
 */
export declare namespace TemplateLiteral {
  /**
   * Constraint for schema parts that can appear inside a `TemplateLiteral`.
   *
   * **Details**
   *
   * The schema's encoded value must be a `string`, `number`, or `bigint` so it can
   * be converted into a template literal string segment.
   * `TemplateLiteral` additionally rejects encodings at runtime;
   * `TemplateLiteralParser` supports transformed parts.
   *
   * @category utility types
   * @since 4.0.0
   */
  interface SchemaPart extends Constraint {
    readonly Encoded: string | number | bigint
  }
  /**
   * Literal value that can be used directly as a part of a `TemplateLiteral`.
   *
   * @category utility types
   * @since 4.0.0
   */
  type LiteralPart = string | number | bigint
  /**
   * A single part of a `TemplateLiteral`, either an interpolated schema part or a
   * literal `string`, `number`, or `bigint`.
   *
   * @category utility types
   * @since 4.0.0
   */
  type Part = SchemaPart | LiteralPart
  /**
   * Ordered list of parts used to construct a `TemplateLiteral` schema.
   *
   * @category utility types
   * @since 4.0.0
   */
  type Parts = ReadonlyArray<Part>
  type AppendType<Template extends string, Next> = Next extends LiteralPart ? `${Template}${Next}` : Next extends {
    readonly Encoded: infer E extends LiteralPart
  } ? `${Template}${E}` :
  never
  /**
   * Computes the encoded string literal type produced by concatenating the encoded
   * forms of all template literal parts.
   *
   * @category utility types
   * @since 3.10.0
   */
  type Encoded<Parts> = Parts extends readonly [...infer Init, infer Last] ? AppendType<Encoded<Init>, Last> : ``
}
/**
 * Type-level representation returned by {@link TemplateLiteral}.
 *
 * @category models
 * @since 3.10.0
 */
export interface TemplateLiteral<Parts extends TemplateLiteral.Parts> extends
  Bottom<
    TemplateLiteral.Encoded<Parts>,
    TemplateLiteral.Encoded<Parts>,
    never,
    never,
    SchemaAST.TemplateLiteral,
    TemplateLiteral<Parts>
  >
{
  readonly parts: Parts
}

function templateLiteralParts(parts: TemplateLiteral.Parts) {
  return parts.map((part) => isSchema(part) ? part.ast : new SchemaAST.Literal(part as TemplateLiteral.LiteralPart))
}
/**
 * Creates a schema that validates strings by matching ordered template literal
 * parts.
 *
 * **When to use**
 *
 * Use when the decoded value should remain the matched string and you do not
 * need the individual template parts parsed into a tuple.
 *
 * **Details**
 *
 * Each part can be a literal `string`, `number`, or `bigint`, or a schema whose
 * encoded type is `string`, `number`, or `bigint`. Checks on string, number,
 * and bigint schema parts are applied while matching each segment.
 *
 * **Gotchas**
 *
 * Parts must not contain encodings, including inside unions or nested templates.
 * Construction throws for transformed parts even when their decoded and encoded
 * types are the same. Use {@link TemplateLiteralParser} to decode transformed parts.
 * Brands and supported checks without encodings remain valid.
 *
 * **Example** (Defining a URL path pattern)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const schema = Schema.TemplateLiteral(["/user/", Schema.Number])
 * Schema.is(schema)("/user/123") // => true
 * ```
 *
 * @see {@link TemplateLiteralParser} for a schema that also parses matched parts into a tuple.
 * @category constructors
 * @since 3.10.0
 */
export function TemplateLiteral<const Parts extends TemplateLiteral.Parts>(parts: Parts): TemplateLiteral<Parts> {
  return make(new SchemaAST.TemplateLiteral(templateLiteralParts(parts)), { parts })
}
/**
 * Namespace for {@link TemplateLiteralParser} helper types.
 *
 * @since 3.10.0
 */
export declare namespace TemplateLiteralParser {
  /**
   * Computes the decoded tuple type produced by `TemplateLiteralParser`.
   *
   * **Details**
   *
   * Literal parts contribute their literal value to the tuple. Schema parts
   * contribute their decoded `Type`.
   *
   * @category utility types
   * @since 3.10.0
   */
  type Type<Parts> = Parts extends readonly [infer Head, ...infer Tail] ? readonly [
      Head extends TemplateLiteral.LiteralPart ? Head : Head extends ConstraintDecoder<infer T, unknown> ? T : never,
      ...Type<Tail>
    ] :
    []
}
/**
 * Type-level representation returned by {@link TemplateLiteralParser}.
 *
 * @category models
 * @since 3.10.0
 */
export interface TemplateLiteralParser<Parts extends TemplateLiteral.Parts> extends
  BottomLazy<
    SchemaAST.Arrays,
    TemplateLiteralParser<Parts>
  >
{
  readonly "Type": TemplateLiteralParser.Type<Parts>
  readonly "Encoded": TemplateLiteral.Encoded<Parts>
  readonly "DecodingServices": Extract<Parts[number], Constraint>["DecodingServices"]
  readonly "EncodingServices": Extract<Parts[number], Constraint>["EncodingServices"]
  readonly "~type.make.in": TemplateLiteralParser.Type<Parts>
  readonly "~type.make": TemplateLiteralParser.Type<Parts>
  readonly "Iso": TemplateLiteralParser.Type<Parts>
  readonly parts: Parts
}
/**
 * Schema for parsing matched template literal strings into typed tuple parts.
 *
 * **When to use**
 *
 * Use to validate a template literal string and decode the matched parts into
 * typed values.
 *
 * **Details**
 *
 * Unlike {@link TemplateLiteral}, this schema decodes the matched string into a
 * readonly tuple with one element per schema part. Checks on string, number,
 * and bigint schema parts are applied while matching each segment.
 * The source template uses the encoded sides of the parts; the tuple retains
 * their transformations, checks, and decoding and encoding service requirements.
 *
 * **Gotchas**
 *
 * Ambiguous templates use greedy segmentation with backtracking. Encoding a
 * tuple and decoding the resulting string can therefore produce a different
 * tuple when a segment contains a separator used by the template.
 *
 * **Example** (Parsing path parameters)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const schema = Schema.TemplateLiteralParser(["/user/", Schema.NumberFromString])
 * Schema.decodeSync(schema)("/user/42") // => ["/user/", 42]
 * ```
 *
 * @see {@link TemplateLiteral} for a validation-only version that keeps the string encoded.
 * @category constructors
 * @since 3.10.0
 */
export function TemplateLiteralParser<const Parts extends TemplateLiteral.Parts>(
  parts: Parts
): TemplateLiteralParser<Parts> {
  return make(SchemaAST.templateLiteralParser(templateLiteralParts(parts)), { parts })
}
/**
 * Type-level representation returned by {@link Enum}.
 *
 * @category models
 * @since 4.0.0
 */
export interface Enum<A extends { [x: string]: string | number }>
  extends Bottom<A[keyof A], A[keyof A], never, never, SchemaAST.Enum, Enum<A>>
{
  readonly enums: A
}
/**
 * Creates a schema from a TypeScript enum object. Validates that the input is one of the enum's values.
 * Numeric enum values must be finite.
 *
 * **Gotchas**
 *
 * Throws when a numeric member is `NaN`, `Infinity`, or `-Infinity`.
 *
 * **Example** (Defining a direction enum)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * enum Direction {
 *   Up = "Up",
 *   Down = "Down"
 * }
 *
 * const schema = Schema.Enum(Direction)
 * Schema.decodeSync(schema)(Direction.Up) // => "Up"
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export function Enum<A extends { [x: string]: string | number }>(enums: A): Enum<A> {
  return make(
    new SchemaAST.Enum(
      Object.keys(enums).filter(
        (key) => typeof enums[enums[key]] !== "number"
      ).map((key) => [key, enums[key]])
    ),
    { enums }
  )
}
/**
 * Type-level representation of {@link Never}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Never extends Bottom<never, never, never, never, SchemaAST.Never, Never> {}
/**
 * Schema for the `never` type. Always fails validation — no value satisfies it.
 *
 * @category schemas
 * @since 3.10.0
 */
export const Never: Never = make(SchemaAST.never)
/**
 * Type-level representation of {@link Any}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Any extends Bottom<any, any, never, never, SchemaAST.Any, Any> {}
/**
 * Schema for the `any` type. Accepts any value without validation.
 *
 * @see {@link Unknown} for a safer alternative that uses `unknown`.
 * @category schemas
 * @since 3.10.0
 */
export const Any: Any = make(SchemaAST.any)
/**
 * Type-level representation of {@link Unknown}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Unknown extends Bottom<unknown, unknown, never, never, SchemaAST.Unknown, Unknown> {}
/**
 * Schema for the `unknown` type. Accepts any value without validation.
 *
 * **When to use**
 *
 * Use as a top schema when you need to accept any input while preserving
 * TypeScript's `unknown` safety at use sites.
 *
 * @see {@link Any} for the `any` variant.
 * @category schemas
 * @since 3.10.0
 */
export const Unknown: Unknown = make(SchemaAST.unknown)
/**
 * Type-level representation of {@link Null}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Null extends Bottom<null, null, never, never, SchemaAST.Null, Null> {}
/**
 * Schema for the `null` literal. Validates that the input is strictly `null`.
 *
 * @see {@link NullOr} for a union with another schema.
 * @category schemas
 * @since 3.10.0
 */
export const Null: Null = make(SchemaAST.null)
/**
 * Type-level representation of {@link Undefined}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Undefined extends Bottom<undefined, undefined, never, never, SchemaAST.Undefined, Undefined> {}
/**
 * Schema for the `undefined` literal. Validates that the input is strictly `undefined`.
 *
 * @see {@link UndefinedOr} for a union with another schema.
 * @category schemas
 * @since 3.10.0
 */
export const Undefined: Undefined = make(SchemaAST.undefined)
/**
 * Type-level representation of {@link String}.
 *
 * @category models
 * @since 4.0.0
 */
export interface String extends Bottom<string, string, never, never, SchemaAST.String, String> {}
/**
 * Schema for `string` values. Validates that the input is `typeof` `"string"`.
 *
 * @category schemas
 * @since 4.0.0
 */
export const String: String = make(SchemaAST.string)

/**
 * Type-level representation of {@link StringForLiteralAutocomplete}.
 *
 * @category models
 * @since 4.0.0
 */
export interface StringForLiteralAutocomplete extends
  Bottom<
    string & {},
    string & {},
    never,
    never,
    SchemaAST.String,
    StringForLiteralAutocomplete
  >
{}
/**
 * Schema for `string & {}`. Validates that the input is `typeof` `"string"`.
 *
 * **When to use**
 *
 * Use with {@link Union} and {@link Literals} when a value may be any string
 * and known literals should stay available for editor autocomplete.
 *
 * **Details**
 *
 * `string & {}` stays alongside string literals in a union, so editors keep
 * suggesting those literals. Any string still passes validation. Read the
 * literals from the {@link Literals} member.
 *
 * **Example** (Suggesting known HTTP methods)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const Method = Schema.Union([
 *   Schema.StringForLiteralAutocomplete,
 *   Schema.Literals(["GET", "POST"])
 * ])
 *
 * // Type: "GET" | "POST" | (string & {})
 * Method.make("PATCH") // => "PATCH"
 * Method.members[1].literals // => ["GET", "POST"]
 * ```
 *
 * @see {@link String} for a schema whose type is plain `string`.
 * @see {@link Literals} for the known literals to include in the union.
 * @category schemas
 * @since 4.0.0
 */
export const StringForLiteralAutocomplete: StringForLiteralAutocomplete = String
/**
 * Type-level representation of {@link Number}.
 *
 * @category models
 * @since 4.0.0
 */
export interface Number extends Bottom<number, number, never, never, SchemaAST.Number, Number> {}
/**
 * Schema for `number` values, including `NaN`, `Infinity`, and `-Infinity`.
 *
 * **Details**
 *
 * Default JSON serializer:
 *
 * - Finite numbers are serialized as numbers.
 * - Non-finite values are serialized as strings (`"NaN"`, `"Infinity"`, `"-Infinity"`).
 *
 * @see {@link Finite} for a schema that excludes non-finite values.
 * @category schemas
 * @since 4.0.0
 */
export const Number: Number = make(SchemaAST.number)
/**
 * Type-level representation of {@link Boolean}.
 *
 * @category models
 * @since 4.0.0
 */
export interface Boolean extends Bottom<boolean, boolean, never, never, SchemaAST.Boolean, Boolean> {}
/**
 * Schema for `boolean` values. Validates that the input is `typeof` `"boolean"`.
 *
 * **When to use**
 *
 * Use to validate values that are already JavaScript booleans.
 *
 * @see {@link BooleanFromBit} for a schema that decodes bit literals `0` or `1` into a boolean
 *
 * @category schemas
 * @since 4.0.0
 */
export const Boolean: Boolean = make(SchemaAST.boolean)
/**
 * Type-level representation of {@link Symbol}.
 *
 * @category models
 * @since 4.0.0
 */
export interface Symbol extends Bottom<symbol, symbol, never, never, SchemaAST.Symbol, Symbol> {}
/**
 * Schema for `symbol` values. Validates that the input is `typeof` `"symbol"`.
 *
 * @see {@link UniqueSymbol} for a schema that matches a specific symbol.
 * @category schemas
 * @since 4.0.0
 */
export const Symbol: Symbol = make(SchemaAST.symbol)
/**
 * Type-level representation of {@link BigInt}.
 *
 * @category models
 * @since 4.0.0
 */
export interface BigInt extends Bottom<bigint, bigint, never, never, SchemaAST.BigInt, BigInt> {}
/**
 * Schema for `bigint` values. Validates that the input is `typeof` `"bigint"`.
 *
 * **When to use**
 *
 * Use when the input is already a bigint and the schema should validate and
 * preserve bigint values without parsing from another representation.
 *
 * @see {@link BigIntFromString} for parsing string input into a bigint
 *
 * @category schemas
 * @since 4.0.0
 */
export const BigInt: BigInt = make(SchemaAST.bigInt)
/**
 * Type-level representation of {@link Void}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Void extends Bottom<void, void, never, never, SchemaAST.Void, Void> {}
/**
 * Schema for a TypeScript `void` return value.
 *
 * **When to use**
 *
 * Use when you need to model the return value of a function, RPC, or endpoint
 * whose result is intentionally ignored.
 *
 * **Details**
 *
 * Runtime parsing accepts any present value and discards it, producing
 * `undefined`. The public decoded and encoded TypeScript representation remains
 * `void`, so typed construction, decoding, and encoding APIs are still modeled
 * as `void`.
 *
 * @see {@link Undefined} for a schema that matches only the exact `undefined` value.
 * @category schemas
 * @since 3.10.0
 */
export const Void: Void = make(SchemaAST.void)
/**
 * Type-level representation of {@link ObjectKeyword}.
 *
 * @category models
 * @since 4.0.0
 */
export interface ObjectKeyword extends Bottom<object, object, never, never, SchemaAST.ObjectKeyword, ObjectKeyword> {}
/**
 * Schema for the `object` type. Validates that the input is a non-null object or function
 * (i.e. `typeof value === "object" && value !== null || typeof value === "function"`).
 *
 * @category schemas
 * @since 4.0.0
 */
export const ObjectKeyword: ObjectKeyword = make(SchemaAST.objectKeyword)
/**
 * Type-level representation returned by {@link UniqueSymbol}.
 *
 * @category models
 * @since 4.0.0
 */
export interface UniqueSymbol<sym extends symbol>
  extends Bottom<sym, sym, never, never, SchemaAST.UniqueSymbol, UniqueSymbol<sym>>
{}
/**
 * Creates a schema for a specific symbol. Only that exact symbol satisfies the schema.
 *
 * **Gotchas**
 *
 * Only globally registered symbols have a JSON encoding. Their canonical JSON
 * form is the exact string returned by `String(symbol)`. A local symbol cannot
 * be encoded as JSON.
 *
 * **Example** (Defining a specific symbol)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const mySymbol = Symbol.for("mySymbol")
 * const schema = Schema.UniqueSymbol(mySymbol)
 * Schema.decodeSync(schema)(mySymbol) === mySymbol // => true
 * ```
 *
 * @see {@link Symbol} for a schema that accepts any symbol.
 * @category constructors
 * @since 4.0.0
 */
export function UniqueSymbol<const sym extends symbol>(symbol: sym): UniqueSymbol<sym> {
  return make(new SchemaAST.UniqueSymbol(symbol))
}
/**
 * Namespace for struct field type utilities.
 *
 * **Details**
 *
 * These types compute the decoded `Type`, encoded `Encoded`, and constructor
 * input `MakeIn` of a {@link Struct} from its field map, handling optional,
 * mutable, and other field modifiers automatically.
 *
 * - `Struct.Fields` — constraint for the field map object
 * - `Struct.Type<F>` — decoded type of the struct
 * - `Struct.Encoded<F>` — encoded type of the struct
 * - `Struct.MakeIn<F>` — constructor input (optional/defaulted fields may be omitted)
 * - `Struct.DecodingServices<F>` / `Struct.EncodingServices<F>` — required services
 *
 * @since 3.10.0
 */
export declare namespace Struct {
  /**
   * Constraint for a struct field map: an object whose values are schemas.
   *
   * @category utility types
   * @since 3.10.0
   */
  type Fields = {
    readonly [x: PropertyKey]: Constraint
  }
  type TypeOptionalKeys<Fields extends Struct.Fields> = {
    [K in keyof Fields]: Fields[K] extends { readonly "~type.optionality": "optional" } ? K
      : never
  }[keyof Fields]
  type TypeMutableKeys<Fields extends Struct.Fields> = {
    [K in keyof Fields]: Fields[K] extends { readonly "~type.mutability": "mutable" } ? K
      : never
  }[keyof Fields]
  type SetOptional<A, K extends keyof A> = Omit<A, K> & Partial<Pick<A, K>>
  type Mutable<A> = { -readonly [K in keyof A]: A[K] }
  type SetMutable<A, K extends keyof A> = Omit<A, K> & Mutable<Pick<A, K>>
  type Side = "Type" | "Iso" | "Encoded"
  type EncodedOptionalKeys<Fields extends Struct.Fields> = {
    [K in keyof Fields]: Fields[K] extends { readonly "~encoded.optionality": "optional" } ? K
      : never
  }[keyof Fields]
  type EncodedMutableKeys<Fields extends Struct.Fields> = {
    [K in keyof Fields]: Fields[K] extends { readonly "~encoded.mutability": "mutable" } ? K
      : never
  }[keyof Fields]
  type SideOptionalKeys<F extends Fields, S extends Side> = S extends "Encoded" ? EncodedOptionalKeys<F>
    : TypeOptionalKeys<F>
  type SideMutableKeys<F extends Fields, S extends Side> = S extends "Encoded" ? EncodedMutableKeys<F>
    : TypeMutableKeys<F>
  type ReadonlySide<F extends Fields, S extends Side> = { readonly [K in keyof F]: F[K][S] }
  type View<
    F extends Fields,
    S extends Side,
    O extends keyof F = SideOptionalKeys<F, S>,
    M extends keyof F = SideMutableKeys<F, S>
  > = [O | M] extends [never] ? Simplify<ReadonlySide<F, S>>
    : [M] extends [never] ? Simplify<SetOptional<ReadonlySide<F, S>, O>>
    : [O] extends [never] ? Simplify<SetMutable<ReadonlySide<F, S>, M>>
    : Simplify<
      SetMutable<
        SetOptional<ReadonlySide<F, S>, O>,
        Extract<keyof SetOptional<ReadonlySide<F, S>, O>, M>
      >
    >
  /**
   * Computes the decoded object type for a struct field map.
   *
   * **Details**
   *
   * Field schemas contribute their decoded `Type`. `optionalKey` and `optional`
   * produce optional properties, while `mutableKey` produces writable properties.
   *
   * @category utility types
   * @since 3.10.0
   */
  type Type<F extends Fields> = View<F, "Type">
  /**
   * Computes the iso object type for a struct field map from each field schema's
   * `Iso` type.
   *
   * **Details**
   *
   * The resulting property optionality and mutability follow the same field
   * modifiers used by `Struct.Type`.
   *
   * @category utility types
   * @since 4.0.0
   */
  type Iso<F extends Fields> = View<F, "Iso">
  /**
   * Computes the encoded object type for a struct field map.
   *
   * **Details**
   *
   * Field schemas contribute their `Encoded` type. Encoded-side optionality and
   * mutability modifiers determine whether properties are optional or writable in
   * the encoded shape.
   *
   * @category utility types
   * @since 3.10.0
   */
  type Encoded<F extends Fields> = View<F, "Encoded">
  /**
   * Union of all decoding service requirements needed by the schemas in a struct
   * field map.
   *
   * @category utility types
   * @since 4.0.0
   */
  type DecodingServices<F extends Fields> = {
    readonly [K in keyof F]: F[K]["DecodingServices"]
  }[keyof F]
  /**
   * Union of all encoding service requirements needed by the schemas in a struct
   * field map.
   *
   * @category utility types
   * @since 4.0.0
   */
  type EncodingServices<F extends Fields> = {
    readonly [K in keyof F]: F[K]["EncodingServices"]
  }[keyof F]
  type TypeConstructorDefaultedKeys<Fields extends Struct.Fields> = {
    [K in keyof Fields]: Fields[K] extends { readonly "~type.constructor.default": "with-default" } ? K
      : never
  }[keyof Fields]
  type ReadonlyMakeIn<F extends Fields> = { readonly [K in keyof F]: F[K]["~type.make"] }
  type MakeInView<
    F extends Fields,
    O extends keyof F = TypeOptionalKeys<F> | TypeConstructorDefaultedKeys<F>
  > = [O] extends [never] ? Simplify<ReadonlyMakeIn<F>> : Simplify<SetOptional<ReadonlyMakeIn<F>, O>>
  /**
   * Computes the input object type accepted when constructing a struct value.
   *
   * **Details**
   *
   * Required fields use each field schema's `~type.make` input. Fields marked
   * optional or with a constructor default may be omitted.
   *
   * @category utility types
   * @since 4.0.0
   */
  type MakeIn<F extends Fields> = MakeInView<F>
}
/**
 * Type-level representation returned by {@link Struct}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Struct<Fields extends Struct.Fields> extends BottomLazy<SchemaAST.Objects, Struct<Fields>> {
  readonly "Type": Struct.Type<Fields>
  readonly "Encoded": Struct.Encoded<Fields>
  readonly "DecodingServices": Struct.DecodingServices<Fields>
  readonly "EncodingServices": Struct.EncodingServices<Fields>
  readonly "~type.make.in": Struct.MakeIn<Fields>
  readonly "~type.make": Struct.MakeIn<Fields>
  readonly "Iso": Struct.Iso<Fields>
  /**
   * The field definitions of this struct. Spread them into a new struct to
   * reuse fields across schemas.
   *
   * **Example** (Reusing fields across structs)
   *
   * ```ts import.meta.vitest
   * import { Schema } from "effect"
   *
   * const Timestamped = Schema.Struct({
   *   createdAt: Schema.Date,
   *   updatedAt: Schema.Date
   * })
   *
   * const User = Schema.Struct({
   *   ...Timestamped.fields,
   *   name: Schema.String,
   *   email: Schema.String
   * })
   * Object.keys(User.fields) // => ["createdAt", "updatedAt", "name", "email"]
   * ```
   */
  readonly fields: Fields
  /**
   * Returns a new struct with the fields modified by the provided function.
   *
   * **Details**
   *
   * Options:
   *
   * - `unsafePreserveChecks` - if `true`, keep any `.check(...)` constraints
   *   that were attached to the original union. Defaults to `false`.
   *
   *   **Warning**: This is an unsafe operation. Since `mapFields`
   *   transformations change the schema type, the original refinement functions
   *   may no longer be valid or safe to apply to the transformed schema. Only
   *   use this option if you have verified that your refinements remain correct
   *   after the transformation.
   */
  mapFields<To extends Struct.Fields>(
    f: (fields: Fields) => To,
    options?: {
      readonly unsafePreserveChecks?: boolean | undefined
    } | undefined
  ): Struct<Simplify<Readonly<To>>>
}

function makeStruct<const Fields extends Struct.Fields>(ast: SchemaAST.Objects, fields: Fields): Struct<Fields> {
  return make(ast, {
    fields,
    mapFields<To extends Struct.Fields>(
      this: Struct<Fields>,
      f: (fields: Fields) => To,
      options?: {
        readonly unsafePreserveChecks?: boolean | undefined
      } | undefined
    ): Struct<To> {
      const fields = f(this.fields)
      return makeStruct(SchemaAST.struct(fields, options?.unsafePreserveChecks ? this.ast.checks : undefined), fields)
    }
  })
}
/**
 * Defines a struct schema from a map of field schemas.
 *
 * **Details**
 *
 * Each field value is a schema. Use {@link optionalKey} or {@link optional} to
 * mark fields as optional, and {@link mutableKey} to mark them as mutable.
 *
 * The resulting schema's `Type` is a readonly object type with the fields'
 * decoded types. The `Encoded` form mirrors the field schemas' encoded types.
 * Declared fields may be inherited and are copied to own properties in the
 * output. The `__proto__` field is accepted only when it is an own property.
 * Parsing does not guarantee that output keys retain their input order.
 *
 * **Example** (Defining a basic struct)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const Person = Schema.Struct({
 *   name: Schema.String,
 *   age: Schema.Number,
 *   email: Schema.optionalKey(Schema.String)
 * })
 *
 * // { readonly name: string; readonly age: number; readonly email?: string }
 * type Person = typeof Person.Type
 *
 * Schema.decodeUnknownSync(Person)({ name: "Alice", age: 30 }) // => { name: "Alice", age: 30 }
 * ```
 *
 * @category constructors
 * @since 3.10.0
 */
export function Struct<const Fields extends Struct.Fields>(fields: Fields): Struct<Fields> {
  return makeStruct(SchemaAST.struct(fields, undefined), fields)
}
interface fieldsAssign<NewFields extends Struct.Fields> extends Lambda {
  <Fields extends Struct.Fields>(
    struct: Struct<Fields>
  ): Struct<Struct_.Simplify<Struct_.Assign<Fields, NewFields>>>
  readonly "~lambda.out": this["~lambda.in"] extends Struct<Struct.Fields>
    ? Struct<Struct_.Simplify<Struct_.Assign<this["~lambda.in"]["fields"], NewFields>>>
    : "Error: schema not eligible for fieldsAssign"
}
/**
 * Adds fields to a struct schema through a struct-mapping lambda.
 *
 * **When to use**
 *
 * Use to add the same fields to an existing struct or every struct member of a
 * union.
 *
 * **Details**
 *
 * This is a shortcut for `MyStruct.mapFields(Struct.assign(fields))`.
 *
 * **Example** (Adding fields to a union of structs)
 *
 * ```ts import.meta.vitest
 * import { Schema, Tuple } from "effect"
 *
 * // Add a new field to all members of a union of structs
 * const schema = Schema.Union([
 *   Schema.Struct({ a: Schema.String }),
 *   Schema.Struct({ b: Schema.Number })
 * ]).mapMembers(Tuple.map(Schema.fieldsAssign({ c: Schema.Number })))
 * Schema.decodeSync(schema)({ a: "a", c: 1 }) // => { a: "a", c: 1 }
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export function fieldsAssign<const NewFields extends Struct.Fields>(fields: NewFields) {
  return Struct_.lambda<fieldsAssign<NewFields>>((struct) => struct.mapFields(Struct_.assign(fields)))
}
/**
 * Type-level representation returned by {@link encodeKeys}.
 *
 * @category transforming
 * @since 4.0.0
 */
export interface encodeKeys<
  S extends Constraint & { readonly fields: Struct.Fields },
  M extends { readonly [K in keyof S["fields"]]?: PropertyKey }
> extends
  decodeTo<
    S,
    Struct<
      {
        [
          K in keyof S["fields"] as K extends keyof M ? M[K] extends PropertyKey ? M[K] : K : K
        ]: toEncoded<S["fields"][K]>
      }
    >
  >
{}

const canonicalPropertyKey = (key: PropertyKey): string | symbol =>
  typeof key === "symbol" ? key : globalThis.String(key)
/**
 * Renames struct keys in the encoded form without changing the decoded type.
 *
 * **Details**
 *
 * Takes a partial mapping `{ decodedKey: encodedKey }` and produces a
 * transformation schema that decodes from the renamed keys and encodes back to
 * the renamed keys. Keys not present in the mapping are left unchanged.
 * If two existing fields would produce the same encoded key, construction
 * fails.
 *
 * **Example** (Renaming `name` to `full_name` in the encoded form)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const Person = Schema.Struct({ name: Schema.String, age: Schema.Number })
 * const Encoded = Person.pipe(Schema.encodeKeys({ name: "full_name" }))
 *
 * // Decodes { full_name: "Alice", age: 30 } → { name: "Alice", age: 30 }
 * Schema.decodeUnknownSync(Encoded)({ full_name: "Alice", age: 30 }) // => { name: "Alice", age: 30 }
 * ```
 *
 * @category transforming
 * @since 4.0.0
 */
export function encodeKeys<
  S extends Constraint & { readonly fields: Struct.Fields },
  const M extends { readonly [K in keyof S["fields"]]?: PropertyKey }
>(mapping: M) {
  return function(self: S): encodeKeys<S, M> {
    const fields: any = {}
    const appliedMapping: any = Object.create(null)
    const reverseMapping: any = Object.create(null)
    const seenEncodedKeys = new Set<string | symbol>()
    for (const k of Reflect.ownKeys(self.fields)) {
      const encoded = toEncoded(self.fields[k])
      const hasMapping = Object.hasOwn(mapping, k)
      const encodedKey = hasMapping ? (mapping as any)[k] as PropertyKey : k
      const canonical = canonicalPropertyKey(encodedKey)
      if (seenEncodedKeys.has(canonical)) {
        throw new globalThis.Error(`Duplicate encoded keys: ${formatPropertyKey(encodedKey)}`)
      }
      seenEncodedKeys.add(canonical)
      InternalRecord.assignProperty(fields, encodedKey, encoded)
      if (hasMapping) {
        appliedMapping[k] = encodedKey
        reverseMapping[encodedKey] = k
      }
    }
    return Struct(fields).pipe(decodeTo(
      self,
      SchemaTransformation.transform<any, any>({
        decode: Struct_.renameKeys(reverseMapping),
        encode: Struct_.renameKeys(appliedMapping)
      })
    )) as any
  }
}
/**
 * Adds derived fields to a struct schema during decoding.
 *
 * **Details**
 *
 * Each new field is derived from the decoded struct value via a function that
 * returns `Option`. On encoding the derived fields are stripped. This allows
 * computed or enriched fields to live in the decoded type without appearing in
 * the encoded form.
 *
 * **Example** (Adding a computed `fullName` field)
 *
 * ```ts import.meta.vitest
 * import { Option, Schema } from "effect"
 *
 * const Person = Schema.Struct({ first: Schema.String, last: Schema.String })
 * const Extended = Person.pipe(
 *   Schema.extendTo(
 *     { fullName: Schema.String },
 *     { fullName: (p) => Option.some(`${p.first} ${p.last}`) }
 *   )
 * )
 *
 * const alice = Schema.decodeUnknownSync(Extended)({ first: "Alice", last: "Smith" })
 * alice.fullName // => "Alice Smith"
 * ```
 *
 * @category transforming
 * @since 4.0.0
 */
export function extendTo<S extends Struct<Struct.Fields>, const Fields extends Struct.Fields>(
  fields: Fields,
  derive: { readonly [K in keyof Fields]: (s: S["Type"]) => Option_.Option<Fields[K]["Type"]> }
) {
  return (
    self: S
  ): decodeTo<Struct<Simplify<{ [K in keyof S["fields"]]: toType<S["fields"][K]> } & Fields>>, S> => {
    const f = Record_.map(self.fields, toType)
    const to = Struct({ ...f, ...fields })
    return self.pipe(decodeTo(
      to,
      SchemaTransformation.transform({
        decode: (input) => {
          const out: any = { ...input }
          for (const k in fields) {
            const f = derive[k]
            const o = f(input)
            if (Option_.isSome(o)) {
              InternalRecord.assignProperty(out, k, o.value)
            }
          }
          return out
        },
        encode: (input) => {
          const out = { ...input }
          for (const k in fields) {
            delete out[k]
          }
          return out
        }
      })
    )) as any
  }
}
/**
 * Namespace for `Record` type utilities.
 *
 * **Details**
 *
 * - `Record.Key` — constraint for the key schema (must encode to `PropertyKey`)
 * - `Record.Type<K, V>` — decoded type of the record
 * - `Record.Encoded<K, V>` — encoded type of the record
 *
 * @since 3.10.0
 */
export declare namespace Record {
  /**
   * Constraint for schemas that can be used as record keys.
   *
   * **Details**
   *
   * The key schema must decode and encode property keys (`string`, `number`, or
   * `symbol`) so it can describe object property names.
   *
   * @category utility types
   * @since 4.0.0
   */
  interface Key extends Codec<PropertyKey, PropertyKey, unknown, unknown> {
    readonly "~type.make": PropertyKey
    readonly "Iso": PropertyKey
  }
  /**
   * Computes the decoded object type for a record schema from its key and value
   * schemas.
   *
   * **Details**
   *
   * The key schema supplies the property keys and the value schema supplies each
   * property's decoded `Type`. Optional and mutable value schemas affect the
   * resulting property optionality and writability.
   *
   * @category utility types
   * @since 3.10.0
   */
  type Type<Key extends Record.Key, Value extends Constraint> = Value extends {
    readonly "~type.optionality": "optional"
  } ? Value extends {
      readonly "~type.mutability": "mutable"
    } ? {
        [P in Key["Type"]]?: Value["Type"]
      } :
    {
      readonly [P in Key["Type"]]?: Value["Type"]
    } :
    Value extends {
      readonly "~type.mutability": "mutable"
    } ? {
        [P in Key["Type"]]: Value["Type"]
      } :
    {
      readonly [P in Key["Type"]]: Value["Type"]
    }
  /**
   * Computes the iso object type for a record schema from the key schema's `Iso`
   * keys and the value schema's `Iso` values.
   *
   * @category utility types
   * @since 4.0.0
   */
  type Iso<Key extends Record.Key, Value extends Constraint> = Value extends {
    readonly "~type.optionality": "optional"
  } ? Value extends {
      readonly "~type.mutability": "mutable"
    } ? {
        [P in Key["Iso"]]?: Value["Iso"]
      } :
    {
      readonly [P in Key["Iso"]]?: Value["Iso"]
    } :
    Value extends {
      readonly "~type.mutability": "mutable"
    } ? {
        [P in Key["Iso"]]: Value["Iso"]
      } :
    {
      readonly [P in Key["Iso"]]: Value["Iso"]
    }
  /**
   * Computes the encoded object type for a record schema from the key and value
   * schemas' encoded types.
   *
   * **Details**
   *
   * Encoded-side optionality and mutability on the value schema determine whether
   * the encoded record properties are optional or writable.
   *
   * @category utility types
   * @since 3.10.0
   */
  type Encoded<Key extends Record.Key, Value extends Constraint> = Value extends {
    readonly "~encoded.optionality": "optional"
  } ? Value extends {
      readonly "~encoded.mutability": "mutable"
    } ? {
        [P in Key["Encoded"]]?: Value["Encoded"]
      } :
    {
      readonly [P in Key["Encoded"]]?: Value["Encoded"]
    } :
    Value extends {
      readonly "~encoded.mutability": "mutable"
    } ? {
        [P in Key["Encoded"]]: Value["Encoded"]
      } :
    {
      readonly [P in Key["Encoded"]]: Value["Encoded"]
    }
  /**
   * Union of the decoding service requirements of a record's key schema and value
   * schema.
   *
   * @category utility types
   * @since 4.0.0
   */
  type DecodingServices<Key extends Record.Key, Value extends Constraint> =
    | Key["DecodingServices"]
    | Value["DecodingServices"]
  /**
   * Union of the encoding service requirements of a record's key schema and value
   * schema.
   *
   * @category utility types
   * @since 4.0.0
   */
  type EncodingServices<Key extends Record.Key, Value extends Constraint> =
    | Key["EncodingServices"]
    | Value["EncodingServices"]
  /**
   * Computes the input object type accepted when constructing a record value.
   *
   * **Details**
   *
   * Keys use the key schema's `~type.make` type and values use the value schema's
   * `~type.make` type. Value optionality and mutability determine whether
   * properties are optional or writable.
   *
   * @category utility types
   * @since 4.0.0
   */
  type MakeIn<Key extends Record.Key, Value extends Constraint> = Value extends {
    readonly "~encoded.optionality": "optional"
  } ? Value extends {
      readonly "~encoded.mutability": "mutable"
    } ? {
        [P in Key["~type.make"]]?: Value["~type.make"]
      } :
    {
      readonly [P in Key["~type.make"]]?: Value["~type.make"]
    } :
    Value extends {
      readonly "~encoded.mutability": "mutable"
    } ? {
        [P in Key["~type.make"]]: Value["~type.make"]
      } :
    {
      readonly [P in Key["~type.make"]]: Value["~type.make"]
    }
}
/**
 * Type-level representation returned by {@link Record}.
 *
 * @category models
 * @since 4.0.0
 */
export interface $Record<Key extends Record.Key, Value extends Constraint> extends
  BottomLazy<
    SchemaAST.Objects,
    $Record<Key, Value>
  >
{
  readonly "Type": Record.Type<Key, Value>
  readonly "Encoded": Record.Encoded<Key, Value>
  readonly "DecodingServices": Record.DecodingServices<Key, Value>
  readonly "EncodingServices": Record.EncodingServices<Key, Value>
  readonly "~type.make.in": Simplify<Record.MakeIn<Key, Value>>
  readonly "~type.make": Simplify<Record.MakeIn<Key, Value>>
  readonly "Iso": Record.Iso<Key, Value>
  readonly key: Key
  readonly value: Value
}
/**
 * Defines a record schema whose dynamic properties are selected by a key schema
 * and decoded with a value schema.
 *
 * **Details**
 *
 * For dynamic keys, the key schema selects matching own properties and the
 * value schema decodes or encodes only those selected properties. Checks on
 * string, number, symbol, and template literal key schemas narrow which
 * properties are selected.
 *
 * For transformed key schemas, property selection is based on encoded property
 * names before the selected key is decoded.
 *
 * **Gotchas**
 *
 * When decoded or encoded key transformations produce the same property key,
 * sequential parsing applies selected own properties in selection order, so
 * the later selected property overwrites the earlier value. Dynamic key
 * selection always examines own properties. Finite literal keys are declared
 * fields and may therefore be inherited. Output key order is not guaranteed.
 *
 * **Example** (Defining a string-keyed record of numbers)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const schema = Schema.Record(Schema.String, Schema.Number)
 *
 * // { readonly [x: string]: number }
 * type R = typeof schema.Type
 *
 * Schema.decodeUnknownSync(schema)({ a: 1, b: 2 }) // => { a: 1, b: 2 }
 * ```
 *
 * @category constructors
 * @since 3.10.0
 */
export function Record<Key extends Record.Key, Value extends Constraint>(
  key: Key,
  value: Value
): $Record<Key, Value> {
  return make(SchemaAST.record(key.ast, value.ast), { key, value })
}
/**
 * Namespace for `StructWithRest` type utilities.
 *
 * **Details**
 *
 * - `StructWithRest.Type<S, R>` — decoded type (struct type intersected with record types)
 * - `StructWithRest.Encoded<S, R>` — encoded type
 *
 * @since 4.0.0
 */
export declare namespace StructWithRest {
  /**
   * Constraint for object-like schemas that can be used as the fixed portion of a
   * `StructWithRest` schema.
   *
   * @category utility types
   * @since 4.0.0
   */
  type Objects = Constraint & {
    readonly ast: SchemaAST.Objects
  }
  /**
   * Readonly list of record schemas that provide the additional index signatures
   * for a `StructWithRest` schema.
   *
   * @category utility types
   * @since 3.10.0
   */
  type Records = ReadonlyArray<$Record<Record.Key, Constraint>>
  type MergeTuple<T extends ReadonlyArray<unknown>> = T extends readonly [infer Head, ...infer Tail] ?
    Head & MergeTuple<Tail>
    : {}
  type Intersect<
    S extends Objects,
    Records extends StructWithRest.Records,
    Side extends "Type" | "Iso" | "Encoded" | "~type.make"
  > =
    & S[Side]
    & MergeTuple<{ readonly [K in keyof Records]: Records[K][Side] }>
  /**
   * Computes the decoded type for `StructWithRest` by intersecting the base object
   * schema's decoded `Type` with the decoded types of all rest record schemas.
   *
   * @category utility types
   * @since 3.10.0
   */
  type Type<S extends Objects, Records extends StructWithRest.Records> = Intersect<S, Records, "Type">
  /**
   * Computes the iso type for `StructWithRest` by intersecting the base object
   * schema's `Iso` type with the `Iso` types of all rest record schemas.
   *
   * @category utility types
   * @since 4.0.0
   */
  type Iso<S extends Objects, Records extends StructWithRest.Records> = Intersect<S, Records, "Iso">
  /**
   * Computes the encoded type for `StructWithRest` by intersecting the base object
   * schema's encoded type with the encoded types of all rest record schemas.
   *
   * @category utility types
   * @since 3.10.0
   */
  type Encoded<S extends Objects, Records extends StructWithRest.Records> = Intersect<S, Records, "Encoded">
  /**
   * Computes the input type accepted when constructing a `StructWithRest` value by
   * intersecting the base object's make input with the make inputs of all rest
   * record schemas.
   *
   * @category utility types
   * @since 4.0.0
   */
  type MakeIn<S extends Objects, Records extends StructWithRest.Records> = Intersect<S, Records, "~type.make">
  type Services<
    S extends Objects,
    Records extends StructWithRest.Records,
    Side extends "DecodingServices" | "EncodingServices"
  > =
    | S[Side]
    | { [K in keyof Records]: Records[K][Side] }[number]
  /**
   * Union of the decoding service requirements of the base object schema and all
   * rest record schemas.
   *
   * @category utility types
   * @since 4.0.0
   */
  type DecodingServices<S extends Objects, Records extends StructWithRest.Records> = Services<
    S,
    Records,
    "DecodingServices"
  >
  /**
   * Union of the encoding service requirements of the base object schema and all
   * rest record schemas.
   *
   * @category utility types
   * @since 4.0.0
   */
  type EncodingServices<S extends Objects, Records extends StructWithRest.Records> = Services<
    S,
    Records,
    "EncodingServices"
  >
  type IncompatibleKeys<A, B, OK extends (keyof A & keyof B) = Extract<keyof A, keyof B>> = {
    [K in OK]: Required<Pick<A, K>>[K] extends B[K] ? never : K
  }[OK]
  type IncompatibleSideKeys<
    S extends Objects,
    Records extends StructWithRest.Records,
    Side extends "Type" | "Encoded" | "Iso" | "~type.make"
  > = {
    [I in keyof Records]: Records[I][Side] extends object ? IncompatibleKeys<S[Side], Records[I][Side]> : never
  }[number]
  type IncompatibleRecords<S extends Objects, Records extends StructWithRest.Records> =
    | IncompatibleSideKeys<S, Records, "Type">
    | IncompatibleSideKeys<S, Records, "Encoded">
    | IncompatibleSideKeys<S, Records, "Iso">
    | IncompatibleSideKeys<S, Records, "~type.make">
  /**
   * Checks whether fixed fields are compatible with the rest record schemas.
   *
   * **Details**
   *
   * Returns `true` when all fixed fields can also satisfy the matching rest
   * index signatures. Returns a diagnostic object when TypeScript would make
   * the resulting intersection too narrow for one or more fixed keys.
   *
   * **Example** (Checking record compatibility)
   *
   * ```ts import.meta.vitest
   * import { Schema } from "effect"
   *
   * const user = Schema.Struct({ id: Schema.String })
   * const stringExtras = [Schema.Record(Schema.String, Schema.String)] as const
   *
   * type UserCheck = Schema.StructWithRest.ValidateRecords<typeof user, typeof stringExtras>
   *
   * const userCheck: UserCheck = true
   * void userCheck
   *
   * const counter = Schema.Struct({ count: Schema.NumberFromString })
   *
   * type CounterCheck = Schema.StructWithRest.ValidateRecords<typeof counter, typeof stringExtras>
   * //    ^? { "incompatible index signatures": "count" }
   *
   * const counterCheck = null as unknown as CounterCheck
   * void counterCheck
   * ```
   *
   * @category utility types
   * @since 4.0.0
   */
  type ValidateRecords<S extends Objects, Records extends StructWithRest.Records> =
    [IncompatibleRecords<S, Records>] extends [never] ? true : {
      "incompatible index signatures": IncompatibleRecords<S, Records>
    }
}
/**
 * Type-level representation returned by {@link StructWithRest}.
 *
 * @category models
 * @since 4.0.0
 */
export interface StructWithRest<
  S extends StructWithRest.Objects,
  Records extends StructWithRest.Records
> extends
  BottomLazy<
    SchemaAST.Objects,
    StructWithRest<S, Records>
  >
{
  readonly "Type": Simplify<StructWithRest.Type<S, Records>>
  readonly "Encoded": Simplify<StructWithRest.Encoded<S, Records>>
  readonly "DecodingServices": StructWithRest.DecodingServices<S, Records>
  readonly "EncodingServices": StructWithRest.EncodingServices<S, Records>
  readonly "~type.make.in": Simplify<StructWithRest.MakeIn<S, Records>>
  readonly "~type.make": Simplify<StructWithRest.MakeIn<S, Records>>
  readonly "Iso": Simplify<StructWithRest.Iso<S, Records>>
  readonly schema: S
  readonly records: Records
}
/**
 * Extends a struct schema with one or more record (index-signature) schemas,
 * producing a schema whose decoded type intersects the struct and all records.
 *
 * **Gotchas**
 *
 * TypeScript index signatures also apply to fixed keys. `StructWithRest` does
 * not reject incompatible fixed fields at the call site; use
 * `StructWithRest.ValidateRecords` when you want an explicit type-level
 * compatibility check.
 *
 * **Example** (Defining structs with string-indexed extra keys)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const schema = Schema.StructWithRest(
 *   Schema.Struct({ id: Schema.Number }),
 *   [Schema.Record(Schema.String, Schema.Number)]
 * )
 *
 * // { readonly id: number, readonly [x: string]: number }
 * type T = typeof schema.Type
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export function StructWithRest<
  const S extends StructWithRest.Objects,
  const Records extends StructWithRest.Records
>(
  schema: S,
  records: Records
): StructWithRest<S, Records> {
  return make(SchemaAST.structWithRest(schema.ast, records.map(SchemaAST.getAST)), { schema, records })
}
/**
 * Namespace for `Tuple` type utilities.
 *
 * **Details**
 *
 * - `Tuple.Elements` — constraint for the element schema array
 * - `Tuple.Type<E>` — decoded tuple type
 * - `Tuple.Encoded<E>` — encoded tuple type
 * - `Tuple.MakeIn<E>` — constructor input tuple
 *
 * @since 3.10.0
 */
export declare namespace Tuple {
  /**
   * Constraint for the readonly array of element schemas used to define a
   * fixed-length `Tuple` schema.
   *
   * @category utility types
   * @since 3.10.0
   */
  type Elements = ReadonlyArray<Constraint>
  type Type_<
    Elements,
    Out extends ReadonlyArray<any> = readonly []
  > = Elements extends readonly [infer Head, ...infer Tail] ?
    Head extends { readonly "Type": infer T } ?
      Head extends { readonly "~type.optionality": "optional" } ? Type_<Tail, readonly [...Out, T?]>
      : Type_<Tail, readonly [...Out, T]>
    : Out
    : Out
  /**
   * Computes the decoded tuple type for a tuple element schema array.
   *
   * **Details**
   *
   * Each element contributes its decoded `Type`; optional element schemas produce
   * optional tuple positions.
   *
   * @category utility types
   * @since 3.10.0
   */
  type Type<E extends Elements> = Type_<E>
  type Iso_<
    Elements,
    Out extends ReadonlyArray<any> = readonly []
  > = Elements extends readonly [infer Head, ...infer Tail] ?
    Head extends { readonly "Iso": infer T } ?
      Head extends { readonly "~type.optionality": "optional" } ? Iso_<Tail, readonly [...Out, T?]>
      : Iso_<Tail, readonly [...Out, T]>
    : Out
    : Out
  /**
   * Computes the iso tuple type for a tuple element schema array from each
   * element schema's `Iso` type.
   *
   * @category utility types
   * @since 4.0.0
   */
  type Iso<E extends Elements> = Iso_<E>
  type Encoded_<
    Elements,
    Out extends ReadonlyArray<any> = readonly []
  > = Elements extends readonly [infer Head, ...infer Tail] ?
    Head extends { readonly "Encoded": infer T } ?
      Head extends { readonly "~encoded.optionality": "optional" } ? Encoded_<Tail, readonly [...Out, T?]>
      : Encoded_<Tail, readonly [...Out, T]>
    : Out
    : Out
  /**
   * Computes the encoded tuple type for a tuple element schema array.
   *
   * **Details**
   *
   * Each element contributes its `Encoded` type; encoded-side optional element
   * schemas produce optional tuple positions.
   *
   * @category utility types
   * @since 3.10.0
   */
  type Encoded<E extends Elements> = Encoded_<E>
  /**
   * Union of all decoding service requirements needed by the tuple element
   * schemas.
   *
   * @category utility types
   * @since 4.0.0
   */
  type DecodingServices<E extends Elements> = E[number]["DecodingServices"]
  /**
   * Union of all encoding service requirements needed by the tuple element
   * schemas.
   *
   * @category utility types
   * @since 4.0.0
   */
  type EncodingServices<E extends Elements> = E[number]["EncodingServices"]
  type MakeIn_<
    E,
    Out extends ReadonlyArray<any> = readonly []
  > = E extends readonly [infer Head, ...infer Tail] ?
    Head extends { "~type.make": infer T } ?
      Head extends
        { readonly "~type.optionality": "optional" } | { readonly "~type.constructor.default": "with-default" } ?
        MakeIn_<Tail, readonly [...Out, T?]> :
      MakeIn_<Tail, readonly [...Out, T]>
    : Out :
    Out
  /**
   * Computes the input tuple type accepted when constructing a tuple value.
   *
   * **Details**
   *
   * Each element uses its `~type.make` input type. Optional elements and elements
   * with constructor defaults produce optional tuple positions.
   *
   * @category utility types
   * @since 4.0.0
   */
  type MakeIn<E extends Elements> = MakeIn_<E>
}
/**
 * Type-level representation returned by {@link Tuple}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Tuple<Elements extends Tuple.Elements> extends
  BottomLazy<
    SchemaAST.Arrays,
    Tuple<Elements>
  >
{
  readonly "Type": Tuple.Type<Elements>
  readonly "Encoded": Tuple.Encoded<Elements>
  readonly "DecodingServices": Tuple.DecodingServices<Elements>
  readonly "EncodingServices": Tuple.EncodingServices<Elements>
  readonly "~type.make.in": Tuple.MakeIn<Elements>
  readonly "~type.make": Tuple.MakeIn<Elements>
  readonly "Iso": Tuple.Iso<Elements>
  readonly elements: Elements
  /**
   * Returns a new tuple with the elements modified by the provided function.
   *
   * **Details**
   *
   * Options:
   *
   * - `unsafePreserveChecks` - if `true`, keep any `.check(...)` constraints
   *   that were attached to the original union. Defaults to `false`.
   *
   *   **Warning**: This is an unsafe operation. Since `mapFields`
   *   transformations change the schema type, the original refinement functions
   *   may no longer be valid or safe to apply to the transformed schema. Only
   *   use this option if you have verified that your refinements remain correct
   *   after the transformation.
   */
  mapElements<To extends Tuple.Elements>(
    f: (elements: Elements) => To,
    options?: {
      readonly unsafePreserveChecks?: boolean | undefined
    } | undefined
  ): Tuple<Simplify<Readonly<To>>>
}

function makeTuple<Elements extends Tuple.Elements>(ast: SchemaAST.Arrays, elements: Elements): Tuple<Elements> {
  return make(ast, {
    elements,
    mapElements<To extends Tuple.Elements>(
      this: Tuple<Elements>,
      f: (elements: Elements) => To,
      options?: {
        readonly unsafePreserveChecks?: boolean | undefined
      } | undefined
    ): Tuple<Simplify<Readonly<To>>> {
      const elements = f(this.elements)
      return makeTuple(SchemaAST.tuple(elements, options?.unsafePreserveChecks ? this.ast.checks : undefined), elements)
    }
  })
}
/**
 * Defines a fixed-length tuple schema from an array of element schemas.
 *
 * **Example** (Defining a pair of string and number)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const schema = Schema.Tuple([Schema.String, Schema.Number])
 *
 * Schema.decodeUnknownSync(schema)(["hello", 42]) // => ["hello", 42]
 * ```
 *
 * @category constructors
 * @since 3.10.0
 */
export function Tuple<const Elements extends ReadonlyArray<Constraint>>(elements: Elements): Tuple<Elements> {
  return makeTuple(SchemaAST.tuple(elements), elements)
}
/**
 * Namespace for `TupleWithRest` type utilities.
 *
 * **Details**
 *
 * - `TupleWithRest.TupleType` — constraint for the leading tuple schema
 * - `TupleWithRest.Rest` — the rest element schema(s)
 * - `TupleWithRest.Type<T, R>` — decoded type (fixed elements + rest)
 * - `TupleWithRest.Encoded<T, R>` — encoded type
 *
 * @since 4.0.0
 */
export declare namespace TupleWithRest {
  /**
   * Constraint for tuple-like schemas that can be used as the fixed leading
   * portion of a `TupleWithRest` schema.
   *
   * @category utility types
   * @since 3.10.0
   */
  type TupleType = Constraint & {
    readonly Type: ReadonlyArray<unknown>
    readonly Encoded: ReadonlyArray<unknown>
    readonly ast: SchemaAST.Arrays
    readonly "~type.make": ReadonlyArray<unknown>
    readonly "Iso": ReadonlyArray<unknown>
  }
  /**
   * Non-empty list of schemas used for the rest portion of a `TupleWithRest`.
   *
   * **Details**
   *
   * The first schema describes the repeated rest element. Additional schemas, when
   * present, describe trailing tuple elements after the repeated rest segment.
   *
   * @category utility types
   * @since 3.10.0
   */
  type Rest = readonly [Constraint, ...Array<Constraint>]
  /**
   * Computes the decoded tuple type for a `TupleWithRest`.
   *
   * **Details**
   *
   * The output starts with the fixed tuple elements, continues with zero or more
   * values decoded by the first rest schema, and includes any trailing rest schemas
   * as fixed tuple positions.
   *
   * @category utility types
   * @since 3.10.0
   */
  type Type<T extends ReadonlyArray<unknown>, Rest extends TupleWithRest.Rest> = Rest extends
    readonly [infer Head extends Constraint, ...infer Tail extends ReadonlyArray<Constraint>] ? Readonly<[
      ...T,
      ...Array<Head["Type"]>,
      ...{
        readonly [K in keyof Tail]: Tail[K]["Type"]
      }
    ]> :
    T
  /**
   * Computes the iso tuple type for a `TupleWithRest`.
   *
   * **Details**
   *
   * The output starts with the fixed tuple's `Iso` elements, continues with zero
   * or more values using the first rest schema's `Iso`, and includes any trailing
   * rest schemas as fixed tuple positions.
   *
   * @category utility types
   * @since 4.0.0
   */
  type Iso<T extends ReadonlyArray<unknown>, Rest extends TupleWithRest.Rest> = Rest extends
    readonly [infer Head extends Constraint, ...infer Tail extends ReadonlyArray<Constraint>] ? Readonly<[
      ...T,
      ...Array<Head["Iso"]>,
      ...{
        readonly [K in keyof Tail]: Tail[K]["Iso"]
      }
    ]> :
    T
  /**
   * Computes the encoded tuple type for `TupleWithRest`.
   *
   * **Details**
   *
   * The leading tuple's encoded elements are kept first. The encoded type of the
   * first rest schema may repeat zero or more times, and the encoded types of any
   * additional rest schemas become required trailing tuple elements.
   *
   * @category utility types
   * @since 3.10.0
   */
  type Encoded<E extends ReadonlyArray<unknown>, Rest extends TupleWithRest.Rest> = Rest extends
    readonly [infer Head extends Constraint, ...infer Tail extends ReadonlyArray<Constraint>] ? readonly [
      ...E,
      ...Array<Head["Encoded"]>,
      ...{
        readonly [K in keyof Tail]: Tail[K]["Encoded"]
      }
    ] :
    E
  /**
   * Computes the constructor input tuple type for `TupleWithRest`.
   *
   * **Details**
   *
   * The leading tuple's make input elements are kept first. The make input type of
   * the first rest schema may repeat zero or more times, and the make input types
   * of any additional rest schemas become required trailing tuple elements.
   *
   * @category utility types
   * @since 4.0.0
   */
  type MakeIn<M extends ReadonlyArray<unknown>, Rest extends TupleWithRest.Rest> = Rest extends
    readonly [infer Head extends Constraint, ...infer Tail extends ReadonlyArray<Constraint>] ? readonly [
      ...M,
      ...Array<Head["~type.make"]>,
      ...{
        readonly [K in keyof Tail]: Tail[K]["~type.make"]
      }
    ] :
    M
}
/**
 * Type-level representation returned by {@link TupleWithRest}.
 *
 * @category models
 * @since 4.0.0
 */
export interface TupleWithRest<
  S extends TupleWithRest.TupleType,
  Rest extends TupleWithRest.Rest
> extends
  BottomLazy<
    SchemaAST.Arrays,
    TupleWithRest<S, Rest>
  >
{
  readonly "Type": TupleWithRest.Type<S["Type"], Rest>
  readonly "Encoded": TupleWithRest.Encoded<S["Encoded"], Rest>
  readonly "DecodingServices": S["DecodingServices"] | Rest[number]["DecodingServices"]
  readonly "EncodingServices": S["EncodingServices"] | Rest[number]["EncodingServices"]
  readonly "~type.make.in": TupleWithRest.MakeIn<S["~type.make"], Rest>
  readonly "~type.make": TupleWithRest.MakeIn<S["~type.make"], Rest>
  readonly "Iso": TupleWithRest.Iso<S["Iso"], Rest>
  readonly schema: S
  readonly rest: Rest
}
/**
 * Extends a fixed-length tuple schema with a variadic rest segment.
 *
 * **Details**
 *
 * The resulting tuple starts with the fixed elements from `schema`. The first
 * schema in `rest` is the repeatable element schema, and any additional schemas
 * in `rest` are required trailing tuple elements after the variadic segment. For
 * example, `[Schema.Boolean, Schema.String]` represents zero or more booleans
 * followed by a final string.
 *
 * **Example** (Defining tuples with rest elements)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * // [string, number, ...boolean[]]
 * const schema = Schema.TupleWithRest(
 *   Schema.Tuple([Schema.String, Schema.Number]),
 *   [Schema.Boolean]
 * )
 *
 * Schema.decodeUnknownSync(schema)(["hello", 1, true, false]) // => ["hello", 1, true, false]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export function TupleWithRest<S extends Tuple<Tuple.Elements>, const Rest extends TupleWithRest.Rest>(
  schema: S,
  rest: Rest
): TupleWithRest<S, Rest> {
  return make(SchemaAST.tupleWithRest(schema.ast, rest.map(SchemaAST.getAST)), { schema, rest })
}
/**
 * Type-level representation returned by {@link Array}.
 *
 * @category models
 * @since 4.0.0
 */
export interface $Array<S extends Constraint> extends
  BottomLazy<
    SchemaAST.Arrays,
    $Array<S>
  >
{
  readonly "Type": ReadonlyArray<S["Type"]>
  readonly "Encoded": ReadonlyArray<S["Encoded"]>
  readonly "DecodingServices": S["DecodingServices"]
  readonly "EncodingServices": S["EncodingServices"]
  readonly "~type.make.in": ReadonlyArray<S["~type.make"]>
  readonly "~type.make": ReadonlyArray<S["~type.make"]>
  readonly "Iso": ReadonlyArray<S["Iso"]>
  readonly value: S
}
interface ArrayLambda extends Lambda {
  <S extends Constraint>(self: S): $Array<S>
  readonly "~lambda.out": this["~lambda.in"] extends Constraint ? $Array<this["~lambda.in"]> : never
}
/**
 * @category constructors
 * @since 4.0.0
 */
const ArraySchema: ArrayLambda = Struct_.lambda<ArrayLambda>((schema) =>
  make(new SchemaAST.Arrays(false, [], [schema.ast]), { value: schema })
)
export {
  /**
   * Defines a `ReadonlyArray` schema for a given element schema.
   *
   * **Example** (Defining an array of strings)
   *
   * ```ts import.meta.vitest
   * import { Schema } from "effect"
   *
   * const schema = Schema.Array(Schema.String)
   *
   * Schema.decodeUnknownSync(schema)(["a", "b", "c"]) // => ["a", "b", "c"]
   * ```
   *
   * @category constructors
   * @since 4.0.0
   */
  ArraySchema as Array
}

/** @internal */
export function withArrayLengthConstraints<Item extends Constraint>(
  self: $Array<Item>,
  minimum: number | undefined,
  maximum: number | undefined
): $Array<Item> {
  if (minimum !== undefined && maximum !== undefined) {
    return self.check(isBetweenLength(minimum, maximum))
  }
  if (minimum !== undefined) return self.check(isMinLength(minimum))
  if (maximum !== undefined) return self.check(isMaxLength(maximum))
  return self
}
/**
 * Type-level representation returned by {@link NonEmptyArray}.
 *
 * @category models
 * @since 3.10.0
 */
export interface NonEmptyArray<S extends Constraint> extends
  BottomLazy<
    SchemaAST.Arrays,
    NonEmptyArray<S>
  >
{
  readonly "Type": readonly [S["Type"], ...Array<S["Type"]>]
  readonly "Encoded": readonly [S["Encoded"], ...Array<S["Encoded"]>]
  readonly "DecodingServices": S["DecodingServices"]
  readonly "EncodingServices": S["EncodingServices"]
  readonly "~type.make.in": readonly [S["~type.make"], ...Array<S["~type.make"]>]
  readonly "~type.make": readonly [S["~type.make"], ...Array<S["~type.make"]>]
  readonly "Iso": readonly [S["Iso"], ...Array<S["Iso"]>]
  readonly value: S
}
interface NonEmptyArrayLambda extends Lambda {
  <S extends Constraint>(self: S): NonEmptyArray<S>
  readonly "~lambda.out": this["~lambda.in"] extends Constraint ? NonEmptyArray<this["~lambda.in"]> : never
}
/**
 * Defines a non-empty `ReadonlyArray` schema — at least one element required.
 * Type is `readonly [T, ...T[]]`.
 *
 * **Example** (Defining a non-empty array of numbers)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const schema = Schema.NonEmptyArray(Schema.Number)
 *
 * Schema.decodeUnknownSync(schema)([1, 2, 3]) // => [1, 2, 3]
 * ```
 *
 * @category constructors
 * @since 3.10.0
 */
export const NonEmptyArray: NonEmptyArrayLambda = Struct_.lambda<NonEmptyArrayLambda>((schema) =>
  make(new SchemaAST.Arrays(false, [schema.ast], [schema.ast]), { value: schema })
)
/**
 * Type-level representation returned by {@link ArrayEnsure}.
 *
 * @category constructors
 * @since 3.10.0
 */
export interface ArrayEnsure<S extends Constraint> extends decodeTo<$Array<toType<S>>, Union<readonly [S, $Array<S>]>> {
  readonly "Rebuild": ArrayEnsure<S>
}
/**
 * Creates a schema that accepts either a value decoded by `schema` or an array
 * decoded by `Schema.Array(schema)`, then returns an array.
 *
 * **When to use**
 *
 * Use to accept input that may be provided either as one item or as an array,
 * while normalizing decoded values to a readonly array.
 *
 * **Details**
 *
 * During encoding, one-element arrays are encoded as the single element. Empty
 * arrays and arrays with two or more elements are encoded as arrays.
 *
 * **Gotchas**
 *
 * The single-value branch is tried before the array branch. If `schema` itself
 * accepts arrays, an array input can be treated as one value and wrapped in a
 * one-element array.
 *
 * @see {@link Array} for accepting only array input
 * @see {@link NonEmptyArray} for requiring at least one decoded element
 *
 * @category constructors
 * @since 3.10.0
 */
export function ArrayEnsure<S extends Constraint>(schema: S): ArrayEnsure<S> {
  const many = ArraySchema(schema)
  const to = ArraySchema(toType(schema))
  const one = decodeTo(
    Tuple([Unknown]),
    SchemaTransformation.transform({
      decode: (value) => [value] as const,
      encode: ([value]) => value
    })
  )(schema)
  return make(Union([one, many]).pipe(decodeTo(to)).ast, { from: Union([schema, many]), to })
}
/**
 * Type-level representation returned by {@link UniqueArray}.
 *
 * @category models
 * @since 4.0.0
 */
export interface UniqueArray<S extends Constraint> extends $Array<S> {
  readonly "Rebuild": UniqueArray<S>
}
/**
 * Returns a new array schema that ensures all elements are unique.
 *
 * **Details**
 *
 * The equivalence used to determine uniqueness is the one provided by
 * `Schema.toEquivalence(item)`.
 *
 * @category constructors
 * @since 4.0.0
 */
export function UniqueArray<S extends Constraint>(item: S): UniqueArray<S> {
  return ArraySchema(item).check(isUnique())
}
/**
 * Type-level representation returned by {@link mutable}.
 *
 * @category transforming
 * @since 3.10.0
 */
export interface mutable<
  S extends Constraint & {
    readonly "ast": SchemaAST.Arrays
  }
> extends
  BottomLazy<
    S["ast"],
    mutable<S>,
    S["~type.parameters"],
    S["~type.mutability"],
    S["~type.optionality"],
    S["~type.constructor.default"],
    S["~encoded.mutability"],
    S["~encoded.optionality"]
  >
{
  readonly "Type": Mutable<S["Type"]>
  readonly "Encoded": Mutable<S["Encoded"]>
  readonly "DecodingServices": S["DecodingServices"]
  readonly "EncodingServices": S["EncodingServices"]
  readonly "~type.make.in": S["~type.make.in"]
  readonly "~type.make": S["~type.make"]
  readonly "Iso": S["Iso"]
  readonly schema: S
}
interface mutableLambda extends Lambda {
  <S extends Constraint & { readonly "ast": SchemaAST.Arrays }>(self: S): mutable<S>
  readonly "~lambda.out": this["~lambda.in"] extends Constraint & { readonly "ast": SchemaAST.Arrays } ?
    mutable<this["~lambda.in"]>
    : "Error: schema not eligible for mutable"
}
/**
 * Makes an array or tuple schema mutable, removing the `readonly` modifier.
 *
 * **Gotchas**
 *
 * This combinator does not support an encoding attached to the array or tuple
 * node and throws if one is present. Encodings on element schemas are
 * supported.
 *
 * **Example** (Defining mutable arrays)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const schema = Schema.mutable(Schema.Array(Schema.Number))
 *
 * // number[]   (mutable)
 * type T = typeof schema.Type
 * const value: T = [1, 2]
 * value.push(3)
 * value // => [1, 2, 3]
 * ```
 *
 * @category transforming
 * @since 3.10.0
 */
export const mutable: mutableLambda = Struct_.lambda<mutableLambda>((schema) =>
  make(SchemaAST.mutable(schema.ast), { schema })
)
/**
 * Type-level representation returned by {@link Union}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Union<Members extends ReadonlyArray<Constraint>> extends
  BottomLazy<
    SchemaAST.Union<{ [K in keyof Members]: Members[K]["ast"] }[number]>,
    Union<Members>
  >
{
  readonly "Type": { [K in keyof Members]: Members[K]["Type"] }[number]
  readonly "Encoded": { [K in keyof Members]: Members[K]["Encoded"] }[number]
  readonly "DecodingServices": { [K in keyof Members]: Members[K]["DecodingServices"] }[number]
  readonly "EncodingServices": { [K in keyof Members]: Members[K]["EncodingServices"] }[number]
  readonly "~type.make.in": { [K in keyof Members]: Members[K]["~type.make"] }[number]
  readonly "~type.make": { [K in keyof Members]: Members[K]["~type.make"] }[number]
  readonly "Iso": { [K in keyof Members]: Members[K]["Iso"] }[number]
  readonly members: Members
  /**
   * Returns a new union with the members modified by the provided function.
   *
   * **Details**
   *
   * Options:
   *
   * - `unsafePreserveChecks` - if `true`, keep any `.check(...)` constraints
   *   that were attached to the original union. Defaults to `false`.
   *
   *   **Warning**: This is an unsafe operation. Since `mapFields`
   *   transformations change the schema type, the original refinement functions
   *   may no longer be valid or safe to apply to the transformed schema. Only
   *   use this option if you have verified that your refinements remain correct
   *   after the transformation.
   */
  mapMembers<To extends ReadonlyArray<Constraint>>(
    f: (members: Members) => To,
    options?: {
      readonly unsafePreserveChecks?: boolean | undefined
    } | undefined
  ): Union<Simplify<Readonly<To>>>
}

function makeUnion<Members extends ReadonlyArray<Constraint>>(
  ast: SchemaAST.Union<Members[number]["ast"]>,
  members: Members
): Union<Members> {
  return make(ast, {
    members,
    mapMembers<To extends ReadonlyArray<Constraint>>(
      this: Union<Members>,
      f: (members: Members) => To,
      options?: {
        readonly unsafePreserveChecks?: boolean | undefined
      } | undefined
    ): Union<Simplify<Readonly<To>>> {
      const members = f(this.members)
      return makeUnion(
        SchemaAST.union(members, this.ast.options, options?.unsafePreserveChecks ? this.ast.checks : undefined),
        members
      )
    }
  })
}
/**
 * Creates a union schema from an array of member schemas. Members are tested in
 * order; the first match is returned.
 *
 * **Details**
 *
 * Optionally, specify `mode`:
 * - `"anyOf"` (default) — matches if any member matches.
 * - `"oneOf"` — matches if exactly one member matches.
 *
 * **Example** (Defining a string or number union)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const schema = Schema.Union([Schema.String, Schema.Number])
 *
 * Schema.decodeUnknownSync(schema)("hello") // => "hello"
 * Schema.decodeUnknownSync(schema)(42) // => 42
 * ```
 *
 * @category constructors
 * @since 3.10.0
 */
export function Union<const Members extends ReadonlyArray<Constraint>>(
  members: Members,
  options?: SchemaAST.UnionOptions
): Union<Members> {
  return makeUnion(SchemaAST.union(members, options, undefined), members)
}
/**
 * Type-level representation returned by {@link Literals}.
 *
 * @category models
 * @since 4.0.0
 */
export interface Literals<L extends ReadonlyArray<SchemaAST.LiteralValue>>
  extends Bottom<L[number], L[number], never, never, SchemaAST.Union<SchemaAST.Literal>, Literals<L>>
{
  readonly literals: L
  readonly members: { readonly [K in keyof L]: Literal<L[K]> }
  /**
   * Map over the members of the union.
   */
  mapMembers<To extends ReadonlyArray<Constraint>>(f: (members: this["members"]) => To): Union<Simplify<Readonly<To>>>

  pick<const L2 extends ReadonlyArray<L[number]>>(literals: L2): Literals<L2>

  transform<const L2 extends { readonly [I in keyof L]: SchemaAST.LiteralValue }>(
    to: L2
  ): Union<{ [I in keyof L]: decodeTo<Literal<L2[I]>, Literal<L[I]>> }>
}
/**
 * Creates a union schema from an array of literal values.
 *
 * **Example** (Defining status codes)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const schema = Schema.Literals(["active", "inactive", "pending"])
 * Schema.decodeSync(schema)("active") // => "active"
 * ```
 *
 * @see {@link Literal} for a schema that represents a single literal.
 * @category constructors
 * @since 4.0.0
 */
export function Literals<const L extends ReadonlyArray<SchemaAST.LiteralValue>>(literals: L): Literals<L> {
  const members = literals.map(Literal) as { readonly [K in keyof L]: Literal<L[K]> }
  return make(SchemaAST.union(members, undefined, undefined), {
    literals,
    members,
    mapMembers<To extends ReadonlyArray<Constraint>>(
      this: Literals<L>,
      f: (members: Literals<L>["members"]) => To
    ): Union<Simplify<Readonly<To>>> {
      return Union(f(this.members))
    },
    pick<const L2 extends ReadonlyArray<L[number]>>(literals: L2): Literals<L2> {
      return Literals(literals)
    },
    transform<const L2 extends { readonly [I in keyof L]: SchemaAST.LiteralValue }>(
      to: L2
    ): Union<{ [I in keyof L]: decodeTo<Literal<L2[I]>, Literal<L[I]>> }> {
      return Union(members.map((member, index) => member.transform(to[index]))) as any
    }
  })
}
/**
 * Type-level representation returned by {@link NullOr}.
 *
 * @category models
 * @since 3.10.0
 */
export interface NullOr<S extends Constraint> extends Union<readonly [S, Null]> {
  readonly "Rebuild": NullOr<S>
}
interface NullOrLambda extends Lambda {
  <S extends Constraint>(self: S): NullOr<S>
  readonly "~lambda.out": this["~lambda.in"] extends Constraint ? NullOr<this["~lambda.in"]> : never
}
/**
 * Creates a union schema of `S | null`.
 *
 * @category constructors
 * @since 3.10.0
 */
export const NullOr: NullOrLambda = Struct_.lambda<NullOrLambda>((self) => Union([self, Null]))
/**
 * Type-level representation returned by {@link UndefinedOr}.
 *
 * @category models
 * @since 3.10.0
 */
export interface UndefinedOr<S extends Constraint> extends Union<readonly [S, Undefined]> {
  readonly "Rebuild": UndefinedOr<S>
}
interface UndefinedOrLambda extends Lambda {
  <S extends Constraint>(self: S): UndefinedOr<S>
  readonly "~lambda.out": this["~lambda.in"] extends Constraint ? UndefinedOr<this["~lambda.in"]> : never
}
/**
 * Creates a union schema of `S | undefined`.
 *
 * @category constructors
 * @since 3.10.0
 */
export const UndefinedOr: UndefinedOrLambda = Struct_.lambda<UndefinedOrLambda>((self) => Union([self, Undefined]))
/**
 * Type-level representation returned by {@link NullishOr}.
 *
 * @category models
 * @since 3.10.0
 */
export interface NullishOr<S extends Constraint> extends Union<readonly [S, Null, Undefined]> {
  readonly "Rebuild": NullishOr<S>
}
interface NullishOrLambda extends Lambda {
  <S extends Constraint>(self: S): NullishOr<S>
  readonly "~lambda.out": this["~lambda.in"] extends Constraint ? NullishOr<this["~lambda.in"]> : never
}
/**
 * Creates a union schema of `S | null | undefined`.
 *
 * @category constructors
 * @since 3.10.0
 */
export const NullishOr: NullishOrLambda = Struct_.lambda<NullishOrLambda>((self) => Union([self, Null, Undefined]))
/**
 * Type-level representation returned by {@link suspend}.
 *
 * @category models
 * @since 3.10.0
 */
export interface suspend<S extends Constraint> extends
  BottomLazy<
    SchemaAST.Suspend,
    suspend<S>,
    S["~type.parameters"],
    S["~type.mutability"],
    S["~type.optionality"],
    S["~type.constructor.default"],
    S["~encoded.mutability"],
    S["~encoded.optionality"]
  >
{
  readonly "Type": S["Type"]
  readonly "Encoded": S["Encoded"]
  readonly "DecodingServices": S["DecodingServices"]
  readonly "EncodingServices": S["EncodingServices"]
  readonly "~type.make.in": S["~type.make.in"]
  readonly "~type.make": S["~type.make"]
  readonly "Iso": S["Iso"]
}
/**
 * Creates a suspended schema that defers evaluation until needed. This is
 * essential for creating recursive schemas where a schema references itself,
 * preventing infinite recursion during schema definition.
 *
 * **Example** (Defining recursive tree schemas)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * interface Tree {
 *   readonly value: number
 *   readonly children: ReadonlyArray<Tree>
 * }
 *
 * const Tree = Schema.Struct({
 *   value: Schema.Number,
 *   children: Schema.Array(Schema.suspend((): Schema.Codec<Tree> => Tree))
 * })
 * Schema.decodeSync(Tree)({ value: 1, children: [] }) // => { value: 1, children: [] }
 * ```
 *
 * @category constructors
 * @since 3.10.0
 */
export function suspend<S extends Constraint>(f: () => S): suspend<S> {
  return make(new SchemaAST.Suspend(() => f().ast))
}
/**
 * Attaches one or more filter checks to a schema without changing the
 * TypeScript type.
 *
 * **Example** (Adding checks to a schema)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const AgeSchema = Schema.Finite.pipe(
 *   Schema.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(120))
 * )
 * Schema.is(AgeSchema)(42) // => true
 * Schema.is(AgeSchema)(121) // => false
 * ```
 *
 * @category filtering
 * @since 4.0.0
 */
export function check<S extends Top>(
  ...checks: readonly [SchemaAST.Check<S["Type"]>, ...Array<SchemaAST.Check<S["Type"]>>]
) {
  return (self: S): S["Rebuild"] => self.check(...checks)
}
/**
 * Type-level representation returned by {@link refine}.
 *
 * @category filtering
 * @since 3.10.0
 */
export interface refine<T extends S["Type"], S extends Constraint> extends
  BottomLazy<
    S["ast"],
    refine<T, S>,
    S["~type.parameters"],
    S["~type.mutability"],
    S["~type.optionality"],
    S["~type.constructor.default"],
    S["~encoded.mutability"],
    S["~encoded.optionality"]
  >
{
  readonly "Type": T
  readonly "Encoded": S["Encoded"]
  readonly "DecodingServices": S["DecodingServices"]
  readonly "EncodingServices": S["EncodingServices"]
  readonly "~type.make.in": S["~type.make.in"]
  readonly "~type.make": T
  readonly "Iso": T
  readonly schema: S
}
/**
 * Narrows the TypeScript type of a schema's output via a type guard predicate,
 * attaching the guard as a runtime filter check.
 *
 * **Details**
 *
 * The `annotations` parameter annotates the filter created by the refinement.
 * With the default formatter, failed refinements use `message` first,
 * `expected` second, and `<filter>` when neither is provided. `identifier`
 * names type-level failures before the refinement runs; it does not name the
 * failed refinement itself.
 *
 * @category filtering
 * @since 3.10.0
 */
export function refine<S extends Constraint, T extends S["Type"]>(
  refinement: (value: S["Type"]) => value is T,
  annotations?: Annotations.Filter
): (schema: S) => refine<T, S> {
  return (schema: S): refine<T, S> =>
    make(SchemaAST.appendChecks(schema.ast, [SchemaAST.makeFilterByGuard(refinement, annotations)]), { schema })
}
// A concrete key requires a property; broad and open template keys do not.
type EnsureSingleBrandKey<K extends PropertyKey> = IsUnion<K> extends false
  ? {} extends Record<K, unknown> ? never : unknown
  : never
// Collect all keys, including those not shared by every union member.
type FromBrandKeys<A extends Brand.Brand<any>> = A extends unknown ? Brand.Brand.Keys<A> : never
/**
 * Type-level representation returned by {@link brand}.
 *
 * @category branding
 * @since 3.10.0
 */
export interface brand<S extends Constraint, B extends string> extends
  BottomLazy<
    S["ast"],
    brand<S, B>,
    S["~type.parameters"],
    S["~type.mutability"],
    S["~type.optionality"],
    S["~type.constructor.default"],
    S["~encoded.mutability"],
    S["~encoded.optionality"]
  >
{
  readonly "Type": S["Type"] & Brand.Brand<B>
  readonly "Encoded": S["Encoded"]
  readonly "DecodingServices": S["DecodingServices"]
  readonly "EncodingServices": S["EncodingServices"]
  readonly "~type.make.in": S["~type.make.in"]
  readonly "~type.make": S["Type"] & Brand.Brand<B>
  readonly "Iso": S["Type"] & Brand.Brand<B>
  readonly schema: S
  readonly identifier: string
}
/**
 * Intersects a schema's output type with `Brand.Brand<B>` to prevent accidental
 * mixing of structurally identical types.
 *
 * **When to use**
 *
 * Use to make values decoded by an existing schema nominally distinct when the
 * schema already carries the runtime validation you need.
 *
 * **Gotchas**
 *
 * - `identifier` must be a single concrete string literal. Widened strings,
 *   unions, and open template literal types are rejected.
 * - `brand` only narrows the TypeScript output type. It does not change the
 *   schema's runtime AST or add runtime checks.
 * - Schema representations and generated schema code omit the brand. Reapply
 *   `brand` after rebuilding or generating a schema when the nominal type is
 *   still required.
 *
 * @see {@link fromBrand} for applying a Brand constructor's checks along with its branded type
 *
 * @category branding
 * @since 3.10.0
 */
export function brand<B extends string>(identifier: B & EnsureSingleBrandKey<B>) {
  return <S extends ConstraintRebuildable>(schema: S): brand<S["Rebuild"], B> =>
    make(schema.ast, { schema, identifier })
}
/**
 * Creates a branded schema from a {@link Brand.Constructor}, applying the
 * constructor's checks and branded type to the underlying schema.
 *
 * **When to use**
 *
 * Use to reuse the checks from a constructor with one concrete brand key.
 *
 * **Gotchas**
 *
 * `identifier` must match the constructor's only brand key. Apply `fromBrand`
 * repeatedly to compose distinct brands, and use {@link Union} to represent
 * alternatives.
 *
 * @see {@link brand} for adding a brand without constructor checks
 *
 * @category branding
 * @since 3.10.0
 */
export function fromBrand<A extends Brand.Brand<any>>(
  identifier: Brand.Brand.Keys<A> & string,
  ctor: Brand.Constructor<A> & EnsureSingleBrandKey<FromBrandKeys<A>>
) {
  type B = Brand.Brand.Keys<A> & string
  return <S extends Top & { readonly "Type": Brand.Brand.Unbranded<A> }>(
    self: S
  ): brand<S["Rebuild"], B> =>
    // The constructor already guarantees a single concrete brand key.
    (ctor.checks ? self.check(...ctor.checks) : self).pipe(brand<B>(identifier as B & EnsureSingleBrandKey<B>))
}
/**
 * Type-level representation returned by {@link middlewareDecoding}.
 *
 * @category decoding
 * @since 4.0.0
 */
export interface middlewareDecoding<S extends Constraint, RD> extends
  BottomLazy<
    S["ast"],
    middlewareDecoding<S, RD>,
    S["~type.parameters"],
    S["~type.mutability"],
    S["~type.optionality"],
    S["~type.constructor.default"],
    S["~encoded.mutability"],
    S["~encoded.optionality"]
  >
{
  readonly "Type": S["Type"]
  readonly "Encoded": S["Encoded"]
  readonly "DecodingServices": RD
  readonly "EncodingServices": S["EncodingServices"]
  readonly "~type.make.in": S["~type.make.in"]
  readonly "~type.make": S["~type.make"]
  readonly "Iso": S["Iso"]
  readonly schema: S
}
/**
 * Intercepts the decoding pipeline of a schema.
 *
 * **Details**
 *
 * The provided function receives the current decoding `Effect` and `ParseOptions`,
 * and returns a new `Effect` — potentially adding service requirements (`RD`),
 * recovering from errors, or augmenting the result.
 *
 * **Example** (Logging decode failures)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema } from "effect"
 *
 * const events: Array<string> = []
 * const Logged = Schema.String.pipe(
 *   Schema.middlewareDecoding((effect) =>
 *     Effect.tapError(effect, () => Effect.sync(() => events.push("decode failed")))
 *   )
 * )
 * Effect.runSync(Effect.result(Schema.decodeUnknownEffect(Logged)(42)))
 * events // => ["decode failed"]
 * ```
 *
 * @see {@link catchDecoding} for a simpler error-recovery variant
 * @category decoding
 * @since 4.0.0
 */
export function middlewareDecoding<S extends Constraint, RD>(
  decode: (
    effect: Effect.Effect<Option_.Option<S["Type"]>, SchemaIssue.Issue, S["DecodingServices"]>,
    options: SchemaAST.ParseOptions
  ) => Effect.Effect<Option_.Option<S["Type"]>, SchemaIssue.Issue, RD>
) {
  return (schema: S): middlewareDecoding<S, RD> =>
    make(
      SchemaAST.middlewareDecoding(schema.ast, new SchemaTransformation.Middleware(decode, identity)),
      { schema }
    )
}
/**
 * Type-level representation returned by {@link middlewareEncoding}.
 *
 * @category encoding
 * @since 4.0.0
 */
export interface middlewareEncoding<S extends Constraint, RE> extends
  BottomLazy<
    S["ast"],
    middlewareEncoding<S, RE>,
    S["~type.parameters"],
    S["~type.mutability"],
    S["~type.optionality"],
    S["~type.constructor.default"],
    S["~encoded.mutability"],
    S["~encoded.optionality"]
  >
{
  readonly "Type": S["Type"]
  readonly "Encoded": S["Encoded"]
  readonly "DecodingServices": S["DecodingServices"]
  readonly "EncodingServices": RE
  readonly "~type.make.in": S["~type.make.in"]
  readonly "~type.make": S["~type.make"]
  readonly "Iso": S["Iso"]
  readonly schema: S
}
/**
 * Intercepts the encoding pipeline of a schema.
 *
 * **Details**
 *
 * The provided function receives the current encoding `Effect` and `ParseOptions`,
 * and returns a new `Effect` — potentially adding service requirements (`RE`),
 * recovering from errors, or augmenting the result.
 *
 * **Example** (Logging encode failures)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema } from "effect"
 *
 * const events: Array<string> = []
 * const Logged = Schema.String.pipe(
 *   Schema.middlewareEncoding((effect) =>
 *     Effect.tapError(effect, () => Effect.sync(() => events.push("encode failed")))
 *   )
 * )
 * Effect.runSync(Effect.result(Schema.encodeUnknownEffect(Logged)(42)))
 * events // => ["encode failed"]
 * ```
 *
 * @see {@link catchEncoding} for a simpler error-recovery variant
 * @category encoding
 * @since 4.0.0
 */
export function middlewareEncoding<S extends Constraint, RE>(
  encode: (
    effect: Effect.Effect<Option_.Option<S["Encoded"]>, SchemaIssue.Issue, S["EncodingServices"]>,
    options: SchemaAST.ParseOptions
  ) => Effect.Effect<Option_.Option<S["Encoded"]>, SchemaIssue.Issue, RE>
) {
  return (schema: S): middlewareEncoding<S, RE> =>
    make(
      SchemaAST.middlewareEncoding(schema.ast, new SchemaTransformation.Middleware(identity, encode)),
      { schema }
    )
}
/**
 * Recovers from a decoding error by providing a fallback value.
 *
 * **Details**
 *
 * The handler receives the `Issue` and returns an `Effect` that either
 * succeeds with a fallback value or re-fails with a (possibly different) issue.
 *
 * **Example** (Returning a default on decode failure)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Schema } from "effect"
 *
 * const schema = Schema.Number.pipe(
 *   Schema.catchDecoding((_issue) => Effect.succeed(Option.some(0)))
 * )
 * Effect.runSync(Schema.decodeUnknownEffect(schema)("invalid")) // => 0
 * ```
 *
 * @see {@link catchDecodingWithContext} to add service requirements to the handler
 * @category error handling
 * @since 4.0.0
 */
export function catchDecoding<S extends Constraint>(
  f: (issue: SchemaIssue.Issue) => Effect.Effect<Option_.Option<S["Type"]>, SchemaIssue.Issue>
): (self: S) => middlewareDecoding<S, S["DecodingServices"]> {
  return catchDecodingWithContext(f)
}
/**
 * Recovers from a decoding error with a handler that may require Effect services.
 *
 * **When to use**
 *
 * Use when you need decoding fallback logic to require services from the Effect
 * context.
 *
 * **Details**
 *
 * The handler receives the `Issue` and returns an `Effect` that either succeeds
 * with a fallback value or re-fails with a (possibly different) issue. The
 * handler's services are added to the schema's decoding services.
 *
 * @see {@link catchDecoding} for recovery handlers that do not require services
 * @see {@link middlewareDecoding} for intercepting or replacing the full decoding pipeline
 *
 * @category error handling
 * @since 4.0.0
 */
export function catchDecodingWithContext<S extends Constraint, R = never>(
  f: (issue: SchemaIssue.Issue) => Effect.Effect<Option_.Option<S["Type"]>, SchemaIssue.Issue, R>
) {
  return (self: S): middlewareDecoding<S, S["DecodingServices"] | R> =>
    middlewareDecoding<S, S["DecodingServices"] | R>(Effect.catchEager(f))(self)
}
/**
 * Recovers from an encoding error by providing a fallback value.
 *
 * **Details**
 *
 * The handler receives the `Issue` and returns an `Effect` that either
 * succeeds with a fallback value or re-fails with a (possibly different) issue.
 *
 * @see {@link catchEncodingWithContext} to add service requirements to the handler
 * @category error handling
 * @since 4.0.0
 */
export function catchEncoding<S extends Constraint>(
  f: (issue: SchemaIssue.Issue) => Effect.Effect<Option_.Option<S["Encoded"]>, SchemaIssue.Issue>
): (self: S) => middlewareEncoding<S, S["EncodingServices"]> {
  return catchEncodingWithContext(f)
}
/**
 * Recovers from an encoding error with a handler that may require Effect services.
 *
 * **When to use**
 *
 * Use when you need encoding fallback logic to require services from the Effect
 * context.
 *
 * **Details**
 *
 * The handler receives the `Issue` and returns an `Effect` that either succeeds
 * with a fallback encoded value or re-fails with a (possibly different) issue.
 * The handler's services are added to the schema's encoding services.
 *
 * @see {@link catchEncoding} for recovery handlers that do not require services
 * @see {@link middlewareEncoding} for intercepting or replacing the full encoding pipeline
 *
 * @category error handling
 * @since 4.0.0
 */
export function catchEncodingWithContext<S extends Constraint, R = never>(
  f: (issue: SchemaIssue.Issue) => Effect.Effect<Option_.Option<S["Encoded"]>, SchemaIssue.Issue, R>
) {
  return (self: S): middlewareEncoding<S, S["EncodingServices"] | R> =>
    middlewareEncoding<S, S["EncodingServices"] | R>(Effect.catchEager(f))(self)
}
/**
 * Type-level representation returned by {@link decodeTo}.
 *
 * @category transforming
 * @since 4.0.0
 */
export interface decodeTo<To extends Constraint, From extends Constraint, RD = never, RE = never> extends
  BottomLazy<
    To["ast"],
    decodeTo<To, From, RD, RE>,
    To["~type.parameters"],
    To["~type.mutability"],
    To["~type.optionality"],
    To["~type.constructor.default"],
    From["~encoded.mutability"],
    From["~encoded.optionality"]
  >
{
  readonly "Type": To["Type"]
  readonly "Encoded": From["Encoded"]
  readonly "DecodingServices": To["DecodingServices"] | From["DecodingServices"] | RD
  readonly "EncodingServices": To["EncodingServices"] | From["EncodingServices"] | RE
  readonly "~type.make.in": To["~type.make.in"]
  readonly "~type.make": To["~type.make"]
  readonly "Iso": To["Iso"]
  readonly from: From
  readonly to: To
}
/**
 * Type-level representation returned by {@link decodeTo} without a custom transformation.
 *
 * @category transforming
 * @since 3.10.0
 */
export interface compose<To extends Constraint, From extends Constraint> extends decodeTo<To, From> {}
/**
 * Creates a schema that transforms from a source schema to a target schema.
 *
 * **When to use**
 *
 * Use when decoding should change the schema's decoded type or encoded shape,
 * with an optional custom bidirectional transformation.
 *
 * **Details**
 *
 * Call it with the target schema `to` and then pipe the source schema `from`
 * into the returned function. The resulting schema decodes from
 * `From["Encoded"]` to `To["Type"]` and encodes from `To["Type"]` back to
 * `From["Encoded"]`.
 *
 * When no transformation is provided, `SchemaTransformation.passthrough()` is
 * used, so `From["Type"]` must already be compatible with `To["Encoded"]`.
 * The resulting schema combines decoding and encoding services from both
 * schemas and any custom transformation.
 *
 * **Gotchas**
 *
 * In a custom transformation, `decode` maps `From["Type"]` to `To["Encoded"]`
 * and is used on the encoding path, while `encode` maps `To["Encoded"]` to
 * `From["Type"]` and is used on the decoding path.
 *
 * **Example** (Transforming strings to numbers with a schema transformation)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaGetter } from "effect"
 *
 * const NumberFromString = Schema.String.pipe(
 *   Schema.decodeTo(
 *     Schema.Number,
 *     {
 *       decode: SchemaGetter.transform((s) => Number(s)),
 *       encode: SchemaGetter.transform((n) => String(n))
 *     }
 *   )
 * )
 *
 * Schema.decodeUnknownSync(NumberFromString)("123") // => 123
 * ```
 *
 * @category transforming
 * @since 4.0.0
 */
export function decodeTo<To extends Constraint>(to: To): <From extends Constraint>(from: From) => compose<To, From>
export function decodeTo<To extends Constraint, From extends Constraint, RD = never, RE = never>(
  to: To,
  transformation: {
    readonly decode: SchemaGetter.Getter<NoInfer<To["Encoded"]>, NoInfer<From["Type"]>, RD>
    readonly encode: SchemaGetter.Getter<NoInfer<From["Type"]>, NoInfer<To["Encoded"]>, RE>
  }
): (from: From) => decodeTo<To, From, RD, RE>
export function decodeTo<To extends Constraint, From extends Constraint, RD = never, RE = never>(
  to: To,
  transformation?: {
    readonly decode: SchemaGetter.Getter<To["Encoded"], From["Type"], RD>
    readonly encode: SchemaGetter.Getter<From["Type"], To["Encoded"], RE>
  } | undefined
) {
  return (from: From) => {
    return make(
      SchemaAST.decodeTo(
        from.ast,
        to.ast,
        transformation ? SchemaTransformation.makeTransformation(transformation) : SchemaTransformation.passthrough()
      ),
      {
        from,
        to
      }
    )
  }
}

/**
 * Constructs a decode-only `SchemaAST.Link`.
 *
 * @internal
 */
export function linkDecoding<T>(): <To extends Constraint>(
  to: To,
  decode: SchemaGetter.Getter<T, NoInfer<To["Type"]>>
) => SchemaAST.Link {
  return <To extends Constraint>(
    to: To,
    decode: SchemaGetter.Getter<T, NoInfer<To["Type"]>>
  ): SchemaAST.Link => link<T>()(to, { decode, encode: SchemaGetter.forbiddenEncoding })
}

/** @internal */
export const TrueLiterals = Literals(["true", "yes", "on", "1", "y"])

/** @internal */
export const FalseLiterals = Literals(["false", "no", "off", "0", "n"])

/** @internal */
export const BooleanLiterals = Literals([...TrueLiterals.literals, ...FalseLiterals.literals]).pipe(
  decodeTo(
    Boolean,
    SchemaTransformation.transform({
      decode: (value) => value === "true" || value === "yes" || value === "on" || value === "1" || value === "y",
      encode: (value) => value ? "true" : "false"
    })
  )
)
/**
 * Applies a transformation to a schema, creating a new schema with the same type but transformed encoding/decoding.
 *
 * **When to use**
 *
 * Use when the decoded type stays the same and the transformation only
 * normalizes values during encoding and decoding.
 *
 * **Details**
 *
 * Call it with a transformation object and then pipe a schema into the returned
 * function. The resulting schema keeps the same `Type` and `Encoded` types as
 * the source schema, while applying the transformation during both decoding and
 * encoding.
 *
 * Internally this uses `toType(self)` as the target schema and combines service
 * requirements from the source schema and the transformation.
 *
 * **Gotchas**
 *
 * Use {@link decodeTo} instead when the transformation should change the
 * decoded type. For this helper, both transformation getters operate on
 * `S["Type"]` values.
 *
 * **Example** (Trimming string values during encoding/decoding)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaGetter } from "effect"
 *
 * const Trimmed = Schema.String.pipe(
 *   Schema.decode({
 *     decode: SchemaGetter.transform((s) => s.trim()),
 *     encode: SchemaGetter.transform((s) => s.trim())
 *   })
 * )
 *
 * Schema.decodeUnknownSync(Trimmed)("  hello  ") // => "hello"
 * ```
 *
 * @category transforming
 * @since 4.0.0
 */
export function decode<S extends Constraint, RD = never, RE = never>(transformation: {
  readonly decode: SchemaGetter.Getter<S["Type"], S["Type"], RD>
  readonly encode: SchemaGetter.Getter<S["Type"], S["Type"], RE>
}) {
  return (self: S): decodeTo<toType<S>, S, RD, RE> => {
    return decodeTo<toType<S>, S, RD, RE>(toType(self), transformation)(self)
  }
}
/**
 * Reverses a schema transformation so the encoded schema is supplied first.
 *
 * **When to use**
 *
 * Use to define a transformation by naming the encoded schema before the
 * decoded schema.
 *
 * **Details**
 *
 * `encodeTo(to)(from)` is equivalent to `to.pipe(decodeTo(from))`. The `from`
 * schema acts as the target decoded schema and `to` acts as the encoded source.
 *
 * **Example** (Encoding a number back to a string)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaGetter } from "effect"
 *
 * const NumberFromString = Schema.Number.pipe(
 *   Schema.encodeTo(Schema.String, {
 *     decode: SchemaGetter.transform((s: string) => Number(s)),
 *     encode: SchemaGetter.transform((n: number) => String(n))
 *   })
 * )
 * Schema.decodeSync(NumberFromString)("42") // => 42
 * ```
 *
 * @category transforming
 * @since 4.0.0
 */
export function encodeTo<To extends Constraint>(
  to: To
): <From extends Constraint>(from: From) => compose<From, To>
export function encodeTo<To extends Constraint, From extends Constraint, RD = never, RE = never>(
  to: To,
  transformation: {
    readonly decode: SchemaGetter.Getter<NoInfer<From["Encoded"]>, NoInfer<To["Type"]>, RD>
    readonly encode: SchemaGetter.Getter<NoInfer<To["Type"]>, NoInfer<From["Encoded"]>, RE>
  }
): (from: From) => decodeTo<From, To, RD, RE>
export function encodeTo<To extends Constraint, From extends Constraint, RD = never, RE = never>(
  to: To,
  transformation?: {
    readonly decode: SchemaGetter.Getter<From["Encoded"], To["Type"], RD>
    readonly encode: SchemaGetter.Getter<To["Type"], From["Encoded"], RE>
  }
) {
  return (from: From): decodeTo<From, To, RD, RE> => {
    return transformation ?
      decodeTo<From, To, RD, RE>(from, transformation)(to) :
      decodeTo<From>(from)(to)
  }
}
/**
 * Applies a transformation to a schema's encoded type, creating a new schema where encoding/decoding
 * operate on `S["Encoded"]` rather than `S["Type"]`.
 *
 * **Details**
 *
 * The `decode` getter maps `S["Encoded"]` → `S["Encoded"]` (applied during decoding),
 * and the `encode` getter maps `S["Encoded"]` → `S["Encoded"]` (applied during encoding).
 *
 * **Example** (Upper-casing encoded strings)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaGetter } from "effect"
 *
 * const UpperFromLower = Schema.String.pipe(
 *   Schema.encode({
 *     decode: SchemaGetter.transform((s: string) => s.toLowerCase()),
 *     encode: SchemaGetter.transform((s: string) => s.toUpperCase())
 *   })
 * )
 * Schema.encodeSync(UpperFromLower)("hello") // => "HELLO"
 * ```
 *
 * @category transforming
 * @since 4.0.0
 */
export function encode<S extends Constraint, RD = never, RE = never>(transformation: {
  readonly decode: SchemaGetter.Getter<S["Encoded"], S["Encoded"], RD>
  readonly encode: SchemaGetter.Getter<S["Encoded"], S["Encoded"], RE>
}) {
  return (self: S): decodeTo<S, toEncoded<S>, RD, RE> => {
    return decodeTo<S, toEncoded<S>, RD, RE>(self, transformation)(toEncoded(self))
  }
}
/**
 * Constraint used to ensure a schema field does not already have a constructor default.
 *
 * **Details**
 *
 * Only schemas that satisfy this constraint can be passed to {@link withConstructorDefault}.
 *
 * @category models
 * @since 4.0.0
 */
export interface WithoutConstructorDefault {
  readonly "~type.constructor.default": "no-default"
}
/**
 * Type-level representation returned by {@link withConstructorDefault}.
 *
 * @category constructors
 * @since 3.10.0
 */
export interface withConstructorDefault<S extends Constraint & WithoutConstructorDefault> extends
  BottomLazy<
    S["ast"],
    withConstructorDefault<S>,
    S["~type.parameters"],
    S["~type.mutability"],
    S["~type.optionality"],
    "with-default",
    S["~encoded.mutability"],
    S["~encoded.optionality"]
  >
{
  readonly "Type": S["Type"]
  readonly "Encoded": S["Encoded"]
  readonly "DecodingServices": S["DecodingServices"]
  readonly "EncodingServices": S["EncodingServices"]
  readonly "~type.make.in": S["~type.make.in"]
  readonly "~type.make": S["~type.make"]
  readonly "Iso": S["Iso"]
  readonly schema: S
}
/**
 * Attaches a constructor default value to a schema field.
 *
 * **Details**
 *
 * Constructor defaults are applied only during `make*`, not during decoding or
 * encoding. Failures are represented directly as `SchemaIssue.Issue` values.
 *
 * **Example** (Defining an optional field with a static default)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema } from "effect"
 *
 * const MySchema = Schema.Struct({
 *   name: Schema.String.pipe(
 *     Schema.optionalKey,
 *     Schema.withConstructorDefault(Effect.succeed("anonymous"))
 *   )
 * })
 *
 * MySchema.make({}).name // => "anonymous"
 * ```
 *
 * @category constructors
 * @since 3.10.0
 */
export function withConstructorDefault<S extends Constraint & WithoutConstructorDefault>(
  // `S["~type.make.in"]` instead of `S["Type"]` is intentional here because
  // it makes easier to define the default value if there are nested defaults
  defaultValue: Effect.Effect<S["~type.make.in"], SchemaIssue.Issue>
) {
  return (schema: S): withConstructorDefault<S> =>
    make(SchemaAST.withConstructorDefault(schema.ast, defaultValue), { schema })
}
/**
 * Type-level representation returned by {@link withDecodingDefaultKey}.
 *
 * @category decoding
 * @since 4.0.0
 */
export interface withDecodingDefaultKey<S extends Constraint, R = never>
  extends decodeTo<S, optionalKey<toEncoded<S>>, R>
{
  readonly "Rebuild": withDecodingDefaultKey<S, R>
}
/**
 * Options for {@link withDecodingDefaultKey} and {@link withDecodingDefault}.
 *
 * **Details**
 *
 * - `encodingStrategy`:
 *   - `"passthrough"` (default): pass the value through during encoding
 *   - `"omit"`: omit the key from the encoded output
 *
 * @category options
 * @since 4.0.0
 */
export type DecodingDefaultOptions = {
  readonly encodingStrategy?: "omit" | "passthrough" | undefined
}

function toIssueEffect<A, R>(
  self: Effect.Effect<A, SchemaError, R>
): Effect.Effect<A, SchemaIssue.Issue, R> {
  return Effect.catchCause(self, (cause) => Effect.failCauseSync(() => Cause_.map(cause, (error) => error.issue)))
}
/**
 * Makes a struct key optional on the `Encoded` side and provides a default
 * `Encoded` value when the key is missing during decoding.
 *
 * **Details**
 *
 * The key uses `optionalKey` on the encoded side, so it may be absent from the
 * input object but **not** `undefined`. The default value is specified in terms
 * of the `Encoded` type (before any decoding transformations).
 *
 * Options:
 *
 * - `encodingStrategy`:
 *   - `"passthrough"` (default): include the value in the encoded output.
 *   - `"omit"`: omit the key from the encoded output.
 *
 * **Example** (Providing a default for a missing struct key)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema } from "effect"
 *
 * const MySchema = Schema.Struct({
 *   name: Schema.String.pipe(Schema.withDecodingDefaultKey(Effect.succeed("anonymous")))
 * })
 *
 * Schema.decodeUnknownSync(MySchema)({}).name // => "anonymous"
 * ```
 *
 * @see {@link withDecodingDefault} for the value-level variant (key absent **or** `undefined`)
 * @see {@link withDecodingDefaultTypeKey} for the variant where the default is a `Type` value
 * @category decoding
 * @since 4.0.0
 */
export function withDecodingDefaultKey<S extends Constraint, R = never>(
  defaultValue: Effect.Effect<S["Encoded"], SchemaError, R>,
  options?: DecodingDefaultOptions
): (self: S) => withDecodingDefaultKey<S, R> {
  const encode = options?.encodingStrategy === "omit" ? SchemaGetter.omit() : SchemaGetter.passthrough()
  return (self: S): withDecodingDefaultKey<S, R> => {
    return optionalKey(toEncoded(self)).pipe(decodeTo(self, {
      decode: SchemaGetter.withDefault(toIssueEffect(defaultValue)),
      encode
    }))
  }
}
/**
 * Type-level representation returned by {@link withDecodingDefaultTypeKey}.
 *
 * @category decoding
 * @since 4.0.0
 */
export interface withDecodingDefaultTypeKey<S extends Constraint, R = never>
  extends decodeTo<withDecodingDefaultKey<toType<S>, R>, optionalKey<S>>
{
  readonly "Rebuild": withDecodingDefaultTypeKey<S, R>
}
/**
 * Makes a struct key optional on the `Encoded` side (`optionalKey`, so the
 * key may be absent but **not** `undefined`) and provides a default `Type`
 * value when the key is missing during decoding.
 *
 * **Details**
 *
 * Unlike {@link withDecodingDefaultKey}, the default value is specified in
 * terms of the `Type` (decoded) representation, so it does not need to go
 * through the decoding transformation.
 *
 * Options:
 *
 * - `encodingStrategy`:
 *   - `"passthrough"` (default): include the value in the encoded output.
 *   - `"omit"`: omit the key from the encoded output.
 *
 * @see {@link withDecodingDefaultKey} for the variant where the default is an `Encoded` value
 * @see {@link withDecodingDefaultType} for the value-level variant
 * @category decoding
 * @since 4.0.0
 */
export function withDecodingDefaultTypeKey<S extends Constraint, R = never>(
  defaultValue: Effect.Effect<S["Type"], SchemaError, R>,
  options?: DecodingDefaultOptions
): (self: S) => withDecodingDefaultTypeKey<S, R> {
  return (self: S): withDecodingDefaultTypeKey<S, R> => {
    return toType(self).pipe(
      withDecodingDefaultKey<toType<S>, R>(defaultValue, options),
      encodeTo(optionalKey(self))
    )
  }
}
/**
 * Type-level representation returned by {@link withDecodingDefault}.
 *
 * @category decoding
 * @since 3.10.0
 */
export interface withDecodingDefault<S extends Constraint, R = never> extends decodeTo<S, optional<toEncoded<S>>, R> {
  readonly "Rebuild": withDecodingDefault<S, R>
}
/**
 * Wraps the `Encoded` side with `optional` (key absent **or** `undefined`)
 * and provides a default `Encoded` value when the field is missing or
 * `undefined` during decoding.
 *
 * **When to use**
 *
 * Use when the default is expressed in the encoded representation, before the
 * field's decoding transformation runs.
 *
 * **Details**
 *
 * The default value is specified in terms of the `Encoded` type (before any
 * decoding transformations).
 *
 * Options:
 *
 * - `encodingStrategy`:
 *   - `"passthrough"` (default): include the value in the encoded output.
 *   - `"omit"`: omit the key from the encoded output.
 *
 * **Example** (Providing a default for an optional field value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema } from "effect"
 *
 * const MySchema = Schema.Struct({
 *   name: Schema.String.pipe(Schema.optional, Schema.withDecodingDefault(Effect.succeed("anonymous")))
 * })
 *
 * Schema.decodeUnknownSync(MySchema)({ name: undefined }).name // => "anonymous"
 * ```
 *
 * @see {@link withDecodingDefaultKey} for the key-level variant (key absent only, not `undefined`)
 * @see {@link withDecodingDefaultType} for the variant where the default is a `Type` value
 * @category decoding
 * @since 3.10.0
 */
export function withDecodingDefault<S extends Constraint, R = never>(
  defaultValue: Effect.Effect<S["Encoded"], SchemaError, R>,
  options?: DecodingDefaultOptions
): (self: S) => withDecodingDefault<S, R> {
  const encode = options?.encodingStrategy === "omit" ? SchemaGetter.omit() : SchemaGetter.passthrough()
  return (self: S): withDecodingDefault<S, R> => {
    return optional(toEncoded(self)).pipe(decodeTo(self, {
      decode: SchemaGetter.withDefault(toIssueEffect(defaultValue)),
      encode
    }))
  }
}
/**
 * Type-level representation returned by {@link withDecodingDefaultType}.
 *
 * @category decoding
 * @since 4.0.0
 */
export interface withDecodingDefaultType<S extends Constraint, R = never>
  extends decodeTo<withDecodingDefault<toType<S>, R>, optional<S>>
{
  readonly "Rebuild": withDecodingDefaultType<S, R>
}
/**
 * Wraps the `Encoded` side with `optional` (key absent **or** `undefined`)
 * and provides a default `Type` value when the field is missing or
 * `undefined` during decoding.
 *
 * **When to use**
 *
 * Use when the default is already in the decoded representation and should not
 * pass through the field's decoding transformation.
 *
 * **Details**
 *
 * Unlike {@link withDecodingDefault}, the default value is specified in terms
 * of the `Type` (decoded) representation, so it does not need to go through
 * the decoding transformation.
 *
 * Options:
 *
 * - `encodingStrategy`:
 *   - `"passthrough"` (default): include the value in the encoded output.
 *   - `"omit"`: omit the key from the encoded output.
 *
 * @see {@link withDecodingDefault} for the variant where the default is an `Encoded` value
 * @see {@link withDecodingDefaultTypeKey} for the key-level variant
 * @category decoding
 * @since 4.0.0
 */
export function withDecodingDefaultType<S extends Constraint, R = never>(
  defaultValue: Effect.Effect<S["Type"], SchemaError, R>,
  options?: DecodingDefaultOptions
): (self: S) => withDecodingDefaultType<S, R> {
  return (self: S): withDecodingDefaultType<S, R> => {
    return toType(self).pipe(
      withDecodingDefault<toType<S>, R>(defaultValue, options),
      encodeTo(optional(self))
    )
  }
}
/**
 * Type-level representation returned by {@link tag}.
 *
 * @category constructors
 * @since 3.10.0
 */
export interface tag<Tag extends SchemaAST.LiteralValue> extends withConstructorDefault<Literal<Tag>> {}
/**
 * Combines a {@link Literal} schema with {@link withConstructorDefault}, making it ideal
 * for discriminator fields in tagged unions. When constructing via `make`, the
 * `_tag` field can be omitted and will be filled automatically.
 *
 * **Example** (Defining a discriminated union tag)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const A = Schema.Struct({ _tag: Schema.tag("A"), value: Schema.Number })
 *
 * // _tag is optional in make, auto-filled to "A"
 * const a = A.make({ value: 42 })
 * a // => { _tag: "A", value: 42 }
 * ```
 *
 * @see {@link tagDefaultOmit} to also omit the tag during encoding
 * @see {@link TaggedStruct} for a shorthand that adds `_tag` automatically
 * @category constructors
 * @since 3.10.0
 */
export function tag<Tag extends SchemaAST.LiteralValue>(literal: Tag): tag<Tag> {
  return Literal(literal).pipe(withConstructorDefault(Effect.succeed(literal)))
}
/**
 * Creates a literal `_tag` schema that is omitted from encoded output.
 *
 * **When to use**
 *
 * Use to decode data that omits the discriminator field while still constructing
 * values with a `_tag` for tagged union matching.
 *
 * **Details**
 *
 * The tag is filled during decoding and construction, like {@link tag}, but is
 * omitted when encoding.
 *
 * **Example** (Omitting tags during encoding)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const A = Schema.Struct({
 *   _tag: Schema.tagDefaultOmit("A"),
 *   value: Schema.Number
 * })
 *
 * // Encode strips the _tag field
 * Schema.encodeUnknownSync(A)({ _tag: "A", value: 1 }) // => { value: 1 }
 * ```
 *
 * @see {@link tag} for the variant that keeps the tag during encoding
 * @category constructors
 * @since 4.0.0
 */
export function tagDefaultOmit<Tag extends SchemaAST.LiteralValue>(literal: Tag) {
  return tag(literal).pipe(withDecodingDefaultKey(Effect.succeed(literal), { encodingStrategy: "omit" }))
}
/**
 * Type-level representation returned by {@link TaggedStruct}.
 *
 * @category models
 * @since 3.10.0
 */
export type TaggedStruct<Tag extends SchemaAST.LiteralValue, Fields extends Struct.Fields> = Struct<
  Simplify<{ readonly _tag: tag<Tag> } & Fields>
>
/**
 * Creates a struct schema with an automatically populated `_tag` field.
 *
 * **When to use**
 *
 * Use to define a tagged union case from a literal tag and a set of fields.
 *
 * **Details**
 *
 * When using the `make` method, the `_tag` field is optional and will be
 * added automatically. However, when decoding or encoding, the `_tag` field
 * must be present in the input.
 *
 * **Example** (Defining a tagged struct shorthand)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * // Defines a struct with a fixed `_tag` field
 * const tagged = Schema.TaggedStruct("A", {
 *   a: Schema.String
 * })
 *
 * // This is the same as writing:
 * const equivalent = Schema.Struct({
 *   _tag: Schema.tag("A"),
 *   a: Schema.String
 * })
 * void tagged
 * void equivalent
 * ```
 *
 * **Example** (Accessing the literal value of the tag)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const tagged = Schema.TaggedStruct("A", {
 *   a: Schema.String
 * })
 *
 * tagged.fields._tag.schema.literal // => "A"
 * ```
 *
 * @category constructors
 * @since 3.10.0
 */
export function TaggedStruct<const Tag extends SchemaAST.LiteralValue, const Fields extends Struct.Fields>(
  value: Tag,
  fields: Fields
): TaggedStruct<Tag, Fields> {
  return Struct({ _tag: tag(value), ...fields }) as any
}
/**
 * Recursively flatten any nested Schema.Union members into a single tuple of leaf schemas.
 */
type Flatten<Schemas> = Schemas extends readonly [infer Head, ...infer Tail]
  ? Head extends Union<infer Inner> ? [...Flatten<Inner>, ...Flatten<Tail>]
  : [Head, ...Flatten<Tail>]
  : []
type MatchCasesResult<Cases> = {
  [K in keyof Cases]-?: NonNullable<Cases[K]> extends (...args: Array<any>) => infer R ? R : never
}[keyof Cases]
type MatchOrElseResult<Cases, OrElse extends (...args: Array<any>) => any> = Unify<
  MatchCasesResult<Cases> | ReturnType<OrElse>
>
type TaggedUnionUtils<
  Tag extends PropertyKey,
  Members extends ReadonlyArray<Constraint & { readonly Type: { readonly [K in Tag]: PropertyKey } }>,
  Flattened extends ReadonlyArray<Constraint & { readonly Type: { readonly [K in Tag]: PropertyKey } }> = Flatten<
    Members
  >
> = {
  /**
   * Discriminant values in flattened member order.
   */
  readonly discriminants: { readonly [I in keyof Flattened]: Flattened[I]["Type"][Tag] }
  readonly cases: Simplify<{ [M in Flattened[number] as M["Type"][Tag]]: M }>
  readonly isAnyOf: <const Keys>(
    keys: ReadonlyArray<Keys>
  ) => (value: Members[number]["Type"]) => value is Extract<Members[number]["Type"], { readonly [K in Tag]: Keys }>
  readonly guards: { [M in Flattened[number] as M["Type"][Tag]]: (u: unknown) => u is M["Type"] }
  readonly match: {
    <
      Cases extends { [M in Flattened[number] as M["Type"][Tag]]: (value: M["Type"]) => any }
    >(
      value: Members[number]["Type"],
      cases: Cases
    ): Cases[keyof Cases] extends (value: any) => infer R ? Unify<R>
      : never
    <
      Cases extends { [M in Flattened[number] as M["Type"][Tag]]: (value: M["Type"]) => any }
    >(
      cases: Cases
    ): (value: Members[number]["Type"]) => Cases[keyof Cases] extends (value: any) => infer R ? Unify<R>
      : never
  }
  readonly matchOrElse: {
    <
      Cases extends
        & { [M in Flattened[number] as M["Type"][Tag]]+?: (value: M["Type"]) => any }
        & { [K in Exclude<keyof Cases, Flattened[number]["Type"][Tag]>]: never },
      OrElse extends (
        value: Exclude<Members[number]["Type"], { readonly [K in Tag]: keyof Cases }>
      ) => any
    >(
      value: Members[number]["Type"],
      cases: Cases,
      orElse: OrElse
    ): MatchOrElseResult<Cases, OrElse>
    <
      Cases extends
        & { [M in Flattened[number] as M["Type"][Tag]]+?: (value: M["Type"]) => any }
        & { [K in Exclude<keyof Cases, Flattened[number]["Type"][Tag]>]: never },
      OrElse extends (
        value: Exclude<Members[number]["Type"], { readonly [K in Tag]: keyof Cases }>
      ) => any
    >(
      cases: Cases,
      orElse: OrElse
    ): (value: Members[number]["Type"]) => MatchOrElseResult<Cases, OrElse>
  }
}
/**
 * Type-level representation returned by {@link toTaggedUnion}.
 *
 * @category combinators
 * @since 4.0.0
 */
export type toTaggedUnion<
  Tag extends PropertyKey,
  Members extends ReadonlyArray<Constraint & { readonly Type: { readonly [K in Tag]: PropertyKey } }>
> = Union<Members> & TaggedUnionUtils<Tag, Members>
/**
 * Augments an existing {@link Union} of tagged structs with utility methods and an ordered tuple of discriminant
 * values.
 *
 * **Gotchas**
 *
 * Throws if multiple members use the same discriminant property key.
 *
 * **Example** (Adding tagged-union utilities to an existing union)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const A = Schema.TaggedStruct("A", { value: Schema.Number })
 * const B = Schema.TaggedStruct("B", { name: Schema.String })
 *
 * const MyUnion = Schema.Union([A, B]).pipe(Schema.toTaggedUnion("_tag"))
 *
 * // Pattern-match on the union
 * const result = MyUnion.match({ _tag: "A", value: 1 }, {
 *   A: (a) => `number: ${a.value}`,
 *   B: (b) => `name: ${b.name}`
 * })
 * result // => "number: 1"
 * ```
 *
 * @see {@link TaggedUnion} for a shorthand that builds the union from scratch
 * @category combinators
 * @since 4.0.0
 */
export function toTaggedUnion<const Tag extends PropertyKey>(tag: Tag) {
  return <const Members extends ReadonlyArray<Constraint & { readonly Type: { readonly [K in Tag]: PropertyKey } }>>(
    self: Union<Members>
  ): toTaggedUnion<Tag, Members> => {
    const cases: Record<PropertyKey, unknown> = {}
    const discriminants: Array<PropertyKey> = []
    const discriminantKeys = new Set<string | symbol>()
    const guards: Record<PropertyKey, (u: unknown) => boolean> = {}
    const isAnyOf = (keys: ReadonlyArray<PropertyKey>) => (value: Members[number]["Type"]) => keys.includes(value[tag])

    walk(self)

    return Object.assign(self, { cases, discriminants, isAnyOf, guards, match, matchOrElse }) as any

    function walk(schema: Constraint) {
      const ast = schema.ast

      if (
        SchemaAST.isUnion(ast) && "members" in schema && globalThis.Array.isArray(schema.members) &&
        schema.members.every(isSchema)
      ) {
        return schema.members.forEach(walk)
      }

      const sentinels = SchemaAST.collectSentinels(ast)
      if (sentinels.length > 0) {
        const literal = sentinels.find((s) => s.key === tag)?.literal
        if (Predicate.isPropertyKey(literal)) {
          const key = typeof literal === "number" ? globalThis.String(literal) : literal
          if (discriminantKeys.has(key)) {
            throw new globalThis.Error(`Duplicate discriminant: ${globalThis.String(literal)}`)
          }
          discriminantKeys.add(key)
          discriminants.push(literal)
          InternalRecord.assignProperty(cases, literal, schema)
          InternalRecord.assignProperty(guards, literal, SchemaParser.is(toType(schema)))
          return
        }
      }

      throw new globalThis.Error("No literal or unique symbol found")
    }

    function match() {
      if (arguments.length === 1) {
        const cases = arguments[0]
        return function(value: any) {
          const key = value[tag]
          const handler = Object.hasOwn(cases, key) ? cases[key] : undefined
          return handler(value)
        }
      }
      const value = arguments[0]
      const cases = arguments[1]
      const key = value[tag]
      const handler = Object.hasOwn(cases, key) ? cases[key] : undefined
      return handler(value)
    }

    function matchOrElse() {
      if (arguments.length === 2) {
        const cases = arguments[0]
        const orElse = arguments[1]
        return function(value: any) {
          const key = value[tag]
          const handler = Object.hasOwn(cases, key) ? cases[key] ?? orElse : orElse
          return handler(value)
        }
      }
      const value = arguments[0]
      const cases = arguments[1]
      const orElse = arguments[2]
      const key = value[tag]
      const handler = Object.hasOwn(cases, key) ? cases[key] ?? orElse : orElse
      return handler(value)
    }
  }
}
/**
 * Type-level representation returned by {@link TaggedUnion}.
 *
 * @category models
 * @since 4.0.0
 */
export interface TaggedUnion<Cases extends Record<string, Constraint>> extends
  BottomLazy<
    SchemaAST.Union<SchemaAST.Objects>,
    TaggedUnion<Cases>
  >
{
  readonly "Type": { [K in keyof Cases]: Cases[K]["Type"] }[keyof Cases]
  readonly "Encoded": { [K in keyof Cases]: Cases[K]["Encoded"] }[keyof Cases]
  readonly "DecodingServices": { [K in keyof Cases]: Cases[K]["DecodingServices"] }[keyof Cases]
  readonly "EncodingServices": { [K in keyof Cases]: Cases[K]["EncodingServices"] }[keyof Cases]
  readonly "~type.make.in": { [K in keyof Cases]: Cases[K]["~type.make"] }[keyof Cases]
  readonly "~type.make": { [K in keyof Cases]: Cases[K]["~type.make"] }[keyof Cases]
  readonly "Iso": { [K in keyof Cases]: Cases[K]["Type"] }[keyof Cases]
  readonly cases: Cases
  readonly isAnyOf: <const Keys>(
    keys: ReadonlyArray<Keys>
  ) => (value: Cases[keyof Cases]["Type"]) => value is Extract<Cases[keyof Cases]["Type"], { _tag: Keys }>
  readonly guards: { [K in keyof Cases]: (u: unknown) => u is Cases[K]["Type"] }
  readonly match: {
    <Output>(
      cases: { [K in keyof Cases]: (value: Cases[K]["Type"]) => Output }
    ): (value: Cases[keyof Cases]["Type"]) => Output
    <Output>(
      value: Cases[keyof Cases]["Type"],
      cases: { [K in keyof Cases]: (value: Cases[K]["Type"]) => Output }
    ): Output
  }
  readonly matchOrElse: {
    <Output>(
      value: Cases[keyof Cases]["Type"],
      cases: { [K in keyof Cases]?: (value: Cases[K]["Type"]) => Output },
      orElse: (value: Cases[keyof Cases]["Type"]) => Output
    ): Output
    <Output>(
      cases: { [K in keyof Cases]?: (value: Cases[K]["Type"]) => Output },
      orElse: (value: Cases[keyof Cases]["Type"]) => Output
    ): (value: Cases[keyof Cases]["Type"]) => Output
  }
}
/**
 * Builds a discriminated union from a record of field sets, one per variant.
 * Each key becomes the `_tag` literal and the value is passed to {@link TaggedStruct}.
 * The result includes `cases`, `guards`, `isAnyOf`, `match`, and `matchOrElse` utilities.
 *
 * **Example** (Pattern matching a discriminated union)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const Shape = Schema.TaggedUnion({
 *   Circle: { radius: Schema.Number },
 *   Rectangle: { width: Schema.Number, height: Schema.Number }
 * })
 *
 * // Pattern-match on a decoded value
 * const area = Shape.match({ _tag: "Circle", radius: 5 }, {
 *   Circle: (c) => Math.PI * c.radius ** 2,
 *   Rectangle: (r) => r.width * r.height
 * })
 * Math.round(area * 100) / 100 // => 78.54
 * ```
 *
 * @see {@link toTaggedUnion} to augment an existing union instead
 * @category constructors
 * @since 4.0.0
 */
export function TaggedUnion<const CasesByTag extends Record<string, Struct.Fields>>(
  casesByTag: CasesByTag
): TaggedUnion<{ readonly [K in keyof CasesByTag & string]: TaggedStruct<K, CasesByTag[K]> }> {
  const cases: any = {}
  const members: any = []
  for (const key of Object.keys(casesByTag)) {
    const member = TaggedStruct(key, casesByTag[key])
    InternalRecord.assignProperty(cases, key, member)
    members.push(member)
  }
  const union = Union(members)
  const { guards, isAnyOf, match, matchOrElse } = toTaggedUnion("_tag")(union)
  return make(union.ast, { cases, isAnyOf, guards, match, matchOrElse })
}
/**
 * Type-level representation returned by {@link Opaque}.
 *
 * @category models
 * @since 4.0.0
 */
export interface Opaque<Self, S extends Top, Brand> extends
  BottomLazyWithoutNew<
    S["ast"],
    S["Rebuild"],
    S["~type.parameters"],
    S["~type.mutability"],
    S["~type.optionality"],
    S["~type.constructor.default"],
    S["~encoded.mutability"],
    S["~encoded.optionality"]
  >
{
  readonly "Type": Self
  readonly "Encoded": S["Encoded"]
  readonly "DecodingServices": S["DecodingServices"]
  readonly "EncodingServices": S["EncodingServices"]
  readonly "~type.make.in": S["~type.make.in"]
  readonly "~type.make": S["~type.make"]
  readonly "Iso": S["Iso"]
  new(_: never): S["Type"] & Brand
}
/**
 * Wraps a struct schema so that its decoded `Type` becomes a nominally distinct type `Self`.
 * Useful for creating opaque types that are structurally identical to a base struct
 * but type-incompatible with it.
 *
 * **Example** (Defining opaque structs)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * class Person extends Schema.Opaque<Person>()(
 *   Schema.Struct({
 *     name: Schema.String
 *   })
 * ) {}
 *
 * // Decoded value is Person, not { name: string }
 * const person = Schema.decodeUnknownSync(Person)({ name: "Alice" })
 * person.name // => "Alice"
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export function Opaque<Self, Brand = {}>() {
  return <S extends Top>(
    schema: S
  ): Opaque<Self, S, Brand> & Omit<S, keyof Top> => schema as any
}
/**
 * Type-level representation returned by {@link instanceOf}.
 *
 * @category models
 * @since 3.10.0
 */
export interface instanceOf<T, Iso = T> extends declare<T, Iso> {
  readonly "Rebuild": instanceOf<T, Iso>
}
/**
 * Creates a schema that validates values using `instanceof`.
 * Decoding and encoding pass the value through unchanged.
 *
 * **Example** (Defining a schema for a built-in class)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const DateSchema = Schema.instanceOf(Date)
 *
 * const decoded = Schema.decodeUnknownSync(DateSchema)(new Date("2024-01-01"))
 * decoded.toISOString() // => "2024-01-01T00:00:00.000Z"
 * ```
 *
 * @category constructors
 * @since 3.10.0
 */
export function instanceOf<C extends abstract new(...args: any) => any, Iso = InstanceType<C>>(
  constructor: C,
  annotations?: Annotations.Declaration<InstanceType<C>> | undefined
): instanceOf<InstanceType<C>, Iso> {
  return declare((u): u is InstanceType<C> => u instanceof constructor, annotations)
}
/**
 * Constructs an `SchemaAST.Link` that describes how a value of type `T` encodes to and decodes from a `To` schema.
 * Used when building low-level AST transformations that bridge two schema types.
 *
 * @category transforming
 * @since 4.0.0
 */
export function link<T>() {
  return <To extends Constraint>(
    encodeTo: To,
    transformation: {
      readonly decode: SchemaGetter.Getter<T, NoInfer<To["Type"]>>
      readonly encode: SchemaGetter.Getter<NoInfer<To["Type"]>, T>
    }
  ): SchemaAST.Link => {
    return new SchemaAST.Link(encodeTo.ast, SchemaTransformation.makeTransformation(transformation))
  }
}
/**
 * Creates a custom validation filter from a predicate function.
 *
 * **Details**
 *
 * The predicate receives the decoded input value, the schema AST, and parse
 * options, and returns a `FilterOutput`. Non-success outputs are normalized into
 * schema issues. The `annotations` parameter annotates the filter itself; with
 * the default formatter, failures use `message` first, `expected` second, and
 * `<filter>` when neither is provided.
 *
 * When `abort` is `true`, parsing stops after this filter fails instead of
 * collecting later check failures.
 *
 * **Example** (Reporting failure at a nested path)
 *
 * ```ts import.meta.vitest
 * import { Result, Schema } from "effect"
 *
 * const schema = Schema.Struct({ password: Schema.String, confirmPassword: Schema.String }).check(
 *   Schema.makeFilter((o) =>
 *     o.password === o.confirmPassword
 *       ? undefined
 *       : { path: ["password"], issue: "password and confirmPassword must match" }
 *   )
 * )
 *
 * const result = Schema.decodeUnknownResult(schema)({ password: "123456", confirmPassword: "1234567" })
 * if (Result.isFailure(result) && result.failure.issue._tag === "Filter" && result.failure.issue.issue._tag === "Pointer") {
 *   result.failure.issue.issue.path // => ["password"]
 * }
 * ```
 *
 * **Example** (Reporting multiple failures at once)
 *
 * ```ts import.meta.vitest
 * import { Result, Schema } from "effect"
 *
 * const schema = Schema.Struct({ a: Schema.Finite, b: Schema.Finite, c: Schema.Finite }).check(
 *   Schema.makeFilter((o) => {
 *     const issues: Array<Schema.FilterIssue> = []
 *     if (o.a > 0) {
 *       if (o.b <= 0) issues.push({ path: ["b"], issue: "b must be greater than 0" })
 *       if (o.c <= 0) issues.push({ path: ["c"], issue: "c must be greater than 0" })
 *     }
 *     return issues
 *   })
 * )
 *
 * const result = Schema.decodeUnknownResult(schema)({ a: 1, b: 0, c: 0 })
 * if (Result.isFailure(result) && result.failure.issue._tag === "Filter" && result.failure.issue.issue._tag === "Composite") {
 *   result.failure.issue.issue.issues.map((issue) => issue._tag === "Pointer" ? issue.path : []) // => [["b"], ["c"]]
 * }
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeFilter: <T>(
  filter: (input: T, ast: SchemaAST.AST, options: SchemaAST.ParseOptions) => FilterOutput,
  annotations?: Annotations.Filter | undefined,
  abort?: boolean
) => SchemaAST.Filter<T> = SchemaAST.makeFilter
/**
 * A single failure reported by a filter predicate. Used as the element type
 * of the array arm of {@link FilterOutput}, and also accepted on its own.
 *
 * **Details**
 *
 * - `string`: failure with that string as the message. Produces an
 *   {@link SchemaIssue.InvalidValue} with the string used as the issue's
 *   `message` annotation and honors `reportInput`.
 * - {@link SchemaIssue.Issue}: a fully-formed issue, returned as-is. It is not
 *   enriched when `reportInput` is enabled.
 * - `{ path, issue }`: failure attached to a nested path. `issue` is either
 *   a `string` (wrapped in an {@link SchemaIssue.InvalidValue} that honors
 *   `reportInput`) or a full {@link SchemaIssue.Issue} (returned unchanged);
 *   the result is wrapped in an {@link SchemaIssue.Pointer} at the given `path`.
 *
 * @category models
 * @since 3.10.0
 */
export type FilterIssue = string | SchemaIssue.Issue | {
  readonly path: ReadonlyArray<PropertyKey>
  readonly issue: string | SchemaIssue.Issue
}
/**
 * The value a filter predicate (see {@link makeFilter}) may return.
 *
 * **Details**
 *
 * Each shape is normalized into an {@link SchemaIssue.Issue} (or `undefined` for
 * success) before being attached to the parse result:
 *
 * - `undefined`: success. The input satisfies the filter.
 * - `true`: success. Equivalent to `undefined`, useful when the predicate is
 *   a plain boolean expression.
 * - `false`: generic failure. Produces an {@link SchemaIssue.InvalidValue}
 *   with no custom message and honors `reportInput`.
 * - {@link FilterIssue}: a single failure. See {@link FilterIssue} for the
 *   shapes (`string`, {@link SchemaIssue.Issue}, or `{ path, issue }`).
 * - `ReadonlyArray<FilterIssue>`: several failures reported together. An
 *   empty array is treated as success; a single-element array is equivalent
 *   to returning that element directly; otherwise the entries are grouped
 *   into an {@link SchemaIssue.Composite}.
 *
 * @category models
 * @since 3.10.0
 */
export type FilterOutput = undefined | boolean | FilterIssue | ReadonlyArray<FilterIssue>
/**
 * Groups multiple checks into a single {@link SchemaAST.FilterGroup}, applying
 * optional shared annotations to the group as a whole.
 *
 * @category constructors
 * @since 4.0.0
 */
export function makeFilterGroup<T>(
  checks: readonly [SchemaAST.Check<T>, ...Array<SchemaAST.Check<T>>],
  annotations: Annotations.Filter | undefined = undefined
): SchemaAST.FilterGroup<T> {
  return new SchemaAST.FilterGroup(checks, annotations)
}

const TRIMMED_PATTERN = "^\\S[\\s\\S]*\\S$|^\\S$|^$"
/**
 * Validates that a string has no leading or trailing whitespace.
 *
 * **Details**
 *
 * JSON Schema:
 *
 * This check corresponds to a `pattern` constraint in JSON Schema that
 * matches strings without leading or trailing whitespace.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies a `patterns`
 * constraint to ensure generated strings match the trimmed pattern.
 *
 * @category validation
 * @since 4.0.0
 */
export function isTrimmed(annotations?: Annotations.Filter) {
  const regExp = new globalThis.RegExp(TRIMMED_PATTERN)
  return makeFilter(
    (s: string) => s.trim() === s,
    {
      expected: "a string with no leading or trailing whitespace",
      representation: {
        id: "effect/schema/isTrimmed",
        payload: null
      },
      toJsonSchema: () => ({ pattern: regExp.source }),
      toCode: () => ({ runtime: "Schema.isTrimmed()" }),
      arbitraryConstraint: {
        patterns: [{ source: TRIMMED_PATTERN, flags: "" }]
      },
      ...annotations
    }
  )
}
/**
 * Validates that a string matches the specified regular expression pattern.
 *
 * **Details**
 *
 * JSON Schema:
 *
 * Unless annotations override `toJsonSchema`, JSON Schema receives a `pattern`
 * only when the JavaScript RegExp uses the Unicode flag and its other flags are
 * `d`, `g`, or `y`. Sticky patterns are anchored at the start of the string.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies a `patterns`
 * constraint to ensure generated strings match the specified RegExp pattern.
 *
 * @category validation
 * @since 4.0.0
 */
export function isPattern(
  regExp: globalThis.RegExp,
  annotations?: Annotations.Filter
): SchemaAST.Filter<string> {
  const source = regExp.source
  const flags = regExp.flags
  const canExport = /^[dg]*uy?$/.test(flags)
  const runtimeRegExp = flags === ""
    ? `new RegExp(${format(source)})`
    : `new RegExp(${format(source)}, ${format(flags)})`
  return SchemaAST.isPattern(regExp, {
    toJsonSchema: () => canExport ? { pattern: flags.endsWith("y") ? `^(?:${source})` : source } : [{}, true],
    toCode: () => ({ runtime: `Schema.isPattern(${runtimeRegExp})` }),
    ...annotations
  })
}
/**
 * Validates that a string represents a finite number.
 *
 * **Details**
 *
 * JSON Schema:
 *
 * This check corresponds to a `pattern` constraint in JSON Schema that matches
 * strings representing finite numbers.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies a `patterns`
 * constraint to ensure generated strings match the number string pattern.
 *
 * @category validation
 * @since 4.0.0
 */
export function isStringFinite(annotations?: Annotations.Filter): SchemaAST.Filter<string> {
  return SchemaAST.isStringFinite({
    toCode: () => ({ runtime: "Schema.isStringFinite()" }),
    ...annotations
  })
}
/**
 * Validates that a string is a signed base-10 integer literal for Effect's
 * BigInt string encoding.
 *
 * **Details**
 *
 * The check uses the pattern `^-?\d+$`. It does not accept leading `+`, decimal
 * points, exponent notation, separators, or non-decimal inputs such as
 * hexadecimal strings.
 *
 * JSON Schema:
 * This check corresponds to a `pattern` constraint with the same signed
 * base-10 integer pattern.
 *
 * @category validation
 * @since 4.0.0
 */
export function isStringBigInt(annotations?: Annotations.Filter): SchemaAST.Filter<string> {
  return SchemaAST.isStringBigInt({
    toCode: () => ({ runtime: "Schema.isStringBigInt()" }),
    ...annotations
  })
}
/**
 * Validates that a string has the `Symbol(description)` format used by Effect's
 * symbol string encoding.
 *
 * **Details**
 *
 * The check uses the pattern `^Symbol\((.*)\)$`. It is not a general test for
 * whether a string can be passed to JavaScript's `Symbol()` function.
 *
 * @category validation
 * @since 4.0.0
 */
export function isStringSymbol(annotations?: Annotations.Filter): SchemaAST.Filter<string> {
  return SchemaAST.isStringSymbol({
    toCode: () => ({ runtime: "Schema.isStringSymbol()" }),
    ...annotations
  })
}

const getUUIDRegExp = (version?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8): globalThis.RegExp => {
  if (version) {
    return new globalThis.RegExp(
      `^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`
    )
  }
  return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$/
}
/**
 * Validates that a string is a strict Universally Unique Identifier (UUID).
 *
 * **When to use**
 *
 * Use when you need UUID semantics, including version and RFC variant bits,
 * rather than only the dashed hexadecimal shape.
 *
 * **Details**
 *
 * Without a version argument, this accepts UUID versions 1 through 8, the nil
 * UUID (`00000000-0000-0000-0000-000000000000`), and the max UUID
 * (`ffffffff-ffff-ffff-ffff-ffffffffffff`). With a version argument, this
 * accepts only UUIDs with that version and RFC variant bits; nil and max UUIDs
 * are not versioned UUIDs and do not match version-specific checks.
 *
 * JSON Schema:
 *
 * This check corresponds to a `pattern` constraint in JSON Schema that matches
 * UUID format, and includes a `format: "uuid"` annotation.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies a `patterns`
 * constraint to ensure generated strings match the UUID pattern.
 *
 * @see {@link isGUID} for shape-only GUID validation.
 * @category validation
 * @since 4.0.0
 */
export function isUUID(version?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, annotations?: Annotations.Filter) {
  const regExp = getUUIDRegExp(version)
  return isPattern(
    regExp,
    {
      expected: version ? `a UUID v${version}` : "a UUID",
      representation: {
        id: "effect/schema/isUUID",
        payload: { version: version ?? null }
      },
      toJsonSchema: () => ({ pattern: regExp.source, format: "uuid" }),
      toCode: () => ({ runtime: version === undefined ? "Schema.isUUID()" : `Schema.isUUID(${version})` }),
      ...annotations
    }
  )
}

const GUID_REGEXP = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/
/**
 * Validates that a string has the GUID / UUID textual shape.
 *
 * **When to use**
 *
 * Use when you need to accept dashed hexadecimal identifiers without enforcing
 * UUID version or variant bits.
 *
 * **Details**
 *
 * This check accepts strings in the `8-4-4-4-12` hexadecimal form. JSON Schema
 * output includes the corresponding `pattern` constraint and intentionally does
 * not include `format: "uuid"` because GUID validation is looser than UUID
 * validation.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies a `patterns`
 * constraint to ensure generated strings match the GUID pattern.
 *
 * @see {@link isUUID} for strict UUID validation.
 * @category validation
 * @since 4.0.0
 */
export function isGUID(annotations?: Annotations.Filter) {
  return isPattern(
    GUID_REGEXP,
    {
      expected: "a GUID",
      representation: {
        id: "effect/schema/isGUID",
        payload: null
      },
      toJsonSchema: () => ({ pattern: GUID_REGEXP.source }),
      toCode: () => ({ runtime: "Schema.isGUID()" }),
      ...annotations
    }
  )
}
/**
 * Validates that a string is a valid ULID (Universally Unique Lexicographically
 * Sortable Identifier).
 *
 * **Details**
 *
 * JSON Schema:
 *
 * This check corresponds to a `pattern` constraint in JSON Schema that matches
 * the ULID format.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies a `patterns`
 * constraint to ensure generated strings match the ULID pattern.
 *
 * @category validation
 * @since 4.0.0
 */
export function isULID(annotations?: Annotations.Filter) {
  const regExp = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/
  return isPattern(
    regExp,
    {
      representation: {
        id: "effect/schema/isULID",
        payload: null
      },
      toJsonSchema: () => ({ pattern: regExp.source }),
      toCode: () => ({ runtime: "Schema.isULID()" }),
      ...annotations
    }
  )
}
/**
 * Validates that a string is valid Base64 encoded data.
 *
 * **Details**
 *
 * JSON Schema:
 *
 * This check corresponds to a `pattern` constraint in JSON Schema that matches
 * Base64 format.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies a `patterns`
 * constraint to ensure generated strings match the Base64 pattern.
 *
 * @category validation
 * @since 4.0.0
 */
export function isBase64(annotations?: Annotations.Filter) {
  const regExp = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/
  return isPattern(
    regExp,
    {
      expected: "a base64 encoded string",
      representation: {
        id: "effect/schema/isBase64",
        payload: null
      },
      toJsonSchema: () => ({ pattern: regExp.source }),
      toCode: () => ({ runtime: "Schema.isBase64()" }),
      ...annotations
    }
  )
}
/**
 * Validates that a string is valid Base64URL encoded data (Base64 with URL-safe
 * characters).
 *
 * **Details**
 *
 * JSON Schema:
 *
 * This check corresponds to a `pattern` constraint in JSON Schema that matches
 * Base64URL format.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies a `patterns`
 * constraint to ensure generated strings match the Base64URL pattern.
 *
 * @category validation
 * @since 4.0.0
 */
export function isBase64Url(annotations?: Annotations.Filter) {
  const regExp = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/
  return isPattern(
    regExp,
    {
      expected: "a base64url encoded string",
      representation: {
        id: "effect/schema/isBase64Url",
        payload: null
      },
      toJsonSchema: () => ({ pattern: regExp.source }),
      toCode: () => ({ runtime: "Schema.isBase64Url()" }),
      ...annotations
    }
  )
}

function literalToJsonSchema(
  literal: string,
  original: string,
  pattern: string
): SchemaRepresentation.ToJsonSchema.CheckOutput {
  if (literal.length === 0) return original.length === 0 ? {} : [{}, true]
  const constraint = { pattern: new globalThis.RegExp(pattern).source }
  return literal === original ? constraint : [constraint, true]
}

/**
 * Validates at runtime that a string starts with the specified literal prefix.
 *
 * **Details**
 *
 * RegExp metacharacters in the prefix are escaped in JSON Schema and arbitrary
 * metadata. If the prefix ends with a high surrogate, the JSON Schema pattern
 * omits that code unit so Unicode matching cannot reject a valid string.
 *
 * @category validation
 * @since 4.0.0
 */
export function isStartingWith(startsWith: string, annotations?: Annotations.Filter) {
  const formatted = JSON.stringify(startsWith)
  const regExp = new globalThis.RegExp(`^${RegExp_.escape(startsWith)}`)
  const jsonSchemaLiteral = startsWith.replace(/[\uD800-\uDBFF]$/, "")
  return makeFilter(
    (s: string) => s.startsWith(startsWith),
    {
      expected: `a string starting with ${formatted}`,
      representation: {
        id: "effect/schema/isStartingWith",
        payload: { startsWith }
      },
      toJsonSchema: () => literalToJsonSchema(jsonSchemaLiteral, startsWith, `^${RegExp_.escape(jsonSchemaLiteral)}`),
      toCode: () => ({ runtime: `Schema.isStartingWith(${format(startsWith)})` }),
      arbitraryConstraint: {
        patterns: [{ source: regExp.source, flags: regExp.flags }]
      },
      ...annotations
    }
  )
}
/**
 * Validates at runtime that a string ends with the specified literal suffix.
 *
 * **Details**
 *
 * RegExp metacharacters in the suffix are escaped in JSON Schema and arbitrary
 * metadata. If the suffix begins with a low surrogate, the JSON Schema pattern
 * omits that code unit so Unicode matching cannot reject a valid string.
 *
 * @category validation
 * @since 4.0.0
 */
export function isEndingWith(endsWith: string, annotations?: Annotations.Filter) {
  const formatted = JSON.stringify(endsWith)
  const regExp = new globalThis.RegExp(`${RegExp_.escape(endsWith)}$`)
  const jsonSchemaLiteral = endsWith.replace(/^[\uDC00-\uDFFF]/, "")
  return makeFilter(
    (s: string) => s.endsWith(endsWith),
    {
      expected: `a string ending with ${formatted}`,
      representation: {
        id: "effect/schema/isEndingWith",
        payload: { endsWith }
      },
      toJsonSchema: () => literalToJsonSchema(jsonSchemaLiteral, endsWith, `${RegExp_.escape(jsonSchemaLiteral)}$`),
      toCode: () => ({ runtime: `Schema.isEndingWith(${format(endsWith)})` }),
      arbitraryConstraint: {
        patterns: [{ source: regExp.source, flags: regExp.flags }]
      },
      ...annotations
    }
  )
}
/**
 * Validates at runtime that a string contains the specified literal substring.
 *
 * **Details**
 *
 * RegExp metacharacters in the substring are escaped in JSON Schema and
 * arbitrary metadata. A leading low surrogate or trailing high surrogate is
 * omitted from the JSON Schema pattern so Unicode matching cannot reject a
 * valid string.
 *
 * @category validation
 * @since 4.0.0
 */
export function isIncluding(includes: string, annotations?: Annotations.Filter) {
  const formatted = JSON.stringify(includes)
  const regExp = new globalThis.RegExp(RegExp_.escape(includes))
  const jsonSchemaLiteral = includes.replace(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/g, "")
  return makeFilter(
    (s: string) => s.includes(includes),
    {
      expected: `a string including ${formatted}`,
      representation: {
        id: "effect/schema/isIncluding",
        payload: { includes }
      },
      toJsonSchema: () => literalToJsonSchema(jsonSchemaLiteral, includes, RegExp_.escape(jsonSchemaLiteral)),
      toCode: () => ({ runtime: `Schema.isIncluding(${format(includes)})` }),
      arbitraryConstraint: {
        patterns: [{ source: regExp.source, flags: regExp.flags }]
      },
      ...annotations
    }
  )
}

const UPPERCASED_PATTERN = "^[^a-z]*$"
/**
 * Validates that a string is unchanged by JavaScript's `toUpperCase()`.
 *
 * **Details**
 *
 * This accepts empty strings and characters that do not have lowercase forms,
 * such as digits, punctuation, and whitespace. It rejects strings that would
 * change when uppercased.
 *
 * @category validation
 * @since 4.0.0
 */
export function isUppercased(annotations?: Annotations.Filter) {
  const regExp = new globalThis.RegExp(UPPERCASED_PATTERN)
  return makeFilter(
    (s: string) => s.toUpperCase() === s,
    {
      expected: "a string with all characters in uppercase",
      representation: {
        id: "effect/schema/isUppercased",
        payload: null
      },
      toJsonSchema: () => [{ pattern: regExp.source }, true],
      toCode: () => ({ runtime: "Schema.isUppercased()" }),
      arbitraryConstraint: {
        patterns: [{ source: UPPERCASED_PATTERN, flags: "" }]
      },
      ...annotations
    }
  )
}

const LOWERCASED_PATTERN = "^[^A-Z]*$"
/**
 * Validates that a string is unchanged by JavaScript's `toLowerCase()`.
 *
 * **Details**
 *
 * This accepts empty strings and characters that do not have uppercase forms,
 * such as digits, punctuation, and whitespace. It rejects strings that would
 * change when lowercased.
 *
 * @category validation
 * @since 4.0.0
 */
export function isLowercased(annotations?: Annotations.Filter) {
  const regExp = new globalThis.RegExp(LOWERCASED_PATTERN)
  return makeFilter(
    (s: string) => s.toLowerCase() === s,
    {
      expected: "a string with all characters in lowercase",
      representation: {
        id: "effect/schema/isLowercased",
        payload: null
      },
      toJsonSchema: () => [{ pattern: regExp.source }, true],
      toCode: () => ({ runtime: "Schema.isLowercased()" }),
      arbitraryConstraint: {
        patterns: [{ source: LOWERCASED_PATTERN, flags: "" }]
      },
      ...annotations
    }
  )
}

const CAPITALIZED_PATTERN = "^(?:[^a-z][\\s\\S]*)?$"
/**
 * Validates that the first character of a string is unchanged by
 * `toUpperCase()`.
 *
 * **Details**
 *
 * Empty strings pass. Strings whose first character has no lowercase form, such
 * as a digit, punctuation mark, or whitespace, also pass.
 *
 * @category validation
 * @since 4.0.0
 */
export function isCapitalized(annotations?: Annotations.Filter) {
  const regExp = new globalThis.RegExp(CAPITALIZED_PATTERN)
  return makeFilter(
    (s: string) => s.charAt(0).toUpperCase() === s.charAt(0),
    {
      expected: "a string with the first character in uppercase",
      representation: {
        id: "effect/schema/isCapitalized",
        payload: null
      },
      toJsonSchema: () => [{ pattern: regExp.source }, true],
      toCode: () => ({ runtime: "Schema.isCapitalized()" }),
      arbitraryConstraint: {
        patterns: [{ source: CAPITALIZED_PATTERN, flags: "" }]
      },
      ...annotations
    }
  )
}

const UNCAPITALIZED_PATTERN = "^(?:[^A-Z][\\s\\S]*)?$"
/**
 * Validates that the first character of a string is unchanged by
 * `toLowerCase()`.
 *
 * **Details**
 *
 * Empty strings pass. Strings whose first character has no uppercase form, such
 * as a digit, punctuation mark, or whitespace, also pass.
 *
 * @category validation
 * @since 4.0.0
 */
export function isUncapitalized(annotations?: Annotations.Filter) {
  const regExp = new globalThis.RegExp(UNCAPITALIZED_PATTERN)
  return makeFilter(
    (s: string) => s.charAt(0).toLowerCase() === s.charAt(0),
    {
      expected: "a string with the first character in lowercase",
      representation: {
        id: "effect/schema/isUncapitalized",
        payload: null
      },
      toJsonSchema: () => [{ pattern: regExp.source }, true],
      toCode: () => ({ runtime: "Schema.isUncapitalized()" }),
      arbitraryConstraint: {
        patterns: [{ source: UNCAPITALIZED_PATTERN, flags: "" }]
      },
      ...annotations
    }
  )
}
/**
 * Type-level representation of {@link Finite}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Finite extends Number {
  readonly "Rebuild": Finite
}
/**
 * Schema for finite numbers, rejecting `NaN`, `Infinity`, and `-Infinity`.
 *
 * @category schemas
 * @since 3.10.0
 */
export const Finite: Finite = make(SchemaAST.finite)
/**
 * Validates that a number is finite (not `Infinity`, `-Infinity`, or `NaN`).
 *
 * **Details**
 *
 * JSON Schema:
 *
 * This check does not have a direct JSON Schema equivalent, but ensures the
 * number is valid and finite.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies a finite-number constraint.
 *
 * @category validation
 * @since 4.0.0
 */
export const isFinite: (annotations?: Annotations.Filter) => SchemaAST.Filter<number> = SchemaAST.isFinite
/**
 * Creates a greater-than (`>`) check for any ordered type from an
 * `Order.Order` instance.
 *
 * @category validation
 * @since 4.0.0
 */
export function makeIsGreaterThan<T>(options: {
  readonly order: Order.Order<T>
  readonly annotate?: ((exclusiveMinimum: T) => Annotations.Filter) | undefined
  readonly formatter?: Formatter<T> | undefined
}) {
  const gt = Order.isGreaterThan(options.order)
  const formatter = options.formatter ?? format
  return (exclusiveMinimum: T, annotations?: Annotations.Filter) => {
    return makeFilter<T>(
      (input) => gt(input, exclusiveMinimum),
      {
        expected: `a value greater than ${formatter(exclusiveMinimum)}`,
        arbitraryConstraint: {
          order: options.order,
          minimum: exclusiveMinimum,
          exclusiveMinimum: true
        },
        ...options.annotate?.(exclusiveMinimum),
        ...annotations
      }
    )
  }
}
/**
 * Creates a greater-than-or-equal-to (`>=`) check for any ordered type from an
 * `Order.Order` instance.
 *
 * @category validation
 * @since 4.0.0
 */
export function makeIsGreaterThanOrEqualTo<T>(options: {
  readonly order: Order.Order<T>
  readonly annotate?: ((exclusiveMinimum: T) => Annotations.Filter) | undefined
  readonly formatter?: Formatter<T> | undefined
}) {
  const gte = Order.isGreaterThanOrEqualTo(options.order)
  const formatter = options.formatter ?? format
  return (minimum: T, annotations?: Annotations.Filter) => {
    return makeFilter<T>(
      (input) => gte(input, minimum),
      {
        expected: `a value greater than or equal to ${formatter(minimum)}`,
        arbitraryConstraint: {
          order: options.order,
          minimum
        },
        ...options.annotate?.(minimum),
        ...annotations
      }
    )
  }
}
/**
 * Creates a less-than (`<`) check for any ordered type from an `Order.Order`
 * instance.
 *
 * @category validation
 * @since 4.0.0
 */
export function makeIsLessThan<T>(options: {
  readonly order: Order.Order<T>
  readonly annotate?: ((exclusiveMaximum: T) => Annotations.Filter) | undefined
  readonly formatter?: Formatter<T> | undefined
}) {
  const lt = Order.isLessThan(options.order)
  const formatter = options.formatter ?? format
  return (exclusiveMaximum: T, annotations?: Annotations.Filter) => {
    return makeFilter<T>(
      (input) => lt(input, exclusiveMaximum),
      {
        expected: `a value less than ${formatter(exclusiveMaximum)}`,
        arbitraryConstraint: {
          order: options.order,
          maximum: exclusiveMaximum,
          exclusiveMaximum: true
        },
        ...options.annotate?.(exclusiveMaximum),
        ...annotations
      }
    )
  }
}
/**
 * Creates a less-than-or-equal-to (`<=`) check for any ordered type from an
 * `Order.Order` instance.
 *
 * @category validation
 * @since 4.0.0
 */
export function makeIsLessThanOrEqualTo<T>(options: {
  readonly order: Order.Order<T>
  readonly annotate?: ((exclusiveMaximum: T) => Annotations.Filter) | undefined
  readonly formatter?: Formatter<T> | undefined
}) {
  const lte = Order.isLessThanOrEqualTo(options.order)
  const formatter = options.formatter ?? format
  return (maximum: T, annotations?: Annotations.Filter) => {
    return makeFilter<T>(
      (input) => lte(input, maximum),
      {
        expected: `a value less than or equal to ${formatter(maximum)}`,
        arbitraryConstraint: {
          order: options.order,
          maximum
        },
        ...options.annotate?.(maximum),
        ...annotations
      }
    )
  }
}
/**
 * Creates an inclusive or exclusive range check for any ordered type from an
 * `Order.Order` instance.
 *
 * @category validation
 * @since 4.0.0
 */
export function makeIsBetween<T>(deriveOptions: {
  readonly order: Order.Order<T>
  readonly annotate?:
    | ((options: {
      readonly minimum: T
      readonly maximum: T
      readonly exclusiveMinimum?: boolean | undefined
      readonly exclusiveMaximum?: boolean | undefined
    }) => Annotations.Filter)
    | undefined
  readonly formatter?: Formatter<T> | undefined
}) {
  const greaterThanOrEqualTo = Order.isGreaterThanOrEqualTo(deriveOptions.order)
  const greaterThan = Order.isGreaterThan(deriveOptions.order)
  const lessThanOrEqualTo = Order.isLessThanOrEqualTo(deriveOptions.order)
  const lessThan = Order.isLessThan(deriveOptions.order)
  const formatter = deriveOptions.formatter ?? format
  return (options: {
    readonly minimum: T
    readonly maximum: T
    readonly exclusiveMinimum?: boolean | undefined
    readonly exclusiveMaximum?: boolean | undefined
  }, annotations?: Annotations.Filter) => {
    const gte = options.exclusiveMinimum ? greaterThan : greaterThanOrEqualTo
    const lte = options.exclusiveMaximum ? lessThan : lessThanOrEqualTo
    return makeFilter<T>(
      (input) => gte(input, options.minimum) && lte(input, options.maximum),
      {
        expected: `a value between ${formatter(options.minimum)}${options.exclusiveMinimum ? " (excluded)" : ""} and ${
          formatter(options.maximum)
        }${options.exclusiveMaximum ? " (excluded)" : ""}`,
        arbitraryConstraint: {
          order: deriveOptions.order,
          minimum: options.minimum,
          maximum: options.maximum,
          ...(options.exclusiveMinimum && { exclusiveMinimum: true }),
          ...(options.exclusiveMaximum && { exclusiveMaximum: true })
        },
        ...deriveOptions.annotate?.(options),
        ...annotations
      }
    )
  }
}
/**
 * Creates a divisibility check for any numeric type from a remainder function
 * and a zero value.
 *
 * @category validation
 * @since 4.0.0
 */
export function makeIsMultipleOf<T>(options: {
  readonly remainder: (input: T, divisor: T) => T
  readonly zero: NoInfer<T>
  readonly annotate?: ((divisor: T) => Annotations.Filter) | undefined
  readonly formatter?: Formatter<T> | undefined
}) {
  return (divisor: T, annotations?: Annotations.Filter) => {
    const formatter = options.formatter ?? format
    return makeFilter<T>(
      (input) => options.remainder(input, divisor) === options.zero,
      {
        expected: `a value that is a multiple of ${formatter(divisor)}`,
        ...options.annotate?.(divisor),
        ...annotations
      }
    )
  }
}

function encodeNumberPayload(number: number): number {
  if (!globalThis.Number.isFinite(number)) {
    throw new globalThis.RangeError(`Expected a finite number, got ${format(number)}`)
  }
  return number
}
/**
 * Validates that a number is greater than the specified value (exclusive).
 *
 * **Details**
 *
 * JSON Schema:
 *
 * This check corresponds to the `exclusiveMinimum` constraint in JSON Schema.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies an
 * `exclusiveMinimum` constraint to ensure generated numbers are greater than
 * the specified value.
 *
 * @category validation
 * @since 4.0.0
 */
export const isGreaterThan: (exclusiveMinimum: number, annotations?: Annotations.Filter) => SchemaAST.Filter<number> =
  makeIsGreaterThan({
    order: Order.Number,
    annotate: (exclusiveMinimum) => ({
      representation: {
        id: "effect/schema/isGreaterThan",
        payload: { exclusiveMinimum: encodeNumberPayload(exclusiveMinimum) }
      },
      toJsonSchema: () => ({ exclusiveMinimum }),
      toCode: () => ({ runtime: `Schema.isGreaterThan(${format(exclusiveMinimum)})` })
    })
  })
/**
 * Validates that a number is greater than or equal to the specified value
 * (inclusive).
 *
 * **Details**
 *
 * JSON Schema:
 *
 * This check corresponds to the `minimum` constraint in JSON Schema.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies a `minimum` constraint
 * to ensure generated numbers are greater than or equal to the specified value.
 *
 * @category validation
 * @since 4.0.0
 */
export const isGreaterThanOrEqualTo: (minimum: number, annotations?: Annotations.Filter) => SchemaAST.Filter<number> =
  makeIsGreaterThanOrEqualTo({
    order: Order.Number,
    annotate: (minimum) => ({
      representation: {
        id: "effect/schema/isGreaterThanOrEqualTo",
        payload: { minimum: encodeNumberPayload(minimum) }
      },
      toJsonSchema: () => ({ minimum }),
      toCode: () => ({ runtime: `Schema.isGreaterThanOrEqualTo(${format(minimum)})` })
    })
  })
/**
 * Validates that a number is less than the specified value (exclusive).
 *
 * **Details**
 *
 * JSON Schema:
 *
 * This check corresponds to the `exclusiveMaximum` constraint in JSON Schema.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies an
 * `exclusiveMaximum` constraint to ensure generated numbers are less than the
 * specified value.
 *
 * @category validation
 * @since 4.0.0
 */
export const isLessThan: (exclusiveMaximum: number, annotations?: Annotations.Filter) => SchemaAST.Filter<number> =
  makeIsLessThan({
    order: Order.Number,
    annotate: (exclusiveMaximum) => ({
      representation: {
        id: "effect/schema/isLessThan",
        payload: { exclusiveMaximum: encodeNumberPayload(exclusiveMaximum) }
      },
      toJsonSchema: () => ({ exclusiveMaximum }),
      toCode: () => ({ runtime: `Schema.isLessThan(${format(exclusiveMaximum)})` })
    })
  })
/**
 * Validates that a number is less than or equal to the specified value
 * (inclusive).
 *
 * **Details**
 *
 * JSON Schema:
 *
 * This check corresponds to the `maximum` constraint in JSON Schema.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies a `maximum` constraint
 * to ensure generated numbers are less than or equal to the specified value.
 *
 * @category validation
 * @since 4.0.0
 */
export const isLessThanOrEqualTo: (maximum: number, annotations?: Annotations.Filter) => SchemaAST.Filter<number> =
  makeIsLessThanOrEqualTo({
    order: Order.Number,
    annotate: (maximum) => ({
      representation: {
        id: "effect/schema/isLessThanOrEqualTo",
        payload: { maximum: encodeNumberPayload(maximum) }
      },
      toJsonSchema: () => ({ maximum }),
      toCode: () => ({ runtime: `Schema.isLessThanOrEqualTo(${format(maximum)})` })
    })
  })
/**
 * Validates that a number is within a specified range. The range boundaries can
 * be inclusive or exclusive based on the provided options.
 *
 * **Details**
 *
 * JSON Schema:
 *
 * This check corresponds to `minimum`/`maximum` or `exclusiveMinimum`/`exclusiveMaximum`
 * constraints in JSON Schema, depending on the options provided.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies `minimum` and
 * `maximum` constraints with optional `exclusiveMinimum` and
 * `exclusiveMaximum` flags to ensure generated numbers fall within the
 * specified range.
 *
 * @category validation
 * @since 4.0.0
 */
export const isBetween: (options: {
  readonly minimum: number
  readonly maximum: number
  readonly exclusiveMinimum?: boolean | undefined
  readonly exclusiveMaximum?: boolean | undefined
}, annotations?: Annotations.Filter) => SchemaAST.Filter<number> = makeIsBetween({
  order: Order.Number,
  annotate: (options) => {
    const exclusiveMinimum = options.exclusiveMinimum ? true : undefined
    const exclusiveMaximum = options.exclusiveMaximum ? true : undefined
    const payload = {
      minimum: encodeNumberPayload(options.minimum),
      maximum: encodeNumberPayload(options.maximum),
      ...(exclusiveMinimum && { exclusiveMinimum }),
      ...(exclusiveMaximum && { exclusiveMaximum })
    }
    return {
      representation: {
        id: "effect/schema/isBetween",
        payload
      },
      toJsonSchema: () => ({
        [exclusiveMinimum ? "exclusiveMinimum" : "minimum"]: options.minimum,
        [exclusiveMaximum ? "exclusiveMaximum" : "maximum"]: options.maximum
      }),
      toCode: () => ({
        runtime: `Schema.isBetween({ minimum: ${format(options.minimum)}, maximum: ${
          format(options.maximum)
        }, exclusiveMinimum: ${format(exclusiveMinimum)}, exclusiveMaximum: ${format(exclusiveMaximum)} })`
      })
    }
  }
})
/**
 * Validates that a number is a multiple of the specified divisor.
 *
 * **Details**
 *
 * JSON Schema:
 *
 * This check corresponds to the `multipleOf` constraint in JSON Schema.
 * Negative divisors are normalized to their absolute value because JSON
 * Schema requires `multipleOf` to be positive.
 *
 * **Gotchas**
 *
 * Throws a `RangeError` when `divisor` is zero or is not finite.
 *
 * @category validation
 * @since 4.0.0
 */
export function isMultipleOf(
  divisor: number,
  annotations?: Annotations.Filter
): SchemaAST.Filter<number> {
  if (!globalThis.Number.isFinite(divisor) || divisor === 0) {
    throw new globalThis.RangeError(`Expected a finite non-zero number, got ${globalThis.String(divisor)}`)
  }
  divisor = globalThis.Math.abs(divisor)
  return makeFilter(
    (input: number) => remainder(input, divisor) === 0,
    {
      expected: `a value that is a multiple of ${divisor}`,
      representation: {
        id: "effect/schema/isMultipleOf",
        payload: { divisor }
      },
      toJsonSchema: () => ({ multipleOf: divisor }),
      toCode: () => ({ runtime: `Schema.isMultipleOf(${format(divisor)})` }),
      ...annotations
    }
  )
}
/**
 * Validates that a number is a safe integer (within the safe integer range
 * that can be exactly represented in JavaScript).
 *
 * **Details**
 *
 * JSON Schema:
 *
 * This check corresponds to the `type: "integer"` constraint in JSON Schema.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies an integer constraint.
 *
 * @category validation
 * @since 4.0.0
 */
export function isInt(annotations?: Annotations.Filter) {
  return makeFilter(
    (n: number) => globalThis.Number.isSafeInteger(n),
    {
      expected: "an integer",
      representation: {
        id: "effect/schema/isInt",
        payload: null
      },
      toJsonSchema: () => [{ type: "integer" }, true],
      toCode: () => ({ runtime: "Schema.isInt()" }),
      arbitraryConstraint: {
        number: "integer"
      },
      ...annotations
    }
  )
}
/**
 * Type-level representation of {@link Int}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Int extends Number {
  readonly "Rebuild": Int
}
/**
 * Schema for integers, rejecting `NaN`, `Infinity`, and `-Infinity`.
 *
 * @category schemas
 * @since 3.10.0
 */
export const Int: Int = Number.check(isInt())
/**
 * Type-level representation of {@link Natural}.
 *
 * @category models
 * @since 4.0.0
 */
export interface Natural extends Int {
  readonly "Rebuild": Natural
}
/**
 * Schema for non-negative safe integers, including zero.
 *
 * **When to use**
 *
 * Use when you need a count, index, or size that cannot be negative.
 *
 * @see {@link Int} for safe integers that may be negative
 *
 * @category schemas
 * @since 4.0.0
 */
export const Natural: Natural = Int.check(isGreaterThanOrEqualTo(0))
/**
 * Validates that a number is a 32-bit signed integer (range: -2,147,483,648 to
 * 2,147,483,647).
 *
 * **Details**
 *
 * JSON Schema:
 *
 * This check corresponds to the `format: "int32"` constraint in OpenAPI 3.1,
 * or `minimum`/`maximum` constraints in other JSON Schema targets.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies integer and range
 * constraints to ensure generated numbers are 32-bit signed integers.
 *
 * @category validation
 * @since 4.0.0
 */
export function isInt32(annotations?: Annotations.Filter) {
  return new SchemaAST.FilterGroup(
    [
      isInt(),
      isBetween({ minimum: -2147483648, maximum: 2147483647 })
    ],
    {
      expected: "a 32-bit integer",
      ...annotations
    }
  )
}
/**
 * Validates that a number is a 32-bit unsigned integer (range: 0 to
 * 4,294,967,295).
 *
 * **Details**
 *
 * JSON Schema:
 *
 * This check corresponds to the `format: "uint32"` constraint in OpenAPI 3.1,
 * or `minimum`/`maximum` constraints in other JSON Schema targets.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies integer and range
 * constraints to ensure generated numbers are 32-bit unsigned integers.
 *
 * @category validation
 * @since 4.0.0
 */
export function isUint32(annotations?: Annotations.Filter) {
  return new SchemaAST.FilterGroup(
    [
      isInt(),
      isBetween({ minimum: 0, maximum: 4294967295 })
    ],
    {
      expected: "a 32-bit unsigned integer",
      ...annotations
    }
  )
}

function encodeDatePayload(date: globalThis.Date): string {
  if (globalThis.Number.isNaN(date.getTime())) {
    throw new globalThis.RangeError(`Expected a valid Date, got ${format(date)}`)
  }
  return date.toISOString()
}

function formatDateRuntime(date: globalThis.Date): string {
  return `new Date(${format(date.getTime())})`
}
/**
 * Validates that a Date is greater than the specified value (exclusive).
 *
 * **Details**
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies an exclusive lower bound.
 *
 * @category validation
 * @since 4.0.0
 */
export const isGreaterThanDate: (
  exclusiveMinimum: globalThis.Date,
  annotations?: Annotations.Filter
) => SchemaAST.Filter<globalThis.Date> = makeIsGreaterThan({
  order: Order.Date,
  annotate: (exclusiveMinimum) => {
    const encoded = encodeDatePayload(exclusiveMinimum)
    return {
      representation: {
        id: "effect/schema/isGreaterThanDate",
        payload: { exclusiveMinimum: encoded }
      },
      toJsonSchema: () => [{}, true],
      toCode: () => ({ runtime: `Schema.isGreaterThanDate(${formatDateRuntime(exclusiveMinimum)})` })
    }
  }
})
/**
 * Validates that a Date is greater than or equal to the specified date
 * (inclusive).
 *
 * **Details**
 *
 * JSON Schema:
 *
 * This check does not have a direct JSON Schema equivalent, as JSON Schema
 * validates date strings, not Date objects.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies an inclusive lower bound.
 *
 * @category validation
 * @since 4.0.0
 */
export const isGreaterThanOrEqualToDate: (
  minimum: globalThis.Date,
  annotations?: Annotations.Filter
) => SchemaAST.Filter<globalThis.Date> = makeIsGreaterThanOrEqualTo({
  order: Order.Date,
  annotate: (minimum) => {
    const encoded = encodeDatePayload(minimum)
    return {
      representation: {
        id: "effect/schema/isGreaterThanOrEqualToDate",
        payload: { minimum: encoded }
      },
      toJsonSchema: () => [{}, true],
      toCode: () => ({ runtime: `Schema.isGreaterThanOrEqualToDate(${formatDateRuntime(minimum)})` })
    }
  }
})
/**
 * Validates that a Date is less than the specified value (exclusive).
 *
 * **Details**
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies an exclusive upper bound.
 *
 * @category validation
 * @since 4.0.0
 */
export const isLessThanDate: (
  exclusiveMaximum: globalThis.Date,
  annotations?: Annotations.Filter
) => SchemaAST.Filter<globalThis.Date> = makeIsLessThan({
  order: Order.Date,
  annotate: (exclusiveMaximum) => {
    const encoded = encodeDatePayload(exclusiveMaximum)
    return {
      representation: {
        id: "effect/schema/isLessThanDate",
        payload: { exclusiveMaximum: encoded }
      },
      toJsonSchema: () => [{}, true],
      toCode: () => ({ runtime: `Schema.isLessThanDate(${formatDateRuntime(exclusiveMaximum)})` })
    }
  }
})
/**
 * Validates that a Date is less than or equal to the specified date
 * (inclusive).
 *
 * **Details**
 *
 * JSON Schema:
 *
 * This check does not have a direct JSON Schema equivalent, as JSON Schema
 * validates date strings, not Date objects.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies an inclusive upper bound.
 *
 * @category validation
 * @since 4.0.0
 */
export const isLessThanOrEqualToDate: (
  maximum: globalThis.Date,
  annotations?: Annotations.Filter
) => SchemaAST.Filter<globalThis.Date> = makeIsLessThanOrEqualTo({
  order: Order.Date,
  annotate: (maximum) => {
    const encoded = encodeDatePayload(maximum)
    return {
      representation: {
        id: "effect/schema/isLessThanOrEqualToDate",
        payload: { maximum: encoded }
      },
      toJsonSchema: () => [{}, true],
      toCode: () => ({ runtime: `Schema.isLessThanOrEqualToDate(${formatDateRuntime(maximum)})` })
    }
  }
})
/**
 * Validates that a Date is within a specified range. The range boundaries can
 * be inclusive or exclusive based on the provided options.
 *
 * **Details**
 *
 * JSON Schema:
 *
 * This check does not have a direct JSON Schema equivalent, as JSON Schema
 * validates date strings, not Date objects.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies the specified lower and upper bounds.
 *
 * @category validation
 * @since 4.0.0
 */
export const isBetweenDate: (options: {
  readonly minimum: globalThis.Date
  readonly maximum: globalThis.Date
  readonly exclusiveMinimum?: boolean | undefined
  readonly exclusiveMaximum?: boolean | undefined
}, annotations?: Annotations.Filter) => SchemaAST.Filter<globalThis.Date> = makeIsBetween({
  order: Order.Date,
  annotate: (options) => {
    const exclusiveMinimum = options.exclusiveMinimum ? true : undefined
    const exclusiveMaximum = options.exclusiveMaximum ? true : undefined
    const payload = {
      minimum: encodeDatePayload(options.minimum),
      maximum: encodeDatePayload(options.maximum),
      ...(exclusiveMinimum && { exclusiveMinimum }),
      ...(exclusiveMaximum && { exclusiveMaximum })
    }
    return {
      representation: {
        id: "effect/schema/isBetweenDate",
        payload
      },
      toJsonSchema: () => [{}, true],
      toCode: () => ({
        runtime: `Schema.isBetweenDate({ minimum: ${formatDateRuntime(options.minimum)}, maximum: ${
          formatDateRuntime(options.maximum)
        }, exclusiveMinimum: ${format(exclusiveMinimum)}, exclusiveMaximum: ${format(exclusiveMaximum)} })`
      })
    }
  }
})
/**
 * Validates that a BigInt is greater than the specified value (exclusive).
 *
 * **Details**
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies an exclusive lower bound.
 *
 * @category validation
 * @since 4.0.0
 */
export const isGreaterThanBigInt: (
  exclusiveMinimum: bigint,
  annotations?: Annotations.Filter
) => SchemaAST.Filter<bigint> = makeIsGreaterThan({
  order: Order.BigInt,
  annotate: (exclusiveMinimum) => {
    const encoded = exclusiveMinimum.toString(10)
    return {
      representation: {
        id: "effect/schema/isGreaterThanBigInt",
        payload: { exclusiveMinimum: encoded }
      },
      toJsonSchema: () => [{}, true],
      toCode: () => ({ runtime: `Schema.isGreaterThanBigInt(${format(exclusiveMinimum)})` })
    }
  }
})
/**
 * Validates that a BigInt is greater than or equal to the specified value
 * (inclusive).
 *
 * **Details**
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies an inclusive lower bound.
 *
 * @category validation
 * @since 4.0.0
 */
export const isGreaterThanOrEqualToBigInt: (
  minimum: bigint,
  annotations?: Annotations.Filter
) => SchemaAST.Filter<bigint> = makeIsGreaterThanOrEqualTo({
  order: Order.BigInt,
  annotate: (minimum) => {
    const encoded = minimum.toString(10)
    return {
      representation: {
        id: "effect/schema/isGreaterThanOrEqualToBigInt",
        payload: { minimum: encoded }
      },
      toJsonSchema: () => [{}, true],
      toCode: () => ({ runtime: `Schema.isGreaterThanOrEqualToBigInt(${format(minimum)})` })
    }
  }
})
/**
 * Validates that a BigInt is less than the specified value (exclusive).
 *
 * **Details**
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies an exclusive upper bound.
 *
 * @category validation
 * @since 4.0.0
 */
export const isLessThanBigInt: (
  exclusiveMaximum: bigint,
  annotations?: Annotations.Filter
) => SchemaAST.Filter<bigint> = makeIsLessThan({
  order: Order.BigInt,
  annotate: (exclusiveMaximum) => {
    const encoded = exclusiveMaximum.toString(10)
    return {
      representation: {
        id: "effect/schema/isLessThanBigInt",
        payload: { exclusiveMaximum: encoded }
      },
      toJsonSchema: () => [{}, true],
      toCode: () => ({ runtime: `Schema.isLessThanBigInt(${format(exclusiveMaximum)})` })
    }
  }
})
/**
 * Validates that a BigInt is less than or equal to the specified value
 * (inclusive).
 *
 * **Details**
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies an inclusive upper bound.
 *
 * @category validation
 * @since 4.0.0
 */
export const isLessThanOrEqualToBigInt: (
  maximum: bigint,
  annotations?: Annotations.Filter
) => SchemaAST.Filter<bigint> = makeIsLessThanOrEqualTo({
  order: Order.BigInt,
  annotate: (maximum) => {
    const encoded = maximum.toString(10)
    return {
      representation: {
        id: "effect/schema/isLessThanOrEqualToBigInt",
        payload: { maximum: encoded }
      },
      toJsonSchema: () => [{}, true],
      toCode: () => ({ runtime: `Schema.isLessThanOrEqualToBigInt(${format(maximum)})` })
    }
  }
})
/**
 * Validates that a BigInt is within a specified range. The range boundaries can
 * be inclusive or exclusive based on the provided options.
 *
 * **Details**
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies the specified lower and upper bounds.
 *
 * @category validation
 * @since 4.0.0
 */
export const isBetweenBigInt: (options: {
  readonly minimum: bigint
  readonly maximum: bigint
  readonly exclusiveMinimum?: boolean | undefined
  readonly exclusiveMaximum?: boolean | undefined
}, annotations?: Annotations.Filter) => SchemaAST.Filter<bigint> = makeIsBetween({
  order: Order.BigInt,
  annotate: (options) => {
    const exclusiveMinimum = options.exclusiveMinimum ? true : undefined
    const exclusiveMaximum = options.exclusiveMaximum ? true : undefined
    const payload = {
      minimum: options.minimum.toString(10),
      maximum: options.maximum.toString(10),
      ...(exclusiveMinimum && { exclusiveMinimum }),
      ...(exclusiveMaximum && { exclusiveMaximum })
    }
    return {
      representation: {
        id: "effect/schema/isBetweenBigInt",
        payload
      },
      toJsonSchema: () => [{}, true],
      toCode: () => ({
        runtime: `Schema.isBetweenBigInt({ minimum: ${format(options.minimum)}, maximum: ${
          format(options.maximum)
        }, exclusiveMinimum: ${format(exclusiveMinimum)}, exclusiveMaximum: ${format(exclusiveMaximum)} })`
      })
    }
  }
})

/**
 * Validates that a value has at least the specified length. Works with strings
 * and arrays.
 *
 * **Details**
 *
 * JSON Schema:
 *
 * The bound must be finite; it is rounded down and clamped to zero. For arrays,
 * this check corresponds to `minItems`. JavaScript counts UTF-16 code units
 * while JSON Schema counts Unicode code points, so strings use
 * `minLength: Math.ceil(minLength / 2)`, the tightest lower bound that cannot
 * reject a string accepted by this check.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies a `minLength`
 * constraint to ensure generated strings or arrays have at least the required
 * length.
 *
 * **Example** (Checking minimum length)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const NonEmptyStringSchema = Schema.String.check(Schema.isMinLength(1))
 * const NonEmptyArraySchema = Schema.Array(Schema.Number).check(Schema.isMinLength(1))
 * Schema.is(NonEmptyStringSchema)("a") // => true
 * Schema.is(NonEmptyArraySchema)([1]) // => true
 * ```
 *
 * @category validation
 * @since 4.0.0
 */
export function isMinLength(minLength: number, annotations?: Annotations.Filter) {
  minLength = normalizeCardinality(minLength)
  return makeIsMinLength(minLength, Math.ceil(minLength / 2), annotations)
}

function makeIsMinLength(minLength: number, minCodePoints: number, annotations?: Annotations.Filter) {
  return makeFilter<{ readonly length: number }>(
    (input) => input.length >= minLength,
    {
      expected: `a value with a length of at least ${minLength}`,
      representation: {
        id: "effect/schema/isMinLength",
        payload: { minLength }
      },
      toJsonSchema: ({ type }) =>
        type === "string"
          ? minLength <= 1
            ? { minLength: minCodePoints }
            : [{ minLength: minCodePoints }, true]
          : type === "array"
          ? { minItems: minLength }
          : type === undefined
          ? [{ minLength: minCodePoints, minItems: minLength }, true]
          : [{}, true],
      toCode: () => ({ runtime: `Schema.isMinLength(${minLength})` }),
      [InternalAnnotations.STRUCTURAL_ANNOTATION_KEY]: true,
      arbitraryConstraint: {
        minLength
      },
      ...annotations
    }
  )
}
/**
 * Validates that a value has at least one element. Works with strings and arrays.
 * This is equivalent to `isMinLength(1)`.
 *
 * **Details**
 *
 * JSON Schema:
 *
 * This check corresponds to the `minLength: 1` constraint for strings or the
 * `minItems: 1` constraint for arrays in JSON Schema.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies a `minLength: 1`
 * constraint to ensure generated strings or arrays are non-empty.
 *
 * @category validation
 * @since 4.0.0
 */
export function isNonEmpty(annotations?: Annotations.Filter) {
  return makeIsMinLength(1, 1, annotations)
}
/**
 * Validates that a value has at most the specified length. Works with strings
 * and arrays.
 *
 * **Details**
 *
 * JSON Schema:
 *
 * The bound must be finite; it is rounded down and clamped to zero. This check
 * corresponds to `maxItems` for arrays. Strings use the same bound for
 * `maxLength`, which cannot reject a string accepted by this check because a
 * string has no more code points than UTF-16 code units.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies a `maxLength`
 * constraint to ensure generated strings or arrays have at most the required
 * length.
 *
 * @category validation
 * @since 4.0.0
 */
export function isMaxLength(maxLength: number, annotations?: Annotations.Filter) {
  maxLength = normalizeCardinality(maxLength)
  return makeFilter<{ readonly length: number }>(
    (input) => input.length <= maxLength,
    {
      expected: `a value with a length of at most ${maxLength}`,
      representation: {
        id: "effect/schema/isMaxLength",
        payload: { maxLength }
      },
      toJsonSchema: ({ type }) =>
        type === "string"
          ? maxLength === 0 ? { maxLength } : [{ maxLength }, true]
          : type === "array"
          ? { maxItems: maxLength }
          : type === undefined
          ? [{ maxLength, maxItems: maxLength }, true]
          : [{}, true],
      toCode: () => ({ runtime: `Schema.isMaxLength(${maxLength})` }),
      [InternalAnnotations.STRUCTURAL_ANNOTATION_KEY]: true,
      arbitraryConstraint: {
        maxLength
      },
      ...annotations
    }
  )
}
/**
 * Validates that a value's length is within the specified range. Works with
 * strings and arrays.
 *
 * **Details**
 *
 * JSON Schema:
 *
 * Both bounds must be finite; they are rounded down and clamped to zero. Arrays
 * use the same bounds for `minItems` and `maxItems`. JavaScript counts UTF-16
 * code units while JSON Schema counts Unicode code points, so strings use
 * `Math.ceil(minimum / 2)` for `minLength` and `maximum` for `maxLength`. These
 * are the tightest bounds that cannot reject a string accepted by this check.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies `minLength` and
 * `maxLength` constraints to ensure generated strings or arrays have a length
 * within the specified range.
 *
 * @category validation
 * @since 4.0.0
 */
export function isBetweenLength(minimum: number, maximum: number, annotations?: Annotations.Filter) {
  minimum = normalizeCardinality(minimum)
  maximum = normalizeCardinality(maximum)
  return makeFilter<{ readonly length: number }>(
    (input) => input.length >= minimum && input.length <= maximum,
    {
      expected: minimum === maximum
        ? `a value with a length of ${minimum}`
        : `a value with a length between ${minimum} and ${maximum}`,

      representation: {
        id: "effect/schema/isBetweenLength",
        payload: { minimum, maximum }
      },
      toJsonSchema: ({ type }) =>
        type === "string"
          ? maximum === 0 || Math.ceil(minimum / 2) > maximum
            ? { minLength: Math.ceil(minimum / 2), maxLength: maximum }
            : [{ minLength: Math.ceil(minimum / 2), maxLength: maximum }, true]
          : type === "array"
          ? { minItems: minimum, maxItems: maximum }
          : type === undefined
          ? [{
            minLength: Math.ceil(minimum / 2),
            maxLength: maximum,
            minItems: minimum,
            maxItems: maximum
          }, true]
          : [{}, true],
      toCode: () => ({ runtime: `Schema.isBetweenLength(${minimum}, ${maximum})` }),
      [InternalAnnotations.STRUCTURAL_ANNOTATION_KEY]: true,
      arbitraryConstraint: {
        minLength: minimum,
        maxLength: maximum
      },
      ...annotations
    }
  )
}
/**
 * Validates that a string contains at least the specified number of Unicode code points.
 *
 * **Details**
 *
 * The bound must be finite; it is rounded down and clamped to zero. This check
 * corresponds to `minLength` in JSON Schema and guides arbitrary generation by
 * code point count.
 *
 * **Gotchas**
 *
 * Code points are not grapheme clusters: combining marks and joined emoji can
 * contribute multiple code points to one visible character. Unpaired UTF-16
 * surrogates count as one code point each. This check does not normalize strings.
 *
 * @see {@link isMinLength} for counting UTF-16 code units
 * @see {@link isMaxCodePoints}
 * @see {@link isBetweenCodePoints}
 * @category validation
 * @since 4.0.0
 */
export function isMinCodePoints(minCodePoints: number, annotations?: Annotations.Filter) {
  minCodePoints = normalizeCardinality(minCodePoints)
  return makeFilter<string>(
    (input) => countCodePointsUpTo(input, minCodePoints) >= minCodePoints,
    {
      expected: `a string with at least ${minCodePoints} code points`,
      representation: {
        id: "effect/schema/isMinCodePoints",
        payload: { minCodePoints }
      },
      toJsonSchema: () => ({ minLength: minCodePoints }),
      toCode: () => ({ runtime: `Schema.isMinCodePoints(${minCodePoints})` }),
      arbitraryConstraint: { minCodePoints },
      ...annotations
    }
  )
}
/**
 * Validates that a string contains at most the specified number of Unicode code points.
 *
 * **Details**
 *
 * The bound must be finite; it is rounded down and clamped to zero. This check
 * corresponds to `maxLength` in JSON Schema and guides arbitrary generation by
 * code point count.
 *
 * **Gotchas**
 *
 * Code points are not grapheme clusters: combining marks and joined emoji can
 * contribute multiple code points to one visible character. Unpaired UTF-16
 * surrogates count as one code point each. This check does not normalize strings.
 *
 * @see {@link isMaxLength} for counting UTF-16 code units
 * @see {@link isMinCodePoints}
 * @see {@link isBetweenCodePoints}
 * @category validation
 * @since 4.0.0
 */
export function isMaxCodePoints(maxCodePoints: number, annotations?: Annotations.Filter) {
  maxCodePoints = normalizeCardinality(maxCodePoints)
  return makeFilter<string>(
    (input) => countCodePointsUpTo(input, maxCodePoints + 1) <= maxCodePoints,
    {
      expected: `a string with at most ${maxCodePoints} code points`,
      representation: {
        id: "effect/schema/isMaxCodePoints",
        payload: { maxCodePoints }
      },
      toJsonSchema: () => ({ maxLength: maxCodePoints }),
      toCode: () => ({ runtime: `Schema.isMaxCodePoints(${maxCodePoints})` }),
      arbitraryConstraint: { maxCodePoints },
      ...annotations
    }
  )
}
/**
 * Validates that a string's Unicode code point count is within the specified inclusive range.
 *
 * **Details**
 *
 * Bounds must be finite; they are rounded down and clamped to zero. Equal bounds
 * require an exact count. This check corresponds to `minLength` and `maxLength`
 * in JSON Schema and guides arbitrary generation by code point count.
 *
 * **Gotchas**
 *
 * Code points are not grapheme clusters: combining marks and joined emoji can
 * contribute multiple code points to one visible character. Unpaired UTF-16
 * surrogates count as one code point each. This check does not normalize strings.
 *
 * @see {@link isBetweenLength} for counting UTF-16 code units
 * @see {@link isMinCodePoints}
 * @see {@link isMaxCodePoints}
 * @category validation
 * @since 4.0.0
 */
export function isBetweenCodePoints(minimum: number, maximum: number, annotations?: Annotations.Filter) {
  minimum = normalizeCardinality(minimum)
  maximum = normalizeCardinality(maximum)
  return makeFilter<string>(
    (input) => {
      const count = countCodePointsUpTo(input, maximum + 1)
      return count >= minimum && count <= maximum
    },
    {
      expected: minimum === maximum
        ? `a string with ${minimum} code points`
        : `a string with between ${minimum} and ${maximum} code points`,
      representation: {
        id: "effect/schema/isBetweenCodePoints",
        payload: { minimum, maximum }
      },
      toJsonSchema: () => ({ allOf: [{ minLength: minimum }, { maxLength: maximum }] }),
      toCode: () => ({ runtime: `Schema.isBetweenCodePoints(${minimum}, ${maximum})` }),
      arbitraryConstraint: { minCodePoints: minimum, maxCodePoints: maximum },
      ...annotations
    }
  )
}

function countCodePointsUpTo(input: string, limit: number): number {
  if (limit === 0) return 0
  let count = 0
  for (const _ of input) {
    if (++count >= limit) break
  }
  return count
}

function normalizeCardinality(value: number): number {
  if (!globalThis.Number.isFinite(value)) {
    throw new globalThis.RangeError(`Expected a finite number, got ${value}`)
  }
  return Math.max(0, Math.floor(value))
}

/**
 * Validates that a value has at least the specified size. Works with values
 * that have a `size` property, such as `Set` or `Map`.
 *
 * **Details**
 *
 * The bound must be finite; it is rounded down and clamped to zero.
 *
 * JSON Schema:
 *
 * This check does not have a direct JSON Schema equivalent, as it applies to
 * values with a `size` property rather than standard JSON Schema types.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies a node-local `minSize` constraint.
 *
 * @category validation
 * @since 4.0.0
 */
export function isMinSize(minSize: number, annotations?: Annotations.Filter) {
  minSize = normalizeCardinality(minSize)
  return makeFilter<{ readonly size: number }>(
    (input) => input.size >= minSize,
    {
      expected: `a value with a size of at least ${minSize}`,
      representation: {
        id: "effect/schema/isMinSize",
        payload: { minSize }
      },
      toJsonSchema: () => [{}, true],
      toCode: () => ({ runtime: `Schema.isMinSize(${minSize})` }),
      [InternalAnnotations.STRUCTURAL_ANNOTATION_KEY]: true,
      arbitraryConstraint: {
        minSize
      },
      ...annotations
    }
  )
}
/**
 * Validates that a value has at most the specified size. Works with values
 * that have a `size` property, such as `Set` or `Map`.
 *
 * **Details**
 *
 * The bound must be finite; it is rounded down and clamped to zero.
 *
 * JSON Schema:
 *
 * This check does not have a direct JSON Schema equivalent, as it applies to
 * values with a `size` property rather than standard JSON Schema types.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies a node-local `maxSize` constraint.
 *
 * @category validation
 * @since 4.0.0
 */
export function isMaxSize(maxSize: number, annotations?: Annotations.Filter) {
  maxSize = normalizeCardinality(maxSize)
  return makeFilter<{ readonly size: number }>(
    (input) => input.size <= maxSize,
    {
      expected: `a value with a size of at most ${maxSize}`,
      representation: {
        id: "effect/schema/isMaxSize",
        payload: { maxSize }
      },
      toJsonSchema: () => [{}, true],
      toCode: () => ({ runtime: `Schema.isMaxSize(${maxSize})` }),
      [InternalAnnotations.STRUCTURAL_ANNOTATION_KEY]: true,
      arbitraryConstraint: {
        maxSize
      },
      ...annotations
    }
  )
}
/**
 * Validates that a value's size is within the specified range. Works with
 * values that have a `size` property, such as `Set` or `Map`.
 *
 * **Details**
 *
 * Both bounds must be finite; they are rounded down and clamped to zero.
 *
 * JSON Schema:
 *
 * This check does not have a direct JSON Schema equivalent, as it applies to
 * values with a `size` property rather than standard JSON Schema types.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies node-local `minSize` and `maxSize` constraints.
 *
 * @category validation
 * @since 4.0.0
 */
export function isBetweenSize(minimum: number, maximum: number, annotations?: Annotations.Filter) {
  minimum = normalizeCardinality(minimum)
  maximum = normalizeCardinality(maximum)
  return makeFilter<{ readonly size: number }>(
    (input) => input.size >= minimum && input.size <= maximum,
    {
      expected: minimum === maximum
        ? `a value with a size of ${minimum}`
        : `a value with a size between ${minimum} and ${maximum}`,

      representation: {
        id: "effect/schema/isBetweenSize",
        payload: { minimum, maximum }
      },
      toJsonSchema: () => [{}, true],
      toCode: () => ({ runtime: `Schema.isBetweenSize(${minimum}, ${maximum})` }),
      [InternalAnnotations.STRUCTURAL_ANNOTATION_KEY]: true,
      arbitraryConstraint: {
        minSize: minimum,
        maxSize: maximum
      },
      ...annotations
    }
  )
}
/**
 * Validates that an object contains at least the specified number of
 * properties. This includes both string and symbol keys when counting
 * properties.
 *
 * **Details**
 *
 * The bound must be finite; it is rounded down and clamped to zero.
 *
 * JSON Schema:
 *
 * This check corresponds to `minProperties` in JSON Schema. Effect applies the
 * check to the decoded object, while JSON Schema applies it to the original
 * input. Defaults and property transformations can therefore produce different
 * results.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies a node-local `minProperties` constraint.
 *
 * @category validation
 * @since 4.0.0
 */
export function isMinProperties(minProperties: number, annotations?: Annotations.Filter) {
  minProperties = normalizeCardinality(minProperties)
  return makeFilter<object>(
    (input) => Reflect.ownKeys(input).length >= minProperties,
    {
      expected: `a value with at least ${minProperties === 1 ? "1 entry" : `${minProperties} entries`}`,
      representation: {
        id: "effect/schema/isMinProperties",
        payload: { minProperties }
      },
      toJsonSchema: ({ type }) => type === "object" ? { minProperties } : [{ minProperties }, true],
      toCode: () => ({ runtime: `Schema.isMinProperties(${minProperties})` }),
      [InternalAnnotations.STRUCTURAL_ANNOTATION_KEY]: true,
      arbitraryConstraint: {
        minProperties
      },
      ...annotations
    }
  )
}
/**
 * Validates that an object contains at most the specified number of properties.
 * This includes both string and symbol keys when counting properties.
 *
 * **Details**
 *
 * The bound must be finite; it is rounded down and clamped to zero.
 *
 * JSON Schema:
 *
 * This check corresponds to `maxProperties` in JSON Schema. Effect applies the
 * check to the decoded object, while JSON Schema applies it to the original
 * input. Excess-property handling and property transformations can therefore
 * produce different results.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies a node-local `maxProperties` constraint.
 *
 * @category validation
 * @since 4.0.0
 */
export function isMaxProperties(maxProperties: number, annotations?: Annotations.Filter) {
  maxProperties = normalizeCardinality(maxProperties)
  return makeFilter<object>(
    (input) => Reflect.ownKeys(input).length <= maxProperties,
    {
      expected: `a value with at most ${maxProperties === 1 ? "1 entry" : `${maxProperties} entries`}`,
      representation: {
        id: "effect/schema/isMaxProperties",
        payload: { maxProperties }
      },
      toJsonSchema: ({ type }) => type === "object" ? { maxProperties } : [{ maxProperties }, true],
      toCode: () => ({ runtime: `Schema.isMaxProperties(${maxProperties})` }),
      [InternalAnnotations.STRUCTURAL_ANNOTATION_KEY]: true,
      arbitraryConstraint: {
        maxProperties
      },
      ...annotations
    }
  )
}
/**
 * Validates that an object contains between `minimum` and `maximum` properties (inclusive).
 * This includes both string and symbol keys when counting properties.
 *
 * **Details**
 *
 * Both bounds must be finite; they are rounded down and clamped to zero.
 *
 * JSON Schema:
 *
 * This check corresponds to `minProperties` and `maxProperties` in JSON
 * Schema. Effect applies the check to the decoded object, while JSON Schema
 * applies it to the original input. Defaults, excess-property handling, and
 * property transformations can therefore produce different results.
 *
 * Arbitrary:
 *
 * During arbitrary generation, this applies node-local `minProperties` and `maxProperties` constraints.
 *
 * @category validation
 * @since 4.0.0
 */
export function isBetweenProperties(minimum: number, maximum: number, annotations?: Annotations.Filter) {
  minimum = normalizeCardinality(minimum)
  maximum = normalizeCardinality(maximum)
  return makeFilter<object>(
    (input) => Reflect.ownKeys(input).length >= minimum && Reflect.ownKeys(input).length <= maximum,
    {
      expected: minimum === maximum
        ? `a value with exactly ${minimum === 1 ? "1 entry" : `${minimum} entries`}`
        : `a value with between ${minimum} and ${maximum} entries`,

      representation: {
        id: "effect/schema/isBetweenProperties",
        payload: { minimum, maximum }
      },
      toJsonSchema: ({ type }) =>
        type === "object"
          ? { minProperties: minimum, maxProperties: maximum }
          : [{ minProperties: minimum, maxProperties: maximum }, true],
      toCode: () => ({ runtime: `Schema.isBetweenProperties(${minimum}, ${maximum})` }),
      [InternalAnnotations.STRUCTURAL_ANNOTATION_KEY]: true,
      arbitraryConstraint: {
        minProperties: minimum,
        maxProperties: maximum
      },
      ...annotations
    }
  )
}
/**
 * Validates that every own property key of an object satisfies the encoded side
 * of the provided key schema.
 *
 * **Details**
 *
 * This check uses `Reflect.ownKeys`, so symbol keys are validated in addition to
 * string property names.
 *
 * JSON Schema:
 * This check corresponds to `propertyNames` in JSON Schema. Effect checks the
 * decoded object's keys, including symbols, while JSON Schema checks the string
 * names in the original input. Property transformations and excess-property
 * handling can therefore produce different results.
 *
 * @category validation
 * @since 4.0.0
 */
export function isPropertyNames(keySchema: Constraint, annotations?: Annotations.Filter) {
  const propertyNames = toEncoded(keySchema)
  const parser = SchemaParser._issue(propertyNames.ast)
  return makeFilter<object>(
    (input, ast, options) => {
      const keys = Reflect.ownKeys(input)
      const issues: Array<SchemaIssue.Issue> = []
      for (const key of keys) {
        const issue = parser(key, options)
        if (issue !== undefined) {
          issues.push(new SchemaIssue.Pointer([key], issue))
          if (options.errors === "first") break
        }
      }
      if (Arr.isArrayNonEmpty(issues)) {
        return new SchemaIssue.Composite(ast, issues, input, options)
      }
      return true
    },
    {
      expected: "an object with property names matching the schema",
      representation: {
        id: "effect/schema/isPropertyNames",
        payload: null,
        schemas: [propertyNames.ast]
      },
      toJsonSchema: ({ schemas, type }) =>
        type === "object" ? { propertyNames: schemas[0] } : [{ propertyNames: schemas[0] }, true],
      toCode: ({ schemas }) => ({ runtime: `Schema.isPropertyNames(${schemas[0].runtime})` }),
      [InternalAnnotations.STRUCTURAL_ANNOTATION_KEY]: true,
      ...annotations
    }
  )
}
/**
 * Validates that all items in an array are unique according to Effect equality.
 *
 * **Details**
 *
 * JSON Schema:
 * This check corresponds to the `uniqueItems: true` constraint in JSON Schema.
 *
 * Arbitrary:
 * During arbitrary generation, this applies a node-local identity selector
 * for constructive uniqueness using Effect equality.
 *
 * @category validation
 * @since 4.0.0
 */
export function isUnique<T>(annotations?: Annotations.Filter) {
  return makeFilter<ReadonlyArray<T>>(
    (input) => Arr.dedupe(input).length === input.length,
    {
      expected: "an array with unique items",
      representation: {
        id: "effect/schema/isUnique",
        payload: null
      },
      toJsonSchema: () => ({ uniqueItems: true }),
      toCode: () => ({ runtime: "Schema.isUnique()" }),
      arbitraryConstraint: {
        uniqueBy: identity
      },
      ...annotations
    }
  )
}
/**
 * Validates that all first elements in an array of key-value tuples are unique according to Effect equality.
 *
 * **Details**
 *
 * Arbitrary:
 * During arbitrary generation, this projects each entry to its key for constructive uniqueness.
 *
 * JSON Schema:
 * JSON Schema has no equivalent constraint, so this check is omitted from generated documents.
 *
 * @see {@link isUnique} for validating uniqueness of complete array elements
 * @category validation
 * @since 4.0.0
 */
export function isUniqueKey<Key, Value>(annotations?: Annotations.Filter) {
  return makeFilter<ReadonlyArray<readonly [Key, Value]>>(
    (input) => Arr.dedupe(input.map(([key]) => key)).length === input.length,
    {
      expected: "an array with unique keys",
      representation: {
        id: "effect/schema/isUniqueKey",
        payload: null
      },
      toCode: () => ({ runtime: "Schema.isUniqueKey()" }),
      arbitraryConstraint: {
        uniqueBy: (entry: readonly [Key, Value]) => entry[0]
      },
      ...annotations
    }
  )
}
/**
 * Type-level representation of {@link NonEmptyString}.
 *
 * @category models
 * @since 3.10.0
 */
export interface NonEmptyString extends String {
  readonly "Rebuild": NonEmptyString
}
/**
 * Schema for non-empty strings. Validates that a string has at least one
 * character.
 *
 * @category schemas
 * @since 3.10.0
 */
export const NonEmptyString: NonEmptyString = String.check(isNonEmpty())
/**
 * Type-level representation of {@link Char}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Char extends String {
  readonly "Rebuild": Char
}
/**
 * Schema for strings whose JavaScript `length` is exactly `1`.
 *
 * **When to use**
 *
 * Use to validate string values that must have `length === 1`.
 *
 * **Gotchas**
 *
 * This schema uses JavaScript `String.length`, so visible characters made from
 * multiple UTF-16 code units do not satisfy `length === 1`.
 *
 * @see {@link String} for unconstrained string values
 * @see {@link NonEmptyString} for strings with length greater than zero
 * @see {@link isBetweenLength} for the underlying length check
 *
 * @category schemas
 * @since 3.10.0
 */
export const Char: Char = String.check(isBetweenLength(1, 1))
/**
 * Type-level representation of {@link ErrorInstance}.
 *
 * @category models
 * @since 4.0.0
 */
export interface ErrorInstance extends instanceOf<globalThis.Error> {
  readonly "Rebuild": ErrorInstance
}
/**
 * Options for {@link ErrorInstance} and {@link Defect}.
 *
 * @category options
 * @since 4.0.0
 */
export interface ErrorOptions {
  /**
   * Includes string stack traces in encoded `Error` values when set to `true`.
   *
   * @default false
   */
  readonly includeStack?: boolean | undefined
  /**
   * Excludes `Error.cause` values from encoded `Error` values when set to
   * `true`.
   *
   * @default false
   */
  readonly excludeCause?: boolean | undefined
}

type NormalizedErrorOptions =
  | { readonly includeStack: true }
  | { readonly excludeCause: true }
  | { readonly includeStack: true; readonly excludeCause: true }

type ErrorOptionsKey = 0 | 1 | 2 | 3

const getErrorOptionsKey = (options?: ErrorOptions): ErrorOptionsKey =>
  ((options?.includeStack === true ? 1 : 0) |
    (options?.excludeCause === true ? 2 : 0)) as ErrorOptionsKey

const getErrorOptions = (key: ErrorOptionsKey): NormalizedErrorOptions | undefined => {
  switch (key) {
    case 0:
      return undefined
    case 1:
      return { includeStack: true }
    case 2:
      return { excludeCause: true }
    case 3:
      return { includeStack: true, excludeCause: true }
  }
}

const errorSchemaCache: Array<ErrorInstance | undefined> = []
/**
 * Schema for JavaScript `Error` objects.
 *
 * **Details**
 *
 * Default JSON serializer:
 *
 * Encodes an `Error` as an object with `message`, optional `name`, and optional
 * `cause` properties, and decodes that object back into an `Error`. Stack
 * traces are omitted by default for security. Pass `{ includeStack: true }` to
 * include stack traces, or `{ excludeCause: true }` to omit causes.
 *
 * @category schemas
 * @since 4.0.0
 */
export function ErrorInstance(options?: ErrorOptions): ErrorInstance {
  const key = getErrorOptionsKey(options)
  const cached = errorSchemaCache[key]
  if (cached !== undefined) {
    return cached
  }
  const normalizedOptions = getErrorOptions(key)
  const schema = instanceOf(globalThis.Error, {
    representation: {
      id: "effect/schema/Error",
      payload: normalizedOptions ?? null
    },
    toCode: () => ({
      runtime: normalizedOptions !== undefined
        ? `Schema.ErrorInstance(${format(normalizedOptions)})`
        : `Schema.ErrorInstance()`,
      Type: `globalThis.Error`
    }),
    expected: "Error",
    toCodecJson: () => link<globalThis.Error>()(JsonError, SchemaTransformation.errorFromJsonError(normalizedOptions))
  })
  errorSchemaCache[key] = schema
  return schema
}
/**
 * Type-level representation of {@link Defect}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Defect extends decodeTo<Unknown, typeof Json> {
  readonly "Rebuild": Defect
}

const defectSchemaCache: Array<Defect | undefined> = []
/**
 * Schema for unexpected defect values represented as `unknown` with a JSON
 * encoded form.
 *
 * **When to use**
 *
 * Use when you need a schema for `Cause` defects or other unexpected failures
 * whose runtime value may be any value.
 *
 * **Details**
 *
 * The encoded side is {@link Json}. During decoding, JSON objects with a string
 * `message` property are decoded into JavaScript `Error` values, preserving a
 * non-default `name` and any string `stack`. Other JSON values decode
 * unchanged.
 *
 * During encoding, JavaScript `Error` values encode to JSON objects with
 * `name`, `message`, and optional `cause` properties. Pass
 * `{ includeStack: true }` to include string stack traces in encoded `Error`
 * defects, or `{ excludeCause: true }` to omit causes. Other values are
 * serialized through Effect's JSON formatter and then parsed back into JSON
 * when possible.
 *
 * **Gotchas**
 *
 * This schema is for carrying defects across JSON boundaries, not for
 * preserving every JavaScript value exactly. Some values cannot round-trip
 * unchanged:
 *
 * - A non-`Error` object such as `{ message: "boom" }` encodes as an
 *   error-shaped JSON object and decodes back as an `Error`.
 * - JSON serialization normalizes unsupported values. For example,
 *   `undefined` array elements encode as `null`, unsupported object properties
 *   are omitted, and circular references are dropped.
 * - Values that cannot be represented as JSON fall back to Effect's formatted
 *   string representation.
 *
 * @see {@link ErrorInstance} for a schema that only accepts JavaScript `Error` values.
 * @category schemas
 * @since 4.0.0
 */
export function Defect(options?: ErrorOptions): Defect {
  const key = getErrorOptionsKey(options)
  const cached = defectSchemaCache[key]
  if (cached !== undefined) {
    return cached
  }
  const schema = Json.pipe(decodeTo(Unknown, SchemaTransformation.defectFromJson(getErrorOptions(key))))
  defectSchemaCache[key] = schema
  return schema
}
/**
 * Type-level representation returned by {@link ReadonlyMap}.
 *
 * @category models
 * @since 4.0.0
 */
export interface $ReadonlyMap<Key extends Constraint, Value extends Constraint> extends
  declareConstructor<
    globalThis.ReadonlyMap<Key["Type"], Value["Type"]>,
    globalThis.ReadonlyMap<Key["Encoded"], Value["Encoded"]>,
    readonly [Key, Value],
    ReadonlyMapIso<Key, Value>
  >
{
  readonly "Rebuild": $ReadonlyMap<Key, Value>
  readonly key: Key
  readonly value: Value
}
/**
 * Iso representation used for `ReadonlyMap` schemas: an array of readonly
 * `[key, value]` tuples using each entry schema's `Iso` type.
 *
 * @category utility types
 * @since 4.0.0
 */
export type ReadonlyMapIso<Key extends Constraint, Value extends Constraint> = ReadonlyArray<
  readonly [Key["Iso"], Value["Iso"]]
>
/**
 * Schema for readonly maps whose keys and values conform to the provided
 * schemas.
 *
 * @category schemas
 * @since 3.10.0
 */
export function ReadonlyMap<Key extends Constraint, Value extends Constraint>(
  key: Key,
  value: Value
): $ReadonlyMap<Key, Value> {
  const schema = declareConstructor<
    globalThis.ReadonlyMap<Key["Type"], Value["Type"]>,
    globalThis.ReadonlyMap<Key["Encoded"], Value["Encoded"]>,
    ReadonlyMapIso<Key, Value>
  >()(
    [key, value],
    ([key, value]) => {
      const array = ArraySchema(Tuple([key, value]))
      return (input, ast, options) => {
        if (input instanceof globalThis.Map) {
          return Effect.mapBothEager(
            SchemaParser.decodeUnknownEffect(array)([...input], options),
            {
              onSuccess: (array: ReadonlyArray<readonly [Key["Type"], Value["Type"]]>) => new globalThis.Map(array),
              onFailure: (issue) => SchemaIssue.makeCompositeAtKey(ast, "entries", issue, input, options)
            }
          )
        }
        return Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
      }
    },
    {
      representation: {
        id: "effect/schema/ReadonlyMap",
        payload: null
      },
      toCode: ({ typeParameters }) => ({
        runtime: `Schema.ReadonlyMap(${typeParameters[0].runtime}, ${typeParameters[1].runtime})`,
        Type: `globalThis.ReadonlyMap<${typeParameters[0].Type}, ${typeParameters[1].Type}>`
      }),
      expected: "ReadonlyMap",
      toCodec: ([key, value]) =>
        link<globalThis.Map<Key["Encoded"], Value["Encoded"]>>()(
          ArraySchema(Tuple([key, value])),
          SchemaTransformation.transform({
            decode: (entries) => new globalThis.Map(entries),
            encode: (map) => [...map.entries()]
          })
        )
    }
  )
  return make(schema.ast, { key, value })
}
/**
 * Type-level representation returned by {@link ReadonlySet}.
 *
 * @category models
 * @since 4.0.0
 */
export interface $ReadonlySet<Value extends Constraint> extends
  declareConstructor<
    globalThis.ReadonlySet<Value["Type"]>,
    globalThis.ReadonlySet<Value["Encoded"]>,
    readonly [Value],
    ReadonlySetIso<Value>
  >
{
  readonly "Rebuild": $ReadonlySet<Value>
  readonly value: Value
}
/**
 * Iso representation used for `ReadonlySet` schemas: an array of element values
 * using the element schema's `Iso` type.
 *
 * @category utility types
 * @since 4.0.0
 */
export type ReadonlySetIso<Value extends Constraint> = ReadonlyArray<Value["Iso"]>
/**
 * Schema for readonly sets whose values conform to the provided element schema.
 *
 * @category schemas
 * @since 3.10.0
 */
export function ReadonlySet<Value extends Constraint>(value: Value): $ReadonlySet<Value> {
  const schema = declareConstructor<
    globalThis.ReadonlySet<Value["Type"]>,
    globalThis.ReadonlySet<Value["Encoded"]>,
    ReadonlySetIso<Value>
  >()(
    [value],
    ([value]) => {
      const array = ArraySchema(value)
      return (input, ast, options) => {
        if (input instanceof globalThis.Set) {
          return Effect.mapBothEager(
            SchemaParser.decodeUnknownEffect(array)([...input], options),
            {
              onSuccess: (array: ReadonlyArray<Value["Type"]>) => new globalThis.Set(array),
              onFailure: (issue) => SchemaIssue.makeCompositeAtKey(ast, "values", issue, input, options)
            }
          )
        }
        return Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
      }
    },
    {
      representation: {
        id: "effect/schema/ReadonlySet",
        payload: null
      },
      toCode: ({ typeParameters }) => ({
        runtime: `Schema.ReadonlySet(${typeParameters[0].runtime})`,
        Type: `globalThis.ReadonlySet<${typeParameters[0].Type}>`
      }),
      expected: "ReadonlySet",
      toCodec: ([value]) =>
        link<globalThis.Set<Value["Encoded"]>>()(
          ArraySchema(value),
          SchemaTransformation.transform({
            decode: (values) => new globalThis.Set(values),
            encode: (set) => [...set.values()]
          })
        )
    }
  )
  return make(schema.ast, { value })
}
/**
 * Type-level representation of {@link RegExp}.
 *
 * @category models
 * @since 4.0.0
 */
export interface RegExp extends instanceOf<globalThis.RegExp> {
  readonly "Rebuild": RegExp
}
/**
 * Schema for JavaScript `RegExp` objects.
 *
 * **Details**
 *
 * The default JSON serializer encodes a `RegExp` as `{ source, flags }`.
 *
 * @category schemas
 * @since 4.0.0
 */
export const RegExp: RegExp = instanceOf(
  globalThis.RegExp,
  {
    representation: {
      id: "effect/schema/RegExp",
      payload: null
    },
    toCode: () => ({
      runtime: `Schema.RegExp`,
      Type: `globalThis.RegExp`
    }),
    expected: "RegExp",
    toCodecJson: () =>
      link<globalThis.RegExp>()(
        Struct({
          source: String,
          flags: String
        }),
        SchemaTransformation.transformEffect({
          decode: (e, options) =>
            Effect.try({
              try: () => new globalThis.RegExp(e.source, e.flags),
              catch: () =>
                new SchemaIssue.InvalidValue(
                  { expected: "valid RegExp source and flags" },
                  e,
                  options
                )
            }),
          encode: (regExp) =>
            Effect.succeed({
              source: regExp.source,
              flags: regExp.flags
            })
        })
      )
  }
)
/**
 * Type-level representation of {@link URL}.
 *
 * @category models
 * @since 4.0.0
 */
export interface URL extends instanceOf<globalThis.URL> {
  readonly "Rebuild": URL
}

const URLString = String.annotate({ expected: "a string that will be decoded as a URL" })
/**
 * Schema for JavaScript `URL` objects.
 *
 * **Details**
 *
 * Default JSON serializer:
 *
 * - encodes `URL` as a `string`
 *
 * @category schemas
 * @since 4.0.0
 */
export const URL: URL = instanceOf(
  globalThis.URL,
  {
    representation: {
      id: "effect/schema/URL",
      payload: null
    },
    toCode: () => ({
      runtime: `Schema.URL`,
      Type: `globalThis.URL`
    }),
    expected: "URL",
    toCodecJson: () =>
      link<globalThis.URL>()(
        URLString,
        SchemaTransformation.urlFromString
      )
  }
)
/**
 * Type-level representation of {@link URLFromString}.
 *
 * @category models
 * @since 4.0.0
 */
export interface URLFromString extends decodeTo<URL, String> {
  readonly "Rebuild": URLFromString
}
/**
 * Schema that decodes a `string` into a `URL`.
 *
 * **Details**
 *
 * Decoding:
 * - A **valid** URL `string` is decoded as a `URL`
 *
 * Encoding:
 * - A `URL` is encoded as a `string`
 *
 * @category schemas
 * @since 4.0.0
 */
export const URLFromString: URLFromString = URLString.pipe(decodeTo(URL, SchemaTransformation.urlFromString))
/**
 * Type-level representation of {@link Date}.
 *
 * @category models
 * @since 4.0.0
 */
export interface Date extends declare<globalThis.Date> {
  readonly "Rebuild": Date
}

const DateString = String.annotate({ expected: "a string that will be decoded as a Date" })
/**
 * Schema for valid JavaScript `Date` objects.
 *
 * **When to use**
 *
 * Use to validate in-memory values that must already be valid JavaScript date
 * objects.
 *
 * **Details**
 *
 * This schema accepts `Date` instances whose timestamp is not `NaN`. The
 * default JSON serializer encodes dates as ISO 8601 strings.
 *
 * **Example** (Defining a Date schema)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const date = Schema.decodeUnknownSync(Schema.Date)(new Date("2024-01-01"))
 * date.toISOString() // => "2024-01-01T00:00:00.000Z"
 * ```
 *
 * @see {@link DateFromString} for decoding strings into Date instances
 * @see {@link DateFromMillis} for decoding epoch milliseconds into Date instances
 *
 * @category schemas
 * @since 4.0.0
 */
export const Date: Date = declare(
  (input): input is globalThis.Date => input instanceof globalThis.Date && !globalThis.Number.isNaN(input.getTime()),
  {
    representation: {
      id: "effect/schema/Date",
      payload: null
    },
    toCode: () => ({
      runtime: `Schema.Date`,
      Type: `globalThis.Date`
    }),
    expected: "a valid Date",
    toCodecJson: () =>
      link<globalThis.Date>()(
        DateString,
        SchemaTransformation.dateFromString
      )
  }
)
/**
 * Type-level representation of {@link DateFromString}.
 *
 * @category models
 * @since 3.10.0
 */
export interface DateFromString extends decodeTo<Date, String> {
  readonly "Rebuild": DateFromString
}
/**
 * Schema that decodes a string into a JavaScript `Date`.
 *
 * **When to use**
 *
 * Use to model string-encoded dates that decode to JavaScript `Date` objects
 * and encode back to strings.
 *
 * **Details**
 *
 * Decoding:
 * The string is passed to JavaScript `Date` construction.
 *
 * Encoding:
 * A `Date` is encoded as an ISO string.
 *
 * Invalid date strings fail decoding.
 *
 * @see {@link DateFromMillis} for decoding epoch milliseconds into Date instances
 * @see {@link DateTimeUtcFromString} for decoding date-time strings into UTC values
 * @see {@link Date} for accepting Date instances directly
 *
 * @category schemas
 * @since 3.10.0
 */
export const DateFromString: DateFromString = DateString.pipe(decodeTo(Date, SchemaTransformation.dateFromString))
/**
 * Type-level representation of {@link DateFromMillis}.
 *
 * @category models
 * @since 4.0.0
 */
export interface DateFromMillis extends decodeTo<Date, Int> {
  readonly "Rebuild": DateFromMillis
}
/**
 * Schema that decodes epoch milliseconds into a JavaScript `Date`.
 *
 * **When to use**
 *
 * Use to model numeric millisecond timestamps that decode to JavaScript `Date`
 * objects and encode back to numbers.
 *
 * **Details**
 *
 * Decoding:
 * A safe integer number of milliseconds since the Unix epoch is decoded as a
 * `Date`.
 *
 * Encoding:
 * A `Date` is encoded as its millisecond timestamp.
 *
 * **Gotchas**
 *
 * JavaScript `Date` supports a narrower range than safe integers, so integers
 * outside the supported `Date` range fail decoding.
 *
 * @see {@link DateFromString} for decoding string-encoded dates
 * @see {@link DateTimeUtcFromMillis} for decoding epoch milliseconds into UTC values
 *
 * @category schemas
 * @since 4.0.0
 */
export const DateFromMillis: DateFromMillis = Int.pipe(
  decodeTo(Date, SchemaTransformation.dateFromMillis)
)
/**
 * Type-level representation returned by {@link fromJsonString}.
 *
 * @category models
 * @since 4.0.0
 */
export interface fromJsonString<S extends Constraint> extends decodeTo<S, String> {
  readonly "Rebuild": fromJsonString<S>
}

const JsonString = String.annotate({
  expected: "a string that will be decoded as JSON",
  contentMediaType: "application/json"
})
/**
 * Returns a schema that decodes a JSON string and then decodes the parsed value
 * using the given schema.
 *
 * **Details**
 *
 * This is useful when working with JSON-encoded strings where the actual
 * structure of the value is known and described by an existing schema.
 *
 * During decoding, the resulting schema first parses the input string as JSON,
 * using `reviver` when provided, and then runs the provided schema on the
 * parsed result. During encoding, it first encodes with the provided schema and
 * then passes the result to `JSON.stringify` with the optional `replacer` and
 * `space`.
 *
 * **Example** (Formatting encoded JSON)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const schema = Schema.Struct({ a: Schema.Number })
 * const schemaFromJsonString = Schema.fromJsonString(schema, { space: 2 })
 *
 * Schema.encodeSync(schemaFromJsonString)({ a: 1 }) // => "{\n  \"a\": 1\n}"
 * ```
 *
 * @category schemas
 * @since 4.0.0
 */
export function fromJsonString<S extends Constraint>(
  schema: S,
  options?: {
    readonly reviver?: Parameters<typeof JSON.parse>[1] | undefined
    readonly replacer?: SchemaGetter.JsonReplacer | undefined
    readonly space?: Parameters<typeof JSON.stringify>[2] | undefined
  }
): fromJsonString<S> {
  return JsonString.pipe(decodeTo(schema, SchemaTransformation.fromJsonString(options)))
}
/** @internal */
export const UnknownFromJsonString: fromJsonString<Unknown> = fromJsonString(Unknown)
/**
 * Type-level representation of {@link File}.
 *
 * @category models
 * @since 4.0.0
 */
export interface File extends instanceOf<globalThis.File> {
  readonly "Rebuild": File
}
/**
 * Schema for JavaScript `File` objects.
 *
 * **Details**
 *
 * The default JSON serializer encodes a `File` as `{ data, type, name, lastModified }`
 * where `data` is base64-encoded.
 *
 * @category schemas
 * @since 4.0.0
 */
export const File: File = instanceOf(globalThis.File, {
  representation: {
    id: "effect/schema/File",
    payload: null
  },
  toCode: () => ({
    runtime: `Schema.File`,
    Type: `globalThis.File`
  }),
  expected: "File",
  toCodecJson: () =>
    link<globalThis.File>()(
      Struct({
        data: String.check(isBase64()),
        type: String,
        name: String,
        lastModified: Int
      }),
      SchemaTransformation.transformEffect({
        decode: (e, options) =>
          Result_.match(Base64.decode(e.data), {
            onFailure: () =>
              Effect.fail(
                new SchemaIssue.InvalidValue(
                  { expected: "a valid Base64 string" },
                  e.data,
                  options
                )
              ),
            onSuccess: (bytes) => {
              const buffer = new globalThis.Uint8Array(bytes)
              return Effect.succeed(
                new globalThis.File([buffer], e.name, { type: e.type, lastModified: e.lastModified })
              )
            }
          }),
        encode: (file, options) =>
          Effect.tryPromise({
            try: async () => {
              const bytes = new globalThis.Uint8Array(await file.arrayBuffer())
              return {
                data: Base64.encode(bytes),
                type: file.type,
                name: file.name,
                lastModified: file.lastModified
              }
            },
            catch: () =>
              new SchemaIssue.InvalidValue(
                { expected: "a readable File" },
                file,
                options
              )
          })
      })
    )
})
/**
 * Type-level representation of {@link FormData}.
 *
 * @category models
 * @since 4.0.0
 */
export interface FormData extends instanceOf<globalThis.FormData> {
  readonly "Rebuild": FormData
}
/**
 * Schema for JavaScript `FormData` objects.
 *
 * **Details**
 *
 * The default JSON serializer encodes a `FormData` as an array of `[key, entry]`
 * pairs where each entry is tagged as `"String"` or `"File"`.
 *
 * @category schemas
 * @since 4.0.0
 */
export const FormData: FormData = instanceOf(globalThis.FormData, {
  representation: {
    id: "effect/schema/FormData",
    payload: null
  },
  toCode: () => ({
    runtime: `Schema.FormData`,
    Type: `globalThis.FormData`
  }),
  expected: "FormData",
  toCodecJson: () =>
    link<globalThis.FormData>()(
      ArraySchema(
        Tuple([
          String,
          Union([
            Struct({ _tag: tag("String"), value: String }),
            Struct({ _tag: tag("File"), value: File })
          ])
        ])
      ),
      SchemaTransformation.transformEffect({
        decode: (e) => {
          const out = new globalThis.FormData()
          for (const [key, entry] of e) {
            out.append(key, entry.value)
          }
          return Effect.succeed(out)
        },
        encode: (formData) => {
          return Effect.succeed(
            globalThis.Array.from(formData.entries()).map(([key, value]) => {
              if (typeof value === "string") {
                return [key, { _tag: "String", value }] as const
              } else {
                return [key, { _tag: "File", value }] as const
              }
            })
          )
        }
      })
    )
})
/**
 * Type-level representation returned by {@link fromFormData}.
 *
 * @category models
 * @since 4.0.0
 */
export interface fromFormData<S extends Constraint> extends decodeTo<S, FormData> {
  readonly "Rebuild": fromFormData<S>
}
/**
 * Schema for decoding `FormData` through a bracket-notation tree.
 *
 * **When to use**
 *
 * Use to decode browser or multipart form data into a structured schema value.
 *
 * **Details**
 *
 * The decoding process has two steps:
 *
 * 1. Parse `FormData` into a nested tree record.
 * 2. Decode the parsed value with the given schema.
 *
 * You can express nested values using bracket notation.
 *
 * If you want to decode string fields into non-string primitive values, use
 * `Schema.toCodecStringTree`.
 *
 * **Example** (Decoding a flat structure)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const schema = Schema.fromFormData(
 *   Schema.Struct({
 *     a: Schema.String
 *   })
 * )
 *
 * const formData = new FormData()
 * formData.append("a", "1")
 * formData.append("b", "2")
 *
 * Schema.decodeUnknownSync(schema)(formData) // => { a: "1" }
 * ```
 *
 * **Example** (Decoding nested fields)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const schema = Schema.fromFormData(
 *   Schema.Struct({
 *     a: Schema.String,
 *     b: Schema.Struct({
 *       c: Schema.String,
 *       d: Schema.String
 *     })
 *   })
 * )
 *
 * const formData = new FormData()
 * formData.append("a", "1")
 * formData.append("b[c]", "2")
 * formData.append("b[d]", "3")
 *
 * Schema.decodeUnknownSync(schema)(formData) // => { a: "1", b: { c: "2", d: "3" } }
 * ```
 *
 * **Example** (Parsing non-string values)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const schema = Schema.fromFormData(
 *   Schema.toCodecStringTree(
 *     Schema.Struct({
 *       a: Schema.Int
 *     })
 *   )
 * )
 *
 * const formData = new FormData()
 * formData.append("a", "1")
 *
 * Schema.decodeUnknownSync(schema)(formData) // => { a: 1 }
 * ```
 *
 * @category decoding
 * @since 4.0.0
 */
export function fromFormData<S extends Constraint>(schema: S): fromFormData<S> {
  return FormData.pipe(decodeTo(schema, SchemaTransformation.fromFormData))
}
/**
 * Type-level representation of {@link URLSearchParams}.
 *
 * @category models
 * @since 4.0.0
 */
export interface URLSearchParams extends instanceOf<globalThis.URLSearchParams> {
  readonly "Rebuild": URLSearchParams
}
/**
 * Schema for JavaScript `URLSearchParams` objects.
 *
 * **Details**
 *
 * The default JSON serializer encodes a `URLSearchParams` as a query string.
 *
 * @category schemas
 * @since 4.0.0
 */
export const URLSearchParams: URLSearchParams = instanceOf(globalThis.URLSearchParams, {
  representation: {
    id: "effect/schema/URLSearchParams",
    payload: null
  },
  toCode: () => ({
    runtime: `Schema.URLSearchParams`,
    Type: `globalThis.URLSearchParams`
  }),
  expected: "URLSearchParams",
  toCodecJson: () =>
    link<globalThis.URLSearchParams>()(
      String.annotate({ expected: "a query string that will be decoded as URLSearchParams" }),
      SchemaTransformation.transform({
        decode: (e) => new globalThis.URLSearchParams(e),
        encode: (params) => params.toString()
      })
    )
})
/**
 * Type-level representation returned by {@link fromURLSearchParams}.
 *
 * @category models
 * @since 4.0.0
 */
export interface fromURLSearchParams<S extends Constraint> extends decodeTo<S, URLSearchParams> {
  readonly "Rebuild": fromURLSearchParams<S>
}
/**
 * Schema for decoding `URLSearchParams` through a bracket-notation tree.
 *
 * **When to use**
 *
 * Use to decode query parameters into a structured schema value.
 *
 * **Details**
 *
 * The decoding process has two steps:
 *
 * 1. Parse `URLSearchParams` into a nested tree record.
 * 2. Decode the parsed value with the given schema.
 *
 * You can express nested values using bracket notation.
 *
 * If you want to decode values that are not strings, use
 * `Schema.toCodecStringTree`. This serializer preserves values such as
 * numbers when compatible with the schema.
 *
 * **Example** (Decoding a flat structure)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const schema = Schema.fromURLSearchParams(
 *   Schema.Struct({
 *     a: Schema.String
 *   })
 * )
 *
 * const urlSearchParams = new URLSearchParams("a=1&b=2")
 *
 * Schema.decodeUnknownSync(schema)(urlSearchParams) // => { a: "1" }
 * ```
 *
 * **Example** (Decoding nested fields)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const schema = Schema.fromURLSearchParams(
 *   Schema.Struct({
 *     a: Schema.String,
 *     b: Schema.Struct({
 *       c: Schema.String,
 *       d: Schema.String
 *     })
 *   })
 * )
 *
 * const urlSearchParams = new URLSearchParams("a=1&b[c]=2&b[d]=3")
 *
 * Schema.decodeUnknownSync(schema)(urlSearchParams) // => { a: "1", b: { c: "2", d: "3" } }
 * ```
 *
 * **Example** (Parsing non-string values)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const schema = Schema.fromURLSearchParams(
 *   Schema.toCodecStringTree(
 *     Schema.Struct({
 *       a: Schema.Int
 *     })
 *   )
 * )
 *
 * const urlSearchParams = new URLSearchParams("a=1&b=2")
 *
 * Schema.decodeUnknownSync(schema)(urlSearchParams) // => { a: 1 }
 * ```
 *
 * @category decoding
 * @since 4.0.0
 */
export function fromURLSearchParams<S extends Constraint>(schema: S): fromURLSearchParams<S> {
  return URLSearchParams.pipe(decodeTo(schema, SchemaTransformation.fromURLSearchParams))
}
/**
 * Type-level representation of {@link NumberFromString}.
 *
 * @category models
 * @since 3.10.0
 */
export interface NumberFromString extends decodeTo<Number, String> {
  readonly "Rebuild": NumberFromString
}
/**
 * Schema that parses a string into a `number` using JavaScript
 * number coercion.
 *
 * **Details**
 *
 * Decoding:
 * A `string` is decoded as a number, including possible non-finite values such as
 * `NaN`, `Infinity`, and `-Infinity`. Use `FiniteFromString` to reject non-finite
 * numbers.
 *
 * Encoding:
 * A number is encoded as a `string`.
 *
 * @category schemas
 * @since 3.10.0
 */
export const NumberFromString: NumberFromString = String.annotate({
  expected: "a string that will be decoded as a number"
}).pipe(decodeTo(Number, SchemaTransformation.numberFromString))
/**
 * Type-level representation of {@link FiniteFromString}.
 *
 * @category models
 * @since 4.0.0
 */
export interface FiniteFromString extends decodeTo<Finite, String> {
  readonly "Rebuild": FiniteFromString
}
/**
 * Schema that parses a string into a finite number.
 *
 * **Details**
 *
 * Decoding:
 * - A `string` is decoded as a finite number, rejecting `NaN`, `Infinity`, and
 *   `-Infinity` values.
 *
 * Encoding:
 * - A finite number is encoded as a `string`.
 *
 * @category schemas
 * @since 4.0.0
 */
export const FiniteFromString: FiniteFromString = String.annotate({
  expected: "a string that will be decoded as a finite number"
}).pipe(decodeTo(Finite, SchemaTransformation.numberFromString))
/**
 * Type-level representation of {@link BigIntFromString}.
 *
 * @category models
 * @since 4.0.0
 */
export interface BigIntFromString extends decodeTo<BigInt, String> {
  readonly "Rebuild": BigIntFromString
}
/**
 * Schema that parses a string into a `bigint`.
 *
 * **When to use**
 *
 * Use to parse signed base-10 integer strings into bigint values while encoding
 * bigint values back to decimal strings.
 *
 * **Details**
 *
 * Decoding:
 * - A `string` is decoded as a `bigint`.
 *
 * Encoding:
 * - A `bigint` is encoded as a `string`.
 *
 * **Gotchas**
 *
 * Decoding accepts only strings matching `^-?\d+$`.
 *
 * @see {@link isStringBigInt} for the string predicate used by this schema
 * @see {@link BigInt} for validating values that are already bigint values
 * @see {@link NumberFromString} for parsing JavaScript number strings, including non-finite values
 * @see {@link BigDecimalFromString} for parsing decimal number strings
 *
 * @category schemas
 * @since 4.0.0
 */
export const BigIntFromString: BigIntFromString = make<String>(SchemaAST.bigIntString).pipe(
  decodeTo(BigInt, SchemaTransformation.bigintFromString)
)
/**
 * Type-level representation of {@link Trimmed}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Trimmed extends String {
  readonly "Rebuild": Trimmed
}
/**
 * Schema for strings that contains no leading or trailing whitespaces.
 *
 * @category schemas
 * @since 3.10.0
 */
export const Trimmed: Trimmed = String.check(isTrimmed())
/**
 * Type-level representation of {@link Trim}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Trim extends decodeTo<Trimmed, String> {
  readonly "Rebuild": Trim
}
/**
 * Schema that trims whitespace from a string.
 *
 * **Details**
 *
 * Decoding:
 * - A `string` is decoded as a string with no leading or trailing whitespaces.
 *
 * Encoding:
 * - The trimmed string is encoded as is.
 *
 * @category schemas
 * @since 3.10.0
 */
export const Trim: Trim = String.annotate({
  expected: "a string that will be decoded as a trimmed string"
}).pipe(decodeTo(Trimmed, SchemaTransformation.trim()))
/**
 * Type-level representation of {@link StringFromBase64}.
 *
 * @category models
 * @since 3.10.0
 */
export interface StringFromBase64 extends decodeTo<String, String> {
  readonly "Rebuild": StringFromBase64
}
/**
 * Decodes a base64 (RFC4648) encoded string into a UTF-8 string.
 *
 * **Details**
 *
 * Decoding:
 * - A **valid** base64 encoded string is decoded as a UTF-8 `string`.
 *
 * Encoding:
 * - A `string` is encoded as a base64-encoded string.
 *
 * @category schemas
 * @since 3.10.0
 */
export const StringFromBase64: StringFromBase64 = String.annotate({
  expected: "a base64 encoded string that will be decoded as a UTF-8 string"
}).pipe(
  decodeTo(String, SchemaTransformation.stringFromBase64String)
)
/**
 * Type-level representation of {@link StringFromBase64Url}.
 *
 * @category models
 * @since 3.10.0
 */
export interface StringFromBase64Url extends decodeTo<String, String> {
  readonly "Rebuild": StringFromBase64Url
}
/**
 * Decodes a base64 (URL) encoded string into a UTF-8 string.
 *
 * **Details**
 *
 * Decoding:
 * - A **valid** base64 (URL) encoded string is decoded as a UTF-8 `string`.
 *
 * Encoding:
 * - A `string` is encoded as a base64 (URL) encoded string.
 *
 * @category schemas
 * @since 3.10.0
 */
export const StringFromBase64Url: StringFromBase64Url = String.annotate({
  expected: "a base64 (URL) encoded string that will be decoded as a UTF-8 string"
}).pipe(
  decodeTo(String, SchemaTransformation.stringFromBase64UrlString)
)
/**
 * Type-level representation of {@link StringFromHex}.
 *
 * @category models
 * @since 3.10.0
 */
export interface StringFromHex extends decodeTo<String, String> {
  readonly "Rebuild": StringFromHex
}
/**
 * Decodes a hex encoded string into a UTF-8 string.
 *
 * **Details**
 *
 * Decoding:
 * - A **valid** hex encoded string is decoded as a UTF-8 `string`.
 *
 * Encoding:
 * - A `string` is encoded as a hex string.
 *
 * @category schemas
 * @since 3.10.0
 */
export const StringFromHex: StringFromHex = String.annotate({
  expected: "a hex encoded string that will be decoded as a UTF-8 string"
}).pipe(
  decodeTo(String, SchemaTransformation.stringFromHexString)
)
/**
 * Type-level representation of {@link StringFromUriComponent}.
 *
 * @category models
 * @since 3.12.0
 */
export interface StringFromUriComponent extends decodeTo<String, String> {
  readonly "Rebuild": StringFromUriComponent
}
/**
 * Decodes a URI component encoded string into a UTF-8 string.
 * Can be used to store data in a URL.
 *
 * **Details**
 *
 * Decoding:
 * - A **valid** URI component encoded string is decoded as a UTF-8 `string`.
 *
 * Encoding:
 * - A `string` is encoded as a URI component encoded string.
 *
 * **Example** (Decoding URI component strings)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const PaginationSchema = Schema.Struct({
 *   maxItemPerPage: Schema.Number,
 *   page: Schema.Number
 * })
 *
 * const UrlSchema = Schema.StringFromUriComponent.pipe(
 *   Schema.decodeTo(Schema.fromJsonString(PaginationSchema))
 * )
 *
 * Schema.encodeSync(UrlSchema)({ maxItemPerPage: 10, page: 1 }) // => "%7B%22maxItemPerPage%22%3A10%2C%22page%22%3A1%7D"
 * ```
 *
 * @category schemas
 * @since 3.12.0
 */
export const StringFromUriComponent: StringFromUriComponent = String.annotate({
  expected: "a URI component encoded string that will be decoded as a UTF-8 string"
}).pipe(
  decodeTo(String, SchemaTransformation.stringFromUriComponent)
)
/**
 * Schema for property keys accepted by Effect schemas: finite `number`,
 * `symbol`, or `string`.
 *
 * @category schemas
 * @since 4.0.0
 */
export const PropertyKey: Union<readonly [Finite, Symbol, String]> = Union([Finite, Symbol, String])
/**
 * Schema for a Standard Schema v1 failure result.
 *
 * **Details**
 *
 * The result contains an `issues` array where each issue has a message and an
 * optional path made of property keys or keyed path segments.
 *
 * @category schemas
 * @since 4.0.0
 */
export const StandardSchemaV1FailureResult: Struct<{
  readonly issues: $Array<
    Struct<{
      readonly message: String
      readonly path: optional<
        $Array<
          Union<
            readonly [
              Union<readonly [Finite, Symbol, String]>,
              Struct<{
                readonly key: Union<readonly [Finite, Symbol, String]>
              }>
            ]
          >
        >
      >
    }>
  >
}> = Struct({
  issues: ArraySchema(Struct({
    message: String,
    path: optional(ArraySchema(Union([PropertyKey, Struct({ key: PropertyKey })])))
  }))
})
/**
 * Type-level representation of {@link BooleanFromBit}.
 *
 * @category models
 * @since 4.0.0
 */
export interface BooleanFromBit extends decodeTo<Boolean, Literals<readonly [0, 1]>> {
  readonly "Rebuild": BooleanFromBit
}
/**
 * Schema for a boolean parsed from 0 or 1.
 *
 * **When to use**
 *
 * Use when decoding data sources that represent booleans as `0 | 1` while
 * keeping boolean values in the decoded model.
 *
 * **Details**
 *
 * Decoding accepts only `0 | 1`, maps `1` to `true`, and maps `0` to `false`.
 * Encoding maps `true` to `1` and `false` to `0`.
 *
 * @see {@link Boolean} for validating values that are already booleans
 * @see {@link Literals} for keeping bit literals instead of decoding them
 *
 * @category schemas
 * @since 4.0.0
 */
export const BooleanFromBit: BooleanFromBit = Literals([0, 1]).pipe(
  decodeTo(
    Boolean,
    SchemaTransformation.transform({
      decode: (bit) => bit === 1,
      encode: (bool) => bool ? 1 : 0
    })
  )
)
/**
 * Type-level representation of {@link Uint8Array}.
 *
 * @category models
 * @since 4.0.0
 */
export interface Uint8Array extends instanceOf<globalThis.Uint8Array<ArrayBufferLike>> {
  readonly "Rebuild": Uint8Array
}

const Base64String = String.annotate({
  expected: "a base64 encoded string that will be decoded as Uint8Array",
  format: "byte",
  contentEncoding: "base64"
})
/**
 * Schema for JavaScript `Uint8Array` objects.
 *
 * **Details**
 *
 * Default JSON serializer:
 *
 * The default JSON serializer encodes Uint8Array as a Base64 encoded string.
 *
 * @category schemas
 * @since 4.0.0
 */
export const Uint8Array: Uint8Array = instanceOf(globalThis.Uint8Array<ArrayBufferLike>, {
  representation: {
    id: "effect/schema/Uint8Array",
    payload: null
  },
  toCode: () => ({
    runtime: `Schema.Uint8Array`,
    Type: `globalThis.Uint8Array`
  }),
  expected: "Uint8Array",
  toCodecJson: () =>
    link<globalThis.Uint8Array<ArrayBufferLike>>()(
      Base64String,
      SchemaTransformation.uint8ArrayFromBase64String
    )
})
/**
 * Type-level representation of {@link Uint8ArrayFromBase64}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Uint8ArrayFromBase64 extends decodeTo<Uint8Array, String> {
  readonly "Rebuild": Uint8ArrayFromBase64
}
/**
 * Schema that decodes a base64 encoded string into a
 * `Uint8Array`.
 *
 * **Details**
 *
 * Decoding:
 * - A **valid** base64 encoded string is decoded as a `Uint8Array`.
 *
 * Encoding:
 * - A `Uint8Array` is encoded as a base64-encoded string.
 *
 * @category schemas
 * @since 3.10.0
 */
export const Uint8ArrayFromBase64: Uint8ArrayFromBase64 = Base64String.pipe(
  decodeTo(Uint8Array, SchemaTransformation.uint8ArrayFromBase64String)
)
/**
 * Type-level representation of {@link Uint8ArrayFromBase64Url}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Uint8ArrayFromBase64Url extends decodeTo<Uint8Array, String> {
  readonly "Rebuild": Uint8ArrayFromBase64Url
}
/**
 * Schema that decodes a base64 (URL) encoded string into a
 * `Uint8Array`.
 *
 * **Details**
 *
 * Decoding:
 * - A **valid** base64 (URL) encoded string is decoded as a `Uint8Array`.
 *
 * Encoding:
 * - A `Uint8Array` is encoded as a base64 (URL) encoded string.
 *
 * @category schemas
 * @since 3.10.0
 */
export const Uint8ArrayFromBase64Url: Uint8ArrayFromBase64Url = String.annotate({
  expected: "a base64 (URL) encoded string that will be decoded as a Uint8Array"
}).pipe(
  decodeTo(Uint8Array, {
    decode: SchemaGetter.decodeBase64Url(),
    encode: SchemaGetter.encodeBase64Url()
  })
)
/**
 * Type-level representation of {@link Uint8ArrayFromHex}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Uint8ArrayFromHex extends decodeTo<Uint8Array, String> {
  readonly "Rebuild": Uint8ArrayFromHex
}
/**
 * Schema that decodes a hex encoded string into a
 * `Uint8Array`.
 *
 * **Details**
 *
 * Decoding:
 * - A **valid** hex encoded string is decoded as a `Uint8Array`.
 *
 * Encoding:
 * - A `Uint8Array` is encoded as a hex encoded string.
 *
 * @category schemas
 * @since 3.10.0
 */
export const Uint8ArrayFromHex: Uint8ArrayFromHex = String.annotate({
  expected: "a hex encoded string that will be decoded as a Uint8Array"
}).pipe(
  decodeTo(Uint8Array, {
    decode: SchemaGetter.decodeHex(),
    encode: SchemaGetter.encodeHex()
  })
)

// -----------------------------------------------------------------------------
// BigDecimal schemas
// -----------------------------------------------------------------------------

const bigDecimalFromString: SchemaTransformation.Transformation<BigDecimal_.BigDecimal, string> = SchemaTransformation
  .transformEffect<BigDecimal_.BigDecimal, string>({
    decode: (s, options) => {
      const result = BigDecimal_.fromString(s)
      return Option_.isNone(result)
        ? Effect.fail(
          new SchemaIssue.InvalidValue(
            { expected: "a valid BigDecimal string" },
            s,
            options
          )
        )
        : Effect.succeed(result.value)
    },
    encode: (bd) => Effect.succeed(BigDecimal_.format(bd))
  })
/**
 * Validates that a BigDecimal is greater than the specified value (exclusive).
 *
 * @category validation
 * @since 4.0.0
 */
export const isGreaterThanBigDecimal: (
  exclusiveMinimum: BigDecimal_.BigDecimal,
  annotations?: Annotations.Filter
) => SchemaAST.Filter<BigDecimal_.BigDecimal> = makeIsGreaterThan({
  order: BigDecimal_.Order,
  formatter: (bd) => BigDecimal_.format(bd)
})
/**
 * Validates that a BigDecimal is greater than or equal to the specified value
 * (inclusive).
 *
 * @category validation
 * @since 4.0.0
 */
export const isGreaterThanOrEqualToBigDecimal: (
  minimum: BigDecimal_.BigDecimal,
  annotations?: Annotations.Filter
) => SchemaAST.Filter<BigDecimal_.BigDecimal> = makeIsGreaterThanOrEqualTo({
  order: BigDecimal_.Order,
  formatter: (bd) => BigDecimal_.format(bd)
})
/**
 * Validates that a BigDecimal is less than the specified value (exclusive).
 *
 * @category validation
 * @since 4.0.0
 */
export const isLessThanBigDecimal: (
  exclusiveMaximum: BigDecimal_.BigDecimal,
  annotations?: Annotations.Filter
) => SchemaAST.Filter<BigDecimal_.BigDecimal> = makeIsLessThan({
  order: BigDecimal_.Order,
  formatter: (bd) => BigDecimal_.format(bd)
})
/**
 * Validates that a BigDecimal is less than or equal to the specified value
 * (inclusive).
 *
 * @category validation
 * @since 4.0.0
 */
export const isLessThanOrEqualToBigDecimal: (
  maximum: BigDecimal_.BigDecimal,
  annotations?: Annotations.Filter
) => SchemaAST.Filter<BigDecimal_.BigDecimal> = makeIsLessThanOrEqualTo({
  order: BigDecimal_.Order,
  formatter: (bd) => BigDecimal_.format(bd)
})
/**
 * Validates that a `BigDecimal` is within a specified range.
 *
 * **Details**
 *
 * The minimum and maximum boundaries are inclusive by default. Pass
 * `exclusiveMinimum` or `exclusiveMaximum` to exclude either boundary.
 *
 * @category validation
 * @since 4.0.0
 */
export const isBetweenBigDecimal: (options: {
  readonly minimum: BigDecimal_.BigDecimal
  readonly maximum: BigDecimal_.BigDecimal
  readonly exclusiveMinimum?: boolean | undefined
  readonly exclusiveMaximum?: boolean | undefined
}, annotations?: Annotations.Filter) => SchemaAST.Filter<BigDecimal_.BigDecimal> = makeIsBetween({
  order: BigDecimal_.Order,
  formatter: (bd) => BigDecimal_.format(bd)
})
/**
 * Type-level representation of {@link BigDecimal}.
 *
 * @category models
 * @since 3.10.0
 */
export interface BigDecimal extends declare<BigDecimal_.BigDecimal> {
  readonly "Rebuild": BigDecimal
}
const BigDecimalString = String.annotate({ expected: "a string that will be decoded as a BigDecimal" })
/**
 * Schema for `BigDecimal` values.
 *
 * **When to use**
 *
 * Use when you already have Effect decimal instances and need schema
 * validation, formatting, equivalence, and JSON string serialization.
 *
 * **Details**
 *
 * Default JSON serializer:
 *
 * - encodes `BigDecimal` as a `string`
 *
 * @see {@link BigDecimalFromString} for parsing string input into a BigDecimal
 *
 * @category schemas
 * @since 3.10.0
 */
export const BigDecimal: BigDecimal = declare(
  BigDecimal_.isBigDecimal,
  {
    representation: {
      id: "effect/schema/BigDecimal",
      payload: null
    },
    toCode: () => ({
      runtime: `Schema.BigDecimal`,
      Type: `BigDecimal.BigDecimal`,
      importDeclarations: [`import * as BigDecimal from "effect/BigDecimal"`]
    }),
    expected: "BigDecimal",
    toCodecJson: () =>
      link<BigDecimal_.BigDecimal>()(
        BigDecimalString,
        bigDecimalFromString
      ),
    toFormatter: () => (bd) => BigDecimal_.format(bd)
  }
)
/**
 * Type-level representation of {@link BigDecimalFromString}.
 *
 * @category models
 * @since 4.0.0
 */
export interface BigDecimalFromString extends decodeTo<BigDecimal, String> {
  readonly "Rebuild": BigDecimalFromString
}
/**
 * Schema that parses a string into a `BigDecimal`.
 *
 * **When to use**
 *
 * Use to parse decimal or exponent-notation strings into arbitrary-precision
 * BigDecimal values while encoding them back to strings.
 *
 * **Details**
 *
 * Decoding:
 * - A `string` is decoded with `BigDecimal.fromString`.
 *
 * Encoding:
 * - A `BigDecimal` is encoded with `BigDecimal.format`.
 *
 * **Gotchas**
 *
 * An empty string decodes as zero.
 *
 * @see {@link BigDecimal} for validating values that are already BigDecimal values
 * @see {@link BigIntFromString} for parsing base-10 integer strings into bigint values
 * @see {@link NumberFromString} for parsing JavaScript number strings
 *
 * @category schemas
 * @since 4.0.0
 */
export const BigDecimalFromString: BigDecimalFromString = BigDecimalString.pipe(
  decodeTo(BigDecimal, bigDecimalFromString)
)

// -----------------------------------------------------------------------------
// ByteSize schemas
// -----------------------------------------------------------------------------

/**
 * Type-level representation of {@link ByteSize}.
 *
 * @category models
 * @since 4.0.0
 */
export interface ByteSize extends declare<ByteSize_.ByteSize> {
  readonly "Rebuild": ByteSize
}
/**
 * Schema for exact, non-negative `ByteSize` values.
 *
 * **Details**
 *
 * The JSON codec encodes the byte count as a bigint string, preserving values
 * beyond JavaScript's safe-integer range. The StringTree codec uses the
 * human-readable byte-size syntax exposed by {@link ByteSizeFromString}.
 *
 * @category schemas
 * @since 4.0.0
 */
export const ByteSize: ByteSize = declare(
  ByteSize_.isByteSize,
  {
    representation: {
      id: "effect/schema/ByteSize",
      payload: null
    },
    toCode: () => ({
      runtime: `Schema.ByteSize`,
      Type: `ByteSize.ByteSize`,
      importDeclarations: [`import * as ByteSize from "effect/ByteSize"`]
    }),
    expected: "ByteSize",
    toCodecJson: () =>
      link<ByteSize_.ByteSize>()(
        BigInt.check(isGreaterThanOrEqualToBigInt(globalThis.BigInt(0))),
        SchemaTransformation.transform({
          decode: ByteSize_.bytes,
          encode: ByteSize_.toBigInt
        })
      ),
    toCodecStringTree: () =>
      link<ByteSize_.ByteSize>()(
        ByteSizeString,
        SchemaTransformation.byteSizeFromString
      )
  }
)
const ByteSizeString = String.annotate({ expected: "a string that will be decoded as a ByteSize" })
/**
 * Type-level representation of {@link ByteSizeFromString}.
 *
 * @category models
 * @since 4.0.0
 */
export interface ByteSizeFromString extends decodeTo<ByteSize, String> {
  readonly "Rebuild": ByteSizeFromString
}
/**
 * Schema that decodes byte-size strings into exact, non-negative `ByteSize`
 * values.
 *
 * **Details**
 *
 * Decoding accepts an unsigned base-10 integer or decimal followed by optional
 * whitespace and one of these case-sensitive units:
 *
 * - bytes: `B`, `byte`, or `bytes`
 * - decimal SI units (powers of 1,000): `kB`, `MB`, `GB`, `TB`, `PB`, `EB`,
 *   `ZB`, `YB`, `RB`, or `QB`, plus their lowercase singular and plural names
 * - binary IEC units (powers of 1,024): `KiB`, `MiB`, `GiB`, `TiB`, `PiB`,
 *   `EiB`, `ZiB`, or `YiB`, plus their lowercase singular and plural names
 *
 * Leading and trailing whitespace is ignored. A decimal quantity must resolve
 * to an integral number of bytes, so `1.5 kB` is accepted while `0.1 KiB` is
 * rejected.
 *
 * Encoding returns the exact byte count as `<count> byte` or `<count> bytes`.
 *
 * **Gotchas**
 *
 * A unit is required. Signs, exponent notation, digit separators, and ambiguous
 * unit spellings such as `KB`, `mb`, `Mb`, or `b` are rejected.
 *
 * @category schemas
 * @since 4.0.0
 */
export const ByteSizeFromString: ByteSizeFromString = ByteSizeString.pipe(
  decodeTo(ByteSize, SchemaTransformation.byteSizeFromString)
)
/**
 * Type-level representation of {@link ByteSizeFromBigInt}.
 *
 * @category models
 * @since 4.0.0
 */
export interface ByteSizeFromBigInt extends decodeTo<ByteSize, BigInt> {
  readonly "Rebuild": ByteSizeFromBigInt
}
/**
 * Schema that decodes non-negative bigint byte counts.
 *
 * @category schemas
 * @since 4.0.0
 */
export const ByteSizeFromBigInt: ByteSizeFromBigInt = BigInt.pipe(
  decodeTo(ByteSize, SchemaTransformation.byteSizeFromBigInt)
)
/**
 * Type-level representation of {@link ByteSizeFromNumber}.
 *
 * @category models
 * @since 4.0.0
 */
export interface ByteSizeFromNumber extends decodeTo<ByteSize, Number> {
  readonly "Rebuild": ByteSizeFromNumber
}
/**
 * Schema that decodes non-negative safe-integer byte counts.
 *
 * **Details**
 *
 * Encoding fails when the byte count exceeds `Number.MAX_SAFE_INTEGER`.
 *
 * @category schemas
 * @since 4.0.0
 */
export const ByteSizeFromNumber: ByteSizeFromNumber = Number.pipe(
  decodeTo(ByteSize, SchemaTransformation.byteSizeFromNumber)
)

// -----------------------------------------------------------------------------
// Cause schemas
// -----------------------------------------------------------------------------

/**
 * Type-level representation returned by {@link CauseReason}.
 *
 * @category models
 * @since 4.0.0
 */
export interface CauseReason<E extends Constraint, D extends Constraint> extends
  declareConstructor<
    Cause_.Reason<E["Type"]>,
    Cause_.Reason<E["Encoded"]>,
    readonly [E, D],
    CauseReasonIso<E, D>
  >
{
  readonly "Rebuild": CauseReason<E, D>
  readonly error: E
  readonly defect: D
}
/**
 * Iso representation used for `CauseReason` schemas.
 *
 * **Details**
 *
 * Failures are represented with a `Fail` tag and encoded error, defects with a
 * `Die` tag and encoded defect, and interrupts with an optional `fiberId`.
 *
 * @category utility types
 * @since 4.0.0
 */
export type CauseReasonIso<E extends Constraint, D extends Constraint> = {
  readonly _tag: "Fail"
  readonly error: E["Iso"]
} | {
  readonly _tag: "Die"
  readonly error: D["Iso"]
} | {
  readonly _tag: "Interrupt"
  readonly fiberId: number | undefined
}
/**
 * Creates a schema for `Cause.Reason` values using separate schemas for typed
 * failures and unexpected defects.
 *
 * **When to use**
 *
 * Use when serializing or decoding individual cause reasons separately from a
 * full failure cause, with distinct schemas for typed errors and defects.
 *
 * **Details**
 *
 * `Fail` reasons use the `error` schema, `Die` reasons use the `defect` schema,
 * and `Interrupt` reasons carry only an optional fiber id.
 *
 * @see {@link Cause} for constructing schemas for full Cause values
 * @see {@link CauseReasonIso} for the ISO shape of each cause reason
 *
 * @category schemas
 * @since 4.0.0
 */
export function CauseReason<E extends Constraint, D extends Constraint>(
  error: E,
  defect: D
): CauseReason<E, D> {
  const schema = declareConstructor<
    Cause_.Reason<E["Type"]>,
    Cause_.Reason<E["Encoded"]>,
    CauseReasonIso<E, D>
  >()(
    [error, defect],
    ([error, defect]) => (input, ast, options) => {
      if (!Cause_.isReason(input)) {
        return Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
      }
      switch (input._tag) {
        case "Fail":
          return Effect.mapBothEager(
            SchemaParser.decodeUnknownEffect(error)(input.error, options),
            {
              onSuccess: Cause_.makeFailReason,
              onFailure: (issue) => SchemaIssue.makeCompositeAtKey(ast, "error", issue, input, options)
            }
          )
        case "Die":
          return Effect.mapBothEager(
            SchemaParser.decodeUnknownEffect(defect)(input.defect, options),
            {
              onSuccess: Cause_.makeDieReason,
              onFailure: (issue) => SchemaIssue.makeCompositeAtKey(ast, "defect", issue, input, options)
            }
          )
        case "Interrupt":
          return Effect.succeed(input)
      }
    },
    {
      representation: {
        id: "effect/schema/CauseReason",
        payload: null
      },
      toCode: ({ typeParameters }) => ({
        runtime: `Schema.CauseReason(${typeParameters[0].runtime}, ${typeParameters[1].runtime})`,
        Type: `Cause.Failure<${typeParameters[0].Type}, ${typeParameters[1].Type}>`,
        importDeclarations: [`import * as Cause from "effect/Cause"`]
      }),
      expected: "Cause.Failure",
      toCodec: ([error, defect]) =>
        link<Cause_.Reason<E["Encoded"]>>()(
          Union([
            Struct({ _tag: Literal("Fail"), error }),
            Struct({ _tag: Literal("Die"), defect }),
            Struct({
              _tag: Literal("Interrupt"),
              fiberId: UndefinedOr(Finite)
            })
          ]),
          SchemaTransformation.transform({
            decode: (e) => {
              switch (e._tag) {
                case "Fail":
                  return Cause_.makeFailReason(e.error)
                case "Die":
                  return Cause_.makeDieReason(e.defect)
                case "Interrupt":
                  return Cause_.makeInterruptReason(e.fiberId)
              }
            },
            encode: (reason) => {
              switch (reason._tag) {
                case "Fail":
                  return { _tag: "Fail" as const, error: reason.error }
                case "Die":
                  return { _tag: "Die" as const, defect: reason.defect }
                case "Interrupt":
                  return { _tag: "Interrupt" as const, fiberId: reason.fiberId }
              }
            }
          })
        )
    }
  )
  return make(schema.ast, { error, defect })
}
/**
 * Type-level representation returned by {@link Cause}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Cause<E extends Constraint, D extends Constraint> extends
  declareConstructor<
    Cause_.Cause<E["Type"]>,
    Cause_.Cause<E["Encoded"]>,
    readonly [E, D],
    CauseIso<E, D>
  >
{
  readonly "Rebuild": Cause<E, D>
  readonly error: E
  readonly defect: D
}
/**
 * Iso representation used for `Cause` schemas: an ordered array of
 * `CauseReasonIso` values.
 *
 * **When to use**
 *
 * Use when working with the ISO shape of a `Cause` schema, such as `toIso`
 * optics or codecs that expose a cause as its ordered array of encoded reasons.
 *
 * @see {@link Cause} for constructing schemas for full Cause values
 * @see {@link CauseReasonIso} for the ISO shape of each array element
 *
 * @category utility types
 * @since 4.0.0
 */
export type CauseIso<E extends Constraint, D extends Constraint> = ReadonlyArray<CauseReasonIso<E, D>>
/**
 * Creates a schema for `Cause` values using separate schemas for typed failures
 * and unexpected defects.
 *
 * **When to use**
 *
 * Use to validate, transform, or serialize Effect failure causes when typed
 * failures and unexpected defects need separate schemas.
 *
 * **Details**
 *
 * The `error` schema is applied to `Fail` reasons and the `defect` schema is
 * applied to `Die` reasons. Interrupt reasons do not use either schema and
 * carry only an optional fiber id.
 *
 * @see {@link CauseReason} for the schema used by each individual cause reason
 * @see {@link CauseIso} for the ordered array representation used by the schema ISO
 *
 * @category schemas
 * @since 3.10.0
 */
export function Cause<E extends Constraint, D extends Constraint>(error: E, defect: D): Cause<E, D> {
  const schema = declareConstructor<Cause_.Cause<E["Type"]>, Cause_.Cause<E["Encoded"]>, CauseIso<E, D>>()(
    [error, defect],
    ([error, defect]) => {
      const failures = ArraySchema(CauseReason(error, defect))
      return (input, ast, options) => {
        if (!Cause_.isCause(input)) {
          return Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
        }
        return Effect.mapBothEager(SchemaParser.decodeUnknownEffect(failures)(input.reasons, options), {
          onSuccess: Cause_.fromReasons,
          onFailure: (issue) => SchemaIssue.makeCompositeAtKey(ast, "failures", issue, input, options)
        })
      }
    },
    {
      representation: {
        id: "effect/schema/Cause",
        payload: null
      },
      toCode: ({ typeParameters }) => ({
        runtime: `Schema.Cause(${typeParameters[0].runtime}, ${typeParameters[1].runtime})`,
        Type: `Cause.Cause<${typeParameters[0].Type}, ${typeParameters[1].Type}>`,
        importDeclarations: [`import * as Cause from "effect/Cause"`]
      }),
      expected: "Cause",
      toCodec: ([error, defect]) =>
        link<Cause_.Cause<E["Encoded"]>>()(
          ArraySchema(CauseReason(error, defect)),
          SchemaTransformation.transform({
            decode: Cause_.fromReasons,
            encode: ({ reasons: failures }) => failures
          })
        )
    }
  )
  return make(schema.ast, { error, defect })
}

// -----------------------------------------------------------------------------
// Chunk schemas
// -----------------------------------------------------------------------------

function chunkLink<Value>(values: Schema<ReadonlyArray<Value>>) {
  return link<Chunk_.Chunk<Value>>()(
    values,
    SchemaTransformation.transform({
      decode: Chunk_.fromIterable,
      encode: Arr.fromIterable
    })
  )
}
/**
 * Type-level representation returned by {@link Chunk}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Chunk<Value extends Constraint> extends
  declareConstructor<
    Chunk_.Chunk<Value["Type"]>,
    Chunk_.Chunk<Value["Encoded"]>,
    readonly [Value],
    ChunkIso<Value>
  >
{
  readonly "Rebuild": Chunk<Value>
  readonly value: Value
}
/**
 * Iso representation used for `Chunk` schemas: an array of element values using
 * the element schema's `Iso` type.
 *
 * **When to use**
 *
 * Use when annotating type-level helpers that work with the readonly-array ISO
 * shape of a `Chunk` schema.
 *
 * @see {@link Chunk} for the schema interface and constructor that use this ISO representation
 *
 * @category utility types
 * @since 4.0.0
 */
export type ChunkIso<Value extends Constraint> = ReadonlyArray<Value["Iso"]>
/**
 * Schema for chunks whose values conform to the provided element schema.
 *
 * @category schemas
 * @since 3.10.0
 */
export function Chunk<Value extends Constraint>(value: Value): Chunk<Value> {
  const schema = declareConstructor<
    Chunk_.Chunk<Value["Type"]>,
    Chunk_.Chunk<Value["Encoded"]>,
    ChunkIso<Value>
  >()(
    [value],
    ([value]) => {
      const values = ArraySchema(value)
      return (input, ast, options) => {
        if (Chunk_.isChunk(input)) {
          return Effect.mapBothEager(
            SchemaParser.decodeUnknownEffect(values)(Arr.fromIterable(input), options),
            {
              onSuccess: Chunk_.fromIterable,
              onFailure: (issue) => SchemaIssue.makeCompositeAtKey(ast, "values", issue, input, options)
            }
          )
        }
        return Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
      }
    },
    {
      representation: {
        id: "effect/schema/Chunk",
        payload: null
      },
      toCode: ({ typeParameters }) => ({
        runtime: `Schema.Chunk(${typeParameters[0].runtime})`,
        Type: `Chunk.Chunk<${typeParameters[0].Type}>`
      }),
      expected: "Chunk",
      toCodec: ([value]) => chunkLink(ArraySchema(value)),
      toCodecArbitrary: ({ constraint, typeParameters: [value] }) =>
        chunkLink(
          withArrayLengthConstraints(
            ArraySchema(value),
            constraint?.minLength,
            constraint?.maxLength
          )
        ),
      toEquivalence: ([value]) => Chunk_.makeEquivalence(value)
    }
  )
  return make(schema.ast, { value })
}

// -----------------------------------------------------------------------------
// DateTime schemas
// -----------------------------------------------------------------------------

function dateTimeUtcFromInput<E extends DateTime.DateTime.Input>(): SchemaGetter.Getter<DateTime.Utc, E> {
  return SchemaGetter.transformEffect((input, options) => {
    return Option_.match(DateTime.make(input), {
      onNone: () =>
        Effect.fail(
          new SchemaIssue.InvalidValue({ message: "Invalid DateTime input" }, input, options)
        ),
      onSome: (dt) => Effect.succeed(DateTime.toUtc(dt))
    })
  })
}
const timeZoneOffsetFromNumber: SchemaTransformation.Transformation<DateTime.TimeZone.Offset, number> =
  SchemaTransformation.transform<DateTime.TimeZone.Offset, number>({
    decode: (n) => DateTime.zoneMakeOffset(n),
    encode: (tz) => tz.offset
  })
const timeZoneNamedFromString: SchemaTransformation.Transformation<DateTime.TimeZone.Named, string> =
  SchemaTransformation.transformEffect<DateTime.TimeZone.Named, string>({
    decode: (s, options) => {
      return Option_.match(DateTime.zoneMakeNamed(s), {
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
const timeZoneFromString: SchemaTransformation.Transformation<DateTime.TimeZone, string> = SchemaTransformation
  .transformEffect<DateTime.TimeZone, string>({
    decode: (s, options) => {
      return Option_.match(DateTime.zoneFromString(s), {
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
const dateTimeUtcFromString: SchemaTransformation.Transformation<DateTime.Utc, string> = SchemaTransformation
  .transformEffect<DateTime.Utc, string>({
    decode: (s, options) => {
      return Option_.match(DateTime.make(s), {
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
const dateTimeZonedFromString: SchemaTransformation.Transformation<DateTime.Zoned, string> = SchemaTransformation
  .transformEffect<DateTime.Zoned, string>({
    decode: (s, options) => {
      return Option_.match(DateTime.makeZonedFromString(s), {
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
const arbitraryMinimumDateTimestamp = -8_640_000_000_000_000
const arbitraryMaximumDateTimestamp = 8_640_000_000_000_000
const arbitraryMinimumZonedDateTimeTimestamp = arbitraryMinimumDateTimestamp + 14 * 60 * 60 * 1000
const arbitraryMaximumZonedDateTimeTimestamp = arbitraryMaximumDateTimestamp - 14 * 60 * 60 * 1000
const arbitraryMinimumTimeZoneOffset = -12 * 60 * 60 * 1000
const arbitraryMaximumTimeZoneOffset = 14 * 60 * 60 * 1000
const arbitraryNamedTimeZones = [
  "UTC",
  "Europe/London",
  "America/New_York",
  "Asia/Tokyo",
  "Australia/Sydney"
] as const
function dateTimeArbitraryBounds<T extends { readonly epochMilliseconds: number }>(
  constraint: Annotations.ToArbitrary.GenerationConstraint<T> | undefined,
  domainMinimum: number,
  domainMaximum: number
): readonly [minimum: number, maximum: number] {
  const minimum = Math.max(
    domainMinimum,
    constraint?.minimum === undefined
      ? domainMinimum
      : constraint.minimum.epochMilliseconds + (constraint.exclusiveMinimum === true ? 1 : 0)
  )
  const maximum = Math.min(
    domainMaximum,
    constraint?.maximum === undefined
      ? domainMaximum
      : constraint.maximum.epochMilliseconds - (constraint.exclusiveMaximum === true ? 1 : 0)
  )
  return minimum <= maximum ? [minimum, maximum] : [domainMinimum, domainMaximum]
}
function dateTimeArbitraryInteger(minimum: number, maximum: number): Codec<number> {
  return Int.check(isBetween({ minimum, maximum }))
}
function timeZoneArbitrarySchema(): Codec<number | string> {
  return Union([
    dateTimeArbitraryInteger(arbitraryMinimumTimeZoneOffset, arbitraryMaximumTimeZoneOffset),
    Literals(arbitraryNamedTimeZones)
  ])
}
/**
 * Type-level representation of {@link DateTimeUtc}.
 *
 * @category models
 * @since 3.10.0
 */
export interface DateTimeUtc extends declare<DateTime.Utc> {
  readonly "Rebuild": DateTimeUtc
}
/**
 * Schema for `DateTime.Utc` values.
 *
 * **When to use**
 *
 * Use to validate existing `DateTime.Utc` schema values and use the default JSON
 * codec that represents them as UTC ISO strings.
 *
 * **Details**
 *
 * The default JSON codec decodes UTC ISO strings into `DateTime.Utc` values and
 * encodes `DateTime.Utc` values as UTC ISO strings.
 *
 * @see {@link DateTimeUtcFromString} for decoding date-time strings into UTC values
 * @see {@link DateTimeUtcFromDate} for decoding JavaScript Date values into UTC values
 * @see {@link DateTimeUtcFromMillis} for decoding epoch milliseconds into UTC values
 * @see {@link DateTimeZoned} for preserving zoned DateTime values
 *
 * @category schemas
 * @since 3.10.0
 */
export const DateTimeUtc: DateTimeUtc = declare(
  (u) => DateTime.isDateTime(u) && DateTime.isUtc(u),
  {
    representation: {
      id: "effect/schema/DateTimeUtc",
      payload: null
    },
    toCode: () => ({
      runtime: `Schema.DateTimeUtc`,
      Type: `DateTime.Utc`,
      importDeclarations: [`import * as DateTime from "effect/DateTime"`]
    }),
    expected: "DateTime.Utc",
    toCodecArbitrary: ({ constraint }) => {
      const [minimum, maximum] = dateTimeArbitraryBounds(
        constraint,
        arbitraryMinimumDateTimestamp,
        arbitraryMaximumDateTimestamp
      )
      return linkDecoding<DateTime.Utc>()(
        dateTimeArbitraryInteger(minimum, maximum),
        SchemaGetter.transform(DateTime.makeUnsafe)
      )
    },
    toCodecJson: () =>
      link<DateTime.Utc>()(
        String,
        dateTimeUtcFromString
      ),
    toFormatter: () => (utc) => utc.toString()
  }
)
/**
 * Type-level representation of {@link DateTimeUtcFromDate}.
 *
 * @category models
 * @since 3.12.0
 */
export interface DateTimeUtcFromDate extends decodeTo<DateTimeUtc, Date> {
  readonly "Rebuild": DateTimeUtcFromDate
}
/**
 * Schema that decodes a `Date` into a `DateTime.Utc`.
 *
 * **When to use**
 *
 * Use when you need to decode valid JavaScript `Date` objects into
 * `DateTime.Utc` values.
 *
 * **Details**
 *
 * Decoding:
 * - A **valid** `Date` is decoded as a `DateTime.Utc`
 *
 * Encoding:
 * - A `DateTime.Utc` is encoded as a `Date`
 *
 * @see {@link DateTimeUtc} for validating values that are already `DateTime.Utc`
 * @see {@link DateTimeUtcFromString} for decoding date-time strings into UTC values
 * @see {@link DateTimeUtcFromMillis} for decoding epoch milliseconds into UTC values
 * @see {@link Date} for validating Date instances without converting them
 *
 * @category schemas
 * @since 3.12.0
 */
export const DateTimeUtcFromDate: DateTimeUtcFromDate = Date.pipe(
  decodeTo(DateTimeUtc, {
    decode: dateTimeUtcFromInput(),
    encode: SchemaGetter.transform(DateTime.toDateUtc)
  })
)
/**
 * Type-level representation of {@link DateTimeUtcFromString}.
 *
 * @category models
 * @since 4.0.0
 */
export interface DateTimeUtcFromString extends decodeTo<DateTimeUtc, String> {
  readonly "Rebuild": DateTimeUtcFromString
}
/**
 * Schema that decodes a date-time string into a `DateTime.Utc`.
 *
 * **Details**
 *
 * Decoding:
 *
 * - A string accepted by `DateTime.make` is parsed and normalized to UTC. Strings
 *   without an explicit zone are interpreted as UTC.
 *
 * Encoding:
 *
 * - A `DateTime.Utc` is encoded as a UTC ISO 8601 string.
 *
 * @see {@link DateTimeUtcFromDate} for decoding JavaScript Date values into UTC values
 * @see {@link DateTimeUtcFromMillis} for decoding epoch milliseconds into UTC values
 * @see {@link DateFromString} for decoding strings into JavaScript Date instances
 *
 * @category schemas
 * @since 4.0.0
 */
export const DateTimeUtcFromString: DateTimeUtcFromString = String.annotate({
  expected: "a string that will be decoded as a DateTime.Utc"
}).pipe(
  decodeTo(
    DateTimeUtc,
    dateTimeUtcFromString
  )
)
/**
 * Type-level representation of {@link DateTimeUtcFromMillis}.
 *
 * @category models
 * @since 4.0.0
 */
export interface DateTimeUtcFromMillis extends decodeTo<instanceOf<DateTime.Utc>, Int> {
  readonly "Rebuild": DateTimeUtcFromMillis
}
/**
 * Schema that decodes a number into a `DateTime.Utc`.
 *
 * **Details**
 *
 * Decoding:
 * - A number of milliseconds since the Unix epoch is decoded as a `DateTime.Utc`
 *
 * Encoding:
 * - A `DateTime.Utc` is encoded as a number of milliseconds since the Unix epoch.
 *
 * @see {@link DateTimeUtcFromDate} for decoding JavaScript Date values into UTC values
 * @see {@link DateTimeUtcFromString} for decoding date-time strings into UTC values
 * @see {@link DateFromMillis} for decoding epoch milliseconds into JavaScript Date instances
 *
 * @category schemas
 * @since 4.0.0
 */
export const DateTimeUtcFromMillis: DateTimeUtcFromMillis = Int.pipe(
  decodeTo(DateTimeUtc, {
    decode: dateTimeUtcFromInput(),
    encode: SchemaGetter.transform(DateTime.toEpochMillis)
  })
)
/**
 * Type-level representation of {@link TimeZoneOffset}.
 *
 * @category models
 * @since 3.10.0
 */
export interface TimeZoneOffset extends declare<DateTime.TimeZone.Offset> {
  readonly "Rebuild": TimeZoneOffset
}
/**
 * Schema for `DateTime.TimeZone.Offset` values.
 *
 * **Details**
 *
 * Default JSON serializer:
 *
 * - encodes `DateTime.TimeZone.Offset` as a number (offset in milliseconds)
 *
 * @category schemas
 * @since 3.10.0
 */
export const TimeZoneOffset: TimeZoneOffset = declare(
  DateTime.isTimeZoneOffset,
  {
    representation: {
      id: "effect/schema/TimeZoneOffset",
      payload: null
    },
    toCode: () => ({
      runtime: `Schema.TimeZoneOffset`,
      Type: `DateTime.TimeZone.Offset`,
      importDeclarations: [`import * as DateTime from "effect/DateTime"`]
    }),
    expected: "DateTime.TimeZone.Offset",
    toCodecJson: () =>
      link<DateTime.TimeZone.Offset>()(
        Int,
        timeZoneOffsetFromNumber
      ),
    toFormatter: () => (tz) => DateTime.zoneToString(tz)
  }
)
/**
 * Type-level representation of {@link TimeZoneNamed}.
 *
 * @category models
 * @since 3.10.0
 */
export interface TimeZoneNamed extends declare<DateTime.TimeZone.Named> {
  readonly "Rebuild": TimeZoneNamed
}
const TimeZoneNamedString = String.annotate({ expected: "an IANA time zone identifier" })
/**
 * Schema for `DateTime.TimeZone.Named` values.
 *
 * **Details**
 *
 * Default JSON serializer:
 *
 * - encodes `DateTime.TimeZone.Named` as a string (IANA time zone identifier)
 *
 * @category schemas
 * @since 3.10.0
 */
export const TimeZoneNamed: TimeZoneNamed = declare(
  DateTime.isTimeZoneNamed,
  {
    representation: {
      id: "effect/schema/TimeZoneNamed",
      payload: null
    },
    toCode: () => ({
      runtime: `Schema.TimeZoneNamed`,
      Type: `DateTime.TimeZone.Named`,
      importDeclarations: [`import * as DateTime from "effect/DateTime"`]
    }),
    expected: "DateTime.TimeZone.Named",
    toCodecArbitrary: () =>
      linkDecoding<DateTime.TimeZone.Named>()(
        Literals(arbitraryNamedTimeZones),
        SchemaGetter.transform(DateTime.zoneMakeNamedUnsafe)
      ),
    toCodecJson: () =>
      link<DateTime.TimeZone.Named>()(
        TimeZoneNamedString,
        timeZoneNamedFromString
      ),
    toFormatter: () => (tz) => DateTime.zoneToString(tz)
  }
)
/**
 * Type-level representation of {@link TimeZoneNamedFromString}.
 *
 * @category models
 * @since 4.0.0
 */
export interface TimeZoneNamedFromString extends decodeTo<TimeZoneNamed, String> {
  readonly "Rebuild": TimeZoneNamedFromString
}
/**
 * Schema that parses an IANA time zone identifier string into a `DateTime.TimeZone.Named`.
 *
 * **Details**
 *
 * Decoding:
 * - A `string` is decoded as a `DateTime.TimeZone.Named`.
 *
 * Encoding:
 * - A `DateTime.TimeZone.Named` is encoded as a `string`.
 *
 * @category schemas
 * @since 4.0.0
 */
export const TimeZoneNamedFromString: TimeZoneNamedFromString = TimeZoneNamedString.pipe(
  decodeTo(TimeZoneNamed, timeZoneNamedFromString)
)
/**
 * Type-level representation of {@link TimeZone}.
 *
 * @category models
 * @since 3.10.0
 */
export interface TimeZone extends declare<DateTime.TimeZone> {
  readonly "Rebuild": TimeZone
}
const TimeZoneString = String.annotate({
  expected: "a time zone string (IANA identifier or offset like +03:00)"
})
/**
 * Schema for `DateTime.TimeZone` values.
 *
 * **Details**
 *
 * Default JSON serializer:
 *
 * - encodes `DateTime.TimeZone` as a string (IANA identifier or offset like
 *   `+03:00`)
 *
 * @category schemas
 * @since 3.10.0
 */
export const TimeZone: TimeZone = declare(
  DateTime.isTimeZone,
  {
    representation: {
      id: "effect/schema/TimeZone",
      payload: null
    },
    toCode: () => ({
      runtime: `Schema.TimeZone`,
      Type: `DateTime.TimeZone`,
      importDeclarations: [`import * as DateTime from "effect/DateTime"`]
    }),
    expected: "DateTime.TimeZone",
    toCodecArbitrary: () =>
      linkDecoding<DateTime.TimeZone>()(
        timeZoneArbitrarySchema(),
        SchemaGetter.transform((value) =>
          typeof value === "number" ? DateTime.zoneMakeOffset(value) : DateTime.zoneMakeNamedUnsafe(value)
        )
      ),
    toCodecJson: () =>
      link<DateTime.TimeZone>()(
        TimeZoneString,
        timeZoneFromString
      ),
    toFormatter: () => (tz) => DateTime.zoneToString(tz)
  }
)
/**
 * Type-level representation of {@link TimeZoneFromString}.
 *
 * @category models
 * @since 4.0.0
 */
export interface TimeZoneFromString extends decodeTo<TimeZone, String> {
  readonly "Rebuild": TimeZoneFromString
}
/**
 * Schema that parses a time zone string into a `DateTime.TimeZone`.
 *
 * **Details**
 *
 * Decoding:
 * - A `string` (IANA identifier or offset like `+03:00`) is decoded as a `DateTime.TimeZone`.
 *
 * Encoding:
 * - A `DateTime.TimeZone` is encoded as a `string`.
 *
 * @category schemas
 * @since 4.0.0
 */
export const TimeZoneFromString: TimeZoneFromString = TimeZoneString.pipe(
  decodeTo(TimeZone, timeZoneFromString)
)
/**
 * Type-level representation of {@link DateTimeZoned}.
 *
 * @category models
 * @since 3.10.0
 */
export interface DateTimeZoned extends declare<DateTime.Zoned> {
  readonly "Rebuild": DateTimeZoned
}
const DateTimeZonedString = String.annotate({
  expected: "a zoned DateTime string (e.g. 2024-01-01T00:00:00.000+00:00[Europe/London])"
})
/**
 * Schema for `DateTime.Zoned` values.
 *
 * **Details**
 *
 * Default JSON serializer:
 *
 * - encodes offset zones as an ISO date-time with a numeric offset, such as
 *   `YYYY-MM-DDTHH:mm:ss.sss+HH:MM`
 * - encodes named zones by appending the IANA identifier in brackets, such as
 *   `YYYY-MM-DDTHH:mm:ss.sss+HH:MM[Time/Zone]`
 *
 * @category schemas
 * @since 3.10.0
 */
export const DateTimeZoned: DateTimeZoned = declare(
  (u) => DateTime.isDateTime(u) && DateTime.isZoned(u),
  {
    representation: {
      id: "effect/schema/DateTimeZoned",
      payload: null
    },
    toCode: () => ({
      runtime: `Schema.DateTimeZoned`,
      Type: `DateTime.Zoned`,
      importDeclarations: [`import * as DateTime from "effect/DateTime"`]
    }),
    expected: "DateTime.Zoned",
    toCodecArbitrary: ({ constraint }) => {
      const [minimum, maximum] = dateTimeArbitraryBounds(
        constraint,
        arbitraryMinimumZonedDateTimeTimestamp,
        arbitraryMaximumZonedDateTimeTimestamp
      )
      return linkDecoding<DateTime.Zoned>()(
        Struct({
          epochMilliseconds: dateTimeArbitraryInteger(minimum, maximum),
          timeZone: timeZoneArbitrarySchema()
        }),
        SchemaGetter.transform(({ epochMilliseconds, timeZone }) =>
          DateTime.makeZonedUnsafe(epochMilliseconds, { timeZone })
        )
      )
    },
    toCodecJson: () =>
      link<DateTime.Zoned>()(
        DateTimeZonedString,
        dateTimeZonedFromString
      ),
    toFormatter: () => (zoned) => DateTime.formatIsoZoned(zoned),
    toEquivalence: () => DateTime.Equivalence
  }
)
/**
 * Type-level representation of {@link DateTimeZonedFromString}.
 *
 * @category models
 * @since 4.0.0
 */
export interface DateTimeZonedFromString extends decodeTo<DateTimeZoned, String> {
  readonly "Rebuild": DateTimeZonedFromString
}
/**
 * Schema that parses a zoned DateTime string into a `DateTime.Zoned`.
 *
 * **Details**
 *
 * Decoding:
 * - A `string` (e.g. `2024-01-01T00:00:00.000+00:00[Europe/London]`) is decoded as a `DateTime.Zoned`.
 *
 * Encoding:
 * - A `DateTime.Zoned` is encoded as a `string`.
 *
 * @category schemas
 * @since 4.0.0
 */
export const DateTimeZonedFromString: DateTimeZonedFromString = DateTimeZonedString.pipe(
  decodeTo(DateTimeZoned, dateTimeZonedFromString)
)

const netAddressFromString = <S extends declare<any>, E extends { readonly message: string }>(
  declaration: S,
  parse: (input: string) => Result_.Result<S["Type"], E>,
  encode: (value: S["Type"]) => string,
  identifier: string
) =>
  String.pipe(decodeTo(
    declaration,
    SchemaTransformation.transformEffect({
      decode: (input, options) => {
        const result = parse(input)
        return Result_.isSuccess(result)
          ? Effect.succeed(result.success)
          : Effect.fail(new SchemaIssue.InvalidValue({ message: result.failure.message }, input, options))
      },
      encode: (value) => Effect.succeed(encode(value))
    })
  )).annotate({ identifier })

/**
 * Type-level representation of {@link MacAddress}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface MacAddress extends declare<NetAddress_.MacAddress> {
  readonly "Rebuild": MacAddress
}

/**
 * Schema for already-constructed MAC address values.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const MacAddress: MacAddress = declare(NetAddress_.isMacAddress, {
  identifier: "MacAddress"
})

/**
 * Type-level representation of {@link MacAddressFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface MacAddressFromString extends decodeTo<MacAddress, String> {
  readonly "Rebuild": MacAddressFromString
}

/**
 * Schema for MAC addresses encoded as canonical colon-separated hexadecimal strings.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const MacAddressFromString: MacAddressFromString = netAddressFromString(
  MacAddress,
  NetAddress_.macAddressFromString,
  NetAddress_.formatMacAddress,
  "MacAddressFromString"
)

/**
 * Type-level representation of {@link Ipv4Address}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Ipv4Address extends declare<NetAddress_.Ipv4Address> {
  readonly "Rebuild": Ipv4Address
}

/**
 * Schema for already-constructed IPv4 address values.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Ipv4Address: Ipv4Address = declare(NetAddress_.isIpv4Address, {
  identifier: "Ipv4Address"
})

/**
 * Type-level representation of {@link Ipv4AddressFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Ipv4AddressFromString extends decodeTo<Ipv4Address, String> {
  readonly "Rebuild": Ipv4AddressFromString
}

/**
 * Schema for IPv4 addresses encoded as canonical dotted-decimal strings.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Ipv4AddressFromString: Ipv4AddressFromString = netAddressFromString(
  Ipv4Address,
  NetAddress_.ipv4FromString,
  NetAddress_.formatIp,
  "Ipv4AddressFromString"
)

/**
 * Type-level representation of {@link Ipv6Address}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Ipv6Address extends declare<NetAddress_.Ipv6Address> {
  readonly "Rebuild": Ipv6Address
}

/**
 * Schema for already-constructed IPv6 address values.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Ipv6Address: Ipv6Address = declare(NetAddress_.isIpv6Address, {
  identifier: "Ipv6Address"
})

/**
 * Type-level representation of {@link Ipv6AddressFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Ipv6AddressFromString extends decodeTo<Ipv6Address, String> {
  readonly "Rebuild": Ipv6AddressFromString
}

/**
 * Schema for IPv6 addresses encoded as canonical strings.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Ipv6AddressFromString: Ipv6AddressFromString = netAddressFromString(
  Ipv6Address,
  NetAddress_.ipv6FromString,
  NetAddress_.formatIp,
  "Ipv6AddressFromString"
)

/**
 * Type-level representation of {@link IpAddress}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface IpAddress extends declare<NetAddress_.IpAddress> {
  readonly "Rebuild": IpAddress
}

/**
 * Schema for already-constructed IPv4 or IPv6 address values.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const IpAddress: IpAddress = declare(NetAddress_.isIpAddress, {
  identifier: "IpAddress"
})

/**
 * Type-level representation of {@link IpAddressFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface IpAddressFromString extends decodeTo<IpAddress, String> {
  readonly "Rebuild": IpAddressFromString
}

/**
 * Schema for IP addresses encoded as canonical numeric strings.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const IpAddressFromString: IpAddressFromString = netAddressFromString(
  IpAddress,
  NetAddress_.ipFromString,
  NetAddress_.formatIp,
  "IpAddressFromString"
)

const netAddressRefinement = <S extends Constraint, T extends S["Type"]>(
  schema: S,
  guard: (value: S["Type"]) => value is T,
  expected: string,
  identifier: string
): refine<T, S> => refine(guard, { expected })(schema).annotate({ identifier })

/**
 * Type-level representation of {@link IpMulticastAddress}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface IpMulticastAddress extends refine<NetAddress_.MulticastAddress<NetAddress_.IpAddress>, IpAddress> {
  readonly "Rebuild": IpMulticastAddress
}

/**
 * Schema for already-constructed multicast IP addresses.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const IpMulticastAddress: IpMulticastAddress = netAddressRefinement(
  IpAddress,
  NetAddress_.isMulticast,
  "a multicast address",
  "IpMulticastAddress"
)

/**
 * Type-level representation of {@link IpMulticastAddressFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface IpMulticastAddressFromString
  extends refine<NetAddress_.MulticastAddress<NetAddress_.IpAddress>, IpAddressFromString>
{
  readonly "Rebuild": IpMulticastAddressFromString
}

/**
 * Schema for multicast IP addresses encoded as numeric strings.
 *
 * **Example** (Decoding a validated multicast address)
 *
 * ```ts import.meta.vitest
 * import { assert } from "@effect/vitest"
 * import { Schema } from "effect"
 * import { NetAddress } from "effect/net"
 *
 * const address = Schema.decodeUnknownSync(Schema.IpMulticastAddressFromString)("239.255.0.1")
 * assert.isTrue(NetAddress.isMulticast(address))
 * ```
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const IpMulticastAddressFromString: IpMulticastAddressFromString = netAddressRefinement(
  IpAddressFromString,
  NetAddress_.isMulticast,
  "a multicast address",
  "IpMulticastAddressFromString"
)

/**
 * Type-level representation of {@link MacMulticastAddress}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface MacMulticastAddress extends refine<NetAddress_.MulticastAddress<NetAddress_.MacAddress>, MacAddress> {
  readonly "Rebuild": MacMulticastAddress
}

/**
 * Schema for already-constructed multicast MAC addresses.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const MacMulticastAddress: MacMulticastAddress = netAddressRefinement(
  MacAddress,
  NetAddress_.isMulticast,
  "a multicast address",
  "MacMulticastAddress"
)

/**
 * Type-level representation of {@link MacMulticastAddressFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface MacMulticastAddressFromString
  extends refine<NetAddress_.MulticastAddress<NetAddress_.MacAddress>, MacAddressFromString>
{
  readonly "Rebuild": MacMulticastAddressFromString
}

/**
 * Schema for multicast MAC addresses encoded as canonical strings.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const MacMulticastAddressFromString: MacMulticastAddressFromString = netAddressRefinement(
  MacAddressFromString,
  NetAddress_.isMulticast,
  "a multicast address",
  "MacMulticastAddressFromString"
)

/**
 * Type-level representation of {@link IpUnicastAddress}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface IpUnicastAddress extends refine<NetAddress_.UnicastAddress<NetAddress_.IpAddress>, IpAddress> {
  readonly "Rebuild": IpUnicastAddress
}

/**
 * Schema for already-constructed syntactic unicast IP addresses.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const IpUnicastAddress: IpUnicastAddress = netAddressRefinement(
  IpAddress,
  NetAddress_.isUnicast,
  "a unicast address",
  "IpUnicastAddress"
)

/**
 * Type-level representation of {@link IpUnicastAddressFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface IpUnicastAddressFromString
  extends refine<NetAddress_.UnicastAddress<NetAddress_.IpAddress>, IpAddressFromString>
{
  readonly "Rebuild": IpUnicastAddressFromString
}

/**
 * Schema for syntactic unicast IP addresses encoded as numeric strings.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const IpUnicastAddressFromString: IpUnicastAddressFromString = netAddressRefinement(
  IpAddressFromString,
  NetAddress_.isUnicast,
  "a unicast address",
  "IpUnicastAddressFromString"
)

/**
 * Type-level representation of {@link MacUnicastAddress}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface MacUnicastAddress extends refine<NetAddress_.UnicastAddress<NetAddress_.MacAddress>, MacAddress> {
  readonly "Rebuild": MacUnicastAddress
}

/**
 * Schema for already-constructed unicast MAC addresses.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const MacUnicastAddress: MacUnicastAddress = netAddressRefinement(
  MacAddress,
  NetAddress_.isMacUnicast,
  "a unicast address",
  "MacUnicastAddress"
)

/**
 * Type-level representation of {@link MacUnicastAddressFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface MacUnicastAddressFromString
  extends refine<NetAddress_.UnicastAddress<NetAddress_.MacAddress>, MacAddressFromString>
{
  readonly "Rebuild": MacUnicastAddressFromString
}

/**
 * Schema for unicast MAC addresses encoded as canonical strings.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const MacUnicastAddressFromString: MacUnicastAddressFromString = netAddressRefinement(
  MacAddressFromString,
  NetAddress_.isMacUnicast,
  "a unicast address",
  "MacUnicastAddressFromString"
)

/**
 * Type-level representation of {@link Ipv4BroadcastAddress}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Ipv4BroadcastAddress
  extends refine<NetAddress_.BroadcastAddress<NetAddress_.Ipv4Address>, Ipv4Address>
{
  readonly "Rebuild": Ipv4BroadcastAddress
}

/**
 * Schema for the already-constructed IPv4 limited broadcast address.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Ipv4BroadcastAddress: Ipv4BroadcastAddress = netAddressRefinement(
  Ipv4Address,
  NetAddress_.isBroadcast,
  "a broadcast address",
  "Ipv4BroadcastAddress"
)

/**
 * Type-level representation of {@link Ipv4BroadcastAddressFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Ipv4BroadcastAddressFromString
  extends refine<NetAddress_.BroadcastAddress<NetAddress_.Ipv4Address>, Ipv4AddressFromString>
{
  readonly "Rebuild": Ipv4BroadcastAddressFromString
}

/**
 * Schema for the IPv4 limited broadcast address encoded as a string.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Ipv4BroadcastAddressFromString: Ipv4BroadcastAddressFromString = netAddressRefinement(
  Ipv4AddressFromString,
  NetAddress_.isBroadcast,
  "a broadcast address",
  "Ipv4BroadcastAddressFromString"
)

/**
 * Type-level representation of {@link MacBroadcastAddress}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface MacBroadcastAddress extends refine<NetAddress_.BroadcastAddress<NetAddress_.MacAddress>, MacAddress> {
  readonly "Rebuild": MacBroadcastAddress
}

/**
 * Schema for the already-constructed MAC all-ones broadcast address.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const MacBroadcastAddress: MacBroadcastAddress = netAddressRefinement(
  MacAddress,
  NetAddress_.isMacBroadcast,
  "a broadcast address",
  "MacBroadcastAddress"
)

/**
 * Type-level representation of {@link MacBroadcastAddressFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface MacBroadcastAddressFromString
  extends refine<NetAddress_.BroadcastAddress<NetAddress_.MacAddress>, MacAddressFromString>
{
  readonly "Rebuild": MacBroadcastAddressFromString
}

/**
 * Schema for the MAC all-ones broadcast address encoded as a string.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const MacBroadcastAddressFromString: MacBroadcastAddressFromString = netAddressRefinement(
  MacAddressFromString,
  NetAddress_.isMacBroadcast,
  "a broadcast address",
  "MacBroadcastAddressFromString"
)

/**
 * Type-level representation of {@link IpLoopbackAddress}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface IpLoopbackAddress extends refine<NetAddress_.LoopbackAddress<NetAddress_.IpAddress>, IpAddress> {
  readonly "Rebuild": IpLoopbackAddress
}

/**
 * Schema for already-constructed loopback IP addresses.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const IpLoopbackAddress: IpLoopbackAddress = netAddressRefinement(
  IpAddress,
  NetAddress_.isLoopback,
  "a loopback address",
  "IpLoopbackAddress"
)

/**
 * Type-level representation of {@link IpLoopbackAddressFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface IpLoopbackAddressFromString
  extends refine<NetAddress_.LoopbackAddress<NetAddress_.IpAddress>, IpAddressFromString>
{
  readonly "Rebuild": IpLoopbackAddressFromString
}

/**
 * Schema for loopback IP addresses encoded as numeric strings.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const IpLoopbackAddressFromString: IpLoopbackAddressFromString = netAddressRefinement(
  IpAddressFromString,
  NetAddress_.isLoopback,
  "a loopback address",
  "IpLoopbackAddressFromString"
)

/**
 * Type-level representation of {@link IpLinkLocalAddress}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface IpLinkLocalAddress extends refine<NetAddress_.LinkLocalAddress<NetAddress_.IpAddress>, IpAddress> {
  readonly "Rebuild": IpLinkLocalAddress
}

/**
 * Schema for already-constructed link-local IP addresses.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const IpLinkLocalAddress: IpLinkLocalAddress = netAddressRefinement(
  IpAddress,
  NetAddress_.isLinkLocal,
  "a link-local address",
  "IpLinkLocalAddress"
)

/**
 * Type-level representation of {@link IpLinkLocalAddressFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface IpLinkLocalAddressFromString
  extends refine<NetAddress_.LinkLocalAddress<NetAddress_.IpAddress>, IpAddressFromString>
{
  readonly "Rebuild": IpLinkLocalAddressFromString
}

/**
 * Schema for link-local IP addresses encoded as numeric strings.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const IpLinkLocalAddressFromString: IpLinkLocalAddressFromString = netAddressRefinement(
  IpAddressFromString,
  NetAddress_.isLinkLocal,
  "a link-local address",
  "IpLinkLocalAddressFromString"
)

/**
 * Type-level representation of {@link IpUnspecifiedAddress}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface IpUnspecifiedAddress extends refine<NetAddress_.UnspecifiedAddress<NetAddress_.IpAddress>, IpAddress> {
  readonly "Rebuild": IpUnspecifiedAddress
}

/**
 * Schema for already-constructed unspecified IP addresses.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const IpUnspecifiedAddress: IpUnspecifiedAddress = netAddressRefinement(
  IpAddress,
  NetAddress_.isUnspecified,
  "an unspecified address",
  "IpUnspecifiedAddress"
)

/**
 * Type-level representation of {@link IpUnspecifiedAddressFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface IpUnspecifiedAddressFromString
  extends refine<NetAddress_.UnspecifiedAddress<NetAddress_.IpAddress>, IpAddressFromString>
{
  readonly "Rebuild": IpUnspecifiedAddressFromString
}

/**
 * Schema for unspecified IP addresses encoded as numeric strings.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const IpUnspecifiedAddressFromString: IpUnspecifiedAddressFromString = netAddressRefinement(
  IpAddressFromString,
  NetAddress_.isUnspecified,
  "an unspecified address",
  "IpUnspecifiedAddressFromString"
)

/**
 * Type-level representation of {@link Ipv4PrivateAddress}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Ipv4PrivateAddress extends refine<NetAddress_.PrivateAddress<NetAddress_.Ipv4Address>, Ipv4Address> {
  readonly "Rebuild": Ipv4PrivateAddress
}

/**
 * Schema for already-constructed RFC 1918 private-use addresses.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Ipv4PrivateAddress: Ipv4PrivateAddress = netAddressRefinement(
  Ipv4Address,
  NetAddress_.isPrivate,
  "a private address",
  "Ipv4PrivateAddress"
)

/**
 * Type-level representation of {@link Ipv4PrivateAddressFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Ipv4PrivateAddressFromString
  extends refine<NetAddress_.PrivateAddress<NetAddress_.Ipv4Address>, Ipv4AddressFromString>
{
  readonly "Rebuild": Ipv4PrivateAddressFromString
}

/**
 * Schema for RFC 1918 private-use addresses encoded as strings.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Ipv4PrivateAddressFromString: Ipv4PrivateAddressFromString = netAddressRefinement(
  Ipv4AddressFromString,
  NetAddress_.isPrivate,
  "a private address",
  "Ipv4PrivateAddressFromString"
)

/**
 * Type-level representation of {@link Ipv6UniqueLocalAddress}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Ipv6UniqueLocalAddress
  extends refine<NetAddress_.UniqueLocalAddress<NetAddress_.Ipv6Address>, Ipv6Address>
{
  readonly "Rebuild": Ipv6UniqueLocalAddress
}

/**
 * Schema for already-constructed IPv6 unique-local addresses.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Ipv6UniqueLocalAddress: Ipv6UniqueLocalAddress = netAddressRefinement(
  Ipv6Address,
  NetAddress_.isUniqueLocal,
  "a unique-local address",
  "Ipv6UniqueLocalAddress"
)

/**
 * Type-level representation of {@link Ipv6UniqueLocalAddressFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Ipv6UniqueLocalAddressFromString
  extends refine<NetAddress_.UniqueLocalAddress<NetAddress_.Ipv6Address>, Ipv6AddressFromString>
{
  readonly "Rebuild": Ipv6UniqueLocalAddressFromString
}

/**
 * Schema for IPv6 unique-local addresses encoded as strings.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Ipv6UniqueLocalAddressFromString: Ipv6UniqueLocalAddressFromString = netAddressRefinement(
  Ipv6AddressFromString,
  NetAddress_.isUniqueLocal,
  "a unique-local address",
  "Ipv6UniqueLocalAddressFromString"
)

/**
 * Type-level representation of {@link MacLocallyAdministeredAddress}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface MacLocallyAdministeredAddress
  extends refine<NetAddress_.LocallyAdministeredAddress<NetAddress_.MacAddress>, MacAddress>
{
  readonly "Rebuild": MacLocallyAdministeredAddress
}

/**
 * Schema for already-constructed locally administered MAC addresses.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const MacLocallyAdministeredAddress: MacLocallyAdministeredAddress = netAddressRefinement(
  MacAddress,
  NetAddress_.isMacLocallyAdministered,
  "a locally administered address",
  "MacLocallyAdministeredAddress"
)

/**
 * Type-level representation of {@link MacLocallyAdministeredAddressFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface MacLocallyAdministeredAddressFromString
  extends refine<NetAddress_.LocallyAdministeredAddress<NetAddress_.MacAddress>, MacAddressFromString>
{
  readonly "Rebuild": MacLocallyAdministeredAddressFromString
}

/**
 * Schema for locally administered MAC addresses encoded as strings.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const MacLocallyAdministeredAddressFromString: MacLocallyAdministeredAddressFromString = netAddressRefinement(
  MacAddressFromString,
  NetAddress_.isMacLocallyAdministered,
  "a locally administered address",
  "MacLocallyAdministeredAddressFromString"
)

/**
 * Type-level representation of {@link MacUniversallyAdministeredAddress}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface MacUniversallyAdministeredAddress
  extends refine<NetAddress_.UniversallyAdministeredAddress<NetAddress_.MacAddress>, MacAddress>
{
  readonly "Rebuild": MacUniversallyAdministeredAddress
}

/**
 * Schema for already-constructed universally administered MAC addresses.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const MacUniversallyAdministeredAddress: MacUniversallyAdministeredAddress = netAddressRefinement(
  MacAddress,
  NetAddress_.isMacUniversallyAdministered,
  "a universally administered address",
  "MacUniversallyAdministeredAddress"
)

/**
 * Type-level representation of {@link MacUniversallyAdministeredAddressFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface MacUniversallyAdministeredAddressFromString
  extends refine<NetAddress_.UniversallyAdministeredAddress<NetAddress_.MacAddress>, MacAddressFromString>
{
  readonly "Rebuild": MacUniversallyAdministeredAddressFromString
}

/**
 * Schema for universally administered MAC addresses encoded as strings.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const MacUniversallyAdministeredAddressFromString: MacUniversallyAdministeredAddressFromString =
  netAddressRefinement(
    MacAddressFromString,
    NetAddress_.isMacUniversallyAdministered,
    "a universally administered address",
    "MacUniversallyAdministeredAddressFromString"
  )

/**
 * Type-level representation of {@link Ipv4Interface}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Ipv4Interface extends declare<IpInterface_.Ipv4Interface> {
  readonly "Rebuild": Ipv4Interface
}

/**
 * Schema for already-constructed IPv4 interface address values.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Ipv4Interface: Ipv4Interface = declare(IpInterface_.isIpv4Interface, {
  identifier: "Ipv4Interface"
})

/**
 * Type-level representation of {@link Ipv4InterfaceFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Ipv4InterfaceFromString extends decodeTo<Ipv4Interface, String> {
  readonly "Rebuild": Ipv4InterfaceFromString
}

/**
 * Schema for IPv4 interface addresses encoded as an address and prefix length.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Ipv4InterfaceFromString: Ipv4InterfaceFromString = netAddressFromString(
  Ipv4Interface,
  IpInterface_.ipv4FromString,
  IpInterface_.format,
  "Ipv4InterfaceFromString"
)

/**
 * Type-level representation of {@link Ipv6Interface}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Ipv6Interface extends declare<IpInterface_.Ipv6Interface> {
  readonly "Rebuild": Ipv6Interface
}

/**
 * Schema for already-constructed IPv6 interface address values.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Ipv6Interface: Ipv6Interface = declare(IpInterface_.isIpv6Interface, {
  identifier: "Ipv6Interface"
})

/**
 * Type-level representation of {@link Ipv6InterfaceFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Ipv6InterfaceFromString extends decodeTo<Ipv6Interface, String> {
  readonly "Rebuild": Ipv6InterfaceFromString
}

/**
 * Schema for IPv6 interface addresses encoded as an address and prefix length.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Ipv6InterfaceFromString: Ipv6InterfaceFromString = netAddressFromString(
  Ipv6Interface,
  IpInterface_.ipv6FromString,
  IpInterface_.format,
  "Ipv6InterfaceFromString"
)

/**
 * Type-level representation of {@link IpInterface}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface IpInterface extends declare<IpInterface_.IpInterface> {
  readonly "Rebuild": IpInterface
}

/**
 * Schema for already-constructed IPv4 or IPv6 interface address values.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const IpInterface: IpInterface = declare(IpInterface_.isIpInterface, {
  identifier: "IpInterface"
})

/**
 * Type-level representation of {@link IpInterfaceFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface IpInterfaceFromString extends decodeTo<IpInterface, String> {
  readonly "Rebuild": IpInterfaceFromString
}

/**
 * Schema for IPv4 or IPv6 interface addresses encoded as an address and prefix length.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const IpInterfaceFromString: IpInterfaceFromString = netAddressFromString(
  IpInterface,
  IpInterface_.fromString,
  IpInterface_.format,
  "IpInterfaceFromString"
)

/**
 * Type-level representation of {@link Ipv4Network}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Ipv4Network extends declare<IpNetwork_.Ipv4Network> {
  readonly "Rebuild": Ipv4Network
}

/**
 * Schema for already-constructed canonical IPv4 network prefixes.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Ipv4Network: Ipv4Network = declare(IpNetwork_.isIpv4Network, {
  identifier: "Ipv4Network"
})

/**
 * Type-level representation of {@link Ipv4NetworkFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Ipv4NetworkFromString extends decodeTo<Ipv4Network, String> {
  readonly "Rebuild": Ipv4NetworkFromString
}

/**
 * Schema for canonical IPv4 network prefixes encoded in CIDR notation.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Ipv4NetworkFromString: Ipv4NetworkFromString = netAddressFromString(
  Ipv4Network,
  IpNetwork_.ipv4FromString,
  IpNetwork_.format,
  "Ipv4NetworkFromString"
)

/**
 * Type-level representation of {@link Ipv6Network}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Ipv6Network extends declare<IpNetwork_.Ipv6Network> {
  readonly "Rebuild": Ipv6Network
}

/**
 * Schema for already-constructed canonical IPv6 network prefixes.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Ipv6Network: Ipv6Network = declare(IpNetwork_.isIpv6Network, {
  identifier: "Ipv6Network"
})

/**
 * Type-level representation of {@link Ipv6NetworkFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Ipv6NetworkFromString extends decodeTo<Ipv6Network, String> {
  readonly "Rebuild": Ipv6NetworkFromString
}

/**
 * Schema for canonical IPv6 network prefixes encoded in CIDR notation.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Ipv6NetworkFromString: Ipv6NetworkFromString = netAddressFromString(
  Ipv6Network,
  IpNetwork_.ipv6FromString,
  IpNetwork_.format,
  "Ipv6NetworkFromString"
)

/**
 * Type-level representation of {@link IpNetwork}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface IpNetwork extends declare<IpNetwork_.IpNetwork> {
  readonly "Rebuild": IpNetwork
}

/**
 * Schema for already-constructed canonical IPv4 or IPv6 network prefixes.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const IpNetwork: IpNetwork = declare(IpNetwork_.isIpNetwork, {
  identifier: "IpNetwork"
})

/**
 * Type-level representation of {@link IpNetworkFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface IpNetworkFromString extends decodeTo<IpNetwork, String> {
  readonly "Rebuild": IpNetworkFromString
}

/**
 * Schema for canonical IPv4 or IPv6 network prefixes encoded in CIDR notation.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const IpNetworkFromString: IpNetworkFromString = netAddressFromString(
  IpNetwork,
  IpNetwork_.fromString,
  IpNetwork_.format,
  "IpNetworkFromString"
)

/**
 * Type-level representation of {@link InetAddressV4}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface InetAddressV4 extends declare<NetAddress_.InetAddressV4> {
  readonly "Rebuild": InetAddressV4
}

/**
 * Schema for already-constructed resolved IPv4 internet addresses.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const InetAddressV4: InetAddressV4 = declare(NetAddress_.isInetAddressV4, {
  identifier: "InetAddressV4"
})

/**
 * Type-level representation of {@link InetAddressV6}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface InetAddressV6 extends declare<NetAddress_.InetAddressV6> {
  readonly "Rebuild": InetAddressV6
}

/**
 * Schema for already-constructed resolved IPv6 internet addresses.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const InetAddressV6: InetAddressV6 = declare(NetAddress_.isInetAddressV6, {
  identifier: "InetAddressV6"
})

/**
 * Type-level representation of {@link InetAddress}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface InetAddress extends declare<NetAddress_.InetAddress> {
  readonly "Rebuild": InetAddress
}

/**
 * Schema for already-constructed resolved internet addresses.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const InetAddress: InetAddress = declare(NetAddress_.isInetAddress, {
  identifier: "InetAddress"
})

/**
 * Type-level representation of {@link InetAddressFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface InetAddressFromString extends decodeTo<InetAddress, String> {
  readonly "Rebuild": InetAddressFromString
}

/**
 * Schema for resolved internet addresses encoded as numeric socket strings.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const InetAddressFromString: InetAddressFromString = netAddressFromString(
  InetAddress,
  NetAddress_.inetAddressFromString,
  NetAddress_.formatInet,
  "InetAddressFromString"
)

/**
 * Type-level representation of {@link UnixPathAddress}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface UnixPathAddress extends declare<NetAddress_.UnixPathAddress> {
  readonly "Rebuild": UnixPathAddress
}

/**
 * Schema for already-constructed Unix-domain filesystem addresses.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const UnixPathAddress: UnixPathAddress = declare(
  NetAddress_.isUnixPathAddress,
  { identifier: "UnixPathAddress" }
)

/**
 * Type-level representation of {@link UnixPathAddressFromString}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface UnixPathAddressFromString extends decodeTo<UnixPathAddress, String> {
  readonly "Rebuild": UnixPathAddressFromString
}

/**
 * Schema for Unix-domain filesystem addresses encoded as opaque path strings.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const UnixPathAddressFromString: UnixPathAddressFromString = String.pipe(decodeTo(
  UnixPathAddress,
  SchemaTransformation.transform({
    decode: NetAddress_.unixPathAddress,
    encode: (address) => address.path
  })
)).annotate({ identifier: "UnixPathAddressFromString" })

/**
 * Type-level representation of {@link SocketAddress}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SocketAddress extends declare<NetAddress_.SocketAddress> {
  readonly "Rebuild": SocketAddress
}

/**
 * Schema for already-constructed portable concrete socket addresses.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const SocketAddress: SocketAddress = declare(NetAddress_.isSocketAddress, {
  identifier: "SocketAddress"
})

// -----------------------------------------------------------------------------
// Duration schemas
// -----------------------------------------------------------------------------

const durationFromString: SchemaTransformation.Transformation<Duration_.Duration, string> = SchemaTransformation
  .transformEffect<Duration_.Duration, string>({
    decode: (s, options) =>
      Option_.match(Duration_.fromInput(s as Duration_.Input), {
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
    encode: (duration) => Effect.succeed(globalThis.String(duration))
  })
const durationFromNanos: SchemaTransformation.Transformation<Duration_.Duration, bigint> = SchemaTransformation
  .transformEffect({
    decode: (i) => Effect.succeed(Duration_.nanos(i)),
    encode: (a, options) =>
      Option_.match(Duration_.toNanos(a), {
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
const durationFromMillis: SchemaTransformation.Transformation<Duration_.Duration, number> = SchemaTransformation
  .transform({
    decode: (i) => Duration_.millis(i),
    encode: (a) => Duration_.toMillis(a)
  })
/**
 * Type-level representation of {@link Duration}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Duration extends declare<Duration_.Duration> {
  readonly "Rebuild": Duration
}
/**
 * Schema for `Duration` values.
 *
 * **Details**
 *
 * The default JSON serializer encodes `Duration` as a tagged object with the
 * duration type and value.
 *
 * **Example** (Defining a Duration schema)
 *
 * ```ts import.meta.vitest
 * import { Duration, Schema } from "effect"
 *
 * Schema.decodeUnknownSync(Schema.Duration)(Duration.seconds(5)) // => Duration.seconds(5)
 * ```
 *
 * @category schemas
 *
 * @since 3.10.0
 */
export const Duration: Duration = declare(
  Duration_.isDuration,
  {
    representation: {
      id: "effect/schema/Duration",
      payload: null
    },
    toCode: () => ({
      runtime: `Schema.Duration`,
      Type: `Duration.Duration`,
      importDeclarations: [`import * as Duration from "effect/Duration"`]
    }),
    expected: "Duration",
    toCodecJson: () =>
      link<Duration_.Duration>()(
        Union([
          Struct({ _tag: Literal("Infinity") }),
          Struct({ _tag: Literal("NegativeInfinity") }),
          Struct({ _tag: Literal("Nanos"), value: BigInt }),
          Struct({ _tag: Literal("Millis"), value: Int })
        ]),
        SchemaTransformation.transform({
          decode: (e) => {
            switch (e._tag) {
              case "Infinity":
                return Duration_.infinity
              case "NegativeInfinity":
                return Duration_.negativeInfinity
              case "Nanos":
                return Duration_.nanos(e.value)
              case "Millis":
                return Duration_.millis(e.value)
            }
          },
          encode: (duration) => {
            switch (duration.value._tag) {
              case "Infinity":
                return { _tag: "Infinity" } as const
              case "NegativeInfinity":
                return { _tag: "NegativeInfinity" } as const
              case "Nanos":
                return { _tag: "Nanos", value: duration.value.nanos } as const
              case "Millis":
                return { _tag: "Millis", value: duration.value.millis } as const
            }
          }
        })
      )
  }
)
const DurationString = String.annotate({ expected: "a string that will be decoded as a Duration" })
/**
 * Type-level representation of {@link DurationFromString}.
 *
 * @category models
 * @since 4.0.0
 */
export interface DurationFromString extends decodeTo<Duration, String> {
  readonly "Rebuild": DurationFromString
}
/**
 * Schema that parses a string into a `Duration`.
 *
 * **Details**
 *
 * Decoding:
 * - A `string` is decoded as a `Duration`, accepting any format that
 *   `Duration.fromInput` can parse.
 *
 * Encoding:
 * - A `Duration` is encoded as a parseable `string`.
 *
 * @category schemas
 * @since 4.0.0
 */
export const DurationFromString: DurationFromString = DurationString.pipe(
  decodeTo(Duration, durationFromString)
)
/**
 * Type-level representation of {@link DurationFromNanos}.
 *
 * @category models
 * @since 3.10.0
 */
export interface DurationFromNanos extends decodeTo<Duration, BigInt> {
  readonly "Rebuild": DurationFromNanos
}
/**
 * Schema that decodes a `bigint` into a `Duration`, treating the bigint as
 * nanoseconds.
 *
 * **Details**
 *
 * Decoding:
 * A `bigint` representing nanoseconds is decoded as a `Duration`.
 *
 * Encoding:
 * Finite durations are encoded as a `bigint` number of nanoseconds. Encoding
 * fails when the duration cannot be represented as nanoseconds, such as
 * `Duration.infinity` or `Duration.negativeInfinity`.
 *
 * @category schemas
 * @since 3.10.0
 */
export const DurationFromNanos: DurationFromNanos = BigInt.pipe(
  decodeTo(Duration, durationFromNanos)
)
/**
 * Type-level representation of {@link DurationFromMillis}.
 *
 * @category models
 * @since 3.10.0
 */
export interface DurationFromMillis extends decodeTo<Duration, Number> {
  readonly "Rebuild": DurationFromMillis
}
/**
 * Schema that decodes a number into a `Duration`, treating the number as
 * milliseconds.
 *
 * **Details**
 *
 * Decoding:
 * - A finite or infinite number is decoded as a `Duration`
 *
 * Encoding:
 * - A `Duration` is encoded to a finite or infinite number of milliseconds
 *
 * **Gotchas**
 *
 * `NaN` is decoded as `Duration.zero`, matching `Duration.millis`.
 *
 * @category schemas
 * @since 3.10.0
 */
export const DurationFromMillis: DurationFromMillis = Number.pipe(
  decodeTo(Duration, durationFromMillis)
)

// -----------------------------------------------------------------------------
// Exit schemas
// -----------------------------------------------------------------------------

/**
 * Type-level representation returned by {@link Exit}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Exit<A extends Constraint, E extends Constraint, D extends Constraint> extends
  declareConstructor<
    Exit_.Exit<A["Type"], E["Type"]>,
    Exit_.Exit<A["Encoded"], E["Encoded"]>,
    readonly [A, E, D],
    ExitIso<A, E, D>
  >
{
  readonly "Rebuild": Exit<A, E, D>
  readonly value: A
  readonly error: E
  readonly defect: D
}
/**
 * Iso representation used for `Exit` schemas.
 *
 * **Details**
 *
 * Successful exits are represented as `{ _tag: "Success", value }`, while failed
 * exits are represented as `{ _tag: "Failure", cause }`.
 *
 * @category utility types
 * @since 4.0.0
 */
export type ExitIso<A extends Constraint, E extends Constraint, D extends Constraint> = {
  readonly _tag: "Success"
  readonly value: A["Iso"]
} | {
  readonly _tag: "Failure"
  readonly cause: CauseIso<E, D>
}
/**
 * Creates a schema for `Exit` values using schemas for the success value, typed
 * failure, and unexpected defect channels.
 *
 * **When to use**
 *
 * Use when serializing or validating an effect outcome where success, typed
 * failure, and defects each need their own schema.
 *
 * @category schemas
 * @since 3.10.0
 */
export function Exit<
  A extends Constraint,
  E extends Constraint,
  D extends Constraint
>(
  value: A,
  error: E,
  defect: D
): Exit<A, E, D> {
  const schema = declareConstructor<
    Exit_.Exit<A["Type"], E["Type"]>,
    Exit_.Exit<A["Encoded"], E["Encoded"]>,
    ExitIso<A, E, D>
  >()(
    [value, error, defect],
    ([value, error, defect]) => {
      const cause = Cause(error, defect)
      return (input, ast, options) => {
        if (!Exit_.isExit(input)) {
          return Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
        }
        switch (input._tag) {
          case "Success":
            return Effect.mapBothEager(
              SchemaParser.decodeUnknownEffect(value)(input.value, options),
              {
                onSuccess: Exit_.succeed,
                onFailure: (issue) => SchemaIssue.makeCompositeAtKey(ast, "value", issue, input, options)
              }
            )
          case "Failure":
            return Effect.mapBothEager(
              SchemaParser.decodeUnknownEffect(cause)(input.cause, options),
              {
                onSuccess: Exit_.failCause,
                onFailure: (issue) => SchemaIssue.makeCompositeAtKey(ast, "cause", issue, input, options)
              }
            )
        }
      }
    },
    {
      representation: {
        id: "effect/schema/Exit",
        payload: null
      },
      toCode: ({ typeParameters }) => ({
        runtime: `Schema.Exit(${typeParameters[0].runtime}, ${typeParameters[1].runtime}, ${
          typeParameters[2].runtime
        })`,
        Type: `Exit.Exit<${typeParameters[0].Type}, ${typeParameters[1].Type}, ${typeParameters[2].Type}>`,
        importDeclarations: [`import * as Exit from "effect/Exit"`]
      }),
      expected: "Exit",
      toCodec: ([value, error, defect]) =>
        link<Exit_.Exit<A["Encoded"], E["Encoded"]>>()(
          Union([
            Struct({ _tag: Literal("Success"), value }),
            Struct({
              _tag: Literal("Failure"),
              cause: Cause(error, defect)
            })
          ]),
          SchemaTransformation.transform({
            decode: (e): Exit_.Exit<A["Encoded"], E["Encoded"]> =>
              e._tag === "Success" ? Exit_.succeed(e.value) : Exit_.failCause(e.cause),
            encode: (exit) =>
              Exit_.isSuccess(exit)
                ? { _tag: "Success", value: exit.value } as const
                : { _tag: "Failure", cause: exit.cause } as const
          })
        )
    }
  )
  return make(schema.ast, { value, error, defect })
}

// -----------------------------------------------------------------------------
// Graph schemas
// -----------------------------------------------------------------------------

/**
 * Encoded representation of an immutable Effect graph.
 *
 * @category models
 * @since 4.0.0
 */
export type EncodedGraph<N, E, T extends Graph_.Kind> = Graph_.Snapshot<N, E, T>
/**
 * Iso representation used for {@link Graph} schemas.
 *
 * @category utility types
 * @since 4.0.0
 */
export type GraphIso<T extends Graph_.Kind, Node extends Constraint, Edge extends Constraint> = EncodedGraph<
  Node["Iso"],
  Edge["Iso"],
  T
>
/**
 * Type-level representation returned by {@link Graph}.
 *
 * @category models
 * @since 4.0.0
 */
export interface Graph<T extends Graph_.Kind, Node extends Constraint, Edge extends Constraint>
  extends
    declareConstructor<
      Graph_.Graph<Node["Type"], Edge["Type"], T>,
      Graph_.Graph<Node["Encoded"], Edge["Encoded"], T>,
      readonly [Node, Edge],
      GraphIso<T, Node, Edge>
    >
{
  readonly "Rebuild": Graph<T, Node, Edge>
  readonly type: T
  readonly node: Node
  readonly edge: Edge
}
function graphEncodedSchema<T extends Graph_.Kind, Node extends Constraint, Edge extends Constraint>(
  type: T,
  node: Node,
  edge: Edge
) {
  return Struct({
    type: Literal(type),
    nodes: ArraySchema(Struct({ index: Natural, data: node })),
    edges: ArraySchema(Struct({ index: Natural, source: Natural, target: Natural, data: edge }))
  })
}
function graphDecode<N, E, T extends Graph_.Kind>(
  input: EncodedGraph<N, E, T>,
  options: SchemaAST.ParseOptions
): Effect.Effect<Graph_.Graph<N, E, T>, SchemaIssue.Issue> {
  let previous = -1
  const indexes = new Set<Graph_.NodeIndex>()
  for (let i = 0; i < input.nodes.length; i++) {
    const index = input.nodes[i].index
    if (index <= previous) {
      return Effect.fail(
        new SchemaIssue.Pointer(
          ["nodes", i, "index"],
          new SchemaIssue.InvalidValue({ expected: "a strictly increasing node index" }, index, options)
        )
      )
    }
    previous = index
    indexes.add(index)
  }

  previous = -1
  for (let i = 0; i < input.edges.length; i++) {
    const edge = input.edges[i]
    if (edge.index <= previous) {
      return Effect.fail(
        new SchemaIssue.Pointer(
          ["edges", i, "index"],
          new SchemaIssue.InvalidValue({ expected: "a strictly increasing edge index" }, edge.index, options)
        )
      )
    }
    previous = edge.index
    if (!indexes.has(edge.source)) {
      return Effect.fail(
        new SchemaIssue.Pointer(
          ["edges", i, "source"],
          new SchemaIssue.InvalidValue({ expected: "an encoded node index" }, edge.source, options)
        )
      )
    }
    if (!indexes.has(edge.target)) {
      return Effect.fail(
        new SchemaIssue.Pointer(
          ["edges", i, "target"],
          new SchemaIssue.InvalidValue({ expected: "an encoded node index" }, edge.target, options)
        )
      )
    }
  }

  return Effect.succeed(InternalGraph.hydrate(input))
}
function graphEncode<N, E, T extends Graph_.Kind>(
  input: Graph_.Graph<N, E, T>,
  type: T,
  options: SchemaAST.ParseOptions
): Effect.Effect<EncodedGraph<N, E, T>, SchemaIssue.Issue> {
  if (!InternalGraph.isGraph(input) || input.mutable || input.type !== type) {
    return Effect.fail(new SchemaIssue.InvalidValue({ expected: `an immutable ${type} Graph` }, input, options))
  }
  return Effect.succeed(InternalGraph.snapshot(input))
}
function graphToEquivalence<N, E, T extends Graph_.Kind>(
  node: Equivalence.Equivalence<N>,
  edge: Equivalence.Equivalence<E>
) {
  return (self: Graph_.Graph<N, E, T>, that: Graph_.Graph<N, E, T>): boolean => {
    const a = InternalGraph.snapshot(self)
    const b = InternalGraph.snapshot(that)
    if (a.type !== b.type || a.nodes.length !== b.nodes.length || a.edges.length !== b.edges.length) return false
    for (let i = 0; i < a.nodes.length; i++) {
      if (a.nodes[i].index !== b.nodes[i].index || !node(a.nodes[i].data, b.nodes[i].data)) return false
    }
    for (let i = 0; i < a.edges.length; i++) {
      const ae = a.edges[i]
      const be = b.edges[i]
      const sameEndpoints = a.type === "directed"
        ? ae.source === be.source && ae.target === be.target
        : (ae.source === be.source && ae.target === be.target) ||
          (ae.source === be.target && ae.target === be.source)
      if (
        ae.index !== be.index || !sameEndpoints || !edge(ae.data, be.data)
      ) return false
    }
    return true
  }
}
type GraphArbitraryRepresentation<N, E> = null | {
  readonly nodes: readonly [N, ...Array<N>]
  readonly edges: ReadonlyArray<readonly [source: number, target: number, data: E]>
}
function graphToArbitrary<N, E, T extends Graph_.Kind>(
  type: T,
  node: Codec<N>,
  edge: Codec<E>
) {
  return linkDecoding<Graph_.Graph<N, E, T>>()(
    Union([
      Null,
      Struct({
        nodes: NonEmptyArray(node),
        edges: ArraySchema(Tuple([Natural, Natural, edge]))
      })
    ]),
    SchemaGetter.transform<Graph_.Graph<N, E, T>, GraphArbitraryRepresentation<N, E>>((input) => {
      if (input === null) return InternalGraph.hydrate({ type, nodes: [], edges: [] })
      const nodes = input.nodes.map((data, index) => ({ index, data }))
      return InternalGraph.hydrate({
        type,
        nodes,
        edges: input.edges.map(([source, target, data], index) => ({
          index,
          source: source % nodes.length,
          target: target % nodes.length,
          data
        }))
      })
    })
  )
}
/**
 * Creates a schema for immutable directed or undirected Effect graphs.
 *
 * **Details**
 *
 * Encoding preserves active node and edge indexes, payloads, endpoints,
 * isolated nodes, self-loops, parallel edges, and stored edge orientation. It
 * does not encode removed-ID allocator history; after decoding, future allocation starts
 * after the highest active decoded index. Encoding rejects mutable graphs.
 * `Graph.toJSON()` remains an inspection summary and is not this wire format.
 *
 * **Example** (Encoding a directed graph as JSON)
 *
 * ```ts import.meta.vitest
 * import { Graph, Schema } from "effect"
 *
 * const codec = Schema.toCodecJson(Schema.Graph("directed", Schema.String, Schema.Number))
 * const graph = Graph.directed<string, number>((mutable) => {
 *   const source = Graph.addNode(mutable, "A")
 *   const target = Graph.addNode(mutable, "B")
 *   Graph.addEdge(mutable, source, target, 1)
 * })
 *
 * const encoded = Schema.encodeSync(codec)(graph)
 *
 * encoded.type // => "directed"
 * encoded.nodes // => [{ index: 0, data: "A" }, { index: 1, data: "B" }]
 * encoded.edges // => [{ index: 0, source: 0, target: 1, data: 1 }]
 * ```
 *
 * @category schemas
 * @since 4.0.0
 */
export function Graph<Node extends Constraint, Edge extends Constraint>(
  type: "directed",
  node: Node,
  edge: Edge
): Graph<"directed", Node, Edge>
export function Graph<Node extends Constraint, Edge extends Constraint>(
  type: "undirected",
  node: Node,
  edge: Edge
): Graph<"undirected", Node, Edge>
export function Graph<T extends Graph_.Kind, Node extends Constraint, Edge extends Constraint>(
  type: T,
  node: Node,
  edge: Edge
): Graph<T, Node, Edge>
export function Graph<T extends Graph_.Kind, Node extends Constraint, Edge extends Constraint>(
  type: T,
  node: Node,
  edge: Edge
): Graph<T, Node, Edge> {
  const schema = declareConstructor<
    Graph_.Graph<Node["Type"], Edge["Type"], T>,
    Graph_.Graph<Node["Encoded"], Edge["Encoded"], T>,
    GraphIso<T, Node, Edge>
  >()(
    [node, edge],
    ([node, edge]) => {
      const encoded = graphEncodedSchema(type, node, edge)
      return (input, ast, options) => {
        if (!InternalGraph.isGraph(input) || input.mutable || input.type !== type) {
          return Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
        }
        return Effect.flatMap(
          SchemaParser.decodeUnknownEffect(encoded)(InternalGraph.snapshot(input), options),
          (snapshot) => graphDecode(snapshot, options)
        )
      }
    },
    {
      representation: {
        id: "effect/schema/Graph",
        payload: type
      },
      toCode: ({ typeParameters }) => ({
        runtime: `Schema.Graph(${format(type)}, ${typeParameters[0].runtime}, ${typeParameters[1].runtime})`,
        Type: `Graph.Graph<${typeParameters[0].Type}, ${typeParameters[1].Type}, ${format(type)}>`,
        importDeclarations: [`import * as Graph from "effect/Graph"`]
      }),
      expected: `an immutable ${type} Graph`,
      toCodec: ([node, edge]) =>
        link<Graph_.Graph<Node["Encoded"], Edge["Encoded"], T>>()(
          graphEncodedSchema(type, node, edge),
          SchemaTransformation.transformEffect({
            decode: graphDecode,
            encode: (graph, options) => graphEncode(graph, type, options)
          })
        ),
      toCodecArbitrary: ({ typeParameters: [node, edge] }) => graphToArbitrary(type, node, edge),
      toEquivalence: ([node, edge]) => graphToEquivalence(node, edge)
    }
  )
  return make(schema.ast, { type, node, edge })
}

// -----------------------------------------------------------------------------
// HashMap schemas
// -----------------------------------------------------------------------------

function hashMapLink<Key, Value>(entries: Schema<ReadonlyArray<readonly [Key, Value]>>) {
  return link<HashMap_.HashMap<Key, Value>>()(
    entries,
    SchemaTransformation.transform({
      decode: HashMap_.fromIterable,
      encode: HashMap_.toEntries
    })
  )
}
/**
 * Type-level representation returned by {@link HashMap}.
 *
 * @category models
 * @since 3.10.0
 */
export interface HashMap<Key extends Constraint, Value extends Constraint> extends
  declareConstructor<
    HashMap_.HashMap<Key["Type"], Value["Type"]>,
    HashMap_.HashMap<Key["Encoded"], Value["Encoded"]>,
    readonly [Key, Value],
    HashMapIso<Key, Value>
  >
{
  readonly "Rebuild": HashMap<Key, Value>
  readonly key: Key
  readonly value: Value
}
/**
 * Iso representation used for `HashMap` schemas: an array of readonly
 * `[key, value]` tuples using each entry schema's `Iso` type.
 *
 * @category utility types
 * @since 4.0.0
 */
export type HashMapIso<Key extends Constraint, Value extends Constraint> = ReadonlyArray<
  readonly [Key["Iso"], Value["Iso"]]
>
/**
 * Schema for hash maps whose keys and values conform to the provided schemas.
 *
 * @category schemas
 * @since 3.10.0
 */
export function HashMap<Key extends Constraint, Value extends Constraint>(key: Key, value: Value): HashMap<Key, Value> {
  const schema = declareConstructor<
    HashMap_.HashMap<Key["Type"], Value["Type"]>,
    HashMap_.HashMap<Key["Encoded"], Value["Encoded"]>,
    HashMapIso<Key, Value>
  >()(
    [key, value],
    ([key, value]) => {
      const entries = ArraySchema(Tuple([key, value]))
      return (input, ast, options) => {
        if (HashMap_.isHashMap(input)) {
          return Effect.mapBothEager(
            SchemaParser.decodeUnknownEffect(entries)(HashMap_.toEntries(input), options),
            {
              onSuccess: HashMap_.fromIterable,
              onFailure: (issue) => SchemaIssue.makeCompositeAtKey(ast, "entries", issue, input, options)
            }
          )
        }
        return Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
      }
    },
    {
      representation: {
        id: "effect/schema/HashMap",
        payload: null
      },
      toCode: ({ typeParameters }) => ({
        runtime: `Schema.HashMap(${typeParameters[0].runtime}, ${typeParameters[1].runtime})`,
        Type: `HashMap.HashMap<${typeParameters[0].Type}, ${typeParameters[1].Type}>`,
        importDeclarations: [`import * as HashMap from "effect/HashMap"`]
      }),
      expected: "HashMap",
      toCodec: ([key, value]) => hashMapLink(ArraySchema(Tuple([key, value]))),
      toCodecArbitrary: ({ constraint, typeParameters: [key, value] }) =>
        hashMapLink(
          withArrayLengthConstraints(
            ArraySchema(Tuple([key, value])).check(isUniqueKey()),
            constraint?.minSize,
            constraint?.maxSize
          )
        ),
      toEquivalence: ([key, value]) => Equal.makeCompareMap(key, value)
    }
  )
  return make(schema.ast, { key, value })
}

// -----------------------------------------------------------------------------
// HashSet schemas
// -----------------------------------------------------------------------------

function hashSetLink<Value>(values: Schema<ReadonlyArray<Value>>) {
  return link<HashSet_.HashSet<Value>>()(
    values,
    SchemaTransformation.transform({
      decode: HashSet_.fromIterable,
      encode: Arr.fromIterable
    })
  )
}
/**
 * Type-level representation returned by {@link HashSet}.
 *
 * @category models
 * @since 3.10.0
 */
export interface HashSet<Value extends Constraint> extends
  declareConstructor<
    HashSet_.HashSet<Value["Type"]>,
    HashSet_.HashSet<Value["Encoded"]>,
    readonly [Value],
    HashSetIso<Value>
  >
{
  readonly "Rebuild": HashSet<Value>
  readonly value: Value
}
/**
 * Iso representation used for `HashSet` schemas: an array of element values
 * using the element schema's `Iso` type.
 *
 * @category utility types
 * @since 4.0.0
 */
export type HashSetIso<Value extends Constraint> = ReadonlyArray<Value["Iso"]>
/**
 * Schema for hash sets whose values conform to the provided element schema.
 *
 * @category schemas
 * @since 3.10.0
 */
export function HashSet<Value extends Constraint>(value: Value): HashSet<Value> {
  const schema = declareConstructor<
    HashSet_.HashSet<Value["Type"]>,
    HashSet_.HashSet<Value["Encoded"]>,
    HashSetIso<Value>
  >()(
    [value],
    ([value]) => {
      const values = ArraySchema(value)
      return (input, ast, options) => {
        if (HashSet_.isHashSet(input)) {
          return Effect.mapBothEager(
            SchemaParser.decodeUnknownEffect(values)(Arr.fromIterable(input), options),
            {
              onSuccess: HashSet_.fromIterable,
              onFailure: (issue) => SchemaIssue.makeCompositeAtKey(ast, "values", issue, input, options)
            }
          )
        }
        return Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
      }
    },
    {
      representation: {
        id: "effect/schema/HashSet",
        payload: null
      },
      toCode: ({ typeParameters }) => ({
        runtime: `Schema.HashSet(${typeParameters[0].runtime})`,
        Type: `HashSet.HashSet<${typeParameters[0].Type}>`
      }),
      expected: "HashSet",
      toCodec: ([value]) => hashSetLink(ArraySchema(value)),
      toCodecArbitrary: ({ constraint, typeParameters: [value] }) =>
        hashSetLink(
          withArrayLengthConstraints(
            ArraySchema(value).check(isUnique()),
            constraint?.minSize,
            constraint?.maxSize
          )
        ),
      toEquivalence: ([value]) => Equal.makeCompareSet(value)
    }
  )
  return make(schema.ast, { value })
}

// -----------------------------------------------------------------------------
// Option schemas
// -----------------------------------------------------------------------------

/**
 * Type-level representation returned by {@link Option}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Option<A extends Constraint> extends
  declareConstructor<
    Option_.Option<A["Type"]>,
    Option_.Option<A["Encoded"]>,
    readonly [A],
    OptionIso<A>
  >
{
  readonly "Rebuild": Option<A>
  readonly value: A
}
/**
 * Iso representation used for `Option` schemas.
 *
 * **Details**
 *
 * `None` is represented as `{ _tag: "None" }`, while `Some` is represented as
 * `{ _tag: "Some", value }` using the wrapped schema's `Iso` type.
 *
 * @category utility types
 * @since 4.0.0
 */
export type OptionIso<A extends Constraint> = {
  readonly _tag: "None"
} | {
  readonly _tag: "Some"
  readonly value: A["Iso"]
}
/**
 * Schema for `Option<A>` values.
 *
 * @category schemas
 * @since 3.10.0
 */
export function Option<A extends Constraint>(value: A): Option<A> {
  const schema = declareConstructor<
    Option_.Option<A["Type"]>,
    Option_.Option<A["Encoded"]>,
    OptionIso<A>
  >()(
    [value],
    ([value]) => (input, ast, options) => {
      if (Option_.isOption(input)) {
        if (Option_.isNone(input)) {
          return Effect.succeedNone
        }
        return Effect.mapBothEager(
          SchemaParser.decodeUnknownEffect(value)(input.value, options),
          {
            onSuccess: Option_.some,
            onFailure: (issue) => SchemaIssue.makeCompositeAtKey(ast, "value", issue, input, options)
          }
        )
      }
      return Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
    },
    {
      representation: {
        id: "effect/schema/Option",
        payload: null
      },
      toCode: ({ typeParameters }) => ({
        runtime: `Schema.Option(${typeParameters[0].runtime})`,
        Type: `Option.Option<${typeParameters[0].Type}>`,
        importDeclarations: [`import * as Option from "effect/Option"`]
      }),
      expected: "Option",
      toCodec: ([value]) =>
        link<Option_.Option<A["Encoded"]>>()(
          Union([
            Struct({ _tag: Literal("Some"), value }),
            Struct({ _tag: Literal("None") })
          ]),
          SchemaTransformation.transform({
            decode: (e) => e._tag === "None" ? Option_.none() : Option_.some(e.value),
            encode: (o) => (Option_.isSome(o) ? { _tag: "Some", value: o.value } as const : { _tag: "None" } as const)
          })
        )
    }
  )
  return make(schema.ast, { value })
}
/**
 * Type-level representation returned by {@link OptionFromNullOr}.
 *
 * @category models
 * @since 3.10.0
 */
export interface OptionFromNullOr<S extends Constraint> extends decodeTo<Option<toType<S>>, NullOr<S>> {
  readonly "Rebuild": OptionFromNullOr<S>
}
/**
 * Decodes a nullable, required value `T` to a required `Option<T>` value.
 *
 * **Details**
 *
 * Decoding maps `null` to `None` and all other values to `Some`. Encoding maps
 * `None` to `null` and maps `Some` to its value.
 *
 * @category schemas
 * @since 3.10.0
 */
export function OptionFromNullOr<S extends Constraint>(schema: S): OptionFromNullOr<S> {
  return NullOr(schema).pipe(decodeTo(
    Option(toType(schema)),
    SchemaTransformation.optionFromNullOr()
  ))
}
/**
 * Type-level representation returned by {@link OptionFromUndefinedOr}.
 *
 * @category models
 * @since 3.10.0
 */
export interface OptionFromUndefinedOr<S extends Constraint> extends decodeTo<Option<toType<S>>, UndefinedOr<S>> {
  readonly "Rebuild": OptionFromUndefinedOr<S>
}
/**
 * Decodes a required value that may be `undefined` to a required `Option<T>`
 * value.
 *
 * **Details**
 *
 * Decoding maps `undefined` to `None` and all other values to `Some`. Encoding
 * maps `None` to `undefined` and maps `Some` to its value.
 *
 * @category schemas
 * @since 3.10.0
 */
export function OptionFromUndefinedOr<S extends Constraint>(schema: S): OptionFromUndefinedOr<S> {
  return UndefinedOr(schema).pipe(decodeTo(
    Option(toType(schema)),
    SchemaTransformation.optionFromUndefinedOr()
  ))
}
/**
 * Type-level representation returned by {@link OptionFromNullishOr}.
 *
 * @category models
 * @since 3.10.0
 */
export interface OptionFromNullishOr<S extends Constraint> extends decodeTo<Option<toType<S>>, NullishOr<S>> {
  readonly "Rebuild": OptionFromNullishOr<S>
}
/**
 * Decodes a nullish value `T` to a required `Option<T>` value.
 *
 * **Details**
 *
 * Decoding maps `null` and `undefined` to `None` and all other values to
 * `Some`. Encoding maps `None` to `null` or `undefined` depending on
 * `options.onNoneEncoding`, which defaults to `undefined`, and maps `Some` to
 * its value.
 *
 * @category schemas
 * @since 3.10.0
 */
export function OptionFromNullishOr<S extends Constraint>(
  schema: S,
  options?: {
    onNoneEncoding: null | undefined
  }
): OptionFromNullishOr<S> {
  return NullishOr(schema).pipe(decodeTo(
    Option(toType(schema)),
    SchemaTransformation.optionFromNullishOr(options)
  ))
}

/**
 * Type-level representation of {@link Cookie}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Cookie extends declare<Cookies_.Cookie> {
  readonly "Rebuild": Cookie
}

/**
 * Schema for HTTP cookie values.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Cookie: Cookie = declare(
  Cookies_.isCookie,
  {
    representation: {
      id: "effect/http/Cookie",
      payload: null
    },
    toCode: () => ({
      runtime: "Schema.Cookie",
      Type: "Cookies.Cookie",
      importDeclarations: [`import * as Cookies from "effect/http/Cookies"`]
    }),
    expected: "Cookie"
  }
)

/**
 * Type-level representation of {@link Cookies}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Cookies extends
  declare<
    Cookies_.Cookies,
    Record_.ReadonlyRecord<string, Cookies_.Cookie>
  >
{
  readonly "Rebuild": Cookies
}

/**
 * Schema for HTTP cookie collections.
 *
 * **Details**
 *
 * JSON encoding uses `Set-Cookie` header strings, while isomorphic encoding uses
 * a readonly record of cookie values.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Cookies: Cookies = declare(
  Cookies_.isCookies,
  {
    representation: {
      id: "effect/http/Cookies",
      payload: null
    },
    toCode: () => ({
      runtime: "Schema.Cookies",
      Type: "Cookies.Cookies",
      importDeclarations: [`import * as Cookies from "effect/http/Cookies"`]
    }),
    expected: "Cookies",
    toCodecJson: () =>
      link<Cookies_.Cookies>()(
        ArraySchema(String),
        SchemaTransformation.transform<Cookies_.Cookies, ReadonlyArray<string>>({
          decode: Cookies_.fromSetCookie,
          encode: Cookies_.toSetCookieHeaders
        })
      ),
    toCodecIso: () =>
      link<Cookies_.Cookies>()(
        Record(String, Cookie),
        SchemaTransformation.transform({
          decode: Cookies_.fromReadonlyRecord,
          encode: (cookies) => cookies.cookies
        })
      )
  }
)

/**
 * Type-level representation of {@link RecordFromCookies}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface RecordFromCookies extends decodeTo<$Record<String, String>, Cookies> {
  readonly "Rebuild": RecordFromCookies
}

/**
 * Schema that decodes HTTP cookies into a record of decoded string values keyed
 * by cookie name.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const RecordFromCookies: RecordFromCookies = Cookies.pipe(
  decodeTo(
    Record(String, String),
    SchemaTransformation.transform({
      decode: Cookies_.toRecord,
      encode: (self) =>
        Cookies_.fromIterable(
          globalThis.Object.entries(self).map(([name, value]) => Cookies_.makeCookieUnsafe(name, value))
        )
    })
  )
)

/**
 * Type-level representation of {@link Headers}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Headers extends declare<Headers_.Headers, { readonly [x: string]: string }> {
  readonly "Rebuild": Headers
}

/**
 * Schema for HTTP headers encoded as records of string values.
 *
 * **Details**
 *
 * Decoding normalizes header names; encoding returns a plain record.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Headers: Headers = declare(
  Headers_.isHeaders,
  {
    representation: {
      id: "effect/http/Headers",
      payload: null
    },
    toCode: () => ({
      runtime: "Schema.Headers",
      Type: "Headers.Headers",
      importDeclarations: [`import * as Headers from "effect/http/Headers"`]
    }),
    expected: "Headers",
    toEquivalence: () => Headers_.Equivalence,
    toCodec: () =>
      link<Headers_.Headers>()(
        Record(String, String),
        SchemaTransformation.transform<Headers_.Headers, { readonly [x: string]: string }>({
          decode: Headers_.fromInput,
          encode: (headers) => ({ ...headers })
        })
      )
  }
)

/**
 * Type-level representation of {@link UrlParams}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface UrlParams extends
  declare<
    UrlParams_.UrlParams,
    ReadonlyArray<readonly [string, string]>
  >
{
  readonly "Rebuild": UrlParams
}

/**
 * Schema for HTTP URL parameters.
 *
 * **Details**
 *
 * The encoded representation is an array of string key-value tuples.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const UrlParams: UrlParams = declare(
  UrlParams_.isUrlParams,
  {
    representation: {
      id: "effect/http/UrlParams",
      payload: null
    },
    toCode: () => ({
      runtime: "Schema.UrlParams",
      Type: "UrlParams.UrlParams",
      importDeclarations: [`import * as UrlParams from "effect/http/UrlParams"`]
    }),
    expected: "UrlParams",
    toEquivalence: () => UrlParams_.Equivalence,
    toCodec: () =>
      link<UrlParams_.UrlParams>()(
        ArraySchema(Tuple([String, String])),
        SchemaTransformation.transform({
          decode: UrlParams_.make,
          encode: (self) => self.params
        })
      )
  }
)

/**
 * Type-level representation of {@link JsonFromUrlParamsField}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface JsonFromUrlParamsField extends decodeTo<fromJsonString<Unknown>, UrlParams> {
  readonly "Rebuild": JsonFromUrlParamsField
}

/**
 * Extracts a JSON value from the first occurrence of the given `field` in URL
 * parameters.
 *
 * **Example** (Decoding a JSON parameter field)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { UrlParams } from "effect/http"
 *
 * const extractFoo = Schema.JsonFromUrlParamsField("foo").pipe(
 *   Schema.decodeTo(Schema.Struct({
 *     some: Schema.String,
 *     number: Schema.Number
 *   }))
 * )
 *
 * const decoded = Schema.decodeSync(extractFoo)(UrlParams.fromInput({
 *   foo: `{"some":"bar","number":42}`,
 *   baz: "qux"
 * }))
 * const result = [decoded.some, decoded.number] // => ["bar", 42]
 * ```
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const JsonFromUrlParamsField = (
  field: string,
  options?: { readonly reviver?: Parameters<typeof JSON.parse>[1] | undefined } | undefined
): JsonFromUrlParamsField =>
  UrlParams.pipe(
    decodeTo(
      fromJsonString(Unknown, options),
      SchemaTransformation.transformEffect({
        decode: (params) =>
          Option_.match(UrlParams_.getFirst(params, field), {
            onNone: () => Effect.fail(new SchemaIssue.Pointer([field], new SchemaIssue.MissingKey(undefined))),
            onSome: Effect.succeed
          }),
        encode: (value) => Effect.succeed(UrlParams_.make([[field, value]]))
      })
    )
  )

/**
 * Type-level representation of {@link RecordFromUrlParams}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface RecordFromUrlParams extends
  decodeTo<
    $Record<String, Union<readonly [String, NonEmptyArray<String>]>>,
    UrlParams,
    never,
    never
  >
{
  readonly "Rebuild": RecordFromUrlParams
}

/**
 * Schema that decodes URL parameters into a record of string values.
 *
 * **Details**
 *
 * Keys with one value decode to a string, and keys with multiple values decode to
 * a non-empty readonly array of strings.
 *
 * **Example** (Decoding URL parameters to a record)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { UrlParams } from "effect/http"
 *
 * const toStruct = Schema.RecordFromUrlParams.pipe(
 *   Schema.decodeTo(Schema.Struct({
 *     some: Schema.String,
 *     number: Schema.FiniteFromString
 *   }))
 * )
 *
 * const decoded = Schema.decodeSync(toStruct)(UrlParams.fromInput({
 *   some: "value",
 *   number: 42
 * }))
 * const result = [decoded.some, decoded.number] // => ["value", 42]
 * ```
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const RecordFromUrlParams: RecordFromUrlParams = UrlParams.pipe(
  decodeTo(
    Record(
      String,
      Union([String, NonEmptyArray(String)])
    ),
    SchemaTransformation.transform({
      decode: UrlParams_.toReadonlyRecord,
      encode: UrlParams_.fromInput
    })
  )
)

/**
 * Type-level representation returned by {@link OptionFromOptionalKey}.
 *
 * @category models
 * @since 4.0.0
 */
export interface OptionFromOptionalKey<S extends Constraint> extends decodeTo<Option<toType<S>>, optionalKey<S>> {
  readonly "Rebuild": OptionFromOptionalKey<S>
}
/**
 * Decodes an optional value `A` to a required `Option<A>` value.
 *
 * **Details**
 *
 * Decoding maps a missing key to `None` and a present value to `Some`.
 * Encoding maps `None` to a missing key and maps `Some` to its value.
 *
 * @category schemas
 * @since 4.0.0
 */
export function OptionFromOptionalKey<S extends Constraint>(schema: S): OptionFromOptionalKey<S> {
  return optionalKey(schema).pipe(decodeTo(
    Option(toType(schema)),
    SchemaTransformation.optionFromOptionalKey()
  ))
}
/**
 * Type-level representation returned by {@link OptionFromOptional}.
 *
 * @category models
 * @since 4.0.0
 */
export interface OptionFromOptional<S extends Constraint> extends decodeTo<Option<toType<S>>, optional<S>> {
  readonly "Rebuild": OptionFromOptional<S>
}
/**
 * Decodes an optional or `undefined` value `A` to a required `Option<A>`
 * value.
 *
 * **Details**
 *
 * Decoding maps a missing key or a present `undefined` value to `None`, and
 * maps all other values to `Some`. Encoding maps `None` to a missing key and
 * maps `Some` to its value.
 *
 * @category schemas
 * @since 4.0.0
 */
export function OptionFromOptional<S extends Constraint>(schema: S): OptionFromOptional<S> {
  return optional(schema).pipe(decodeTo(
    Option(toType(schema)),
    SchemaTransformation.optionFromOptional<any>()
  ))
}
/**
 * Type-level representation returned by {@link OptionFromOptionalNullOr}.
 *
 * @category models
 * @since 4.0.0
 */
export interface OptionFromOptionalNullOr<S extends Constraint>
  extends decodeTo<Option<toType<S>>, optional<NullOr<S>>>
{
  readonly "Rebuild": OptionFromOptionalNullOr<S>
}
/**
 * Decodes an optional or `null` or `undefined` value `A` to a required `Option<A>`
 * value.
 *
 * **Details**
 *
 * Decoding maps a missing key, `undefined`, or `null` to `None`, and maps all
 * other values to `Some`. Encoding maps `Some` to its value. `None` is encoded
 * according to `options.onNoneEncoding`: `"omit"` encodes a missing key,
 * `null` encodes `null`, and `undefined` encodes `undefined`.
 *
 * @category schemas
 * @since 4.0.0
 */
export function OptionFromOptionalNullOr<S extends Constraint>(
  schema: S,
  options?: {
    readonly onNoneEncoding: "omit" | null | undefined
  }
): OptionFromOptionalNullOr<S> {
  const onNoneEncoding = options === undefined ? "omit" : options.onNoneEncoding
  const noneValue = onNoneEncoding === null
    ? null as S["Type"] | null | undefined
    : undefined as S["Type"] | null | undefined
  return optional(NullOr(schema)).pipe(decodeTo(
    Option(toType(schema)),
    SchemaTransformation.transformOptional<Option_.Option<S["Type"]>, S["Type"] | null | undefined>({
      decode: (oe) => oe.pipe(Option_.filter(Predicate.isNotNullish), Option_.some),
      encode: onNoneEncoding === "omit"
        ? Option_.flatten
        : (ot) => Option_.some(Option_.getOrElse(Option_.flatten(ot), () => noneValue))
    })
  ))
}

// -----------------------------------------------------------------------------
// Redacted schemas
// -----------------------------------------------------------------------------

/**
 * Type-level representation returned by {@link Redacted}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Redacted<S extends Constraint> extends
  declareConstructor<
    Redacted_.Redacted<S["Type"]>,
    Redacted_.Redacted<S["Encoded"]>,
    readonly [S]
  >
{
  readonly "Rebuild": Redacted<S>
  readonly value: S
}
type NormalizedRedactedOptions =
  | { readonly label: string }
  | { readonly disallowJsonEncode: true }
  | { readonly label: string; readonly disallowJsonEncode: true }
/**
 * Schema for `Redacted` values, which hide their contents from inspection.
 *
 * **Details**
 *
 * Options:
 *
 * - `label`: When provided, the schema will behave as follows:
 *   - Values will be validated against the label in addition to the wrapped schema
 *   - The default JSON serializer will deserialize into a `Redacted` instance with the label
 *   - The arbitrary generator will produce a `Redacted` instance with the label
 *   - The formatter will return the label
 * - `disallowJsonEncode`: When set to `true`, when attempting to encode a `Redacted` instance
 *   into JSON, it will fail with an error. This is useful when the wrapped schema is
 *   sensitive and should not be exposed in JSON.
 *
 * @see {@link RedactedFromValue} for decoding raw values and wrapping them in `Redacted`.
 * @category schemas
 * @since 3.10.0
 */
export function Redacted<S extends Constraint>(value: S, options?: {
  readonly label?: string | undefined
  readonly disallowJsonEncode?: boolean | undefined
}): Redacted<S> {
  const label = typeof options?.label === "string" ? options.label : undefined
  const disallowJsonEncode = options?.disallowJsonEncode === true
  const normalizedOptions: NormalizedRedactedOptions | undefined = label !== undefined
    ? disallowJsonEncode ? { label, disallowJsonEncode: true } : { label }
    : disallowJsonEncode
    ? { disallowJsonEncode: true }
    : undefined
  const decodeLabel = label !== undefined
    ? SchemaParser.decodeUnknownEffect(Literal(label))
    : undefined
  const schema = declareConstructor<Redacted_.Redacted<S["Type"]>, Redacted_.Redacted<S["Encoded"]>>()(
    [value],
    ([value]) => (input, ast, poptions) => {
      if (Redacted_.isRedacted(input)) {
        const label: Effect.Effect<void, SchemaIssue.Issue, never> = decodeLabel !== undefined
          ? Effect.mapErrorEager(
            decodeLabel(input.label, poptions),
            (issue) => new SchemaIssue.Pointer(["label"], issue)
          )
          : Effect.void
        return Effect.flatMapEager(
          label,
          () =>
            Effect.mapBothEager(
              SchemaParser.decodeUnknownEffect(value)(Redacted_.value(input), poptions),
              {
                onSuccess: (value) => Redacted_.make(value, { label: input.label }),
                onFailure: () => {
                  return new SchemaIssue.Composite(
                    ast,
                    [
                      new SchemaIssue.Pointer(
                        ["value"],
                        new SchemaIssue.InvalidValue(undefined, input, poptions)
                      )
                    ],
                    input,
                    poptions
                  )
                }
              }
            )
        )
      }
      return Effect.fail(new SchemaIssue.InvalidType(ast, input, poptions))
    },
    {
      representation: {
        id: "effect/schema/Redacted",
        payload: normalizedOptions ?? null
      },
      toCode: ({ typeParameters }) => ({
        runtime: normalizedOptions !== undefined
          ? `Schema.Redacted(${typeParameters[0].runtime}, ${format(normalizedOptions)})`
          : `Schema.Redacted(${typeParameters[0].runtime})`,
        Type: `Redacted.Redacted<${typeParameters[0].Type}>`,
        importDeclarations: [`import * as Redacted from "effect/Redacted"`]
      }),
      expected: "Redacted",
      toCodecJson: ([value]) =>
        link<Redacted_.Redacted<S["Encoded"]>>()(
          value,
          {
            decode: SchemaGetter.transform((e) => Redacted_.make(e, { label })),
            encode: disallowJsonEncode ?
              SchemaGetter.forbidden((oe) =>
                "Cannot serialize Redacted" +
                (Option_.isSome(oe) && typeof oe.value.label === "string" ? ` with label: "${oe.value.label}"` : "")
              ) :
              SchemaGetter.transform(Redacted_.value)
          }
        ),
      toEquivalence: ([value]) => Redacted_.makeEquivalence(value)
    }
  )
  return make(schema.ast, { value })
}
/**
 * Type-level representation returned by {@link RedactedFromValue}.
 *
 * @category models
 * @since 4.0.0
 */
export interface RedactedFromValue<S extends Constraint> extends decodeTo<Redacted<toType<S>>, S> {
  readonly "Rebuild": RedactedFromValue<S>
}
/**
 * Decodes a value and wraps it in `Redacted<A>`. Unlike {@link Redacted} which
 * expects the input to already be a `Redacted` instance, this schema decodes
 * the raw value and wraps it.
 *
 * @see {@link Redacted} for schemas whose input is already a `Redacted` value.
 * @category schemas
 * @since 4.0.0
 */
export function RedactedFromValue<S extends Constraint>(value: S, options?: {
  readonly label?: string | undefined
  readonly disallowEncode?: boolean | undefined
}): RedactedFromValue<S> {
  return decodeTo<Redacted<toType<S>>, S>(
    Redacted(toType(value), {
      label: options?.label,
      disallowJsonEncode: options?.disallowEncode
    }),
    {
      decode: SchemaGetter.transform((t) => Redacted_.make(t, { label: options?.label })),
      encode: options?.disallowEncode ?
        SchemaGetter.forbidden((oe) =>
          "Cannot encode Redacted" +
          (Option_.isSome(oe) && typeof oe.value.label === "string" ? ` with label: "${oe.value.label}"` : "")
        ) :
        SchemaGetter.transform(Redacted_.value)
    }
  )(value)
}

// -----------------------------------------------------------------------------
// Result schemas
// -----------------------------------------------------------------------------

/**
 * Type-level representation returned by {@link Result}.
 *
 * @category models
 * @since 4.0.0
 */
export interface Result<A extends Constraint, E extends Constraint> extends
  declareConstructor<
    Result_.Result<A["Type"], E["Type"]>,
    Result_.Result<A["Encoded"], E["Encoded"]>,
    readonly [A, E],
    ResultIso<A, E>
  >
{
  readonly "Rebuild": Result<A, E>
  readonly success: A
  readonly failure: E
}
/**
 * Iso representation used for `Result` schemas.
 *
 * **Details**
 *
 * Successful results are represented as `{ _tag: "Success", success }`, while
 * failed results are represented as `{ _tag: "Failure", failure }`.
 *
 * @category utility types
 * @since 4.0.0
 */
export type ResultIso<A extends Constraint, E extends Constraint> = {
  readonly _tag: "Success"
  readonly success: A["Iso"]
} | {
  readonly _tag: "Failure"
  readonly failure: E["Iso"]
}
/**
 * Schema for `Result<A, E>` values.
 *
 * @category schemas
 * @since 4.0.0
 */
export function Result<A extends Constraint, E extends Constraint>(
  success: A,
  failure: E
): Result<A, E> {
  const schema = declareConstructor<
    Result_.Result<A["Type"], E["Type"]>,
    Result_.Result<A["Encoded"], E["Encoded"]>,
    ResultIso<A, E>
  >()(
    [success, failure],
    ([success, failure]) => (input, ast, options) => {
      if (!Result_.isResult(input)) {
        return Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
      }
      switch (input._tag) {
        case "Success":
          return Effect.mapBothEager(SchemaParser.decodeEffect(success)(input.success, options), {
            onSuccess: Result_.succeed,
            onFailure: (issue) => SchemaIssue.makeCompositeAtKey(ast, "success", issue, input, options)
          })
        case "Failure":
          return Effect.mapBothEager(SchemaParser.decodeEffect(failure)(input.failure, options), {
            onSuccess: Result_.fail,
            onFailure: (issue) => SchemaIssue.makeCompositeAtKey(ast, "failure", issue, input, options)
          })
      }
    },
    {
      representation: {
        id: "effect/schema/Result",
        payload: null
      },
      toCode: ({ typeParameters }) => ({
        runtime: `Schema.Result(${typeParameters[0].runtime}, ${typeParameters[1].runtime})`,
        Type: `Result.Result<${typeParameters[0].Type}, ${typeParameters[1].Type}>`,
        importDeclarations: [`import * as Result from "effect/Result"`]
      }),
      expected: "Result",
      toCodec: ([success, failure]) =>
        link<Result_.Result<A["Encoded"], E["Encoded"]>>()(
          Union([
            Struct({ _tag: Literal("Success"), success }),
            Struct({ _tag: Literal("Failure"), failure })
          ]),
          SchemaTransformation.transform({
            decode: (e): Result_.Result<A["Encoded"], E["Encoded"]> =>
              e._tag === "Success" ? Result_.succeed(e.success) : Result_.fail(e.failure),
            encode: (r) =>
              Result_.isSuccess(r)
                ? { _tag: "Success", success: r.success } as const
                : { _tag: "Failure", failure: r.failure } as const
          })
        )
    }
  )
  return make(schema.ast, { success, failure })
}

/**
 * Type-level representation returned by {@link Class}.
 *
 * @category models
 * @since 3.10.0
 */
export interface Class<Self, S extends Constraint & { readonly fields: Struct.Fields }, Inherited>
  extends
    BottomLazyWithoutNew<
      SchemaAST.Declaration,
      decodeTo<declareConstructor<Self, S["Encoded"], readonly [S], S["Iso"]>, S>,
      readonly [S],
      S["~type.mutability"],
      S["~type.optionality"],
      S["~type.constructor.default"],
      S["~encoded.mutability"],
      S["~encoded.optionality"]
    >
{
  /**
   * `make`, `makeOption`, and `makeEffect` preserve an existing instance of
   * this class. Use `new` when a distinct instance is required.
   */
  readonly "Type": Self
  readonly "Encoded": S["Encoded"]
  readonly "DecodingServices": S["DecodingServices"]
  readonly "EncodingServices": S["EncodingServices"]
  readonly "~type.make.in": RequiredKeys<S["~type.make.in"]> extends never ? void | S["~type.make.in"]
    : S["~type.make.in"]
  readonly "~type.make": Self
  readonly "Iso": S["Iso"]
  new(
    ...args: {} extends S["~type.make.in"] ? [props?: S["~type.make.in"], options?: MakeOptions]
      : [props: S["~type.make.in"], options?: MakeOptions]
  ): S["Type"] & Inherited
  readonly identifier: string
  readonly fields: S["fields"]

  /**
   * Returns a new struct with the fields modified by the provided function.
   *
   * **Details**
   *
   * Options:
   *
   * - `unsafePreserveChecks` - if `true`, keep any `.check(...)` constraints
   *   that were attached to the original struct. Defaults to `false`.
   *
   *   **Warning**: This is an unsafe operation. Since `mapFields`
   *   transformations change the schema type, the original refinement functions
   *   may no longer be valid or safe to apply to the transformed schema. Only
   *   use this option if you have verified that your refinements remain correct
   *   after the transformation.
   */
  mapFields<To extends Struct.Fields>(
    f: (fields: S["fields"]) => To,
    options?: {
      readonly unsafePreserveChecks?: boolean | undefined
    } | undefined
  ): Struct<Simplify<Readonly<To>>>

  /**
   * Returns a function that creates a schema-backed subclass with this class's
   * fields plus additional fields.
   *
   * **When to use**
   *
   * Use when you need a subclass whose constructor validates both inherited
   * fields and newly added fields.
   *
   * **Details**
   *
   * The returned function accepts either a field map or a `Struct`. When you
   * pass a `Struct`, checks attached to that extension schema are preserved and
   * combined with checks from the base class schema.
   *
   * **Gotchas**
   *
   * Checks from a `Struct` argument are evaluated against the full subclass
   * value after inherited and extension fields are merged. Object-wide checks
   * such as `isMaxProperties` count inherited fields too.
   */
  extend<Extended = never, Static = {}, Brand = {}>(
    identifier: string
  ): {
    <NewFields extends Struct.Fields>(
      fields: NewFields,
      annotations?: Annotations.Declaration<Extended, readonly [Struct<Simplify<Assign<S["fields"], NewFields>>>]>
    ): [Extended] extends [never] ? MissingSelfGeneric<"Base.extend"> : InheritStaticMembers<
      Class<Extended, Struct<Simplify<Assign<S["fields"], NewFields>>>, Self & Brand>,
      Static
    >
    <Extension extends Struct<Struct.Fields>>(
      schema: Extension,
      annotations?: Annotations.Declaration<
        Extended,
        readonly [Struct<Simplify<Assign<S["fields"], Extension["fields"]>>>]
      >
    ): [Extended] extends [never] ? MissingSelfGeneric<"Base.extend"> : InheritStaticMembers<
      Class<Extended, Struct<Simplify<Assign<S["fields"], Extension["fields"]>>>, Self & Brand>,
      Static
    >
  }
}
type InheritStaticMembers<C, Static> = C & Pick<Static, Exclude<keyof Static, keyof C>>
type MissingSelfGeneric<Usage extends string> =
  `Missing \`Self\` generic - use \`class Self extends ${Usage}<Self>(...)\``

const immerable: unique symbol = globalThis.Symbol.for("immer-draftable") as any

const payloadToken = {}

function makeClass<
  Self,
  S extends Struct<Struct.Fields>,
  Inherited extends new(...args: ReadonlyArray<any>) => any
>(
  Inherited: Inherited,
  identifier: string,
  struct: S,
  annotations: Annotations.Declaration<Self, readonly [S]> | undefined,
  proto: ((identifier: string) => object) | undefined
): any {
  const getClassSchema = getClassSchemaFactory(struct, identifier, annotations)
  const ClassTypeId = getClassTypeId(identifier) // HMR support

  const out = class extends Inherited {
    constructor(...[input, options]: ReadonlyArray<any>) {
      const internalOptions = options as MakeOptions | undefined
      const payload = internalOptions?.["~payload"]
      const value = payload?.token === payloadToken
        ? payload.value
        : struct.make(input ?? {}, options)
      super(value, { ...options, disableChecks: true, "~payload": { token: payloadToken, value } })
    }

    static readonly [TypeId] = TypeId

    get [ClassTypeId]() {
      return ClassTypeId
    }

    static readonly [immerable] = true

    static readonly identifier = identifier
    static readonly fields = struct.fields

    static get ast(): SchemaAST.Declaration {
      return getClassSchema(this).ast
    }
    static pipe() {
      return Pipeable.pipeArguments(this, arguments)
    }
    static rebuild(ast: SchemaAST.Declaration) {
      return getClassSchema(this).rebuild(ast)
    }
    static make(input: S["~type.make.in"], options?: MakeOptions): Self {
      return SchemaParser.make(getClassSchema(this) as any)(input ?? {}, options) as Self
    }
    static makeOption(input: S["~type.make.in"], options?: MakeOptions): Option_.Option<Self> {
      return SchemaParser.makeOption(getClassSchema(this) as any)(input ?? {}, options) as any
    }
    static makeEffect(input: S["~type.make.in"], options?: MakeOptions): Effect.Effect<Self, SchemaIssue.Issue> {
      return (getClassSchema(this) as any).makeEffect(input ?? {}, options)
    }
    static annotate(annotations: Annotations.Declaration<Self, readonly [S]>) {
      return this.rebuild(SchemaAST.annotate(this.ast, annotations))
    }
    static annotateKey(annotations: Annotations.Key<Self>) {
      return this.rebuild(SchemaAST.annotateKey(this.ast, annotations))
    }
    static check(...checks: readonly [SchemaAST.Check<Self>, ...Array<SchemaAST.Check<Self>>]) {
      return this.rebuild(SchemaAST.appendChecks(this.ast, checks))
    }
    static extend(
      identifier: string
    ) {
      return (
        schema: Struct.Fields | Struct<Struct.Fields>,
        annotations?: Annotations.Declaration<any, readonly [any]>
      ) => {
        const extension = isStruct(schema) ? schema : Struct(schema)
        const fields = { ...struct.fields, ...extension.fields }
        const ast = SchemaAST.struct(fields, struct.ast.checks, { identifier })
        return makeClass(
          this,
          identifier,
          makeStruct(SchemaAST.appendChecks(ast, extension.ast.checks), fields),
          annotations,
          proto
        )
      }
    }
    static mapFields<To extends Struct.Fields>(
      f: (fields: S["fields"]) => To,
      options?: {
        readonly unsafePreserveChecks?: boolean | undefined
      } | undefined
    ): Struct<Simplify<Readonly<To>>> {
      return struct.mapFields(f, options)
    }
  }

  if (proto !== undefined) {
    Object.assign(out.prototype, proto(identifier))
  }

  return out
}

function getClassTransformation(self: new(...args: ReadonlyArray<any>) => any) {
  return new SchemaTransformation.Transformation<any, any, never, never>(
    SchemaGetter.transform((input) =>
      new self(input, {
        "~payload": {
          token: payloadToken,
          value: input
        }
      })
    ),
    SchemaGetter.passthrough()
  )
}

function getClassTypeId(identifier: string) {
  return `~effect/Schema/Class/${identifier}`
}

function getClassSchemaFactory<S extends Constraint>(
  from: S,
  identifier: string,
  annotations: Annotations.Declaration<any, readonly [S]> | undefined
) {
  let memo: decodeTo<declareConstructor<any, S["Encoded"], readonly [S]>, S> | undefined
  return <Self extends (new(...args: ReadonlyArray<any>) => any) & { readonly identifier: string }>(
    self: Self
  ): decodeTo<declareConstructor<Self, S["Encoded"], readonly [S]>, S> => {
    if (memo !== undefined) {
      return memo
    }
    const ClassTypeId = getClassTypeId(identifier)
    const isClassValue: Predicate.Predicate<unknown> = (input) =>
      input instanceof self || Predicate.hasProperty(input, ClassTypeId)
    const transformation = getClassTransformation(self)
    const to = make<declareConstructor<Self, S["Encoded"], readonly [S]>>(
      new SchemaAST.Declaration(
        [from.ast],
        () => (input, ast, options) => {
          return isClassValue(input) ?
            Effect.succeed(input) :
            Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
        },
        {
          identifier,
          [InternalAnnotations.CONSTRUCTOR_ANNOTATION_KEY]: (
            [from]: readonly [SchemaAST.AST]
          ): SchemaAST.ConstructorDescriptor => ({
            isConstructed: isClassValue,
            link: new SchemaAST.Link(from, transformation)
          }),
          toCodec: ([from]: readonly [ConstraintCodec<S["Encoded"], S["Encoded"]>]) =>
            new SchemaAST.Link(from.ast, transformation),
          toEquivalence: ([from]: readonly [Equivalence.Equivalence<S["Type"]>]) => from,
          toFormatter: ([from]: readonly [Formatter<S["Type"]>]) => (t: Self) => `${self.identifier}(${from(t)})`,
          [InternalAnnotations.SENTINELS_ANNOTATION_KEY]: SchemaAST.collectSentinels(from.ast),
          ...annotations
        }
      )
    )
    return memo = decodeTo<declareConstructor<Self, S["Encoded"], readonly [S]>, S>(to, transformation)(from)
  }
}

function isStruct(schema: Struct.Fields | Struct<Struct.Fields>): schema is Struct<Struct.Fields> {
  return isSchema(schema)
}
/**
 * Creates a schema-backed class whose constructor validates input against a
 * {@link Struct} schema. Construction throws an `Error` with a
 * `SchemaIssue.Issue` in its `cause` on invalid input.
 *
 * **When to use**
 *
 * Use when you need a schema-backed data class with validated construction,
 * schema-derived decoding/encoding, and class-style methods or inheritance.
 *
 * **Details**
 *
 * Pass the desired class type as the first type parameter. The second optional
 * type parameter can be used to add nominal brands.
 *
 * The `identifier` is the schema's stable runtime name. It is exposed on the
 * class, stored in the schema AST, and used to label diagnostics and generated
 * references as well as to format class instances.
 *
 * It also derives a runtime marker that recognizes instances across hot module
 * reloads, where `instanceof` can fail because the constructor has been
 * replaced. The identifier is explicit because the outer JavaScript class name
 * is not available while the `extends` expression is evaluated and may change
 * through renaming or minification.
 *
 * **Gotchas**
 *
 * Passing `disableChecks` in the options skips constructor validation.
 *
 * **Example** (Defining a basic class)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * class Person extends Schema.Class<Person>("Person")({
 *   name: Schema.String,
 *   age: Schema.Number
 * }) {}
 *
 * const alice = new Person({ name: "Alice", age: 30 })
 * alice.name // => "Alice"
 * String(alice) // => "Person({\"name\":\"Alice\",\"age\":30})"
 * ```
 *
 * **Example** (Extending a class)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * class Animal extends Schema.Class<Animal>("Animal")({
 *   name: Schema.String
 * }) {}
 *
 * class Dog extends Animal.extend<Dog>("Dog")({
 *   breed: Schema.String
 * }) {}
 *
 * const dog = new Dog({ name: "Rex", breed: "Labrador" })
 * dog.name // => "Rex"
 * dog.breed // => "Labrador"
 * ```
 *
 * @see {@link TaggedClass} for adding a `_tag` literal field to the class schema
 * @see {@link Error} for defining schema-backed error classes
 * @see {@link TaggedError} for defining tagged schema-backed error classes
 *
 * @category constructors
 * @since 3.10.0
 */
export const Class: {
  <Self = never, Brand = {}>(identifier: string): {
    <const Fields extends Struct.Fields>(
      fields: Fields,
      annotations?: Annotations.Declaration<Self, readonly [Struct<Fields>]>
    ): [Self] extends [never] ? MissingSelfGeneric<"Schema.Class"> : Class<Self, Struct<Fields>, Brand>
    <S extends Struct<Struct.Fields>>(
      schema: S,
      annotations?: Annotations.Declaration<Self, readonly [S]>
    ): [Self] extends [never] ? MissingSelfGeneric<"Schema.Class"> : Class<Self, S, Brand>
  }
} = <Self, Brand = {}>(identifier: string) =>
(
  schema: Struct.Fields | Struct<Struct.Fields>,
  annotations?: Annotations.Declaration<Self, readonly [Struct<Struct.Fields>]>
): [Self] extends [never] ? MissingSelfGeneric<"Schema.Class"> : Class<Self, Struct<Struct.Fields>, Brand> => {
  const struct = isStruct(schema) ? schema : Struct(schema)
  return makeClass(
    Data.Class,
    identifier,
    struct,
    annotations,
    (identifier) => ({
      toString() {
        return `${identifier}(${format({ ...this })})`
      }
    })
  )
}
/**
 * Defines a schema-backed class with an automatically populated `_tag` field.
 *
 * **When to use**
 *
 * Use to define class instances that are validated by a schema and participate
 * in tagged union matching.
 *
 * **Details**
 *
 * The optional `identifier` parameter overrides the schema identifier;
 * it defaults to the `tag` value.
 *
 * **Example** (Defining a tagged class)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * class Circle extends Schema.TaggedClass<Circle>()("Circle", {
 *   radius: Schema.Number
 * }) {}
 *
 * const c = new Circle({ radius: 5 })
 * c._tag // => "Circle"
 * c.radius // => 5
 * ```
 *
 * @category constructors
 * @since 3.10.0
 */
export const TaggedClass: {
  <Self = never, Brand = {}>(identifier?: string): {
    <Tag extends string, const Fields extends Struct.Fields>(
      tag: Tag,
      fields: Fields,
      annotations?: Annotations.Declaration<Self, readonly [TaggedStruct<Tag, Fields>]>
    ): [Self] extends [never] ? MissingSelfGeneric<"Schema.TaggedClass"> : Class<Self, TaggedStruct<Tag, Fields>, Brand>
    <Tag extends string, S extends Struct<Struct.Fields>>(
      tag: Tag,
      schema: S,
      annotations?: Annotations.Declaration<
        Self,
        readonly [Struct<Simplify<{ readonly _tag: tag<Tag> } & S["fields"]>>]
      >
    ): [Self] extends [never] ? MissingSelfGeneric<"Schema.TaggedClass">
      : Class<Self, Struct<Simplify<{ readonly _tag: tag<Tag> } & S["fields"]>>, Brand>
  }
} = (identifier?: string) => {
  return (
    tagValue: string,
    schema: Struct.Fields | Struct<Struct.Fields>,
    annotations?: Annotations.Declaration<any, readonly [Struct<Struct.Fields>]>
  ): any => {
    const struct = isStruct(schema) ?
      schema.mapFields((fields) => ({ _tag: tag(tagValue), ...fields }), {
        unsafePreserveChecks: true
      }) :
      TaggedStruct(tagValue, schema)
    return Class<any, {}>(identifier ?? tagValue)(
      struct,
      annotations as Annotations.Declaration<any, readonly [typeof struct]>
    )
  }
}
/**
 * Creates a schema-backed error class that can be used as a typed,
 * yieldable error in Effect programs. Combines {@link Class} validation with
 * the `YieldableError` interface so instances can be yielded directly inside
 * `Effect.gen`.
 *
 * **Example** (Schema-backed error)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema } from "effect"
 *
 * class NotFound extends Schema.Error<NotFound>("NotFound")({
 *   id: Schema.Number
 * }) {}
 *
 * const program = Effect.gen(function*() {
 *   yield* new NotFound({ id: 1 })
 * })
 * const error = await Effect.runPromise(Effect.flip(program))
 * error.id // => 1
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const Error: {
  <Self = never, Brand = {}>(identifier: string): {
    <const Fields extends Struct.Fields>(
      fields: Fields,
      annotations?: Annotations.Declaration<Self, readonly [Struct<Fields>]>
    ): [Self] extends [never] ? MissingSelfGeneric<"Schema.Error">
      : Class<Self, Struct<Fields>, Cause_.YieldableError & Brand>
    <S extends Struct<Struct.Fields>>(
      schema: S,
      annotations?: Annotations.Declaration<Self, readonly [S]>
    ): [Self] extends [never] ? MissingSelfGeneric<"Schema.Error"> : Class<Self, S, Cause_.YieldableError & Brand>
  }
} = <Self, Brand = {}>(identifier: string) =>
(
  schema: Struct.Fields | Struct<Struct.Fields>,
  annotations?: Annotations.Declaration<Self, readonly [Struct<Struct.Fields>]>
): [Self] extends [never] ? MissingSelfGeneric<"Schema.Error">
  : Class<Self, Struct<Struct.Fields>, Cause_.YieldableError & Brand> =>
{
  const struct = isStruct(schema) ? schema : Struct(schema)
  const self = makeClass(
    core.Error,
    identifier,
    struct,
    annotations,
    (identifier) => ({
      name: identifier
    })
  )
  return self
}
/**
 * Defines a schema-backed yieldable error class with an automatically populated
 * `_tag` field.
 *
 * **When to use**
 *
 * Use to define typed errors that are schema validated, yielded in `Effect.gen`,
 * and matched as tagged union members.
 *
 * **Example** (Defining a tagged error class)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schema } from "effect"
 *
 * class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
 *   id: Schema.Number
 * }) {}
 *
 * const program = Effect.gen(function*() {
 *   yield* new NotFound({ id: 42 })
 * })
 * const error = await Effect.runPromise(Effect.flip(program))
 * error._tag // => "NotFound"
 * error.id // => 42
 * ```
 *
 * @category constructors
 * @since 3.10.0
 */
export const TaggedError: {
  <Self = never, Brand = {}>(identifier?: string): {
    <Tag extends string, const Fields extends Struct.Fields>(
      tag: Tag,
      fields: Fields,
      annotations?: Annotations.Declaration<Self, readonly [TaggedStruct<Tag, Fields>]>
    ): [Self] extends [never] ? MissingSelfGeneric<"Schema.TaggedError">
      : Class<Self, TaggedStruct<Tag, Fields>, Cause_.YieldableError & Brand>
    <Tag extends string, S extends Struct<Struct.Fields>>(
      tag: Tag,
      schema: S,
      annotations?: Annotations.Declaration<
        Self,
        readonly [Struct<Simplify<{ readonly _tag: tag<Tag> } & S["fields"]>>]
      >
    ): [Self] extends [never] ? MissingSelfGeneric<"Schema.TaggedError">
      : Class<Self, Struct<Simplify<{ readonly _tag: tag<Tag> } & S["fields"]>>, Cause_.YieldableError & Brand>
  }
} = (identifier?: string) => {
  return (
    tagValue: string,
    schema: Struct.Fields | Struct<Struct.Fields>,
    annotations?: Annotations.Declaration<any, readonly [Struct<Struct.Fields>]>
  ): any => {
    const struct = isStruct(schema) ?
      schema.mapFields((fields) => ({ _tag: tag(tagValue), ...fields }), {
        unsafePreserveChecks: true
      }) :
      TaggedStruct(tagValue, schema)
    return Error<any, {}>(identifier ?? tagValue)(
      struct,
      annotations as Annotations.Declaration<any, readonly [typeof struct]>
    )
  }
}
/**
 * Attaches a custom formatter used by `toFormatter`.
 *
 * **Details**
 *
 * Use this when the formatter derived from the schema structure is not suitable.
 * The annotation is applied through this helper because adding it directly to
 * `Annotations.Bottom` would make schemas invariant.
 *
 * @category formatting
 * @since 4.0.0
 */
export function overrideToFormatter<S extends Top>(toFormatter: () => Formatter<S["Type"]>) {
  return (self: S): S["Rebuild"] => self.annotate({ toFormatter })
}
/**
 * Derives a string formatter function from a schema. The formatter converts
 * a value to its human-readable string representation, recursing into structs,
 * arrays, and unions.
 *
 * **Details**
 *
 * The optional `onBefore` hook lets you intercept specific AST nodes before
 * the default formatting logic runs.
 *
 * @category formatting
 * @since 4.0.0
 */
export function toFormatter<S extends Constraint>(schema: S, options?: {
  readonly onBefore?:
    | ((ast: SchemaAST.AST, recur: (ast: SchemaAST.AST) => Formatter<any>) => Formatter<any> | undefined)
    | undefined
}): Formatter<S["Type"]> {
  return InternalToFormatter.toFormatter(schema.ast, options)
}
/**
 * Overrides the equivalence derivation for a schema by supplying a custom
 * `Equivalence`.
 *
 * **When to use**
 *
 * Use when you need a custom equivalence instead of the default structural
 * equivalence derived by {@link toEquivalence}.
 *
 * @category instances
 * @since 4.0.0
 */
export function overrideToEquivalence<S extends Top>(toEquivalence: () => Equivalence.Equivalence<S["Type"]>) {
  return (self: S): S["Rebuild"] => self.annotate({ toEquivalence })
}
/**
 * Derives an `Equivalence` from a schema. Two values are considered equal when
 * every field (and nested field) compares equal according to the schema
 * structure.
 *
 * **Example** (Comparing structs)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const eq = Schema.toEquivalence(Schema.Struct({ id: Schema.Number, name: Schema.String }))
 *
 * eq({ id: 1, name: "Alice" }, { id: 1, name: "Alice" }) // => true
 * eq({ id: 1, name: "Alice" }, { id: 2, name: "Alice" }) // => false
 * ```
 *
 * @category instances
 * @since 4.0.0
 */
export function toEquivalence<T>(schema: Schema<T>): Equivalence.Equivalence<T> {
  return InternalEquivalence.toEquivalence(schema.ast)
}
/**
 * Derives an intermediate `SchemaRepresentation.Document` from the encoded
 * side of a schema.
 *
 * **When to use**
 *
 * Use when you have a `Schema` and need its live structural representation for inspection, persistence, or compilation.
 *
 * **Details**
 *
 * Use {@link toType} before this function to represent the type side instead.
 * The optional reference policy controls which candidates are extracted into the document's reference table. By
 * default, only candidates with a resolved identifier become references; recursive candidates always require one.
 * TypeScript-only distinctions such as those added by {@link brand} are not
 * part of the schema AST and are therefore omitted.
 *
 * @see {@link SchemaRepresentation.toRepresentation} for converting a `SchemaAST.AST` directly
 *
 * @category converting
 * @since 4.0.0
 */
export function toRepresentation(
  schema: Constraint,
  options?: SchemaRepresentation.ToRepresentationOptions
): SchemaRepresentation.Document {
  return InternalToRepresentation.toRepresentation(schema.ast, options)
}
/**
 * Options for reference allocation and JSON Schema generation in {@link toJsonSchemaDocument}.
 *
 * **Details**
 *
 * The inherited `referencePolicy` runs after the input schema is converted to its canonical JSON codec, so it receives
 * canonical JSON-encoded ASTs. The remaining options control compilation of the resulting live representation.
 *
 * **Gotchas**
 *
 * When these options are passed directly to `SchemaRepresentation.toJsonSchemaDocument` or
 * `SchemaRepresentation.toJsonSchemaMultiDocument`, reference allocation has already happened and `referencePolicy`
 * has no effect.
 *
 * @category options
 * @since 4.0.0
 */
export interface ToJsonSchemaOptions extends SchemaRepresentation.ToRepresentationOptions {
  /**
   * Controls whether generated object schemas accept properties that are not
   * modeled by the Effect schema.
   *
   * **Details**
   *
   * The default, `"ignore"`, matches the decoder's default excess-property
   * behavior and leaves unmodeled properties open. Use `"error"` together
   * with the decoder option of the same name to reject unmodeled properties
   * whenever the key space can be represented.
   *
   * Index signatures still determine the schema for properties they model.
   * When an index-signature key cannot be used as a `patternProperties`
   * selector, `"ignore"` leaves unmatched properties open. `"error"` instead
   * constrains their names with `propertyNames` and uses the candidate index
   * value schemas for `additionalProperties`.
   */
  readonly onExcessProperty?: "ignore" | "error" | undefined
  /**
   * Controls whether to generate descriptions for checks (if the user has not
   * provided them) based on the `expected` annotation of the check.
   */
  readonly generateDescriptions?: boolean | undefined
  /**
   * A predicate that controls which additional annotation keys (beyond the
   * standard JSON Schema keys) are included in the generated output.
   *
   * **When to use**
   *
   * Use when you need to include non-standard annotation keys in the generated
   * JSON Schema, such as Monaco Editor properties (`markdownDescription`,
   * `defaultSnippets`) or vendor extensions (`x-*`).
   *
   * **Details**
   *
   * Standard JSON Schema keys (`title`, `description`, `default`, `examples`,
   * `readOnly`, `writeOnly`, `format`, `contentEncoding`, `contentMediaType`,
   * `contentSchema`) are always included. This predicate is checked for any
   * *other* annotation key.
   *
   * **Gotchas**
   *
   * Prefer whitelisting the custom annotation keys you want to emit instead of
   * using a broad predicate such as `() => true`, because broad predicates can
   * include Effect-specific annotations that are preserved for internal schema
   * generation.
   *
   * **Example** (Including custom annotations)
   *
   * ```ts import.meta.vitest
   * import { Schema } from "effect"
   *
   * const schema = Schema.String.annotate({
   *   description: "A name",
   *   markdownDescription: "The **name** field"
   * })
   *
   * const doc = Schema.toJsonSchemaDocument(schema, {
   *   includeAnnotationKey: (key) =>
   *     key === "markdownDescription" || key.startsWith("x-")
   * })
   *
   * doc.schema // => { type: "string", description: "A name", markdownDescription: "The **name** field" }
   * ```
   */
  readonly includeAnnotationKey?: ((key: string) => boolean) | undefined
}
/**
 * Returns a JSON Schema document using draft 2020-12.
 *
 * **When to use**
 *
 * Use when you need a draft-2020-12 description of the canonical JSON form of a runtime schema.
 *
 * **Details**
 *
 * The document describes the encoded side of `Schema.toCodecJson(schema)`.
 * Use that codec to decode JSON inputs. For example, it decodes JSON `null`
 * to JavaScript `undefined` for a field defined with `Schema.optional(Schema.String)`.
 * Decoding the same input with the original schema rejects `null`.
 *
 * The `options` parameter controls reference extraction and generation details
 * such as excess properties and synthesized check descriptions; it does not
 * change the draft target. The reference policy receives canonical JSON
 * encoded ASTs. By default, anonymous non-recursive candidates remain inline,
 * while candidates with resolved identifiers become definitions. Declarations
 * are lowered through their `toCodecJson` or `toCodec` annotation when
 * available before the representation document is compiled.
 *
 * The generated document is intended for preliminary validation. JSON Schema
 * and Effect checks do not always have identical semantics, so the Effect
 * decoder remains the final authority. Passing JSON Schema validation does not
 * guarantee that Effect decoding will succeed.
 *
 * **Gotchas**
 *
 * JSON Schema generation is best-effort. String length uses Unicode code points
 * in JSON Schema and UTF-16 code units in Effect. A generated `pattern` cannot
 * retain JavaScript RegExp flags. Object property checks apply to the original
 * input in JSON Schema but to the decoded object in Effect. When a `oneOf`
 * branch contains a known approximation, the compiler emits `anyOf` so that
 * the approximation cannot create a false rejection. Unions with only exact
 * branches retain `oneOf`. Custom `toJsonSchema` callbacks return `[schema, true]` for safe,
 * looser approximations and are responsible for the semantics they declare. When
 * canonical JSON derivation adds an artificial transformation, checks and
 * annotations on its source node are not copied to the JSON target, so they do
 * not appear in the emitted document. Opaque declarations without a structural
 * codec are represented by an unconstrained JSON Schema. The default
 * `onExcessProperty: "ignore"` matches the decoder default and leaves
 * index-signature keys without exact selectors open. In `"error"` mode, the compiler
 * constrains those keys with `propertyNames` and applies a permissive choice of
 * candidate index value schemas. The Effect decoder enforces the exact
 * key-value association.
 *
 * **Example** (Decoding JSON with the matching codec)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 *
 * const schema = Schema.Struct({
 *   name: Schema.optional(Schema.String)
 * })
 *
 * const document = Schema.toJsonSchemaDocument(schema)
 * const jsonCodec = Schema.toCodecJson(schema)
 *
 * Schema.decodeUnknownResult(schema)({ name: null })._tag // => "Failure"
 * Schema.decodeUnknownSync(jsonCodec)({ name: null }) // => { name: undefined }
 * Schema.decodeUnknownSync(jsonCodec)({}) // => {}
 * Schema.encodeSync(jsonCodec)({ name: undefined }) // => { name: null }
 * ```
 *
 * @see {@link toCodecJson} for decoding and encoding the canonical JSON representation
 * @see {@link SchemaRepresentation.toJsonSchemaDocument} for compiling an existing live representation document
 *
 * @category converting
 * @since 4.0.0
 */
export function toJsonSchemaDocument(
  schema: Constraint,
  options?: ToJsonSchemaOptions
): JsonSchema.Document<"draft-2020-12"> {
  const document = InternalToRepresentation.toRepresentation(
    InternalToCodec.toCodecJsonAST(schema.ast),
    options
  )
  return InternalToJsonSchemaDocument.toJsonSchemaDocument(document, options)
}
/**
 * Type-level representation returned by {@link toCodecJson}.
 *
 * @category converting
 * @since 4.0.0
 */
export interface toCodecJson<S extends Constraint> extends
  BottomLazy<
    S["ast"],
    toCodecJson<S>,
    S["~type.parameters"],
    S["~type.mutability"],
    S["~type.optionality"],
    S["~type.constructor.default"],
    S["~encoded.mutability"],
    S["~encoded.optionality"]
  >
{
  readonly "Type": S["Type"]
  readonly "Encoded": Json
  readonly "DecodingServices": S["DecodingServices"]
  readonly "EncodingServices": S["EncodingServices"]
  readonly "~type.make.in": S["~type.make.in"]
  readonly "~type.make": S["~type.make"]
  readonly "Iso": S["Iso"]
  readonly schema: S
}
/**
 * Derives a canonical JSON codec from a schema. The encoded form is `Json`, and
 * decoding produces the schema's `Type`.
 *
 * **Details**
 *
 * Derivation does not run transformations. Annotation links may be asynchronous,
 * may fail, and may use optional services; the consuming parser chooses the
 * execution and failure handling. Because hooks do not widen the returned
 * service types, links cannot require services not declared by the input schema.
 *
 * **Gotchas**
 *
 * Declarations without a `toCodecJson` or `toCodec` annotation use `Json` as
 * their encoded schema. This keeps codec construction total, but encoding or
 * decoding can still fail when declaration values are not JSON values. A
 * `toCodecJson` callback can return `undefined` when the declaration is already
 * in canonical JSON form. When derivation adds an artificial transformation,
 * checks and annotations remain on its source node rather than being copied to
 * the JSON target. Source checks still run after the transformation.
 *
 * @category converting
 * @since 4.0.0
 */
export const toCodecJson: {
  <S extends Constraint>(schema: S): toCodecJson<S>
} = InternalToCodec.toCodecJson
/**
 * Derives an isomorphism codec from a schema. The encoded form is the schema's
 * `Iso` type — the intermediate representation used for round-tripping.
 *
 * **Details**
 *
 * Annotation links may be asynchronous, may fail, and may use optional services;
 * the consuming parser chooses the execution and failure handling.
 *
 * **Gotchas**
 *
 * Links cannot require services because the returned `Codec` does not expose
 * service requirements.
 *
 * @category converting
 * @since 4.0.0
 */
export const toCodecIso: {
  <S extends Constraint>(schema: S): Codec<S["Type"], S["Iso"]>
} = InternalToCodec.toCodecIso
/**
 * A {@link Tree} of `string | undefined` nodes. Leaf values are either a
 * string representation or `undefined` for opaque/declaration types.
 *
 * @category models
 * @since 4.0.0
 */
export type StringTree = Tree<string | undefined>
/**
 * Type-level representation returned by {@link toCodecStringTree}.
 *
 * @category converting
 * @since 4.0.0
 */
export interface toCodecStringTree<S extends Constraint> extends
  BottomLazy<
    S["ast"],
    toCodecStringTree<S>,
    ReadonlyArray<Constraint>,
    S["~type.mutability"],
    S["~type.optionality"],
    S["~type.constructor.default"],
    S["~encoded.mutability"],
    S["~encoded.optionality"]
  >
{
  readonly "Type": S["Type"]
  readonly "Encoded": StringTree
  readonly "DecodingServices": S["DecodingServices"]
  readonly "EncodingServices": S["EncodingServices"]
  readonly "~type.make.in": S["~type.make.in"]
  readonly "~type.make": S["~type.make"]
  readonly "Iso": S["Iso"]
  readonly schema: S
}
/**
 * Converts a schema to the StringTree canonical codec, where every leaf value
 * becomes a string while preserving the original structure.
 *
 * **Details**
 *
 * Derivation does not run transformations. Annotation links may be asynchronous,
 * may fail, and may use optional services; the consuming parser chooses the
 * execution and failure handling. Links cannot require services not declared by
 * the input schema because hooks do not widen the returned service types.
 *
 * **Gotchas**
 *
 * Declarations must provide a structural `toCodecStringTree`, `toCodecJson`, or
 * `toCodec` encoding. A callback can return `undefined` when the declaration is
 * already in canonical StringTree form.
 *
 * @category converting
 * @since 4.0.0
 */
export const toCodecStringTree: {
  <S extends Constraint>(schema: S): toCodecStringTree<S>
} = InternalToCodec.toCodecStringTree
/**
 * Type-level representation returned by {@link toCodecArrayFromSingle}.
 *
 * @category converting
 * @since 4.0.0
 */
export interface toCodecArrayFromSingle<S extends Constraint> extends
  BottomLazy<
    S["ast"],
    toCodecArrayFromSingle<S>,
    S["~type.parameters"],
    S["~type.mutability"],
    S["~type.optionality"],
    S["~type.constructor.default"],
    S["~encoded.mutability"],
    S["~encoded.optionality"]
  >
{
  readonly "Type": S["Type"]
  readonly "Encoded": S["Encoded"]
  readonly "DecodingServices": S["DecodingServices"]
  readonly "EncodingServices": S["EncodingServices"]
  readonly "~type.make.in": S["~type.make.in"]
  readonly "~type.make": S["~type.make"]
  readonly "Iso": S["Iso"]
}
/**
 * Allows array schemas to decode from either an array input or a single value
 * input.
 *
 * **When to use**
 *
 * Use when you need to accept transport formats that may represent a
 * single-item array as a bare value, such as query-string or form-data adapters.
 *
 * **Gotchas**
 *
 * This combinator is intentionally not part of `toCodecStringTree`; it adds a
 * decoding convenience rather than a canonical StringTree representation. It
 * does not parse comma-separated strings.
 *
 * @category converting
 * @since 4.0.0
 */
export const toCodecArrayFromSingle: {
  <S extends Constraint>(schema: S): toCodecArrayFromSingle<S>
} = InternalToCodec.toCodecArrayFromSingle
type XmlEncoderOptions = {
  /** Root element name for the returned XML string. Default: "root" */
  readonly rootName?: string | undefined
  /** When an array doesn't have a natural item name, use this. Default: "item" */
  readonly arrayItemName?: string | undefined
  /** Pretty-print output. Default: true */
  readonly pretty?: boolean | undefined
  /** Indentation used when pretty-printing. Default: "  " (two spaces) */
  readonly indent?: string | undefined
  /** Sort object keys for stable output. Default: true */
  readonly sortKeys?: boolean | undefined
}
/**
 * Derives an XML encoder from a codec.
 *
 * **Details**
 *
 * The returned function encodes a value through `toCodecStringTree` and returns
 * an `Effect` that succeeds with the XML string or fails with a
 * {@link SchemaIssue.Issue} if codec encoding fails.
 *
 * @category encoding
 * @since 4.0.0
 */
export function toEncoderXml<T, RE>(
  codec: ConstraintCodec<T, unknown, unknown, RE>,
  options?: XmlEncoderOptions
): (t: T) => Effect.Effect<string, SchemaIssue.Issue, RE> {
  return InternalToEncoderXml.toEncoderXml(codec, options)
}
/**
 * Derives an `Iso` optic from a schema that isomorphically converts between
 * the schema's `Type` and its `Iso` (intermediate / serialized form).
 *
 * **Details**
 *
 * Reading through the `Iso` encodes the schema value, while replacing through
 * it decodes the new focus.
 *
 * **Gotchas**
 *
 * This API runs synchronously, so failing, asynchronous, or service-dependent
 * transformations can throw. Schema failures use `"Schema validation failed"`
 * with a `SchemaIssue.Issue` in `cause`; format it with
 * `SchemaIssue.makeFormatterDefault()`. Consume {@link toCodecIso} with an
 * effectful parser for asynchronous execution or explicit failure handling.
 *
 * @category converting
 * @since 4.0.0
 */
export function toIso<S extends Constraint>(schema: S): Optic_.Iso<S["Type"], S["Iso"]> {
  return InternalToIso.toIso(schema)
}
/**
 * Returns an identity `Iso` over the schema's source (`Type`) side.
 *
 * @category constructors
 * @since 4.0.0
 */
export function toIsoSource<S extends Constraint>(schema: S): Optic_.Iso<S["Type"], S["Type"]> {
  return InternalToIso.toIsoSource(schema)
}
/**
 * Returns an identity `Iso` over the schema's focus (`Iso`) side.
 *
 * @category constructors
 * @since 4.0.0
 */
export function toIsoFocus<S extends Constraint>(schema: S): Optic_.Iso<S["Iso"], S["Iso"]> {
  return InternalToIso.toIsoFocus(schema)
}
/**
 * Type-level representation returned by {@link overrideToCodecIso}.
 *
 * @category transforming
 * @since 4.0.0
 */
export interface overrideToCodecIso<S extends Constraint, Iso> extends
  BottomLazy<
    S["ast"],
    overrideToCodecIso<S, Iso>,
    S["~type.parameters"],
    S["~type.mutability"],
    S["~type.optionality"],
    S["~type.constructor.default"],
    S["~encoded.mutability"],
    S["~encoded.optionality"]
  >
{
  readonly "Type": S["Type"]
  readonly "Encoded": S["Encoded"]
  readonly "DecodingServices": S["DecodingServices"]
  readonly "EncodingServices": S["EncodingServices"]
  readonly "~type.make.in": S["~type.make.in"]
  readonly "~type.make": S["~type.make"]
  readonly "Iso": Iso
  readonly schema: S
}
/**
 * Overrides a schema's derived ISO codec with an explicit target codec.
 *
 * **When to use**
 *
 * Use to provide a custom ISO transformation when the default derivation is not
 * appropriate.
 *
 * **Details**
 *
 * The resulting schema carries a custom `Iso` type parameter and uses the
 * provided `decode` and `encode` getters to transform between the schema type
 * and the target codec.
 *
 * @category transforming
 * @since 4.0.0
 */
export function overrideToCodecIso<S extends Constraint, Iso>(
  to: ConstraintCodec<Iso>,
  transformation: {
    readonly decode: SchemaGetter.Getter<S["Type"], Iso>
    readonly encode: SchemaGetter.Getter<Iso, S["Type"]>
  }
) {
  return (schema: S): overrideToCodecIso<S, Iso> => {
    return make(
      SchemaAST.annotate(schema.ast, {
        toCodecIso: () => new SchemaAST.Link(to.ast, SchemaTransformation.makeTransformation(transformation))
      }),
      { schema }
    )
  }
}
/**
 * Derives a JSON Patch differ from a codec. Serializes values to JSON (via
 * {@link toCodecJson}), computes RFC 6902 JSON Patch operations between old
 * and new values, and can apply patches back to the typed value.
 *
 * **Details**
 *
 * `diff` encodes both values before computing the patch. `patch` encodes the old
 * value, applies the patch to its JSON representation, and decodes the result.
 *
 * **Gotchas**
 *
 * This API runs synchronously, so failing, asynchronous, or service-dependent
 * transformations can throw. Schema failures use `"Schema validation failed"`
 * with a `SchemaIssue.Issue` in `cause`; format it with
 * `SchemaIssue.makeFormatterDefault()`. Invalid patch operations instead produce
 * {@link JsonPatch.apply} errors.
 *
 * @category converting
 * @since 4.0.0
 */
export function toDifferJsonPatch<T>(schema: ConstraintCodec<T, unknown>): Differ<T, JsonPatch.JsonPatch> {
  return InternalToDifferJsonPatch.toDifferJsonPatch(schema)
}
/**
 * Recursive tree type whose leaves are `Node` values and whose branches are
 * readonly arrays or string-keyed records of child trees.
 *
 * @category models
 * @since 4.0.0
 */
export type Tree<Node> = Node | TreeRecord<Node> | ReadonlyArray<Tree<Node>>
/**
 * A record node in a {@link Tree}: an object mapping string keys to child
 * `Tree` nodes.
 *
 * @category models
 * @since 4.0.0
 */
export interface TreeRecord<A> {
  readonly [x: string]: Tree<A>
}
/**
 * Creates a recursive schema for a {@link Tree} of values described by `node`.
 * The resulting schema accepts a single node value, an array of trees, or an
 * object whose values are trees.
 *
 * @category schemas
 * @since 4.0.0
 */
export function Tree<S extends Constraint>(node: S) {
  const Tree$ref = suspend((): Codec<
    Tree<S["Type"]>,
    Tree<S["Encoded"]>,
    S["DecodingServices"],
    S["EncodingServices"]
  > => Tree)
  const Tree = Union([
    node,
    ArraySchema(Tree$ref),
    Record(String, Tree$ref)
  ])
  return Tree
}
/**
 * Recursive TypeScript type for any valid immutable JSON value: `null`,
 * `number`, `boolean`, `string`, a readonly array of `Json` values, or a
 * readonly record of `string → Json`. For the corresponding schema, see the
 * {@link Json} const.
 *
 * @category models
 * @since 4.0.0
 */
export type Json = null | number | boolean | string | JsonArray | JsonObject
/**
 * A readonly array of {@link Json} values.
 *
 * @category models
 * @since 4.0.0
 */
export interface JsonArray extends ReadonlyArray<Json> {}
/**
 * A readonly record whose values are {@link Json} values.
 *
 * @category models
 * @since 4.0.0
 */
export interface JsonObject {
  readonly [x: string]: Json
}
/**
 * Schema that accepts and validates any immutable JSON-compatible value.
 *
 * **Example** (Validating a JSON value)
 *
 * ```ts import.meta.vitest
 * import { Option, Schema } from "effect"
 *
 * Schema.decodeUnknownOption(Schema.Json)({ key: [1, true, null] }) // => Option.some({ key: [1, true, null] })
 * ```
 *
 * @category schemas
 * @since 4.0.0
 */
export const Json: Codec<Json> = make(SchemaAST.annotate(SchemaAST.Json, {
  toCode: () => ({
    runtime: "Schema.Json",
    Type: "Schema.Json"
  })
}))
/**
 * Schema for readonly string-keyed records whose values are JSON-compatible.
 *
 * **When to use**
 *
 * Use when you need to validate a JSON object rather than any JSON value.
 *
 * **Example** (Validating a JSON object)
 *
 * ```ts import.meta.vitest
 * import { Option, Schema } from "effect"
 *
 * Schema.decodeUnknownOption(Schema.JsonObject)({ key: [1, true, null] }) // => Option.some({ key: [1, true, null] })
 * Schema.decodeUnknownOption(Schema.JsonObject)([1, 2, 3]) // => Option.none()
 * ```
 *
 * @see {@link Json} for a schema that also accepts JSON arrays and primitive values
 * @category schemas
 * @since 4.0.0
 */
export const JsonObject: $Record<String, Codec<Json, Json, never, never>> = Record(String, Json)
/**
 * Recursive TypeScript type for mutable JSON values: `null`, `number`,
 * `boolean`, `string`, mutable arrays, or mutable string-keyed records.
 *
 * @category models
 * @since 4.0.0
 */
export type MutableJson = null | number | boolean | string | MutableJsonArray | MutableJsonObject
/**
 * A mutable array of {@link MutableJson} values.
 *
 * @category models
 * @since 4.0.0
 */
export interface MutableJsonArray extends Array<MutableJson> {}
/**
 * A mutable record whose values are {@link MutableJson} values.
 *
 * @category models
 * @since 4.0.0
 */
export interface MutableJsonObject {
  [x: string]: MutableJson
}

const JsonError = Struct({
  message: String,
  name: optionalKey(String),
  stack: optionalKey(String),
  cause: optionalKey(Json)
})
/**
 * Schema that accepts any mutable JSON-compatible value. See {@link Json} for
 * the immutable variant.
 *
 * @category schemas
 * @since 4.0.0
 */
export const MutableJson: Codec<MutableJson> = make(SchemaAST.annotate(SchemaAST.MutableJson, {
  toCode: () => ({
    runtime: "Schema.MutableJson",
    Type: "Schema.MutableJson"
  })
}))
/**
 * Resolves the typed annotations from a schema. The term "resolve" (rather
 * than "get") reflects the lookup strategy: if the schema has checks, the
 * annotations are taken from the last check; otherwise they are taken from
 * the base schema instance.
 *
 * @category getters
 * @since 4.0.0
 */
export function resolveAnnotations<S extends Constraint>(
  schema: S
): Annotations.Bottom<S["Type"], S["~type.parameters"]> | undefined {
  return InternalAnnotations.resolve(schema.ast)
}
/**
 * Resolves the context (key-level) annotations from a schema. Context
 * annotations are those attached via `annotateKey` and live on the AST's
 * `context` rather than on the schema node itself.
 *
 * @category getters
 * @since 4.0.0
 */
export function resolveAnnotationsKey<S extends Constraint>(schema: S): Annotations.Key<S["Type"]> | undefined {
  return schema.ast.context?.annotations
}
/**
 * The `Annotations` namespace groups all annotation interfaces used to attach
 * metadata to schemas. Annotations control documentation, validation messages,
 * JSON Schema generation, equivalence, arbitrary generation, and more.
 *
 * **Details**
 *
 * Use {@link resolveAnnotations} to read the annotations attached to a schema at
 * runtime.
 *
 * @category models
 * @since 4.0.0
 */
export declare namespace Annotations {
  /**
   * This interface is used to define the annotations that can be attached to a
   * schema. You can extend this interface to define your own annotations.
   *
   * **Details**
   *
   * Note that both a missing key or `undefined` is used to indicate that the
   * annotation is not present.
   *
   * This means that can remove any annotation by setting it to `undefined`.
   *
   * **Example** (Defining your own annotations)
   *
   * ```ts import.meta.vitest
   * import { Schema } from "effect"
   *
   * // Extend the Annotations interface with a custom `version` annotation
   * declare module "effect/Schema" {
   *   namespace Annotations {
   *     interface Annotations {
   *       readonly version?:
   *         | readonly [major: number, minor: number, patch: number]
   *         | undefined
   *     }
   *   }
   * }
   *
   * // The `version` annotation is now recognized by the TypeScript compiler
   * const schema = Schema.String.annotate({ version: [1, 2, 0] })
   *
   * // const version: readonly [major: number, minor: number, patch: number] | undefined
   * const version = Schema.resolveAnnotations(schema)?.["version"]
   *
   * if (version) {
   *   // Access individual parts of the version
   *   version[1] // => 2
   * }
   * ```
   *
   * @category models
   * @since 4.0.0
   */
  interface Annotations {
    readonly [x: string]: unknown
  }
  /**
   * Annotations shared by all schema nodes. These map to common JSON Schema /
   * OpenAPI fields: `title`, `description`, `format`, etc.
   *
   * @category models
   * @since 4.0.0
   */
  interface Augment extends Annotations {
    /**
     * Human-readable description of what a value is expected to satisfy.
     *
     * **Details**
     *
     * For filter and refinement failures, the default formatter uses
     * `message` first, then `expected`, and finally falls back to `<filter>`.
     *
     * Use this to name a failed filter in the default message:
     * `Expected <expected>`.
     */
    readonly expected?: string | undefined
    readonly title?: string | undefined
    readonly description?: string | undefined
    readonly documentation?: string | undefined
    readonly readOnly?: boolean | undefined
    readonly writeOnly?: boolean | undefined
    readonly format?: string | undefined
    readonly contentEncoding?: string | undefined
    readonly contentMediaType?: string | undefined
    readonly contentSchema?: Json | undefined
  }
  /**
   * Extends {@link Augment} with type-parametric `default` and `examples` fields.
   *
   * @category models
   * @since 4.0.0
   */
  interface Documentation<T> extends Augment {
    readonly default?: T | undefined
    readonly examples?: ReadonlyArray<T> | undefined
  }
  /**
   * Annotations for struct property schemas. Extends {@link Documentation}
   * with an optional `messageMissingKey` to override the error message when
   * the property key is absent during decoding.
   *
   * @category models
   * @since 4.0.0
   */
  interface Key<T> extends Documentation<T> {
    /**
     * The message to use when a key is missing.
     */
    readonly messageMissingKey?: string | undefined
  }
  /**
   * Base annotations shared by all composite schema nodes. Extends
   * {@link Documentation} with error messages and arbitrary generation hooks.
   * {@link Declaration} and other annotation
   * interfaces build on top of this.
   *
   * @category models
   * @since 4.0.0
   */
  interface Bottom<T, TypeParameters extends ReadonlyArray<Constraint>> extends Documentation<T> {
    /**
     * Complete message to use when this schema node reports an issue.
     *
     * **Details**
     *
     * This replaces the default message for matching issue types instead of
     * only changing the expected label. For a filter or refinement failure,
     * annotate the filter with `message` to replace the whole filter failure
     * message, or `expected` to keep the default
     * `Expected <expected>` shape.
     */
    readonly message?: string | undefined
    /**
     * The message to use when a key is unexpected.
     */
    readonly messageUnexpectedKey?: string | undefined
    /**
     * Stable identifier for this schema node.
     *
     * **Details**
     *
     * Identifiers are used by schema tooling, including JSON Schema
     * generation, to name references. The default formatter also uses
     * `identifier` as the expected label for type-level failures, such as
     * `Expected UserId`.
     *
     * `identifier` does not name a failed filter or refinement. If the base
     * type matches and a filter fails, put `expected` or `message` on the
     * filter/refinement instead.
     */
    readonly identifier?: string | undefined
  }
  /**
   * Helpers for projecting declaration type-parameter schemas into decoded or
   * encoded codec arrays used by annotation hooks.
   *
   * @since 4.0.0
   */
  namespace TypeParameters {
    /**
     * Maps declaration type-parameter schemas to codecs for their decoded `Type`
     * values.
     *
     * @category utility types
     * @since 4.0.0
     */
    type Type<TypeParameters extends ReadonlyArray<Constraint>> = {
      readonly [K in keyof TypeParameters]: Codec<TypeParameters[K]["Type"]>
    }
    /**
     * Maps declaration type-parameter schemas to codecs for their `Encoded` values.
     *
     * @category utility types
     * @since 4.0.0
     */
    type Encoded<TypeParameters extends ReadonlyArray<Constraint>> = {
      readonly [K in keyof TypeParameters]: Codec<TypeParameters[K]["Encoded"]>
    }
  }
  /**
   * Full annotation set for `Declaration` schema nodes — used when defining
   * custom, opaque schema types via `Schema.declare`. Extends {@link Bottom}
   * with optional codec, arbitrary, equivalence, and formatter hooks so that
   * derived capabilities (JSON encoding, property testing, etc.) can be
   * provided for the custom type.
   *
   * @category models
   * @since 4.0.0
   */
  interface Declaration<T, TypeParameters extends ReadonlyArray<Constraint> = readonly []>
    extends Bottom<T, TypeParameters>
  {
    readonly representation?: SchemaRepresentation.RepresentationAnnotation | undefined
    /**
     * Returns the fallback link used by canonical codec derivations.
     *
     * **Details**
     *
     * Transformations may be asynchronous, may fail, and may use optional
     * services, but cannot require services absent from the derived codec type.
     */
    readonly toCodec?: ((typeParameters: TypeParameters.Encoded<TypeParameters>) => SchemaAST.Link) | undefined
    /**
     * Returns the link used to derive the declaration's JSON representation, or
     * `undefined` when the declaration is already in canonical JSON form.
     *
     * **Details**
     *
     * Transformations follow the execution and service constraints of `toCodec`.
     */
    readonly toCodecJson?:
      | ((typeParameters: TypeParameters.Encoded<TypeParameters>) => SchemaAST.Link | undefined)
      | undefined
    /**
     * Returns the link used to derive the declaration's StringTree
     * representation, or `undefined` when it is already canonical.
     *
     * **Details**
     *
     * Transformations follow the execution and service constraints of `toCodec`.
     */
    readonly toCodecStringTree?:
      | ((typeParameters: TypeParameters.Encoded<TypeParameters>) => SchemaAST.Link | undefined)
      | undefined
    /**
     * Returns the link used to derive the declaration's isomorphism
     * representation.
     *
     * **Details**
     *
     * Transformations may be asynchronous, may fail, and may use optional
     * services, but cannot require services because the derived `Codec` exposes
     * none.
     */
    readonly toCodecIso?: ((typeParameters: TypeParameters.Type<TypeParameters>) => SchemaAST.Link) | undefined
    /**
     * Provides a generatable representation for native arbitrary derivation.
     *
     * **Details**
     *
     * The callback receives decoded type-parameter schemas and normalized constraints for the declaration. The returned
     * Link is preferred over canonical codec annotations by the native arbitrary compiler. Generated representation
     * values are decoded and checked against the declaration, so the Link may be asynchronous or partial. As with the
     * other `toCodec*` hooks, the Link cannot require additional services because the derived `Arbitrary` exposes none.
     *
     * This annotation is experimental and may change while native arbitrary generation remains unstable.
     *
     * @since 4.0.0
     */
    readonly toCodecArbitrary?: ToArbitrary.Declaration<T, TypeParameters> | undefined
    readonly toEquivalence?: ToEquivalence.Declaration<T, TypeParameters> | undefined
    readonly toFormatter?: ToFormatter.Declaration<T, TypeParameters> | undefined
    readonly toCode?: SchemaRepresentation.Generation.Declaration | undefined
    /**
     * Used to collect sentinels from a Declaration SchemaAST.
     *
     * @internal
     */
    readonly "~sentinels"?: ReadonlyArray<SchemaAST.Sentinel> | undefined
  }
  /**
   * Annotations for filter schema nodes (created via `Schema.filter`). Extends
   * {@link Augment} with an optional error message, identifier, and metadata.
   * Filters are intentionally non-parametric to keep them covariant.
   *
   * @category models
   * @since 4.0.0
   */
  interface Filter extends Augment {
    readonly representation?: SchemaRepresentation.CheckRepresentationAnnotation<SchemaAST.AST> | undefined
    /**
     * Compiles this filter to a JSON Schema fragment.
     *
     * **Details**
     *
     * Return the fragment directly for an exact translation or `[fragment, true]`
     * for a safe, looser approximation. Use `[{}, true]` to omit the constraint.
     * Approximation propagates from `representation.schemas` automatically. It
     * makes enclosing `oneOf` unions export as `anyOf` and prevents approximate
     * record-key patterns from selecting `patternProperties` values.
     *
     * **Gotchas**
     *
     * The compiler trusts the declared semantics. Treat the input schemas as immutable. The returned fragment must be
     * a valid JSON Schema object graph and must not be mutated after this function returns. Return a new object graph
     * to produce different output during a later compilation.
     *
     * @see {@link SchemaRepresentation.ToJsonSchema.CheckOutput} for the result contract
     */
    readonly toJsonSchema?: SchemaRepresentation.ToJsonSchema.Check | undefined
    readonly toCode?: SchemaRepresentation.Generation.Check | undefined
    /**
     * Complete message to use when this filter or refinement fails.
     *
     * **Details**
     *
     * The default formatter checks filter annotations in this order:
     * `message`, then `expected`, then `<filter>`.
     */
    readonly message?: string | undefined
    /**
     * Stable identifier for the schema after this filter is attached.
     *
     * **Details**
     *
     * This can affect schema tooling such as JSON Schema generation and
     * type-level failures before the filter runs, but it does not name the
     * failed filter itself. For filter failure messages, use `expected` or
     * `message`.
     */
    readonly identifier?: string | undefined
    /**
     * Native arbitrary-generation hints for this filter.
     *
     * **Details**
     *
     * The value is declarative metadata merged with constraints from the other filters on the node. The filter
     * predicate remains authoritative.
     *
     * @since 4.0.0
     */
    readonly arbitraryConstraint?: ToArbitrary.FilterConstraint<any> | undefined
    /**
     * Marks the filter as *structural*, meaning it applies to the shape or
     * structure of the container (e.g., array length, object keys) rather than
     * the contents.
     *
     * **Details**
     *
     * Reserved to internal use only.
     *
     * Example: `minLength` on an array is a structural filter.
     */
    readonly "~structural"?: boolean | undefined
  }
  /**
   * Types used to guide native arbitrary derivation through constraints and declaration representations.
   *
   * @since 4.0.0
   */
  namespace ToArbitrary {
    /**
     * Regular-expression source and flags used for constructive string generation.
     *
     * @category models
     * @since 4.0.0
     */
    interface Pattern {
      readonly source: string
      readonly flags: string
    }
    /**
     * Normalized generation constraints for a declaration or schema node.
     *
     * **Details**
     *
     * Missing fields are unconstrained. These values guide construction but do not replace Schema validation.
     *
     * @category models
     * @since 4.0.0
     */
    interface GenerationConstraint<T = unknown> {
      readonly minimum?: T | undefined
      readonly exclusiveMinimum?: true | undefined
      readonly maximum?: T | undefined
      readonly exclusiveMaximum?: true | undefined
      readonly minLength?: number | undefined
      readonly maxLength?: number | undefined
      readonly minCodePoints?: number | undefined
      readonly maxCodePoints?: number | undefined
      readonly minSize?: number | undefined
      readonly maxSize?: number | undefined
      readonly minProperties?: number | undefined
      readonly maxProperties?: number | undefined
      readonly patterns?: readonly [Pattern, ...Array<Pattern>]
      readonly number?: "finite" | "integer" | undefined
      readonly uniqueBy?: ((value: any) => unknown) | undefined
    }
    /**
     * Raw constraint contribution attached to a Schema filter.
     *
     * **Details**
     *
     * `order` identifies the domain while the compiler merges bounds. It is removed before normalized constraints reach
     * a declaration callback.
     *
     * @category models
     * @since 4.0.0
     */
    interface FilterConstraint<T = unknown> extends GenerationConstraint<T> {
      readonly order?: Order.Order<T> | undefined
    }
    /**
     * Input provided to a declaration's native arbitrary callback.
     *
     * @category models
     * @since 4.0.0
     */
    interface DeclarationInput<T, Parameters extends ReadonlyArray<Constraint>> {
      readonly typeParameters: TypeParameters.Type<Parameters>
      readonly constraint: GenerationConstraint<T> | undefined
    }
    /**
     * Selects a Schema Link whose source representation is optimized for native arbitrary generation.
     *
     * @category models
     * @since 4.0.0
     */
    interface Declaration<T, Parameters extends ReadonlyArray<Constraint>> {
      (input: DeclarationInput<T, Parameters>): SchemaAST.Link
    }
  }
  /**
   * Types used by formatter annotations to customize formatter derivation for
   * declaration schemas.
   *
   * @since 4.0.0
   */
  namespace ToFormatter {
    /**
     * Hook signature for declaration schema formatter annotations.
     *
     * **Details**
     *
     * Given formatters for any type parameters, returns a formatter for `T`.
     *
     * @category models
     * @since 4.0.0
     */
    interface Declaration<T, TypeParameters extends ReadonlyArray<Constraint>> {
      (
        typeParameters: {
          readonly [K in keyof TypeParameters]: Formatter<TypeParameters[K]["Type"]>
        }
      ): Formatter<T>
    }
  }
  /**
   * Types used by equivalence annotations to customize equivalence derivation for
   * declaration schemas.
   *
   * @since 4.0.0
   */
  namespace ToEquivalence {
    /**
     * Hook signature for declaration schema equivalence annotations.
     *
     * **Details**
     *
     * Given equivalences for any type parameters, returns an `Equivalence` for `T`.
     *
     * @category models
     * @since 4.0.0
     */
    interface Declaration<T, TypeParameters extends ReadonlyArray<Constraint>> {
      (
        typeParameters: {
          readonly [K in keyof TypeParameters]: Equivalence.Equivalence<TypeParameters[K]["Type"]>
        }
      ): Equivalence.Equivalence<T>
    }
  }
  /**
   * Annotations that can be attached to schema issues.
   *
   * **Details**
   *
   * For `InvalidValue` issues, `message` overrides the complete formatted
   * message. When `message` is absent, `expected` uses the default expected
   * value policy, including reported input when available. Other issue types
   * ignore `expected`.
   *
   * @category models
   * @since 4.0.0
   */
  interface Issue extends Annotations {
    /**
     * The expected value description for an `InvalidValue` issue.
     */
    readonly expected?: string | undefined
    /**
     * The complete formatted message for the issue.
     */
    readonly message?: string | undefined
  }
}
