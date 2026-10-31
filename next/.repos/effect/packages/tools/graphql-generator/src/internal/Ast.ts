/**
 * GraphQL AST for the September 2025 executable and type-system grammar.
 * Node names follow graphql-js, with `_tag` discriminants.
 *
 * - Locations are UTF-16 offsets with exclusive ends.
 * - Absent lists are empty; absent children are `undefined`.
 * - Numbers retain source text; strings contain decoded values. Block-string
 *   syntax is not retained.
 *
 * @internal
 */

export interface Loc {
  readonly start: number
  readonly end: number
}

export interface Name {
  readonly _tag: "Name"
  readonly value: string
  readonly loc: Loc
}

export interface Document {
  readonly _tag: "Document"
  readonly definitions: ReadonlyArray<Definition>
  readonly loc: Loc
}

export type Definition = ExecutableDefinition | TypeSystemDefinition | TypeSystemExtension

// -----------------------------------------------------------------------------
// Executable definitions
// -----------------------------------------------------------------------------

export type ExecutableDefinition = OperationDefinition | FragmentDefinition

export type OperationType = "query" | "mutation" | "subscription"

export interface OperationDefinition {
  readonly _tag: "OperationDefinition"
  readonly description: StringValue | undefined
  readonly operation: OperationType
  readonly name: Name | undefined
  readonly variableDefinitions: ReadonlyArray<VariableDefinition>
  readonly directives: ReadonlyArray<Directive>
  readonly selectionSet: SelectionSet
  readonly loc: Loc
}

export interface VariableDefinition {
  readonly _tag: "VariableDefinition"
  readonly description: StringValue | undefined
  readonly variable: Variable
  readonly type: Type
  readonly defaultValue: ConstValue | undefined
  readonly directives: ReadonlyArray<ConstDirective>
  readonly loc: Loc
}

export interface SelectionSet {
  readonly _tag: "SelectionSet"
  readonly selections: ReadonlyArray<Selection>
  readonly loc: Loc
}

export type Selection = Field | FragmentSpread | InlineFragment

export interface Field {
  readonly _tag: "Field"
  readonly alias: Name | undefined
  readonly name: Name
  readonly arguments: ReadonlyArray<Argument>
  readonly directives: ReadonlyArray<Directive>
  readonly selectionSet: SelectionSet | undefined
  readonly loc: Loc
}

export interface Argument {
  readonly _tag: "Argument"
  readonly name: Name
  readonly value: Value
  readonly loc: Loc
}

export interface ConstArgument {
  readonly _tag: "Argument"
  readonly name: Name
  readonly value: ConstValue
  readonly loc: Loc
}

export interface FragmentSpread {
  readonly _tag: "FragmentSpread"
  readonly name: Name
  readonly directives: ReadonlyArray<Directive>
  readonly loc: Loc
}

export interface InlineFragment {
  readonly _tag: "InlineFragment"
  readonly typeCondition: NamedType | undefined
  readonly directives: ReadonlyArray<Directive>
  readonly selectionSet: SelectionSet
  readonly loc: Loc
}

export interface FragmentDefinition {
  readonly _tag: "FragmentDefinition"
  readonly description: StringValue | undefined
  readonly name: Name
  readonly typeCondition: NamedType
  readonly directives: ReadonlyArray<Directive>
  readonly selectionSet: SelectionSet
  readonly loc: Loc
}

// -----------------------------------------------------------------------------
// Values
// -----------------------------------------------------------------------------

export type Value =
  | Variable
  | IntValue
  | FloatValue
  | StringValue
  | BooleanValue
  | NullValue
  | EnumValue
  | ListValue
  | ObjectValue

/** A `Value[Const]`: no variables at any depth. */
export type ConstValue =
  | IntValue
  | FloatValue
  | StringValue
  | BooleanValue
  | NullValue
  | EnumValue
  | ConstListValue
  | ConstObjectValue

export interface Variable {
  readonly _tag: "Variable"
  readonly name: Name
  readonly loc: Loc
}

export interface IntValue {
  readonly _tag: "IntValue"
  readonly value: string
  readonly loc: Loc
}

export interface FloatValue {
  readonly _tag: "FloatValue"
  readonly value: string
  readonly loc: Loc
}

export interface StringValue {
  readonly _tag: "StringValue"
  readonly value: string
  readonly loc: Loc
}

