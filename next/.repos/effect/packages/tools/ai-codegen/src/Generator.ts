/**
 * Code generator service wrapping @effect/openapi-generator.
 *
 * @since 4.0.0
 */
import * as OpenApiGenerator from "@effect/openapi-generator/OpenApiGenerator"
import * as OpenApiPatch from "@effect/openapi-generator/OpenApiPatch"
import * as Arr from "effect/Array"
import * as Console from "effect/Console"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import type * as FileSystem from "effect/FileSystem"
import * as JsonPointer from "effect/JsonPointer"
import * as JsonSchema from "effect/JsonSchema"
import * as Layer from "effect/Layer"
import * as Path_ from "effect/Path"
import * as Predicate from "effect/Predicate"
import * as Record from "effect/Record"
import type * as Schema from "effect/Schema"
import type { DiscoveredProvider } from "./Discovery.ts"

/**
 * Error during code generation.
 *
 * **Example** (Creating a generation error)
 *
 * ```ts import.meta.vitest
 * import * as Generator from "@effect/ai-codegen/Generator"
 *
 * const error = new Generator.GenerationError({
 *   provider: "openai",
 *   cause: new Error("Invalid spec")
 * })
 *
 * error._tag // => "GenerationError"
 * error.provider // => "openai"
 * ```
 *
 * @category errors
 * @since 4.0.0
 */
export class GenerationError extends Data.TaggedError("GenerationError")<{
  readonly provider: string
  readonly cause: unknown
}> {}

/**
 * Error during patch application.
 *
 * **Example** (Creating a patch error)
 *
 * ```ts import.meta.vitest
 * import * as Generator from "@effect/ai-codegen/Generator"
 *
 * const error = new Generator.PatchError({
 *   provider: "openai",
 *   cause: new Error("Invalid patch")
 * })
 *
 * error._tag // => "PatchError"
 * error.provider // => "openai"
 * ```
 *
 * @category errors
 * @since 4.0.0
 */
export class PatchError extends Data.TaggedError("PatchError")<{
  readonly provider: string
  readonly cause: unknown
}> {}

/**
 * Service for generating Effect code from OpenAPI specs.
 *
 * @category services
 * @since 4.0.0
 */
export interface CodeGenerator {
  readonly generate: (
    provider: DiscoveredProvider,
    spec: unknown
  ) => Effect.Effect<string, GenerationError | PatchError, FileSystem.FileSystem | Path_.Path>
}

/**
 * Service tag for generating Effect client code from OpenAPI specifications.
 *
 * @category services
 * @since 4.0.0
 */
export const CodeGenerator: Context.Service<CodeGenerator, CodeGenerator> = Context.Service(
  "@effect/ai-codegen/CodeGenerator"
)

/** A bare `{ "type": "string" }` branch - the open half of an open enum. */
const isOpenStringBranch = (branch: unknown): boolean =>
  Predicate.isObject(branch) && branch.type === "string" && Object.keys(branch).length === 1

/** The value of a `{ "const": "..." }` branch, when it is a string const. */
const constBranchValue = (branch: unknown): string | undefined =>
  Predicate.isObject(branch) && Predicate.isString(branch.const) ? branch.const : undefined

/**
 * Collapse an open enum's const branches into a single `enum` branch.
 *
 * Stainless-generated specs encode an open enum as
 * `anyOf: [{ type: "string" }, { const: "a" }, { const: "b" }]` - "any string is valid, and these are
 * the known values". Left as-is, each const becomes its own `Schema.Literal` member, so consumers
 * cannot recover the literal union from the generated schema (the union's `Type` is just `string`).
 *
 * Rewriting the const branches to `anyOf: [{ type: "string" }, { enum: ["a", "b"] }]` emits
 * `Schema.Union([Schema.String, Schema.Literals(["a", "b"])])` instead, which decodes any string while
 * still exposing the known values as `members[1]` for autocomplete.
 */
const normalizeOpenEnum = (js: JsonSchema.JsonSchema): JsonSchema.JsonSchema => {
  const anyOf = js.anyOf
  if (!Array.isArray(anyOf) || anyOf.length < 2) return js

  const [head, ...tail] = anyOf
  if (!isOpenStringBranch(head)) return js

  const literals: Array<string> = []
  for (const branch of tail) {
    const value = constBranchValue(branch)
    if (value === undefined) return js
    literals.push(value)
  }

  return { ...js, anyOf: [head, { enum: literals }] }
}

