/*
 * Adapted from graphql-js v16.14.2 (https://github.com/graphql/graphql-js,
 * `src/language/parser.ts`), distributed under the MIT License:
 *
 * Copyright (c) GraphQL Contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
/**
 * GraphQL parser: `Source` to {@link Ast.Document}, covering the full grammar
 * of the current spec edition (September 2025) for executable and type-system
 * documents. Recursive descent over {@link Lexer}; stops at the first error.
 *
 * Structure and messages follow graphql-js so disputes can be settled against
 * the reference implementation.
 *
 * @internal
 */
import type * as Result from "effect/Result"
import type * as Ast from "./Ast.ts"
import { catchDiagnostic, type Diagnostic, make, type Source } from "./Diagnostic.ts"
import { isPunctuatorKind, Lexer, type Token, type TokenKind } from "./Lexer.ts"

/**
 * Parses a complete document, executable or type-system. Fails with the first
 * lexical or syntactic error; there is no recovery.
 */
export const parse = (source: Source): Result.Result<Ast.Document, Diagnostic> =>
  catchDiagnostic(() => new Parser(source).parseDocument())

/**
 * Parses a single `Value[Const]` that spans the whole source, as found in
 * introspection `defaultValue` strings. Variables and trailing tokens are
 * errors.
 */
export const parseConstValue = (source: Source): Result.Result<Ast.ConstValue, Diagnostic> =>
  catchDiagnostic(() => {
    const parser = new Parser(source)
    parser.expectToken("<SOF>")
    const value = parser.parseValueLiteral(true)
    parser.expectToken("<EOF>")
    return value
  })

const directiveLocations: ReadonlySet<string> = new Set([
  "QUERY",
  "MUTATION",
  "SUBSCRIPTION",
  "FIELD",
  "FRAGMENT_DEFINITION",
  "FRAGMENT_SPREAD",
  "INLINE_FRAGMENT",
  "VARIABLE_DEFINITION",
  "SCHEMA",
  "SCALAR",
  "OBJECT",
  "FIELD_DEFINITION",
  "ARGUMENT_DEFINITION",
  "INTERFACE",
  "UNION",
  "ENUM",
  "ENUM_VALUE",
  "INPUT_OBJECT",
  "INPUT_FIELD_DEFINITION"
])

const describeKind = (kind: TokenKind): string => (isPunctuatorKind(kind) ? `"${kind}"` : kind)

const describeToken = (token: Token): string =>
  token.value === undefined ? describeKind(token.kind) : `${describeKind(token.kind)} "${token.value}"`

class Parser {
  readonly lexer: Lexer

  constructor(source: Source) {
    this.lexer = new Lexer(source)
  }

  // ---------------------------------------------------------------------------
  // Document
  // ---------------------------------------------------------------------------

  parseDocument(): Ast.Document {
    const start = this.lexer.token
    const definitions = this.many("<SOF>", () => this.parseDefinition(), "<EOF>")
    return { _tag: "Document", definitions, loc: this.loc(start) }
  }

  parseDefinition(): Ast.Definition {
    if (this.peek("{")) {
      return this.parseOperationDefinition()
    }
    // Many definitions begin with a description and need a lookahead.
    const hasDescription = this.peekDescription()
    const keywordToken = hasDescription ? this.lexer.lookahead() : this.lexer.token
    if (hasDescription && keywordToken.kind === "{") {
      throw this.fail(
        this.lexer.token.start,
        "Unexpected description, descriptions are not supported on shorthand queries."
      )
    }
    if (keywordToken.kind === "Name") {
      switch (keywordToken.value) {
        case "schema":
          return this.parseSchemaDefinition()
        case "scalar":
          return this.parseScalarTypeDefinition()
        case "type":
          return this.parseObjectTypeDefinition()
        case "interface":
          return this.parseInterfaceTypeDefinition()
        case "union":
          return this.parseUnionTypeDefinition()
        case "enum":
          return this.parseEnumTypeDefinition()
        case "input":
          return this.parseInputObjectTypeDefinition()
        case "directive":
          return this.parseDirectiveDefinition()
        case "query":
        case "mutation":
        case "subscription":
          return this.parseOperationDefinition()
        case "fragment":
          return this.parseFragmentDefinition()
      }
      if (hasDescription) {
        throw this.fail(
          this.lexer.token.start,
          "Unexpected description, only GraphQL definitions support descriptions."
        )
      }
      if (keywordToken.value === "extend") {
        return this.parseTypeSystemExtension()
      }
    }
    throw this.unexpected(keywordToken)
  }

