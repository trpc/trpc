/**
 * Represents Effect schemas as runtime trees.
 *
 * Every `Schema` has an AST made from nodes for declarations, primitives,
 * literals, arrays, objects, unions, suspended schemas, checks, annotations,
 * encoding links, and parsing context. Most users work with the higher-level
 * `Schema` module. Use `SchemaAST` when you need to inspect schema nodes, build
 * ASTs programmatically, change encoded or decoded views, collect issues, or
 * run low-level schema checks.
 *
 * @since 4.0.0
 */

import * as Arr from "./Array.ts"
import * as Cause from "./Cause.ts"
import * as Effect from "./Effect.ts"
import * as Exit from "./Exit.ts"
import { format, formatPropertyKey } from "./Formatter.ts"
import { identity, memoize, memoizeIdempotent } from "./Function.ts"
import { effectIsExit, iterateConcurrent, iterateEager, resolveConcurrency } from "./internal/effect.ts"
import * as InternalRecord from "./internal/record.ts"
import * as InternalAnnotations from "./internal/schema/annotations.ts"
import * as InternalSchemaCause from "./internal/schema/cause.ts"
import * as InternalParser from "./internal/schema/parser.ts"
import * as Pipeable from "./Pipeable.ts"
import * as Predicate from "./Predicate.ts"
import * as Result from "./Result.ts"
import type * as Schema from "./Schema.ts"
import * as SchemaGetter from "./SchemaGetter.ts"
import * as SchemaIssue from "./SchemaIssue.ts"
import type * as SchemaParser from "./SchemaParser.ts"
import * as SchemaTransformation from "./SchemaTransformation.ts"
import type * as Types from "./Types.ts"

/**
 * Discriminated union of all AST node types.
 *
 * **Details**
 *
 * Every `Schema` has an `.ast` property of this type. Use the guard functions
 * ({@link isString}, {@link isObjects}, etc.) to narrow to a specific variant,
 * then access variant-specific fields.
 *
 * - All variants share the `annotations`, `checks`, `encoding`, and `context`
 *   fields.
 * - Discriminate on the `_tag` field (e.g. `"String"`, `"Objects"`, `"Union"`).
 *
 * @see {@link isAST}
 * @category models
 * @since 4.0.0
 */
export type AST =
  | Declaration
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
  | Suspend

function makeGuard<T extends AST["_tag"]>(tag: T) {
  return (ast: AST): ast is Extract<AST, { _tag: T }> => ast._tag === tag
}

/**
 * Returns `true` if the value is an {@link AST} node (any variant).
 *
 * **Details**
 *
 * Uses the internal `TypeId` brand to distinguish AST nodes from arbitrary
 * objects.
 *
 * @see {@link AST}
 * @category guards
 * @since 4.0.0
 */
export function isAST(u: unknown): u is AST {
  return Predicate.hasProperty(u, TypeId) && u[TypeId] === TypeId
}

/**
 * Narrows an {@link AST} to {@link Declaration}.
 *
 * **When to use**
 *
 * Use to recognize declaration AST nodes before running declaration-specific
 * handling.
 *
 * @see {@link Declaration} for the AST node type narrowed by this guard
 *
 * @category guards
 * @since 3.10.0
 */
export const isDeclaration = makeGuard("Declaration")

/**
 * Narrows an {@link AST} to {@link Null}.
 *
 * **When to use**
 *
 * Use to recognize an AST node that represents exactly the `null` literal when
 * inspecting, traversing, or transforming schema ASTs.
 *
 * @see {@link Null} for the AST node type narrowed by this guard
 * @see {@link null_ null} for the singleton `Null` AST instance
 * @see {@link isLiteral} for exact primitive literal AST nodes
 *
 * @category guards
 * @since 4.0.0
 */
export const isNull = makeGuard("Null")

/**
 * Narrows an {@link AST} to {@link Undefined}.
 *
 * **When to use**
 *
 * Use to identify AST nodes that represent exactly the JavaScript `undefined`
 * value.
 *
 * @see {@link isVoid} for narrowing AST nodes that represent TypeScript `void` instead of exact `undefined`
 *
 * @category guards
 * @since 4.0.0
 */
export const isUndefined = makeGuard("Undefined")

/**
 * Narrows an {@link AST} to {@link Void}.
 *
 * **When to use**
 *
 * Use to identify AST nodes that represent the TypeScript `void` type before
 * handling `Void`-specific schema behavior.
 *
 * @see {@link isUndefined} for narrowing AST nodes that represent the literal `undefined` value instead of TypeScript `void`
 *
 * @category guards
 * @since 4.0.0
 */
export const isVoid = makeGuard("Void")

/**
 * Narrows an {@link AST} to {@link Never}.
 *
 * **When to use**
 *
 * Use to detect the AST node for a schema that can never match before handling
 * other schema variants.
 *
 * @see {@link Never} for the AST node type narrowed by this guard
 * @see {@link never} for the singleton `Never` AST instance
 *
 * @category guards
 * @since 4.0.0
 */
export const isNever = makeGuard("Never")

/**
 * Narrows an {@link AST} to {@link Unknown}.
 *
 * **When to use**
 *
 * Use when you need to inspect a schema AST and handle the `Unknown` node
 * variant specifically.
 *
 * @see {@link isAny} for the guard for the `Any` node, whose parsed result is typed as `any` rather than `unknown`
 *
 * @category guards
 * @since 4.0.0
 */
export const isUnknown = makeGuard("Unknown")

/**
 * Narrows an {@link AST} to {@link Any}.
 *
 * **When to use**
 *
 * Use when you need to inspect a schema AST and handle the `Any` node
 * variant specifically.
 *
 * @see {@link isUnknown} for the guard for the `Unknown` node, whose parsed result is typed as `unknown` rather than `any`
 *
 * @category guards
 * @since 4.0.0
 */
export const isAny = makeGuard("Any")

/**
 * Narrows an {@link AST} to {@link String}.
 *
 * **When to use**
 *
 * Use to detect schema AST nodes that match any string value while inspecting
 * or transforming a Schema AST.
 *
 * @see {@link String} for the AST node class narrowed by this guard
 * @see {@link string} for the singleton `String` AST instance
 * @see {@link isLiteral} for exact primitive literal AST nodes, including exact string literals
 *
 * @category guards
 * @since 4.0.0
 */
export const isString = makeGuard("String")

/**
 * Narrows an {@link AST} to {@link Number}.
 *
 * **When to use**
 *
 * Use to detect `Number` AST nodes while inspecting, traversing, or transforming
 * schema ASTs.
 *
 * @category guards
 * @since 4.0.0
 */
export const isNumber = makeGuard("Number")

/**
 * Narrows an {@link AST} to {@link Boolean}.
 *
 * **When to use**
 *
 * Use to identify the `Boolean` AST variant while inspecting, traversing, or
 * transforming schema definitions.
 *
 * @see {@link Boolean} for the AST node type matched by this guard
 * @see {@link boolean} for the singleton instance to use when constructing a boolean AST directly
 *
 * @category guards
 * @since 4.0.0
 */
export const isBoolean = makeGuard("Boolean")

/**
 * Narrows an {@link AST} to {@link BigInt}.
 *
 * **When to use**
 *
 * Use to identify bigint AST nodes while inspecting or transforming schema ASTs.
 *
 * @see {@link BigInt} for the AST node matched by this guard
 * @see {@link bigInt} for the singleton instance; use `isBigInt` when narrowing an existing `AST` value
 *
 * @category guards
 * @since 4.0.0
 */
export const isBigInt = makeGuard("BigInt")

/**
 * Narrows an {@link AST} to {@link Symbol}.
 *
 * **When to use**
 *
 * Use to narrow an `AST` node before handling the `Symbol` variant for schemas
 * that accept any JavaScript symbol value.
 *
 * @see {@link isUniqueSymbol} for the sibling guard that narrows the `UniqueSymbol` variant for one exact symbol value
 *
 * @category guards
 * @since 4.0.0
 */
export const isSymbol = makeGuard("Symbol")

/**
 * Narrows an {@link AST} to {@link Literal}.
 *
 * **When to use**
 *
 * Use to recognize exact string, number, boolean, or bigint literal AST nodes.
 *
 * @see {@link Literal} for the AST node type narrowed by this guard
 * @see {@link LiteralValue} for the values stored by literal nodes
 *
 * @category guards
 * @since 3.10.0
 */
export const isLiteral = makeGuard("Literal")

/**
 * Narrows an {@link AST} to {@link UniqueSymbol}.
 *
 * @category guards
 * @since 3.10.0
 */
export const isUniqueSymbol = makeGuard("UniqueSymbol")

/**
 * Narrows an {@link AST} to {@link ObjectKeyword}.
 *
 * **When to use**
 *
 * Use to identify the AST node for the TypeScript `object` keyword when
 * inspecting or transforming a Schema AST.
 *
 * @see {@link ObjectKeyword} for the AST node matched by this guard
 * @see {@link objectKeyword} for the singleton `ObjectKeyword` AST instance
 * @see {@link isObjects} for struct and record AST nodes
 *
 * @category guards
 * @since 3.10.0
 */
export const isObjectKeyword = makeGuard("ObjectKeyword")

/**
 * Narrows an {@link AST} to {@link Enum}.
 *
 * **When to use**
 *
 * Use to recognize enum AST nodes before reading enum cases or running
 * enum-specific handling.
 *
 * @see {@link Enum} for the AST node type narrowed by this guard
 *
 * @category guards
 * @since 4.0.0
 */
export const isEnum = makeGuard("Enum")

/**
 * Narrows an {@link AST} to {@link TemplateLiteral}.
 *
 * @category guards
 * @since 3.10.0
 */
export const isTemplateLiteral = makeGuard("TemplateLiteral")

/**
 * Narrows an {@link AST} to {@link Arrays}.
 *
 * **When to use**
 *
 * Use to recognize array-like AST nodes before reading their element, rest, or
 * mutability metadata.
 *
 * @see {@link Arrays} for the AST node type narrowed by this guard
 *
 * @category guards
 * @since 4.0.0
 */
export const isArrays = makeGuard("Arrays")

/**
 * Narrows an {@link AST} to {@link Objects}.
 *
 * @category guards
 * @since 4.0.0
 */
export const isObjects = makeGuard("Objects")

/**
 * Narrows an {@link AST} to {@link Union}.
 *
 * @category guards
 * @since 3.10.0
 */
export const isUnion = makeGuard("Union")

/**
 * Narrows an {@link AST} to {@link Suspend}.
 *
 * @category guards
 * @since 3.10.0
 */
export const isSuspend = makeGuard("Suspend")

/**
 * Represents a single step in an {@link Encoding} chain.
 *
 * **Details**
 *
 * A link pairs a target {@link AST} with a `Transformation` or `Middleware`
 * that converts values between the current node and the target.
 *
 * - `to` — the AST node on the other side of this transformation step.
 * - `transformation` — the bidirectional conversion logic (decode/encode).
 *
 * Links are composed into a non-empty array ({@link Encoding}) attached to
 * AST nodes that have a different encoded representation.
 *
 * @see {@link Encoding}
 * @see {@link decodeTo}
 * @category models
 * @since 4.0.0
 */
export interface Link {
  readonly to: AST
  readonly transformation:
    | SchemaTransformation.Transformation<any, any, any, any>
    | SchemaTransformation.Middleware<any, any, any, any, any, any>
}

/**
 * Constructs a {@link Link}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Link: new(
  to: AST,
  transformation:
    | SchemaTransformation.Transformation<any, any, any, any>
    | SchemaTransformation.Middleware<any, any, any, any, any, any>
) => Link = class {
  readonly to: AST
  readonly transformation:
    | SchemaTransformation.Transformation<any, any, any, any>
    | SchemaTransformation.Middleware<any, any, any, any, any, any>

  constructor(
    to: AST,
    transformation:
      | SchemaTransformation.Transformation<any, any, any, any>
      | SchemaTransformation.Middleware<any, any, any, any, any, any>
  ) {
    this.to = to
    this.transformation = transformation
  }
}

/**
 * A non-empty chain of {@link Link} values representing the transformation
 * steps between a schema's decoded (type) form and its encoded (wire) form.
 *
 * **Details**
 *
 * Stored on an AST node's `encoding` field. When `undefined`, the node has no
 * encoding transformation (type and encoded forms are identical).
 *
 * @see {@link Link}
 * @see {@link toEncoded}
 * @category models
 * @since 4.0.0
 */
export type Encoding = readonly [Link, ...Array<Link>]

/**
 * Options that control schema parsing, validation, transformation, and output behavior.
 *
 * **Details**
 *
 * Pass to `Schema.decodeUnknown`, `Schema.encode`, and related APIs to customize
 * error reporting, excess property handling, check execution, and product
 * concurrency. Options apply throughout the parse; schema annotations do not
 * override them.
 *
 * - `errors` — `"first"` (default) stops at the first error; `"all"` collects
 *   every error.
 * - `onExcessProperty` — `"ignore"` (default) strips unknown object keys;
 *   `"error"` fails.
 * - `disableChecks` — skips validation checks while still applying defaults and
 *   transformations.
 * - `concurrency` — controls concurrent parsing of tuple elements, array
 *   elements, struct fields, and record entries using the same semantics as
 *   `Effect.forEach`; the default is sequential.
 * - `reportInput` — includes rejected input values in value-bearing schema
 *   issues.
 *
 * Object property order is unspecified, including in values passed to checks.
 * Decoding and encoding do not guarantee preservation of input key order.
 *
 * @category options
 * @since 3.10.0
 */
export interface ParseOptions {
  /**
   * Controls how many parsing errors are reported.
   *
   * **Details**
   *
   * The default, `"first"`, stops at the first error. Set the option to `"all"`
   * to collect every parsing error, which can help with debugging or with
   * presenting more complete error messages to a user.
   *
   * @default "first"
   */
  readonly errors?: "first" | "all" | undefined

  /**
   * Controls how object parsing handles keys that are not declared by the schema.
   *
   * **Details**
   *
   * The default, `"ignore"`, strips unspecified properties from the output. Use
   * `"error"` to fail when an excess property is present. A key is covered by a
   * declared property or any index signature selecting that key. This applies
   * to structs, records, and structs with rest. Values must satisfy every
   * applicable index signature. Empty structs keep their non-nullish behavior.
   *
   * An excess property is an enumerable own property that is not covered by a
   * declared property or an index signature. Non-enumerable own properties,
   * such as `Error#stack`, are ignored unless explicitly declared by the
   * schema. Index signatures likewise select only enumerable own properties.
   *
   * @default "ignore"
   */
  readonly onExcessProperty?: "ignore" | "error" | undefined

  /**
   * Whether to disable checks while still applying defaults and
   * transformations.
   */
  readonly disableChecks?: boolean | undefined

  /**
   * Controls how many children of a product schema may parse concurrently.
   *
   * **Details**
   *
   * This option has the same concurrency semantics as {@link Effect.forEach}.
   * It applies to tuples, arrays, structs, records, and structs with rest. Each
   * nested product applies the limit independently. Union members remain
   * sequential, though products inside the current union member still receive
   * the option.
   *
   * Array and tuple outputs retain their element order. Other observable work,
   * including issue accumulation and colliding transformed record keys, follows
   * effect completion order when concurrency is greater than `1`.
   *
   * **Gotchas**
   *
   * With `errors: "first"`, the first observed child failure interrupts the
   * remaining children and may not belong to the earliest product position.
   * Concurrent children may perform effects before another child fails.
   *
   * @default undefined
   */
  readonly concurrency?: Types.Concurrency | undefined

  /**
   * Whether schema issues should retain and report rejected input values.
   *
   * **Details**
   *
   * When enabled, value-bearing issues created by the parser expose an `input`
   * field. Built-in formatters may include reported input in default messages.
   * The input is retained by reference rather than copied.
   *
   * **Gotchas**
   *
   * Enabling this option can retain or disclose secrets, personally
   * identifiable information, and large object graphs. The `input` field is
   * enumerable and may be included by object enumeration, spread, or
   * serialization. Issues returned directly by user-defined declarations,
   * checks, transformations, and middleware are not modified; their authors
   * decide whether to retain an input. To respect this option, pass the
   * callback's input and parse options directly to a value-bearing issue
   * constructor. Custom messages and annotations remain the caller's
   * responsibility regardless of this option.
   * Formatting an issue with `SchemaIssue.makeFormatterDefault()`, reading
   * `SchemaError.message`, or formatting a Standard Schema failure can disclose
   * retained input.
   *
   * @default false
   */
  readonly reportInput?: boolean | undefined
}

/** @internal */
export const defaultParseOptions: ParseOptions = {}

/**
 * Represents per-property metadata attached to an AST node's `context` field.
 *
 * **Details**
 *
 * Tracks whether a property key is optional, mutable, has a constructor
 * default, or carries key-level annotations. Typically set by helpers like
 * {@link optionalKey} and `Schema.mutableKey`.
 *
 * - `isOptional` — the property key may be absent from the input.
 * - `isMutable` — the property is `readonly` when `false`.
 * - `constructorDefault` — an effect evaluated during construction to supply
 *   missing values.
 * - `annotations` — key-level annotations (e.g. description of the key
 *   itself).
 *
 * @see `Schema.optionalKey`
 * @see {@link isOptional}
 * @category models
 * @since 4.0.0
 */
export interface Context {
  readonly isOptional: boolean
  readonly isMutable: boolean
  /** Used for constructor default values (e.g. `withConstructorDefault` API) */
  readonly constructorDefault: Effect.Effect<unknown, SchemaIssue.Issue> | undefined
  readonly annotations: Schema.Annotations.Key<unknown> | undefined
}

/**
 * Constructs a {@link Context}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Context: new(
  isOptional: boolean,
  isMutable: boolean, /** Used for constructor default values (e.g. `withConstructorDefault` API) */
  constructorDefault?: Effect.Effect<unknown, SchemaIssue.Issue> | undefined,
  annotations?: Schema.Annotations.Key<unknown> | undefined
) => Context = class {
  readonly isOptional: boolean
  readonly isMutable: boolean
  /** Used for constructor default values (e.g. `withConstructorDefault` API) */
  readonly constructorDefault: Effect.Effect<unknown, SchemaIssue.Issue> | undefined
  readonly annotations: Schema.Annotations.Key<unknown> | undefined

  constructor(
    isOptional: boolean,
    isMutable: boolean,
    /** Used for constructor default values (e.g. `withConstructorDefault` API) */
    constructorDefault: Effect.Effect<unknown, SchemaIssue.Issue> | undefined = undefined,
    annotations: Schema.Annotations.Key<unknown> | undefined = undefined
  ) {
    this.isOptional = isOptional
    this.isMutable = isMutable
    this.constructorDefault = constructorDefault
    this.annotations = annotations
  }
}

/**
 * Non-empty array of validation {@link Check} values attached to an AST node's
 * `checks` field.
 *
 * **Details**
 *
 * Checks are run after basic type matching succeeds. They represent
 * refinements like `minLength`, `pattern`, `int`, etc.
 *
 * @see {@link Check}
 * @see {@link Filter}
 * @see {@link FilterGroup}
 * @category models
 * @since 4.0.0
 */
export type Checks = readonly [Check<any>, ...Array<Check<any>>]

