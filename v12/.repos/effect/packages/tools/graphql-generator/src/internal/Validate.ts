/**
 * Validates executable documents against the schema, including literal
 * values that bypass the runtime variables Schema. Validation spans all
 * input files: fragments resolve across files, and operations and fragments
 * share one namespace.
 *
 * @internal
 */
import type * as Ast from "./Ast.ts"
import { type Diagnostic, make, type Source } from "./Diagnostic.ts"
import * as SchemaModel from "./SchemaModel.ts"

/** One parsed input file. */
export interface File {
  readonly source: Source
  readonly document: Ast.Document
}

/**
 * Collects every diagnostic across `files`, ordered by file (input order) and
 * then by position. Each diagnostic is reported in the file holding the node
 * it points at. Messages follow graphql-js 16.14.2 where it has a matching rule,
 * without its "Did you mean" suggestion lists.
 *
 * - Fields exist on their parent type (`__typename` exists on every composite
 *   type), and their types are defined by the schema.
 * - Arguments exist and are unique; required arguments (non-null, no default)
 *   are provided.
 * - Variables are unique, defined, used (directly or through spread fragments,
 *   from any file) and of known input types. Each usage fits its position:
 *   a nullable variable fills a non-null position only when the variable or
 *   the position has a non-null default.
 * - Fragments are defined in some input file, used by some operation, acyclic,
 *   and spread onto a possible type (a composite type always overlaps
 *   itself); type conditions name known types.
 * - Subscriptions select exactly one root field, counted by response key
 *   through inline fragments and fragment spreads.
 * - Operations are named. Operations and fragments share one namespace across
 *   all files; every definition sharing a name gets one diagnostic at its
 *   name, worded for its kind or as "operation or fragment" when kinds mix.
 * - Leaf fields have no selection set; composite fields have one.
 * - Fields sharing a response key, collected through inline fragments and
 *   fragment spreads, can be merged: the same field with the same arguments
 *   unless their parents are different object types, compatible response
 *   shapes, and mergeable subselections. The second field is reported.
 * - `@skip` and `@include` appear only on fields, fragment spreads and inline
 *   fragments, at most once per location, with a required `if: Boolean!`. Other
 *   directives are passed to the server unchecked.
 * - Literal arguments, input fields and variable defaults match their input
 *   types: enum values exist, required input fields are provided, input fields
 *   are known and unique. A `@oneOf` input supplies exactly one field and no
 *   null literal, matching graphql-js 16.14.2. Nullable variables in those
 *   fields remain accepted; the server must reject null variable values. The
 *   runtime variables `Schema` checks the declared variable type, not the
 *   enclosing document literal. Custom scalars accept any literal, and `Int`
 *   literals are not range checked.
 *
 * Fields under an unknown field or type are not checked further. The server
 * schema is not validated.
 */
export const validate = (
  schema: SchemaModel.Schema,
  files: ReadonlyArray<File>
): ReadonlyArray<Diagnostic> => {
  const reports: Array<Report> = []
  // A conflict inside an inline fragment is found from both its own and the enclosing selection set.
  const seen = new Set<string>()
  const report = (fileIndex: number, offset: number, message: string) => {
    const key = `${fileIndex}:${offset}:${message}`
    if (seen.has(key)) return
    seen.add(key)
    reports.push({ fileIndex, offset, diagnostic: make(files[fileIndex]!.source, offset, message) })
  }
  new Validator(schema, files, report).validate()
  // `sort` is stable, so diagnostics at the same position keep the order they were found in.
  return reports
    .sort((a, b) => a.fileIndex - b.fileIndex || a.offset - b.offset)
    .map((report) => report.diagnostic)
}

interface Report {
  readonly fileIndex: number
  readonly offset: number
  readonly diagnostic: Diagnostic
}

/** Reports `message` at a code-unit offset into input file `fileIndex`. */
type Reporter = (fileIndex: number, offset: number, message: string) => void

/** A definition together with the index of the input file it came from. */
interface Located<A> {
  readonly node: A
  readonly file: number
}

type Composite = SchemaModel.ObjectType | SchemaModel.InterfaceType | SchemaModel.UnionType

const isComposite = (type: SchemaModel.NamedType): type is Composite =>
  type._tag === "ObjectType" || type._tag === "InterfaceType" || type._tag === "UnionType"

const isInput = (type: SchemaModel.NamedType): boolean =>
  type._tag === "ScalarType" || type._tag === "EnumType" || type._tag === "InputObjectType"

const typenameField: SchemaModel.Field = {
  name: "__typename",
  description: undefined,
  arguments: [],
  type: { _tag: "NonNullTypeRef", ofType: { _tag: "NamedTypeRef", name: "String" } },
  deprecationReason: undefined
}

const fieldOf = (parent: Composite, name: string): SchemaModel.Field | undefined => {
  if (name === "__typename") return typenameField
  return parent._tag === "UnionType" ? undefined : parent.fields.find((field) => field.name === name)
}

const possibleTypes = (type: Composite): ReadonlyArray<string> =>
  type._tag === "ObjectType" ? [type.name] : type.possibleTypes

const printAstType = (type: Ast.Type): string => SchemaModel.printTypeRef(SchemaModel.fromAstType(type))

const namedAstType = (type: Ast.Type): Ast.NamedType => type._tag === "NamedType" ? type : namedAstType(type.type)

