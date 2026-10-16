/**
 * Helpers for normalizing and converting JSON Schema and OpenAPI schema
 * documents. Supported inputs include JSON Schema Draft-07, Draft 2020-12,
 * OpenAPI 3.0, and OpenAPI 3.1; conversions normalize through
 * `Document<"draft-2020-12">` before emitting another dialect, including
 * JSON Schema Draft-04. The module also defines document types, meta-schema
 * constants, and OpenAPI component-key helpers.
 *
 * @since 4.0.0
 */
import * as InternalRecord from "./internal/record.ts"
import { formatUriFragment, parseUriFragment } from "./JsonPointer.ts"
import * as Predicate from "./Predicate.ts"

/**
 * A plain object representing a single JSON Schema node.
 *
 * **When to use**
 *
 * Use to represent an arbitrary JSON Schema object regardless of dialect.
 *
 * **Details**
 *
 * This is an open record type (`[x: string]: unknown`) so it can hold any JSON
 * Schema keyword. Most functions in this module accept or return this type.
 *
 * @category models
 * @since 4.0.0
 */
export interface JsonSchema {
  [x: string]: unknown
}

/**
 * The set of JSON Schema dialects supported by this module.
 *
 * **When to use**
 *
 * Use as the dialect marker for `JsonSchema` documents when parsing,
 * converting, or emitting schemas across the supported formats.
 *
 * **Details**
 *
 * Supported values are `"draft-04"` for JSON Schema Draft-04, `"draft-07"`
 * for JSON Schema Draft-07, `"draft-2020-12"` for JSON Schema Draft 2020-12
 * and the canonical internal form, `"openapi-3.1"` for OpenAPI 3.1, and
 * `"openapi-3.0"` for OpenAPI 3.0.
 *
 * @see {@link Document} for a single root schema tagged with a dialect
 * @see {@link MultiDocument} for multiple root schemas tagged with a dialect
 *
 * @category models
 * @since 4.0.0
 */
export type Dialect = "draft-04" | "draft-07" | "draft-2020-12" | "openapi-3.1" | "openapi-3.0"

/**
 * The JSON Schema primitive type names.
 *
 * **When to use**
 *
 * Use to restrict a JSON Schema `type` keyword to the supported primitive names.
 *
 * @category models
 * @since 4.0.0
 */
export type Type = "string" | "number" | "boolean" | "array" | "object" | "null" | "integer"

/**
 * A record of named JSON Schema definitions, keyed by definition name.
 *
 * **When to use**
 *
 * Use as the shared lookup table for named JSON Schema nodes that are
 * referenced from JSON Schema documents.
 *
 * **Details**
 *
 * The map is dialect-neutral. Conversion APIs emit it as `$defs`,
 * `definitions`, or `components.schemas` depending on the target format.
 *
 * @see {@link Document} for a single root schema with definitions
 * @see {@link MultiDocument} for multiple root schemas sharing definitions
 * @category models
 * @since 4.0.0
 */
export interface Definitions extends Record<string, JsonSchema> {}

/**
 * A structured container for a single JSON Schema and its associated
 * definitions.
 *
 * **When to use**
 *
 * Use when you need to carry a root schema together with its shared
 * definitions, or when converting between dialects with the `from*` and `to*`
 * functions.
 *
 * **Details**
 *
 * The `schema` field holds the root schema *without* the definitions
 * collection. Root definitions are stored separately in `definitions` and
 * referenced via `#/$defs/<name>` for Draft-2020-12, `#/definitions/<name>`
 * for Draft-04 and Draft-07, and `#/components/schemas/<name>` for OpenAPI 3.1
 * and OpenAPI 3.0.
 *
 * **Example** (Inspecting a parsed document)
 *
 * ```ts import.meta.vitest
 * import { JsonSchema } from "effect"
 *
 * const raw: JsonSchema.JsonSchema = {
 *   type: "string",
 *   $defs: { Trimmed: { type: "string", minLength: 1 } }
 * }
 *
 * const doc = JsonSchema.fromSchemaDraft2020_12(raw)
 *
 * doc.dialect // => "draft-2020-12"
 * doc.schema // => { type: "string" }
 * doc.definitions // => { Trimmed: { type: "string", minLength: 1 } }
 * ```
 *
 * @see {@link MultiDocument}
 * @see {@link fromSchemaDraft2020_12}
 * @category models
 * @since 4.0.0
 */
export interface Document<D extends Dialect> {
  readonly dialect: D
  readonly schema: JsonSchema
  readonly definitions: Definitions
}

/**
 * Like {@link Document}, but carries multiple root schemas that share a
 * single definitions pool.
 *
 * **When to use**
 *
 * Use when generating several schemas, such as a request body
 * and a response body, that reference the same set of definitions.
 *
 * **Details**
 *
 * The `schemas` tuple is non-empty and contains at least one element.
 *
 * @see {@link Document}
 * @see {@link toMultiDocumentOpenApi3_1}
 * @category models
 * @since 4.0.0
 */
export interface MultiDocument<D extends Dialect> {
  readonly dialect: D
  readonly schemas: readonly [JsonSchema, ...Array<JsonSchema>]
  readonly definitions: Definitions
}

/**
 * Represents the `$schema` meta-schema URI for JSON Schema Draft-04.
 *
 * **When to use**
 *
 * Use when constructing a Draft-04 JSON Schema document and you need a stable
 * value for the root `$schema` field.
 *
 * @see {@link META_SCHEMA_URI_DRAFT_07} for the Draft-07 `$schema` URI
 * @category constants
 * @since 4.0.0
 */
export const META_SCHEMA_URI_DRAFT_04 = "http://json-schema.org/draft-04/schema#"

/**
 * Represents the `$schema` meta-schema URI for JSON Schema Draft-07.
 *
 * **When to use**
 *
 * Use when constructing a Draft-07 JSON Schema document and you need a stable
 * value for the root `$schema` field.
 *
 * **Details**
 *
 * The exported value is the literal string
 * `http://json-schema.org/draft-07/schema#`.
 *
 * @see {@link META_SCHEMA_URI_DRAFT_04} for the Draft-04 `$schema` URI
 * @see {@link META_SCHEMA_URI_DRAFT_2020_12} for the Draft 2020-12 `$schema` URI
 *
 * @category constants
 * @since 4.0.0
 */
export const META_SCHEMA_URI_DRAFT_07 = "http://json-schema.org/draft-07/schema#"

/**
 * Represents the `$schema` meta-schema URI for JSON Schema Draft 2020-12.
 *
 * **When to use**
 *
 * Use when you need to populate the `$schema` field while emitting a JSON
 * Schema document that should declare JSON Schema Draft 2020-12.
 *
 * **Details**
 *
 * The exported value is the literal string
 * `https://json-schema.org/draft/2020-12/schema`.
 *
 * @see {@link META_SCHEMA_URI_DRAFT_07} for the Draft-07 `$schema` URI
 *
 * @category constants
 * @since 4.0.0
 */
export const META_SCHEMA_URI_DRAFT_2020_12 = "https://json-schema.org/draft/2020-12/schema"

const META_SCHEMA_URI_OPEN_API_3_1 = "https://spec.openapis.org/oas/3.1/dialect/base"

function isMetaSchemaUri(value: unknown, uri: string): boolean {
  return value === uri || value === (uri.endsWith("#") ? uri.slice(0, -1) : `${uri}#`)
}

