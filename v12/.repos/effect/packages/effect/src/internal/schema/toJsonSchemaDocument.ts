import * as Arr from "../../Array.ts"
import * as Equal from "../../Equal.ts"
import { decodeUriFragment, formatUriFragmentToken, unescapeToken } from "../../JsonPointer.ts"
import type * as JsonSchema from "../../JsonSchema.ts"
import { rewriteRefs } from "../../JsonSchema.ts"
import * as RegEx from "../../RegExp.ts"
import type * as Schema from "../../Schema.ts"
import * as InternalAST from "../../SchemaAST.ts"
import type * as SchemaRepresentation from "../../SchemaRepresentation.ts"
import { errorWithPath } from "../errors.ts"
import * as InternalRecord from "../record.ts"
import * as InternalAnnotations from "./annotations.ts"

type Path = ReadonlyArray<string | number>

function formatDefinitionReference(key: string): string {
  return `#/$defs/${formatUriFragmentToken(key)}`
}

const jsonSchemaAnnotationExcludedKeys = new Set([
  ...InternalAnnotations.annotationExcludedKeys,
  InternalAnnotations.IDENTIFIER_FALLBACK_KEY,
  ...InternalAnnotations.jsonSchemaAnnotationKeys
])

function collectJsonSchemaAnnotations(
  annotations: Schema.Annotations.Annotations | undefined,
  options: Schema.ToJsonSchemaOptions | undefined
): JsonSchema.JsonSchema | undefined {
  if (annotations === undefined) return undefined

  const out: JsonSchema.JsonSchema = {}
  for (const key of ["title", "description", "format", "contentEncoding", "contentMediaType"] as const) {
    const value = annotations[key]
    if (typeof value === "string") out[key] = value
  }
  for (const key of ["readOnly", "writeOnly"] as const) {
    const value = annotations[key]
    if (typeof value === "boolean") out[key] = value
  }
  const expected = annotations.expected
  if (out.description === undefined && options?.generateDescriptions === true && typeof expected === "string") {
    out.description = expected
  }

  const defaultValue = annotations.default
  if (InternalAST.isJson(defaultValue)) out.default = defaultValue
  const examples = annotations.examples
  if (Array.isArray(examples) && InternalAST.isJson(examples)) out.examples = examples
  const contentSchema = annotations.contentSchema
  if (InternalAST.isJson(contentSchema)) out.contentSchema = contentSchema

  if (options?.includeAnnotationKey !== undefined) {
    for (const [key, value] of Object.entries(annotations)) {
      if (
        jsonSchemaAnnotationExcludedKeys.has(key) ||
        !options.includeAnnotationKey(key)
      ) {
        continue
      }
      if (InternalAST.isJson(value)) InternalRecord.assignProperty(out, key, value)
    }
  }

  return Object.keys(out).length === 0 ? undefined : out
}

type JsonSchemaNumberType = "number" | "integer"

function extractJsonSchemaNumberType(schema: JsonSchema.JsonSchema): {
  readonly type: JsonSchemaNumberType | undefined
  readonly schema: JsonSchema.JsonSchema
} {
  let type: JsonSchemaNumberType | undefined = schema.type === "number" || schema.type === "integer"
    ? schema.type
    : undefined
  let out = schema
  if (type !== undefined) {
    out = { ...schema }
    delete out.type
  }
  if (Array.isArray(out.allOf)) {
    const members: Array<JsonSchema.JsonSchema> = []
    let changed = false
    for (const member of out.allOf) {
      const extracted = extractJsonSchemaNumberType(member)
      if (extracted.type !== undefined) {
        changed = true
        if (type === undefined || extracted.type === "integer") type = extracted.type
      }
      if (Object.keys(extracted.schema).length > 0) members.push(extracted.schema)
    }
    if (changed) {
      const { allOf: _, ...rest } = out
      out = members.length === 0 ? rest : { ...rest, allOf: members }
    }
  }
  return { type, schema: out }
}

