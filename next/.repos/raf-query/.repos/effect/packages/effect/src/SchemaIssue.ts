/**
 * Describes problems found while decoding, encoding, or checking data with
 * schemas.
 *
 * An `Issue` records what failed and, for nested data, where the failure
 * happened. The Schema system uses these values for missing keys, unexpected
 * keys, invalid types, invalid values, failed filters, failed transformations,
 * and alternatives that did not match. This module also formats issues.
 *
 * @since 4.0.0
 */
import * as Arr from "./Array.ts"
import { format, formatPath, type Formatter as FormatterI } from "./Formatter.ts"
import * as InternalAnnotations from "./internal/schema/annotations.ts"
import * as InternalParser from "./internal/schema/parser.ts"
import { hasProperty } from "./Predicate.ts"
import type * as Schema from "./Schema.ts"
import type * as SchemaAST from "./SchemaAST.ts"
import type { StandardSchemaV1 } from "./StandardSchema.ts"

const TypeId = "~effect/SchemaIssue/Issue"

/**
 * Returns `true` if the given value is an {@link Issue}.
 *
 * **When to use**
 *
 * Use when you need to narrow an `unknown` value to `Issue` in error-handling
 * code, such as distinguishing an `Issue` from other error types in a catch-all
 * handler.
 *
 * **Details**
 *
 * - Checks for the internal `TypeId` brand on the value.
 *
 * **Example** (Type-guarding an unknown error)
 *
 * ```ts import.meta.vitest
 * import { SchemaIssue } from "effect"
 *
 * const issue = new SchemaIssue.MissingKey(undefined)
 * SchemaIssue.isIssue(issue) // => true
 * SchemaIssue.isIssue("not an issue") // => false
 * ```
 *
 * @see {@link Issue}
 *
 * @category guards
 * @since 4.0.0
 */
export function isIssue(u: unknown): u is Issue {
  return hasProperty(u, TypeId) && u[TypeId] === TypeId
}

/**
 * Returns `true` when an issue contains an input reported by the schema parser.
 *
 * **When to use**
 *
 * Use when reading `Issue.input`, especially when `undefined` is a valid input
 * value.
 *
 * **Details**
 *
 * Reported input is stored as an own property. This guard checks for that
 * property and narrows `input` from optional to required.
 *
 * **Example** (Reading a reported input)
 *
 * ```ts import.meta.vitest
 * import { Result, Schema, SchemaIssue } from "effect"
 *
 * const result = Schema.decodeUnknownResult(Schema.String)(1, { reportInput: true })
 * if (Result.isFailure(result) && SchemaIssue.hasInput(result.failure.issue)) {
 *   result.failure.issue.input // => 1
 * }
 * ```
 *
 * @see {@link Issue} for the complete issue model
 *
 * @category guards
 * @since 4.0.0
 */
export function hasInput(issue: Issue): issue is Issue & { readonly input: unknown } {
  return Object.hasOwn(issue, "input")
}

/**
 * Union of all terminal (leaf) issue types that have no inner `Issue` children.
 *
 * **When to use**
 *
 * Use when constraining formatter hooks to only handle terminal nodes or when
 * pattern matching on the `_tag` of an issue and only leaf nodes matter.
 *
 * **Details**
 *
 * Members: {@link InvalidType}, {@link InvalidValue}, {@link MissingKey},
 * {@link UnexpectedKey}, {@link Forbidden}, {@link OneOf}.
 *
 * @see {@link Issue} — the full union including composite nodes
 * @see {@link LeafHook} — formatter hook that operates on `Leaf` values
 *
 * @category models
 * @since 4.0.0
 */
export type Leaf =
  | InvalidType
  | InvalidValue
  | MissingKey
  | UnexpectedKey
  | Forbidden
  | OneOf

/**
 * The root discriminated union of all validation error nodes.
 *
 * **When to use**
 *
 * Use when typing the error channel in `Effect<A, Issue, R>` results from
 * schema parsing, or when writing custom formatters or issue-tree walkers.
 *
 * **Details**
 *
 * Every node has a `_tag` field for pattern-matching. The union includes both
 * terminal {@link Leaf} types and composite types that wrap inner issues:
 * {@link Filter}, {@link Encoding}, {@link Pointer}, {@link Composite},
 * {@link AnyOf}. Use {@link makeFormatterDefault} when a human-readable
 * representation is needed. When parsing with `reportInput: true`,
 * value-bearing issues expose the rejected value through an enumerable `input`
 * field. Built-in formatters may include reported input in default messages. This
 * is not a general sanitization boundary: paths, ASTs, union successes, and
 * custom annotations or messages are preserved as supplied and remain the
 * caller's responsibility.
 *
 * @see {@link Leaf} — the terminal subset
 * @see {@link isIssue} — type guard
 * @see {@link hasInput} — checks whether an issue reports an input
 * @category models
 * @since 4.0.0
 */
export type Issue =
  | Leaf
  // composite
  | Filter
  | Encoding
  | Pointer
  | Composite
  | AnyOf

interface IssueNode {
  readonly [TypeId]: typeof TypeId
  /**
   * The input reported by the schema parser, when input reporting is enabled
   * and the issue is associated with a present value.
   */
  readonly input?: unknown
}

