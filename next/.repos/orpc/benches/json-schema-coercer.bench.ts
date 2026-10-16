import type { JsonSchema } from '@orpc/json-schema'
import { JsonSchemaCoercer } from '@orpc/json-schema'
import { bench } from 'vitest'

const coercer = new JsonSchemaCoercer()

const DATE_SCHEMA = { 'type': 'string', 'format': 'date-time', 'x-native-type': 'date' } as JsonSchema
const BIGINT_SCHEMA = { 'type': 'string', 'pattern': '^-?[0-9]+$', 'x-native-type': 'bigint' } as JsonSchema
const URL_SCHEMA = { 'type': 'string', 'format': 'uri', 'x-native-type': 'url' } as JsonSchema

/** What a GET request's query params look like: every leaf arrives as a string. */
const FLAT_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    active: { type: 'boolean' },
    score: { type: 'number' },
    createdAt: DATE_SCHEMA,
  },
  required: ['id', 'name', 'active', 'score', 'createdAt'],
}

const FLAT_STRINGS = {
  id: '123',
  name: 'item-123',
  active: 'true',
  score: '3.14',
  createdAt: '2024-01-01T00:00:00.000Z',
}

const FLAT_TYPED = {
  id: 123,
  name: 'item-123',
  active: true,
  score: 3.14,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
}

/** Mirrors the serializer benches' unit: native types + unions, minus File/custom classes. */
const UNIT_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    active: { type: 'boolean' },
    createdAt: DATE_SCHEMA,
    largeInt: BIGINT_SCHEMA,
    tags: { 'type': 'array', 'uniqueItems': true, 'items': { type: 'string' }, 'x-native-type': 'set' } as JsonSchema,
    metadata: {
      'type': 'array',
      'items': {
        type: 'array',
        prefixItems: [
          { type: 'string' },
          { anyOf: [{ type: 'integer' }, DATE_SCHEMA, { type: 'string' }] },
        ],
        minItems: 2,
        maxItems: 2,
      },
      'x-native-type': 'map',
    } as JsonSchema,
    homepage: URL_SCHEMA,
  },
  required: ['id', 'name', 'active', 'createdAt', 'largeInt', 'tags', 'metadata', 'homepage'],
}

/** A unit as it arrives after JSON parsing: native types collapsed to strings/arrays. */
function createJsonUnit(i: number) {
  return {
    id: i,
    name: `item-${i}`,
    active: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    largeInt: `${9007199254740993n + BigInt(i)}`,
    tags: ['a', 'b', 'c'],
    metadata: [
      ['version', '2.0.0'],
      ['count', i],
      ['nested', '2023-06-15T12:30:00.000Z'],
    ],
    homepage: 'https://orpc.dev/docs',
  }
}

/** The same unit already carrying native types, so coercion only has to verify. */
function createTypedUnit(i: number) {
  return {
    id: i,
    name: `item-${i}`,
    active: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    largeInt: 9007199254740993n + BigInt(i),
    tags: new Set(['a', 'b', 'c']),
    metadata: new Map<string, unknown>([
      ['version', '2.0.0'],
      ['count', i],
      ['nested', new Date('2023-06-15T12:30:00.000Z')],
    ]),
    homepage: new URL('https://orpc.dev/docs'),
  }
}

const UNIT_JSON = createJsonUnit(0)
const UNIT_TYPED = createTypedUnit(0)

const UNITS_SCHEMA: JsonSchema = { type: 'array', items: UNIT_SCHEMA }
const UNITS_JSON_1000 = Array.from({ length: 1_000 }, (_, i) => createJsonUnit(i))
const UNITS_TYPED_1000 = Array.from({ length: 1_000 }, (_, i) => createTypedUnit(i))

/** Recursive tree via `$ref`, the shape category/comment-style schemas produce. */
const TREE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    value: { type: 'integer' },
    children: { type: 'array', items: { $ref: '#' } },
  },
  required: ['value', 'children'],
}

function createTree(depth: number, breadth: number): unknown {
  return {
    value: `${depth}`,
    children: depth === 0
      ? []
      : Array.from({ length: breadth }, () => createTree(depth - 1, breadth)),
  }
}

// 156 nodes
const TREE = createTree(3, 5)

describe('json schema coercer', () => {
  bench('flat object from query params', () => {
    coercer.coerce([FLAT_SCHEMA, false], FLAT_STRINGS)
  })

  bench('flat object already typed', () => {
    coercer.coerce([FLAT_SCHEMA, false], FLAT_TYPED)
  })

  bench('complex object with native types', () => {
    coercer.coerce([UNIT_SCHEMA, false], UNIT_JSON)
  })

  bench('complex object already typed', () => {
    coercer.coerce([UNIT_SCHEMA, false], UNIT_TYPED)
  })

  bench('1000 complex objects', () => {
    coercer.coerce([UNITS_SCHEMA, false], UNITS_JSON_1000)
  })

  bench('1000 complex objects already typed', () => {
    coercer.coerce([UNITS_SCHEMA, false], UNITS_TYPED_1000)
  })

  bench('recursive $ref tree', () => {
    coercer.coerce([TREE_SCHEMA, false], TREE)
  })
})