function rewriteOpenApiComponentsReference(reference: string): string {
  const path = reference.startsWith("#") ? parseUriFragment(reference) : undefined
  return path !== undefined && path[0] === "components" && path[1] === "schemas"
    ? formatUriFragment(["$defs", ...path.slice(2)])
    : reference
}

const OPEN_API_31_TARGET_COLLISIONS = ["example", "discriminator", "xml", "externalDocs"]

/**
 * Parses a raw Draft-07 JSON Schema into a `Document<"draft-2020-12">`.
 *
 * **When to use**
 *
 * Use when you have a raw JSON Schema object that follows Draft-07 conventions
 * and need the canonical Draft-2020-12 document representation.
 *
 * **Details**
 *
 * This converts Draft-07 tuple syntax (`items` as array plus
 * `additionalItems`) to Draft-2020-12 form (`prefixItems` plus `items`), splits
 * `dependencies` into `dependentRequired` and `dependentSchemas`, converts
 * plain-name `$id` fragments to `$anchor`, and extracts root-level
 * `definitions` into the `definitions` field. Local JSON Pointer refs are
 * relocated when one of these structural conversions moves its target.
 *
 * **Gotchas**
 *
 * Unknown and custom keywords are copied as opaque values. Their contents are
 * not treated as nested schemas. Draft-07 keywords such as `if` / `then` /
 * `else` and `contains` are preserved and their subschemas are converted.
 * Siblings of a valid Draft-07 `$ref` are ignored according to Draft-07
 * semantics. The conversion throws when a Draft-07 `$id` fragment cannot be
 * represented as a Draft-2020-12 `$anchor`, or when an unknown Draft-07
 * keyword would become an active Draft-2020-12 keyword after copying.
 *
 * **Example** (Parsing a Draft-07 schema)
 *
 * ```ts import.meta.vitest
 * import { JsonSchema } from "effect"
 *
 * const raw: JsonSchema.JsonSchema = {
 *   type: "object",
 *   properties: {
 *     tags: {
 *       type: "array",
 *       items: { type: "string" }
 *     }
 *   }
 * }
 *
 * const doc = JsonSchema.fromSchemaDraft07(raw)
 * doc.dialect // => "draft-2020-12"
 * doc.schema.properties // => { tags: { type: "array", items: { type: "string" } } }
 * ```
 *
 * @see {@link fromSchemaDraft2020_12}
 * @see {@link fromSchemaOpenApi3_0}
 * @see {@link toDocumentDraft07}
 * @category decoding
 * @since 4.0.0
 */
export function fromSchemaDraft07(js: JsonSchema): Document<"draft-2020-12"> {
  return fromSchemaDraft2020_12(convertDraft07(js))
}

/**
 * Parses a raw Draft-2020-12 JSON Schema into a `Document<"draft-2020-12">`.
 *
 * **When to use**
 *
 * Use when you already have a raw JSON Schema object in Draft-2020-12 format.
 *
 * **Details**
 *
 * This separates `$defs` from the root schema into the `definitions` field.
 * Unlike {@link fromSchemaDraft07}, this performs no keyword rewriting.
 *
 * **Example** (Parsing a Draft-2020-12 schema)
 *
 * ```ts import.meta.vitest
 * import { JsonSchema } from "effect"
 *
 * const raw: JsonSchema.JsonSchema = {
 *   type: "number",
 *   minimum: 0,
 *   $defs: { PositiveInt: { type: "integer", minimum: 1 } }
 * }
 *
 * const doc = JsonSchema.fromSchemaDraft2020_12(raw)
 * doc.schema // => { type: "number", minimum: 0 }
 * doc.definitions // => { PositiveInt: { type: "integer", minimum: 1 } }
 * ```
 *
 * @see {@link fromSchemaDraft07}
 * @see {@link fromSchemaOpenApi3_1}
 * @category decoding
 * @since 4.0.0
 */
export function fromSchemaDraft2020_12(js: JsonSchema): Document<"draft-2020-12"> {
  const { $defs, ...schema } = js
  return {
    dialect: "draft-2020-12",
    schema,
    definitions: Predicate.isObject($defs) ? ($defs as Definitions) : {}
  }
}

/**
 * Parses a raw OpenAPI 3.1 JSON Schema into a `Document<"draft-2020-12">`.
 *
 * **When to use**
 *
 * Use when you need to consume raw JSON Schema objects from an OpenAPI 3.1
 * specification.
 *
 * **Details**
 *
 * This rewrites `#/components/schemas/...` refs to `#/$defs/...`, normalizes the
 * OpenAPI base dialect URI to Draft 2020-12, converts the deprecated singular
 * `example` field to `examples`, then delegates to
 * {@link fromSchemaDraft2020_12}.
 *
 * **Gotchas**
 *
 * When both `example` and `examples` are present, the singular example is
 * prepended to the array. Custom `$schema` dialect URIs and unknown keywords
 * are copied opaquely. Component references inside a schema resource identified
 * by `$id` are left unchanged because they are relative to that resource.
 *
 * **Example** (Parsing an OpenAPI 3.1 schema)
 *
 * ```ts import.meta.vitest
 * import { JsonSchema } from "effect"
 *
 * const raw: JsonSchema.JsonSchema = {
 *   type: "object",
 *   properties: {
 *     user: { $ref: "#/components/schemas/User" }
 *   }
 * }
 *
 * const doc = JsonSchema.fromSchemaOpenApi3_1(raw)
 * doc.schema.properties // => { user: { $ref: "#/$defs/User" } }
 * ```
 *
 * @see {@link fromSchemaOpenApi3_0}
 * @see {@link toMultiDocumentOpenApi3_1}
 * @category decoding
 * @since 4.0.0
 */
export function fromSchemaOpenApi3_1(js: JsonSchema): Document<"draft-2020-12"> {
  const isRootResource = createsResource(js.$id)
  const schema = transformSchema(js, (schema, inEmbeddedResource) => {
    if (!isRootResource && !inEmbeddedResource) rewriteSchemaRef(schema, rewriteOpenApiComponentsReference)
    if (isMetaSchemaUri(schema.$schema, META_SCHEMA_URI_OPEN_API_3_1)) {
      InternalRecord.assignProperty(schema, "$schema", META_SCHEMA_URI_DRAFT_2020_12)
    }
    if (Object.hasOwn(schema, "example")) {
      const examples = schema.examples
      if (examples === undefined || Array.isArray(examples)) {
        InternalRecord.assignProperty(schema, "examples", [schema.example, ...(examples ?? [])])
        delete schema.example
      }
    }
  }) as JsonSchema
  return fromSchemaDraft2020_12(schema)
}

