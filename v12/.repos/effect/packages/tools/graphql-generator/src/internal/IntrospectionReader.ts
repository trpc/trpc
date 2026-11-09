/**
 * Builds a {@link SchemaModel.Schema} directly from introspection JSON,
 * without printing SDL and re-parsing it.
 *
 * @internal
 */
import * as Result from "effect/Result"
import { catchDiagnostic, type Diagnostic, make, type Source } from "./Diagnostic.ts"
import { parseConstValue } from "./Parser.ts"
import * as SchemaModel from "./SchemaModel.ts"

/**
 * Reads introspection JSON from `source.body`, accepting both `{ __schema }`
 * and `{ data: { __schema } }`. `defaultValue` strings go through
 * `Parser.parseConstValue`. The newer keys `isOneOf` and input value
 * `isDeprecated` / `deprecationReason` are optional and read as `false` /
 * absent when missing. `isDeprecated: true` with a `null` reason reads as
 * `"No longer supported"`.
 *
 * Fails with a diagnostic for `source.path` when the body is not JSON, has
 * neither shape, or a `defaultValue` does not parse.
 */
export const read = (source: Source): Result.Result<SchemaModel.Schema, Diagnostic> =>
  catchDiagnostic(() => new Reader(source).read())

type JsonObject = { readonly [key: string]: unknown }

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value)

class Reader {
  readonly source: Source

  constructor(source: Source) {
    this.source = source
  }

  /** Shape errors carry no position: the JSON has been parsed and offsets are gone. */
  fail(message: string, offset = 0): never {
    throw make(this.source, offset, message)
  }

  expected(path: string, what: string): never {
    return this.fail(`Invalid introspection result at ${path}: expected ${what}.`)
  }

  read(): SchemaModel.Schema {
    let json: unknown
    try {
      json = JSON.parse(this.source.body)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const position = /at position (\d+)/.exec(message)
      this.fail(`Invalid JSON: ${message}`, position === null ? 0 : Number(position[1]))
    }
    const schema = isObject(json) && isObject(json.__schema)
      ? json.__schema
      : isObject(json) && isObject(json.data) && isObject(json.data.__schema)
      ? json.data.__schema
      : this.fail("Expected an introspection result shaped as { __schema } or { data: { __schema } }.")

    const types = new Map<string, SchemaModel.NamedType>()
    this.objects(schema, "types", "__schema", (type, path) => {
      const name = this.string(type, "name", path)
      if (name.startsWith("__")) return
      types.set(
        name,
        SchemaModel.builtInScalarNames.includes(name)
          ? SchemaModel.builtInScalar(name)
          : this.namedType(type, name, path)
      )
    })
    for (const name of SchemaModel.builtInScalarNames) {
      if (!types.has(name)) types.set(name, SchemaModel.builtInScalar(name))
    }

    return {
      queryType: this.rootName(schema, "queryType") ?? this.expected("__schema.queryType", "an object"),
      mutationType: this.rootName(schema, "mutationType"),
      subscriptionType: this.rootName(schema, "subscriptionType"),
      types
    }
  }

  namedType(type: JsonObject, name: string, path: string): SchemaModel.NamedType {
    const description = this.optionalString(type, "description", path)
    const kind = this.string(type, "kind", path)
    switch (kind) {
      case "SCALAR":
        return { _tag: "ScalarType", name, description }

      case "OBJECT":
        return {
          _tag: "ObjectType",
          name,
          description,
          interfaces: this.typeNames(type, "interfaces", path),
          fields: this.fields(type, path)
        }
      case "INTERFACE":
        return {
          _tag: "InterfaceType",
          name,
          description,
          interfaces: type.interfaces == null ? [] : this.typeNames(type, "interfaces", path),
          fields: this.fields(type, path),
          possibleTypes: this.typeNames(type, "possibleTypes", path).sort()
        }
      case "UNION":
        return { _tag: "UnionType", name, description, possibleTypes: this.typeNames(type, "possibleTypes", path) }
      case "ENUM":
        return {
          _tag: "EnumType",
          name,
          description,
          values: this.objects(type, "enumValues", path, (value, valuePath) => ({
            name: this.string(value, "name", valuePath),
            description: this.optionalString(value, "description", valuePath),
            deprecationReason: this.deprecationReason(value, valuePath)
          }))
        }
      case "INPUT_OBJECT":
        return {
          _tag: "InputObjectType",
          name,
          description,
          oneOf: this.optionalBoolean(type, "isOneOf", path) ?? false,
          fields: this.inputValues(type, "inputFields", path)
        }
      default:
        return this.expected(`${path}.kind`, "a named type kind")
    }
  }

