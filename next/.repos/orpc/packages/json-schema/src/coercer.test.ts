import type { JsonSchema } from './types'
import { JsonSchemaCoercer } from './coercer'

const coercer = new JsonSchemaCoercer()

/**
 * Coerces like the smart coercion plugins do, from the `[jsonSchema, optional]`
 * pair a `JsonSchemaConverter` returns.
 */
function coerce(schema: JsonSchema | Record<string, unknown>, value: unknown, optional: boolean = false): unknown {
  return coercer.coerce([schema as JsonSchema, optional], value)
}

/**
 * Native type schemas as `ZodToJsonSchemaConverter` emits them, so the tests stay tied to
 * payloads that really reach the plugins. `url` comes from custom converters,
 * because no built-in converter maps a validator to it yet.
 */
const DATE_SCHEMA = { 'type': 'string', 'format': 'date-time', 'x-native-type': 'date' }
const BIGINT_SCHEMA = { 'type': 'string', 'pattern': '^-?[0-9]+$', 'x-native-type': 'bigint' }
const URL_SCHEMA = { 'type': 'string', 'format': 'uri', 'x-native-type': 'url' }

function setSchema(items: Record<string, unknown>) {
  return { 'type': 'array', 'uniqueItems': true, items, 'x-native-type': 'set' }
}

function mapSchema(key: Record<string, unknown>, value: Record<string, unknown>) {
  return {
    'type': 'array',
    'items': { type: 'array', prefixItems: [key, value], minItems: 2, maxItems: 2 },
    'x-native-type': 'map',
  }
}