/**
 * Parses a raw OpenAPI 3.0 JSON Schema into a `Document<"draft-2020-12">`.
 *
 * **When to use**
 *
 * Use when you need to consume raw JSON Schema objects from an OpenAPI 3.0
 * specification.
 *
 * **Details**
 *
 * This directly converts OpenAPI 3.0 schema objects to Draft-2020-12. It
 * handles `nullable`, singular `example`, boolean `exclusiveMinimum` and
 * `exclusiveMaximum`, and OpenAPI component refs. Only values in OpenAPI
 * schema positions are traversed as schemas.
 *
 * **Gotchas**
 *
 * OpenAPI 3.0 `nullable` is applied only when the same Schema Object has an
 * explicit string `type`; other constraints such as `enum` are left
 * unchanged. Unknown keywords, vendor extensions, and annotation values are
 * copied opaquely unless their name would become active in Draft 2020-12 and
 * change meaning, in which case conversion throws. Siblings of a valid
 * OpenAPI 3.0 `$ref` are ignored.
 *
 * **Example** (Parsing an OpenAPI 3.0 nullable schema)
 *
 * ```ts import.meta.vitest
 * import { JsonSchema } from "effect"
 *
 * const raw: JsonSchema.JsonSchema = {
 *   type: "string",
 *   nullable: true
 * }
 *
 * const doc = JsonSchema.fromSchemaOpenApi3_0(raw)
 * doc.schema.type // => ["string", "null"]
 * ```
 *
 * @see {@link fromSchemaOpenApi3_1}
 * @see {@link fromSchemaDraft07}
 * @category decoding
 * @since 4.0.0
 */
export function fromSchemaOpenApi3_0(schema: JsonSchema): Document<"draft-2020-12"> {
  return fromSchemaDraft2020_12(convertOpenApi30(schema))
}

/**
 * Converts a `Document<"draft-2020-12">` to a `Document<"draft-07">`.
 *
 * **When to use**
 *
 * Use when you need to output a canonical JSON Schema document in Draft-07
 * format.
 *
 * **Details**
 *
 * This rewrites `#/$defs/...` refs to `#/definitions/...`, converts
 * Draft-2020-12 tuple syntax (`prefixItems` plus `items`) to Draft-07 form
 * (`items` as array plus `additionalItems`), merges `dependentRequired` and
 * `dependentSchemas` into `dependencies`, and converts both the root schema
 * and all definitions. Local JSON Pointer refs are relocated when structural
 * keywords move.
 *
 * **Gotchas**
 *
 * Unknown and custom keywords are copied as opaque values. Known keywords
 * that Draft-07 cannot represent cause the conversion to throw
 * instead of being dropped. These include dynamic references,
 * `unevaluatedProperties`, `unevaluatedItems`, and non-default `minContains`
 * or `maxContains` constraints. Conversion also throws when an opaque
 * Draft-2020-12 keyword would collide with an active Draft-07 keyword, or when
 * `$id` and `$anchor` occur together because Draft-07 cannot preserve both identifiers.
 *
 * **Example** (Converting to Draft-07)
 *
 * ```ts import.meta.vitest
 * import { JsonSchema } from "effect"
 *
 * const doc = JsonSchema.fromSchemaDraft2020_12({
 *   type: "array",
 *   prefixItems: [{ type: "string" }, { type: "number" }],
 *   items: { type: "boolean" }
 * })
 *
 * const draft07 = JsonSchema.toDocumentDraft07(doc)
 * draft07.dialect // => "draft-07"
 * draft07.schema.items // => [{ type: "string" }, { type: "number" }]
 * draft07.schema.additionalItems // => { type: "boolean" }
 * ```
 *
 * @see {@link fromSchemaDraft07}
 * @see {@link toDocumentDraft04} for converting to Draft-04
 * @see {@link toMultiDocumentOpenApi3_1}
 * @category encoding
 * @since 4.0.0
 */
export function toDocumentDraft07(document: Document<"draft-2020-12">): Document<"draft-07"> {
  return {
    dialect: "draft-07",
    ...convertDocument(document, draft07Adapter)
  }
}

/**
 * Converts a `Document<"draft-2020-12">` to a `Document<"draft-04">`.
 *
 * **When to use**
 *
 * Use when you need to output a canonical JSON Schema document in Draft-04
 * format.
 *
 * **Details**
 *
 * This directly rewrites `#/$defs/...` refs to `#/definitions/...`, converts
 * tuple syntax, merges canonical dependencies, lowers `const` to `enum`,
 * converts numeric exclusive bounds to the Draft-04 boolean form, lowers
 * conditionals and basic `contains` through boolean applicators, and converts
 * both the root schema and all definitions.
 *
 * **Gotchas**
 *
 * Unknown and custom keywords are copied as opaque values. Newer annotation
 * keywords are preserved as Draft-04 extensions. Known keywords
 * without a Draft-04 equivalent, including `propertyNames`, non-default
 * `contains` cardinality, dynamic references, and unevaluated constraints,
 * cause the conversion to throw instead of being dropped. A conditional with
 * both branches also throws when lowering it would duplicate a nested schema
 * identifier. Conversion also throws when an opaque Draft-2020-12 keyword
 * would collide with an active Draft-04 keyword, or when `$id` and `$anchor`
 * occur together because Draft-04 cannot preserve both identifiers.
 *
 * **Example** (Converting exclusive bounds)
 *
 * ```ts import.meta.vitest
 * import { JsonSchema } from "effect"
 *
 * const doc = JsonSchema.fromSchemaDraft2020_12({
 *   type: "number",
 *   exclusiveMinimum: 0
 * })
 *
 * JsonSchema.toDocumentDraft04(doc).schema // => { type: "number", minimum: 0, exclusiveMinimum: true }
 * ```
 *
 * @see {@link toDocumentDraft07} for converting to Draft-07
 * @category encoding
 * @since 4.0.0
 */
export function toDocumentDraft04(document: Document<"draft-2020-12">): Document<"draft-04"> {
  return {
    dialect: "draft-04",
    ...convertDocument(document, draft04Adapter, {
      booleanAdapter: (schema) => schema ? {} : { not: {} }
    })
  }
}

/**
 * Converts a `MultiDocument<"draft-2020-12">` to a
 * `MultiDocument<"openapi-3.1">`.
 *
 * **When to use**
 *
 * Use when you need to emit an OpenAPI 3.1 multi-document from canonical JSON
 * Schema documents.
 *
 * **Details**
 *
 * This rewrites local `#/$defs/...` refs to `#/components/schemas/...` and
 * sanitizes definition keys to match the OpenAPI component key pattern
 * (`^[a-zA-Z0-9.\-_]+$`) by replacing invalid characters with `_`. Valid keys
 * are preserved. When sanitized keys collide, the converter appends the first
 * available `_1`, `_2`, and subsequent suffix, with allocation independent of
 * definition insertion order. All local refs are updated to use the allocated
 * keys, including refs to paths within a definition.
 *
 * **Gotchas**
 *
 * External refs and local refs outside `#/$defs` are left unchanged. Conversion
 * throws when a custom keyword would become an active OpenAPI keyword and
 * therefore change meaning. References inside schema resources identified by
 * `$id` are left unchanged. Conversion throws when an identified root schema
 * references the detached shared definitions pool because OpenAPI cannot
 * preserve that fragment reference.
 *
 * **Example** (Converting to OpenAPI 3.1)
 *
 * ```ts import.meta.vitest
 * import { JsonSchema } from "effect"
 *
 * const multi: JsonSchema.MultiDocument<"draft-2020-12"> = {
 *   dialect: "draft-2020-12",
 *   schemas: [{ $ref: "#/$defs/User" }],
 *   definitions: {
 *     User: { type: "object", properties: { name: { type: "string" } } }
 *   }
 * }
 *
 * const openapi = JsonSchema.toMultiDocumentOpenApi3_1(multi)
 * openapi.dialect // => "openapi-3.1"
 * openapi.schemas[0] // => { $ref: "#/components/schemas/User" }
 * ```
 *
 * @see {@link toDocumentDraft07}
 * @see {@link MultiDocument}
 * @category encoding
 * @since 4.0.0
 */