  fields(type: JsonObject, path: string): ReadonlyArray<SchemaModel.Field> {
    return this.objects(type, "fields", path, (field, fieldPath) => ({
      name: this.string(field, "name", fieldPath),
      description: this.optionalString(field, "description", fieldPath),
      arguments: this.inputValues(field, "args", fieldPath),
      type: this.typeRef(field.type, `${fieldPath}.type`),
      deprecationReason: this.deprecationReason(field, fieldPath)
    }))
  }

  inputValues(owner: JsonObject, key: string, path: string): ReadonlyArray<SchemaModel.InputValue> {
    return this.objects(owner, key, path, (inputValue, valuePath) => {
      const defaultValue = this.optionalString(inputValue, "defaultValue", valuePath)
      return {
        name: this.string(inputValue, "name", valuePath),
        description: this.optionalString(inputValue, "description", valuePath),
        type: this.typeRef(inputValue.type, `${valuePath}.type`),
        defaultValue: defaultValue === undefined
          ? undefined
          : this.constValue(defaultValue, `${valuePath}.defaultValue`),
        deprecationReason: this.deprecationReason(inputValue, valuePath)
      }
    })
  }

  constValue(body: string, path: string): SchemaModel.ConstValue {
    const result = parseConstValue({ path: this.source.path, body })
    if (Result.isFailure(result)) {
      return this.fail(`Invalid default value at ${path} (${JSON.stringify(body)}): ${result.failure.message}`)
    }
    return SchemaModel.fromAstConstValue(result.success)
  }

  typeRef(value: unknown, path: string): SchemaModel.TypeRef {
    const ref = this.object(value, path)
    const kind = this.string(ref, "kind", path)
    switch (kind) {
      case "NON_NULL": {
        const ofType = this.typeRef(ref.ofType, `${path}.ofType`)
        if (ofType._tag === "NonNullTypeRef") this.expected(`${path}.ofType`, "a nullable type")
        return { _tag: "NonNullTypeRef", ofType: ofType as SchemaModel.NamedTypeRef | SchemaModel.ListTypeRef }
      }
      case "LIST":
        return { _tag: "ListTypeRef", ofType: this.typeRef(ref.ofType, `${path}.ofType`) }
      default:
        return { _tag: "NamedTypeRef", name: this.string(ref, "name", path) }
    }
  }

  typeNames(owner: JsonObject, key: string, path: string): Array<string> {
    return this.objects(owner, key, path, (type, typePath) => this.string(type, "name", typePath))
  }

  rootName(schema: JsonObject, key: string): string | undefined {
    const root = schema[key]
    return root == null ? undefined : this.string(this.object(root, `__schema.${key}`), "name", `__schema.${key}`)
  }

  deprecationReason(owner: JsonObject, path: string): string | undefined {
    if (this.optionalBoolean(owner, "isDeprecated", path) !== true) return undefined
    return this.optionalString(owner, "deprecationReason", path) ?? SchemaModel.defaultDeprecationReason
  }

  // JSON accessors. `null` and a missing key both read as absent.

  object(value: unknown, path: string): JsonObject {
    return isObject(value) ? value : this.expected(path, "an object")
  }

  array(owner: JsonObject, key: string, path: string): ReadonlyArray<unknown> {
    const value = owner[key]
    return Array.isArray(value) ? value : this.expected(`${path}.${key}`, "an array")
  }

  /** Maps the array at `owner[key]`, whose elements must be objects, passing each element's path. */
  objects<A>(owner: JsonObject, key: string, path: string, f: (value: JsonObject, path: string) => A): Array<A> {
    return this.array(owner, key, path).map((value, i) => {
      const itemPath = `${path}.${key}[${i}]`
      return f(this.object(value, itemPath), itemPath)
    })
  }

  string(owner: JsonObject, key: string, path: string): string {
    const value = owner[key]
    return typeof value === "string" ? value : this.expected(`${path}.${key}`, "a string")
  }

  optionalString(owner: JsonObject, key: string, path: string): string | undefined {
    const value = owner[key]
    if (value == null) return undefined
    return typeof value === "string" ? value : this.expected(`${path}.${key}`, "a string or null")
  }

  optionalBoolean(owner: JsonObject, key: string, path: string): boolean | undefined {
    const value = owner[key]
    if (value == null) return undefined
    return typeof value === "boolean" ? value : this.expected(`${path}.${key}`, "a boolean or null")
  }
}