/** Structural equality of argument values, ignoring locations. */
const valueEquals = (a: Ast.Value, b: Ast.Value): boolean => {
  switch (a._tag) {
    case "Variable":
      return b._tag === "Variable" && a.name.value === b.name.value
    case "IntValue":
    case "FloatValue":
    case "StringValue":
    case "EnumValue":
    case "BooleanValue":
      return b._tag === a._tag && b.value === a.value
    case "NullValue":
      return b._tag === "NullValue"
    case "ListValue":
      return b._tag === "ListValue" && a.values.length === b.values.length &&
        a.values.every((value, i) => valueEquals(value, b.values[i]!))
    case "ObjectValue":
      return b._tag === "ObjectValue" && a.fields.length === b.fields.length &&
        a.fields.every((field) => {
          const other = b.fields.find((candidate) => candidate.name.value === field.name.value)
          return other !== undefined && valueEquals(field.value, other.value)
        })
  }
}

const sameArguments = (a: ReadonlyArray<Ast.Argument>, b: ReadonlyArray<Ast.Argument>): boolean =>
  a.length === b.length &&
  a.every((argument) => {
    const other = b.find((candidate) => candidate.name.value === argument.name.value)
    return other !== undefined && valueEquals(argument.value, other.value)
  })

/** The items whose name an earlier item already has, in order: each is reported where it repeats. */
const repeated = <A>(items: ReadonlyArray<A>, name: (item: A) => string): Array<A> => {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = name(item)
    if (seen.has(key)) return true
    seen.add(key)
    return false
  })
}

/** A value as it appears in graphql-js messages. */
const printValue = (value: Ast.Value | Ast.ConstValue): string => {
  switch (value._tag) {
    case "Variable":
      return `$${value.name.value}`
    case "StringValue":
      return JSON.stringify(value.value)
    case "NullValue":
      return "null"
    case "BooleanValue":
      return String(value.value)
    case "IntValue":
    case "FloatValue":
    case "EnumValue":
      return value.value
    case "ListValue":
      return `[${value.values.map(printValue).join(", ")}]`
    case "ObjectValue":
      return `{${value.fields.map((field) => `${field.name.value}: ${printValue(field.value)}`).join(", ")}}`
  }
}

const booleanNonNull: SchemaModel.TypeRef = {
  _tag: "NonNullTypeRef",
  ofType: { _tag: "NamedTypeRef", name: "Boolean" }
}

/**
 * The built-in directives the emitter interprets. Other directives are passed
 * through to the server unchecked, so servers can define their own.
 */
const conditionDirectives: ReadonlySet<string> = new Set(["skip", "include"])

type DirectiveLocation =
  | "QUERY"
  | "MUTATION"
  | "SUBSCRIPTION"
  | "FIELD"
  | "FRAGMENT_DEFINITION"
  | "FRAGMENT_SPREAD"
  | "INLINE_FRAGMENT"
  | "VARIABLE_DEFINITION"

const conditionLocations: ReadonlySet<DirectiveLocation> = new Set(["FIELD", "FRAGMENT_SPREAD", "INLINE_FRAGMENT"])

/** A variable in an argument, input field or condition of a known type. */
interface VariableUsage {
  readonly file: number
  readonly node: Ast.Variable
  readonly type: SchemaModel.TypeRef
  /** Whether the argument or input field has a default value. */
  readonly hasDefault: boolean
}

/** One field selected under a response key, with the type it is selected on. */
interface FieldEntry {
  readonly file: number
  readonly parent: Composite | undefined
  readonly node: Ast.Field
  readonly definition: SchemaModel.Field | undefined
}

/** The fields of a selection set by response key, through inline fragments, and the fragments it spreads. */
interface CollectedFields {
  readonly fields: ReadonlyMap<string, ReadonlyArray<FieldEntry>>
  readonly fragments: ReadonlyArray<string>
}

/** Two fields that can't be merged, reported at the second. */
interface Conflict {
  readonly responseName: string
  readonly reason: string | ReadonlyArray<Conflict>
  readonly file: number
  readonly offset: number
}

const reasonMessage = (reason: Conflict["reason"]): string =>
  typeof reason === "string"
    ? reason
    : reason.map((conflict) =>
      `subfields "${conflict.responseName}" conflict because ${reasonMessage(conflict.reason)}`
    )
      .join(" and ")

class Validator {
  readonly schema: SchemaModel.Schema
  readonly report: Reporter
  /** Every operation and fragment, in file order and then document order. */
  readonly operations: Array<Located<Ast.OperationDefinition>> = []
  readonly fragmentList: Array<Located<Ast.FragmentDefinition>> = []
  /** The first fragment with each name in any file; duplicates are reported by `checkUniqueNames`. */
  readonly fragments = new Map<string, Located<Ast.FragmentDefinition>>()
  readonly collected = new Map<Ast.SelectionSet, CollectedFields>()
  /** The variable positions in each operation's or fragment's own selections, once validated. */
  readonly usages = new Map<Ast.OperationDefinition | Ast.FragmentDefinition, ReadonlyArray<VariableUsage>>()
  /** Where `checkValue` records variables while a definition's selections are validated. */
  positions: Array<VariableUsage> | undefined = undefined
  /** Fragment pairs already compared for conflicts, keyed by the sorted names, to whether they were mutually exclusive. */
  readonly comparedFragments = new Map<string, boolean>()
  /** Field maps already compared with a fragment, by fragment name, to whether they were mutually exclusive. */
  readonly comparedFieldsAndFragments = new WeakMap<CollectedFields["fields"], Map<string, boolean>>()

  constructor(schema: SchemaModel.Schema, files: ReadonlyArray<File>, report: Reporter) {
    this.schema = schema
    this.report = report
    files.forEach((file, index) => {
      for (const definition of file.document.definitions) {
        if (definition._tag === "OperationDefinition") {
          this.operations.push({ node: definition, file: index })
        } else if (definition._tag === "FragmentDefinition") {
          const fragment = { node: definition, file: index }
          this.fragmentList.push(fragment)
          if (!this.fragments.has(definition.name.value)) this.fragments.set(definition.name.value, fragment)
        }
      }
    })
  }

