import { isDeepEqual } from './compare'

describe('deepEqual', () => {
  it('returns true for the same primitive reference', () => {
    expect(isDeepEqual('value', 'value')).toBe(true)
    expect(isDeepEqual(1, 1)).toBe(true)
    expect(isDeepEqual(true, true)).toBe(true)
  })

  it('returns true for NaN values', () => {
    expect(isDeepEqual(Number.NaN, Number.NaN)).toBe(true)
  })

  it('returns false for values with different types', () => {
    expect(isDeepEqual(1, '1')).toBe(false)
  })

  it('returns false for unequal primitives of the same type', () => {
    expect(isDeepEqual(1, 2)).toBe(false)
  })

  it('returns false when only the left side is null', () => {
    expect(isDeepEqual(null, {})).toBe(false)
  })

  it('returns false when only the right side is null', () => {
    expect(isDeepEqual({}, null)).toBe(false)
  })

  it('returns false when comparing an array to an object', () => {
    expect(isDeepEqual([], {})).toBe(false)
  })

  it('returns false for arrays with different lengths', () => {
    expect(isDeepEqual([1], [1, 2])).toBe(false)
  })

  it('returns false for objects with different key counts', () => {
    expect(isDeepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
  })

  it('returns true when different keys only contain undefined values', () => {
    expect(isDeepEqual({ a: undefined }, { b: undefined })).toBe(true)
  })

  it('returns true for deeply equal nested values', () => {
    expect(isDeepEqual(
      {
        items: [1, { enabled: true }],
        meta: { count: 2 },
      },
      {
        items: [1, { enabled: true }],
        meta: { count: 2 },
      },
    )).toBe(true)
  })

  it('returns false for deeply unequal nested values', () => {
    expect(isDeepEqual(
      {
        items: [1, { enabled: true }],
      },
      {
        items: [1, { enabled: false }],
      },
    )).toBe(false)
  })

  it('can handle recursive object', () => {
    const a = {
      u: [1, 2, 3],
      get c() {
        return a
      },
    }

    const b = {
      u: [1, 2, 3],
      get c() {
        return b
      },
    }

    expect(isDeepEqual(a, b)).toBeTruthy()
  })

  it('returns false for unequal recursive objects', () => {
    const a = {
      u: [1, 2, 3],
      get c() {
        return a
      },
    }

    const b = {
      u: [1, 2, 4],
      get c() {
        return b
      },
    }

    expect(isDeepEqual(a, b)).toBe(false)
  })

  it('returns true when one side reuses a reference and the other duplicates the value', () => {
    const shared = { value: 1 }

    expect(isDeepEqual(
      {
        left: shared,
        right: shared,
      },
      {
        left: { value: 1 },
        right: { value: 1 },
      },
    )).toBe(true)
  })

  it('returns false when comparing a date to a plain object', () => {
    expect(isDeepEqual(new Date(0), {})).toBe(false)
    expect(isDeepEqual({}, new Date(0))).toBe(false)
  })

  it('compares non-plain objects by reference', () => {
    const date = new Date(0)
    const regexp = /a/
    const set = new Set([1])
    const map = new Map([[1, 1]])

    expect(isDeepEqual(date, date)).toBe(true)
    expect(isDeepEqual(new Date(0), new Date(0))).toBe(false)
    expect(isDeepEqual(new Date(0), new Date(1))).toBe(false)
    expect(isDeepEqual(regexp, regexp)).toBe(true)
    expect(isDeepEqual(/a/, /a/)).toBe(false)
    expect(isDeepEqual(/a/, /b/)).toBe(false)
    expect(isDeepEqual(set, set)).toBe(true)
    expect(isDeepEqual(new Set([1]), new Set([1]))).toBe(false)
    expect(isDeepEqual(new Set([1]), new Set([2]))).toBe(false)
    expect(isDeepEqual(map, map)).toBe(true)
    expect(isDeepEqual(new Map([[1, 1]]), new Map([[1, 1]]))).toBe(false)
    expect(isDeepEqual(new Map([[1, 1]]), new Map([[1, 2]]))).toBe(false)
  })

  it('compares null-prototype objects structurally', () => {
    expect(isDeepEqual(Object.assign(Object.create(null), { a: 1 }), { a: 1 })).toBe(true)
  })

  it('compares dates nested inside objects and arrays by reference', () => {
    const date = new Date(0)

    expect(isDeepEqual({ items: [date] }, { items: [date] })).toBe(true)
    expect(isDeepEqual({ items: [new Date(0)] }, { items: [new Date(0)] })).toBe(false)
  })
})
