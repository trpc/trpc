import type { RPCJsonSerialization } from './rpc-json-serializer'
import { builtInRPCSupportDataTypes } from '../../../tests/rpc/__shared__/built-in-support-data-types'
import { RPCJsonSerializer } from './rpc-json-serializer'

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

class Person2 {
  constructor(
    public name: string,
    public data: any,
  ) { }

  toJSON() {
    return {
      name: this.name,
      data: this.data,
    }
  }
}

const customSupportedDataTypes: { name: string, value: unknown, expected: unknown }[] = [
  {
    name: 'person - 1',
    value: new Person('dinwwwh', new Date('2023-01-01')),
    expected: new Person('dinwwwh', new Date('2023-01-01')),
  },
  {
    name: 'person - 2',
    value: new Person2('dinwwwh - 2', [{ nested: new Date('2023-01-02') }, new URL('https://orpc.dev')]),
    expected: new Person2('dinwwwh - 2', [{ nested: new Date('2023-01-02') }, new URL('https://orpc.dev')]),
  },
  {
    name: 'should not resolve toJSON',
    value: { value: { toJSON: () => 'hello' } },
    expected: { value: { } },
  },
  {
    name: 'should resolve invalid toJSON',
    value: { value: { toJSON: 'hello' } },
    expected: { value: { toJSON: 'hello' } },
  },
]

/**
 * Simulates the real transport: json/meta/maps travel as JSON text,
 * blobs travel as separate binary parts.
 */
function roundTripThroughWire(serializer: RPCJsonSerializer, value: unknown): unknown {
  const { json, meta, maps, blobs } = serializer.serialize(value)
  const wire = JSON.parse(JSON.stringify({ json, meta, maps }))
  return serializer.deserialize({ ...wire, blobs })
}

describe.each([
  ...builtInRPCSupportDataTypes,
  ...customSupportedDataTypes,
])('rpcJsonSerializer: $name', ({ value, expected }) => {
  const serializer = new RPCJsonSerializer({
    handlers: {
      person: {
        condition: data => data instanceof Person,
        serialize: data => data.toJSON(),
        deserialize: (data: any) => new Person(data.name, data.date),
      },
      person2: {
        condition: data => data instanceof Person2,
        serialize: data => data.toJSON(),
        deserialize: (data: any) => new Person2(data.name, data.data),
      },
    },
  })

  function assert(value: unknown, expected: unknown) {
    expect(roundTripThroughWire(serializer, value)).toEqual(expected)
  }

  it('flat', () => {
    assert(value, expected)
  })

  it('nested object', () => {
    assert({
      data: value,
      nested: {
        data: value,
      },
    }, {
      data: expected,
      nested: {
        data: expected,
      },
    })
  })

  it('nested array', () => {
    assert([value, [value]], [expected, [expected]])
  })

  it('complex', () => {
    assert({
      'date': new Date('2023-01-01'),
      'url': new URL('https://dinwwwh.com'),
      '!@#$%^^&()[]>?<~_<:"~+!_': value,
      'list': [value],
      'map': new Map([[value, value]]),
      'set': new Set([value]),
      'nested': {
        nested: value,
      },
    }, {
      'date': new Date('2023-01-01'),
      'url': new URL('https://dinwwwh.com'),
      '!@#$%^^&()[]>?<~_<:"~+!_': expected,
      'list': [expected],
      'map': new Map([[expected, expected]]),
      'set': new Set([expected]),
      'nested': {
        nested: expected,
      },
    })
  })
})