const isStringArray = (u: unknown): u is ReadonlyArray<string> => Array.isArray(u) && u.every(Predicate.isString)

const requiredKey = (branch: unknown): string | undefined =>
  Predicate.isObject(branch) && Object.keys(branch).length === 1 && isStringArray(branch.required) &&
    branch.required.length === 1
    ? branch.required[0]
    : undefined

const choiceMode = (js: JsonSchema.JsonSchema): "anyOf" | "oneOf" | undefined => {
  if (Array.isArray(js.oneOf)) return js.anyOf === undefined ? "oneOf" : undefined
  return Array.isArray(js.anyOf) ? "anyOf" : undefined
}

/** The choice keyword of a schema made only of that choice and annotations. */
const bareChoice = (js: JsonSchema.JsonSchema): "anyOf" | "oneOf" | undefined => {
  const mode = choiceMode(js)
  return mode !== undefined && Object.keys(js).every((key) => key === mode || isAnnotation(key)) ? mode : undefined
}

const absent = (keys: ReadonlyArray<string>): JsonSchema.JsonSchema => ({
  properties: Object.fromEntries(keys.map((key) => [key, false]))
})

const jsonTypes = ["null", "boolean", "object", "array", "number", "string"]

/** Returns the exact type complement, or `undefined` if it cannot be expressed. */
const typeComplement = (not: { readonly [x: string]: unknown }, current: unknown): unknown => {
  if (Object.keys(not).length !== 1) return undefined
  const excluded = Predicate.isString(not.type) ? [not.type] : not.type
  // `integer` is a subset of `number`, so excluding it alone leaves no type-level complement
  if (!isStringArray(excluded) || excluded.includes("integer") && !excluded.includes("number")) return undefined
  const types = current === undefined ? jsonTypes : Predicate.isString(current) ? [current] : current
  if (!isStringArray(types)) return undefined
  const remaining = types.filter((type) => !excluded.includes(type === "integer" ? "number" : type))
  return remaining.length === 0 ? undefined : remaining.length === 1 ? remaining[0] : remaining
}

/** Rewrites a negated character class as an anchored positive pattern. */
const negatedClassPattern = (not: { readonly [x: string]: unknown }): string | undefined => {
  if (Object.keys(not).length !== 1 || !Predicate.isString(not.pattern)) return undefined
  const match = /^\[\^((?:[^\\[\]]|\\.)+)\]$/.exec(not.pattern)
  return match === null ? undefined : `^[${match[1]}]*$`
}

/** Rewrites supported negations as positive constraints; leaves other forms for the importer to reject. */
const rewriteNot = (js: JsonSchema.JsonSchema): JsonSchema.JsonSchema => {
  const not = js.not
  if (!Predicate.isObject(not)) return js
  const { not: _, ...rest } = js

  const type = typeComplement(not, rest.type)
  if (type !== undefined) return { ...rest, type }

  const pattern = negatedClassPattern(not)
  if (pattern !== undefined) {
    if (rest.pattern === undefined) return { ...rest, pattern }
    // The existing pattern already restricts every character to the same class
    if (rest.pattern === pattern || rest.pattern === pattern.replace(/\*\$$/, "+$")) return rest
    return { ...rest, allOf: [...(Array.isArray(rest.allOf) ? rest.allOf : []), { pattern }] }
  }

  // `required` holds for any non-object, so its negation only has a key-absence equivalent on objects
  if (!isStringArray(not.required) || rest.type !== "object") return js
  const required = not.required
  const notKeys = Object.keys(not)
  if (notKeys.length === 1 && required.length === 2 && rest.oneOf === undefined && Array.isArray(rest.anyOf)) {
    const keys = rest.anyOf.map(requiredKey)
    if (keys.length === 2 && required.every((key) => keys.includes(key)) && keys[0] !== keys[1]) {
      const { anyOf, ...base } = rest
      return { ...base, oneOf: anyOf }
    }
  }
  if (rest.anyOf !== undefined || rest.oneOf !== undefined) return js
  if (notKeys.length === 1) return { ...rest, anyOf: required.map((key) => absent([key])) }
  const alternatives = Array.isArray(not.anyOf) ? not.anyOf.map(requiredKey) : []
  if (notKeys.length === 2 && alternatives.length > 0 && isStringArray(alternatives)) {
    return { ...rest, anyOf: [...required.map((key) => absent([key])), absent(alternatives)] }
  }
  return js
}

