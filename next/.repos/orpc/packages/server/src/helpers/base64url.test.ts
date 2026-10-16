import { decodeBase64url, encodeBase64url } from './base64url'

describe('encodeBase64url / decodeBase64url', () => {
  it('should encode and decode Uint8Array correctly', () => {
    const original = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100])
    const encoded = encodeBase64url(original)
    const decoded = decodeBase64url(encoded)

    expect(decoded).toEqual(original)
  })

  it('should produce URL-safe output without padding', () => {
    const data = new Uint8Array([255, 254, 253]) // Will produce +/= characters in regular base64
    const encoded = encodeBase64url(data)

    expect(encoded).not.toMatch(/[+/=]/)
    expect(encoded).toMatch(/^[\w-]+$/)
  })

  it('should handle empty data', () => {
    const empty = new Uint8Array([])
    const encoded = encodeBase64url(empty)
    const decoded = decodeBase64url(encoded)

    expect(encoded).toBe('')
    expect(decoded).toEqual(empty)
  })

  it('should work with TextEncoder/TextDecoder', () => {
    const text = 'Hello World'
    const encoded = encodeBase64url(new TextEncoder().encode(text))
    const decoded = decodeBase64url(encoded)

    expect(new TextDecoder().decode(decoded)).toEqual(text)
  })

  it('should handle large data without call stack overflow', () => {
    // Create a large Uint8Array (100KB)
    const largeData = new Uint8Array(100 * 1024)
    for (let i = 0; i < largeData.length; i++) {
      largeData[i] = i % 256
    }

    const encoded = encodeBase64url(largeData)
    const decoded = decodeBase64url(encoded)

    expect(decoded).toEqual(largeData)
    expect(encoded).not.toMatch(/[+/=]/) // Should still be URL-safe
  })

  it('should handle invalid input gracefully', () => {
    expect(decodeBase64url(null)).toBeUndefined()
    expect(decodeBase64url(undefined)).toBeUndefined()
    expect(decodeBase64url('invalid base64!')).toBeUndefined()
  })
})

describe('decodeBase64url canonical form', () => {
  it('rejects non-canonical and non-base64url input', () => {
    expect(decodeBase64url('')).toEqual(new Uint8Array([]))
    expect(decodeBase64url('QQ')).toEqual(new Uint8Array([0x41]))
    expect(decodeBase64url('-_-_')).toEqual(new Uint8Array([0xFB, 0xFF, 0xBF]))

    for (const input of ['QR', 'QS', 'QT', 'QQ=', 'QQ==', ' QQ ', 'QQ\n\n', '+/+/', 'A', 'AAAAA']) {
      expect(decodeBase64url(input), JSON.stringify(input)).toBeUndefined()
    }
  })

  it('round-trips every length', () => {
    for (let n = 0; n < 64; n++) {
      const bytes = crypto.getRandomValues(new Uint8Array(n))
      expect(decodeBase64url(encodeBase64url(bytes))).toEqual(bytes)
    }
  })
})