describe('rpcJsonSerializer: wire format', () => {
  const serializer = new RPCJsonSerializer()

  it('produces plain JSON values plus meta describing how to restore them', () => {
    const { json, meta } = serializer.serialize({
      id: 7n,
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      tags: new Set(['a']),
      scores: new Map([['x', 1]]),
      homepage: new URL('https://orpc.dev'),
      missing: Number.NaN,
      max: Number.POSITIVE_INFINITY,
      min: Number.NEGATIVE_INFINITY,
    })

    expect(json).toEqual({
      id: '7',
      createdAt: '2023-01-01T00:00:00.000Z',
      tags: ['a'],
      scores: [['x', 1]],
      homepage: 'https://orpc.dev/',
      missing: null,
      max: 'Infinity',
      min: '-Infinity',
    })

    expect(meta).toEqual(expect.arrayContaining([
      ['bigint', 'id'],
      ['date', 'createdAt'],
      ['set', 'tags'],
      ['map', 'scores'],
      ['url', 'homepage'],
      ['nan', 'missing'],
      ['infinity', 'max'],
      ['infinity', 'min'],
    ]))
    expect(meta).toHaveLength(8)
  })

  it('omits meta entirely for pure JSON payloads', () => {
    const serialized = serializer.serialize({ name: 'test', items: [1, 'two', true, null] })
    expect(serialized.meta).toBeUndefined()
    expect(serialized.maps).toBeUndefined()
    expect(serialized.blobs).toBeUndefined()
  })

  it('collects nested files into maps and blobs', () => {
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })
    const { maps, blobs } = serializer.serialize({ upload: { doc: file }, note: 'x' })

    expect(maps).toEqual([['upload', 'doc']])
    expect(blobs).toEqual([file])
  })
})

describe('rpcJsonSerializer: edge cases', () => {
  const serializer = new RPCJsonSerializer()

  it('round-trips undefined inside arrays', () => {
    expect(roundTripThroughWire(serializer, [undefined, 1, undefined])).toEqual([undefined, 1, undefined])
  })

  it('round-trips undefined inside sets and maps', () => {
    expect(roundTripThroughWire(serializer, new Set([undefined, 1]))).toEqual(new Set([undefined, 1]))
    expect(roundTripThroughWire(serializer, new Map([[undefined, undefined]]))).toEqual(new Map([[undefined, undefined]]))
  })

  it('omits undefined object properties by default', () => {
    const serialized = serializer.serialize({ a: 1, b: undefined })
    expect(serialized.json).toEqual({ a: 1 })
    expect(serialized.meta).toBeUndefined()
  })

  it('preserves undefined object properties when omitUndefinedProperties is false', () => {
    const custom = new RPCJsonSerializer({ omitUndefinedProperties: false })

    const serialized = custom.serialize({ a: 1, b: undefined })
    expect(serialized.json).toEqual({ a: 1, b: null })
    expect(serialized.meta).toEqual([['undefined', 'b']])

    expect(roundTripThroughWire(custom, { a: 1, b: undefined })).toEqual({ a: 1, b: undefined })
  })

  it('round-trips empty containers', () => {
    expect(roundTripThroughWire(serializer, {})).toEqual({})
    expect(roundTripThroughWire(serializer, [])).toEqual([])
    expect(roundTripThroughWire(serializer, new Set())).toEqual(new Set())
    expect(roundTripThroughWire(serializer, new Map())).toEqual(new Map())
    expect(roundTripThroughWire(serializer, '')).toBe('')
  })

  it('round-trips empty and numeric-looking object keys', () => {
    const value = { '': 'empty', '0': 'zero', '00': 'padded', 'ключ': 'unicode' }
    expect(roundTripThroughWire(serializer, value)).toEqual(value)
  })

  it('round-trips deeply nested structures', () => {
    let value: any = new Date('2023-01-01')
    let expected: any = new Date('2023-01-01')
    for (let i = 0; i < 100; i++) {
      value = { nested: value, list: [i] }
      expected = { nested: expected, list: [i] }
    }

    expect(roundTripThroughWire(serializer, value)).toEqual(expected)
  })

  it('passes through values no handler understands', () => {
    const symbol = Symbol('sym')
    expect(serializer.serialize(symbol).json).toBe(symbol)

    const fn = () => 'x'
    expect(serializer.serialize(fn).json).toBe(fn)
  })
})