/** Without `then`, `if`/`else` reduces to `if or else`. */
const rewriteConditional = (js: JsonSchema.JsonSchema): JsonSchema.JsonSchema => {
  if (js.if === undefined || js.else === undefined || js.then !== undefined || js.anyOf !== undefined) return js
  const { else: otherwise, if: condition, ...rest } = js
  return { ...rest, anyOf: [condition, otherwise] }
}

const definitionKey = ($ref: string): string | undefined => {
  const path = $ref.startsWith("#") ? JsonPointer.parseUriFragment($ref) : undefined
  return path !== undefined && path.length === 2 && path[0] === "$defs" ? path[1] : undefined
}

const isNullableMarker = (member: unknown): boolean =>
  Predicate.isObject(member) && member.nullable === true && Object.keys(member).length === 1

/** Converts legacy `nullable: true` markers, including standalone `allOf` members, to null unions. */
const rewriteNullable = (js: JsonSchema.JsonSchema): JsonSchema.JsonSchema => {
  const allOf = Array.isArray(js.allOf) ? js.allOf : undefined
  if (js.nullable !== true && !allOf?.some(isNullableMarker)) return js
  const { nullable: _, ...rest } = js
  const members = allOf?.filter((member) => !isNullableMarker(member))
  const { allOf: _allOf, ...base } = rest
  const schema = members === undefined ? rest : members.length === 0 ? base : { ...base, allOf: members }
  const annotations = pick(schema, isAnnotation)
  return { ...annotations, anyOf: [pick(schema, (key) => !isAnnotation(key)), { type: "null" }] }
}

const objectKeys = new Set(["type", "properties", "required", "additionalProperties"])
const annotationKeys = new Set([
  "title",
  "description",
  "deprecated",
  "readOnly",
  "writeOnly",
  "default",
  "examples",
  "$comment",
  "discriminator"
])

const isAnnotation = (key: string): boolean => annotationKeys.has(key) || key.startsWith("x-")

const pick = (js: JsonSchema.JsonSchema, predicate: (key: string) => boolean): JsonSchema.JsonSchema =>
  Record.filter(js, (_, key) => predicate(key))

/** Object constraints and annotations only; no typed `additionalProperties`. */
const isPlainObject = (js: JsonSchema.JsonSchema): boolean =>
  (js.type === undefined || js.type === "object") &&
  (js.additionalProperties === undefined || Predicate.isBoolean(js.additionalProperties)) &&
  (js.properties === undefined || Predicate.isObject(js.properties)) &&
  (js.required === undefined || isStringArray(js.required)) &&
  Object.keys(js).every((key) => objectKeys.has(key) || isAnnotation(key))

const excludesObject = (js: JsonSchema.JsonSchema): boolean =>
  Predicate.isString(js.type) ? js.type !== "object" : isStringArray(js.type) && !js.type.includes("object")

const isObjectSchema = (js: JsonSchema.JsonSchema): boolean =>
  js.type === "object" || (isPlainObject(js) && (js.properties ?? js.required) !== undefined)

const declaredKeys = (js: JsonSchema.JsonSchema): ReadonlyArray<string> => [
  ...Object.keys((js.properties as object | undefined) ?? {}),
  ...(js.required as ReadonlyArray<string> | undefined ?? [])
]

/**
 * Intersects object constraints. Explicit closures forbid keys declared only by the other member.
 * Generator-added closures come later, so every closure here is from the spec.
 */
