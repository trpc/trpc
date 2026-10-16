/**
 * These utilities assume the schema has only one root-level `$defs` object
 * and exclusively use absolute JSON pointers for `$ref` values.
 */

import type { JsonSchema } from './types'
import type { JsonArraySchema, JsonObjectSchema } from './utils'
import { get, isDeepEqual, omit, toArray } from '@orpc/shared'
import { JSON_SCHEMA_LOGIC_KEYWORDS } from './constants'
import { decodeJsonPointerSegment, encodeJsonPointerSegment, hoistRecursiveRefToDef, mapJsonSchemaRefs, resolveJsonSchemaRootLocalRef } from './ref-utils'
import { ensureJsonSchemaObject, isJsonArraySchema } from './utils'

/**
 * Moves a schema's `$defs` into the shared root map, renaming only the names whose bodies
 * conflict with an already promoted def, and returns the schema body rebased onto `basePath`.
 *
 * Refs inside the promoted def bodies are rewritten too: they share the schema's namespace, so
 * a rename left unapplied there would silently bind the body to another schema's defs.
 */
function promoteJsonSchemaDefs(
  schema: Exclude<JsonSchema, boolean>,
  mergedDefs: Map<string, JsonSchema>,
  basePath: string,
): JsonSchema {
  const { $defs, ...rootBody } = schema
  const renameMap = new Map<string, string>()

  /**
   * `basePath` is where `rootBody` lands in the combined document, so pointers resolved against
   * the original root are rebased onto it, while `#/$defs/` pointers follow the promoted defs.
   */
  const mapRef = (ref: string): string => {
    if (ref === '#') {
      return basePath
    }

    if (ref.startsWith('#/$defs/')) {
      const [encodedName, ...segments] = ref.slice('#/$defs/'.length).split('/')
      const newName = renameMap.get(decodeJsonPointerSegment(encodedName!))

      return newName === undefined
        ? ref
        : ['#/$defs', encodeJsonPointerSegment(newName), ...segments].join('/')
    }

    if (ref.startsWith('#/') && get(rootBody, ref.slice(2).split('/').map(decodeJsonPointerSegment)) !== undefined) {
      return `${basePath}/${ref.slice(2)}`
    }

    return ref
  }

  const defs = Object.entries($defs ?? {}).filter(([, def]) => def !== undefined)

  if (defs.length > 0) {
    const promoted = new Map<string, JsonSchema>()
    const reserved = new Set([...mergedDefs.keys(), ...defs.map(([name]) => name)])

    /**
     * A def body must be rewritten into the merged namespace before it can be compared for
     * deduplication, and each rename invalidates every body pointing at the renamed def, so
     * keep rewriting until a full pass renames nothing.
     */
    for (let changed = true; changed;) {
      changed = false

      for (const [name, def] of defs) {
        const body = mapJsonSchemaRefs(def, mapRef)
        promoted.set(name, body)

        if (renameMap.has(name) || !mergedDefs.has(name) || isDeepEqual(mergedDefs.get(name), body)) {
          continue
        }

        let counter = 2
        while (reserved.has(`${name}${counter}`)) {
          counter++
        }

        reserved.add(`${name}${counter}`)
        renameMap.set(name, `${name}${counter}`)
        changed = true
      }
    }

    for (const [name, body] of promoted) {
      mergedDefs.set(renameMap.get(name) ?? name, body)
    }
  }

  return mapJsonSchemaRefs(rootBody, mapRef)
}

/**
 * Combines multiple schemas under the requested composition keyword, promoting branch `$defs` to the root.
 */
export function combineJsonSchemasWithComposition(
  keyword: 'allOf' | 'anyOf' | 'oneOf',
  schemas: JsonSchema[],
): JsonSchema {
  if (schemas.length <= 1) {
    return schemas[0] ?? true
  }

  const mergedDefs = new Map<string, JsonSchema>()
  const compositionBranches: JsonSchema[] = []

  for (let i = 0; i < schemas.length; i++) {
    const schema = schemas[i]!

    compositionBranches.push(typeof schema === 'boolean'
      ? schema
      : promoteJsonSchemaDefs(schema, mergedDefs, `#/${keyword}/${i}`))
  }

  const result: Exclude<JsonSchema, boolean> = { [keyword]: compositionBranches }
  if (mergedDefs.size > 0) {
    result.$defs = Object.fromEntries(mergedDefs)
  }

  return result
}

export type JsonObjectSchemaEntry = [name: string, schema: JsonSchema, optional: boolean]

/**
 * Combines object property entries back into a single object schema.
 */