  // ---------------------------------------------------------------------------
  // Executable definitions
  // ---------------------------------------------------------------------------

  parseOperationDefinition(): Ast.OperationDefinition {
    const start = this.lexer.token
    if (this.peek("{")) {
      return {
        _tag: "OperationDefinition",
        description: undefined,
        operation: "query",
        name: undefined,
        variableDefinitions: [],
        directives: [],
        selectionSet: this.parseSelectionSet(),
        loc: this.loc(start)
      }
    }
    const description = this.parseDescription()
    const operation = this.parseOperationType()
    const name = this.peek("Name") ? this.parseName() : undefined
    const variableDefinitions = this.optionalMany("(", () => this.parseVariableDefinition(), ")")
    const directives = this.parseDirectives(false)
    const selectionSet = this.parseSelectionSet()
    return {
      _tag: "OperationDefinition",
      description,
      operation,
      name,
      variableDefinitions,
      directives,
      selectionSet,
      loc: this.loc(start)
    }
  }

  parseOperationType(): Ast.OperationType {
    const token = this.expectToken("Name")
    switch (token.value) {
      case "query":
      case "mutation":
      case "subscription":
        return token.value
    }
    throw this.unexpected(token)
  }

  parseVariableDefinition(): Ast.VariableDefinition {
    const start = this.lexer.token
    const description = this.parseDescription()
    const variable = this.parseVariable()
    this.expectToken(":")
    const type = this.parseTypeReference()
    const defaultValue = this.expectOptionalToken("=") ? this.parseValueLiteral(true) : undefined
    const directives = this.parseDirectives(true)
    return { _tag: "VariableDefinition", description, variable, type, defaultValue, directives, loc: this.loc(start) }
  }

  parseVariable(): Ast.Variable {
    const start = this.lexer.token
    this.expectToken("$")
    const name = this.parseName()
    return { _tag: "Variable", name, loc: this.loc(start) }
  }

  parseSelectionSet(): Ast.SelectionSet {
    const start = this.lexer.token
    const selections = this.many("{", () => this.peek("...") ? this.parseFragment() : this.parseField(), "}")
    return { _tag: "SelectionSet", selections, loc: this.loc(start) }
  }

  parseField(): Ast.Field {
    const start = this.lexer.token
    const nameOrAlias = this.parseName()
    const alias = this.expectOptionalToken(":") ? nameOrAlias : undefined
    const name = alias === undefined ? nameOrAlias : this.parseName()
    const args = this.parseArguments(false)
    const directives = this.parseDirectives(false)
    const selectionSet = this.peek("{") ? this.parseSelectionSet() : undefined
    return { _tag: "Field", alias, name, arguments: args, directives, selectionSet, loc: this.loc(start) }
  }

  parseArguments(isConst: boolean): Array<Ast.Argument> {
    return this.optionalMany("(", () => this.parseArgument(isConst), ")")
  }

  parseArgument(isConst: boolean): Ast.Argument {
    const start = this.lexer.token
    const name = this.parseName()
    this.expectToken(":")
    const value = this.parseValueLiteral(isConst)
    return { _tag: "Argument", name, value, loc: this.loc(start) }
  }