const mergeObjects = (left: JsonSchema.JsonSchema, right: JsonSchema.JsonSchema): JsonSchema.JsonSchema => {
  const leftProperties = (left.properties as { readonly [x: string]: unknown } | undefined) ?? {}
  const rightProperties = (right.properties as { readonly [x: string]: unknown } | undefined) ?? {}
  const properties: { [x: string]: unknown } = { ...leftProperties }
  for (const [key, schema] of Object.entries(rightProperties)) {
    const current = properties[key]
    properties[key] = current === undefined || JSON.stringify(current) === JSON.stringify(schema)
      ? schema
      : current === false || schema === false
      ? false
      : { allOf: [current, schema] }
  }
  for (
    const [closed, other, closedProperties] of [[left, right, leftProperties], [right, left, rightProperties]] as const
  ) {
    if (closed.additionalProperties !== false) continue
    for (const key of declaredKeys(other)) {
      if (!Object.hasOwn(closedProperties, key)) properties[key] = false
    }
  }
  const required = Arr.union(
    left.required as ReadonlyArray<string> ?? [],
    right.required as ReadonlyArray<string> ?? []
  )
  const additionalProperties = left.additionalProperties === false || right.additionalProperties === false
    ? false
    : left.additionalProperties ?? right.additionalProperties
  return {
    ...(left.type === "object" || right.type === "object" ? { type: "object" } : {}),
    ...(Object.keys(properties).length > 0 ? { properties } : {}),
    ...(required.length > 0 ? { required } : {}),
    ...(additionalProperties !== undefined ? { additionalProperties } : {})
  }
}

type Choice = {
  readonly _tag: "Choice"
  readonly mode: "anyOf" | "oneOf"
  readonly branches: ReadonlyArray<JsonSchema.JsonSchema>
}

type Part = { readonly _tag: "Object"; readonly schema: JsonSchema.JsonSchema } | Choice

/** Object constraints do not apply to a non-object, which is dropped only when an object is required. */
const withNonObject = (
  nonObject: JsonSchema.JsonSchema,
  other: JsonSchema.JsonSchema
): ReadonlyArray<JsonSchema.JsonSchema> | undefined =>
  isPlainObject(other) ? (other.type === "object" ? [] : [nonObject]) : undefined

/** Intersects branches: `[]` for incompatible types, `undefined` if an exact merge is unsupported. */
const mergeBranch = (
  object: JsonSchema.JsonSchema,
  branch: JsonSchema.JsonSchema
): ReadonlyArray<JsonSchema.JsonSchema> | undefined => {
  if (excludesObject(object)) return withNonObject(object, branch)
  if (excludesObject(branch)) return withNonObject(branch, object)
  if (!isPlainObject(object) || !isPlainObject(branch)) return undefined
  return [{ ...pick(branch, isAnnotation), ...mergeObjects(object, branch) }]
}

const withBranches = (choice: Choice, branches: ReadonlyArray<JsonSchema.JsonSchema> | undefined): Part | undefined =>
  branches === undefined ? undefined : { ...choice, branches }

const mergeBranches = (
  branches: ReadonlyArray<JsonSchema.JsonSchema>,
  merge: (branch: JsonSchema.JsonSchema) => ReadonlyArray<JsonSchema.JsonSchema> | undefined
): ReadonlyArray<JsonSchema.JsonSchema> | undefined => {
  const out: Array<JsonSchema.JsonSchema> = []
  for (const branch of branches) {
    const merged = merge(branch)
    if (merged === undefined) return undefined
    out.push(...merged)
  }
  return out.length === 0 ? undefined : out
}

/** Applies object constraints to each branch, dropping non-objects only when an object is required. */
const mergeIntoChoice = (object: JsonSchema.JsonSchema, choice: Choice): Part | undefined => {
  return withBranches(choice, mergeBranches(choice.branches, (branch) => mergeBranch(object, branch)))
}

/**
 * Intersects choices. Two `anyOf` lists form all branch pairs; `oneOf` nests the other choice
 * inside each branch to preserve exclusivity. Nested choices cannot be merged further.
 */
