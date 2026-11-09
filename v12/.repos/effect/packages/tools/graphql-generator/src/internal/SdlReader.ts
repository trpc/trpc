/**
 * Builds a {@link SchemaModel.Schema} from a parsed type-system document.
 *
 * @internal
 */
import type * as Result from "effect/Result"
import type * as Ast from "./Ast.ts"
import { catchDiagnostic, type Diagnostic, make, type Source } from "./Diagnostic.ts"
import * as SchemaModel from "./SchemaModel.ts"

/**
 * Reads every definition and `extend` form in `document`, merging extensions
 * into their base definitions in document order. Root operation types come
 * from `schema { ... }` and `extend schema`, or default to the types named
 * `Query`, `Mutation` and `Subscription` when there is no schema definition.
 * Executable definitions are ignored.
 *
 * Fails with a diagnostic located in `source` when the document cannot form a
 * schema, e.g. it has no query root type or extends a type it never defines.
 * The server schema is not otherwise validated.
 */
export const read = (source: Source, document: Ast.Document): Result.Result<SchemaModel.Schema, Diagnostic> =>
  catchDiagnostic(() => build(source, document))

/** The definition each extension kind extends, and the word graphql-js uses for it. */
const extensionTargets: Record<Ast.TypeExtension["_tag"], readonly [Ast.TypeDefinition["_tag"], string]> = {
  ScalarTypeExtension: ["ScalarTypeDefinition", "scalar"],
  ObjectTypeExtension: ["ObjectTypeDefinition", "object"],
  InterfaceTypeExtension: ["InterfaceTypeDefinition", "interface"],
  UnionTypeExtension: ["UnionTypeDefinition", "union"],
  EnumTypeExtension: ["EnumTypeDefinition", "enum"],
  InputObjectTypeExtension: ["InputObjectTypeDefinition", "input object"]
}

const build = (source: Source, document: Ast.Document): SchemaModel.Schema => {
  const fail = (offset: number, message: string): never => {
    throw make(source, offset, message)
  }

  const definitions = new Map<string, Ast.TypeDefinition>()
  const extensions = new Map<string, Array<Ast.TypeExtension>>()
  let schemaDefinition: Ast.SchemaDefinition | undefined
  const schemaExtensions: Array<Ast.SchemaExtension> = []

  for (const definition of document.definitions) {
    switch (definition._tag) {
      case "OperationDefinition":
      case "FragmentDefinition":
      case "DirectiveDefinition":
        break

      case "SchemaDefinition":
        if (schemaDefinition !== undefined) fail(definition.loc.start, "Must provide only one schema definition.")
        schemaDefinition = definition
        break
      case "SchemaExtension":
        schemaExtensions.push(definition)
        break

      case "ScalarTypeExtension":
      case "ObjectTypeExtension":
      case "InterfaceTypeExtension":
      case "UnionTypeExtension":
      case "EnumTypeExtension":
      case "InputObjectTypeExtension": {
        const list = extensions.get(definition.name.value)
        if (list === undefined) extensions.set(definition.name.value, [definition])
        else list.push(definition)
        break
      }
      default: {
        const name = definition.name.value
        if (definitions.has(name)) fail(definition.name.loc.start, `There can be only one type named "${name}".`)
        definitions.set(name, definition)
      }
    }
  }

  for (const [name, list] of extensions) {
    const definition = definitions.get(name)
    for (const extension of list) {
      const [target, word] = extensionTargets[extension._tag]
      if (definition === undefined) {
        if (extension._tag === "ScalarTypeExtension" && SchemaModel.builtInScalarNames.includes(name)) continue
        fail(extension.name.loc.start, `Cannot extend type "${name}" because it is not defined.`)
      } else if (definition._tag !== target) {
        fail(extension.name.loc.start, `Cannot extend non-${word} type "${name}".`)
      }
    }
  }

  // Interface name -> implementing object types, for `possibleTypes`.
  const implementations = new Map<string, Array<string>>()
  for (const [name, definition] of definitions) {
    if (definition._tag !== "ObjectTypeDefinition") continue
    const parts = withExtensions(definition, extensions) as ReadonlyArray<
      Ast.ObjectTypeDefinition | Ast.ObjectTypeExtension
    >
    for (const part of parts) {
      for (const iface of part.interfaces) {
        const list = implementations.get(iface.name.value)
        if (list === undefined) implementations.set(iface.name.value, [name])
        else if (!list.includes(name)) list.push(name)
      }
    }
  }

  const types = new Map<string, SchemaModel.NamedType>()
  for (const name of SchemaModel.builtInScalarNames) types.set(name, SchemaModel.builtInScalar(name))
  for (const [name, definition] of definitions) {
    if (SchemaModel.builtInScalarNames.includes(name)) continue
    types.set(name, buildType(definition, extensions, implementations))
  }

  const defaultRoot = (name: string) => schemaDefinition === undefined && types.has(name) ? name : undefined
  const roots: Record<Ast.OperationType, string | undefined> = {
    query: defaultRoot("Query"),
    mutation: defaultRoot("Mutation"),
    subscription: defaultRoot("Subscription")
  }
  for (const part of schemaDefinition === undefined ? schemaExtensions : [schemaDefinition, ...schemaExtensions]) {
    for (const operationType of part.operationTypes) {
      roots[operationType.operation] = operationType.type.name.value
    }
  }
  if (roots.query === undefined) {
    return fail(schemaDefinition?.loc.start ?? 0, "Query root type must be provided.")
  }

  return {
    queryType: roots.query,
    mutationType: roots.mutation,
    subscriptionType: roots.subscription,
    types
  }
}

