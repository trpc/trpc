import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import ts from "typescript-compiler"
import { Discovery, type DiscoveryResult } from "./Discovery.ts"
import { ApiDiffError } from "./Error.ts"
import { fingerprint, stableJson } from "./Json.ts"
import { SnapshotDiagnostic as SnapshotDiagnosticSchema } from "./Model.ts"
import type {
  ApiEntity,
  ApiSnapshot,
  Bucket,
  DeclarationModel,
  Documentation,
  Entrypoint,
  ImportRoute,
  ParameterModel,
  SnapshotDiagnostic,
  SourceLocation,
  TypeModel,
  TypeParameterModel
} from "./Model.ts"

interface SerializationContext {
  readonly checker: ts.TypeChecker
  readonly path: Path.Path
  readonly repoRoot: string
  readonly typeParameters: ReadonlyMap<string, string>
  readonly publicSymbols: ReadonlyMap<string, string>
}

const normalizedPath = (path: Path.Path, root: string, location: string): string =>
  path.relative(root, location).split(path.sep).join("/")

const sourceLocation = (path: Path.Path, root: string, node: ts.Node): SourceLocation => {
  const source = node.getSourceFile()
  const position = source.getLineAndCharacterOfPosition(node.getStart(source, false))
  return {
    file: normalizedPath(path, root, source.fileName),
    line: position.line + 1,
    column: position.character + 1
  }
}

const modifiers = (node: ts.Node): ReadonlyArray<string> | undefined => {
  if (!ts.canHaveModifiers(node)) {
    return undefined
  }
  const values = ts.getModifiers(node)?.map((modifier) =>
    ts.tokenToString(modifier.kind) ?? ts.SyntaxKind[modifier.kind]
  )
    .filter((modifier) => modifier !== "export" && modifier !== "declare")
    .sort()
  return values === undefined || values.length === 0 ? undefined : values
}

const nameText = (name: ts.DeclarationName | ts.BindingName | undefined): string => {
  if (name === undefined) {
    return "<anonymous>"
  }
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) {
    return name.text
  }
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text
  }
  return name.getText()
}

const sortModels = (values: ReadonlyArray<TypeModel>): ReadonlyArray<TypeModel> =>
  [...values].sort((left, right) => stableJson(left).localeCompare(stableJson(right)))

const referenceResolution = (name: ts.EntityName, context: SerializationContext): unknown => {
  let symbol = context.checker.getSymbolAtLocation(name)
  if (symbol === undefined) {
    return { unresolved: true }
  }
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    symbol = context.checker.getAliasedSymbol(symbol)
  }
  const declaration = symbol?.declarations?.[0]
  if (declaration === undefined) {
    return { unresolved: true }
  }
  const publicApiId = context.publicSymbols.get(symbolIdentity(symbol, "type")) ??
    context.publicSymbols.get(symbolIdentity(symbol, "value"))
  if (publicApiId !== undefined) {
    return { apiId: publicApiId }
  }
  const file = declaration.getSourceFile().fileName
  const separator = context.path.sep
  const nodeModules = file.lastIndexOf(`${separator}node_modules${separator}`)
  if (nodeModules !== -1) {
    const remainder = file.slice(nodeModules + `${separator}node_modules${separator}`.length).split(separator)
    return {
      externalPackage: remainder[0]?.startsWith("@") ? remainder.slice(0, 2).join("/") : remainder[0]
    }
  }
  return { declaration: normalizedPath(context.path, context.repoRoot, file) }
}

const primitiveKinds = new Map<ts.SyntaxKind, string>([
  [ts.SyntaxKind.AnyKeyword, "any"],
  [ts.SyntaxKind.BigIntKeyword, "bigint"],
  [ts.SyntaxKind.BooleanKeyword, "boolean"],
  [ts.SyntaxKind.IntrinsicKeyword, "intrinsic"],
  [ts.SyntaxKind.NeverKeyword, "never"],
  [ts.SyntaxKind.NumberKeyword, "number"],
  [ts.SyntaxKind.ObjectKeyword, "object"],
  [ts.SyntaxKind.StringKeyword, "string"],
  [ts.SyntaxKind.SymbolKeyword, "symbol"],
  [ts.SyntaxKind.UndefinedKeyword, "undefined"],
  [ts.SyntaxKind.UnknownKeyword, "unknown"],
  [ts.SyntaxKind.VoidKeyword, "void"]
])