const mergeChoices = (left: Choice, right: Choice): Part | undefined => {
  if (right.branches.length === 1 && isPlainObject(right.branches[0])) return mergeIntoChoice(right.branches[0], left)
  if (left.branches.length === 1 && isPlainObject(left.branches[0])) return mergeIntoChoice(left.branches[0], right)
  if (left.mode === "anyOf" && right.mode === "anyOf") {
    return withBranches(
      left,
      mergeBranches(left.branches, (outer) => mergeBranches(right.branches, (inner) => mergeBranch(outer, inner)))
    )
  }
  const [outer, inner] = left.mode === "oneOf" ? [left, right] : [right, left]
  return withBranches(
    outer,
    mergeBranches(outer.branches, (branch) => {
      const nested = mergeBranches(inner.branches, (alternative) => mergeBranch(alternative, branch))
      return nested === undefined ? undefined : [{ ...pick(branch, isAnnotation), [inner.mode]: nested }]
    })
  )
}

const mergeParts = (left: Part, right: Part): Part | undefined => {
  if (left._tag === "Object") {
    return right._tag === "Object"
      ? { _tag: "Object", schema: mergeObjects(left.schema, right.schema) }
      : mergeIntoChoice(left.schema, right)
  }
  if (right._tag === "Object") return mergeIntoChoice(right.schema, left)
  return mergeChoices(left, right)
}

/**
 * Merges object compositions before automatic closing, distributes constraints into choices,
 * and removes redundant object wrappers. Unsupported compositions are left for the importer.
 */
const makeNormalizer = (resolve: (key: string) => JsonSchema.JsonSchema | undefined) => {
  const resolving = new Set<string>()

  const prepare = (js: JsonSchema.JsonSchema): JsonSchema.JsonSchema =>
    rewriteNot(rewriteConditional(rewriteNullable(js)))

  const dereference = (member: unknown): JsonSchema.JsonSchema | undefined => {
    if (!Predicate.isObject(member)) return undefined
    if (!Predicate.isString(member.$ref)) return compose(prepare(member))
    const { $ref, ...siblings } = member
    const key = definitionKey($ref)
    if (key === undefined || resolving.has(key) || !Object.keys(siblings).every(isAnnotation)) return undefined
    const definition = resolve(key)
    if (definition === undefined) return undefined
    resolving.add(key)
    try {
      return { ...compose(prepare(definition)), ...siblings }
    } finally {
      resolving.delete(key)
    }
  }

  const toPart = (member: unknown): Part | undefined => {
    const schema = dereference(member)
    if (schema === undefined) return undefined
    if (isPlainObject(schema)) return { _tag: "Object", schema }
    const mode = bareChoice(schema)
    if (mode === undefined) return undefined
    const branches: Array<JsonSchema.JsonSchema> = []
    for (const branch of schema[mode] as ReadonlyArray<unknown>) {
      const resolved = dereference(branch)
      if (resolved === undefined || !(isPlainObject(resolved) || excludesObject(resolved))) return undefined
      branches.push(resolved)
    }
    return { _tag: "Choice", mode, branches }
  }

  const compose = (js: JsonSchema.JsonSchema): JsonSchema.JsonSchema => {
    // Sibling choices must both hold.
    const members = [
      ...(Array.isArray(js.allOf) ? js.allOf : []),
      ...(Array.isArray(js.anyOf) ? [{ anyOf: js.anyOf }] : []),
      ...(Array.isArray(js.oneOf) ? [{ oneOf: js.oneOf }] : [])
    ]
    const hasOwn = js.properties !== undefined || js.required !== undefined
    // Preserve references when no intersection is needed.
    if ((hasOwn ? 1 : 0) + members.length < 2) return js
    const { allOf: _allOf, anyOf: _anyOf, oneOf: _oneOf, ...rest } = js
    if (!isPlainObject(rest)) return js
    const own = pick(rest, (key) => objectKeys.has(key))
    let part: Part = { _tag: "Object", schema: own }
    for (const member of members) {
      const next = toPart(member)
      const merged: Part | undefined = next === undefined ? undefined : mergeParts(part, next)
      if (merged === undefined) return js
      part = merged
    }
    const annotations = pick(rest, isAnnotation)
    return part._tag === "Object"
      ? { ...annotations, ...part.schema }
      : { ...annotations, [part.mode]: part.branches }
  }

  const dropRedundantObjectType = (js: JsonSchema.JsonSchema): JsonSchema.JsonSchema => {
    if (js.type !== "object") return js
    const { type: _, ...rest } = js
    const mode = bareChoice(rest)
    if (mode === undefined) return js
    const branches = rest[mode] as ReadonlyArray<unknown>
    return branches.every((branch) => {
        const resolved = dereference(branch)
        return resolved !== undefined && isObjectSchema(resolved)
      })
      ? rest
      : js
  }

  return (js: JsonSchema.JsonSchema): JsonSchema.JsonSchema => dropRedundantObjectType(compose(prepare(js)))
}

