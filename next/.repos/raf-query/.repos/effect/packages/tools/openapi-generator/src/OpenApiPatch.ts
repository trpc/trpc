/**
 * OpenAPI spec patching utilities.
 *
 * Handles parsing and applying JSON Patch documents (RFC 6902) to OpenAPI
 * specs. Supports patches from:
 * - JSON files (.json)
 * - YAML files (.yaml, .yml)
 * - Inline JSON strings
 *
 * @since 4.0.0
 */

import * as Effect from "effect/Effect"
import * as Yaml from "effect/encoding/Yaml"
import * as FileSystem from "effect/FileSystem"
import { constFalse, constUndefined } from "effect/Function"
import * as JsonPatch from "effect/JsonPatch"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error thrown when parsing a JSON Patch input fails.
 *
 * **Details**
 *
 * This error occurs when:
 * - A patch file cannot be read
 * - JSON or YAML syntax is invalid
 * - The file format is unsupported
 *
 * **Example** (Creating a parse error)
 *
 * ```ts import.meta.vitest
 * import { JsonPatchParseError } from "@effect/openapi-generator/OpenApiPatch"
 *
 * const error = new JsonPatchParseError({
 *   source: "./patches/fix.json",
 *   reason: "Unexpected token at position 42"
 * })
 *
 * error.message // => "Failed to parse patch from ./patches/fix.json: Unexpected token at position 42"
 * ```
 *
 * @category errors
 * @since 4.0.0
 */
export class JsonPatchParseError extends Schema.Error<JsonPatchParseError>("JsonPatchParseError")({
  _tag: Schema.tag("JsonPatchParseError"),
  source: Schema.String,
  reason: Schema.String
}) {
  override get message() {
    return `Failed to parse patch from ${this.source}: ${this.reason}`
  }
}

/**
 * Error thrown when a parsed value does not conform to the JSON Patch schema.
 *
 * **Details**
 *
 * This error occurs when:
 * - The patch is not an array
 * - An operation is missing required fields (op, path)
 * - An operation has an unsupported op value
 * - An add/replace operation is missing the value field
 *
 * **Example** (Creating a validation error)
 *
 * ```ts import.meta.vitest
 * import { JsonPatchValidationError } from "@effect/openapi-generator/OpenApiPatch"
 *
 * const error = new JsonPatchValidationError({
 *   source: "inline",
 *   reason: "Expected 'add' | 'remove' | 'replace' at [0].op, got 'copy'"
 * })
 *
 * error.message // => "Invalid JSON Patch from inline: Expected 'add' | 'remove' | 'replace' at [0].op, got 'copy'"
 * ```
 *
 * @category errors
 * @since 4.0.0
 */
export class JsonPatchValidationError extends Schema.Error<JsonPatchValidationError>("JsonPatchValidationError")({
  _tag: Schema.tag("JsonPatchValidationError"),
  source: Schema.String,
  reason: Schema.String
}) {
  override get message() {
    return `Invalid JSON Patch from ${this.source}: ${this.reason}`
  }
}

/**
 * Error thrown when applying a JSON Patch operation fails.
 *
 * **Details**
 *
 * This error occurs when:
 * - A path does not exist for remove/replace operations
 * - An array index is out of bounds
 * - The target location is not a valid container
 *
 * **Example** (Creating an application error)
 *
 * ```ts import.meta.vitest
 * import { JsonPatchApplicationError } from "@effect/openapi-generator/OpenApiPatch"
 *
 * const error = new JsonPatchApplicationError({
 *   source: "./patches/fix.json",
 *   operationIndex: 2,
 *   operation: "remove",
 *   path: "/paths/~1users",
 *   reason: "Property \"users\" does not exist"
 * })
 *
 * error.message // => 'Failed to apply patch from ./patches/fix.json: operation 2 (remove at /paths/~1users): Property "users" does not exist'
 * ```
 *
 * @category errors
 * @since 4.0.0
 */
