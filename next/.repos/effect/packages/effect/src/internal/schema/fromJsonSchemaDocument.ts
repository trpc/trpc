import { escapeToken, parseUriFragment } from "../../JsonPointer.ts"
import * as JsonSchema from "../../JsonSchema.ts"
import * as Schema from "../../Schema.ts"
import * as InternalAST from "../../SchemaAST.ts"
import type * as SchemaRepresentation from "../../SchemaRepresentation.ts"
import { errorWithPath } from "../errors.ts"
import * as InternalJsonSchema from "../jsonSchema.ts"
import * as InternalRecord from "../record.ts"
import * as InternalAnnotations from "./annotations.ts"
import { ReferenceSlot } from "./fromRepresentation.ts"

type Path = ReadonlyArray<string | number>
type Check = Filter | FilterGroup | PropertyNames

interface Filter {
  readonly _tag: "Filter"
  readonly filter: InternalAST.Filter<any>
  readonly annotations?: Schema.Annotations.Filter | undefined
}

interface PropertyNames {
  readonly _tag: "PropertyNames"
  readonly type: ImportedJsonSchemaRepresentation
  readonly annotations?: Schema.Annotations.Filter | undefined
}

interface FilterGroup {
  readonly _tag: "FilterGroup"
  readonly checks: readonly [Check, ...Array<Check>]
  readonly annotations?: Schema.Annotations.Annotations | undefined
}

interface ImportedAnnotations {
  // Standard annotations may describe a value or a group of checks. Custom
  // annotations always describe the value, even when its checks simplify away.
  readonly annotations?: Schema.Annotations.Annotations | undefined
  readonly customAnnotations?: Schema.Annotations.Annotations | undefined
}

interface Checked extends ImportedAnnotations {
  readonly checks: ReadonlyArray<Check>
}

interface ImportedKeyword<Tag extends string> extends Checked {
  readonly _tag: Tag
}

interface ImportedLiteral extends ImportedKeyword<"Literal"> {
  readonly literal: string | number | boolean
}

interface ImportedElement {
  readonly type: ImportedJsonSchemaRepresentation
  readonly isOptional: boolean
}

interface ImportedArrays extends ImportedKeyword<"Arrays"> {
  readonly elements: ReadonlyArray<ImportedElement>
  readonly rest: ReadonlyArray<ImportedJsonSchemaRepresentation>
}

interface ImportedProperty extends ImportedElement {
  readonly name: string
}

interface ImportedIndexSignature {
  readonly parameter: ImportedJsonSchemaRepresentation
  readonly type: ImportedJsonSchemaRepresentation
}

interface ImportedReference extends SchemaRepresentation.Reference, ImportedAnnotations {
  readonly path: Path
}

interface ImportedObjects extends ImportedKeyword<"Objects"> {
  readonly propertySignatures: ReadonlyArray<ImportedProperty>
  readonly indexSignatures: ReadonlyArray<ImportedIndexSignature>
  readonly scopes: ReadonlyArray<ImportedObjectScope>
  readonly path: Path
}

interface ImportedUnion extends ImportedKeyword<"Union"> {
  readonly types: ReadonlyArray<ImportedJsonSchemaRepresentation>
  readonly options?: SchemaRepresentation.Union["options"]
}

// Import nodes keep source metadata and scopes until normalization is complete.
// Only finalize constructs runtime schemas after normalization.
type ImportedJsonSchemaRepresentation =
  | ImportedKeyword<"Never">
  | ImportedKeyword<"Unknown">
  | ImportedKeyword<"Null">
  | ImportedKeyword<"String">
  | ImportedKeyword<"Number">
  | ImportedKeyword<"Boolean">
  | ImportedLiteral
  | ImportedArrays
  | ImportedObjects
  | ImportedUnion
  | ImportedReference

interface ImportedObjectPattern {
  readonly source: string
  readonly parameter: ImportedKeyword<"String">
  readonly type: ImportedJsonSchemaRepresentation
}

interface ImportedObjectProperty {
  readonly type: ImportedJsonSchemaRepresentation | undefined
  readonly isOptional: boolean
}

interface ImportedObjectScope {
  readonly properties: ReadonlyMap<string, ImportedObjectProperty>
  readonly hasProperties: boolean
  readonly patterns: ReadonlyArray<ImportedObjectPattern>
  readonly additionalProperties: ImportedJsonSchemaRepresentation
}

const never: ImportedJsonSchemaRepresentation = { _tag: "Never", checks: [] }
const unknown: ImportedJsonSchemaRepresentation = { _tag: "Unknown", checks: [] }
const string: ImportedJsonSchemaRepresentation = { _tag: "String", checks: [] }
const primitiveSchemas = {
  Never: Schema.Never,
  Null: Schema.Null,
  String: Schema.String,
  Number: Schema.Number,
  Boolean: Schema.Boolean
}
const unsupportedStructuredValue = "Only primitive values are supported in \"const\" and \"enum\"."
const jsonSchemaPatternFlags = "u"

function isObject(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
}

function makeJsonLiteral(input: unknown, path: Path): ImportedJsonSchemaRepresentation | undefined {
  if (input === null) return { _tag: "Null", checks: [] }
  if (typeof input === "string" || typeof input === "number" || typeof input === "boolean") {
    return { _tag: "Literal", literal: input, checks: [] }
  }
  if (typeof input === "object") throw errorWithPath(unsupportedStructuredValue, path)
}

const jsonSchemaValueTypes = ["null", "string", "number", "boolean", "object", "array"] as const

const jsonSchemaTypeSpecificKeys = [
  "minLength",
  "maxLength",
  "pattern",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "properties",
  "required",
  "additionalProperties",
  "patternProperties",
  "propertyNames",
  "minProperties",
  "maxProperties",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
  "uniqueItems"
]