export interface BooleanValue {
  readonly _tag: "BooleanValue"
  readonly value: boolean
  readonly loc: Loc
}

export interface NullValue {
  readonly _tag: "NullValue"
  readonly loc: Loc
}

export interface EnumValue {
  readonly _tag: "EnumValue"
  readonly value: string
  readonly loc: Loc
}

export interface ListValue {
  readonly _tag: "ListValue"
  readonly values: ReadonlyArray<Value>
  readonly loc: Loc
}

export interface ConstListValue {
  readonly _tag: "ListValue"
  readonly values: ReadonlyArray<ConstValue>
  readonly loc: Loc
}

export interface ObjectValue {
  readonly _tag: "ObjectValue"
  readonly fields: ReadonlyArray<ObjectField>
  readonly loc: Loc
}

export interface ConstObjectValue {
  readonly _tag: "ObjectValue"
  readonly fields: ReadonlyArray<ConstObjectField>
  readonly loc: Loc
}

export interface ObjectField {
  readonly _tag: "ObjectField"
  readonly name: Name
  readonly value: Value
  readonly loc: Loc
}

export interface ConstObjectField {
  readonly _tag: "ObjectField"
  readonly name: Name
  readonly value: ConstValue
  readonly loc: Loc
}

// -----------------------------------------------------------------------------
// Directives and types
// -----------------------------------------------------------------------------

export interface Directive {
  readonly _tag: "Directive"
  readonly name: Name
  readonly arguments: ReadonlyArray<Argument>
  readonly loc: Loc
}

export interface ConstDirective {
  readonly _tag: "Directive"
  readonly name: Name
  readonly arguments: ReadonlyArray<ConstArgument>
  readonly loc: Loc
}

export type Type = NamedType | ListType | NonNullType

export interface NamedType {
  readonly _tag: "NamedType"
  readonly name: Name
  readonly loc: Loc
}

export interface ListType {
  readonly _tag: "ListType"
  readonly type: Type
  readonly loc: Loc
}

export interface NonNullType {
  readonly _tag: "NonNullType"
  readonly type: NamedType | ListType
  readonly loc: Loc
}

// -----------------------------------------------------------------------------
// Type-system definitions
// -----------------------------------------------------------------------------

export type TypeSystemDefinition = SchemaDefinition | TypeDefinition | DirectiveDefinition

export type TypeDefinition =
  | ScalarTypeDefinition
  | ObjectTypeDefinition
  | InterfaceTypeDefinition
  | UnionTypeDefinition
  | EnumTypeDefinition
  | InputObjectTypeDefinition

export interface SchemaDefinition {
  readonly _tag: "SchemaDefinition"
  readonly description: StringValue | undefined
  readonly directives: ReadonlyArray<ConstDirective>
  readonly operationTypes: ReadonlyArray<OperationTypeDefinition>
  readonly loc: Loc
}

export interface OperationTypeDefinition {
  readonly _tag: "OperationTypeDefinition"
  readonly operation: OperationType
  readonly type: NamedType
  readonly loc: Loc
}

export interface ScalarTypeDefinition {
  readonly _tag: "ScalarTypeDefinition"
  readonly description: StringValue | undefined
  readonly name: Name
  readonly directives: ReadonlyArray<ConstDirective>
  readonly loc: Loc
}

export interface ObjectTypeDefinition {
  readonly _tag: "ObjectTypeDefinition"
  readonly description: StringValue | undefined
  readonly name: Name
  readonly interfaces: ReadonlyArray<NamedType>
  readonly directives: ReadonlyArray<ConstDirective>
  readonly fields: ReadonlyArray<FieldDefinition>
  readonly loc: Loc
}

export interface FieldDefinition {
  readonly _tag: "FieldDefinition"
  readonly description: StringValue | undefined
  readonly name: Name
  readonly arguments: ReadonlyArray<InputValueDefinition>
  readonly type: Type
  readonly directives: ReadonlyArray<ConstDirective>
  readonly loc: Loc
}

export interface InputValueDefinition {
  readonly _tag: "InputValueDefinition"
  readonly description: StringValue | undefined
  readonly name: Name
  readonly type: Type
  readonly defaultValue: ConstValue | undefined
  readonly directives: ReadonlyArray<ConstDirective>
  readonly loc: Loc
}