const TypeId = "~effect/Schema"
interface ASTNode {
  readonly [TypeId]: typeof TypeId
  readonly _tag: string
  readonly annotations: Schema.Annotations.Annotations | undefined
  readonly checks: Checks | undefined
  readonly encoding: Encoding | undefined
  readonly context: Context | undefined
  toString(): string
}

abstract class ASTNodeImpl implements ASTNode {
  readonly [TypeId] = TypeId
  abstract readonly _tag: string
  readonly annotations: Schema.Annotations.Annotations | undefined
  readonly checks: Checks | undefined
  readonly encoding: Encoding | undefined
  readonly context: Context | undefined

  constructor(
    annotations: Schema.Annotations.Annotations | undefined = undefined,
    checks: Checks | undefined = undefined,
    encoding: Encoding | undefined = undefined,
    context: Context | undefined = undefined
  ) {
    this.annotations = annotations
    this.checks = checks
    this.encoding = encoding
    this.context = context
  }
  toString() {
    return `<${this._tag}>`
  }
}

type DeclarationRun = (
  typeParameters: ReadonlyArray<AST>
) => (input: unknown, self: Declaration, options: ParseOptions) => Effect.Effect<any, SchemaIssue.Issue>

/**
 * AST node for user-defined opaque types with custom parsing logic.
 *
 * **When to use**
 *
 * Use when you need a custom schema AST node because none of the built-in
 * nodes fit.
 *
 * **Details**
 *
 * - `typeParameters` — inner schemas this declaration is parameterized over
 *   (e.g. the element type for a custom collection).
 * - `run` — factory that receives `typeParameters` and returns a parser that
 *   validates or transforms raw input. The `Effect` returned by the parser must
 *   complete synchronously.
 *
 * @see {@link isDeclaration}
 * @category models
 * @since 4.0.0
 */
export interface Declaration extends ASTNode {
  readonly _tag: "Declaration"
  readonly typeParameters: ReadonlyArray<AST>
  readonly run: DeclarationRun
  readonly encodingChecks: Checks | undefined
  /**
   * Parser factory {@link flip} swaps in, so a declaration can behave
   * differently when encoding. `undefined` reuses `run`.
   */
  readonly encodingRun: DeclarationRun | undefined
  /** @internal */

  getParser(): SchemaParser.Parser
  /** @internal */

  recur(recur: (ast: AST) => AST): Declaration
  /** @internal */

  flip(recur: (ast: AST) => AST): Declaration
  /** @internal */

  getExpected(): string
}

/**
 * Constructs a {@link Declaration}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Declaration: new(
  typeParameters: ReadonlyArray<AST>,
  run: DeclarationRun,
  annotations?: Schema.Annotations.Annotations,
  checks?: Checks,
  encoding?: Encoding,
  context?: Context,
  encodingChecks?: Checks,
  encodingRun?: DeclarationRun
) => Declaration = class extends ASTNodeImpl {
  readonly _tag = "Declaration"
  readonly typeParameters: ReadonlyArray<AST>
  readonly run: DeclarationRun
  readonly encodingChecks: Checks | undefined
  /**
   * Parser factory {@link flip} swaps in, so a declaration can behave
   * differently when encoding. `undefined` reuses `run`.
   */
  readonly encodingRun: DeclarationRun | undefined

  constructor(
    typeParameters: ReadonlyArray<AST>,
    run: DeclarationRun,
    annotations?: Schema.Annotations.Annotations,
    checks?: Checks,
    encoding?: Encoding,
    context?: Context,
    encodingChecks?: Checks,
    encodingRun?: DeclarationRun
  ) {
    super(annotations, checks, encoding, context)
    this.typeParameters = typeParameters
    this.run = run
    this.encodingChecks = encodingChecks
    this.encodingRun = encodingRun
  }
  /** @internal */
  getParser(): SchemaParser.Parser {
    let run: ReturnType<typeof this.run>
    return (input, options) => {
      if (input === InternalParser.missing) return InternalParser.missingExit
      return (run ??= this.run(this.typeParameters))(input, this, options)
    }
  }
  private _rebuild(
    recur: (ast: AST) => AST,
    checks: Checks | undefined,
    encodingChecks: Checks | undefined,
    run: DeclarationRun,
    encodingRun: DeclarationRun | undefined
  ) {
    const tps = mapOrSame(this.typeParameters, recur)
    return tps === this.typeParameters && checks === this.checks && encodingChecks === this.encodingChecks &&
        run === this.run && encodingRun === this.encodingRun ?
      this :
      new Declaration(tps, run, this.annotations, checks, undefined, this.context, encodingChecks, encodingRun)
  }
  /** @internal */
  recur(recur: (ast: AST) => AST) {
    return this._rebuild(recur, this.checks, this.encodingChecks, this.run, this.encodingRun)
  }
  /** @internal */
  flip(recur: (ast: AST) => AST) {
    return this._rebuild(recur, this.encodingChecks, this.checks, this.encodingRun ?? this.run, this.run)
  }
  /** @internal */
  getExpected(): string {
    const expected = this.annotations?.expected
    if (typeof expected === "string") return expected
    return "<Declaration>"
  }
}

/**
 * AST node matching the `null` literal value.
 *
 * **Details**
 *
 * Parsing succeeds only when the input is exactly `null`.
 *
 * @see {@link null_ null}
 * @see {@link isNull}
 * @category models
 * @since 4.0.0
 */
export interface Null extends ASTNode {
  readonly _tag: "Null"
  /** @internal */

  getParser(): SchemaParser.Parser
  /** @internal */

  getExpected(): string
}

/**
 * Constructs a {@link Null}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Null: new(
  annotations?: Schema.Annotations.Annotations | undefined,
  checks?: Checks | undefined,
  encoding?: Encoding | undefined,
  context?: Context | undefined
) => Null = class extends ASTNodeImpl {
  readonly _tag = "Null"
  /** @internal */
  getParser() {
    return fromConst(this, null)
  }
  /** @internal */
  getExpected(): string {
    return "null"
  }
}

const null_ = new Null()
export {
  /**
   * Provides the singleton {@link Null} AST instance.
   *
   * **When to use**
   *
   * Use when you need the shared AST node for exact null values while inspecting
   * or constructing schema ASTs.
   *
   * @category constants
   * @since 4.0.0
   */
  null_ as null
}

/**
 * AST node matching the `undefined` value.
 *
 * **Details**
 *
 * Parsing succeeds only when the input is exactly `undefined`.
 *
 * @see {@link undefined}
 * @see {@link isUndefined}
 * @category models
 * @since 4.0.0
 */
export interface Undefined extends ASTNode {
  readonly _tag: "Undefined"
  /** @internal */

  getParser(): SchemaParser.Parser
  /** @internal */

  toCodecJson(): AST
  /** @internal */

  getExpected(): string
}

/**
 * Constructs a {@link Undefined}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Undefined: new(
  annotations?: Schema.Annotations.Annotations | undefined,
  checks?: Checks | undefined,
  encoding?: Encoding | undefined,
  context?: Context | undefined
) => Undefined = class extends ASTNodeImpl {
  readonly _tag = "Undefined"
  /** @internal */
  getParser() {
    return fromConst(this, undefined)
  }
  /** @internal */
  toCodecJson(): AST {
    return replaceEncoding(this, [undefinedToNull])
  }
  /** @internal */
  getExpected(): string {
    return "undefined"
  }
}

const undefinedToNull = new Link(
  null_,
  new SchemaTransformation.Transformation(
    SchemaGetter.transform(() => undefined),
    SchemaGetter.transform(() => null)
  )
)

const undefined_ = new Undefined()
export {
  /**
   * Provides the singleton {@link Undefined} AST instance.
   *
   * **When to use**
   *
   * Use when you need the shared AST node for exact undefined values while
   * inspecting or constructing schema ASTs.
   *
   * @category constants
   * @since 4.0.0
   */
  undefined_ as undefined
}

/**
 * AST node matching TypeScript `void` return-value semantics.
 *
 * **When to use**
 *
 * Use when you need an AST node for a value whose result is intentionally
 * ignored.
 *
 * **Details**
 *
 * Parsers built from this node accept any present runtime input and map it to
 * `undefined`. Public schemas built from it may still expose `void` as their
 * typed decoded and encoded representation.
 *
 * @see {@link undefined} for the AST singleton that matches only exact `undefined`
 * @see {@link void_ void}
 * @see {@link isVoid}
 * @category models
 * @since 4.0.0
 */
export interface Void extends ASTNode {
  readonly _tag: "Void"
  /** @internal */

  getParser(): (
    input: unknown
  ) => InternalParser.Success<undefined, never> | InternalParser.Success<typeof InternalParser.missing, never>
  /** @internal */

  toCodecJson(): AST
  /** @internal */

  getExpected(): string
}

/**
 * Constructs a {@link Void}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Void: new(
  annotations?: Schema.Annotations.Annotations | undefined,
  checks?: Checks | undefined,
  encoding?: Encoding | undefined,
  context?: Context | undefined
) => Void = class extends ASTNodeImpl {
  readonly _tag = "Void"
  /** @internal */
  getParser() {
    const succeed = InternalParser.succeed(undefined)
    return (input: unknown) => input === InternalParser.missing ? InternalParser.missingExit : succeed
  }
  /** @internal */
  toCodecJson(): AST {
    return replaceEncoding(this, [undefinedToNull])
  }
  /** @internal */
  getExpected(): string {
    return "void"
  }
}

const void_ = new Void()
export {
  /**
   * Provides the singleton {@link Void} AST instance.
   *
   * **When to use**
   *
   * Use when constructing or comparing AST nodes for TypeScript `void` return
   * values whose result is intentionally ignored.
   *
   * **Details**
   *
   * The node parses any present runtime value as `undefined`; schemas may still
   * expose `void` on their typed decoded and encoded sides.
   *
   * @see {@link Void} for the AST node class
   * @see {@link undefined} for the sibling AST singleton that matches exactly `undefined`
   * @see {@link isVoid} for narrowing an AST to a `Void` node
   *
   * @category constructors
   * @since 4.0.0
   */
  void_ as void
}

/**
 * AST node representing the `never` type — no value matches.
 *
 * **Details**
 *
 * Parsing always fails. Useful as a placeholder in unions or as the result
 * of narrowing that eliminates all options.
 *
 * @see {@link never}
 * @see {@link isNever}
 * @category models
 * @since 4.0.0
 */
export interface Never extends ASTNode {
  readonly _tag: "Never"
  /** @internal */

  getParser(): SchemaParser.Parser
  /** @internal */

  getExpected(): string
}

/**
 * Constructs a {@link Never}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Never: new(
  annotations?: Schema.Annotations.Annotations | undefined,
  checks?: Checks | undefined,
  encoding?: Encoding | undefined,
  context?: Context | undefined
) => Never = class extends ASTNodeImpl {
  readonly _tag = "Never"
  /** @internal */
  getParser() {
    return fromRefinement(this, Predicate.isNever)
  }
  /** @internal */
  getExpected(): string {
    return "never"
  }
}

/**
 * Provides the singleton {@link Never} AST instance.
 *
 * **When to use**
 *
 * Use to reuse the canonical bottom-type AST node when constructing,
 * comparing, or returning ASTs.
 *
 * @see {@link Never} for the AST node class
 * @see {@link isNever} for narrowing an AST to a `Never` node
 *
 * @category constructors
 * @since 4.0.0
 */
export const never = new Never()

/**
 * AST node representing the `any` type — every value matches.
 *
 * @see {@link any}
 * @see {@link isAny}
 *
 * @category models
 * @since 4.0.0
 */
export interface Any extends ASTNode {
  readonly _tag: "Any"
  /** @internal */

  getParser(): SchemaParser.Parser
  /** @internal */

  getExpected(): string
}

/**
 * Constructs a {@link Any}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Any: new(
  annotations?: Schema.Annotations.Annotations | undefined,
  checks?: Checks | undefined,
  encoding?: Encoding | undefined,
  context?: Context | undefined
) => Any = class extends ASTNodeImpl {
  readonly _tag = "Any"
  /** @internal */
  getParser() {
    return fromRefinement(this, Predicate.isUnknown)
  }
  /** @internal */
  getExpected(): string {
    return "any"
  }
}

/**
 * Provides the singleton {@link Any} AST instance.
 *
 * **When to use**
 *
 * Use when you need the singleton AST node for the TypeScript `any` type and
 * intentionally want parsing to accept every input value.
 *
 * @see {@link unknown} for the sibling AST singleton that also accepts every value while preserving the safer `unknown` type
 *
 * @category constructors
 * @since 4.0.0
 */
export const any = new Any()

/**
 * AST node representing the `unknown` type — every value matches.
 *
 * **Details**
 *
 * Unlike {@link Any}, this is type-safe: the parsed result is typed as
 * `unknown` rather than `any`.
 *
 * @see {@link unknown}
 * @see {@link isUnknown}
 * @category models
 * @since 4.0.0
 */
export interface Unknown extends ASTNode {
  readonly _tag: "Unknown"
  /** @internal */

  getParser(): SchemaParser.Parser
  /** @internal */

  getExpected(): string
}

/**
 * Constructs a {@link Unknown}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Unknown: new(
  annotations?: Schema.Annotations.Annotations | undefined,
  checks?: Checks | undefined,
  encoding?: Encoding | undefined,
  context?: Context | undefined
) => Unknown = class extends ASTNodeImpl {
  readonly _tag = "Unknown"
  /** @internal */
  getParser() {
    return fromRefinement(this, Predicate.isUnknown)
  }
  /** @internal */
  getExpected(): string {
    return "unknown"
  }
}

/**
 * Provides the singleton {@link Unknown} AST instance.
 *
 * **When to use**
 *
 * Use when you need the reusable AST singleton for a schema node that accepts
 * every value while keeping parsed values opaque.
 *
 * @see {@link any} for the singleton that accepts every value as `any`
 *
 * @category constructors
 * @since 4.0.0
 */
export const unknown = new Unknown()

/**
 * AST node matching the TypeScript `object` type — accepts objects, arrays,
 * and functions (anything non-primitive and non-null).
 *
 * @see {@link objectKeyword}
 * @see {@link isObjectKeyword}
 *
 * @category models
 * @since 4.0.0
 */
export interface ObjectKeyword extends ASTNode {
  readonly _tag: "ObjectKeyword"
  /** @internal */

  getParser(): SchemaParser.Parser
  /** @internal */

  getExpected(): string
}

/**
 * Constructs a {@link ObjectKeyword}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const ObjectKeyword: new(
  annotations?: Schema.Annotations.Annotations | undefined,
  checks?: Checks | undefined,
  encoding?: Encoding | undefined,
  context?: Context | undefined
) => ObjectKeyword = class extends ASTNodeImpl {
  readonly _tag = "ObjectKeyword"
  /** @internal */
  getParser() {
    return fromRefinement(this, Predicate.isObjectKeyword)
  }
  /** @internal */
  getExpected(): string {
    return "object | array | function"
  }
}

/**
 * Provides the singleton {@link ObjectKeyword} AST instance.
 *
 * **When to use**
 *
 * Use to reuse the canonical AST node for the TypeScript `object` keyword when
 * building or comparing `SchemaAST` values directly.
 *
 * @see {@link ObjectKeyword} for the AST node class
 * @see {@link isObjectKeyword} for narrowing an AST to an `ObjectKeyword` node
 *
 * @category constructors
 * @since 3.10.0
 */
export const objectKeyword = new ObjectKeyword()

/**
 * AST node representing a TypeScript `enum`.
 *
 * **Details**
 *
 * Holds `enums` as an array of `[name, value]` pairs where values are
 * `string | number`. Parsing succeeds when the input matches any enum value.
 *
 * @see {@link isEnum}
 * @category models
 * @since 4.0.0
 */
export interface Enum extends ASTNode {
  readonly _tag: "Enum"
  readonly enums: ReadonlyArray<
    readonly [
      string,
      string | number
    ]
  >
  /** @internal */

  getParser(): SchemaParser.Parser
  /** @internal */

  toCodecStringTree(): AST
  /** @internal */

  getExpected(): string
}

/**
 * Constructs a {@link Enum}. Numeric values must be finite.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Enum: new(
  enums: ReadonlyArray<
    readonly [
      string,
      string | number
    ]
  >,
  annotations?: Schema.Annotations.Annotations,
  checks?: Checks,
  encoding?: Encoding,
  context?: Context
) => Enum = class extends ASTNodeImpl {
  readonly _tag = "Enum"
  readonly enums: ReadonlyArray<readonly [string, string | number]>

  constructor(
    enums: ReadonlyArray<readonly [string, string | number]>,
    annotations?: Schema.Annotations.Annotations,
    checks?: Checks,
    encoding?: Encoding,
    context?: Context
  ) {
    super(annotations, checks, encoding, context)
    for (const [, value] of enums) {
      if (typeof value === "number" && !globalThis.Number.isFinite(value)) {
        throw new Error(`A numeric enum value must be finite, got ${format(value)}`)
      }
    }
    this.enums = enums
  }
  /** @internal */
  getParser() {
    const values = new Set<unknown>(this.enums.map(([, v]) => v))
    return fromRefinement(
      this,
      (input): input is typeof this.enums[number][1] => values.has(input)
    )
  }
  /** @internal */
  toCodecStringTree(): AST {
    if (this.enums.some(([_, v]) => typeof v === "number")) {
      const coercions = Object.fromEntries(this.enums.map(([_, v]) => [globalThis.String(v), v]))
      return replaceEncoding(this, [
        new Link(
          new Union(Object.keys(coercions).map((k) => new Literal(k))),
          new SchemaTransformation.Transformation(
            SchemaGetter.transform((s) => coercions[s]),
            SchemaGetter.String()
          )
        )
      ])
    }
    return this
  }
  /** @internal */
  getExpected(): string {
    return this.enums.map(([_, value]) => JSON.stringify(value)).join(" | ")
  }
}

type TemplateLiteralPart =
  | String
  | Number
  | BigInt
  | Literal
  | TemplateLiteral
  | Union<TemplateLiteralPart>

function formatTemplateLiteralPath(path: string | number): string {
  return typeof path === "number" ? `parts[${path}]` : path
}

function isTemplateLiteralPart(
  ast: AST,
  path: string | number,
  validated: Set<AST>
): ast is TemplateLiteralPart {
  if (validated.has(ast)) return true
  if (ast.encoding) {
    throw new Error(`TemplateLiteral parts cannot have an encoding at ${formatTemplateLiteralPath(path)}`)
  }
  let valid: boolean
  switch (ast._tag) {
    case "String":
    case "Number":
    case "BigInt":
      valid = true
      break
    case "Literal":
      valid = !ast.checks
      break
    case "TemplateLiteral": {
      const currentPath = formatTemplateLiteralPath(path)
      valid = !ast.checks &&
        ast.parts.every((part, index) => isTemplateLiteralPart(part, `${currentPath}.parts[${index}]`, validated))
      break
    }
    case "Union": {
      const currentPath = formatTemplateLiteralPath(path)
      valid = !ast.checks &&
        ast.types.every((part, index) => isTemplateLiteralPart(part, `${currentPath}.types[${index}]`, validated))
      break
    }
    default:
      return false
  }
  if (valid) validated.add(ast)
  return valid
}

