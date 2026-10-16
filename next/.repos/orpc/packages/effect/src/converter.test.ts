import { Effect, Schema } from 'effect'
import { z } from 'zod'
import { EffectSchemaToJsonSchemaConverter } from './converter'
import { toStandardSchema } from './schema'

describe('effectSchemaToJsonSchemaConverter', () => {
  const converter = new EffectSchemaToJsonSchemaConverter()

  describe('.condition', () => {
    it.each([
      ['effect schema', toStandardSchema(Schema.String), true],
      ['non-effect schema', z.string(), false],
      ['undefined schema', undefined, false],
      ['effect vendor without an effect schema', { '~standard': { version: 1, vendor: 'effect', validate: () => ({ value: 1 }) } }, false],
    ] as const)('matches %s', (_, schema, expected) => {
      expect(converter.condition(schema, 'input')).toBe(expected)
    })
  })

  it.each([
    ['input', { type: 'string' }],
    ['output', { anyOf: [{ type: 'number' }, { type: 'string', enum: ['Infinity', '-Infinity', 'NaN'] }] }],
  ] as const)('uses the requested %s direction', (direction, jsonSchema) => {
    expect(converter.convert(toStandardSchema(Schema.NumberFromString), direction)).toEqual([jsonSchema, false])
  })

  it('does not mutate the schema', () => {
    const schema = toStandardSchema(Schema.String)
    converter.convert(schema, 'input')
    expect('jsonSchema' in schema['~standard']).toBe(false)
  })

  it.each([
    ['onExcessProperty', { onExcessProperty: 'error' }, Schema.Struct({ a: Schema.String }), { additionalProperties: false }],
    ['includeAnnotationKey', { includeAnnotationKey: (key: string) => key === 'x-custom' }, Schema.String.annotate({ 'x-custom': 'value' }), { 'x-custom': 'value' }],
    ['referencePolicy', { referencePolicy: () => undefined }, Schema.Struct({ a: Schema.String.annotate({ identifier: 'A' }) }), { properties: { a: { type: 'string' } } }],
    ['generateDescriptions', { generateDescriptions: true }, Schema.String.check(Schema.isMinLength(2)), { description: 'a value with a length of at least 2' }],
  ] as const)('forwards the %s option to Effect', (_, options, schema, expected) => {
    const converter = new EffectSchemaToJsonSchemaConverter({ cache: true, ...options })
    expect(converter.convert(toStandardSchema(schema), 'input')[0]).toMatchObject(expected)
  })

  describe('definitions', () => {
    it.each(['input', 'output'] as const)('keeps class definitions in the %s direction', (direction) => {
      class Planet extends Schema.Class<Planet>('Planet')({ name: Schema.String }) {}

      expect(converter.convert(toStandardSchema(Planet), direction)).toEqual([{
        $ref: '#/$defs/PlanetEncoded',
        $defs: {
          PlanetEncoded: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
            additionalProperties: true,
          },
        },
      }, false])
    })

    it('resolves recursion into a $ref', () => {
      interface Category {
        readonly name: string
        readonly children: ReadonlyArray<Category>
      }

      const CategorySchema: Schema.Codec<Category> = Schema.Struct({
        name: Schema.String,
        children: Schema.Array(Schema.suspend((): Schema.Codec<Category> => CategorySchema)),
      }).annotate({ identifier: 'Category' })

      expect(converter.convert(toStandardSchema(CategorySchema), 'input')).toEqual([{
        $ref: '#/$defs/Category',
        $defs: {
          Category: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              children: { type: 'array', items: { $ref: '#/$defs/Category' } },
            },
            required: ['name', 'children'],
            additionalProperties: true,
          },
        },
      }, false])
    })
  })

  describe('optionality', () => {
    const Defaulted = Schema.UndefinedOr(Schema.String).pipe(Schema.withDecodingDefault(Effect.succeed('fallback')))

    it.each([
      ['defaulted input schema', Defaulted, 'input', true],
      ['defaulted output schema', Defaulted, 'output', false],
      ['undefined-producing output schema', Schema.UndefinedOr(Schema.String), 'output', true],
      ['unknown input schema', Schema.Unknown, 'input', true],
      ['required input schema', Schema.String, 'input', false],
      ['required output schema', Schema.String, 'output', false],
    ] as const)('marks %s correctly', (_, schema, direction, optional) => {
      expect(converter.convert(toStandardSchema(schema), direction)).toEqual([expect.any(Object), optional])
    })

    it('marks as required if standard validation throws', () => {
      // `annotate` returns a fresh instance, so the shared `Schema.Unknown` is left untouched
      const schema = toStandardSchema(Schema.Unknown.annotate({}))
      ;(schema as any)['~standard'].validate = () => {
        throw new Error('test')
      }

      expect(converter.convert(schema, 'input')).toEqual([{}, false])
    })
  })

  it('propagates errors from Effect', () => {
    // Effect cannot represent symbol property names in JSON Schema
    const schema = toStandardSchema(Schema.Struct({ [Symbol.for('key')]: Schema.String }))

    expect(() => converter.convert(schema, 'input')).toThrow('Objects property names must be strings')
  })

  describe('cache option', () => {
    it('reuses conversion results per schema and direction when enabled', () => {
      const converter = new EffectSchemaToJsonSchemaConverter({ cache: true })
      const schema = toStandardSchema(Schema.NumberFromString)

      const input = converter.convert(schema, 'input')
      expect(input).toEqual([{ type: 'string' }, false])
      expect(converter.convert(schema, 'input')).toBe(input)

      const output = converter.convert(schema, 'output')
      expect(output).not.toBe(input)
      expect(converter.convert(schema, 'output')).toBe(output)
    })

    it('converts on every call when disabled', () => {
      const schema = toStandardSchema(Schema.NumberFromString)

      const first = converter.convert(schema, 'input')
      const second = converter.convert(schema, 'input')

      expect(second).toEqual(first)
      expect(second).not.toBe(first)
    })
  })
})