const serializeTypeParameters = (
  nodes: ts.NodeArray<ts.TypeParameterDeclaration> | undefined,
  context: SerializationContext
): { readonly parameters?: ReadonlyArray<TypeParameterModel>; readonly context: SerializationContext } => {
  if (nodes === undefined || nodes.length === 0) {
    return { context }
  }
  const names = new Map(context.typeParameters)
  nodes.forEach((node, index) => names.set(node.name.text, `T${index}`))
  const next = { ...context, typeParameters: names }
  return {
    context: next,
    parameters: nodes.map((node, index) => ({
      id: `T${index}`,
      displayName: node.name.text,
      constraint: node.constraint === undefined ? undefined : serializeType(node.constraint, next),
      default: node.default === undefined ? undefined : serializeType(node.default, next)
    }))
  }
}

const serializeParameters = (
  nodes: ts.NodeArray<ts.ParameterDeclaration>,
  context: SerializationContext
): ReadonlyArray<ParameterModel> =>
  nodes.map((node) => ({
    name: nameText(node.name),
    type: node.type === undefined ? { kind: "unknown" } : serializeType(node.type, context),
    optional: node.questionToken !== undefined || node.initializer !== undefined,
    rest: node.dotDotDotToken !== undefined,
    modifiers: modifiers(node)
  }))

const serializeSignature = (
  node: ts.SignatureDeclarationBase,
  context: SerializationContext,
  kind: string,
  name = "<call>"
): DeclarationModel => {
  const generic = serializeTypeParameters(node.typeParameters, context)
  return {
    kind,
    name,
    typeParameters: generic.parameters,
    parameters: serializeParameters(node.parameters, generic.context),
    returnType: node.type === undefined ? { kind: "unknown" } : serializeType(node.type, generic.context),
    modifiers: modifiers(node)
  }
}

const serializeTypeMember = (node: ts.TypeElement, context: SerializationContext): DeclarationModel => {
  if (ts.isPropertySignature(node)) {
    return {
      kind: "property",
      name: nameText(node.name),
      type: node.type === undefined ? { kind: "unknown" } : serializeType(node.type, context),
      modifiers: [
        ...(modifiers(node) ?? []),
        ...(node.questionToken === undefined ? [] : ["optional"])
      ].sort()
    }
  }
  if (ts.isMethodSignature(node)) {
    return {
      ...serializeSignature(node, context, "method", nameText(node.name)),
      modifiers: [
        ...(modifiers(node) ?? []),
        ...(node.questionToken === undefined ? [] : ["optional"])
      ].sort()
    }
  }
  if (ts.isCallSignatureDeclaration(node)) {
    return serializeSignature(node, context, "call-signature")
  }
  if (ts.isConstructSignatureDeclaration(node)) {
    return serializeSignature(node, context, "construct-signature")
  }
  if (ts.isIndexSignatureDeclaration(node)) {
    return serializeSignature(node, context, "index-signature")
  }
  if (ts.isGetAccessorDeclaration(node)) {
    return serializeSignature(node, context, "getter", nameText(node.name))
  }
  if (ts.isSetAccessorDeclaration(node)) {
    return serializeSignature(node, context, "setter", nameText(node.name))
  }
  throw new Error(`Unsupported public type member: ${ts.SyntaxKind[node.kind]}`)
}

const serializeObjectMembers = (
  members: ts.NodeArray<ts.TypeElement>,
  context: SerializationContext
): ReadonlyArray<DeclarationModel> =>
  members.map((member) => serializeTypeMember(member, context))
    .sort((left, right) =>
      `${left.kind}:${left.name}:${stableJson(left)}`.localeCompare(
        `${right.kind}:${right.name}:${stableJson(right)}`
      )
    )

