/**
 * Open, compiler-extensible representation of Effect schemas.
 *
 * @since 4.0.0
 */
import * as InternalRecord from "./internal/record.ts"
import * as InternalFromJsonSchemaDocument from "./internal/schema/fromJsonSchemaDocument.ts"
import * as InternalFromRepresentation from "./internal/schema/fromRepresentation.ts"
import * as InternalToCodeDocument from "./internal/schema/toCodeDocument.ts"
import * as InternalToJsonSchemaDocument from "./internal/schema/toJsonSchemaDocument.ts"
import * as InternalToRepresentation from "./internal/schema/toRepresentation.ts"
import type * as JsonSchema from "./JsonSchema.ts"
import * as Option from "./Option.ts"
import * as Schema from "./Schema.ts"
import * as SchemaAST from "./SchemaAST.ts"
import * as InternalGetter from "./SchemaGetter.ts"

/**
 * Open persistence identity carried by declarations and opaque checks.
 *
 * @category annotations
 * @since 4.0.0
 */
export interface RepresentationAnnotation {
  readonly id: string
  readonly payload: Schema.Json
}

/**
 * Open persistence identity and schema dependencies carried by opaque checks.
 *
 * @category annotations
 * @since 4.0.0
 */
export interface CheckRepresentationAnnotation<S> extends RepresentationAnnotation {
  readonly schemas?: ReadonlyArray<S> | undefined
}

/**
 * Input and output contracts for JSON Schema compiler annotations.
 *
 * @since 4.0.0
 */
export declare namespace ToJsonSchema {
  /**
   * Input for a check compiler.
   *
   * @category models
   * @since 4.0.0
   */
  export interface CheckInput {
    readonly type: JsonSchema.Type | undefined
    readonly schemas: ReadonlyArray<JsonSchema.JsonSchema>
  }

  /**
   * The result of compiling a check to JSON Schema.
   *
   * **Details**
   *
   * Return the JSON Schema fragment directly when it represents the check
   * exactly. Return `[schema, true]` when the fragment is a safe, looser
   * approximation: it must accept every value accepted by the check, but may
   * accept additional values. Use `[{}, true]` when the constraint is omitted;
   * a bare `{}` declares that the check imposes no constraint.
   *
   * Approximation propagates through enclosing schemas and dependencies listed
   * in `representation.schemas`, including recursive references. A `oneOf`
   * union with an approximate branch exports as `anyOf`. Approximate record-key
   * patterns cannot be used as `patternProperties` selectors.
   *
   * **Gotchas**
   *
   * The compiler trusts the callback's declaration; it does not prove that the
   * fragment is exact or safely looser. Returning a plain fragment does not
   * override approximation inherited from a schema dependency.
   *
   * **Example** (Declaring a Unicode length approximation)
   *
   * ```ts import.meta.vitest
   * import { Schema } from "effect"
   *
   * const short = Schema.String.check(Schema.makeFilter(
   *   (value: string) => value.length <= 1,
   *   { toJsonSchema: () => [{ maxLength: 1 }, true] }
   * ))
   * const schema = Schema.Union([short, Schema.Literal("😀")], { mode: "oneOf" })
   * const document = Schema.toJsonSchemaDocument(schema)
   *
   * Schema.is(schema)("😀") // => true
   * document.schema.oneOf // => undefined
   * document.schema.anyOf // => [{ type: "string", maxLength: 1 }, { type: "string", enum: ["😀"] }]
   * ```
   *
   * @category models
   * @since 4.0.0
   */
  export type CheckOutput = JsonSchema.JsonSchema | readonly [schema: JsonSchema.JsonSchema, approximate: true]

  /**
   * Compiles a check to a JSON Schema fragment.
   *
   * **Details**
   *
   * Return a fragment for an exact translation or `[fragment, true]` for a safe,
   * looser approximation. Dependencies in `representation.schemas` are compiled
   * into the input's `schemas` array; their approximation status propagates automatically.
   *
   * **Gotchas**
   *
   * Treat the input schemas as immutable. The returned fragment must be a valid JSON Schema object graph and must not be
   * mutated after this function returns. Local `$defs` references must use valid JSON Pointer URI fragments. Return a
   * new object graph to produce different output during a later compilation.
   *
   * @see {@link CheckOutput} for exact and approximate results
   *
   * @category models
   * @since 4.0.0
   */
  export type Check = (input: CheckInput) => CheckOutput
}

/**
 * Input and output contracts for code generation annotations.
 *
 * @since 4.0.0
 */
export declare namespace Generation {
  /**
   * Input for declaration code generation.
   *
   * @category models
   * @since 4.0.0
   */
  export interface DeclarationInput {
    readonly typeParameters: ReadonlyArray<Code>
  }

  /**
   * Output of declaration code generation.
   *
   * @category models
   * @since 4.0.0
   */
  export interface DeclarationOutput {
    readonly runtime: string
    readonly Type: string
    readonly importDeclarations?: ReadonlyArray<string> | undefined
  }

  /**
   * Declaration code generator.
   *
   * @category models
   * @since 4.0.0
   */
  export type Declaration = (input: DeclarationInput) => DeclarationOutput

  /**
   * Input for check code generation.
   *
   * @category models
   * @since 4.0.0
   */
  export interface CheckInput {
    readonly schemas: ReadonlyArray<Code>
  }

  /**
   * Output of check code generation.
   *
   * @category models
   * @since 4.0.0
   */
  export interface CheckOutput {
    readonly runtime: string
    readonly importDeclarations?: ReadonlyArray<string> | undefined
  }

  /**
   * Check code generator.
   *
   * @category models
   * @since 4.0.0
   */
  export type Check = (input: CheckInput) => CheckOutput
}

/**
 * A custom opaque declaration.
 *
 * @category models
 * @since 4.0.0
 */
export interface Declaration {
  readonly _tag: "Declaration"
  readonly representation?: RepresentationAnnotation | undefined
  readonly annotations?: Schema.Annotations.Annotations | undefined
  readonly typeParameters: ReadonlyArray<Representation>
  readonly checks: ReadonlyArray<Check>
}

/**
 * A lazily resolved representation.
 *
 * @category models
 * @since 4.0.0
 */
export interface Suspend {
  readonly _tag: "Suspend"
  readonly annotations?: Schema.Annotations.Annotations | undefined
  readonly checks: readonly []
  readonly thunk: Representation
}

/**
 * A named reference.
 *
 * @category models
 * @since 4.0.0
 */
export interface Reference {
  readonly _tag: "Reference"
  readonly $ref: string
}

interface Keyword<Tag extends string> {
  readonly _tag: Tag
  readonly annotations?: Schema.Annotations.Annotations | undefined
  readonly checks: ReadonlyArray<Check>
}

/**
 * The null keyword representation.
 *
 * @category models
 * @since 4.0.0
 */
export interface Null extends Keyword<"Null"> {}
/**
 * The undefined keyword representation.
 *
 * @category models
 * @since 4.0.0
 */
export interface Undefined extends Keyword<"Undefined"> {}
/**
 * The void keyword representation.
 *
 * @category models
 * @since 4.0.0
 */
export interface Void extends Keyword<"Void"> {}
/**
 * The never keyword representation.
 *
 * @category models
 * @since 4.0.0
 */
export interface Never extends Keyword<"Never"> {}
/**
 * The unknown keyword representation.
 *
 * @category models
 * @since 4.0.0
 */
export interface Unknown extends Keyword<"Unknown"> {}
/**
 * The any keyword representation.
 *
 * @category models
 * @since 4.0.0
 */
export interface Any extends Keyword<"Any"> {}

/**
 * A string representation.
 *
 * @category models
 * @since 4.0.0
 */
export interface String extends Keyword<"String"> {}

/**
 * A number representation.
 *
 * @category models
 * @since 4.0.0
 */
export interface Number extends Keyword<"Number"> {}
/**
 * A boolean representation.
 *
 * @category models
 * @since 4.0.0
 */
export interface Boolean extends Keyword<"Boolean"> {}
/**
 * A bigint representation.
 *
 * @category models
 * @since 4.0.0
 */
export interface BigInt extends Keyword<"BigInt"> {}
/**
 * A symbol representation.
 *
 * @category models
 * @since 4.0.0
 */
export interface Symbol extends Keyword<"Symbol"> {}

/**
 * A literal representation.
 *
 * **Details**
 *
 * The live representation stores the native literal value. Persistent codecs
 * add an explicit type discriminator when encoding it.
 *
 * @category models
 * @since 4.0.0
 */
export interface Literal extends Keyword<"Literal"> {
  readonly literal: SchemaAST.LiteralValue
}

/**
 * A unique symbol representation.
 *
 * **Details**
 *
 * Globally registered symbols have an exact JSON string representation. Local
 * symbols have no JSON representation.
 *
 * @category models
 * @since 4.0.0
 */
export interface UniqueSymbol extends Keyword<"UniqueSymbol"> {
  readonly symbol: symbol
}

/**
 * The object keyword representation.
 *
 * @category models
 * @since 4.0.0
 */
export interface ObjectKeyword extends Keyword<"ObjectKeyword"> {}

/**
 * An enum representation.
 *
 * **Details**
 *
 * Enum members are stored as native string or finite number values. Persistent
 * codecs add an explicit type discriminator when encoding them.
 *
 * @category models
 * @since 4.0.0
 */
export interface Enum extends Keyword<"Enum"> {
  readonly enums: ReadonlyArray<readonly [string, string | number]>
}

/**
 * A template literal representation.
 *
 * @category models
 * @since 4.0.0
 */
export interface TemplateLiteral extends Keyword<"TemplateLiteral"> {
  readonly parts: ReadonlyArray<Representation>
}

/**
 * A tuple element.
 *
 * @category models
 * @since 4.0.0
 */
export interface Element {
  readonly isOptional: boolean
  readonly type: Representation
  readonly annotations?: Schema.Annotations.Annotations | undefined
}

/**
 * An array or tuple representation.
 *
 * @category models
 * @since 4.0.0
 */
export interface Arrays extends Keyword<"Arrays"> {
  readonly elements: ReadonlyArray<Element>
  readonly rest: ReadonlyArray<Representation>
}

/**
 * A property signature.
 *
 * **Details**
 *
 * The live representation stores the native property key. Persistent codecs
 * add an explicit type discriminator when encoding it.
 *
 * **Gotchas**
 *
 * Local symbols can be represented while the schema is live, but persistent
 * codecs reject them because they cannot be reconstructed by identity.
 *
 * @category models
 * @since 4.0.0
 */