/**
 * AST node representing a TypeScript template literal type
 * (e.g. `` `user_${string}` ``).
 *
 * **Details**
 *
 * `parts` is an array of AST nodes; each part contributes to matching
 * strings at runtime.
 *
 * @see {@link isTemplateLiteral}
 * @category models
 * @since 4.0.0
 */
export interface TemplateLiteral extends ASTNode {
  readonly _tag: "TemplateLiteral"
  readonly parts: ReadonlyArray<AST>
  /** @internal */
  readonly encodedParts: ReadonlyArray<TemplateLiteralPart>
  /** @internal */
  readonly literals: ReadonlyArray<string | undefined>
  /** @internal */
  readonly suffixLengths: ReadonlyArray<number>
  /** @internal */

  getParser(compile: SchemaParser.Compiler): SchemaParser.Parser
  /** @internal */

  getExpected(): string
  /** @internal */

  matchPart(s: string, options: ParseOptions): string | undefined
}

/**
 * Constructs a {@link TemplateLiteral}.
 *
 * **Gotchas**
 *
 * Throws if a part contains an encoding, including inside unions or nested
 * template literals. Parts must describe their values without transformations.
 *
 * @category constructors
 * @since 4.0.0
 */
export const TemplateLiteral: new(
  parts: ReadonlyArray<AST>,
  annotations?: Schema.Annotations.Annotations,
  checks?: Checks,
  encoding?: Encoding,
  context?: Context
) => TemplateLiteral = class extends ASTNodeImpl {
  readonly _tag = "TemplateLiteral"
  readonly parts: ReadonlyArray<AST>
  /** @internal */
  readonly encodedParts: ReadonlyArray<TemplateLiteralPart>
  /** @internal */
  readonly literals: ReadonlyArray<string | undefined>
  /** @internal */
  readonly suffixLengths: ReadonlyArray<number>

  constructor(
    parts: ReadonlyArray<AST>,
    annotations?: Schema.Annotations.Annotations,
    checks?: Checks,
    encoding?: Encoding,
    context?: Context
  ) {
    super(annotations, checks, encoding, context)
    const encodedParts: Array<TemplateLiteralPart> = []
    const literals: Array<string | undefined> = []
    const validated = new Set<AST>()
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index]
      if (!isTemplateLiteralPart(part, index, validated)) {
        throw new Error(`Invalid TemplateLiteral part ${part._tag}`)
      }
      encodedParts.push(part)
      literals.push(part._tag === "Literal" ? globalThis.String(part.literal) : undefined)
    }
    const suffixLengths = new Array<number>(encodedParts.length + 1)
    suffixLengths[encodedParts.length] = 0
    for (let i = encodedParts.length - 1; i >= 0; i--) {
      suffixLengths[i] = suffixLengths[i + 1] + (literals[i]?.length ?? 0)
    }
    this.parts = parts
    this.encodedParts = encodedParts
    this.literals = literals
    this.suffixLengths = suffixLengths
  }
  /** @internal */
  getParser(compile: SchemaParser.Compiler): SchemaParser.Parser {
    const tuple = new Arrays(false, this.parts.map(partFromString), [])
    const parser = compile(decodeTo(string, tuple, templateLiteralTransformation(this)))
    return (input, options) => {
      if (input === InternalParser.missing) return InternalParser.missingExit
      const result = parser(input, options)
      if ((result as Exit.Exit<unknown, unknown>)._tag === "Success") {
        return InternalParser.sameExit
      }
      return Effect.mapBothEager(result, {
        onSuccess: () => input,
        onFailure: (issue) => new SchemaIssue.Composite(this, [issue], input, options)
      })
    }
  }
  /** @internal */
  getExpected(): string {
    return "string"
  }
  /** @internal */
  matchPart(s: string, options: ParseOptions): string | undefined {
    return segmentTemplateLiteralParts(this, s, options) === undefined ? undefined : s
  }
}

/** @internal */
export function templateLiteralParser(parts: ReadonlyArray<AST>): Arrays {
  // Encoded members can overlap even when decoding selects exactly one member.
  // Match their spellings here; the original tuple enforces the union's mode.
  const normalize = memoize((encoded: AST): AST => {
    if (encoded._tag !== "Union") return encoded
    const types = mapOrSame(encoded.types, normalize)
    return (encoded.options?.mode ?? "anyOf") === "anyOf" && types === encoded.types
      ? encoded
      : new Union(
        types,
        encoded.options === undefined ? undefined : { ...encoded.options, mode: "anyOf" },
        encoded.annotations,
        encoded.checks,
        undefined,
        encoded.context
      )
  })
  const template = new TemplateLiteral(parts.map((part) => normalize(toEncoded(part))))
  const tuple = new Arrays(false, parts.map(partFromString), [])
  return decodeTo(template, tuple, templateLiteralTransformation(template))
}

function templateLiteralTransformation(template: TemplateLiteral) {
  return new SchemaTransformation.Transformation(
    SchemaGetter.transformEffect((s: string, options) => {
      const segments = segmentTemplateLiteralParts(template, s, options)
      if (segments) return Effect.succeed(segments)
      return Effect.fail(
        new SchemaIssue.InvalidValue(
          { expected: "a string matching template literal parts" },
          s,
          options
        )
      )
    }),
    SchemaGetter.transform((parts: ReadonlyArray<string>) => parts.join(""))
  )
}

/**
 * AST node matching a specific `unique symbol` value.
 *
 * **Details**
 *
 * Parsing succeeds only when the input is reference-equal to the stored
 * `symbol`.
 *
 * @see {@link isUniqueSymbol}
 * @category models
 * @since 4.0.0
 */
export interface UniqueSymbol extends ASTNode {
  readonly _tag: "UniqueSymbol"
  readonly symbol: symbol
  /** @internal */

  getParser(): SchemaParser.Parser
  /** @internal */

  toCodecStringTree(): AST
  /** @internal */

  getExpected(): string
}

/**
 * Constructs a {@link UniqueSymbol}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const UniqueSymbol: new(
  symbol: symbol,
  annotations?: Schema.Annotations.Annotations,
  checks?: Checks,
  encoding?: Encoding,
  context?: Context
) => UniqueSymbol = class extends ASTNodeImpl {
  readonly _tag = "UniqueSymbol"
  readonly symbol: symbol

  constructor(
    symbol: symbol,
    annotations?: Schema.Annotations.Annotations,
    checks?: Checks,
    encoding?: Encoding,
    context?: Context
  ) {
    super(annotations, checks, encoding, context)
    this.symbol = symbol
  }
  /** @internal */
  getParser() {
    return fromConst(this, this.symbol)
  }
  /** @internal */
  toCodecStringTree(): AST {
    const key = globalThis.Symbol.keyFor(this.symbol)
    return replaceEncoding(this, [
      new Link(
        key === undefined ? never : new Literal(globalThis.String(this.symbol)),
        symbolToString.transformation
      )
    ])
  }
  /** @internal */
  getExpected(): string {
    return globalThis.String(this.symbol)
  }
}

/**
 * The set of primitive types that can appear as a {@link Literal} value.
 *
 * @see {@link Literal}
 *
 * @category models
 * @since 3.10.0
 */
export type LiteralValue = string | number | boolean | bigint

/**
 * AST node matching an exact primitive value (string, number, boolean, or
 * bigint).
 *
 * **Details**
 *
 * Parsing succeeds only when the input is strictly equal (`===`) to the
 * stored `literal`, preserving the input value. Both `0` and `-0` are accepted
 * by either zero literal, and parsing preserves the input's sign. Numeric
 * literals must be finite. `Infinity`, `-Infinity`, and `NaN` are rejected at
 * construction time.
 *
 * **Example** (Creating a literal AST)
 *
 * ```ts import.meta.vitest
 * import { SchemaAST } from "effect"
 *
 * const ast = new SchemaAST.Literal("active")
 * ast.literal // => "active"
 * ```
 *
 * @see {@link LiteralValue}
 * @see {@link isLiteral}
 * @category models
 * @since 4.0.0
 */
export interface Literal extends ASTNode {
  readonly _tag: "Literal"
  readonly literal: LiteralValue
  /** @internal */

  getParser(): SchemaParser.Parser
  /** @internal */

  matchPart(s: string, _options: ParseOptions): LiteralValue | undefined
  /** @internal */

  toCodecJson(): AST
  /** @internal */

  toCodecStringTree(): AST
  /** @internal */

  getExpected(): string
}

/**
 * Constructs a {@link Literal}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Literal: new(
  literal: LiteralValue,
  annotations?: Schema.Annotations.Annotations,
  checks?: Checks,
  encoding?: Encoding,
  context?: Context
) => Literal = class extends ASTNodeImpl {
  readonly _tag = "Literal"
  readonly literal: LiteralValue

  constructor(
    literal: LiteralValue,
    annotations?: Schema.Annotations.Annotations,
    checks?: Checks,
    encoding?: Encoding,
    context?: Context
  ) {
    super(annotations, checks, encoding, context)
    if (typeof literal === "number" && !globalThis.Number.isFinite(literal)) {
      throw new Error(`A numeric literal must be finite, got ${format(literal)}`)
    }
    this.literal = literal
  }
  /** @internal */
  getParser() {
    return fromConst(this, this.literal)
  }
  /** @internal */
  matchPart(s: string, _options: ParseOptions): LiteralValue | undefined {
    return s === globalThis.String(this.literal) ? this.literal : undefined
  }
  /** @internal */
  toCodecJson(): AST {
    return typeof this.literal === "bigint" ? literalToString(this) : this
  }
  /** @internal */
  toCodecStringTree(): AST {
    return typeof this.literal === "string" ? this : literalToString(this)
  }
  /** @internal */
  getExpected(): string {
    return typeof this.literal === "string" ? JSON.stringify(this.literal) : globalThis.String(this.literal)
  }
}

function literalToString(ast: Literal): Literal {
  const literalAsString = globalThis.String(ast.literal)
  return replaceEncoding(ast, [
    new Link(
      new Literal(literalAsString),
      new SchemaTransformation.Transformation(
        SchemaGetter.transform(() => ast.literal),
        SchemaGetter.transform(() => literalAsString)
      )
    )
  ])
}

/**
 * AST node matching any `string` value.
 *
 * @see {@link string}
 * @see {@link isString}
 *
 * @category models
 * @since 4.0.0
 */
export interface String extends ASTNode {
  readonly _tag: "String"
  /** @internal */

  getParser(): SchemaParser.Parser
  /** @internal */

  matchPart(s: string, options: ParseOptions): string | undefined
  /** @internal */

  getExpected(): string
}

/**
 * Constructs a {@link String}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const String: new(
  annotations?: Schema.Annotations.Annotations | undefined,
  checks?: Checks | undefined,
  encoding?: Encoding | undefined,
  context?: Context | undefined
) => String = class extends ASTNodeImpl {
  readonly _tag = "String"
  /** @internal */
  getParser() {
    return fromRefinement(this, Predicate.isString)
  }
  /** @internal */
  matchPart(s: string, options: ParseOptions): string | undefined {
    const checks = this.checks
    return checks && !options.disableChecks && collectIssues(checks, s, undefined, this, options) ? undefined : s
  }
  /** @internal */
  getExpected(): string {
    return "string"
  }
}

/**
 * Provides the singleton {@link String} AST instance.
 *
 * **When to use**
 *
 * Use as the shared `SchemaAST` node for unconstrained JavaScript strings.
 *
 * @see {@link String} for the AST node class
 * @see {@link isString} for narrowing an AST to a string node
 *
 * @category constructors
 * @since 4.0.0
 */
export const string = new String()

/**
 * AST node matching any `number` value (including `NaN`, `Infinity`,
 * `-Infinity`).
 *
 * **Details**
 *
 * Default JSON serialization:
 *
 * - Finite numbers are serialized as JSON numbers.
 * - `Infinity`, `-Infinity`, and `NaN` are serialized as JSON strings.
 *
 * If the node has an `isFinite` or `isInt` check, the string fallback is
 * skipped since non-finite values cannot occur.
 *
 * @see {@link number}
 * @see {@link isNumber}
 * @category models
 * @since 4.0.0
 */
export interface Number extends ASTNode {
  readonly _tag: "Number"
  /** @internal */

  getParser(): SchemaParser.Parser
  /** @internal */

  matchKey(s: string, options: ParseOptions): number | undefined
  /** @internal */

  matchPart(s: string, options: ParseOptions): number | undefined
  /** @internal */

  toCodecJson(): AST
  /** @internal */

  toCodecStringTree(): AST
  /** @internal */

  getExpected(): string
}

/**
 * Constructs a {@link Number}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Number: new(
  annotations?: Schema.Annotations.Annotations | undefined,
  checks?: Checks | undefined,
  encoding?: Encoding | undefined,
  context?: Context | undefined
) => Number = class extends ASTNodeImpl {
  readonly _tag = "Number"
  /** @internal */
  getParser() {
    return fromRefinement(this, Predicate.isNumber)
  }
  /** @internal */
  matchKey(s: string, options: ParseOptions): number | undefined {
    return this._match(isStringNumberRegExp, s, options)
  }
  /** @internal */
  matchPart(s: string, options: ParseOptions): number | undefined {
    return this._match(isStringFiniteRegExp, s, options)
  }
  private _match(regexp: RegExp, s: string, options: ParseOptions): number | undefined {
    if (!regexp.test(s)) return undefined
    const value = globalThis.Number(s)
    if (options.disableChecks || !this.checks) return value
    return collectIssues(this.checks, value, undefined, this, options) ? undefined : value
  }
  /** @internal */
  toCodecJson(): AST {
    if (
      this.checks &&
      (hasCheck(this.checks, "effect/schema/isFinite") || hasCheck(this.checks, "effect/schema/isInt"))
    ) {
      return this
    }
    return replaceEncoding(this, [numberToJson])
  }
  /** @internal */
  toCodecStringTree(): AST {
    if (this.toCodecJson() === this) {
      return replaceEncoding(this, [finiteToString])
    }
    return replaceEncoding(this, [numberToString])
  }
  /** @internal */
  getExpected(): string {
    return "number"
  }
}

function hasCheck(checks: ReadonlyArray<Check<unknown>>, id: string): boolean {
  return checks.some((check) =>
    check.annotations?.representation?.id === id ||
    (check._tag === "FilterGroup" && hasCheck(check.checks, id))
  )
}

/**
 * Provides the singleton {@link Number} AST instance.
 *
 * **When to use**
 *
 * Use when you need the canonical `SchemaAST` node for schemas that accept any
 * JavaScript number value.
 *
 * @see {@link Number} for the AST node class and serialization behavior
 * @see {@link Literal} for exact finite numeric literal AST nodes
 *
 * @category constructors
 * @since 4.0.0
 */
export const number = new Number()

/**
 * AST node matching any `boolean` value (`true` or `false`).
 *
 * @see {@link boolean}
 * @see {@link isBoolean}
 *
 * @category models
 * @since 4.0.0
 */
export interface Boolean extends ASTNode {
  readonly _tag: "Boolean"
  /** @internal */

  getParser(): SchemaParser.Parser
  /** @internal */

  getExpected(): string
}

/**
 * Constructs a {@link Boolean}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Boolean: new(
  annotations?: Schema.Annotations.Annotations | undefined,
  checks?: Checks | undefined,
  encoding?: Encoding | undefined,
  context?: Context | undefined
) => Boolean = class extends ASTNodeImpl {
  readonly _tag = "Boolean"
  /** @internal */
  getParser() {
    return fromRefinement(this, Predicate.isBoolean)
  }
  /** @internal */
  getExpected(): string {
    return "boolean"
  }
}

/**
 * Provides the singleton {@link Boolean} AST instance.
 *
 * **When to use**
 *
 * Use to reuse the standard AST node that accepts either `true` or `false` when
 * constructing schema ASTs directly.
 *
 * @see {@link Boolean} for the AST node class
 * @see {@link Literal} for exact boolean literal AST nodes
 *
 * @category constructors
 * @since 4.0.0
 */
export const boolean = new Boolean()

/**
 * AST node matching any `symbol` value.
 *
 * **When to use**
 *
 * Use when you need the AST node class for schemas that match any JavaScript
 * symbol value.
 *
 * **Details**
 *
 * When serialized to a string-based codec, symbols are converted via
 * `Symbol.keyFor` and must be registered with `Symbol.for`.
 *
 * @see {@link symbol}
 * @see {@link isSymbol}
 * @category models
 * @since 4.0.0
 */
export interface Symbol extends ASTNode {
  readonly _tag: "Symbol"
  /** @internal */

  getParser(): SchemaParser.Parser
  /** @internal */

  matchKey(s: symbol, options: ParseOptions): symbol | undefined
  /** @internal */

  toCodecStringTree(): AST
  /** @internal */

  getExpected(): string
}

/**
 * Constructs a {@link Symbol}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Symbol: new(
  annotations?: Schema.Annotations.Annotations | undefined,
  checks?: Checks | undefined,
  encoding?: Encoding | undefined,
  context?: Context | undefined
) => Symbol = class extends ASTNodeImpl {
  readonly _tag = "Symbol"
  /** @internal */
  getParser() {
    return fromRefinement(this, Predicate.isSymbol)
  }
  /** @internal */
  matchKey(s: symbol, options: ParseOptions): symbol | undefined {
    if (options.disableChecks || !this.checks) return s
    return collectIssues(this.checks, s, undefined, this, options) ? undefined : s
  }
  /** @internal */
  toCodecStringTree(): AST {
    return replaceEncoding(this, [symbolToString])
  }
  /** @internal */
  getExpected(): string {
    return "symbol"
  }
}

/**
 * Provides the singleton {@link Symbol} AST instance.
 *
 * **When to use**
 *
 * Use to reuse the singleton AST node for schemas that match any JavaScript
 * symbol value.
 *
 * **Gotchas**
 *
 * String-based codecs can encode only symbols registered with `Symbol.for`,
 * because the implementation uses `Symbol.keyFor`.
 *
 * @see {@link UniqueSymbol} for an AST node that matches one specific symbol
 *
 * @category constructors
 * @since 4.0.0
 */
export const symbol = new Symbol()

/**
 * AST node matching any `bigint` value.
 *
 * **Details**
 *
 * When serialized to a string-based codec, bigints are converted to/from
 * their decimal string representation.
 *
 * @see {@link bigInt}
 * @see {@link isBigInt}
 * @category models
 * @since 4.0.0
 */
export interface BigInt extends ASTNode {
  readonly _tag: "BigInt"
  /** @internal */

  getParser(): SchemaParser.Parser
  /** @internal */

  matchPart(s: string, options: ParseOptions): bigint | undefined
  /** @internal */

  toCodecStringTree(): AST
  /** @internal */

  getExpected(): string
}

/**
 * Constructs a {@link BigInt}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const BigInt: new(
  annotations?: Schema.Annotations.Annotations | undefined,
  checks?: Checks | undefined,
  encoding?: Encoding | undefined,
  context?: Context | undefined
) => BigInt = class extends ASTNodeImpl {
  readonly _tag = "BigInt"
  /** @internal */
  getParser() {
    return fromRefinement(this, Predicate.isBigInt)
  }
  /** @internal */
  matchPart(s: string, options: ParseOptions): bigint | undefined {
    if (!isStringBigIntRegExp.test(s)) return undefined
    const value = globalThis.BigInt(s)
    if (options.disableChecks || !this.checks) return value
    return collectIssues(this.checks, value, undefined, this, options) ? undefined : value
  }
  /** @internal */
  toCodecStringTree(): AST {
    return replaceEncoding(this, [bigIntToString])
  }
  /** @internal */
  getExpected(): string {
    return "bigint"
  }
}

