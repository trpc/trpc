/**
 * These utilities assume the schema has only one root-level `$defs` object
 * and exclusively use absolute JSON pointers for `$ref` values.
 */

import type { JsonSchema } from './types'
import { get, setOwn } from '@orpc/shared'
import { JSON_SCHEMA_LOGIC_KEYWORDS, JSON_SCHEMA_RECORD_KEYWORDS } from './constants'

/**
 * Encodes a JSON Pointer segment according to RFC 6901.
 *
 * https://datatracker.ietf.org/doc/html/rfc6901
 */
export function encodeJsonPointerSegment(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1')
}

/**
 * Decodes a JSON Pointer segment according to RFC 6901.
 *
 * https://datatracker.ietf.org/doc/html/rfc6901
 */
export function decodeJsonPointerSegment(segment: string): string {
  return segment.replaceAll('~1', '/').replaceAll('~0', '~')
}

/**
 * Visits every `$ref` in a schema, traversing the same keywords as {@link mapJsonSchemaRefs}.
 * Shared or cyclic object instances are visited once.
 */
export function visitJsonSchemaRefs(
  value: JsonSchema,
  visit: (ref: string) => void,
  schemaLevel = true,
  seen = new Set<object>(),
): void {
  if (!value || typeof value !== 'object' || seen.has(value)) {
    return
  }

  seen.add(value)

  if (Array.isArray(value)) {
    for (const item of value) {
      visitJsonSchemaRefs(item, visit, schemaLevel, seen)
    }
    return
  }

  for (const key of Object.keys(value)) {
    const val = value[key]
    if (key === '$ref' && typeof val === 'string') {
      visit(val)
    }
    else if (!schemaLevel) {
      visitJsonSchemaRefs(val as JsonSchema, visit, true, seen)
    }
    else if (JSON_SCHEMA_LOGIC_KEYWORDS.has(key) || JSON_SCHEMA_RECORD_KEYWORDS.has(key)) {
      visitJsonSchemaRefs(val as JsonSchema, visit, !JSON_SCHEMA_RECORD_KEYWORDS.has(key), seen)
    }
  }
}

export function mapJsonSchemaRefs(
  value: JsonSchema,
  map: (ref: string, path: Array<string | number>) => string,
  schemaLevel = true,
  path: Array<string | number> = [],
): JsonSchema {
  if (!value || typeof value !== 'object') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => mapJsonSchemaRefs(item, map, schemaLevel, [...path, index])) as any
  }

  const result: Record<string, unknown> = {}
  for (const key of Object.keys(value)) {
    const val = value[key]
    if (key === '$ref' && typeof val === 'string') {
      setOwn(result, key, map(val, [...path, key]))
    }
    else if (!schemaLevel) {
      setOwn(result, key, mapJsonSchemaRefs(val as JsonSchema, map, true, [...path, key]))
    }
    else if (JSON_SCHEMA_LOGIC_KEYWORDS.has(key) || JSON_SCHEMA_RECORD_KEYWORDS.has(key)) {
      setOwn(result, key, mapJsonSchemaRefs(val as JsonSchema, map, !JSON_SCHEMA_RECORD_KEYWORDS.has(key), [...path, key]))
    }
    else {
      setOwn(result, key, val)
    }
  }

  return result as JsonSchema
}

/**
 * Rewrites recursive root `#` refs by moving the schema body into `$defs`.
 */
export function hoistRecursiveRefToDef(schema: JsonSchema): JsonSchema {
  if (typeof schema !== 'object') {
    return schema
  }

  const isRootRef = (ref: string) => ref === '#'
    || (ref.startsWith('#/') && !ref.startsWith('#/$defs/') && get(schema, ref.slice(2).split('/').map(decodeJsonPointerSegment)) !== undefined)

  // most schemas have no root ref, so detect one without copying the schema
  let hasRootRef = false
  visitJsonSchemaRefs(schema, (ref) => {
    hasRootRef ||= isRootRef(ref)
  })

  if (!hasRootRef) {
    return schema
  }

  const defName = findRecursiveJsonSchemaDefName(schema.$defs)
  const defRef = `#/$defs/${encodeJsonPointerSegment(defName)}`
  const { $defs, ...rest } = mapJsonSchemaRefs(schema, ref => isRootRef(ref) ? `${defRef}${ref.slice(1)}` : ref) as Exclude<JsonSchema, boolean>

  return {
    $ref: defRef,
    $defs: {
      ...$defs,
      [defName]: rest,
    },
  }
}

/**
 * Resolves a local `$ref` at the **root level** of the given schema, if present.
 *
 * Only handles refs of the form `#/$defs/<name>` pointing into the provided
 * (or schema-embedded) `$defs` map. Nested `$ref`s inside sub-schemas are
 * intentionally left untouched.
 *
 * If the ref cannot be resolved (missing `$defs`, unknown key, etc.) the
 * schema is returned as-is. Chained refs are followed until one repeats,
 * which is kept.
 *
 * @param schema - The schema whose root-level `$ref` should be resolved.
 * @param $defs - Definition map to resolve against. If omitted, falls back to
 *   `schema.$defs`. When provided, takes precedence over any `$defs` embedded
 *   in the schema.
 */
export function resolveJsonSchemaRootLocalRef(
  schema: JsonSchema,
  $defs?: Exclude<JsonSchema, boolean>['$defs'],
): JsonSchema {
  if (typeof schema === 'boolean') {
    return schema
  }

  if (arguments.length === 1) {
    $defs = schema.$defs
  }

  if (!$defs) {
    return schema
  }

  const followedRefs = new Set<string>()
  let current = schema

  while (typeof current.$ref === 'string' && current.$ref.startsWith('#/$defs/') && !followedRefs.has(current.$ref)) {
    followedRefs.add(current.$ref)

    const resolved = get($defs, current.$ref.slice('#/$defs/'.length).split('/').map(decodeJsonPointerSegment)) as JsonSchema | undefined

    if (resolved === undefined) {
      return current
    }

    if (typeof resolved !== 'object') {
      return resolved
    }

    const { $ref: _ref, ...rest } = current
    current = {
      ...rest,
      ...resolved,
    }
  }

  return current
}

function findRecursiveJsonSchemaDefName(defs: Exclude<JsonSchema, boolean>['$defs'] | undefined): string {
  let index = 0

  while (defs?.[`__schema${index}`] !== undefined) {
    index++
  }

  return `__schema${index}`
}