  validate(): void {
    const defined = this.operations.map((operation) => this.validateOperation(operation))
    for (const { file, node: fragment } of this.fragmentList) {
      const type = this.typeCondition(
        file,
        fragment.typeCondition,
        (name) => `Fragment "${fragment.name.value}" cannot condition on non composite type "${name}".`
      )
      this.checkDirectives(file, fragment.directives, "FRAGMENT_DEFINITION")
      if (type !== undefined) this.validateDefinition(file, fragment, type)
    }
    // Variables reach fragments in any file, so they are checked once every definition is validated.
    this.operations.forEach((operation, i) => this.checkVariables(operation, defined[i]!))
    this.checkUnusedFragments()
    this.checkFragmentCycles()
    this.checkUniqueNames()
  }

  // Operations and variables

  /** Returns the first definition of each variable, when its type is a known input type. */
  validateOperation(
    { file, node: operation }: Located<Ast.OperationDefinition>
  ): ReadonlyMap<string, Ast.VariableDefinition | undefined> {
    const name = operation.name?.value
    if (name === undefined) {
      this.report(file, operation.loc.start, "Anonymous operations are not supported, name this operation.")
    }

    this.checkDirectives(file, operation.directives, operation.operation.toUpperCase() as DirectiveLocation)
    for (
      const { variable } of repeated(operation.variableDefinitions, (definition) => definition.variable.name.value)
    ) {
      this.report(file, variable.loc.start, `There can be only one variable named "$${variable.name.value}".`)
    }
    const defined = new Map<string, Ast.VariableDefinition | undefined>()
    for (const definition of operation.variableDefinitions) {
      this.checkDirectives(file, definition.directives, "VARIABLE_DEFINITION")
      const named = namedAstType(definition.type)
      const type = this.schema.types.get(named.name.value)
      const known = type !== undefined && isInput(type)
      if (!defined.has(definition.variable.name.value)) {
        defined.set(definition.variable.name.value, known ? definition : undefined)
      }
      if (type === undefined) {
        this.report(file, named.loc.start, `Unknown type "${named.name.value}".`)
      } else if (!known) {
        this.report(
          file,
          definition.type.loc.start,
          `Variable "$${definition.variable.name.value}" cannot be non-input type "${printAstType(definition.type)}".`
        )
      } else if (definition.defaultValue !== undefined) {
        this.checkValue(file, definition.defaultValue, SchemaModel.fromAstType(definition.type))
      }
    }

    const root = this.composite(SchemaModel.rootTypeName(this.schema, operation.operation))
    if (root === undefined) {
      this.report(file, operation.loc.start, `Schema is not configured to execute ${operation.operation} operation.`)
      return defined
    }
    if (operation.operation === "subscription") this.checkSingleRootField(file, operation)
    this.validateDefinition(file, operation, root)
    return defined
  }

  /** Validates a definition's selections, recording the variable positions in them for `checkVariables`. */
  validateDefinition(
    file: number,
    definition: Ast.OperationDefinition | Ast.FragmentDefinition,
    root: Composite
  ): void {
    this.positions = []
    this.validateSelectionSet(file, definition.selectionSet, root)
    this.usages.set(definition, this.positions)
    this.positions = undefined
  }

  /**
   * Checks the variables an operation uses, directly or through every fragment
   * it spreads, transitively and across files: each fits its position, is
   * defined, and each definition is used.
   */
  checkVariables(
    { file, node: operation }: Located<Ast.OperationDefinition>,
    defined: ReadonlyMap<string, Ast.VariableDefinition | undefined>
  ): void {
    const name = operation.name?.value
    const definitions = [{ node: operation, file }, ...this.reachableFragments([operation.selectionSet])]
    for (const definition of definitions) {
      for (const usage of this.usages.get(definition.node) ?? []) {
        const variable = defined.get(usage.node.name.value)
        if (variable === undefined || this.allowedPosition(variable, usage)) continue
        this.report(
          usage.file,
          usage.node.loc.start,
          `Variable "$${usage.node.name.value}" of type "${
            printAstType(variable.type)
          }" used in position expecting type "${SchemaModel.printTypeRef(usage.type)}".`
        )
      }
    }

    const usages: Array<Located<Ast.Variable>> = []
    for (const { file: at, node: definition } of definitions) {
      const found: Array<Ast.Variable> = []
      variablesInDirectives(definition.directives, found)
      variablesInSelectionSet(definition.selectionSet, found)
      for (const variable of found) usages.push({ node: variable, file: at })
    }
    const used = new Set(usages.map((usage) => usage.node.name.value))
    for (const { file: usageFile, node: usage } of usages) {
      if (defined.has(usage.name.value)) continue
      this.report(
        usageFile,
        usage.loc.start,
        name === undefined
          ? `Variable "$${usage.name.value}" is not defined.`
          : `Variable "$${usage.name.value}" is not defined by operation "${name}".`
      )
    }
    for (const definition of operation.variableDefinitions) {
      const variable = definition.variable.name.value
      if (used.has(variable)) continue
      this.report(
        file,
        definition.variable.loc.start,
        name === undefined
          ? `Variable "$${variable}" is never used.`
          : `Variable "$${variable}" is never used in operation "${name}".`
      )
    }
  }