class IssueNodeImpl implements IssueNode {
  readonly [TypeId] = TypeId
  /**
   * The input reported by the schema parser, when input reporting is enabled
   * and the issue is associated with a present value.
   */
  declare readonly input?: unknown
  constructor(input?: unknown, options?: SchemaAST.ParseOptions) {
    if (options?.reportInput === true && input !== InternalParser.missing) {
      this.input = input
    }
  }
}

/**
 * Represents a schema issue produced when a schema filter (refinement check) fails.
 *
 * **When to use**
 *
 * Use when you need to inspect a schema issue that records which refinement
 * check rejected the value.
 *
 * **Details**
 *
 * - `filter` is the AST filter node that produced this issue.
 * - `issue` is the inner issue describing the failure reason.
 *
 * **Example** (Matching a Filter issue)
 *
 * ```ts import.meta.vitest
 * import { SchemaAST, SchemaIssue } from "effect"
 *
 * const formatIssue = SchemaIssue.makeFormatterDefault()
 *
 * function describe(issue: SchemaIssue.Issue): string {
 *   if (issue._tag === "Filter") {
 *     return `Filter failed: ${formatIssue(issue.issue)}`
 *   }
 *   return formatIssue(issue)
 * }
 *
 * const issue = new SchemaIssue.Filter(
 *   SchemaAST.isPattern(/^valid$/),
 *   new SchemaIssue.InvalidValue()
 * )
 * describe(issue) // => `Filter failed: Expected a valid value`
 * ```
 *
 * @see {@link Leaf} — terminal issue types that commonly appear as the inner `issue`
 * @see {@link CheckHook} — formatter hook for `Filter` issues
 *
 * @category models
 * @since 4.0.0
 */
export interface Filter extends IssueNode {
  readonly _tag: "Filter"
  /**
   * The filter that failed.
   */
  readonly filter: SchemaAST.Filter<unknown>
  /**
   * The issue that occurred.
   */
  readonly issue: Issue
}

/**
 * Constructs a schema issue for a failed refinement check.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Filter: new(
  /**
   * The filter that failed.
   */
  filter: SchemaAST.Filter<any>,
  /**
   * The issue that occurred.
   */
  issue: Issue,
  /**
   * The present input associated with the issue. It is retained only when
   * `options.reportInput` is `true`.
   */
  input?: unknown,
  /**
   * The effective parse options controlling input retention.
   */
  options?: SchemaAST.ParseOptions
) => Filter = class extends IssueNodeImpl {
  readonly _tag = "Filter"
  /**
   * The filter that failed.
   */
  readonly filter: SchemaAST.Filter<unknown>
  /**
   * The issue that occurred.
   */
  readonly issue: Issue

  constructor(
    /**
     * The filter that failed.
     */
    filter: SchemaAST.Filter<any>,
    /**
     * The issue that occurred.
     */
    issue: Issue,
    /**
     * The present input associated with the issue. It is retained only when
     * `options.reportInput` is `true`.
     */
    input?: unknown,
    /**
     * The effective parse options controlling input retention.
     */
    options?: SchemaAST.ParseOptions
  ) {
    super(input, options)
    this.filter = filter
    this.issue = issue
  }
}

/**
 * Represents a schema issue produced when a schema transformation (encode/decode step) fails.
 *
 * **When to use**
 *
 * Use when you need to inspect failures from `Schema.decodeTo` / `Schema.encodeTo`
 *   transformations.
 *
 * **Details**
 *
 * - `ast` is the AST node for the transformation that failed.
 * - `issue` is the inner issue describing the failure.
 *
 * @see {@link Filter} — failure from a refinement check (not a transformation)
 * @see {@link Composite} — multiple issues from a single schema node
 *
 * @category models
 * @since 4.0.0
 */
export interface Encoding extends IssueNode {
  readonly _tag: "Encoding"
  /**
   * The schema that caused the issue.
   */
  readonly ast: SchemaAST.AST
  /**
   * The issue that occurred.
   */
  readonly issue: Issue
}

/**
 * Constructs a schema issue for a failed transformation.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Encoding: new(
  ast: SchemaAST.AST,
  issue: Issue,
  input?: unknown,
  options?: SchemaAST.ParseOptions
) => Encoding = class extends IssueNodeImpl {
  readonly _tag = "Encoding"
  /**
   * The schema that caused the issue.
   */
  readonly ast: SchemaAST.AST
  /**
   * The issue that occurred.
   */
  readonly issue: Issue

  constructor(
    /**
     * The schema that caused the issue.
     */
    ast: SchemaAST.AST,
    /**
     * The issue that occurred.
     */
    issue: Issue,
    /**
     * The present input associated with the issue. It is retained only when
     * `options.reportInput` is `true`.
     */
    input?: unknown,
    /**
     * The effective parse options controlling input retention.
     */
    options?: SchemaAST.ParseOptions
  ) {
    super(input, options)
    this.ast = ast
    this.issue = issue
  }
}

/**
 * Wraps an inner {@link Issue} with a property-key path, indicating *where* in
 * a nested structure the error occurred.
 *
 * **When to use**
 *
 * Use when you need to walk the issue tree to accumulate path segments for error
 * reporting.
 *
 * **Details**
 *
 * - `path` is an array of property keys (strings, numbers, or symbols).
 * - Formatters concatenate nested `Pointer` paths into a single path like
 *   `["a"]["b"][0]`.
 *
 * @see {@link Composite} — groups multiple issues under one schema node
 *
 * @category models
 * @since 4.0.0
 */