export function toMultiDocumentOpenApi3_1(multiDocument: MultiDocument<"draft-2020-12">): MultiDocument<"openapi-3.1"> {
  const definitionKeys = Object.keys(multiDocument.definitions)
  const keyMap = new Map<string, string>()
  const usedKeys = new Set(definitionKeys.filter((key) => VALID_OPEN_API_COMPONENTS_SCHEMAS_KEY_REGEXP.test(key)))
  const invalidKeys = definitionKeys
    .filter((key) => !VALID_OPEN_API_COMPONENTS_SCHEMAS_KEY_REGEXP.test(key))
    .sort()
    .map((key) => [key, sanitizeOpenApiComponentsSchemasKey(key)] as const)
  for (const [key, base] of invalidKeys) {
    if (usedKeys.has(base)) continue
    usedKeys.add(base)
    keyMap.set(key, base)
  }
  for (const [key, base] of invalidKeys) {
    if (keyMap.has(key)) continue
    let candidate: string
    let suffix = 0
    do candidate = `${base}_${++suffix}`
    while (usedKeys.has(candidate))
    usedKeys.add(candidate)
    keyMap.set(key, candidate)
  }

  function rewrite(
    schema: JsonSchema,
    rejectSharedDefinitionRefs = false
  ): JsonSchema {
    const isRootResource = createsResource(schema.$id)
    const localDefinitions = Predicate.isObject(schema.$defs) ? schema.$defs : undefined
    return transformSchema(schema, (schema, inEmbeddedResource) => {
      rejectKeywordCollisions(schema, OPEN_API_31_TARGET_COLLISIONS, "OpenAPI 3.1", "Draft 2020-12")
      rewriteSchemaRef(schema, (reference, keyword) => {
        const path = reference.startsWith("#") ? parseUriFragment(reference) : undefined
        if (path === undefined || path[0] !== "$defs" || path.length < 2) return reference
        const key = path[1]
        if (isRootResource) {
          if (
            rejectSharedDefinitionRefs &&
            !inEmbeddedResource &&
            Object.hasOwn(multiDocument.definitions, key) &&
            (localDefinitions === undefined || !Object.hasOwn(localDefinitions, key))
          ) {
            unsupported(keyword, "OpenAPI 3.1", "a schema resource cannot reference the shared definitions pool")
          }
          return reference
        }
        return inEmbeddedResource
          ? reference
          : formatUriFragment(["components", "schemas", keyMap.get(key) ?? key, ...path.slice(2)])
      })
    }) as JsonSchema
  }

  const schemas = multiDocument.schemas.map((schema) => rewrite(schema, true)) as unknown as MultiDocument<
    "openapi-3.1"
  >["schemas"]
  const definitions: Definitions = {}
  for (const key of definitionKeys) {
    InternalRecord.assignProperty(
      definitions,
      keyMap.get(key) ?? key,
      rewrite(multiDocument.definitions[key])
    )
  }

  return {
    dialect: "openapi-3.1",
    schemas,
    definitions
  }
}

/** @internal */
export const VALID_OPEN_API_COMPONENTS_SCHEMAS_KEY_REGEXP = /^[a-zA-Z0-9.\-_]+$/

/**
 * Returns a sanitized key for an OpenAPI component schema.
 * Should match the `^[a-zA-Z0-9.\-_]+$` regular expression.
 *
 * @internal
 */
export function sanitizeOpenApiComponentsSchemasKey(s: string): string {
  return s.length === 0 ? "_" : s.replace(/[^a-zA-Z0-9._-]/gu, "_")
}

/** @internal */
export function getReferenceKey($ref: string): string | undefined {
  const path = $ref.startsWith("#") ? parseUriFragment($ref) : undefined
  return path !== undefined && path.length === 2 && path[0] === "$defs"
    ? path[1]
    : undefined
}

function transformSchema(
  node: unknown,
  transform: (schema: Record<string, unknown>, inEmbeddedResource: boolean) => void
): unknown {
  return walk(node, false, true)

  function walk(node: unknown, inheritedResource: boolean, isRoot = false): unknown {
    if (!Predicate.isObject(node)) return node
    const inEmbeddedResource = inheritedResource || (!isRoot && createsResource(node.$id))

    const out: Record<string, unknown> = {}
    for (const key of Object.keys(node)) {
      const value = node[key]
      let transformed = value
      switch (key) {
        case "$defs":
        case "properties":
        case "patternProperties":
        case "dependentSchemas":
          transformed = mapObject(value, (value) => walk(value, inEmbeddedResource)) ?? value
          break
        case "allOf":
        case "anyOf":
        case "oneOf":
        case "prefixItems":
          transformed = Array.isArray(value) ? value.map((value) => walk(value, inEmbeddedResource)) : value
          break
        case "not":
        case "additionalProperties":
        case "propertyNames":
        case "unevaluatedProperties":
        case "items":
        case "contains":
        case "unevaluatedItems":
        case "if":
        case "then":
        case "else":
        case "contentSchema":
          transformed = walk(value, inEmbeddedResource)
      }
      InternalRecord.assignProperty(out, key, transformed)
    }
    transform(out, inEmbeddedResource)
    return out
  }
}

/** @internal */
export function rewriteRefs(schema: JsonSchema, rewrite: ($ref: string) => string): JsonSchema {
  return transformSchema(schema, (schema) => {
    rewriteSchemaRef(schema, rewrite)
  }) as JsonSchema
}

function rewriteSchemaRef(
  schema: Record<string, unknown>,
  rewrite: ($ref: string, keyword: "$ref" | "$dynamicRef") => string
): void {
  if (typeof schema.$ref === "string") {
    InternalRecord.assignProperty(schema, "$ref", rewrite(schema.$ref, "$ref"))
  }
  if (typeof schema.$dynamicRef === "string") {
    InternalRecord.assignProperty(schema, "$dynamicRef", rewrite(schema.$dynamicRef, "$dynamicRef"))
  }
}

function mapObject(
  value: unknown,
  f: (node: unknown, key: string) => unknown
): Record<string, unknown> | undefined {
  if (!Predicate.isObject(value)) return undefined
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value)) {
    InternalRecord.assignProperty(out, key, f(value[key], key))
  }
  return out
}

type Path = ReadonlyArray<string>
type Convert = (root: unknown, sourcePath?: Path, targetPath?: Path) => unknown

interface Context {
  readonly isDocumentRoot: boolean
  readonly schema: (value: unknown, sourceKey: string, targetKey?: string) => unknown
  readonly schemaAt: (value: unknown, sourcePath: Path, targetPath: Path) => unknown
  readonly schemaArray: (value: unknown, sourceKey: string, targetKey?: string) => unknown
  readonly schemaMap: (value: unknown, sourceKey: string, targetKey?: string) => unknown
  readonly reference: (out: JsonSchema, value: unknown) => void
}

type Adapter = (schema: JsonSchema, context: Context) => JsonSchema

type PendingReference = readonly [out: JsonSchema, value: string, sourceResource: string]