/**
 * Provides the singleton {@link BigInt} AST instance.
 *
 * **When to use**
 *
 * Use to reuse the canonical `BigInt` AST node when constructing, inspecting,
 * or transforming schemas at the AST level.
 *
 * @see {@link BigInt} for the AST node class and string-codec behavior
 * @see {@link isBigInt} for narrowing an AST to a `BigInt` node
 *
 * @category constructors
 * @since 4.0.0
 */
export const bigInt = new BigInt()

/**
 * AST node for array-like types — both tuples and arrays.
 *
 * **When to use**
 *
 * Use when constructing or inspecting AST nodes for tuple or array-like schemas,
 * including rest elements.
 *
 * **Details**
 *
 * - `elements` — positional element types (tuple elements). An element is
 *   optional if its context's `isOptional` field is `true`.
 * - `rest` — the rest/variadic element types. When non-empty, the first
 *   entry is the "spread" type (e.g. `...Array<string>`), and subsequent
 *   entries are trailing positional elements after the spread.
 * - `isMutable` — whether the resulting array is `readonly` (`false`) or
 *   mutable (`true`).
 *
 * **Gotchas**
 *
 * Construction enforces TypeScript ordering rules: a required element
 * cannot follow an optional one, and an optional element cannot follow a
 * rest element.
 *
 * **Example** (Inspecting a tuple AST)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaAST } from "effect"
 *
 * const schema = Schema.Tuple([Schema.String, Schema.Number])
 * const ast = schema.ast
 *
 * if (SchemaAST.isArrays(ast)) {
 *   [ast.elements.length, ast.rest.length] // => [2, 0]
 * }
 * ```
 *
 * @see {@link isArrays}
 * @see {@link Objects}
 * @category models
 * @since 4.0.0
 */
export interface Arrays extends ASTNode {
  readonly _tag: "Arrays"
  readonly isMutable: boolean
  readonly elements: ReadonlyArray<AST>
  readonly rest: ReadonlyArray<AST>
  readonly encodingChecks: Checks | undefined
  /** @internal */

  getParser(
    compile: SchemaParser.Compiler,
    compileField?: SchemaParser.Compiler
  ): SchemaParser.Parser
  /** @internal */

  recur(recur: (ast: AST) => AST): Arrays
  /** @internal */

  flip(recur: (ast: AST) => AST): Arrays
  /** @internal */

  getExpected(): string
}

/**
 * Constructs a {@link Arrays}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Arrays: new(
  isMutable: boolean,
  elements: ReadonlyArray<AST>,
  rest: ReadonlyArray<AST>,
  annotations?: Schema.Annotations.Annotations,
  checks?: Checks,
  encoding?: Encoding,
  context?: Context,
  encodingChecks?: Checks
) => Arrays = class extends ASTNodeImpl {
  readonly _tag = "Arrays"
  readonly isMutable: boolean
  readonly elements: ReadonlyArray<AST>
  readonly rest: ReadonlyArray<AST>
  readonly encodingChecks: Checks | undefined

  constructor(
    isMutable: boolean,
    elements: ReadonlyArray<AST>,
    rest: ReadonlyArray<AST>,
    annotations?: Schema.Annotations.Annotations,
    checks?: Checks,
    encoding?: Encoding,
    context?: Context,
    encodingChecks?: Checks
  ) {
    super(annotations, checks, encoding, context)
    this.isMutable = isMutable
    this.elements = elements
    this.rest = rest
    this.encodingChecks = encodingChecks

    let hasOptional = false
    for (let i = 0; i < elements.length; i++) {
      if (isOptional(elements[i])) {
        hasOptional = true
      } else if (hasOptional) {
        throw new Error("A required element cannot follow an optional element. ts(1257)")
      }
    }
    if (hasOptional && rest.length > 1) {
      throw new Error("A required element cannot follow an optional element. ts(1257)")
    }

    // An optional element cannot follow a rest element.ts(1266)
    for (let i = 1; i < rest.length; i++) {
      if (isOptional(rest[i])) {
        throw new Error("An optional element cannot follow a rest element. ts(1266)")
      }
    }
  }
  /** @internal */
  getParser(
    compile: SchemaParser.Compiler,
    compileField: SchemaParser.Compiler = compile
  ): SchemaParser.Parser {
    // oxlint-disable-next-line @typescript-eslint/no-this-alias
    const ast = this
    type ElementParser = { readonly ast: AST; readonly parser: SchemaParser.Parser }
    let elements: Array<ElementParser> | undefined
    let rest: Array<ElementParser> | undefined
    const elementLen = ast.elements.length
    const tailLen = Math.max(0, ast.rest.length - 1)

    function getParser(
      tailThreshold: number,
      index: number
    ): { readonly ast: AST; readonly parser: SchemaParser.Parser } {
      if (index < elementLen) {
        return elements![index]
      } else if (index >= tailThreshold) {
        return rest![index - tailThreshold + 1]
      }
      return rest![0]
    }

    const finish = (state: ArrayParserState): Effect.Effect<unknown, SchemaIssue.Issue, any> => {
      const { input, len, options } = state
      if (ast.rest.length === 0 && len > elementLen) {
        for (let i = elementLen; i < len; i++) {
          const unexpected = new SchemaIssue.UnexpectedKey(ast, input[i], options)
          const issue = new SchemaIssue.Pointer([i], unexpected)
          if (options.errors === "all") {
            if (state.issues) state.issues.push(issue)
            else state.issues = [issue]
          } else {
            return Effect.fail(new SchemaIssue.Composite(ast, [issue], input, options))
          }
        }
      }
      if (state.issues) {
        return Effect.fail(new SchemaIssue.Composite(ast, state.issues, input, options))
      }
      return InternalParser.succeed(state.output)
    }

    const parse = (
      input: ReadonlyArray<unknown>,
      options: ParseOptions
    ): Effect.Effect<unknown, SchemaIssue.Issue, any> => {
      const len = input.length
      const state: ArrayParserState = {
        ast,
        getParser,
        input,
        len,
        tailThreshold: Math.max(elementLen, len - tailLen),
        output: new globalThis.Array(len),
        issues: undefined,
        options
      }
      const end = ast.rest.length === 0 ? elementLen : Math.max(len, elementLen + tailLen)
      const concurrency = options.concurrency === undefined ? 1 : resolveConcurrency(options.concurrency)
      const eff = concurrency === 1
        ? parseArray(state, input, 0, end)
        : parseArrayConcurrent(state, input, { concurrency, end })
      if (!eff) return finish(state)
      if (effectIsExit(eff)) return Effect.flatMapEager(eff, () => finish(state))
      // Reparse on later runs to avoid reusing mutable traversal state.
      let first = true
      return Effect.suspend(() => {
        if (!first) return parse(input, options)
        first = false
        return Effect.flatMap(eff, () => finish(state))
      })
    }

    return (input, options) => {
      if (input === InternalParser.missing) return InternalParser.missingExit
      try {
        if (!Array.isArray(input)) {
          return Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
        }
        if (!elements) {
          elements = ast.elements.map((ast) => ({ ast, parser: compileField(ast) }))
          rest = ast.rest.map((ast) => ({ ast, parser: compileField(ast) }))
        }
        return parse(input, options)
      } catch (error) {
        return Effect.die(error)
      }
    }
  }
  private _rebuild(recur: (ast: AST) => AST, checks: Checks | undefined, encodingChecks: Checks | undefined) {
    const elements = mapOrSame(this.elements, recur)
    const rest = mapOrSame(this.rest, recur)
    return elements === this.elements && rest === this.rest && checks === this.checks &&
        encodingChecks === this.encodingChecks ?
      this :
      new Arrays(
        this.isMutable,
        elements,
        rest,
        this.annotations,
        checks,
        undefined,
        this.context,
        encodingChecks
      )
  }
  /** @internal */
  recur(recur: (ast: AST) => AST) {
    return this._rebuild(recur, this.checks, this.encodingChecks)
  }
  /** @internal */
  flip(recur: (ast: AST) => AST) {
    return this._rebuild(recur, this.encodingChecks, this.checks)
  }
  /** @internal */
  getExpected(): string {
    return "array"
  }
}

type ArrayParserState = {
  readonly ast: AST
  readonly input: ReadonlyArray<unknown>
  readonly len: number
  readonly getParser: (
    tailThreshold: number,
    index: number
  ) => { readonly ast: AST; readonly parser: SchemaParser.Parser }
  readonly tailThreshold: number
  readonly options: ParseOptions
  readonly output: Array<unknown>
  issues: Arr.NonEmptyArray<SchemaIssue.Issue> | undefined
}

/** @internal */
export function stepArray(
  s: ArrayParserState,
  item: unknown,
  exit: Exit.Exit<unknown, SchemaIssue.Issue>,
  i: number
) {
  if (exit._tag === "Failure") {
    return wrapPropertyKeyIssue(s, s.ast, i, exit)
  }
  const value = exit === InternalParser.sameExit
    ? item
    : (exit as InternalParser.Success<unknown, SchemaIssue.Issue>)[InternalParser.args]
  if (value !== InternalParser.missing) {
    s.output[i] = value
  } else {
    const p = s.getParser(s.tailThreshold, i)
    if (isOptional(p.ast)) return
    const issue = new SchemaIssue.Pointer([i], new SchemaIssue.MissingKey(p.ast.context?.annotations))
    if (s.options.errors === "all") {
      if (s.issues) s.issues.push(issue)
      else s.issues = [issue]
    } else {
      return Exit.fail(
        new SchemaIssue.Composite(s.ast, [issue], s.input, s.options)
      )
    }
  }
}

const parseArrayOptions = {
  onItem(s: ArrayParserState, item: unknown, i: number) {
    const value = i < s.len ? item : InternalParser.missing
    return s.getParser(s.tailThreshold, i).parser(value, s.options)
  },
  step: stepArray
}

/** @internal */
export const parseArray = iterateEager<ArrayParserState, unknown>()(parseArrayOptions)
const parseArrayConcurrent = iterateConcurrent<ArrayParserState, unknown>()(parseArrayOptions)

const wrapPropertyKeyIssue = (
  s: {
    readonly input: unknown
    readonly options: ParseOptions
    issues: Array<SchemaIssue.Issue> | undefined
  },
  ast: AST,
  key: PropertyKey,
  exit: Exit.Failure<any, SchemaIssue.Issue>
) => {
  if (exit.cause.reasons.length === 0) {
    return exit
  }
  const issue = InternalSchemaCause.getSchemaIssue(exit.cause)
  if (issue === undefined) {
    return Exit.failCause(
      Cause.map(
        exit.cause,
        (issue) =>
          new SchemaIssue.Composite(
            ast,
            [new SchemaIssue.Pointer([key], issue)],
            s.input,
            s.options
          )
      )
    )
  }
  const pointer = new SchemaIssue.Pointer([key], issue)
  if (s.options.errors === "all") {
    if (s.issues) s.issues.push(pointer)
    else s.issues = [pointer]
  } else {
    return Exit.fail(
      new SchemaIssue.Composite(ast, [pointer], s.input, s.options)
    )
  }
}

/**
 * floating point or integer, with optional exponent
 * @internal
 */
export const FINITE_PATTERN = "[+-]?\\d*\\.?\\d+(?:[Ee][+-]?\\d+)?"

/**
 * Returns the object keys that match the index signature parameter schema.
 * @internal
 */
export function getIndexSignatureKeys(
  input: { readonly [x: PropertyKey]: unknown },
  parameter: IndexSignatureParameter,
  options: ParseOptions = defaultParseOptions
): ReadonlyArray<PropertyKey> {
  let stringKeys: ReadonlyArray<string> | undefined
  let symbolKeys: ReadonlyArray<symbol> | undefined

  function go(parameter: AST): ReadonlyArray<PropertyKey> {
    switch (parameter._tag) {
      case "String":
      case "TemplateLiteral":
        return (stringKeys ??= Object.keys(input)).filter((k) => parameter.matchPart(k, options) !== undefined)
      case "Number":
        return (stringKeys ??= Object.keys(input)).filter((k) => parameter.matchKey(k, options) !== undefined)
      case "Symbol":
        return (symbolKeys ??= Object.getOwnPropertySymbols(input)).filter((k) =>
          Object.prototype.propertyIsEnumerable.call(input, k) && parameter.matchKey(k, options) !== undefined
        )
      case "Union":
        return [...new Set(parameter.types.flatMap(go))]
      default:
        return []
    }
  }
  return go(parameterFromPropertyKey(toEncoded(parameter)))
}

/**
 * Represents a named property within an {@link Objects} node.
 *
 * **Details**
 *
 * Pairs a `name` (any `PropertyKey`) with a `type` ({@link AST}). The
 * property's optionality and mutability are determined by the `type`'s
 * {@link Context}.
 *
 * @see {@link Objects}
 * @category models
 * @since 4.0.0
 */
export interface PropertySignature {
  readonly name: PropertyKey
  readonly type: AST
}

/**
 * Constructs a {@link PropertySignature}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const PropertySignature: new(name: PropertyKey, type: AST) => PropertySignature = class {
  readonly name: PropertyKey
  readonly type: AST

  constructor(
    name: PropertyKey,
    type: AST
  ) {
    this.name = name
    this.type = type
  }
}

type IndexSignatureParameter =
  | String
  | Number
  | Symbol
  | TemplateLiteral
  | Union<IndexSignatureParameter>

function isIndexSignatureParameterSide(ast: AST): ast is IndexSignatureParameter {
  switch (ast._tag) {
    case "String":
    case "Number":
    case "Symbol":
    case "TemplateLiteral":
      return true
    case "Union":
      return ast.types.every(isIndexSignatureParameterSide)
    default:
      return false
  }
}

function isIndexSignatureParameterEncodedSide(ast: AST): boolean {
  const encoded = getLastEncoding(ast)
  switch (encoded._tag) {
    case "String":
    case "Number":
    case "Symbol":
    case "TemplateLiteral":
      return true
    case "Union":
      return encoded.types.every(isIndexSignatureParameterEncodedSide)
    default:
      return false
  }
}

function isIndexSignatureParameter(ast: AST): ast is IndexSignatureParameter {
  return isIndexSignatureParameterSide(ast) && isIndexSignatureParameterEncodedSide(ast)
}

/**
 * Represents an index signature entry within an {@link Objects} node.
 *
 * **When to use**
 *
 * Use when constructing or inspecting object AST entries for record-like keys
 * and values.
 *
 * **Details**
 *
 * - `parameter` — the key type AST (e.g. {@link String} for `string` keys,
 *   {@link TemplateLiteral} for patterned keys).
 * - `type` — the value type SchemaAST.
 *
 * **Gotchas**
 *
 * Using `Schema.optionalKey` on the value type is not allowed for index
 * signatures (throws at construction); use `Schema.optional` instead.
 *
 * @see {@link Objects}
 * @see {@link PropertySignature}
 * @category models
 * @since 4.0.0
 */
export interface IndexSignature {
  readonly parameter: IndexSignatureParameter
  readonly type: AST
}

/**
 * Constructs a {@link IndexSignature}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const IndexSignature: new(parameter: AST, type: AST) => IndexSignature = class {
  readonly parameter: IndexSignatureParameter
  readonly type: AST

  constructor(
    parameter: AST,
    type: AST
  ) {
    if (!isIndexSignatureParameter(parameter)) {
      throw new Error(`Invalid index signature parameter ${parameter._tag}`)
    }
    this.parameter = parameter
    this.type = type
    if (isOptional(type) && !containsUndefined(type)) {
      throw new Error("Cannot use `Schema.optionalKey` with index signatures, use `Schema.optional` instead.")
    }
  }
}

/**
 * AST node for object-like schemas, including structs and records.
 *
 * **When to use**
 *
 * Use when constructing or inspecting AST nodes for structs or records rather
 * than array-like schemas.
 *
 * **Details**
 *
 * - `propertySignatures` — named properties with their types (struct fields).
 * - `indexSignatures` — index signature entries (record patterns), each with
 *   a `parameter` AST for matching keys and a `type` AST for values.
 *
 * An `Objects` node with no properties and no index signatures performs only a
 * non-nullish check: it accepts any value except `null` and `undefined`,
 * including primitive values.
 *
 * **Gotchas**
 *
 * Duplicate property names throw at construction time.
 *
 * **Example** (Inspecting a struct AST)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaAST } from "effect"
 *
 * const schema = Schema.Struct({ name: Schema.String })
 * const ast = schema.ast
 *
 * if (SchemaAST.isObjects(ast)) {
 *   ast.propertySignatures.map((ps) => [ps.name, ps.type._tag]) // => [["name", "String"]]
 * }
 * ```
 *
 * @see {@link isObjects}
 * @see {@link PropertySignature}
 * @see {@link IndexSignature}
 * @see {@link Arrays}
 * @category models
 * @since 4.0.0
 */
export interface Objects extends ASTNode {
  readonly _tag: "Objects"
  readonly propertySignatures: ReadonlyArray<PropertySignature>
  readonly indexSignatures: ReadonlyArray<IndexSignature>
  readonly encodingChecks: Checks | undefined
  /** @internal */

  getParser(
    compile: SchemaParser.Compiler,
    compileField?: SchemaParser.Compiler
  ): SchemaParser.Parser
  /** @internal */

  flip(recur: (ast: AST) => AST): AST
  /** @internal */

  recur(recur: (ast: AST) => AST, recurParameter?: (ast: AST) => AST): AST
  /** @internal */

  getExpected(): string
}