export interface Pointer extends IssueNode {
  readonly _tag: "Pointer"
  /**
   * The path to the location in the input that caused the issue.
   */
  readonly path: ReadonlyArray<PropertyKey>
  /**
   * The issue that occurred.
   */
  readonly issue: Issue
}

/**
 * Constructs a schema issue that points to a nested location.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Pointer: new(path: ReadonlyArray<PropertyKey>, issue: Issue) => Pointer = class extends IssueNodeImpl {
  readonly _tag = "Pointer"
  /**
   * The path to the location in the input that caused the issue.
   */
  readonly path: ReadonlyArray<PropertyKey>
  /**
   * The issue that occurred.
   */
  readonly issue: Issue

  constructor(
    /**
     * The path to the location in the input that caused the issue.
     */
    path: ReadonlyArray<PropertyKey>,
    /**
     * The issue that occurred.
     */
    issue: Issue
  ) {
    super()
    this.path = path
    this.issue = issue
  }
}

/**
 * Represents a schema issue produced when a required key or tuple index is missing from the input.
 *
 * **When to use**
 *
 * Use when you need to detect absent fields in struct/tuple validation.
 *
 * **Details**
 *
 * - `annotations` may contain a custom `messageMissingKey` for formatting.
 *
 * @see {@link Pointer} — wraps this issue with the missing key's path
 * @see {@link UnexpectedKey} — the opposite case (extra key present)
 *
 * @category models
 * @since 4.0.0
 */
export interface MissingKey extends IssueNode {
  readonly _tag: "MissingKey"
  /**
   * The metadata for the issue.
   */
  readonly annotations: Schema.Annotations.Key<unknown> | undefined
}

/**
 * Constructs a schema issue for a missing key or tuple index.
 *
 * @category constructors
 * @since 4.0.0
 */
export const MissingKey: new(annotations: Schema.Annotations.Key<unknown> | undefined) => MissingKey = class
  extends IssueNodeImpl
{
  readonly _tag = "MissingKey"
  /**
   * The metadata for the issue.
   */
  readonly annotations: Schema.Annotations.Key<unknown> | undefined

  constructor(
    /**
     * The metadata for the issue.
     */
    annotations: Schema.Annotations.Key<unknown> | undefined
  ) {
    super()
    this.annotations = annotations
  }
}

/**
 * Represents a schema issue produced when an input object or tuple contains a key/index not
 * declared by the schema.
 *
 * **When to use**
 *
 * Use when you need to detect excess properties during strict struct/tuple
 * validation.
 *
 * **Details**
 *
 * - `ast` is the schema that was being validated against.
 * - `annotations` on `ast` may contain a custom `messageUnexpectedKey`.
 * - The default formatter renders this as `"Expected no excess property"`, or
 *   `"Unexpected key with value <input>"` when the issue reports an input.
 *
 * @see {@link MissingKey} — the opposite case (required key absent)
 * @see {@link Pointer} — wraps this issue with the unexpected key's path
 *
 * @category models
 * @since 4.0.0
 */
export interface UnexpectedKey extends IssueNode {
  readonly _tag: "UnexpectedKey"
  /**
   * The schema that caused the issue.
   */
  readonly ast: SchemaAST.AST
}

/**
 * Constructs a schema issue for an unexpected key or tuple index.
 *
 * @category constructors
 * @since 4.0.0
 */
export const UnexpectedKey: new(
  ast: SchemaAST.AST,
  input?: unknown,
  options?: SchemaAST.ParseOptions
) => UnexpectedKey = class extends IssueNodeImpl {
  readonly _tag = "UnexpectedKey"
  /**
   * The schema that caused the issue.
   */
  readonly ast: SchemaAST.AST
  constructor(
    /**
     * The schema that caused the issue.
     */
    ast: SchemaAST.AST,
    /**
     * The present input associated with the issue. It is retained only when
     * `options.reportInput` is `true`.
     */
    input?: unknown,
    /**
     * The effective parse options controlling input retention.
     */
    options?: SchemaAST.ParseOptions
  ) {
    super(input, options)
    this.ast = ast
  }
}

/**
 * Represents a schema issue that groups multiple child issues under a single schema node.
 *
 * **When to use**
 *
 * Use when you need to walk the issue tree for struct/tuple schemas that collect
 * all field errors rather than failing on the first.
 *
 * **Details**
 *
 * - `issues` is a non-empty readonly array (at least one child).
 * - Formatters flatten `Composite` by recursing into each child.
 *
 * @see {@link AnyOf} — used for union no-match errors (similar but different semantics)
 * @see {@link Pointer} — adds path context to individual issues
 *
 * @category models
 * @since 4.0.0
 */
export interface Composite extends IssueNode {
  readonly _tag: "Composite"
  /**
   * The schema that caused the issue.
   */
  readonly ast: SchemaAST.AST
  /**
   * The issues that occurred.
   */
  readonly issues: readonly [Issue, ...Array<Issue>]
}