interface ResourceScope {
  readonly parent?: ResourceScope
  readonly sourceRoot: Path
  readonly targetRoot: Path
  readonly uri: string
}

interface ConverterOptions {
  readonly booleanAdapter?: (schema: boolean) => JsonSchema | boolean
  readonly trackIds?: boolean
  readonly ignoreRefSiblings?: boolean
}

// Adapters decide which values are schemas. The kernel only handles recursion,
// resource scopes, and reference relocation between structural source/target paths.
function runConverter<A>(adapter: Adapter, options: ConverterOptions | undefined, use: (convert: Convert) => A): A {
  const locations = new Map<string, Path>()
  const references: Array<PendingReference> = []
  let rootUri = ROOT_URI

  function convert(root: unknown, sourcePath: Path = [], targetPath: Path = []): unknown {
    if (sourcePath.length === 0 && options?.trackIds) {
      const id = Predicate.isObject(root) ? getResourceId(root) : undefined
      rootUri = resolveResourceUri(id, ROOT_URI) ?? ROOT_URI
    }
    return loop(root, sourcePath, targetPath, { sourceRoot: [], targetRoot: [], uri: rootUri })
  }

  function finish(): void {
    for (const [out, value, sourceResource] of references) {
      let reference = value
      const resolved = resolveUrl(value, sourceResource)
      if (resolved !== undefined) {
        const sourcePointer = parseUriFragment(resolved.hash)
        resolved.hash = ""
        if (sourcePointer !== undefined) {
          const targetPath = locations.get(locationKey(resolved.href, sourcePointer))
          if (targetPath !== undefined) reference = relocateReference(value, targetPath)
        }
      }
      InternalRecord.assignProperty(out, "$ref", reference)
    }
  }

  const out = use(convert)
  finish()
  return out

  function loop(
    node: unknown,
    sourcePath: Path,
    targetPath: Path,
    resourceScope: ResourceScope
  ): unknown {
    if (typeof node === "boolean") {
      recordLocations(sourcePath, targetPath, resourceScope)
      return options?.booleanAdapter?.(node) ?? node
    }
    if (!Predicate.isObject(node)) return node

    let currentResourceScope = resourceScope
    const id = getResourceId(node)
    if (sourcePath.length > 0 && options?.trackIds && createsResource(id)) {
      const uri = resolveResourceUri(id, resourceScope.uri)
      if (uri !== undefined) {
        currentResourceScope = {
          parent: resourceScope,
          sourceRoot: sourcePath,
          targetRoot: targetPath,
          uri
        }
      }
    }
    recordLocations(sourcePath, targetPath, currentResourceScope)
    const currentResource = currentResourceScope.uri

    const context: Context = {
      isDocumentRoot: sourcePath.length === 0,
      schema(value, sourceKey, targetKey = sourceKey) {
        return loop(value, [...sourcePath, sourceKey], [...targetPath, targetKey], currentResourceScope)
      },
      schemaAt(value, sourceSuffix, targetSuffix) {
        return loop(value, [...sourcePath, ...sourceSuffix], [...targetPath, ...targetSuffix], currentResourceScope)
      },
      schemaArray(value, sourceKey, targetKey = sourceKey) {
        return Array.isArray(value)
          ? value.map((item, index) =>
            loop(
              item,
              [...sourcePath, sourceKey, String(index)],
              [...targetPath, targetKey, String(index)],
              currentResourceScope
            )
          )
          : value
      },
      schemaMap(value, sourceKey, targetKey = sourceKey) {
        if (!Predicate.isObject(value)) return value
        return mapObject(value, (item, key) =>
          loop(
            item,
            [...sourcePath, sourceKey, key],
            [...targetPath, targetKey, key],
            currentResourceScope
          ))
      },
      reference(out, value) {
        if (typeof value === "string") {
          references.push([out, value, currentResource])
        } else {
          InternalRecord.assignProperty(out, "$ref", value)
        }
      }
    }
    return adapter(node, context)
  }

  function getResourceId(schema: JsonSchema): unknown {
    return options?.ignoreRefSiblings === true && typeof schema.$ref === "string" ? undefined : schema.$id
  }

  function recordLocations(sourcePath: Path, targetPath: Path, scope: ResourceScope): void {
    // A JSON Pointer can address an embedded schema from any containing resource.
    if (scope.parent !== undefined) recordLocations(sourcePath, targetPath, scope.parent)
    locations.set(
      locationKey(scope.uri, sourcePath.slice(scope.sourceRoot.length)),
      targetPath.slice(scope.targetRoot.length)
    )
  }
}

const ROOT_URI = "https://effect.invalid/.json-schema/"

function resolveUrl(value: string, base: string): URL | undefined {
  return URL.canParse(value, base) ? new URL(value, base) : undefined
}

function resolveResourceUri(value: unknown, base: string): string | undefined {
  if (typeof value !== "string") return undefined
  const url = resolveUrl(value, base)
  if (url === undefined) return undefined
  url.hash = ""
  return url.href
}

function relocateReference(reference: string, targetPath: Path): string {
  const index = reference.indexOf("#")
  if (index === -1 && targetPath.length === 0) return reference
  const uri = index === -1 ? reference : reference.slice(0, index)
  return `${uri}${formatUriFragment(targetPath)}`
}

function locationKey(resource: string, pointer: Path): string {
  return `${resource}\u0000${JSON.stringify(pointer)}`
}

function createsResource(id: unknown): boolean {
  return typeof id === "string" && id.length > 0 && id[0] !== "#"
}

function convertSchema(root: JsonSchema, adapter: Adapter, options?: ConverterOptions): JsonSchema {
  return runConverter(adapter, options, (convert) => convert(root) as JsonSchema)
}

function convertDocument(
  document: Document<"draft-2020-12">,
  adapter: Adapter,
  options?: ConverterOptions
): { readonly schema: JsonSchema; readonly definitions: Definitions } {
  return runConverter(adapter, { ...options, trackIds: true }, (convert) => ({
    schema: convert(document.schema) as JsonSchema,
    definitions: mapObject(
      document.definitions,
      (definition, key) => convert(definition, ["$defs", key], ["definitions", key]) as JsonSchema
    ) as Definitions
  }))
}

const SCHEMA_MAP_KEYWORDS = new Set(["properties", "patternProperties"])
const SCHEMA_ARRAY_KEYWORDS = new Set(["allOf", "anyOf", "oneOf"])
const JSON_SCHEMA_SINGLE_KEYWORDS = new Set([
  "not",
  "additionalProperties",
  "propertyNames",
  "contains",
  "if",
  "then",
  "else",
  "contentSchema"
])
const OPEN_API_30_SCHEMA_MAP_KEYWORDS = new Set(["properties"])
const OPEN_API_30_SCHEMA_SINGLE_KEYWORDS = new Set(["not", "items", "additionalProperties"])
const DRAFT_04_SCHEMA_SINGLE_KEYWORDS = new Set(["not", "additionalProperties", "contentSchema"])

function convertSubschemaKeyword(
  out: JsonSchema,
  key: string,
  value: unknown,
  context: Context,
  singleKeywords: ReadonlySet<string>,
  mapKeywords: ReadonlySet<string> = SCHEMA_MAP_KEYWORDS
): boolean {
  let converted: unknown
  if (mapKeywords.has(key)) converted = context.schemaMap(value, key)
  else if (SCHEMA_ARRAY_KEYWORDS.has(key)) converted = context.schemaArray(value, key)
  else if (singleKeywords.has(key)) converted = context.schema(value, key)
  else return false
  InternalRecord.assignProperty(out, key, converted)
  return true
}

