import { getCookie } from './cookie'
import { getSignedValue, sign, unsign } from './signing'

describe('signing', () => {
  const secret = 'test-secret-key'
  const value = 'user123'

  describe('sign', () => {
    it('should sign a value and return signed string with signature', async () => {
      const signedValue = await sign(value, secret)

      expect(signedValue).toContain('.')
      expect(signedValue.startsWith(`${value}.`)).toBe(true)

      const parts = signedValue.split('.')
      expect(parts).toHaveLength(2)
      expect(parts[0]).toBe(value)
      expect(parts[1]).toBeTruthy() // Should have a signature part
    })

    it('should produce consistent signatures for same input', async () => {
      const signedValue1 = await sign(value, secret)
      const signedValue2 = await sign(value, secret)

      expect(signedValue1).toBe(signedValue2)
    })

    it('should produce different signatures for different secrets', async () => {
      const signedValue1 = await sign(value, secret)
      const signedValue2 = await sign(value, 'different-secret')

      expect(signedValue1).not.toBe(signedValue2)
    })

    it('should produce different signatures for different values', async () => {
      const signedValue1 = await sign(value, secret)
      const signedValue2 = await sign('different-value', secret)

      expect(signedValue1).not.toBe(signedValue2)
    })

    it('should handle empty string values', async () => {
      const signedValue = await sign('', secret)

      expect(signedValue).toContain('.')
      expect(signedValue.startsWith('.')).toBe(true)
    })

    it('should handle values with dots', async () => {
      const valueWithDot = 'user.123.test'
      const signedValue = await sign(valueWithDot, secret)

      expect(signedValue).toContain('.')
      expect(signedValue.startsWith(`${valueWithDot}.`)).toBe(true)
    })

    it('should handle special characters in value', async () => {
      const specialValue = 'user@domain.com!#$%'
      const signedValue = await sign(specialValue, secret)

      expect(signedValue).toContain('.')
      expect(signedValue.startsWith(`${specialValue}.`)).toBe(true)
    })

    it('should handle unicode characters', async () => {
      const unicodeValue = 'user-🚀-test-中文'
      const signedValue = await sign(unicodeValue, secret)

      expect(signedValue).toContain('.')
      expect(signedValue.startsWith(`${unicodeValue}.`)).toBe(true)
    })
  })

  describe('unsign', () => {
    it('should successfully unsign a valid signed value', async () => {
      const signedValue = await sign(value, secret)
      const unsignedValue = await unsign(signedValue, secret)

      expect(unsignedValue).toBe(value)
    })

    it('should return undefined for undefined/null input', async () => {
      expect(await unsign(undefined, secret)).toBeUndefined()
      expect(await unsign(null, secret)).toBeUndefined()
    })

    it('should return undefined for invalid signature', async () => {
      const signedValue = await sign(value, secret)
      const unsignedValue = await unsign(signedValue, 'wrong-secret')

      expect(unsignedValue).toBeUndefined()
    })

    it('should return undefined for tampered value', async () => {
      const signedValue = await sign(value, secret)
      const tamperedValue = signedValue.replace(value, 'tampered')
      const unsignedValue = await unsign(tamperedValue, secret)

      expect(unsignedValue).toBeUndefined()
    })

    it('should return undefined for tampered signature', async () => {
      const signedValue = await sign(value, secret)
      const parts = signedValue.split('.')
      const tamperedSignedValue = `${parts[0]}.tamperedsignature`
      const unsignedValue = await unsign(tamperedSignedValue, secret)

      expect(unsignedValue).toBeUndefined()
    })

    it('should return undefined for value without dot separator', async () => {
      const unsignedValue = await unsign('no-dot-separator', secret)

      expect(unsignedValue).toBeUndefined()
    })

    it('should return undefined for empty signature part', async () => {
      const invalidSignedValue = `${value}.`
      const unsignedValue = await unsign(invalidSignedValue, secret)

      expect(unsignedValue).toBeUndefined()
    })

    it('should return undefined for invalid base64url signature', async () => {
      const invalidSignedValue = `${value}.invalid@base64url!`
      const unsignedValue = await unsign(invalidSignedValue, secret)

      expect(unsignedValue).toBeUndefined()
    })

    it('should handle values with multiple dots correctly', async () => {
      const valueWithDots = 'user.123.test'
      const signedValue = await sign(valueWithDots, secret)
      const unsignedValue = await unsign(signedValue, secret)

      expect(unsignedValue).toBe(valueWithDots)
    })

    it('should handle empty string values', async () => {
      const emptyValue = ''
      const signedValue = await sign(emptyValue, secret)
      const unsignedValue = await unsign(signedValue, secret)

      expect(unsignedValue).toBe(emptyValue)
    })

    it('should handle special characters', async () => {
      const specialValue = 'user@domain.com!#$%'
      const signedValue = await sign(specialValue, secret)
      const unsignedValue = await unsign(signedValue, secret)

      expect(unsignedValue).toBe(specialValue)
    })

    it('should handle unicode characters', async () => {
      const unicodeValue = 'user-🚀-test-中文'
      const signedValue = await sign(unicodeValue, secret)
      const unsignedValue = await unsign(signedValue, secret)

      expect(unsignedValue).toBe(unicodeValue)
    })

    it('should return undefined for malformed input that throws errors', async () => {
      // Test various malformed inputs that might cause crypto operations to throw
      const malformedInputs = [
        'value.',
        '.signature',
        'value.invalid-signature-length',
        'value.!@#$%^&*()',
      ]

      for (const input of malformedInputs) {
        const unsignedValue = await unsign(input, secret)
        expect(unsignedValue).toBeUndefined()
      }
    })
  })

  it.each([
    [undefined, undefined],
    [null, undefined],
    ['value', undefined],
    ['value.', 'value'],
    ['.signature', ''],
    ['multiple.dots.test', 'multiple.dots'],
    ['value.invalid-signature-length', 'value'],
    ['value.!@#$%^&*', 'value'],
  ])('getSignedValue: %s', (input, expected) => {
    expect(getSignedValue(input)).toBe(expected)
  })

  describe('integration tests', () => {
    it('should maintain integrity through sign/unsign cycle', async () => {
      const testValues = [
        'simple',
        '',
        'with.dots',
        'with spaces and special chars!@#',
        '🚀 unicode test 中文',
        'very-long-value-that-might-test-edge-cases-in-the-crypto-implementation-and-base64url-encoding',
      ]

      for (const testValue of testValues) {
        const signedValue = await sign(testValue, secret)
        const unsignedValue = await unsign(signedValue, secret)
        expect(unsignedValue).toBe(testValue)
      }
    })

    it('should fail unsign with different secrets', async () => {
      const secrets = ['secret1', 'secret2', 'different-secret']

      for (let i = 0; i < secrets.length; i++) {
        const currentSecret = secrets[i]!
        const signedValue = await sign(value, currentSecret)

        for (let j = 0; j < secrets.length; j++) {
          const testSecret = secrets[j]!
          const unsignedValue = await unsign(signedValue, testSecret)

          if (i === j) {
            expect(unsignedValue).toBe(value)
          }
          else {
            expect(unsignedValue).toBeUndefined()
          }
        }
      }
    })

    it('should produce consistent results across multiple operations', async () => {
      const results = []

      for (let i = 0; i < 10; i++) {
        const signedValue = await sign(value, secret)
        const unsignedValue = await unsign(signedValue, secret)
        results.push({ signed: signedValue, unsigned: unsignedValue })
      }

      // All signed values should be identical
      const firstSigned = results[0]!.signed
      expect(results.every(r => r.signed === firstSigned)).toBe(true)

      // All unsigned values should be identical and match original
      expect(results.every(r => r.unsigned === value)).toBe(true)
    })
  })

  describe('compatibility fixtures', () => {
    it('should preserve existing signed values across releases', async () => {
      const fixtures = [
        {
          value: 'compatibility-value',
          secret: 'compatibility-signing-secret',
          signed: 'compatibility-value.9FauF6a16X8xuMNDd6C6RWDkFQ6qUrAv_7nmeipkmN4',
        },
        {
          value: '',
          secret: 'compatibility-signing-secret',
          signed: '.NH49AU2pii6l1BfOq7Qb9Bbf2FhV9D5cTZfwThTusNw',
        },
        {
          value: 'value.with.dots-🚀-中文',
          secret: 'compatibility-signing-secret',
          signed: 'value.with.dots-🚀-中文.kMRSELRa3ULkbxo9gB-FOcNVdYmT_7Dv64b7hyhQOPA',
        },
      ] as const

      for (const fixture of fixtures) {
        expect(await sign(fixture.value, fixture.secret)).toBe(fixture.signed)
        expect(await unsign(fixture.signed, fixture.secret)).toBe(fixture.value)
      }
    })
  })
})