/**
 * Constructs a schema issue that groups multiple child issues.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Composite: new(
  ast: SchemaAST.AST,
  issues: readonly [Issue, ...Array<Issue>],
  input?: unknown,
  options?: SchemaAST.ParseOptions
) => Composite = class extends IssueNodeImpl {
  readonly _tag = "Composite"
  /**
   * The schema that caused the issue.
   */
  readonly ast: SchemaAST.AST
  /**
   * The issues that occurred.
   */
  readonly issues: readonly [Issue, ...Array<Issue>]

  constructor(
    /**
     * The schema that caused the issue.
     */
    ast: SchemaAST.AST,
    /**
     * The issues that occurred.
     */
    issues: readonly [Issue, ...Array<Issue>],
    /**
     * The present input associated with the issue. It is retained only when
     * `options.reportInput` is `true`.
     */
    input?: unknown,
    /**
     * The effective parse options controlling input retention.
     */
    options?: SchemaAST.ParseOptions
  ) {
    super(input, options)
    this.ast = ast
    this.issues = issues
  }
}

/**
 * Represents a schema issue produced when the runtime type of the input does not match the type
 * expected by the schema.
 *
 * **When to use**
 *
 * Use when you need to detect basic type mismatches, such as a wrong primitive
 * or `null` where an object was expected.
 *
 * **Details**
 *
 * - `ast` is the schema node that expected a different type.
 * - The default formatter renders this as `"Expected <type>"`, adding
 *   `", got <input>"` when the issue reports an input.
 *
 * **Example** (Formatting a type mismatch)
 *
 * ```ts import.meta.vitest
 * import { Schema, SchemaIssue } from "effect"
 *
 * const formatIssue = SchemaIssue.makeFormatterDefault()
 * const issue = new SchemaIssue.InvalidType(Schema.String.ast)
 * formatIssue(issue) // => "Expected string"
 * ```
 *
 * @see {@link InvalidValue} — the input has the right type but fails a value constraint
 *
 * @category models
 * @since 4.0.0
 */
export interface InvalidType extends IssueNode {
  readonly _tag: "InvalidType"
  /**
   * The schema that caused the issue.
   */
  readonly ast: SchemaAST.AST
}

/**
 * Constructs a schema issue for an input with an invalid runtime type.
 *
 * @category constructors
 * @since 4.0.0
 */
export const InvalidType: new(
  ast: SchemaAST.AST,
  input?: unknown,
  options?: SchemaAST.ParseOptions
) => InvalidType = class extends IssueNodeImpl {
  readonly _tag = "InvalidType"
  /**
   * The schema that caused the issue.
   */
  readonly ast: SchemaAST.AST
  constructor(
    /**
     * The schema that caused the issue.
     */
    ast: SchemaAST.AST,
    /**
     * The present input associated with the issue. It is retained only when
     * `options.reportInput` is `true`.
     */
    input?: unknown,
    /**
     * The effective parse options controlling input retention.
     */
    options?: SchemaAST.ParseOptions
  ) {
    super(input, options)
    this.ast = ast
  }
}

/**
 * Represents a schema issue produced when the input has the correct type but its value violates a
 * constraint (e.g. a string that is too short, a number out of range).
 *
 * **When to use**
 *
 * Use when you need to detect constraint violations from `Schema.filter`,
 * `Schema.minLength`, `Schema.greaterThan`, or similar checks.
 *
 * **Details**
 *
 * - A `message` annotation is returned unchanged and takes precedence over all
 *   other default formatting.
 * - Without `message`, an `expected` annotation is formatted as
 *   `"Expected <expected>"`, adding `", got <input>"` when input is reported.
 * - Without either annotation, the default formatter renders
 *   `"Expected a valid value"`, or `"Invalid data <input>"` when input is
 *   reported.
 *
 * **Example** (Returning InvalidValue from a custom filter)
 *
 * ```ts import.meta.vitest
 * import { SchemaIssue } from "effect"
 *
 * const formatIssue = SchemaIssue.makeFormatterDefault()
 * const issue = new SchemaIssue.InvalidValue({ message: "must not be empty" })
 * formatIssue(issue) // => "must not be empty"
 * ```
 *
 * @see {@link InvalidType} — the input has the wrong type entirely
 * @see {@link Filter} — composite wrapper when a schema filter produces this issue
 *
 * @category models
 * @since 4.0.0
 */
export interface InvalidValue extends IssueNode {
  readonly _tag: "InvalidValue"
  /**
   * The metadata for the issue.
   */
  readonly annotations: Schema.Annotations.Issue | undefined
}

/**
 * Constructs a schema issue for a value that violates a constraint.
 *
 * @category constructors
 * @since 4.0.0
 */
export const InvalidValue: new(
  annotations?: Schema.Annotations.Issue | undefined,
  input?: unknown,
  options?: SchemaAST.ParseOptions
) => InvalidValue = class extends IssueNodeImpl {
  readonly _tag = "InvalidValue"
  /**
   * The metadata for the issue.
   */
  readonly annotations: Schema.Annotations.Issue | undefined

  constructor(
    /**
     * The metadata for the issue.
     */
    annotations?: Schema.Annotations.Issue | undefined,
    /**
     * The present input associated with the issue. It is retained only when
     * `options.reportInput` is `true`.
     */
    input?: unknown,
    /**
     * The effective parse options controlling input retention.
     */
    options?: SchemaAST.ParseOptions
  ) {
    super(input, options)
    this.annotations = annotations
  }
}

