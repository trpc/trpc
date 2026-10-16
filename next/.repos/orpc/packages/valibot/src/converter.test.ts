import { toJsonSchema } from '@valibot/to-json-schema'
import * as v from 'valibot'
import * as z from 'zod'
import { ValibotToJsonSchemaConverter } from './converter'

vi.mock('@valibot/to-json-schema', async (original) => {
  const mod = await original<typeof import('@valibot/to-json-schema')>()
  return {
    ...mod,
    toJsonSchema: vi.fn((...args: [any]) => mod.toJsonSchema(...args)),
  }
})

describe('valibotToJsonSchemaConverter', () => {
  const converter = new ValibotToJsonSchemaConverter()

  describe('.condition', () => {
    it.each([
      ['valibot input schema', v.string(), 'input', true],
      ['valibot output schema', v.optional(v.string()), 'output', true],
      ['non-valibot schema', z.string() as never, 'input', false],
      ['undefined schema', undefined, 'output', false],
    ] as const)('matches %s', (_, schema, direction, expected) => {
      expect(converter.condition(schema, direction)).toBe(expected)
    })
  })

  it.each([
    ['input', { type: 'number' }],
    ['output', { type: 'string' }],
  ] as const)('uses the requested %s direction when generating json schema', (direction, jsonSchema) => {
    const schema = v.pipe(v.number(), v.transform(n => n.toString()), v.string())

    expect(converter.convert(schema, direction)).toEqual([jsonSchema, false])
    expect(converter.convert(v.set(schema), direction)).toEqual([{ 'type': 'array', 'uniqueItems': true, 'items': jsonSchema, 'x-native-type': 'set' }, false])
  })

  it('forwards extended toJsonSchema options from the constructor', () => {
    const converter = new ValibotToJsonSchemaConverter({
      overrideSchema: ({ jsonSchema }) => ({
        ...jsonSchema,
        description: 'root-schema',
      }),
    })

    expect(converter.convert(v.string(), 'input')).toEqual([
      {
        description: 'root-schema',
        type: 'string',
      },
      false,
    ])
  })

  it('keeps converting when standard validation throws while checking optionality', () => {
    const schema = v.string()

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

  it('does not leak a rejection when async standard validation fails while checking optionality', async ({ onTestFinished }) => {
    const unhandledRejectionHandler = vi.fn()
    process.on('unhandledRejection', unhandledRejectionHandler)

    onTestFinished(() => {
      process.off('unhandledRejection', unhandledRejectionHandler)
    })

    const schema = v.pipeAsync(v.optional(v.string()), v.transformAsync(async value => value!.trim()))

    expect(converter.convert(schema, 'input')).toEqual([{ type: 'string' }, false])

    await new Promise(resolve => setTimeout(resolve, 0))
    expect(unhandledRejectionHandler).not.toHaveBeenCalled()
  })

  describe('optionality', () => {
    it.each([
      ['defaulted input schema', v.optional(v.string(), 'fallback'), 'input', {
        default: 'fallback',
        type: 'string',
      }, true],
      ['defaulted output schema', v.optional(v.string(), 'fallback'), 'output', {
        default: 'fallback',
        type: 'string',
      }, false],
      ['undefined-producing output schema', v.optional(v.string()), 'output', {
        type: 'string',
      }, true],
      ['required input schema', v.string(), 'input', {
        type: 'string',
      }, false],
      ['required output schema', v.string(), 'output', {
        type: 'string',
      }, false],
    ] as const)('marks %s correctly', (_, schema, direction, jsonSchema, optional) => {
      expect(converter.convert(schema, direction)).toEqual([jsonSchema, optional])
    })
  })

  describe('native type extensions', () => {
    it.each([
      [v.bigint(), {
        'type': 'string',
        'x-native-type': 'bigint',
        'pattern': '^-?[0-9]+$',
      }],
      [v.date(), {
        'type': 'string',
        'x-native-type': 'date',
        'format': 'date-time',
      }],
      [v.set(v.string()), {
        'type': 'array',
        'x-native-type': 'set',
        'uniqueItems': true,
        'items': { type: 'string' },
      }],
      [v.map(v.string(), v.number()), {
        'type': 'array',
        'x-native-type': 'map',
        'items': {
          type: 'array',
          prefixItems: [
            { type: 'string' },
            { type: 'number' },
          ],
          maxItems: 2,
          minItems: 2,
        },
      }],
    ] as const)('extends conversion for %s', (schema, jsonSchema) => {
      expect(converter.convert(schema, 'input')).toEqual([jsonSchema, false])
      expect(new ValibotToJsonSchemaConverter({ errorMode: 'throw' }).convert(schema, 'input')).toEqual([jsonSchema, false])
    })

    it.each([
      ['set', (node: any) => v.set(node), { 'type': 'array', 'uniqueItems': true, 'items': { $ref: '#/$defs/0' }, 'x-native-type': 'set' }],
      ['map', (node: any) => v.map(v.string(), node), {
        'type': 'array',
        'items': { type: 'array', prefixItems: [{ type: 'string' }, { $ref: '#/$defs/0' }], maxItems: 2, minItems: 2 },
        'x-native-type': 'map',
      }],
    ] as const)('resolves recursion through %s into a $ref', (_, wrap, children) => {
      const Node: v.GenericSchema = v.object({ children: wrap(v.lazy(() => Node)) })

      expect(converter.convert(v.object({ tree: v.lazy(() => Node) }), 'input')).toEqual([{
        type: 'object',
        properties: { tree: { $ref: '#/$defs/0' } },
        required: ['tree'],
        $defs: {
          0: {
            type: 'object',
            properties: { children },
            required: ['children'],
          },
        },
      }, false])
    })

    it('resolves recursion through a set when the lazy getter creates a new schema on each call', () => {
      const node = (): v.GenericSchema => v.object({ children: v.set(v.lazy(node)) })

      expect(converter.convert(v.lazy(node), 'input')).toEqual([{
        $ref: '#/$defs/0',
        $defs: {
          0: {
            type: 'object',
            properties: { children: { 'type': 'array', 'uniqueItems': true, 'items': { $ref: '#/$defs/0' }, 'x-native-type': 'set' } },
            required: ['children'],
          },
        },
      }, false])
    })

    it('adds definitions created inside a set or map to the root $defs', () => {
      const A: v.GenericSchema = v.object({ a: v.lazy(() => A) })
      const B: v.GenericSchema = v.object({ b: v.lazy(() => B) })
      const C: v.GenericSchema = v.object({ c: v.lazy(() => C) })

      expect(converter.convert(v.object({
        a: v.lazy(() => A),
        set: v.set(v.lazy(() => B)),
        map: v.map(v.lazy(() => B), v.lazy(() => C)),
      }), 'input')).toEqual([{
        type: 'object',
        properties: {
          a: { $ref: '#/$defs/0' },
          set: { 'type': 'array', 'uniqueItems': true, 'items': { $ref: '#/$defs/1' }, 'x-native-type': 'set' },
          map: {
            'type': 'array',
            'items': { type: 'array', prefixItems: [{ $ref: '#/$defs/1' }, { $ref: '#/$defs/2' }], maxItems: 2, minItems: 2 },
            'x-native-type': 'map',
          },
        },
        required: ['a', 'set', 'map'],
        $defs: {
          0: { type: 'object', properties: { a: { $ref: '#/$defs/0' } }, required: ['a'] },
          1: { type: 'object', properties: { b: { $ref: '#/$defs/1' } }, required: ['b'] },
          2: { type: 'object', properties: { c: { $ref: '#/$defs/2' } }, required: ['c'] },
        },
      }, false])
    })

    it('references the definitions option inside a set or map', () => {
      const Item = v.object({ name: v.string() })
      const converter = new ValibotToJsonSchemaConverter({ definitions: { Item } })

      expect(converter.convert(v.object({
        set: v.set(Item),
        map: v.map(v.string(), Item),
      }), 'input')).toEqual([{
        type: 'object',
        properties: {
          set: { 'type': 'array', 'uniqueItems': true, 'items': { $ref: '#/$defs/Item' }, 'x-native-type': 'set' },
          map: {
            'type': 'array',
            'items': { type: 'array', prefixItems: [{ type: 'string' }, { $ref: '#/$defs/Item' }], maxItems: 2, minItems: 2 },
            'x-native-type': 'map',
          },
        },
        required: ['set', 'map'],
        $defs: {
          Item: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
        },
      }, false])
    })

    it('converts a set or map inside the definitions option', () => {
      const converter = new ValibotToJsonSchemaConverter({
        definitions: { Tag: v.object({ labels: v.set(v.string()) }) },
      })

      expect(converter.convert(v.string(), 'input')).toEqual([{
        type: 'string',
        $defs: {
          Tag: {
            type: 'object',
            properties: { labels: { 'type': 'array', 'uniqueItems': true, 'items': { type: 'string' }, 'x-native-type': 'set' } },
            required: ['labels'],
          },
        },
      }, false])
    })

    it('leaves other unsupported schemas to the errorMode option', () => {
      expect(converter.convert(v.symbol(), 'input')).toEqual([{}, false])
      expect(() => new ValibotToJsonSchemaConverter({ errorMode: 'throw' }).convert(v.symbol(), 'input')).toThrow('The "symbol" schema cannot be converted to JSON Schema.')
    })

    it('passes native types to the overrideSchema option without the conversion error', () => {
      const overrideSchema = vi.fn(({ valibotSchema, jsonSchema }) => valibotSchema.type === 'date' ? { ...jsonSchema, format: 'date' } : undefined)
      const converter = new ValibotToJsonSchemaConverter({ errorMode: 'throw', overrideSchema })

      expect(converter.convert(v.set(v.date()), 'input')).toEqual([{
        'type': 'array',
        'uniqueItems': true,
        'items': { 'type': 'string', 'format': 'date', 'x-native-type': 'date' },
        'x-native-type': 'set',
      }, false])
      expect(overrideSchema.mock.calls.map(([context]) => [context.valibotSchema.type, context.errors])).toEqual([
        ['date', undefined],
        ['set', undefined],
      ])
    })
  })

  describe('cache option', () => {
    const schema = v.pipe(v.number(), v.transform(n => n.toString()), v.string())

    it('reuses conversion results per schema and direction when enabled', () => {
      const converter = new ValibotToJsonSchemaConverter({ cache: true })

      vi.mocked(toJsonSchema).mockClear()

      const input = converter.convert(schema, 'input')
      expect(input).toEqual([{ type: 'number' }, false])
      expect(converter.convert(schema, 'input')).toBe(input)
      expect(toJsonSchema).toHaveBeenCalledTimes(1)

      const output = converter.convert(schema, 'output')
      expect(output).toEqual([{ type: 'string' }, false])
      expect(output).not.toBe(input)
      expect(converter.convert(schema, 'output')).toBe(output)
      expect(toJsonSchema).toHaveBeenCalledTimes(2)

      converter.convert(v.string(), 'input')
      expect(toJsonSchema).toHaveBeenCalledTimes(3)
    })

    it('converts on every call when disabled', () => {
      vi.mocked(toJsonSchema).mockClear()

      const first = converter.convert(schema, 'input')
      const second = converter.convert(schema, 'input')

      expect(second).toEqual(first)
      expect(second).not.toBe(first)
      expect(toJsonSchema).toHaveBeenCalledTimes(2)
    })
  })
})
