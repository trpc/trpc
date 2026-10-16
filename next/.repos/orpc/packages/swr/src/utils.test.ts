import { isSubsetOf } from './utils'

describe('isSubsetOf', () => {
  it('returns true for identical values and valid subsets', () => {
    // Identical values
    expect(isSubsetOf([1, 2], [1, 2])).toBe(true)
    expect(isSubsetOf({}, {})).toBe(true)
    expect(isSubsetOf([], [])).toBe(true)

    // Object subsets
    expect(isSubsetOf({ a: 1 }, { a: 1, b: 2 })).toBe(true)
    expect(isSubsetOf({}, { a: 1 })).toBe(true)
    expect(isSubsetOf({ a: undefined }, { a: 1 })).toBe(true)

    // Array subsets
    expect(isSubsetOf([1, 2], [1, 2, 3])).toBe(true)
    expect(isSubsetOf([], [1])).toBe(true)

    // Nested structures
    expect(isSubsetOf({ a: { b: 2 } }, { a: { b: 2, c: 3 } })).toBe(true)
    expect(isSubsetOf({ a: { b: [1, 2] } }, { a: { b: [1, 2, 3] } })).toBe(true)
  })

  it('returns false for type mismatches and non-subsets', () => {
    // Type mismatches
    expect(isSubsetOf([1, 2], 'string')).toBe(false)
    expect(isSubsetOf({ a: 1 }, [1, 2])).toBe(false)

    // Non-subset objects
    expect(isSubsetOf({ a: 1 }, { a: 2 })).toBe(false)
    expect(isSubsetOf({ a: { b: 2 } }, { a: { b: 3 } })).toBe(false)
    expect(isSubsetOf({ a: { b: 2 } }, { a: undefined })).toBe(false)

    // Non-subset arrays
    expect(isSubsetOf([1, 2], [2, 3])).toBe(false)
    expect(isSubsetOf([[1]], [[2]])).toBe(false)

    // Different dates
    expect(isSubsetOf(new Date(1), new Date(2))).toBe(false)
    expect(isSubsetOf(new Date(1), new Date('invalid'))).toBe(false)
    expect(isSubsetOf(new Date(1), 1)).toBe(false)

    // Different instances of other non-plain objects
    expect(isSubsetOf(new URL('https://orpc.dev'), new URL('https://orpc.dev'))).toBe(false)
  })

  it('compares dates by time, like SWR hashes keys', () => {
    expect(isSubsetOf(new Date(1), new Date(1))).toBe(true)
    expect(isSubsetOf(new Date('invalid'), new Date('invalid'))).toBe(true)
    expect(isSubsetOf({ since: new Date(1) }, { since: new Date(1), limit: 10 })).toBe(true)
    expect(isSubsetOf([new Date(1)], [new Date(1), new Date(2)])).toBe(true)
  })
})