/** @internal */
export function makeCompositeAtKey(
  compositeAst: SchemaAST.AST,
  pointerKey: PropertyKey,
  pointerIssue: Issue,
  compositeInput: unknown,
  parseOptions?: SchemaAST.ParseOptions
): Composite {
  return new Composite(
    compositeAst,
    [new Pointer([pointerKey], pointerIssue)],
    compositeInput,
    parseOptions
  )
}

/**
 * Represents a schema issue produced when a forbidden operation is encountered during parsing,
 * such as an asynchronous Effect running inside `Schema.decodeUnknownSync`.
 *
 * **When to use**
 *
 * Use when you need to detect that a schema requires async execution but was run
 * synchronously.
 *
 * **Details**
 *
 * - `annotations` optionally carries a `message` string.
 * - The default formatter renders this as `"Forbidden operation"`.
 *
 * **Example** (Creating a Forbidden issue)
 *
 * ```ts import.meta.vitest
 * import { SchemaIssue } from "effect"
 *
 * const formatIssue = SchemaIssue.makeFormatterDefault()
 * const issue = new SchemaIssue.Forbidden(
 *   { message: "async operation not allowed in sync context" }
 * )
 * formatIssue(issue) // => "async operation not allowed in sync context"
 * ```
 *
 * @see {@link InvalidValue} — for value-constraint failures (not operation failures)
 *
 * @category models
 * @since 4.0.0
 */
export interface Forbidden extends IssueNode {
  readonly _tag: "Forbidden"
  /**
   * The metadata for the issue.
   */
  readonly annotations: Schema.Annotations.Issue | undefined
}

/**
 * Constructs a schema issue for a forbidden parsing operation.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Forbidden: new(
  annotations: Schema.Annotations.Issue | undefined,
  input?: unknown,
  options?: SchemaAST.ParseOptions
) => Forbidden = class extends IssueNodeImpl {
  readonly _tag = "Forbidden"
  /**
   * The metadata for the issue.
   */
  readonly annotations: Schema.Annotations.Issue | undefined

  constructor(
    /**
     * The metadata for the issue.
     */
    annotations: Schema.Annotations.Issue | undefined,
    /**
     * The present input associated with the issue. It is retained only when
     * `options.reportInput` is `true`.
     */
    input?: unknown,
    /**
     * The effective parse options controlling input retention.
     */
    options?: SchemaAST.ParseOptions
  ) {
    super(input, options)
    this.annotations = annotations
  }
}

/**
 * Represents a schema issue produced when a value does not match *any* member of a union schema.
 *
 * **When to use**
 *
 * Use when you need to inspect which union members were attempted and why each
 * failed.
 *
 * **Details**
 *
 * - `ast` is the `Union` AST node.
 * - `issues` contains the per-member failures.
 *
 * **Gotchas**
 *
 * `issues` is empty when no union member was applicable. In that case, the
 * default formatter reports the expected type for the union and appends
 * `", got <input>"` when input is reported.
 *
 * @see {@link OneOf} — the opposite: *too many* members matched
 * @see {@link Composite} — groups multiple issues under a non-union schema
 *
 * @category models
 * @since 4.0.0
 */
export interface AnyOf extends IssueNode {
  readonly _tag: "AnyOf"
  /**
   * The schema that caused the issue.
   */
  readonly ast: SchemaAST.Union
  /**
   * The issues that occurred.
   */
  readonly issues: ReadonlyArray<Issue>
}

/**
 * Constructs a schema issue for a value that matches no union member.
 *
 * @category constructors
 * @since 4.0.0
 */
export const AnyOf: new(
  ast: SchemaAST.Union,
  issues: ReadonlyArray<Issue>,
  input?: unknown,
  options?: SchemaAST.ParseOptions
) => AnyOf = class extends IssueNodeImpl {
  readonly _tag = "AnyOf"
  /**
   * The schema that caused the issue.
   */
  readonly ast: SchemaAST.Union
  /**
   * The issues that occurred.
   */
  readonly issues: ReadonlyArray<Issue>

  constructor(
    /**
     * The schema that caused the issue.
     */
    ast: SchemaAST.Union,
    /**
     * The issues that occurred.
     */
    issues: ReadonlyArray<Issue>,
    /**
     * The present input associated with the issue. It is retained only when
     * `options.reportInput` is `true`.
     */
    input?: unknown,
    /**
     * The effective parse options controlling input retention.
     */
    options?: SchemaAST.ParseOptions
  ) {
    super(input, options)
    this.ast = ast
    this.issues = issues
  }
}

/**
 * Represents a schema issue produced when a value matches *multiple* members of a union that is
 * configured to allow exactly one match (oneOf mode).
 *
 * **When to use**
 *
 * Use when you need to detect ambiguous union matches when `oneOf` validation is
 * enabled.
 *
 * **Details**
 *
 * - `ast` is the `Union` AST node.
 * - `successes` lists the AST nodes of each member that accepted the input.
 * - The default formatter renders this as
 *   `"Expected exactly one member to match"`, or
 *   `"Expected exactly one member to match the input <input>"` when input is
 *   reported.
 *
 * @see {@link AnyOf} — the opposite: *no* members matched
 *
 * @category models
 * @since 4.0.0
 */
