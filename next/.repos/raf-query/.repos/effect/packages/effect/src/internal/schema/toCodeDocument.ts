import * as Arr from "../../Array.ts"
import { format, formatPropertyKey } from "../../Formatter.ts"
import type * as Schema from "../../Schema.ts"
import type * as SchemaRepresentation from "../../SchemaRepresentation.ts"
import { errorWithPath } from "../errors.ts"
import * as InternalRecord from "../record.ts"
import * as InternalAnnotations from "./annotations.ts"

type Path = ReadonlyArray<string | number>
type CheckRepresentationAnnotation = SchemaRepresentation.CheckRepresentationAnnotation<
  SchemaRepresentation.Representation
>

/** @internal */
export function makeCode(runtime: string, Type: string): SchemaRepresentation.Code {
  return { runtime, Type }
}

function renderEmittableAnnotation(input: unknown): string | undefined {
  if (
    input === null ||
    typeof input === "string" ||
    typeof input === "boolean" ||
    typeof input === "number" ||
    typeof input === "bigint"
  ) return format(input)
  if (typeof input === "symbol") {
    const key = globalThis.Symbol.keyFor(input)
    return key === undefined ? undefined : `Symbol.for(${format(key)})`
  }
  if (typeof input !== "object") return undefined
  if (Array.isArray(input)) {
    const values: Array<string> = []
    for (const value of input) {
      const rendered = renderEmittableAnnotation(value)
      if (rendered === undefined) return undefined
      values.push(rendered)
    }
    return `[${values.join(", ")}]`
  }

  const entries: Array<string> = []
  for (const [key, value] of Object.entries(input)) {
    const rendered = renderEmittableAnnotation(value)
    if (rendered === undefined) return undefined
    entries.push(`${formatPropertyKey(key)}: ${rendered}`)
  }
  return entries.length === 0 ? "{}" : `{ ${entries.join(", ")} }`
}

function renderAnnotations(
  annotations: Schema.Annotations.Annotations | undefined
): string | undefined {
  if (annotations === undefined) return undefined
  const entries: Array<string> = []
  for (const [key, value] of Object.entries(annotations)) {
    if (InternalAnnotations.annotationExcludedKeys.has(key)) continue
    const rendered = renderEmittableAnnotation(value)
    if (rendered !== undefined) entries.push(`${formatPropertyKey(key)}: ${rendered}`)
  }
  return entries.length === 0 ? undefined : `{ ${entries.join(", ")} }`
}

/** @internal */
export function sanitizeJavaScriptIdentifier(input: string): string {
  if (input.length === 0) return "_"
  const out = input.replace(/[^A-Za-z0-9_$]/gu, "_")
  const first = out[0]
  return first >= "a" && first <= "z"
    ? first.toUpperCase() + out.slice(1)
    : first >= "0" && first <= "9"
    ? `_${out}`
    : out
}

function isSimpleLiveLiteral(
  representation: SchemaRepresentation.Representation
): representation is SchemaRepresentation.Literal {
  return representation._tag === "Literal" && representation.checks.length === 0 &&
    representation.annotations === undefined
}

/** @internal */
export interface TopologicalSort {
  readonly nonRecursives: ReadonlyArray<{
    readonly $ref: string
    readonly representation: SchemaRepresentation.Representation
  }>
  readonly recursives: Readonly<Record<string, SchemaRepresentation.Representation>>
}