export interface PropertySignature {
  readonly name: PropertyKey
  readonly type: Representation
  readonly isOptional: boolean
  readonly isMutable: boolean
  readonly annotations?: Schema.Annotations.Annotations | undefined
}

/**
 * An index signature.
 *
 * @category models
 * @since 4.0.0
 */
export interface IndexSignature {
  readonly parameter: Representation
  readonly type: Representation
}

/**
 * An object representation.
 *
 * @category models
 * @since 4.0.0
 */
export interface Objects extends Keyword<"Objects"> {
  readonly propertySignatures: ReadonlyArray<PropertySignature>
  readonly indexSignatures: ReadonlyArray<IndexSignature>
}

/**
 * A union representation.
 *
 * @category models
 * @since 4.0.0
 */
export interface Union extends Keyword<"Union"> {
  readonly types: ReadonlyArray<Representation>
  readonly options?: SchemaAST.UnionOptions | undefined
}

/**
 * The structural schema representation.
 *
 * @category models
 * @since 4.0.0
 */
export type Representation =
  | Declaration
  | Reference
  | Suspend
  | Null
  | Undefined
  | Void
  | Never
  | Unknown
  | Any
  | String
  | Number
  | Boolean
  | BigInt
  | Symbol
  | Literal
  | UniqueSymbol
  | ObjectKeyword
  | Enum
  | TemplateLiteral
  | Arrays
  | Objects
  | Union

/**
 * A structural check.
 *
 * @category models
 * @since 4.0.0
 */
export type Check = Filter | FilterGroup

/**
 * An opaque leaf check.
 *
 * @category models
 * @since 4.0.0
 */
export interface Filter {
  readonly _tag: "Filter"
  readonly representation?: CheckRepresentationAnnotation<Representation> | undefined
  readonly annotations?: Schema.Annotations.Annotations | undefined
  readonly aborted: boolean
}

/**
 * A non-empty group of checks.
 *
 * @category models
 * @since 4.0.0
 */
export interface FilterGroup {
  readonly _tag: "FilterGroup"
  readonly representation?: CheckRepresentationAnnotation<Representation> | undefined
  readonly annotations?: Schema.Annotations.Annotations | undefined
  readonly checks: readonly [Check, ...Array<Check>]
}

/**
 * Named representation definitions.
 *
 * @category models
 * @since 4.0.0
 */
export interface References {
  readonly [$ref: string]: Representation
}

/**
 * A single representation and its definitions.
 *
 * @category models
 * @since 4.0.0
 */
export interface Document {
  readonly representation: Representation
  readonly references: References
}

/**
 * Multiple representations sharing definitions.
 *
 * @category models
 * @since 4.0.0
 */
export interface MultiDocument {
  readonly representations: readonly [Representation, ...Array<Representation>]
  readonly references: References
}

/**
 * Reviver for a declaration.
 *
 * @category models
 * @since 4.0.0
 */
export interface DeclarationReviver<P> {
  readonly id: string
  readonly payloadSchema: Schema.Decoder<P>
  readonly revive: (input: {
    readonly payload: P
    readonly typeParameters: ReadonlyArray<Schema.Top>
    readonly annotations: Schema.Annotations.Annotations | undefined
  }) => Schema.Top
}

/**
 * Reviver for a leaf check.
 *
 * @category models
 * @since 4.0.0
 */
export interface FilterReviver<P> {
  readonly id: string
  readonly payloadSchema: Schema.Decoder<P>
  readonly revive: (input: {
    readonly payload: P
    readonly schemas: ReadonlyArray<Schema.Top>
    readonly annotations: Schema.Annotations.Filter | undefined
  }) => SchemaAST.Filter<any>
}

/**
 * Reviver for a check group.
 *
 * @category models
 * @since 4.0.0
 */
export interface FilterGroupReviver<P> {
  readonly id: string
  readonly payloadSchema: Schema.Decoder<P>
  readonly revive: (input: {
    readonly payload: P
    readonly schemas: ReadonlyArray<Schema.Top>
    readonly annotations: Schema.Annotations.Filter | undefined
  }) => SchemaAST.FilterGroup<any>
}

/**
 * A check reviver.
 *
 * @category models
 * @since 4.0.0
 */
export type CheckReviver<P> = FilterReviver<P> | FilterGroupReviver<P>

/**
 * A typed reviver.
 *
 * @category models
 * @since 4.0.0
 */
export type Reviver<P> = DeclarationReviver<P> | CheckReviver<P>

/**
 * A reviver erased only at collection boundaries.
 *
 * @category models
 * @since 4.0.0
 */
export type AnyReviver = Reviver<any>