export interface OneOf extends IssueNode {
  readonly _tag: "OneOf"
  /**
   * The schema that caused the issue.
   */
  readonly ast: SchemaAST.Union
  /**
   * The schemas that were successful.
   */
  readonly successes: ReadonlyArray<SchemaAST.AST>
}

/**
 * Constructs a schema issue for a value that matches multiple union members.
 *
 * @category constructors
 * @since 4.0.0
 */
export const OneOf: new(
  ast: SchemaAST.Union,
  successes: ReadonlyArray<SchemaAST.AST>,
  input?: unknown,
  options?: SchemaAST.ParseOptions
) => OneOf = class extends IssueNodeImpl {
  readonly _tag = "OneOf"
  /**
   * The schema that caused the issue.
   */
  readonly ast: SchemaAST.Union
  /**
   * The schemas that were successful.
   */
  readonly successes: ReadonlyArray<SchemaAST.AST>

  constructor(
    /**
     * The schema that caused the issue.
     */
    ast: SchemaAST.Union,
    /**
     * The schemas that were successful.
     */
    successes: ReadonlyArray<SchemaAST.AST>,
    /**
     * The present input associated with the issue. It is retained only when
     * `options.reportInput` is `true`.
     */
    input?: unknown,
    /**
     * The effective parse options controlling input retention.
     */
    options?: SchemaAST.ParseOptions
  ) {
    super(input, options)
    this.ast = ast
    this.successes = successes
  }
}

function makeFilterIssue(
  entry: Schema.FilterIssue,
  input?: unknown,
  options?: SchemaAST.ParseOptions
): Issue {
  if (isIssue(entry)) {
    return entry
  }
  if (typeof entry === "string") {
    return new InvalidValue({ message: entry }, input, options)
  }
  const inner = typeof entry.issue === "string"
    ? new InvalidValue({ message: entry.issue }, input, options)
    : entry.issue
  return new Pointer(entry.path, inner)
}

/** @internal */
export function makeSingle(
  out: undefined | boolean | Schema.FilterIssue,
  input?: unknown,
  options?: SchemaAST.ParseOptions
): Issue | undefined {
  if (out === undefined) {
    return undefined
  }
  if (typeof out === "boolean") {
    return out ? undefined : new InvalidValue(undefined, input, options)
  }
  return makeFilterIssue(out, input, options)
}

/** @internal */
export function normalizeFilterOutput(
  ast: SchemaAST.AST,
  out: Schema.FilterOutput,
  input?: unknown,
  options?: SchemaAST.ParseOptions
): Issue | undefined {
  if (Array.isArray(out)) {
    if (!Arr.isReadonlyArrayNonEmpty(out)) {
      return undefined
    }
    return out.length === 1
      ? makeFilterIssue(out[0], input, options)
      : new Composite(ast, Arr.map(out, (entry) => makeFilterIssue(entry, input, options)), input, options)
  }
  return makeSingle(out as undefined | boolean | Schema.FilterIssue, input, options)
}

/**
 * A function type that converts an {@link Issue} into a formatted
 * representation. Specialisation of the generic `Formatter` from
 * `Formatter.ts` with `Value` fixed to `Issue`.
 *
 * @see {@link makeFormatterDefault} — creates a `Formatter<string>`
 * @see {@link makeFormatterStandardSchemaV1} — creates a `Formatter<StandardSchemaV1.FailureResult>`
 *
 * @category formatting
 * @since 4.0.0
 */
export interface Formatter<out Format> extends FormatterI<Issue, Format> {}

/**
 * Callback type used to format {@link Leaf} issues into strings.
 *
 * **When to use**
 *
 * Use when customizing how {@link makeFormatterStandardSchemaV1} renders
 * terminal issues.
 *
 * @see {@link defaultLeafHook} — the built-in implementation
 * @see {@link Leaf} — the union of terminal issue types
 *
 * @category formatting
 * @since 4.0.0
 */
export type LeafHook = (issue: Leaf) => string

/**
 * Returns the built-in {@link LeafHook} used by default formatters.
 *
 * **When to use**
 *
 * Use as the default leaf renderer when customizing only the {@link CheckHook}.
 *
 * **Details**
 *
 * - Checks for a `message` annotation first; returns it if present.
 * - For `InvalidValue`, an `expected` annotation uses the standard expected
 *   value message and includes reported input when available.
 * - Otherwise generates a default message per `_tag`. When the issue reports
 *   input, the message includes its formatted value where applicable:
 *   - `InvalidType` → `"Expected <type>"` or `"Expected <type>, got <input>"`
 *   - `InvalidValue` → `"Expected a valid value"` or `"Invalid data <input>"`
 *   - `MissingKey` → `"Missing key"`
 *   - `UnexpectedKey` → `"Expected no excess property"` or
 *     `"Unexpected key with value <input>"`
 *   - `Forbidden` → `"Forbidden operation"`
 *   - `OneOf` → `"Expected exactly one member to match"` or
 *     `"Expected exactly one member to match the input <input>"`
 *
 * **Example** (Formatting Standard Schema issues with defaultLeafHook)
 *
 * ```ts import.meta.vitest
 * import { SchemaIssue } from "effect"
 *
 * const formatter = SchemaIssue.makeFormatterStandardSchemaV1({
 *   leafHook: SchemaIssue.defaultLeafHook
 * })
 * formatter(new SchemaIssue.MissingKey(undefined)) // => { issues: [{ path: [], message: "Missing key" }] }
 * ```
 *
 * @see {@link LeafHook}
 * @see {@link makeFormatterStandardSchemaV1}
 *
 * @category formatting
 * @since 4.0.0
 */