  parseFragment(): Ast.FragmentSpread | Ast.InlineFragment {
    const start = this.lexer.token
    this.expectToken("...")
    const hasTypeCondition = this.expectOptionalKeyword("on")
    if (!hasTypeCondition && this.peek("Name")) {
      const name = this.parseFragmentName()
      const directives = this.parseDirectives(false)
      return { _tag: "FragmentSpread", name, directives, loc: this.loc(start) }
    }
    const typeCondition = hasTypeCondition ? this.parseNamedType() : undefined
    const directives = this.parseDirectives(false)
    const selectionSet = this.parseSelectionSet()
    return { _tag: "InlineFragment", typeCondition, directives, selectionSet, loc: this.loc(start) }
  }

  parseFragmentDefinition(): Ast.FragmentDefinition {
    const start = this.lexer.token
    const description = this.parseDescription()
    this.expectKeyword("fragment")
    const name = this.parseFragmentName()
    this.expectKeyword("on")
    const typeCondition = this.parseNamedType()
    const directives = this.parseDirectives(false)
    const selectionSet = this.parseSelectionSet()
    return {
      _tag: "FragmentDefinition",
      description,
      name,
      typeCondition,
      directives,
      selectionSet,
      loc: this.loc(start)
    }
  }

  parseFragmentName(): Ast.Name {
    if (this.lexer.token.value === "on") {
      throw this.unexpected()
    }
    return this.parseName()
  }

  // ---------------------------------------------------------------------------
  // Values
  // ---------------------------------------------------------------------------

  parseValueLiteral(isConst: true): Ast.ConstValue
  parseValueLiteral(isConst: boolean): Ast.Value
  parseValueLiteral(isConst: boolean): Ast.Value {
    const token = this.lexer.token
    switch (token.kind) {
      case "[":
        return this.parseList(isConst)
      case "{":
        return this.parseObject(isConst)
      case "Int":
        this.lexer.advance()
        return { _tag: "IntValue", value: token.value!, loc: this.loc(token) }
      case "Float":
        this.lexer.advance()
        return { _tag: "FloatValue", value: token.value!, loc: this.loc(token) }
      case "String":
      case "BlockString":
        return this.parseStringLiteral()
      case "Name":
        this.lexer.advance()
        switch (token.value) {
          case "true":
            return { _tag: "BooleanValue", value: true, loc: this.loc(token) }
          case "false":
            return { _tag: "BooleanValue", value: false, loc: this.loc(token) }
          case "null":
            return { _tag: "NullValue", loc: this.loc(token) }
          default:
            return { _tag: "EnumValue", value: token.value!, loc: this.loc(token) }
        }
      case "$":
        if (isConst) {
          this.expectToken("$")
          if (this.lexer.token.kind === "Name") {
            throw this.fail(token.start, `Unexpected variable "$${this.lexer.token.value}" in constant value.`)
          }
          throw this.unexpected(token)
        }
        return this.parseVariable()
      default:
        throw this.unexpected()
    }
  }

  parseStringLiteral(): Ast.StringValue {
    const token = this.lexer.token
    this.lexer.advance()
    return { _tag: "StringValue", value: token.value!, loc: this.loc(token) }
  }

  parseList(isConst: boolean): Ast.ListValue {
    const start = this.lexer.token
    const values = this.any("[", () => this.parseValueLiteral(isConst), "]")
    return { _tag: "ListValue", values, loc: this.loc(start) }
  }

  parseObject(isConst: boolean): Ast.ObjectValue {
    const start = this.lexer.token
    const fields = this.any("{", () => this.parseObjectField(isConst), "}")
    return { _tag: "ObjectValue", fields, loc: this.loc(start) }
  }

  parseObjectField(isConst: boolean): Ast.ObjectField {
    const start = this.lexer.token
    const name = this.parseName()
    this.expectToken(":")
    const value = this.parseValueLiteral(isConst)
    return { _tag: "ObjectField", name, value, loc: this.loc(start) }
  }