describe('jsonSchemaCoercer', () => {
  describe('booleans', () => {
    it('accepts the boolean spellings browsers and CLIs send', () => {
      expect(coerce({ type: 'boolean' }, 'true')).toBe(true)
      expect(coerce({ type: 'boolean' }, 'TRUE')).toBe(true)
      expect(coerce({ type: 'boolean' }, 'on')).toBe(true)
      expect(coerce({ type: 'boolean' }, 'On')).toBe(true)
      expect(coerce({ type: 'boolean' }, 'false')).toBe(false)
      expect(coerce({ type: 'boolean' }, 'off')).toBe(false)
      expect(coerce({ type: 'boolean' }, 'OFF')).toBe(false)
      expect(coerce({ type: 'boolean' }, true)).toBe(true)

      // anything else keeps its original value so validation can report it
      expect(coerce({ type: 'boolean' }, 'yes')).toBe('yes')
      expect(coerce({ type: 'boolean' }, '1')).toBe('1')
      expect(coerce({ type: 'boolean' }, '')).toBe('')
      expect(coerce({ type: 'boolean' }, 1)).toBe(1)
    })
  })

  describe('numbers', () => {
    it('coerces numeric strings only when the number is exact', () => {
      expect(coerce({ type: 'number' }, '123')).toBe(123)
      expect(coerce({ type: 'number' }, '3.14')).toBe(3.14)
      expect(coerce({ type: 'number' }, '-0.5')).toBe(-0.5)
      expect(coerce({ type: 'number' }, 123)).toBe(123)

      expect(coerce({ type: 'number' }, '')).toBe('')
      expect(coerce({ type: 'number' }, 'abc')).toBe('abc')
      expect(coerce({ type: 'number' }, '12px')).toBe('12px')
      expect(coerce({ type: 'number' }, '0x10')).toBe('0x10')
      expect(coerce({ type: 'number' }, '007')).toBe('007')
      expect(coerce({ type: 'number' }, ' 123 ')).toBe(' 123 ')
      expect(coerce({ type: 'number' }, 'NaN')).toBe('NaN')
      expect(coerce({ type: 'number' }, 'Infinity')).toBe('Infinity')
      expect(coerce({ type: 'number' }, [])).toEqual([])

      // scientific notation is not a plain numeric string
      expect(coerce({ type: 'number' }, '1e3')).toBe('1e3')

      // beyond the safe integer range digits would get lost
      expect(coerce({ type: 'number' }, '12345678901234567890')).toBe('12345678901234567890')
      expect(coerce({ type: 'number' }, '-12345678901234567890')).toBe('-12345678901234567890')
      expect(coerce({ type: 'number' }, '9'.repeat(400))).toBe('9'.repeat(400))
    })

    it('coerces integer strings and refuses fractional or lossy ones', () => {
      // z.int() emits { type: 'integer', minimum, maximum }
      expect(coerce({ type: 'integer' }, '42')).toBe(42)
      expect(coerce({ type: 'integer' }, '-7')).toBe(-7)

      expect(coerce({ type: 'integer' }, '1e3')).toBe('1e3')
      expect(coerce({ type: 'integer' }, '')).toBe('')
      expect(coerce({ type: 'integer' }, '4.5')).toBe('4.5')
      expect(coerce({ type: 'integer' }, '0x10')).toBe('0x10')
      expect(coerce({ type: 'integer' }, 'abc')).toBe('abc')
      expect(coerce({ type: 'integer' }, [])).toEqual([])

      // beyond the safe integer range digits would get lost
      expect(coerce({ type: 'integer' }, '12345678901234567890')).toBe('12345678901234567890')

      // an already numeric value is never rewritten
      expect(coerce({ type: 'integer' }, 4.5)).toBe(4.5)
    })
  })

  describe('strings and null', () => {
    it('never rewrites a value into a string or into null', () => {
      expect(coerce({ type: 'string' }, 'abc')).toBe('abc')
      expect(coerce({ type: 'string' }, 123)).toBe(123)
      expect(coerce({ type: 'null' }, null)).toBeNull()
      expect(coerce({ type: 'null' }, 'null')).toBe('null')
    })
  })

  describe('dates', () => {
    it('coerces ISO date and datetime strings', () => {
      expect(coerce(DATE_SCHEMA, '2023-10-01')).toEqual(new Date('2023-10-01'))
      expect(coerce(DATE_SCHEMA, '2020-01-01T06:15')).toEqual(new Date('2020-01-01T06:15'))
      expect(coerce(DATE_SCHEMA, '2020-01-01T06:15Z')).toEqual(new Date('2020-01-01T06:15Z'))
      expect(coerce(DATE_SCHEMA, '2020-01-01T06:15:00Z')).toEqual(new Date('2020-01-01T06:15:00Z'))
      expect(coerce(DATE_SCHEMA, '2020-01-01T06:15:00.123Z')).toEqual(new Date('2020-01-01T06:15:00.123Z'))
      expect(coerce(DATE_SCHEMA, '2020-01-01 06:15')).toEqual(new Date('2020-01-01 06:15'))

      // the expanded year form `toISOString` emits outside 0000-9999
      expect(coerce(DATE_SCHEMA, '+010000-01-01T00:00:00.000Z')).toEqual(new Date('+010000-01-01T00:00:00.000Z'))
      expect(coerce(DATE_SCHEMA, '-000001-02-28T00:00:00.000Z')).toEqual(new Date('-000001-02-28T00:00:00.000Z'))
      expect(coerce(DATE_SCHEMA, '+000000-01-01')).toEqual(new Date('+000000-01-01'))
    })

    it('coerces datetimes carrying a UTC offset in either direction', () => {
      expect(coerce(DATE_SCHEMA, '2020-01-01T06:15:00+07:00')).toEqual(new Date('2020-01-01T06:15:00+07:00'))
      expect(coerce(DATE_SCHEMA, '2020-01-01T06:15:00-07:00')).toEqual(new Date('2020-01-01T06:15:00-07:00'))
      expect(coerce(DATE_SCHEMA, '2020-01-01T06:15:00-0700')).toEqual(new Date('2020-01-01T06:15:00-0700'))
      expect(coerce(DATE_SCHEMA, '2020-01-01 06:15:00+07:00')).toEqual(new Date('2020-01-01T06:15:00+07:00'))
    })

    it('leaves a date followed by anything other than a time and offset untouched', () => {
      // V8's legacy parser reads trailing words, so these would silently become another date
      expect(coerce(DATE_SCHEMA, '2020-06-15 jan')).toBe('2020-06-15 jan')
      expect(coerce(DATE_SCHEMA, '2020-01-15 December')).toBe('2020-01-15 December')
      expect(coerce(DATE_SCHEMA, '2020-06-15 12:00 jan')).toBe('2020-06-15 12:00 jan')
      expect(coerce(DATE_SCHEMA, '2020-01-01T06:15:00 GMT')).toBe('2020-01-01T06:15:00 GMT')
      expect(coerce(DATE_SCHEMA, '2020-01-01Tfoo')).toBe('2020-01-01Tfoo')
    })

    it('leaves ambiguous or impossible dates untouched', () => {
      // month/day order depends on the runtime, so it is never guessed
      expect(coerce(DATE_SCHEMA, '12-25-2020')).toBe('12-25-2020')
      expect(coerce(DATE_SCHEMA, '01/02/2020')).toBe('01/02/2020')
      expect(coerce(DATE_SCHEMA, 'yesterday')).toBe('yesterday')
      expect(coerce(DATE_SCHEMA, '2018-06-')).toBe('2018-06-')

      // right shape, not a real instant
      expect(coerce(DATE_SCHEMA, '2020-13-45')).toBe('2020-13-45')
      expect(coerce(DATE_SCHEMA, '2020-01-01T99:99Z')).toBe('2020-01-01T99:99Z')

      // unpadded month or day, which V8 parses as local time while the padded form is UTC
      expect(coerce(DATE_SCHEMA, '2020-1-5')).toBe('2020-1-5')
      expect(coerce(DATE_SCHEMA, '2020-01-5')).toBe('2020-01-5')
      expect(coerce(DATE_SCHEMA, '2020-1-05T06:15Z')).toBe('2020-1-05T06:15Z')

      // only four digit or signed six digit years, V8 reads other forms with its legacy parser
      expect(coerce(DATE_SCHEMA, '+0001-02-28')).toBe('+0001-02-28')
      expect(coerce(DATE_SCHEMA, '-0048-02-29')).toBe('-0048-02-29')
      expect(coerce(DATE_SCHEMA, '10000-01-01')).toBe('10000-01-01')
      // ISO 8601 has no negative year zero
      expect(coerce(DATE_SCHEMA, '-000000-02-29')).toBe('-000000-02-29')

      // epoch numbers are ambiguous (seconds or milliseconds)
      expect(coerce(DATE_SCHEMA, 1700000000000)).toBe(1700000000000)
      expect(coerce(DATE_SCHEMA, [])).toEqual([])
    })

    it('leaves a day the month does not have untouched, instead of rolling it into the next month', () => {
      expect(coerce(DATE_SCHEMA, '2020-02-30')).toBe('2020-02-30')
      expect(coerce(DATE_SCHEMA, '2020-04-31')).toBe('2020-04-31')
      expect(coerce(DATE_SCHEMA, '2021-02-29')).toBe('2021-02-29')
      expect(coerce(DATE_SCHEMA, '2020-02-30T06:15:00Z')).toBe('2020-02-30T06:15:00Z')
      expect(coerce(DATE_SCHEMA, '2020-02-30 06:15')).toBe('2020-02-30 06:15')
      expect(coerce(DATE_SCHEMA, '0050-02-29')).toBe('0050-02-29')

      // real days stay coerced, including a leap day and years below 100
      expect(coerce(DATE_SCHEMA, '2020-02-29')).toEqual(new Date('2020-02-29'))
      expect(coerce(DATE_SCHEMA, '0048-02-29')).toEqual(new Date('0048-02-29'))
      // the offset moves the instant to March 1 in UTC, but the written day is real
      expect(coerce(DATE_SCHEMA, '2020-02-29T23:00:00-07:00')).toEqual(new Date('2020-03-01T06:00:00Z'))
    })

    it('keeps a value that is already a Date', () => {
      const date = new Date('2020-01-01T00:00:00.000Z')
      expect(coerce(DATE_SCHEMA, date)).toBe(date)
    })
  })

  describe('bigints', () => {
    it('coerces bigints from integer strings and whole numbers', () => {
      expect(coerce(BIGINT_SCHEMA, '9007199254740993')).toBe(9007199254740993n)
      expect(coerce(BIGINT_SCHEMA, '-42')).toBe(-42n)
      expect(coerce(BIGINT_SCHEMA, 42)).toBe(42n)
      expect(coerce(BIGINT_SCHEMA, 42n)).toBe(42n)
    })

    it('leaves values a bigint cannot represent unambiguously untouched', () => {
      expect(coerce(BIGINT_SCHEMA, 'invalid')).toBe('invalid')
      expect(coerce(BIGINT_SCHEMA, '4.5')).toBe('4.5')
      expect(coerce(BIGINT_SCHEMA, 4.5)).toBe(4.5)
      expect(coerce(BIGINT_SCHEMA, Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY)
      expect(coerce(BIGINT_SCHEMA, true)).toBe(true)
      expect(coerce(BIGINT_SCHEMA, [])).toEqual([])

      // `BigInt()` accepts these, but they are not plain integer strings
      expect(coerce(BIGINT_SCHEMA, '')).toBe('')
      expect(coerce(BIGINT_SCHEMA, '  ')).toBe('  ')
      expect(coerce(BIGINT_SCHEMA, '0x10')).toBe('0x10')
    })

    it('leaves integer strings longer than maxBigIntDigits untouched', () => {
      expect(coerce(BIGINT_SCHEMA, '9'.repeat(4300))).toBe(BigInt('9'.repeat(4300)))
      expect(coerce(BIGINT_SCHEMA, '9'.repeat(4301))).toBe('9'.repeat(4301))
      expect(coerce({ anyOf: [BIGINT_SCHEMA, BIGINT_SCHEMA] }, '9'.repeat(4301))).toBe('9'.repeat(4301))

      const limited = new JsonSchemaCoercer({ maxBigIntDigits: 3 })
      expect(limited.coerce([BIGINT_SCHEMA as JsonSchema, false], '999')).toBe(999n)
      expect(limited.coerce([BIGINT_SCHEMA as JsonSchema, false], '1000')).toBe('1000')
      // whole numbers are bounded by the JSON number range, so they are not limited
      expect(limited.coerce([BIGINT_SCHEMA as JsonSchema, false], 1000)).toBe(1000n)
    })
  })

  describe('urls', () => {
    it('coerces url strings', () => {
      expect(coerce(URL_SCHEMA, 'https://example.com')).toEqual(new URL('https://example.com'))
      expect(coerce(URL_SCHEMA, 'invalid')).toBe('invalid')
      expect(coerce(URL_SCHEMA, [])).toEqual([])

      const url = new URL('https://example.com')
      expect(coerce(URL_SCHEMA, url)).toBe(url)
    })
  })

  describe('sets and maps', () => {
    it('coerces a unique array into a Set, after coercing its items', () => {
      // z.set(z.number())
      expect(coerce(setSchema({ type: 'number' }), ['1', '2', '3'])).toEqual(new Set([1, 2, 3]))
      expect(coerce(setSchema({ type: 'string' }), [])).toEqual(new Set())
    })

    it('leaves an array with duplicates untouched, because a Set would drop data', () => {
      expect(coerce(setSchema({ type: 'number' }), ['1', '2', '2'])).toEqual([1, 2, 2])
    })

    it('leaves non arrays untouched for a Set', () => {
      expect(coerce(setSchema({ type: 'string' }), 'a')).toBe('a')
      expect(coerce(setSchema({ type: 'string' }), {})).toEqual({})

      const set = new Set(['a'])
      expect(coerce(setSchema({ type: 'string' }), set)).toBe(set)
    })

    it('coerces an array of key/value pairs into a Map', () => {
      // z.map(z.number(), z.boolean())
      const schema = mapSchema({ type: 'number' }, { type: 'boolean' })

      expect(coerce(schema, [['1', 'true'], ['2', 'off']])).toEqual(new Map<unknown, unknown>([[1, true], [2, false]]))
      expect(coerce(schema, [])).toEqual(new Map())
    })

    it('leaves entries that are not unique pairs untouched for a Map', () => {
      const schema = mapSchema({ type: 'number' }, { type: 'boolean' })

      // duplicated key
      expect(coerce(schema, [['1', 'true'], ['1', 'off']])).toEqual([[1, true], [1, false]])
      // not a pair
      expect(coerce(schema, [['1', 'true'], ['2']])).toEqual([[1, true], [2]])
      expect(coerce(schema, ['1'])).toEqual(['1'])
      expect(coerce(schema, {})).toEqual({})

      const map = new Map([[1, true]])
      expect(coerce(schema, map)).toBe(map)
    })
  })

  describe('enums and literals', () => {
    it('coerces enum members', () => {
      // z.enum(['pending', 'done'])
      expect(coerce({ type: 'string', enum: ['pending', 'done'] }, 'done')).toBe('done')
      // z.enum({ Low: 1, High: 2 })
      expect(coerce({ type: 'number', enum: [1, 2] }, '2')).toBe(2)

      expect(coerce({ enum: [123, '234', true] }, 123)).toBe(123)
      expect(coerce({ enum: [123, '234', true] }, '234')).toBe('234')
      expect(coerce({ enum: [123, '234', true] }, '123')).toBe(123)
      expect(coerce({ enum: [123, '234', true] }, 'on')).toBe(true)
      expect(coerce({ enum: [123, '234', true] }, 'off')).toBe('off')
      expect(coerce({ enum: [123, '234', true] }, ['on'])).toEqual(['on'])
    })

    it('coerces literals', () => {
      // z.literal(true)
      expect(coerce({ type: 'boolean', const: true }, 'on')).toBe(true)
      expect(coerce({ const: true }, 'off')).toBe('off')
      expect(coerce({ const: true }, ['on'])).toEqual(['on'])
    })
  })

  describe('tuples', () => {
    it('coerces tuples, with or without a rest schema', () => {
      // z.tuple([z.number(), z.boolean()])
      expect(coerce({ type: 'array', prefixItems: [{ type: 'number' }, { type: 'boolean' }] }, ['1', 'on'])).toEqual([1, true])
      // z.tuple([z.number()], z.boolean())
      expect(coerce({ type: 'array', prefixItems: [{ type: 'number' }], items: { type: 'boolean' } }, ['1', 'on', 'off'])).toEqual([1, true, false])
      // draft-07 tuple form
      expect(coerce({ type: 'array', items: [{ type: 'number' }, { type: 'boolean' }], additionalItems: { type: 'number' } }, ['1', 'on', '2'])).toEqual([1, true, 2])
    })

    it('leaves items no schema describes untouched', () => {
      expect(coerce({ type: 'array', prefixItems: [{ type: 'number' }] }, ['1', '2'])).toEqual([1, '2'])
      expect(coerce({ type: 'array', items: [{ type: 'number' }] }, ['1', '2'])).toEqual([1, '2'])
      expect(coerce({ type: 'array' }, ['1'])).toEqual(['1'])
    })

    it('coerces what it can when a tuple is too short', () => {
      expect(coerce({ type: 'array', prefixItems: [{ type: 'number' }, { type: 'boolean' }] }, ['1'])).toEqual([1])
    })

    it('leaves non arrays untouched', () => {
      expect(coerce({ type: 'array', items: { type: 'number' } }, '1')).toBe('1')
      expect(coerce({ type: 'array', items: { type: 'number' } }, { 0: '1' })).toEqual({ 0: '1' })
    })
  })

  describe('objects and records', () => {
    it('coerces a search query where every value arrives as a string', () => {
      // z.object({ page: z.int(), perPage: z.int().optional(), q: z.string(), archived: z.boolean() })
      const schema = {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          perPage: { type: 'integer' },
          q: { type: 'string' },
          archived: { type: 'boolean' },
        },
        required: ['page', 'q', 'archived'],
      }

      expect(coerce(schema, { page: '2', perPage: '25', q: '123', archived: 'on' })).toEqual({
        page: 2,
        perPage: 25,
        q: '123',
        archived: true,
      })
    })

    it('keeps a property that is explicitly undefined', () => {
      const schema = {
        type: 'object',
        properties: { page: { type: 'integer' }, q: { type: 'string' } },
        required: ['q'],
      }

      expect(coerce(schema, { page: undefined, q: '1' })).toEqual({ page: undefined, q: '1' })
      expect(coerce(schema, { page: '2', q: undefined })).toEqual({ page: 2, q: undefined })
    })

    it('coerces nested objects and arrays of objects', () => {
      // z.object({ filters: z.object({ since: z.date() }), items: z.array(z.object({ qty: z.int() })) })
      const schema = {
        type: 'object',
        properties: {
          filters: { type: 'object', properties: { since: DATE_SCHEMA }, required: ['since'] },
          items: { type: 'array', items: { type: 'object', properties: { qty: { type: 'integer' } }, required: ['qty'] } },
        },
        required: ['filters', 'items'],
      }

      expect(coerce(schema, { filters: { since: '2020-01-01' }, items: [{ qty: '1' }, { qty: '2' }] })).toEqual({
        filters: { since: new Date('2020-01-01') },
        items: [{ qty: 1 }, { qty: 2 }],
      })
    })

    it('coerces record values through additionalProperties and patternProperties', () => {
      // z.record(z.string(), z.number())
      expect(coerce({ type: 'object', additionalProperties: { type: 'number' } }, { a: '1', b: '2' }))
        .toEqual({ a: 1, b: 2 })

      const schema = {
        type: 'object',
        properties: { total: { type: 'integer' } },
        patternProperties: { '^at': DATE_SCHEMA },
        additionalProperties: { type: 'number' },
      }

      expect(coerce(schema, { total: '3', atCreated: '2020-01-01', atUpdated: '2020-01-02', ratio: '0.5' })).toEqual({
        total: 3,
        atCreated: new Date('2020-01-01'),
        atUpdated: new Date('2020-01-02'),
        ratio: 0.5,
      })
    })

    it('leaves keys no schema describes untouched', () => {
      // z.strictObject({ page: z.int() }) emits additionalProperties: false
      expect(coerce({ type: 'object', properties: { page: { type: 'integer' } }, additionalProperties: false }, { page: '2', extra: '3' }))
        .toEqual({ page: 2, extra: '3' })

      expect(coerce({ type: 'object', properties: { page: { type: 'integer' } } }, { page: '2', extra: '3' }))
        .toEqual({ page: 2, extra: '3' })
    })

    it('turns an array into an object with numeric keys, for bracket notation', () => {
      expect(coerce({ type: 'object', properties: { 0: { type: 'number' }, 1: { type: 'boolean' } } }, ['123', 'true']))
        .toEqual({ 0: 123, 1: true })
    })

    it('keeps special keys such as __proto__ as own properties', () => {
      const value = JSON.parse('{"__proto__": {"nested": "1"}, "count": "2"}')

      const coerced = coerce({
        type: 'object',
        properties: { count: { type: 'integer' } },
        additionalProperties: { type: 'object', properties: { nested: { type: 'integer' } } },
      }, value) as Record<string, unknown>

      expect(Object.keys(coerced)).toEqual(['__proto__', 'count'])
      expect(coerced.count).toBe(2)
      expect(Object.getOwnPropertyDescriptor(coerced, '__proto__')?.value).toEqual({ nested: 1 })
      expect((coerced as any).nested).toBeUndefined()
      expect(({} as any).nested).toBeUndefined()
    })

    it('leaves non objects untouched', () => {
      expect(coerce({ type: 'object', properties: { page: { type: 'integer' } } }, 'nope')).toBe('nope')
    })
  })

  describe('unions', () => {
    it('prefers the branch that needs no conversion', () => {
      // z.union([z.number(), z.string()]): a string already satisfies the union
      expect(coerce({ anyOf: [{ type: 'number' }, { type: 'string' }] }, '123')).toBe('123')
      expect(coerce({ anyOf: [{ type: 'string' }, { type: 'number' }] }, '123')).toBe('123')
      // z.union([z.number(), z.boolean()]): only one branch can accept 'true'
      expect(coerce({ anyOf: [{ type: 'number' }, { type: 'boolean' }] }, 'true')).toBe(true)
      expect(coerce({ anyOf: [{ type: 'number' }, { type: 'boolean' }] }, '123')).toBe(123)
    })

    it('handles nullable and nullish schemas', () => {
      // z.date().nullable()
      const schema = { anyOf: [DATE_SCHEMA, { type: 'null' }] }

      expect(coerce(schema, '2020-01-01')).toEqual(new Date('2020-01-01'))
      expect(coerce(schema, null)).toBeNull()
      expect(coerce(schema, 'nope')).toBe('nope')

      // z.number().nullish()
      expect(coerce({ anyOf: [{ type: 'number' }, { type: 'null' }] }, undefined, true)).toBeUndefined()
    })

    it('coerces a number into a bigint inside a union', () => {
      // z.bigint().nullable(): the bigint branch is `type: 'string'`, which a number never matches
      const schema = { anyOf: [BIGINT_SCHEMA, { type: 'null' }] }

      expect(coerce(schema, 123)).toBe(123n)
      expect(coerce(schema, '123')).toBe(123n)
      expect(coerce(schema, null)).toBeNull()
      expect(coerce(schema, 4.5)).toBe(4.5)
    })

    it('accepts a value already of the native type, so the rest of the branch is still coerced', () => {
      // z.object({ at: z.date(), count: z.number() }).nullable()
      const schema = {
        anyOf: [
          { type: 'object', properties: { at: DATE_SCHEMA, count: { type: 'number' } }, required: ['at', 'count'] },
          { type: 'null' },
        ],
      }

      const at = new Date('2020-01-01T00:00:00.000Z')
      expect(coerce(schema, { at, count: '1' })).toEqual({ at, count: 1 })
    })

    it('accepts a native value only under the JSON type it is serialized as', () => {
      // `type: ['string', 'null']` expands into a `null` branch that keeps `x-native-type`
      const schema = {
        anyOf: [
          { type: 'object', properties: { at: { 'type': 'null', 'x-native-type': 'date' }, count: { type: 'string' } } },
          { type: 'object', properties: { at: DATE_SCHEMA, count: { type: 'number' } } },
        ],
      }

      const at = new Date('2020-01-01T00:00:00.000Z')
      expect(coerce(schema, { at, count: '1' })).toEqual({ at, count: 1 })
    })

    it('accepts null for a native type declared as a type array with null', () => {
      // z.object({ at: z.date().nullable(), count: z.number() }).nullable(), with the nullable date as a type array
      const schema = {
        anyOf: [
          {
            type: 'object',
            properties: { at: { 'type': ['string', 'null'], 'format': 'date-time', 'x-native-type': 'date' }, count: { type: 'number' } },
            required: ['at', 'count'],
          },
          { type: 'null' },
        ],
      }

      const at = new Date('2020-01-01T00:00:00.000Z')
      expect(coerce(schema, { at: null, count: '1' })).toEqual({ at: null, count: 1 })
      expect(coerce(schema, { at: '2020-01-01T00:00:00.000Z', count: '1' })).toEqual({ at, count: 1 })
      expect(coerce(schema, { at, count: '1' })).toEqual({ at, count: 1 })
    })

    it('coerces a tuple ending in optional items inside a union', () => {
      // z.tuple([z.number(), z.number().optional()]).nullable()
      const schema = {
        anyOf: [
          { type: 'array', prefixItems: [{ type: 'number' }, { type: 'number' }], items: false, minItems: 1, maxItems: 2 },
          { type: 'null' },
        ],
      }

      expect(coerce(schema, ['1'])).toEqual([1])
      expect(coerce(schema, ['1', '2'])).toEqual([1, 2])

      // shorter than minItems, so no branch matches
      expect(coerce(schema, [])).toEqual([])
    })

    it('handles the nullable form', () => {
      expect(coerce({ type: ['integer', 'null'] }, '5')).toBe(5)
      expect(coerce({ type: ['integer', 'null'] }, null)).toBeNull()
      expect(coerce({ type: ['boolean', 'null'] }, 'on')).toBe(true)
      expect(coerce({ type: ['integer', 'null'] }, 'nope')).toBe('nope')
    })

    it('picks the object branch whose required keys are present', () => {
      // z.union([z.object({ mode: z.string(), count: z.int() }), z.object({ count: z.number() })])
      const schema = {
        anyOf: [
          { type: 'object', properties: { mode: { type: 'string' }, count: { type: 'integer' } }, required: ['mode', 'count'] },
          { type: 'object', properties: { count: { type: 'number' } }, required: ['count'] },
        ],
      }

      expect(coerce(schema, { mode: 'fast', count: '2' })).toEqual({ mode: 'fast', count: 2 })
      expect(coerce(schema, { count: '1.5' })).toEqual({ count: 1.5 })
    })

    it('picks the tuple branch that describes every item', () => {
      const schema = {
        anyOf: [
          { type: 'array', prefixItems: [{ type: 'number' }, { type: 'boolean' }, { type: 'boolean' }], items: { type: 'number' } },
          { type: 'array', prefixItems: [{ type: 'number' }], items: { type: 'number' } },
        ],
      }

      expect(coerce(schema, ['1', 'true', 'true', '2'])).toEqual([1, true, true, 2])
      expect(coerce(schema, ['1', '2'])).toEqual([1, 2])
    })

    it('picks the branch matching the discriminator of a discriminated union', () => {
      // z.discriminatedUnion('type', [...]) emits oneOf with a const discriminator
      const schema = {
        oneOf: [
          {
            type: 'object',
            properties: { type: { type: 'string', const: 'text' }, length: { type: 'integer' } },
            required: ['type', 'length'],
          },
          {
            type: 'object',
            properties: { type: { type: 'string', const: 'image' }, width: { type: 'integer' }, lossless: { type: 'boolean' } },
            required: ['type', 'width'],
          },
        ],
      }

      expect(coerce(schema, { type: 'text', length: '12' })).toEqual({ type: 'text', length: 12 })
      expect(coerce(schema, { type: 'image', width: '800', lossless: 'off' })).toEqual({ type: 'image', width: 800, lossless: false })
      expect(coerce(schema, { type: 'video', width: '800' })).toEqual({ type: 'video', width: '800' })

      // extra keys do not disqualify the discriminator branch, validators usually strip them
      expect(coerce(schema, { type: 'text', length: '12', tracking: 'xyz' })).toEqual({ type: 'text', length: 12, tracking: 'xyz' })
    })

    it('prefers the branch that describes every key', () => {
      const partial = { type: 'object', properties: { a: { type: 'number' } } }
      const full = { type: 'object', properties: { a: { type: 'number' }, b: { type: 'boolean' } } }

      expect(coerce({ anyOf: [partial, full] }, { a: '1', b: 'on' })).toEqual({ a: 1, b: true })
      expect(coerce({ anyOf: [full, partial] }, { a: '1', b: 'on' })).toEqual({ a: 1, b: true })
    })

    it('prefers an untouched match over a fuller match that converts', () => {
      const schema = {
        anyOf: [
          { type: 'object', properties: { a: { type: 'string' } } },
          { type: 'object', properties: { a: { type: 'number' }, b: { type: 'string' } } },
        ],
      }

      const value = { a: '1', b: 'x' }
      expect(coerce(schema, value)).toBe(value)
    })

    it('honours a branch that excludes values with not', () => {
      const schema = {
        oneOf: [
          { type: 'number', not: { const: 1 } },
          { 'type': 'number', 'x-native-type': 'bigint', 'not': { const: 2n } },
        ],
      }

      expect(coerce(schema, '1')).toBe(1n)
      expect(coerce(schema, '2')).toBe(2)
      expect(coerce(schema, '3')).toBe(3)
    })

    it('leaves the value untouched when no branch matches', () => {
      expect(coerce({ anyOf: [{ type: 'number' }, { type: 'boolean' }] }, 'invalid')).toBe('invalid')
    })

    it('does not let a matching branch mask a keyword that already failed', () => {
      // `type` and `anyOf` both apply to the same value, and a string can never satisfy `type: 'null'`,
      // so the first branch must lose to the one that can really accept the value
      const schema = {
        anyOf: [
          { type: 'null', anyOf: [{ type: 'string' }] },
          { type: 'boolean' },
        ],
      }

      expect(coerce(schema, 'true')).toBe(true)
    })
  })

  describe('intersections', () => {
    it('applies every member of an intersection', () => {
      // z.intersection(z.object({ a: z.number() }), z.object({ b: z.boolean() }))
      const schema = {
        allOf: [
          { type: 'object', properties: { a: { type: 'number' } } },
          { type: 'object', properties: { b: { type: 'boolean' } } },
        ],
      }

      expect(coerce(schema, { a: '123', b: 'on', c: '789' })).toEqual({ a: 123, b: true, c: '789' })
      expect(coerce(schema, { a: '123' })).toEqual({ a: 123 })
      expect(coerce(schema, { b: 'off' })).toEqual({ b: false })
      expect(coerce(schema, 'invalid')).toBe('invalid')
    })
  })

  describe('$ref', () => {
    it('follows a $ref into $defs', () => {
      const schema = {
        $defs: { Timestamps: { type: 'array', items: DATE_SCHEMA } },
        type: 'object',
        properties: { seenAt: { $ref: '#/$defs/Timestamps' } },
        required: ['seenAt'],
      }

      expect(coerce(schema, { seenAt: ['2020-01-01', '2020-01-02'] })).toEqual({
        seenAt: [new Date('2020-01-01'), new Date('2020-01-02')],
      })
    })

    it('follows a chain of $refs', () => {
      const schema = {
        $defs: {
          Page: { $ref: '#/$defs/PageBase' },
          PageBase: { type: 'object', properties: { limit: { type: 'integer' } }, required: ['limit'] },
        },
        $ref: '#/$defs/Page',
      }

      expect(coerce(schema, { limit: '10' })).toEqual({ limit: 10 })
    })

    it('follows a $ref with escaped characters in its pointer', () => {
      const schema = {
        $defs: { 'user/id': { type: 'integer' } },
        $ref: '#/$defs/user~1id',
      }

      expect(coerce(schema, '7')).toBe(7)
    })

    it('coerces a recursive schema at every depth', () => {
      // z.object({ name: z.string(), get children() { return z.array(Category) } })
      const schema: JsonSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          visits: { type: 'integer' },
          children: { type: 'array', items: { $ref: '#' } },
        },
        required: ['name', 'children'],
      }

      expect(coerce(schema, {
        name: 'root',
        visits: '1',
        children: [
          { name: 'a', visits: '2', children: [] },
          { name: 'b', visits: '3', children: [{ name: 'c', visits: '4', children: [] }] },
        ],
      })).toEqual({
        name: 'root',
        visits: 1,
        children: [
          { name: 'a', visits: 2, children: [] },
          { name: 'b', visits: 3, children: [{ name: 'c', visits: 4, children: [] }] },
        ],
      })
    })

    it('coerces a recursive schema declared through $defs', () => {
      const schema: JsonSchema = {
        $defs: {
          get Node() {
            return schema
          },
        },
        type: 'object',
        properties: {
          visits: { type: 'integer' },
          next: { $ref: '#/$defs/Node' },
        },
      }

      expect(coerce(schema, { visits: '1', next: { visits: '2', next: { visits: '3' } } }))
        .toEqual({ visits: 1, next: { visits: 2, next: { visits: 3 } } })
    })
  })

  describe('invalid and unusual schemas', () => {
    it('ignores an unresolvable $ref', () => {
      expect(coerce({ $ref: '#/$defs/Missing' }, { a: true })).toEqual({ a: true })
      expect(coerce({ $ref: 'https://example.com/schema.json' }, { a: true })).toEqual({ a: true })
      expect(coerce({ $ref: '#/$defs/Missing', type: 'integer' }, '1')).toBe(1)
    })

    it('does not resolve a $ref into prototype members', () => {
      expect(coerce({ $ref: '#/constructor' }, '1')).toBe('1')
      expect(coerce({ $ref: '#/__proto__', type: 'integer' }, '1')).toBe(1)
    })

    it('stops instead of looping on a $ref cycle', () => {
      expect(coerce({ $ref: '#' }, { a: '1' })).toEqual({ a: '1' })

      expect(coerce({
        $defs: { Loop: { allOf: [{ $ref: '#/$defs/Loop' }, { type: 'object', properties: { a: { type: 'integer' } } }] } },
        $ref: '#/$defs/Loop',
      }, { a: '1' })).toEqual({ a: 1 })

      expect(coerce({
        $defs: { A: { $ref: '#/$defs/B' }, B: { $ref: '#/$defs/A' } },
        $ref: '#/$defs/A',
      }, { a: '1' })).toEqual({ a: '1' })
    })

    it('ignores a type it does not know', () => {
      expect(coerce({ type: 'float' }, '1.5')).toBe('1.5')
      expect(coerce({ type: 'String' }, 123)).toBe(123)
      expect(coerce({ type: 'datetime' }, '2020-01-01')).toBe('2020-01-01')
    })

    it('ignores x-native-type values it does not know', () => {
      expect(coerce({ 'type': 'string', 'x-native-type': 'temporal' }, '2020-01-01')).toBe('2020-01-01')
      expect(coerce({ 'type': 'number', 'x-native-type': 42 }, '1')).toBe(1)
    })

    it('leaves values untouched for schemas without a coercible type', () => {
      expect(coerce(true, '123')).toBe('123')
      expect(coerce(false, '123')).toBe('123')
      expect(coerce({}, '123')).toBe('123')
      expect(coerce({ description: 'anything goes' }, '123')).toBe('123')
      expect(coerce({ not: {} }, '123')).toBe('123')
      expect(coerce({ type: 'number', not: { type: 'string' } }, '123')).toBe(123)
    })

    it('handles empty enums and unions', () => {
      expect(coerce({ enum: [] }, 'anything')).toBe('anything')
      expect(coerce({ anyOf: [] }, '123')).toBe('123')
      expect(coerce({ oneOf: [] }, '123')).toBe('123')
    })

    it('skips an invalid patternProperties pattern without breaking the other keys', () => {
      const schema = {
        type: 'object',
        properties: { total: { type: 'integer' } },
        patternProperties: { '(unclosed': { type: 'number' }, '^n': { type: 'number' } },
      }

      expect(coerce(schema, { total: '3', n1: '1', other: 'x' })).toEqual({ total: 3, n1: 1, other: 'x' })
    })

    it('accepts boolean schemas for properties and items', () => {
      const value = { free: ['anything', 1], never: 'kept' }

      expect(coerce({
        type: 'object',
        properties: { free: { type: 'array', items: true }, never: false },
      }, value)).toBe(value)

      const record = { a: 'kept' }
      expect(coerce({ type: 'object', additionalProperties: true }, record)).toBe(record)
    })

    it('tolerates a tuple whose prefixItems is a single schema', () => {
      expect(coerce({ type: 'array', prefixItems: { type: 'number' } }, ['1', '2'])).toEqual([1, '2'])
    })

    it('tolerates an empty draft-07 tuple form', () => {
      expect(coerce({ type: 'array', items: [] }, ['1'])).toEqual(['1'])
    })
  })

  describe('untouched values', () => {
    it('skips a missing optional input entirely', () => {
      expect(coerce({ type: 'object', properties: { page: { type: 'integer' } } }, undefined, true)).toBeUndefined()
      expect(coerce({ type: 'integer' }, undefined, true)).toBeUndefined()

      // a required input still reaches validation untouched
      expect(coerce({ type: 'integer' }, undefined)).toBeUndefined()
      expect(coerce({ type: 'null' }, undefined)).toBeUndefined()
    })

    it('returns the very same value when nothing needs coercion', () => {
      const schema = {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          tags: { type: 'array', items: { type: 'string' } },
          nested: { type: 'object', properties: { flag: { type: 'boolean' } } },
        },
      }

      const value = { page: 2, tags: ['a', 'b'], nested: { flag: true } }

      const coerced = coerce(schema, value)

      expect(coerced).toBe(value)
    })
  })

  describe('recursive unions', () => {
    // gives up, leaving the input uncoerced, if union branches each coerced the same nested value again
    const linear = new JsonSchemaCoercer({ maxStepsPerValue: 20 })

    function nested(depth: number, wrap: (inner: unknown) => unknown, leaf: unknown): unknown {
      let value = leaf
      for (let i = 0; i < depth; i++) {
        value = wrap(value)
      }
      return value
    }

    it.each([
      ['a matching discriminator', ['paragraph', 'text'], 'text', 14],
      ['an unknown discriminator', ['paragraph', 'text'], 'zzz', 14],
      ['many branches', ['doc', 'paragraph', 'heading', 'list', 'item', 'text'], 'text', 6],
    ])('coerces a recursive discriminated union with %s', (_, kinds, type, depth) => {
      // the shape `ZodToJsonSchemaConverter` emits for a recursive discriminated union
      const schema: JsonSchema = {
        type: 'object',
        properties: { page: { type: 'integer' }, doc: { $ref: '#/$defs/node' } },
        required: ['page', 'doc'],
        $defs: {
          node: {
            oneOf: kinds.map(kind => ({
              type: 'object',
              properties: { type: { type: 'string', const: kind }, children: { type: 'array', items: { $ref: '#/$defs/node' } } },
              required: ['type', 'children'],
            })),
          },
        },
      }

      const doc = nested(depth, child => ({ type, children: [child] }), { type, children: [] })

      expect(linear.coerce([schema, false], { page: '1', doc })).toEqual({ page: 1, doc })
    })

    it('coerces a record branch listed before an array branch', () => {
      const schema: JsonSchema = { anyOf: [{ type: 'integer' }, { type: 'object', additionalProperties: { $ref: '#' } }, { type: 'array', items: { $ref: '#' } }] }

      // the record branch is tried first, so it turns every array into an object
      expect(linear.coerce([schema, false], nested(14, inner => [inner], '1'))).toEqual(nested(14, inner => ({ 0: inner }), 1))
    })

    const BASE: JsonSchema = { type: 'object', properties: { n: { type: 'integer' }, child: { $ref: '#' } } }
    const REACH_CHILD: JsonSchema = { type: 'object', properties: { child: { $ref: '#' } } }

    it.each<[string, JsonSchema]>([
      ['$ref', { $defs: { base: BASE }, $ref: '#/$defs/base', ...REACH_CHILD }],
      ['allOf', { ...BASE, allOf: [REACH_CHILD] }],
      ['not', { ...BASE, not: REACH_CHILD }],
    ])('coerces a schema whose %s reaches the same nested values as its properties', (_, schema) => {
      expect(linear.coerce([schema, false], nested(14, child => ({ n: '1', child }), { n: '1' })))
        .toEqual(nested(14, child => ({ n: 1, child }), { n: 1 }))
    })

    it('coerces every level of a deep recursive union', () => {
      // z.lazy(() => z.union([z.object({ n: z.number(), children: z.array(Node) }), z.object({ s: z.string(), children: z.array(Node) })]))
      const schema: JsonSchema = {
        anyOf: [
          { type: 'object', properties: { n: { type: 'number' }, children: { type: 'array', items: { $ref: '#' } } }, required: ['n', 'children'] },
          { type: 'object', properties: { s: { type: 'string' }, children: { type: 'array', items: { $ref: '#' } } }, required: ['s', 'children'] },
        ],
      }

      let value: unknown = { n: '0', children: [] }
      let expected: unknown = { n: 0, children: [] }
      for (let i = 1; i <= 200; i++) {
        value = { n: String(i), children: [value, { s: '1', children: [] }] }
        expected = { n: i, children: [expected, { s: '1', children: [] }] }
      }

      expect(linear.coerce([schema, false], value)).toEqual(expected)
    })
  })

  it('keeps its state when the input calls back into the same coercer', () => {
    const schema = { $defs: { int: { type: 'integer' } }, type: 'object', properties: { a: { $ref: '#/$defs/int' }, b: { $ref: '#/$defs/int' } } }
    const value = {
      get a(): unknown {
        return coerce({ type: 'integer' }, '1')
      },
      b: '2',
    }

    expect(coerce(schema, value)).toEqual({ a: 1, b: 2 })
  })

  describe('step budget', () => {
    // each level tries both branches on the same string, so the work doubles per level
    const EXPONENTIAL_SCHEMA: JsonSchema = {
      $defs: Object.fromEntries(Array.from({ length: 19 }, (_, i) => [
        `d${i}`,
        i === 18 ? { type: 'integer' } : { anyOf: [{ $ref: `#/$defs/d${i + 1}` }, { $ref: `#/$defs/d${i + 1}` }] },
      ])),
      type: 'object',
      properties: { page: { type: 'integer' }, count: { $ref: '#/$defs/d0' } },
    }

    // four steps per item
    const UNION_ITEMS: JsonSchema = { type: 'array', items: { anyOf: [{ type: 'boolean' }, { type: 'null' }, { type: 'integer' }] } }

    const twoStepsPerValue = new JsonSchemaCoercer({ maxStepsPerValue: 2 })

    it('leaves the whole input untouched once coercion runs out of steps', () => {
      const value = { page: '2', count: '1' }

      expect(twoStepsPerValue.coerce([EXPONENTIAL_SCHEMA, false], value)).toBe(value)
      expect(value).toEqual({ page: '2', count: '1' })

      // the coercer keeps no state from a coercion it gave up on
      expect(twoStepsPerValue.coerce([{ type: 'object', properties: { page: { type: 'integer' } } }, false], { page: '2' })).toEqual({ page: 2 })
    })

    it('budgets inputs with fewer than 100 values as 100 values', () => {
      expect(new JsonSchemaCoercer({ maxStepsPerValue: 1 }).coerce([UNION_ITEMS.items as JsonSchema, false], '1')).toBe(1)
    })

    it('extends the budget with the number of values in the input', () => {
      const strings = Array.from({ length: 1_000 }, (_, i) => String(i))

      expect(twoStepsPerValue.coerce([UNION_ITEMS, false], strings)).toBe(strings)
      expect(new JsonSchemaCoercer({ maxStepsPerValue: 5 }).coerce([UNION_ITEMS, false], strings)).toEqual(strings.map(Number))
    })

    it('stops counting a wide array once the budget covers the steps taken', () => {
      let reads = 0
      const items = new Proxy(Array.from<string>({ length: 1_500 }).fill('1'), {
        get(target, key, receiver) {
          if (typeof key === 'string' && /^\d+$/.test(key)) {
            reads++
          }

          return Reflect.get(target, key, receiver)
        },
      })

      // runs past the minimum budget of 1_000 steps, so the input gets counted
      expect(new JsonSchemaCoercer({ maxStepsPerValue: 10 }).coerce([{ type: 'array', items: { type: 'integer' } }, false], items))
        .toEqual(Array.from({ length: 1_500 }).fill(1))
      // coercion reads each item once, and counting only a few hundred more
      expect(reads).toBeLessThan(2_000)
    })

    it('counts circular references and non-plain objects as one value each', () => {
      const value: Record<string, unknown> = { strings: Array.from({ length: 300 }, (_, i) => String(i)), bytes: new Uint8Array(1_000) }
      value.self = value

      // counting `self` again or every byte would lift the budget enough to finish
      expect(twoStepsPerValue.coerce([{ type: 'object', properties: { strings: UNION_ITEMS } }, false], value)).toBe(value)
    })

    it('still throws errors other than running out of steps', () => {
      const value = {
        get page(): string {
          throw new Error('getter failed')
        },
      }

      expect(() => coerce({ type: 'object', properties: { page: { type: 'integer' } } }, value)).toThrow('getter failed')
    })
  })
})
