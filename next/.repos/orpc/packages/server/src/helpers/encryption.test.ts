import { decrypt, encrypt } from './encryption'

describe('encrypt/decrypt', () => {
  const secret = 'test-secret-key'
  const message = 'Hello, World!'

  it('should encrypt and decrypt successfully', async () => {
    const encrypted = await encrypt(message, secret)
    const decrypted = await decrypt(encrypted, secret)

    expect(decrypted).toBe(message)
  })

  it('should produce base64url encoded output', async () => {
    const encrypted = await encrypt(message, secret)

    // Should not contain base64 special characters
    expect(encrypted).not.toMatch(/[+/=]/)
    // Should only contain base64url safe characters
    expect(encrypted).toMatch(/^[\w-]+$/)
  })

  it('should produce different encrypted values each time', async () => {
    const encrypted1 = await encrypt(message, secret)
    const encrypted2 = await encrypt(message, secret)

    expect(encrypted1).not.toBe(encrypted2)

    // But both should decrypt to the same message
    const decrypted1 = await decrypt(encrypted1, secret)
    const decrypted2 = await decrypt(encrypted2, secret)

    expect(decrypted1).toBe(message)
    expect(decrypted2).toBe(message)
  })

  it('should return undefined for wrong secret', async () => {
    const encrypted = await encrypt(message, secret)
    const decrypted = await decrypt(encrypted, 'wrong-secret')

    expect(decrypted).toBeUndefined()
  })

  it('should return undefined for corrupted data', async () => {
    const encrypted = await encrypt(message, secret)
    const corrupted = `${encrypted.slice(0, -5)}XXXXX`
    const decrypted = await decrypt(corrupted, secret)

    expect(decrypted).toBeUndefined()
  })

  it('should handle Unicode characters', async () => {
    const unicodeMessage = '你好世界 🌍 Здравствуй мир 🚀'
    const encrypted = await encrypt(unicodeMessage, secret)
    const decrypted = await decrypt(encrypted, secret)

    expect(decrypted).toBe(unicodeMessage)
  })

  it('should handle empty string', async () => {
    const empty = ''
    const encrypted = await encrypt(empty, secret)
    const decrypted = await decrypt(encrypted, secret)

    expect(decrypted).toBe(empty)
  })

  it('should return undefined if encrypted=null/undefined', async () => {
    expect(await decrypt(undefined, 'secret')).toBeUndefined()
    expect(await decrypt(null, 'secret')).toBeUndefined()
  })

  it('should decrypt compatibility fixtures from previous releases', async () => {
    const fixtures = [
      {
        value: 'compatibility-value',
        secret: 'compatibility-encryption-secret',
        encrypted: 'hbSNaYOIGOVnapa2UgZgzHgNr6ARf1zWk-3cNWhDBwsFOnQ9S4IZR5uUdqIM-WbTRAfryalkWnHJD8voMh5y',
      },
      {
        value: '',
        secret: 'compatibility-encryption-secret',
        encrypted: '5IXfizzzaGLhausAUKPlg4JBoyYnbKqa5qdVnLFVPMY8YWZfh0ouEFrZGQw',
      },
      {
        value: 'value.with.dots-🚀-中文',
        secret: 'compatibility-encryption-secret',
        encrypted: 'xLe6faWGA5J3MUy-Cue5_mZXiJVlrzqKho8ywwhlCHbO4koT4XT3MxzesdTMLxZIAS6pPJLfU4qKKcZHwOwAAU5RHP-sMp8',
      },
    ] as const

    for (const fixture of fixtures) {
      expect(await decrypt(fixture.encrypted, fixture.secret)).toBe(fixture.value)
    }
  })
})

describe('decrypt canonical form', () => {
  it('accepts only the canonical ciphertext string', async () => {
    const secret = 'test-secret-key'
    // 16 salt + 12 iv + 8 data + 16 tag = 52 bytes -> 70 chars; last char carries 4 unused bits
    const encrypted = await encrypt('user1234', secret)
    expect(encrypted).toHaveLength(70)
    expect(await decrypt(encrypted, secret)).toBe('user1234')

    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    const last = alphabet.indexOf(encrypted.at(-1)!)
    for (let flip = 1; flip < 16; flip++) {
      expect(await decrypt(encrypted.slice(0, -1) + alphabet[last ^ flip], secret)).toBeUndefined()
    }
    expect(await decrypt(`${encrypted}=`, secret)).toBeUndefined()
    expect(await decrypt(`${encrypted}==`, secret)).toBeUndefined()
  })
})