export const serializeType = (node: ts.TypeNode, context: SerializationContext): TypeModel => {
  const primitive = primitiveKinds.get(node.kind)
  if (primitive !== undefined) {
    return { kind: "primitive", name: primitive }
  }
  if (ts.isParenthesizedTypeNode(node)) {
    return serializeType(node.type, context)
  }
  if (ts.isLiteralTypeNode(node)) {
    const literal = node.literal
    const operand = ts.isPrefixUnaryExpression(literal) ? literal.operand : literal
    return {
      kind: "literal",
      literalKind: ts.isStringLiteralLike(operand)
        ? "string"
        : ts.isNumericLiteral(operand)
        ? "number"
        : ts.isBigIntLiteral(operand)
        ? "bigint"
        : operand.kind === ts.SyntaxKind.NullKeyword
        ? "null"
        : "boolean",
      value: literal.kind === ts.SyntaxKind.TrueKeyword
        ? true
        : literal.kind === ts.SyntaxKind.FalseKeyword
        ? false
        : ts.isPrefixUnaryExpression(literal)
        ? literal.getText()
        : Reflect.get(literal, "text") ?? literal.getText()
    }
  }
  if (ts.isTypeReferenceNode(node)) {
    const rawName = node.typeName.getText()
    const genericId = context.typeParameters.get(rawName)
    if (genericId !== undefined) {
      return { kind: "type-parameter", id: genericId, displayName: rawName }
    }
    return {
      kind: "reference",
      name: rawName,
      arguments: node.typeArguments?.map((argument) => serializeType(argument, context)) ?? [],
      resolution: referenceResolution(node.typeName, context)
    }
  }
  if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
    return {
      kind: ts.isUnionTypeNode(node) ? "union" : "intersection",
      members: sortModels(node.types.map((type) => serializeType(type, context)))
    }
  }
  if (ts.isArrayTypeNode(node)) {
    return { kind: "array", element: serializeType(node.elementType, context) }
  }
  if (ts.isTupleTypeNode(node)) {
    return { kind: "tuple", elements: node.elements.map((element) => serializeType(element, context)) }
  }
  if (ts.isNamedTupleMember(node)) {
    return {
      kind: "named-tuple-member",
      name: node.name.text,
      optional: node.questionToken !== undefined,
      rest: node.dotDotDotToken !== undefined,
      type: serializeType(node.type, context)
    }
  }
  if (ts.isOptionalTypeNode(node)) {
    return { kind: "optional", type: serializeType(node.type, context) }
  }
  if (ts.isRestTypeNode(node)) {
    return { kind: "rest", type: serializeType(node.type, context) }
  }
  if (ts.isFunctionTypeNode(node) || ts.isConstructorTypeNode(node)) {
    return {
      kind: ts.isFunctionTypeNode(node) ? "function" : "constructor",
      signature: serializeSignature(node, context, "signature")
    }
  }
  if (ts.isTypeLiteralNode(node)) {
    return { kind: "object", members: serializeObjectMembers(node.members, context) }
  }
  if (ts.isMappedTypeNode(node)) {
    const generic = serializeTypeParameters(ts.factory.createNodeArray([node.typeParameter]), context)
    return {
      kind: "mapped",
      typeParameter: generic.parameters?.[0],
      readonly: node.readonlyToken?.kind === ts.SyntaxKind.MinusToken
        ? "remove"
        : node.readonlyToken === undefined
        ? "none"
        : "add",
      optional: node.questionToken?.kind === ts.SyntaxKind.MinusToken
        ? "remove"
        : node.questionToken === undefined
        ? "none"
        : "add",
      nameType: node.nameType === undefined ? undefined : serializeType(node.nameType, generic.context),
      type: node.type === undefined ? undefined : serializeType(node.type, generic.context)
    }
  }
  if (ts.isConditionalTypeNode(node)) {
    return {
      kind: "conditional",
      check: serializeType(node.checkType, context),
      extends: serializeType(node.extendsType, context),
      trueType: serializeType(node.trueType, context),
      falseType: serializeType(node.falseType, context)
    }
  }
  if (ts.isIndexedAccessTypeNode(node)) {
    return {
      kind: "indexed-access",
      object: serializeType(node.objectType, context),
      index: serializeType(node.indexType, context)
    }
  }
  if (ts.isTypeOperatorNode(node)) {
    return {
      kind: "operator",
      operator: ts.tokenToString(node.operator) ?? ts.SyntaxKind[node.operator],
      type: serializeType(node.type, context)
    }
  }
  if (ts.isTypeQueryNode(node)) {
    return { kind: "type-query", expression: node.exprName.getText() }
  }
  if (ts.isImportTypeNode(node)) {
    const argument = node.argument.getText().replace(/^["']|["']$/g, "")
    const parts = argument.split("/")
    return {
      kind: "import",
      argument,
      externalPackage: argument.startsWith(".")
        ? undefined
        : parts[0]?.startsWith("@")
        ? parts.slice(0, 2).join("/")
        : parts[0],
      qualifier: node.qualifier?.getText(),
      attributes: node.attributes?.getText(),
      arguments: node.typeArguments?.map((argument) => serializeType(argument, context)) ?? [],
      typeof: node.isTypeOf
    }
  }
  if (ts.isTemplateLiteralTypeNode(node)) {
    return {
      kind: "template-literal",
      head: node.head.text,
      spans: node.templateSpans.map((span) => ({
        type: serializeType(span.type, context),
        literal: span.literal.text
      }))
    }
  }
  if (ts.isInferTypeNode(node)) {
    const generic = serializeTypeParameters(ts.factory.createNodeArray([node.typeParameter]), context)
    return { kind: "infer", typeParameter: generic.parameters?.[0] }
  }
  if (ts.isTypePredicateNode(node)) {
    return {
      kind: "predicate",
      asserts: node.assertsModifier !== undefined,
      parameter: node.parameterName.getText(),
      type: node.type === undefined ? undefined : serializeType(node.type, context)
    }
  }
  if (ts.isExpressionWithTypeArguments(node)) {
    return {
      kind: "heritage-reference",
      name: node.expression.getText(),
      arguments: node.typeArguments?.map((argument) => serializeType(argument, context)) ?? []
    }
  }
  if (node.kind === ts.SyntaxKind.ThisType) {
    return { kind: "this" }
  }
  throw new Error(`Unsupported public type syntax: ${ts.SyntaxKind[node.kind]}`)
}

const serializeClassMember = (
  node: ts.ClassElement,
  context: SerializationContext
): DeclarationModel | undefined => {
  const visibility = modifiers(node)
  if (visibility?.includes("private")) {
    return undefined
  }
  if (ts.isPropertyDeclaration(node)) {
    return {
      kind: "property",
      name: nameText(node.name),
      type: node.type === undefined ? { kind: "unknown" } : serializeType(node.type, context),
      modifiers: node.questionToken === undefined ? visibility : [...(visibility ?? []), "optional"].sort()
    }
  }
  if (ts.isMethodDeclaration(node)) {
    return {
      ...serializeSignature(node, context, "method", nameText(node.name)),
      modifiers: node.questionToken === undefined ? visibility : [...(visibility ?? []), "optional"].sort()
    }
  }
  if (ts.isConstructorDeclaration(node)) {
    return serializeSignature(node, context, "constructor", "constructor")
  }
  if (ts.isGetAccessorDeclaration(node)) {
    return serializeSignature(node, context, "getter", nameText(node.name))
  }
  if (ts.isSetAccessorDeclaration(node)) {
    return serializeSignature(node, context, "setter", nameText(node.name))
  }
  if (ts.isIndexSignatureDeclaration(node)) {
    return serializeSignature(node, context, "index-signature")
  }
  if (ts.isClassStaticBlockDeclaration(node) || ts.isSemicolonClassElement(node)) {
    return undefined
  }
  throw new Error(`Unsupported public class member: ${ts.SyntaxKind[node.kind]}`)
}

const serializeHeritage = (
  clauses: ts.NodeArray<ts.HeritageClause> | undefined,
  context: SerializationContext
): ReadonlyArray<TypeModel> | undefined => {
  if (clauses === undefined) {
    return undefined
  }
  return clauses.flatMap((clause) =>
    clause.types.map((type) => ({
      ...serializeType(type, context),
      clause: ts.tokenToString(clause.token) ?? ts.SyntaxKind[clause.token]
    }))
  ).sort((left, right) => stableJson(left).localeCompare(stableJson(right)))
}

const moduleMembers = (
  node: ts.ModuleDeclaration,
  context: SerializationContext
): ReadonlyArray<DeclarationModel> => {
  let body = node.body
  while (body !== undefined && ts.isModuleDeclaration(body)) {
    body = body.body
  }
  if (body === undefined || !ts.isModuleBlock(body)) {
    return []
  }
  return body.statements.flatMap((statement) => {
    if (
      ts.isFunctionDeclaration(statement) || ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) || ts.isClassDeclaration(statement) ||
      ts.isEnumDeclaration(statement) || ts.isModuleDeclaration(statement) ||
      ts.isVariableStatement(statement)
    ) {
      if (ts.isVariableStatement(statement)) {
        return statement.declarationList.declarations.map((declaration) => serializeDeclaration(declaration, context))
      }
      return [serializeDeclaration(statement, context)]
    }
    if (ts.isExportDeclaration(statement) || ts.isImportDeclaration(statement)) {
      return []
    }
    throw new Error(`Unsupported public namespace statement: ${ts.SyntaxKind[statement.kind]}`)
  }).sort((left, right) => `${left.kind}:${left.name}`.localeCompare(`${right.kind}:${right.name}`))
}