/**
 * Creates a declaration reviver while inferring its payload type from `payloadSchema`.
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeReviverDeclaration: <P>(
  id: string,
  payloadSchema: Schema.Decoder<P>,
  revive: DeclarationReviver<P>["revive"]
) => DeclarationReviver<P> = (id, payloadSchema, revive) => ({ id, payloadSchema, revive })

/**
 * Creates a filter reviver while inferring its payload type from `payloadSchema`.
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeReviverFilter: <P>(
  id: string,
  payloadSchema: Schema.Decoder<P>,
  revive: FilterReviver<P>["revive"]
) => FilterReviver<P> = (id, payloadSchema, revive) => ({ id, payloadSchema, revive })

/**
 * Creates a filter group reviver while inferring its payload type from `payloadSchema`.
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeReviverFilterGroup: <P>(
  id: string,
  payloadSchema: Schema.Decoder<P>,
  revive: FilterGroupReviver<P>["revive"]
) => FilterGroupReviver<P> = (id, payloadSchema, revive) => ({ id, payloadSchema, revive })

function makeFixedDeclarationReviver(id: string, schema: Schema.Top): DeclarationReviver<null> {
  return makeReviverDeclaration(
    id,
    Schema.Null,
    ({ annotations }) => annotations === undefined ? schema : schema.annotate(annotations)
  )
}

const IsPatternPayload = Schema.Struct({
  source: Schema.String,
  flags: Schema.String
}).check(Schema.makeFilter((payload: { readonly source: string; readonly flags: string }) => {
  try {
    const regExp = new globalThis.RegExp(payload.source, payload.flags)
    return regExp.source === payload.source && regExp.flags === payload.flags
  } catch {
    return false
  }
}))

type ErrorRepresentationOptions = {
  readonly includeStack?: true | undefined
  readonly excludeCause?: true | undefined
}
type ErrorRepresentationPayload = ErrorRepresentationOptions | null
const ErrorOptionsPayload = Schema.declare((input): input is ErrorRepresentationOptions => {
  if (typeof input !== "object" || input === null) return false
  const object = input as Record<string, unknown>
  const keys = globalThis.Object.keys(input)
  return keys.length > 0 &&
    keys.every((key) => (key === "includeStack" || key === "excludeCause") && object[key] === true)
})
const ErrorRepresentationPayload: Schema.Decoder<ErrorRepresentationPayload> = Schema.Union([
  Schema.Null,
  ErrorOptionsPayload
])

type RedactedRepresentationOptions = {
  readonly label?: string | undefined
  readonly disallowJsonEncode?: true | undefined
}
type RedactedRepresentationPayload = RedactedRepresentationOptions | null
const RedactedOptionsPayload = Schema.declare((input): input is RedactedRepresentationOptions => {
  if (typeof input !== "object" || input === null) return false
  const object = input as Record<string, unknown>
  const keys = globalThis.Object.keys(input)
  return keys.length > 0 && keys.every((key) => {
    switch (key) {
      case "label":
        return typeof object[key] === "string"
      case "disallowJsonEncode":
        return object[key] === true
      default:
        return false
    }
  })
})
const RedactedRepresentationPayload: Schema.Decoder<RedactedRepresentationPayload> = Schema.Union([
  Schema.Null,
  RedactedOptionsPayload
])

/**
 * Reviver for persisted `isTrimmed` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isTrimmed}.
 *
 * @see {@link Schema.isTrimmed} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isTrimmedReviver: FilterReviver<null> = makeReviverFilter(
  "effect/schema/isTrimmed",
  Schema.Null,
  ({ annotations }) => Schema.isTrimmed(annotations)
)

/**
 * Reviver for persisted `isPattern` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isPattern}.
 *
 * @see {@link Schema.isPattern} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isPatternReviver: FilterReviver<{
  readonly source: string
  readonly flags: string
}> = makeReviverFilter(
  "effect/schema/isPattern",
  IsPatternPayload,
  ({ annotations, payload }) => Schema.isPattern(new globalThis.RegExp(payload.source, payload.flags), annotations)
)

/**
 * Reviver for persisted `isStringFinite` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isStringFinite}.
 *
 * @see {@link Schema.isStringFinite} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isStringFiniteReviver: FilterReviver<null> = makeReviverFilter(
  "effect/schema/isStringFinite",
  Schema.Null,
  ({ annotations }) => Schema.isStringFinite(annotations)
)

/**
 * Reviver for persisted `isStringBigInt` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isStringBigInt}.
 *
 * @see {@link Schema.isStringBigInt} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isStringBigIntReviver: FilterReviver<null> = makeReviverFilter(
  "effect/schema/isStringBigInt",
  Schema.Null,
  ({ annotations }) => Schema.isStringBigInt(annotations)
)

/**
 * Reviver for persisted `isStringSymbol` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isStringSymbol}.
 *
 * @see {@link Schema.isStringSymbol} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isStringSymbolReviver: FilterReviver<null> = makeReviverFilter(
  "effect/schema/isStringSymbol",
  Schema.Null,
  ({ annotations }) => Schema.isStringSymbol(annotations)
)

/**
 * Reviver for persisted `isUUID` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isUUID}.
 *
 * @see {@link Schema.isUUID} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isUUIDReviver: FilterReviver<{
  readonly version: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | null
}> = makeReviverFilter(
  "effect/schema/isUUID",
  Schema.Struct({ version: Schema.Union([Schema.Literals([1, 2, 3, 4, 5, 6, 7, 8]), Schema.Null]) }),
  ({ annotations, payload }) => Schema.isUUID(payload.version ?? undefined, annotations)
)

/**
 * Reviver for persisted `isGUID` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isGUID}.
 *
 * @see {@link Schema.isGUID} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isGUIDReviver: FilterReviver<null> = makeReviverFilter(
  "effect/schema/isGUID",
  Schema.Null,
  ({ annotations }) => Schema.isGUID(annotations)
)

/**
 * Reviver for persisted `isULID` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isULID}.
 *
 * @see {@link Schema.isULID} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isULIDReviver: FilterReviver<null> = makeReviverFilter(
  "effect/schema/isULID",
  Schema.Null,
  ({ annotations }) => Schema.isULID(annotations)
)

/**
 * Reviver for persisted `isBase64` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isBase64}.
 *
 * @see {@link Schema.isBase64} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isBase64Reviver: FilterReviver<null> = makeReviverFilter(
  "effect/schema/isBase64",
  Schema.Null,
  ({ annotations }) => Schema.isBase64(annotations)
)

/**
 * Reviver for persisted `isBase64Url` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isBase64Url}.
 *
 * @see {@link Schema.isBase64Url} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isBase64UrlReviver: FilterReviver<null> = makeReviverFilter(
  "effect/schema/isBase64Url",
  Schema.Null,
  ({ annotations }) => Schema.isBase64Url(annotations)
)

/**
 * Reviver for persisted `isStartingWith` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isStartingWith}.
 *
 * @see {@link Schema.isStartingWith} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isStartingWithReviver: FilterReviver<{
  readonly startsWith: string
}> = makeReviverFilter(
  "effect/schema/isStartingWith",
  Schema.Struct({ startsWith: Schema.String }),
  ({ annotations, payload }) => Schema.isStartingWith(payload.startsWith, annotations)
)

/**
 * Reviver for persisted `isEndingWith` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isEndingWith}.
 *
 * @see {@link Schema.isEndingWith} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isEndingWithReviver: FilterReviver<{
  readonly endsWith: string
}> = makeReviverFilter(
  "effect/schema/isEndingWith",
  Schema.Struct({ endsWith: Schema.String }),
  ({ annotations, payload }) => Schema.isEndingWith(payload.endsWith, annotations)
)

/**
 * Reviver for persisted `isIncluding` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isIncluding}.
 *
 * @see {@link Schema.isIncluding} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isIncludingReviver: FilterReviver<{
  readonly includes: string
}> = makeReviverFilter(
  "effect/schema/isIncluding",
  Schema.Struct({ includes: Schema.String }),
  ({ annotations, payload }) => Schema.isIncluding(payload.includes, annotations)
)

/**
 * Reviver for persisted `isUppercased` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isUppercased}.
 *
 * @see {@link Schema.isUppercased} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isUppercasedReviver: FilterReviver<null> = makeReviverFilter(
  "effect/schema/isUppercased",
  Schema.Null,
  ({ annotations }) => Schema.isUppercased(annotations)
)

/**
 * Reviver for persisted `isLowercased` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isLowercased}.
 *
 * @see {@link Schema.isLowercased} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isLowercasedReviver: FilterReviver<null> = makeReviverFilter(
  "effect/schema/isLowercased",
  Schema.Null,
  ({ annotations }) => Schema.isLowercased(annotations)
)

/**
 * Reviver for persisted `isCapitalized` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isCapitalized}.
 *
 * @see {@link Schema.isCapitalized} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isCapitalizedReviver: FilterReviver<null> = makeReviverFilter(
  "effect/schema/isCapitalized",
  Schema.Null,
  ({ annotations }) => Schema.isCapitalized(annotations)
)

/**
 * Reviver for persisted `isUncapitalized` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isUncapitalized}.
 *
 * @see {@link Schema.isUncapitalized} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isUncapitalizedReviver: FilterReviver<null> = makeReviverFilter(
  "effect/schema/isUncapitalized",
  Schema.Null,
  ({ annotations }) => Schema.isUncapitalized(annotations)
)

/**
 * Reviver for persisted `isFinite` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isFinite}.
 *
 * @see {@link Schema.isFinite} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isFiniteReviver: FilterReviver<null> = makeReviverFilter(
  "effect/schema/isFinite",
  Schema.Null,
  ({ annotations }) => Schema.isFinite(annotations)
)

/**
 * Reviver for persisted `isGreaterThan` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isGreaterThan}.
 *
 * @see {@link Schema.isGreaterThan} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isGreaterThanReviver: FilterReviver<{
  readonly exclusiveMinimum: number
}> = makeReviverFilter(
  "effect/schema/isGreaterThan",
  Schema.Struct({ exclusiveMinimum: Schema.Finite }),
  ({ annotations, payload }) => Schema.isGreaterThan(payload.exclusiveMinimum, annotations)
)

/**
 * Reviver for persisted `isGreaterThanOrEqualTo` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isGreaterThanOrEqualTo}.
 *
 * @see {@link Schema.isGreaterThanOrEqualTo} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isGreaterThanOrEqualToReviver: FilterReviver<{
  readonly minimum: number
}> = makeReviverFilter(
  "effect/schema/isGreaterThanOrEqualTo",
  Schema.Struct({ minimum: Schema.Finite }),
  ({ annotations, payload }) => Schema.isGreaterThanOrEqualTo(payload.minimum, annotations)
)

/**
 * Reviver for persisted `isLessThan` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isLessThan}.
 *
 * @see {@link Schema.isLessThan} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isLessThanReviver: FilterReviver<{
  readonly exclusiveMaximum: number
}> = makeReviverFilter(
  "effect/schema/isLessThan",
  Schema.Struct({ exclusiveMaximum: Schema.Finite }),
  ({ annotations, payload }) => Schema.isLessThan(payload.exclusiveMaximum, annotations)
)

/**
 * Reviver for persisted `isLessThanOrEqualTo` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isLessThanOrEqualTo}.
 *
 * @see {@link Schema.isLessThanOrEqualTo} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isLessThanOrEqualToReviver: FilterReviver<{
  readonly maximum: number
}> = makeReviverFilter(
  "effect/schema/isLessThanOrEqualTo",
  Schema.Struct({ maximum: Schema.Finite }),
  ({ annotations, payload }) => Schema.isLessThanOrEqualTo(payload.maximum, annotations)
)

/**
 * Reviver for persisted `isBetween` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isBetween}.
 *
 * @see {@link Schema.isBetween} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isBetweenReviver: FilterReviver<{
  readonly minimum: number
  readonly maximum: number
  readonly exclusiveMinimum?: true | undefined
  readonly exclusiveMaximum?: true | undefined
}> = makeReviverFilter(
  "effect/schema/isBetween",
  Schema.Struct({
    minimum: Schema.Finite,
    maximum: Schema.Finite,
    exclusiveMinimum: Schema.optional(Schema.Literal(true)),
    exclusiveMaximum: Schema.optional(Schema.Literal(true))
  }),
  ({ annotations, payload }) => Schema.isBetween(payload, annotations)
)

/**
 * Reviver for persisted `isMultipleOf` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isMultipleOf}.
 *
 * @see {@link Schema.isMultipleOf} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isMultipleOfReviver: FilterReviver<{
  readonly divisor: number
}> = makeReviverFilter(
  "effect/schema/isMultipleOf",
  Schema.Struct({ divisor: Schema.Finite }),
  ({ annotations, payload }) => Schema.isMultipleOf(payload.divisor, annotations)
)

/**
 * Reviver for persisted `isInt` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isInt}.
 *
 * @see {@link Schema.isInt} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isIntReviver: FilterReviver<null> = makeReviverFilter(
  "effect/schema/isInt",
  Schema.Null,
  ({ annotations }) => Schema.isInt(annotations)
)

/**
 * Reviver for persisted `isMinLength` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isMinLength}.
 *
 * @see {@link Schema.isMinLength} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isMinLengthReviver: FilterReviver<{
  readonly minLength: number
}> = makeReviverFilter(
  "effect/schema/isMinLength",
  Schema.Struct({ minLength: Schema.Natural }),
  ({ annotations, payload }) => Schema.isMinLength(payload.minLength, annotations)
)

/**
 * Reviver for persisted `isMaxLength` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isMaxLength}.
 *
 * @see {@link Schema.isMaxLength} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isMaxLengthReviver: FilterReviver<{
  readonly maxLength: number
}> = makeReviverFilter(
  "effect/schema/isMaxLength",
  Schema.Struct({ maxLength: Schema.Natural }),
  ({ annotations, payload }) => Schema.isMaxLength(payload.maxLength, annotations)
)

/**
 * Reviver for persisted `isBetweenLength` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isBetweenLength}.
 *
 * @see {@link Schema.isBetweenLength} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isBetweenLengthReviver: FilterReviver<{
  readonly minimum: number
  readonly maximum: number
}> = makeReviverFilter(
  "effect/schema/isBetweenLength",
  Schema.Struct({ minimum: Schema.Natural, maximum: Schema.Natural }),
  ({ annotations, payload }) => Schema.isBetweenLength(payload.minimum, payload.maximum, annotations)
)

/**
 * Reviver for persisted `isMinCodePoints` checks.
 *
 * @see {@link Schema.isMinCodePoints} for creating the corresponding check
 * @category validation
 * @since 4.0.0
 */
export const isMinCodePointsReviver: FilterReviver<{
  readonly minCodePoints: number
}> = makeReviverFilter(
  "effect/schema/isMinCodePoints",
  Schema.Struct({ minCodePoints: Schema.Natural }),
  ({ annotations, payload }) => Schema.isMinCodePoints(payload.minCodePoints, annotations)
)

/**
 * Reviver for persisted `isMaxCodePoints` checks.
 *
 * @see {@link Schema.isMaxCodePoints} for creating the corresponding check
 * @category validation
 * @since 4.0.0
 */
export const isMaxCodePointsReviver: FilterReviver<{
  readonly maxCodePoints: number
}> = makeReviverFilter(
  "effect/schema/isMaxCodePoints",
  Schema.Struct({ maxCodePoints: Schema.Natural }),
  ({ annotations, payload }) => Schema.isMaxCodePoints(payload.maxCodePoints, annotations)
)

/**
 * Reviver for persisted `isBetweenCodePoints` checks.
 *
 * @see {@link Schema.isBetweenCodePoints} for creating the corresponding check
 * @category validation
 * @since 4.0.0
 */
export const isBetweenCodePointsReviver: FilterReviver<{
  readonly minimum: number
  readonly maximum: number
}> = makeReviverFilter(
  "effect/schema/isBetweenCodePoints",
  Schema.Struct({ minimum: Schema.Natural, maximum: Schema.Natural }),
  ({ annotations, payload }) => Schema.isBetweenCodePoints(payload.minimum, payload.maximum, annotations)
)