const PRE_2020_TO_2020_COLLISIONS = [
  "$anchor",
  "$defs",
  "$dynamicAnchor",
  "$dynamicRef",
  "$vocabulary",
  "contentSchema",
  "dependentRequired",
  "dependentSchemas",
  "maxContains",
  "minContains",
  "prefixItems",
  "unevaluatedItems",
  "unevaluatedProperties"
]
const DRAFT_07_TO_2020_COLLISIONS = [...PRE_2020_TO_2020_COLLISIONS, "deprecated"]
const OPEN_API_30_TO_2020_COLLISIONS = [
  ...PRE_2020_TO_2020_COLLISIONS,
  "$comment",
  "$id",
  "$schema",
  "const",
  "contains",
  "contentEncoding",
  "contentMediaType",
  "else",
  "examples",
  "if",
  "patternProperties",
  "propertyNames",
  "then"
]
const ANCHOR_REGEXP = /^[A-Za-z_][-A-Za-z0-9._]*$/
const LEGACY_ID_FRAGMENT_REGEXP = /^[A-Za-z][-A-Za-z0-9._:]*$/

function convertDraft07(root: JsonSchema): JsonSchema {
  return convertSchema(root, (source, context) => {
    const out: JsonSchema = {}

    if (typeof source.$ref === "string") {
      context.reference(out, source.$ref)
      if (Object.hasOwn(source, "definitions")) {
        InternalRecord.assignProperty(out, "$defs", context.schemaMap(source.definitions, "definitions", "$defs"))
      }
      return out
    }
    rejectKeywordCollisions(source, DRAFT_07_TO_2020_COLLISIONS, "Draft 2020-12", "Draft-07")

    let items: unknown = undefined
    let additionalItems: unknown = undefined

    for (const key of Object.keys(source)) {
      const value = source[key]
      if (convertSubschemaKeyword(out, key, value, context, JSON_SCHEMA_SINGLE_KEYWORDS)) continue
      switch (key) {
        case "$schema":
          InternalRecord.assignProperty(
            out,
            key,
            isMetaSchemaUri(value, META_SCHEMA_URI_DRAFT_07) ? META_SCHEMA_URI_DRAFT_2020_12 : value
          )
          break
        case "$id":
          convertDraft07Id(out, value)
          break
        case "definitions":
          InternalRecord.assignProperty(out, "$defs", context.schemaMap(value, key, "$defs"))
          break
        case "dependencies": {
          if (!Predicate.isObject(value)) {
            InternalRecord.assignProperty(out, key, value)
            break
          }
          const dependentRequired: JsonSchema = {}
          const dependentSchemas: JsonSchema = {}
          for (const dependency of Object.keys(value)) {
            const dependencyValue = value[dependency]
            InternalRecord.assignProperty(
              Array.isArray(dependencyValue) ? dependentRequired : dependentSchemas,
              dependency,
              Array.isArray(dependencyValue)
                ? dependencyValue
                : context.schemaAt(
                  dependencyValue,
                  ["dependencies", dependency],
                  ["dependentSchemas", dependency]
                )
            )
          }
          if (Object.keys(dependentRequired).length > 0) {
            InternalRecord.assignProperty(out, "dependentRequired", dependentRequired)
          }
          if (Object.keys(dependentSchemas).length > 0) {
            InternalRecord.assignProperty(out, "dependentSchemas", dependentSchemas)
          }
          break
        }
        case "items":
          items = value
          break
        case "additionalItems":
          additionalItems = value
          break
        default:
          InternalRecord.assignProperty(out, key, value)
      }
    }

    if (items !== undefined) {
      if (Array.isArray(items)) {
        InternalRecord.assignProperty(out, "prefixItems", context.schemaArray(items, "items", "prefixItems"))
        if (additionalItems !== undefined) {
          InternalRecord.assignProperty(out, "items", context.schema(additionalItems, "additionalItems", "items"))
        }
      } else {
        InternalRecord.assignProperty(out, "items", context.schema(items, "items"))
      }
    }

    return out
  }, { trackIds: true, ignoreRefSiblings: true })
}

function convertDraft07Id(out: JsonSchema, value: unknown): void {
  if (typeof value !== "string" || !value.includes("#")) {
    InternalRecord.assignProperty(out, "$id", value)
    return
  }
  const fragmentIndex = value.indexOf("#")
  const id = value.slice(0, fragmentIndex)
  const anchor = value.slice(fragmentIndex + 1)
  if (anchor.length === 0) {
    if (id.length > 0) InternalRecord.assignProperty(out, "$id", id)
    return
  }
  if (!ANCHOR_REGEXP.test(anchor)) {
    unsupported("$id", "Draft 2020-12", `fragment "#${anchor}" is not a valid $anchor`)
  }
  if (id.length > 0) InternalRecord.assignProperty(out, "$id", id)
  InternalRecord.assignProperty(out, "$anchor", anchor)
}

function unsupported(keyword: string, dialect: string, details: string): never {
  throw new Error(`Cannot convert JSON Schema keyword "${keyword}" to ${dialect}: ${details}`)
}

function rejectKeywordCollisions(
  source: JsonSchema,
  keywords: ReadonlyArray<string>,
  targetDialect: string,
  sourceDialect: string
): void {
  for (const keyword of keywords) {
    if (Object.hasOwn(source, keyword)) {
      unsupported(keyword, targetDialect, `it is not active in ${sourceDialect} but would become active in the target`)
    }
  }
}

const DRAFT_07_TARGET_COLLISIONS = ["additionalItems", "definitions", "dependencies"]

function convertMetaSchemaKeyword(
  out: JsonSchema,
  value: unknown,
  context: Context,
  targetUri: string,
  targetDialect: string
): void {
  if (context.isDocumentRoot) {
    InternalRecord.assignProperty(
      out,
      "$schema",
      isMetaSchemaUri(value, META_SCHEMA_URI_DRAFT_2020_12) ? targetUri : value
    )
  } else if (!isMetaSchemaUri(value, META_SCHEMA_URI_DRAFT_2020_12)) {
    unsupported("$schema", targetDialect, "an embedded resource cannot declare a different dialect")
  }
}