describe('unsign canonical form', () => {
  it('accepts only the canonical signature string', async () => {
    const secret = 'my-secret-key'
    const signed = await sign('user123', secret)
    expect(signed).toBe('user123.oneQsU0r5dvwQFHFEjjV1uOI_IR3gZfkYHij3TRauVA')
    expect(await unsign(signed, secret)).toBe('user123')

    const variants = [
      'user123.oneQsU0r5dvwQFHFEjjV1uOI_IR3gZfkYHij3TRauVB', // non-zero unused bits
      'user123.oneQsU0r5dvwQFHFEjjV1uOI_IR3gZfkYHij3TRauVC',
      'user123.oneQsU0r5dvwQFHFEjjV1uOI_IR3gZfkYHij3TRauVD',
      'user123.oneQsU0r5dvwQFHFEjjV1uOI_IR3gZfkYHij3TRauVA=', // padding
      'user123.oneQsU0r5dvwQFHFEjjV1uOI/IR3gZfkYHij3TRauVA', // standard-base64 char
      'user123.oneQsU0r5dvw\nQFHFEjjV1uOI_IR3gZfkYHij3TRauVA', // whitespace
      // percent-encoded whitespace becomes a real space after getCookie
      getCookie(new Headers({ cookie: 'sid=user123.oneQsU0r5dvw%20QFHFEjjV1uOI_IR3gZfkYHij3TRauVA' }), 'sid'),
    ]

    for (const variant of variants) {
      expect(await unsign(variant, secret), JSON.stringify(variant)).toBeUndefined()
    }
  })
})