/**
 * Reviver for persisted `isMinSize` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isMinSize}.
 *
 * @see {@link Schema.isMinSize} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isMinSizeReviver: FilterReviver<{
  readonly minSize: number
}> = makeReviverFilter(
  "effect/schema/isMinSize",
  Schema.Struct({ minSize: Schema.Natural }),
  ({ annotations, payload }) => Schema.isMinSize(payload.minSize, annotations)
)

/**
 * Reviver for persisted `isMaxSize` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isMaxSize}.
 *
 * @see {@link Schema.isMaxSize} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isMaxSizeReviver: FilterReviver<{
  readonly maxSize: number
}> = makeReviverFilter(
  "effect/schema/isMaxSize",
  Schema.Struct({ maxSize: Schema.Natural }),
  ({ annotations, payload }) => Schema.isMaxSize(payload.maxSize, annotations)
)

/**
 * Reviver for persisted `isBetweenSize` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isBetweenSize}.
 *
 * @see {@link Schema.isBetweenSize} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isBetweenSizeReviver: FilterReviver<{
  readonly minimum: number
  readonly maximum: number
}> = makeReviverFilter(
  "effect/schema/isBetweenSize",
  Schema.Struct({ minimum: Schema.Natural, maximum: Schema.Natural }),
  ({ annotations, payload }) => Schema.isBetweenSize(payload.minimum, payload.maximum, annotations)
)

/**
 * Reviver for persisted `isMinProperties` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isMinProperties}.
 *
 * @see {@link Schema.isMinProperties} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isMinPropertiesReviver: FilterReviver<{
  readonly minProperties: number
}> = makeReviverFilter(
  "effect/schema/isMinProperties",
  Schema.Struct({ minProperties: Schema.Natural }),
  ({ annotations, payload }) => Schema.isMinProperties(payload.minProperties, annotations)
)

/**
 * Reviver for persisted `isMaxProperties` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isMaxProperties}.
 *
 * @see {@link Schema.isMaxProperties} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isMaxPropertiesReviver: FilterReviver<{
  readonly maxProperties: number
}> = makeReviverFilter(
  "effect/schema/isMaxProperties",
  Schema.Struct({ maxProperties: Schema.Natural }),
  ({ annotations, payload }) => Schema.isMaxProperties(payload.maxProperties, annotations)
)

/**
 * Reviver for persisted `isBetweenProperties` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isBetweenProperties}.
 *
 * @see {@link Schema.isBetweenProperties} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isBetweenPropertiesReviver: FilterReviver<{
  readonly minimum: number
  readonly maximum: number
}> = makeReviverFilter(
  "effect/schema/isBetweenProperties",
  Schema.Struct({ minimum: Schema.Natural, maximum: Schema.Natural }),
  ({ annotations, payload }) => Schema.isBetweenProperties(payload.minimum, payload.maximum, annotations)
)

/**
 * Reviver for persisted `isPropertyNames` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isPropertyNames}.
 *
 * @see {@link Schema.isPropertyNames} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isPropertyNamesReviver: FilterReviver<null> = makeReviverFilter(
  "effect/schema/isPropertyNames",
  Schema.Null,
  ({ annotations, schemas }) => Schema.isPropertyNames(schemas[0], annotations)
)

/**
 * Reviver for persisted `isUnique` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isUnique}.
 *
 * @see {@link Schema.isUnique} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isUniqueReviver: FilterReviver<null> = makeReviverFilter(
  "effect/schema/isUnique",
  Schema.Null,
  ({ annotations }) => Schema.isUnique(annotations)
)

/**
 * Reviver for persisted `isUniqueKey` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isUniqueKey}.
 *
 * @see {@link Schema.isUniqueKey} for creating the corresponding check
 * @category validation
 * @since 4.0.0
 */
export const isUniqueKeyReviver: FilterReviver<null> = makeReviverFilter(
  "effect/schema/isUniqueKey",
  Schema.Null,
  ({ annotations }) => Schema.isUniqueKey(annotations)
)

/**
 * Reviver for persisted `Option` declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain schemas created by {@link Schema.Option}.
 *
 * @see {@link Schema.Option} for creating the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const OptionReviver: DeclarationReviver<null> = makeReviverDeclaration(
  "effect/schema/Option",
  Schema.Null,
  ({ annotations, typeParameters }) => {
    const schema = Schema.Option(typeParameters[0])
    return annotations === undefined ? schema : schema.annotate(annotations)
  }
)

/**
 * Reviver for persisted {@link Schema.Result} declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain schemas created by {@link Schema.Result}.
 *
 * @see {@link Schema.Result} for creating the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const ResultReviver: DeclarationReviver<null> = makeReviverDeclaration(
  "effect/schema/Result",
  Schema.Null,
  ({ annotations, typeParameters }) => {
    const schema = Schema.Result(typeParameters[0], typeParameters[1])
    return annotations === undefined ? schema : schema.annotate(annotations)
  }
)

/**
 * Reviver for persisted {@link Schema.Redacted} declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain schemas created by {@link Schema.Redacted}.
 *
 * @see {@link Schema.Redacted} for creating the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const RedactedReviver: DeclarationReviver<RedactedRepresentationPayload> = makeReviverDeclaration(
  "effect/schema/Redacted",
  RedactedRepresentationPayload,
  ({ annotations, payload, typeParameters }) => {
    const schema = Schema.Redacted(typeParameters[0], payload ?? undefined)
    return annotations === undefined ? schema : schema.annotate(annotations)
  }
)

/**
 * Reviver for persisted `CauseReason` declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain schemas created by {@link Schema.CauseReason}.
 *
 * @see {@link Schema.CauseReason} for creating the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const CauseReasonReviver: DeclarationReviver<null> = makeReviverDeclaration(
  "effect/schema/CauseReason",
  Schema.Null,
  ({ annotations, typeParameters }) => {
    const schema = Schema.CauseReason(typeParameters[0], typeParameters[1])
    return annotations === undefined ? schema : schema.annotate(annotations)
  }
)

/**
 * Reviver for persisted `Cause` declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain schemas created by {@link Schema.Cause}.
 *
 * @see {@link Schema.Cause} for creating the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const CauseReviver: DeclarationReviver<null> = makeReviverDeclaration(
  "effect/schema/Cause",
  Schema.Null,
  ({ annotations, typeParameters }) => {
    const schema = Schema.Cause(typeParameters[0], typeParameters[1])
    return annotations === undefined ? schema : schema.annotate(annotations)
  }
)

/**
 * Reviver for persisted {@link Schema.ErrorInstance} declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain schemas created by {@link Schema.ErrorInstance}.
 *
 * @see {@link Schema.ErrorInstance} for creating the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const ErrorInstanceReviver: DeclarationReviver<ErrorRepresentationPayload> = makeReviverDeclaration(
  "effect/schema/Error",
  ErrorRepresentationPayload,
  ({ annotations, payload }) => {
    const schema = Schema.ErrorInstance(payload ?? undefined)
    return annotations === undefined ? schema : schema.annotate(annotations)
  }
)

/**
 * Reviver for persisted `Exit` declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain schemas created by {@link Schema.Exit}.
 *
 * @see {@link Schema.Exit} for creating the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const ExitReviver: DeclarationReviver<null> = makeReviverDeclaration(
  "effect/schema/Exit",
  Schema.Null,
  ({ annotations, typeParameters }) => {
    const schema = Schema.Exit(typeParameters[0], typeParameters[1], typeParameters[2])
    return annotations === undefined ? schema : schema.annotate(annotations)
  }
)

/**
 * Reviver for persisted {@link Schema.ReadonlyMap} declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain schemas created by {@link Schema.ReadonlyMap}.
 *
 * @see {@link Schema.ReadonlyMap} for creating the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const ReadonlyMapReviver: DeclarationReviver<null> = makeReviverDeclaration(
  "effect/schema/ReadonlyMap",
  Schema.Null,
  ({ annotations, typeParameters }) => {
    const schema = Schema.ReadonlyMap(typeParameters[0], typeParameters[1])
    return annotations === undefined ? schema : schema.annotate(annotations)
  }
)

/**
 * Reviver for persisted {@link Schema.Graph} declarations.
 *
 * @category schemas
 * @since 4.0.0
 */
export const GraphReviver: DeclarationReviver<"directed" | "undirected"> = makeReviverDeclaration(
  "effect/schema/Graph",
  Schema.Literals(["directed", "undirected"]),
  ({ annotations, payload, typeParameters }) => {
    const schema = Schema.Graph(payload, typeParameters[0], typeParameters[1])
    return annotations === undefined ? schema : schema.annotate(annotations)
  }
)

/**
 * Reviver for persisted `HashMap` declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain schemas created by {@link Schema.HashMap}.
 *
 * @see {@link Schema.HashMap} for creating the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const HashMapReviver: DeclarationReviver<null> = makeReviverDeclaration(
  "effect/schema/HashMap",
  Schema.Null,
  ({ annotations, typeParameters }) => {
    const schema = Schema.HashMap(typeParameters[0], typeParameters[1])
    return annotations === undefined ? schema : schema.annotate(annotations)
  }
)

/**
 * Reviver for persisted {@link Schema.ReadonlySet} declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain schemas created by {@link Schema.ReadonlySet}.
 *
 * @see {@link Schema.ReadonlySet} for creating the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const ReadonlySetReviver: DeclarationReviver<null> = makeReviverDeclaration(
  "effect/schema/ReadonlySet",
  Schema.Null,
  ({ annotations, typeParameters }) => {
    const schema = Schema.ReadonlySet(typeParameters[0])
    return annotations === undefined ? schema : schema.annotate(annotations)
  }
)

/**
 * Reviver for persisted `HashSet` declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain schemas created by {@link Schema.HashSet}.
 *
 * @see {@link Schema.HashSet} for creating the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const HashSetReviver: DeclarationReviver<null> = makeReviverDeclaration(
  "effect/schema/HashSet",
  Schema.Null,
  ({ annotations, typeParameters }) => {
    const schema = Schema.HashSet(typeParameters[0])
    return annotations === undefined ? schema : schema.annotate(annotations)
  }
)

/**
 * Reviver for persisted {@link Schema.Chunk} declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain schemas created by {@link Schema.Chunk}.
 *
 * @see {@link Schema.Chunk} for creating the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const ChunkReviver: DeclarationReviver<null> = makeReviverDeclaration(
  "effect/schema/Chunk",
  Schema.Null,
  ({ annotations, typeParameters }) => {
    const schema = Schema.Chunk(typeParameters[0])
    return annotations === undefined ? schema : schema.annotate(annotations)
  }
)

/**
 * Reviver for persisted `RegExp` declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain the {@link Schema.RegExp} schema.
 *
 * @see {@link Schema.RegExp} for the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const RegExpReviver: DeclarationReviver<null> = makeFixedDeclarationReviver(
  "effect/schema/RegExp",
  Schema.RegExp
)

/**
 * Reviver for persisted `URL` declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain the {@link Schema.URL} schema.
 *
 * @see {@link Schema.URL} for the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const URLReviver: DeclarationReviver<null> = makeFixedDeclarationReviver("effect/schema/URL", Schema.URL)

/**
 * Reviver for persisted `Date` declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain the {@link Schema.Date} schema.
 *
 * @see {@link Schema.Date} for the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const DateReviver: DeclarationReviver<null> = makeFixedDeclarationReviver("effect/schema/Date", Schema.Date)

/**
 * Reviver for persisted {@link Schema.Duration} declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain the {@link Schema.Duration} schema.
 *
 * @see {@link Schema.Duration} for the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const DurationReviver: DeclarationReviver<null> = makeFixedDeclarationReviver(
  "effect/schema/Duration",
  Schema.Duration
)

/**
 * Reviver for persisted {@link Schema.ByteSize} declarations.
 *
 * @category schemas
 * @since 4.0.0
 */