/** @internal */
export function topologicalSort(
  references: SchemaRepresentation.References
): TopologicalSort {
  const identifiers = Object.keys(references)
  const identifierSet = new Set(identifiers)

  function collectRefs(root: SchemaRepresentation.Representation): ReadonlySet<string> {
    const refs = new Set<string>()
    const visited = new WeakSet<object>()
    const stack: Array<SchemaRepresentation.Representation> = [root]

    function pushRepresentationSchemas(representation: CheckRepresentationAnnotation | undefined): void {
      if (representation?.schemas !== undefined) stack.push(...representation.schemas)
    }

    function pushChecks(
      checks: ReadonlyArray<SchemaRepresentation.Check>
    ): void {
      for (const check of checks) {
        pushRepresentationSchemas(check.representation)
        if (check._tag === "FilterGroup") pushChecks(check.checks)
      }
    }

    while (stack.length > 0) {
      const representation = stack.pop()!
      if (visited.has(representation)) continue
      visited.add(representation)
      if (representation._tag === "Reference") {
        if (identifierSet.has(representation.$ref)) refs.add(representation.$ref)
        continue
      }

      pushChecks(representation.checks)
      switch (representation._tag) {
        case "Declaration":
          pushRepresentationSchemas(representation.representation)
          stack.push(...representation.typeParameters)
          break
        case "Suspend":
          stack.push(representation.thunk)
          break
        case "TemplateLiteral":
          stack.push(...representation.parts)
          break
        case "Arrays":
          for (const element of representation.elements) stack.push(element.type)
          stack.push(...representation.rest)
          break
        case "Objects":
          for (const property of representation.propertySignatures) stack.push(property.type)
          for (const signature of representation.indexSignatures) {
            stack.push(signature.parameter, signature.type)
          }
          break
        case "Union":
          stack.push(...representation.types)
          break
      }
    }
    return refs
  }

  const dependencies = new Map<string, ReadonlySet<string>>(
    identifiers.map((identifier) => [identifier, collectRefs(references[identifier])])
  )
  const recursive = new Set<string>()
  const state = new Map<string, 0 | 1 | 2>()
  const stack: Array<string> = []

  function visit(identifier: string): void {
    const current = state.get(identifier) ?? 0
    if (current === 1) {
      const start = stack.indexOf(identifier)
      for (let index = start; index < stack.length; index++) recursive.add(stack[index])
      return
    }
    if (current === 2) return
    state.set(identifier, 1)
    stack.push(identifier)
    for (const dependency of dependencies.get(identifier)!) visit(dependency)
    stack.pop()
    state.set(identifier, 2)
  }

  for (const identifier of identifiers) visit(identifier)

  const inDegree = new Map<string, number>()
  const dependents = new Map<string, Set<string>>()
  for (const identifier of identifiers) {
    if (!recursive.has(identifier)) {
      inDegree.set(identifier, 0)
      dependents.set(identifier, new Set())
    }
  }
  for (const [identifier, internalDependencies] of dependencies) {
    if (recursive.has(identifier)) continue
    for (const dependency of internalDependencies) {
      if (recursive.has(dependency)) continue
      inDegree.set(identifier, inDegree.get(identifier)! + 1)
      dependents.get(dependency)!.add(identifier)
    }
  }

  const queue: Array<string> = []
  for (const [identifier, degree] of inDegree) {
    if (degree === 0) queue.push(identifier)
  }
  const nonRecursives: Array<{
    readonly $ref: string
    readonly representation: SchemaRepresentation.Representation
  }> = []
  for (let index = 0; index < queue.length; index++) {
    const $ref = queue[index]
    nonRecursives.push({ $ref, representation: references[$ref] })
    for (const dependent of dependents.get($ref)!) {
      const degree = inDegree.get(dependent)! - 1
      inDegree.set(dependent, degree)
      if (degree === 0) queue.push(dependent)
    }
  }
  const recursives: Record<string, SchemaRepresentation.Representation> = {}
  for (const identifier of recursive) InternalRecord.assignProperty(recursives, identifier, references[identifier])
  return { nonRecursives, recursives }
}