const serializeDeclaration = (node: ts.Declaration, context: SerializationContext): DeclarationModel => {
  if (ts.isFunctionDeclaration(node)) {
    return serializeSignature(node, context, "function", nameText(node.name))
  }
  if (ts.isVariableDeclaration(node)) {
    return {
      kind: "variable",
      name: nameText(node.name),
      type: node.type === undefined ? { kind: "unknown" } : serializeType(node.type, context)
    }
  }
  if (ts.isTypeAliasDeclaration(node)) {
    const generic = serializeTypeParameters(node.typeParameters, context)
    return {
      kind: "type-alias",
      name: node.name.text,
      typeParameters: generic.parameters,
      type: serializeType(node.type, generic.context),
      modifiers: modifiers(node)
    }
  }
  if (ts.isInterfaceDeclaration(node)) {
    const generic = serializeTypeParameters(node.typeParameters, context)
    return {
      kind: "interface",
      name: node.name.text,
      typeParameters: generic.parameters,
      members: serializeObjectMembers(node.members, generic.context),
      heritage: serializeHeritage(node.heritageClauses, generic.context),
      modifiers: modifiers(node)
    }
  }
  if (ts.isClassDeclaration(node)) {
    const generic = serializeTypeParameters(node.typeParameters, context)
    return {
      kind: "class",
      name: nameText(node.name),
      typeParameters: generic.parameters,
      members: node.members.flatMap((member) => {
        const serialized = serializeClassMember(member, generic.context)
        return serialized === undefined ? [] : [serialized]
      }).sort((left, right) =>
        `${left.kind}:${left.name}:${stableJson(left)}`.localeCompare(
          `${right.kind}:${right.name}:${stableJson(right)}`
        )
      ),
      heritage: serializeHeritage(node.heritageClauses, generic.context),
      modifiers: modifiers(node)
    }
  }
  if (ts.isEnumDeclaration(node)) {
    return {
      kind: "enum",
      name: node.name.text,
      members: node.members.map((member) => ({
        kind: "enum-member",
        name: nameText(member.name),
        value: member.initializer === undefined
          ? undefined
          : ts.isStringLiteral(member.initializer) || ts.isNumericLiteral(member.initializer)
          ? member.initializer.text
          : member.initializer.getText()
      }))
    }
  }
  if (ts.isModuleDeclaration(node)) {
    return { kind: "namespace", name: nameText(node.name), members: moduleMembers(node, context) }
  }
  if (ts.isExportAssignment(node)) {
    return { kind: "export-assignment", name: "default", value: node.expression.getText() }
  }
  throw new Error(`Unsupported public declaration: ${ts.SyntaxKind[node.kind]}`)
}