/**
 * Constructs a {@link Objects}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Objects: new(
  propertySignatures: ReadonlyArray<PropertySignature>,
  indexSignatures: ReadonlyArray<IndexSignature>,
  annotations?: Schema.Annotations.Annotations,
  checks?: Checks,
  encoding?: Encoding,
  context?: Context,
  encodingChecks?: Checks
) => Objects = class extends ASTNodeImpl {
  readonly _tag = "Objects"
  readonly propertySignatures: ReadonlyArray<PropertySignature>
  readonly indexSignatures: ReadonlyArray<IndexSignature>
  readonly encodingChecks: Checks | undefined

  constructor(
    propertySignatures: ReadonlyArray<PropertySignature>,
    indexSignatures: ReadonlyArray<IndexSignature>,
    annotations?: Schema.Annotations.Annotations,
    checks?: Checks,
    encoding?: Encoding,
    context?: Context,
    encodingChecks?: Checks
  ) {
    super(annotations, checks, encoding, context)
    this.propertySignatures = propertySignatures
    this.indexSignatures = indexSignatures
    this.encodingChecks = encodingChecks
  }
  /** @internal */
  getParser(
    compile: SchemaParser.Compiler,
    compileField: SchemaParser.Compiler = compile
  ): SchemaParser.Parser {
    // oxlint-disable-next-line @typescript-eslint/no-this-alias
    const ast = this
    const hasProperties = ast.propertySignatures.length
    const indexCount = ast.indexSignatures.length
    // ---------------------------------------------
    // handle empty struct
    // ---------------------------------------------
    if (!hasProperties && !indexCount) {
      return fromRefinement(ast, Predicate.isNotNullish)
    }

    let properties: Array<ParsedProperty> | undefined
    let indexes:
      | Array<{
        readonly is: IndexSignature
        readonly parserKey: SchemaParser.Parser
        readonly parserValue: SchemaParser.Parser
      }>
      | undefined
    type Index = NonNullable<typeof indexes>[number]
    const compileMembers = (): Array<ParsedProperty> => {
      if (!properties) {
        properties = ast.propertySignatures.map((ps) => ({
          parser: compileField(ps.type),
          name: ps.name,
          type: ps.type
        }))
        indexes = indexCount
          ? ast.indexSignatures.map((is) => ({
            is,
            parserKey: compile(parameterFromPropertyKey(is.parameter)),
            parserValue: compileField(is.type)
          }))
          : undefined
      }
      return properties
    }

    const makeFallback = (): SchemaParser.Parser => {
      const expectedKeys = new Set<PropertyKey>(
        ast.propertySignatures.map((ps) => typeof ps.name === "number" ? globalThis.String(ps.name) : ps.name)
      )
      const finishIndex = (
        s: ObjectParserState,
        key: PropertyKey,
        k2: PropertyKey | typeof InternalParser.missing,
        inputValue: unknown,
        exitValue: Exit.Exit<unknown, SchemaIssue.Issue>
      ): Effect.Effect<void, SchemaIssue.Issue, any> => {
        if (exitValue._tag === "Failure") {
          return wrapPropertyKeyIssue(s, ast, key, exitValue) ?? Exit.void
        }
        const value = exitValue === InternalParser.sameExit
          ? inputValue
          : (exitValue as InternalParser.Success<unknown, SchemaIssue.Issue>)[InternalParser.args]
        if (k2 !== InternalParser.missing && value !== InternalParser.missing) {
          if (
            hasProperties &&
            (expectedKeys.has(key) || expectedKeys.has(typeof k2 === "number" ? globalThis.String(k2) : k2))
          ) return Exit.void
          InternalRecord.assignProperty(s.out, k2, value)
        }
        return Exit.void
      }
      const parseIndex = (
        s: ObjectParserState,
        key: PropertyKey,
        index: Index,
        exitKey?: Exit.Exit<unknown, SchemaIssue.Issue>
      ): Effect.Effect<void, SchemaIssue.Issue, any> => {
        if (!exitKey) {
          const eff = index.parserKey(key, s.options)
          if (!effectIsExit(eff)) {
            return Effect.flatMap(Effect.exit(eff), (exit) => parseIndex(s, key, index, exit))
          }
          exitKey = eff
        }
        if (exitKey._tag === "Failure") {
          return wrapPropertyKeyIssue(s, ast, key, exitKey) ?? Exit.void
        }
        const k2 = exitKey === InternalParser.sameExit
          ? key
          : (exitKey as InternalParser.Success<PropertyKey, SchemaIssue.Issue>)[InternalParser.args]
        const inputValue = s.input[key]
        const result = index.parserValue(inputValue, s.options)
        return effectIsExit(result)
          ? finishIndex(s, key, k2, inputValue, result)
          : Effect.flatMap(Effect.exit(result), (exit) => finishIndex(s, key, k2, inputValue, exit))
      }
      const parseStringIndex = (
        s: ObjectParserState,
        key: PropertyKey,
        index: Index
      ): Effect.Effect<void, SchemaIssue.Issue, any> => {
        const inputValue = s.input[key]
        const result = index.parserValue(inputValue, s.options)
        return effectIsExit(result)
          ? finishIndex(s, key, key, inputValue, result)
          : Effect.flatMap(Effect.exit(result), (exit) => finishIndex(s, key, key, inputValue, exit))
      }
      const parseIndexes = indexCount
        ? iterateConcurrent<ObjectParserState, readonly [key: PropertyKey, index: Index]>()({
          onItem: (s, [key, index]) =>
            index.is.parameter === string ? parseStringIndex(s, key, index) : parseIndex(s, key, index),
          step: (_s, _item, exit) => exit._tag === "Failure" ? exit : undefined
        })
        : undefined
      return Effect.fnUntracedEager(function*(input, options) {
        if (input === InternalParser.missing) {
          return InternalParser.missing
        }

        // If the input is not a record, return early with an error
        if (!(typeof input === "object" && input !== null && !Array.isArray(input))) {
          return yield* Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
        }
        compileMembers()

        const record = input as Record<PropertyKey, unknown>
        const out: Record<PropertyKey, unknown> = {}
        const state = {
          ast,
          input: record,
          out,
          issues: undefined as Arr.NonEmptyArray<SchemaIssue.Issue> | undefined,
          options
        }
        const errorsAllOption = options.errors === "all"
        const onExcessPropertyError = options.onExcessProperty === "error"
        const concurrency = options.concurrency === undefined ? 1 : resolveConcurrency(options.concurrency)

        // ---------------------------------------------
        // handle excess properties
        // ---------------------------------------------
        const indexKeys = indexCount && onExcessPropertyError
          ? ast.indexSignatures.map((index) => getIndexSignatureKeys(record, index.parameter, options))
          : undefined
        if (onExcessPropertyError) {
          const coveredKeys = indexKeys ? new Set(expectedKeys) : expectedKeys
          if (indexKeys) {
            for (const keys of indexKeys) {
              for (const key of keys) coveredKeys.add(key)
            }
          }
          // Only enumerable own properties can be excess. Declared fields are
          // parsed separately, regardless of their enumerability.
          const inputKeys = Reflect.ownKeys(record)
          for (let i = 0; i < inputKeys.length; i++) {
            const key = inputKeys[i]
            if (!coveredKeys.has(key) && Object.prototype.propertyIsEnumerable.call(record, key)) {
              // key is unexpected
              const unexpected = new SchemaIssue.UnexpectedKey(ast, record[key], options)
              const issue = new SchemaIssue.Pointer([key], unexpected)
              if (errorsAllOption) {
                if (state.issues) {
                  state.issues.push(issue)
                } else {
                  state.issues = [issue]
                }
                continue
              } else {
                return yield* Effect.fail(
                  new SchemaIssue.Composite(ast, [issue], input, options)
                )
              }
            }
          }
        }

        // ---------------------------------------------
        // handle property signatures
        // ---------------------------------------------
        if (hasProperties) {
          const eff = concurrency === 1
            ? parseProperties(state, properties!)
            : parsePropertiesConcurrent(state, properties!, { concurrency })
          if (eff) yield* eff
        }

        // ---------------------------------------------
        // handle index signatures
        // ---------------------------------------------
        if (indexCount && concurrency === 1) {
          for (let i = 0; i < indexCount; i++) {
            const index = indexes![i]
            const parse = index.is.parameter === string ? parseStringIndex : parseIndex
            const keys = indexKeys?.[i] ?? (index.is.parameter === string
              ? Object.keys(record)
              : getIndexSignatureKeys(record, index.is.parameter, options))
            for (let j = 0; j < keys.length; j++) {
              const eff = parse(state, keys[j], index)
              if (!effectIsExit(eff)) yield* eff
              else if (eff._tag === "Failure") return yield* eff as Exit.Exit<never, SchemaIssue.Issue>
            }
          }
        } else if (parseIndexes) {
          const keyPairs = Arr.empty<readonly [PropertyKey, Index]>()
          for (let i = 0; i < indexCount; i++) {
            const index = indexes![i]
            const keys = indexKeys?.[i] ?? (index.is.parameter === string
              ? Object.keys(record)
              : getIndexSignatureKeys(record, index.is.parameter, options))
            for (let j = 0; j < keys.length; j++) {
              keyPairs.push([keys[j], index])
            }
          }
          const eff = parseIndexes(state, keyPairs, { concurrency })
          if (eff) yield* eff
        }

        if (state.issues) {
          return yield* Effect.fail(
            new SchemaIssue.Composite(ast, state.issues, input, options)
          )
        }
        return out
      })
    }

    if (indexCount) return makeFallback()

    let fallback: SchemaParser.Parser | undefined

    // Resumes at the property whose parser suspended, without replaying the
    // properties already parsed.
    const resume = (
      state: ObjectParserState,
      index: number,
      pending: Effect.Effect<unknown, SchemaIssue.Issue, any>
    ): Effect.Effect<unknown, SchemaIssue.Issue, any> => {
      const property = properties![index]
      return Effect.flatMap(Effect.exit(pending), (exit) => {
        const terminal = stepProperty(state, property, exit)
        if (terminal) return terminal
        const done = () => InternalParser.succeed(state.out)
        const eff = parseProperties(state, properties!.slice(index + 1))
        return eff ? Effect.flatMapEager(eff, done) : done()
      })
    }

    // Fast path: a struct without index signatures, under the default parse
    // options, needs none of the generator the fallback runs per value.
    return (input, options) => {
      if (input === InternalParser.missing) return InternalParser.missingExit
      if (
        options.errors === "all" ||
        options.onExcessProperty !== undefined ||
        (options.concurrency !== undefined && resolveConcurrency(options.concurrency) !== 1)
      ) {
        return (fallback ??= makeFallback())(input, options)
      }
      if (!(typeof input === "object" && input !== null && !Array.isArray(input))) {
        return Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
      }
      const props = compileMembers()
      const record = input as Record<PropertyKey, unknown>
      const out: Record<PropertyKey, unknown> = {}
      const state: ObjectParserState = { ast, input: record, out, issues: undefined, options }
      try {
        for (let index = 0; index < props.length; index++) {
          const property = props[index]
          const name = property.name
          const hasKey = hasPropertySignature(record, name)
          const value = hasKey ? record[name] : InternalParser.missing
          const exit = property.parser(value, options)
          if (!effectIsExit(exit)) {
            return resume(state, index, exit)
          }
          if (exit === InternalParser.sameExit) {
            if (hasKey) InternalRecord.assignProperty(out, name, value)
            continue
          }
          const terminal = stepProperty(state, property, exit)
          if (terminal) return terminal
        }
      } catch (error) {
        return Effect.die(error)
      }
      return InternalParser.succeed(out)
    }
  }
  private _rebuild(
    recur: (ast: AST) => AST,
    recurParameter: (ast: AST) => AST,
    checks: Checks | undefined,
    encodingChecks: Checks | undefined
  ): Objects {
    const props = mapOrSame(this.propertySignatures, (ps) => {
      const t = recur(ps.type)
      return t === ps.type ? ps : new PropertySignature(ps.name, t)
    })

    const indexes = mapOrSame(this.indexSignatures, (is) => {
      const p = recurParameter(is.parameter)
      const t = recur(is.type)
      return p === is.parameter && t === is.type
        ? is
        : new IndexSignature(p, t)
    })

    return props === this.propertySignatures && indexes === this.indexSignatures && checks === this.checks &&
        encodingChecks === this.encodingChecks
      ? this
      : new Objects(
        props,
        indexes,
        this.annotations,
        checks,
        undefined,
        this.context,
        encodingChecks
      )
  }
  /** @internal */
  flip(recur: (ast: AST) => AST): AST {
    return this._rebuild(recur, recur, this.encodingChecks, this.checks)
  }
  /** @internal */
  recur(recur: (ast: AST) => AST, recurParameter: (ast: AST) => AST = recur): AST {
    return this._rebuild(recur, recurParameter, this.checks, this.encodingChecks)
  }
  /** @internal */
  getExpected(): string {
    if (this.propertySignatures.length === 0 && this.indexSignatures.length === 0) return "object | array"
    return "object"
  }
}

type ObjectParserState = {
  readonly ast: Objects
  readonly input: Record<PropertyKey, unknown>
  readonly options: ParseOptions
  readonly out: Record<PropertyKey, unknown>
  issues: Arr.NonEmptyArray<SchemaIssue.Issue> | undefined
}

type ParsedProperty = {
  readonly parser: SchemaParser.Parser
  readonly name: PropertyKey
  readonly type: AST
}

/** @internal */
export function stepProperty(
  s: ObjectParserState,
  p: ParsedProperty,
  exit: Exit.Exit<unknown, SchemaIssue.Issue>
): Exit.Exit<void, SchemaIssue.Issue> | void {
  if (exit._tag === "Failure") {
    return wrapPropertyKeyIssue(s, s.ast, p.name, exit)
  }
  if (exit === InternalParser.sameExit) return
  const value = (exit as InternalParser.Success<unknown, SchemaIssue.Issue>)[InternalParser.args]
  if (value !== InternalParser.missing) {
    InternalRecord.assignProperty(s.out, p.name, value)
    return
  }
  delete s.out[p.name]
  if (!isOptional(p.type)) {
    const issue = new SchemaIssue.Pointer([p.name], new SchemaIssue.MissingKey(p.type.context?.annotations))
    if (s.options.errors === "all") {
      if (s.issues) s.issues.push(issue)
      else s.issues = [issue]
      return
    } else {
      return Exit.fail(
        new SchemaIssue.Composite(s.ast, [issue], s.input, s.options)
      )
    }
  }
}

const parsePropertiesOptions = {
  onItem(s: ObjectParserState, p: ParsedProperty) {
    if (!hasPropertySignature(s.input, p.name)) {
      return p.parser(InternalParser.missing, s.options)
    }
    const value = s.input[p.name]
    InternalRecord.assignProperty(s.out, p.name, value)
    return p.parser(value, s.options)
  },
  step: stepProperty
}

/** @internal */
export const parseProperties = iterateEager<ObjectParserState, ParsedProperty>()(parsePropertiesOptions)
const parsePropertiesConcurrent = iterateConcurrent<ObjectParserState, ParsedProperty>()(parsePropertiesOptions)

function combineChecks(a: Checks | undefined, b: Checks | undefined): Checks | undefined {
  if (!a) return b
  if (!b) return a
  return [...a, ...b]
}

/** @internal */
export function struct<Fields extends Schema.Struct.Fields>(
  fields: Fields,
  checks: Checks | undefined,
  annotations?: Schema.Annotations.Annotations
): Objects {
  return new Objects(
    Reflect.ownKeys(fields).map((key) => {
      return new PropertySignature(key, fields[key].ast)
    }),
    [],
    annotations,
    checks
  )
}

/** @internal */
export function getAST<S extends { readonly ast: AST }>(self: S): S["ast"] {
  return self.ast
}

/** @internal */
export function tuple<Elements extends Schema.Tuple.Elements>(
  elements: Elements,
  checks: Checks | undefined = undefined
): Arrays {
  return new Arrays(false, elements.map((e) => e.ast), [], undefined, checks)
}

/** @internal */
export function union<Members extends ReadonlyArray<{ readonly ast: AST }>>(
  members: Members,
  options: UnionOptions | undefined,
  checks: Checks | undefined
): Union<Members[number]["ast"]> {
  return new Union(members.map(getAST), options, undefined, checks)
}

/** @internal */
export function structWithRest(ast: Objects, records: ReadonlyArray<Objects>): Objects {
  if (ast.encoding || records.some((r) => r.encoding)) {
    throw new Error("StructWithRest does not support encodings")
  }
  let propertySignatures = ast.propertySignatures
  let indexSignatures = ast.indexSignatures
  let checks = ast.checks
  for (const record of records) {
    for (const propertySignature of record.propertySignatures) {
      if (propertySignatures.some((ps) => ps.name === propertySignature.name)) {
        throw new Error(`Duplicate identifier: ${JSON.stringify(propertySignature.name)}. ts(2300)`)
      }
    }
    propertySignatures = propertySignatures.concat(record.propertySignatures)
    indexSignatures = indexSignatures.concat(record.indexSignatures)
    checks = combineChecks(checks, record.checks)
  }
  return new Objects(propertySignatures, indexSignatures, undefined, checks)
}

/** @internal */
export function tupleWithRest(ast: Arrays, rest: ReadonlyArray<AST>): Arrays {
  if (ast.encoding) {
    throw new Error("TupleWithRest does not support encodings")
  }
  return new Arrays(ast.isMutable, ast.elements, rest, undefined, ast.checks)
}

/** @internal */
export function mutable(ast: Arrays): Arrays {
  if (ast.encoding) {
    throw new Error("mutable does not support encodings")
  }
  return new Arrays(
    true,
    ast.elements,
    ast.rest,
    ast.annotations,
    ast.checks,
    undefined,
    ast.context,
    ast.encodingChecks
  )
}

type Type =
  | "null"
  | "array"
  | "object"
  | "string"
  | "number"
  | "boolean"
  | "symbol"
  | "undefined"
  | "bigint"
  | "function"

/** @internal */
export type Sentinel = {
  readonly key: PropertyKey
  readonly literal: LiteralValue | symbol
}

const toCandidate = memoizeIdempotent((ast: AST): AST => {
  while (true) {
    if (isSuspend(ast)) return unknown
    const encoding = ast.encoding
    if (!encoding) {
      // Index signature parameters do not participate in union selection.
      return (ast as any).recur?.(toCandidate, identity) ?? ast
    }
    if (
      encoding.some((link) => link.transformation._tag === "Middleware" && link.transformation.decode !== identity)
    ) return unknown
    ast = encoding[encoding.length - 1].to
  }
})

function getCandidateTypes(ast: AST): ReadonlyArray<Type> {
  switch (ast._tag) {
    case "Null":
      return ["null"]
    case "Undefined":
      return ["undefined"]
    case "String":
    case "TemplateLiteral":
      return ["string"]
    case "Number":
      return ["number"]
    case "Boolean":
      return ["boolean"]
    case "Symbol":
    case "UniqueSymbol":
      return ["symbol"]
    case "BigInt":
      return ["bigint"]
    case "Arrays":
      return ["array"]
    case "ObjectKeyword":
      return ["object", "array", "function"]
    case "Objects":
      return ast.propertySignatures.length || ast.indexSignatures.length
        ? ["object"]
        : ["string", "number", "boolean", "symbol", "bigint", "object", "array", "function"]
    case "Enum":
      return Array.from(new Set(ast.enums.map(([, v]) => typeof v)))
    case "Literal":
      return [typeof ast.literal]
    case "Union":
      return Array.from(new Set(ast.types.flatMap(getCandidateTypes)))
    default:
      return [
        "null",
        "undefined",
        "string",
        "number",
        "boolean",
        "symbol",
        "bigint",
        "object",
        "array",
        "function"
      ]
  }
}

/** @internal */
export function collectSentinels(ast: AST): ReadonlyArray<Sentinel> {
  switch (ast._tag) {
    default:
      return []
    case "Declaration": {
      const s = ast.annotations?.[InternalAnnotations.SENTINELS_ANNOTATION_KEY]
      return Array.isArray(s) ? s : []
    }
    case "Objects":
      return ast.propertySignatures.flatMap((ps): Array<Sentinel> => {
        const type = ps.type
        if (!isOptional(type)) {
          if (isLiteral(type)) {
            return [{ key: ps.name, literal: type.literal }]
          }
          if (isUniqueSymbol(type)) {
            return [{ key: ps.name, literal: type.symbol }]
          }
        }
        return []
      })
    case "Arrays":
      return ast.elements.flatMap((e, i): Array<Sentinel> => {
        if (!isOptional(e)) {
          if (isLiteral(e)) {
            return [{ key: i, literal: e.literal }]
          }
          if (isUniqueSymbol(e)) {
            return [{ key: i, literal: e.symbol }]
          }
        }
        return []
      })
    case "Union": {
      if (ast.types.length === 0) return []
      const members = ast.types.map((type) => collectSentinels(toCandidate(type)))
      return members[0].filter((s) =>
        members.every((sentinels) => sentinels.some((o) => o.key === s.key && o.literal === s.literal))
      )
    }
    case "Suspend":
      return collectSentinels(ast.thunk())
  }
}