export class JsonPatchApplicationError extends Schema.Error<JsonPatchApplicationError>("JsonPatchApplicationError")({
  _tag: Schema.tag("JsonPatchApplicationError"),
  source: Schema.String,
  operationIndex: Schema.Natural,
  operation: Schema.String,
  path: Schema.String,
  reason: Schema.String
}) {
  override get message() {
    return `Failed to apply patch from ${this.source}: operation ${this.operationIndex} ` +
      `(${this.operation} at ${this.path}): ${this.reason}`
  }
}

/**
 * Error thrown when multiple JSON Patch operations fail.
 *
 * **Details**
 *
 * This error aggregates all application errors so users can see every
 * failing operation at once instead of fixing them one at a time.
 *
 * **Example** (Creating an aggregate error)
 *
 * ```ts import.meta.vitest
 * import { JsonPatchAggregateError, JsonPatchApplicationError } from "@effect/openapi-generator/OpenApiPatch"
 *
 * const error = new JsonPatchAggregateError({
 *   errors: [
 *     new JsonPatchApplicationError({
 *       source: "./fix.json",
 *       operationIndex: 0,
 *       operation: "replace",
 *       path: "/info/x",
 *       reason: "Property does not exist"
 *     }),
 *     new JsonPatchApplicationError({
 *       source: "./fix.json",
 *       operationIndex: 2,
 *       operation: "remove",
 *       path: "/paths/~1users",
 *       reason: "Property does not exist"
 *     })
 *   ]
 * })
 *
 * error.message.split("\n")[0] // => "2 patch operations failed:"
 * ```
 *
 * @category errors
 * @since 4.0.0
 */
export class JsonPatchAggregateError extends Schema.Error<JsonPatchAggregateError>("JsonPatchAggregateError")({
  _tag: Schema.tag("JsonPatchAggregateError"),
  errors: Schema.Array(Schema.Unknown)
}) {
  override get message() {
    const errors = this.errors as ReadonlyArray<JsonPatchApplicationError>
    const count = errors.length
    const plural = count === 1 ? "operation" : "operations"
    const details = errors
      .map((e, i) => `  ${i + 1}. [${e.source}] op ${e.operationIndex} (${e.operation} at ${e.path}): ${e.reason}`)
      .join("\n")
    return `${count} patch ${plural} failed:\n${details}`
  }
}

// =============================================================================
// Schema
// =============================================================================

/**
 * Schema for a JSON Patch "add" operation.
 *
 * @category schemas
 * @since 4.0.0
 */
export const JsonPatchAdd: Schema.Codec<
  Extract<
    JsonPatch.JsonPatchOperation,
    { op: "add" }
  >
> = Schema.Struct({
  op: Schema.Literal("add"),
  path: Schema.String,
  value: Schema.Json,
  description: Schema.optionalKey(Schema.String)
})

/**
 * Schema for a JSON Patch "remove" operation.
 *
 * @category schemas
 * @since 4.0.0
 */
export const JsonPatchRemove: Schema.Codec<
  Extract<
    JsonPatch.JsonPatchOperation,
    { op: "remove" }
  >
> = Schema.Struct({
  op: Schema.Literal("remove"),
  path: Schema.String,
  description: Schema.optionalKey(Schema.String)
})

/**
 * Schema for a JSON Patch "replace" operation.
 *
 * @category schemas
 * @since 4.0.0
 */
export const JsonPatchReplace: Schema.Codec<
  Extract<
    JsonPatch.JsonPatchOperation,
    { op: "replace" }
  >
> = Schema.Struct({
  op: Schema.Literal("replace"),
  path: Schema.String,
  value: Schema.Json,
  description: Schema.optionalKey(Schema.String)
})

/**
 * Schema for a single JSON Patch operation.
 *
 * **Details**
 *
 * Supports the subset of RFC 6902 operations that Effect's JsonPatch module
 * implements: `add`, `remove`, and `replace`.
 *
 * @category schemas
 * @since 4.0.0
 */
