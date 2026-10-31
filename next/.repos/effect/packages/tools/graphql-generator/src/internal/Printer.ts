/**
 * Token-minimal printer for executable documents; SDL is not supported.
 *
 * Preserves definition order and number text. Strings use regular quoted
 * syntax. Spaces separate adjacent non-punctuator tokens; there is no trailing
 * newline. Anonymous queries without variables or directives use shorthand.
 *
 * Descriptions are omitted because they have no execution meaning and are
 * rejected by servers using the 2021 grammar.
 *
 * {@link template} prints an operation as an `effect/graphql`
 * `DocumentTemplate` instead: the same text, split around the names a batch
 * renames.
 *
 * @internal
 */
import type { GraphQL } from "effect/graphql"
import type * as Ast from "./Ast.ts"

/**
 * Prints an executable document compactly. Throws on type-system definitions
 * and extensions, which are outside the contract.
 */
export const print = (document: Ast.Document): string => concatAll(document.definitions.map(printDefinition))

/**
 * Surrounds a name printed as a template placeholder. Names can't contain it
 * and strings print it escaped, so splitting on it finds exactly the names.
 */
const marker = "\u0000"

/** Which names print between markers. */
interface Marks {
  readonly variables: boolean
  readonly fragments: ReadonlySet<string>
}

const unmarked: Marks = { variables: false, fragments: new Set() }

const markName = (name: string): string => `${marker}${name}${marker}`

/**
 * Joins two printed fragments, adding a space only where two non-punctuators
 * would otherwise touch. A marker is ignored, so marked text joins exactly as
 * it would unmarked.
 */