  /**
   * graphql-js's SingleFieldSubscriptions rule: a subscription selects one
   * root response key, counted through inline fragments and fragment spreads.
   * Selections a literal `@skip` or `@include` condition leaves out don't
   * count. Reported at the first field of the second key.
   */
  checkSingleRootField(file: number, operation: Ast.OperationDefinition): void {
    const keys = new Map<string, Located<Ast.Field>>()
    const visited = new Set<string>()
    const collect = (at: number, selectionSet: Ast.SelectionSet): void => {
      for (const selection of selectionSet.selections) {
        if (inclusion(selection.directives) === "exclude") continue
        if (selection._tag === "Field") {
          const key = (selection.alias ?? selection.name).value
          if (!keys.has(key)) keys.set(key, { node: selection, file: at })
        } else if (selection._tag === "InlineFragment") {
          collect(at, selection.selectionSet)
        } else if (!visited.has(selection.name.value)) {
          visited.add(selection.name.value)
          const fragment = this.fragments.get(selection.name.value)
          if (fragment !== undefined) collect(fragment.file, fragment.node.selectionSet)
        }
      }
    }
    collect(file, operation.selectionSet)
    const extra = Array.from(keys.values())[1]
    if (extra === undefined) return
    const name = operation.name?.value
    this.report(
      extra.file,
      extra.node.loc.start,
      name === undefined
        ? "Anonymous Subscription must select only one top level field."
        : `Subscription "${name}" must select only one top level field.`
    )
  }

  /** The defined fragments spread from `selectionSets`, transitively and across files, each once. */
  reachableFragments(selectionSets: ReadonlyArray<Ast.SelectionSet>): Array<Located<Ast.FragmentDefinition>> {
    const reached: Array<Located<Ast.FragmentDefinition>> = []
    const seen = new Set<string>()
    const pending = selectionSets.flatMap((selectionSet) => fragmentSpreads(selectionSet))
    while (pending.length > 0) {
      const name = pending.pop()!.name.value
      if (seen.has(name)) continue
      seen.add(name)
      const fragment = this.fragments.get(name)
      if (fragment === undefined) continue
      reached.push(fragment)
      pending.push(...fragmentSpreads(fragment.node.selectionSet))
    }
    return reached
  }

  // Selections

  validateSelectionSet(file: number, selectionSet: Ast.SelectionSet, parent: Composite): void {
    for (const conflict of this.conflictsWithin(file, selectionSet, parent)) {
      this.report(
        conflict.file,
        conflict.offset,
        `Fields "${conflict.responseName}" conflict because ${
          reasonMessage(conflict.reason)
        }. Use different aliases on the fields to fetch both if this was intentional.`
      )
    }
    for (const selection of selectionSet.selections) {
      switch (selection._tag) {
        case "Field": {
          this.checkDirectives(file, selection.directives, "FIELD")
          this.validateField(file, selection, parent)
          break
        }
        case "InlineFragment": {
          this.checkDirectives(file, selection.directives, "INLINE_FRAGMENT")
          if (selection.typeCondition === undefined) {
            this.validateSelectionSet(file, selection.selectionSet, parent)
            break
          }
          const type = this.typeCondition(
            file,
            selection.typeCondition,
            (name) => `Fragment cannot condition on non composite type "${name}".`
          )
          if (type === undefined) break
          if (!this.overlaps(parent, type)) {
            this.report(
              file,
              selection.loc.start,
              `Fragment cannot be spread here as objects of type "${parent.name}" can never be of type "${type.name}".`
            )
          }
          this.validateSelectionSet(file, selection.selectionSet, type)
          break
        }
        case "FragmentSpread": {
          this.checkDirectives(file, selection.directives, "FRAGMENT_SPREAD")
          const fragment = this.fragments.get(selection.name.value)?.node
          if (fragment === undefined) {
            this.report(file, selection.name.loc.start, `Unknown fragment "${selection.name.value}".`)
            break
          }
          // Unknown and non-composite type conditions are reported on the fragment definition.
          const type = this.composite(fragment.typeCondition.name.value)
          if (type !== undefined && !this.overlaps(parent, type)) {
            this.report(
              file,
              selection.loc.start,
              `Fragment "${fragment.name.value}" cannot be spread here as objects of type "${parent.name}" can never be of type "${type.name}".`
            )
          }
          break
        }
      }
    }
  }

  validateField(file: number, field: Ast.Field, parent: Composite): void {
    const name = field.name.value
    const definition = fieldOf(parent, name)
    if (definition === undefined) {
      this.report(file, field.loc.start, `Cannot query field "${name}" on type "${parent.name}".`)
      return
    }

    this.checkUniqueArguments(file, field.arguments)
    for (const argument of field.arguments) {
      const argumentDefinition = definition.arguments.find((candidate) => candidate.name === argument.name.value)
      if (argumentDefinition === undefined) {
        this.report(
          file,
          argument.loc.start,
          `Unknown argument "${argument.name.value}" on field "${parent.name}.${name}".`
        )
      } else {
        this.checkValue(file, argument.value, argumentDefinition.type, argumentDefinition.defaultValue !== undefined)
      }
    }
    for (const argument of definition.arguments) {
      if (
        argument.type._tag === "NonNullTypeRef" &&
        argument.defaultValue === undefined &&
        !field.arguments.some((candidate) => candidate.name.value === argument.name)
      ) {
        this.report(
          file,
          field.loc.start,
          `Field "${name}" argument "${argument.name}" of type "${
            SchemaModel.printTypeRef(argument.type)
          }" is required, but it was not provided.`
        )
      }
    }

    const typeName = SchemaModel.namedTypeOf(definition.type)
    const type = this.schema.types.get(typeName)
    if (type === undefined) {
      // The schema reader accepts references to undefined types; the emitter can't type such a field.
      this.report(file, field.loc.start, `Unknown type "${typeName}".`)
      return
    }
    const printed = SchemaModel.printTypeRef(definition.type)
    if (!isComposite(type)) {
      if (field.selectionSet !== undefined) {
        this.report(
          file,
          field.selectionSet.loc.start,
          `Field "${name}" must not have a selection since type "${printed}" has no subfields.`
        )
      }
    } else if (field.selectionSet === undefined) {
      this.report(
        file,
        field.loc.start,
        `Field "${name}" of type "${printed}" must have a selection of subfields. Did you mean "${name} { ... }"?`
      )
    } else {
      this.validateSelectionSet(file, field.selectionSet, type)
    }
  }

