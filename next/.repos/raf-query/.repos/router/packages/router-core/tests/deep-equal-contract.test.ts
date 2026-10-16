import { describe, expect, it } from 'vitest'
import { deepEqual } from '../src/utils'

// Pins the observable contract of `deepEqual` (including existing quirks) so
// performance work on its loops cannot change it silently.
describe('deepEqual contract', () => {
  it.each([
    [undefined, undefined],
    [true, undefined],
    [undefined, true],
    [true, true],
  ] as const)(
    'compares nested records and arrays with partial=%s explicitUndefined=%s',
    (partial, explicitUndefined) => {
      const a = Object.freeze({
        page: 1,
        nested: Object.freeze({ ids: Object.freeze([1, 2]) }),
      })
      expect(
        deepEqual(
          a,
          { page: 1, nested: { ids: [1, 2] } },
          partial,
          explicitUndefined,
        ),
      ).toBe(true)
      expect(
        deepEqual(
          a,
          { page: 1, nested: { ids: [1, 3] } },
          partial,
          explicitUndefined,
        ),
      ).toBe(false)
    },
  )

  it('keeps partial comparison directional and arrays length-exact', () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1 }, true)).toBe(true)
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 }, true)).toBe(false)
    expect(deepEqual([1, 2], [1], true)).toBe(false)
  })

  it('retains inherited enumeration, symbols, and hidden-property policy', () => {
    const a = Object.assign(Object.create({ inherited: 1 }), { own: 2 })
    expect(deepEqual(a, { inherited: 1, own: 2 })).toBe(true)
    const s = Symbol('metadata')
    expect(deepEqual({ [s]: 1 }, { [s]: 2 })).toBe(true)
    expect(
      deepEqual(Object.defineProperty({}, 'hidden', { value: 1 }), {}),
    ).toBe(true)
  })

  it('retains current undefined-key behavior rather than changing the contract', () => {
    expect(deepEqual({ a: undefined }, {})).toBe(true)
    expect(deepEqual({ a: undefined }, {}, false, true)).toBe(false)
    // Existing quirk: this performance patch deliberately does NOT repair it.
    expect(deepEqual({ a: undefined }, { b: undefined }, false, true)).toBe(
      true,
    )
    expect(deepEqual({}, { a: undefined }, true, true)).toBe(true)
  })

  it('retains numeric equality', () => {
    expect(deepEqual(-0, 0)).toBe(true)
    expect(deepEqual([NaN], [NaN])).toBe(false)
    expect(
      deepEqual([1n, Infinity, undefined], [1n, Infinity, undefined]),
    ).toBe(true)
  })

  it('preserves default-mode getter read order', () => {
    const reads: Array<string> = []
    const a = {
      get x() {
        reads.push('a')
        return 1
      },
    }
    const b = {
      get x() {
        reads.push('b')
        return 1
      },
    }
    expect(deepEqual(a, b)).toBe(true)
    expect(reads).toEqual(['a', 'b', 'a', 'b'])
  })

  it('does not read an excess comparison value in exact-defined mode', () => {
    const b = {
      get x() {
        throw new Error('must not read')
      },
    }
    expect(deepEqual({}, b, false, true)).toBe(false)
  })

  it('short-circuits identical children', () => {
    const shared = {}
    expect(deepEqual(shared, shared, true, true)).toBe(true)
    expect(deepEqual([shared], [shared], true, true)).toBe(true)
  })

  it('keeps different class instances opaque', () => {
    class Foo {
      value = 1
    }
    expect(deepEqual(new Foo(), new Foo())).toBe(false)
  })
})
