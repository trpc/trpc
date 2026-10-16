import { afterEach, describe, expect, it, vi } from 'vitest'
import { decode, encode } from '../src/qss'

afterEach(() => vi.unstubAllGlobals())

describe('encode function', () => {
  it.each([{}, { skipped: undefined }])(
    'does not allocate a native serializer for %j',
    (input) => {
      const Original = URLSearchParams
      const constructor = vi.fn(function () {
        return new Original()
      })
      vi.stubGlobal('URLSearchParams', constructor)
      expect(encode(input)).toBe('')
      expect(constructor).not.toHaveBeenCalled()
    },
  )

  it('keeps getter and serializer order, including inherited values', () => {
    const calls: Array<string> = []
    const input = Object.create({
      get inherited() {
        calls.push('get inherited')
        return 'last'
      },
    })
    Object.defineProperties(input, {
      skipped: {
        enumerable: true,
        get() {
          calls.push('get skipped')
          return undefined
        },
      },
      own: {
        enumerable: true,
        get() {
          calls.push('get own')
          return 'first'
        },
      },
    })
    expect(
      encode(input, (value) => {
        calls.push(`stringify ${value}`)
        return value
      }),
    ).toBe('own=first&inherited=last')
    expect(calls).toEqual([
      'get skipped',
      'get own',
      'stringify first',
      'get inherited',
      'stringify last',
    ])
  })

  it('preserves falsy values and empty serializer output', () => {
    expect(encode({ zero: 0, false: false, null: null, empty: '' })).toBe(
      'zero=0&false=false&null=null&empty=',
    )
    expect(encode({ value: 'present' }, () => '')).toBe('value=')
  })

  it('retains native set semantics for keys that normalize to the same string', () => {
    expect(encode({ '\uD800': 'first', '\uD801': 'second' })).toBe(
      '%EF%BF%BD=second',
    )
  })

  it('should encode an object into a query string without a prefix', () => {
    const obj = { token: 'foo', key: 'value' }
    const queryString = encode(obj)
    expect(queryString).toEqual('token=foo&key=value')
  })

  it('should handle encoding an object with empty values and trailing equal signs', () => {
    const obj = { token: '', key: 'value=' }
    const queryString = encode(obj)
    expect(queryString).toEqual('token=&key=value%3D') // token=&key=value=
  })

  it('should handle encoding an object with array values', () => {
    const obj = { token: ['foo', 'bar'], key: 'value' }
    const queryString = encode(obj)
    expect(queryString).toEqual('token=foo%2Cbar&key=value')
  })

  it('should handle encoding an object with special characters', () => {
    const obj = { token: 'foo?', key: 'value=' }
    const queryString = encode(obj)
    expect(queryString).toEqual('token=foo%3F&key=value%3D')
  })

  it('should handle encoding a top-level key with a special character', () => {
    const obj = { 'foo=bar': 1 }
    const queryString = encode(obj)
    expect(queryString).toEqual('foo%3Dbar=1')
  })
})

describe('decode function', () => {
  it('should decode a query string without a prefix', () => {
    const queryString = 'token=foo&key=value'
    const decodedObj = decode(queryString)
    expect(decodedObj).toEqual({ token: 'foo', key: 'value' })
  })

  it('should handle missing values and trailing equal signs', () => {
    const queryString = 'token=&key=value='
    const decodedObj = decode(queryString)
    expect(decodedObj).toEqual({ token: '', key: 'value=' })
  })

  it('should handle decoding a query string with array values', () => {
    const queryString = 'token=foo&token=bar&key=value'
    const decodedObj = decode(queryString)
    expect(decodedObj).toEqual({ token: ['foo', 'bar'], key: 'value' })
  })

  it('should handle decoding a query string with special characters', () => {
    const queryString = 'token=foo%3F&key=value%3D'
    const decodedObj = decode(queryString)
    expect(decodedObj).toEqual({ token: 'foo?', key: 'value=' })
  })

  it('should handle decoding a top-level key with a special character', () => {
    const queryString = 'foo%3Dbar=1'
    const decodedObj = decode(queryString)
    expect(decodedObj).toEqual({ 'foo=bar': 1 })
  })

  it('should handle decoding a top-level key with a special character and without a value', () => {
    const queryString = 'foo%3Dbar='
    const decodedObj = decode(queryString)
    expect(decodedObj).toEqual({ 'foo=bar': '' })
  })

  it('should handle decoding a value-less top-level key with a special character', () => {
    const queryString = 'foo%3Dbar'
    const decodedObj = decode(queryString)
    expect(decodedObj).toEqual({ 'foo=bar': '' })
  })

  it('should handle decoding a query with "100%" as a value', () => {
    const queryString = 'percentage=100%&name=Sean&foo%3Dbar&key=value%3D'
    const decodedObj = decode(queryString)
    expect(decodedObj).toEqual({
      percentage: '100%',
      name: 'Sean',
      'foo=bar': '',
      key: 'value=',
    })
  })

  it('should handle decoding a query with plus', () => {
    const queryString = 'q=red%2Byellow+orange'
    const decodedObj = decode(queryString)
    expect(decodedObj).toEqual({ q: 'red+yellow orange' })
  })

  it('should decode once percent characters (%) encoded twice', () => {
    const queryString = 'q=%2540'
    const decodedObj = decode(queryString)
    expect(decodedObj).toEqual({ q: '%40' })
  })
})