  /** The composite type named `name`, if there is one. */
  composite(name: string | undefined): Composite | undefined {
    const type = name === undefined ? undefined : this.schema.types.get(name)
    return type !== undefined && isComposite(type) ? type : undefined
  }

  /** Resolves a type condition, reporting unknown and non-composite types. */
  typeCondition(
    file: number,
    condition: Ast.NamedType,
    nonComposite: (name: string) => string
  ): Composite | undefined {
    const type = this.schema.types.get(condition.name.value)
    if (type === undefined) {
      this.report(file, condition.loc.start, `Unknown type "${condition.name.value}".`)
      return undefined
    }
    if (!isComposite(type)) {
      this.report(file, condition.loc.start, nonComposite(condition.name.value))
      return undefined
    }
    return type
  }

  /** Whether some object type can be both `a` and `b`; a type always overlaps itself, as in graphql-js. */
  overlaps(a: Composite, b: Composite): boolean {
    if (a.name === b.name) return true
    const names = new Set(possibleTypes(a))
    return possibleTypes(b).some((name) => names.has(name))
  }

  // Directives, arguments and values

  /**
   * Checks `@skip` and `@include`: allowed locations, once per location, and
   * their required `if: Boolean!`. Other directives are not checked.
   */
  checkDirectives(
    file: number,
    directives: ReadonlyArray<Ast.Directive | Ast.ConstDirective>,
    location: DirectiveLocation
  ): void {
    const conditions = directives.filter((directive) => conditionDirectives.has(directive.name.value))
    for (const directive of repeated(conditions, (directive) => directive.name.value)) {
      this.report(
        file,
        directive.loc.start,
        `The directive "@${directive.name.value}" can only be used once at this location.`
      )
    }
    for (const directive of conditions) {
      const name = directive.name.value
      if (!conditionLocations.has(location)) {
        this.report(file, directive.loc.start, `Directive "@${name}" may not be used on ${location}.`)
      }
      this.checkUniqueArguments(file, directive.arguments)
      for (const argument of directive.arguments) {
        if (argument.name.value === "if") {
          this.checkValue(file, argument.value, booleanNonNull)
        } else {
          this.report(file, argument.loc.start, `Unknown argument "${argument.name.value}" on directive "@${name}".`)
        }
      }
      if (!directive.arguments.some((argument) => argument.name.value === "if")) {
        this.report(
          file,
          directive.loc.start,
          `Directive "@${name}" argument "if" of type "Boolean!" is required, but it was not provided.`
        )
      }
    }
  }

  checkUniqueArguments(file: number, args: ReadonlyArray<Ast.Argument | Ast.ConstArgument>): void {
    for (const argument of repeated(args, (argument) => argument.name.value)) {
      this.report(file, argument.loc.start, `There can be only one argument named "${argument.name.value}".`)
    }
  }

  /**
   * Checks a literal against an input type, as graphql-js's ValuesOfCorrectType
   * does without its suggestions. Variables are recorded in `positions` and
   * checked by `checkVariables` instead; `hasDefault` is whether the argument
   * or input field has a default value. Custom scalars accept any literal, and
   * `Int` literals are not range checked.
   */
  checkValue(file: number, value: Ast.Value | Ast.ConstValue, type: SchemaModel.TypeRef, hasDefault = false): void {
    if (value._tag === "Variable") {
      this.positions?.push({ file, node: value, type, hasDefault })
      return
    }
    if (value._tag === "NullValue") {
      if (type._tag === "NonNullTypeRef") {
        this.report(
          file,
          value.loc.start,
          `Expected value of type "${SchemaModel.printTypeRef(type)}", found null.`
        )
      }
      return
    }
    if (type._tag === "NonNullTypeRef") return this.checkValue(file, value, type.ofType)
    if (type._tag === "ListTypeRef") {
      if (value._tag === "ListValue") {
        for (const item of value.values) this.checkValue(file, item, type.ofType)
      } else {
        this.checkValue(file, value, type.ofType)
      }
      return
    }
    const named = this.schema.types.get(type.name)
    if (named === undefined) return
    const invalid = (message: string) => this.report(file, value.loc.start, message)
    switch (named._tag) {
      case "InputObjectType": {
        if (value._tag !== "ObjectValue") {
          return invalid(`Expected value of type "${named.name}", found ${printValue(value)}.`)
        }
        for (const field of repeated(value.fields, (field) => field.name.value)) {
          this.report(file, field.loc.start, `There can be only one input field named "${field.name.value}".`)
        }
        for (const field of value.fields) {
          const definition = named.fields.find((candidate) => candidate.name === field.name.value)
          if (definition === undefined) {
            this.report(file, field.loc.start, `Field "${field.name.value}" is not defined by type "${named.name}".`)
          } else {
            this.checkValue(file, field.value, definition.type, definition.defaultValue !== undefined)
          }
        }
        if (named.oneOf) {
          if (value.fields.length !== 1) {
            invalid(`OneOf Input Object "${named.name}" must specify exactly one key.`)
          } else if (value.fields[0]!.value._tag === "NullValue") {
            invalid(`Field "${named.name}.${value.fields[0]!.name.value}" must be non-null.`)
          }
          return
        }
        for (const field of named.fields) {
          if (
            field.type._tag === "NonNullTypeRef" && field.defaultValue === undefined &&
            !value.fields.some((candidate) => candidate.name.value === field.name)
          ) {
            invalid(
              `Field "${named.name}.${field.name}" of required type "${
                SchemaModel.printTypeRef(field.type)
              }" was not provided.`
            )
          }
        }
        return
      }
      case "EnumType": {
        if (value._tag !== "EnumValue") {
          return invalid(`Enum "${named.name}" cannot represent non-enum value: ${printValue(value)}.`)
        }
        if (!named.values.some((candidate) => candidate.name === value.value)) {
          invalid(`Value "${value.value}" does not exist in "${named.name}" enum.`)
        }
        return
      }
      case "ScalarType": {
        const printed = printValue(value)
        switch (named.name) {
          case "Int":
            if (value._tag !== "IntValue") invalid(`Int cannot represent non-integer value: ${printed}`)
            return
          case "Float":
            if (value._tag !== "IntValue" && value._tag !== "FloatValue") {
              invalid(`Float cannot represent non numeric value: ${printed}`)
            }
            return
          case "String":
            if (value._tag !== "StringValue") invalid(`String cannot represent a non string value: ${printed}`)
            return
          case "Boolean":
            if (value._tag !== "BooleanValue") invalid(`Boolean cannot represent a non boolean value: ${printed}`)
            return
          case "ID":
            if (value._tag !== "StringValue" && value._tag !== "IntValue") {
              invalid(`ID cannot represent a non-string and non-integer value: ${printed}`)
            }
            return
        }
        return
      }
    }
  }