export function combineJsonObjectSchemaEntries(entries: JsonObjectSchemaEntry[]): JsonObjectSchema {
  const properties = new Map<string, JsonSchema>()
  const required: string[] = []
  const mergedDefs = new Map<string, JsonSchema>()

  for (const [name, propertySchema, optional] of entries) {
    if (!optional) {
      required.push(name)
    }

    properties.set(name, typeof propertySchema === 'boolean'
      ? propertySchema
      : promoteJsonSchemaDefs(propertySchema, mergedDefs, `#/properties/${encodeJsonPointerSegment(name)}`))
  }

  const schema: JsonObjectSchema = {
    type: 'object',
    properties: Object.fromEntries(properties),
  }

  if (required.length > 0) {
    schema.required = required
  }

  if (mergedDefs.size > 0) {
    schema.$defs = Object.fromEntries(mergedDefs)
  }

  return schema
}

/**
 * Parses an object schema, or a composition of object schemas, into property entries.
 */
export function extractJsonObjectSchemaEntries(schema: JsonSchema): JsonObjectSchemaEntry[] | undefined {
  schema = hoistRecursiveRefToDef(schema)
  if (typeof schema !== 'object') {
    return undefined
  }

  const result = extractJsonObjectSchemaEntriesInternal(omit(schema, ['$defs']), schema.$defs, new Set())

  if (!result.objectLike) {
    return undefined
  }

  return result.entries.map(([n, s, ...r]) => [n, withRootDefs(s, schema.$defs), ...r])
}

type JsonObjectSchemaEntrySource = 'direct' | 'allOf' | 'anyOf' | 'oneOf'
type ExtractJsonObjectSchemaEntriesResult = {
  entries: JsonObjectSchemaEntry[]
  objectLike: boolean
}
function extractJsonObjectSchemaEntriesInternal(
  schema: JsonSchema,
  $defs: Exclude<JsonSchema, boolean>['$defs'],
  resolvingRefs: Set<string>,
): ExtractJsonObjectSchemaEntriesResult {
  if (typeof schema !== 'object') {
    return { entries: [], objectLike: false }
  }

  if (typeof schema.$ref === 'string') {
    if (resolvingRefs.has(schema.$ref)) {
      return { entries: [], objectLike: true }
    }

    const resolved = resolveJsonSchemaRootLocalRef(schema, $defs)

    if (resolved !== schema) {
      return extractJsonObjectSchemaEntriesInternal(resolved, $defs, new Set(resolvingRefs).add(schema.$ref))
    }
  }

  const sources: Array<{ entries: JsonObjectSchemaEntry[], source: JsonObjectSchemaEntrySource }> = []

  if (schema.properties) {
    sources.push({
      entries: Object.entries(schema.properties).map(([name, propertySchema]) => {
        return [
          name,
          propertySchema,
          !schema.required?.includes(name),
        ] satisfies JsonObjectSchemaEntry
      }),
      source: 'direct',
    })
  }

  let objectLike = schema.type === 'object'
    || schema.properties !== undefined
    || schema.required !== undefined
    || schema.additionalProperties !== undefined

  for (const keyword of ['anyOf', 'oneOf', 'allOf'] as const) {
    const branches = schema[keyword]

    if (branches === undefined) {
      continue
    }

    const branchResults = branches.map(branch => extractJsonObjectSchemaEntriesInternal(branch, $defs, resolvingRefs))

    if (branchResults.some(result => !result.objectLike)) {
      return { entries: [], objectLike: false }
    }

    const entriesByName = new Map<string, JsonObjectSchemaEntry[]>()

    for (const result of branchResults) {
      for (const entry of result.entries) {
        const entries = entriesByName.get(entry[0])

        if (entries) {
          entries.push(entry)
        }
        else {
          entriesByName.set(entry[0], [entry])
        }
      }
    }

    objectLike = true
    sources.push({
      entries: Array.from(entriesByName.entries()).map(([name, entries]) => {
        const schemas = deduplicateJsonSchemas(entries.map(entry => entry[1]))
        const required = keyword === 'allOf'
          ? entries.some(entry => !entry[2])
          : branchResults.every((result) => {
              const entry = result.entries.find(item => item[0] === name)
              return entry !== undefined && !entry[2]
            })

        return [
          name,
          schemas.length === 1
            ? schemas[0]!
            : keyword === 'allOf'
              ? { allOf: schemas }
              : { anyOf: schemas },
          !required,
        ] satisfies JsonObjectSchemaEntry
      }),
      source: keyword,
    })
  }

  const sourceEntries = new Map<string, Partial<Record<JsonObjectSchemaEntrySource, JsonObjectSchemaEntry>>>()

  for (const { entries, source } of sources) {
    for (const entry of entries) {
      const existing = sourceEntries.get(entry[0])

      if (existing) {
        existing[source] = entry
      }
      else {
        sourceEntries.set(entry[0], { [source]: entry })
      }
    }
  }

  return {
    entries: Array.from(sourceEntries.entries()).map(([name, entries]) => {
      const schemas = deduplicateJsonSchemas([
        entries.direct?.[1],
        entries.allOf?.[1],
        entries.anyOf?.[1],
        entries.oneOf?.[1],
      ].filter(schema => schema !== undefined))

      return [
        name,
        schemas.length === 1 ? schemas[0]! : { allOf: schemas },
        !schema.required?.includes(name)
        && [entries.allOf, entries.anyOf, entries.oneOf].every(entry => entry === undefined || entry[2]),
      ] satisfies JsonObjectSchemaEntry
    }),
    objectLike,
  }
}