function isJsonSchemaNumberEncoding(schema: JsonSchema.JsonSchema): boolean {
  if (!Array.isArray(schema.anyOf) || schema.anyOf.length !== 2 || schema.anyOf[0]?.type !== "number") return false
  const special = schema.anyOf[1]
  return special?.type === "string" && Array.isArray(special.enum) && special.enum.length === 3 &&
    special.enum.includes("NaN") && special.enum.includes("Infinity") && special.enum.includes("-Infinity")
}

// Keep this allowlist closed: applicators and dependent keywords can change meaning when moved across schema objects.
const inlineableCheckKeywords =
  "|type|format|pattern|multipleOf|minimum|maximum|exclusiveMinimum|exclusiveMaximum|minLength|maxLength|minItems|maxItems|uniqueItems|minProperties|maxProperties|propertyNames|"

function hasOnlyKeywords(schema: JsonSchema.JsonSchema, allowed: string): boolean {
  return Object.keys(schema).every((key) => allowed.includes(`|${key}|`))
}

function hasNoCollisions(left: JsonSchema.JsonSchema, rightKeys: ReadonlyArray<string>): boolean {
  return typeof left.$ref !== "string" && rightKeys.every((key) => !Object.hasOwn(left, key))
}

// Every bound on one schema object applies, so a repeated bound reduces to its tighter value.
const lowerBoundKeywords = "|minimum|exclusiveMinimum|minLength|minItems|minProperties|"
const upperBoundKeywords = "|maximum|exclusiveMaximum|maxLength|maxItems|maxProperties|"

// Tightens repeated bounds and drops an inclusive or exclusive bound implied by the other on the same side. Returns
// `undefined` for a `$ref` schema or a non-bound collision, so the caller falls back to `allOf`.
function mergeInlineCheck(
  left: JsonSchema.JsonSchema,
  right: JsonSchema.JsonSchema,
  rightKeys: ReadonlyArray<string>
): JsonSchema.JsonSchema | undefined {
  if (typeof left.$ref === "string") return undefined
  const out: JsonSchema.JsonSchema = { ...left, ...right }
  for (const key of rightKeys) {
    if (!Object.hasOwn(left, key)) continue
    const a = left[key]
    const b = right[key]
    if (typeof a !== "number" || typeof b !== "number") return undefined
    if (lowerBoundKeywords.includes(`|${key}|`)) out[key] = Math.max(a, b)
    else if (upperBoundKeywords.includes(`|${key}|`)) out[key] = Math.min(a, b)
    else return undefined
  }
  if (typeof out.minimum === "number" && typeof out.exclusiveMinimum === "number") {
    delete out[out.exclusiveMinimum >= out.minimum ? "minimum" : "exclusiveMinimum"]
  }
  if (typeof out.maximum === "number" && typeof out.exclusiveMaximum === "number") {
    delete out[out.exclusiveMaximum <= out.maximum ? "maximum" : "exclusiveMaximum"]
  }
  return out
}

// `format` and `content*` can affect validation, so they are not treated as pure annotations.
const promotableAnnotationKeywords = "|title|description|default|examples|readOnly|writeOnly|"
const inlineableAnnotatedCheckKeywords = inlineableCheckKeywords + promotableAnnotationKeywords

function appendJsonSchema(
  left: JsonSchema.JsonSchema,
  right: JsonSchema.JsonSchema,
  inlineCheck?: true
): JsonSchema.JsonSchema {
  if (Object.keys(left).length === 0) return right
  const rightKeys = Object.keys(right)
  if (rightKeys.length === 0) return left
  const leftType = left.type === "number" || left.type === "integer" ? left.type : undefined
  const isNumberEncoding = isJsonSchemaNumberEncoding(left)
  if (leftType !== undefined || isNumberEncoding) {
    const extracted = extractJsonSchemaNumberType(right)
    if (extracted.type !== undefined) {
      const type = leftType === "integer" || extracted.type === "integer" ? "integer" : "number"
      const base: JsonSchema.JsonSchema = { ...left, type }
      if (isNumberEncoding) delete base.anyOf
      const extractedKeys = Object.keys(extracted.schema)
      if (extractedKeys.length === 0) return base
      return hasOnlyKeywords(extracted.schema, promotableAnnotationKeywords) &&
          hasNoCollisions(base, extractedKeys)
        ? { ...base, ...extracted.schema }
        : appendJsonSchema(base, extracted.schema, inlineCheck)
    }
  }
  if (inlineCheck) {
    const merged = mergeInlineCheck(left, right, rightKeys)
    if (merged !== undefined) return merged
  }
  const members = Array.isArray(right.allOf) && rightKeys.length === 1 ? right.allOf : [right]
  if (Array.isArray(left.allOf)) {
    return { ...left, allOf: [...left.allOf, ...members] }
  }
  if (typeof left.$ref === "string") {
    return { allOf: [left, ...members] }
  }
  return { ...left, allOf: members }
}