  // Variable positions

  /**
   * graphql-js's allowed-variable-usage rule: a nullable variable may fill a
   * non-null position when the variable or the position has a non-null
   * default.
   */
  allowedPosition(variable: Ast.VariableDefinition, usage: VariableUsage): boolean {
    const variableType = SchemaModel.fromAstType(variable.type)
    if (usage.type._tag === "NonNullTypeRef" && variableType._tag !== "NonNullTypeRef") {
      const hasNonNullDefault = variable.defaultValue !== undefined && variable.defaultValue._tag !== "NullValue"
      if (!hasNonNullDefault && !usage.hasDefault) return false
      return isSubType(variableType, usage.type.ofType)
    }
    return isSubType(variableType, usage.type)
  }

  // Overlapping fields

  /**
   * graphql-js's OverlappingFieldsCanBeMerged: fields sharing a response key,
   * collected through inline fragments and fragment spreads, must be the same
   * field with the same arguments unless their parents are distinct object
   * types, must return compatible shapes, and must have mergeable
   * subselections.
   */
  conflictsWithin(file: number, selectionSet: Ast.SelectionSet, parent: Composite): Array<Conflict> {
    const conflicts: Array<Conflict> = []
    const { fields, fragments } = this.collectFields(file, selectionSet, parent)
    for (const [responseName, entries] of fields) {
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const conflict = this.findConflict(false, responseName, entries[i]!, entries[j]!)
          if (conflict !== undefined) conflicts.push(conflict)
        }
      }
    }
    for (let i = 0; i < fragments.length; i++) {
      this.conflictsWithFragment(conflicts, false, fields, fragments[i]!)
      for (let j = i + 1; j < fragments.length; j++) {
        this.conflictsBetweenFragments(conflicts, false, fragments[i]!, fragments[j]!)
      }
    }
    return conflicts
  }

  collectFields(file: number, selectionSet: Ast.SelectionSet, parent: Composite | undefined): CollectedFields {
    const cached = this.collected.get(selectionSet)
    if (cached !== undefined) return cached
    const fields = new Map<string, Array<FieldEntry>>()
    const fragments: Array<string> = []
    const visit = (set: Ast.SelectionSet, parent: Composite | undefined): void => {
      for (const selection of set.selections) {
        if (selection._tag === "Field") {
          const key = (selection.alias ?? selection.name).value
          const entry: FieldEntry = {
            file,
            parent,
            node: selection,
            definition: parent === undefined ? undefined : fieldOf(parent, selection.name.value)
          }
          const entries = fields.get(key)
          if (entries === undefined) fields.set(key, [entry])
          else entries.push(entry)
        } else if (selection._tag === "FragmentSpread") {
          if (!fragments.includes(selection.name.value)) fragments.push(selection.name.value)
        } else {
          visit(
            selection.selectionSet,
            selection.typeCondition === undefined ? parent : this.composite(selection.typeCondition.name.value)
          )
        }
      }
    }
    visit(selectionSet, parent)
    const collected = { fields, fragments }
    this.collected.set(selectionSet, collected)
    return collected
  }

  fragmentFields(name: string): CollectedFields | undefined {
    const fragment = this.fragments.get(name)
    if (fragment === undefined) return undefined
    return this.collectFields(
      fragment.file,
      fragment.node.selectionSet,
      this.composite(fragment.node.typeCondition.name.value)
    )
  }

  conflictsBetween(
    conflicts: Array<Conflict>,
    exclusive: boolean,
    fields1: CollectedFields["fields"],
    fields2: CollectedFields["fields"]
  ): void {
    for (const [responseName, entries1] of fields1) {
      const entries2 = fields2.get(responseName)
      if (entries2 === undefined) continue
      for (const entry1 of entries1) {
        for (const entry2 of entries2) {
          const conflict = this.findConflict(exclusive, responseName, entry1, entry2)
          if (conflict !== undefined) conflicts.push(conflict)
        }
      }
    }
  }

  conflictsWithFragment(
    conflicts: Array<Conflict>,
    exclusive: boolean,
    fields: CollectedFields["fields"],
    fragmentName: string
  ): void {
    let compared = this.comparedFieldsAndFragments.get(fields)
    if (compared === undefined) {
      compared = new Map()
      this.comparedFieldsAndFragments.set(fields, compared)
    }
    if (!firstComparison(compared, fragmentName, exclusive)) return
    const fragment = this.fragmentFields(fragmentName)
    if (fragment === undefined || fragment.fields === fields) return
    this.conflictsBetween(conflicts, exclusive, fields, fragment.fields)
    for (const nested of fragment.fragments) this.conflictsWithFragment(conflicts, exclusive, fields, nested)
  }

  conflictsBetweenFragments(conflicts: Array<Conflict>, exclusive: boolean, name1: string, name2: string): void {
    if (name1 === name2) return
    const key = name1 < name2 ? `${name1}\u0000${name2}` : `${name2}\u0000${name1}`
    if (!firstComparison(this.comparedFragments, key, exclusive)) return
    const fragment1 = this.fragmentFields(name1)
    const fragment2 = this.fragmentFields(name2)
    if (fragment1 === undefined || fragment2 === undefined) return
    this.conflictsBetween(conflicts, exclusive, fragment1.fields, fragment2.fields)
    for (const nested of fragment2.fragments) this.conflictsBetweenFragments(conflicts, exclusive, name1, nested)
    for (const nested of fragment1.fragments) this.conflictsBetweenFragments(conflicts, exclusive, nested, name2)
  }

  findConflict(
    parentsExclusive: boolean,
    responseName: string,
    entry1: FieldEntry,
    entry2: FieldEntry
  ): Conflict | undefined {
    const exclusive = parentsExclusive ||
      (entry1.parent !== undefined && entry2.parent !== undefined && entry1.parent.name !== entry2.parent.name &&
        entry1.parent._tag === "ObjectType" && entry2.parent._tag === "ObjectType")
    const conflict = (reason: Conflict["reason"]): Conflict => ({
      responseName,
      reason,
      file: entry2.file,
      offset: entry2.node.loc.start
    })
    const name1 = entry1.node.name.value
    const name2 = entry2.node.name.value
    if (!exclusive) {
      if (name1 !== name2) return conflict(`"${name1}" and "${name2}" are different fields`)
      if (!sameArguments(entry1.node.arguments, entry2.node.arguments)) {
        return conflict("they have differing arguments")
      }
    }
    const type1 = entry1.definition?.type
    const type2 = entry2.definition?.type
    if (type1 !== undefined && type2 !== undefined && this.typesConflict(type1, type2)) {
      return conflict(
        `they return conflicting types "${SchemaModel.printTypeRef(type1)}" and "${SchemaModel.printTypeRef(type2)}"`
      )
    }
    const set1 = entry1.node.selectionSet
    const set2 = entry2.node.selectionSet
    if (set1 === undefined || set2 === undefined) return undefined
    const sub = this.conflictsBetweenSubselections(
      exclusive,
      entry1.file,
      this.compositeOf(type1),
      set1,
      entry2.file,
      this.compositeOf(type2),
      set2
    )
    return sub.length > 0 ? conflict(sub) : undefined
  }

  conflictsBetweenSubselections(
    exclusive: boolean,
    file1: number,
    parent1: Composite | undefined,
    set1: Ast.SelectionSet,
    file2: number,
    parent2: Composite | undefined,
    set2: Ast.SelectionSet
  ): Array<Conflict> {
    const conflicts: Array<Conflict> = []
    const collected1 = this.collectFields(file1, set1, parent1)
    const collected2 = this.collectFields(file2, set2, parent2)
    this.conflictsBetween(conflicts, exclusive, collected1.fields, collected2.fields)
    for (const name of collected2.fragments) {
      this.conflictsWithFragment(conflicts, exclusive, collected1.fields, name)
    }
    for (const name of collected1.fragments) {
      this.conflictsWithFragment(conflicts, exclusive, collected2.fields, name)
    }
    for (const name1 of collected1.fragments) {
      for (const name2 of collected2.fragments) this.conflictsBetweenFragments(conflicts, exclusive, name1, name2)
    }
    return conflicts
  }

  /** Whether two field types give different response shapes: list or null-ness, or different leaf types. */
  typesConflict(type1: SchemaModel.TypeRef, type2: SchemaModel.TypeRef): boolean {
    if (type1._tag === "ListTypeRef") {
      return type2._tag === "ListTypeRef" ? this.typesConflict(type1.ofType, type2.ofType) : true
    }
    if (type2._tag === "ListTypeRef") return true
    if (type1._tag === "NonNullTypeRef") {
      return type2._tag === "NonNullTypeRef" ? this.typesConflict(type1.ofType, type2.ofType) : true
    }
    if (type2._tag === "NonNullTypeRef") return true
    const isLeaf = (name: string) => {
      const named = this.schema.types.get(name)
      return named !== undefined && !isComposite(named)
    }
    return (isLeaf(type1.name) || isLeaf(type2.name)) && type1.name !== type2.name
  }

  compositeOf(type: SchemaModel.TypeRef | undefined): Composite | undefined {
    return type === undefined ? undefined : this.composite(SchemaModel.namedTypeOf(type))
  }

  // Fragments

  checkUnusedFragments(): void {
    const used = new Set(
      this.reachableFragments(this.operations.map((operation) => operation.node.selectionSet))
        .map((fragment) => fragment.node.name.value)
    )
    for (const { file, node: fragment } of this.fragmentList) {
      if (!used.has(fragment.name.value)) {
        this.report(file, fragment.loc.start, `Fragment "${fragment.name.value}" is never used.`)
      }
    }
  }

  /**
   * Depth-first search from each fragment in file and document order,
   * reporting each cycle once at the first spread on its path (as graphql-js's
   * NoFragmentCycles rule does), in the file holding that spread.
   */
  checkFragmentCycles(): void {
    const visited = new Set<string>()
    const path: Array<Located<Ast.FragmentSpread>> = []
    const indexOnPath = new Map<string, number>()
    const visit = ({ file, node: fragment }: Located<Ast.FragmentDefinition>): void => {
      const name = fragment.name.value
      if (visited.has(name)) return
      visited.add(name)
      const spreads = fragmentSpreads(fragment.selectionSet)
      if (spreads.length === 0) return
      indexOnPath.set(name, path.length)
      for (const spread of spreads) {
        const target = spread.name.value
        const cycleStart = indexOnPath.get(target)
        path.push({ node: spread, file })
        if (cycleStart === undefined) {
          const next = this.fragments.get(target)
          if (next !== undefined) visit(next)
        } else {
          const cycle = path.slice(cycleStart)
          const via = cycle.slice(0, -1).map((step) => `"${step.node.name.value}"`).join(", ")
          this.report(
            cycle[0]!.file,
            cycle[0]!.node.loc.start,
            `Cannot spread fragment "${target}" within itself${via === "" ? "." : ` via ${via}.`}`
          )
        }
        path.pop()
      }
      indexOnPath.delete(name)
    }
    for (const fragment of this.fragmentList) visit(fragment)
  }

  /** Operations and fragments share one namespace across every file: both become generated exports. */
  checkUniqueNames(): void {
    const byName = new Map<string, Array<{ readonly kind: string; readonly file: number; readonly name: Ast.Name }>>()
    const add = (kind: string, file: number, name: Ast.Name | undefined): void => {
      if (name === undefined) return
      const entries = byName.get(name.value)
      if (entries === undefined) byName.set(name.value, [{ kind, file, name }])
      else entries.push({ kind, file, name })
    }
    for (const { file, node } of this.operations) add("operation", file, node.name)
    for (const { file, node } of this.fragmentList) add("fragment", file, node.name)
    for (const [name, entries] of byName) {
      if (entries.length < 2) continue
      const kind = entries.every((entry) => entry.kind === entries[0]!.kind)
        ? entries[0]!.kind
        : "operation or fragment"
      for (const entry of entries) {
        this.report(entry.file, entry.name.loc.start, `There can be only one ${kind} named "${name}".`)
      }
    }
  }
}