const concat = (left: string, right: string): string =>
  /[\w"-]$/.test(left.endsWith(marker) ? left.slice(0, -1) : left) &&
    /^[\w"-]/.test(right.startsWith(marker) ? right.slice(1) : right)
    ? `${left} ${right}`
    : left + right

const concatAll = (parts: ReadonlyArray<string>): string => parts.reduce(concat, "")

const printDefinition = (definition: Ast.Definition): string => {
  switch (definition._tag) {
    case "OperationDefinition":
      return printOperation(definition)
    case "FragmentDefinition":
      return concatAll(["fragment", definition.name.value, printFragmentBody(definition, unmarked)])
    default:
      throw new Error(
        `@effect/graphql-generator: cannot print a ${definition._tag}; only executable documents are printed`
      )
  }
}

/** A fragment definition from its type condition on. */
const printFragmentBody = (definition: Ast.FragmentDefinition, marks: Marks): string =>
  concatAll([
    "on",
    definition.typeCondition.name.value,
    printDirectives(definition.directives, marks),
    printSelectionSet(definition.selectionSet, marks)
  ])

const printOperation = (operation: Ast.OperationDefinition): string => {
  const selectionSet = printSelectionSet(operation.selectionSet, unmarked)
  if (
    operation.operation === "query" &&
    operation.name === undefined &&
    operation.variableDefinitions.length === 0 &&
    operation.directives.length === 0
  ) {
    return selectionSet
  }
  return concatAll([
    operation.operation,
    operation.name === undefined ? "" : operation.name.value,
    operation.variableDefinitions.length === 0
      ? ""
      : `(${
        concatAll(
          operation.variableDefinitions.map((definition) =>
            `$${definition.variable.name.value}:${printVariableBody(definition)}`
          )
        )
      })`,
    printDirectives(operation.directives, unmarked),
    selectionSet
  ])
}

/** A variable definition after `$name:`. Default values and these directives are constant. */
const printVariableBody = (definition: Ast.VariableDefinition): string =>
  concatAll([
    printType(definition.type),
    definition.defaultValue === undefined ? "" : `=${printValue(definition.defaultValue, unmarked)}`,
    printDirectives(definition.directives, unmarked)
  ])

const printType = (type: Ast.Type): string => {
  switch (type._tag) {
    case "NamedType":
      return type.name.value
    case "ListType":
      return `[${printType(type.type)}]`
    case "NonNullType":
      return `${printType(type.type)}!`
  }
}

const printSelectionSet = (selectionSet: Ast.SelectionSet, marks: Marks): string =>
  `{${concatAll(selectionSet.selections.map((selection) => printSelection(selection, marks)))}}`

const printSelection = (selection: Ast.Selection, marks: Marks): string => {
  switch (selection._tag) {
    case "Field":
      return concatAll([
        selection.alias === undefined ? selection.name.value : `${selection.alias.value}:${selection.name.value}`,
        printFieldBody(selection, marks)
      ])
    case "FragmentSpread":
      return concatAll([
        `...${marks.fragments.has(selection.name.value) ? markName(selection.name.value) : selection.name.value}`,
        printDirectives(selection.directives, marks)
      ])
    case "InlineFragment":
      return concatAll([
        "...",
        selection.typeCondition === undefined ? "" : `on ${selection.typeCondition.name.value}`,
        printDirectives(selection.directives, marks),
        printSelectionSet(selection.selectionSet, marks)
      ])
  }
}

/** A field after its alias and name. */
const printFieldBody = (field: Ast.Field, marks: Marks): string =>
  concatAll([
    printArguments(field.arguments, marks),
    printDirectives(field.directives, marks),
    field.selectionSet === undefined ? "" : printSelectionSet(field.selectionSet, marks)
  ])

const printArguments = (args: ReadonlyArray<Ast.Argument>, marks: Marks): string =>
  args.length === 0
    ? ""
    : `(${concatAll(args.map((argument) => `${argument.name.value}:${printValue(argument.value, marks)}`))})`

const printDirectives = (directives: ReadonlyArray<Ast.Directive>, marks: Marks): string =>
  concatAll(directives.map((directive) => `@${directive.name.value}${printArguments(directive.arguments, marks)}`))

const printValue = (value: Ast.Value, marks: Marks): string => {
  switch (value._tag) {
    case "Variable":
      return `$${marks.variables ? markName(value.name.value) : value.name.value}`
    case "IntValue":
    case "FloatValue":
    case "EnumValue":
      return value.value
    case "StringValue":
      return printString(value.value)
    case "BooleanValue":
      return value.value ? "true" : "false"
    case "NullValue":
      return "null"
    case "ListValue":
      return `[${concatAll(value.values.map((item) => printValue(item, marks)))}]`
    case "ObjectValue":
      return `{${concatAll(value.fields.map((field) => `${field.name.value}:${printValue(field.value, marks)}`))}}`
  }
}

const escapes: ReadonlyMap<string, string> = new Map([
  ["\"", "\\\""],
  ["\\", "\\\\"],
  ["\b", "\\b"],
  ["\f", "\\f"],
  ["\n", "\\n"],
  ["\r", "\\r"],
  ["\t", "\\t"]
])

/** Prints a string value as a regular GraphQL string literal. */
const printString = (value: string): string => {
  let out = "\""
  for (let i = 0; i < value.length; i++) {
    const char = value[i]!
    const code = value.charCodeAt(i)
    out += escapes.get(char) ??
      (code < 0x0020 || code === 0x007f ? `\\u${code.toString(16).toUpperCase().padStart(4, "0")}` : char)
  }
  return out + "\""
}

/** Splits marked text into template parts: literal text at even indices, names at odd ones. */
const parts = (marked: string): ReadonlyArray<string> => marked.split(marker)

/**
 * Prints an operation and the fragments that follow it as a template.
 * Joining the template gives the same text as {@link print}.
 *
 * Variable references are names to rename, and so are spreads of per-slice
 * fragments: those that reference a variable, directly or through a fragment
 * they spread. Spreads of shared fragments stay literal.
 */
export const template = (
  operation: Ast.OperationDefinition,
  fragments: ReadonlyArray<Ast.FragmentDefinition>
): GraphQL.DocumentTemplate => {
  const perSlice = new Set<string>()
  const marks: Marks = { variables: true, fragments: perSlice }
  let changed = true
  while (changed) {
    changed = false
    for (const fragment of fragments) {
      if (!perSlice.has(fragment.name.value) && printFragmentBody(fragment, marks).includes(marker)) {
        perSlice.add(fragment.name.value)
        changed = true
      }
    }
  }
  const directives = printDirectives(operation.directives, marks)
  return {
    variables: operation.variableDefinitions.map((definition) => ({
      name: definition.variable.name.value,
      body: printVariableBody(definition)
    })),
    ...(directives === "" ? {} : { directives: parts(directives) }),
    selections: operation.selectionSet.selections.map((selection) =>
      selection._tag === "Field"
        ? {
          ...(selection.alias === undefined ? {} : { alias: selection.alias.value }),
          name: selection.name.value,
          body: parts(printFieldBody(selection, marks))
        }
        : { body: parts(printSelection(selection, marks)) }
    ),
    fragments: fragments.map((fragment) => ({
      name: fragment.name.value,
      body: parts(printFragmentBody(fragment, marks))
    }))
  }
}