const declarationKind = (declarations: ReadonlyArray<DeclarationModel>): string =>
  [...new Set(declarations.map((declaration) => declaration.kind))].sort().join("+")

const documentation = (symbol: ts.Symbol, checker: ts.TypeChecker): Documentation => {
  const tags = new Map(
    symbol.getJsDocTags(checker).map((tag) => [
      tag.name,
      tag.text?.map((part) => part.text).join("").trim() ?? ""
    ])
  )
  const summary = ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim()
  const stability = tags.get("stability")
  return {
    summary: summary === "" ? undefined : summary,
    deprecated: tags.get("deprecated"),
    since: tags.get("since"),
    category: tags.get("category"),
    stability: tags.has("unstable") ? "unstable" : stability === "experimental" || stability === "unstable"
      ? stability
      : "stable"
  }
}

const bucketDeclarations = (symbol: ts.Symbol, bucket: Bucket): ReadonlyArray<ts.Declaration> => {
  const declarations = symbol.declarations ?? []
  return declarations.filter((declaration) => {
    if (bucket === "type") {
      return ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration) ||
        ts.isClassDeclaration(declaration) || ts.isEnumDeclaration(declaration) ||
        ts.isModuleDeclaration(declaration)
    }
    return ts.isFunctionDeclaration(declaration) || ts.isVariableDeclaration(declaration) ||
      ts.isClassDeclaration(declaration) || ts.isEnumDeclaration(declaration) ||
      ts.isModuleDeclaration(declaration) || ts.isExportAssignment(declaration)
  })
}