export const ByteSizeReviver: DeclarationReviver<null> = makeFixedDeclarationReviver(
  "effect/schema/ByteSize",
  Schema.ByteSize
)

/**
 * Reviver for persisted {@link Schema.BigDecimal} declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain the {@link Schema.BigDecimal} schema.
 *
 * @see {@link Schema.BigDecimal} for the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const BigDecimalReviver: DeclarationReviver<null> = makeFixedDeclarationReviver(
  "effect/schema/BigDecimal",
  Schema.BigDecimal
)

/**
 * Reviver for persisted `File` declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain the {@link Schema.File} schema.
 *
 * @see {@link Schema.File} for the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const FileReviver: DeclarationReviver<null> = makeFixedDeclarationReviver("effect/schema/File", Schema.File)

/**
 * Reviver for persisted `FormData` declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain the {@link Schema.FormData} schema.
 *
 * @see {@link Schema.FormData} for the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const FormDataReviver: DeclarationReviver<null> = makeFixedDeclarationReviver(
  "effect/schema/FormData",
  Schema.FormData
)

/**
 * Reviver for persisted `URLSearchParams` declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain the {@link Schema.URLSearchParams} schema.
 *
 * @see {@link Schema.URLSearchParams} for the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const URLSearchParamsReviver: DeclarationReviver<null> = makeFixedDeclarationReviver(
  "effect/schema/URLSearchParams",
  Schema.URLSearchParams
)

/**
 * Reviver for persisted `Uint8Array` declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain the {@link Schema.Uint8Array} schema.
 *
 * @see {@link Schema.Uint8Array} for the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const Uint8ArrayReviver: DeclarationReviver<null> = makeFixedDeclarationReviver(
  "effect/schema/Uint8Array",
  Schema.Uint8Array
)

/**
 * Reviver for persisted {@link Schema.DateTimeUtc} declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain the {@link Schema.DateTimeUtc} schema.
 *
 * @see {@link Schema.DateTimeUtc} for the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const DateTimeUtcReviver: DeclarationReviver<null> = makeFixedDeclarationReviver(
  "effect/schema/DateTimeUtc",
  Schema.DateTimeUtc
)

/**
 * Reviver for persisted {@link Schema.TimeZoneOffset} declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain the {@link Schema.TimeZoneOffset} schema.
 *
 * @see {@link Schema.TimeZoneOffset} for the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const TimeZoneOffsetReviver: DeclarationReviver<null> = makeFixedDeclarationReviver(
  "effect/schema/TimeZoneOffset",
  Schema.TimeZoneOffset
)

/**
 * Reviver for persisted {@link Schema.TimeZoneNamed} declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain the {@link Schema.TimeZoneNamed} schema.
 *
 * @see {@link Schema.TimeZoneNamed} for the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const TimeZoneNamedReviver: DeclarationReviver<null> = makeFixedDeclarationReviver(
  "effect/schema/TimeZoneNamed",
  Schema.TimeZoneNamed
)

/**
 * Reviver for persisted {@link Schema.TimeZone} declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain the {@link Schema.TimeZone} schema.
 *
 * @see {@link Schema.TimeZone} for the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const TimeZoneReviver: DeclarationReviver<null> = makeFixedDeclarationReviver(
  "effect/schema/TimeZone",
  Schema.TimeZone
)

/**
 * Reviver for persisted {@link Schema.DateTimeZoned} declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain the {@link Schema.DateTimeZoned} schema.
 *
 * @see {@link Schema.DateTimeZoned} for the corresponding schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const DateTimeZonedReviver: DeclarationReviver<null> = makeFixedDeclarationReviver(
  "effect/schema/DateTimeZoned",
  Schema.DateTimeZoned
)

/**
 * Reviver for persisted `isGreaterThanDate` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isGreaterThanDate}.
 *
 * @see {@link Schema.isGreaterThanDate} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isGreaterThanDateReviver: FilterReviver<{
  readonly exclusiveMinimum: globalThis.Date
}> = makeReviverFilter(
  "effect/schema/isGreaterThanDate",
  Schema.Struct({ exclusiveMinimum: Schema.Date }),
  ({ annotations, payload }) => Schema.isGreaterThanDate(payload.exclusiveMinimum, annotations)
)

/**
 * Reviver for persisted `isGreaterThanOrEqualToDate` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isGreaterThanOrEqualToDate}.
 *
 * @see {@link Schema.isGreaterThanOrEqualToDate} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isGreaterThanOrEqualToDateReviver: FilterReviver<{
  readonly minimum: globalThis.Date
}> = makeReviverFilter(
  "effect/schema/isGreaterThanOrEqualToDate",
  Schema.Struct({ minimum: Schema.Date }),
  ({ annotations, payload }) => Schema.isGreaterThanOrEqualToDate(payload.minimum, annotations)
)

/**
 * Reviver for persisted `isLessThanDate` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isLessThanDate}.
 *
 * @see {@link Schema.isLessThanDate} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isLessThanDateReviver: FilterReviver<{
  readonly exclusiveMaximum: globalThis.Date
}> = makeReviverFilter(
  "effect/schema/isLessThanDate",
  Schema.Struct({ exclusiveMaximum: Schema.Date }),
  ({ annotations, payload }) => Schema.isLessThanDate(payload.exclusiveMaximum, annotations)
)

/**
 * Reviver for persisted `isLessThanOrEqualToDate` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isLessThanOrEqualToDate}.
 *
 * @see {@link Schema.isLessThanOrEqualToDate} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isLessThanOrEqualToDateReviver: FilterReviver<{
  readonly maximum: globalThis.Date
}> = makeReviverFilter(
  "effect/schema/isLessThanOrEqualToDate",
  Schema.Struct({ maximum: Schema.Date }),
  ({ annotations, payload }) => Schema.isLessThanOrEqualToDate(payload.maximum, annotations)
)

/**
 * Reviver for persisted `isBetweenDate` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isBetweenDate}.
 *
 * @see {@link Schema.isBetweenDate} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isBetweenDateReviver: FilterReviver<{
  readonly minimum: globalThis.Date
  readonly maximum: globalThis.Date
  readonly exclusiveMinimum?: true | undefined
  readonly exclusiveMaximum?: true | undefined
}> = makeReviverFilter(
  "effect/schema/isBetweenDate",
  Schema.Struct({
    minimum: Schema.Date,
    maximum: Schema.Date,
    exclusiveMinimum: Schema.optional(Schema.Literal(true)),
    exclusiveMaximum: Schema.optional(Schema.Literal(true))
  }),
  ({ annotations, payload }) => Schema.isBetweenDate(payload, annotations)
)

/**
 * Reviver for persisted `isGreaterThanBigInt` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isGreaterThanBigInt}.
 *
 * @see {@link Schema.isGreaterThanBigInt} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isGreaterThanBigIntReviver: FilterReviver<{
  readonly exclusiveMinimum: bigint
}> = makeReviverFilter(
  "effect/schema/isGreaterThanBigInt",
  Schema.Struct({ exclusiveMinimum: Schema.BigInt }),
  ({ annotations, payload }) => Schema.isGreaterThanBigInt(payload.exclusiveMinimum, annotations)
)

/**
 * Reviver for persisted `isGreaterThanOrEqualToBigInt` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isGreaterThanOrEqualToBigInt}.
 *
 * @see {@link Schema.isGreaterThanOrEqualToBigInt} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isGreaterThanOrEqualToBigIntReviver: FilterReviver<{
  readonly minimum: bigint
}> = makeReviverFilter(
  "effect/schema/isGreaterThanOrEqualToBigInt",
  Schema.Struct({ minimum: Schema.BigInt }),
  ({ annotations, payload }) => Schema.isGreaterThanOrEqualToBigInt(payload.minimum, annotations)
)

/**
 * Reviver for persisted `isLessThanBigInt` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isLessThanBigInt}.
 *
 * @see {@link Schema.isLessThanBigInt} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isLessThanBigIntReviver: FilterReviver<{
  readonly exclusiveMaximum: bigint
}> = makeReviverFilter(
  "effect/schema/isLessThanBigInt",
  Schema.Struct({ exclusiveMaximum: Schema.BigInt }),
  ({ annotations, payload }) => Schema.isLessThanBigInt(payload.exclusiveMaximum, annotations)
)

/**
 * Reviver for persisted `isLessThanOrEqualToBigInt` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isLessThanOrEqualToBigInt}.
 *
 * @see {@link Schema.isLessThanOrEqualToBigInt} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isLessThanOrEqualToBigIntReviver: FilterReviver<{
  readonly maximum: bigint
}> = makeReviverFilter(
  "effect/schema/isLessThanOrEqualToBigInt",
  Schema.Struct({ maximum: Schema.BigInt }),
  ({ annotations, payload }) => Schema.isLessThanOrEqualToBigInt(payload.maximum, annotations)
)

/**
 * Reviver for persisted `isBetweenBigInt` checks.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain checks created by {@link Schema.isBetweenBigInt}.
 *
 * @see {@link Schema.isBetweenBigInt} for creating the corresponding check
 *
 * @category validation
 * @since 4.0.0
 */
export const isBetweenBigIntReviver: FilterReviver<{
  readonly minimum: bigint
  readonly maximum: bigint
  readonly exclusiveMinimum?: true | undefined
  readonly exclusiveMaximum?: true | undefined
}> = makeReviverFilter(
  "effect/schema/isBetweenBigInt",
  Schema.Struct({
    minimum: Schema.BigInt,
    maximum: Schema.BigInt,
    exclusiveMinimum: Schema.optional(Schema.Literal(true)),
    exclusiveMaximum: Schema.optional(Schema.Literal(true))
  }),
  ({ annotations, payload }) => Schema.isBetweenBigInt(payload, annotations)
)