/**
 * Flattens `anyOf` and `oneOf` unions when they are the only active constraints.
 */
export function flattenJsonUnionSchema(schema: JsonSchema): JsonSchema[] {
  return deduplicateJsonSchemas(flattenJsonUnionSchemaInternal(schema, new Set()))
}

function flattenJsonUnionSchemaInternal(
  schema: JsonSchema,
  resolvingRefs: Set<string>,
): JsonSchema[] {
  if (typeof schema !== 'object') {
    return [schema]
  }

  if (typeof schema.$ref === 'string') {
    if (resolvingRefs.has(schema.$ref)) {
      return []
    }

    const resolved = resolveJsonSchemaRootLocalRef(schema)

    if (resolved !== schema) {
      const result = flattenJsonUnionSchemaInternal(resolved, new Set(resolvingRefs).add(schema.$ref))
      if (result.length > 1) {
        return result
      }
    }
  }
  const { anyOf: _anyOf, oneOf: _oneOf, ...rest } = schema
  const entries = Object.entries(rest).filter(([, val]) => val !== undefined)

  for (const keyword of ['anyOf', 'oneOf'] as const) {
    if (schema[keyword]) {
      return schema[keyword].flatMap((s) => {
        s = ensureJsonSchemaObject(s)

        const mergedSchema: JsonSchema = {
          ...s,
          ...Object.fromEntries(entries.filter(([key]) => s[key as keyof typeof s] === undefined)),
          $defs: schema.$defs,
        }

        const conflicts = entries.filter(([key]) => s[key as keyof typeof s] !== undefined)
        if (conflicts.length) {
          mergedSchema.allOf = [...toArray(mergedSchema.allOf), Object.fromEntries(conflicts)]
        }

        return flattenJsonUnionSchemaInternal(mergedSchema, resolvingRefs)
      })
    }
  }

  return [schema]
}

/**
 * Matches a union made of a single item schema and its array form.
 */
export function matchArrayableJsonSchema(schema: JsonSchema): undefined | [itemSchema: JsonSchema, arraySchema: JsonArraySchema] {
  const schemas = flattenJsonUnionSchema(schema)

  if (schemas.length !== 2) {
    return undefined
  }

  const arraySchema = schemas.find(isJsonArraySchema)
  if (arraySchema === undefined) {
    return undefined
  }

  const items1 = arraySchema.items ?? true
  const items2 = schemas.find(s => s !== arraySchema) as JsonSchema

  const logicItem1: JsonSchema = Object.fromEntries(
    Object.entries(ensureJsonSchemaObject(items1))
      .filter(([key]) => JSON_SCHEMA_LOGIC_KEYWORDS.has(key)),
  )

  const logicItem2: JsonSchema = Object.fromEntries(
    Object.entries(ensureJsonSchemaObject(items2))
      .filter(([key]) => JSON_SCHEMA_LOGIC_KEYWORDS.has(key)),
  )

  if (!isDeepEqual(logicItem1, logicItem2)) {
    return undefined
  }

  return [items2, arraySchema]
}

export function deduplicateJsonSchemas(schemas: JsonSchema[]): JsonSchema[] {
  const result: JsonSchema[] = []

  for (const schema of schemas) {
    if (result.some(i => isDeepEqual(i, schema))) {
      continue
    }

    result.push(schema)
  }

  return result
}

function withRootDefs(schema: JsonSchema, $defs: Record<string, JsonSchema> | undefined): JsonSchema {
  if (typeof schema === 'boolean' || !$defs) {
    return schema
  }

  return { ...schema, $defs }
}