const jsonSchemaAnnotationExcludedKeys = new Set([
  ...jsonSchemaTypeSpecificKeys,
  ...InternalAnnotations.jsonSchemaAnnotationKeys,
  ...InternalAnnotations.annotationExcludedKeys,
  "$schema",
  "$id",
  "$ref",
  "$defs",
  "$anchor",
  "$dynamicRef",
  "$dynamicAnchor",
  "$vocabulary",
  "$comment",
  "type",
  "const",
  "enum",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
  "contains",
  "minContains",
  "maxContains",
  "dependentRequired",
  "dependentSchemas",
  "unevaluatedItems",
  "unevaluatedProperties",
  "definitions",
  "dependencies",
  "additionalItems",
  "identifier",
  "expected",
  "message",
  "messageMissingKey",
  "messageUnexpectedKey"
])

function isImportedJsonSchemaType(input: unknown): input is JsonSchema.Type {
  return input === "integer" || typeof input === "string" && jsonSchemaValueTypes.some((type) => type === input)
}

function hasTypeSpecificKeywords(schema: JsonSchema.JsonSchema): boolean {
  return jsonSchemaTypeSpecificKeys.some((key) => schema[key] !== undefined)
}

function makeFilter(filter: InternalAST.Filter<any>): Filter {
  return { _tag: "Filter", filter }
}

function addNumberCheck(
  checks: Array<Check>,
  value: unknown,
  make: (value: number) => InternalAST.Filter<any>
): void {
  if (typeof value === "number") {
    checks.push(makeFilter(make(value)))
  }
}

function jsonSchemaAnnotations(
  schema: JsonSchema.JsonSchema,
  options: SchemaRepresentation.FromJsonSchemaOptions | undefined
): ImportedAnnotations {
  const annotations: Record<string, Schema.Json> = {}
  if (typeof schema.title === "string") annotations.title = schema.title
  if (typeof schema.description === "string") annotations.description = schema.description
  if (Object.hasOwn(schema, "default")) annotations.default = schema.default as Schema.Json
  if (Array.isArray(schema.examples)) annotations.examples = schema.examples as ReadonlyArray<Schema.Json>
  if (typeof schema.readOnly === "boolean") annotations.readOnly = schema.readOnly
  if (typeof schema.writeOnly === "boolean") annotations.writeOnly = schema.writeOnly
  if (typeof schema.format === "string") annotations.format = schema.format
  if (typeof schema.contentEncoding === "string") annotations.contentEncoding = schema.contentEncoding
  if (typeof schema.contentMediaType === "string") annotations.contentMediaType = schema.contentMediaType
  if (InternalAST.isJson(schema.contentSchema)) annotations.contentSchema = schema.contentSchema
  let customAnnotations: Schema.Annotations.Annotations | undefined
  if (options?.includeAnnotationKey !== undefined) {
    for (const key of Object.keys(schema)) {
      if (
        key.startsWith("~") ||
        jsonSchemaAnnotationExcludedKeys.has(key) ||
        !options.includeAnnotationKey(key)
      ) continue
      const value = schema[key]
      if (InternalAST.isJson(value)) InternalRecord.assignProperty(customAnnotations ??= {}, key, value)
    }
  }
  return { annotations: Object.keys(annotations).length === 0 ? undefined : annotations, customAnnotations }
}