// Exactness forms a dependency graph because definitions can be recursive. A
// cycle is exact unless it can reach `false`.
type Exactness = boolean | ReadonlyArray<Exactness>

type CompiledJsonSchema = {
  schema: JsonSchema.JsonSchema
  dependencies: Array<Exactness>
}

function isExact(exactness: Exactness, seen = new Set<ReadonlyArray<Exactness>>()): boolean {
  if (typeof exactness === "boolean") return exactness
  if (seen.has(exactness)) return true
  seen.add(exactness)
  return exactness.every((dependency) => isExact(dependency, seen))
}

function isApproximateCheckOutput(
  output: SchemaRepresentation.ToJsonSchema.CheckOutput
): output is readonly [schema: JsonSchema.JsonSchema, approximate: true] {
  return Array.isArray(output)
}

function compileJsonSchema(
  representations: readonly [
    SchemaRepresentation.Representation,
    ...Array<SchemaRepresentation.Representation>
  ],
  rootPaths: ReadonlyArray<Path>,
  references: SchemaRepresentation.References,
  options: Schema.ToJsonSchemaOptions | undefined
): JsonSchema.MultiDocument<"draft-2020-12"> {
  const numberKeyPattern = `^(?:${InternalAST.FINITE_PATTERN}|Infinity|-Infinity|NaN)$`
  const compiledDefinitions = new Map<string, CompiledJsonSchema>()
  const definitionAliases = new Map<string, string>()
  const compiledRepresentations = new WeakMap<SchemaRepresentation.Representation, CompiledJsonSchema>()
  const pendingOneOf = new Map<
    ReadonlyArray<JsonSchema.JsonSchema>,
    { branches: ReadonlyArray<Exactness>; schemas: Array<JsonSchema.JsonSchema> }
  >()
  const fallbackDefinitions = new Map<string, Array<string>>()
  const referenceKeys = Object.keys(references)
  for (const key of referenceKeys) {
    compileDefinition(key, ["references", key])
  }
  const compiledSchemas = Arr.map(
    representations,
    (representation, index) => recur(representation, rootPaths[index], [])
  )
  for (const { branches, schemas } of pendingOneOf.values()) {
    if (!isExact(branches)) {
      for (const schema of schemas) {
        if (Array.isArray(schema.oneOf)) {
          schema.anyOf = schema.oneOf
          delete schema.oneOf
        }
      }
    }
  }
  for (const key of referenceKeys) {
    const representation = references[key]
    const fallback = getIdentifierFallback(representation)
    if (fallback === undefined) continue
    const schema = compiledDefinitions.get(key)!.schema
    const candidates = fallbackDefinitions.get(fallback)
    const match = candidates?.find((candidate) => Equal.equals(compiledDefinitions.get(candidate)!.schema, schema))
    if (match === undefined) {
      if (candidates === undefined) fallbackDefinitions.set(fallback, [key])
      else candidates.push(key)
    } else {
      definitionAliases.set(key, match)
    }
  }
  const schemas = Arr.map(compiledSchemas, finalizeJsonSchema)
  const definitions: Record<string, JsonSchema.JsonSchema> = {}
  for (const key of referenceKeys) {
    if (!definitionAliases.has(key)) {
      InternalRecord.assignProperty(definitions, key, finalizeJsonSchema(compiledDefinitions.get(key)!.schema))
    }
  }
  return { dialect: "draft-2020-12", schemas, definitions }

  function registerPendingOneOf(schema: JsonSchema.JsonSchema): JsonSchema.JsonSchema {
    if (Array.isArray(schema.oneOf)) pendingOneOf.get(schema.oneOf)?.schemas.push(schema)
    return schema
  }

  function compileAnnotatedMember(
    member: SchemaRepresentation.Element | SchemaRepresentation.PropertySignature,
    path: Path,
    dependencies: Array<Exactness>
  ): JsonSchema.JsonSchema {
    const schema = recur(member.type, [...path, "type"], dependencies)
    const annotations = collectJsonSchemaAnnotations(member.annotations, options)
    return annotations === undefined ? schema : registerPendingOneOf(appendJsonSchema(schema, annotations))
  }

  function compileDefinition(key: string, path: Path): CompiledJsonSchema {
    if (!Object.hasOwn(references, key)) {
      throw errorWithPath(`Invalid reference ${key}`, [...path, "$ref"])
    }
    const cached = compiledDefinitions.get(key)
    if (cached !== undefined) return cached

    // Register the dependency cell before compiling so recursive references share it.
    const result: CompiledJsonSchema = { schema: {}, dependencies: [] }
    compiledDefinitions.set(key, result)
    result.schema = recur(references[key], ["references", key], result.dependencies)
    return result
  }

  function finalizeJsonSchema(schema: JsonSchema.JsonSchema): JsonSchema.JsonSchema {
    return rewriteRefs(schema, ($ref) => {
      const pointer = decodeUriFragment($ref)
      if (pointer === undefined) {
        if (/^#(?:\/|%2f)/i.test($ref)) {
          throw new Error(`Invalid JSON Pointer URI fragment ${JSON.stringify($ref)}`)
        }
        return $ref
      }
      if (!pointer.startsWith("/$defs/")) return $ref
      const separator = pointer.indexOf("/", 7)
      const canonical = definitionAliases.get(
        unescapeToken(pointer.slice(7, separator < 0 ? undefined : separator))
      )
      if (canonical === undefined) return $ref
      // URI-encoded slashes separate pointer tokens; only ~1 represents a slash within a token.
      return $ref.replace(
        /^#(?:\/|%2f).*?(?:\/|%2f).*?(?=\/|%2f|$)/i,
        formatDefinitionReference(canonical)
      )
    })
  }

  function getIdentifierFallback(
    representation: SchemaRepresentation.Representation
  ): string | undefined {
    if (representation._tag === "Reference") return undefined
    const annotations = representation.checks.length === 0
      ? representation.annotations
      : representation.checks[representation.checks.length - 1].annotations
    return typeof annotations?.identifier !== "string" &&
        typeof annotations?.[InternalAnnotations.IDENTIFIER_FALLBACK_KEY] === "string"
      ? annotations[InternalAnnotations.IDENTIFIER_FALLBACK_KEY]
      : undefined
  }

  function compileCheck(
    check: SchemaRepresentation.Check,
    type: JsonSchema.Type | undefined,
    path: Path,
    dependencies: Array<Exactness>
  ): readonly [schema: JsonSchema.JsonSchema, inline?: true | undefined] | undefined {
    const annotations = check.annotations
    const callback = annotations?.toJsonSchema
    if (callback !== undefined) {
      const schemas = check.representation?.schemas?.map((schema, index) =>
        recur(schema, [...path, "representation", "schemas", index], dependencies)
      ) ?? []
      const result = (callback as SchemaRepresentation.ToJsonSchema.Check)({ type, schemas })
      const approximate = isApproximateCheckOutput(result)
      if (approximate) {
        dependencies.push(false)
      }
      const fragment = approximate ? result[0] : result
      const ordinary = collectJsonSchemaAnnotations(annotations, options)
      const schema = ordinary === undefined ? fragment : { ...fragment, ...ordinary }
      const allowed = ordinary === undefined ? inlineableCheckKeywords : inlineableAnnotatedCheckKeywords
      return [
        schema,
        check._tag === "Filter" &&
          hasOnlyKeywords(schema, allowed) &&
          (ordinary === undefined || hasOnlyKeywords(ordinary, promotableAnnotationKeywords))
          ? true
          : undefined
      ]
    }
    if (check._tag === "Filter") {
      dependencies.push(false)
      return undefined
    }

    const schemas = check.checks.flatMap((child, index) => {
      const result = compileCheck(child, type, [...path, "checks", index], dependencies)
      return result === undefined ? [] : [result[0]]
    })
    if (schemas.length === 0) return undefined
    const ordinary = collectJsonSchemaAnnotations(annotations, options)
    const schema = { allOf: schemas }
    return [ordinary === undefined ? schema : { ...schema, ...ordinary }]
  }

  function recur(
    representation: SchemaRepresentation.Representation,
    path: Path,
    dependencies: Array<Exactness>
  ): JsonSchema.JsonSchema {
    if (representation._tag === "Reference") {
      dependencies.push(compileDefinition(representation.$ref, path).dependencies)
      return { $ref: formatDefinitionReference(representation.$ref) }
    }
    const cached = compiledRepresentations.get(representation)
    if (cached !== undefined) {
      dependencies.push(cached.dependencies)
      return cached.schema
    }

    const local: Array<Exactness> = []
    dependencies.push(local)
    let output = {
      ...on(representation, path, local),
      ...collectJsonSchemaAnnotations(representation.annotations, options)
    }
    if (representation._tag === "String" && representation.content !== undefined) {
      const content = representation.content
      output.contentMediaType = content.mediaType
      delete output.contentSchema
      if (content.schema !== undefined) {
        output.contentSchema = recur(content.schema, [...path, "content", "schema"], [])
      }
    }
    for (let index = 0; index < representation.checks.length; index++) {
      const type = typeof output.type === "string" && isJsonSchemaType(output.type) ? output.type : undefined
      const check = compileCheck(representation.checks[index], type, [...path, "checks", index], local)
      if (check !== undefined) output = appendJsonSchema(output, ...check)
    }
    compiledRepresentations.set(representation, { schema: output, dependencies: local })
    return registerPendingOneOf(output)
  }

  function on(
    representation: Exclude<SchemaRepresentation.Representation, SchemaRepresentation.Reference>,
    path: Path,
    dependencies: Array<Exactness>
  ): JsonSchema.JsonSchema {
    switch (representation._tag) {
      case "Any":
      case "Unknown":
        return {}
      case "ObjectKeyword":
        return { anyOf: [{ type: "object" }, { type: "array" }] }
      case "Void":
      case "Undefined":
      case "Null":
        return { type: "null" }
      case "BigInt":
        return { type: "string", allOf: [{ pattern: "^-?\\d+$" }] }
      case "Symbol":
        return { type: "string", allOf: [{ pattern: "^Symbol\\(([\\s\\S]*)\\)$" }] }
      case "UniqueSymbol":
        return globalThis.Symbol.keyFor(representation.symbol) === undefined
          ? { not: {} }
          : { type: "string", enum: [globalThis.String(representation.symbol)] }
      case "Declaration":
        dependencies.push(false)
        return {}
      case "Suspend":
        return recur(representation.thunk, [...path, "thunk"], dependencies)
      case "Never":
        return { not: {} }
      case "String":
        return { type: "string" }
      case "Number":
        return {
          anyOf: [
            { type: "number" },
            { type: "string", enum: ["NaN", "Infinity", "-Infinity"] }
          ]
        }
      case "Boolean":
        return { type: "boolean" }
      case "Literal": {
        const literal = representation.literal
        return typeof literal === "bigint"
          ? { type: "string", enum: [globalThis.String(literal)] }
          : { type: typeof literal, enum: [literal] }
      }
      case "Enum": {
        const types = representation.enums.map(([title, literal]) => ({
          type: typeof literal,
          enum: [literal],
          title
        }))
        return types.length === 0 ? { not: {} } : { anyOf: types }
      }
      case "TemplateLiteral": {
        const { exact, pattern } = getTemplateLiteralPattern(representation.parts)
        if (!exact) dependencies.push(false)
        return { type: "string", pattern }
      }
      case "Arrays": {
        const out: JsonSchema.JsonSchema = { type: "array" }
        let minItems = representation.elements.length
        const prefixItems = representation.elements.map((element, index) => {
          if (element.isOptional) minItems--
          return compileAnnotatedMember(element, [...path, "elements", index], dependencies)
        })
        if (prefixItems.length > 0) {
          out.prefixItems = prefixItems
          out.maxItems = representation.elements.length
          if (minItems > 0) out.minItems = minItems
        } else {
          out.items = false
        }
        if (representation.rest.length === 1) {
          delete out.maxItems
          const rest = recur(representation.rest[0], [...path, "rest", 0], dependencies)
          if (Object.keys(rest).length > 0) out.items = rest
          else delete out.items
        } else if (representation.rest.length > 1) {
          delete out.maxItems
          delete out.items
          out.minItems = minItems + representation.rest.length - 1
          dependencies.push(false)
        }
        return out
      }
      case "Objects":
        return compileObjects(representation, path, dependencies)
      case "Union": {
        const branches: Array<Exactness> = []
        const types = representation.types.map((type, index) => recur(type, [...path, "types", index], branches))
        dependencies.push(branches)
        if (types.length === 0) return { not: {} }
        if (representation.options?.mode === "oneOf") {
          pendingOneOf.set(types, { branches, schemas: [] })
          return { oneOf: types }
        }
        if (types.length > 1) {
          const compacted = compactEnums(types)
          if (compacted !== undefined) return compacted
        }
        // A member that is only an `anyOf` adds no constraints of its own, so its alternatives can be spliced in.
        return {
          anyOf: types.flatMap((type) =>
            Array.isArray(type.anyOf) && Object.keys(type).length === 1 ? type.anyOf : [type]
          )
        }
      }
    }
  }

  function compileObjects(
    representation: SchemaRepresentation.Objects,
    path: Path,
    dependencies: Array<Exactness>
  ): JsonSchema.JsonSchema {
    const { indexSignatures, propertySignatures } = representation
    if (propertySignatures.length === 0 && indexSignatures.length === 0) return { not: { type: "null" } }

    const out: JsonSchema.JsonSchema = { type: "object" }
    const properties: Record<string, JsonSchema.JsonSchema> = {}
    const required: Array<string> = []
    for (const [index, property] of propertySignatures.entries()) {
      const propertyPath = [...path, "propertySignatures", index]
      if (typeof property.name !== "string") {
        throw errorWithPath("Objects property names must be strings", [...propertyPath, "name"])
      }
      InternalRecord.assignProperty(
        properties,
        property.name,
        compileAnnotatedMember(property, propertyPath, dependencies)
      )
      if (!property.isOptional) required.push(property.name)
    }
    if (propertySignatures.length > 0) out.properties = properties
    if (required.length > 0) out.required = required

    const indexes = indexSignatures.map((signature, index) => {
      const indexPath = [...path, "indexSignatures", index]
      const schema = recur(signature.type, [...indexPath, "type"], dependencies)
      const type: JsonSchema.JsonSchema | false = Equal.equals(schema, { not: {} }) ? false : schema
      const patterns = getParameterPatterns(signature.parameter, [...indexPath, "parameter"], new Set())
      if (patterns === undefined) dependencies.push(false)
      return { type, patterns }
    })
    const patternProperties: Record<string, JsonSchema.JsonSchema | false> = {}
    for (const { patterns, type } of indexes) {
      for (const pattern of patterns ?? []) {
        const previous = patternProperties[pattern]
        InternalRecord.assignProperty(
          patternProperties,
          pattern,
          previous === undefined
            ? type
            : previous === false || type === false
            ? false
            : registerPendingOneOf(appendJsonSchema(previous, type))
        )
      }
    }
    const hasPatternProperties = Object.keys(patternProperties).length > 0
    if (hasPatternProperties) out.patternProperties = patternProperties

    const additionalPropertySchemas = indexes.filter(({ patterns }) => patterns?.length === 0).map(({ type }) => type)
    const hasUnrepresentableIndexPattern = indexes.some(({ patterns }) => patterns === undefined)
    if (hasUnrepresentableIndexPattern && options?.onExcessProperty === "error") {
      const propertyNames: Array<JsonSchema.JsonSchema> = []
      if (propertySignatures.length > 0) propertyNames.push({ enum: Object.keys(properties) })
      for (const [index, signature] of indexSignatures.entries()) {
        propertyNames.push(
          getPropertyNameSchema(
            signature.parameter,
            [...path, "indexSignatures", index, "parameter"],
            dependencies,
            new Set()
          )
        )
      }
      out.propertyNames = propertyNames.length === 1 ? propertyNames[0] : { anyOf: propertyNames }
      const values = indexes.map(({ type }) => type)
      out.additionalProperties = values.length === 1 ? values[0] : { anyOf: values }
      if (additionalPropertySchemas.length > 0) {
        out.allOf = additionalPropertySchemas.map((type) => ({ type: "object", additionalProperties: type }))
      }
    } else if (additionalPropertySchemas.length === 0) {
      out.additionalProperties = hasUnrepresentableIndexPattern || options?.onExcessProperty !== "error"
    } else if (additionalPropertySchemas.length === 1 && propertySignatures.length === 0 && !hasPatternProperties) {
      out.additionalProperties = additionalPropertySchemas[0]
    } else {
      out.allOf = additionalPropertySchemas.map((type) => ({ type: "object", additionalProperties: type }))
    }
    if (
      typeof out.additionalProperties === "object" &&
      out.additionalProperties !== null &&
      Object.keys(out.additionalProperties).length === 0
    ) {
      delete out.additionalProperties
    }
    return out
  }

  function getPropertyNameSchema(
    parameter: SchemaRepresentation.Representation,
    path: Path,
    dependencies: Array<Exactness>,
    seenReferences: ReadonlySet<string>
  ): JsonSchema.JsonSchema {
    switch (parameter._tag) {
      case "Number":
        return { type: "string", pattern: numberKeyPattern }
      case "Reference": {
        if (seenReferences.has(parameter.$ref)) return { type: "string" }
        return getPropertyNameSchema(
          references[parameter.$ref],
          ["references", parameter.$ref],
          dependencies,
          new Set(seenReferences).add(parameter.$ref)
        )
      }
      case "Union":
        return { anyOf: parameter.types.map((type) => getPropertyNameSchema(type, path, dependencies, seenReferences)) }
      default:
        return recur(parameter, path, dependencies)
    }
  }

  function getParameterPatterns(
    parameter: SchemaRepresentation.Representation,
    path: Path,
    seenReferences: ReadonlySet<string>
  ): ReadonlyArray<string> | undefined {
    switch (parameter._tag) {
      case "Reference": {
        compileDefinition(parameter.$ref, path)
        if (seenReferences.has(parameter.$ref)) return undefined
        const next = new Set(seenReferences).add(parameter.$ref)
        return getParameterPatterns(references[parameter.$ref], ["references", parameter.$ref], next)
      }
      case "String": {
        if (parameter.checks.length === 0) return []
        if (
          parameter.checks.length !== 1 ||
          parameter.checks[0]._tag !== "Filter" ||
          parameter.checks[0].annotations?.toJsonSchema === undefined
        ) {
          return undefined
        }
        const dependencies: Array<Exactness> = []
        const schema = recur(parameter, path, dependencies)
        if (!isExact(dependencies)) return undefined
        return schema.type === "string" && typeof schema.pattern === "string" &&
            hasOnlyKeywords(schema, "|type|pattern|title|description|default|examples|readOnly|writeOnly|")
          ? [schema.pattern]
          : undefined
      }
      case "TemplateLiteral": {
        if (parameter.checks.length > 0) return undefined
        const { exact, pattern } = getTemplateLiteralPattern(parameter.parts)
        return exact ? [pattern] : undefined
      }
      case "Union": {
        if (parameter.types.length === 0 || parameter.checks.length > 0 || parameter.options?.mode === "oneOf") {
          return undefined
        }
        const patterns: Array<string> = []
        for (let index = 0; index < parameter.types.length; index++) {
          const memberPatterns = getParameterPatterns(parameter.types[index], [...path, "types", index], seenReferences)
          if (memberPatterns === undefined) return undefined
          if (memberPatterns.length === 0) return []
          patterns.push(...memberPatterns)
        }
        return patterns
      }
      case "Number":
        return parameter.checks.length === 0 ? [numberKeyPattern] : undefined
      default:
        throw errorWithPath(`Invalid index signature parameter ${parameter._tag}`, path)
    }
  }

  function getTemplateLiteralPattern(
    parts: ReadonlyArray<SchemaRepresentation.Representation>
  ): { pattern: string; exact: boolean } {
    const activeReferences = new Set<string>()
    let exact = true
    const pattern = `^${parts.map(getPartPattern).join("")}$`
    return { pattern, exact }

    function getPartPattern(part: SchemaRepresentation.Representation): string {
      // A segment check cannot generally be embedded in the enclosing pattern, even when it has a JSON Schema exporter.
      if (part._tag !== "Reference" && part.checks.length > 0) exact = false
      switch (part._tag) {
        case "Reference": {
          if (!Object.hasOwn(references, part.$ref)) {
            throw errorWithPath(`Invalid reference ${part.$ref}`, [])
          }
          if (activeReferences.has(part.$ref)) {
            throw errorWithPath(`Invalid recursive TemplateLiteral part ${part.$ref}`, [])
          }
          activeReferences.add(part.$ref)
          const pattern = getPartPattern(references[part.$ref])
          activeReferences.delete(part.$ref)
          return pattern
        }
        case "Literal":
          return RegEx.escape(globalThis.String(part.literal))
        case "String":
          return InternalAST.STRING_PATTERN
        case "Number":
          return InternalAST.FINITE_PATTERN
        case "BigInt":
          return "-?\\d+"
        case "TemplateLiteral":
          return part.parts.map(getPartPattern).join("")
        case "Union":
          if (part.types.length === 0) return "(?!)"
          // Regex alternatives do not enforce that exactly one branch matches.
          if (part.options?.mode === "oneOf") exact = false
          return `(?:${part.types.map(getPartPattern).join("|")})`
        default:
          throw errorWithPath(`Invalid TemplateLiteral part ${part._tag}`, [])
      }
    }
  }
}