/** @internal */
export type CandidateIndex = (input: any, isConstructor: boolean) => ReadonlyArray<number>
type SentinelEntry = readonly [
  byValue: Map<LiteralValue | symbol, Set<number>>,
  all: Set<number>
]
type SentinelIndex = Map<PropertyKey, SentinelEntry>

const candidateIndexCache = new WeakMap<ReadonlyArray<AST>, CandidateIndex>()
const emptyCandidates: ReadonlyArray<never> = Object.freeze([])

const getRuntimeType = (input: unknown): Type => input === null ? "null" : Array.isArray(input) ? "array" : typeof input

const hasPropertySignature = (input: object, key: PropertyKey): boolean =>
  key === "__proto__" ? Object.hasOwn(input, key) : key in input

/** @internal */
export function getCandidateIndex(types: ReadonlyArray<AST>): CandidateIndex {
  let index = candidateIndexCache.get(types)
  if (index) return index

  let bySentinel: SentinelIndex | undefined
  let sentinelCandidateCount = 0
  let otherwise: { [K in Type]?: Array<number> } | undefined
  let literalCandidates: Map<LiteralValue | symbol, Array<number>> | undefined
  let onlyLiterals = true
  const literalOf: Array<LiteralValue | symbol | undefined> = []
  for (let i = 0; i < types.length; i++) {
    const a = types[i]
    const encoded = toCandidate(a)
    if (isNever(encoded)) continue

    if (isLiteral(encoded) || isUniqueSymbol(encoded)) {
      literalCandidates ??= new Map()
      const literal = isLiteral(encoded) ? encoded.literal : encoded.symbol
      literalOf[i] = literal
      let arr = literalCandidates.get(literal)
      if (!arr) literalCandidates.set(literal, arr = [])
      arr.push(i)
    } else {
      onlyLiterals = false
    }

    const sentinels = collectSentinels(encoded)

    if (sentinels.length) { // discriminated variants
      bySentinel ??= new Map()
      sentinelCandidateCount++
      for (const { key, literal } of sentinels) {
        let entry = bySentinel.get(key)
        if (!entry) bySentinel.set(key, entry = [new Map(), new Set()])
        entry[1].add(i)
        let indexes = entry[0].get(literal)
        if (!indexes) entry[0].set(literal, indexes = new Set())
        indexes.add(i)
      }
    } else { // non-discriminated
      otherwise ??= {}
      const candidateTypes = getCandidateTypes(encoded)
      for (const t of candidateTypes) (otherwise[t] ??= []).push(i)
    }
  }

  // Non-discriminated members are grouped by runtime type once and reused by every decode.
  const fallbacks: { [K in Type]?: ReadonlyArray<number> } = {}
  const getFallback = (type: Type): ReadonlyArray<number> =>
    fallbacks[type] ??= Object.freeze(otherwise?.[type] ?? emptyCandidates)

  if (onlyLiterals && literalCandidates) {
    literalCandidates.forEach(Object.freeze)
    index = (input) => literalCandidates.get(input) ?? emptyCandidates
  } else if (bySentinel?.size === 1 && !otherwise) {
    const [key, [byValue]] = bySentinel.entries().next().value!
    const candidates = new Map<LiteralValue | symbol, ReadonlyArray<number>>()
    for (const [literal, indexes] of byValue) {
      candidates.set(literal, Object.freeze(Array.from(indexes)))
    }
    const all = Object.freeze(types.map((_, i) => i))
    index = (input, isConstructor) => {
      if (Predicate.isObjectKeyword(input)) {
        const value = hasPropertySignature(input, key) ? (input as any)[key] : undefined
        if (value !== undefined) return candidates.get(value) ?? emptyCandidates
        if (isConstructor) return all
      }
      return emptyCandidates
    }
  } else if (bySentinel) {
    // A key owned by every discriminated candidate is safe to use as the initial selector: no candidate can
    // be excluded merely because it uses a different sentinel key. Prefer the key with the most distinct values
    // to minimize the matching bucket.
    let commonSentinel: [PropertyKey, SentinelEntry] | undefined
    for (const entry of bySentinel) {
      if (
        (!commonSentinel || entry[1][0].size > commonSentinel[1][0].size) &&
        entry[1][1].size === sentinelCandidateCount
      ) {
        commonSentinel = entry
      }
    }

    index = (input, isConstructor) => {
      const runtimeType = getRuntimeType(input)
      if (!Predicate.isObjectKeyword(input)) return getFallback(runtimeType)

      // Non-discriminated candidates are runtime-type fallbacks and are never removed by sentinel checks.
      const selected = new Set(otherwise?.[runtimeType])
      let directKey: PropertyKey | undefined
      // An observed common key can seed the selection directly; an unknown value rules out every
      // discriminated candidate.
      if (commonSentinel) {
        const [key, [byValue]] = commonSentinel
        const hasKey = hasPropertySignature(input, key)
        const value = hasKey ? (input as any)[key] : undefined
        if (hasKey && (!isConstructor || value !== undefined)) {
          const match = byValue.get(value)
          if (!match) return getFallback(runtimeType)
          for (const i of match) selected.add(i)
          directKey = key
        }
      }

      // Without an observed common key, collect positive matches from every sentinel. Constructor mode treats
      // absent and undefined keys as unconstrained and therefore selects every candidate that owns the key.
      if (directKey === undefined) {
        for (const [key, [byValue, all]] of bySentinel) {
          const hasKey = hasPropertySignature(input, key)
          const value = hasKey ? (input as any)[key] : undefined
          if (hasKey && (!isConstructor || value !== undefined)) {
            const match = byValue.get(value)
            if (match) {
              for (const i of match) selected.add(i)
            }
          } else if (isConstructor) {
            for (const i of all) selected.add(i)
          }
        }
      }
      // Missing keys are neutral. An observed key rejects only selected candidates that own it and do not match.
      for (const [key, [byValue, all]] of bySentinel) {
        if (key === directKey) continue
        const hasKey = hasPropertySignature(input, key)
        const value = hasKey ? (input as any)[key] : undefined
        if (hasKey && (!isConstructor || value !== undefined)) {
          const match = byValue.get(value)
          for (const i of selected) {
            if (all.has(i) && !match?.has(i)) selected.delete(i)
          }
        }
      }
      return Array.from(selected).sort((a, b) => a - b)
    }
  } else {
    index = (input) => {
      const fallback = getFallback(getRuntimeType(input))
      return literalCandidates ? fallback.filter((i) => literalOf[i] === undefined || literalOf[i] === input) : fallback
    }
  }

  candidateIndexCache.set(types, index)
  return index
}

/**
 * AST node representing a union of schemas.
 *
 * **Details**
 *
 * - `types` — the member AST nodes.
 * - `options.mode` selects matching behavior. `"anyOf"` succeeds on the first match;
 *   `"oneOf"` requires exactly one member to match (fails if multiple do).
 *
 * During parsing, members are tried in order. An internal candidate index
 * narrows which members to try based on the runtime type of the input and
 * discriminant ("sentinel") fields, making large unions efficient.
 *
 * **Example** (Inspecting a union AST)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaAST } from "effect"
 *
 * const schema = Schema.Union([Schema.String, Schema.Number])
 * const ast = schema.ast
 *
 * if (SchemaAST.isUnion(ast)) {
 *   [ast.types.length, ast.options?.mode ?? "anyOf"] // => [2, "anyOf"]
 * }
 * ```
 *
 * @see {@link isUnion}
 * @category models
 * @since 4.0.0
 */
export interface Union<A extends AST = AST> extends ASTNode {
  readonly _tag: "Union"
  readonly types: ReadonlyArray<A>
  readonly options: UnionOptions | undefined
  readonly encodingChecks: Checks | undefined
  /** @internal */

  getParser(compile: SchemaParser.Compiler, compileField?: SchemaParser.Compiler): SchemaParser.Parser
  /** @internal */

  recur(recur: (ast: AST) => AST): Union<AST>
  /** @internal */

  flip(recur: (ast: AST) => AST): Union<AST>
  /** @internal */

  matchPart(s: string, options: ParseOptions): LiteralValue | undefined
  /** @internal */

  getExpected(getExpected: (ast: AST) => string): string
}

/**
 * Local matching options stored on {@link Union} nodes.
 *
 * @category options
 * @since 4.0.0
 */
export interface UnionOptions {
  /** Defaults to `"anyOf"`; `"oneOf"` requires exactly one matching member. */
  readonly mode?: "anyOf" | "oneOf" | undefined
}

/**
 * Constructs a {@link Union}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Union: new<A extends AST = AST>(
  types: ReadonlyArray<A>,
  options?: UnionOptions,
  annotations?: Schema.Annotations.Annotations,
  checks?: Checks,
  encoding?: Encoding,
  context?: Context,
  encodingChecks?: Checks
) => Union<A> = class<A extends AST = AST> extends ASTNodeImpl {
  readonly _tag = "Union"
  readonly types: ReadonlyArray<A>
  readonly options: UnionOptions | undefined
  readonly encodingChecks: Checks | undefined

  constructor(
    types: ReadonlyArray<A>,
    options?: UnionOptions,
    annotations?: Schema.Annotations.Annotations,
    checks?: Checks,
    encoding?: Encoding,
    context?: Context,
    encodingChecks?: Checks
  ) {
    super(annotations, checks, encoding, context)
    this.types = types
    this.options = options
    this.encodingChecks = encodingChecks
  }
  /** @internal */
  getParser(
    compile: SchemaParser.Compiler,
    compileField?: SchemaParser.Compiler
  ): SchemaParser.Parser {
    // oxlint-disable-next-line @typescript-eslint/no-this-alias
    const ast = this
    const isConstructor = compileField !== undefined
    const parsers: Array<SchemaParser.Parser> = []
    const parser = (i: number): SchemaParser.Parser => parsers[i] ??= compile(ast.types[i])
    let index: CandidateIndex | undefined

    return (input, options) => {
      if (input === InternalParser.missing) {
        return InternalParser.missingExit
      }
      const candidates = (index ??= getCandidateIndex(ast.types))(input, isConstructor)

      if (candidates.length === 0) {
        return Effect.fail(new SchemaIssue.AnyOf(ast, [], input, options))
      }
      if (candidates.length === 1) {
        const result = parser(candidates[0])(input, options)
        if ((result as Exit.Exit<unknown, SchemaIssue.Issue>)._tag === "Success") return result
        return effectIsExit(result)
          ? failSingleUnionCandidate(ast, (result as Exit.Failure<unknown, SchemaIssue.Issue>).cause, input, options)
          : catchSingleUnionCandidate(ast, result, input, options)
      }
      return parseUnionCandidates(ast, parser, candidates, input, options)
    }
  }
  private _rebuild(
    recur: (ast: AST) => AST,
    checks: Checks | undefined,
    encodingChecks: Checks | undefined
  ): Union<AST> {
    const types = mapOrSame(this.types, recur)
    return types === this.types && checks === this.checks && encodingChecks === this.encodingChecks ?
      this :
      new Union(types, this.options, this.annotations, checks, undefined, this.context, encodingChecks)
  }
  /** @internal */
  recur(recur: (ast: AST) => AST): Union<AST> {
    return this._rebuild(recur, this.checks, this.encodingChecks)
  }
  /** @internal */
  flip(recur: (ast: AST) => AST): Union<AST> {
    return this._rebuild(recur, this.encodingChecks, this.checks)
  }
  /** @internal */
  matchPart(s: string, options: ParseOptions): LiteralValue | undefined {
    for (const type of this.types) {
      const out = (type as TemplateLiteralPart).matchPart(s, options)
      if (out !== undefined) return out
    }
    return undefined
  }
  /** @internal */
  getExpected(getExpected: (ast: AST) => string): string {
    const expected = this.annotations?.expected
    if (typeof expected === "string") return expected

    if (this.types.length === 0) return "never"

    const types = this.types.map((type) => {
      const encoded = toEncoded(type)
      switch (encoded._tag) {
        case "Arrays": {
          const literals = encoded.elements.filter(isLiteral)
          if (literals.length > 0) {
            return `${formatIsMutable(encoded.isMutable)}[ ${
              literals.map((e) => getExpected(e) + formatIsOptional(e.context?.isOptional)).join(", ")
            }, ... ]`
          }
          break
        }
        case "Objects": {
          const literals = encoded.propertySignatures.filter((ps) => isLiteral(ps.type))
          if (literals.length > 0) {
            return `{ ${
              literals.map((ps) =>
                `${formatIsMutable(ps.type.context?.isMutable)}${formatPropertyKey(ps.name)}${
                  formatIsOptional(ps.type.context?.isOptional)
                }: ${getExpected(ps.type)}`
              ).join(", ")
            }, ... }`
          }
          break
        }
      }
      return getExpected(encoded)
    })
    return Array.from(new Set(types)).join(" | ")
  }
}

function failSingleUnionCandidate(
  ast: Union,
  cause: Cause.Cause<SchemaIssue.Issue>,
  input: unknown,
  options: ParseOptions
) {
  const issue = InternalSchemaCause.getSchemaIssue(cause)
  if (!issue) return Exit.failCause(cause)
  return Exit.fail(new SchemaIssue.AnyOf(ast, [issue], input, options))
}

function catchSingleUnionCandidate(
  ast: Union,
  result: Effect.Effect<unknown, SchemaIssue.Issue, unknown>,
  input: unknown,
  options: ParseOptions
) {
  return Effect.catchCause(result, (cause) => failSingleUnionCandidate(ast, cause, input, options))
}

type UnionParserState = {
  readonly parser: (i: number) => SchemaParser.Parser
  readonly ast: Union
  readonly input: unknown
  readonly options: ParseOptions
  out: Exit.Success<unknown, SchemaIssue.Issue> | undefined
  readonly successes: Array<AST> | undefined
  issues: Array<SchemaIssue.Issue> | undefined
}

function parseUnionCandidates(
  ast: Union,
  parser: (i: number) => SchemaParser.Parser,
  candidates: ReadonlyArray<number>,
  input: unknown,
  options: ParseOptions
): Effect.Effect<unknown, SchemaIssue.Issue, any> {
  const state: UnionParserState = {
    ast,
    parser,
    input,
    out: undefined,
    successes: ast.options?.mode === "oneOf" ? [] : undefined,
    issues: undefined,
    options
  }
  const eff = parseUnion(state, candidates)
  if (!eff) {
    if (state.out) return state.out
    return Effect.fail(new SchemaIssue.AnyOf(ast, state.issues ?? [], input, options))
  }
  return resumeUnion(eff, state)
}

function resumeUnion(
  eff: Effect.Effect<void, SchemaIssue.Issue, any>,
  state: UnionParserState
): Effect.Effect<unknown, SchemaIssue.Issue, any> {
  return Effect.flatMapEager(eff, (_) => {
    if (state.out === InternalParser.sameExit) return Effect.succeed(state.input)
    if (state.out) return state.out
    return Effect.fail(new SchemaIssue.AnyOf(state.ast, state.issues ?? [], state.input, state.options))
  })
}

const parseUnion = iterateEager<UnionParserState, number>()({
  onItem(s, i) {
    return s.parser(i)(s.input, s.options)
  },
  step(s, i, exit) {
    if (exit._tag === "Failure") {
      const issue = InternalSchemaCause.getSchemaIssue(exit.cause)
      if (issue === undefined) {
        return exit
      }
      if (s.issues) s.issues.push(issue)
      else s.issues = [issue]
    } else {
      if (s.out && s.successes) {
        s.successes.push(s.ast.types[i])
        return Exit.fail(new SchemaIssue.OneOf(s.ast, s.successes, s.input, s.options))
      }
      s.out = exit
      if (s.successes) {
        s.successes.push(s.ast.types[i])
      } else {
        return Exit.void
      }
    }
  }
})

const nonFiniteLiterals = new Union([
  new Literal("Infinity"),
  new Literal("-Infinity"),
  new Literal("NaN")
])

function formatIsMutable(isMutable: boolean | undefined): string {
  return isMutable ? "" : "readonly "
}

function formatIsOptional(isOptional: boolean | undefined): string {
  return isOptional ? "?" : ""
}

/**
 * AST node for lazy/recursive schemas.
 *
 * **Details**
 *
 * Wraps a thunk (`() => AST`) that is memoized on first call. Use this to
 * define recursive or mutually recursive schemas without infinite loops at
 * construction time.
 *
 * **Example** (Defining recursive schema ASTs)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaAST } from "effect"
 *
 * interface Category {
 *   readonly name: string
 *   readonly children: ReadonlyArray<Category>
 * }
 *
 * const Category = Schema.Struct({
 *   name: Schema.String,
 *   children: Schema.Array(Schema.suspend((): Schema.Codec<Category> => Category))
 * })
 *
 * SchemaAST.isObjects(Category.ast) // => true
 * ```
 *
 * @see {@link isSuspend}
 * @category models
 * @since 4.0.0
 */
export interface Suspend extends ASTNode {
  readonly _tag: "Suspend"
  readonly thunk: () => AST
  /** @internal */

  getParser(compile: SchemaParser.Compiler): SchemaParser.Parser
  /** @internal */

  recur(recur: (ast: AST) => AST): Suspend
  /** @internal */

  getExpected(getExpected: (ast: AST) => string): string
}

/**
 * Constructs a {@link Suspend}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Suspend: new(
  thunk: () => AST,
  annotations?: Schema.Annotations.Annotations,
  checks?: Checks,
  encoding?: Encoding,
  context?: Context
) => Suspend = class extends ASTNodeImpl {
  readonly _tag = "Suspend"
  readonly thunk: () => AST

  constructor(
    thunk: () => AST,
    annotations?: Schema.Annotations.Annotations,
    checks?: Checks,
    encoding?: Encoding,
    context?: Context
  ) {
    if (checks) {
      throw new Error("Cannot add checks to Suspend")
    }
    super(annotations, undefined, encoding, context)
    let ast: AST
    this.thunk = () => ast ??= thunk()
  }
  /** @internal */
  getParser(compile: SchemaParser.Compiler): SchemaParser.Parser {
    let parser: SchemaParser.Parser
    return (input, options) => (parser ??= compile(this.thunk()))(input, options)
  }
  /** @internal */
  recur(recur: (ast: AST) => AST) {
    return new Suspend(
      () => recur(this.thunk()),
      this.annotations,
      undefined,
      undefined,
      this.context
    )
  }
  /** @internal */
  getExpected(getExpected: (ast: AST) => string): string {
    return getExpected(this.thunk())
  }
}

// -----------------------------------------------------------------------------
// Checks
// -----------------------------------------------------------------------------