/** @internal */
export function fromJsonSchemaMultiDocument(
  document: JsonSchema.MultiDocument<"draft-2020-12">,
  options?: SchemaRepresentation.FromJsonSchemaOptions,
  singleRoot = false
): readonly [Schema.Top, ...Array<Schema.Top>] {
  const definitionCache = new Map<string, ImportedJsonSchemaRepresentation | null>()
  const validatedAliases = new Set<string>()
  const resolvingChoices = new Set<string>()
  const references = new Map<string, ReferenceSlot>()
  let inNestedResource = false

  function finalize(input: ImportedJsonSchemaRepresentation): Schema.Top {
    const annotations = mergeAnnotations(input.annotations, input.customAnnotations)
    if (input._tag === "Reference") {
      if (annotations !== undefined) resolveReference(input, input.path)
      let slot = references.get(input.$ref)
      if (slot === undefined) {
        slot = new ReferenceSlot(input.$ref)
        references.set(input.$ref, slot)
        slot.body = finalize(translateDefinition(input.$ref, input.path)).annotate({ identifier: input.$ref })
      }
      return annotations === undefined ? slot.body ?? slot.wrapper : slot.wrapper.annotate(annotations)
    }

    let schema: Schema.Top
    switch (input._tag) {
      case "Unknown":
        return Schema.Json.annotate({ ...annotations, expected: "JSON value" })
      case "Never":
      case "Null":
      case "String":
      case "Number":
      case "Boolean":
        schema = primitiveSchemas[input._tag]
        break
      case "Literal":
        schema = Schema.Literal(input.literal)
        break
      case "Arrays": {
        const elements = input.elements.map((element) => {
          const type = finalize(element.type)
          return element.isOptional ? Schema.optionalKey(type) : type
        })
        const rest = input.rest[0] === undefined ? undefined : finalize(input.rest[0])
        schema = rest !== undefined
          ? elements.length === 0
            ? Schema.Array(rest)
            : Schema.TupleWithRest(Schema.Tuple(elements), [rest])
          : Schema.Tuple(elements)
        break
      }
      case "Objects": {
        // Intersections may remove open patterns, so check the normalized object.
        if (
          input.indexSignatures[0]?.parameter === string &&
          input.scopes.some((scope) => scope.patterns.length > 0)
        ) {
          throw errorWithPath(
            "Cannot import open \"patternProperties\": unmatched keys cannot be typed correctly.",
            input.path
          )
        }
        const fields: Record<string, Schema.Top> = {}
        for (const property of input.propertySignatures) {
          const type = finalize(property.type)
          InternalRecord.assignProperty(fields, property.name, property.isOptional ? Schema.optionalKey(type) : type)
        }
        const index = input.indexSignatures[0]
        const record = index === undefined
          ? undefined
          : Schema.Record(finalize(index.parameter) as Schema.Record.Key, finalize(index.type))
        schema = record !== undefined
          ? input.propertySignatures.length === 0
            ? record
            : Schema.StructWithRest(Schema.Struct(fields), [record])
          : Schema.Struct(fields)
        break
      }
      case "Union":
        schema = Schema.Union(input.types.map(finalize), input.options)
        break
    }
    if (annotations !== undefined) schema = schema.annotate(annotations)
    const checks = input.checks.map(finalizeCheck)
    return checks.length > 0 ? schema.check(...checks as [InternalAST.Check<any>]) : schema
  }

  function finalizeCheck(check: Check): InternalAST.Check<any> {
    if (check._tag === "FilterGroup") {
      return Schema.makeFilterGroup(
        check.checks.map(finalizeCheck) as [InternalAST.Check<any>, ...Array<InternalAST.Check<any>>],
        check.annotations
      )
    }
    const filter = check._tag === "PropertyNames" ? Schema.isPropertyNames(finalize(check.type)) : check.filter
    return check.annotations === undefined ? filter : filter.annotate(check.annotations)
  }

  function annotate(
    representation: ImportedJsonSchemaRepresentation,
    source: ImportedAnnotations
  ): ImportedJsonSchemaRepresentation {
    if (source.annotations === undefined && source.customAnnotations === undefined) return representation
    return {
      ...representation,
      annotations: mergeAnnotations(representation.annotations, source.annotations),
      customAnnotations: mergeAnnotations(representation.customAnnotations, source.customAnnotations)
    }
  }

  function translateDefinition(
    key: string,
    path: Path,
    recursiveReferenceError?: string
  ): ImportedJsonSchemaRepresentation {
    const cached = definitionCache.get(key)
    if (cached !== undefined) {
      if (cached === null) {
        throw errorWithPath(
          recursiveReferenceError ??
            `Definition ${JSON.stringify(key)} is a circular alias.`,
          [...path, "$ref"]
        )
      }
      return cached
    }
    definitionCache.set(key, null)
    const pointer = pointers.get(key)
    const wasInNestedResource = inNestedResource
    if (pointer !== undefined) inNestedResource = pointer.crossesResource
    const representation = pointer === undefined
      ? translateSchema(document.definitions[key], ["definitions", key])
      : translateSchema(pointer.target, ["definitions", ...pointer.tokens])
    inNestedResource = wasInNestedResource
    definitionCache.set(key, representation)
    if (pointer !== undefined) {
      validatePointerAliases(representation, path, recursiveReferenceError)
    }
    return representation
  }

  function validatePointerAliases(
    representation: ImportedJsonSchemaRepresentation,
    path: Path,
    recursiveReferenceError?: string,
    visiting: Set<string> = new Set()
  ): void {
    if (representation._tag === "Reference") {
      const key = representation.$ref
      if (validatedAliases.has(key)) return
      if (visiting.has(key)) {
        throw errorWithPath(`Definition ${JSON.stringify(key)} is a circular alias.`, [...path, "$ref"])
      }
      visiting.add(key)
      validatePointerAliases(
        translateDefinition(key, path, recursiveReferenceError),
        path,
        recursiveReferenceError,
        visiting
      )
      visiting.delete(key)
      validatedAliases.add(key)
    } else if (representation._tag === "Union") {
      // Alternatives share completed checks, but only ancestors belong to the active path.
      for (const type of representation.types) {
        validatePointerAliases(type, path, recursiveReferenceError, visiting)
      }
    }
    // Recursion through object properties or array items consumes a child value.
  }

  function resolveReference(
    reference: ImportedReference,
    path: Path,
    recursiveReferenceError?: string,
    seen: Set<string> = new Set()
  ): ImportedJsonSchemaRepresentation {
    if (seen.has(reference.$ref)) {
      throw errorWithPath(
        `Definition ${JSON.stringify(reference.$ref)} is a circular alias.`,
        [...path, "$ref"]
      )
    }
    seen.add(reference.$ref)
    const representation = translateDefinition(reference.$ref, path, recursiveReferenceError)
    if (representation._tag === "Reference") {
      return annotate(
        resolveReference(representation, path, recursiveReferenceError, seen),
        representation
      )
    }
    return representation
  }

  // Pointers below a definition are registered as definitions keyed by their escaped tokens, e.g. "O/properties/v"
  const pointers = new Map<
    string,
    { readonly target: unknown; readonly tokens: ReadonlyArray<string>; readonly crossesResource: boolean }
  >()

  function resolvePointer($ref: string, path: Path): string {
    const pointer = $ref.startsWith("#") ? parseUriFragment($ref) : undefined
    if (pointer === undefined || pointer.length < 3 || pointer[0] !== "$defs") {
      throw errorWithPath(`Unsupported $ref ${JSON.stringify($ref)}. Use "#/$defs/Name".`, [...path, "$ref"])
    }
    const tokens = pointer.slice(1)
    const key = tokens.map(escapeToken).join("/")
    if (Object.hasOwn(document.definitions, key)) {
      throw errorWithPath(
        `Pointer $ref ${JSON.stringify($ref)} conflicts with definition ${JSON.stringify(key)}.`,
        [...path, "$ref"]
      )
    }
    if (pointers.has(key)) return key
    // Walk through the onEnter result of each ancestor schema, as translateSchema would see it
    let node: unknown = document.definitions
    let position: "schema" | "container" | "value" = "container"
    let crossesResource = false
    for (const token of tokens) {
      if (position === "container") {
        position = "schema"
      } else if (position === "schema" && isObject(node)) {
        if (options?.onEnter !== undefined) node = options.onEnter(node as JsonSchema.JsonSchema)
        crossesResource ||= isObject(node) && typeof node.$id === "string"
        const kind = InternalJsonSchema.getSubschemaKind(token)
        position = kind === "schema"
          ? "schema"
          : kind === undefined
          ? "value"
          : "container"
      } else {
        position = "value"
      }
      node = typeof node === "object" && node !== null && Object.hasOwn(node, token)
        ? (node as Record<string, unknown>)[token]
        : undefined
    }
    if (!isObject(node) && typeof node !== "boolean") {
      throw errorWithPath(
        `Unresolvable $ref ${JSON.stringify($ref)}. Nothing exists at that location.`,
        [...path, "$ref"]
      )
    }
    pointers.set(key, { target: node, tokens, crossesResource })
    return key
  }

  function mergeAnnotations(
    left: Schema.Annotations.Annotations | undefined,
    right: Schema.Annotations.Annotations | undefined
  ): Schema.Annotations.Annotations | undefined {
    if (left === undefined) return right
    if (right === undefined) return left
    return { ...left, ...right }
  }

  function annotateIntersection(
    representation: ImportedJsonSchemaRepresentation,
    left: ImportedAnnotations,
    right: ImportedAnnotations
  ): ImportedJsonSchemaRepresentation {
    return annotate(annotate(representation, left), right)
  }

  function intersectChecks(
    left: Checked,
    right: Checked,
    deduplicate: ReadonlyArray<string> = []
  ): Checked {
    let checks = right.checks
    for (const id of deduplicate) {
      if (left.checks.some((check) => check._tag === "Filter" && check.filter.annotations?.representation?.id === id)) {
        checks = checks.filter((check) =>
          check._tag !== "Filter" || check.filter.annotations?.representation?.id !== id
        )
      }
    }
    const annotations = checks.length === 0 ? mergeAnnotations(left.annotations, right.annotations) : left.annotations
    if (checks.length > 0 && right.annotations !== undefined) {
      checks = checks.length === 1 && checks[0].annotations === undefined
        ? [{ ...checks[0], annotations: right.annotations }]
        : [{
          _tag: "FilterGroup",
          checks: checks as [Check, ...Array<Check>],
          annotations: right.annotations
        }]
    }
    return {
      checks: [...left.checks, ...checks],
      annotations,
      customAnnotations: mergeAnnotations(left.customAnnotations, right.customAnnotations)
    }
  }

  function satisfiesPrimitiveCheck(check: Check, value: string | number): boolean {
    if (check._tag === "FilterGroup") {
      return check.checks.every((check) => satisfiesPrimitiveCheck(check, value))
    }
    return check._tag === "Filter" && check.filter.run(value, Schema.Unknown.ast, {}) === undefined
  }

  function satisfiesLiteral(
    representation: ImportedKeyword<"String"> | ImportedKeyword<"Number">,
    literal: ImportedLiteral
  ): boolean {
    const value = literal.literal
    if (representation._tag === "String" ? typeof value !== "string" : typeof value !== "number") {
      return false
    }
    return representation.checks.every((check) => satisfiesPrimitiveCheck(check, value as string | number))
  }

  function intersectPrimitiveWithLiteral(
    primitive: ImportedKeyword<"String"> | ImportedKeyword<"Number"> | ImportedKeyword<"Boolean">,
    literal: ImportedLiteral
  ): ImportedJsonSchemaRepresentation {
    const satisfies = primitive._tag === "Boolean"
      ? typeof literal.literal === "boolean"
      : satisfiesLiteral(primitive, literal)
    return satisfies ? annotateIntersection(literal, primitive, literal) : never
  }

  function intersectArrays(
    left: ImportedArrays,
    right: ImportedArrays,
    path: Path
  ): Pick<ImportedArrays, "elements" | "rest"> | undefined {
    const elements: Array<ImportedElement> = []
    const length = Math.max(left.elements.length, right.elements.length)
    for (let index = 0; index < length; index++) {
      const leftElement = left.elements[index]
      const rightElement = right.elements[index]
      const isOptional = leftElement?.isOptional !== false && rightElement?.isOptional !== false
      const leftType = leftElement?.type ?? left.rest[0]
      const rightType = rightElement?.type ?? right.rest[0]
      if (leftType === undefined || rightType === undefined) {
        return isOptional ? { elements, rest: [] } : undefined
      }
      const type = intersect(
        leftType,
        rightType,
        [...path, "elements", index, "type"]
      )
      if (type._tag === "Never") {
        return isOptional ? { elements, rest: [] } : undefined
      }
      elements.push({
        isOptional,
        type
      })
    }

    const leftRest = left.rest[0]
    const rightRest = right.rest[0]
    if (leftRest === undefined || rightRest === undefined) {
      return { elements, rest: [] }
    }
    const rest = intersect(
      leftRest,
      rightRest,
      [...path, "rest", 0]
    )
    return { elements, rest: rest._tag === "Never" ? [] : [rest] }
  }

  function intersectAll(
    types: ReadonlyArray<ImportedJsonSchemaRepresentation>,
    path: Path
  ): ImportedJsonSchemaRepresentation {
    let out = types[0] ?? unknown
    for (let index = 1; index < types.length; index++) {
      out = intersect(out, types[index], [...path, index])
    }
    return out
  }

  function lowerObject(
    scopes: ReadonlyArray<ImportedObjectScope>,
    checked: Checked,
    path: Path
  ): ImportedJsonSchemaRepresentation {
    const names = new Set<string>()
    let hasFiniteKeyDomain = false
    let requiresFiniteKeyDomain = false
    for (const scope of scopes) {
      for (const name of scope.properties.keys()) names.add(name)
      hasFiniteKeyDomain ||= scope.additionalProperties._tag === "Never" && scope.patterns.length === 0
      requiresFiniteKeyDomain ||= scope.additionalProperties._tag === "Never" ||
        scope.additionalProperties._tag !== "Unknown" && (scope.hasProperties || scope.patterns.length > 0)
    }
    const closedPattern = scopes.length === 1 && names.size === 0 &&
        scopes[0].additionalProperties._tag === "Never" && scopes[0].patterns.length === 1
      ? scopes[0].patterns[0]
      : undefined
    if (!hasFiniteKeyDomain && requiresFiniteKeyDomain && closedPattern === undefined) {
      throw errorWithPath(
        scopes.some((scope) => scope.additionalProperties._tag === "Never")
          ? "Cannot import this closed patterned object: only one pattern without properties is supported."
          : "Cannot combine typed \"additionalProperties\" with other property schemas: Effect index signatures also check excluded keys.",
        path
      )
    }

    const properties: Array<ImportedProperty> = []
    for (const name of names) {
      let isOptional = true
      const types: Array<ImportedJsonSchemaRepresentation> = []
      for (const scope of scopes) {
        const property = scope.properties.get(name)
        if (property !== undefined) {
          if (!property.isOptional) isOptional = false
          if (property.type !== undefined) types.push(property.type)
        }
        let matches = false
        for (const pattern of scope.patterns) {
          if (globalThis.RegExp(pattern.source, jsonSchemaPatternFlags).test(name)) {
            types.push(pattern.type)
            matches = true
          }
        }
        if (property?.type === undefined && !matches) types.push(scope.additionalProperties)
      }
      const type = intersectAll(types, [...path, "properties", name])
      if (!isOptional && type._tag === "Never") return never
      properties.push({ name, type, isOptional })
    }

    const indexSignatures: ReadonlyArray<ImportedIndexSignature> = closedPattern !== undefined
      ? [{ parameter: closedPattern.parameter, type: closedPattern.type }]
      : !hasFiniteKeyDomain
      ? [{
        parameter: string,
        type: intersectAll(
          scopes.map((scope) => scope.additionalProperties),
          [...path, "additionalProperties"]
        )
      }]
      : properties.length === 0
      ? [{ parameter: string, type: never }]
      : []
    return {
      _tag: "Objects",
      propertySignatures: properties,
      indexSignatures,
      scopes,
      path,
      ...checked
    }
  }

  const jsonRootTags = ["Null", "String", "Number", "Boolean", "Objects", "Arrays"] as const
  const allMasks = (1 << jsonRootTags.length) - 1

  function rootMask(representation: ImportedJsonSchemaRepresentation): number {
    switch (representation._tag) {
      case "Never":
        return 0
      case "Unknown":
      case "Reference":
        return allMasks
      case "Literal":
        switch (typeof representation.literal) {
          case "string":
            return 2
          case "number":
            return 4
          case "boolean":
            return 8
          default:
            return 0
        }
      case "Union": {
        let out = 0
        for (const type of representation.types) {
          out |= rootMask(type)
        }
        return out
      }
      default:
        return 1 << jsonRootTags.indexOf(representation._tag)
    }
  }

  function hasChoices(representation: ImportedJsonSchemaRepresentation): boolean {
    switch (representation._tag) {
      case "Reference": {
        const key = representation.$ref
        const cached = definitionCache.get(key)
        if (cached === null || resolvingChoices.has(key)) return true
        resolvingChoices.add(key)
        const out = hasChoices(cached ?? translateDefinition(key, representation.path))
        resolvingChoices.delete(key)
        return out
      }
      case "Union":
        // Finite primitive literal sets intersect without expansion, so they can be duplicated across branches.
        return !isLiteralSet(representation) &&
          (representation.types.length > 1 || representation.types.some(hasChoices))
      case "Arrays":
        return representation.elements.some((element) => hasChoices(element.type)) ||
          representation.rest.some(hasChoices)
      case "Objects":
        return representation.propertySignatures.some((property) => hasChoices(property.type)) ||
          representation.indexSignatures.some((indexSignature) =>
            hasChoices(indexSignature.parameter) ||
            hasChoices(indexSignature.type)
          ) ||
          representation.scopes.some((scope) => scope.patterns.some((pattern) => hasChoices(pattern.type))) ||
          representation.checks.some(checkHasChoices)
      default:
        return false
    }
  }

  function checkHasChoices(check: Check): boolean {
    return check._tag === "FilterGroup"
      ? check.checks.some(checkHasChoices)
      : check._tag === "PropertyNames" && hasChoices(check.type)
  }

  function makeUnion(
    source: ImportedUnion,
    types: ReadonlyArray<ImportedJsonSchemaRepresentation>
  ): ImportedJsonSchemaRepresentation {
    if (types.length === 0) return never
    if (types.length === 1 && source.checks.length === 0) return annotate(types[0], source)
    return { ...source, types }
  }

  function literalValue(
    representation: ImportedJsonSchemaRepresentation
  ): string | number | boolean | null | undefined {
    if (representation._tag === "Null") return null
    if (representation._tag !== "Literal") return undefined
    return representation.literal
  }

  function isLiteralSet(union: ImportedUnion): boolean {
    return (union.options?.mode ?? "anyOf") === "anyOf" &&
      union.types.every((type) => literalValue(type) !== undefined)
  }

  function intersectLiteralUnions(
    left: ImportedUnion,
    right: ImportedUnion,
    path: Path
  ): ImportedJsonSchemaRepresentation | undefined {
    if (!isLiteralSet(left) || !isLiteralSet(right)) return undefined
    const rightByValue = new Map<ReturnType<typeof literalValue>, ImportedJsonSchemaRepresentation>()
    for (const representation of right.types) {
      const value = literalValue(representation)
      const previous = rightByValue.get(value)
      rightByValue.set(value, {
        ...representation,
        customAnnotations: mergeAnnotations(previous?.customAnnotations, representation.customAnnotations)
      })
    }
    const types: Array<ImportedJsonSchemaRepresentation> = []
    for (const representation of left.types) {
      const match = rightByValue.get(literalValue(representation))
      if (match !== undefined) types.push(intersect(representation, annotate(match, right), path))
    }
    return makeUnion(left, types)
  }

  function intersectUnionWithType(
    union: ImportedUnion,
    type: ImportedJsonSchemaRepresentation,
    path: Path,
    unionOnLeft: boolean
  ): ImportedJsonSchemaRepresentation {
    const mask = rootMask(type)
    const members = union.types
      .map((member, index) => ({
        index,
        type: member
      }))
      .filter((member) => (rootMask(member.type) & mask) !== 0)
    if (members.length > 1 && hasChoices(type)) {
      return unsupportedIntersection(path)
    }
    if (members.length === 1 && union.checks.length === 0) {
      const member = annotate(members[0].type, union)
      return unionOnLeft
        ? intersect(member, type, [...path, "types", members[0].index])
        : intersect(type, member, [...path, "types", members[0].index])
    }
    return makeUnion(
      union,
      members
        .map((member) =>
          unionOnLeft
            ? intersect(member.type, type, [...path, "types", member.index])
            : intersect(type, member.type, [...path, "types", member.index])
        )
        .filter((type) => type._tag !== "Never")
    )
  }

  function isTypePartition(union: ImportedUnion): boolean {
    let mask = 0
    for (const type of union.types) {
      const memberMask = rootMask(type)
      if ((mask & memberMask) !== 0) return false
      mask |= memberMask
    }
    return true
  }

  function unsupportedIntersection(path: Path): never {
    throw errorWithPath(
      "Cannot intersect these \"anyOf\" or \"oneOf\" alternatives without expanding their branches.",
      path
    )
  }

  function intersectPartition(
    partition: ImportedUnion,
    other: ImportedUnion,
    path: Path,
    partitionOnLeft: boolean
  ): ImportedJsonSchemaRepresentation {
    const partitionTypes = partition.types
    const otherTypes = other.types
    for (const type of otherTypes) {
      const mask = rootMask(type)
      if (partitionTypes.filter((member) => (rootMask(member) & mask) !== 0).length > 1 && hasChoices(type)) {
        return unsupportedIntersection(path)
      }
    }
    const types: Array<ImportedJsonSchemaRepresentation> = []
    for (let index = 0; index < partitionTypes.length; index++) {
      const member = partitionTypes[index]
      const type = intersectUnionWithType(other, member, [...path, "types", index], !partitionOnLeft)
      if (type._tag !== "Never") types.push(type)
    }
    return makeUnion(partition, types)
  }

  function intersectUnions(
    left: ImportedUnion,
    right: ImportedUnion,
    path: Path
  ): ImportedJsonSchemaRepresentation {
    const literals = intersectLiteralUnions(left, right, path)
    if (literals !== undefined) return literals
    if (isTypePartition(left)) return intersectPartition(left, right, path, true)
    if (isTypePartition(right)) return intersectPartition(right, left, path, false)
    return unsupportedIntersection(path)
  }

  function intersect(
    left: ImportedJsonSchemaRepresentation,
    right: ImportedJsonSchemaRepresentation,
    path: Path
  ): ImportedJsonSchemaRepresentation {
    if (left._tag === "Never") return left
    if (right._tag === "Never") return right
    if (left._tag === "Unknown") return annotateIntersection(right, left, right)
    if (right._tag === "Unknown") return annotateIntersection(left, left, right)
    if (left._tag === "Reference") {
      // Resolve an unannotated reference first. An annotated empty definition
      // could otherwise leave the other reference unresolved during union partitioning.
      if (
        (left.annotations !== undefined || left.customAnnotations !== undefined) &&
        right._tag === "Reference" && right.annotations === undefined && right.customAnnotations === undefined
      ) {
        return intersect(left, resolveReference(right, path), path)
      }
      return annotate(intersect(resolveReference(left, path), right, path), left)
    }
    if (right._tag === "Reference") {
      return annotate(intersect(left, resolveReference(right, path), path), right)
    }
    if (left._tag === "Union" && right._tag === "Union") return intersectUnions(left, right, path)
    if (left._tag === "Union") return intersectUnionWithType(left, right, path, true)
    if (right._tag === "Union") return intersectUnionWithType(right, left, path, false)

    switch (left._tag) {
      case "Null":
        return right._tag === "Null"
          ? annotateIntersection({ _tag: "Null", checks: [...left.checks, ...right.checks] }, left, right)
          : never
      case "String":
        if (right._tag === "Literal") {
          return intersectPrimitiveWithLiteral(left, right)
        }
        if (right._tag !== "String") return never
        return { _tag: "String", ...intersectChecks(left, right) }
      case "Number":
        if (right._tag === "Literal") {
          return intersectPrimitiveWithLiteral(left, right)
        }
        if (right._tag !== "Number") return never
        return {
          _tag: "Number",
          ...intersectChecks(left, right, ["effect/schema/isFinite", "effect/schema/isInt"])
        }
      case "Boolean":
        if (right._tag === "Literal") {
          return intersectPrimitiveWithLiteral(left, right)
        }
        return right._tag === "Boolean"
          ? annotateIntersection(
            {
              _tag: "Boolean",
              checks: [...left.checks, ...right.checks]
            },
            left,
            right
          )
          : never
      case "Literal":
        if (right._tag === "Literal") {
          return left.literal === right.literal
            ? annotateIntersection(
              {
                ...left,
                checks: [...left.checks, ...right.checks]
              },
              left,
              right
            )
            : never
        }
        if (
          (right._tag === "String" || right._tag === "Number") && satisfiesLiteral(right, left) ||
          right._tag === "Boolean" && typeof left.literal === "boolean"
        ) {
          return annotateIntersection(left, left, right)
        }
        return never
      case "Arrays": {
        if (right._tag !== "Arrays") return never
        const arrays = intersectArrays(left, right, path)
        if (arrays === undefined) return never
        return { _tag: "Arrays", ...arrays, ...intersectChecks(left, right, ["effect/schema/isUnique"]) }
      }
      case "Objects": {
        if (right._tag !== "Objects") return never
        const scopes = [...left.scopes, ...right.scopes]
        return lowerObject(scopes, intersectChecks(left, right), path)
      }
    }
  }

  function translateSchema(
    input: unknown,
    path: Path,
    isRoot = false
  ): ImportedJsonSchemaRepresentation {
    if (input === false) {
      return never
    }
    if (!isObject(input)) return unknown
    const schema = options?.onEnter === undefined
      ? input as JsonSchema.JsonSchema
      : options.onEnter(input as JsonSchema.JsonSchema)
    if (schema === undefined) {
      return unknown
    }
    if (
      isObject(schema.not) &&
      Object.keys(schema.not).length === 0
    ) return annotate(never, jsonSchemaAnnotations(schema, options))
    const wasInNestedResource = inNestedResource
    inNestedResource ||= !isRoot && typeof schema.$id === "string"
    for (const keyword of Object.keys(schema)) {
      if (keyword === "if" && !Object.hasOwn(schema, "then") && !Object.hasOwn(schema, "else")) continue
      switch (keyword) {
        case "if":
        case "$dynamicRef":
        case "contains":
        case "dependentRequired":
        case "dependentSchemas":
        case "not":
        case "unevaluatedItems":
        case "unevaluatedProperties":
          throw errorWithPath(
            `Cannot import JSON Schema keyword "${keyword}": Effect has no equivalent constraint.`,
            [...path, keyword]
          )
      }
    }

    let representation = translateType(schema, path)
    if (Object.hasOwn(schema, "const")) {
      const constPath = [...path, "const"]
      const literal = makeJsonLiteral(schema.const, constPath)
      if (literal !== undefined) representation = intersect(representation, literal, constPath)
    }
    if (Array.isArray(schema.enum)) {
      const types = schema.enum.map((value, index) => makeJsonLiteral(value, [...path, "enum", index]) ?? unknown)
      representation = intersect(
        representation,
        types.length === 1
          ? types[0]
          : { _tag: "Union", types, checks: [] },
        [...path, "enum"]
      )
    }
    if (typeof schema.$ref === "string") {
      if (inNestedResource) {
        throw errorWithPath(
          "Cannot resolve $ref under a nested \"$id\". Resolve or flatten it first.",
          [...path, "$ref"]
        )
      }
      const key = JsonSchema.getReferenceKey(schema.$ref)
      if (key !== undefined && !Object.hasOwn(document.definitions, key)) {
        throw errorWithPath(
          `Missing definition ${JSON.stringify(key)} for $ref ${JSON.stringify(schema.$ref)}.`,
          [...path, "$ref"]
        )
      }
      const $ref = key ?? resolvePointer(schema.$ref, path)
      const reference: ImportedReference = { _tag: "Reference", $ref, path }
      representation = representation._tag === "Unknown"
        ? reference
        : representation._tag === "Never"
        ? never
        : intersect(
          resolveReference(
            reference,
            path,
            `Recursive $ref ${JSON.stringify(reference.$ref)} cannot have sibling constraints.`
          ),
          representation,
          path
        )
    }
    representation = annotate(representation, jsonSchemaAnnotations(schema, options))

    if (Array.isArray(schema.allOf)) {
      for (let index = 0; index < schema.allOf.length; index++) {
        representation = intersect(
          representation,
          translateSchema(schema.allOf[index], [...path, "allOf", index]),
          [...path, "allOf", index]
        )
      }
    }

    for (const mode of ["anyOf", "oneOf"] as const) {
      const members = schema[mode]
      if (Array.isArray(members)) {
        const union: ImportedJsonSchemaRepresentation = {
          _tag: "Union",
          types: members.map((member, index) => translateSchema(member, [...path, mode, index])),
          ...(mode === "oneOf" ? { options: { mode } } : {}),
          checks: []
        }
        representation = intersect(union, representation, [...path, mode])
      }
    }
    inNestedResource = wasInNestedResource
    return representation
  }

  function translateType(
    schema: JsonSchema.JsonSchema,
    path: Path
  ): ImportedJsonSchemaRepresentation {
    const types = Array.isArray(schema.type) && schema.type.every(isImportedJsonSchemaType)
      ? schema.type
      : !isImportedJsonSchemaType(schema.type) && hasTypeSpecificKeywords(schema)
      ? jsonSchemaValueTypes
      : undefined
    if (types !== undefined) {
      return {
        _tag: "Union",
        types: types.map((type) => translateType({ ...schema, type }, path)),
        checks: []
      }
    }

    const type = isImportedJsonSchemaType(schema.type) ? schema.type : undefined
    switch (type) {
      case "null":
        return { _tag: "Null", checks: [] }
      case "string":
        return {
          _tag: "String",
          checks: collectStringChecks(schema, path)
        }
      case "number":
      case "integer":
        return {
          _tag: "Number",
          checks: [
            makeFilter(type === "number" ? Schema.isFinite() : Schema.isInt()),
            ...collectNumberChecks(schema)
          ]
        }
      case "boolean":
        return { _tag: "Boolean", checks: [] }
      case "array": {
        const prefixItems = Array.isArray(schema.prefixItems) ? schema.prefixItems : undefined
        const minItems = typeof schema.minItems === "number" ? schema.minItems : 0
        const elements = prefixItems?.map((element, index) => ({
          isOptional: index + 1 > minItems,
          type: translateSchema(element, [...path, "prefixItems", index])
        })) ?? []
        const isTupleClosed = schema.items === false ||
          (schema.items === undefined &&
            prefixItems !== undefined &&
            schema.maxItems === prefixItems.length)
        const isMaxItemsRedundant = isTupleClosed &&
          typeof schema.maxItems === "number" &&
          schema.maxItems >= elements.length
        return {
          _tag: "Arrays",
          elements,
          rest: isTupleClosed
            ? []
            : [
              schema.items === undefined ? unknown : translateSchema(schema.items, [...path, "items"])
            ],
          checks: collectArrayChecks(schema, isMaxItemsRedundant)
        }
      }
      case "object": {
        const scope = collectObjectScope(schema, path)
        return lowerObject([scope], { checks: collectObjectChecks(schema, path) }, path)
      }
      default:
        return unknown
    }
  }

  function importPatternCheck(pattern: string, path: Path): Check | undefined {
    switch (options?.patterns ?? "error") {
      case "error":
        throw errorWithPath(
          "Patterns may block validation and are disabled. Use patterns: \"apply\" for trusted schemas or \"ignore\" to discard them.",
          path
        )
      case "ignore":
        return undefined
      case "apply": {
        let regex: RegExp
        try {
          regex = globalThis.RegExp(pattern, jsonSchemaPatternFlags)
        } catch {
          throw errorWithPath("Cannot import pattern using ECMAScript Unicode mode.", path)
        }
        return makeFilter(Schema.isPattern(regex))
      }
    }
  }

  function collectStringChecks(schema: JsonSchema.JsonSchema, path: Path): Array<Check> {
    const checks: Array<Check> = []
    if (schema.minLength === 1) {
      addNumberCheck(checks, schema.minLength, Schema.isMinLength)
    } else {
      addNumberCheck(checks, schema.minLength, Schema.isMinCodePoints)
    }
    addNumberCheck(checks, schema.maxLength, Schema.isMaxCodePoints)
    if (typeof schema.pattern === "string") {
      const check = importPatternCheck(schema.pattern, [...path, "pattern"])
      if (check !== undefined) checks.push(check)
    }
    return checks
  }

  function collectNumberChecks(schema: JsonSchema.JsonSchema): Array<Check> {
    const checks: Array<Check> = []
    addNumberCheck(checks, schema.minimum, Schema.isGreaterThanOrEqualTo)
    addNumberCheck(checks, schema.maximum, Schema.isLessThanOrEqualTo)
    addNumberCheck(checks, schema.exclusiveMinimum, Schema.isGreaterThan)
    addNumberCheck(checks, schema.exclusiveMaximum, Schema.isLessThan)
    addNumberCheck(checks, schema.multipleOf, Schema.isMultipleOf)
    return checks
  }

  function collectArrayChecks(schema: JsonSchema.JsonSchema, isMaxItemsRedundant: boolean): Array<Check> {
    const checks: Array<Check> = []
    if (
      !Array.isArray(schema.prefixItems) ||
      typeof schema.minItems === "number" && schema.minItems > schema.prefixItems.length
    ) {
      addNumberCheck(checks, schema.minItems, Schema.isMinLength)
    }
    if (!isMaxItemsRedundant) {
      addNumberCheck(checks, schema.maxItems, Schema.isMaxLength)
    }
    if (schema.uniqueItems === true) {
      checks.push(makeFilter(Schema.isUnique()))
    }
    return checks
  }

  function collectObjectScope(
    schema: JsonSchema.JsonSchema,
    path: Path
  ): ImportedObjectScope {
    const sourceProperties = isObject(schema.properties) ? schema.properties : {}
    const required = new Set(
      Array.isArray(schema.required)
        ? schema.required.filter((key): key is string => typeof key === "string")
        : []
    )
    const propertyNames = Object.keys(sourceProperties)
    const keys = new Set([...propertyNames, ...required])
    const properties = new Map(Array.from(keys, (name) => [name, {
      type: Object.hasOwn(sourceProperties, name)
        ? translateSchema(sourceProperties[name], [...path, "properties", name])
        : undefined,
      isOptional: !required.has(name)
    }]))
    const hasProperties = propertyNames.length > 0
    const patterns: Array<ImportedObjectPattern> = []
    if (
      isObject(schema.patternProperties)
    ) {
      for (const [pattern, value] of Object.entries(schema.patternProperties)) {
        const check = importPatternCheck(pattern, [...path, "patternProperties", pattern])
        if (check === undefined) return { properties, hasProperties, patterns: [], additionalProperties: unknown }
        patterns.push({
          source: pattern,
          parameter: {
            _tag: "String",
            checks: [check]
          },
          type: translateSchema(value, [...path, "patternProperties", pattern])
        })
      }
    }
    const additionalProperties = schema.additionalProperties === false
      ? never
      : isObject(schema.additionalProperties)
      ? translateSchema(schema.additionalProperties, [...path, "additionalProperties"])
      : unknown
    return { properties, hasProperties, patterns, additionalProperties }
  }

  function collectObjectChecks(
    schema: JsonSchema.JsonSchema,
    path: Path
  ): Array<Check> {
    const checks: Array<Check> = []
    addNumberCheck(checks, schema.minProperties, Schema.isMinProperties)
    addNumberCheck(checks, schema.maxProperties, Schema.isMaxProperties)
    if (schema.propertyNames !== undefined) {
      const propertyNamesPath = [...path, "propertyNames"]
      checks.push({
        _tag: "PropertyNames",
        type: intersect(
          string,
          translateSchema(schema.propertyNames, propertyNamesPath),
          propertyNamesPath
        )
      })
    }
    return checks
  }

  return document.schemas.map((schema, index) =>
    finalize(translateSchema(schema, singleRoot ? ["schema"] : ["schemas", index], true))
  ) as [Schema.Top, ...Array<Schema.Top>]
}

/** @internal */
export function fromJsonSchemaDocument(
  document: JsonSchema.Document<"draft-2020-12">,
  options: SchemaRepresentation.FromJsonSchemaOptions | undefined
): Schema.Top {
  return fromJsonSchemaMultiDocument(
    {
      dialect: document.dialect,
      schemas: [document.schema],
      definitions: document.definitions
    },
    options,
    true
  )[0]
}