/**
 * Reviver for persisted `Json` declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain the {@link Schema.Json} schema.
 *
 * @see {@link Schema.Json} for the corresponding immutable JSON schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const JsonReviver: DeclarationReviver<null> = makeFixedDeclarationReviver("effect/schema/Json", Schema.Json)

/**
 * Reviver for persisted `MutableJson` declarations.
 *
 * **When to use**
 *
 * Use when reconstructing documents that may contain the {@link Schema.MutableJson} schema.
 *
 * @see {@link Schema.MutableJson} for the corresponding mutable JSON schema
 *
 * @category schemas
 * @since 4.0.0
 */
export const MutableJsonReviver: DeclarationReviver<null> = makeFixedDeclarationReviver(
  "effect/schema/MutableJson",
  Schema.MutableJson
)

const jsonSchemaRevivers: ReadonlyArray<AnyReviver> = [
  JsonReviver,
  isPatternReviver,
  isFiniteReviver,
  isGreaterThanReviver,
  isGreaterThanOrEqualToReviver,
  isLessThanReviver,
  isLessThanOrEqualToReviver,
  isMultipleOfReviver,
  isIntReviver,
  isMinLengthReviver,
  isMaxLengthReviver,
  isMinCodePointsReviver,
  isMaxCodePointsReviver,
  isMinPropertiesReviver,
  isMaxPropertiesReviver,
  isPropertyNamesReviver,
  isUniqueReviver
]

/**
 * Options for importing JSON Schema Draft 2020-12 documents.
 *
 * **When to use**
 *
 * Use when you need to configure pattern handling or transform each JSON Schema node before translation.
 *
 * **Details**
 *
 * `patterns` controls pattern constraints reached during best-effort translation, including `pattern`, the keys of
 * `patternProperties`, and patterns nested in `propertyNames`:
 *
 * - `"error"` rejects the document and is the default.
 * - `"ignore"` skips the constraint.
 * - `"apply"` compiles and enforces the constraint with the runtime's native regular expression engine in Unicode
 *   mode. Patterns that cannot be compiled with the `u` flag are rejected with their source path.
 *
 * **Gotchas**
 *
 * Use `patterns: "apply"` only for trusted documents because regular expression evaluation may block for an unbounded
 * amount of time. `patterns: "ignore"` can admit values the source rejects, but can also reject previously valid
 * values inside `oneOf` when removing constraints makes multiple branches match.
 * Input documents are assumed to be valid Draft 2020-12 schemas and are not validated against the meta-schema.
 * Ignoring `patternProperties` also skips its value constraints and `additionalProperties`, because matching keys cannot
 * be determined without evaluating the patterns.
 * `onEnter` must return a JSON Schema object. Its result is used directly, and exceptions raised by the callback pass
 * through unchanged.
 *
 * @category models
 * @since 4.0.0
 */
export interface FromJsonSchemaOptions {
  readonly onEnter?: ((schema: JsonSchema.JsonSchema) => JsonSchema.JsonSchema) | undefined
  /**
   * Controls how reached JSON Schema regular expression patterns are imported.
   *
   * @default "error"
   */
  readonly patterns?: "error" | "ignore" | "apply" | undefined
}

/**
 * Runtime and TypeScript source generated for one schema.
 *
 * @category models
 * @since 4.0.0
 */
export interface Code {
  readonly runtime: string
  readonly Type: string
}

/**
 * Creates generated runtime and TypeScript source strings for a schema.
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeCode: (runtime: string, Type: string) => Code = InternalToCodeDocument.makeCode

/**
 * Auxiliary source artifact emitted while generating schema code.
 *
 * @category models
 * @since 4.0.0
 */
export type Artifact =
  | {
    readonly _tag: "Symbol"
    readonly identifier: string
    readonly code: Code
  }
  | {
    readonly _tag: "Enum"
    readonly identifier: string
    readonly code: Code
  }
  | {
    readonly _tag: "Import"
    readonly importDeclaration: string
  }

/**
 * Generated schema code together with named references and auxiliary artifacts.
 *
 * @category models
 * @since 4.0.0
 */
export interface CodeDocument {
  readonly codes: ReadonlyArray<Code>
  readonly references: {
    readonly nonRecursives: ReadonlyArray<{
      readonly $ref: string
      readonly code: Code
    }>
    readonly recursives: Readonly<Record<string, Code>>
  }
  readonly artifacts: ReadonlyArray<Artifact>
}

/**
 * Information supplied to a reference policy for one representation candidate.
 *
 * @category models
 * @since 4.0.0
 */
export interface ReferencePolicyInput {
  /** The encoded-side AST owner for the candidate. Contextual copies can share the same owner. */
  readonly ast: SchemaAST.AST
  /** The number of times this candidate was encountered. Structurally equal ASTs remain distinct candidates. */
  readonly occurrences: number
  /** The resolved encoded-side identifier, including an inherited `Encoded` suffix when applicable. */
  readonly identifier: string | undefined
}

/**
 * Function that chooses whether a representation candidate is emitted as a named reference.
 *
 * **When to use**
 *
 * Use when you need reference allocation based on schema identity, occurrence counts, identifiers, or another
 * application-specific rule.
 *
 * **Details**
 *
 * Return a reference name to extract the candidate, or `undefined` to keep it inline. The policy is called once per
 * candidate after all occurrences have been counted. The `identifier` is the resolved identifier for the encoded AST,
 * including an `Encoded` suffix when an identifier is inherited from the source side of an encoding. If different
 * candidates request the same name, later names receive numeric suffixes in encounter order.
 *
 * **Gotchas**
 *
 * Recursive candidates always require a reference. When the policy returns `undefined` for one, the generator assigns
 * a synthetic name. Treat the input AST as immutable and keep the policy deterministic.
 *
 * @see {@link ToRepresentationOptions} for configuring representation generation
 *
 * @category models
 * @since 4.0.0
 */
export type ReferencePolicy = (input: ReferencePolicyInput) => string | undefined

/**
 * Options for generating schema representations.
 *
 * @category configuration
 * @since 4.0.0
 */
export interface ToRepresentationOptions {
  /**
   * Chooses which representation candidates are extracted as named references.
   *
   * **Details**
   *
   * The default policy returns the resolved `identifier`, so anonymous non-recursive candidates remain inline even when
   * they occur more than once.
   *
   * **Gotchas**
   *
   * Recursive candidates always require a reference and receive a synthetic name when the policy returns `undefined`.
   *
   * @default ({ identifier }) => identifier
   */
  readonly referencePolicy?: ReferencePolicy | undefined
}

/**
 * Lowers the encoded side of an AST to a live representation document.
 *
 * **When to use**
 *
 * Use when you have one `SchemaAST.AST` and need a live `Document` for inspection, persistence, or compilation.
 *
 * **Details**
 *
 * Apply `SchemaAST.toType` to the AST first to lower its type side instead. The optional reference policy controls which
 * candidates are moved into the document's shared reference table. TypeScript-only
 * distinctions such as those added by `Schema.brand` are absent from the AST
 * and cannot be reconstructed from the resulting document.
 *
 * @see {@link toRepresentations} for multiple roots sharing one reference table
 *
 * @category constructors
 * @since 4.0.0
 */
export function toRepresentation(ast: SchemaAST.AST, options?: ToRepresentationOptions): Document {
  return InternalToRepresentation.toRepresentation(ast, options)
}

/**
 * Lowers one or more AST encoded sides in a shared reference environment.
 *
 * **When to use**
 *
 * Use when several AST roots must share identifiers, occurrence counts, recursion, and allocated reference names.
 *
 * **Details**
 *
 * Apply `SchemaAST.toType` to an AST first to lower its type side instead. The reference policy observes candidates from
 * every root before any representation is emitted.
 *
 * @see {@link toRepresentation} for a single AST root
 *
 * @category constructors
 * @since 4.0.0
 */
export function toRepresentations(
  asts: readonly [SchemaAST.AST, ...Array<SchemaAST.AST>],
  options?: ToRepresentationOptions
): MultiDocument {
  return InternalToRepresentation.toRepresentations(asts, options)
}

/**
 * Wraps a single representation document as a multi-document with one root.
 *
 * **When to use**
 *
 * Use when an API such as `toCodeDocument` requires a `MultiDocument`.
 *
 * @category transforming
 * @since 4.0.0
 */
export function toMultiDocument(document: Document): MultiDocument {
  return {
    representations: [document.representation],
    references: document.references
  }
}

/**
 * Compiles a live representation document to JSON Schema Draft 2020-12.
 *
 * **When to use**
 *
 * Use when you need JSON Schema output from a representation whose checks carry compiler annotations.
 *
 * **Details**
 *
 * The generated document is intended for preliminary validation. JSON Schema
 * and Effect checks do not always have identical semantics, so the Effect
 * decoder remains the final authority. Passing JSON Schema validation does not
 * guarantee that Effect decoding will succeed.
 *
 * A `oneOf` union exports as `anyOf` when any branch contains a known
 * approximation; otherwise it retains `oneOf`. Approximation propagates through
 * checks, nested schemas, check dependencies, and recursive references. Filters
 * without a `toJsonSchema` callback and opaque declarations are approximate.
 * Custom callbacks declare their result using {@link ToJsonSchema.CheckOutput}.
 *
 * **Gotchas**
 *
 * - Reference allocation is already fixed in the input `Document`. The inherited `referencePolicy` option has no effect
 *   here; pass it to {@link toRepresentation} when creating the document.
 * - String length, RegExp flags, and decoded-object property checks can differ from Effect validation.
 * - Opaque declarations are represented by an unconstrained JSON Schema.
 * - Check callback results are used directly, and exceptions raised by a callback pass through unchanged. Callbacks
 *   must treat their input schemas as immutable. Each returned fragment must be a valid JSON Schema object graph and must
 *   not be mutated after the callback returns. The callback author is responsible for the emitted semantics.
 * - Local definition references returned by callbacks are resolved together with compiler-generated references.
 *   Invalid JSON Pointer URI fragments throw an `Error`.
 * - The default `onExcessProperty: "ignore"` matches the decoder default. Use `onExcessProperty: "error"` in both
 *   places when a closed object contract is required.
 * - Record keys require an exact translation to a pattern before they can select `patternProperties` values.
 *   Otherwise, `"ignore"` omits that index-signature constraint. In `"error"` mode, the compiler emits the generated
 *   key schemas under `propertyNames` and allows unmatched properties to satisfy any candidate index value schema.
 *   Exact selectors from other index signatures are retained, even when their value schemas are approximate.
 *
 * @see {@link toJsonSchemaMultiDocument} for multiple roots sharing definitions
 *
 * @category transforming
 * @since 4.0.0
 */
