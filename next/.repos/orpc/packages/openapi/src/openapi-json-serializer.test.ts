import { OpenAPIJsonSerializer } from './openapi-json-serializer'

class Person {
  constructor(
    public name: string,
    public date: Date,
  ) {}

  toJSON() {
    return {
      name: this.name,
      date: this.date,
    }
  }
}

describe('openAPIJsonSerializer', () => {
  const serializer = new OpenAPIJsonSerializer()

  describe('serialize', () => {
    it('passes through primitives unchanged', () => {
      expect(serializer.serialize(1).json).toBe(1)
      expect(serializer.serialize('hello').json).toBe('hello')
      expect(serializer.serialize(true).json).toBe(true)
      expect(serializer.serialize(false).json).toBe(false)
      expect(serializer.serialize(null).json).toBe(null)
    })

    it('serializes root and nested undefined values to null', () => {
      expect(serializer.serialize(undefined).json).toBeNull()
      expect(serializer.serialize([undefined]).json).toEqual([null])
    })

    it('serializes NaN to null', () => {
      expect(serializer.serialize(Number.NaN).json).toBeNull()
    })

    it('serializes Infinity and -Infinity to null', () => {
      expect(serializer.serialize(Number.POSITIVE_INFINITY).json).toBeNull()
      expect(serializer.serialize(Number.NEGATIVE_INFINITY).json).toBeNull()
    })

    it('serializes Date to ISO string', () => {
      expect(serializer.serialize(new Date('2023-01-01')).json).toBe('2023-01-01T00:00:00.000Z')
    })

    it('serializes invalid Date to null', () => {
      expect(serializer.serialize(new Date('invalid')).json).toBeNull()
    })

    it('serializes bigint to string', () => {
      expect(serializer.serialize(42n).json).toBe('42')
      expect(serializer.serialize(99999999999999999999999999999n).json).toBe('99999999999999999999999999999')
    })

    it('serializes URL to string', () => {
      expect(serializer.serialize(new URL('https://dinwwwh.com')).json).toBe('https://dinwwwh.com/')
    })

    it('serializes Set to array and Map to entries, converting nested values', () => {
      expect(serializer.serialize(new Set([1, 2, 3])).json).toEqual([1, 2, 3])
      expect(serializer.serialize(new Map([['a', 1]])).json).toEqual([['a', 1]])
      expect(serializer.serialize(new Set([new Date('2023-01-01')])).json).toEqual(['2023-01-01T00:00:00.000Z'])
      expect(serializer.serialize(new Map([[new Date('2023-01-01'), 1n]])).json).toEqual([['2023-01-01T00:00:00.000Z', '1']])
    })

    it('serializes a realistic API response in one pass', () => {
      const { json } = serializer.serialize({
        user: {
          id: 9007199254740993n,
          name: 'dinwwwh',
          createdAt: new Date('2023-01-01'),
          homepage: new URL('https://orpc.dev'),
          roles: new Set(['admin']),
          settings: new Map([['theme', 'dark']]),
          bio: undefined,
        },
        scores: [1, Number.NaN, 2.5],
      })

      expect(json).toEqual({
        user: {
          id: '9007199254740993',
          name: 'dinwwwh',
          createdAt: '2023-01-01T00:00:00.000Z',
          homepage: 'https://orpc.dev/',
          roles: ['admin'],
          settings: [['theme', 'dark']],
        },
        scores: [1, null, 2.5],
      })
    })

    it('omits undefined object properties by default', () => {
      expect(serializer.serialize({ a: 1, b: undefined }).json).not.toHaveProperty('b')
    })

    it('skips toJSON methods', () => {
      expect(serializer.serialize({ value: { toJSON: () => 'hello' } }).json).toEqual({ value: {} })
    })

    it('keeps non-function toJSON properties', () => {
      expect(serializer.serialize({ value: { toJSON: 'hello' } }).json).toEqual({ value: { toJSON: 'hello' } })
    })

    it('collects blobs and maps', () => {
      const blob = new Blob(['hello'])
      const { maps, blobs } = serializer.serialize({ file: blob })
      expect(blobs).toEqual([blob])
      expect(maps).toEqual([['file']])
    })

    it('collects multiple blobs with their exact paths', () => {
      const a = new Blob(['a'])
      const b = new Blob(['b'])
      const { maps, blobs } = serializer.serialize({ nested: { a }, list: [1, b] })

      expect(maps).toEqual([['nested', 'a'], ['list', 1]])
      expect(blobs).toEqual([a, b])
    })

    it('passes through values no handler understands', () => {
      const symbol = Symbol('sym')
      expect(serializer.serialize(symbol).json).toBe(symbol)
    })
  })

  describe('deserialize', () => {
    it('restores blobs at mapped paths', () => {
      const blob = new Blob(['hello'])
      const result = serializer.deserialize({ json: { file: null }, maps: [['file']], blobs: [blob] })
      expect((result as any).file).toBe(blob)
    })

    it('does not mutate the input and deserializes it repeatedly', () => {
      const blob = new Blob(['hello'])
      const payload = { json: { files: [null] }, maps: [['files', 0]], blobs: [blob] }

      expect(serializer.deserialize(payload)).toEqual({ files: [blob] })
      expect(serializer.deserialize(payload)).toEqual({ files: [blob] })
      expect(payload.json).toEqual({ files: [null] })
    })

    it('returns json as-is when no blobs', () => {
      const json = { a: 1, b: '2023-01-01T00:00:00.000Z' }
      expect(serializer.deserialize({ json })).toEqual(json)
    })
  })

  describe('options', () => {
    it('supports overriding default handlers', () => {
      const custom = new OpenAPIJsonSerializer({
        handlers: {
          date: {
            condition: data => data instanceof Date,
            serialize: (value: Date) => `___TEST___${value.getTime()}`,
          },
        },
      })

      const date = new Date('2023-01-01')
      expect(custom.serialize({ value: date }).json).toEqual({ value: `___TEST___${date.getTime()}` })
    })

    it('supports disabling default handlers', () => {
      const custom = new OpenAPIJsonSerializer({ handlers: { date: undefined } })
      const date = new Date('2023-01-01')
      expect(custom.serialize({ value: date, list: [undefined] }).json).toEqual({ value: date, list: [null] })
    })

    it('supports custom handlers, and keeps serializing non-terminal results', () => {
      const custom = new OpenAPIJsonSerializer({
        handlers: {
          person: {
            condition: data => data instanceof Person,
            serialize: (data: Person) => data.toJSON(),
          },
        },
      })

      expect(custom.serialize(new Person('dinwwwh', new Date('2023-01-01'))).json).toEqual({
        name: 'dinwwwh',
        date: '2023-01-01T00:00:00.000Z',
      })
    })

    it('treats terminal handler results as final, without further serialization', () => {
      const date = new Date('2023-01-01')
      const custom = new OpenAPIJsonSerializer({
        handlers: {
          person: {
            condition: data => data instanceof Person,
            serialize: (data: Person) => data.toJSON(),
            isTerminal: true,
          },
        },
      })

      // the nested Date stays untouched because the terminal result is not walked
      expect((custom.serialize(new Person('dinwwwh', date)).json as any).date).toBe(date)
    })

    it('keeps every built-in type working when any built-in handler is customized', () => {
      // customizing a built-in key switches to the generic handler scan; every default handler must still work there
      const custom = new OpenAPIJsonSerializer({
        handlers: {
          undefined: {
            condition: data => data === undefined,
            serialize: () => null,
            isTerminal: true,
          },
        },
      })

      expect(custom.serialize({
        date: new Date('2023-01-01'),
        invalidDate: new Date('Invalid'),
        nan: Number.NaN,
        infinity: Number.POSITIVE_INFINITY,
        negativeInfinity: Number.NEGATIVE_INFINITY,
        url: new URL('https://orpc.dev'),
        set: new Set([1, 2]),
        map: new Map([['a', 1]]),
        bigint: 123n,
        list: [undefined],
        plain: 'text',
      }).json).toEqual({
        date: '2023-01-01T00:00:00.000Z',
        invalidDate: null,
        nan: null,
        infinity: null,
        negativeInfinity: null,
        url: 'https://orpc.dev/',
        set: [1, 2],
        map: [['a', 1]],
        bigint: '123',
        list: [null],
        plain: 'text',
      })
    })

    it('collects blobs returned by terminal custom handlers', () => {
      class BlobContainer {
        constructor(public blob: Blob) {}
      }

      const custom = new OpenAPIJsonSerializer({
        handlers: {
          blobContainer: {
            condition: data => data instanceof BlobContainer,
            serialize: (data: BlobContainer) => data.blob,
            isTerminal: true,
          },
        },
      })

      const serialized = custom.serialize({ file: new BlobContainer(new Blob(['hello'], { type: 'text/plain' })) })

      expect(serialized.json).toEqual({ file: expect.any(Blob) })
      expect(serialized.maps).toEqual([['file']])
      expect(serialized.blobs).toEqual([expect.any(Blob)])
    })

    it('can disable omitting undefined properties', () => {
      const custom = new OpenAPIJsonSerializer({ omitUndefinedProperties: false })
      expect(custom.serialize({ a: 1, b: undefined }).json).toEqual({ a: 1, b: null })
    })
  })

  describe('security', () => {
    afterEach(() => {
      expect(({} as any).polluted).toBeUndefined()
      expect((Object.prototype as any).polluted).toBeUndefined()
    })

    it.each(['doesNotExist', '__proto__', 'constructor', 'prototype'])('throws on invalid blob map segment "%s" to prevent prototype pollution', (segment) => {
      expect(
        () => serializer.deserialize({ json: { o: {} }, blobs: [new Blob()], maps: [[segment]] }),
      ).toThrowError(`Invalid OpenAPI serialized data: segment "${segment}" does not exist.`)

      expect(
        () => serializer.deserialize({ json: { o: {} }, blobs: [new Blob()], maps: [['o', segment]] }),
      ).toThrowError(`Invalid OpenAPI serialized data: segment "${segment}" does not exist.`)

      expect(
        () => serializer.deserialize({ json: { o: {} }, blobs: [new Blob()], maps: [[segment, 'o']] }),
      ).toThrowError(`Invalid OpenAPI serialized data: segment "${segment}" does not exist.`)
    })

    it('throws when a blobs entry is not a Blob', () => {
      for (const value of [4294967295, 'text', null, {}, []]) {
        expect(() => serializer.deserialize({ json: [null], blobs: [value as any], maps: [[0]] }))
          .toThrowError('Invalid OpenAPI serialized data: blob 0 is not a Blob.')
      }

      expect(() => serializer.deserialize({ json: [null, null], blobs: [new Blob()], maps: [[0], [1]] }))
        .toThrowError('Invalid OpenAPI serialized data: blob 1 is not a Blob.')
    })

    /* eslint-disable no-proto, no-restricted-properties */
    it('serializes own __proto__ keys as plain data', () => {
      // JSON.parse creates own __proto__ properties, exactly like a real request body
      const { json } = serializer.serialize(JSON.parse('{"__proto__": {"polluted": true}}')) as any

      expect(Object.hasOwn(json, '__proto__')).toBe(true)
      expect(json.__proto__).toEqual({ polluted: true })
      expect(json.polluted).toBeUndefined()
    })

    it('restores blobs behind own __proto__ keys without touching prototypes', () => {
      const blob = new Blob(['x'])
      const result = serializer.deserialize({
        json: JSON.parse('{"__proto__": {"file": null}}'),
        maps: [['__proto__', 'file']],
        blobs: [blob],
      }) as any

      expect(Object.hasOwn(result, '__proto__')).toBe(true)
      expect(result.__proto__.file).toBe(blob)
    })

    it('restores a blob stored directly under an own __proto__ key', () => {
      const blob = new Blob(['x'])
      const result = serializer.deserialize({
        json: JSON.parse('{"__proto__": null}'),
        maps: [['__proto__']],
        blobs: [blob],
      }) as any

      expect(Object.hasOwn(result, '__proto__')).toBe(true)
      expect(result.__proto__).toBe(blob)
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    })

    it('walks an own constructor/prototype chain without reaching the real Object.prototype', () => {
      const blob = new Blob(['x'])
      const result = serializer.deserialize({
        json: JSON.parse('{"constructor": {"prototype": {"polluted": null}}}'),
        maps: [['constructor', 'prototype', 'polluted']],
        blobs: [blob],
      }) as any

      expect(result.constructor.prototype.polluted).toBe(blob)
    })
    /* eslint-enable no-proto, no-restricted-properties */
  })
})