  // ---------------------------------------------------------------------------
  // Directives and types
  // ---------------------------------------------------------------------------

  parseDirectives(isConst: true): Array<Ast.ConstDirective>
  parseDirectives(isConst: boolean): Array<Ast.Directive>
  parseDirectives(isConst: boolean): Array<Ast.Directive> {
    const directives: Array<Ast.Directive> = []
    while (this.peek("@")) {
      directives.push(this.parseDirective(isConst))
    }
    return directives
  }

  parseDirective(isConst: boolean): Ast.Directive {
    const start = this.lexer.token
    this.expectToken("@")
    const name = this.parseName()
    const args = this.parseArguments(isConst)
    return { _tag: "Directive", name, arguments: args, loc: this.loc(start) }
  }

  parseTypeReference(): Ast.Type {
    const start = this.lexer.token
    let type: Ast.NamedType | Ast.ListType
    if (this.expectOptionalToken("[")) {
      const innerType = this.parseTypeReference()
      this.expectToken("]")
      type = { _tag: "ListType", type: innerType, loc: this.loc(start) }
    } else {
      type = this.parseNamedType()
    }
    if (this.expectOptionalToken("!")) {
      return { _tag: "NonNullType", type, loc: this.loc(start) }
    }
    return type
  }

  parseNamedType(): Ast.NamedType {
    const start = this.lexer.token
    const name = this.parseName()
    return { _tag: "NamedType", name, loc: this.loc(start) }
  }

  parseName(): Ast.Name {
    const token = this.expectToken("Name")
    return { _tag: "Name", value: token.value!, loc: this.loc(token) }
  }

  // ---------------------------------------------------------------------------
  // Type-system definitions
  // ---------------------------------------------------------------------------

  peekDescription(): boolean {
    return this.peek("String") || this.peek("BlockString")
  }

  parseDescription(): Ast.StringValue | undefined {
    return this.peekDescription() ? this.parseStringLiteral() : undefined
  }

  parseSchemaDefinition(): Ast.SchemaDefinition {
    const start = this.lexer.token
    const description = this.parseDescription()
    this.expectKeyword("schema")
    const directives = this.parseDirectives(true)
    const operationTypes = this.many("{", () => this.parseOperationTypeDefinition(), "}")
    return { _tag: "SchemaDefinition", description, directives, operationTypes, loc: this.loc(start) }
  }

  parseOperationTypeDefinition(): Ast.OperationTypeDefinition {
    const start = this.lexer.token
    const operation = this.parseOperationType()
    this.expectToken(":")
    const type = this.parseNamedType()
    return { _tag: "OperationTypeDefinition", operation, type, loc: this.loc(start) }
  }

  parseScalarTypeDefinition(): Ast.ScalarTypeDefinition {
    const start = this.lexer.token
    const description = this.parseDescription()
    this.expectKeyword("scalar")
    const name = this.parseName()
    const directives = this.parseDirectives(true)
    return { _tag: "ScalarTypeDefinition", description, name, directives, loc: this.loc(start) }
  }

  parseObjectTypeDefinition(): Ast.ObjectTypeDefinition {
    const start = this.lexer.token
    const description = this.parseDescription()
    this.expectKeyword("type")
    const name = this.parseName()
    const interfaces = this.parseImplementsInterfaces()
    const directives = this.parseDirectives(true)
    const fields = this.parseFieldsDefinition()
    return { _tag: "ObjectTypeDefinition", description, name, interfaces, directives, fields, loc: this.loc(start) }
  }

  parseImplementsInterfaces(): Array<Ast.NamedType> {
    return this.expectOptionalKeyword("implements") ? this.delimitedMany("&", () => this.parseNamedType()) : []
  }

  parseFieldsDefinition(): Array<Ast.FieldDefinition> {
    return this.optionalMany("{", () => this.parseFieldDefinition(), "}")
  }