export function toJsonSchemaDocument(
  document: Document,
  options?: Schema.ToJsonSchemaOptions
): JsonSchema.Document<"draft-2020-12"> {
  return InternalToJsonSchemaDocument.toJsonSchemaDocument(document, options)
}

/**
 * Compiles multiple live representations to a shared JSON Schema Draft 2020-12 document.
 *
 * **When to use**
 *
 * Use when several representation roots must share the same JSON Schema definitions.
 *
 * **Details**
 *
 * Uses the same approximation tracking and `oneOf` and record-key fallbacks as
 * {@link toJsonSchemaDocument}, including across shared and recursive definitions.
 *
 * **Gotchas**
 *
 * - Reference allocation is already fixed in the input `MultiDocument`. The inherited `referencePolicy` option has no
 *   effect here; pass it to {@link toRepresentations} when creating the document.
 * - Every definition is compiled, including definitions that are not reachable from a root. Check callbacks must treat
 *   their input schemas as immutable. Each returned fragment must be a valid JSON Schema object graph and must not be
 *   mutated after the callback returns. Local definition references returned by callbacks are resolved together with
 *   compiler-generated references. Invalid JSON Pointer URI fragments throw an `Error`.
 * - String length, RegExp flags, decoded-object property checks, and custom check callbacks can differ from
 *   Effect validation, as described by {@link toJsonSchemaDocument}.
 *
 * @see {@link toJsonSchemaDocument} for a single root
 *
 * @category transforming
 * @since 4.0.0
 */
export function toJsonSchemaMultiDocument(
  document: MultiDocument,
  options?: Schema.ToJsonSchemaOptions
): JsonSchema.MultiDocument<"draft-2020-12"> {
  return InternalToJsonSchemaDocument.toJsonSchemaMultiDocument(document, options)
}

/**
 * Generates TypeScript source for live schema representations and their definitions.
 *
 * **When to use**
 *
 * Use when custom declarations and checks provide `toCode` callbacks and must be emitted without a central handler registry.
 *
 * **Gotchas**
 *
 * Opaque declarations and leaf checks require `toCode` callbacks. Callback results are used directly, and exceptions raised by a callback pass through unchanged.
 *
 * @category transforming
 * @since 4.0.0
 */
export function toCodeDocument(document: MultiDocument): CodeDocument {
  return InternalToCodeDocument.toCodeDocument(document)
}

const RepresentationSchema = Schema.suspend(
  (): Schema.Codec<Representation, unknown> => RepresentationUnion
)
const RepresentationsSchema = Schema.Array(RepresentationSchema)

const RepresentationAnnotationSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  payload: Schema.Json
})

const CheckRepresentationAnnotationSchema = Schema.Struct({
  ...RepresentationAnnotationSchema.fields,
  schemas: Schema.optional(RepresentationsSchema)
})

function pruneAnnotations(
  annotations: Readonly<Record<string, unknown>>
): Option.Option<Readonly<Record<string, Schema.Json>>> {
  const out: Record<string, Schema.Json> = {}
  for (const [key, value] of Object.entries(annotations)) {
    if (SchemaAST.isJson(value)) {
      InternalRecord.assignProperty(out, key, value)
    }
  }
  return Object.keys(out).length === 0 ? Option.none() : Option.some(out)
}

const AnnotationsSchema = Schema.optional(
  Schema.Record(Schema.String, Schema.Unknown)
).pipe(
  Schema.encodeTo(Schema.optionalKey(Schema.JsonObject), {
    decode: InternalGetter.passthroughSubtype(),
    encode: InternalGetter.transformOptional((annotations) =>
      Option.isNone(annotations) || annotations.value === undefined
        ? Option.none()
        : pruneAnnotations(annotations.value)
    )
  })
)

const CheckSchema = Schema.suspend((): Schema.Codec<Check, unknown> => CheckUnion)
const ChecksSchema = Schema.Array(CheckSchema)
const KeywordFields = {
  annotations: AnnotationsSchema,
  checks: ChecksSchema
}
const FilterSchema = Schema.Struct({
  _tag: Schema.tag("Filter"),
  representation: CheckRepresentationAnnotationSchema,
  annotations: AnnotationsSchema,
  aborted: Schema.Boolean
})
const FilterGroupSchema = Schema.Struct({
  _tag: Schema.tag("FilterGroup"),
  representation: Schema.optional(CheckRepresentationAnnotationSchema),
  annotations: AnnotationsSchema,
  checks: Schema.NonEmptyArray(CheckSchema)
})
const CheckUnion = Schema.Union([FilterSchema, FilterGroupSchema])

function makeKeywordSchema<Tag extends Exclude<Representation["_tag"], "Reference">>(tag: Tag) {
  return Schema.Struct({
    _tag: Schema.tag(tag),
    ...KeywordFields
  })
}

const DeclarationSchema = Schema.Struct({
  _tag: Schema.tag("Declaration"),
  representation: RepresentationAnnotationSchema,
  annotations: AnnotationsSchema,
  typeParameters: RepresentationsSchema,
  checks: ChecksSchema
})
const SuspendSchema = Schema.Struct({
  _tag: Schema.tag("Suspend"),
  annotations: AnnotationsSchema,
  checks: Schema.Tuple([]),
  thunk: RepresentationSchema
})
function makeValueSchema<Type extends string, Value>(type: Type, value: Schema.Codec<Value>) {
  return value.pipe(
    Schema.encodeTo(Schema.Struct({ type: Schema.tag(type), value }), {
      decode: InternalGetter.transform((encoded: { readonly type: Type; readonly value: Value }) => encoded.value),
      encode: InternalGetter.transform((value: Value) => ({ type, value }))
    })
  )
}
const StringValueCodec = makeValueSchema("string", Schema.String)
const NumberValueCodec = makeValueSchema("number", Schema.Number)
const LiteralSchema = Schema.Struct({
  _tag: Schema.tag("Literal"),
  ...KeywordFields,
  literal: Schema.Union([
    StringValueCodec,
    makeValueSchema("number", Schema.Finite),
    makeValueSchema("bigint", Schema.BigInt),
    makeValueSchema("boolean", Schema.Boolean)
  ])
})
const UniqueSymbolSchema = Schema.Struct({
  _tag: Schema.tag("UniqueSymbol"),
  ...KeywordFields,
  symbol: Schema.Symbol
})
const EnumSchema = Schema.Struct({
  _tag: Schema.tag("Enum"),
  ...KeywordFields,
  enums: Schema.Array(Schema.Tuple([
    Schema.String,
    Schema.Union([StringValueCodec, NumberValueCodec])
  ]))
})
const TemplateLiteralSchema = Schema.Struct({
  _tag: Schema.tag("TemplateLiteral"),
  ...KeywordFields,
  parts: RepresentationsSchema
})
const ElementSchema = Schema.Struct({
  isOptional: Schema.Boolean,
  type: RepresentationSchema,
  annotations: AnnotationsSchema
})
const ArraysSchema = Schema.Struct({
  _tag: Schema.tag("Arrays"),
  ...KeywordFields,
  elements: Schema.Array(ElementSchema),
  rest: RepresentationsSchema
})
const PropertySignatureSchema = Schema.Struct({
  name: Schema.Union([
    StringValueCodec,
    NumberValueCodec,
    makeValueSchema("symbol", Schema.Symbol)
  ]),
  type: RepresentationSchema,
  isOptional: Schema.Boolean,
  isMutable: Schema.Boolean,
  annotations: AnnotationsSchema
})
const IndexSignatureSchema = Schema.Struct({
  parameter: RepresentationSchema,
  type: RepresentationSchema
})
const ObjectsSchema = Schema.Struct({
  _tag: Schema.tag("Objects"),
  ...KeywordFields,
  propertySignatures: Schema.Array(PropertySignatureSchema),
  indexSignatures: Schema.Array(IndexSignatureSchema)
})
const UnionSchema = Schema.Struct({
  _tag: Schema.tag("Union"),
  ...KeywordFields,
  types: RepresentationsSchema,
  options: Schema.optionalKey(Schema.Struct({
    mode: Schema.optionalKey(Schema.Literals(["anyOf", "oneOf"]))
  }))
})
const ReferenceSchema = Schema.Struct({
  _tag: Schema.tag("Reference"),
  $ref: Schema.NonEmptyString
})

const RepresentationUnion = Schema.Union([
  DeclarationSchema,
  ReferenceSchema,
  SuspendSchema,
  makeKeywordSchema("Null"),
  makeKeywordSchema("Undefined"),
  makeKeywordSchema("Void"),
  makeKeywordSchema("Never"),
  makeKeywordSchema("Unknown"),
  makeKeywordSchema("Any"),
  makeKeywordSchema("String"),
  makeKeywordSchema("Number"),
  makeKeywordSchema("Boolean"),
  makeKeywordSchema("BigInt"),
  makeKeywordSchema("Symbol"),
  makeKeywordSchema("ObjectKeyword"),
  LiteralSchema,
  UniqueSymbolSchema,
  EnumSchema,
  TemplateLiteralSchema,
  ArraysSchema,
  ObjectsSchema,
  UnionSchema
])

const ReferencesSchema = Schema.Record(Schema.String, RepresentationSchema)

const DocumentFromJson: Schema.Codec<Document, Schema.Json> = Schema.toCodecJson(
  Schema.Struct({
    representation: RepresentationSchema,
    references: ReferencesSchema
  })
)

const MultiDocumentFromJson: Schema.Codec<MultiDocument, Schema.Json> = Schema.toCodecJson(
  Schema.Struct({
    representations: Schema.NonEmptyArray(RepresentationSchema),
    references: ReferencesSchema
  })
)

const encodeDocument = Schema.encodeSync(DocumentFromJson)
const encodeMultiDocument = Schema.encodeSync(MultiDocumentFromJson)
const decodeDocument = Schema.decodeSync(DocumentFromJson)
const decodeMultiDocument = Schema.decodeSync(MultiDocumentFromJson)