describe('rpcJsonSerializer: custom handlers', () => {
  it('supports overriding default handlers', () => {
    const serializer = new RPCJsonSerializer({
      handlers: {
        date: {
          condition: data => data instanceof Date,
          serialize: (value: Date) => `___TEST___${value.getTime()}`,
          deserialize: (value: string) => new Date(Number(value.slice(10))),
        },
      },
    })

    const date = new Date('2023-01-01')
    const serialized = serializer.serialize({ value: date })
    expect(serialized.json).toEqual({ value: `___TEST___${date.getTime()}` })
    expect(serialized.meta).toEqual([['date', 'value']])

    expect(roundTripThroughWire(serializer, { value: date })).toEqual({ value: date })
  })

  it('supports disabling default handlers', () => {
    const serializer = new RPCJsonSerializer({
      handlers: {
        date: undefined,
      },
    })

    const date = new Date('2023-01-01')
    const serialized = serializer.serialize({ value: date, list: [undefined] })
    expect(serialized.json).toEqual({ value: date, list: [null] })
    expect(serialized.meta).toEqual([['undefined', 'list', 0]])
  })

  it('keeps serializing non-terminal handler results, so nested values are restored too', () => {
    const serializer = new RPCJsonSerializer({
      handlers: {
        person: {
          condition: data => data instanceof Person,
          serialize: (data: Person) => data.toJSON(),
          deserialize: (data: any) => new Person(data.name, data.date),
        },
      },
    })

    const person = new Person('dinwwwh', new Date('2023-01-01'))
    const restored = roundTripThroughWire(serializer, { person }) as any

    expect(restored.person).toBeInstanceOf(Person)
    expect(restored.person.date).toBeInstanceOf(Date)
    expect(restored.person).toEqual(person)
  })

  it('treats terminal handler results as final, without further serialization', () => {
    const serializer = new RPCJsonSerializer({
      handlers: {
        person: {
          condition: data => data instanceof Person,
          serialize: (data: Person) => data.toJSON(),
          deserialize: data => data,
          isTerminal: true,
        },
      },
    })

    const date = new Date('2023-01-01')
    const serialized = serializer.serialize({ person: new Person('dinwwwh', date) })

    // the nested Date stays untouched because the terminal result is not walked
    expect((serialized.json as any).person.date).toBe(date)
    expect(serialized.meta).toEqual([['person', 'person']])
  })

  it('keeps every built-in type working when any built-in handler is customized', () => {
    // customizing a built-in key switches to the generic handler scan; every default handler must still work there
    const serializer = new RPCJsonSerializer({
      handlers: {
        undefined: {
          condition: data => data === undefined,
          serialize: () => null,
          deserialize: () => undefined,
          isTerminal: true,
        },
      },
    })

    const value = {
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
    }

    expect(roundTripThroughWire(serializer, value)).toEqual(value)
  })

  it('collects blobs returned by terminal custom handlers', () => {
    class BlobContainer {
      constructor(public blob: Blob) {}
    }

    const serializer = new RPCJsonSerializer({
      handlers: {
        blobContainer: {
          condition: data => data instanceof BlobContainer,
          serialize: (data: BlobContainer) => data.blob,
          deserialize: (blob: Blob) => new BlobContainer(blob),
          isTerminal: true,
        },
      },
    })

    const blob = new Blob(['hello'], { type: 'text/plain' })
    const serialized = serializer.serialize({ file: new BlobContainer(blob) })

    expect(serialized.meta).toEqual([['blobContainer', 'file']])
    expect(serialized.maps).toEqual([['file']])
    expect(serialized.blobs).toEqual([blob])

    const deserialized = serializer.deserialize(serialized) as any
    expect(deserialized.file).toBeInstanceOf(BlobContainer)
    expect(deserialized.file.blob).toBe(blob)
  })
})

describe('rpcJsonSerializer: deserialize', () => {
  const serializer = new RPCJsonSerializer()

  it.each([
    ['json', { count: 10n, list: [{ tags: new Set(['a']), nested: [new Date('2023-01-01'), new URL('https://orpc.dev')] }] }],
    ['blobs', { files: [new Blob(['hello'])], map: new Map([[1n, new Set(['a'])]]) }],
  ])('does not mutate the input and can deserialize repeatedly: %s', (_, value) => {
    // https://github.com/middleapi/orpc/issues/2053
    const payload = serializer.serialize(value)
    const snapshot = JSON.stringify(payload)

    expect(serializer.deserialize(payload)).toEqual(value)
    expect(serializer.deserialize(payload)).toEqual(value)
    expect(JSON.stringify(payload)).toBe(snapshot)
  })

  it('restores entries that share, leave and return to a path prefix', () => {
    const payload: RPCJsonSerialization = {
      json: { a: { b: { x: '1', y: '2' }, z: '3' }, c: ['4', { w: '5', v: '6' }] },
      meta: [['bigint', 'a', 'b', 'x'], ['bigint', 'a', 'z'], ['bigint', 'a', 'b', 'y'], ['bigint', 'c', 1, 'w'], ['bigint', 'c', '1', 'v'], ['bigint', 'c', 0]],
    }
    const snapshot = JSON.stringify(payload)

    expect(serializer.deserialize(payload)).toEqual({ a: { b: { x: 1n, y: 2n }, z: 3n }, c: [4n, { w: 5n, v: 6n }] })
    expect(JSON.stringify(payload)).toBe(snapshot)
  })
})

