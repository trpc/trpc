import type { JsonSchema } from '@orpc/json-schema'
import type { OpenAPIV3_2 } from './types'
import { OpenAPIComponentRegistry } from './openapi-generator-components'

describe('openAPIComponentRegistry', () => {
  function createRegistry(options: {
    schemas?: Record<string, any>
    customComponentName?: (defName: string, defSchema: JsonSchema) => string | undefined
  } = {}) {
    const doc: OpenAPIV3_2.OpenAPIObject = {
      openapi: '3.2.0',
      info: { title: 'API Reference', version: '0.0.0' },
      ...(options.schemas ? { components: { schemas: options.schemas } } : {}),
    }

    return { doc, registry: new OpenAPIComponentRegistry(doc, options.customComponentName) }
  }

  describe('hoistDefs', () => {
    it('returns schemas without root $defs unchanged', () => {
      const { doc, registry } = createRegistry()

      expect(registry.hoistDefs(true)).toBe(true)
      expect(registry.hoistDefs({ type: 'string' })).toEqual({ type: 'string' })
      expect(doc.components).toBeUndefined()
    })

    it('hoists defs into components and rewrites refs, including JSON Pointer encoded names', () => {
      const { doc, registry } = createRegistry()

      const result = registry.hoistDefs({
        type: 'object',
        properties: {
          planet: { $ref: '#/$defs/Planet' },
          domain: { $ref: '#/$defs/domain~1Planet' },
        },
        $defs: {
          'Planet': { type: 'string' },
          'domain/Planet': { type: 'number' },
        },
      })

      expect(result).toEqual({
        type: 'object',
        properties: {
          planet: { $ref: '#/components/schemas/Planet' },
          domain: { $ref: '#/components/schemas/domain~1Planet' },
        },
      })
      expect(doc.components?.schemas).toEqual({
        'Planet': { type: 'string' },
        'domain/Planet': { type: 'number' },
      })
    })

    it('normalizes boolean defs and skips undefined defs', () => {
      const { doc, registry } = createRegistry()

      registry.hoistDefs({
        $defs: {
          Anything: true,
          Nothing: false,
          Ghost: undefined,
        },
      } as any)

      expect(doc.components?.schemas).toEqual({
        Anything: {},
        Nothing: { not: {} },
      })
    })

    it('returns the schema unchanged when every def is undefined', () => {
      const { doc, registry } = createRegistry()

      const schema = { $ref: '#/$defs/Ghost', $defs: { Ghost: undefined } } as any

      expect(registry.hoistDefs(schema)).toBe(schema)
      expect(doc.components).toBeUndefined()
    })

    it('hoists every def, including ones the root schema never references', () => {
      const { doc, registry } = createRegistry()

      const result = registry.hoistDefs({
        $ref: '#/$defs/Alias',
        $defs: {
          Root: { type: 'object', properties: { child: { $ref: '#/$defs/Local' } } },
          Local: { type: 'string' },
          Alias: { $ref: '#/$defs/Root' },
          Unreferenced: { type: 'number' },
        },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/Alias' })
      expect(doc.components?.schemas).toEqual({
        Root: { type: 'object', properties: { child: { $ref: '#/components/schemas/Local' } } },
        Local: { type: 'string' },
        Alias: { $ref: '#/components/schemas/Root' },
        Unreferenced: { type: 'number' },
      })
    })

    it('names hoisted defs with customComponentName and rewrites refs to the new names', () => {
      const customComponentName = vi.fn((defName: string) => `Api${defName}`)
      const { doc, registry } = createRegistry({ customComponentName })

      const result = registry.hoistDefs({
        $ref: '#/$defs/Planet',
        $defs: {
          Planet: { type: 'object', properties: { moon: { $ref: '#/$defs/Moon' } } },
          Moon: true,
        },
      } as any)

      expect(result).toEqual({ $ref: '#/components/schemas/ApiPlanet' })
      expect(doc.components?.schemas).toEqual({
        ApiPlanet: { type: 'object', properties: { moon: { $ref: '#/components/schemas/ApiMoon' } } },
        ApiMoon: {},
      })

      // receives the normalized def schema
      expect(customComponentName).toHaveBeenCalledTimes(2)
      expect(customComponentName).toHaveBeenNthCalledWith(2, 'Moon', {})
    })

    it('keeps the def name when customComponentName returns undefined', () => {
      const { doc, registry } = createRegistry({
        customComponentName: defName => defName === 'Planet' ? 'World' : undefined,
      })

      const result = registry.hoistDefs({
        $ref: '#/$defs/Planet',
        $defs: {
          Planet: { type: 'object', properties: { moon: { $ref: '#/$defs/Moon' } } },
          Moon: { type: 'string' },
        },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/World' })
      expect(doc.components?.schemas).toEqual({
        World: { type: 'object', properties: { moon: { $ref: '#/components/schemas/Moon' } } },
        Moon: { type: 'string' },
      })
    })

    it('postfixes a customComponentName that conflicts with a different component', () => {
      const { doc, registry } = createRegistry({
        schemas: { World: { type: 'string' } },
        customComponentName: () => 'World',
      })

      const result = registry.hoistDefs({
        $ref: '#/$defs/Planet',
        $defs: { Planet: { type: 'number' } },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/World2' })
      expect(doc.components?.schemas).toEqual({
        World: { type: 'string' },
        World2: { type: 'number' },
      })
    })

    it('reuses an equal component under the name customComponentName asks for', () => {
      const { doc, registry } = createRegistry({
        schemas: { World: { type: 'number' } },
        customComponentName: () => 'World',
      })

      const result = registry.hoistDefs({
        $ref: '#/$defs/Planet',
        $defs: { Planet: { type: 'number' } },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/World' })
      expect(doc.components?.schemas).toEqual({ World: { type: 'number' } })
    })

    it('leaves dangling local refs untouched', () => {
      const { doc, registry } = createRegistry()

      registry.hoistDefs({
        $ref: '#/$defs/Holder',
        $defs: {
          Holder: { type: 'object', properties: { x: { $ref: '#/$defs/Missing' } } },
        },
      })

      expect(doc.components?.schemas).toEqual({
        Holder: { type: 'object', properties: { x: { $ref: '#/$defs/Missing' } } },
      })
    })

    it('hoists a def named __proto__ as an own component', () => {
      const { doc, registry } = createRegistry()

      const result = registry.hoistDefs(JSON.parse('{"$ref":"#/$defs/__proto__","$defs":{"__proto__":{"type":"string"},"Planet":{"type":"number"}}}'))

      expect(result).toEqual({ $ref: '#/components/schemas/__proto__' })
      expect(JSON.stringify(doc.components?.schemas)).toBe('{"__proto__":{"type":"string"},"Planet":{"type":"number"}}')
    })

    it('does not mistake Object.prototype members for existing components', () => {
      const { doc, registry } = createRegistry()

      const result = registry.hoistDefs({
        $ref: '#/$defs/constructor',
        $defs: { constructor: { type: 'string' as const } },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/constructor' })
      expect(doc.components?.schemas).toEqual({ constructor: { type: 'string' } })
    })
  })

  describe('component reuse', () => {
    it('reuses an equal existing component with the same name, ignoring undefined-valued keys', () => {
      const planet = {
        type: 'object' as const,
        properties: { id: { type: 'string' as const } },
        required: ['id'],
      }
      const { doc, registry } = createRegistry({ schemas: { Planet: structuredClone(planet) } })

      const result = registry.hoistDefs({
        $ref: '#/$defs/Planet',
        $defs: { Planet: { ...structuredClone(planet), default: undefined } },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/Planet' })
      expect(doc.components?.schemas).toEqual({ Planet: planet })
    })

    it('does not merge equal schemas registered under different names', () => {
      const { doc, registry } = createRegistry({ schemas: { Existing: { type: 'string' } } })

      const result = registry.hoistDefs({
        $ref: '#/$defs/Renamed',
        $defs: { Renamed: { type: 'string' } },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/Renamed' })
      expect(doc.components?.schemas).toEqual({
        Existing: { type: 'string' },
        Renamed: { type: 'string' },
      })
    })

    it('reuses an equal component within the same name family', () => {
      const { doc, registry } = createRegistry({
        schemas: {
          Planet: { type: 'string' },
          Planet2: { type: 'number' },
        },
      })

      const result = registry.hoistDefs({
        $ref: '#/$defs/Planet',
        $defs: { Planet: { type: 'number' } },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/Planet2' })
      expect(Object.keys(doc.components?.schemas ?? {}).sort()).toEqual(['Planet', 'Planet2'])
    })

    it.each([
      {
        name: 'dangling local refs by exact ref equality',
        schema: {
          type: 'object',
          properties: { x: { $ref: '#/$defs/Missing' } },
        },
      },
      {
        name: 'local refs into nested defs by exact ref equality',
        schema: {
          type: 'object',
          properties: { x: { $ref: '#/$defs/Inner' } },
          $defs: { Inner: { type: 'string' } },
        },
      },
    ])('reuses components containing $name', ({ schema }) => {
      const { doc, registry } = createRegistry({ schemas: { Wrapped: structuredClone(schema) } })

      const result = registry.hoistDefs({
        $ref: '#/$defs/Wrapped',
        $defs: { Wrapped: structuredClone(schema) as any },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/Wrapped' })
      expect(Object.keys(doc.components?.schemas ?? {})).toEqual(['Wrapped'])
    })

    it('reuses components whose refs point at components hoisted in earlier calls', () => {
      const { doc, registry } = createRegistry()

      registry.hoistDefs({ $ref: '#/$defs/Data', $defs: { Data: { type: 'string' } } })

      const wrapper = {
        $ref: '#/$defs/Wrapper',
        $defs: {
          Wrapper: {
            type: 'object' as const,
            properties: { data: { $ref: '#/components/schemas/Data' } },
          },
        },
      }

      expect(registry.hoistDefs(structuredClone(wrapper))).toEqual({ $ref: '#/components/schemas/Wrapper' })
      expect(registry.hoistDefs(structuredClone(wrapper))).toEqual({ $ref: '#/components/schemas/Wrapper' })
      expect(Object.keys(doc.components?.schemas ?? {}).sort()).toEqual(['Data', 'Wrapper'])
    })

    it.each([
      {
        name: 'at the bare name',
        schemas: {
          Node: { type: 'object', properties: { next: { $ref: '#/components/schemas/Node' } } },
        },
        expected: 'Node',
      },
      {
        name: 'within the name family',
        schemas: {
          Node: { type: 'string' },
          Node2: { type: 'object', properties: { next: { $ref: '#/components/schemas/Node2' } } },
        },
        expected: 'Node2',
      },
    ])('reuses an equal self-recursive component $name', ({ schemas, expected }) => {
      const { doc, registry } = createRegistry({ schemas })

      const result = registry.hoistDefs({
        $ref: '#/$defs/Node',
        $defs: {
          Node: { type: 'object', properties: { next: { $ref: '#/$defs/Node' } } },
        },
      })

      expect(result).toEqual({ $ref: `#/components/schemas/${expected}` })
      expect(Object.keys(doc.components?.schemas ?? {}).sort()).toEqual(Object.keys(schemas).sort())
    })

    it('compares a ref to a sibling by its own body when the sibling reuses another def name', () => {
      const { doc, registry } = createRegistry({
        schemas: {
          Post2: { type: 'string' },
          Other: { type: 'boolean' },
          Wrapper: { items: { $ref: '#/components/schemas/Other' } },
        },
      })

      const result = registry.hoistDefs({
        $ref: '#/$defs/Wrapper',
        $defs: {
          // reuses the existing Post2, while the def named Post2 (equal to Other) is minted as Post22
          Post: { type: 'string' },
          Post2: { type: 'boolean' },
          Wrapper: { items: { $ref: '#/$defs/Post' } },
        },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/Wrapper2' })
      expect(doc.components?.schemas?.Wrapper2).toEqual({ items: { $ref: '#/components/schemas/Post2' } })
    })

    it('reuses mutually recursive sibling defs', () => {
      const { doc, registry } = createRegistry({
        schemas: {
          User: { type: 'object', properties: { posts: { $ref: '#/components/schemas/Post' } } },
          Post: { type: 'object', properties: { author: { $ref: '#/components/schemas/User' } } },
        },
      })

      const result = registry.hoistDefs({
        $ref: '#/$defs/User',
        $defs: {
          User: { type: 'object', properties: { posts: { $ref: '#/$defs/Post' } } },
          Post: { type: 'object', properties: { author: { $ref: '#/$defs/User' } } },
        },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/User' })
      expect(doc.components?.schemas).toEqual({
        User: { type: 'object', properties: { posts: { $ref: '#/components/schemas/Post' } } },
        Post: { type: 'object', properties: { author: { $ref: '#/components/schemas/User' } } },
      })
    })

    it('resolves sibling name conflicts against unrelated components', () => {
      const { doc, registry } = createRegistry({
        schemas: {
          User: { type: 'object', properties: { posts: { $ref: '#/components/schemas/Post2' } } },
          Post: { type: 'string' },
          Post2: { type: 'object', properties: { author: { $ref: '#/components/schemas/User' } } },
        },
      })

      const result = registry.hoistDefs({
        $ref: '#/$defs/User',
        $defs: {
          User: { type: 'object', properties: { posts: { $ref: '#/$defs/Post' } } },
          // the sibling conflicts with the unrelated Post component
          // and lands on the equal Post2 family member instead
          Post: { type: 'object', properties: { author: { $ref: '#/$defs/User' } } },
        },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/User' })
      expect(Object.keys(doc.components?.schemas ?? {}).sort()).toEqual(['Post', 'Post2', 'User'])
      expect(doc.components?.schemas?.Post).toEqual({ type: 'string' })
    })

    it('reuses sibling defs through renamed refs when a family name is taken', () => {
      const { doc, registry } = createRegistry({
        schemas: {
          Post: { type: 'string' },
          Post2: { type: 'object', properties: { author: { $ref: '#/components/schemas/User' } } },
          User: { type: 'object', properties: { posts: { $ref: '#/components/schemas/Post2' } } },
        },
      })

      const result = registry.hoistDefs({
        $ref: '#/$defs/User',
        $defs: {
          // resolved first, renamed to the equal Post2 family member
          Post: { type: 'object', properties: { author: { $ref: '#/$defs/User' } } },
          // its sibling ref then follows the rename and matches the existing User
          User: { type: 'object', properties: { posts: { $ref: '#/$defs/Post' } } },
        },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/User' })
      expect(Object.keys(doc.components?.schemas ?? {}).sort()).toEqual(['Post', 'Post2', 'User'])
    })

    it('reuses sibling defs when a later sibling needs the family rename', () => {
      const { doc, registry } = createRegistry({
        schemas: {
          Post: { type: 'object', properties: { author: { $ref: '#/components/schemas/User2' } } },
          User: { type: 'string' },
          User2: { type: 'object', properties: { posts: { $ref: '#/components/schemas/Post' } } },
        },
      })

      const result = registry.hoistDefs({
        $ref: '#/$defs/User',
        $defs: {
          // resolved first: its sibling ref must anticipate the User -> User2 rename
          // that only happens when the User def is resolved afterwards
          Post: { type: 'object', properties: { author: { $ref: '#/$defs/User' } } },
          User: { type: 'object', properties: { posts: { $ref: '#/$defs/Post' } } },
        },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/User2' })
      expect(Object.keys(doc.components?.schemas ?? {}).sort()).toEqual(['Post', 'User', 'User2'])
    })

    it('handles shared subschema instances during traversal and comparison', () => {
      const sharedDefault = { unit: 'km' }
      const sharedRef = { $ref: '#/$defs/Leaf' }

      const { doc, registry } = createRegistry({
        schemas: {
          Leaf: { type: 'string' },
          Pair: {
            type: 'object',
            properties: {
              a: { type: 'number', default: { unit: 'km' } },
              b: { type: 'number', default: { unit: 'km' } },
              c: { $ref: '#/components/schemas/Leaf' },
              d: { $ref: '#/components/schemas/Leaf' },
            },
          },
        },
      })

      const result = registry.hoistDefs({
        $ref: '#/$defs/Pair',
        $defs: {
          Leaf: { type: 'string' },
          Pair: {
            type: 'object',
            properties: {
              a: { type: 'number', default: sharedDefault },
              b: { type: 'number', default: sharedDefault },
              c: sharedRef,
              d: sharedRef,
            },
          },
        },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/Pair' })
      expect(Object.keys(doc.components?.schemas ?? {}).sort()).toEqual(['Leaf', 'Pair'])
    })

    it('does not reuse components whose date defaults differ', () => {
      const { doc, registry } = createRegistry({
        schemas: { Event: { type: 'string', default: new Date(0) } },
      })

      const result = registry.hoistDefs({
        $ref: '#/$defs/Event',
        $defs: { Event: { type: 'string', default: new Date(1) } as any },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/Event2' })
      expect(doc.components?.schemas).toEqual({
        Event: { type: 'string', default: new Date(0) },
        Event2: { type: 'string', default: new Date(1) },
      })
    })

    it('reuses components that share the same date default instance', () => {
      const date = new Date(0)
      const { doc, registry } = createRegistry({
        schemas: { Event: { type: 'string', default: date } },
      })

      const result = registry.hoistDefs({
        $ref: '#/$defs/Event',
        $defs: { Event: { type: 'string', default: date } as any },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/Event' })
      expect(Object.keys(doc.components?.schemas ?? {})).toEqual(['Event'])
    })
  })

  describe('name conflicts', () => {
    it.each([
      {
        name: 'at the first free slot',
        schemas: { Planet: { type: 'string' } },
        expected: 'Planet2',
      },
      {
        name: 'skipping slots taken by different schemas',
        schemas: { Planet: { type: 'string' }, Planet2: { type: 'number' } },
        expected: 'Planet3',
      },
    ])('mints the next numeric slot $name', ({ schemas, expected }) => {
      const { doc, registry } = createRegistry({ schemas })

      const result = registry.hoistDefs({
        $ref: '#/$defs/Planet',
        $defs: { Planet: { type: 'boolean' } },
      })

      expect(result).toEqual({ $ref: `#/components/schemas/${expected}` })
      expect(doc.components?.schemas?.[expected]).toEqual({ type: 'boolean' })
    })

    it('suffixes the conversion direction when the bare name is taken', () => {
      const { doc, registry } = createRegistry({ schemas: { Planet: { type: 'string' } } })

      expect(registry.hoistDefs({ $ref: '#/$defs/Planet', $defs: { Planet: { type: 'number' } } }, 'input'))
        .toEqual({ $ref: '#/components/schemas/PlanetInput' })
      expect(registry.hoistDefs({ $ref: '#/$defs/Planet', $defs: { Planet: { type: 'boolean' } } }, 'output'))
        .toEqual({ $ref: '#/components/schemas/PlanetOutput' })

      expect(doc.components?.schemas).toEqual({
        Planet: { type: 'string' },
        PlanetInput: { type: 'number' },
        PlanetOutput: { type: 'boolean' },
      })
    })

    it('reuses an equal opposite-direction component instead of minting a duplicate', () => {
      // the response schema equals the existing input component, so it is reused
      const taken = createRegistry({
        schemas: {
          Planet: { type: 'string' },
          PlanetInput: { type: 'number' },
        },
      })

      expect(taken.registry.hoistDefs({ $ref: '#/$defs/Planet', $defs: { Planet: { type: 'number' } } }, 'output'))
        .toEqual({ $ref: '#/components/schemas/PlanetInput' })
      expect(Object.keys(taken.doc.components?.schemas ?? {}).sort()).toEqual(['Planet', 'PlanetInput'])

      // reuse even wins over minting the free bare name
      const free = createRegistry({ schemas: { PlanetInput: { type: 'number' } } })

      expect(free.registry.hoistDefs({ $ref: '#/$defs/Planet', $defs: { Planet: { type: 'number' } } }, 'output'))
        .toEqual({ $ref: '#/components/schemas/PlanetInput' })
      expect(Object.keys(free.doc.components?.schemas ?? {})).toEqual(['PlanetInput'])
    })

    it('falls back to shared numeric postfixes when the bare and directed names are taken', () => {
      const { doc, registry } = createRegistry({
        schemas: {
          Planet: { type: 'string' },
          PlanetOutput: { type: 'number' },
        },
      })

      // equal to the existing directed member, reused
      expect(registry.hoistDefs({ $ref: '#/$defs/Planet', $defs: { Planet: { type: 'number' } } }, 'output'))
        .toEqual({ $ref: '#/components/schemas/PlanetOutput' })

      // different, takes the next slot in the numeric tail shared by every direction
      expect(registry.hoistDefs({ $ref: '#/$defs/Planet', $defs: { Planet: { type: 'boolean' } } }, 'output'))
        .toEqual({ $ref: '#/components/schemas/Planet2' })

      expect(Object.keys(doc.components?.schemas ?? {}).sort()).toEqual(['Planet', 'Planet2', 'PlanetOutput'])
    })

    it('reuses numeric-tail slots across directions', () => {
      const { doc, registry } = createRegistry({
        schemas: {
          Planet: { type: 'string' },
          PlanetInput: { type: 'number' },
          PlanetOutput: { type: 'integer' },
        },
      })

      // an input variant fills the shared numeric tail
      expect(registry.hoistDefs({ $ref: '#/$defs/Planet', $defs: { Planet: { type: 'boolean' } } }, 'input'))
        .toEqual({ $ref: '#/components/schemas/Planet2' })

      // an equal output variant reuses it, no matter which direction registered it
      expect(registry.hoistDefs({ $ref: '#/$defs/Planet', $defs: { Planet: { type: 'boolean' } } }, 'output'))
        .toEqual({ $ref: '#/components/schemas/Planet2' })

      expect(Object.keys(doc.components?.schemas ?? {}).sort()).toEqual(['Planet', 'Planet2', 'PlanetInput', 'PlanetOutput'])
    })

    it.each([
      {
        name: 'nested values have different types',
        existing: { type: 'object', default: 'text' },
        candidate: { type: 'object', default: 5 },
      },
      {
        name: 'a nested value is null on one side only',
        existing: { type: 'object', default: {} },
        candidate: { type: 'object', default: null },
      },
      {
        name: 'nested arrays have different lengths',
        existing: { type: 'string', enum: ['a'] },
        candidate: { type: 'string', enum: ['a', 'b'] },
      },
      {
        name: 'dangling local refs differ',
        existing: { $ref: '#/$defs/X' },
        candidate: { $ref: '#/$defs/Y' },
      },
    ])('does not reuse when $name', ({ existing, candidate }) => {
      const { doc, registry } = createRegistry({ schemas: { Schema: existing } })

      const result = registry.hoistDefs({
        $ref: '#/$defs/Schema',
        $defs: { Schema: candidate as any },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/Schema2' })
      expect(doc.components?.schemas?.Schema2).toEqual(candidate)
    })

    it('does not reuse a component when a component ref faces a local ref', () => {
      const { doc, registry } = createRegistry({
        schemas: {
          Wrapped: {
            type: 'object',
            properties: { x: { $ref: '#/$defs/Inner' } },
            $defs: { Inner: { type: 'string' } },
          },
        },
      })

      const result = registry.hoistDefs({
        $ref: '#/$defs/Wrapped',
        $defs: {
          Inner: { type: 'string' },
          Wrapped: {
            type: 'object',
            properties: { x: { $ref: '#/$defs/Inner' } },
            $defs: { Inner: { type: 'string' } },
          },
        },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/Wrapped2' })
      expect(doc.components?.schemas?.Wrapped2).toEqual(expect.objectContaining({
        properties: { x: { $ref: '#/components/schemas/Inner' } },
      }))
    })

    it('distinguishes a self-recursive schema from mutually recursive components', () => {
      const { doc, registry } = createRegistry({
        schemas: {
          NodeA: { type: 'object', properties: { next: { $ref: '#/components/schemas/NodeB' } } },
          NodeB: { type: 'object', properties: { next: { $ref: '#/components/schemas/NodeA' } } },
        },
      })

      const result = registry.hoistDefs({
        $ref: '#/$defs/NodeA',
        $defs: {
          NodeA: { type: 'object', properties: { next: { $ref: '#/$defs/NodeA' } } },
        },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/NodeA2' })
      expect(doc.components?.schemas?.NodeA2).toEqual({
        type: 'object',
        properties: { next: { $ref: '#/components/schemas/NodeA2' } },
      })
    })

    it('distinguishes mutually recursive schemas from a self-recursive component', () => {
      const { doc, registry } = createRegistry({
        schemas: {
          Node: { type: 'object', properties: { next: { $ref: '#/components/schemas/Node' } } },
        },
      })

      const result = registry.hoistDefs({
        $ref: '#/$defs/NodeX',
        $defs: {
          NodeX: { type: 'object', properties: { next: { $ref: '#/$defs/NodeY' } } },
          NodeY: { type: 'object', properties: { next: { $ref: '#/$defs/NodeX' } } },
        },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/NodeX' })
      expect(doc.components?.schemas?.NodeX).toEqual({
        type: 'object',
        properties: { next: { $ref: '#/components/schemas/NodeY' } },
      })
      expect(doc.components?.schemas?.NodeY).toEqual({
        type: 'object',
        properties: { next: { $ref: '#/components/schemas/NodeX' } },
      })
    })

    it('mints a sibling under a numbered slot when its name conflicts', () => {
      const { doc, registry } = createRegistry({
        schemas: { Post: { type: 'string' } },
      })

      const result = registry.hoistDefs({
        $ref: '#/$defs/User',
        $defs: {
          User: { type: 'object', properties: { posts: { $ref: '#/$defs/Post' } } },
          Post: { type: 'number' },
        },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/User' })
      expect(doc.components?.schemas).toEqual({
        Post: { type: 'string' },
        User: { type: 'object', properties: { posts: { $ref: '#/components/schemas/Post2' } } },
        Post2: { type: 'number' },
      })
    })

    it('keeps sibling defs distinct when their names collide within one family', () => {
      const { doc, registry } = createRegistry({
        schemas: {
          Node: { type: 'object', properties: { next: { $ref: '#/components/schemas/Node' } } },
        },
      })

      const result = registry.hoistDefs({
        $ref: '#/$defs/Node',
        $defs: {
          Node: { type: 'object', properties: { next: { $ref: '#/$defs/Node2' } } },
          Node2: { type: 'object', properties: { next: { $ref: '#/$defs/Node' } } },
        },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/Node2' })
      expect(doc.components?.schemas).toEqual({
        Node: { type: 'object', properties: { next: { $ref: '#/components/schemas/Node' } } },
        Node2: { type: 'object', properties: { next: { $ref: '#/components/schemas/Node22' } } },
        Node22: { type: 'object', properties: { next: { $ref: '#/components/schemas/Node2' } } },
      })
    })
  })

  describe('register', () => {
    it('registers a schema and returns a component ref', () => {
      const { doc, registry } = createRegistry()

      const result = registry.register('Planet', { type: 'object', properties: { id: { type: 'string' } } })

      expect(result).toEqual({ $ref: '#/components/schemas/Planet' })
      expect(doc.components?.schemas).toEqual({
        Planet: { type: 'object', properties: { id: { type: 'string' } } },
      })
    })

    it('reuses equivalent registrations', () => {
      const { doc, registry } = createRegistry()

      const first = registry.register('Planet', { type: 'object' })
      const second = registry.register('Planet', { type: 'object' })

      expect(first).toEqual({ $ref: '#/components/schemas/Planet' })
      expect(second).toEqual(first)
      expect(Object.keys(doc.components?.schemas ?? {})).toEqual(['Planet'])
    })

    it('keeps the registered name unique among the schema own local defs', () => {
      const { doc, registry } = createRegistry()

      const result = registry.register('Planet', {
        type: 'object',
        properties: { nested: { $ref: '#/$defs/Planet' } },
        $defs: { Planet: { type: 'string' } },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/Planet2' })
      expect(doc.components?.schemas).toEqual({
        Planet: { type: 'string' },
        Planet2: {
          type: 'object',
          properties: { nested: { $ref: '#/components/schemas/Planet' } },
        },
      })
    })

    it('does not mistake Object.prototype members for taken local def names', () => {
      const { doc, registry } = createRegistry()

      const result = registry.register('toString', {
        type: 'object',
        properties: { nested: { $ref: '#/$defs/Planet' } },
        $defs: { Planet: { type: 'string' } },
      })

      expect(result).toEqual({ $ref: '#/components/schemas/toString' })
      expect(Object.keys(doc.components?.schemas ?? {})).toEqual(['Planet', 'toString'])
    })

    it('applies customComponentName to registered schemas', () => {
      const { doc, registry } = createRegistry({ customComponentName: defName => `Api${defName}` })

      const result = registry.register('Planet', { type: 'object' })

      expect(result).toEqual({ $ref: '#/components/schemas/ApiPlanet' })
      expect(doc.components?.schemas).toEqual({ ApiPlanet: { type: 'object' } })
    })
  })

  describe('toOpenAPISchema', () => {
    it('normalizes boolean schemas and hoists defs', () => {
      const { doc, registry } = createRegistry()

      expect(registry.toOpenAPISchema(true)).toEqual({})
      expect(registry.toOpenAPISchema(false)).toEqual({ not: {} })

      expect(registry.toOpenAPISchema({
        type: 'object',
        properties: { planet: { $ref: '#/$defs/Planet' } },
        $defs: { Planet: { type: 'string' } },
      })).toEqual({
        type: 'object',
        properties: { planet: { $ref: '#/components/schemas/Planet' } },
      })
      expect(doc.components?.schemas).toEqual({ Planet: { type: 'string' } })
    })
  })
})
