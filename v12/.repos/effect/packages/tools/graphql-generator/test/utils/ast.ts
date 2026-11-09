/**
 * Shared helpers for the language front-end tests.
 *
 * Expectations are written as `Plain` nodes: the AST without `loc`, with
 * `undefined` children omitted, so a test states only what the grammar says.
 */
import type * as Ast from "@effect/graphql-generator/internal/Ast"
import type { Diagnostic, Source } from "@effect/graphql-generator/internal/Diagnostic"
import { parse } from "@effect/graphql-generator/internal/Parser"
import { assert } from "@effect/vitest"
import * as Result from "effect/Result"

type OptionalKeys<T> = { [K in keyof T]-?: undefined extends T[K] ? K : never }[keyof T]

export type Plain<T> = T extends ReadonlyArray<infer U> ? ReadonlyArray<Plain<U>>
  : T extends object ?
      & { readonly [K in Exclude<keyof T, OptionalKeys<T> | "loc">]: Plain<T[K]> }
      & { readonly [K in Exclude<OptionalKeys<T>, "loc">]?: Plain<Exclude<T[K], undefined>> }
  : T

export const source = (body: string, path = "test.graphql"): Source => ({ path, body })

const strip = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(strip)
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (key === "loc" || child === undefined) continue
      out[key] = strip(child)
    }
    return out
  }
  return value
}

export const stripLoc = <T>(node: T): Plain<T> => strip(node) as Plain<T>

export const formatDiagnostic = (diagnostic: Diagnostic): string =>
  `${diagnostic.path}:${diagnostic.line}:${diagnostic.column} ${diagnostic.message}\n${diagnostic.codeFrame}`

export const parseOrThrow = (body: string, path?: string): Ast.Document => {
  const result = parse(source(body, path))
  if (Result.isFailure(result)) {
    throw new Error(`unexpected diagnostic: ${formatDiagnostic(result.failure)}`)
  }
  return result.success
}

export const assertDefinitions = (body: string, expected: ReadonlyArray<Plain<Ast.Definition>>): void => {
  assert.deepStrictEqual(stripLoc(parseOrThrow(body)).definitions, expected)
}

interface ExpectedDiagnostic {
  readonly line: number
  readonly column: number
  readonly message: string
}

export const assertDiagnostic = (
  body: string,
  expected: ExpectedDiagnostic,
  parser: (source: Source) => Result.Result<unknown, Diagnostic> = parse
): void => {
  const result = parser(source(body))
  if (Result.isSuccess(result)) {
    assert.fail(`expected a diagnostic for ${JSON.stringify(body)} but it parsed`)
  }
  const { column, line, message } = result.failure
  assert.deepStrictEqual({ line, column, message }, expected)
}

/** Parses `{ f(s: <literal>) }` and returns the argument's value node. */
export const argumentValue = (literal: string): Plain<Ast.Value> => {
  const document = parseOrThrow(`{ f(s: ${literal}) }`)
  const operation = document.definitions[0]
  assert(operation !== undefined && operation._tag === "OperationDefinition")
  const field = operation.selectionSet.selections[0]
  assert(field !== undefined && field._tag === "Field")
  const argument = field.arguments[0]
  assert(argument !== undefined)
  return stripLoc(argument.value)
}

/** The decoded value of a string literal placed in argument position. */
export const stringValue = (literal: string): string => {
  const value = argumentValue(literal)
  assert.strictEqual(value._tag, "StringValue")
  return (value as Plain<Ast.StringValue>).value
}

// Plain node builders for expectations.

export const name = (value: string): Plain<Ast.Name> => ({ _tag: "Name", value })

export const namedType = (value: string): Plain<Ast.NamedType> => ({ _tag: "NamedType", name: name(value) })

export const nonNull = (type: Plain<Ast.NamedType | Ast.ListType>): Plain<Ast.NonNullType> => ({
  _tag: "NonNullType",
  type
})

export const list = (type: Plain<Ast.Type>): Plain<Ast.ListType> => ({ _tag: "ListType", type })

export const str = (value: string): Plain<Ast.StringValue> => ({ _tag: "StringValue", value })

export const int = (value: string): Plain<Ast.IntValue> => ({ _tag: "IntValue", value })

export const argument = (argumentName: string, value: Plain<Ast.ConstValue>): Plain<Ast.ConstArgument> => ({
  _tag: "Argument",
  name: name(argumentName),
  value
})

export const directive = (
  directiveName: string,
  args: ReadonlyArray<Plain<Ast.ConstArgument>> = []
): Plain<Ast.ConstDirective> => ({ _tag: "Directive", name: name(directiveName), arguments: args })

export const inputValue = (
  valueName: string,
  type: Plain<Ast.Type>,
  options: {
    readonly description?: string
    readonly defaultValue?: Plain<Ast.ConstValue>
    readonly directives?: ReadonlyArray<Plain<Ast.ConstDirective>>
  } = {}
): Plain<Ast.InputValueDefinition> => ({
  _tag: "InputValueDefinition",
  ...(options.description === undefined ? {} : { description: str(options.description) }),
  name: name(valueName),
  type,
  ...(options.defaultValue === undefined ? {} : { defaultValue: options.defaultValue }),
  directives: options.directives ?? []
})

export const fieldDefinition = (
  fieldName: string,
  type: Plain<Ast.Type>,
  options: {
    readonly description?: string
    readonly arguments?: ReadonlyArray<Plain<Ast.InputValueDefinition>>
    readonly directives?: ReadonlyArray<Plain<Ast.ConstDirective>>
  } = {}
): Plain<Ast.FieldDefinition> => ({
  _tag: "FieldDefinition",
  ...(options.description === undefined ? {} : { description: str(options.description) }),
  name: name(fieldName),
  arguments: options.arguments ?? [],
  type,
  directives: options.directives ?? []
})