/**
 * How `@skip` / `@include` decide a selection: a literal condition is folded,
 * so the selection is dropped or the directive ignored, and a variable
 * condition makes it conditional.
 */
export const inclusion = (directives: ReadonlyArray<Ast.Directive>): "exclude" | "include" | "conditional" => {
  let result: "include" | "conditional" = "include"
  for (const directive of directives) {
    const name = directive.name.value
    if (name !== "skip" && name !== "include") continue
    const value = directive.arguments.find((argument) => argument.name.value === "if")?.value
    if (value?._tag === "BooleanValue") {
      if (value.value === (name === "skip")) return "exclude"
    } else {
      result = "conditional"
    }
  }
  return result
}

/**
 * Whether `key` is still to be compared as `exclusive`, recording that it now
 * is. A comparison that wasn't mutually exclusive covers both cases.
 */
const firstComparison = <K>(compared: Map<K, boolean>, key: K, exclusive: boolean): boolean => {
  const previous = compared.get(key)
  if (previous === false || previous === exclusive) return false
  compared.set(key, exclusive)
  return true
}

/** Whether a value of input type `sub` can be used where `sup` is expected. */
const isSubType = (sub: SchemaModel.TypeRef, sup: SchemaModel.TypeRef): boolean => {
  if (sup._tag === "NonNullTypeRef") return sub._tag === "NonNullTypeRef" && isSubType(sub.ofType, sup.ofType)
  if (sub._tag === "NonNullTypeRef") return isSubType(sub.ofType, sup)
  if (sup._tag === "ListTypeRef") return sub._tag === "ListTypeRef" && isSubType(sub.ofType, sup.ofType)
  if (sub._tag === "ListTypeRef") return false
  return sub.name === sup.name
}