describe('rpcJsonSerializer: security', () => {
  const serializer = new RPCJsonSerializer()

  afterEach(() => {
    expect(({} as any).polluted).toBeUndefined()
    expect((Object.prototype as any).polluted).toBeUndefined()
  })

  it.each(['doesNotExist', '__proto__', 'constructor', 'prototype'])('throws when a meta or blob path references the non-own segment "%s"', (segment) => {
    const error = `Invalid RPC serialized data: segment "${segment}" does not exist.`

    expect(
      () => serializer.deserialize({ json: { o: {} }, meta: [['date', segment]] }),
    ).toThrow(error)

    expect(
      () => serializer.deserialize({ json: { o: {} }, meta: [['date', 'o', segment]] }),
    ).toThrow(error)

    expect(
      () => serializer.deserialize({ json: { o: {} }, meta: [['date', segment, 'o']] }),
    ).toThrow(error)

    expect(
      () => serializer.deserialize({ json: { o: {} }, blobs: [new Blob()], maps: [[segment]] }),
    ).toThrow(error)

    expect(
      () => serializer.deserialize({ json: { o: {} }, blobs: [new Blob()], maps: [['o', segment]] }),
    ).toThrow(error)

    expect(
      () => serializer.deserialize({ json: { o: {} }, blobs: [new Blob()], maps: [[segment, 'o']] }),
    ).toThrow(error)
  })

  it('throws when a blobs entry is not a Blob', () => {
    for (const value of [4294967295, 'text', null, {}, []]) {
      expect(() => serializer.deserialize({ json: [null], blobs: [value as any], maps: [[0]] }))
        .toThrow('Invalid RPC serialized data: blob 0 is not a Blob.')
    }

    expect(() => serializer.deserialize({ json: [null, null], blobs: [new Blob()], maps: [[0], [1]] }))
      .toThrow('Invalid RPC serialized data: blob 1 is not a Blob.')
  })

  it.each(['nonexistent', '__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', 'valueOf'])('never resolves the meta type "%s" through the prototype chain', (type) => {
    expect(() => serializer.deserialize({ json: 1, meta: [[type]] }))
      .toThrow(`Invalid RPC serialized data: type "${type}" is not supported.`)
  })

  it('throws instead of producing garbage for corrupted built-in payloads', () => {
    expect(() => serializer.deserialize({ json: 'not-a-bigint', meta: [['bigint']] })).toThrow()
  })

  it.each([
    ['undefined', 'null', ['text', 1, true, [], {}]],
    ['nan', 'null', ['text', 1, true, [], {}]],
    ['infinity', '"Infinity" or "-Infinity"', [null, 'text', 'infinity', 1, true, [], {}]],
    ['bigint', 'a string', [null, 1, true, [], {}]],
    ['url', 'a string', [null, 1, true, [], {}]],
    ['date', 'a string or null', [1, true, [], {}]],
    ['set', 'an array', [null, 'text', 1, true, {}]],
    ['map', 'an array', [null, 'text', 1, true, {}]],
  ])('%s rejects mistyped serialized values', (type, expected, rejected) => {
    for (const value of rejected) {
      expect(() => serializer.deserialize({ json: { value }, meta: [[type, 'value']] }))
        .toThrow(`Invalid RPC serialized data: type "${type}" expects ${expected}.`)
    }
  })

  it('bigint rejects non-canonical strings and more than 4300 digits', () => {
    expect(serializer.deserialize({ json: '9'.repeat(4300), meta: [['bigint']] })).toBe(BigInt('9'.repeat(4300)))

    for (const bad of ['9'.repeat(4301), '0x10', ' 1 ']) {
      expect(() => serializer.deserialize({ json: bad, meta: [['bigint']] }))
        .toThrow('Invalid RPC serialized data: type "bigint" expects a decimal integer string of at most 4300 digits.')
    }
  })

  it('rejects a value already restored by an earlier meta entry', () => {
    expect(() => serializer.deserialize({ json: { value: '1' }, meta: [['bigint', 'value'], ['url', 'value']] }))
      .toThrow('Invalid RPC serialized data: type "url" expects a string.')
  })

  /* eslint-disable no-proto, no-restricted-properties */
  it('serializes own __proto__ keys as plain data', () => {
    // JSON.parse creates own __proto__ properties, exactly like a real request body
    const input = JSON.parse('{"__proto__": {"polluted": true}}')

    const restored = roundTripThroughWire(serializer, input) as any

    expect(Object.hasOwn(restored, '__proto__')).toBe(true)
    expect(restored.__proto__).toEqual({ polluted: true })
    expect(restored.polluted).toBeUndefined()
  })

  it('restores values behind own __proto__ keys without touching prototypes', () => {
    const restored = serializer.deserialize({
      json: JSON.parse('{"__proto__": {"when": "2023-01-01T00:00:00.000Z"}}'),
      meta: [['date', '__proto__', 'when']],
    }) as any

    expect(Object.hasOwn(restored, '__proto__')).toBe(true)
    expect(restored.__proto__.when).toBeInstanceOf(Date)
  })

  it('restores a value stored directly under an own __proto__ key', () => {
    const restored = serializer.deserialize({
      json: JSON.parse('{"__proto__": "2023-01-01T00:00:00.000Z"}'),
      meta: [['date', '__proto__']],
    }) as any

    expect(Object.hasOwn(restored, '__proto__')).toBe(true)
    expect(restored.__proto__).toBeInstanceOf(Date)
  })

  it('walks an own constructor/prototype chain without reaching the real Object.prototype', () => {
    const blob = new Blob(['x'])

    const restored = serializer.deserialize({
      json: JSON.parse('{"constructor": {"prototype": {"when": "2023-01-01T00:00:00.000Z", "polluted": null}}}'),
      meta: [['date', 'constructor', 'prototype', 'when']],
      maps: [['constructor', 'prototype', 'polluted']],
      blobs: [blob],
    }) as any

    expect(restored.constructor.prototype.when).toBeInstanceOf(Date)
    expect(restored.constructor.prototype.polluted).toBe(blob)
  })

  it('restores a blob stored directly under an own __proto__ key', () => {
    const blob = new Blob(['x'])

    const restored = serializer.deserialize({
      json: JSON.parse('{"__proto__": null}'),
      maps: [['__proto__']],
      blobs: [blob],
    }) as any

    expect(Object.hasOwn(restored, '__proto__')).toBe(true)
    expect(restored.__proto__).toBe(blob)
    expect(Object.getPrototypeOf(restored)).toBe(Object.prototype)
  })
  /* eslint-enable no-proto, no-restricted-properties */
})