/**
 * Represents a single validation check attached to an AST node.
 *
 * **Details**
 *
 * - `run` — the validation function. Returns `undefined` on success, or an
 *   `Issue` on failure.
 * - `annotations` — optional filter-level annotations (expected message,
 *   representation, arbitrary constraint hints).
 * - `aborted` — when `true`, parsing stops immediately after this filter
 *   fails (no further checks run).
 *
 * Use `.annotate()` to add metadata and `.abort()` to mark as aborting.
 * Combine with another check via `.and()` to form a {@link FilterGroup}.
 *
 * @see {@link FilterGroup}
 * @see {@link Check}
 * @see {@link isPattern}
 * @category models
 * @since 4.0.0
 */
export interface Filter<in E> extends Pipeable.Pipeable {
  readonly _tag: "Filter"
  readonly run: (input: E, self: AST, options: ParseOptions) => SchemaIssue.Issue | undefined
  readonly annotations: Schema.Annotations.Filter | undefined
  /**
   * Whether the parsing process should be aborted after this check has failed.
   */
  readonly aborted: boolean
  annotate(annotations: Schema.Annotations.Filter): Filter<E>
  abort(): Filter<E>
  and(other: Check<E>, annotations?: Schema.Annotations.Filter): FilterGroup<E>
}

/**
 * Constructs a {@link Filter}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Filter: new<E>(
  run: (input: E, self: AST, options: ParseOptions) => SchemaIssue.Issue | undefined,
  annotations?: Schema.Annotations.Filter | undefined, /**
   * Whether the parsing process should be aborted after this check has failed.
   */
  aborted?: boolean
) => Filter<E> = class<in E> extends Pipeable.Class {
  readonly _tag = "Filter"
  readonly run: (input: E, self: AST, options: ParseOptions) => SchemaIssue.Issue | undefined
  readonly annotations: Schema.Annotations.Filter | undefined
  /**
   * Whether the parsing process should be aborted after this check has failed.
   */
  readonly aborted: boolean

  constructor(
    run: (input: E, self: AST, options: ParseOptions) => SchemaIssue.Issue | undefined,
    annotations: Schema.Annotations.Filter | undefined = undefined,
    /**
     * Whether the parsing process should be aborted after this check has failed.
     */
    aborted: boolean = false
  ) {
    super()
    this.run = run
    this.annotations = annotations
    this.aborted = aborted
  }
  annotate(annotations: Schema.Annotations.Filter): Filter<E> {
    return new Filter(this.run, { ...this.annotations, ...annotations }, this.aborted)
  }
  abort(): Filter<E> {
    return new Filter(this.run, this.annotations, true)
  }
  and(other: Check<E>, annotations?: Schema.Annotations.Filter): FilterGroup<E>
  and(other: Check<E>, annotations?: Schema.Annotations.Filter): FilterGroup<E> {
    return new FilterGroup([this, other], annotations)
  }
}

/**
 * Represents a composite validation check grouping multiple {@link Check} values.
 *
 * **Details**
 *
 * Created by calling `.and()` on a {@link Filter} or another `FilterGroup`.
 * All inner checks are run; failures from aborted filters still stop
 * evaluation.
 *
 * @see {@link Filter}
 * @see {@link Check}
 * @category models
 * @since 4.0.0
 */
export interface FilterGroup<in E> extends Pipeable.Pipeable {
  readonly _tag: "FilterGroup"
  readonly checks: readonly [
    Check<E>,
    ...Array<Check<E>>
  ]
  readonly annotations: Schema.Annotations.Filter | undefined
  annotate(annotations: Schema.Annotations.Filter): FilterGroup<E>
  and(other: Check<E>, annotations?: Schema.Annotations.Filter): FilterGroup<E>
}

/**
 * Constructs a {@link FilterGroup}.
 *
 * @category constructors
 * @since 4.0.0
 */
export const FilterGroup: new<E>(
  checks: readonly [
    Check<E>,
    ...Array<Check<E>>
  ],
  annotations?: Schema.Annotations.Filter | undefined
) => FilterGroup<E> = class<in E> extends Pipeable.Class {
  readonly _tag = "FilterGroup"
  readonly checks: readonly [Check<E>, ...Array<Check<E>>]
  readonly annotations: Schema.Annotations.Filter | undefined

  constructor(
    checks: readonly [Check<E>, ...Array<Check<E>>],
    annotations: Schema.Annotations.Filter | undefined = undefined
  ) {
    super()
    this.checks = checks
    this.annotations = annotations
  }
  annotate(annotations: Schema.Annotations.Filter): FilterGroup<E> {
    return new FilterGroup(this.checks, { ...this.annotations, ...annotations })
  }
  and(other: Check<E>, annotations?: Schema.Annotations.Filter): FilterGroup<E>
  and(other: Check<E>, annotations?: Schema.Annotations.Filter): FilterGroup<E> {
    return new FilterGroup([this, other], annotations)
  }
}

/**
 * A validation check — either a single {@link Filter} or a composite
 * {@link FilterGroup}.
 *
 * **Details**
 *
 * Stored in an AST node's {@link Checks} array.
 *
 * @see {@link Filter}
 * @see {@link FilterGroup}
 * @category models
 * @since 4.0.0
 */
export type Check<T> = Filter<T> | FilterGroup<T>

/** @internal */
export function makeFilter<T>(
  filter: (input: T, ast: AST, options: ParseOptions) => Schema.FilterOutput,
  annotations?: Schema.Annotations.Filter | undefined,
  aborted: boolean = false
): Filter<T> {
  return new Filter(
    (input, ast, options) => SchemaIssue.normalizeFilterOutput(ast, filter(input, ast, options), input, options),
    annotations,
    aborted
  )
}

/** @internal */
export function makeFilterByGuard<T extends E, E>(
  is: (value: E) => value is T,
  annotations?: Schema.Annotations.Filter
): Filter<any> {
  return new Filter(
    (input: E, _ast, options) => is(input) ? undefined : new SchemaIssue.InvalidValue(undefined, input, options),
    annotations,
    true // after a guard, we always want to abort
  )
}

/** @internal */
export function isFinite(annotations?: Schema.Annotations.Filter) {
  return makeFilter(
    (n: number) => globalThis.Number.isFinite(n),
    {
      expected: "a finite number",
      representation: {
        id: "effect/schema/isFinite",
        payload: null
      },
      toJsonSchema: () => ({ type: "number" }),
      toCode: () => ({ runtime: "Schema.isFinite()" }),
      arbitraryConstraint: {
        number: "finite"
      },
      ...annotations
    }
  )
}

/** @internal */
export const finite = appendChecks(number, [isFinite()])

const numberToJson = new Link(
  new Union([finite, nonFiniteLiterals]),
  new SchemaTransformation.Transformation(
    SchemaGetter.Number(),
    SchemaGetter.transform((n) => globalThis.Number.isFinite(n) ? n : globalThis.String(n))
  )
)

/**
 * Creates a {@link Filter} that validates strings by running `RegExp.test`.
 *
 * **When to use**
 *
 * Use when string validation should be represented as a schema `Filter` backed
 * by a regular expression.
 *
 * **Details**
 *
 * The filter can be used with `Schema.filter` or attached directly to a
 * `String` AST node through checks. The regular expression is cloned and its
 * `lastIndex` is reset before each test, so global and sticky expressions are
 * deterministic and the provided regular expression is not mutated. The
 * regular expression source is stored in annotations for serialization and
 * arbitrary generation.
 *
 * **Gotchas**
 *
 * Arbitrary metadata preserves both `regExp.source` and `regExp.flags`.
 * Implementations that cannot consume all flags may still use the source as a
 * generation hint because the Schema filter validates every generated value.
 * JSON Schema has no way to carry JavaScript regular-expression flags. Unless
 * annotations provide `toJsonSchema`, the RegExp constraint is omitted from
 * JSON Schema export.
 *
 * **Example** (Validating an email pattern)
 *
 * ```ts import.meta.vitest
 * import { SchemaAST } from "effect"
 *
 * const emailFilter = SchemaAST.isPattern(/^[^@]+@[^@]+$/)
 * emailFilter.run("alice@example.com", SchemaAST.string, {}) // => undefined
 * emailFilter.run("invalid", SchemaAST.string, {})?._tag // => "InvalidValue"
 * ```
 *
 * @see {@link Filter}
 * @category constructors
 * @since 4.0.0
 */
export function isPattern(regExp: globalThis.RegExp, annotations?: Schema.Annotations.Filter) {
  const copy = new globalThis.RegExp(regExp)
  const payload = { source: copy.source, flags: copy.flags }
  return makeFilter(
    (s: string) => {
      copy.lastIndex = 0
      return copy.test(s)
    },
    {
      expected: `a string matching the RegExp ${payload.source}`,
      representation: {
        id: "effect/schema/isPattern",
        payload
      },
      // Keep the filter exportable so its JSON Schema annotations are preserved
      // when the RegExp constraint itself is omitted.
      toJsonSchema: () => [{}, true],
      arbitraryConstraint: {
        patterns: [payload]
      },
      ...annotations
    }
  )
}

// Copies that update only context or encoding share a body.
// All other fields describe the body itself, including child contexts.
const bodyOwners = new WeakMap<AST, AST>()

function copy<A extends AST>(ast: A, changes: Partial<AST>): A {
  // AST copies preserve the prototype and enumerable values, not property descriptors.
  const out = Object.assign(Object.create(Object.getPrototypeOf(ast)), ast, changes) as A
  if (Reflect.ownKeys(changes).every((key) => key === "context" || key === "encoding")) {
    bodyOwners.set(out, getContextOwner(ast))
  }
  return out
}

/** @internal */
export function getContextOwner<A extends AST>(ast: A): A {
  const existing = bodyOwners.get(ast)
  if (existing !== undefined) return existing as A
  if (ast.encoding === undefined) return ast
  // A body representative must not expose or retain the node's own codec.
  const owner = Object.assign(Object.create(Object.getPrototypeOf(ast)), ast, { encoding: undefined }) as A
  bodyOwners.set(ast, owner)
  return owner
}

/** @internal */
export function replaceEncoding<A extends AST>(ast: A, encoding: Encoding | undefined): A {
  return ast.encoding === encoding ? ast : copy(ast, { encoding })
}

/** @internal */
export function replaceContext<A extends AST>(ast: A, context: Context | undefined): A {
  if (ast.context === context) {
    return ast
  }
  const owner = getContextOwner(ast)
  if (owner.context === context && owner.encoding === ast.encoding) {
    return owner
  }
  return copy(ast, { context })
}

/** @internal */
export function getLastEncoding(ast: AST): AST {
  return ast.encoding ? getLastEncoding(ast.encoding[ast.encoding.length - 1].to) : ast
}

/** @internal */
export function annotate<A extends AST>(ast: A, annotations: Schema.Annotations.Annotations): A {
  if (ast.checks) {
    const last = ast.checks[ast.checks.length - 1]
    return replaceChecks(ast, Arr.append(ast.checks.slice(0, -1), last.annotate(annotations)))
  }
  return copy(ast, { annotations: { ...ast.annotations, ...annotations } })
}

/** @internal */
export function replaceChecks<A extends AST>(ast: A, checks: Checks | undefined): A {
  if (ast._tag === "Suspend" && checks) {
    throw new Error("Cannot add checks to Suspend")
  }
  if (ast.checks === checks) {
    return ast
  }
  return copy(ast, { checks })
}

/** @internal */
export function appendChecks<A extends AST>(ast: A, checks: Checks | undefined): A {
  return replaceChecks(ast, combineChecks(ast.checks, checks))
}

/** @internal */
export function mapLink(link: Link, f: (ast: AST) => AST): Link {
  const to = f(link.to)
  return to === link.to ? link : new Link(to, link.transformation)
}

function updateLastLink(encoding: Encoding, f: (ast: AST) => AST): Encoding {
  const links = encoding
  const last = links[links.length - 1]
  const out = mapLink(last, f)
  return out === last ? encoding : Arr.append(encoding.slice(0, encoding.length - 1), out)
}

/** @internal */
export function applyToLastLink(f: (ast: AST) => AST) {
  return <A extends AST>(ast: A): A => ast.encoding ? replaceEncoding(ast, updateLastLink(ast.encoding, f)) : ast
}

/** @internal */
export function replaceContextLastLink<A extends AST>(ast: A, context: Context): A {
  return applyToLastLink((ast) => replaceContext(ast, context))(ast)
}

/** @internal */
export function applyToSelfOrLastLinkEncoding(f: (ast: AST) => AST) {
  function out(ast: AST): AST {
    return ast.encoding ? replaceEncoding(ast, updateLastLink(ast.encoding, out)) : f(ast)
  }
  return memoize(out)
}

/** @internal */
export function applyToSelfOrLastLinkEncodingIdempotent(
  f: (ast: AST) => AST,
  options?: { readonly stopAt?: (link: Link) => boolean }
) {
  function out(ast: AST): AST {
    if (ast.encoding) {
      const last = ast.encoding[ast.encoding.length - 1]
      return options?.stopAt?.(last) ? ast : replaceEncoding(ast, updateLastLink(ast.encoding, out))
    }
    return f(ast)
  }
  return memoizeIdempotent(out)
}

/** @internal */
export function middlewareDecoding(
  ast: AST,
  middleware: SchemaTransformation.Middleware<any, any, any, any, any, any>
): AST {
  return appendTransformation(ast, middleware, toType(ast))
}

/** @internal */
export function middlewareEncoding(
  ast: AST,
  middleware: SchemaTransformation.Middleware<any, any, any, any, any, any>
): AST {
  return appendTransformation(toEncoded(ast), middleware, ast)
}

function appendTransformation<A extends AST>(
  from: AST,
  transformation:
    | SchemaTransformation.Transformation<any, any, any, any>
    | SchemaTransformation.Middleware<any, any, any, any, any, any>,
  to: A
): A {
  const link = new Link(from, transformation)
  return replaceEncoding(to, to.encoding ? [...to.encoding, link] : [link])
}

/**
 * Maps over the array but will return the original array if no changes occur.
 * @internal
 */
export function mapOrSame<A>(as: Arr.NonEmptyReadonlyArray<A>, f: (a: A) => A): Arr.NonEmptyReadonlyArray<A>
export function mapOrSame<A>(as: ReadonlyArray<A>, f: (a: A) => A): ReadonlyArray<A>
export function mapOrSame<A>(as: ReadonlyArray<A>, f: (a: A) => A): ReadonlyArray<A> {
  let out: Array<A> | undefined
  for (let i = 0; i < as.length; i++) {
    const a = as[i]
    const fa = f(a)
    if (out) {
      out[i] = fa
    } else if (fa !== a) {
      out = new Array(as.length)
      for (let j = 0; j < i; j++) {
        out[j] = as[j]
      }
      out[i] = fa
    }
  }
  return out ?? as
}

/** @internal */
export function annotateKey<A extends AST>(ast: A, annotations: Schema.Annotations.Key<unknown>): A {
  const context = ast.context ?
    new Context(
      ast.context.isOptional,
      ast.context.isMutable,
      ast.context.constructorDefault,
      { ...ast.context.annotations, ...annotations }
    ) :
    new Context(false, false, undefined, annotations)
  return replaceContext(ast, context)
}

/** @internal */
export const optionalKey: <A extends AST>(ast: A) => A = memoizeIdempotent(<A extends AST>(ast: A): A => {
  const context = ast.context ?
    ast.context.isOptional === false ?
      new Context(true, ast.context.isMutable, ast.context.constructorDefault, ast.context.annotations) :
      ast.context :
    new Context(true, false)
  return optionalKeyLastLink(replaceContext(ast, context))
})

const optionalKeyLastLink = applyToLastLink(optionalKey)

/** @internal */
export const optional = memoize(<A extends AST>(ast: A): Union<A | Undefined> =>
  optionalKey(new Union([ast, undefined_]))
)

/** @internal */
export const mutableKey = memoizeIdempotent(<A extends AST>(ast: A): A => {
  const context = ast.context ?
    ast.context.isMutable === false ?
      new Context(ast.context.isOptional, true, ast.context.constructorDefault, ast.context.annotations) :
      ast.context :
    new Context(false, true)
  return mutableKeyLastLink(replaceContext(ast, context))
})

const mutableKeyLastLink = applyToLastLink(mutableKey)

/** @internal */
export function withConstructorDefault<A extends AST>(
  ast: A,
  defaultValue: Effect.Effect<unknown, SchemaIssue.Issue>
): A {
  const context = ast.context ?
    new Context(ast.context.isOptional, ast.context.isMutable, defaultValue, ast.context.annotations) :
    new Context(false, false, defaultValue)
  return replaceContext(ast, context)
}

/**
 * Attaches a `Transformation` to the `to` AST, making it decode from the
 * `from` AST and encode back to it.
 *
 * **Details**
 *
 * This is the low-level primitive behind `Schema.decodeTo`. It appends a
 * {@link Link} to the `to` node's encoding chain.
 *
 * - Returns a new AST with the same type as `to`.
 *
 * @see {@link Link}
 * @see {@link Encoding}
 * @see {@link flip}
 * @category transforming
 * @since 4.0.0
 */
export function decodeTo<A extends AST>(
  from: AST,
  to: A,
  transformation: SchemaTransformation.Transformation<any, any, any, any>
): A {
  return appendTransformation(from, transformation, to)
}

function parseParameter(ast: AST): {
  literals: ReadonlyArray<PropertyKey>
  parameters: ReadonlyArray<AST>
} {
  const literals: Array<PropertyKey> = []
  const parameters: Array<AST> = []
  function go(ast: AST) {
    switch (ast._tag) {
      case "Literal":
        if (Predicate.isPropertyKey(ast.literal) && !literals.includes(ast.literal)) {
          literals.push(ast.literal)
        }
        return
      case "UniqueSymbol":
        if (!literals.includes(ast.symbol)) {
          literals.push(ast.symbol)
        }
        return
      case "Never":
        return
      case "Union":
        for (let i = 0; i < ast.types.length; i++) {
          go(ast.types[i])
        }
        return
      default:
        parameters.push(ast)
    }
  }
  go(ast)
  return { literals, parameters }
}

/** @internal */
export function record(key: AST, value: AST): Objects {
  const { literals, parameters: indexSignatures } = parseParameter(key)
  return new Objects(
    literals.map((literal) => new PropertySignature(literal, value)),
    indexSignatures.map((parameter) => new IndexSignature(parameter, value))
  )
}

// -------------------------------------------------------------------------------------
// Public APIs
// -------------------------------------------------------------------------------------

/**
 * Returns `true` if the AST node represents an optional property.
 *
 * **Details**
 *
 * Checks `ast.context?.isOptional`. Defaults to `false` when no
 * {@link Context} is set.
 *
 * @see `Schema.optionalKey`
 * @see {@link Context}
 * @category predicates
 * @since 4.0.0
 */
export function isOptional(ast: AST): boolean {
  return ast.context?.isOptional ?? false
}

/** @internal */
export function isMutable(ast: AST): boolean {
  return ast.context?.isMutable ?? false
}

function isStructuralCheck(check: Check<any>): boolean {
  return check.annotations?.[InternalAnnotations.STRUCTURAL_ANNOTATION_KEY] === true ||
    check._tag === "FilterGroup" && check.checks.every(isStructuralCheck)
}