/** Every fragment spread in a selection set, at any depth and in source order, without following spreads. */
export const fragmentSpreads = (selectionSet: Ast.SelectionSet): Array<Ast.FragmentSpread> =>
  selectionSet.selections.flatMap((selection) =>
    selection._tag === "FragmentSpread"
      ? [selection]
      : selection.selectionSet === undefined
      ? []
      : fragmentSpreads(selection.selectionSet)
  )

/** Appends every variable referenced in `value`, in document order. */
const variablesInValue = (value: Ast.Value, out: Array<Ast.Variable>): void => {
  switch (value._tag) {
    case "Variable":
      out.push(value)
      break
    case "ListValue":
      for (const item of value.values) variablesInValue(item, out)
      break
    case "ObjectValue":
      for (const field of value.fields) variablesInValue(field.value, out)
      break
  }
}

const variablesInArguments = (args: ReadonlyArray<Ast.Argument>, out: Array<Ast.Variable>): void => {
  for (const argument of args) variablesInValue(argument.value, out)
}

const variablesInDirectives = (directives: ReadonlyArray<Ast.Directive>, out: Array<Ast.Variable>): void => {
  for (const directive of directives) variablesInArguments(directive.arguments, out)
}

/** Variables in arguments and directives at any depth, without following fragment spreads. */
const variablesInSelectionSet = (selectionSet: Ast.SelectionSet, out: Array<Ast.Variable>): void => {
  for (const selection of selectionSet.selections) {
    variablesInDirectives(selection.directives, out)
    if (selection._tag === "Field") variablesInArguments(selection.arguments, out)
    if (selection._tag !== "FragmentSpread" && selection.selectionSet !== undefined) {
      variablesInSelectionSet(selection.selectionSet, out)
    }
  }
}