/** Resolves component schemas using the same dialect conversion as the OpenAPI generator. */
const makeResolver = (spec: Schema.Json) => {
  const components =
    Predicate.isObject(spec) && Predicate.isObject(spec.components) && Predicate.isObject(spec.components.schemas)
      ? spec.components.schemas
      : {}
  const openapi = Predicate.isObject(spec) && Predicate.isString(spec.openapi) ? spec.openapi : ""
  const convert = openapi.trim().startsWith("3.0") ? JsonSchema.fromSchemaOpenApi3_0 : JsonSchema.fromSchemaOpenApi3_1
  const cache = new Map<string, JsonSchema.JsonSchema | undefined>()
  return (key: string): JsonSchema.JsonSchema | undefined => {
    if (!cache.has(key)) {
      const definition = Object.hasOwn(components, key) ? components[key] : undefined
      cache.set(key, Predicate.isObject(definition) ? convert(definition).schema : undefined)
    }
    return cache.get(key)
  }
}

/** Keep free-form objects open and close compositions only after normalization. */
const shouldClose = (js: JsonSchema.JsonSchema): boolean =>
  js.type === "object" &&
  Predicate.isObject(js.properties) && Object.keys(js.properties).length > 0 &&
  js.additionalProperties === undefined &&
  js.allOf === undefined && js.anyOf === undefined && js.oneOf === undefined

/** Closes an object, declaring any required keys it leaves undeclared so they stay valid. */
const closeObject = (js: JsonSchema.JsonSchema): JsonSchema.JsonSchema => {
  const properties = js.properties as { readonly [x: string]: unknown }
  const undeclared = isStringArray(js.required) ? js.required.filter((key) => !Object.hasOwn(properties, key)) : []
  return {
    ...js,
    properties: { ...properties, ...Object.fromEntries(undeclared.map((key) => [key, {}])) },
    additionalProperties: false
  }
}