function draft07Adapter(source: JsonSchema, context: Context): JsonSchema {
  rejectKeywordCollisions(source, DRAFT_07_TARGET_COLLISIONS, "Draft-07", "Draft 2020-12")
  const out: JsonSchema = {}
  let reference: unknown = undefined
  let prefixItems: unknown = undefined
  let items: unknown = undefined

  for (const key of Object.keys(source)) {
    const value = source[key]
    if (convertSubschemaKeyword(out, key, value, context, JSON_SCHEMA_SINGLE_KEYWORDS)) continue
    switch (key) {
      case "$ref":
        reference = value
        break
      case "$schema":
        convertMetaSchemaKeyword(out, value, context, META_SCHEMA_URI_DRAFT_07, "Draft-07")
        break
      case "$id":
      case "$anchor":
        break
      case "$defs":
        InternalRecord.assignProperty(out, "definitions", context.schemaMap(value, key, "definitions"))
        break
      case "prefixItems":
        prefixItems = value
        break
      case "items":
        items = value
        break
      case "dependentRequired":
      case "dependentSchemas":
      case "minContains":
      case "maxContains":
        break
      case "$dynamicRef":
      case "$dynamicAnchor":
      case "$vocabulary":
      case "unevaluatedProperties":
      case "unevaluatedItems":
        unsupported(key, "Draft-07", "the target dialect has no equivalent")
      case "required":
        if (Array.isArray(value) && value.length === 0) break
        InternalRecord.assignProperty(out, key, value)
        break
      default:
        InternalRecord.assignProperty(out, key, value)
    }
  }

  convertTuple(out, prefixItems, items, context)

  if (Object.hasOwn(source, "contains")) {
    const minContains = source.minContains
    const maxContains = source.maxContains
    if ((minContains !== undefined && minContains !== 1) || maxContains !== undefined) {
      unsupported("minContains/maxContains", "Draft-07", "contains cardinality cannot be represented")
    }
    if (Object.hasOwn(source, "minContains")) InternalRecord.assignProperty(out, "minContains", minContains)
  } else {
    if (Object.hasOwn(source, "minContains")) InternalRecord.assignProperty(out, "minContains", source.minContains)
    if (Object.hasOwn(source, "maxContains")) InternalRecord.assignProperty(out, "maxContains", source.maxContains)
  }

  convertDependencies(source, out, context, "draft-07")
  convertLegacyId(source, out, "$id", "Draft-07")

  convertReference(out, reference, context)

  return out
}

function convertTuple(out: JsonSchema, prefixItems: unknown, items: unknown, context: Context): void {
  if (prefixItems === undefined) {
    if (items !== undefined) InternalRecord.assignProperty(out, "items", context.schema(items, "items"))
    return
  }
  InternalRecord.assignProperty(out, "items", context.schemaArray(prefixItems, "prefixItems", "items"))
  if (items !== undefined) {
    InternalRecord.assignProperty(out, "additionalItems", context.schema(items, "items", "additionalItems"))
  }
}

function convertReference(out: JsonSchema, reference: unknown, context: Context): void {
  if (reference === undefined) return
  if (typeof reference === "string" && Object.keys(out).length > 0) {
    const referenceSchema: JsonSchema = {}
    context.reference(referenceSchema, reference)
    appendAllOf(out, referenceSchema)
  } else {
    context.reference(out, reference)
  }
}

function convertDependencies(
  source: JsonSchema,
  out: JsonSchema,
  context: Context,
  targetDialect: "draft-04" | "draft-07"
): void {
  const dependentRequired = Predicate.isObject(source.dependentRequired) ? source.dependentRequired : undefined
  const dependentSchemas = Predicate.isObject(source.dependentSchemas) ? source.dependentSchemas : undefined
  if (dependentRequired === undefined && dependentSchemas === undefined) return

  const dependencies: JsonSchema = {}
  const keys = new Set([
    ...Object.keys(dependentRequired ?? {}),
    ...Object.keys(dependentSchemas ?? {})
  ])
  for (const key of keys) {
    const required = dependentRequired?.[key]
    const dependency = dependentSchemas?.[key]
    const omitRequired = targetDialect === "draft-04" && Array.isArray(required) && required.length === 0
    if (dependency === undefined) {
      if (!omitRequired) InternalRecord.assignProperty(dependencies, key, required)
    } else if (required === undefined || omitRequired) {
      InternalRecord.assignProperty(
        dependencies,
        key,
        context.schemaAt(dependency, ["dependentSchemas", key], ["dependencies", key])
      )
    } else {
      InternalRecord.assignProperty(dependencies, key, {
        allOf: [
          context.schemaAt(dependency, ["dependentSchemas", key], ["dependencies", key, "allOf", "0"]),
          { required }
        ]
      })
    }
  }
  if (Object.keys(dependencies).length > 0) InternalRecord.assignProperty(out, "dependencies", dependencies)
}

function convertOpenApi30(root: JsonSchema): JsonSchema {
  return convertSchema(root, (source, context) => {
    const out: JsonSchema = {}

    if (typeof source.$ref === "string") {
      context.reference(out, rewriteOpenApiComponentsReference(source.$ref))
      return out
    }
    rejectKeywordCollisions(source, OPEN_API_30_TO_2020_COLLISIONS, "Draft 2020-12", "OpenAPI 3.0")

    for (const key of Object.keys(source)) {
      const value = source[key]
      if (
        convertSubschemaKeyword(
          out,
          key,
          value,
          context,
          OPEN_API_30_SCHEMA_SINGLE_KEYWORDS,
          OPEN_API_30_SCHEMA_MAP_KEYWORDS
        )
      ) {
        continue
      }
      switch (key) {
        case "example":
          InternalRecord.assignProperty(out, "examples", [value])
          break
        case "nullable":
        case "exclusiveMinimum":
        case "exclusiveMaximum":
          break
        default:
          InternalRecord.assignProperty(out, key, value)
      }
    }

    convertOpenApiExclusiveBound(source, out, "minimum")
    convertOpenApiExclusiveBound(source, out, "maximum")

    if (source.nullable === true && typeof source.type === "string") {
      InternalRecord.assignProperty(out, "type", [source.type, "null"])
    }

    return out
  })
}

function convertOpenApiExclusiveBound(
  source: JsonSchema,
  out: JsonSchema,
  boundKey: "minimum" | "maximum"
): void {
  const exclusiveKey = boundKey === "minimum" ? "exclusiveMinimum" : "exclusiveMaximum"
  const exclusive = source[exclusiveKey]
  if (typeof exclusive !== "boolean") {
    if (exclusive !== undefined) InternalRecord.assignProperty(out, exclusiveKey, exclusive)
    return
  }
  if (exclusive && typeof source[boundKey] === "number") {
    InternalRecord.assignProperty(out, exclusiveKey, source[boundKey])
    delete out[boundKey]
  }
}

const DRAFT_04_TARGET_COLLISIONS = ["additionalItems", "definitions", "dependencies", "id"]