  parseFieldDefinition(): Ast.FieldDefinition {
    const start = this.lexer.token
    const description = this.parseDescription()
    const name = this.parseName()
    const args = this.parseArgumentDefs()
    this.expectToken(":")
    const type = this.parseTypeReference()
    const directives = this.parseDirectives(true)
    return { _tag: "FieldDefinition", description, name, arguments: args, type, directives, loc: this.loc(start) }
  }

  parseArgumentDefs(): Array<Ast.InputValueDefinition> {
    return this.optionalMany("(", () => this.parseInputValueDef(), ")")
  }

  parseInputValueDef(): Ast.InputValueDefinition {
    const start = this.lexer.token
    const description = this.parseDescription()
    const name = this.parseName()
    this.expectToken(":")
    const type = this.parseTypeReference()
    const defaultValue = this.expectOptionalToken("=") ? this.parseValueLiteral(true) : undefined
    const directives = this.parseDirectives(true)
    return { _tag: "InputValueDefinition", description, name, type, defaultValue, directives, loc: this.loc(start) }
  }

  parseInterfaceTypeDefinition(): Ast.InterfaceTypeDefinition {
    const start = this.lexer.token
    const description = this.parseDescription()
    this.expectKeyword("interface")
    const name = this.parseName()
    const interfaces = this.parseImplementsInterfaces()
    const directives = this.parseDirectives(true)
    const fields = this.parseFieldsDefinition()
    return { _tag: "InterfaceTypeDefinition", description, name, interfaces, directives, fields, loc: this.loc(start) }
  }

  parseUnionTypeDefinition(): Ast.UnionTypeDefinition {
    const start = this.lexer.token
    const description = this.parseDescription()
    this.expectKeyword("union")
    const name = this.parseName()
    const directives = this.parseDirectives(true)
    const types = this.parseUnionMemberTypes()
    return { _tag: "UnionTypeDefinition", description, name, directives, types, loc: this.loc(start) }
  }

  parseUnionMemberTypes(): Array<Ast.NamedType> {
    return this.expectOptionalToken("=") ? this.delimitedMany("|", () => this.parseNamedType()) : []
  }

  parseEnumTypeDefinition(): Ast.EnumTypeDefinition {
    const start = this.lexer.token
    const description = this.parseDescription()
    this.expectKeyword("enum")
    const name = this.parseName()
    const directives = this.parseDirectives(true)
    const values = this.parseEnumValuesDefinition()
    return { _tag: "EnumTypeDefinition", description, name, directives, values, loc: this.loc(start) }
  }

  parseEnumValuesDefinition(): Array<Ast.EnumValueDefinition> {
    return this.optionalMany("{", () => this.parseEnumValueDefinition(), "}")
  }

  parseEnumValueDefinition(): Ast.EnumValueDefinition {
    const start = this.lexer.token
    const description = this.parseDescription()
    const name = this.parseEnumValueName()
    const directives = this.parseDirectives(true)
    return { _tag: "EnumValueDefinition", description, name, directives, loc: this.loc(start) }
  }

  parseEnumValueName(): Ast.Name {
    const token = this.lexer.token
    if (token.value === "true" || token.value === "false" || token.value === "null") {
      throw this.fail(token.start, `${describeToken(token)} is reserved and cannot be used for an enum value.`)
    }
    return this.parseName()
  }

  parseInputObjectTypeDefinition(): Ast.InputObjectTypeDefinition {
    const start = this.lexer.token
    const description = this.parseDescription()
    this.expectKeyword("input")
    const name = this.parseName()
    const directives = this.parseDirectives(true)
    const fields = this.parseInputFieldsDefinition()
    return { _tag: "InputObjectTypeDefinition", description, name, directives, fields, loc: this.loc(start) }
  }

  parseInputFieldsDefinition(): Array<Ast.InputValueDefinition> {
    return this.optionalMany("{", () => this.parseInputValueDef(), "}")
  }