describe('rpcJsonSerializer: meta cannot descend into restored values', () => {
  class Human {
    constructor(public name: string, public age: number) {}
  }

  const serializer = new RPCJsonSerializer({
    handlers: {
      human: {
        condition: v => v instanceof Human,
        serialize: (v: Human) => ({ name: v.name, age: v.age }),
        deserialize: (v: any) => {
          if (typeof v?.name !== 'string' || typeof v?.age !== 'number')
            throw new TypeError('invalid human')
          return new Human(v.name, v.age)
        },
      },
      identity: { // returns the very object it validated
        condition: () => false,
        serialize: v => v,
        deserialize: (v: any) => {
          if (typeof v?.name !== 'string')
            throw new TypeError('invalid')
          return v
        },
      },
      list: { // returns the very array it validated
        condition: () => false,
        serialize: v => v,
        deserialize: (v: any) => {
          if (!Array.isArray(v) || !v.every(item => typeof item === 'string'))
            throw new TypeError('invalid list')
          return v
        },
      },
      bytes: { // returns the very non-JSON value it validated
        condition: () => false,
        serialize: v => v,
        deserialize: (v: any) => {
          if (!(v instanceof Uint8Array) || v.some(b => b > 9))
            throw new TypeError('invalid bytes')
          return v
        },
      },
      double: {
        condition: () => false,
        serialize: v => v,
        deserialize: (v: any) => v * 2 + 100,
      },
      zero: {
        condition: () => false,
        serialize: v => v,
        deserialize: () => 0,
      },
    },
  })

  it('rejects a meta path that descends into a custom handler result', () => {
    expect(() => serializer.deserialize({ json: { p: { name: 'http://evil/', age: 1 } }, meta: [['human', 'p'], ['url', 'p', 'name']] }))
      .toThrow('Invalid RPC serialized data: segment "p" cannot be walked into.')
    expect(() => serializer.deserialize({ json: { p: { name: '123', age: 1 } }, meta: [['human', 'p'], ['bigint', 'p', 'name']] }))
      .toThrow('Invalid RPC serialized data: segment "p" cannot be walked into.')
  })

  it('rejects descent into a root-level custom handler result', () => {
    expect(() => serializer.deserialize({ json: { name: '123', age: 1 }, meta: [['human'], ['bigint', 'name']] }))
      .toThrow('Invalid RPC serialized data: segment "json" cannot be walked into.')
    expect(() => serializer.deserialize({ json: { x: '1', name: '2' }, meta: [['bigint', 'x'], ['identity'], ['bigint', 'name']] }))
      .toThrow('Invalid RPC serialized data: segment "json" cannot be walked into.')
  })

  it('rejects descent when entries share a path prefix with earlier ones', () => {
    const json = { p: { name: 'http://evil/', age: 1, at: null }, q: '2020-01-01T00:00:00.000Z' }

    expect(() => serializer.deserialize({ json, meta: [['date', 'p', 'at'], ['human', 'p'], ['url', 'p', 'name']] }))
      .toThrow('Invalid RPC serialized data: segment "p" cannot be walked into.')
    expect(() => serializer.deserialize({ json, meta: [['human', 'p'], ['date', 'q'], ['url', 'p', 'name']] }))
      .toThrow('Invalid RPC serialized data: segment "p" cannot be walked into.')
    expect(() => serializer.deserialize({ json: { a: { b: { name: '1', c: null } } }, meta: [['date', 'a', 'b', 'c'], ['identity', 'a', 'b'], ['bigint', 'a', 'b', 'name']] }))
      .toThrow('Invalid RPC serialized data: segment "b" cannot be walked into.')
    expect(() => serializer.deserialize({ json: { a: { name: '1', b: { x: '2', y: '3' } } }, meta: [['bigint', 'a', 'b', 'x'], ['identity', 'a'], ['bigint', 'a', 'b', 'y']] }))
      .toThrow('Invalid RPC serialized data: segment "a" cannot be walked into.')
  })

  it('checks that a segment still exists after an earlier entry shrinks its array', () => {
    expect(() => serializer.deserialize({ json: { a: [{ x: '1' }, { y: '2' }] }, meta: [['bigint', 'a', 1, 'y'], ['zero', 'a', 'length'], ['bigint', 'a', 1, 'y']] }))
      .toThrow('Invalid RPC serialized data: segment "1" does not exist.')
  })

  it('treats numeric and string segments as the same position', () => {
    expect(() => serializer.deserialize({ json: [{ name: '123', age: 1 }], meta: [['human', 0], ['bigint', '0', 'name']] }))
      .toThrow('Invalid RPC serialized data: segment "0" cannot be walked into.')
  })

  it('rejects descent even when the handler returned the validated object itself', () => {
    expect(() => serializer.deserialize({ json: { p: { name: '1' } }, meta: [['identity', 'p'], ['bigint', 'p', 'name']] }))
      .toThrow('Invalid RPC serialized data: segment "p" cannot be walked into.')
    expect(() => serializer.deserialize({ json: { l: ['1'] }, meta: [['list', 'l'], ['bigint', 'l', 0]] }))
      .toThrow('Invalid RPC serialized data: segment "l" cannot be walked into.')
  })

  it('rejects descent into a non-JSON value the handler returned as is', () => {
    // structured clone transports (e.g. MessagePort with experimental_transfer) can deliver non-JSON values
    const bytes = new Uint8Array([1])

    expect(() => serializer.deserialize({ json: { b: bytes }, meta: [['bytes', 'b'], ['double', 'b', 0]] }))
      .toThrow('Invalid RPC serialized data: segment "b" cannot be walked into.')
    // structured clone also keeps shared references, so the same value can sit at another path
    expect(() => serializer.deserialize({ json: { b: bytes, c: bytes }, meta: [['bytes', 'b'], ['double', 'c', 0]] }))
      .toThrow('Invalid RPC serialized data: segment "c" cannot be walked into.')
    expect(bytes[0]).toBe(1)
  })

  it('does not let a payload mutate a shared instance returned by a handler', () => {
    const CURRENCIES: Record<string, { code: string, symbol: string }> = { USD: { code: 'USD', symbol: '$' } }
    const s = new RPCJsonSerializer({
      handlers: {
        currency: {
          condition: () => false,
          serialize: (v: any) => v.code,
          isTerminal: true,
          deserialize: (code: any) => {
            if (typeof code !== 'string' || !Object.hasOwn(CURRENCIES, code))
              throw new TypeError('invalid currency')
            return CURRENCIES[code]
          },
        },
      },
    })
    expect(() => s.deserialize({ json: { c: 'USD' }, meta: [['currency', 'c'], ['date', 'c', 'symbol']] }))
      .toThrow('Invalid RPC serialized data: segment "c" cannot be walked into.')
    expect(CURRENCIES.USD!.symbol).toBe('$')
  })

  it('rejects descent into built-in results and blobs', () => {
    expect(() => serializer.deserialize({ json: { a: ['2020-01-01T00:00:00.000Z'] }, meta: [['set', 'a'], ['date', 'a', 0]] }))
      .toThrow('Invalid RPC serialized data: segment "a" cannot be walked into.')
    expect(() => serializer.deserialize({ json: { a: {} }, blobs: [new Blob()], maps: [['a']], meta: [['date', 'a', 'x']] }))
      .toThrow('Invalid RPC serialized data: segment "a" cannot be walked into.')
    expect(() => serializer.deserialize({ json: { a: { x: null } }, blobs: [new Blob(), new Blob()], maps: [['a'], ['a', 'x']] }))
      .toThrow('Invalid RPC serialized data: segment "a" cannot be walked into.')
  })

  it('still stacks handlers on the same position, governed by their own type checks', () => {
    expect(serializer.deserialize({ json: { p: { name: 'x', age: 1 } }, meta: [['identity', 'p'], ['human', 'p']] }))
      .toEqual({ p: new Human('x', 1) })
  })

  it('still round-trips nested custom and built-in values (children-first order)', () => {
    const value = {
      p: new Human('x', 1),
      s: new Set([new Date(0), new Human('y', 2)]),
      m: new Map<unknown, unknown>([[1n, new Set([undefined])], ['k', [new Human('z', 3)]]]),
    }
    expect(serializer.deserialize(serializer.serialize(value))).toEqual(value)
    expect(roundTripThroughWire(serializer, value)).toEqual(value)
  })

  it('still round-trips blobs nested in custom and built-in values', () => {
    const blob = new Blob(['x'])
    const s = new RPCJsonSerializer({
      handlers: {
        file: {
          condition: v => v instanceof Blob,
          serialize: v => v,
          isTerminal: true,
          deserialize: (v: any) => {
            if (!(v instanceof Blob))
              throw new TypeError('invalid blob')
            return v
          },
        },
        box: {
          condition: v => v instanceof Human,
          serialize: (v: Human) => ({ name: v.name, age: v.age, attachments: new Set([blob]) }),
          deserialize: (v: any) => new Human(v.name, v.attachments.size),
        },
      },
    })

    expect(s.deserialize(s.serialize({ root: blob, nested: new Set([blob]), p: new Human('x', 0) })))
      .toEqual({ root: blob, nested: new Set([blob]), p: new Human('x', 1) })
    expect(s.deserialize(s.serialize(blob))).toBe(blob)
  })
})
