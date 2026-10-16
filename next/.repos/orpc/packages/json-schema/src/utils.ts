/**
 * These utilities assume the schema has only one root-level `$defs` object
 * and exclusively use absolute JSON pointers for `$ref` values.
 */

import type { JsonSchema } from './types'
import { JSON_SCHEMA_LOGIC_KEYWORDS, JSON_SCHEMA_PRIMITIVE_TYPES } from './constants'

export function isJsonPrimitiveSchema(schema: JsonSchema): schema is JsonSchema & object {
  if (typeof schema === 'boolean') {
    return false
  }

  if (typeof schema.type === 'string' && JSON_SCHEMA_PRIMITIVE_TYPES.has(schema.type)) {
    return true
  }

  if (schema.const !== undefined) {
    return true
  }

  if (schema.enum !== undefined) {
    return true
  }

  return false
}

export type JsonFileSchema = JsonSchema & object & { type: 'string', contentMediaType?: string }

/**
 * Returns true when the schema is a file-like string schema.
 */
export function isJsonFileSchema(schema: JsonSchema): schema is JsonFileSchema {
  return typeof schema !== 'boolean' && schema.type === 'string' && (typeof schema.contentMediaType === 'string' || schema.format === 'binary' || schema.contentEncoding === 'binary')
}

export type JsonObjectSchema = JsonSchema & object & { type: 'object' }

/**
 * Returns true when the schema is an object schema.
 */
export function isJsonObjectSchema(schema: JsonSchema): schema is JsonObjectSchema {
  return typeof schema !== 'boolean' && schema.type === 'object'
}

export type JsonArraySchema = JsonSchema & object & { type: 'array' }

/**
 * Returns true when the schema is an array schema.
 */
export function isJsonArraySchema(schema: JsonSchema): schema is JsonArraySchema {
  return typeof schema !== 'boolean' && schema.type === 'array'
}

/**
 * Returns true when the schema does not apply any recognized constraints.
 */
export function isUnconstrainedSchema(schema: JsonSchema): boolean {
  if (typeof schema === 'boolean') {
    return schema
  }

  if (Object.keys(schema).every(k => !JSON_SCHEMA_LOGIC_KEYWORDS.has(k))) {
    return true
  }

  return false
}

/**
 * Ensures a JSON Schema is represented as an object schema document.
 */
export function ensureJsonSchemaObject(schema: JsonSchema): Exclude<JsonSchema, boolean> {
  if (typeof schema === 'boolean') {
    return schema ? {} : { not: {} }
  }

  return schema
}