  parseDirectiveDefinition(): Ast.DirectiveDefinition {
    const start = this.lexer.token
    const description = this.parseDescription()
    this.expectKeyword("directive")
    this.expectToken("@")
    const name = this.parseName()
    const args = this.parseArgumentDefs()
    const repeatable = this.expectOptionalKeyword("repeatable")
    this.expectKeyword("on")
    const locations = this.delimitedMany("|", () => this.parseDirectiveLocation())
    return {
      _tag: "DirectiveDefinition",
      description,
      name,
      arguments: args,
      repeatable,
      locations,
      loc: this.loc(start)
    }
  }

  parseDirectiveLocation(): Ast.Name {
    const start = this.lexer.token
    const name = this.parseName()
    if (directiveLocations.has(name.value)) {
      return name
    }
    throw this.unexpected(start)
  }

  // ---------------------------------------------------------------------------
  // Type-system extensions
  // ---------------------------------------------------------------------------

  parseTypeSystemExtension(): Ast.TypeSystemExtension {
    const keywordToken = this.lexer.lookahead()
    if (keywordToken.kind === "Name") {
      switch (keywordToken.value) {
        case "schema":
          return this.parseSchemaExtension()
        case "scalar":
          return this.parseScalarTypeExtension()
        case "type":
          return this.parseObjectTypeExtension()
        case "interface":
          return this.parseInterfaceTypeExtension()
        case "union":
          return this.parseUnionTypeExtension()
        case "enum":
          return this.parseEnumTypeExtension()
        case "input":
          return this.parseInputObjectTypeExtension()
      }
    }
    throw this.unexpected(keywordToken)
  }

  parseSchemaExtension(): Ast.SchemaExtension {
    const start = this.lexer.token
    this.expectKeyword("extend")
    this.expectKeyword("schema")
    const directives = this.parseDirectives(true)
    const operationTypes = this.optionalMany("{", () => this.parseOperationTypeDefinition(), "}")
    this.expectNonEmpty(directives, operationTypes)
    return { _tag: "SchemaExtension", directives, operationTypes, loc: this.loc(start) }
  }

  parseScalarTypeExtension(): Ast.ScalarTypeExtension {
    const start = this.lexer.token
    this.expectKeyword("extend")
    this.expectKeyword("scalar")
    const name = this.parseName()
    const directives = this.parseDirectives(true)
    this.expectNonEmpty(directives)
    return { _tag: "ScalarTypeExtension", name, directives, loc: this.loc(start) }
  }

  parseObjectTypeExtension(): Ast.ObjectTypeExtension {
    const start = this.lexer.token
    this.expectKeyword("extend")
    this.expectKeyword("type")
    const name = this.parseName()
    const interfaces = this.parseImplementsInterfaces()
    const directives = this.parseDirectives(true)
    const fields = this.parseFieldsDefinition()
    this.expectNonEmpty(interfaces, directives, fields)
    return { _tag: "ObjectTypeExtension", name, interfaces, directives, fields, loc: this.loc(start) }
  }

  parseInterfaceTypeExtension(): Ast.InterfaceTypeExtension {
    const start = this.lexer.token
    this.expectKeyword("extend")
    this.expectKeyword("interface")
    const name = this.parseName()
    const interfaces = this.parseImplementsInterfaces()
    const directives = this.parseDirectives(true)
    const fields = this.parseFieldsDefinition()
    this.expectNonEmpty(interfaces, directives, fields)
    return { _tag: "InterfaceTypeExtension", name, interfaces, directives, fields, loc: this.loc(start) }
  }

  parseUnionTypeExtension(): Ast.UnionTypeExtension {
    const start = this.lexer.token
    this.expectKeyword("extend")
    this.expectKeyword("union")
    const name = this.parseName()
    const directives = this.parseDirectives(true)
    const types = this.parseUnionMemberTypes()
    this.expectNonEmpty(directives, types)
    return { _tag: "UnionTypeExtension", name, directives, types, loc: this.loc(start) }
  }