const symbolBuckets = (symbol: ts.Symbol): ReadonlyArray<Bucket> => {
  const output: Array<Bucket> = []
  if ((symbol.flags & ts.SymbolFlags.Type) !== 0) {
    output.push("type")
  }
  if ((symbol.flags & ts.SymbolFlags.Value) !== 0 || (symbol.flags & ts.SymbolFlags.Namespace) !== 0) {
    output.push("value")
  }
  return output
}

const displayDeclarations = (nodes: ReadonlyArray<ts.Declaration>): string =>
  nodes.map((node) => node.getText().replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim()).join("\n")

const fingerprintDeclarations = (declarations: ReadonlyArray<DeclarationModel>): string => {
  const normalize = (value: unknown, parent?: string): unknown => {
    if (Array.isArray(value)) {
      return value.map((entry) => normalize(entry, parent))
    }
    if (value !== null && typeof value === "object") {
      const input = value as Record<string, unknown>
      return Object.fromEntries(
        Object.entries(input).flatMap(([key, entry]) => {
          if ((parent === "parameters" && key === "name") || key === "displayName") {
            return []
          }
          return [[key, normalize(entry, key)]]
        })
      )
    }
    return value
  }
  return fingerprint(
    declarations.map((declaration) => ({
      ...declaration,
      name: "<export>",
      parameters: declaration.parameters?.map((parameter) => ({ ...parameter, name: "<parameter>" }))
    })).map((declaration) => normalize(declaration))
  )
}

interface PendingEntity {
  readonly symbol: ts.Symbol
  readonly bucket: Bucket
  readonly packageName: string
  readonly routes: Array<ImportRoute>
  readonly declarations: ReadonlyArray<ts.Declaration>
}

const symbolIdentity = (symbol: ts.Symbol, bucket: Bucket): string => {
  const declarations = symbol.declarations ?? []
  return `${bucket}:${
    declarations.map((node) => `${node.getSourceFile().fileName}:${node.pos}:${node.end}`).sort().join("|")
  }`
}