/** @internal */
export function toCodeDocument(
  document: SchemaRepresentation.MultiDocument
): SchemaRepresentation.CodeDocument {
  const artifacts: Array<SchemaRepresentation.Artifact> = []
  const sorted = topologicalSort(document.references)
  const sanitizedReferences = new Map<string, string>()
  const uniqueIdentifiers = new Set<string>()
  let compilingRecursiveDefinition = false
  let explicitSuspendDepth = 0

  for (const { $ref } of sorted.nonRecursives) ensureUniqueIdentifier($ref)
  for (const $ref of Object.keys(sorted.recursives)) ensureUniqueIdentifier($ref)

  const nonRecursives = sorted.nonRecursives.map(({ $ref, representation }) => ({
    $ref: ensureUniqueIdentifier($ref),
    code: recur(representation, ["references", $ref])
  }))
  const recursives: Record<string, SchemaRepresentation.Code> = {}
  for (const [$ref, representation] of Object.entries(sorted.recursives)) {
    compilingRecursiveDefinition = true
    InternalRecord.assignProperty(recursives, ensureUniqueIdentifier($ref), recur(representation, ["references", $ref]))
    compilingRecursiveDefinition = false
  }
  const codes = document.representations.map((representation, index) =>
    recur(representation, ["representations", index])
  )

  return {
    codes,
    references: { nonRecursives, recursives },
    artifacts
  }

  function ensureUniqueIdentifier(original: string): string {
    const existing = sanitizedReferences.get(original)
    if (existing !== undefined) return existing
    const candidate = freshIdentifier(original)
    sanitizedReferences.set(original, candidate)
    return candidate
  }

  function freshIdentifier(seed: string): string {
    const sanitized = sanitizeJavaScriptIdentifier(seed)
    let candidate = sanitized
    let suffix = 0
    while (uniqueIdentifiers.has(candidate)) candidate = `${sanitized}${++suffix}`
    uniqueIdentifiers.add(candidate)
    return candidate
  }

  function addImport(importDeclaration: string): void {
    if (!artifacts.some((artifact) => artifact._tag === "Import" && artifact.importDeclaration === importDeclaration)) {
      artifacts.push({ _tag: "Import", importDeclaration })
    }
  }

  function addSymbol(symbol: symbol): string {
    const identifier = freshIdentifier("_symbol")
    const key = globalThis.Symbol.keyFor(symbol)
    const description = symbol.description
    artifacts.push({
      _tag: "Symbol",
      identifier,
      code: makeCode(
        key === undefined
          ? `Symbol(${description === undefined ? "" : format(description)})`
          : `Symbol.for(${format(key)})`,
        `typeof ${identifier}`
      )
    })
    return identifier
  }

  function annotationSchemas(
    representation: CheckRepresentationAnnotation | undefined,
    path: Path
  ): ReadonlyArray<SchemaRepresentation.Code> {
    return representation?.schemas?.map((schema, index) => recur(schema, [...path, "schemas", index])) ?? []
  }

  function runtimeAnnotate(
    annotations: Schema.Annotations.Annotations | undefined,
    method: "annotate" | "annotateKey" = "annotate"
  ): string {
    const rendered = renderAnnotations(annotations)
    return rendered === undefined ? "" : `.${method}(${rendered})`
  }

  function unionOptionsRuntime(options: NonNullable<SchemaRepresentation.Union["options"]>): string {
    if (!Object.hasOwn(options, "mode")) return "{}"
    return `{ mode: ${options.mode === undefined ? "undefined" : format(options.mode)} }`
  }

  function compileCheck(
    check: SchemaRepresentation.Check,
    path: Path
  ): string {
    const callback = check.annotations?.toCode
    let runtime: string
    if (callback !== undefined) {
      const schemas = annotationSchemas(check.representation, [...path, "representation"])
      const output = (callback as SchemaRepresentation.Generation.Check)({ schemas })
      for (const importDeclaration of output.importDeclarations ?? []) addImport(importDeclaration)
      runtime = output.runtime
    } else if (check._tag === "Filter") {
      throw errorWithPath("Missing toCode callback", [...path, "annotations", "toCode"])
    } else {
      runtime = `Schema.makeFilterGroup([${
        check.checks.map((child, index) => compileCheck(child, [...path, "checks", index])).join(", ")
      }])`
    }
    runtime += runtimeAnnotate(check.annotations)
    if (check._tag === "Filter" && check.aborted) runtime += ".abort()"
    return runtime
  }

  function applyNode(
    base: SchemaRepresentation.Code,
    representation: Exclude<SchemaRepresentation.Representation, SchemaRepresentation.Reference>,
    path: Path
  ): SchemaRepresentation.Code {
    let runtime = base.runtime + runtimeAnnotate(representation.annotations)
    for (let index = 0; index < representation.checks.length; index++) {
      const check = representation.checks[index]
      runtime += `.check(${compileCheck(check, [...path, "checks", index])})`
    }
    return makeCode(runtime, base.Type)
  }

  function recur(
    representation: SchemaRepresentation.Representation,
    path: Path
  ): SchemaRepresentation.Code {
    if (representation._tag === "Reference") {
      if (!Object.hasOwn(document.references, representation.$ref)) {
        throw errorWithPath(`Invalid reference ${representation.$ref}`, [...path, "$ref"])
      }
      const identifier = ensureUniqueIdentifier(representation.$ref)
      if (
        compilingRecursiveDefinition && explicitSuspendDepth === 0 &&
        Object.hasOwn(sorted.recursives, representation.$ref)
      ) {
        return makeCode(`Schema.suspend((): Schema.Codec<${identifier}> => ${identifier})`, identifier)
      }
      return makeCode(identifier, identifier)
    }
    return applyNode(on(representation, path), representation, path)
  }

  function on(
    representation: Exclude<SchemaRepresentation.Representation, SchemaRepresentation.Reference>,
    path: Path
  ): SchemaRepresentation.Code {
    switch (representation._tag) {
      case "Declaration": {
        const callback = representation.annotations?.toCode
        if (callback === undefined) {
          throw errorWithPath("Missing toCode callback", [...path, "annotations", "toCode"])
        }
        const typeParameters = representation.typeParameters.map((typeParameter, index) =>
          recur(typeParameter, [...path, "typeParameters", index])
        )
        const output = (callback as SchemaRepresentation.Generation.Declaration)({ typeParameters })
        for (const importDeclaration of output.importDeclarations ?? []) addImport(importDeclaration)
        return makeCode(output.runtime, output.Type)
      }
      case "Suspend": {
        explicitSuspendDepth++
        const thunk = recur(representation.thunk, [...path, "thunk"])
        explicitSuspendDepth--
        return makeCode(`Schema.suspend((): Schema.Codec<${thunk.Type}> => ${thunk.runtime})`, thunk.Type)
      }
      case "Null":
        return makeCode("Schema.Null", "null")
      case "Undefined":
        return makeCode("Schema.Undefined", "undefined")
      case "Void":
        return makeCode("Schema.Void", "void")
      case "Never":
        return makeCode("Schema.Never", "never")
      case "Unknown":
        return makeCode("Schema.Unknown", "unknown")
      case "Any":
        return makeCode("Schema.Any", "any")
      case "String":
        return makeCode("Schema.String", "string")
      case "Number":
        return makeCode("Schema.Number", "number")
      case "Boolean":
        return makeCode("Schema.Boolean", "boolean")
      case "BigInt":
        return makeCode("Schema.BigInt", "bigint")
      case "Symbol":
        return makeCode("Schema.Symbol", "symbol")
      case "Literal": {
        const literal = format(representation.literal)
        return makeCode(`Schema.Literal(${literal})`, literal)
      }
      case "UniqueSymbol": {
        const identifier = addSymbol(representation.symbol)
        return makeCode(`Schema.UniqueSymbol(${identifier})`, `typeof ${identifier}`)
      }
      case "ObjectKeyword":
        return makeCode("Schema.ObjectKeyword", "object")
      case "Enum": {
        const identifier = freshIdentifier("_Enum")
        artifacts.push({
          _tag: "Enum",
          identifier,
          code: makeCode(
            `enum ${identifier} { ${
              representation.enums.map(([name, value]) => `${format(name)} = ${format(value)}`).join(
                ", "
              )
            } }`,
            `typeof ${identifier}`
          )
        })
        return makeCode(`Schema.Enum(${identifier})`, identifier)
      }
      case "TemplateLiteral": {
        const parts = representation.parts.map((part, index) => recur(part, [...path, "parts", index]))
        const Type = `\`${parts.map((part) => `\${${part.Type}}`).join("")}\``
        return makeCode(`Schema.TemplateLiteral([${parts.map((part) => part.runtime).join(", ")}])`, Type)
      }
      case "Arrays": {
        const elements = representation.elements.map((element, index) => {
          const type = recur(element.type, [...path, "elements", index, "type"])
          return makeCode(
            `${element.isOptional ? "Schema.optionalKey(" : ""}${type.runtime}${element.isOptional ? ")" : ""}${
              runtimeAnnotate(element.annotations, "annotateKey")
            }`,
            element.isOptional ? `(${type.Type})?` : type.Type
          )
        })
        const rest = representation.rest.map((item, index) => recur(item, [...path, "rest", index]))
        let code: SchemaRepresentation.Code
        if (Arr.isArrayNonEmpty(rest)) {
          const item = rest[0]
          if (elements.length === 0 && rest.length === 1) {
            code = makeCode(`Schema.Array(${item.runtime})`, `ReadonlyArray<${item.Type}>`)
          } else {
            const post = rest.slice(1)
            code = makeCode(
              `Schema.TupleWithRest(Schema.Tuple([${elements.map((element) => element.runtime).join(", ")}]), [${
                rest.map((item) => item.runtime).join(", ")
              }])`,
              `readonly [${elements.map((element) => element.Type).join(", ")}, ...Array<${item.Type}>${
                post.length > 0 ? `, ${post.map((item) => item.Type).join(", ")}` : ""
              }]`
            )
          }
        } else {
          code = makeCode(
            `Schema.Tuple([${elements.map((element) => element.runtime).join(", ")}])`,
            `readonly [${elements.map((element) => element.Type).join(", ")}]`
          )
        }
        return code
      }
      case "Objects": {
        const properties = representation.propertySignatures.map((property, index) => {
          const isSymbol = typeof property.name === "symbol"
          const name = isSymbol
            ? `[${addSymbol(property.name)}]`
            : formatPropertyKey(property.name)
          const type = recur(property.type, [...path, "propertySignatures", index, "type"])
          let runtime = type.runtime
          if (property.isMutable) runtime = `Schema.mutableKey(${runtime})`
          if (property.isOptional) runtime = `Schema.optionalKey(${runtime})`
          runtime += runtimeAnnotate(property.annotations, "annotateKey")
          const runtimeName = property.name === "__proto__" ? `[${name}]` : name
          const typeName = `${property.isMutable ? "" : "readonly "}${name}${property.isOptional ? "?" : ""}`
          return {
            code: makeCode(`${runtimeName}: ${runtime}`, `${typeName}: ${type.Type}`)
          }
        })
        const indexSignatures = representation.indexSignatures.map((signature, index) => ({
          parameter: recur(signature.parameter, [...path, "indexSignatures", index, "parameter"]),
          type: recur(signature.type, [...path, "indexSignatures", index, "type"])
        }))
        const propertyRuntimes = properties.map((property) => property.code.runtime).join(", ")
        const propertyTypes = properties.map((property) => property.code.Type).join(", ")
        let code: SchemaRepresentation.Code
        if (indexSignatures.length === 0) {
          code = makeCode(
            `Schema.Struct({ ${propertyRuntimes} })`,
            `{ ${propertyTypes} }`
          )
        } else if (properties.length === 0 && indexSignatures.length === 1) {
          const signature = indexSignatures[0]
          code = makeCode(
            `Schema.Record(${signature.parameter.runtime}, ${signature.type.runtime})`,
            `{ readonly [x: ${signature.parameter.Type}]: ${signature.type.Type} }`
          )
        } else {
          const indexRuntimes = indexSignatures.map((signature) =>
            `Schema.Record(${signature.parameter.runtime}, ${signature.type.runtime})`
          ).join(", ")
          const indexTypes = indexSignatures.map((signature) =>
            `readonly [x: ${signature.parameter.Type}]: ${signature.type.Type}`
          )
          code = properties.length === 0
            ? makeCode(
              `Schema.StructWithRest(Schema.Struct({ ${propertyRuntimes} }), [${indexRuntimes}])`,
              `{ ${indexTypes.join(", ")} }`
            )
            : makeCode(
              `Schema.StructWithRest(Schema.Struct({ ${propertyRuntimes} }), [${indexRuntimes}])`,
              [`{ ${propertyTypes} }`, ...indexTypes.map((indexType) => `{ ${indexType} }`)].join(" & ")
            )
        }
        return code
      }
      case "Union": {
        if (representation.options === undefined && representation.types.length === 0) {
          return makeCode("Schema.Never", "never")
        }
        if (representation.options === undefined && representation.types.every(isSimpleLiveLiteral)) {
          const literals = representation.types.map((literal) => format(literal.literal))
          return literals.length === 1
            ? makeCode(`Schema.Literal(${literals[0]})`, literals[0])
            : makeCode(`Schema.Literals([${literals.join(", ")}])`, literals.join(" | "))
        }
        const types = representation.types.map((type, index) => recur(type, [...path, "types", index]))
        const options = representation.options === undefined
          ? ""
          : `, ${unionOptionsRuntime(representation.options)}`
        return makeCode(
          `Schema.Union([${types.map((type) => type.runtime).join(", ")}]${options})`,
          types.length === 0 ? "never" : types.map((type) => type.Type).join(" | ")
        )
      }
    }
  }
}