  parseEnumTypeExtension(): Ast.EnumTypeExtension {
    const start = this.lexer.token
    this.expectKeyword("extend")
    this.expectKeyword("enum")
    const name = this.parseName()
    const directives = this.parseDirectives(true)
    const values = this.parseEnumValuesDefinition()
    this.expectNonEmpty(directives, values)
    return { _tag: "EnumTypeExtension", name, directives, values, loc: this.loc(start) }
  }

  parseInputObjectTypeExtension(): Ast.InputObjectTypeExtension {
    const start = this.lexer.token
    this.expectKeyword("extend")
    this.expectKeyword("input")
    const name = this.parseName()
    const directives = this.parseDirectives(true)
    const fields = this.parseInputFieldsDefinition()
    this.expectNonEmpty(directives, fields)
    return { _tag: "InputObjectTypeExtension", name, directives, fields, loc: this.loc(start) }
  }

  // ---------------------------------------------------------------------------
  // Core parsing utilities
  // ---------------------------------------------------------------------------

  loc(startToken: Token): Ast.Loc {
    return { start: startToken.start, end: this.lexer.lastToken.end }
  }

  peek(kind: TokenKind): boolean {
    return this.lexer.token.kind === kind
  }

  expectToken(kind: TokenKind): Token {
    const token = this.lexer.token
    if (this.expectOptionalToken(kind)) return token
    throw this.fail(token.start, `Expected ${describeKind(kind)}, found ${describeToken(token)}.`)
  }

  expectOptionalToken(kind: TokenKind): boolean {
    if (this.lexer.token.kind === kind) {
      this.lexer.advance()
      return true
    }
    return false
  }

  expectKeyword(value: string): void {
    if (!this.expectOptionalKeyword(value)) {
      throw this.fail(this.lexer.token.start, `Expected "${value}", found ${describeToken(this.lexer.token)}.`)
    }
  }

  expectOptionalKeyword(value: string): boolean {
    const token = this.lexer.token
    if (token.kind === "Name" && token.value === value) {
      this.lexer.advance()
      return true
    }
    return false
  }

  /** An extension must add something; fails at the current token otherwise. */
  expectNonEmpty(...lists: ReadonlyArray<ReadonlyArray<unknown>>): void {
    if (lists.every((list) => list.length === 0)) {
      throw this.unexpected()
    }
  }

  unexpected(atToken: Token = this.lexer.token): Diagnostic {
    return this.fail(atToken.start, `Unexpected ${describeToken(atToken)}.`)
  }

  fail(offset: number, message: string): Diagnostic {
    return make(this.lexer.source, offset, message)
  }

  /** `open item* close`: zero or more items between the delimiters. */
  any<A>(open: TokenKind, parseItem: () => A, close: TokenKind): Array<A> {
    this.expectToken(open)
    const nodes: Array<A> = []
    while (!this.expectOptionalToken(close)) {
      nodes.push(parseItem())
    }
    return nodes
  }

  /** `(open item+ close)?`: one or more items when the opener is present, otherwise nothing. */
  optionalMany<A>(open: TokenKind, parseItem: () => A, close: TokenKind): Array<A> {
    return this.peek(open) ? this.many(open, parseItem, close) : []
  }

  /** `open item+ close`: one or more items between the delimiters. */
  many<A>(open: TokenKind, parseItem: () => A, close: TokenKind): Array<A> {
    this.expectToken(open)
    const nodes: Array<A> = []
    do {
      nodes.push(parseItem())
    } while (!this.expectOptionalToken(close))
    return nodes
  }

  /** `delimiter? item (delimiter item)*`: one or more delimited items with an optional leading delimiter. */
  delimitedMany<A>(delimiter: TokenKind, parseItem: () => A): Array<A> {
    this.expectOptionalToken(delimiter)
    const nodes: Array<A> = []
    do {
      nodes.push(parseItem())
    } while (this.expectOptionalToken(delimiter))
    return nodes
  }
}