export const defaultLeafHook: LeafHook = (issue): string => {
  const message = findMessage(issue)
  if (message !== undefined) return message
  switch (issue._tag) {
    case "InvalidType":
      return getExpectedMessage(InternalAnnotations.getExpected(issue.ast), issue)
    case "InvalidValue": {
      const expected = findExpected(issue)
      if (expected !== undefined) return getExpectedMessage(expected, issue)
      const input = formatInput(issue)
      return input === undefined ? "Expected a valid value" : `Invalid data ${input}`
    }
    case "MissingKey":
      return "Missing key"
    case "UnexpectedKey": {
      const input = formatInput(issue)
      return input === undefined ? "Expected no excess property" : `Unexpected key with value ${input}`
    }
    case "Forbidden":
      return "Forbidden operation"
    case "OneOf": {
      const input = formatInput(issue)
      return input === undefined
        ? "Expected exactly one member to match"
        : `Expected exactly one member to match the input ${input}`
    }
  }
}

/**
 * Callback type used to format {@link Filter} issues into strings.
 *
 * **When to use**
 *
 * Use when customizing how {@link makeFormatterStandardSchemaV1} renders
 * filter failures.
 *
 * **Details**
 *
 * - Returns `string` to override the message, or `undefined` to fall back to
 *   the default formatting.
 *
 * @see {@link defaultCheckHook} — the built-in implementation
 * @see {@link Filter} — the issue type this hook formats
 *
 * @category formatting
 * @since 4.0.0
 */
export type CheckHook = (issue: Filter) => string | undefined

/**
 * Returns the built-in {@link CheckHook} used by default formatters.
 *
 * **When to use**
 *
 * Use as the default filter renderer when customizing only the {@link LeafHook}.
 *
 * **Details**
 *
 * - Looks for a `message` annotation on the inner issue first, then on the
 *   filter itself.
 * - Returns `undefined` when no annotation is found, causing the formatter to
 *   fall back to `"Expected <filter>"` or, when the filter reports input,
 *   `"Expected <filter>, got <input>"`.
 *
 * @see {@link CheckHook}
 * @see {@link makeFormatterStandardSchemaV1}
 *
 * @category formatting
 * @since 4.0.0
 */
export const defaultCheckHook: CheckHook = (issue): string | undefined => findMessage(issue.issue) ?? findMessage(issue)

/**
 * Creates a {@link Formatter} that produces a `StandardSchemaV1.FailureResult`.
 *
 * **When to use**
 *
 * Use when you need schema parse errors in
 * [Standard Schema V1](https://github.com/standard-schema/standard-schema)
 * format, optionally customizing leaf or check issue rendering.
 *
 * **Details**
 *
 * - Returns a `Formatter<StandardSchemaV1.FailureResult>`.
 * - Each leaf issue is flattened into `{ message, path }` entries.
 * - `Pointer` paths are accumulated to produce full property paths.
 * - Falls back to {@link defaultLeafHook} / {@link defaultCheckHook} when no
 *   hooks are provided.
 * - Default messages include reported input when the issue that produces the
 *   message has an `input` field. The returned Standard Schema issues do not
 *   receive an `input` field.
 *
 * **Gotchas**
 *
 * Reported input can appear inside the Standard Schema `message` string even
 * though it is not exposed as a separate property. Custom hooks control their
 * complete message and are not modified.
 *
 * **Example** (Creating a Standard Schema V1 formatter)
 *
 * ```ts import.meta.vitest
 * import { SchemaIssue } from "effect"
 *
 * const formatter = SchemaIssue.makeFormatterStandardSchemaV1()
 * formatter(new SchemaIssue.MissingKey(undefined)).issues[0].message // => "Missing key"
 * ```
 *
 * @see {@link makeFormatterDefault} — produces a plain string instead
 * @see {@link LeafHook}
 * @see {@link CheckHook}
 *
 * @category formatting
 * @since 4.0.0
 */
export function makeFormatterStandardSchemaV1(options?: {
  readonly leafHook?: LeafHook | undefined
  readonly checkHook?: CheckHook | undefined
}): Formatter<StandardSchemaV1.FailureResult> {
  return (issue) => ({
    issues: toDefaultIssues(issue, [], options?.leafHook ?? defaultLeafHook, options?.checkHook ?? defaultCheckHook)
  })
}

// A subtype of StandardSchemaV1.Issue
type DefaultIssue = {
  readonly message: string
  readonly path: ReadonlyArray<PropertyKey>
}

function formatInput(issue: Issue): string | undefined {
  return hasInput(issue) ? format(issue.input) : undefined
}

function findExpected(issue: InvalidValue): string | undefined {
  const expected = issue.annotations?.expected
  return typeof expected === "string" ? expected : undefined
}

