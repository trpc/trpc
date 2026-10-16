import { type } from 'arktype'
import * as z from 'zod'
import { ArkTypeToJsonSchemaConverter } from './converter'

describe('arkTypeToJsonSchemaConverter', () => {
  const converter = new ArkTypeToJsonSchemaConverter()

  describe('.condition', () => {
    it.each([
      ['arktype input schema', type({ name: 'string' }), 'input', true],
      ['arktype output schema', type('number'), 'output', true],
      ['non-arktype schema', z.string() as never, 'input', false],
      ['undefined schema', undefined, 'output', false],
    ] as const)('matches %s', (_, schema, direction, expected) => {
      expect(converter.condition(schema, direction)).toBe(expected)
    })
  })

  it('keeps converting when standard validation throws while checking optionality', () => {
    const schema = type('string')

    Object.defineProperty(schema, '~standard', {
      value: {
        ...schema['~standard'],
        validate: () => {
          throw new Error('validate failed')
        },
      },
    })

    expect(converter.convert(schema, 'input')).toEqual([{ type: 'string' }, false])
  })

  describe('optionality', () => {
    it.each([
      ['optional input schema', type('string | undefined'), 'input', {
        anyOf: [
          { type: 'string' },
          {},
        ],
      }, true],
      ['optional output schema', type('string | undefined'), 'output', {
        anyOf: [
          {
            type: 'string',
          },
          {},
        ],
      }, true],
      ['required input schema', type('string'), 'input', {
        type: 'string',
      }, false],
      ['required output schema', type('string'), 'output', {
        type: 'string',
      }, false],
    ] as const)('marks %s correctly', (_, schema, direction, jsonSchema, optional) => {
      expect(converter.convert(schema, direction)).toEqual([jsonSchema, optional])
    })
  })

  describe('direction', () => {
    it.each([
      ['morph and default object', type({ a: 'string.numeric.parse', b: 'number = 5' }), {
        type: 'object',
        properties: {
          a: { type: 'string', pattern: expect.any(String) },
          b: { type: 'number', default: 5 },
        },
        required: ['a'],
      }, {
        type: 'object',
        properties: {
          a: { type: 'number' },
          b: { type: 'number' },
        },
        required: ['a', 'b'],
      }],
      ['pipe with output type', type('string').pipe(s => s.length).to('number'), { type: 'string' }, { type: 'number' }],
      ['unconstrained pipe', type('string').pipe(s => s.length), { type: 'string' }, {}],
    ] as const)('converts %s from the matching side', (_, schema, input, output) => {
      expect(converter.convert(schema, 'input')).toEqual([input, false])
      expect(converter.convert(schema, 'output')).toEqual([output, false])
    })
  })

  describe('native type extensions', () => {
    it.each([
      [type('bigint'), {
        'type': 'string',
        'x-native-type': 'bigint',
        'pattern': '^-?[0-9]+$',
      }],
      [type('Date'), {
        'type': 'string',
        'x-native-type': 'date',
        'format': 'date-time',
      }],
    ] as const)('extends conversion for %s', (schema, jsonSchema) => {
      expect(converter.convert(schema, 'input')).toEqual([jsonSchema, false])
    })
  })

  it('passes built-in fallback mutations through custom handlers', () => {
    const functionConverter = new ArkTypeToJsonSchemaConverter({
      fallback: (ctx) => {
        return {
          ...ctx.base,
          title: '__EXTENDED__',
        }
      },
    })

    expect(functionConverter.convert(type('bigint'), 'input')).toEqual([
      {
        'pattern': '^-?[0-9]+$',
        'title': '__EXTENDED__',
        'type': 'string',
        'x-native-type': 'bigint',
      },
      false,
    ])

    const objectConverter = new ArkTypeToJsonSchemaConverter({
      fallback: {
        date: () => ({ type: 'string', title: '__DATE__' }),
        default: (ctx) => {
          return {
            ...ctx.base,
            title: '__EXTENDED__',
          }
        },
      },
    })

    expect(objectConverter.convert(type({ a: 'Date', b: 'bigint' }), 'input')).toEqual([
      {
        properties: {
          a: {
            title: '__DATE__',
            type: 'string',
          },
          b: {
            'pattern': '^-?[0-9]+$',
            'title': '__EXTENDED__',
            'type': 'string',
            'x-native-type': 'bigint',
          },
        },
        required: ['a', 'b'],
        type: 'object',
      },
      false,
    ])
  })

  describe('cache option', () => {
    it('reuses conversion results per schema and direction when enabled', () => {
      const converter = new ArkTypeToJsonSchemaConverter({ cache: true })
      const schema = type('string')
      // arktype interns types, so the same definition returns the same instance/spy across tests
      const toJsonSchema = vi.spyOn(schema, 'toJsonSchema')
      toJsonSchema.mockClear()

      const input = converter.convert(schema, 'input')
      expect(input).toEqual([{ type: 'string' }, false])
      expect(converter.convert(schema, 'input')).toBe(input)
      expect(toJsonSchema).toHaveBeenCalledTimes(1)

      const output = converter.convert(schema, 'output')
      expect(output).toEqual([{ type: 'string' }, false])
      expect(output).not.toBe(input)
      expect(converter.convert(schema, 'output')).toBe(output)
      expect(toJsonSchema).toHaveBeenCalledTimes(2)
    })

    it('converts on every call when disabled', () => {
      const schema = type('string')
      const toJsonSchema = vi.spyOn(schema, 'toJsonSchema')
      toJsonSchema.mockClear()

      const first = converter.convert(schema, 'input')
      const second = converter.convert(schema, 'input')

      expect(second).toEqual(first)
      expect(second).not.toBe(first)
      expect(toJsonSchema).toHaveBeenCalledTimes(2)
    })
  })
})
