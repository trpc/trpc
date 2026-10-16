import { OpenAPISerializer } from '../../openapi-serializer'
import { serializeHeaders } from './utils'

const serializer = new OpenAPISerializer()

describe('serializeHeaders', () => {
  it('keeps string and string[] values as-is', () => {
    expect(serializeHeaders({
      'x-string': 'value',
      'x-array': ['a', 'b'],
    }, serializer)).toEqual({
      'x-string': 'value',
      'x-array': ['a', 'b'],
    })
  })

  it('serializes non-string values into strings', () => {
    expect(serializeHeaders({
      'x-number': 42,
      'x-boolean': true,
      'x-date': new Date('2020-01-02T03:04:05.000Z'),
      'x-array': ['a', 1, false, new Date('2020-01-02T03:04:05.000Z')],
    }, serializer)).toEqual({
      'x-number': '42',
      'x-boolean': 'true',
      'x-date': '2020-01-02T03:04:05.000Z',
      'x-array': ['a', '1', 'false', '2020-01-02T03:04:05.000Z'],
    })
  })

  it('serializes objects as comma-delimited key,value pairs', () => {
    expect(serializeHeaders({
      'x-object': { enabled: true, count: 2 },
      'x-object-nested-date': { at: new Date('2020-01-02T03:04:05.000Z') },
      'x-object-skip-nullish': { keep: 'yes', skip: null, omit: undefined },
    }, serializer)).toEqual({
      'x-object': 'enabled,true,count,2',
      'x-object-nested-date': 'at,2020-01-02T03:04:05.000Z',
      'x-object-skip-nullish': 'keep,yes',
    })
  })

  it('merges values that serialize into arrays as a single comma-delimited line', () => {
    expect(serializeHeaders({
      'x-set': new Set(['a', 'b']),
      'x-map': new Map([['k1', 'v1'], ['k2', 'v2']]),
    }, serializer)).toEqual({
      'x-set': 'a,b',
      'x-map': 'k1,v1,k2,v2',
    })
  })

  it('treats only actual arrays as multi-value headers, array items stay a single line each', () => {
    expect(serializeHeaders({
      'x-array': ['a', new Set(['b', 'c']), { k: 'v' }],
    }, serializer)).toEqual({
      'x-array': ['a', 'b,c', 'k,v'],
    })
  })

  it('drops undefined and null values, including array items', () => {
    const serialized = serializeHeaders({
      'x-null': null,
      'x-undefined': undefined,
      'x-array': ['keep', null, undefined],
    }, serializer)

    expect(serialized).toEqual({ 'x-array': ['keep'] })
    expect(Object.keys(serialized)).toEqual(['x-array'])
  })

  it('prevents prototype injection via header keys', () => {
    const serialized = serializeHeaders(JSON.parse(
      '{"__proto__": { "polluted": "yes" }, "constructor": "c", "toString": "t"}',
    ), serializer)

    expect(({} as any).polluted).toBeUndefined()

    // dangerous keys become plain own properties, not prototype-chain mutations
    expect(Object.getOwnPropertyDescriptor(serialized, '__proto__')?.value).toBe('polluted,yes')
    expect(Object.getOwnPropertyDescriptor(serialized, 'constructor')?.value).toBe('c')
    expect(Object.getOwnPropertyDescriptor(serialized, 'toString')?.value).toBe('t')
  })
})