export const JsonPatchOperation: Schema.Codec<JsonPatch.JsonPatchOperation> = Schema.Union([
  JsonPatchAdd,
  JsonPatchRemove,
  JsonPatchReplace
])

/**
 * Schema for a JSON Patch document (array of operations).
 *
 * **Details**
 *
 * A JSON Patch document is an ordered list of operations to apply to a JSON
 * document. Operations are applied in sequence, with each operation seeing
 * the result of previous operations.
 *
 * **Example** (Decoding a patch document)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { JsonPatchDocument } from "@effect/openapi-generator/OpenApiPatch"
 *
 * const patch = Schema.decodeUnknownSync(JsonPatchDocument)([
 *   { op: "add", path: "/foo", value: "bar" },
 *   { op: "remove", path: "/baz" },
 *   { op: "replace", path: "/qux", value: 42 }
 * ])
 *
 * patch.map((operation) => operation.op) // => ["add", "remove", "replace"]
 * ```
 *
 * @category schemas
 * @since 4.0.0
 */
export const JsonPatchDocument = Schema.Array(JsonPatchOperation)

/**
 * Type for a JSON Patch document.
 *
 * @category models
 * @since 4.0.0
 */
export type JsonPatchDocument = typeof JsonPatchDocument.Type

// =============================================================================
// Parsing Functions
// =============================================================================

const decodeJsonPatchDocument = Schema.decodeUnknownEffect(JsonPatchDocument)

/**
 * Check if a string looks like it could be a file path.
 *
 * Heuristic: contains path separators or ends with a known extension.
 */
const looksLikeFilePath = (input: string): boolean => {
  const trimmed = input.trim()
  if (trimmed.startsWith("[")) return false
  if (trimmed.includes("/") || trimmed.includes("\\")) return true
  if (/\.(json|yaml|yml)$/i.test(trimmed)) return true
  return false
}

/**
 * Determine file format from extension.
 */
const getFileFormat = Effect.fn(function*(filePath: string) {
  const path = yield* Path.Path
  const { ext } = path.parse(filePath)
  if (ext === ".json") return "json"
  if (ext === ".yaml" || ext === ".yml") return "yaml"
  return undefined
})

/**
 * Check if a file path exists and is a file.
 */
const checkFileExists = Effect.fn("checkFileExists")(function*(filePath: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath)
  const exists = yield* Effect.orElseSucceed(fs.exists(absolutePath), constFalse)
  if (!exists) return false
  const stat = yield* Effect.orElseSucceed(fs.stat(absolutePath), constUndefined)
  return Predicate.isNotUndefined(stat) && stat.type === "File"
})

/**
 * Parse content as JSON.
 */
const parseJsonContent = Effect.fnUntraced(function*(content: string, source: string) {
  return yield* Effect.try({
    try: () => JSON.parse(content) as unknown,
    catch: (error) =>
      new JsonPatchParseError({
        source,
        reason: error instanceof Error ? error.message : String(error)
      })
  })
})

/**
 * Parse content as YAML.
 */
const parseYamlContent = Effect.fnUntraced(function*(content: string, source: string) {
  return yield* Effect.try({
    try: () => Yaml.parse(content) as unknown,
    catch: (error) =>
      new JsonPatchParseError({
        source,
        reason: error instanceof Error ? error.message : String(error)
      })
  })
})

/**
 * Read and parse a patch file.
 */