const collectExports = (
  checker: ts.TypeChecker,
  moduleSymbol: ts.Symbol,
  entrypoint: Entrypoint,
  pending: Map<string, PendingEntity>,
  path: ReadonlyArray<string> = [],
  seenNamespaces: ReadonlySet<ts.Symbol> = new Set()
): void => {
  for (
    const exported of checker.getExportsOfModule(moduleSymbol).sort((left, right) =>
      left.name.localeCompare(right.name)
    )
  ) {
    let symbol = exported
    if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
      symbol = checker.getAliasedSymbol(symbol)
    }
    const exportPath = [...path, exported.name]
    const declarations = symbol.declarations ?? []
    for (const bucket of symbolBuckets(symbol)) {
      const selected = bucketDeclarations(symbol, bucket)
      if (selected.length === 0) {
        continue
      }
      const key = symbolIdentity(symbol, bucket)
      const existing = pending.get(key)
      const route = { module: entrypoint.module, path: exportPath }
      if (existing === undefined) {
        pending.set(key, {
          symbol,
          bucket,
          packageName: entrypoint.packageName,
          routes: [route],
          declarations: selected
        })
      } else if (
        !existing.routes.some((candidate) =>
          candidate.module === route.module && candidate.path.join(".") === route.path.join(".")
        )
      ) {
        existing.routes.push(route)
      }
    }
    const isNamespace = (symbol.flags & ts.SymbolFlags.Module) !== 0
    if (isNamespace && !seenNamespaces.has(symbol) && declarations.length > 0) {
      collectExports(
        checker,
        symbol,
        entrypoint,
        pending,
        exportPath,
        new Set([...seenNamespaces, symbol])
      )
    }
  }
}

const canonicalRoute = (routes: ReadonlyArray<ImportRoute>): ImportRoute =>
  [...routes].sort((left, right) =>
    left.path.length - right.path.length ||
    right.module.split("/").length - left.module.split("/").length ||
    left.module.localeCompare(right.module) ||
    left.path.join(".").localeCompare(right.path.join("."))
  )[0]!

export interface ExtractSnapshotOptions {
  readonly repoRoot: string
  readonly ref: string
  readonly sha: string
  readonly modules?: ReadonlyArray<string>
}

export class SnapshotExtractionError extends Schema.TaggedError<SnapshotExtractionError>()(
  "SnapshotExtractionError",
  {
    message: Schema.String,
    diagnostics: Schema.Array(SnapshotDiagnosticSchema)
  }
) {}

export const isSnapshotExtractionError = (u: unknown): u is SnapshotExtractionError =>
  Predicate.isTagged(u, "SnapshotExtractionError")

const snapshotExtractionError = (diagnostics: ReadonlyArray<SnapshotDiagnostic>): SnapshotExtractionError =>
  new SnapshotExtractionError({
    message: diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join("\n"),
    diagnostics
  })