/**
 * Layer providing the CodeGenerator service.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<
  CodeGenerator,
  never,
  OpenApiGenerator.OpenApiGenerator | FileSystem.FileSystem | Path_.Path
> = Effect.gen(function*() {
  const openApiGen = yield* OpenApiGenerator.OpenApiGenerator
  const pathService = yield* Path_.Path

  const applyPatches = Effect.fn("applyPatches")(function*(
    provider: DiscoveredProvider,
    spec: Schema.Json
  ) {
    const patchInputs = provider.config.patchList
    if (patchInputs.length === 0) {
      return spec
    }

    // Parse all patches, resolving file paths relative to the provider package
    const parsedPatches = yield* Effect.forEach(patchInputs, (input) => {
      // If it looks like a file path and is not absolute, resolve relative to package
      const trimmed = input.trimStart()
      const resolvedInput = !trimmed.startsWith("[") && !pathService.isAbsolute(trimmed)
        ? pathService.join(provider.packagePath, trimmed)
        : trimmed
      return OpenApiPatch.parsePatchInput(resolvedInput).pipe(
        Effect.map((patch) => ({ source: resolvedInput, patch }))
      )
    }).pipe(
      Effect.mapError((cause) => new PatchError({ provider: provider.name, cause }))
    )

    // Apply all patches to the spec
    return yield* OpenApiPatch.applyPatches(parsedPatches, spec).pipe(
      Effect.mapError((cause) => new PatchError({ provider: provider.name, cause }))
    )
  })

  const filterPaths = (spec: Schema.Json, prefixes: ReadonlyArray<string> | undefined): Schema.Json => {
    const { paths } = spec as { readonly paths?: Record<string, Schema.Json> }
    if (prefixes === undefined || paths === undefined) {
      return spec
    }
    return {
      ...spec as Record<string, Schema.Json>,
      paths: Record.filter(paths, (_, path) => prefixes.some((prefix) => path.startsWith(prefix)))
    }
  }

  // Replaces an operation's 4xx and 5xx responses with one `4XX` response that uses the error
  // envelope component they share. Statuses that narrow the envelope inline are dropped, so any
  // envelope decodes and the status code decides the error.
  const collapseOperationErrors = (operation: Schema.Json, method: string, path: string): Schema.Json => {
    const { responses } = operation as { readonly responses?: Record<string, Schema.Json> }
    if (responses === undefined) return operation
    const errors = Object.keys(responses).filter((status) => /^[45]/.test(status))
    if (errors.length === 0) return operation
    const refs = new Set(
      errors
        .map((status) => (responses[status] as any)?.content?.["application/json"]?.schema?.$ref)
        .filter(Predicate.isString)
    )
    if (refs.size !== 1) {
      throw new Error(`Expected one shared error envelope for ${method.toUpperCase()} ${path}, found ${refs.size}`)
    }
    return {
      ...operation as Record<string, Schema.Json>,
      responses: {
        ...Record.filter(responses, (_, status) => !errors.includes(status)),
        "4XX": { description: "Error", content: { "application/json": { schema: { $ref: [...refs][0] } } } }
      }
    }
  }

  const collapseErrorResponses = (spec: Schema.Json): Schema.Json => {
    const { paths } = spec as { readonly paths?: Record<string, Record<string, Schema.Json>> }
    if (paths === undefined) return spec
    return {
      ...spec as Record<string, Schema.Json>,
      paths: Record.map(
        paths,
        (item, path) => Record.map(item, (operation, method) => collapseOperationErrors(operation, method, path))
      )
    }
  }

  const generate = Effect.fn("generate")(function*(
    provider: DiscoveredProvider,
    spec: unknown
  ) {
    // Apply patches if any are configured, then keep only the included paths
    let patchedSpec = filterPaths(yield* applyPatches(provider, spec as Schema.Json), provider.config.includePaths)
    if (provider.config.collapseErrorResponses) {
      patchedSpec = yield* Effect.try({
        try: () => collapseErrorResponses(patchedSpec),
        catch: (cause) => new GenerationError({ provider: provider.name, cause })
      })
    }

    const excludeAnnotations = provider.config.excludeAnnotationsList
    const disableAdditionalProperties = provider.config.shouldDisableAdditionalProperties

    const exclude = excludeAnnotations ? new Set(excludeAnnotations) : undefined
    const normalize = makeNormalizer(makeResolver(patchedSpec))
    const onEnter = (js: JsonSchema.JsonSchema): JsonSchema.JsonSchema => {
      const out = { ...normalize(normalizeOpenEnum(js)) }
      if (exclude) {
        for (const key of exclude) delete out[key]
      }
      return disableAdditionalProperties && shouldClose(out) ? closeObject(out) : out
    }

    const warnings: Array<OpenApiGenerator.OpenApiGeneratorWarning> = []
    const code = yield* openApiGen
      .generate(patchedSpec as unknown as Parameters<typeof openApiGen.generate>[0], {
        name: provider.config.clientName,
        format: provider.config.isTypeOnly ? "httpclient-type-only" : "httpclient",
        includeSchemas: provider.config.includeSchemas,
        onEnter,
        onWarning: (warning) => {
          warnings.push(warning)
        }
      })
      .pipe(
        Effect.mapError((cause) => new GenerationError({ provider: provider.name, cause }))
      )
    yield* Effect.forEach(
      warnings,
      (warning) => Console.error(OpenApiGenerator.formatWarning(warning)),
      { discard: true }
    )
    return code
  })

  return { generate }
}).pipe(Layer.effect(CodeGenerator))

/**
 * Layer providing the CodeGenerator with schema transformer (default).
 *
 * @category layers
 * @since 4.0.0
 */
export const layerSchema: Layer.Layer<CodeGenerator, never, FileSystem.FileSystem | Path_.Path> = layer.pipe(
  Layer.provide(OpenApiGenerator.layerTransformerSchema)
)

/**
 * Layer providing the CodeGenerator with TypeScript-only transformer.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerTypeScript: Layer.Layer<CodeGenerator, never, FileSystem.FileSystem | Path_.Path> = layer.pipe(
  Layer.provide(OpenApiGenerator.layerTransformerTs)
)