const parsePatchFile = Effect.fn("parsePatchFile")(function*(filePath: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath)

  const fileFormat = yield* getFileFormat(filePath)
  if (Predicate.isUndefined(fileFormat)) {
    return yield* new JsonPatchParseError({
      source: filePath,
      reason: `Unsupported file format. Expected .json, .yaml, or .yml`
    })
  }

  const content = yield* Effect.mapError(fs.readFileString(absolutePath), (error) =>
    new JsonPatchParseError({
      source: filePath,
      reason: `Failed to read file: ${error.message}`
    }))

  const parsed = fileFormat === "json"
    ? yield* parseJsonContent(content, filePath)
    : yield* parseYamlContent(content, filePath)

  return yield* Effect.mapError(decodeJsonPatchDocument(parsed), (error) =>
    new JsonPatchValidationError({
      source: filePath,
      reason: error.message
    }))
})

/**
 * Parse inline JSON string as a patch document.
 */
const parseInlinePatch = Effect.fn("parseInlinePatch")(function*(input: string) {
  const parsed = yield* parseJsonContent(input, "inline")
  return yield* Effect.mapError(decodeJsonPatchDocument(parsed), (error) =>
    new JsonPatchValidationError({
      source: "inline",
      reason: error.message
    }))
})

/**
 * Parse a JSON Patch from either a file path or inline JSON string.
 *
 * **Details**
 *
 * The input is first checked as a file path. If the file exists, it is read
 * and parsed based on its extension (.json, .yaml, .yml). Otherwise, the
 * input is parsed as inline JSON.
 *
 * **Example** (Parsing patch input)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { parsePatchInput } from "@effect/openapi-generator/OpenApiPatch"
 *
 * // From inline JSON
 * const fromInline = parsePatchInput(
 *   '[{"op":"replace","path":"/info/title","value":"My API"}]'
 * )
 *
 * const program = Effect.gen(function*() {
 *   const patch = yield* fromInline
 *   return [patch[0].op, patch[0].path]
 * })
 *
 * Effect.runSync(program) // => ["replace", "/info/title"]
 * ```
 *
 * @category parsing
 * @since 4.0.0
 */
export const parsePatchInput = Effect.fn("parsePatchInput")(function*(input: string) {
  if (looksLikeFilePath(input)) {
    const exists = yield* checkFileExists(input)
    if (exists) {
      return yield* parsePatchFile(input)
    }
  }
  return yield* parseInlinePatch(input)
})

// =============================================================================
// Application Functions
// =============================================================================

/**
 * Apply a sequence of JSON patches to a document.
 *
 * **Details**
 *
 * Patches are applied in order, with each patch operating on the result of
 * the previous one. All operations are attempted, and if any fail, the errors
 * are accumulated and reported together so users can fix all issues at once.
 *
 * **Example** (Applying patches)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { applyPatches } from "@effect/openapi-generator/OpenApiPatch"
 *
 * const document = { info: { title: "Old Title" }, paths: {} }
 * const patches = [
 *   {
 *     source: "inline",
 *     patch: [{ op: "replace" as const, path: "/info/title", value: "New Title" }]
 *   }
 * ]
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* applyPatches(patches, document)
 *   return (result as typeof document).info.title
 * })
 *
 * Effect.runSync(program) // => "New Title"
 * ```
 *
 * @category transforming
 * @since 4.0.0
 */
export const applyPatches = Effect.fn("applyPatches")(function*(
  patches: ReadonlyArray<{ readonly source: string; readonly patch: JsonPatchDocument }>,
  document: Schema.Json
) {
  let result: Schema.Json = document
  const errors: Array<JsonPatchApplicationError> = []

  for (const { source, patch } of patches) {
    for (let i = 0; i < patch.length; i++) {
      const op = patch[i]
      yield* Effect.ignore(Effect.try({
        try: () => {
          result = JsonPatch.apply([op], result)
        },
        catch: (error) =>
          errors.push(
            new JsonPatchApplicationError({
              source,
              operationIndex: i,
              operation: op.op,
              path: op.path,
              reason: error instanceof Error ? error.message : String(error)
            })
          )
      }))
    }
  }

  if (errors.length > 0) {
    return yield* new JsonPatchAggregateError({ errors })
  }

  return result
})