export interface InterfaceTypeDefinition {
  readonly _tag: "InterfaceTypeDefinition"
  readonly description: StringValue | undefined
  readonly name: Name
  readonly interfaces: ReadonlyArray<NamedType>
  readonly directives: ReadonlyArray<ConstDirective>
  readonly fields: ReadonlyArray<FieldDefinition>
  readonly loc: Loc
}

export interface UnionTypeDefinition {
  readonly _tag: "UnionTypeDefinition"
  readonly description: StringValue | undefined
  readonly name: Name
  readonly directives: ReadonlyArray<ConstDirective>
  readonly types: ReadonlyArray<NamedType>
  readonly loc: Loc
}

export interface EnumTypeDefinition {
  readonly _tag: "EnumTypeDefinition"
  readonly description: StringValue | undefined
  readonly name: Name
  readonly directives: ReadonlyArray<ConstDirective>
  readonly values: ReadonlyArray<EnumValueDefinition>
  readonly loc: Loc
}

export interface EnumValueDefinition {
  readonly _tag: "EnumValueDefinition"
  readonly description: StringValue | undefined
  readonly name: Name
  readonly directives: ReadonlyArray<ConstDirective>
  readonly loc: Loc
}

export interface InputObjectTypeDefinition {
  readonly _tag: "InputObjectTypeDefinition"
  readonly description: StringValue | undefined
  readonly name: Name
  readonly directives: ReadonlyArray<ConstDirective>
  readonly fields: ReadonlyArray<InputValueDefinition>
  readonly loc: Loc
}

export interface DirectiveDefinition {
  readonly _tag: "DirectiveDefinition"
  readonly description: StringValue | undefined
  readonly name: Name
  readonly arguments: ReadonlyArray<InputValueDefinition>
  readonly repeatable: boolean
  /** Spec `DirectiveLocation` names, e.g. `FIELD_DEFINITION`. */
  readonly locations: ReadonlyArray<Name>
  readonly loc: Loc
}

// -----------------------------------------------------------------------------
// Type-system extensions
// -----------------------------------------------------------------------------

export type TypeSystemExtension = SchemaExtension | TypeExtension

export type TypeExtension =
  | ScalarTypeExtension
  | ObjectTypeExtension
  | InterfaceTypeExtension
  | UnionTypeExtension
  | EnumTypeExtension
  | InputObjectTypeExtension

export interface SchemaExtension {
  readonly _tag: "SchemaExtension"
  readonly directives: ReadonlyArray<ConstDirective>
  readonly operationTypes: ReadonlyArray<OperationTypeDefinition>
  readonly loc: Loc
}

export interface ScalarTypeExtension {
  readonly _tag: "ScalarTypeExtension"
  readonly name: Name
  readonly directives: ReadonlyArray<ConstDirective>
  readonly loc: Loc
}

export interface ObjectTypeExtension {
  readonly _tag: "ObjectTypeExtension"
  readonly name: Name
  readonly interfaces: ReadonlyArray<NamedType>
  readonly directives: ReadonlyArray<ConstDirective>
  readonly fields: ReadonlyArray<FieldDefinition>
  readonly loc: Loc
}

export interface InterfaceTypeExtension {
  readonly _tag: "InterfaceTypeExtension"
  readonly name: Name
  readonly interfaces: ReadonlyArray<NamedType>
  readonly directives: ReadonlyArray<ConstDirective>
  readonly fields: ReadonlyArray<FieldDefinition>
  readonly loc: Loc
}

export interface UnionTypeExtension {
  readonly _tag: "UnionTypeExtension"
  readonly name: Name
  readonly directives: ReadonlyArray<ConstDirective>
  readonly types: ReadonlyArray<NamedType>
  readonly loc: Loc
}

export interface EnumTypeExtension {
  readonly _tag: "EnumTypeExtension"
  readonly name: Name
  readonly directives: ReadonlyArray<ConstDirective>
  readonly values: ReadonlyArray<EnumValueDefinition>
  readonly loc: Loc
}

export interface InputObjectTypeExtension {
  readonly _tag: "InputObjectTypeExtension"
  readonly name: Name
  readonly directives: ReadonlyArray<ConstDirective>
  readonly fields: ReadonlyArray<InputValueDefinition>
  readonly loc: Loc
}