function getExpectedMessage(expected: string, issue: Issue): string {
  const input = formatInput(issue)
  return input === undefined ? `Expected ${expected}` : `Expected ${expected}, got ${input}`
}

function toDefaultIssues(
  issue: Issue,
  path: ReadonlyArray<PropertyKey>,
  leafHook: LeafHook,
  checkHook: CheckHook
): Array<DefaultIssue> {
  switch (issue._tag) {
    case "Filter": {
      const message = checkHook(issue)
      if (message !== undefined) {
        return [{ path, message }]
      }
      if (issue.issue._tag !== "InvalidValue") {
        return toDefaultIssues(issue.issue, path, leafHook, checkHook)
      }
      const expected = findExpected(issue.issue)
      return [{
        path,
        message: expected === undefined
          ? getExpectedMessage(formatCheck(issue.filter), issue)
          : getExpectedMessage(expected, issue.issue)
      }]
    }
    case "Encoding":
      return toDefaultIssues(issue.issue, path, leafHook, checkHook)
    case "Pointer":
      return toDefaultIssues(issue.issue, [...path, ...issue.path], leafHook, checkHook)
    case "Composite":
      return issue.issues.flatMap((issue) => toDefaultIssues(issue, path, leafHook, checkHook))
    case "AnyOf": {
      if (issue.issues.length === 0) {
        return [{
          path,
          message: findMessage(issue) ?? getExpectedMessage(InternalAnnotations.getExpected(issue.ast), issue)
        }]
      }
      return issue.issues.flatMap((issue) => toDefaultIssues(issue, path, leafHook, checkHook))
    }
    default:
      return [{ path, message: leafHook(issue) }]
  }
}

function formatCheck<T>(check: SchemaAST.Check<T>): string {
  const expected = check.annotations?.expected
  if (typeof expected === "string") return expected

  switch (check._tag) {
    case "Filter":
      return "<filter>"
    case "FilterGroup":
      return check.checks.map((check) => formatCheck(check)).join(" & ")
  }
}

/**
 * Creates a {@link Formatter} that converts an {@link Issue} into a
 * human-readable multi-line string.
 *
 * **When to use**
 *
 * Use when you need to format a `SchemaIssue.Issue` as error messages for
 * logging, CLI output, or developer-facing diagnostics.
 *
 * **Details**
 *
 * - Flattens the issue tree into `{ message, path }` entries using
 *   {@link defaultLeafHook} and {@link defaultCheckHook}.
 * - Includes reported input in default messages when the node producing the
 *   message has an `input` field.
 * - Each entry is rendered as `"<message>"` or `"<message>\n  at <path>"`.
 * - Multiple entries are joined with newlines.
 *
 * **Gotchas**
 *
 * Formatting an issue can disclose input retained with `reportInput: true`.
 * Wrapper inputs are not inherited by child messages, and custom messages are
 * returned unchanged.
 *
 * **Example** (Formatting an issue as a string)
 *
 * ```ts import.meta.vitest
 * import { SchemaIssue } from "effect"
 *
 * const formatter = SchemaIssue.makeFormatterDefault()
 * formatter(new SchemaIssue.MissingKey(undefined)) // => "Missing key"
 * ```
 *
 * @see {@link makeFormatterStandardSchemaV1} — produces Standard Schema V1 format instead
 * @see {@link Formatter}
 *
 * @category formatting
 * @since 4.0.0
 */
export function makeFormatterDefault(): Formatter<string> {
  return (issue) => formatIssue(issue, "")
}

/** @internal */
export const defaultFormatter = makeFormatterDefault()

function formatIssue(issue: Issue, path: string): string {
  let message: string
  switch (issue._tag) {
    case "Filter": {
      const annotated = defaultCheckHook(issue)
      if (annotated !== undefined) {
        message = annotated
      } else {
        if (issue.issue._tag !== "InvalidValue") {
          return formatIssue(issue.issue, path)
        }
        const expected = findExpected(issue.issue)
        message = expected === undefined
          ? getExpectedMessage(formatCheck(issue.filter), issue)
          : getExpectedMessage(expected, issue.issue)
      }
      break
    }
    case "Encoding":
      return formatIssue(issue.issue, path)
    case "Pointer":
      return formatIssue(issue.issue, path + formatPath(issue.path))
    case "Composite":
    case "AnyOf": {
      if (issue._tag === "Composite" || issue.issues.length > 0) {
        return issue.issues.map((issue) => formatIssue(issue, path)).join("\n")
      }
      message = findMessage(issue) ?? getExpectedMessage(InternalAnnotations.getExpected(issue.ast), issue)
      break
    }
    default:
      message = defaultLeafHook(issue)
      break
  }
  return path ? `${message}\n  at ${path}` : message
}

function findMessage(issue: Issue): string | undefined {
  if (issue._tag === "Pointer") return
  if (issue._tag === "Encoding") return findMessage(issue.issue)
  const annotations = issue._tag === "Filter"
    ? issue.filter.annotations
    : "annotations" in issue
    ? issue.annotations
    : issue.ast.annotations
  const message = annotations?.[
    issue._tag === "MissingKey"
      ? "messageMissingKey"
      : issue._tag === "UnexpectedKey"
      ? "messageUnexpectedKey"
      : "message"
  ]
  if (typeof message === "string") return message
}