/** A definition followed by its extensions, which share the members being merged. */
const withExtensions = <D extends Ast.TypeDefinition>(
  definition: D,
  extensions: ReadonlyMap<string, ReadonlyArray<Ast.TypeExtension>>
): ReadonlyArray<D | Ast.TypeExtension> => [definition, ...(extensions.get(definition.name.value) ?? [])]

const buildType = (
  definition: Ast.TypeDefinition,
  extensions: ReadonlyMap<string, ReadonlyArray<Ast.TypeExtension>>,
  implementations: ReadonlyMap<string, ReadonlyArray<string>>
): SchemaModel.NamedType => {
  const name = definition.name.value
  const description = definition.description?.value
  // Each extension has already been checked to match its definition's kind.
  const parts = withExtensions(definition, extensions)
  switch (definition._tag) {
    case "ScalarTypeDefinition":
      return { _tag: "ScalarType", name, description }
    case "ObjectTypeDefinition":
    case "InterfaceTypeDefinition": {
      const objectParts = parts as ReadonlyArray<
        Ast.ObjectTypeDefinition | Ast.ObjectTypeExtension | Ast.InterfaceTypeDefinition | Ast.InterfaceTypeExtension
      >
      const interfaces = objectParts.flatMap((part) => part.interfaces.map((iface) => iface.name.value))
      const fields = objectParts.flatMap((part) => part.fields.map(buildField))
      return definition._tag === "ObjectTypeDefinition"
        ? { _tag: "ObjectType", name, description, interfaces, fields }
        : {
          _tag: "InterfaceType",
          name,
          description,
          interfaces,
          fields,
          possibleTypes: [...(implementations.get(name) ?? [])].sort()
        }
    }

    case "UnionTypeDefinition":
      return {
        _tag: "UnionType",
        name,
        description,
        possibleTypes: (parts as ReadonlyArray<Ast.UnionTypeDefinition | Ast.UnionTypeExtension>).flatMap((part) =>
          part.types.map((member) => member.name.value)
        )
      }
    case "EnumTypeDefinition":
      return {
        _tag: "EnumType",
        name,
        description,
        values: (parts as ReadonlyArray<Ast.EnumTypeDefinition | Ast.EnumTypeExtension>).flatMap((part) =>
          part.values.map((value) => ({
            name: value.name.value,
            description: value.description?.value,
            deprecationReason: deprecationReason(value.directives)
          }))
        )
      }
    case "InputObjectTypeDefinition":
      return {
        _tag: "InputObjectType",
        name,
        description,
        oneOf: parts.some((part) => findDirective(part.directives, "oneOf") !== undefined),

        fields: (parts as ReadonlyArray<Ast.InputObjectTypeDefinition | Ast.InputObjectTypeExtension>).flatMap((
          part
        ) => part.fields.map(buildInputValue))
      }
  }
}

const buildField = (field: Ast.FieldDefinition): SchemaModel.Field => ({
  name: field.name.value,
  description: field.description?.value,
  arguments: field.arguments.map(buildInputValue),
  type: SchemaModel.fromAstType(field.type),
  deprecationReason: deprecationReason(field.directives)
})

const buildInputValue = (value: Ast.InputValueDefinition): SchemaModel.InputValue => ({
  name: value.name.value,
  description: value.description?.value,
  type: SchemaModel.fromAstType(value.type),
  defaultValue: value.defaultValue === undefined ? undefined : SchemaModel.fromAstConstValue(value.defaultValue),
  deprecationReason: deprecationReason(value.directives)
})

const findDirective = (
  directives: ReadonlyArray<Ast.ConstDirective>,
  name: string
): Ast.ConstDirective | undefined => directives.find((directive) => directive.name.value === name)

const deprecationReason = (directives: ReadonlyArray<Ast.ConstDirective>): string | undefined => {
  const directive = findDirective(directives, "deprecated")
  if (directive === undefined) return undefined
  const reason = directive.arguments.find((argument) => argument.name.value === "reason")?.value
  return reason?._tag === "StringValue" ? reason.value : SchemaModel.defaultDeprecationReason
}