const extractSnapshot = (
  options: ExtractSnapshotOptions,
  discovered: DiscoveryResult,
  path: Path.Path
): ApiSnapshot => {
  const diagnostics: Array<SnapshotDiagnostic> = discovered.missing.map((module) => ({
    code: "missing-entrypoint",
    message: `Consumer-visible declaration entrypoint not found: ${module}`,
    module
  }))
  if (diagnostics.length > 0) {
    throw snapshotExtractionError(diagnostics)
  }
  const program = ts.createProgram({
    rootNames: discovered.entrypoints.map((entrypoint) => entrypoint.declarationFile),
    options: {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ESNext,
      skipLibCheck: true,
      types: [],
      noEmit: true
    }
  })
  // The declarations were already checked by the branch-native build. Re-checking
  // them with the pinned extractor compiler would introduce lib-version drift.
  const compilerDiagnostics = program.getSyntacticDiagnostics()
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
  if (compilerDiagnostics.length > 0) {
    throw snapshotExtractionError(compilerDiagnostics.map((diagnostic) => ({
      code: `typescript-${diagnostic.code}`,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      source: diagnostic.file === undefined
        ? undefined
        : sourceLocation(path, options.repoRoot, diagnostic.file)
    })))
  }
  const checker = program.getTypeChecker()
  const pending = new Map<string, PendingEntity>()
  for (const entrypoint of discovered.entrypoints) {
    const source = program.getSourceFile(entrypoint.declarationFile)
    const symbol = source === undefined ? undefined : checker.getSymbolAtLocation(source)
    if (source === undefined || symbol === undefined) {
      diagnostics.push({
        code: "missing-module-symbol",
        message: `Could not load module symbol for ${entrypoint.module}`,
        module: entrypoint.module
      })
      continue
    }
    collectExports(checker, symbol, entrypoint, pending)
  }

  const entities: Array<ApiEntity> = []
  const publicSymbols = new Map<string, string>()
  for (const [key, pendingEntity] of pending) {
    const route = canonicalRoute(pendingEntity.routes)
    publicSymbols.set(key, `${route.module}#${route.path.join(".")}#${pendingEntity.bucket}`)
  }
  for (const pendingEntity of pending.values()) {
    const route = canonicalRoute(pendingEntity.routes)
    const declaration = pendingEntity.declarations[0]
    if (declaration === undefined) {
      continue
    }
    let serialized: ReadonlyArray<DeclarationModel>
    try {
      serialized = pendingEntity.declarations.map((node) =>
        serializeDeclaration(node, {
          checker,
          path,
          repoRoot: options.repoRoot,
          typeParameters: new Map(),
          publicSymbols
        })
      )
    } catch (error) {
      diagnostics.push({
        code: "unsupported-public-declaration",
        message: error instanceof Error ? error.message : String(error),
        module: route.module,
        path: route.path,
        source: sourceLocation(path, options.repoRoot, declaration)
      })
      continue
    }
    const id = `${route.module}#${route.path.join(".")}#${pendingEntity.bucket}`
    entities.push({
      id,
      packageName: pendingEntity.packageName,
      module: route.module,
      path: route.path,
      bucket: pendingEntity.bucket,
      declarationKind: declarationKind(serialized),
      importRoutes: [...pendingEntity.routes].sort((left, right) =>
        left.module.localeCompare(right.module) || left.path.join(".").localeCompare(right.path.join("."))
      ),
      declarations: serialized,
      displaySignature: displayDeclarations(pendingEntity.declarations),
      fingerprint: fingerprintDeclarations(serialized),
      documentation: documentation(pendingEntity.symbol, checker),
      source: sourceLocation(path, options.repoRoot, declaration)
    })
  }
  if (diagnostics.length > 0) {
    throw snapshotExtractionError(diagnostics)
  }

  const packages = [...new Set(discovered.entrypoints.map((entrypoint) => entrypoint.packageName))].sort()
  return {
    version: 1,
    compiler: { name: "typescript", version: ts.version },
    ref: options.ref,
    sha: options.sha,
    packages,
    entrypoints: discovered.entrypoints.map((entrypoint) => ({
      ...entrypoint,
      declarationFile: normalizedPath(path, options.repoRoot, entrypoint.declarationFile)
    })),
    entities: entities.sort((left, right) => left.id.localeCompare(right.id)),
    diagnostics: []
  }
}

export const snapshotCacheKey = (
  sha: string,
  modules?: ReadonlyArray<string>
): string =>
  fingerprint([
    "snapshot-v4",
    "class-member-optionality-v1",
    "literal-type-category-v1",
    sha,
    ts.version,
    modules === undefined ? "all" : [...modules].sort()
  ])

export class Snapshotter extends Context.Service<Snapshotter, {
  readonly extract: (options: ExtractSnapshotOptions) => Effect.Effect<
    ApiSnapshot,
    ApiDiffError | SnapshotExtractionError
  >
}>()("@effect/api-diff/Snapshotter") {
  static readonly layerNoDependencies = Layer.effect(
    Snapshotter,
    Effect.gen(function*() {
      const discovery = yield* Discovery
      const path = yield* Path.Path

      const extract = Effect.fnUntraced(function*(options: ExtractSnapshotOptions) {
        const discovered = yield* discovery.discoverEntrypoints(options.repoRoot, options.modules)
        return yield* Effect.try({
          try: () => extractSnapshot(options, discovered, path),
          catch: (cause) =>
            isSnapshotExtractionError(cause)
              ? cause
              : new ApiDiffError({
                message: `Could not extract the API snapshot for ${options.ref}`,
                cause
              })
        })
      })

      return Snapshotter.of({ extract })
    })
  )

  static readonly layer = this.layerNoDependencies.pipe(
    Layer.provide(Discovery.layer)
  )
}