function isJsonSchemaType(input: string): input is JsonSchema.Type {
  return input === "string" || input === "number" || input === "boolean" || input === "array" ||
    input === "object" || input === "null" || input === "integer"
}

function compactEnums(
  schemas: ReadonlyArray<JsonSchema.JsonSchema>
): JsonSchema.JsonSchema | undefined {
  let sharedType: unknown = undefined
  const values: Array<unknown> = []
  for (const schema of schemas) {
    const keys = Object.keys(schema)
    if (keys.length !== 2 || schema.type === undefined || !Array.isArray(schema.enum) || schema.enum.length === 0) {
      return undefined
    }
    if (sharedType === undefined) sharedType = schema.type
    else if (schema.type !== sharedType) return undefined
    for (const value of schema.enum) {
      if (values.includes(value)) return undefined
      values.push(value)
    }
  }
  return { type: sharedType, enum: values }
}

/** @internal */
export function toJsonSchemaDocument(
  document: SchemaRepresentation.Document,
  options?: Schema.ToJsonSchemaOptions
): JsonSchema.Document<"draft-2020-12"> {
  const output = compileJsonSchema(
    [document.representation],
    [["representation"]],
    document.references,
    options
  )
  return {
    dialect: output.dialect,
    schema: output.schemas[0],
    definitions: output.definitions
  }
}

/** @internal */
export function toJsonSchemaMultiDocument(
  document: SchemaRepresentation.MultiDocument,
  options?: Schema.ToJsonSchemaOptions
): JsonSchema.MultiDocument<"draft-2020-12"> {
  return compileJsonSchema(
    document.representations,
    document.representations.map((_, index) => ["representations", index]),
    document.references,
    options
  )
}