/**
 * Projects a live single-root representation document and encodes it as JSON.
 *
 * **When to use**
 *
 * Use when you need a stable JSON value for storage or transport after calling `toRepresentation`.
 *
 * **Gotchas**
 *
 * Generic annotations that are not JSON are omitted. Invalid persistence identities and unsupported structural values throw an `Error` containing their representation path.
 *
 * @see {@link toRepresentation} for constructing the live document
 * @see {@link toJsonMultiDocument} for documents with multiple roots
 *
 * @category encoding
 * @since 4.0.0
 */
export function toJson(document: Document): Schema.Json {
  return encodeDocument(document)
}

/**
 * Projects a live multi-root representation document and encodes it as JSON.
 *
 * **When to use**
 *
 * Use when you need one JSON value for multiple live roots that share a reference environment.
 *
 * **Gotchas**
 *
 * The root order and shared reference keys are preserved, while non-JSON generic annotations are omitted.
 *
 * @see {@link toRepresentations} for constructing the live multi-document
 * @see {@link toJson} for a single-root document
 *
 * @category encoding
 * @since 4.0.0
 */
export function toJsonMultiDocument(document: MultiDocument): Schema.Json {
  return encodeMultiDocument(document)
}

/**
 * Decodes a persisted single-root representation document from JSON.
 *
 * **When to use**
 *
 * Use when reading a representation document from storage or transport before inspecting it or passing it to `fromRepresentation`.
 *
 * **Gotchas**
 *
 * Invalid documents throw a schema decoding error. Decoding does not reconstruct runtime callbacks.
 *
 * @see {@link toJson} for encoding a document
 * @see {@link fromRepresentation} for reconstructing a runtime schema
 * @see {@link fromJsonMultiDocument} for multiple roots sharing references
 *
 * @category decoding
 * @since 4.0.0
 */
export function fromJson(input: Schema.Json): Document {
  return decodeDocument(input)
}

/**
 * Decodes a persisted multi-root representation document from JSON.
 *
 * **When to use**
 *
 * Use when reading multiple representation roots that share references before inspecting them or passing them to `fromRepresentations`.
 *
 * **Gotchas**
 *
 * Invalid documents throw a schema decoding error. Decoding does not reconstruct runtime callbacks.
 *
 * @see {@link toJsonMultiDocument} for encoding a multi-document
 * @see {@link fromRepresentations} for reconstructing runtime schemas
 * @see {@link fromJson} for a single root
 *
 * @category decoding
 * @since 4.0.0
 */
export function fromJsonMultiDocument(input: Schema.Json): MultiDocument {
  return decodeMultiDocument(input)
}

/**
 * Reconstructs a runtime schema from a representation document.
 *
 * **When to use**
 *
 * Use when you have decoded or constructed a document whose declaration and check annotations may require revivers.
 *
 * **Gotchas**
 *
 * Revivers are resolved locally by `id`; none are installed implicitly. Reviver results are used directly, and exceptions raised by a reviver pass through unchanged.
 *
 * **Example** (Restoring a persisted schema)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaRepresentation } from "effect"
 *
 * const document = SchemaRepresentation.toRepresentation(Schema.Struct({ name: Schema.String }).ast)
 * const persisted = SchemaRepresentation.toJson(document)
 * const restored = SchemaRepresentation.fromJson(persisted)
 * const schema = SchemaRepresentation.fromRepresentation(restored, { revivers: [] })
 * const Person = Schema.make<Schema.Codec<{ readonly name: string }>>(schema.ast)
 *
 * Schema.decodeUnknownSync(Person)({ name: "Ada" }) // => { name: "Ada" }
 * ```
 *
 * @see {@link fromJson} for decoding a persisted document
 * @see {@link fromRepresentations} for multiple roots sharing references
 *
 * @category transforming
 * @since 4.0.0
 */
export function fromRepresentation(
  document: Document,
  options: { readonly revivers: ReadonlyArray<AnyReviver> }
): Schema.Top {
  return InternalFromRepresentation.fromRepresentation(document, options.revivers)
}

/**
 * Reconstructs multiple runtime schemas from a representation multi-document.
 *
 * **When to use**
 *
 * Use when multiple roots must be rebuilt in one shared reference environment.
 *
 * **Gotchas**
 *
 * Only references reachable from a root are revived. Revivers are resolved locally by `id`; none are installed implicitly.
 *
 * @see {@link fromJsonMultiDocument} for decoding a persisted multi-document
 * @see {@link fromRepresentation} for a single root
 *
 * @category transforming
 * @since 4.0.0
 */
export function fromRepresentations(
  document: MultiDocument,
  options: { readonly revivers: ReadonlyArray<AnyReviver> }
): readonly [Schema.Top, ...Array<Schema.Top>] {
  return InternalFromRepresentation.fromRepresentations(document, options.revivers)
}

/**
 * Imports a JSON Schema Draft 2020-12 document as a runtime schema.
 *
 * **When to use**
 *
 * Use when you need to validate or transform values described by an external JSON Schema document.
 *
 * **Details**
 *
 * Translates a Draft 2020-12 subset using Effect schemas and built-in checks. Validation follows those checks and the
 * decoder's parse options, so import and re-export do not guarantee identical accepted values or a lossless round trip.
 * Import errors explain the unsupported constraint or reference and include its source path.
 * The input is assumed to be a valid Draft 2020-12 document; this function does not validate it against the meta-schema.
 * Instance validation semantics assume JSON-compatible JavaScript values produced by `JSON.parse`.
 *
 * **Gotchas**
 *
 * - `{ not: {} }` imports as `Never`. Other uses of `not` are unsupported.
 * - When `additionalProperties` is `true`, `{}`, or omitted, additional values use `Schema.Json` and are retained.
 *   Closed objects normally strip excess properties by default; pass `onExcessProperty: "error"` to reject them.
 *   Closed empty objects instead use `Schema.Record(Schema.String, Schema.Never)` and reject string-keyed entries
 *   regardless of that option.
 *   Object keyword scopes still constrain declared properties in intersections. Combinations requiring index
 *   signatures that exclude explicit properties or patterned keys are rejected with an explanation of the limitation.
 * - Property count and name checks run on the decoded object, after excess properties have been stripped.
 * - String `minLength` and `maxLength` checks count Unicode code points, except that `minLength: 1` uses the equivalent
 *   UTF-16 non-empty check. `integer` uses `Schema.isInt`, which requires safe integers.
 * - Applied patterns use `Schema.isPattern` with the `u` flag. Patterns that cannot be compiled in Unicode mode are
 *   rejected as unsupported translations with their source path.
 * - `$dynamicRef`, `contains`, `dependentRequired`, `dependentSchemas`, active `if` / `then` / `else`,
 *   `unevaluatedItems`, and `unevaluatedProperties` are rejected with an error identifying the unsupported keyword. Inactive
 *   conditional keywords and `minContains` / `maxContains` without `contains` have no validation effect and are ignored.
 * - Objects and arrays used as `const` values or `enum` members are rejected. Only strings, numbers, booleans, and null
 *   are supported.
 * - Intersections of overlapping unions are limited to disjoint root-type partitions and finite primitive `anyOf`
 *   literal sets. Other union intersections, including cases that would duplicate a nested choice, are rejected.
 * - Unknown extension keywords are ignored and their semantics are not enforced.
 * - Only direct local references to top-level definitions in the form `#/$defs/<escaped-token>` are supported. Root
 *   references, external references, and pointers below a definition are rejected with the supported reference format.
 *   Missing definitions are reported by name. References reached inside nested schema
 *   resources introduced by `$id` are rejected instead of resolved against the top-level definitions.
 * - Built-in declarations and checks are reconstructed with importer-owned revivers.
 * - Pattern constraints reached during translation cause an error by default. Use `patterns: "apply"` only for trusted
 *   documents, or `patterns: "ignore"` to skip them. Ignoring patterns can both admit invalid values and reject valid
 *   values when `oneOf` branches start overlapping.
 * - `onEnter` results replace the corresponding input nodes before translation.
 * - Callback results are used directly, and exceptions raised by a callback pass through unchanged.
 *
 * @see {@link fromJsonSchemaMultiDocument} for multiple roots sharing definitions
 * @see {@link toRepresentation} for converting the result to a representation document
 *
 * @category constructors
 * @since 4.0.0
 */
export function fromJsonSchemaDocument(
  document: JsonSchema.Document<"draft-2020-12">,
  options?: FromJsonSchemaOptions
): Schema.Top {
  return InternalFromJsonSchemaDocument.fromJsonSchemaDocument(document, options, jsonSchemaRevivers)
}

/**
 * Imports multiple JSON Schema Draft 2020-12 roots as runtime schemas with shared definitions.
 *
 * **When to use**
 *
 * Use when multiple imported roots share reachable definitions, aliases, or recursion.
 *
 * **Details**
 *
 * Uses the same best-effort translation, built-in checks, and excess-property behavior as {@link fromJsonSchemaDocument}.
 * The input is assumed to be a valid Draft 2020-12 document; this function does not validate it against the meta-schema.
 *
 * **Gotchas**
 *
 * - Only definitions reachable from a root are translated.
 * - Unsupported standard validation and applicator keywords are rejected with an error identifying the keyword. Unknown
 *   extension keywords are ignored and their semantics are not enforced.
 * - Objects and arrays used as `const` values or `enum` members are rejected. Only strings, numbers, booleans, and null
 *   are supported.
 * - Intersections of overlapping unions are limited to disjoint root-type partitions and finite primitive `anyOf`
 *   literal sets. Other union intersections, including cases that would duplicate a nested choice, are rejected.
 * - Only direct local references to top-level definitions in the form `#/$defs/<escaped-token>` are supported. Root
 *   references, external references, and pointers below a definition are rejected with the supported reference format.
 *   Missing definitions are reported by name. References reached inside nested schema
 *   resources introduced by `$id` are rejected instead of resolved against the top-level definitions.
 * - Pattern constraints reached during translation cause an error by default. Use `patterns: "apply"` only for trusted
 *   documents, or `patterns: "ignore"` to skip them. Ignoring patterns can both admit invalid values and reject valid
 *   values when `oneOf` branches start overlapping.
 * - Callback results are used directly, and exceptions raised by a callback pass through unchanged.
 *
 * @see {@link fromJsonSchemaDocument} for a single root
 * @see {@link toRepresentations} for converting the returned schema ASTs to a representation document
 *
 * @category constructors
 * @since 4.0.0
 */
export function fromJsonSchemaMultiDocument(
  document: JsonSchema.MultiDocument<"draft-2020-12">,
  options?: FromJsonSchemaOptions
): readonly [Schema.Top, ...Array<Schema.Top>] {
  return InternalFromJsonSchemaDocument.fromJsonSchemaMultiDocument(document, options, jsonSchemaRevivers)
}
