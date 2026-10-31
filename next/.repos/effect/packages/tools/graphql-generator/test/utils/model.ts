/**
 * Helpers for the schema model tests: reading fixtures through either reader,
 * a structural model comparison that names the first differing type, and
 * builders for expected models.
 */
import * as IntrospectionReader from "@effect/graphql-generator/internal/IntrospectionReader"
import type * as Model from "@effect/graphql-generator/internal/SchemaModel"
import * as SdlReader from "@effect/graphql-generator/internal/SdlReader"
import { assert } from "@effect/vitest"
import * as Result from "effect/Result"
import { readFileSync } from "node:fs"
import { formatDiagnostic, parseOrThrow, source } from "./ast.ts"

export const fixture = (file: string): string => readFileSync(new URL(`../fixtures/${file}`, import.meta.url), "utf8")

export const readSdl = (body: string, path = "schema.graphql"): Model.Schema => {
  const result = SdlReader.read(source(body, path), parseOrThrow(body, path))
  if (Result.isFailure(result)) {
    throw new Error(`unexpected diagnostic: ${formatDiagnostic(result.failure)}`)
  }
  return result.success
}

export const readIntrospection = (body: string, path = "schema.json"): Model.Schema => {
  const result = IntrospectionReader.read(source(body, path))
  if (Result.isFailure(result)) {
    throw new Error(`unexpected diagnostic: ${formatDiagnostic(result.failure)}`)
  }
  return result.success
}

/** Maps become plain objects (so entry order is ignored) and `undefined` members are dropped. */
const normalize = (value: unknown): unknown => {
  if (value instanceof Map) {
    const out: Record<string, unknown> = {}
    for (const [key, child] of value) out[String(key)] = normalize(child)
    return out
  }
  if (Array.isArray(value)) return value.map(normalize)
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (child !== undefined) out[key] = normalize(child)
    }
    return out
  }
  return value
}

const sortedKeys = (a: ReadonlyMap<string, unknown>, b: ReadonlyMap<string, unknown>): ReadonlyArray<string> =>
  Array.from(new Set([...a.keys(), ...b.keys()])).sort()

/**
 * Compares two models structurally. Types are compared one at a time in name
 * order, so a failure names the first differing type instead of dumping both
 * schemas.
 */

export const assertModelsEqual = (actual: Model.Schema, expected: Model.Schema): void => {
  assert.deepStrictEqual(
    normalize({
      queryType: actual.queryType,
      mutationType: actual.mutationType,
      subscriptionType: actual.subscriptionType
    }),
    normalize({
      queryType: expected.queryType,
      mutationType: expected.mutationType,
      subscriptionType: expected.subscriptionType
    }),
    "models differ in their root operation types"
  )
  for (const name of sortedKeys(actual.types, expected.types)) {
    assert.deepStrictEqual(
      normalize(actual.types.get(name)),
      normalize(expected.types.get(name)),
      `models differ at type "${name}"`
    )
  }
}

/** Compares one named type of `model` with `expected`. */
export const assertType = (model: Model.Schema, expected: Model.NamedType): void => {
  assert.deepStrictEqual(
    normalize(model.types.get(expected.name)),
    normalize(expected),
    `type "${expected.name}" differs`
  )
}

// Expected-model builders. Optional members default to absent.

export const named = (name: string): Model.NamedTypeRef => ({ _tag: "NamedTypeRef", name })

export const list = (ofType: Model.TypeRef): Model.ListTypeRef => ({ _tag: "ListTypeRef", ofType })

export const nonNull = (ofType: Model.NamedTypeRef | Model.ListTypeRef): Model.NonNullTypeRef => ({
  _tag: "NonNullTypeRef",
  ofType
})

export const scalarType = (name: string, options: { readonly description?: string } = {}): Model.ScalarType => ({
  _tag: "ScalarType",
  name,
  description: options.description
})

const builtInScalars: ReadonlyArray<Model.ScalarType> = ["String", "Int", "Float", "Boolean", "ID"].map((
  name
) => scalarType(name))

export const objectType = (
  name: string,
  fields: ReadonlyArray<Model.Field>,
  options: { readonly description?: string; readonly interfaces?: ReadonlyArray<string> } = {}
): Model.ObjectType => ({
  _tag: "ObjectType",
  name,
  description: options.description,
  interfaces: options.interfaces ?? [],
  fields
})

export const interfaceType = (
  name: string,
  fields: ReadonlyArray<Model.Field>,
  options: {
    readonly description?: string
    readonly interfaces?: ReadonlyArray<string>
    readonly possibleTypes?: ReadonlyArray<string>
  } = {}
): Model.InterfaceType => ({
  _tag: "InterfaceType",
  name,
  description: options.description,
  interfaces: options.interfaces ?? [],
  fields,
  possibleTypes: options.possibleTypes ?? []
})

export const unionType = (
  name: string,
  possibleTypes: ReadonlyArray<string>,
  options: { readonly description?: string } = {}
): Model.UnionType => ({ _tag: "UnionType", name, description: options.description, possibleTypes })

export const enumType = (
  name: string,
  values: ReadonlyArray<Model.EnumValueDefinition>,
  options: { readonly description?: string } = {}
): Model.EnumType => ({ _tag: "EnumType", name, description: options.description, values })

export const enumValue = (
  name: string,
  options: { readonly description?: string; readonly deprecationReason?: string } = {}
): Model.EnumValueDefinition => ({
  name,
  description: options.description,
  deprecationReason: options.deprecationReason
})

export const inputObjectType = (
  name: string,
  fields: ReadonlyArray<Model.InputValue>,
  options: { readonly description?: string; readonly oneOf?: boolean } = {}
): Model.InputObjectType => ({
  _tag: "InputObjectType",
  name,
  description: options.description,
  oneOf: options.oneOf ?? false,
  fields
})

export const field = (
  name: string,
  type: Model.TypeRef,
  options: {
    readonly description?: string
    readonly arguments?: ReadonlyArray<Model.InputValue>
    readonly deprecationReason?: string
  } = {}
): Model.Field => ({
  name,
  description: options.description,
  arguments: options.arguments ?? [],
  type,
  deprecationReason: options.deprecationReason
})

export const inputValue = (
  name: string,
  type: Model.TypeRef,
  options: {
    readonly description?: string
    readonly defaultValue?: Model.ConstValue
    readonly deprecationReason?: string
  } = {}
): Model.InputValue => ({
  name,
  description: options.description,
  type,
  defaultValue: options.defaultValue,
  deprecationReason: options.deprecationReason
})

/** A complete expected schema; the built-in scalars are added for you. */
export const schema = (options: {
  readonly queryType: string
  readonly mutationType?: string
  readonly subscriptionType?: string
  readonly types: ReadonlyArray<Model.NamedType>
}): Model.Schema => ({
  queryType: options.queryType,
  mutationType: options.mutationType,
  subscriptionType: options.subscriptionType,
  types: new Map([...builtInScalars, ...options.types].map((type) => [type.name, type]))
})
