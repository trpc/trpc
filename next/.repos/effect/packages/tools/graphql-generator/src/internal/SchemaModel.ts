/**
 * Schema model shared by the SDL and introspection readers.
 *
 * - Names are strings; type references are chains ending in a name. No locations
 *   are retained. Absent optional values are `undefined`.
 * - Lists preserve declaration order, including extensions. Interface
 *   `possibleTypes` are sorted by name.
 * - The five built-in scalars are always present without descriptions.
 *   Introspection meta types and directive definitions are omitted.
 * - Applied directives are discarded after extracting `deprecationReason` and
 *   `oneOf`. A missing deprecation reason becomes `"No longer supported"`.
 * - Default values are parsed const values without locations.
 *
 * @internal
 */
import type * as Ast from "./Ast.ts"

export interface Schema {
  readonly queryType: string
  readonly mutationType: string | undefined
  readonly subscriptionType: string | undefined
  readonly types: ReadonlyMap<string, NamedType>
}

export type NamedType = ScalarType | ObjectType | InterfaceType | UnionType | EnumType | InputObjectType

export interface ScalarType {
  readonly _tag: "ScalarType"
  readonly name: string
  readonly description: string | undefined
}

export interface ObjectType {
  readonly _tag: "ObjectType"
  readonly name: string
  readonly description: string | undefined
  readonly interfaces: ReadonlyArray<string>
  readonly fields: ReadonlyArray<Field>
}

export interface InterfaceType {
  readonly _tag: "InterfaceType"
  readonly name: string
  readonly description: string | undefined
  readonly interfaces: ReadonlyArray<string>
  readonly fields: ReadonlyArray<Field>
  /** The object types implementing this interface, sorted by name. */
  readonly possibleTypes: ReadonlyArray<string>
}

export interface UnionType {
  readonly _tag: "UnionType"
  readonly name: string
  readonly description: string | undefined
  /** The member types in declaration order. */
  readonly possibleTypes: ReadonlyArray<string>
}

export interface EnumType {
  readonly _tag: "EnumType"
  readonly name: string
  readonly description: string | undefined
  readonly values: ReadonlyArray<EnumValueDefinition>
}

export interface InputObjectType {
  readonly _tag: "InputObjectType"
  readonly name: string
  readonly description: string | undefined
  readonly oneOf: boolean
  readonly fields: ReadonlyArray<InputValue>
}

export interface Field {
  readonly name: string
  readonly description: string | undefined
  readonly arguments: ReadonlyArray<InputValue>
  readonly type: TypeRef
  readonly deprecationReason: string | undefined
}

/** An argument, an input object field or a directive argument. */
export interface InputValue {
  readonly name: string
  readonly description: string | undefined
  readonly type: TypeRef
  readonly defaultValue: ConstValue | undefined
  readonly deprecationReason: string | undefined
}

export interface EnumValueDefinition {
  readonly name: string
  readonly description: string | undefined
  readonly deprecationReason: string | undefined
}

export type TypeRef = NamedTypeRef | ListTypeRef | NonNullTypeRef

export interface NamedTypeRef {
  readonly _tag: "NamedTypeRef"
  readonly name: string
}

export interface ListTypeRef {
  readonly _tag: "ListTypeRef"
  readonly ofType: TypeRef
}

export interface NonNullTypeRef {
  readonly _tag: "NonNullTypeRef"
  readonly ofType: NamedTypeRef | ListTypeRef
}

/**
 * A `Value[Const]` without locations. Tags and `value` encodings match the
 * parser's AST: numbers keep their source text, strings are decoded.
 */
export type ConstValue =
  | { readonly _tag: "IntValue"; readonly value: string }
  | { readonly _tag: "FloatValue"; readonly value: string }
  | { readonly _tag: "StringValue"; readonly value: string }
  | { readonly _tag: "BooleanValue"; readonly value: boolean }
  | { readonly _tag: "NullValue" }
  | { readonly _tag: "EnumValue"; readonly value: string }
  | { readonly _tag: "ListValue"; readonly values: ReadonlyArray<ConstValue> }
  | { readonly _tag: "ObjectValue"; readonly fields: ReadonlyArray<ConstObjectField> }

export interface ConstObjectField {
  readonly name: string
  readonly value: ConstValue
}

// -----------------------------------------------------------------------------
// Helpers shared by the readers and validation
// -----------------------------------------------------------------------------

/** The scalars every schema has, whether or not it declares them. */
export const builtInScalarNames: ReadonlyArray<string> = ["String", "Int", "Float", "Boolean", "ID"]

/** The reason `@deprecated` implies when it has none. */
export const defaultDeprecationReason = "No longer supported"

export const builtInScalar = (name: string): ScalarType => ({ _tag: "ScalarType", name, description: undefined })

/** Drops locations from a parsed const value. */
export const fromAstConstValue = (value: Ast.ConstValue): ConstValue => {
  switch (value._tag) {
    case "IntValue":
    case "FloatValue":
    case "StringValue":
    case "EnumValue":
      return { _tag: value._tag, value: value.value }
    case "BooleanValue":
      return { _tag: "BooleanValue", value: value.value }
    case "NullValue":
      return { _tag: "NullValue" }
    case "ListValue":
      return { _tag: "ListValue", values: value.values.map(fromAstConstValue) }
    case "ObjectValue":
      return {
        _tag: "ObjectValue",
        fields: value.fields.map((field) => ({ name: field.name.value, value: fromAstConstValue(field.value) }))
      }
  }
}

export const fromAstType = (type: Ast.Type): TypeRef => {
  switch (type._tag) {
    case "NamedType":
      return { _tag: "NamedTypeRef", name: type.name.value }
    case "ListType":
      return { _tag: "ListTypeRef", ofType: fromAstType(type.type) }
    case "NonNullType":
      return { _tag: "NonNullTypeRef", ofType: fromAstType(type.type) as NamedTypeRef | ListTypeRef }
  }
}

/** The root type an operation of `operation` kind selects from, if the schema configures one. */
export const rootTypeName = (schema: Schema, operation: Ast.OperationType): string | undefined => {
  switch (operation) {
    case "query":
      return schema.queryType
    case "mutation":
      return schema.mutationType
    case "subscription":
      return schema.subscriptionType
  }
}

/** The name at the bottom of a type reference. */
export const namedTypeOf = (type: TypeRef): string =>
  type._tag === "NamedTypeRef" ? type.name : namedTypeOf(type.ofType)

/** Prints a type reference in SDL form, e.g. `[Pet!]!`. */
export const printTypeRef = (type: TypeRef): string => {
  switch (type._tag) {
    case "NamedTypeRef":
      return type.name
    case "ListTypeRef":
      return `[${printTypeRef(type.ofType)}]`
    case "NonNullTypeRef":
      return `${printTypeRef(type.ofType)}!`
  }
}