function draft04Adapter(source: JsonSchema, context: Context): JsonSchema {
  rejectKeywordCollisions(source, DRAFT_04_TARGET_COLLISIONS, "Draft-04", "Draft 2020-12")
  const out: JsonSchema = {}
  let reference: unknown = undefined
  let prefixItems: unknown = undefined
  let items: unknown = undefined
  let constSchema: JsonSchema | undefined

  for (const key of Object.keys(source)) {
    const value = source[key]
    if (convertSubschemaKeyword(out, key, value, context, DRAFT_04_SCHEMA_SINGLE_KEYWORDS)) continue
    switch (key) {
      case "$ref":
        reference = value
        break
      case "$schema":
        convertMetaSchemaKeyword(out, value, context, META_SCHEMA_URI_DRAFT_04, "Draft-04")
        break
      case "$id":
      case "$anchor":
        break
      case "$defs":
        InternalRecord.assignProperty(out, "definitions", context.schemaMap(value, key, "definitions"))
        break
      case "prefixItems":
        prefixItems = value
        break
      case "items":
        items = value
        break
      case "$dynamicRef":
      case "$dynamicAnchor":
      case "$vocabulary":
      case "unevaluatedProperties":
      case "unevaluatedItems":
      case "propertyNames":
        unsupported(key, "Draft-04", "the target dialect has no equivalent")
      case "dependentRequired":
      case "dependentSchemas":
      case "contains":
      case "minContains":
      case "maxContains":
      case "if":
      case "then":
      case "else":
      case "minimum":
      case "maximum":
      case "exclusiveMinimum":
      case "exclusiveMaximum":
        break
      case "const":
        constSchema = { enum: [value] }
        break
      case "required":
        if (Array.isArray(value) && value.length === 0) break
        InternalRecord.assignProperty(out, key, value)
        break
      default:
        InternalRecord.assignProperty(out, key, value)
    }
  }

  convertTuple(out, prefixItems, items, context)

  convertDraft04ExclusiveBound(source, out, "minimum")
  convertDraft04ExclusiveBound(source, out, "maximum")
  convertDependencies(source, out, context, "draft-04")
  convertLegacyId(source, out, "id", "Draft-04")
  convertDraft04Conditionals(source, out, context)
  convertDraft04Contains(source, out, context)

  if (constSchema !== undefined) {
    if (Object.hasOwn(source, "enum")) {
      appendAllOf(out, constSchema)
    } else {
      InternalRecord.assignProperty(out, "enum", constSchema.enum)
    }
  }

  convertReference(out, reference, context)

  return out
}

function convertDraft04Conditionals(source: JsonSchema, out: JsonSchema, context: Context): void {
  const hasIf = Object.hasOwn(source, "if")
  const hasThen = Object.hasOwn(source, "then")
  const hasElse = Object.hasOwn(source, "else")
  if (!hasIf || (!hasThen && !hasElse)) {
    if (hasIf) InternalRecord.assignProperty(out, "if", context.schema(source.if, "if"))
    if (hasThen) InternalRecord.assignProperty(out, "then", context.schema(source.then, "then"))
    if (hasElse) InternalRecord.assignProperty(out, "else", context.schema(source.else, "else"))
    return
  }

  const index = Array.isArray(out.allOf) ? out.allOf.length : 0
  const base = ["allOf", String(index), "anyOf"] as const
  const convertBranch = (key: "if" | "then" | "else", targetPath: Path): unknown =>
    context.schemaAt(source[key], [key], [...base, ...targetPath])
  let conditional: JsonSchema
  if (hasThen && hasElse) {
    if (hasSchemaIdentifier(source.if)) {
      unsupported("if", "Draft-04", "lowering both branches would duplicate a schema identifier")
    }
    // (if AND then) OR ((NOT if) AND else)
    conditional = {
      anyOf: [
        {
          allOf: [
            convertBranch("if", ["0", "allOf", "0"]),
            convertBranch("then", ["0", "allOf", "1"])
          ]
        },
        {
          allOf: [
            { not: convertBranch("if", ["1", "allOf", "0", "not"]) },
            convertBranch("else", ["1", "allOf", "1"])
          ]
        }
      ]
    }
  } else if (hasThen) {
    // (NOT if) OR then
    conditional = {
      anyOf: [
        { not: convertBranch("if", ["0", "not"]) },
        convertBranch("then", ["1"])
      ]
    }
  } else {
    // if OR else
    conditional = {
      anyOf: [
        convertBranch("if", ["0"]),
        convertBranch("else", ["1"])
      ]
    }
  }
  appendAllOf(out, conditional)
}

function hasSchemaIdentifier(node: unknown): boolean {
  if (!Predicate.isObject(node)) return false
  if (Object.hasOwn(node, "$id") || Object.hasOwn(node, "$anchor")) return true
  for (const key of Object.keys(node)) {
    const value = node[key]
    switch (key) {
      case "$defs":
      case "properties":
      case "patternProperties":
      case "dependentSchemas":
        if (Predicate.isObject(value) && Object.values(value).some(hasSchemaIdentifier)) return true
        break
      case "allOf":
      case "anyOf":
      case "oneOf":
      case "prefixItems":
        if (Array.isArray(value) && value.some(hasSchemaIdentifier)) return true
        break
      case "not":
      case "additionalProperties":
      case "propertyNames":
      case "unevaluatedProperties":
      case "items":
      case "contains":
      case "unevaluatedItems":
      case "if":
      case "then":
      case "else":
      case "contentSchema":
        if (hasSchemaIdentifier(value)) return true
    }
  }
  return false
}

function convertDraft04Contains(source: JsonSchema, out: JsonSchema, context: Context): void {
  if (!Object.hasOwn(source, "contains")) {
    if (Object.hasOwn(source, "minContains")) InternalRecord.assignProperty(out, "minContains", source.minContains)
    if (Object.hasOwn(source, "maxContains")) InternalRecord.assignProperty(out, "maxContains", source.maxContains)
    return
  }

  const minContains = source.minContains
  const maxContains = source.maxContains
  if ((minContains !== undefined && minContains !== 1) || maxContains !== undefined) {
    unsupported("minContains/maxContains", "Draft-04", "contains cardinality cannot be represented")
  }

  const index = Array.isArray(out.allOf) ? out.allOf.length : 0
  const contains = context.schemaAt(
    source.contains,
    ["contains"],
    ["allOf", String(index), "anyOf", "1", "not", "items", "not"]
  )
  appendAllOf(out, {
    anyOf: [
      { not: { type: "array" } },
      { not: { items: { not: contains } } }
    ]
  })
}

function appendAllOf(out: JsonSchema, schema: JsonSchema): void {
  if (Array.isArray(out.allOf)) out.allOf.push(schema)
  else InternalRecord.assignProperty(out, "allOf", [schema])
}

function convertLegacyId(
  source: JsonSchema,
  out: JsonSchema,
  targetKey: "$id" | "id",
  dialect: string
): void {
  const id = source.$id
  const anchor = source.$anchor
  if (anchor === undefined) {
    if (id !== undefined) InternalRecord.assignProperty(out, targetKey, id)
    return
  }
  if (typeof anchor !== "string" || !ANCHOR_REGEXP.test(anchor)) {
    unsupported("$anchor", dialect, "the anchor is not valid")
  }
  if (!LEGACY_ID_FRAGMENT_REGEXP.test(anchor)) {
    unsupported("$anchor", dialect, "the anchor cannot be represented as a plain-name fragment identifier")
  }
  if (id === undefined) {
    InternalRecord.assignProperty(out, targetKey, `#${anchor}`)
  } else {
    unsupported("$anchor", dialect, "it cannot be combined with the schema $id")
  }
}

function convertDraft04ExclusiveBound(
  source: JsonSchema,
  out: JsonSchema,
  boundKey: "minimum" | "maximum"
): void {
  const exclusiveKey = boundKey === "minimum" ? "exclusiveMinimum" : "exclusiveMaximum"
  const bound = source[boundKey]
  const exclusive = source[exclusiveKey]
  if (typeof exclusive === "number") {
    const isBoundStricter = typeof bound === "number" &&
      (boundKey === "minimum" ? bound > exclusive : bound < exclusive)
    if (isBoundStricter) {
      InternalRecord.assignProperty(out, boundKey, bound)
    } else {
      InternalRecord.assignProperty(out, boundKey, exclusive)
      InternalRecord.assignProperty(out, exclusiveKey, true)
    }
  } else if (bound !== undefined) {
    InternalRecord.assignProperty(out, boundKey, bound)
  }
}
