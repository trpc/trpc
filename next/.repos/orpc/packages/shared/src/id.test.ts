import { compareSequentialIds } from './id'

describe('compareSequentialIds', () => {
  it('should return 0 when ids are equal', () => {
    expect(compareSequentialIds('a', 'a')).toBe(0)
    expect(compareSequentialIds('10', '10')).toBe(0)
  })

  it('should return negative when a < b (same length)', () => {
    expect(compareSequentialIds('a', 'b')).toBeLessThan(0)
    expect(compareSequentialIds('09', '0a')).toBeLessThan(0)
  })

  it('should return positive when a > b (same length)', () => {
    expect(compareSequentialIds('b', 'a')).toBeGreaterThan(0)
    expect(compareSequentialIds('0b', '0a')).toBeGreaterThan(0)
  })

  it('should return negative when a is shorter (length difference)', () => {
    expect(compareSequentialIds('z', '10')).toBeLessThan(0)
    expect(compareSequentialIds('zz', '100')).toBeLessThan(0)
  })

  it('should return positive when a is longer (length difference)', () => {
    expect(compareSequentialIds('10', 'z')).toBeGreaterThan(0)
    expect(compareSequentialIds('100', 'zz')).toBeGreaterThan(0)
  })

  it('random check', { repeats: 1000 }, () => {
    const bigInt1 = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))
    const bigInt2 = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))

    const result = compareSequentialIds(bigInt1.toString(36), bigInt2.toString(36))

    if (bigInt1 > bigInt2) {
      expect(result).toBeGreaterThan(0)
    }
    else if (bigInt1 < bigInt2) {
      expect(result).toBeLessThan(0)
    }
    else {
      expect(result).toBe(0)
    }
  })
})