function extractStructuralChecks(checks: Checks): Checks | undefined {
  function extract(check: Check<any>): Array<Check<any>> {
    if (isStructuralCheck(check)) return [check]
    return check._tag === "FilterGroup" ? check.checks.flatMap(extract) : []
  }
  const out = checks.flatMap(extract)
  return Arr.isArrayNonEmpty(out) ? out : undefined
}

function canPreserveEncodingChecks(ast: AST): boolean {
  let preserve = true
  function visit(child: AST): AST {
    preserve = preserve && !child.encoding && !isSuspend(child)
    if (preserve && "recur" in child) child.recur(visit)
    return child
  }
  if ("recur" in ast) ast.recur(visit)
  return preserve
}

/**
 * Strips all encoding transformations from an AST, returning the decoded
 * (type-level) representation.
 *
 * **Details**
 *
 * - Memoized: same input reference → same output reference.
 * - Recursively walks into composite nodes ({@link Arrays}, {@link Objects},
 *   {@link Union}, {@link Suspend}).
 *
 * **Example** (Getting the type AST)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaAST } from "effect"
 *
 * const schema = Schema.NumberFromString
 * const typeAst = SchemaAST.toType(schema.ast)
 * typeAst._tag // => "Number"
 * ```
 *
 * @see {@link toEncoded}
 * @see {@link flip}
 * @category transforming
 * @since 4.0.0
 */
export const toType = memoizeIdempotent(<A extends AST>(ast: A): A => {
  const owner = getContextOwner(ast)
  if (owner !== ast) {
    const type = toType(owner)
    return type === owner && ast.encoding === undefined ? ast : replaceContext(type, ast.context)
  }
  const type = ("recur" in ast ? ast.recur(toType) : ast) as A
  if ("encodingChecks" in type && type.encodingChecks) {
    const checks = canPreserveEncodingChecks(ast)
      ? type.encodingChecks
      : isArrays(type) || isObjects(type) || isDeclaration(type) && type.typeParameters.length > 0
      ? extractStructuralChecks(type.encodingChecks)
      : undefined
    return copy(type, {
      encodingChecks: undefined,
      checks: combineChecks(type.checks, checks)
    })
  }
  return type
})

/**
 * Returns the encoded (wire-format) AST by flipping and then stripping
 * encodings.
 *
 * **Details**
 *
 * Equivalent to `toType(flip(ast))`. This gives you the AST that describes
 * the shape of the serialized/encoded data.
 *
 * - Memoized: same input reference → same output reference.
 *
 * **Example** (Getting the encoded AST)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaAST } from "effect"
 *
 * const schema = Schema.NumberFromString
 * const encodedAst = SchemaAST.toEncoded(schema.ast)
 * encodedAst._tag // => "String"
 * ```
 *
 * @see {@link toType}
 * @see {@link flip}
 * @category transforming
 * @since 4.0.0
 */
export const toEncoded = memoizeIdempotent((ast: AST): AST => {
  return toType(flip(ast))
})

function flipEncoding(ast: AST, encoding: Encoding): AST {
  const links = encoding
  const len = links.length
  const last = links[len - 1]
  const ls: Arr.NonEmptyArray<Link> = [
    new Link(flip(replaceEncoding(ast, undefined)), links[0].transformation.flip())
  ]
  for (let i = 1; i < len; i++) {
    ls.unshift(new Link(flip(links[i - 1].to), links[i].transformation.flip()))
  }
  const to = flip(last.to)
  if (to.encoding) {
    return replaceEncoding(to, [...to.encoding, ...ls])
  } else {
    return replaceEncoding(to, ls)
  }
}

/**
 * Swaps the decode and encode directions of an AST's {@link Encoding} chain.
 *
 * **Details**
 *
 * After flipping, what was decoding becomes encoding and vice versa. This is
 * the core operation behind `Schema.encode` — encoding a value is decoding
 * with a flipped SchemaAST.
 *
 * - Memoized: same input reference → same output reference.
 * - Recursively walks composite nodes.
 *
 * @see {@link toType}
 * @see {@link toEncoded}
 * @category transforming
 * @since 4.0.0
 */
export const flip = memoize((ast: AST): AST => {
  if (ast.encoding) {
    return flipEncoding(ast, ast.encoding)
  }
  const owner = getContextOwner(ast)
  if (owner !== ast) {
    const flipped = flip(owner)
    return flipped === owner ? ast : replaceContext(flipped, ast.context)
  }
  return "flip" in ast ? ast.flip(flip) : "recur" in ast ? ast.recur(flip) : ast
})

/** @internal */
export function containsUndefined(ast: AST): boolean {
  switch (ast._tag) {
    case "Undefined":
      return true
    case "Union":
      return ast.types.some(containsUndefined)
    default:
      return false
  }
}

function fromConst<const T>(
  ast: AST,
  value: T
): SchemaParser.Parser {
  const succeed = value === 0 ? InternalParser.sameExit : InternalParser.succeed(value)
  return (input, options) => {
    if (input === InternalParser.missing) return InternalParser.missingExit
    if (input === value) return succeed
    return Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
  }
}

function fromRefinement<T>(
  ast: AST,
  refinement: (input: unknown) => input is T
): SchemaParser.Parser {
  return (input, options) => {
    if (input === InternalParser.missing) return InternalParser.missingExit
    if (refinement(input)) return InternalParser.sameExit
    return Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
  }
}

function segmentTemplateLiteralParts(
  ast: TemplateLiteral,
  input: string,
  options: ParseOptions
): Array<string> | undefined {
  const parts = ast.encodedParts
  const literals = ast.literals
  const inputLength = input.length
  for (let i = 0; i < literals.length; i++) {
    const literal = literals[i]
    if (literal && !input.includes(literal)) return undefined
  }
  if (ast.suffixLengths[0] > inputLength) return undefined

  const out = new Array<string>(parts.length)
  let failures: Set<number> | undefined
  function go(i: number, pos: number): boolean {
    if (i === parts.length) return pos === inputLength
    if (failures?.has(i * (inputLength + 1) + pos)) return false
    const part = parts[i]
    if (i === parts.length - 1) {
      const s = input.slice(pos)
      if (part.matchPart(s, options) !== undefined) {
        out[i] = s
        return true
      }
    } else if (part._tag === "Literal") {
      const s = literals[i]!
      if (input.startsWith(s, pos) && go(i + 1, pos + s.length)) {
        out[i] = s
        return true
      }
    } else {
      const maximumEnd = inputLength - ast.suffixLengths[i + 1]
      // Splits preceding a literal only need to consider occurrences of that literal.
      const anchor = literals[i + 1]
      let end = anchor === undefined ? maximumEnd : input.lastIndexOf(anchor, maximumEnd)
      while (end >= pos) {
        const s = input.slice(pos, end)
        if (part.matchPart(s, options) !== undefined && go(i + 1, end)) {
          out[i] = s
          return true
        }
        if (end === 0) break
        end = anchor === undefined ? end - 1 : input.lastIndexOf(anchor, end - 1)
      }
    }
    failures ??= new Set()
    failures.add(i * (inputLength + 1) + pos)
    return false
  }
  return go(0, 0) ? out : undefined
}

/** @internal */
export const parameterFromPropertyKey = applyToSelfOrLastLinkEncodingIdempotent((ast) => {
  switch (ast._tag) {
    default:
      return ast
    case "Number":
      return ast.toCodecStringTree()
    case "Union":
      return ast.recur(parameterFromPropertyKey)
  }
})

/** @internal */
export const parameterFromString = applyToSelfOrLastLinkEncodingIdempotent((ast) => {
  switch (ast._tag) {
    default:
      return ast
    case "Symbol":
    case "UniqueSymbol":
      return ast.toCodecStringTree()
    case "Union":
      return ast.recur(parameterFromString)
  }
})

const partFromString = applyToSelfOrLastLinkEncodingIdempotent((ast) => {
  switch (ast._tag) {
    default:
      return ast
    case "Number":
    case "Literal":
    case "BigInt":
      return ast.toCodecStringTree()
    case "Union":
      return ast.recur(partFromString)
  }
})

/**
 * any string, including newlines
 * @internal
 */
export const STRING_PATTERN = "[\\s\\S]*?"

const isStringFiniteRegExp = new globalThis.RegExp(`^${FINITE_PATTERN}$`)

const isStringNumberRegExp = new globalThis.RegExp(`^(?:${FINITE_PATTERN}|Infinity|-Infinity|NaN)$`)

/** @internal */
export function isStringFinite(annotations?: Schema.Annotations.Filter) {
  return isPattern(
    isStringFiniteRegExp,
    {
      expected: "a string representing a finite number",
      representation: {
        id: "effect/schema/isStringFinite",
        payload: null
      },
      toJsonSchema: () => ({ pattern: isStringFiniteRegExp.source }),
      ...annotations
    }
  )
}

const finiteString = appendChecks(string, [isStringFinite()])

const finiteToString = new Link(
  finiteString,
  SchemaTransformation.numberFromString
)

const numberToString = new Link(
  new Union([finiteString, nonFiniteLiterals]),
  SchemaTransformation.numberFromString
)

/**
 * signed integer only (no leading "+" because TypeScript doesn't support it)
 */
const BIGINT_PATTERN = "-?\\d+"

const isStringBigIntRegExp = new globalThis.RegExp(`^${BIGINT_PATTERN}$`)

/** @internal */
export function isStringBigInt(annotations?: Schema.Annotations.Filter) {
  return isPattern(
    isStringBigIntRegExp,
    {
      expected: "a string representing a bigint",
      representation: {
        id: "effect/schema/isStringBigInt",
        payload: null
      },
      toJsonSchema: () => ({ pattern: isStringBigIntRegExp.source }),
      ...annotations
    }
  )
}

/** @internal */
export const bigIntString = appendChecks(string, [isStringBigInt({
  expected: "a string representing a bigint"
})])

const bigIntToString = new Link(
  bigIntString,
  SchemaTransformation.bigintFromString
)

const REGEXP_PATTERN = "Symbol\\(([\\s\\S]*)\\)"

const isStringSymbolRegExp = new globalThis.RegExp(`^${REGEXP_PATTERN}$`)

/** @internal */
export const symbolString = appendChecks(string, [isStringSymbol()])

/**
 * to distinguish between Symbol and String, we need to add a check to the string keyword
 */
const symbolToString = new Link(
  symbolString,
  new SchemaTransformation.Transformation(
    SchemaGetter.transform((description) => globalThis.Symbol.for(isStringSymbolRegExp.exec(description)![1])),
    SchemaGetter.transformEffect((sym: symbol, options) => {
      const key = globalThis.Symbol.keyFor(sym)
      if (key !== undefined) {
        return Effect.succeed(globalThis.String(sym))
      }
      return Effect.fail(
        new SchemaIssue.Forbidden(
          { message: "cannot serialize to string, Symbol is not registered" },
          sym,
          options
        )
      )
    })
  )
)

/** @internal */
export function isStringSymbol(annotations?: Schema.Annotations.Filter) {
  return isPattern(
    isStringSymbolRegExp,
    {
      expected: "a string representing a symbol",
      representation: {
        id: "effect/schema/isStringSymbol",
        payload: null
      },
      toJsonSchema: () => ({ pattern: isStringSymbolRegExp.source }),
      ...annotations
    }
  )
}

/** @internal */
export function collectIssues<T>(
  checks: ReadonlyArray<Check<T>>,
  value: T,
  issues: Arr.NonEmptyArray<SchemaIssue.Issue> | undefined,
  ast: AST,
  options: ParseOptions
): Arr.NonEmptyArray<SchemaIssue.Issue> | undefined {
  for (let i = 0; i < checks.length; i++) {
    const check = checks[i]
    if (check._tag === "FilterGroup") {
      issues = collectIssues(check.checks, value, issues, ast, options)
      if (
        issues &&
        (options.errors !== "all" || (issues[issues.length - 1] as SchemaIssue.Filter).filter.aborted)
      ) {
        return issues
      }
    } else {
      const issue = check.run(value, ast, options)
      if (issue) {
        const filter = new SchemaIssue.Filter(check, issue, value, options)
        if (issues) issues.push(filter)
        else issues = [filter]
        if (options.errors !== "all" || check.aborted) {
          return issues
        }
      }
    }
  }
  return issues
}

/** @internal */
export function runChecks<T>(
  checks: readonly [Check<T>, ...Array<Check<T>>],
  s: T
): Result.Result<T, SchemaIssue.Issue> {
  const issues = collectIssues(checks, s, undefined, unknown, { errors: "all" })
  if (issues) {
    const issue = new SchemaIssue.Composite(unknown, issues)
    return Result.fail(issue)
  }
  return Result.succeed(s)
}

/** @internal */
export interface ConstructorDescriptor {
  readonly isConstructed: Predicate.Predicate<unknown>
  readonly link: Link
}

/** @internal */
export function getConstructorDescriptor(ast: AST): ConstructorDescriptor | undefined {
  if (!isDeclaration(ast)) return undefined
  const getDescriptor = ast.annotations?.[InternalAnnotations.CONSTRUCTOR_ANNOTATION_KEY]
  return Predicate.isFunction(getDescriptor) ? getDescriptor(ast.typeParameters) : undefined
}

/**
 * Returns all annotations from the AST node.
 *
 * **Details**
 *
 * If the node has {@link Checks}, returns annotations from the last check
 * (which is where user-supplied annotations end up after `.pipe(Schema.annotations(...))`).
 * Otherwise returns the node's `annotations` directly.
 *
 * **Example** (Reading annotations)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaAST } from "effect"
 *
 * const schema = Schema.String.annotate({ title: "Name" })
 * const annotations = SchemaAST.resolve(schema.ast)
 * annotations?.title // => "Name"
 * ```
 *
 * @see {@link resolveAt}
 * @see {@link resolveIdentifier}
 * @see {@link resolveTitle}
 * @see {@link resolveDescription}
 * @category annotations
 * @since 4.0.0
 */
export const resolve: (ast: AST) => Schema.Annotations.Annotations | undefined = InternalAnnotations.resolve

/**
 * Returns a single annotation value by key from the AST node.
 *
 * **Details**
 *
 * Like {@link resolve}, reads from the last check's annotations when checks
 * are present. Returns `undefined` if the key is not found.
 *
 * @see {@link resolve}
 * @category annotations
 * @since 4.0.0
 */
export const resolveAt: <A>(key: string) => (ast: AST) => A | undefined = InternalAnnotations.resolveAt

/**
 * Returns the `identifier` annotation from the AST node, if set.
 *
 * **Details**
 *
 * The identifier is typically set by `Schema.annotations({ identifier: "..." })`
 * and is used for error messages and schema identification.
 *
 * @see {@link resolve}
 * @see {@link resolveTitle}
 * @category annotations
 * @since 4.0.0
 */
export const resolveIdentifier: (ast: AST) => string | undefined = InternalAnnotations.resolveIdentifier

/**
 * Returns the `title` annotation from the AST node, if set.
 *
 * @see {@link resolve}
 * @see {@link resolveIdentifier}
 * @see {@link resolveDescription}
 *
 * @category annotations
 * @since 4.0.0
 */
export const resolveTitle: (ast: AST) => string | undefined = InternalAnnotations.resolveTitle

/**
 * Returns the `description` annotation from the AST node, if set.
 *
 * @see {@link resolve}
 * @see {@link resolveTitle}
 * @see {@link resolveIdentifier}
 *
 * @category annotations
 * @since 4.0.0
 */
export const resolveDescription: (ast: AST) => string | undefined = InternalAnnotations.resolveDescription

type TreeFrame = {
  readonly value: object
  // Object keys or an array length snapshot.
  readonly keys: ReadonlyArray<string> | number
  index: number
}

function isJsonLeaf(u: unknown): boolean {
  return u === null || typeof u === "string" || typeof u === "boolean" ||
    typeof u === "number" && globalThis.Number.isFinite(u)
}

function isStringTreeLeaf(u: unknown): boolean {
  return u === undefined || typeof u === "string"
}

function isTree(u: unknown, isLeaf: (u: unknown) => boolean): boolean {
  const cache = new WeakMap<object, boolean>()
  const stack: Array<TreeFrame> = []
  outer: while (true) {
    if (typeof u !== "object" || u === null) {
      if (!isLeaf(u)) {
        return false
      }
    } else {
      const value = u
      const cached = cache.get(value)
      // `false` marks a node on the current path, while `true` marks a fully
      // validated node that can be safely reused by a DAG.
      if (cached === false) {
        return false
      }
      if (cached === undefined) {
        const isArray = Array.isArray(value)
        if (!isArray) {
          const prototype = Object.getPrototypeOf(value)
          // A plain object from another realm has a different Object.prototype,
          // but that prototype still has a null prototype.
          if (
            prototype !== null &&
            prototype !== Object.prototype &&
            Object.getPrototypeOf(prototype) !== null
          ) {
            return false
          }
        }
        cache.set(value, false)
        stack.push({
          value,
          keys: isArray ? value.length : Object.keys(value),
          index: 0
        })
      }
    }

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]
      const keys = frame.keys
      if (typeof keys === "number") {
        if (frame.index < keys) {
          // A sparse slot is read as `undefined`; the leaf predicate determines
          // whether that is valid for the current tree.
          u = (frame.value as ReadonlyArray<unknown>)[frame.index++]
          continue outer
        }
      } else if (frame.index < keys.length) {
        u = (frame.value as Record<string, unknown>)[keys[frame.index++]]
        continue outer
      }
      cache.set(frame.value, true)
      stack.pop()
    }
    return true
  }
}

/**
 * Returns true if the value is a JSON value.
 *
 * When a cyclic reference is detected, returns false.
 *
 * @internal
 */
export function isJson(u: unknown): u is Schema.Json {
  return isTree(u, isJsonLeaf)
}

/** @internal */
export const Json = new Declaration(
  [],
  () => (input, ast, options) =>
    isJson(input) ?
      InternalParser.sameExit :
      Effect.fail(new SchemaIssue.InvalidType(ast, input, options)),
  {
    representation: {
      id: "effect/schema/Json",
      payload: null
    },
    expected: "JSON value",
    toCodecJson: () => undefined,
    toCodecStringTree: () => unknownToStringTree
  }
)

/** @internal */
export const MutableJson = annotate(Json, {
  representation: {
    id: "effect/schema/MutableJson",
    payload: null
  }
})

/** @internal */
export const unknownToJson = new Link(
  Json,
  SchemaTransformation.passthrough()
)

/** @internal */
export const objectKeywordToJson = new Link(
  new Union([
    new Arrays(false, [], [Json]),
    new Objects([], [new IndexSignature(string, Json)])
  ]),
  SchemaTransformation.passthrough()
)

/**
 * Returns true if the value is a StringTree value.
 *
 * When a cyclic reference is detected, returns false.
 *
 * @internal
 */
export function isStringTree(u: unknown): u is Schema.StringTree {
  return isTree(u, isStringTreeLeaf)
}

const StringTree = new Declaration(
  [],
  () => (input, ast, options) =>
    isStringTree(input) ?
      InternalParser.sameExit :
      Effect.fail(new SchemaIssue.InvalidType(ast, input, options)),
  { expected: "StringTree", toCodecStringTree: () => undefined }
)

/** @internal */
export const unknownToStringTree = new Link(
  StringTree,
  SchemaTransformation.passthrough()
)
